// The judge — PLAN's "Contradiction handling", the half that needs judgement.
//
// PLAN: "Cosine cannot separate duplicate from contradiction — 'we use Vitest'
// and 'we no longer use Vitest' sit around 0.9. So detection is mechanical,
// resolution is judged." pairs.mjs is the mechanical half; this file is the one
// sentence that follows it: "Tier 2 batches ~20 pairs per LLM call (`claude -p`,
// structured output) and classifies each".
//
// It does exactly that and nothing else. It does not open the database, does not
// know what a `duplicate` verdict causes, and cannot change a memory — resolve.mjs
// owns all of that. The split is not tidiness: this is the only file in the plugin
// that spawns a process it does not control the output of, so everything that
// *acts* on a verdict lives behind a plain data boundary that a test can hand a
// hand-written answer to. Every test in this build does exactly that; no test
// spawns `claude`.
//
// THREE THINGS THIS FILE REFUSES TO DO, each because the failure is silent:
//
//   It never invents a verdict. A pair the model did not answer for comes back as
//   `missing`, not as `unrelated` — and `unrelated` is the one class that gets
//   cached forever (pairs.mjs), so defaulting to it would let one truncated reply
//   bury a real contradiction permanently.
//   It never accepts a verdict for a pair it did not ask about. Key echoed wrong,
//   two batches confused, a hallucinated id: all land in `unknown` and are dropped.
//   It never lets tool use into the call. `--tools ""`: a judge reads two strings
//   and answers with one word, and a judge that can run commands is a prompt
//   injection surface reading text a hook captured off the user's terminal.
//
// The prompt is written against the adversarial set slice 5b.3 will hold it to —
// refinements that must not read as contradictions, and a newer-but-wrong memory
// facing a pinned one — so the class definitions here are deliberately about
// *what changed in the world* rather than about how similar two sentences look.

import { spawn } from 'node:child_process';

import { VERDICTS } from './pairs.mjs';

/**
 * PLAN: "batches ~20 pairs per LLM call". Not a cost knob — a batch is also the
 * unit of loss. One reply that is truncated, malformed or refused takes its whole
 * batch with it, so twenty is the number of judgements that can go missing at
 * once, and pairs.mjs's PAIR_LIMIT of 60 is exactly the "1–3 LLM calls" PLAN
 * budgets a weekly run.
 */
export const JUDGE_BATCH = 20;

/**
 * The judge's model. Overridable with MEM_JUDGE_MODEL because the right answer
 * moves with what is available and with what a user is paying for; the default is
 * the alias rather than a pinned id so it follows the CLI's own idea of current.
 *
 * Not the cheapest tier by default, deliberately. The failure this whole subsystem
 * exists to prevent is a confidently wrong memory outliving the truth, and the
 * class boundary that decides it — refinement versus contradiction — is the one a
 * small model gets wrong most often.
 */
export const JUDGE_MODEL = 'sonnet';

/** `claude` unless MEM_JUDGE_CMD says otherwise (a wrapper, a stub, an absolute path). */
export const JUDGE_CMD = 'claude';

/** One batch of twenty, end to end. Long because a cold CLI start is seconds. */
export const JUDGE_TIMEOUT_MS = 180_000;

/**
 * How much of a memory the judge is shown. MAX_TEXT is 1000 (write.mjs), so a
 * full batch is at most ~40 KB of text — comfortable on stdin, which is why the
 * prompt goes there rather than through argv where a long batch would eventually
 * meet the platform's argument limit.
 */
export const MAX_JUDGE_TEXT = 1000;

export class JudgeError extends Error {
  constructor(message, code = 'MEM_JUDGE_FAILED', detail = null) {
    super(message);
    this.name = 'JudgeError';
    this.code = code;
    this.detail = detail;
  }
}

// ----------------------------------------------------------------- the ask --

/**
 * The structured-output contract. `--json-schema` validates the reply against
 * this, so the shape is guaranteed by the CLI and only the *content* has to be
 * checked here (unknown pair keys, missing pairs).
 *
 * `additionalProperties: false` everywhere and no `format` keyword anywhere: the
 * CLI rejected `format` outright until recently and silently fell back to
 * unstructured output, which is the failure mode hardest to notice from here.
 *
 * `general` is asked for on every verdict, not only on refinements, because a
 * schema with conditional requirements is a schema the model gets to interpret.
 * It is read only when the class is `refinement`, where PLAN's table needs to
 * know which of the two is "the general one" whose salience gets demoted.
 */
