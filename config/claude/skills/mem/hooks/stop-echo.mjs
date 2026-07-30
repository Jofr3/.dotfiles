#!/usr/bin/env node
// Stop — the echo heuristic (PLAN "Measuring `useful` without lying to yourself",
// signal 1).
//
// The turn is over. prompt-recall.mjs left behind what it injected; this hook
// reads the assistant's reply, asks whether the reply carries the distinctive
// words of any of those memories, and counts the ones that did. That is the whole
// job, and everything else here is about doing it without ever being noticed.
//
// THIS HOOK NEVER SPEAKS. Stop is the one event where stdout is not merely
// injected but *interpreted*: a JSON body with `decision: "block"` forces the
// model to keep going, and a hook that did that by accident would put the session
// in a loop the user cannot see the cause of. So there is no emit() in this file.
// Every path ends in exit 0 with an empty stdout, and the only output that ever
// exists is a debug line on stderr under MEM_HOOK_DEBUG.
//
// Cheap first, in this order, because most turns fall out early:
//
//   no session id            → nothing identifies the turn
//   no turn record           → this session never injected anything
//   record already scored    → a second Stop for one turn (see consumeTurn)
//   nothing was injected     → the common case, and recorded on purpose
//   no reply text            → nothing to compare against
//   no echo                  → the memories were injected and not used
//
// Only past all of that does it load the database layer at all, which is why the
// ordinary turn costs a stat, a small read and some tokenising.
//
// It is the second hook that writes (after 3.2's injection accounting) and it
// takes the same shape: read-write with `runMigrations: false`, only after the
// database is known to exist, so a hook still never creates or upgrades a store.
// If the open fails there is nothing to fall back to — the whole point of this
// hook is the write — so it gives up quietly.
//
// MEM_HOOK_DEBUG=1 explains what it decided, including the token working, which is
// the only way to tell "the heuristic is too tight" from "the model ignored its
// memories". MEM_HOOK_TIMEOUT_MS moves the watchdog.

import { existsSync, readFileSync } from 'node:fs';

/**
 * Self-imposed budget. Nothing here embeds and nothing here waits on a model, so
 * the expected path is tens of milliseconds; this is a failsafe against a locked
 * database, not a target.
 */
const BUDGET_MS = Number(process.env.MEM_HOOK_TIMEOUT_MS) || 1500;

/** Cap on waiting for a busy store. The count is worth less than the wait. */
const DB_TIMEOUT_MS = 500;

const debug = (why) => {
  if (process.env.MEM_HOOK_DEBUG) process.stderr.write(`mem stop-echo: ${why}\n`);
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
    debug('unparseable hook input');
    return {};
  }
}

async function main() {
  const event = readEvent();

  const sessionId = event.session_id ?? event.sessionId;
  if (typeof sessionId !== 'string' || sessionId === '') return done('no session id in the payload');

  const [{ resolvePaths }, recall, echo] = await Promise.all([
    import('../src/paths.mjs'),
    import('../src/recall.mjs'),
    import('../src/echo.mjs'),
  ]);
  const paths = resolvePaths();
  const now = Date.now();

  // Before the database check, because a session that injected nothing is the
  // common case and this answers it from one file read.
  const record = recall.consumeTurn(paths, sessionId, { now });
  if (record === null) return done('no unscored turn record for this session');
  if (record.injected.length === 0) return done('this turn injected nothing');

  // The payload field is the documented route; the transcript is the fallback for
  // a harness that does not send it. Without either there is nothing to compare.
  const reply = echo.replyText(event) || echo.transcriptReply(event.transcript_path);
  if (reply === '') return done('no assistant reply in the payload or the transcript');

  const { scored, echoed } = echo.scoreTurn(record, reply);
  debug(
    scored
      .map((s) => `#${s.id} ${s.echo ? 'echo' : '    '} ${s.coverage.toFixed(2)} ` +
        `[${s.matched.join(' ') || '-'}] of [${s.evidence.join(' ') || '-'}]`)
      .join('; '),
  );
  if (echoed.length === 0) return done(`no echo across ${scored.length} injected`);

  if (!existsSync(paths.dbPath)) return done(`no database at ${paths.dbPath}`);

  const { depsReady } = await import('../src/deps.mjs');
  if (!depsReady(paths)) return done('dependencies not installed');

  const { openDb } = await import('../src/db.mjs');
  const conn = await openDb({
    paths,
    env: { ...process.env, MEM_NO_INSTALL: '1' },
    runMigrations: false,
    timeout: DB_TIMEOUT_MS,
  });

  try {
    const changed = await echo.markUseful(conn, echoed.map((s) => s.id), { now });
    return done(`counted ${changed} of ${scored.length}: ${echoed.map((s) => `#${s.id}`).join(' ')}`);
  } finally {
    await conn.close().catch(() => {});
  }
}

const watchdog = setTimeout(() => done(`over budget (${BUDGET_MS}ms)`), BUDGET_MS);

main().then(
  () => {
    // main() only returns via done(), which exits. Reaching here means it did not;
    // release the watchdog so the process cannot hang the end of a turn.
    clearTimeout(watchdog);
    process.exit(0);
  },
  (err) => done(err?.message ?? String(err)),
);
