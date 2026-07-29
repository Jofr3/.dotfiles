// The synthetic store. Generation is pure and always runs; anything that needs
// real vectors — the distinctness invariant, the bulk insert, the WAL — skips
// without the cached model, because a fixture built from fake embeddings would
// prove nothing about retrieval.
//
// The invariant these tests exist to protect is that the fixture is a store the
// write path could have produced: valid fields, no credentials, and no pair
// inside a (scope, project_key, status) group at or above the 0.93 dedup
// threshold. A seed that quietly drifts into 200 near-copies would still make
// the perf test pass while making its number meaningless.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { checkpoint, withDb } from '../../src/db.mjs';
import { EMB_DIM, EMB_MODEL, modelCached } from '../../src/embed.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import { findSecrets } from '../../src/scrub.mjs';
import { DEDUP_THRESHOLD, KINDS, STATUSES } from '../../src/write.mjs';
import {
  DEFAULT_COUNT,
  DEFAULT_SEED,
  PROBES,
  PROJECTS,
  generate,
  rng,
  seedDatabase,
  seedPaths,
  seedRecords,
} from '../seed.mjs';

const paths = resolvePaths();
const needsModel = { skip: modelCached(paths) ? false : `model not cached — run 'mem warm'` };

const scratch = mkdtempSync(join(tmpdir(), 'mem-seed-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const scratchDir = () => join(scratch, `store-${n++}`);

// Fixed, so age-derived fields are reproducible across runs of the suite.
const NOW = 1_785_000_000_000;

describe('rng', () => {
  it('is deterministic and stays inside [0, 1)', () => {
    const a = Array.from({ length: 100 }, rng(42));
    const b = Array.from({ length: 100 }, rng(42));
    assert.deepEqual(a, b);
    assert.ok(a.every((x) => x >= 0 && x < 1));
    assert.notDeepEqual(a, Array.from({ length: 100 }, rng(43)));
  });
});

describe('generate', () => {
  it('produces exactly the count asked for, at any size', () => {
    for (const count of [1, 2, 7, 50, DEFAULT_COUNT]) {
      assert.equal(generate({ count, now: NOW }).length, count);
    }
  });

  it('is reproducible from seed and now — uids included', () => {
    const a = generate({ count: 60, seed: 7, now: NOW });
    const b = generate({ count: 60, seed: 7, now: NOW });
    assert.deepEqual(a, b);

    const c = generate({ count: 60, seed: 8, now: NOW });
    assert.notDeepEqual(
      a.map((r) => r.uid),
      c.map((r) => r.uid),
    );
  });

  it('gives every memory a unique, uuid-shaped uid', () => {
    const records = generate({ count: DEFAULT_COUNT, now: NOW });
    const uids = new Set(records.map((r) => r.uid));
    assert.equal(uids.size, records.length);
    for (const r of records) {
      assert.match(r.uid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('only uses kinds, statuses and scopes the schema allows', () => {
    for (const r of generate({ count: DEFAULT_COUNT, now: NOW })) {
      assert.ok(KINDS.includes(r.kind), r.kind);
      assert.ok(STATUSES.includes(r.status), r.status);
      assert.ok(r.scope === 'global' || r.scope === 'project');
      // A global memory has no project key and a project memory always does —
      // retrieval's `scope = 'global' OR project_key = ?` union depends on it.
      assert.equal(r.projectKey === null, r.scope === 'global');
      if (r.projectKey !== null) assert.ok(PROJECTS.includes(r.projectKey));
    }
  });

  it('never claims a memory was useful more often than it was injected', () => {
    // PLAN reads injected:useful as the over-general-slop signature, so an
    // impossible pair would poison the one statistic that catches it.
    for (const r of generate({ count: DEFAULT_COUNT, now: NOW })) {
      assert.ok(r.usefulCount <= r.injectedCount, `${r.usefulCount} > ${r.injectedCount}`);
      if (r.usefulCount === 0) assert.equal(r.lastUsedAt, null);
      if (r.injectedCount === 0) assert.equal(r.lastInjectedAt, null);
    }
  });

  it('keeps timestamps ordered and inside the window', () => {
    for (const r of generate({ count: DEFAULT_COUNT, now: NOW })) {
      assert.ok(r.createdAt <= r.updatedAt, 'created after updated');
      assert.ok(r.updatedAt <= NOW, 'updated in the future');
      if (r.lastUsedAt !== null) assert.ok(r.lastUsedAt <= NOW);
      if (r.lastInjectedAt !== null) assert.ok(r.lastInjectedAt <= NOW);
    }
  });

  it('pins only active global memories', () => {
    for (const r of generate({ count: DEFAULT_COUNT, now: NOW }).filter((x) => x.pinned)) {
      assert.equal(r.scope, 'global');
      assert.equal(r.status, 'active');
    }
  });

  it('includes rows that are already expired but still active', () => {
    // search.mjs guards expiry at read time precisely because tier-1 maintenance
    // runs on a schedule, so the fixture has to contain the in-between state.
    const records = generate({ count: DEFAULT_COUNT, now: NOW });
    const expired = records.filter((r) => r.expiresAt !== null && r.expiresAt <= NOW);
    assert.ok(expired.length > 0, 'no expired rows in the fixture');
    assert.ok(expired.some((r) => r.status === 'active'));
  });

  it('emits each superseded phrasing before the memory that replaced it', () => {
    const records = generate({ count: DEFAULT_COUNT, now: NOW });
    const byUid = new Map(records.map((r, i) => [r.uid, i]));
    const pairs = records.filter((r) => r.supersededByUid);

    assert.ok(pairs.length > 0, 'no supersession pairs in the fixture');
    for (const [i, r] of records.entries()) {
      if (!r.supersededByUid) continue;
      assert.equal(r.status, 'superseded');
      const target = byUid.get(r.supersededByUid);
      assert.ok(target !== undefined, `${r.supersededByUid} is not in the fixture`);
      assert.ok(target > i, 'the replacement must be inserted after the row it replaces');
      assert.equal(records[target].status, 'active');
      // The older phrasing was written first and shares the newer one's scope,
      // or the supersession would have crossed a scope boundary.
      assert.ok(r.createdAt < records[target].createdAt);
      assert.equal(r.projectKey, records[target].projectKey);
    }
  });

  it('reuses the corpus under a different project when asked for more', () => {
    // Past the corpus the same sentence reappears, which is legal — the write
    // path dedups within one scope — but it must never reappear in the same one.
    const records = generate({ count: 460, now: NOW });
    const seen = new Set();
    for (const r of records) {
      const key = `${r.scope}|${r.projectKey ?? ''}|${r.status}|${r.text}`;
      assert.ok(!seen.has(key), `duplicate in one scope: ${r.text}`);
      seen.add(key);
    }
  });

  it('carries the probe targets the perf gate searches for', () => {
    const records = generate({ count: DEFAULT_COUNT, now: NOW });
    for (const probe of PROBES) {
      const target = records.find((r) => r.text === probe.text);
      assert.ok(target, `probe target missing from the fixture: ${probe.text}`);
      assert.equal(target.status, 'active', `${probe.text} is not retrievable`);
    }
  });
});

describe('seedRecords', () => {
  it('passes every record through the write path validation', () => {
    // The point of the assertion is that seedRecords does not throw: it runs
    // normaliseInput and the scrubber over the whole corpus.
    const records = seedRecords({ count: DEFAULT_COUNT, now: NOW });
    assert.equal(records.length, DEFAULT_COUNT);
  });

  it('contains nothing the secret scrubber would reject', () => {
    for (const r of seedRecords({ count: DEFAULT_COUNT, now: NOW })) {
      assert.deepEqual(findSecrets(r.text), [], r.text);
      if (r.why) assert.deepEqual(findSecrets(r.why), [], r.why);
    }
  });
});

describe('seedPaths', () => {
  it('lands beside the real store, never on it', () => {
    const seeded = seedPaths(paths);
    assert.notEqual(seeded.dbPath, paths.dbPath);
    assert.equal(seeded.dataDir, join(paths.dataDir, 'seed'));
    // The shared caches are the real ones: a fixture must not re-download 23MB.
    assert.equal(seeded.modelsDir, paths.modelsDir);
    assert.equal(seeded.nodeModulesDir, paths.nodeModulesDir);
  });

  it('refuses to seed over the real database', async () => {
    await assert.rejects(
      () => seedDatabase({ paths, base: paths, count: 1 }),
      /Refusing to seed the real store/,
    );
  });
});

describe('seedDatabase', needsModel, () => {
  const dataDir = scratchDir();
  let stats;

  it('builds the store', async () => {
    stats = await seedDatabase({ paths: { ...paths, dataDir, dbPath: join(dataDir, 'mem.db') }, now: NOW });
    assert.equal(stats.count, DEFAULT_COUNT);
    assert.equal(stats.requested, DEFAULT_COUNT);
  });

  it('stores every generated field, embedded with the current model', async () => {
    const expected = generate({ count: DEFAULT_COUNT, seed: DEFAULT_SEED, now: NOW });
    await withDb(
      async (conn) => {
        const rows = await conn.all(
          `SELECT uid, kind, scope, project_key, text, why, status, pinned,
                  salience, confidence, created_at, updated_at, injected_count, useful_count,
                  emb_model, emb_dim, length(emb) AS emb_bytes
             FROM memories ORDER BY id`,
        );
        assert.equal(rows.length, expected.length);
        rows.forEach((row, i) => {
          const r = expected[i];
          assert.equal(row.uid, r.uid);
          assert.equal(row.text, r.text);
          assert.equal(row.kind, r.kind);
          assert.equal(row.scope, r.scope);
          assert.equal(row.project_key, r.projectKey);
          assert.equal(row.why, r.why);
          assert.equal(row.status, r.status);
          assert.equal(row.pinned, r.pinned ? 1 : 0);
          assert.equal(row.created_at, r.createdAt);
          assert.equal(row.emb_model, EMB_MODEL);
          assert.equal(row.emb_dim, EMB_DIM);
          assert.equal(row.emb_bytes, EMB_DIM * 4);
        });
      },
      { paths: { ...paths, dbPath: join(dataDir, 'mem.db') } },
    );
  });

  it('holds no pair the write path would have merged', () => {
    // The fixture's whole claim to being realistic. Measured on the real
    // vectors, inside the same (scope, project_key, status) groups the write
    // path compares against.
    assert.deepEqual(stats.duplicates.pairs, []);
    assert.ok(
      stats.duplicates.worst < DEDUP_THRESHOLD,
      `worst in-group similarity ${stats.duplicates.worst} >= ${DEDUP_THRESHOLD}`,
    );
  });

  it('resolves supersession links to real ids', async () => {
    assert.ok(stats.supersededPairs > 0);
    await withDb(
      async (conn) => {
        const dangling = await conn.get(
          `SELECT count(*) AS n FROM memories m
            WHERE m.superseded_by IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM memories p WHERE p.id = m.superseded_by)`,
        );
        assert.equal(dangling.n, 0);
        // Every link points forward at an active row, the way a real
        // supersession does — never at another dead one.
        const wrong = await conn.get(
          `SELECT count(*) AS n FROM memories m JOIN memories p ON p.id = m.superseded_by
            WHERE m.status != 'superseded' OR p.status != 'active'`,
        );
        assert.equal(wrong.n, 0);
      },
      { paths: { ...paths, dbPath: join(dataDir, 'mem.db') } },
    );
  });

  it('marks every audit-log entry as generated', async () => {
    await withDb(
      async (conn) => {
        const events = await conn.all('SELECT memory_id, event, detail FROM memory_events ORDER BY id');
        assert.equal(events.length, DEFAULT_COUNT);
        for (const event of events) {
          assert.equal(event.event, 'created');
          // An audit log that let synthetic rows pass for captured ones would
          // make every later question about provenance unanswerable.
          assert.equal(JSON.parse(event.detail).generator, 'build/seed.mjs');
        }
      },
      { paths: { ...paths, dbPath: join(dataDir, 'mem.db') } },
    );
  });

  it('reports a status and scope spread wide enough to exercise retrieval', () => {
    assert.ok(stats.statuses.active > 0);
    assert.ok(stats.statuses.staged > 0, 'no staged rows — staging would go untested');
    assert.ok(stats.statuses.archived > 0);
    assert.ok(stats.statuses.superseded > 0);
    assert.ok(stats.globals > 0 && stats.globals < stats.count);
    assert.ok(stats.pinned > 0);
    assert.ok(stats.expired > 0);
  });

  it('rebuilds identically from the same seed', async () => {
    const again = await seedDatabase({
      paths: { ...paths, dataDir, dbPath: join(dataDir, 'mem.db') },
      now: NOW,
    });
    assert.equal(again.count, stats.count);
    assert.deepEqual(again.statuses, stats.statuses);
    assert.equal(again.duplicates.worst, stats.duplicates.worst);
  });
});

// PLAN's bulk-insert note: "querying in the same process right after a 20k-row
// insert txn took 21s (WAL spill). Checkpoint after bulk writes."
//
// Measured here on Turso 0.7.1 at 384d, and again at 20k rows by hand: the 21s
// stall does *not* reproduce — the same-process query costs the same either side
// of the checkpoint. What the checkpoint demonstrably does is fold the WAL back
// into the database file, which is why it stays: unbounded WAL growth after a
// bulk load is a real cost even when query latency is not.
describe('WAL checkpoint after a bulk insert', needsModel, () => {
  const dataDir = scratchDir();
  const dbPath = join(dataDir, 'mem.db');
  const size = (suffix) => {
    try {
      return statSync(dbPath + suffix).size;
    } catch {
      return 0;
    }
  };

  it('leaves the WAL in place when the checkpoint is skipped', async () => {
    const stats = await seedDatabase({
      paths: { ...paths, dataDir, dbPath },
      count: 200,
      now: NOW,
      doCheckpoint: false,
    });

    assert.equal(stats.timings.checkpointMs, null);
    assert.ok(stats.wal.beforeCheckpointBytes > 0, 'the bulk insert wrote no WAL at all');
    assert.equal(stats.wal.afterCheckpointBytes, stats.wal.beforeCheckpointBytes);
    assert.ok(size('-wal') > 0);
  });

  it('truncates the WAL when it runs, and the query costs the same either side', async () => {
    const before = size('-wal');
    const queryMs = await withDb(
      async (conn) => {
        const time = async () => {
          const t = performance.now();
          await conn.all("SELECT id FROM memories WHERE status = 'active' ORDER BY id LIMIT 20");
          return performance.now() - t;
        };
        const dirty = await time();
        await checkpoint(conn);
        return { dirty, clean: await time() };
      },
      { paths: { ...paths, dbPath } },
    );

    assert.ok(before > 0);
    assert.equal(size('-wal'), 0, 'the checkpoint did not fold the WAL back into the file');
    // The pathology PLAN warns about would show up here as seconds, not
    // milliseconds. Recorded as an assertion so a regression in a future Turso
    // is caught rather than rediscovered.
    assert.ok(queryMs.dirty < 1000, `query before checkpoint took ${queryMs.dirty} ms`);
    assert.ok(queryMs.clean < 1000, `query after checkpoint took ${queryMs.clean} ms`);
  });

  it('checkpoints by default', async () => {
    const stats = await seedDatabase({ paths: { ...paths, dataDir, dbPath }, count: 50, now: NOW });
    assert.ok(stats.timings.checkpointMs !== null);
    assert.ok(stats.wal.beforeCheckpointBytes > 0);
    assert.equal(stats.wal.afterCheckpointBytes, 0);
    assert.equal(size('-wal'), 0);
  });
});

describe('node build/seed.mjs', needsModel, () => {
  const run = (...argv) =>
    spawnSync(process.execPath, [join(paths.pluginRoot, 'build', 'seed.mjs'), ...argv], {
      encoding: 'utf8',
      env: { ...process.env, MEM_NO_INSTALL: '1' },
    });

  it('seeds into a directory of its own and reports what it built', () => {
    const dir = scratchDir();
    const result = run('--count', '40', '--data-dir', dir, '--json');
    assert.equal(result.status, 0, result.stderr);

    const stats = JSON.parse(result.stdout);
    assert.equal(stats.count, 40);
    assert.equal(stats.dbPath, join(dir, 'mem.db'));
    assert.deepEqual(stats.duplicates.pairs, []);
    assert.equal(stats.wal.afterCheckpointBytes, 0);
  });

  it('grows a store with --keep, and says so when the seed would collide', () => {
    const dir = scratchDir();
    assert.equal(run('--count', '20', '--data-dir', dir, '--json').status, 0);

    // uids are derived from the seed, so the same seed twice collides on row one.
    const same = run('--count', '20', '--data-dir', dir, '--keep', '--json');
    assert.equal(same.status, 1);
    assert.match(same.stderr, /already holds the memories seed .* generates/);

    const more = run('--count', '20', '--data-dir', dir, '--keep', '--seed', '99', '--json');
    assert.equal(more.status, 0, more.stderr);
    assert.equal(JSON.parse(more.stdout).count, 40);
  });

  it('rejects nonsense rather than seeding something surprising', () => {
    assert.match(run('--count', 'lots').stderr, /--count must be a positive whole number/);
    assert.match(run('--wat').stderr, /unknown option/);
    assert.equal(run('--count', 'lots').status, 1);
  });

  it('prints help without touching the disk', () => {
    const result = run('--help');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: node build\/seed\.mjs/);
  });
});
