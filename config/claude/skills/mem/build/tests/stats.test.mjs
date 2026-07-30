// `mem stats` — PLAN's "Knowing whether it's working".
//
// A metrics command is the easiest thing in a codebase to get quietly wrong,
// because every number it prints looks like a number whether or not it means
// anything. So the fixtures here are built so that each metric has ONE right
// answer that can be written down: a store with a known number of injections and
// usefuls, rows planted at known ages, a pair planted at a known cosine, and a
// vector planted to be close to everything.
//
// Two properties are asserted repeatedly and on purpose:
//   - stats never writes. It is opened read-only in production and the tests check
//     the store is byte-for-byte unchanged.
//   - every capped metric says it was capped. A sampled count that reads like a
//     total is worse than no count.
//
// The model is never loaded: vectors are synthetic, and the two pairwise metrics
// are exercised with hand-built vectors whose cosines are known in advance.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { DAY_MS } from '../../src/decay.mjs';
import { EMB_DIM, EMB_MODEL } from '../../src/embed.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import { plan as prunePlan, applyPlan } from '../../src/prune.mjs';
import {
  AGE_BUCKETS,
  PAIR_THRESHOLD,
  collect,
  duplicatePairs,
  eventStats,
  median,
  neverInjected,
  percentile,
  scanTiming,
  slop,
  statusCounts,
  stats,
  usefulness,
} from '../../src/stats.mjs';

