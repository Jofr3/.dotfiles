#!/usr/bin/env node
// SessionStart — inject the core profile (PLAN Retrieval step 7).
//
// This runs before every session the user starts, so the contract is inertness
// first: ANY problem — no database, deps not installed, a lock held, a schema
// this build does not know, malformed hook input, a bug in here — exits 0 with
// nothing on stdout and nothing on stderr. A memory system that can break a
// session is worse than no memory system, and a hook that complains on stderr
// breaks the session cosmetically even when it fails "safely".
//
// Three things follow from that and are not incidental:
//
//   Read-only, never migrating. `openDb({ readonly: true })` also means
//   fileMustExist, so a machine with no store yet injects nothing rather than
//   creating a database from a hook. Nothing here writes, so nothing here can
//   corrupt or lock.
//
//   MEM_NO_INSTALL=1, plus a depsReady() check before the first turso import.
//   loadModule() will run `npm install` when a dependency is missing; blocking
//   session start on a network install is exactly the kind of thing the risk
//   register's "hook latency drags every prompt" row is about.
//
//   Its own watchdog. The harness timeout kills the process, which is fine, but
//   a self-imposed budget fails open on *our* schedule and keeps the failure a
//   silent no-op rather than a killed child.
//
// No embedding happens on this path — the profile is a scoped column read, not a
// query — so transformers is never imported and the model never loads. That is
// most of the 400ms budget saved: the ~150ms model load and ~100ms transformers
// import from `mem doctor` are both absent here.
//
// MEM_HOOK_DEBUG=1 sends the reason for a silent exit to stderr. Off by default,
// because the default has to be silence.

import { existsSync, readFileSync } from 'node:fs';

/** Self-imposed budget. Expected path is ~60ms; this is a failsafe, not a target. */
const BUDGET_MS = Number(process.env.MEM_HOOK_TIMEOUT_MS) || 1500;

/** Cap on waiting for a busy database. Nothing here is worth queueing for. */
const DB_TIMEOUT_MS = 500;

const debug = (why) => {
  if (process.env.MEM_HOOK_DEBUG) process.stderr.write(`mem session-start: ${why}\n`);
};

/** The only two exits. Both are status 0; one of them says something. */
function silent(why) {
  debug(why);
  process.exit(0);
}

function emit(additionalContext) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
    }),
  );
  process.exit(0);
}

/**
 * Hook input, best-effort. A payload we cannot parse is not a reason to stop:
 * the only field this hook needs is `cwd`, and process.cwd() is a correct answer
 * for it. Being strict here would mean one harness format change silently
 * disables recall forever, which is the failure nobody would ever notice.
 */
function readEvent() {
  try {
    if (process.stdin.isTTY) return {};
    return JSON.parse(readFileSync(0, 'utf8')) ?? {};
  } catch {
    debug('unparseable hook input, falling back to process.cwd()');
    return {};
  }
}

async function main() {
  const event = readEvent();

  // Every source injects, `compact` included: compaction is precisely when the
  // earlier copy of this block may have been summarised away.

  const { resolvePaths } = await import('../src/paths.mjs');
  const paths = resolvePaths();

  // Two filesystem checks before anything heavy, so the no-store case costs a
  // couple of stat calls and cannot trigger an install.
  if (!existsSync(paths.dbPath)) return silent(`no database at ${paths.dbPath}`);

  const { depsReady } = await import('../src/deps.mjs');
  if (!depsReady(paths)) return silent('dependencies not installed');

  const [{ openDb }, { coreProfile, renderProfile }, { resolveProjectKey }] = await Promise.all([
    import('../src/db.mjs'),
    import('../src/profile.mjs'),
    import('../src/scope.mjs'),
  ]);

  const cwd = typeof event.cwd === 'string' && event.cwd ? event.cwd : process.cwd();
  const { projectKey } = resolveProjectKey({ cwd });
  const now = Date.now();

  const conn = await openDb({
    paths,
    env: { ...process.env, MEM_NO_INSTALL: '1' },
    readonly: true,
    runMigrations: false,
    timeout: DB_TIMEOUT_MS,
  });

  let profile;
  try {
    profile = await coreProfile(conn, { projectKey, now });
  } finally {
    await conn.close().catch(() => {});
  }

  const block = renderProfile(profile.rows, { now, eligible: profile.stats.eligible });
  // Nothing pinned and no core global is the normal state of a young store, and
  // injecting a "you remember nothing" preamble would be worse than silence.
  if (!block) return silent(`nothing to inject (${profile.stats.eligible} eligible)`);

  debug(`injecting ${profile.stats.selected} of ${profile.stats.eligible}`);
  return emit(block);
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