export const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pair: { type: 'string', description: 'the pair id exactly as given' },
          class: { type: 'string', enum: [...VERDICTS] },
          why: { type: 'string', description: 'one sentence, plain language' },
          general: {
            type: 'string',
            enum: ['a', 'b', 'neither'],
            description: 'for refinement: which side states the broader rule',
          },
        },
        required: ['pair', 'class', 'why', 'general'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdicts'],
  additionalProperties: false,
};

/**
 * The class definitions, as the judge sees them.
 *
 * Every line here is aimed at one confusion. `refinement` versus `contradiction`
 * is the pair that decides whether a memory survives, and the cheap reading —
 * "the newer one disagrees, so it supersedes" — turns "use pnpm" plus "use pnpm,
 * and never npm, it is the only installer we support" into a superseded memory
 * and a lost fact. So the test offered is about the world and not the wording:
 * can both be true at once? Then it is not a contradiction, whatever the cosine
 * says.
 *
 * The last paragraph is the one that saves the most: nothing here is obliged to
 * find a relationship. `unrelated` is a real answer, and detection is a
 * similarity gate that is *meant* to over-offer.
 */
export const JUDGE_SYSTEM = [
  'You are classifying pairs of stored memories about a user and their projects.',
  'A memory is one durable fact — a preference, decision, constraint or reference.',
  'The pairs were selected only because their embeddings are close, which cannot tell',
  'agreement from disagreement. Your job is to say which it is.',
  '',
  'Classes:',
  '  duplicate      — the same fact, said twice. Merging them loses nothing.',
  '  contradiction  — both cannot be true now. One states what replaced the other.',
  '  refinement     — one is a more specific or qualified version of the other, and',
  '                   BOTH ARE STILL TRUE. Extra conditions, exceptions or detail are',
  '                   refinements, not contradictions.',
  '  complementary  — related and both true, but neither contains the other.',
  '  unrelated      — near in wording, different subjects. Nothing to do.',
  '',
  'The test for contradiction is whether both can hold at the same time, not how',
  'differently they are worded. "Use pnpm" and "use pnpm, never npm" agree. "We use',
  'Vitest" and "we moved off Vitest to bun test" do not.',
  '',
  'Be conservative. A wrong `duplicate` merges two facts into one and a wrong',
  '`contradiction` retires a true memory; both are worse than saying `unrelated`.',
  'If you are unsure, or the two are simply near each other, answer `unrelated`.',
  'Answer for every pair given, using its id exactly as written, and nothing else.',
].join('\n');

const clip = (value, max = MAX_JUDGE_TEXT) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
};

const day = 24 * 60 * 60 * 1000;

