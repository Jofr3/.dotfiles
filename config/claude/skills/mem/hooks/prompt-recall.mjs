#!/usr/bin/env node
// UserPromptSubmit — per-prompt retrieval (PLAN Retrieval step 7, second half)
// and the capture gate (PLAN "Capture gate").
//
// Two independent jobs on one event, because the event is the same one: recall
// answers "does the store know something about this prompt", capture asks "should
// the store learn something from it". They share the prompt text and nothing else,
// and the sharing is one-directional on purpose — the gate is pure regex over
// text already in hand (src/capture.mjs), so it must still fire on the machine
// where retrieval cannot run at all: no database, no dependencies, no cached
// model, over budget. That is exactly the machine with nothing stored yet, so it
// is the one where capture matters most. Hence `pending` below: the gate is
// computed before the first filesystem check and every exit path emits it.
//
// This runs before every prompt the user sends, which makes it the most expensive
// and the most dangerous thing in the plugin. Two budgets, both hard:
//
//   Latency. This is the one recall path that must embed — a question has to
//   become a vector — so it pays what session start does not: the transformers
//   import (~100ms) and the model load (~157ms), measured cold end-to-end at
//   321ms against PLAN's 400ms. There is no way to make that cheap, so the
//   defences are refusing to start when it would be worse (no cached model, no
//   deps) and its own watchdog when it is anyway.
//
//   Precision. PLAN: "the real risk is precision, not performance". Injecting
//   nothing is the correct answer on most prompts and the gate in search.mjs is
//   what decides; this file adds no leniency of its own and passes no threshold
//   override. If nothing clears, no memory is emitted — the capture block is the
//   one thing that can still be, and it carries no memory, only a question.
//
// Fail open and silent, exactly like session-start.mjs: any problem exits 0 with
// nothing on either stream. One extra reason to be careful with stdout here —
// for UserPromptSubmit the harness treats bare stdout as context to inject, so a
// stray console.log on this path is not a cosmetic bug, it is a prompt injection.
//
// What it writes, and why a read-only hook cannot do this job: PLAN's
// injected_count must count "actually injected into context (not merely
// scanned)", and only this path knows that. So the connection is opened
// read-write — with runMigrations off, and only after the database is known to
// exist, so a hook still never creates or upgrades a store — and falls back to a
// read-only open if that fails. The accounting exists for the injection; losing
// the injection to save the accounting would be backwards.
//
// MEM_HOOK_DEBUG=1 explains a silent exit on stderr. MEM_HOOK_TIMEOUT_MS moves
// the watchdog. Both default to silence.

import { existsSync, readFileSync } from 'node:fs';

/**
 * Self-imposed budget. Generous against the ~320ms expected path because the
 * first prompt after a reboot pays a cold ONNX load off a cold page cache, and
 * failing open there would look like "recall never works on the first prompt".
 * The harness timeout in hooks.json is the outer bound; this one exists so the
 * failure is our silent no-op rather than a killed child.
 */
const BUDGET_MS = Number(process.env.MEM_HOOK_TIMEOUT_MS) || 1500;

/** Cap on waiting for a busy database. A prompt is not worth queueing behind. */
const DB_TIMEOUT_MS = 500;

const debug = (why) => {
  if (process.env.MEM_HOOK_DEBUG) process.stderr.write(`mem prompt-recall: ${why}\n`);
};

/**
 * The capture block, once the gate has fired, so that every way out of this
 * process still delivers it. Set once and never cleared: a retrieval failure is
 * not a reason to drop an unrelated observation about the prompt.
 */
let pending = null;

/**
 * Give up on recall. Silent unless the capture gate has something to say, in which
 * case that is emitted on its own — "retrieval found nothing" and "this prompt may
 * be worth remembering" are answers to different questions.
 */
function silent(why) {
  debug(why);
  if (pending !== null) return emit(pending);
  process.exit(0);
}

function emit(additionalContext) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
    }),
  );
  process.exit(0);
}

/**
 * Hook input, best-effort. Unlike session start this hook is useless without a
 * field from the payload — there is nothing to retrieve on — so an unparseable
 * payload really does end in silence here. promptText() carries the tolerance
 * instead, by not betting on one spelling of the field name.
 */
function readEvent() {
  try {
    if (process.stdin.isTTY) return {};
    return JSON.parse(readFileSync(0, 'utf8')) ?? {};
  } catch {
    debug('unparseable hook input');
    return {};
  }
}

/**
 * Read-write if possible, read-only if not. A read-only mount, a foreign owner or
 * a lock we will not wait for costs the counters, not the recall.
 */
async function openConnection({ openDb, paths, env }) {
  const opts = { paths, env, runMigrations: false, timeout: DB_TIMEOUT_MS };
  try {
    return { conn: await openDb({ ...opts, readonly: false }), writable: true };
  } catch (err) {
    debug(`read-write open failed (${err?.message ?? err}); retrying read-only`);
    return { conn: await openDb({ ...opts, readonly: true }), writable: false };
  }
}

