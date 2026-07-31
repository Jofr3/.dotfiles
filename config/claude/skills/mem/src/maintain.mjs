// Tier 1, as one run — PLAN's "Two tiers" and "Reversibility is non-negotiable".
//
// Everything the maintenance tier does already exists: decay is a query-time
// formula (5a.1), usage feedback is folded live by the Stop hook (5a.2), and the
// archiving ladder is prune.mjs (5a.3). What was missing is the thing that makes
// them safe to run unattended: ONE run_id over the lot, so a whole pass is a
// single reversible unit, and `mem undo <run_id>` to reverse it.
//
// WHY THIS APPLIES BY DEFAULT WHEN `mem prune` DOES NOT. prune dry-runs by
// default because its rules were being typed by hand against a real store and a
// rule nobody has read should not act. This is the other case: PLAN puts tier 1
// at "cheap enough to fire detached at SessionStart (never blocking) or daily",
// and a pass that dry-runs by default fires detached, prints nothing anybody
// reads, and changes nothing — the wiring would be theatre. What makes that
// acceptable is the three things below, not optimism:
//
//   Every action is invertible from its own memory_events row, all of them
//   stamped with this run's id, and `mem undo` reverses the run.
//   A JSONL export of the whole store is written before anything is applied,
//   last 10 kept, so even an undo that cannot fully invert (see the tombstone
//   note in `undoOne`) has a floor under it.
//   Nothing here deletes anything. The ladder's rung 4 is still only ever a
//   human typing `mem forget --hard`.
//
// THE THROTTLE IS PART OF THE CONTRACT, not a nicety. A SessionStart hook fires
// on startup, resume, clear and compact, so a busy day is a dozen firings; a full
// pass per firing would be a dozen audit-log bursts and a dozen exports of a
// store nobody changed. The interval lives in `meta` (the store is the unit of
// maintenance, not the machine) with a stamp file beside the database as the
// hook's cheap hint — see `readStamp`.
//
// Timestamps are epoch milliseconds throughout, matching write.mjs.

import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { checkpoint, openDb, pendingMigrations, readSchemaVersion } from './db.mjs';
import { strengthSql } from './decay.mjs';
import { EMB_DIM, EMB_MODEL, embedMany, vectorBlob } from './embed.mjs';
import { EVENT_ARCHIVED, EVENT_RESTORED } from './manage.mjs';
import { detectPairs } from './pairs.mjs';
import { resolvePaths } from './paths.mjs';
import { CONSOLIDATION_INVERTIBLE, undoConsolidation } from './resolve.mjs';
import {
  ARCHIVE_STRENGTH,
  DEAD_SCOPE_PREFIX,
  EVENT_SCOPE_FLAGGED,
  EVENT_SCOPE_REVIVED,
  EVENT_TOMBSTONED,
  applyPlan,
  plan as prunePlan,
} from './prune.mjs';
import { exportJsonl } from './transfer.mjs';
import { STATUSES, recordEvent } from './write.mjs';

/** Tags a run id with the tier that made it. Phase 5b's runs will not say `maint`. */
export const RUN_PREFIX = 'maint';

/**
 * How long a store is left alone between passes. Twenty hours rather than
 * twenty-four so a daily cadence survives sessions that start a little earlier
 * each morning instead of skipping a day.
 */
export const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;

/** A run that has held the lock this long is assumed dead, and the lock is stolen. */
export const LOCK_STALE_MS = 10 * 60 * 1000;

/**
 * Budgets for the pair-detection step, tighter than a hand-typed `mem pairs`.
 * PLAN puts tier 1 at "never blocking", and detection is the only quadratic thing
 * in the pass: measured, sixty changed rows against the 3345 eligible rows of the
 * 5k aged fixture is 0.95 s, and against a realistic 170-row store it is 20 ms.
 * Detached, that is affordable; two hundred rows (`mem pairs`'s own budget, 2.6 s
 * there) would not be. What the budget left out is reported, and the next pass
 * takes it — the watermark ordering is what makes that progress and not a re-read.
 */
export const MAINTAIN_CHANGED_LIMIT = 60;
export const MAINTAIN_PAIR_LIMIT = 20;

/** PLAN: "Automatic pre-run JSONL export to the data dir, last 10 kept." */
export const BACKUP_KEEP = 10;
export const BACKUP_DIR = 'backups';

/** Where the last run is recorded, and the hook's cheap copy of the same fact. */
export const META_LAST_RUN = 'maintenance:last';
export const STAMP_SUFFIX = '.maintain.stamp';
export const LOCK_SUFFIX = '.maintain.lock';

export const EVENT_MAINTAINED = 'maintained';
export const EVENT_UNDONE = 'undone';
export const EVENT_UNTOMBSTONED = 'untombstoned';

/**
 * Tier 2's run record, named here rather than in consolidate.mjs so that `undo`
 * can skip it without importing the module that imports this one.
 *
 * A run record is a statement THAT a run happened, not an action BY it — it is
 * what `mem undo --list` reads, and what makes a pass that judged twelve pairs
 * and changed nothing still visible a week later. Inverting one would mean
 * un-happening a run, which is not a thing.
 */
export const EVENT_CONSOLIDATION = 'consolidation';

/** The per-run summaries. Skipped by `undo`, listed by `listRuns`. */
export const RUN_RECORDS = [EVENT_MAINTAINED, EVENT_CONSOLIDATION];