/** "today", "3d ago", "8mo ago" — the judge needs order, not calendars. */
function ageOf(at, now) {
  const ms = now - Number(at ?? 0);
  if (!Number.isFinite(ms) || Number(at ?? 0) === 0) return 'unknown age';
  const days = Math.floor(ms / day);
  if (days <= 0) return 'today';
  if (days < 60) return `${days}d ago`;
  if (days < 730) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

/**
 * The id a pair is answered by: `12-37`, the two memory ids and nothing else.
 *
 * NOT `pair.key`, AND THE REASON IS A MEASUREMENT. The first live run of slice
 * 5b.3's adversarial set asked about `pair:1:2` and got back a verdict for
 * `"1:2"` — every pair in the batch, correctly classified, and every one of them
 * dropped as an answer about a pair nobody asked about. The key's own prefix is
 * to blame: `pair:1:2` at the start of a line reads as a *label* ("pair: 1:2"),
 * and a model that tidies a label out of an id is doing the sensible thing.
 *
 * So the id that goes over the wire has no colon and no word in front of it, and
 * it goes in brackets. The cache key keeps its `pair:` prefix — it is a `meta`
 * namespace and has to (pairs.mjs) — and `collectVerdicts` maps back.
 */
export const pairLabel = (pair) => `${pair.a}-${pair.b}`;

/**
 * The same id, as the answer wrote it.
 *
 * Tolerant about the FORM and strict about WHICH: `pair:1:2`, `1:2`, `[1-2]`,
 * `#1 #2` and `2-1` all name the pair the batch called `1-2`, and none of them is
 * the model inventing a pair — the digits have to match one it was asked about or
 * the verdict is still dropped. That is the line this file draws everywhere: the
 * envelope's shape is another program's business, the content is ours.
 *
 * The bracket case is measured too. Told to copy "the bracketed id", one live run
 * in five answered `[1-2]` and lost its whole batch to `unknown` — silently, with
 * a clean exit code and no error, which is exactly the failure this function
 * exists to stop being possible.
 */
export function normaliseLabel(value) {
  const raw = String(value ?? '')
    .replace(/[[\](){}<>#\s]/g, '')
    // After the brackets, so `[pair:1:2]` loses both.
    .replace(/^pair[:._-]?/i, '')
    .replace(/[:._]/g, '-');
  const match = /^(\d+)-(\d+)$/.exec(raw);
  if (!match) return null;
  const [lo, hi] = [Number(match[1]), Number(match[2])].sort((x, y) => x - y);
  return `${lo}-${hi}`;
}

/**
 * One pair, as text. Both sides carry their id, kind, age and rationale.
 *
 * WHICH SIDE IS OLDER IS STATED AND WHICH SIDE IS "RIGHT" IS NOT. PLAN: "Recency
 * is not automatically right" — the judge is told the order because
 * `contradiction` is meaningless without it, and told nothing about pins or
 * confidence because those decide whether the resolution is *safe to apply*, which
 * is resolve.mjs's guard and not a question for a language model. Feeding them in
 * here would let the model pre-empt the guard by softening its verdict.
 */
export function renderPair(pair, { now = Date.now() } = {}) {
  const [lo, hi] = pair.rows;
  const older = lo.created_at <= hi.created_at ? lo : hi;
  const side = (row, label) =>
    [
      `  ${label}: #${row.id} (${row.kind}, written ${ageOf(row.created_at, now)}` +
        `${row.id === older.id ? ', the older' : ''})`,
      `     text: ${clip(row.text)}`,
      ...(row.why ? [`     why:  ${clip(row.why, 300)}`] : []),
    ].join('\n');

  return [`[${pairLabel(pair)}]   (similarity ${pair.similarity})`, side(lo, 'a'), side(hi, 'b')].join('\n');
}

/** The user turn: the batch, and the reminder that its ids are the answer keys. */
export function buildPrompt(batch, { now = Date.now() } = {}) {
  if (!Array.isArray(batch) || batch.length === 0) {
    throw new JudgeError('buildPrompt needs at least one pair.', 'MEM_INVALID');
  }
  return [
    `Classify these ${batch.length} pair${batch.length === 1 ? '' : 's'}.`,
    // One element, so the instruction is one paragraph: the batch below is joined
    // with blank lines, and an instruction split across two of them reads as two
    // pairs' worth of preamble.
    'Each pair starts with its id in brackets. Return one verdict per pair, whose\n' +
      '`pair` field is that id without the brackets: for [12-37], answer "12-37".',
    '',
    ...batch.map((pair) => renderPair(pair, { now })),
  ].join('\n\n');
}

// --------------------------------------------------------------- the call --

/**
 * The argv for one judged batch.
 *
 * `--tools ""` is a security boundary, not a speed one: the text in the prompt was
 * captured off a terminal by a hook, so it is untrusted input, and a judge with
 * Bash is an injection target that reads the user's own memories. Nothing here
 * needs a tool — the whole task is two strings in and one word out.
 *
 * Split out and exported so a test can assert the flags without spawning anything,
 * because the flags are the part that silently rots: `--json-schema` fell back to
 * unstructured output when the schema was invalid, and that failure looks like a
 * bad model rather than a bad flag.
 */
export function claudeArgs({ model = JUDGE_MODEL, schema = JUDGE_SCHEMA, system = JUDGE_SYSTEM } = {}) {
  return [
    '-p',
    '--model',
    model,
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(schema),
    '--append-system-prompt',
    system,
    '--tools',
    '',
  ];
}

/**
 * Spawn one `claude -p` and hand back what it printed.
 *
 * The prompt goes on stdin rather than in argv: a full batch is tens of kilobytes
 * of the user's own memories, and an argument list that long is both a platform
 * limit away from failing and visible in `ps` to every process on the machine.
 *
 * MEM_NO_LLM=1 refuses to spawn at all — the sibling of MEM_NO_INSTALL, for the
 * same reason: a maintenance path that quietly reaches the network on a machine
 * that opted out is a broken promise, and an explicit error is a debuggable one.
 */
export function runClaude(prompt, {
  bin = null,
  args = null,
  model = JUDGE_MODEL,
  schema = JUDGE_SCHEMA,
  system = JUDGE_SYSTEM,
  timeoutMs = JUDGE_TIMEOUT_MS,
  env = process.env,
  cwd = undefined,
} = {}) {
  if (env.MEM_NO_LLM === '1') {
    throw new JudgeError(
      'MEM_NO_LLM=1 — the consolidation judge needs `claude -p`; unset it to judge pairs.',
      'MEM_NO_LLM',
    );
  }

  const command = bin ?? env.MEM_JUDGE_CMD ?? JUDGE_CMD;
  const argv = args ?? claudeArgs({ model: env.MEM_JUDGE_MODEL ?? model, schema, system });
  const started = performance.now();

  return new Promise((resolve, reject) => {
    let child;
    try {
      // No shell: the prompt never reaches one, but neither does the binary name,
      // and MEM_JUDGE_CMD is the kind of setting that ends up in a shared dotfile.
      child = spawn(command, argv, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      reject(new JudgeError(`could not run '${command}': ${err.message}`, 'MEM_JUDGE_SPAWN'));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(
        reject,
        new JudgeError(`the judge did not answer within ${timeoutMs} ms.`, 'MEM_JUDGE_TIMEOUT'),
      );
    }, timeoutMs);
    timer.unref?.();

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) =>
      finish(reject, new JudgeError(`could not run '${command}': ${err.message}`, 'MEM_JUDGE_SPAWN')),
    );
    child.on('close', (code) =>
      finish(resolve, {
        code,
        stdout,
        stderr,
        ms: Math.round(performance.now() - started),
      }),
    );

    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
  });
}

// -------------------------------------------------------------- the answer --

const stripFence = (text) => {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  return fenced ? fenced[1] : text;
};

const parseJson = (text) => {
  try {
    return JSON.parse(stripFence(String(text)));
  } catch {
    return undefined;
  }
};

/**
 * Dig the schema'd object out of whatever `claude -p --output-format json` wrapped
 * it in.
 *
 * WRITTEN TOLERANTLY ON PURPOSE, and this is the one place in the plugin where
 * that is the right instinct. The envelope is another program's output format: it
 * has carried the structured value as a JSON string inside `result` and as an
 * object beside it under more than one name, and a mem release that reads exactly
 * one of those shapes stops being able to consolidate the moment the CLI updates —
 * with a parse error, on a background path, where nobody is reading. So every
 * plausible shape is tried and the *content* checks below stay strict, which is
 * where the real risk is anyway.
 */
export function extractPayload(stdout) {
  const raw = String(stdout ?? '').trim();
  if (raw === '') throw new JudgeError('the judge printed nothing.', 'MEM_JUDGE_EMPTY');

  const parsed = parseJson(raw);
  if (parsed === undefined) {
    throw new JudgeError('the judge printed something that is not JSON.', 'MEM_JUDGE_BAD_JSON', {
      sample: raw.slice(0, 200),
    });
  }

  // The envelope reports its own failures; they are far more useful than the
  // "no verdicts" that reading past them would produce.
  if (parsed && typeof parsed === 'object' && parsed.is_error === true) {
    const why = typeof parsed.result === 'string' ? parsed.result : (parsed.subtype ?? 'unknown error');
    throw new JudgeError(`the judge failed: ${clip(why, 300)}`, 'MEM_JUDGE_REFUSED', parsed);
  }

  const candidates = [
    parsed?.structured_output,
    parsed?.structuredOutput,
    parsed?.structured_result,
    parsed?.result,
    parsed,
  ];
  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? parseJson(candidate) : candidate;
    if (value && typeof value === 'object' && Array.isArray(value.verdicts)) return value;
  }

  throw new JudgeError('the judge answered without a `verdicts` array.', 'MEM_JUDGE_NO_VERDICTS', {
    keys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : typeof parsed,
  });
}