async function main() {
  const event = readEvent();

  const [recall, { resolvePaths }, { captureBlock }] = await Promise.all([
    import('../src/recall.mjs'),
    import('../src/paths.mjs'),
    import('../src/capture.mjs'),
  ]);

  const prompt = recall.promptText(event);
  if (prompt === '') return silent('no prompt text in the hook payload');

  // The capture gate, before anything that can fail. Sub-millisecond, no store,
  // no model — PLAN's "<20ms, no LLM" — and from here on it is owed to the user
  // whatever happens to retrieval below.
  const capture = captureBlock(prompt);
  if (capture !== null) {
    pending = capture.block;
    debug(`capture cue '${capture.cue}' on ${JSON.stringify(capture.match)}`);
  }

  const paths = resolvePaths();

  // Three filesystem checks before anything heavy. Each of them is also a
  // refusal to bootstrap from a hook: no database means no store to search (and
  // creating one here would be a side effect of typing), and a missing
  // dependency or model would otherwise mean an npm install or a 34MB download
  // in front of somebody's prompt.
  if (!existsSync(paths.dbPath)) return silent(`no database at ${paths.dbPath}`);

  const [{ depsReady }, embed] = await Promise.all([
    import('../src/deps.mjs'),
    import('../src/embed.mjs'),
  ]);
  if (!depsReady(paths)) return silent('dependencies not installed');
  if (!embed.modelCached(paths)) return silent("embedding model not cached — run 'mem warm'");

  const [{ openDb }, { queryTerms, searchScoped }, { resolveProjectKey }] = await Promise.all([
    import('../src/db.mjs'),
    import('../src/search.mjs'),
    import('../src/scope.mjs'),
  ]);

  const terms = queryTerms(prompt);
  // A prompt whose every word is a stopword ("yes, please do that", "what about
  // it?") has nothing to retrieve *on*: the vector of a sentence with no content word
  // points nowhere in particular, and the lexical leg has no terms at all. This
  // is the cheap half of precision — it skips the model load entirely on the
  // conversational filler that makes up a good share of real turns.
  if (terms.length === 0) return silent('no distinctive terms in the prompt');

  const env = { ...process.env, MEM_NO_INSTALL: '1' };
  const cwd = typeof event.cwd === 'string' && event.cwd ? event.cwd : process.cwd();
  const { projectKey } = resolveProjectKey({ cwd, env: process.env });
  const now = Date.now();

  // The model load and the database open are independent and both dominated by
  // I/O, so they overlap. If either rejects the process is exiting anyway, which
  // is what makes the unclosed handle in that case a non-issue.
  const [vector, { conn, writable }] = await Promise.all([
    embed.embedQuery(prompt, { paths, env }),
    openConnection({ openDb, paths, env }),
  ]);

  let results = [];
  let stats = {};
  try {
    // No threshold or coverage override: the gate is search.mjs's to set, and a
    // hook quietly loosening it would undo the only thing keeping this quiet.
    ({ results, stats } = await searchScoped(conn, vector, terms, { projectKey, now }));

    if (results.length > 0 && writable) {
      // Accounting, not delivery. A failure here is logged and dropped: the
      // injection below is the point, and it is already computed.
      try {
        await recall.markInjected(conn, results.map((r) => r.id), { now });
      } catch (err) {
        debug(`injection accounting failed: ${err?.message ?? err}`);
      }
    }
  } finally {
    await conn.close().catch(() => {});
  }

  // Written on both outcomes, including the empty one — 5a.2 needs to know that
  // this turn injected nothing, which is not the same as finding no record.
  try {
    recall.recordTurn(paths, {
      sessionId: event.session_id,
      prompt,
      results,
      now,
      projectKey,
      cwd,
    });
    recall.sweepTurns(paths, { now });
  } catch (err) {
    debug(`turn record failed: ${err?.message ?? err}`);
  }

  if (results.length === 0) {
    return silent(`nothing cleared the gate (${stats.candidates ?? 0} candidates, ${stats.gated ?? 0} rejected)`);
  }

  debug(`injecting ${results.length} of ${stats.candidates ?? 0}`);
  // Recollection first, cue last: the memories are background about the store and
  // the cue is a question about the message that just arrived, which is what the
  // model should be holding when it starts reading.
  return emit([recall.renderRecall(results, { now }), pending].filter(Boolean).join('\n\n'));
}

const watchdog = setTimeout(() => silent(`over budget (${BUDGET_MS}ms)`), BUDGET_MS);

main().then(
  () => {
    // main() only returns via silent()/emit(), both of which exit. Reaching here
    // means neither fired; release the watchdog so the process cannot hang.
    clearTimeout(watchdog);
    process.exit(0);
  },
  (err) => silent(err?.message ?? String(err)),
);
