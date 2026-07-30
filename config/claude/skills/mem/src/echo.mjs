// Usefulness — PLAN's "Measuring `useful` without lying to yourself".
//
// `injected_count` counts what the store *said*. This file is the other half:
// what came of it. PLAN lists three signals, cheapest first, and this slice
// builds the first two:
//
//   1. Echo heuristic (free, automatic). The Stop hook knows what was injected
//      this turn and receives the assistant's reply. If the reply carries the
//      memory's distinctive tokens, count it. "Noisy but unbiased and costs
//      nothing."
//   2. Explicit. The injected block names the ids, and `mem touch <id>` records
//      the one that was acted on.
//
// The third — a hard decrement on `/mem:forget`, a review rejection, or a user
// correction in a turn where the memory was injected — is not built here and
// nothing else claims it yet.
//
// WHY THIS MATTERS MORE THAN IT LOOKS. `useful_count` is not a statistic; it is
// an input to the decay model. Every count lengthens the halflife
// (`H0 × (1 + useful_count)^0.6`) and `last_used_at` resets the clock the
// retention curve runs from, so a wrong bump keeps a memory alive that should
// have faded, and PLAN's archiving rule (`useful_count = 0`) will never touch it
// again. That asymmetry is why the heuristic below spends its complexity on one
// thing: not counting words the assistant would have said anyway.
//
// THE PROMPT IS NOT EVIDENCE. If the user asks "how do I install dependencies?"
// and the reply says "install the dependencies with…", the words "install" and
// "dependencies" prove nothing — they came from the question, and the reply would
// contain them whether or not the memory was ever injected. So a memory's
// evidence tokens are its distinctive words *minus the ones the user just typed*,
// which is precisely why recordTurn() keeps the prompt alongside what it injected.
// What survives that subtraction ("pnpm", "vitest", "flakes") is the part of the
// memory the model could only have got from the memory.
//
// Tokenisation is search.mjs's, not a second one. These are the same tokens the
// lexical leg matched on, and two spellings of "distinctive token" in one system
// would eventually disagree about which memories exist.

import { closeSync, openSync, readSync, statSync } from 'node:fs';

import { withDb } from './db.mjs';
import { halflifeDays } from './decay.mjs';
import { resolveRefs } from './manage.mjs';
import { STOPWORDS, tokenise } from './search.mjs';

/**
 * Where the assistant's reply lives in a Stop payload.
 *
 * `last_assistant_message` is the documented field and the one this build's
 * changelog added "so hooks can access it without parsing transcript files"; the
 * rest are spelling insurance, on the same reasoning as recall.mjs's
 * PROMPT_FIELDS — betting on one name and losing is a hook that silently never
 * counts anything, which is the failure nobody notices. `transcript_path` is the
 * belt to this pair of braces (see transcriptReply).
 */
export const REPLY_FIELDS = [
  'last_assistant_message',
  'lastAssistantMessage',
  'assistant_message',
  'last_message',
];

/**
 * How much of the reply is scanned.
 *
 * A cost bound, not a policy: tokenising a 2 MB pasted log to find one echo is
 * work with no answer at the end of it. The head is kept because that is where a
 * reply states what it is about to do; an echo that only appears in the last
 * paragraph of a very long answer is a miss, and a miss costs nothing but a
 * memory decaying on schedule.
 */
export const MAX_REPLY_CHARS = 20_000;

/**
 * How many evidence tokens the reply must carry.
 *
 * One, and the first draft of this file said two for anything but the shortest
 * memory — a coverage ratio, half the evidence, denominator capped. It was wrong,
 * and the way it was wrong is worth keeping written down because it is not
 * visible from a unit test.
 *
 * Run end to end against a real store, the canonical memory of this whole plugin
 * — "always use pnpm to install dependencies, never npm", asked "how do I install
 * the dependencies here?", answered "run `pnpm install`, this project is on pnpm"
 * — scored 1 of 4 and did not count. The evidence was `always pnpm never npm`,
 * the reply carried the only one of those a reply would ever carry, and a rule
 * needing two of them can be satisfied by nothing short of quotation. A reply does
 * not restate a memory; it uses the one word that carries it.
 *
 * So the ratio is gone and the bar is one token. PLAN is explicit that this signal
 * is "noisy but unbiased" and the noise is the price of it being free; a rule
 * tuned until it never fires on a coincidence never fires on a use either, and a
 * signal that never fires is not conservative, it is absent. What keeps the bar at
 * one token honest is the two subtractions in front of it — the prompt's words and
 * ECHO_FRAMING — because both remove exactly the tokens a reply would have
 * contained anyway.
 *
 * Raise it to 2 for a store where memories are long and share vocabulary.
 */