/**
 * Verdicts for the pairs in one batch, checked against the batch itself.
 *
 * Three outputs, and the two that are not `verdicts` are the point: `missing` is
 * a pair the model skipped, `unknown` is an answer about a pair nobody asked
 * about. Both are common failure modes of a twenty-item batch and both are
 * *silent* if you index the reply by position or trust its keys — so the batch's
 * own keys are the index, and anything else is reported rather than absorbed.
 *
 * A pair answered twice keeps the first verdict: a model that changes its mind
 * mid-reply has not given an answer, and the alternative (last wins) makes the
 * result depend on an order nothing guarantees.
 */
export function collectVerdicts(payload, batch) {
  const wanted = new Map(batch.map((pair) => [pairLabel(pair), pair]));
  const verdicts = new Map();
  const unknown = [];
  const invalid = [];

  for (const entry of payload.verdicts ?? []) {
    const label = normaliseLabel(entry?.pair);
    const pair = label === null ? undefined : wanted.get(label);
    if (!pair) {
      unknown.push({ pair: String(entry?.pair ?? '').trim() || null, class: entry?.class ?? null });
      continue;
    }
    if (!VERDICTS.includes(entry?.class)) {
      invalid.push({ pair: pair.key, class: entry?.class ?? null });
      continue;
    }
    // Keyed by the pair's own key, not by the label: everything downstream —
    // the cache, the proposal, the plan — is keyed on `pair:<lo>:<hi>`, and the
    // label exists only for the length of one prompt.
    if (verdicts.has(pair.key)) continue;
    verdicts.set(pair.key, {
      pair: pair.key,
      class: entry.class,
      why: typeof entry.why === 'string' ? clip(entry.why, 400) : null,
      general: ['a', 'b'].includes(entry.general) ? entry.general : null,
    });
  }

  const missing = batch.filter((pair) => !verdicts.has(pair.key)).map((pair) => pair.key);
  return { verdicts, missing, unknown, invalid };
}

