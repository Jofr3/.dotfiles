// The one place that decides whether a session is worth talking about.
//
// Both entry points go through here — the Stop hook, which needs an answer in
// milliseconds and must never speak out of turn, and the CLI, which produces the
// report the skill reads. Having a single `observe`/`assess` pair is what keeps
// the nudge and the report from ever disagreeing about what happened.
//
//   observe()  advances the read offset and folds new events into the facts.
//              Idempotent by construction: it only ever reads bytes it has not
//              read before, so calling it twice in a row is a no-op the second
//              time.
//   assess()   scores the facts against the ledger. Pure, and re-runnable at any
//              time — it is what turns "here is what happened" into "here is
//              what is worth interrupting for".
//
// The gate is deliberately hard to trip. Nearly every session has some friction
// in it, and a skill that says so every time would be closed and forgotten
// inside a week. Three independent brakes:
//
//   the threshold   — one strong signal, or two or three weak ones agreeing
//   the cooldown    — per project, so a busy repo cannot drown out a quiet one
//   the ledger      — anything already declined does not even count toward the
//                     score, so saying no once removes that friction permanently
//
// Every number below can be overridden from the environment, because the right
// sensitivity is a matter of taste and the only way to find it is to live with
// it for a while.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, isAbsolute, dirname } from 'node:path';
import { homedir } from 'node:os';
import { readTail, events } from './transcript.mjs';
import { newFacts, accumulate, signals as deriveSignals, FACTS_VERSION } from './detect.mjs';
import * as store from './store.mjs';

const MINUTE = 60_000;

export const gate = {
  /** Sum of weights needed to speak. One `documented-command-failed` (4.0)
   *  clears it alone; a re-read and a slow search never will. */
  threshold: num(process.env.EVOLVE_THRESHOLD, 4.0),
  /** Per-project quiet period after a nudge. */
  cooldownMs: num(process.env.EVOLVE_COOLDOWN_MIN, 240) * MINUTE,
  /** A session has to have done *something* before its lessons are worth
   *  interrupting for. Either of these is enough — a long unattended run of tool
   *  calls counts, and so does a conversation of several exchanges. */
  minToolCalls: num(process.env.EVOLVE_MIN_TOOL_CALLS, 12),
  minPrompts: num(process.env.EVOLVE_MIN_PROMPTS, 3),
  /** Interruptions allowed per session; the second only for a session that is
   *  really going badly (see `hardThreshold`). */
  maxPerSession: num(process.env.EVOLVE_MAX_PER_SESSION, 1),
  /** A score this high overrides the cooldown and the per-session cap. */
  hardThreshold: num(process.env.EVOLVE_HARD_THRESHOLD, 10),
};

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

/** Too early in a session to have learned anything from it. Shared so the Stop
 *  hook can bail before scoring and `assess` can explain itself the same way. */
export function tooYoung(facts) {
  return facts.toolCalls < gate.minToolCalls && facts.prompts < gate.minPrompts;
}

/**
 * Fold everything new in the transcript into this session's facts and persist
 * them. Returns the updated state, or null if there is nothing to read.
 */
export function observe(p, { sessionId, transcriptPath, cwd, now = Date.now() }) {
  if (!sessionId || !transcriptPath) return null;

  const prior = store.readSession(p, sessionId);
  const state =
    prior && prior.facts?.version === FACTS_VERSION
      ? prior
      : { offset: 0, nudges: 0, lastNudgeAt: 0, facts: newFacts({ cwd, sessionId, now }) };

  const { entries, offset, missing } = readTail(transcriptPath, state.offset);
  if (missing) return null;

  state.offset = offset;
  state.transcriptPath = transcriptPath;
  state.facts.cwd ??= cwd;
  // Recorded so the Stop hook can skip scoring on a turn that taught it nothing —
  // two Stop events can land with no new bytes between them.
  state.newEntries = entries.length;
  if (entries.length > 0) accumulate(state.facts, events(entries), now);

  store.writeSession(p, sessionId, state);
  return state;
}

/**
 * Score a session's facts. Returns every signal with its ledger verdict
 * attached, the score, and whether that is enough to interrupt.
 *
 * `reason` always explains the decision, including the negative ones — it is the
 * only way to debug a skill whose correct behaviour is usually silence.
 */
