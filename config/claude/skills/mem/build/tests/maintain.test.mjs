// The maintenance run and its undo.
//
// Two things are being tested here and they pull in opposite directions. One is
// that a pass actually does something unattended — PLAN's phase-5a exit test is
// "active count drops and measured scan time falls proportionally". The other is
// that it can be taken back: "an LLM judge will get some calls wrong, and
// discovering it three weeks later with no undo is the failure mode that makes
// people abandon the system", and the maintenance tier has the same property
// without the judge, because a rule can be wrong too.
//
// So the load-bearing test in this file is not "maintain archives rows". It is
// `undo` restoring the store to a state snapshot taken before the run, row by
// row, status and vector-presence included. Everything else is a guard around
// that: the throttle (or a dozen session starts are a dozen passes), the lock
// (or two of them race), the precondition checks (or an undo fights a decision
// somebody took afterwards), and the json_valid guard (or one legacy event row
// makes every run unlistable, which is exactly when you need one).
//
// Nothing here downloads a model. The two tests that need real embeddings —
// undoing a tombstone recomputes the vector from the text — skip when the cache
// is cold, and the test for what happens *without* a model points the model dir
// at an empty directory rather than deleting anything.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { SCHEMA_VERSION, openDb, pendingMigrations, readSchemaVersion, withDb } from '../../src/db.mjs';
import { DAY_MS } from '../../src/decay.mjs';
import { EMB_DIM, EMB_MODEL, modelCached, resetExtractor } from '../../src/embed.mjs';
import {
  BACKUP_KEEP,
  EVENT_MAINTAINED,
  EVENT_UNDONE,
  EVENT_UNTOMBSTONED,
  INVERTIBLE,
  LOCK_STALE_MS,
  MIN_INTERVAL_MS,
  acquireLock,
  backupDir,
  dueForRun,
  listRuns,
  lockPath,
  maintain,
  maintenanceStatus,
  newRunId,
  planHasWork,
  pruneBackups,
  readLastRun,
  readStamp,
  releaseLock,
  resolveRunId,
  runEvents,
  stampPath,
  undo,
  undoneEventIds,
} from '../../src/maintain.mjs';
import { EVENT_ARCHIVED, EVENT_RESTORED } from '../../src/manage.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import {
  DEAD_SCOPE_PREFIX,
  EVENT_SCOPE_FLAGGED,
  EVENT_TOMBSTONED,
  TOMBSTONE_AFTER_DAYS,
  readFlags,
} from '../../src/prune.mjs';
import { scanTiming } from '../../src/stats.mjs';