/** PLAN's "~20 pairs per LLM call", as an array of arrays. */
export function batchPairs(pairs, size = JUDGE_BATCH) {
  const n = Math.max(1, Math.floor(size));
  const out = [];
  for (let i = 0; i < pairs.length; i += n) out.push(pairs.slice(i, i + n));
  return out;
}

/**
 * Judge one batch: prompt, spawn, parse, check. The unit resolve.mjs calls, and
 * the unit a test replaces wholesale.
 *
 * A non-zero exit is still parsed before being reported, because the CLI prints
 * its structured error envelope on stdout and exits non-zero for the same reason —
 * "usage limit reached" is worth surfacing verbatim, and "the judge failed
 * (exit 1)" is not.
 */
export async function judgeBatch(batch, { now = Date.now(), run = runClaude, ...opts } = {}) {
  const prompt = buildPrompt(batch, { now });
  const result = await run(prompt, opts);
  let payload;
  try {
    payload = extractPayload(result.stdout);
  } catch (err) {
    if (result.code !== 0 && err.code !== 'MEM_JUDGE_REFUSED') {
      throw new JudgeError(
        `the judge exited ${result.code}: ${clip(result.stderr || err.message, 300)}`,
        'MEM_JUDGE_EXIT',
        { code: result.code },
      );
    }
    throw err;
  }
  return { ...collectVerdicts(payload, batch), ms: result.ms ?? null, code: result.code ?? 0 };
}

/**
 * Judge every pair, in batches of ~20.
 *
 * A BATCH THAT FAILS DOES NOT FAIL THE PASS. Its pairs come back in `unjudged`
 * and the run reports the error — because the alternative is that one refused
 * call throws away nineteen judgements the caller has already paid for, and
 * because the caller must not stamp the watermark over pairs nobody judged. That
 * decision is made from `errors` and `unjudged` being empty, so both are returned
 * rather than logged.
 */
export async function judgePairs(pairs, { batchSize = JUDGE_BATCH, now = Date.now(), ...opts } = {}) {
  const batches = batchPairs(pairs ?? [], batchSize);
  const verdicts = new Map();
  const report = {
    pairs: pairs?.length ?? 0,
    batches: batches.length,
    calls: 0,
    judged: 0,
    unjudged: [],
    unknown: [],
    invalid: [],
    errors: [],
    ms: 0,
  };

  for (const batch of batches) {
    try {
      const answer = await judgeBatch(batch, { now, ...opts });
      report.calls += 1;
      report.ms += answer.ms ?? 0;
      for (const [key, verdict] of answer.verdicts) verdicts.set(key, verdict);
      report.unjudged.push(...answer.missing);
      report.unknown.push(...answer.unknown);
      report.invalid.push(...answer.invalid);
    } catch (err) {
      report.calls += 1;
      report.errors.push({ pairs: batch.map((p) => p.key), code: err.code ?? null, message: err.message });
      report.unjudged.push(...batch.map((p) => p.key));
    }
  }

  report.judged = verdicts.size;
  return { verdicts, ...report };
}
