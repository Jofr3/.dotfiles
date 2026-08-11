#!/usr/bin/env node
// Stop — watch the turn that just ended, and decide whether it is worth speaking
// about. This hook does the noticing; it never does the talking.
//
// THIS HOOK NEVER WRITES TO STDOUT. Stop is the one event whose stdout is
// interpreted rather than injected: a JSON body carrying `decision: "block"`
// forces the model to keep working, and a hook that produced that by accident
// would put the session in a loop with no visible cause. So there is no emit()
// in this file. Every path ends in exit 0 with an empty stdout, and the only
// output that can ever exist is a debug line on stderr under EVOLVE_DEBUG.
//
// Which raises the obvious question: if it cannot speak, how does a suggestion
// ever reach anyone? It arms one. When the gate opens this writes a small file
// under pending/, and the *next* UserPromptSubmit — prompt-nudge.mjs — delivers
// it as context alongside whatever the user types next. That indirection is not
// a workaround, it is the polite behaviour: a proposal about how the session went
// arrives when the user next speaks, never as an interruption of work still in
// flight, and never as a message that hijacks the turn.
//
// Cheap first, because most turns fall out early:
//
//   no session id / transcript   nothing identifies the turn
//   nothing new in the file      the common case between rapid Stop events
//   too few turns                too early to have learned anything
//   score under the gate         the overwhelmingly common case
//   cooling down, or capped      already spoke recently
//
// The accumulation still happens on every turn — it is a few object updates and
// one small JSON write — because facts thrown away are facts the report cannot
// show later. Only the scoring is skipped, and only when it cannot matter.
//
// EVOLVE_DISABLE=1 turns the whole thing off. EVOLVE_DEBUG=1 explains each
// silent exit on stderr, which is the only way to tell "nothing was wrong" from
// "the hook is broken" in a skill whose correct behaviour is usually silence.

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Failsafe, not a target: nothing here embeds, waits on a model, or shells out,
 *  so the expected path is a few milliseconds. The outer bound is the timeout in
 *  settings.json; this one exists so the failure is our silent no-op rather than
 *  a killed child at the end of every turn. */
const BUDGET_MS = Number(process.env.EVOLVE_HOOK_TIMEOUT_MS) || 2000;

const debug = (why) => {
  if (process.env.EVOLVE_DEBUG) process.stderr.write(`evolve stop: ${why}\n`);
};

/** The only exit. Silent by contract — see the header. */
function done(why) {
  debug(why);
  process.exit(0);
}

function readEvent() {
  try {
    if (process.stdin.isTTY) return {};
    return JSON.parse(readFileSync(0, 'utf8')) ?? {};
  } catch {
    return {};
  }
}

async function main() {
  if (process.env.EVOLVE_DISABLE) return done('disabled by EVOLVE_DISABLE');

  const event = readEvent();
  const sessionId = event.session_id ?? event.sessionId;
  const transcriptPath = event.transcript_path ?? event.transcriptPath;
  const cwd = event.cwd ?? process.cwd();

  if (typeof sessionId !== 'string' || sessionId === '') return done('no session id in the payload');
  if (typeof transcriptPath !== 'string' || transcriptPath === '') return done('no transcript path in the payload');

  const [store, review] = await Promise.all([import('../scripts/lib/store.mjs'), import('../scripts/lib/review.mjs')]);
  const p = store.paths();
  const now = Date.now();

  const state = review.observe(p, { sessionId, transcriptPath, cwd, now });
  if (!state) return done('transcript unreadable');

  // Housekeeping, at most once a day, and after the observation so a slow sweep
  // can never cost us a turn's facts.
  maybeSweep(p, store, now);

  if (state.newEntries === 0) return done('no new transcript lines');
  if (review.tooYoung(state.facts)) {
    return done(`session too young (${state.facts.toolCalls} tool calls, ${state.facts.prompts} prompts)`);
  }

  const a = review.assess(p, state, { now });
  if (!a.fire) return done(a.reason);

  // Only the strongest few. A nudge listing eight things is a nudge nobody reads,
  // and the skill re-runs `evolve report` for the full picture anyway.
  const top = a.counting.slice(0, 3);
  const armed = store.armNudge(p, sessionId, {
    at: now,
    cwd,
    sessionId,
    score: a.score,
    reason: a.reason,
    signals: top.map((s) => ({
      fingerprint: s.fingerprint,
      signal: s.id,
      title: s.title,
      weight: s.weight,
      sessions: s.sessions,
      recurring: s.recurring,
      regressed: s.regressed,
      target: s.target?.kind ?? 'judge',
    })),
  });
  if (!armed) return done('could not arm the nudge');

  // Both counters move now, not when the nudge is delivered. If the session ends
  // before the user types again the nudge is simply never read — and the cooldown
  // it consumed is the correct outcome, because the alternative is a queue of
  // stale proposals waiting to arrive all at once.
  state.nudges = (state.nudges ?? 0) + 1;
  state.lastNudgeAt = now;
  store.writeSession(p, sessionId, state);
  store.markNudged(p, cwd, now);

  return done(`armed ${top.length} signal(s) at score ${a.score}`);
}

/** A once-a-day marker file. Cheaper than reading the whole state tree to find
 *  out whether a sweep is due. */
function maybeSweep(p, store, now) {
  const stamp = join(p.home, '.last-sweep');
  try {
    if (now - statSync(stamp).mtimeMs < 86_400_000) return;
  } catch {
    // No stamp yet: sweep, and leave one.
  }
  try {
    writeFileSync(stamp, `${new Date(now).toISOString()}\n`);
    store.sweep(p, now);
  } catch {}
}

const watchdog = setTimeout(() => done(`over budget (${BUDGET_MS}ms)`), BUDGET_MS);
watchdog.unref?.();

main().then(
  () => {
    // main() only returns through done(), which exits. Reaching here means it did
    // not; release the watchdog so this process cannot hang the end of a turn.
    clearTimeout(watchdog);
    process.exit(0);
  },
  (err) => done(err?.message ?? String(err)),
);