const paths = resolvePaths();
const scratch = mkdtempSync(join(tmpdir(), 'mem-maintain-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const PROJECT = 'test/maintain';
const ENV = { ...process.env, MEM_PROJECT_KEY: PROJECT, MEM_NO_INSTALL: '1' };
const NOW = 1_750_000_000_000;
const DAY = DAY_MS;

let n = 0;
/**
 * One store per test, each in its own directory so backups, locks and stamps
 * cannot mix — all three are keyed on the database file's directory, which is why
 * this can leave `dataDir` pointing at the real one. It has to: deps resolve from
 * `dataDir`, and a wholly fake paths object would make every test try to npm
 * install turso into a temp directory. Same compromise manage.test.mjs and
 * prune.test.mjs make.
 */
function store() {
  const dir = join(scratch, `s${n++}`);
  mkdirSync(dir, { recursive: true });
  return { ...paths, dbPath: join(dir, 'mem.db') };
}

const cached = modelCached(paths);
const needsModel = { skip: cached ? false : "model not cached — run 'mem warm'" };

function fakeVector(seed) {
  const v = new Float32Array(EMB_DIM);
  for (let i = 0; i < EMB_DIM; i += 1) v[i] = Math.sin(seed * (i + 1));
  return Buffer.from(v.buffer);
}

const SEED_SQL = `
  INSERT INTO memories (uid, kind, scope, project_key, text, emb, emb_model, emb_dim,
                        salience, confidence, pinned, status,
                        created_at, updated_at, last_used_at, useful_count,
                        injected_count, last_injected_at, expires_at)
  VALUES (?, 'fact', ?, ?, ?, vector32(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** Seed rows through SQL, the way prune.test.mjs does — no model needed. */
async function seed(dbPaths, rows) {
  return withDb(async (conn) => {
    const ids = [];
    for (const [i, row] of rows.entries()) {
      const r = {
        uid: `uid-${i}`,
        scope: 'project',
        project_key: PROJECT,
        text: `memory number ${i} about deployments and lockfiles`,
        salience: 0.5,
        confidence: 0.5,
        pinned: 0,
        status: 'active',
        created_at: NOW - 200 * DAY,
        updated_at: NOW - 200 * DAY,
        last_used_at: null,
        useful_count: 0,
        injected_count: 0,
        last_injected_at: null,
        expires_at: null,
        emb: fakeVector(i + 1),
        archivedAt: null,
        ...row,
      };
      if (r.scope === 'global') r.project_key = null;
      const info = await conn.run(
        SEED_SQL,
        r.uid, r.scope, r.project_key, r.text, r.emb, EMB_MODEL, EMB_DIM,
        r.salience, r.confidence, r.pinned, r.status,
        r.created_at, r.updated_at, r.last_used_at, r.useful_count,
        r.injected_count, r.last_injected_at, r.expires_at,
      );
      const id = info.lastInsertRowid;
      if (r.archivedAt !== null) {
        await conn.run(
          'INSERT INTO memory_events (memory_id, event, detail, at) VALUES (?, ?, ?, ?)',
          id, EVENT_ARCHIVED, JSON.stringify({ previous: { status: 'active' } }), r.archivedAt,
        );
      }
      ids.push(id);
    }
    return ids;
  }, { paths: dbPaths, env: ENV });
}

const run = (dbPaths, fn) => withDb(fn, { paths: dbPaths, env: ENV });

/**
 * The state an undo has to restore. Status and vector-presence per row, because
 * those are the only two things the ladder changes — plus the dead-scope flags,
 * which live in `meta` and would otherwise be invisible to a row-wise snapshot.
 */
async function snapshot(dbPaths) {
  return run(dbPaths, async (conn) => {
    const rows = await conn.all(
      'SELECT id, status, pinned, useful_count, updated_at, emb IS NULL AS empty FROM memories ORDER BY id',
    );
    const flags = await readFlags(conn);
    return { rows, flags: [...flags.keys()].sort() };
  });
}

// A row the stale rule reaches: 200 days old, never used, never useful.
const STALE = {};
// The two shapes PLAN says must never be touched automatically.
const PINNED = { pinned: 1 };
const USEFUL = { useful_count: 3, last_used_at: NOW - 2 * DAY };

const LADDER_ROWS = [
  { uid: 'stale-a', ...STALE },
  { uid: 'stale-b', ...STALE },
  { uid: 'pinned', ...PINNED },
  { uid: 'useful', ...USEFUL },
  { uid: 'young', created_at: NOW - 3 * DAY, updated_at: NOW - 3 * DAY },
  { uid: 'expired', expires_at: NOW - DAY, created_at: NOW - 10 * DAY, updated_at: NOW - 10 * DAY,
    useful_count: 2, last_used_at: NOW - DAY },
  { uid: 'tombstone-me', status: 'archived', archivedAt: NOW - (TOMBSTONE_AFTER_DAYS + 30) * DAY },
  { uid: 'archived-recently', status: 'archived', archivedAt: NOW - 5 * DAY },
  { uid: 'staged', status: 'staged' },
];

describe('run ids', () => {
  it('are readable, sortable and unique', () => {
    const a = newRunId(NOW);
    const b = newRunId(NOW);
    assert.match(a, /^maint-\d{8}T\d{6}-[0-9a-f]{6}$/);
    assert.notEqual(a, b, 'two runs in the same second must not collide');
    assert.ok(newRunId(NOW) < newRunId(NOW + 60_000), 'later runs must sort later');
  });

  it('take a caller-supplied prefix, so 5b can tag its own runs', () => {
    assert.match(newRunId(NOW, { prefix: 'cons' }), /^cons-/);
  });
});

describe('the throttle', () => {
  it('treats a store that has never been maintained as due', () => {
    assert.equal(dueForRun({ now: NOW }).due, true);
    assert.equal(dueForRun({ lastAt: null, now: NOW }).why, 'never maintained');
  });

  it('is due once the interval has elapsed and not before', () => {
    assert.equal(dueForRun({ lastAt: NOW - MIN_INTERVAL_MS - 1, now: NOW }).due, true);
    assert.equal(dueForRun({ lastAt: NOW - MIN_INTERVAL_MS + 1000, now: NOW }).due, false);
    assert.equal(dueForRun({ lastAt: NOW - MIN_INTERVAL_MS + 1000, now: NOW }).nextAt,
      NOW - MIN_INTERVAL_MS + 1000 + MIN_INTERVAL_MS);
  });

  it('treats a stamp from the future as due rather than as decades early', () => {
    // A restored machine or a corrected timezone leaves one, and the other
    // reading would stop maintenance permanently and silently.
    assert.equal(dueForRun({ lastAt: NOW + 10 * DAY, now: NOW }).due, true);
  });

  it('applies once, then declines until forced', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);

    const first = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(first.skipped, null);
    assert.ok(first.counts.archived > 0);

    const second = await maintain({ paths: dbPaths, env: ENV, now: NOW + 60_000 });
    assert.equal(second.skipped, 'throttled');
    assert.equal(second.counts.archived, 0);
    assert.equal(second.last_run.run_id, first.run_id);

    const forced = await maintain({ paths: dbPaths, env: ENV, now: NOW + 60_000, force: true });
    assert.equal(forced.skipped, null);
    assert.equal(forced.forced, true);
  });

  it('never throttles a dry run — looking is always allowed', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    await maintain({ paths: dbPaths, env: ENV, now: NOW });

    const dry = await maintain({ paths: dbPaths, env: ENV, now: NOW + 60_000, dryRun: true });
    assert.equal(dry.skipped, null);
    assert.equal(dry.steps.length, 5);
  });

  it('records the interval in the store, not on the machine', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    const last = await run(dbPaths, (conn) => readLastRun(conn));
    assert.equal(last.run_id, report.run_id);
    assert.equal(last.at, NOW);
    // The stamp beside the database is a hint for the hook, written from the
    // same record. Its mtime is what the hook reads, so it is `now`-ish rather
    // than the frozen fixture clock.
    assert.ok(readStamp(dbPaths).at > 0);
    assert.equal(JSON.parse(readFileSync(stampPath(dbPaths), 'utf8')).run_id, report.run_id);
  });

  it('runs again when the meta record is unreadable rather than never', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    await maintain({ paths: dbPaths, env: ENV, now: NOW });
    await run(dbPaths, (conn) => conn.run("UPDATE meta SET v = 'not json' WHERE k = 'maintenance:last'"));
    const again = await maintain({ paths: dbPaths, env: ENV, now: NOW + 60_000 });
    assert.equal(again.skipped, null, 'a corrupt stamp must not disable maintenance forever');
  });
});

describe('the lock', () => {
  it('is exclusive, and a dry run neither takes nor needs it', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);

    const held = acquireLock(dbPaths, { now: NOW });
    assert.ok(held);
    assert.equal(acquireLock(dbPaths, { now: NOW }), null);

    const blocked = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(blocked.skipped, 'locked');
    assert.equal(blocked.counts.archived, 0);

    const dry = await maintain({ paths: dbPaths, env: ENV, now: NOW, dryRun: true });
    assert.equal(dry.skipped, null, 'a dry run must be safe to type while a pass is running');

    releaseLock(held);
    const after = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(after.skipped, null);
  });

  it('steals a lock left behind by a killed run', () => {
    const dbPaths = store();
    const held = acquireLock(dbPaths);
    assert.ok(held);
    // Real clock, not the fixture's: the age of a lock is the age of a directory
    // on disk, and mkdir stamps it with the wall clock whatever `now` says.
    const stolen = acquireLock(dbPaths, { now: Date.now() + LOCK_STALE_MS + 1000 });
    assert.equal(stolen?.stolen, true);
    releaseLock(stolen);
    assert.equal(existsSync(lockPath(dbPaths)), false);
  });

  it('releases the lock even when the run throws', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    // `rules` has to be iterable; passing a number throws inside the plan, which
    // is after the lock is taken and before anything is applied.
    await assert.rejects(() => maintain({ paths: dbPaths, env: ENV, now: NOW, rules: 7 }));
    assert.equal(existsSync(lockPath(dbPaths)), false);
  });
});

describe('one run, one run_id', () => {
  it('stamps every event it writes, across all three rungs', async () => {
    const dbPaths = store();
    // A dead scope needs a path-shaped project_key whose parent still exists.
    const gone = join(dbPaths.dataDir, 'gone-repo');
    await seed(dbPaths, [
      ...LADDER_ROWS,
      { uid: 'dead-scope', project_key: gone, useful_count: 5, last_used_at: NOW - DAY,
        salience: 1, confidence: 1 },
    ]);

    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(report.counts.flagged, 1, 'the first pass flags a dead scope, it does not archive it');

    const events = await run(dbPaths, (conn) => runEvents(conn, report.run_id));
    const names = new Set(events.map((e) => e.event));
    assert.ok(names.has(EVENT_ARCHIVED));
    assert.ok(names.has(EVENT_TOMBSTONED));
    assert.ok(names.has(EVENT_SCOPE_FLAGGED));
    assert.ok(names.has(EVENT_MAINTAINED));
    for (const event of events) {
      assert.equal(event.detail.run_id, report.run_id, `${event.event} carries no run_id`);
    }

    // And nothing else in the log claims to be part of it.
    const strays = await run(dbPaths, (conn) =>
      conn.get('SELECT count(*) AS n FROM memory_events WHERE detail IS NULL'));
    assert.equal(strays.n, 0);
  });

  it('reports all five of PLAN\'s tier-1 steps every run, including the ones that do nothing', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });

    assert.deepEqual(report.steps.map((s) => s.step), ['decay', 'usage', 'prune', 'pairs', 'checkpoint']);
    const byName = Object.fromEntries(report.steps.map((s) => [s.step, s]));
    // Two are deliberate no-ops and one only looks; each says so in its own
    // words, because "maintenance did not fold in my usage feedback" is the
    // question this list exists to answer.
    assert.match(byName.decay.note, /computed at query time/);
    assert.match(byName.usage.note, /Stop hook/);
    // Slice 5b.1 detects pairs here but must never stamp or judge them — see
    // pairs.test.mjs for why that would empty tier 2's queue.
    assert.match(byName.pairs.note, /nothing is judged or stamped/);
    assert.equal(byName.pairs.threshold, 0.85);
    assert.equal(byName.decay.changed, 0);
    assert.equal(byName.usage.changed, 0);
    assert.ok(byName.decay.weak_active >= 2, 'the decay step counts what has decayed under the threshold');
    assert.ok(byName.checkpoint.ms >= 0);
  });

  it('skips the checkpoint on a dry run and changes nothing at all', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const before = await snapshot(dbPaths);

    const dry = await maintain({ paths: dbPaths, env: ENV, now: NOW, dryRun: true });
    assert.ok(dry.counts.archived > 0, 'a dry run still reports what it would do');
    assert.match(dry.steps.at(-1).skipped, /dry run/);
    assert.equal(dry.backup, null);

    assert.deepEqual(await snapshot(dbPaths), before);
    const events = await run(dbPaths, (conn) =>
      conn.get('SELECT count(*) AS n FROM memory_events WHERE event = ?', EVENT_MAINTAINED));
    assert.equal(events.n, 0, 'a dry run must not record itself as a run');
  });

  it('spares what PLAN exempts: pinned, recently useful, young', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, LADDER_ROWS);
    const byUid = Object.fromEntries(LADDER_ROWS.map((r, i) => [r.uid, ids[i]]));

    await maintain({ paths: dbPaths, env: ENV, now: NOW });

    const rows = await run(dbPaths, (conn) =>
      conn.all('SELECT id, uid, status, emb IS NULL AS empty FROM memories ORDER BY id'));
    const status = Object.fromEntries(rows.map((r) => [r.uid, r.status]));

    assert.equal(status.pinned, 'active', 'a pinned memory is exempt from every automatic action');
    assert.equal(status.useful, 'active', 'a memory that proved useful once is out of the stale rule');
    assert.equal(status.young, 'active');
    assert.equal(status.staged, 'staged', 'staging is a review question, not a maintenance one');
    assert.equal(status['stale-a'], 'archived');
    assert.equal(status.expired, 'archived');

    const empty = new Set(rows.filter((r) => r.empty).map((r) => r.uid));
    assert.deepEqual([...empty], ['tombstone-me']);
    assert.equal(byUid.pinned > 0, true);
  });

  it('drops the active count and leaves the every-row scan covering everything', async () => {
    // PLAN's phase-5a exit test in miniature: "verify active count drops and
    // measured scan time falls proportionally". Row counts, not milliseconds —
    // the wall-clock version of this is measured by hand on the 5k fixture,
    // because a timing assertion on a box running twenty test files in parallel
    // measures the box.
    const dbPaths = store();
    const rows = [];
    for (let i = 0; i < 120; i += 1) {
      rows.push(i % 6 === 0 ? { uid: `keep-${i}`, ...USEFUL } : { uid: `stale-${i}`, ...STALE });
    }
    await seed(dbPaths, rows);

    const before = await run(dbPaths, (conn) => scanTiming(conn, { now: NOW, projectKey: PROJECT }));
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    const after = await run(dbPaths, (conn) => scanTiming(conn, { now: NOW, projectKey: PROJECT }));

    assert.equal(before.active_rows, 120);
    assert.equal(after.active_rows, 120 - report.counts.archived);
    assert.ok(after.active_rows <= 21, `expected ~20 survivors, got ${after.active_rows}`);
    // Nothing was deleted: the every-row scan still covers all 120 rows, since
    // nothing has been archived long enough to be tombstoned on the same pass.
    assert.equal(after.all_rows, before.all_rows);
    console.log(
      `  scan: active ${before.active_ms} ms over ${before.active_rows} rows` +
        ` → ${after.active_ms} ms over ${after.active_rows}   (every-row ${after.all_ms} ms over ${after.all_rows})`,
    );
  });

  it('does nothing, loudly, on a store the ladder cannot reach', async () => {
    const dbPaths = store();
    await seed(dbPaths, [{ uid: 'pinned', ...PINNED }, { uid: 'useful', ...USEFUL }]);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });

    assert.equal(planHasWork({ counts: report.steps[2].counts }), false);
    assert.deepEqual(report.counts, { archived: 0, tombstoned: 0, flagged: 0, revived: 0 });
    assert.equal(report.backup, null, 'a no-op pass must not rotate a backup away');
    // It still records that the tier ran: that record is the throttle, and it is
    // the only evidence that maintenance is alive on a healthy store.
    const events = await run(dbPaths, (conn) =>
      conn.get('SELECT count(*) AS n FROM memory_events WHERE event = ?', EVENT_MAINTAINED));
    assert.equal(events.n, 1);
  });
});

describe('the pre-run backup', () => {
  it('holds the store as it was before the run', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });

    assert.ok(report.backup, 'a run with work must export first');
    assert.equal(report.backup.memories, LADDER_ROWS.length);
    const lines = readFileSync(report.backup.path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const stale = lines.find((r) => r.uid === 'stale-a');
    assert.equal(stale.status, 'active', 'the export must predate the archiving');
    // No embeddings in the file — that is transfer.mjs's decision, and it is why
    // this is a floor under the one thing undo cannot always invert.
    assert.equal(Object.hasOwn(stale, 'emb'), false);
  });

  it('keeps the newest ten and drops the rest', () => {
    const dbPaths = store();
    const dir = backupDir(dbPaths);
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 14; i += 1) {
      const file = join(dir, `maint-2026073${i % 10}T00000${i % 10}-00000${i}.jsonl`);
      writeFileSync(file, '{}\n');
      const when = new Date(NOW - (14 - i) * 60_000);
      utimesSync(file, when, when);
    }
    const dropped = pruneBackups(dir, BACKUP_KEEP);
    assert.equal(dropped.length, 4);
    assert.equal(readdirSync(dir).length, BACKUP_KEEP);
    // The four oldest by mtime, not the four first by name.
    assert.ok(dropped.every((name) => /-00000[0-3]\.jsonl$/.test(name)), dropped.join(' '));
  });

  it('can be turned off', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW, backup: false });
    assert.equal(report.backup, null);
    assert.equal(existsSync(backupDir(dbPaths)), false);
  });

  it('copies the store before migrating a schema it is about to rebuild', async () => {
    // Opening writably is what migrates, and this write path is a background
    // process nobody asked to run. Migration v2 rebuilds the memories table.
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    await run(dbPaths, (conn) => conn.run("UPDATE meta SET v = '1' WHERE k = 'schema_version'"));

    // Read the version through a READONLY handle: withDb opens writably and
    // would migrate the fixture back before the assertion could see it — which
    // is the same reason maintain has to take its copy before opening.
    const version = async () => {
      const conn = await openDb({ paths: dbPaths, env: ENV, readonly: true, runMigrations: false });
      try {
        return await readSchemaVersion(conn);
      } finally {
        await conn.close();
      }
    };
    assert.ok(pendingMigrations(await version()).length > 0, 'the fixture must actually look un-migrated');

    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    assert.ok(report.migration_backup, 'no copy was taken before the rebuild');
    assert.equal(report.migration_backup.from, 1);
    assert.match(report.migration_backup.path, /-pre-v1\.jsonl$/);
    assert.equal(
      readFileSync(report.migration_backup.path, 'utf8').trim().split('\n').length,
      LADDER_ROWS.length,
    );
    // And it migrated: v2 is what makes rung 3 possible at all (emb NOT NULL).
    assert.equal(await version(), SCHEMA_VERSION);
    assert.equal(report.counts.tombstoned, 1);
  });

  it('takes no migration copy when there is nothing to migrate', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(report.migration_backup, null);
  });
});

describe('undo', () => {
  it('restores the store exactly, row by row', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const before = await snapshot(dbPaths);

    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    const changed = await snapshot(dbPaths);
    assert.notDeepEqual(changed, before, 'the run must have changed something to be worth undoing');

    const undone = await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 1000 });
    assert.equal(undone.blocked.length, 0, JSON.stringify(undone.blocked));
    assert.equal(undone.unsupported.length, 0);

    const restored = await snapshot(dbPaths);
    if (cached) {
      assert.deepEqual(restored, before);
    } else {
      // Without a model the vector cannot be recomputed; statuses still are.
      assert.deepEqual(restored.rows.map((r) => [r.id, r.status]), before.rows.map((r) => [r.id, r.status]));
    }
    assert.equal(undone.complete, cached);
  });

  it('is idempotent, and picks up only what is left on a second attempt', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });

    const first = await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 1000 });
    assert.ok(first.undone.length > 0);

    const second = await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 2000 });
    assert.equal(second.undone.length, 0);
    assert.equal(second.already_undone, first.undone.length);

    const marks = await run(dbPaths, (conn) => undoneEventIds(conn, report.run_id));
    assert.equal(marks.size, first.undone.length);
    // One summary event per undo that did something, not one per row.
    const summaries = await run(dbPaths, (conn) =>
      conn.get('SELECT count(*) AS n FROM memory_events WHERE event = ?', EVENT_UNDONE));
    assert.equal(summaries.n, 1);
  });

  it('writes the same restore event a hand `forget --restore` writes', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 1000 });

    const events = await run(dbPaths, (conn) =>
      conn.all('SELECT memory_id, detail FROM memory_events WHERE event = ?', EVENT_RESTORED));
    assert.ok(events.length > 0);
    for (const event of events) {
      const detail = JSON.parse(event.detail);
      assert.equal(detail.via, 'undo');
      assert.equal(detail.previous.status, 'archived');
      assert.equal(detail.run_id, report.run_id);
      assert.ok(Number.isInteger(detail.undoes_event));
    }
  });

  it('refuses to fight a decision taken after the run', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, LADDER_ROWS);
    const staleId = ids[LADDER_ROWS.findIndex((r) => r.uid === 'stale-a')];
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });

    // Somebody purged one archived row and pinned-and-restored another by hand.
    await run(dbPaths, async (conn) => {
      await conn.run("UPDATE memories SET status = 'active' WHERE id = ?", staleId);
      await conn.run('DELETE FROM memory_events WHERE memory_id = ?', ids[1]);
      await conn.run('DELETE FROM memories WHERE id = ?', ids[1]);
    });

    const undone = await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 1000 });
    const reasons = undone.blocked.map((b) => b.why).join(' | ');
    assert.match(reasons, /status is now 'active'/);
    assert.equal(undone.complete, false, 'a partial undo must not report success');

    // And the row somebody restored by hand is left exactly as they left it.
    const row = await run(dbPaths, (conn) => conn.get('SELECT status FROM memories WHERE id = ?', staleId));
    assert.equal(row.status, 'active');
  });

  it('reverses a dead-scope flag, restarting rather than resuming the grace clock', async () => {
    const dbPaths = store();
    const gone = join(dbPaths.dataDir, 'gone-repo');
    await seed(dbPaths, [
      { uid: 'live', ...USEFUL },
      { uid: 'dead', project_key: gone, ...USEFUL },
    ]);

    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(report.counts.flagged, 1);
    assert.deepEqual((await snapshot(dbPaths)).flags, [gone]);

    const undone = await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 1000 });
    assert.deepEqual((await snapshot(dbPaths)).flags, []);
    assert.ok(undone.undone.some((u) => u.action === 'unflagged'));

    // Flagging again starts the ninety days from scratch, which is prune.mjs's
    // rule and the safe direction.
    const later = await maintain({ paths: dbPaths, env: ENV, now: NOW + 2 * DAY, force: true });
    assert.equal(later.counts.flagged, 1);
    const flags = await run(dbPaths, (conn) => readFlags(conn));
    assert.equal(flags.get(gone).flaggedAt, NOW + 2 * DAY);
  });

  it('restores a flag the run revived, with its original date', async () => {
    const dbPaths = store();
    const flaggedAt = NOW - 10 * DAY;
    await seed(dbPaths, [{ uid: 'live', ...USEFUL }]);
    await run(dbPaths, (conn) =>
      conn.run('INSERT INTO meta(k, v) VALUES (?, ?)', `${DEAD_SCOPE_PREFIX}${PROJECT}`,
        JSON.stringify({ flagged_at: flaggedAt, why: 'test', project_key: PROJECT })));

    // PROJECT is not path-shaped, so it is 'unknown' rather than dead — a flag on
    // it is stale and the run revives it.
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(report.counts.revived, 1);
    assert.deepEqual((await snapshot(dbPaths)).flags, []);

    await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 1000 });
    const flags = await run(dbPaths, (conn) => readFlags(conn));
    assert.equal(flags.get(PROJECT).flaggedAt, flaggedAt, 'the grace clock must come back where it was');
  });

  it('recomputes a tombstoned vector from the text', needsModel, async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(report.counts.tombstoned, 1);

    const undone = await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 1000 });
    assert.ok(undone.undone.some((u) => u.action === 'untombstoned'));

    const rows = await run(dbPaths, (conn) =>
      conn.all("SELECT uid, status, emb IS NULL AS empty, emb_model FROM memories WHERE uid = 'tombstone-me'"));
    assert.equal(rows[0].empty, 0, 'the vector must be back');
    assert.equal(rows[0].emb_model, EMB_MODEL);
    // The row stays archived: dropping the vector is all rung 3 did, so putting
    // it back is all its inverse does.
    assert.equal(rows[0].status, 'archived');

    const events = await run(dbPaths, (conn) =>
      conn.all('SELECT detail FROM memory_events WHERE event = ?', EVENT_UNTOMBSTONED));
    assert.equal(JSON.parse(events[0].detail).recomputed, true);
  });

  it('blocks the tombstone half rather than half-restoring it with no model', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });

    // An empty model directory plus MEM_NO_INSTALL is a machine that has never
    // run `mem warm`; nothing real is removed to test this. resetExtractor is
    // needed because loadExtractor memoises per process — another test in this
    // file may already have loaded the real model, and without the reset this
    // would quietly pass by using it.
    const modelsDir = join(scratch, 'no-models');
    mkdirSync(modelsDir, { recursive: true });
    resetExtractor();
    let undone;
    try {
      undone = await undo(report.run_id, {
        paths: { ...dbPaths, modelsDir },
        env: { ...ENV, MEM_NO_INSTALL: '1' },
        now: NOW + 1000,
      });
    } finally {
      // A failed load is not memoised, but leave nothing half-configured.
      resetExtractor();
    }

    assert.ok(undone.embed_error, 'the failure must be reported, not swallowed');
    const blockedTombstones = undone.blocked.filter((b) => b.event === EVENT_TOMBSTONED);
    assert.equal(blockedTombstones.length, 1);
    assert.match(blockedTombstones[0].why, /mem warm/);
    assert.equal(undone.complete, false);
    // The statuses still came back — a missing model must not cost the rest.
    assert.ok(undone.undone.some((u) => u.action === 'restored'));

    // And the tombstone is still pending, so a retry with a model finishes it.
    const left = await run(dbPaths, (conn) => undoneEventIds(conn, report.run_id));
    const tombstoneEvent = (await run(dbPaths, (conn) => runEvents(conn, report.run_id)))
      .find((e) => e.event === EVENT_TOMBSTONED);
    assert.equal(left.has(tombstoneEvent.id), false);
  });

  it('previews without touching anything', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    const before = await snapshot(dbPaths);

    const preview = await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 1000, dryRun: true });
    assert.ok(preview.would_undo.length > 0);
    assert.ok(preview.would_undo.every((e) => e.invertible));
    assert.deepEqual(await snapshot(dbPaths), before);
  });

  it('reports an event it cannot invert instead of claiming success', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });

    // What phase 5b will write, before this file knows how to reverse it.
    await run(dbPaths, (conn) =>
      conn.run('INSERT INTO memory_events (memory_id, event, detail, at) VALUES (?, ?, ?, ?)',
        ids[0], 'superseded', JSON.stringify({ run_id: report.run_id }), NOW));

    const undone = await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 1000 });
    assert.deepEqual(undone.unsupported.map((e) => e.event), ['superseded']);
    assert.equal(undone.complete, false);
    assert.ok(undone.undone.length > 0, 'the rest of the run is still reversed');
  });
});

describe('finding a run', () => {
  it('resolves an exact id, a unique prefix, and refuses an ambiguous one', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const first = await maintain({ paths: dbPaths, env: ENV, now: NOW, runId: 'maint-20260101T000000-aaaaaa' });
    await maintain({ paths: dbPaths, env: ENV, now: NOW + DAY, runId: 'maint-20260102T000000-bbbbbb', force: true });

    await run(dbPaths, async (conn) => {
      assert.equal(await resolveRunId(conn, first.run_id), first.run_id);
      assert.equal(await resolveRunId(conn, 'maint-20260101'), first.run_id);
      await assert.rejects(() => resolveRunId(conn, 'maint-2026'), /matches 2 runs/);
      await assert.rejects(() => resolveRunId(conn, 'nope'), /No run matching/);
    });
  });

  it('reads --last as the newest run there is something to undo in', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const real = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    // A later pass that found nothing to do still records itself; --last must
    // not resolve to it and answer "nothing to reverse".
    const empty = await maintain({ paths: dbPaths, env: ENV, now: NOW + DAY, force: true });
    assert.equal(empty.counts.archived, 0);

    await run(dbPaths, async (conn) => {
      assert.equal(await resolveRunId(conn, 'last'), real.run_id);
    });
  });

  it('lists runs with what each one did', async () => {
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 1000 });

    const runs = await run(dbPaths, (conn) => listRuns(conn));
    assert.equal(runs.length, 1);
    assert.equal(runs[0].run_id, report.run_id);
    assert.ok(runs[0].by_event[EVENT_ARCHIVED] > 0);
    assert.equal(runs[0].undone, true);
    assert.ok(INVERTIBLE.includes(EVENT_ARCHIVED));
  });

  it('survives an event whose detail is not JSON', async () => {
    // MEASURED, not defensive: json_extract over a non-JSON detail *throws* in
    // this build rather than returning NULL, so one legacy or hand-edited row
    // would make every run unlistable and every undo impossible — which is
    // precisely when somebody needs one.
    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    await run(dbPaths, (conn) =>
      conn.run('INSERT INTO memory_events (memory_id, event, detail, at) VALUES (?, ?, ?, ?)',
        null, 'legacy', 'not json at all', NOW));

    await run(dbPaths, async (conn) => {
      const runs = await listRuns(conn);
      assert.equal(runs.length, 1);
      assert.equal(await resolveRunId(conn, 'last'), report.run_id);
      assert.ok((await runEvents(conn, report.run_id)).length > 0);
      assert.equal((await undoneEventIds(conn, report.run_id)).size, 0);
    });
    const undone = await undo(report.run_id, { paths: dbPaths, env: ENV, now: NOW + 1000 });
    assert.ok(undone.undone.length > 0);
  });

  it('describes where maintenance stands, and creates nothing to answer', async () => {
    const missing = { ...paths, dataDir: join(scratch, 'never'), dbPath: join(scratch, 'never', 'mem.db') };
    const status = await maintenanceStatus({ paths: missing, env: ENV, now: NOW });
    assert.equal(status.exists, false);
    assert.equal(status.due.due, true);
    assert.equal(existsSync(missing.dataDir), false, 'reading the status must not create a store');

    const dbPaths = store();
    await seed(dbPaths, LADDER_ROWS);
    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    const after = await maintenanceStatus({ paths: dbPaths, env: ENV, now: NOW + 60_000 });
    assert.equal(after.last_run.run_id, report.run_id);
    assert.equal(after.due.due, false);
    assert.equal(after.runs.length, 1);
    assert.equal(after.lock, null);
  });
});

describe('the CLI', () => {
  const home = mkdtempSync(join(tmpdir(), 'mem-maintain-cli-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));
  // The model cache too: undoing a tombstone recomputes the vector, so a data
  // dir with no model would make `mem undo` report a blocked row and exit 1.
  symlinkSync(paths.modelsDir, join(home, 'models'));

  const CLI = join(paths.pluginRoot, 'bin', 'mem');
  const cliPaths = { ...paths, dataDir: home, dbPath: join(home, 'mem.db') };

  const mem = (...argv) =>
    spawnSync(process.execPath, [CLI, ...argv], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_DATA: home, MEM_PROJECT_KEY: PROJECT, MEM_NO_INSTALL: '1' },
    });

  before(async () => {
    // Real-clock rows: the CLI has no --now, so the fixture is aged against now.
    const now = Date.now();
    await seed(cliPaths, LADDER_ROWS.map((row) => ({
      ...row,
      created_at: row.created_at === undefined ? now - 200 * DAY : now - (NOW - row.created_at),
      updated_at: row.updated_at === undefined ? now - 200 * DAY : now - (NOW - row.updated_at),
      last_used_at: row.last_used_at ? now - (NOW - row.last_used_at) : null,
      expires_at: row.expires_at ? now - (NOW - row.expires_at) : null,
      archivedAt: row.archivedAt ? now - (NOW - row.archivedAt) : null,
    })));
  });

  it('previews, applies, then throttles', () => {
    const dry = mem('maintain', '--dry-run', '--json');
    assert.equal(dry.status, 0, dry.stderr);
    const preview = JSON.parse(dry.stdout);
    assert.ok(preview.counts.archived > 0);
    assert.equal(preview.dry_run, true);

    const applied = mem('maintain', '--json');
    assert.equal(applied.status, 0, applied.stderr);
    const report = JSON.parse(applied.stdout);
    assert.equal(report.dry_run, false);
    assert.equal(report.counts.archived, preview.counts.archived);

    const again = mem('maintain');
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /Nothing to do/);

    const status = mem('maintain', '--status');
    assert.match(status.stdout, new RegExp(report.run_id));
    assert.match(status.stdout, /due\s+no/);

    // The human-readable run summary points at its own undo.
    const forced = mem('maintain', '--force');
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(forced.stdout, /^Maintained /m);
    assert.match(forced.stdout, /decay|usage|prune|pairs|checkpoint/);

    const undoRun = mem('undo', report.run_id, '--json');
    const undone = JSON.parse(undoRun.stdout);
    assert.ok(undone.undone.length > 0);
    assert.equal(undoRun.status, cached ? 0 : 1, 'an incomplete undo must not exit 0');

    const listed = mem('undo', '--list');
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, new RegExp(report.run_id));
  });

  it('rejects an unknown flag and a missing run id rather than guessing', () => {
    const bad = mem('maintain', '--aply');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /unknown option/);

    const noRef = mem('undo');
    assert.equal(noRef.status, 1);
    assert.match(noRef.stderr, /which run\?/);

    const unknown = mem('undo', 'maint-19700101T000000-000000');
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /No run matching/);
  });

  it('says nothing on stdout under --quiet', () => {
    const out = mem('maintain', '--quiet', '--force');
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout, '');
  });
});

describe('the hook wiring', () => {
  // A hook file that exists but is not registered does nothing at all, silently,
  // which is the failure mode this whole plugin's hooks are most exposed to —
  // and nothing checked hooks.json before this slice.
  const manifest = JSON.parse(readFileSync(join(paths.pluginRoot, 'hooks', 'hooks.json'), 'utf8'));

  it('registers the maintenance hook on SessionStart, beside the recollection one', () => {
    const commands = manifest.hooks.SessionStart.flatMap((entry) => entry.hooks.map((h) => h.command));
    assert.ok(commands.some((c) => c.includes('session-start.mjs')));
    assert.ok(commands.some((c) => c.includes('session-maintain.mjs')));
  });

  it('points every registered command at a file that exists', () => {
    for (const [event, entries] of Object.entries(manifest.hooks)) {
      for (const hook of entries.flatMap((e) => e.hooks)) {
        const match = hook.command.match(/hooks\/([\w-]+\.mjs)/);
        assert.ok(match, `${event}: cannot tell which file ${hook.command} runs`);
        assert.ok(existsSync(join(paths.pluginRoot, 'hooks', match[1])), `${event}: missing ${match[1]}`);
        assert.ok(hook.timeout > 0, `${event}: ${match[1]} has no timeout`);
      }
    }
  });
});

describe('the SessionStart hook', () => {
  const HOOK = join(paths.pluginRoot, 'hooks', 'session-maintain.mjs');
  const home = mkdtempSync(join(tmpdir(), 'mem-maintain-hook-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));

  const empty = mkdtempSync(join(tmpdir(), 'mem-maintain-nodb-'));
  after(() => rmSync(empty, { recursive: true, force: true }));

  const hookPaths = { ...paths, dataDir: home, dbPath: join(home, 'mem.db') };

  before(async () => {
    const now = Date.now();
    await seed(hookPaths, [
      { uid: 'stale-a', created_at: now - 300 * DAY, updated_at: now - 300 * DAY },
      { uid: 'stale-b', created_at: now - 300 * DAY, updated_at: now - 300 * DAY },
      { uid: 'pinned', pinned: 1 },
    ]);
  });

  const fire = ({ dataDir = home, env = {} } = {}) =>
    spawnSync(process.execPath, [HOOK], {
      encoding: 'utf8',
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: '.' }),
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: dataDir,
        MEM_PROJECT_KEY: PROJECT,
        MEM_NO_INSTALL: '1',
        ...env,
      },
    });

  /** The child is detached, so waiting for it means watching the store. */
  const waitFor = (check, budgetMs = 20_000) => {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      if (check()) return true;
      // Synchronous sleep: this test has nothing else to do, and an async poll
      // would interleave with the other files' database work.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
    return false;
  };

  it('returns immediately, says nothing, and lets the pass finish behind it', async () => {
    assert.equal(existsSync(stampPath(hookPaths)), false);

    const t = performance.now();
    const out = fire();
    const elapsed = performance.now() - t;

    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout, '', 'this hook injects nothing');
    assert.equal(out.stderr, '');
    console.log(`  session-maintain returned in ${Math.round(elapsed)} ms`);

    assert.ok(waitFor(() => existsSync(stampPath(hookPaths))), 'the detached run never stamped the store');
    // And it really maintained: the two stale rows are archived and the pinned
    // one is not.
    const rows = await run(hookPaths, (conn) =>
      conn.all('SELECT uid, status FROM memories ORDER BY uid'));
    assert.deepEqual(rows, [
      { uid: 'pinned', status: 'active' },
      { uid: 'stale-a', status: 'archived' },
      { uid: 'stale-b', status: 'archived' },
    ]);
  });

  it('does not spawn anything once the stamp is fresh', () => {
    const before = statSync(stampPath(hookPaths)).mtimeMs;
    const out = fire({ env: { MEM_HOOK_DEBUG: '1' } });
    assert.equal(out.status, 0);
    assert.match(out.stderr, /not due/);
    assert.equal(statSync(stampPath(hookPaths)).mtimeMs, before);
  });

  it('can be turned off, and creates nothing on a machine with no store', () => {
    const off = fire({ env: { MEM_NO_MAINTAIN: '1', MEM_HOOK_DEBUG: '1' } });
    assert.equal(off.status, 0);
    assert.match(off.stderr, /MEM_NO_MAINTAIN/);

    const nested = join(empty, 'not-yet');
    const cold = fire({ dataDir: nested, env: { MEM_HOOK_DEBUG: '1' } });
    assert.equal(cold.status, 0);
    assert.equal(cold.stdout, '');
    assert.match(cold.stderr, /no database/);
    assert.equal(existsSync(nested), false, 'a hook must never create the store');
  });

  it('is silent by default even when it declines', () => {
    const out = fire({ dataDir: empty });
    assert.equal(out.status, 0);
    assert.equal(out.stdout, '');
    assert.equal(out.stderr, '');
  });
});
