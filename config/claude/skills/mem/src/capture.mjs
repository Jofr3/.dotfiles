// The capture gate — PLAN "Capture gate".
//
// PLAN: fire on `UserPromptSubmit`, not `Stop`; "pure-JS regex, target <20ms, no
// LLM"; on a hit inject `additionalContext` saying the prompt may carry a durable
// preference; "the model already in the loop does the extraction, so there is no
// extra API call"; and the write it asks for lands as `status='staged'`.
//
// Three properties are what make this cheap enough to run on every prompt:
//
//   It never opens the store. The gate is a function of the prompt text alone, so
//   it works on a machine with no database, no dependencies and no cached model —
//   which is also the machine where capturing the first memory matters most. That
//   is why prompt-recall.mjs computes it before its filesystem checks and emits it
//   from every early exit, including the watchdog.
//
//   It does not decide anything. A regex cannot tell "always use pnpm" from "this
//   always crashes", and pretending otherwise would stage junk. The gate only
//   raises the question; the model that was already about to run answers it. So
//   the cost of a false fire is one short block of context, and the block says
//   plainly that it may be a false fire.
//
//   It is narrow on purpose in exactly two places, both measured. See CUES.
//
// The upgrade path if precision disappoints is PLAN's, not this file's: "switch to
// a `prompt`- or `agent`-type hook doing dedicated extraction". Widening the
// vocabulary here is the cheap move and the wrong one — every added word fires on
// every prompt forever.

/**
 * The cue list, in the order it is tried; the first match names the hit.
 *
 * The vocabulary is PLAN's verbatim — `always|never|from now on|prefer|instead|
 * actually|don't |stop |I use |we use |let's go with|remember `, plus PLAN's
 * "correction shapes ('no, …')". Nothing is added to it beyond spelling variants
 * that mean the same thing (`don’t`/`dont`, `let's`/`lets`, `prefers`/
 * `preference`), because a cue word costs context on every prompt that contains
 * it for the life of the plugin.
 *
 * Two cues are narrowed, and the narrowing came from a measurement rather than
 * from taste. Run against the 52 recall prompts in build/harness.json — a corpus
 * of *questions*, so every fire there is a false one — the vocabulary applied
 * literally fires 4 times, and all four are `I use`/`we use` inside a question:
 *
 *   "what do we use for unit tests?"           "which package manager should I use here?"
 *   "what should I use to look for a string…"   (and one repeat)
 *
 * Asking which tool to use is the opposite of stating which one you use, and the
 * difference is one word in front of it: an auxiliary or a modal. Hence ASKING,
 * which also keeps `remember` from firing on "do you remember…" — a prompt that
 * wants recall, not capture. That takes the corpus to 0 of 52.
 *
 * `stop` is narrowed for the same reason: PLAN wants the correction shape "stop
 * doing X", while bare `stop` also fires on "how do I stop the server?", which is
 * the more common prompt by far. Requiring an activity after it keeps the shape
 * and drops the question.
 *
 * What is left leaks in the direction the block is written to survive. Measured on
 * the corpora in build/tests/capture.test.mjs: 17 of 17 stated preferences fire,
 * and 1 of 21 ordinary working prompts does — "what do you prefer?", asking the
 * model's opinion. `prefer` is deliberately *not* narrowed by ASKING, because
 * "you should prefer ripgrep" is a real instruction and suppressing it to win that
 * one false fire would trade a miss for a nudge nobody pays for.
 */
const ASKING = String.raw`(?:should|shall|can|could|would|will|do|does|did|must|might|may|to|not|you)\s+`;