export function assess(p, state, { now = Date.now(), ledger, docs, force = false } = {}) {
  const facts = state.facts;
  const l = ledger ?? store.readLedger(p);
  const raw = deriveSignals(facts, { docs: docs ?? loadDocs(facts.cwd) });
  const seen = store.recordSeen(p, raw, facts.sessionId, now);

  const scored = raw.map((s) => {
    const v = store.verdict(l, s.fingerprint, now);
    const sessions = Math.max(v.sessions ?? 0, seen[s.fingerprint]?.sessions ?? 0);
    const recurring = sessions >= 2;

    // A fix that was applied and then came back is more interesting than a fresh
    // finding, not less: it says the note we wrote did not work. But "came back"
    // has to mean a *different* session — the evidence that prompted the fix stays
    // in this session's facts for as long as it runs, and reading that as a
    // regression would make every fix undo itself minutes later.
    const regressed =
      v.status === 'applied' &&
      (v.decidedIn
        ? facts.sessionId !== v.decidedIn
        : // Hand-edited ledger with no session recorded: fall back to time, with a
          // gap long enough that no single session can trip it by accident.
          (v.lastSeen ?? 0) > (v.decidedAt ?? 0) + 6 * 60 * MINUTE);

    let counts = true;
    if (v.status === 'declined') counts = false; // the user has settled this
    else if (v.status === 'deferred') counts = false; // not yet
    else if (v.status === 'applied' && !regressed) counts = false;

    let weight = s.weight;
    if (recurring) weight *= 1.5;
    if (regressed) weight *= 1.2;

    return { ...s, status: v.status, sessions, recurring, regressed, counts, weight: round(weight) };
  });

  const counting = scored.filter((s) => s.counts);
  const score = round(counting.reduce((a, s) => a + s.weight, 0));

  const lastAt = Math.max(store.lastNudge(l, facts.cwd), state.lastNudgeAt ?? 0);
  const cooling = now - lastAt < gate.cooldownMs;
  const hard = score >= gate.hardThreshold;
  const cap = hard ? gate.maxPerSession + 1 : gate.maxPerSession;

  let fire = true;
  let reason = `score ${score} over ${gate.threshold}`;
  if (force) reason = 'forced';
  else if (counting.length === 0) (fire = false), (reason = 'nothing new to say');
  else if (tooYoung(facts))
    (fire = false), (reason = `session too young (${facts.toolCalls} tool calls, ${facts.prompts} prompts)`);
  else if (score < gate.threshold) (fire = false), (reason = `score ${score} under ${gate.threshold}`);
  else if ((state.nudges ?? 0) >= cap) (fire = false), (reason = `already spoke ${state.nudges}× this session`);
  else if (cooling && !hard) {
    fire = false;
    reason = `cooling down (${Math.round((gate.cooldownMs - (now - lastAt)) / MINUTE)}min left)`;
  }

  return { signals: scored, counting, score, fire: force || fire, reason };
}

// ── the project's own documentation ──────────────────────────────────────────

/** Read caps. Documentation that does not fit in these is documentation nobody
 *  reads either. */
const DOC_BYTES = 256 * 1024;
const DOC_FILES = 40;

/**
 * Every document that is supposed to tell Claude how this project works.
 *
 * This is what makes the strongest signal possible: a command that failed *and*
 * is written down somewhere is a documentation bug, and the fix is an edit or a
 * deletion in a specific file rather than a guess about where a new note should
 * go.
 */
export function loadDocs(cwd) {
  if (!cwd) return [];
  const out = [];
  const seen = new Set();

  const add = (path, label) => {
    if (seen.has(path) || out.length >= DOC_FILES) return;
    seen.add(path);
    try {
      const st = statSync(path);
      if (!st.isFile() || st.size > DOC_BYTES) return;
      out.push({ path, rel: label, text: readFileSync(path, 'utf8') });
    } catch {}
  };

  for (const name of ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', join('.claude', 'CLAUDE.md')]) {
    add(join(cwd, name), name);
  }
  add(join(homedir(), '.claude', 'CLAUDE.md'), '~/.claude/CLAUDE.md');

  // docs/, two levels deep. Deeper than that is reference material, not the
  // instructions a session would have needed.
  walk(join(cwd, 'docs'), 2, (file) => add(file, relative(cwd, file)));

  return out;
}

function walk(dir, depth, fn) {
  if (depth < 0) return;
  let names = [];
  try {
    names = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of names) {
    if (d.name.startsWith('.') || d.name === 'node_modules') continue;
    const full = join(dir, d.name);
    if (d.isDirectory()) walk(full, depth - 1, fn);
    else if (/\.mdx?$/i.test(d.name)) fn(full);
  }
}

// ── finding a transcript without being told ─────────────────────────────────

export function projectsRoot() {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
}

/**
 * The transcript directory for a working directory.
 *
 * The harness names it after the session's cwd with non-alphanumerics flattened
 * to dashes — but a session's cwd is the project root, and the CLI may well be
 * invoked from a subdirectory of it. So each ancestor gets a try, nearest first.
 * Without this, running `/evolve` from `packages/web` silently finds nothing and
 * reports a clean session.
 */
export function projectDir(cwd, root = projectsRoot()) {
  let dir = String(cwd ?? '');
  for (let i = 0; i < 24 && dir !== ''; i += 1) {
    const candidate = join(root, dir.replace(/[^A-Za-z0-9]/g, '-'));
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {}
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * The newest transcript for a project. The hooks are handed `transcript_path`;
 * the CLI is not, so it reconstructs it.
 *
 * A whole-tree scan is the fallback *only* when a session id was given, because
 * then the answer is unambiguous. Without one, guessing across projects could
 * report on somebody else's session entirely, so it gives up instead.
 */
export function findTranscript({ cwd, sessionId, root } = {}) {
  const base = root || projectsRoot();
  const candidates = [];

  const collect = (dir) => {
    if (!dir) return;
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      if (sessionId && name !== `${sessionId}.jsonl`) continue;
      const file = join(dir, name);
      try {
        candidates.push({ file, mtime: statSync(file).mtimeMs });
      } catch {}
    }
  };

  collect(projectDir(cwd, base));

  if (candidates.length === 0 && sessionId) {
    let dirs = [];
    try {
      dirs = readdirSync(base);
    } catch {
      return null;
    }
    for (const d of dirs) collect(join(base, d));
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].file;
}

export function sessionIdFromPath(file) {
  const m = String(file).match(/([^/\\]+)\.jsonl$/);
  return m ? m[1] : null;
}

export const absolute = (p) => (isAbsolute(p) ? p : join(process.cwd(), p));

function round(n) {
  return Math.round(n * 100) / 100;
}