/**
 * PLAN's tier-1 list, in order, and every entry is reported every run even when
 * it does nothing. Two of them do nothing *by design* and one is not built yet;
 * a run that quietly listed only the steps it performed would make those three
 * facts invisible, and "why did maintenance not fold in my usage feedback" is
 * exactly the question this list exists to answer.
 */
export const STEPS = ['decay', 'usage', 'prune', 'pairs', 'checkpoint'];

export class MaintainError extends Error {
  constructor(message, code = 'MEM_INVALID') {
    super(message);
    this.name = 'MaintainError';
    this.code = code;
  }
}

// ------------------------------------------------------------------ run ids --

const pad = (n, width = 2) => String(n).padStart(width, '0');

/**
 * A run id somebody can read, sort and retype: `maint-20260730T120455-3f9a2c`.
 *
 * UTC, not local time — a run at 02:30 on the night the clocks go back would
 * otherwise produce two ids that sort the wrong way round. The random tail is
 * what makes two runs in the same second distinct; the timestamp is what makes a
 * list of them useful without a join.
 */
export function newRunId(now = Date.now(), { prefix = RUN_PREFIX, suffix = null } = {}) {
  const d = new Date(now);
  const stamp =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return `${prefix}-${stamp}-${suffix ?? randomBytes(3).toString('hex')}`;
}

// ----------------------------------------------------------- the throttle --

const storeDir = (paths) => dirname(paths.dbPath);

/** Keyed on the database file, not the data directory: the store is the unit. */
export const stampPath = (paths) => `${paths.dbPath}${STAMP_SUFFIX}`;
export const lockPath = (paths) => `${paths.dbPath}${LOCK_SUFFIX}`;
export const backupDir = (paths) => join(storeDir(paths), BACKUP_DIR);

/**
 * The last run, from `meta`. This is the authority: it travels with the store
 * through export/import and cannot disagree with the rows it is about.
 */
export async function readLastRun(conn) {
  const row = await conn.get('SELECT v FROM meta WHERE k = ?', META_LAST_RUN);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.v);
    return typeof parsed?.at === 'number' && Number.isFinite(parsed.at) ? parsed : null;
  } catch {
    // An unreadable stamp means "no idea when the last run was", which has to
    // read as *due* rather than as recently done — the other way round would let
    // one corrupt value stop maintenance forever, silently.
    return null;
  }
}

export async function writeLastRun(conn, record) {
  await conn.run(
    'INSERT INTO meta(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
    META_LAST_RUN,
    JSON.stringify(record),
  );
  return record;
}

/**
 * The stamp file beside the database, written after a run and read by the
 * SessionStart hook.
 *
 * It is a *hint*, deliberately: the hook's whole job is to decide in a couple of
 * milliseconds whether to spawn anything at all, and opening the database (turso
 * import, migration check, a busy-timeout wait) to answer that would cost more
 * than the pass it is trying to avoid. `maintain()` itself re-checks `meta`, so
 * the worst a missing, stale or hand-deleted stamp can do is spawn a process
 * that declines to run. The store always wins.
 */
export function writeStamp(paths, record) {
  try {
    mkdirSync(storeDir(paths), { recursive: true });
    writeFileSync(stampPath(paths), `${JSON.stringify(record)}\n`);
    return true;
  } catch {
    return false;
  }
}

export function readStamp(paths) {
  try {
    const at = statSync(stampPath(paths)).mtimeMs;
    return { at, path: stampPath(paths) };
  } catch {
    return null;
  }
}

/**
 * Whether a pass is due. Split out and pure so the hook and the command share
 * one answer, and so the "no record at all" case — a store that has never been
 * maintained — is written down once as *due*.
 */
export function dueForRun({ lastAt = null, now = Date.now(), minIntervalMs = MIN_INTERVAL_MS } = {}) {
  if (lastAt === null || lastAt === undefined || !Number.isFinite(lastAt)) {
    return { due: true, why: 'never maintained', sinceMs: null, nextAt: null };
  }
  // A clock that ran backwards (restored machine, corrected timezone) leaves a
  // future stamp. Treating that as "not due for another decade" is the failure
  // that never recovers, so a stamp from the future counts as due.
  if (lastAt > now) return { due: true, why: 'last run is in the future', sinceMs: now - lastAt, nextAt: null };

  const sinceMs = now - lastAt;
  return sinceMs >= minIntervalMs
    ? { due: true, why: 'interval elapsed', sinceMs, nextAt: lastAt + minIntervalMs }
    : { due: false, why: 'ran recently', sinceMs, nextAt: lastAt + minIntervalMs };
}

/**
 * Cross-process mutex, mkdir as the atomic primitive (deps.mjs does the same for
 * npm). It does NOT wait: two sessions opening at once both spawn a run, and the
 * second one has nothing to add — queueing it would only mean a second identical
 * pass a few seconds later. A lock older than LOCK_STALE_MS is stolen, because a
 * killed run must not stop maintenance forever.
 */