export const CUES = [
  // Standing instructions. The highest-value cue and the noisiest one: "always"
  // and "never" are also how people describe a bug ("this never works").
  { cue: 'standing', re: /\b(?:always|never|from now on)\b/i },

  // Stated preference between options.
  { cue: 'preference', re: /\b(?:prefer(?:s|red|ence)?|instead|let['’]?s go with)\b/i },

  // Corrections. PLAN's shape is "no, …" and it is taken literally: anchored to a
  // sentence start, so it is the answer "no" and not the word ("there is no
  // config"), and followed by punctuation, so "no idea why this fails" and "no
  // need to do that" stay quiet. The cost is that an uncommatted "no it still
  // fails" is missed, which is the right way round — the shapes that would leak
  // are ordinary openings and there are many of them.
  {
    cue: 'correction',
    re: /(?:^|[.!?]\s+)(?:no|nope|nah)\b[,;:.]|\b(?:actually|don['’]?t)\b|\bstop\s+(?:\w+ing|doing|that)\b/i,
  },

  // Habits, stated rather than asked. See ASKING above.
  { cue: 'habit', re: new RegExp(String.raw`(?<!\b${ASKING})\b(?:i|we) use\b`, 'i') },

  // The explicit request. Rare, and the one cue where a miss is unambiguous.
  { cue: 'explicit', re: new RegExp(String.raw`(?<!\b${ASKING})\bremember\b`, 'i') },
];

/**
 * How much of the prompt the gate reads.
 *
 * The same head recall embeds (recall.promptText already truncates to
 * MAX_PROMPT_CHARS), for the same reason and with the same accepted loss: a
 * preference stated *after* a pasted 200KB log is not seen. Bounding it also
 * bounds the gate's cost, which is what lets the <20ms budget be a fact about the
 * function rather than a fact about the input.
 */
export const MAX_GATE_CHARS = 4000;

/**
 * The cue this prompt matched, or null. Pure, allocation-light, no store, no LLM.
 *
 * Every pattern is linear — no nested quantifier, no backtracking trap — so the
 * cost is bounded by MAX_GATE_CHARS times the cue count: measured at ~1µs per
 * prompt, with a worst single call of 0.07ms idle and ~2.6ms on a machine running
 * the whole test suite, against PLAN's 20ms.
 */
export function captureCue(prompt) {
  if (typeof prompt !== 'string' || prompt === '') return null;
  const text = prompt.length > MAX_GATE_CHARS ? prompt.slice(0, MAX_GATE_CHARS) : prompt;
  for (const { cue, re } of CUES) if (re.test(text)) return cue;
  return null;
}

/**
 * The matched phrase, for the block to quote back.
 *
 * This is the one piece of the user's message the block repeats, and the block is
 * context — so it is worth being explicit that it cannot carry anything: every cue
 * matches a fixed vocabulary plus at most one `\w+`, so the quoted text is a word
 * or two of letters, never arbitrary prompt text.
 */
export function captureMatch(prompt, cue) {
  const entry = CUES.find((c) => c.cue === cue);
  if (!entry) return null;
  const m = entry.re.exec(String(prompt).slice(0, MAX_GATE_CHARS));
  return m === null ? null : m[0].trim();
}

/**
 * The injected block.
 *
 * Written to be ignorable. The gate is wrong often — that is the deal that makes
 * it free — so the block leads with the fact that it is a regex, quotes the phrase
 * that fired so the model can see how weak the evidence is, and gives an explicit
 * "otherwise ignore this" exit. A block that asserted "the user just stated a
 * preference" would get one invented on the prompts where they did not.
 *
 * It routes through the `mem:remember` skill rather than naming a command,
 * because the skill is where the rules live that stop this staging noise: one
 * fact, durable only, no secrets, no restating the repo. It also keeps the cue
 * neutral about *how* the write happens — the `remember` tool takes `staged:
 * true`, the CLI takes `--staged` — so the block does not go stale when a
 * machine has the MCP server registered or does not. The block says why staging
 * is not optional: a staged row is invisible to recall until someone promotes
 * it, which is the entire safety argument for capturing without asking.
 *
 * The queue is named as `/mem:review`, the triage surface built in slice 4.2 —
 * the block has to say where a staged memory goes, or "it is never recalled until
 * promoted" reads as "it is never recalled".
 *
 * The tag is deliberately not `<mem-recollection>`: that block is background about
 * the store, this one is a question about the message, and a model that conflated
 * them would start answering memories or storing recollections.
 */
export function renderCapture({ match = null } = {}) {
  const quoted = match ? ` (matched "${match}")` : '';
  return [
    '<mem-capture-cue>',
    `A regex spotted a phrase in that message that often marks a durable preference${quoted}.`,
    'It is a regex — it cannot tell a preference from a passing remark, so this may well be nothing.',
    '',
    'If the user did just state something that will still be true next month — a preference, a',
    'standing constraint, a decision, or a correction of something you have had wrong — store it',
    'with the mem:remember skill, staged rather than active. Otherwise ignore this block completely.',
    '',
    'At most one memory, and only if it is durable. No need to ask first: a staged memory is never',
    'recalled until the user promotes it out of the queue (they run `/mem:review`). Then answer',
    'the message they actually sent — this block is not part of it.',
    '</mem-capture-cue>',
  ].join('\n');
}

/**
 * Gate a prompt in one call: `{cue, match, block}` on a hit, null otherwise.
 * The hook's whole use of this file, kept here so the order — cue, then quote,
 * then render — is defined once.
 */
export function captureBlock(prompt) {
  const cue = captureCue(prompt);
  if (cue === null) return null;
  const match = captureMatch(prompt, cue);
  return { cue, match, block: renderCapture({ match }) };
}
