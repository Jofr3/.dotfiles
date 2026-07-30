#!/usr/bin/env node
// SessionStart — start the maintenance tier and get out of the way.
//
// PLAN puts tier 1 at "cheap enough to fire detached at SessionStart (never
// blocking) or daily". This hook is the *never blocking* half, and it is the
// whole reason it exists as a second SessionStart entry rather than as a few
// lines inside session-start.mjs: that hook produces the recollection block the
// session actually reads, and its budget is a hard 400 ms. A maintenance pass
// over a large store is seconds, not milliseconds. Nothing that takes seconds may
// share a process with something the session is waiting for.
//
// So this hook does almost nothing: three filesystem checks, one detached spawn,
// exit 0. It never waits for the child, never reads its output, and produces no
// stdout at all — there is nothing to inject.
//
// WHY IT CHECKS THE STAMP AT ALL, given `mem maintain` re-checks `meta` itself.
// SessionStart fires on startup, resume, clear *and* compact, so a working day is
// a dozen firings. Each one would otherwise pay ~60 ms of node boot plus a turso
// import to be told "not due" — twelve times, for nothing. The stamp is one
// stat() and answers the same question. When they disagree the store wins: the
// child declines and nothing happens.
//
// Everything is silent by default, including failures, for session-start.mjs's
// reason — a hook that complains on stderr breaks the session cosmetically even
// when it fails safely. MEM_HOOK_DEBUG=1 explains on stderr and redirects the
// child's output to a log beside the database. MEM_NO_MAINTAIN=1 disables it.

import { existsSync, openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Nothing here is slow, so the watchdog is a failsafe and not a target. */
const BUDGET_MS = Number(process.env.MEM_HOOK_TIMEOUT_MS) || 1500;

const debug = (why) => {
  if (process.env.MEM_HOOK_DEBUG) process.stderr.write(`mem session-maintain: ${why}\n`);
};

function done(why) {
  debug(why);
  process.exit(0);
}

async function main() {
  if (process.env.MEM_NO_MAINTAIN) return done('MEM_NO_MAINTAIN is set');

  const { resolvePaths } = await import('../src/paths.mjs');
  const paths = resolvePaths();

  // No store means nothing to maintain, and a hook must never be the thing that
  // creates one — same rule as session-start.mjs.
  if (!existsSync(paths.dbPath)) return done(`no database at ${paths.dbPath}`);

  const { depsReady } = await import('../src/deps.mjs');
  if (!depsReady(paths)) return done('dependencies not installed');

  const { MIN_INTERVAL_MS, dueForRun, readStamp } = await import('../src/maintain.mjs');
  const stamp = readStamp(paths);
  const due = dueForRun({ lastAt: stamp?.at ?? null, now: Date.now(), minIntervalMs: MIN_INTERVAL_MS });
  if (!due.due) return done(`not due — ${due.why}, ${Math.round(due.sinceMs / 60000)} min ago`);

  const cli = fileURLToPath(new URL('../bin/mem', import.meta.url));

  // Under MEM_HOOK_DEBUG the child's output goes to a log beside the database:
  // a detached process whose stdout is discarded is impossible to diagnose, and
  // "did maintenance run last night" is the question that gets asked.
  let stdio = 'ignore';
  if (process.env.MEM_HOOK_DEBUG) {
    try {
      const fd = openSync(`${paths.dbPath}.maintain.log`, 'a');
      stdio = ['ignore', fd, fd];
    } catch {
      stdio = 'ignore';
    }
  }

  const child = spawn(process.execPath, [cli, 'maintain', '--quiet'], {
    detached: true,
    stdio,
    env: {
      ...process.env,
      // The child must never run npm: deps are already present (checked above),
      // and a background install triggered by opening a session is exactly the
      // risk-register row about hook latency, moved somewhere nobody can see it.
      MEM_NO_INSTALL: '1',
      // Belt and braces against a child that somehow re-enters the hook path.
      MEM_NO_MAINTAIN: '1',
    },
  });
  child.unref();

  return done(`spawned pid ${child.pid} — ${due.why}`);
}

const watchdog = setTimeout(() => done(`over budget (${BUDGET_MS}ms)`), BUDGET_MS);

main().then(
  () => {
    clearTimeout(watchdog);
    process.exit(0);
  },
  (err) => done(err?.message ?? String(err)),
);