export function acquireLock(paths, { now = Date.now(), staleMs = LOCK_STALE_MS } = {}) {
  const dir = lockPath(paths);
  try {
    mkdirSync(storeDir(paths), { recursive: true });
    mkdirSync(dir);
    return { path: dir, stolen: false };
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  let age = null;
  try {
    age = now - statSync(dir).mtimeMs;
  } catch {
    // Released between our mkdir and our stat — one retry is enough.
    try {
      mkdirSync(dir);
      return { path: dir, stolen: false };
    } catch {
      return null;
    }
  }

  if (age !== null && age > staleMs) {
    rmSync(dir, { recursive: true, force: true });
    try {
      mkdirSync(dir);
      return { path: dir, stolen: true, stoleAgeMs: age };
    } catch {
      return null;
    }
  }
  return null;
}

export function releaseLock(lock) {
  if (!lock) return;
  rmSync(lock.path, { recursive: true, force: true });
}

// ------------------------------------------------------------- the backup --

/**
 * PLAN: "Automatic pre-run JSONL export to the data dir, last 10 kept."
 *
 * The export carries no embeddings (transfer.mjs's decision — they are derivable
 * and 1.5 KB each), which is exactly why this is the floor under the one thing
 * `mem undo` cannot always invert: a tombstoned vector. Text plus `mem import`
 * re-embeds; text lost would not come back.
 *
 * Written only when the run actually has work. A daily no-op pass that rotated
 * ten backups away would leave the ten most recent files describing the ten
 * quietest days.
 */
export async function writeBackup(conn, { paths = resolvePaths(), runId, keep = BACKUP_KEEP } = {}) {
  const dir = backupDir(paths);
  mkdirSync(dir, { recursive: true });

  const { text, count } = await exportJsonl({ conn });
  const path = join(dir, `${runId}.jsonl`);
  writeFileSync(path, text);

  return { path, memories: count, bytes: Buffer.byteLength(text), pruned: pruneBackups(dir, keep) };
}

/** Keep the newest `keep` exports by mtime. Sorting by name would group 5b's runs apart. */
export function pruneBackups(dir, keep = BACKUP_KEEP) {
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.jsonl'));
  } catch {
    return [];
  }

  const dated = names
    .map((name) => {
      try {
        return { name, at: statSync(join(dir, name)).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.at - a.at);

  const dropped = [];
  for (const entry of dated.slice(keep)) {
    try {
      unlinkSync(join(dir, entry.name));
      dropped.push(entry.name);
    } catch {
      // A backup we cannot delete is not a reason to fail a maintenance run.
    }
  }
  return dropped;
}

/**
 * Export the store *before* a schema migration, not just before a ladder run.
 *
 * Opening this store writably migrates it — that is how every write path in this
 * plugin works, and it is why a v1 store keeps serving recall and migrates on its
 * next write rather than needing a flag day. But this write path is a background
 * process nobody asked to run, and migration v2 rebuilds the `memories` table. A
 * transactional rebuild that rolls back cleanly is still not something to do
 * unattended with no copy on disk beside it.
 *
 * Read-only, so it cannot itself migrate, and silent about a store that does not
 * exist yet — there is nothing to preserve and the writable open will create it.
 */
export async function backupIfMigrationPending(
  { paths = resolvePaths(), env = process.env, runId, keep = BACKUP_KEEP } = {},
) {
  if (!existsSync(paths.dbPath)) return null;

  let conn;
  try {
    conn = await openDb({ paths, env, readonly: true, runMigrations: false });
    const from = await readSchemaVersion(conn);
    const pending = pendingMigrations(from).map((m) => m.version);
    if (pending.length === 0) return null;

    const dir = backupDir(paths);
    mkdirSync(dir, { recursive: true });
    const { text, count } = await exportJsonl({ conn });
    const path = join(dir, `${runId}-pre-v${from}.jsonl`);
    writeFileSync(path, text);
    return { from, pending, path, memories: count, pruned: pruneBackups(dir, keep) };
  } catch {
    // An unreadable store is the writable open's problem to report, not this
    // function's to fail on.
    return null;
  } finally {
    if (conn) await conn.close().catch(() => {});
  }
}

// -------------------------------------------------------------- the steps --

/**
 * PLAN tier 1: "recompute strength from decay". There is nothing to recompute
 * and that is slice 5a.1's decision, not an omission: strength is a pure
 * function of columns the row already has plus the current time, so it is
 * computed in the query and is never stale between two runs. A stored column
 * would decay in steps at whatever hour this happened to fire.
 *
 * What is worth reporting is the number the ladder's first rung produces: how
 * many active rows have decayed under the archive threshold. That is the queue
 * the stale rule draws from, minus the terms that spare a row.
 */
export async function decayStep(conn, { now = Date.now(), strength = ARCHIVE_STRENGTH } = {}) {
  const row = await conn.get(
    `SELECT count(*) AS n FROM memories
      WHERE status = 'active' AND pinned = 0 AND ${strengthSql({ now })} < ?`,
    strength,
  );
  return {
    step: 'decay',
    changed: 0,
    weak_active: row?.n ?? 0,
    threshold: strength,
    note: 'strength is computed at query time (slice 5a.1) — nothing to recompute or store',
  };
}

/**
 * PLAN tier 1: "fold in usage feedback from the last session". Slice 5a.2 folds
 * it *live* — the Stop hook bumps `useful_count` and `last_used_at` in the turn
 * the echo happened, because that is the only moment the injected set and the
 * reply exist together. So there is nothing queued to fold here either.
 *
 * Reported as the two counters that moved since the previous run, which is the
 * evidence that the echo heuristic is alive at all: a store where this is
 * permanently 0 has a Stop hook that is not firing, and nothing else would say
 * so.
 */
export async function usageStep(conn, { since = null } = {}) {
  const row = await conn.get(
    `SELECT sum(CASE WHEN last_used_at IS NOT NULL AND last_used_at > ? THEN 1 ELSE 0 END) AS useful,
            sum(CASE WHEN last_injected_at IS NOT NULL AND last_injected_at > ? THEN 1 ELSE 0 END) AS injected
       FROM memories`,
    since ?? 0,
    since ?? 0,
  );
  return {
    step: 'usage',
    changed: 0,
    since,
    useful_since: row?.useful ?? 0,
    injected_since: row?.injected ?? 0,
    note: 'the Stop hook folds usage in live (slice 5a.2) — nothing is queued for a batch pass',
  };
}

/**
 * PLAN tier 1: "detect and record candidate pairs for tier 2" — slice 5b.1's
 * `detectPairs`, run here as a report and nothing more.
 *
 * IT LOOKS AND DOES NOT STAMP, which is the opposite of the rest of this file and
 * is forced by the watermark's own shape. `consolidated_at` hides every pair a row
 * is in, so advancing it is only honest once the pairs have actually been *judged*
 * — and judging needs an LLM, which tier 1 may never call. A maintenance pass that
 * stamped what it merely counted would silently empty tier 2's queue.
 *
 * Bounded harder than a hand-typed `mem pairs`: this fires detached at
 * SessionStart, where the budget is milliseconds nobody is watching, so the
 * changed side is capped low and the list is trimmed to what fits in a report. The
 * backlog count is the number worth having — it is what says whether
 * `mem consolidate` is being run often enough.
 */
export async function pairsStep(conn, { now = Date.now(), changedLimit = MAINTAIN_CHANGED_LIMIT, limit = MAINTAIN_PAIR_LIMIT, ...opts } = {}) {
  try {
    const found = await detectPairs(conn, { now, changedLimit, limit, ...opts });
    return {
      step: 'pairs',
      changed: 0,
      threshold: found.threshold,
      candidates: found.candidates,
      fresh: found.fresh,
      cached_skipped: found.cached_skipped,
      changed_rows: found.changed,
      truncated: found.truncated,
      worst: found.pairs.slice(0, 3).map((p) => ({ a: p.a, b: p.b, similarity: p.similarity })),
      ms: found.ms,
      note: 'candidates only — nothing is judged or stamped without `mem consolidate`',
    };
  } catch (err) {
    // A detector that fails must not take the archiving ladder's run down with
    // it: the pass has already applied its plan by the time this runs, and the
    // step's whole output is a number somebody might read tomorrow.
    return { step: 'pairs', changed: 0, error: err.message };
  }
}

/** PLAN tier 1: "WAL checkpoint". Cheap (6ms for an 80MB WAL, measured in 1.5). */
export async function checkpointStep(conn, { paths = resolvePaths(), apply = true } = {}) {
  const walBytes = () => {
    try {
      return statSync(`${paths.dbPath}-wal`).size;
    } catch {
      return null;
    }
  };

  if (!apply) {
    return { step: 'checkpoint', changed: 0, skipped: 'dry run', wal_before: walBytes() };
  }

  const before = walBytes();
  const t = performance.now();
  const result = await checkpoint(conn);
  return {
    step: 'checkpoint',
    changed: 0,
    ms: Math.round((performance.now() - t) * 10) / 10,
    wal_before: before,
    wal_after: walBytes(),
    result: result ?? null,
  };
}

// ---------------------------------------------------------------- the run --

const totalRows = (applied) =>
  applied === null
    ? 0
    : Object.values(applied.archived ?? {}).reduce((n, rows) => n + rows.length, 0);

/**
 * Does this plan want to change anything? Scope flags count: a run whose only
 * finding is "this project directory is gone" has to write the flag, or the
 * ninety-day grace period never starts.
 */
export function planHasWork(planned) {
  return (
    planned.counts.archived > 0 ||
    planned.counts.tombstoned > 0 ||
    planned.counts.flag > 0 ||
    planned.counts.revive > 0
  );
}

/**
 * One maintenance pass. Applies unless `dryRun`, under one `runId` that every
 * event it writes carries.
 *
 * `conn` is accepted so tests (and any future caller that already has a
 * transaction-free handle) can drive it without path resolution; the lock and
 * the stamp are keyed on `paths.dbPath` either way, so a caller supplying both
 * still gets the mutual exclusion.
 */
export async function maintain({
  paths = resolvePaths(),
  env = process.env,
  conn: given = null,
  now = Date.now(),
  dryRun = false,
  force = false,
  backup = true,
  runId = null,
  minIntervalMs = MIN_INTERVAL_MS,
  keepBackups = BACKUP_KEEP,
  ...opts
} = {}) {
  const t0 = performance.now();
  const apply = !dryRun;
  const id = runId ?? newRunId(now);

  // A dry run reads only, so it neither needs the lock nor may take it — the
  // whole point of `--dry-run` is that it is safe to type while a pass is going.
  const lock = apply ? acquireLock(paths, { now }) : null;
  if (apply && !lock) {
    return {
      run_id: id,
      now,
      dry_run: dryRun,
      skipped: 'locked',
      why: `another run holds ${lockPath(paths)}`,
      steps: [],
      counts: { archived: 0, tombstoned: 0, flagged: 0, revived: 0 },
      backup: null,
      elapsed_ms: Math.round((performance.now() - t0) * 10) / 10,
    };
  }

  // Before the writable open, because the writable open is what migrates.
  const migrationBackup =
    given || !apply || !backup ? null : await backupIfMigrationPending({ paths, env, runId: id, keep: keepBackups });

  const conn = given ?? (await openDb({ paths, env }));

  try {
    const last = await readLastRun(conn);
    const due = dueForRun({ lastAt: last?.at ?? null, now, minIntervalMs });

    // The throttle governs applying, not looking: `--dry-run` always reports.
    if (apply && !due.due && !force) {
      return {
        run_id: id,
        now,
        dry_run: dryRun,
        skipped: 'throttled',
        why: due.why,
        last_run: last,
        next_at: due.nextAt,
        steps: [],
        counts: { archived: 0, tombstoned: 0, flagged: 0, revived: 0 },
        backup: null,
        elapsed_ms: Math.round((performance.now() - t0) * 10) / 10,
      };
    }

    const steps = [];
    steps.push(await decayStep(conn, { now, strength: opts.strength }));
    steps.push(await usageStep(conn, { since: last?.at ?? null }));

    const planned = await prunePlan(conn, { now, ...opts });
    const work = planHasWork(planned);

    let backupReport = null;
    if (apply && work && backup) {
      backupReport = await writeBackup(conn, { paths, runId: id, keep: keepBackups });
    }

    const applied = apply && work ? await applyPlan(conn, planned, { runId: id }) : null;

    steps.push({
      step: 'prune',
      changed: applied === null ? 0 : totalRows(applied) + (applied.tombstoned?.length ?? 0),
      rules: planned.rules,
      counts: planned.counts,
      truncated: planned.truncated,
      applied: applied !== null,
      ...(apply && !work ? { skipped: 'nothing the ladder can reach' } : {}),
    });
    // After the ladder, deliberately: rows this pass has just archived are out of
    // the candidate set, so the backlog it reports is the one tier 2 would see.
    steps.push(await pairsStep(conn, { now }));
    steps.push(await checkpointStep(conn, { paths, apply }));

    const counts = {
      archived: applied === null ? planned.counts.archived : totalRows(applied),
      tombstoned: applied === null ? planned.counts.tombstoned : applied.tombstoned.length,
      flagged: applied === null ? planned.counts.flag : applied.scopes.flagged.length,
      revived: applied === null ? planned.counts.revive : applied.scopes.revived.length,
    };

    const report = {
      run_id: id,
      now,
      dry_run: dryRun,
      forced: force && !due.due,
      skipped: null,
      last_run: last,
      due,
      steps,
      plan: { archive: planned.archive, tombstone: planned.tombstone, scopes: planned.scopes },
      counts,
      backup: backupReport,
      migration_backup: migrationBackup,
      elapsed_ms: Math.round((performance.now() - t0) * 10) / 10,
    };

    if (apply) {
      // One run-level record, written even when the pass changed nothing: it is
      // what says the tier is alive, and it is what `mem undo --list` and
      // `mem stats`'s run count read. Row-level events are prune.mjs's.
      const record = {
        at: now,
        run_id: id,
        counts,
        elapsed_ms: report.elapsed_ms,
        min_interval_ms: minIntervalMs,
      };
      await recordEvent(conn, {
        memoryId: null,
        event: EVENT_MAINTAINED,
        at: now,
        detail: { ...record, backup: backupReport?.path ?? null, steps: steps.map((s) => s.step) },
      });
      await writeLastRun(conn, record);
      report.stamped = writeStamp(paths, record);
    }

    return report;
  } finally {
    if (!given) await conn.close().catch(() => {});
    releaseLock(lock);
  }
}

// ------------------------------------------------------------------- undo --

/** Parse a memory_events row's detail, tolerating a blob that is not JSON. */
function readEvent(row) {
  let detail = null;
  if (row.detail !== null && row.detail !== undefined) {
    try {
      detail = JSON.parse(row.detail);
    } catch {
      detail = { raw: row.detail };
    }
  }
  return { ...row, detail };
}

/**
 * SQL for "this event's run_id, or NULL".
 *
 * THE `CASE WHEN json_valid` IS NOT DEFENSIVE PADDING. Measured in this build:
 * `json_extract` over a `detail` that is not JSON does not return NULL, it
 * *throws* ("Parse error: malformed JSON") and takes the whole statement with it
 * — the same failure shape slice 5a.3 found in `vector_distance_cos(NULL, …)`.
 * One hand-edited or legacy event row would therefore make every run
 * unlistable and every undo impossible, which is precisely the state an undo
 * exists for. A bare `AND json_valid(detail)` conjunct is not enough either: the
 * planner is free to evaluate the other conjunct first, and a CASE is the only
 * form that guarantees the order.
 */
const RUN_ID_SQL = "(CASE WHEN json_valid(detail) THEN json_extract(detail, '$.run_id') END)";

/**
 * Every run the audit log knows about, newest first.
 *
 * Grouped in JS rather than with `group_concat(DISTINCT …)`: the event names per
 * run are wanted as a list, and this build's support for the DISTINCT form of
 * that aggregate is not something to bet a listing on.
 */
export async function listRuns(conn, { limit = 20 } = {}) {
  const rows = await conn.all(
    `SELECT ${RUN_ID_SQL} AS run_id, event,
            count(*) AS n, min(at) AS first_at, max(at) AS last_at
       FROM memory_events
      WHERE detail IS NOT NULL AND ${RUN_ID_SQL} IS NOT NULL
      GROUP BY run_id, event`,
  );

  const runs = new Map();
  for (const row of rows) {
    const id = String(row.run_id);
    if (!runs.has(id)) {
      runs.set(id, { run_id: id, events: 0, first_at: row.first_at, last_at: row.last_at, by_event: {} });
    }
    const run = runs.get(id);
    run.events += row.n;
    run.by_event[row.event] = row.n;
    run.first_at = Math.min(run.first_at, row.first_at);
    run.last_at = Math.max(run.last_at, row.last_at);
  }

  return [...runs.values()]
    .map((run) => ({
      ...run,
      // A run is "undone" once an undo has reported on it. Partially-undone runs
      // exist (a tombstone whose vector could not be remade), so this is a hint
      // for a listing, not the gate — `undoneEventIds` is the gate.
      undone: (run.by_event[EVENT_UNDONE] ?? 0) > 0,
    }))
    .sort((a, b) => b.last_at - a.last_at || (a.run_id < b.run_id ? 1 : -1))
    .slice(0, limit);
}

/**
 * Turn what somebody typed into a run id: `last`, an exact id, or an
 * unambiguous prefix. Ambiguity is an error naming the candidates — the ids are
 * timestamped, so guessing "probably the newest" would eventually undo the wrong
 * day's work.
 */
export async function resolveRunId(conn, ref, { limit = 200 } = {}) {
  const raw = String(ref ?? '').trim();
  if (raw === '') throw new MaintainError('Which run? Give a run id, or --last.', 'MEM_BAD_REF');

  const runs = await listRuns(conn, { limit });
  if (raw === 'last' || raw === '--last') {
    // "Last" means the newest run there is anything to undo *in*, not literally
    // the newest run: the tier writes a `maintained` record every pass, so a
    // store maintained daily is mostly runs that found nothing, and resolving to
    // one of those would answer "nothing to reverse" to somebody who has just
    // watched a pass archive fifty memories.
    const undoable =
      runs.find((r) => !r.undone && Object.keys(r.by_event).some((e) => INVERTIBLE.includes(e))) ??
      runs.find((r) => !r.undone) ??
      runs[0];
    if (!undoable) throw new MaintainError('No runs recorded in this store.', 'MEM_NOT_FOUND');
    return undoable.run_id;
  }

  if (runs.some((r) => r.run_id === raw)) return raw;

  const matches = runs.filter((r) => r.run_id.startsWith(raw));
  if (matches.length === 1) return matches[0].run_id;
  if (matches.length === 0) throw new MaintainError(`No run matching '${raw}'.`, 'MEM_NOT_FOUND');
  throw new MaintainError(
    `'${raw}' matches ${matches.length} runs:\n  ${matches.slice(0, 5).map((r) => r.run_id).join('\n  ')}`,
    'MEM_AMBIGUOUS_REF',
  );
}

/** The events one run wrote, newest first — the order an inversion has to take. */
export async function runEvents(conn, runId) {
  const rows = await conn.all(
    `SELECT id, memory_id, event, detail, at FROM memory_events
      WHERE detail IS NOT NULL AND ${RUN_ID_SQL} = ?
      ORDER BY id DESC`,
    runId,
  );
  return rows.map(readEvent);
}

/**
 * Event ids this run has already had inverted. Read from the `undone` summaries
 * rather than from the rows, because the rows have moved on: a restored memory
 * that later decayed and was archived again by a *different* run looks exactly
 * like one that was never restored.
 */
export async function undoneEventIds(conn, runId) {
  const rows = await conn.all(
    `SELECT detail FROM memory_events
      WHERE event = ? AND detail IS NOT NULL AND ${RUN_ID_SQL} = ?`,
    EVENT_UNDONE,
    runId,
  );
  const seen = new Set();
  for (const row of rows) {
    const ids = readEvent(row).detail?.undone_event_ids;
    if (Array.isArray(ids)) for (const id of ids) seen.add(Number(id));
  }
  return seen;
}

/** The ladder's own events — everything `applyPlan` in prune.mjs can write. */
export const TIER1_INVERTIBLE = [EVENT_ARCHIVED, EVENT_TOMBSTONED, EVENT_SCOPE_FLAGGED, EVENT_SCOPE_REVIVED];

/**
 * Every event `mem undo` knows how to reverse.
 *
 * Slice 5a.4 asked 5b to append to this rather than fork it, and this is that
 * append: one command reverses a maintenance run and a consolidation run, because
 * from the outside they are the same promise — a run id went in and the store
 * came back. The inversions themselves stay in the file that wrote the events
 * (`undoConsolidation`, resolve.mjs); what lives here is the dispatch.
 */
export const INVERTIBLE = [...TIER1_INVERTIBLE, ...CONSOLIDATION_INVERTIBLE];

/**
 * Invert one event. Returns `{ ok: true, … }` or `{ ok: false, why }`; nothing
 * here throws on a state it does not expect.
 *
 * THE PRECONDITION CHECKS ARE THE POINT. An undo runs against a store that has
 * kept living: the memory may have been restored by hand, purged, re-archived by
 * a later run, or pinned. So each inversion asserts the state it is about to
 * reverse and *skips* when the world has moved, rather than writing the old
 * value over whatever is there now. An undo that fights a later decision is
 * worse than one that reports it could not act.
 */
async function undoOne(conn, event, { now, runId, vectors }) {
  const detail = event.detail ?? {};

  if (event.event === EVENT_ARCHIVED) {
    const row = await conn.get('SELECT id, uid, status, text FROM memories WHERE id = ?', event.memory_id);
    if (!row) return { ok: false, why: 'memory has been purged' };
    if (row.status !== 'archived') return { ok: false, why: `status is now '${row.status}', not archived` };

    const previous = detail.previous?.status;
    const to = STATUSES.includes(previous) && previous !== 'archived' ? previous : 'active';
    await conn.run('UPDATE memories SET status = ? WHERE id = ?', to, row.id);
    // Same event name and shape a hand `mem forget --restore` writes, for the
    // reason prune.mjs archives with the hand shape: one history, readable by
    // one code path. updated_at stays put — decay reads it.
    const eventId = await recordEvent(conn, {
      memoryId: row.id,
      event: EVENT_RESTORED,
      at: now,
      detail: { via: 'undo', run_id: runId, undoes_event: event.id, previous: { status: 'archived' } },
    });
    return { ok: true, action: 'restored', id: row.id, uid: row.uid, text: row.text, to, eventId };
  }

  if (event.event === EVENT_TOMBSTONED) {
    const row = await conn.get(
      'SELECT id, uid, text, status, emb IS NULL AS empty FROM memories WHERE id = ?',
      event.memory_id,
    );
    if (!row) return { ok: false, why: 'memory has been purged' };
    if (!row.empty) return { ok: false, why: 'a vector is already there' };

    // THE ONE INVERSION THAT NEEDS SOMETHING THE LOG DOES NOT HOLD. The event
    // records which model made the dropped vector, not the vector — 1.5 KB per
    // row in an append-only table is the cost the tombstone rung exists to
    // avoid. So the vector is recomputed from the text, which is why the caller
    // embeds before opening the transaction and why an undo on a machine with no
    // model cached reports these as blocked instead of half-restoring.
    const vector = vectors.get(row.id);
    if (!vector) return { ok: false, why: 'no embedding available — run `mem warm`, then undo again' };

    await conn.run(
      'UPDATE memories SET emb = vector32(?), emb_model = ?, emb_dim = ? WHERE id = ?',
      vectorBlob(vector),
      EMB_MODEL,
      EMB_DIM,
      row.id,
    );
    const modelChanged = detail.previous?.emb_model !== undefined && detail.previous.emb_model !== EMB_MODEL;
    const eventId = await recordEvent(conn, {
      memoryId: row.id,
      event: EVENT_UNTOMBSTONED,
      at: now,
      detail: {
        via: 'undo',
        run_id: runId,
        undoes_event: event.id,
        emb_model: EMB_MODEL,
        emb_dim: EMB_DIM,
        // Recomputed, not restored: if the pinned model has changed since the
        // tombstone, this vector lives in a different space than the one that
        // was dropped. That is the right answer — the row rejoins the store as
        // it is now — but it is not the same number, so the log says so.
        recomputed: true,
        previous: detail.previous ?? null,
        model_changed: modelChanged,
      },
    });
    return {
      ok: true,
      action: 'untombstoned',
      id: row.id,
      uid: row.uid,
      text: row.text,
      model_changed: modelChanged,
      eventId,
    };
  }

  if (event.event === EVENT_SCOPE_FLAGGED) {
    const key = detail.project_key;
    if (typeof key !== 'string' || key === '') return { ok: false, why: 'event records no project_key' };
    const metaKey = `${DEAD_SCOPE_PREFIX}${key}`;
    const present = await conn.get('SELECT 1 AS found FROM meta WHERE k = ?', metaKey);
    if (!present) return { ok: false, why: 'flag is already gone' };

    await conn.run('DELETE FROM meta WHERE k = ?', metaKey);
    const eventId = await recordEvent(conn, {
      memoryId: null,
      event: EVENT_SCOPE_REVIVED,
      at: now,
      detail: { via: 'undo', run_id: runId, undoes_event: event.id, project_key: key },
    });
    // Deleting the flag restarts the grace clock rather than resuming it —
    // prune.mjs's rule, and the safe direction: a scope that dies again gets a
    // fresh ninety days.
    return { ok: true, action: 'unflagged', project_key: key, eventId };
  }

  if (event.event === EVENT_SCOPE_REVIVED) {
    const key = detail.project_key;
    if (typeof key !== 'string' || key === '') return { ok: false, why: 'event records no project_key' };
    const flaggedAt = Number(detail.flagged_at);
    if (!Number.isFinite(flaggedAt)) {
      // Re-flagging with *now* would hand the scope a fresh ninety days it never
      // had; re-flagging with a guess would shorten them. Neither is an undo.
      return { ok: false, why: 'event records no flagged_at — cannot restore the flag exactly' };
    }
    const metaKey = `${DEAD_SCOPE_PREFIX}${key}`;
    const present = await conn.get('SELECT 1 AS found FROM meta WHERE k = ?', metaKey);
    if (present) return { ok: false, why: 'scope is already flagged' };

    await conn.run(
      'INSERT INTO meta(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
      metaKey,
      JSON.stringify({ flagged_at: flaggedAt, why: detail.why ?? null, project_key: key }),
    );
    const eventId = await recordEvent(conn, {
      memoryId: null,
      event: EVENT_SCOPE_FLAGGED,
      at: now,
      detail: { via: 'undo', run_id: runId, undoes_event: event.id, project_key: key, flagged_at: flaggedAt },
    });
    return { ok: true, action: 'reflagged', project_key: key, flagged_at: flaggedAt, eventId };
  }

  // Tier 2's events, inverted by the file that wrote them. Delegated rather than
  // reimplemented here: a `demoted` row is resolve.mjs's decision about what a
  // refinement costs the general memory, and a second copy of that knowledge in
  // this file would be the copy that goes stale.
  if (CONSOLIDATION_INVERTIBLE.includes(event.event)) {
    return undoConsolidation(conn, event, { now, runId });
  }

  return { ok: false, why: `no inverse is implemented for '${event.event}'`, unsupported: true };
}

/**
 * Reverse a run. PLAN: "`mem undo <run_id>` reverses an entire consolidation
 * run" — and the maintenance tier writes the same shape, deliberately, so this
 * is one command and not two.
 *
 * One transaction for the lot. Retryable rather than all-or-nothing at the level
 * *above* that: what could not be inverted is reported and is not recorded as
 * undone, so a later `mem undo <same run>` picks up exactly the rest — which is
 * what makes "run `mem warm`, then undo again" a real instruction.
 *
 * IT DOES NOT TOUCH THE THROTTLE, and that is deliberate. The rows this restores
 * still match the rules that archived them, so the next pass will archive them
 * again; resetting the stamp here would make that happen at the next session
 * start instead of in twenty hours, which is the opposite of what somebody
 * typing `undo` wants. Pin or touch the memory to change the answer, and the
 * report says so.
 */
export async function undo(
  ref,
  { conn: given = null, paths = resolvePaths(), env = process.env, now = Date.now(), dryRun = false } = {},
) {
  const conn = given ?? (await openDb({ paths, env }));
  try {
    const runId = await resolveRunId(conn, ref);
    const events = await runEvents(conn, runId);
    const already = await undoneEventIds(conn, runId);

    // The run's own summary event is a record *of* the run, not an action by it.
    const candidates = events.filter(
      (e) => !RUN_RECORDS.includes(e.event) && e.event !== EVENT_UNDONE && !already.has(e.id),
    );
    const unsupported = candidates.filter((e) => !INVERTIBLE.includes(e.event));

    // Embed outside the transaction, for reembed.mjs's reason: the forward
    // passes are the slow part and holding a write lock across them blocks every
    // other mem process for the duration.
    const vectors = new Map();
    const needVector = candidates.filter((e) => e.event === EVENT_TOMBSTONED);
    let embedError = null;
    if (needVector.length > 0 && !dryRun) {
      const rows = await conn.all(
        `SELECT id, text FROM memories WHERE emb IS NULL AND id IN (${needVector.map(() => '?').join(', ')})`,
        ...needVector.map((e) => e.memory_id),
      );
      if (rows.length > 0) {
        try {
          const made = await embedMany(rows.map((r) => r.text), { paths, env, role: 'passage' });
          rows.forEach((row, i) => vectors.set(row.id, made[i]));
        } catch (err) {
          // Not fatal: the status inversions are still worth doing, and the
          // tombstones stay pending rather than being written off.
          embedError = err.message;
        }
      }
    }

    const report = {
      run_id: runId,
      now,
      dry_run: dryRun,
      events: candidates.length,
      already_undone: already.size,
      undone: [],
      blocked: [],
      unsupported: unsupported.map((e) => ({ id: e.id, event: e.event, memory_id: e.memory_id })),
      embed_error: embedError,
      complete: false,
    };

    if (dryRun) {
      report.would_undo = candidates.map((e) => ({
        id: e.id,
        event: e.event,
        memory_id: e.memory_id,
        invertible: INVERTIBLE.includes(e.event),
      }));
      report.complete = unsupported.length === 0;
      return report;
    }

    const work = conn.transactionAsync(async (tx) => {
      const undone = [];
      const blocked = [];
      for (const event of candidates) {
        const result = await undoOne(tx, event, { now, runId, vectors });
        if (result.ok) {
          const { ok, ...rest } = result;
          undone.push({ event_id: event.id, event: event.event, ...rest });
        } else {
          blocked.push({ event_id: event.id, event: event.event, memory_id: event.memory_id, why: result.why });
        }
      }

      if (undone.length > 0) {
        await recordEvent(tx, {
          memoryId: null,
          event: EVENT_UNDONE,
          at: now,
          detail: {
            run_id: runId,
            undone_event_ids: undone.map((u) => u.event_id),
            actions: undone.reduce((acc, u) => ({ ...acc, [u.action]: (acc[u.action] ?? 0) + 1 }), {}),
            blocked: blocked.length,
          },
        });
      }
      return { undone, blocked };
    });

    const { undone, blocked } = await work.immediate();
    report.undone = undone;
    report.blocked = blocked;
    report.complete = blocked.length === 0 && unsupported.length === 0;
    return report;
  } finally {
    if (!given) await conn.close().catch(() => {});
  }
}

/**
 * Read-only view of where maintenance stands, for `mem maintain --status` and
 * for anything that wants to know without running a pass.
 */
export async function maintenanceStatus({
  conn: given = null,
  paths = resolvePaths(),
  env = process.env,
  now = Date.now(),
  minIntervalMs = MIN_INTERVAL_MS,
} = {}) {
  const open = async () => {
    if (given) return given;
    if (!existsSync(paths.dbPath)) return null;
    return openDb({ paths, env, readonly: true, runMigrations: false });
  };

  const conn = await open();
  if (!conn) {
    return { store: paths.dbPath, exists: false, last_run: null, due: dueForRun({ now, minIntervalMs }), runs: [] };
  }

  try {
    const last = await readLastRun(conn);
    return {
      store: paths.dbPath,
      exists: true,
      last_run: last,
      stamp: readStamp(paths),
      due: dueForRun({ lastAt: last?.at ?? null, now, minIntervalMs }),
      min_interval_ms: minIntervalMs,
      runs: await listRuns(conn, { limit: 10 }),
      lock: existsSync(lockPath(paths)) ? lockPath(paths) : null,
    };
  } finally {
    if (!given) await conn.close().catch(() => {});
  }
}
