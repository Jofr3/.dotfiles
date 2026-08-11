// Where evolve keeps what it has noticed, and what it has already asked about.
//
// Two kinds of state, with very different lifetimes:
//
//   sessions/<id>.json  Per-session working memory: how far into the transcript
//                       we have read, the accumulated facts, how many times we
//                       have interrupted. Disposable — deleting one costs the
//                       lessons of one session.
//
//   ledger.json         The long memory, and the whole reason this skill is not
//                       annoying. Every proposal ever surfaced is here with its
//                       verdict: applied, declined, deferred, or merely seen. A
//                       declined fingerprint is never proposed again. A
//                       fingerprint seen in several sessions is the evidence that
//                       turns "write a note about this" into "this deserves a
//                       skill".
//
// The ledger is the user's file, not the program's: readable JSON, readable
// fingerprints, safe to hand-edit. Delete an entry and evolve will happily
// propose it again — which is the right way to undo a `declined` you regret.
//
// Everything writes atomically (temp file + rename) because two Stop hooks from
// two concurrent sessions will collide, and a half-written ledger would lose
// every past decision. Last writer wins on the whole file; the ledger is only
// ever updated through `updateLedger`, which re-reads immediately before
// writing to keep that window as small as a single process can make it.

import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DAY = 86_400_000;

/** Session files this old are from sessions nobody will return to. */
const SESSION_TTL = 14 * DAY;

/** A fingerprint only ever *seen* — never proposed, never judged — is not worth
 *  remembering forever. Verdicts (applied/declined) are kept indefinitely. */
const SEEN_TTL = 120 * DAY;

export function paths(env = process.env) {
  const home = env.EVOLVE_HOME || join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'evolve');
  return {
    home,
    ledger: join(home, 'ledger.json'),
    sessions: join(home, 'sessions'),
    pending: join(home, 'pending'),
  };
}

function ensure(dir) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {}
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Write via rename, so a reader never sees a partial file and a crash never
 *  leaves one. The temp name carries the pid to survive concurrent writers. */
function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(tmp, file);
    return true;
  } catch {
    try {
      unlinkSync(tmp);
    } catch {}
    return false;
  }
}

// ── per-session state ───────────────────────────────────────────────────────

export function sessionFile(p, sessionId) {
  // Session ids are UUIDs from the harness; refuse anything that could escape
  // the directory rather than trusting that.
  const safe = String(sessionId).replace(/[^A-Za-z0-9._-]/g, '');
  return join(p.sessions, `${safe || 'unknown'}.json`);
}

export function readSession(p, sessionId) {
  return readJson(sessionFile(p, sessionId), null);
}

export function writeSession(p, sessionId, state) {
  ensure(p.sessions);
  return writeJson(sessionFile(p, sessionId), state);
}

// ── the ledger ──────────────────────────────────────────────────────────────

export function readLedger(p) {
  const l = readJson(p.ledger, null);
  if (!l || typeof l !== 'object') return { version: 1, proposals: {}, projects: {} };
  l.proposals ??= {};
  l.projects ??= {};
  return l;
}

/**
 * Mutate the ledger under a re-read, so an update never writes back a copy that
 * was already stale when it was loaded.
 */
export function updateLedger(p, fn) {
  ensure(p.home);
  const ledger = readLedger(p);
  const result = fn(ledger);
  writeJson(p.ledger, ledger);
  return result;
}

/**
 * What the ledger says about a fingerprint right now.
 *
 *   declined  — the user said no. Never surface again; it is excluded from the
 *               score entirely, so it cannot even help trigger a nudge.
 *   applied   — already fixed. Silent unless it comes back, which would mean the
 *               fix did not take.
 *   deferred  — "not now". Silent until the defer expires.
 *   seen      — observed before, never proposed.
 *   new       — first time.
 */
export function verdict(ledger, fingerprint, now = Date.now()) {
  const rec = ledger.proposals[fingerprint];
  if (!rec) return { status: 'new', count: 0, sessions: 0 };
  if (rec.status === 'deferred' && rec.deferUntil && now > rec.deferUntil) {
    return { ...rec, status: 'seen', sessions: rec.sessions?.length ?? 0 };
  }
  return { ...rec, status: rec.status ?? 'seen', sessions: rec.sessions?.length ?? 0 };
}

/**
 * Record that these signals were observed in this session, and report back how
 * often each has been seen before.
 *
 * Recurrence is counted in *distinct sessions*, not occurrences: the same
 * command failing eight times in one afternoon is one bad afternoon, while the
 * same command failing once a week for three weeks is a missing piece of
 * documentation.
 */