const paths = resolvePaths();
const scratch = mkdtempSync(join(tmpdir(), 'mem-stats-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const scratchPaths = () => ({ ...paths, dbPath: join(scratch, `stats-${n++}.db`) });
const ENV = { MEM_PROJECT_KEY: 'test/stats' };
const NOW = 1_750_000_000_000;
const DAY = DAY_MS;

/**
 * A unit vector pointing `angle` radians away from the first basis direction in
 * the (0, 1) plane, so `1 - vector_distance_cos(a, b)` is exactly cos(a - b) and
 * a pair can be planted at a chosen similarity.
 */
function vectorAt(angle) {
  const v = new Float32Array(EMB_DIM);
  v[0] = Math.cos(angle);
  v[1] = Math.sin(angle);
  return Buffer.from(v.buffer);
}

/** Spread over the plane, so nothing is accidentally a near-duplicate. */
const spread = (i) => vectorAt((i * Math.PI) / 3 + 0.37 * i);

// Two variants, because `vector32(NULL)` throws in this build — a tombstoned row
// has to be inserted with a literal NULL, which is only possible at all since the
// schema v2 rebuild.
const seedSql = (tombstoned) => `
  INSERT INTO memories (uid, kind, scope, project_key, text, emb, emb_model, emb_dim,
                        salience, confidence, pinned, status,
                        created_at, updated_at, last_used_at, useful_count,
                        injected_count, last_injected_at, expires_at)
  VALUES (?, 'fact', ?, ?, ?, ${tombstoned ? 'NULL' : 'vector32(?)'}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

async function seed(dbPaths, rows) {
  return withDb(async (conn) => {
    const ids = [];
    for (const [i, row] of rows.entries()) {
      const r = {
        uid: `uid-${i}`,
        scope: 'project',
        project_key: 'test/stats',
        text: `memory ${i}`,
        salience: 0.5,
        confidence: 0.5,
        pinned: 0,
        status: 'active',
        created_at: NOW - 10 * DAY,
        updated_at: NOW - 10 * DAY,
        last_used_at: null,
        useful_count: 0,
        injected_count: 0,
        last_injected_at: null,
        expires_at: null,
        emb: spread(i + 1),
        embModel: EMB_MODEL,
        embDim: EMB_DIM,
        ...row,
      };
      if (r.scope === 'global') r.project_key = null;
      const info = await conn.run(
        seedSql(r.emb === null),
        r.uid, r.scope, r.project_key, r.text,
        ...(r.emb === null ? [] : [r.emb]),
        r.embModel, r.embDim,
        r.salience, r.confidence, r.pinned, r.status,
        r.created_at, r.updated_at, r.last_used_at, r.useful_count,
        r.injected_count, r.last_injected_at, r.expires_at,
      );
      ids.push(info.lastInsertRowid);
    }
    return ids;
  }, { paths: dbPaths, env: ENV });
}

const run = (dbPaths, fn) => withDb(fn, { paths: dbPaths, env: ENV });

describe('median and percentile', () => {
  it('handle the shapes a real distribution arrives in', () => {
    assert.equal(median([]), null);
    assert.equal(median([5]), 5);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);

    assert.equal(percentile([], 0.5), null);
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
    assert.equal(percentile([1, 2, 3], 1), 3, 'p100 is the max');
    assert.equal(percentile([1, 2, 3], 0), 1);
  });
});

describe('statusCounts', () => {
  it('counts every status plus the three states that are not statuses', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { status: 'active' },
      { status: 'active', pinned: 1 },
      { status: 'active', expires_at: NOW - DAY },
      { status: 'active', expires_at: NOW + DAY },
      { status: 'staged' },
      { status: 'archived', emb: null },
      { status: 'superseded' },
    ]);
    await run(dbPaths, async (conn) => {
      const counts = await statusCounts(conn, { now: NOW });
      assert.equal(counts.active, 4);
      assert.equal(counts.staged, 1);
      assert.equal(counts.archived, 1);
      assert.equal(counts.superseded, 1);
      assert.equal(counts.total, 7);
      assert.equal(counts.pinned, 1);
      assert.equal(counts.tombstoned, 1);
      assert.equal(counts.expired_active, 1, 'expiring tomorrow is not expired');
    });
  });

  it('reports zero for a status nothing is in, rather than omitting it', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ status: 'active' }]);
    await run(dbPaths, async (conn) => {
      const counts = await statusCounts(conn, { now: NOW });
      assert.equal(counts.staged, 0);
      assert.equal(counts.archived, 0);
      assert.equal(counts.superseded, 0);
    });
  });
});

// The number PLAN's whole pruning argument rests on: 20k rows at 24.7ms against
// the 2k active ones at 3.0ms, so "retrieval cost is proportional to the number of
// *active* memories, not stored ones".
describe('scanTiming', () => {
  it('times the scoped active scan and the every-row scan over the right row counts', async () => {
    const dbPaths = scratchPaths();
    const rows = [];
    for (let i = 0; i < 6; i += 1) rows.push({ status: 'active' });
    for (let i = 0; i < 10; i += 1) rows.push({ status: 'archived' });
    rows.push({ status: 'active', scope: 'global' });
    rows.push({ status: 'active', project_key: 'somebody/else' });
    rows.push({ status: 'active', expires_at: NOW - DAY });
    await seed(dbPaths, rows);

    await run(dbPaths, async (conn) => {
      const t = await scanTiming(conn, { now: NOW, projectKey: 'test/stats', repeats: 1 });
      assert.equal(t.note, null);
      // 6 project + 1 global. The other project, the expired row and every
      // archived row are all out — which is exactly what the ladder is buying.
      assert.equal(t.active_rows, 7);
      assert.equal(t.all_rows, 19);
      assert.ok(t.active_ms >= 0 && t.all_ms >= 0);
      assert.equal(t.repeats, 1);
      assert.equal(t.project_key, 'test/stats');
      assert.ok(Number.isInteger(t.probe_id));
    });
  });

  it('says why rather than throwing when there is nothing to time', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ status: 'active', emb: null }]);
    await run(dbPaths, async (conn) => {
      const t = await scanTiming(conn, { now: NOW, repeats: 1 });
      assert.equal(t.active_ms, null);
      assert.match(t.note, /nothing to time/);
    });
  });

  // A tombstone in the store must not take the measurement with it — the guard
  // is the only thing standing between this and a thrown statement.
  it('measures a store that has tombstones in it', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { status: 'active' },
      { status: 'active', emb: null },
      { status: 'archived', emb: null },
    ]);
    await run(dbPaths, async (conn) => {
      const t = await scanTiming(conn, { now: NOW, projectKey: 'test/stats', repeats: 1 });
      assert.equal(t.active_rows, 1);
      assert.equal(t.all_rows, 1);
      assert.ok(t.active_ms !== null);
    });
  });
});

describe('duplicatePairs', () => {
  it('finds a planted pair at a known cosine and misses one just below', async () => {
    const dbPaths = scratchPaths();
    // cos(0.4) = 0.921 -> a pair. cos(0.6) = 0.825 -> below the 0.85 gate.
    await seed(dbPaths, [
      { uid: 'a', emb: vectorAt(0), text: 'use pnpm to install dependencies' },
      { uid: 'b', emb: vectorAt(0.4), text: 'install dependencies with pnpm' },
      { uid: 'c', emb: vectorAt(2.0), text: 'unrelated' },
      { uid: 'd', emb: vectorAt(2.6), text: 'also unrelated' },
    ]);
    await run(dbPaths, async (conn) => {
      const dup = await duplicatePairs(conn);
      assert.equal(dup.threshold, PAIR_THRESHOLD);
      assert.equal(dup.pairs, 1);
      assert.equal(dup.exact, true);
      assert.equal(dup.note, null);
      assert.equal(dup.worst.length, 1);
      assert.ok(dup.worst[0].similarity > 0.9 && dup.worst[0].similarity < 0.93, dup.worst[0].similarity);
    });
  });

  it('never pairs across scopes — that is a decision somebody took, not a duplicate', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'proj', emb: vectorAt(0) },
      { uid: 'glob', emb: vectorAt(0.01), scope: 'global' },
      { uid: 'other', emb: vectorAt(0.02), project_key: 'somebody/else' },
    ]);
    await run(dbPaths, async (conn) => {
      assert.equal((await duplicatePairs(conn)).pairs, 0);
    });
  });

  it('skips tombstones, foreign vector spaces and anything not active', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'a', emb: vectorAt(0) },
      { uid: 'tomb', emb: null },
      { uid: 'other-model', emb: vectorAt(0.01), embModel: 'some/other-model' },
      { uid: 'archived', emb: vectorAt(0.02), status: 'archived' },
    ]);
    await run(dbPaths, async (conn) => {
      const dup = await duplicatePairs(conn);
      assert.equal(dup.pairs, 0);
      assert.equal(dup.active, 1, 'only the one comparable active row counts as eligible');
    });
  });

  it('admits it when the quadratic scan was capped', async () => {
    const dbPaths = scratchPaths();
    const rows = [];
    for (let i = 0; i < 8; i += 1) rows.push({ uid: `r-${i}`, emb: vectorAt(i * 0.02) });
    await seed(dbPaths, rows);
    await run(dbPaths, async (conn) => {
      const full = await duplicatePairs(conn);
      assert.equal(full.exact, true);
      assert.equal(full.pairs, 28, 'every pair of eight rows is within 0.85 by construction');

      const capped = await duplicatePairs(conn, { rowLimit: 4 });
      assert.equal(capped.exact, false);
      assert.equal(capped.sampled, 4);
      assert.equal(capped.pairs, 6);
      assert.match(capped.note, /oldest 4 of 8/);
    });
  });

  it('is 0 rather than an error on a store too small to have a pair', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'only' }]);
    await run(dbPaths, async (conn) => {
      const dup = await duplicatePairs(conn);
      assert.equal(dup.pairs, 0);
      assert.equal(dup.exact, true);
    });
  });
});

describe('usefulness', () => {
  it('reports both ratios, because they answer different questions', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'heavy', injected_count: 100, useful_count: 10 },  // ratio 0.10
      { uid: 'light', injected_count: 2, useful_count: 1 },     // ratio 0.50
      { uid: 'other', injected_count: 4, useful_count: 3 },     // ratio 0.75
      { uid: 'never-injected', injected_count: 0, useful_count: 0 },
    ]);
    await run(dbPaths, async (conn) => {
      const u = await usefulness(conn);
      assert.equal(u.injected_rows, 3, 'never-injected rows are not in the denominator');
      assert.equal(u.injections, 106);
      assert.equal(u.usefuls, 14);
      assert.equal(u.ratio_overall, 0.132);
      assert.equal(u.ratio_p50, 0.5, 'the median ROW, which the heavy one does not dominate');
      assert.equal(u.never_useful, 0);
    });
  });

  // PLAN: "injected_count high with useful_count ~ 0 is precisely the
  // over-general-slop signature, and nothing else catches it."
  it('names the slop by injection count, worst first', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'slop', text: 'the user likes clean code', injected_count: 40, useful_count: 0 },
      { uid: 'mild', text: 'mildly useless', injected_count: 5, useful_count: 0 },
      { uid: 'fine', text: 'a good one', injected_count: 20, useful_count: 15 },
      { uid: 'noise', text: 'injected once', injected_count: 1, useful_count: 0 },
    ]);
    await run(dbPaths, async (conn) => {
      const u = await usefulness(conn);
      assert.equal(u.never_useful, 3);
      assert.deepEqual(u.worst.map((r) => r.text), [
        'the user likes clean code', 'mildly useless', 'injected once',
      ]);
      assert.equal(u.worst[0].injected_count, 40);

      const two = await usefulness(conn, { worst: 2 });
      assert.equal(two.worst.length, 2);
    });
  });

  it('reports nulls rather than dividing by zero on an unqueried store', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'fresh' }]);
    await run(dbPaths, async (conn) => {
      const u = await usefulness(conn);
      assert.equal(u.injected_rows, 0);
      assert.equal(u.ratio_overall, null);
      assert.equal(u.ratio_p50, null);
      assert.deepEqual(u.worst, []);
    });
  });
});

describe('neverInjected', () => {
  it('buckets by age, with the 60-day edge on the archiving rule', async () => {
    const dbPaths = scratchPaths();
    const at = (days) => ({ created_at: NOW - days * DAY, updated_at: NOW - days * DAY });
    await seed(dbPaths, [
      { uid: 'today', ...at(0) },
      { uid: 'week', ...at(20) },
      { uid: 'month', ...at(45) },
      { uid: 'quarter', ...at(100) },
      { uid: 'ancient', ...at(400) },
      { uid: 'ancient-archived', ...at(500), status: 'archived' },
      { uid: 'was-injected', ...at(400), injected_count: 3 },
    ]);
    await run(dbPaths, async (conn) => {
      const c = await neverInjected(conn, { now: NOW });
      assert.equal(c.total, 6, 'the injected row is not cruft');
      assert.equal(c.active, 5);
      assert.deepEqual(c.buckets, [
        { label: '<7d', n: 1, active: 1 },
        { label: '7-30d', n: 1, active: 1 },
        { label: '30-60d', n: 1, active: 1 },
        { label: '60-180d', n: 1, active: 1 },
        { label: '>180d', n: 2, active: 1 },
      ]);
      assert.deepEqual(AGE_BUCKETS, [7, 30, 60, 180]);
    });
  });
});

describe('slop', () => {
  it('ranks a vector close to everything above the ones that are not', async () => {
    const dbPaths = scratchPaths();
    const rows = [];
    // Eight rows spread over a quarter turn, plus one planted in the middle of
    // them: the middle one is nearest to everything, which is what "the user likes
    // clean code" looks like in vector space.
    for (let i = 0; i < 8; i += 1) rows.push({ uid: `spread-${i}`, emb: vectorAt(i * 0.2), text: `specific ${i}` });
    rows.push({ uid: 'slop', emb: vectorAt(0.7), text: 'the user likes clean code' });
    await seed(dbPaths, rows);

    await run(dbPaths, async (conn) => {
      const s = await slop(conn, { sample: 9 });
      assert.equal(s.scored, 9);
      assert.equal(s.exact, true);
      assert.equal(s.worst[0].text, 'the user likes clean code');
      assert.ok(s.max > s.p50, `${s.max} should beat the median ${s.p50}`);
      assert.ok(s.p90 >= s.p50);
    });
  });

  it('admits it when it only scored part of the store', async () => {
    const dbPaths = scratchPaths();
    const rows = [];
    for (let i = 0; i < 10; i += 1) rows.push({ uid: `r-${i}`, emb: vectorAt(i * 0.1) });
    await seed(dbPaths, rows);
    await run(dbPaths, async (conn) => {
      const capped = await slop(conn, { sample: 4, rowLimit: 5 });
      assert.equal(capped.scored, 5);
      assert.equal(capped.exact, false);
      assert.match(capped.note, /oldest 5 of 10/);
      assert.equal(capped.sample, 4);
    });
  });

  it('declines to measure a store with nothing to compare', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'a' }, { uid: 'b' }]);
    await run(dbPaths, async (conn) => {
      const s = await slop(conn);
      assert.equal(s.scored, 0);
      assert.equal(s.p50, null);
    });
  });
});

describe('eventStats', () => {
  it('reports the phase-5b block as structurally zero and says why', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'a' }]);
    await run(dbPaths, async (conn) => {
      const e = await eventStats(conn);
      assert.equal(e.proposed, 0);
      assert.equal(e.accepted, 0);
      assert.equal(e.undone, 0);
      assert.match(e.note, /phase 5b has not shipped/);
    });
  });

  it('counts run ids out of the event detail, so 5a.4 and 5b light it up for free', async () => {
    const dbPaths = scratchPaths();
    const [id] = await seed(dbPaths, [{ uid: 'a' }]);
    await run(dbPaths, async (conn) => {
      for (const [event, runId] of [['archived', 'run-1'], ['tombstoned', 'run-1'], ['accepted', 'run-2']]) {
        await conn.run(
          'INSERT INTO memory_events (memory_id, event, detail, at) VALUES (?, ?, ?, ?)',
          id, event, JSON.stringify({ run_id: runId }), NOW,
        );
      }
      const e = await eventStats(conn);
      assert.equal(e.runs, 2);
      assert.equal(e.accepted, 1);
      assert.equal(e.note, null);
      assert.deepEqual(
        e.histogram.map((h) => h.event).sort(),
        ['accepted', 'archived', 'tombstoned'],
      );
    });
  });
});

describe('collect', () => {
  it('assembles every metric PLAN lists, plus what the ladder can reach', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'stale', created_at: NOW - 300 * DAY, updated_at: NOW - 300 * DAY },
      { uid: 'expired', expires_at: NOW - DAY },
      { uid: 'good', useful_count: 4, last_used_at: NOW, injected_count: 8 },
      { uid: 'tomb-due', status: 'archived', created_at: NOW - 400 * DAY, updated_at: NOW - 400 * DAY },
    ]);

    await run(dbPaths, async (conn) => {
      const r = await collect(conn, { now: NOW, projectKey: 'test/stats' });

      // Every key PLAN's list names, present and not undefined.
      for (const key of ['status', 'scan', 'duplicates', 'usefulness', 'never_injected', 'slop',
        'ladder', 'consolidation', 'model', 'schema_version']) {
        assert.ok(r[key] !== undefined && r[key] !== null, `missing ${key}`);
      }
      assert.equal(r.status.active, 3);
      assert.equal(r.ladder.rules.stale, 1);
      assert.equal(r.ladder.rules.expired, 1);
      assert.equal(r.ladder.rules.tombstone, 1);
      assert.equal(r.ladder.thresholds.strength, 0.15);
      assert.equal(r.model.emb_model, EMB_MODEL);
      assert.ok(r.elapsed_ms >= 0);
      assert.deepEqual(r.pending_migrations, []);
    });
  });

  it('changes nothing in the store — a metric is a read', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'stale', created_at: NOW - 300 * DAY, updated_at: NOW - 300 * DAY },
      { uid: 'tomb-due', status: 'archived', created_at: NOW - 400 * DAY, updated_at: NOW - 400 * DAY },
    ]);

    const snapshot = async () => run(dbPaths, async (conn) => ({
      rows: await conn.all('SELECT id, status, emb IS NULL AS empty FROM memories ORDER BY id'),
      events: (await conn.get('SELECT count(*) AS n FROM memory_events')).n,
      meta: await conn.all('SELECT k, v FROM meta ORDER BY k'),
    }));

    const before = await snapshot();
    await run(dbPaths, (conn) => collect(conn, { now: NOW, projectKey: 'test/stats' }));
    assert.deepEqual(await snapshot(), before);
  });

  it('can skip the ladder for a caller that only wants the counts', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'a' }]);
    await run(dbPaths, async (conn) => {
      const r = await collect(conn, { now: NOW, ladder: false });
      assert.equal(r.ladder, null);
      assert.equal(r.status.active, 1);
    });
  });

  // The claim under PLAN's benchmark, end to end: prune, and the active scan
  // covers fewer rows while the store keeps every one of them.
  it('shows the active row count falling after a prune while total holds', async () => {
    const dbPaths = scratchPaths();
    const rows = [];
    for (let i = 0; i < 12; i += 1) {
      rows.push({ uid: `old-${i}`, emb: spread(i + 1), created_at: NOW - 300 * DAY, updated_at: NOW - 300 * DAY });
    }
    for (let i = 0; i < 4; i += 1) {
      rows.push({ uid: `keep-${i}`, emb: spread(i + 40), useful_count: 2, last_used_at: NOW });
    }
    await seed(dbPaths, rows);

    const before = await run(dbPaths, (conn) => collect(conn, { now: NOW, projectKey: 'test/stats' }));
    assert.equal(before.scan.active_rows, 16);
    assert.equal(before.ladder.rules.stale, 12);

    await run(dbPaths, async (conn) => applyPlan(conn, await prunePlan(conn, { now: NOW })));

    const after = await run(dbPaths, (conn) => collect(conn, { now: NOW, projectKey: 'test/stats' }));
    assert.equal(after.scan.active_rows, 4, 'the scan now covers a quarter of the rows');
    assert.equal(after.scan.all_rows, 16, 'and every memory is still there');
    assert.equal(after.status.total, 16);
    assert.equal(after.status.archived, 12);
    assert.equal(after.ladder.rules.stale, 0);
  });
});

describe('stats()', () => {
  it('opens the store read-only and refuses to create one', async () => {
    const missing = scratchPaths();
    await assert.rejects(() => stats({ paths: missing, env: ENV, now: NOW }));
    assert.throws(() => statSync(missing.dbPath), /ENOENT/, 'stats must not have created a database');
  });

  it('reports the file size, so rung 3 bounding file growth is visible', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'a' }]);
    const r = await stats({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(r.store.path, dbPaths.dbPath);
    assert.ok(r.store.bytes > 0);
  });

  it('resolves the project key the way `list` does when not given one', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'a' }]);
    const r = await stats({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(r.scan.project_key, 'test/stats');
  });
});