export const ECHO_MIN_MATCHED = 1;

/**
 * Words that say how firmly a preference is held rather than what it is about, so
 * they are not evidence of anything at a one-token bar.
 *
 * Memories are stated preferences and this is the vocabulary they are stated in
 * ("always", "never", "prefer", "instead"); assistant replies are full of the same
 * words for reasons that have nothing to do with memory. Matching on them would
 * count an echo on every turn that contained the word "actually".
 *
 * Deliberately one category — modality and frequency — and nothing domain-shaped.
 * A word wrongly listed here can only cause a miss, never a false count, which is
 * the safe direction for a list assembled by judgment; but "lockfile", "deploy"
 * and "rebase" are what a real echo is made of and none of them belong to it.
 */
export const ECHO_FRAMING = new Set([
  'actually', 'always', 'avoid', 'cant', 'doesnt', 'dont', 'ever', 'generally',
  'instead', 'never', 'preference', 'preferences', 'preferred', 'prefer', 'prefers',
  'rather', 'remember', 'typically', 'usually', 'wont',
]);

/** Distinctive words of a piece of text: tokenised, stopworded, deduped. */
export function distinctive(text) {
  const out = new Set();
  for (const token of tokenise(text)) if (!STOPWORDS.has(token)) out.add(token);
  return out;
}

/**
 * What echoing this memory would actually prove, given the prompt that pulled it
 * in: its distinctive words, less every word the user just typed, less the words
 * every stated preference is phrased in.
 *
 * An empty result is a real answer and not a failure — it means the memory says
 * nothing the prompt did not already say, so nothing in the reply can distinguish
 * "used the memory" from "answered the question". Those turns go uncounted, which
 * is the conservative direction: see the note on asymmetry at the top.
 */
export function evidenceTokens(text, prompt = '') {
  const spent = new Set(tokenise(prompt));
  return [...distinctive(text)].filter((token) => !spent.has(token) && !ECHO_FRAMING.has(token));
}

/**
 * Did this reply echo this memory? Pure, so the rule can be argued with in a test
 * rather than inferred from counters after the fact.
 *
 * Returns the working, not just the verdict: `evidence` is what could have been
 * echoed, `matched` is what was, and `coverage` is how much of the memory came
 * back. Coverage is reported and not thresholded — see ECHO_MIN_MATCHED for why
 * the ratio turned out to be the wrong rule — but it is what a debug line needs to
 * tell "one word in passing" from "the model restated the whole thing".
 */
export function scoreEcho(text, { prompt = '', reply = '', max = MAX_REPLY_CHARS } = {}) {
  const evidence = evidenceTokens(text, prompt);
  const said = new Set(tokenise(typeof reply === 'string' ? reply.slice(0, max) : ''));
  const matched = evidence.filter((token) => said.has(token));
  const coverage = evidence.length === 0 ? 0 : matched.length / evidence.length;

  return { evidence, matched, coverage, echo: matched.length >= ECHO_MIN_MATCHED };
}

/**
 * Score every memory the turn record says was injected.
 *
 * All of them, not the best one: two memories that both echo were both plausibly
 * used, and picking a winner would invent a fact the reply does not contain.
 *
 * Rows are kept in the result whether they echoed or not, because "injected three,
 * echoed none" is the over-general-slop signature PLAN wants visible and the
 * caller's debug output is where it becomes visible.
 */
export function scoreTurn(record, reply, opts = {}) {
  const prompt = record?.prompt ?? '';
  const injected = Array.isArray(record?.injected) ? record.injected : [];

  const scored = injected.map((row) => ({
    id: row.id,
    uid: row.uid ?? null,
    text: row.text,
    ...scoreEcho(row.text, { ...opts, prompt, reply }),
  }));

  return { scored, echoed: scored.filter((s) => s.echo && Number.isInteger(s.id)) };
}

/**
 * PLAN's second signal, and the write behind both: count the memory as useful and
 * reset its decay clock.
 *
 * Both columns move, and that is the whole difference from markInjected(). The
 * count lengthens the halflife (spaced repetition: five uses take 30 days to ~87),
 * and `last_used_at` is the first link in retention()'s fallback chain, so this is
 * the one event that legitimately says "the clock starts again from here".
 *
 * `max(coalesce(last_used_at, 0), ?)` rather than a plain assignment: a hook
 * scoring a turn that started before a clock change — or a `mem touch` run with an
 * older `now` in a test — must not drag the decay clock backwards. Time only moves
 * forward for a memory.
 */