export function recordSeen(p, signals, sessionId, now = Date.now()) {
  if (signals.length === 0) return {};
  return updateLedger(p, (ledger) => {
    const out = {};
    for (const s of signals) {
      const rec = (ledger.proposals[s.fingerprint] ??= {
        status: 'seen',
        title: s.title,
        signal: s.id,
        sessions: [],
        firstSeen: now,
      });
      rec.title = s.title; // keep the wording current
      rec.signal = s.id;
      rec.lastSeen = now;
      rec.sessions ??= [];
      if (sessionId && !rec.sessions.includes(sessionId)) {
        rec.sessions.push(sessionId);
        if (rec.sessions.length > 12) rec.sessions = rec.sessions.slice(-12);
      }
      out[s.fingerprint] = { status: verdict(ledger, s.fingerprint, now).status, sessions: rec.sessions.length };
    }
    return out;
  });
}

/** Record a decision. `status` is applied | declined | deferred. */
export function decide(p, fingerprint, status, meta = {}, now = Date.now()) {
  return updateLedger(p, (ledger) => {
    const rec = (ledger.proposals[fingerprint] ??= { sessions: [], firstSeen: now });
    rec.status = status;
    rec.decidedAt = now;
    // Which session applied the fix. Facts are cumulative, so the failure that
    // prompted the fix stays in this session's record forever — without knowing
    // where the decision was made, the rest of the same session would read that
    // stale evidence as "the fix did not work" and start proposing it again.
    if (meta.session) rec.decidedIn = meta.session;
    if (meta.title) rec.title = meta.title;
    if (meta.note) rec.note = meta.note;
    if (meta.appliedTo) rec.appliedTo = meta.appliedTo;
    // "Not now" means not now, not never: three days, after which it is eligible
    // again — and by then it will have recurred, which strengthens the case.
    if (status === 'deferred') rec.deferUntil = now + (meta.days ?? 3) * DAY;
    else delete rec.deferUntil;
    return rec;
  });
}

/** When this project was last interrupted, so the cooldown can be per-project:
 *  a busy repo should not silence a quiet one. */
export function lastNudge(ledger, cwd) {
  return ledger.projects[cwd ?? '?']?.lastNudgeAt ?? 0;
}

export function markNudged(p, cwd, now = Date.now()) {
  return updateLedger(p, (ledger) => {
    const rec = (ledger.projects[cwd ?? '?'] ??= {});
    rec.lastNudgeAt = now;
    rec.nudges = (rec.nudges ?? 0) + 1;
    return rec;
  });
}

// ── the pending nudge ───────────────────────────────────────────────────────
//
// The Stop hook decides to speak; the next UserPromptSubmit is what actually
// speaks. This file is the handoff between them. It has to be a file and not an
// in-memory queue because they are separate processes, and it is per-session so
// two open sessions cannot steal each other's nudge.

export function armNudge(p, sessionId, payload) {
  ensure(p.pending);
  return writeJson(sessionFile({ sessions: p.pending }, sessionId), payload);
}

/** Read and delete in one go: a nudge is delivered exactly once, even if the
 *  delivery itself fails afterwards. Better a lost nudge than a repeating one. */
export function takeNudge(p, sessionId) {
  const file = sessionFile({ sessions: p.pending }, sessionId);
  const payload = readJson(file, null);
  if (payload) {
    try {
      unlinkSync(file);
    } catch {}
  }
  return payload;
}

// ── housekeeping ────────────────────────────────────────────────────────────

/**
 * Drop stale session files and expired ledger entries. Called from the CLI and
 * at most once a day from the Stop hook — never on a hot path.
 */
export function sweep(p, now = Date.now()) {
  let sessions = 0;
  for (const dir of [p.sessions, p.pending]) {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const file = join(dir, name);
      try {
        if (now - statSync(file).mtimeMs > SESSION_TTL) {
          unlinkSync(file);
          sessions += 1;
        }
      } catch {}
    }
  }

  const dropped = updateLedger(p, (ledger) => {
    let n = 0;
    for (const [fp, rec] of Object.entries(ledger.proposals)) {
      const undecided = rec.status === 'seen' || rec.status == null;
      if (undecided && now - (rec.lastSeen ?? 0) > SEEN_TTL) {
        delete ledger.proposals[fp];
        n += 1;
      }
    }
    return n;
  });

  return { sessions, proposals: dropped };
}