export async function markUseful(conn, ids, { now = Date.now() } = {}) {
  const list = [...new Set(ids.filter((id) => Number.isInteger(id)))];
  if (list.length === 0) return 0;

  const res = await conn.run(
    `UPDATE memories
        SET useful_count = useful_count + 1,
            last_used_at = max(coalesce(last_used_at, 0), ?)
      WHERE id IN (${list.map(() => '?').join(', ')})`,
    now,
    ...list,
  );
  return Number(res?.changes ?? 0);
}

/**
 * `mem touch <id>` — the explicit signal, by reference rather than by row id, so
 * a human (or the model, from the id in the injected block) can name it the way
 * the block spells it.
 *
 * One transaction for the batch, like forget and pin: a half-counted batch would
 * have to be reconstructed by hand from counters that carry no history.
 *
 * The result reports the new halflife because that is what the count is *for* —
 * "useful 3 times" means nothing on its own, "62 days instead of 30" is the effect.
 */
export async function touch(refs, { conn, paths, env, now = Date.now() } = {}) {
  const run = (c) =>
    c
      .transactionAsync(async (tx) => {
        const rows = await resolveRefs(tx, refs);
        await markUseful(tx, rows.map((r) => r.id), { now });
        return rows.map((row) => {
          const useful = (row.useful_count ?? 0) + 1;
          return {
            id: row.id,
            uid: row.uid,
            text: row.text,
            useful_count: useful,
            last_used_at: Math.max(row.last_used_at ?? 0, now),
            halflife_days: halflifeDays(useful),
            was: { useful_count: row.useful_count ?? 0, halflife_days: halflifeDays(row.useful_count ?? 0) },
          };
        });
      })
      .immediate();

  return conn ? run(conn) : withDb(run, { paths, env });
}

/** The assistant's reply out of a Stop payload, or '' when it carries none. */
export function replyText(event, { max = MAX_REPLY_CHARS } = {}) {
  if (!event || typeof event !== 'object') return '';
  for (const field of REPLY_FIELDS) {
    const value = event[field];
    if (typeof value === 'string' && value.trim() !== '') return value.slice(0, max);
  }
  return '';
}

/**
 * How much of a transcript is read when the payload carries no reply. Half a
 * megabyte off the end holds the last turn of any session that is not pathological,
 * and reading a session-long JSONL in full to find its last line is the kind of
 * cost that turns a free signal into an expensive one.
 */
export const TRANSCRIPT_TAIL_BYTES = 512 * 1024;

/** The text parts of one transcript entry, if it is a main-chain assistant turn. */
function entryText(entry) {
  if (!entry || typeof entry !== 'object') return '';
  // A sidechain entry is a subagent's reply. It never saw the injected block —
  // the recollection went to the main conversation — so it cannot echo it.
  if (entry.isSidechain) return '';

  const message = entry.message;
  if (!message || typeof message !== 'object' || message.role !== 'assistant') return '';
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';

  return message.content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

/**
 * The last assistant message in a transcript file — the fallback for a harness
 * that does not send `last_assistant_message`.
 *
 * Bounded and best-effort by construction: it reads the tail, drops the first
 * (probably truncated) line, scans backwards for the newest assistant entry, and
 * returns '' for anything it cannot make sense of. A missing signal is the correct
 * failure here; a thrown one would take the Stop hook with it.
 */
export function transcriptReply(file, { tail = TRANSCRIPT_TAIL_BYTES, max = MAX_REPLY_CHARS } = {}) {
  if (typeof file !== 'string' || file === '') return '';

  let text;
  try {
    const size = statSync(file).size;
    const from = Math.max(0, size - tail);
    const fd = openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(Math.min(size, tail));
      const read = readSync(fd, buffer, 0, buffer.length, from);
      text = buffer.subarray(0, read).toString('utf8');
    } finally {
      closeSync(fd);
    }
    // The first line of a mid-file read is half a record; parsing it would fail
    // anyway, but dropping it keeps the failure from looking like a corrupt file.
    if (from > 0) text = text.slice(text.indexOf('\n') + 1);
  } catch {
    return '';
  }

  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line === '') continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const reply = entryText(entry);
    if (reply.trim() !== '') return reply.slice(0, max);
  }
  return '';
}
