// Pair detection — PLAN's "Contradiction handling", mechanical half.
//
// The interesting assertions here are all about what is NOT offered to a judge,
// because every pair this file lets through costs an LLM call and every pair it
// wrongly suppresses is a contradiction nobody will ever be told about. So the
// suppressions are tested one at a time — the watermark, the verdict cache, the
// scope line, the tombstone, the model mismatch — and each has a matching test
// that the suppression *lifts* when it should, since a filter that never lifts
// looks exactly like a filter that works.
//
// Vectors are built by hand at a known angle in the first two dimensions, so
// cos(θa − θb) *is* the similarity and a pair can be placed either side of 0.85
// on purpose. Nothing here loads the embedding model: detection is SQL over
// stored blobs and has to keep working on a machine that never ran `mem warm`.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { EMB_DIM, EMB_MODEL } from '../../src/embed.mjs';
import { forgetMemory, memoryEvents } from '../../src/manage.mjs';
import { maintain } from '../../src/maintain.mjs';
import {
  CHANGED_LIMIT,
  EVENT_CONSOLIDATED,
  EVENT_PAIR_JUDGED,
  KEEP_BOTH_VERDICTS,
  PAIR_LIMIT,
  PAIR_PREFIX,
  PAIR_THRESHOLD,
  VERDICTS,
  cacheVerdict,
  detectPairs,
  dropVerdict,
  dropVerdictsFor,
  markConsolidated,
  orderPair,
  pairKey,
  pairs,
  readPairCache,
  readVerdict,
} from '../../src/pairs.mjs';
import { PAIR_THRESHOLD as STATS_PAIR_THRESHOLD } from '../../src/stats.mjs';
import { resolvePaths } from '../../src/paths.mjs';

const paths = resolvePaths();
const scratch = mkdtempSync(join(tmpdir(), 'mem-pairs-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const store = () => ({ ...paths, dbPath: join(scratch, `pairs-${n++}.db`) });
const ENV = { MEM_PROJECT_KEY: 'test/pairs' };
const NOW = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const KEY = 'test/pairs';

/**
 * A unit vector at angle `theta` in the (0, 1) plane, so the cosine between two
 * of them is cos(θa − θb) and a test can ask for 0.98 or for 0.82 by arithmetic
 * rather than by hoping.
 */
function vec(theta) {
  const v = new Float32Array(EMB_DIM);
  v[0] = Math.cos(theta);
  v[1] = Math.sin(theta);
  return Buffer.from(v.buffer);
}

const SEED_SQL = `
  INSERT INTO memories (uid, kind, scope, project_key, text, why, emb, emb_model, emb_dim,
                        salience, confidence, pinned, status,
                        created_at, updated_at, consolidated_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, vector32(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** Seed rows, return their ids in order. `theta` places the row on the circle. */
async function seed(dbPaths, rows) {
  return withDb(async (conn) => {
    const ids = [];
    for (const [i, row] of rows.entries()) {
      const r = {
        uid: `uid-${i}`,
        kind: 'fact',
        scope: 'project',
        project_key: KEY,
        text: `memory ${i}`,
        why: null,
        theta: 0,
        salience: 0.5,
        confidence: 0.5,
        pinned: 0,
        status: 'active',
        created_at: NOW - 30 * DAY,
        updated_at: NOW - 30 * DAY,
        consolidated_at: null,
        expires_at: null,
        embModel: EMB_MODEL,
        embDim: EMB_DIM,
        tombstoned: false,
        ...row,
      };
      if (r.scope === 'global') r.project_key = null;
      const info = await conn.run(
        SEED_SQL,
        r.uid, r.kind, r.scope, r.project_key, r.text, r.why, vec(r.theta), r.embModel, r.embDim,
        r.salience, r.confidence, r.pinned, r.status,
        r.created_at, r.updated_at, r.consolidated_at, r.expires_at,
      );
      const id = Number(info.lastInsertRowid);
      if (r.tombstoned) await conn.run('UPDATE memories SET emb = NULL WHERE id = ?', id);
      ids.push(id);
    }
    return ids;
  }, { paths: dbPaths, env: ENV });
}

const run = (dbPaths, fn) => withDb(fn, { paths: dbPaths, env: ENV });
const detect = (dbPaths, opts = {}) => run(dbPaths, (conn) => detectPairs(conn, { now: NOW, ...opts }));

/** A near-identical pair (cos 0.955) plus one row far from both (cos 0.54). */
const TWIN_ROWS = [
  { text: 'we use vitest for tests', theta: 0 },
  { text: 'we no longer use vitest', theta: 0.3 },
  { text: 'deploys go out on friday', theta: 1.0 },
];

const keyOf = (p) => `${p.a}/${p.b}`;

describe('pair detection', () => {
  it('offers a pair over the threshold, in canonical id order, and nothing else', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, TWIN_ROWS);

    const report = await detect(dbPaths);
    assert.equal(report.threshold, PAIR_THRESHOLD);
    assert.equal(report.eligible, 3);
    assert.deepEqual(report.pairs.map(keyOf), [`${a}/${b}`]);

    const [pair] = report.pairs;
    assert.ok(pair.similarity > 0.95 && pair.similarity < 0.96, `similarity was ${pair.similarity}`);
    assert.equal(pair.key, pairKey(b, a), 'the key is orientation-free');
    assert.equal(pair.scope, 'project');
    assert.equal(pair.project_key, KEY);
    // Both rows travel whole, because slice 5b.2's guard needs pinned, confidence
    // and created_at and must not have to go back to the database for them.
    assert.deepEqual(pair.rows.map((r) => r.id), [a, b]);
    assert.equal(pair.rows[0].text, 'we use vitest for tests');
    assert.equal(pair.rows[1].confidence, 0.5);
    assert.equal(pair.rows[0].pinned, 0);
    assert.equal(report.candidates, 1);
    assert.equal(report.fresh, 1);
    assert.equal(report.cached_skipped, 0);
    assert.equal(report.truncated, false);
  });

  it('counts each unordered pair once even when both members changed', async () => {
    const dbPaths = store();
    await seed(dbPaths, [
      { text: 'one', theta: 0 },
      { text: 'two', theta: 0.1 },
      { text: 'three', theta: 0.2 },
    ]);

    const report = await detect(dbPaths);
    // Three rows all within 0.85 of each other is three pairs, not six.
    assert.equal(report.candidates, 3);
    assert.equal(report.pairs.length, 3);
    assert.equal(new Set(report.pairs.map((p) => p.key)).size, 3);
    for (const pair of report.pairs) assert.ok(pair.a < pair.b);
  });

  it('leaves a pair below the threshold alone until the threshold moves', async () => {
    const dbPaths = store();
    // cos(0.6) = 0.825 — under 0.85 and over 0.80.
    await seed(dbPaths, [{ theta: 0 }, { theta: 0.6 }]);

    assert.equal((await detect(dbPaths)).pairs.length, 0);
    assert.equal((await detect(dbPaths, { threshold: 0.8 })).pairs.length, 1);
  });

  it('never pairs across a scope line — that is a decision somebody took', async () => {
    const dbPaths = store();
    await seed(dbPaths, [
      { text: 'project one', theta: 0 },
      { text: 'global one', scope: 'global', theta: 0.02 },
      { text: 'other project', project_key: 'test/other', theta: 0.04 },
    ]);

    const report = await detect(dbPaths);
    assert.equal(report.eligible, 3);
    assert.equal(report.candidates, 0, 'three near-identical rows in three scopes are not pairs');
  });

  it('only looks at active rows, and never at an expired one', async () => {
    const dbPaths = store();
    await seed(dbPaths, [
      { text: 'active', theta: 0 },
      { text: 'staged', theta: 0.05, status: 'staged' },
      { text: 'archived', theta: 0.06, status: 'archived' },
      { text: 'superseded', theta: 0.07, status: 'superseded' },
      { text: 'expired', theta: 0.08, expires_at: NOW - DAY },
    ]);

    const report = await detect(dbPaths);
    assert.equal(report.eligible, 1);
    assert.equal(report.candidates, 0);

    // The expired row is the only one of the four that comes back on its own —
    // and only once its TTL is in the future again.
    const later = await detect(dbPaths, { now: NOW - 2 * DAY });
    assert.equal(later.candidates, 1);
  });

  it('survives a tombstone in scope rather than taking the query down with it', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, [
      { text: 'has a vector', theta: 0 },
      { text: 'also has one', theta: 0.1 },
      { text: 'tombstoned', theta: 0.1, tombstoned: true },
    ]);

    // Slice 5a.3 measured that vector_distance_cos(NULL, v) throws in this build
    // and takes the whole statement with it, so this is not a ranking test.
    const report = await detect(dbPaths);
    assert.equal(report.eligible, 2);
    assert.deepEqual(report.pairs.map(keyOf), [`${a}/${b}`]);
  });

  it('never compares vectors from two different models', async () => {
    const dbPaths = store();
    await seed(dbPaths, [
      { text: 'today', theta: 0 },
      { text: 'mid-migration', theta: 0.05, embModel: 'Xenova/all-MiniLM-L6-v2@q8' },
      { text: 'wrong dim', theta: 0.05, embDim: 128 },
    ]);

    const report = await detect(dbPaths);
    assert.equal(report.eligible, 1, 'distances only mean anything inside one vector space');
    assert.equal(report.candidates, 0);
  });

  it('does find pinned rows — the resolution guard has to have something to fire on', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, [
      { text: 'never deploy on friday', theta: 0, pinned: 1, confidence: 0.9 },
      { text: 'we deploy on fridays now', theta: 0.2, confidence: 0.4 },
    ]);

    const report = await detect(dbPaths);
    assert.deepEqual(report.pairs.map(keyOf), [`${a}/${b}`]);
    assert.equal(report.pairs[0].rows[0].pinned, 1);
  });

  it('restricts to one project plus the globals when asked', async () => {
    const dbPaths = store();
    await seed(dbPaths, [
      { text: 'here one', theta: 0 },
      { text: 'here two', theta: 0.1 },
      { text: 'elsewhere one', project_key: 'test/other', theta: 0 },
      { text: 'elsewhere two', project_key: 'test/other', theta: 0.1 },
      { text: 'global one', scope: 'global', theta: 0 },
      { text: 'global two', scope: 'global', theta: 0.1 },
    ]);

    assert.equal((await detect(dbPaths)).candidates, 3, 'every scope, three pairs');
    const scoped = await detect(dbPaths, { projectKey: KEY });
    assert.equal(scoped.eligible, 4);
    assert.equal(scoped.candidates, 2, 'this project and the globals, never across');
    assert.equal(scoped.project_key, KEY);
  });

  it('reports the store it read, and says so when there is none', async () => {
    const dbPaths = store();
    const missing = await pairs({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(missing.exists, false);
    assert.equal(missing.candidates, 0);

    await seed(dbPaths, TWIN_ROWS);
    const found = await pairs({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(found.exists, true);
    assert.equal(found.store, dbPaths.dbPath);
    assert.equal(found.pairs.length, 1);
  });
});

describe('the consolidated_at watermark', () => {
  it('stops offering a pair once both members have been consolidated', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, TWIN_ROWS);
    assert.equal((await detect(dbPaths)).candidates, 1);

    await run(dbPaths, (conn) => markConsolidated(conn, ids, { now: NOW, runId: 'cons-1' }));

    const after = await detect(dbPaths);
    assert.equal(after.changed.total, 0, 'nothing has changed since the watermark');
    assert.equal(after.candidates, 0);
    assert.equal(after.pairs.length, 0);
  });

  it('offers it again as soon as either member is restated', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, TWIN_ROWS);
    await run(dbPaths, (conn) => markConsolidated(conn, ids, { now: NOW }));

    // Only the second member moves, and it is the higher id — the pair has to come
    // back whichever side of it changed.
    await run(dbPaths, (conn) =>
      conn.run('UPDATE memories SET updated_at = ? WHERE id = ?', NOW + 60_000, ids[1]));

    const report = await detect(dbPaths, { now: NOW + 120_000 });
    assert.equal(report.changed.total, 1);
    assert.deepEqual(report.pairs.map(keyOf), [`${ids[0]}/${ids[1]}`]);
  });

  it('treats a never-consolidated row as changed, so a fresh store has a backlog', async () => {
    const dbPaths = store();
    await seed(dbPaths, TWIN_ROWS);
    const report = await detect(dbPaths);
    assert.equal(report.changed.total, 3);
    assert.equal(report.changed.examined, 3);
    assert.deepEqual(report.examined_ids.length, 3);
  });

  it('stamps only rows that exist, records the previous values, and writes one event', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, TWIN_ROWS);
    await run(dbPaths, (conn) =>
      conn.run('UPDATE memories SET consolidated_at = ? WHERE id = ?', NOW - 5 * DAY, ids[0]));

    const result = await run(dbPaths, (conn) =>
      markConsolidated(conn, [...ids, 9999], { now: NOW, runId: 'cons-2' }));

    assert.deepEqual(result.ids, ids);
    assert.deepEqual(result.missing, [9999]);
    assert.equal(result.stamped, 3);
    assert.deepEqual(result.previous, { [ids[0]]: NOW - 5 * DAY, [ids[1]]: null, [ids[2]]: null });

    const events = await run(dbPaths, (conn) =>
      conn.all('SELECT memory_id, event, detail FROM memory_events WHERE event = ?', EVENT_CONSOLIDATED));
    assert.equal(events.length, 1, 'one event for the run, not one per row');
    assert.equal(events[0].memory_id, null);
    const detail = JSON.parse(events[0].detail);
    assert.equal(detail.run_id, 'cons-2');
    // Everything an inversion needs is in the detail: which rows, and what they
    // said before.
    assert.deepEqual(detail.ids, ids);
    assert.equal(detail.previous[String(ids[0])], NOW - 5 * DAY);
  });

  it('does not touch updated_at — the watermark would never hold if it did', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, TWIN_ROWS);
    const before = await run(dbPaths, (conn) =>
      conn.all('SELECT id, updated_at, created_at FROM memories ORDER BY id'));

    await run(dbPaths, (conn) => markConsolidated(conn, ids, { now: NOW }));

    const after = await run(dbPaths, (conn) =>
      conn.all('SELECT id, updated_at, created_at FROM memories ORDER BY id'));
    assert.deepEqual(after, before, 'stamping is not a restatement');
    // And the proof that it matters: the changed set is empty straight afterwards.
    assert.equal((await detect(dbPaths)).changed.total, 0);
  });

  it('is a no-op on an empty id list, with nothing in the log', async () => {
    const dbPaths = store();
    await seed(dbPaths, TWIN_ROWS);
    const result = await run(dbPaths, (conn) => markConsolidated(conn, [], { now: NOW }));
    assert.deepEqual(result, { stamped: 0, at: NOW, ids: [], previous: {}, missing: [], eventId: null });
    const events = await run(dbPaths, (conn) => conn.get('SELECT count(*) AS n FROM memory_events'));
    assert.equal(events.n, 0);
  });
});

describe('the changed-row budget', () => {
  // Six rows in one tight cluster: every pair is over the threshold, so the only
  // thing bounding the work is the budget.
  const CLUSTER = Array.from({ length: 6 }, (_, i) => ({ text: `clustered ${i}`, theta: i * 0.05 }));

  it('takes the oldest watermarks first and says what it left', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, CLUSTER);
    // Three rows already consolidated long ago, three never — the never-looked-at
    // ones must lead, because NULL sorts first.
    await run(dbPaths, (conn) =>
      conn.run(
        `UPDATE memories SET consolidated_at = ?, updated_at = ? WHERE id IN (${ids.slice(0, 3).join(', ')})`,
        NOW - 10 * DAY,
        NOW - 9 * DAY,
      ));

    const report = await detect(dbPaths, { changedLimit: 3 });
    assert.equal(report.changed.total, 6);
    assert.equal(report.changed.examined, 3);
    assert.equal(report.changed.truncated, true);
    assert.deepEqual(report.examined_ids, ids.slice(3), 'watermark-first, NULLs leading');
  });

  it('makes progress: what one bounded pass stamped, the next one skips', async () => {
    const dbPaths = store();
    await seed(dbPaths, CLUSTER);

    const first = await detect(dbPaths, { changedLimit: 2 });
    assert.equal(first.changed.truncated, true);
    await run(dbPaths, (conn) => markConsolidated(conn, first.examined_ids, { now: NOW }));

    const second = await detect(dbPaths, { changedLimit: 2 });
    assert.equal(second.changed.total, 4, 'two fewer rows are changed than last time');
    assert.equal(
      second.examined_ids.some((id) => first.examined_ids.includes(id)),
      false,
      'a bounded pass drains the backlog rather than re-reading its head',
    );
  });

  it('caps the pair list without lying about how many are waiting', async () => {
    const dbPaths = store();
    await seed(dbPaths, CLUSTER);

    const report = await detect(dbPaths, { limit: 4 });
    assert.equal(report.candidates, 15, 'six rows in one cluster is fifteen pairs');
    assert.equal(report.fresh, 15);
    assert.equal(report.pairs.length, 4);
    assert.equal(report.truncated, true);
    // Highest similarity first, so a truncated list is the most-alike ones.
    const sims = report.pairs.map((p) => p.similarity);
    assert.deepEqual(sims, [...sims].sort((x, y) => y - x));
  });

  it('has budgets small enough to be bounds and large enough to be useful', () => {
    assert.ok(PAIR_LIMIT >= 20 && PAIR_LIMIT <= 200, 'PLAN batches ~20 a call, 1-3 calls a run');
    assert.ok(CHANGED_LIMIT >= PAIR_LIMIT);
  });
});

describe('the verdict cache', () => {
  const seedPair = async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, TWIN_ROWS);
    return { dbPaths, ids };
  };

  it('keys a pair the same way whichever order it is given in', () => {
    assert.equal(pairKey(7, 3), `${PAIR_PREFIX}3:7`);
    assert.equal(pairKey(3, 7), pairKey(7, 3));
    assert.deepEqual(orderPair(9, 2), { a: 2, b: 9 });
    assert.throws(() => pairKey(4, 4), /cannot pair with itself/);
    assert.throws(() => pairKey(0, 4), /must be a memory id/);
  });

  it('stops offering a judged pair, and counts what it skipped', async () => {
    const { dbPaths, ids } = await seedPair();
    await run(dbPaths, (conn) =>
      cacheVerdict(conn, { a: ids[1], b: ids[0], verdict: 'unrelated', similarity: 0.955, runId: 'cons-3', now: NOW }));

    const report = await detect(dbPaths);
    assert.equal(report.candidates, 1);
    assert.equal(report.cached_skipped, 1);
    assert.equal(report.fresh, 0);
    assert.deepEqual(report.pairs, []);

    const entry = await run(dbPaths, (conn) => readVerdict(conn, ids[0], ids[1]));
    assert.equal(entry.verdict, 'unrelated');
    assert.equal(entry.at, NOW);
    assert.equal(entry.similarity, 0.955);
    assert.equal(entry.run_id, 'cons-3');
    assert.equal(entry.readable, true);
  });

  it('lets the verdict go stale the moment either memory is restated', async () => {
    for (const which of [0, 1]) {
      const { dbPaths, ids } = await seedPair();
      await run(dbPaths, (conn) => cacheVerdict(conn, { a: ids[0], b: ids[1], now: NOW }));
      assert.equal((await detect(dbPaths)).fresh, 0);

      await run(dbPaths, (conn) =>
        conn.run('UPDATE memories SET updated_at = ? WHERE id = ?', NOW + 1000, ids[which]));

      const report = await detect(dbPaths, { now: NOW + 2000 });
      assert.equal(report.cached_skipped, 0, `restating #${which} must reopen the pair`);
      assert.deepEqual(report.pairs.map(keyOf), [`${ids[0]}/${ids[1]}`]);
    }
  });

  it('re-judges rather than trusting a cache entry it cannot read', async () => {
    const { dbPaths, ids } = await seedPair();
    await run(dbPaths, async (conn) => {
      await cacheVerdict(conn, { a: ids[0], b: ids[1], now: NOW });
      // json_extract over a value that is not JSON *throws* in this build (5a.4),
      // so this is a test that detection still runs at all, not just that the
      // pair comes back.
      await conn.run('UPDATE meta SET v = ? WHERE k = ?', 'not json at all', pairKey(ids[0], ids[1]));
    });

    const report = await detect(dbPaths);
    assert.equal(report.cached_skipped, 0);
    assert.equal(report.fresh, 1);

    const entry = await run(dbPaths, (conn) => readVerdict(conn, ids[0], ids[1]));
    assert.equal(entry.readable, false, 'reported as unreadable, not repaired');
  });

  it('re-judges when the entry has no date to compare against', async () => {
    const { dbPaths, ids } = await seedPair();
    await run(dbPaths, async (conn) => {
      await cacheVerdict(conn, { a: ids[0], b: ids[1], now: NOW });
      await conn.run(
        'UPDATE meta SET v = ? WHERE k = ?',
        JSON.stringify({ verdict: 'unrelated' }),
        pairKey(ids[0], ids[1]),
      );
    });
    assert.equal((await detect(dbPaths)).fresh, 1);
  });

  it('records a verdict where `mem show` will find it', async () => {
    const { dbPaths, ids } = await seedPair();
    const result = await run(dbPaths, (conn) =>
      cacheVerdict(conn, { a: ids[1], b: ids[0], verdict: 'complementary', why: 'different projects', now: NOW }));

    assert.equal(result.a, ids[0], 'canonical order, whatever the caller passed');
    assert.equal(result.b, ids[1]);
    assert.equal(result.replaced, null);

    const events = await run(dbPaths, (conn) => memoryEvents(conn, ids[0]));
    const judged = events.find((e) => e.event === EVENT_PAIR_JUDGED);
    assert.ok(judged, 'the lower id carries the receipt');
    assert.equal(judged.detail.verdict, 'complementary');
    assert.equal(judged.detail.why, 'different projects');
    assert.equal(judged.detail.pair, pairKey(ids[0], ids[1]));
  });

  it('overwrites a previous verdict and says what it was', async () => {
    const { dbPaths, ids } = await seedPair();
    await run(dbPaths, async (conn) => {
      await cacheVerdict(conn, { a: ids[0], b: ids[1], verdict: 'unrelated', now: NOW });
      const second = await cacheVerdict(conn, { a: ids[0], b: ids[1], verdict: 'refinement', now: NOW + DAY });
      assert.equal(second.replaced.verdict, 'unrelated');
      assert.equal(second.verdict, 'refinement');
    });
    const cache = await run(dbPaths, (conn) => readPairCache(conn));
    assert.equal(cache.length, 1, 'one entry per pair, not one per judgement');
    assert.equal(cache[0].verdict, 'refinement');
  });

  it('refuses a verdict it cannot mean', async () => {
    const { dbPaths, ids } = await seedPair();
    await run(dbPaths, async (conn) => {
      await assert.rejects(
        () => cacheVerdict(conn, { a: ids[0], b: ids[1], verdict: 'maybe' }),
        /verdict must be one of/,
      );
      // A typo'd id would suppress a real contradiction forever.
      await assert.rejects(
        () => cacheVerdict(conn, { a: ids[0], b: 4242 }),
        /no memory #4242/,
      );
      await assert.rejects(() => cacheVerdict(conn, { a: ids[0], b: ids[0] }), /cannot pair with itself/);
    });
    assert.deepEqual(await run(dbPaths, (conn) => readPairCache(conn)), []);
  });

  it('drops one verdict and offers the pair again', async () => {
    const { dbPaths, ids } = await seedPair();
    await run(dbPaths, (conn) => cacheVerdict(conn, { a: ids[0], b: ids[1], now: NOW }));
    assert.equal((await detect(dbPaths)).fresh, 0);

    const dropped = await run(dbPaths, (conn) => dropVerdict(conn, ids[1], ids[0]));
    assert.equal(dropped.dropped, true);
    assert.equal(dropped.previous.verdict, 'unrelated');
    assert.equal((await detect(dbPaths)).fresh, 1);

    const again = await run(dbPaths, (conn) => dropVerdict(conn, ids[0], ids[1]));
    assert.equal(again.dropped, false);
  });

  it('takes a purged memory\'s verdicts with it, and only its own', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, [
      { text: 'one', theta: 0 },
      { text: 'two', theta: 0.1 },
      { text: 'three', theta: 0.2 },
    ]);

    await run(dbPaths, async (conn) => {
      await cacheVerdict(conn, { a: ids[0], b: ids[1], now: NOW });
      await cacheVerdict(conn, { a: ids[1], b: ids[2], now: NOW });
      // Rung 4, by hand — the only thing that ever deletes a row. SQLite hands the
      // next insert this id back, so a leftover entry would suppress a pair
      // between two memories that never met.
      const purged = await forgetMemory(conn, String(ids[1]), { hard: true, now: NOW });
      assert.deepEqual(purged.verdictsDeleted.sort(), [
        pairKey(ids[0], ids[1]),
        pairKey(ids[1], ids[2]),
      ].sort());
    });

    assert.deepEqual(await run(dbPaths, (conn) => readPairCache(conn)), []);
  });

  it('matches ids exactly, digits and all', async () => {
    const dbPaths = store();
    await seed(dbPaths, TWIN_ROWS);
    await run(dbPaths, async (conn) => {
      // Hand-written keys around id 5, the shapes the LIKE patterns could confuse:
      // pair:5:% must not take pair:50:7, and pair:%:5 must not take pair:1:52.
      for (const key of ['pair:5:9', 'pair:50:7', 'pair:1:52', 'pair:1:5']) {
        await conn.run('INSERT INTO meta(k, v) VALUES (?, ?)', key, JSON.stringify({ at: NOW }));
      }
      const dropped = await dropVerdictsFor(conn, 5);
      assert.deepEqual(dropped.sort(), ['pair:1:5', 'pair:5:9']);
    });
  });

  it('agrees with the resolution table about which verdicts can be recorded by hand', () => {
    assert.deepEqual(VERDICTS, ['duplicate', 'contradiction', 'refinement', 'complementary', 'unrelated']);
    // A duplicate merges and a contradiction supersedes: recording either as a
    // cache entry alone would say "settled" while the store still held both.
    assert.deepEqual(KEEP_BOTH_VERDICTS, ['refinement', 'complementary', 'unrelated']);
  });

  it('is the one threshold, shared with the gauge in `mem stats`', () => {
    assert.equal(PAIR_THRESHOLD, 0.85);
    assert.equal(STATS_PAIR_THRESHOLD, PAIR_THRESHOLD);
  });
});

describe('the CLI', () => {
  const home = mkdtempSync(join(tmpdir(), 'mem-pairs-cli-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  // Deps only. Nothing in this command embeds anything, which is the point of
  // symlinking no model cache: `mem pairs` has to work on a cold machine.
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));

  const CLI = join(paths.pluginRoot, 'bin', 'mem');
  const cliPaths = { ...paths, dataDir: home, dbPath: join(home, 'mem.db') };
  const mem = (...argv) =>
    spawnSync(process.execPath, [CLI, ...argv], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_DATA: home, MEM_PROJECT_KEY: KEY, MEM_NO_INSTALL: '1' },
    });

  let ids = [];
  before(async () => {
    ids = await seed(cliPaths, TWIN_ROWS);
  });

  it('lists, settles a pair by hand, then stops listing it', () => {
    const listed = mem('pairs', '--json');
    assert.equal(listed.status, 0, listed.stderr);
    const report = JSON.parse(listed.stdout);
    assert.equal(report.pairs.length, 1);
    assert.equal(report.pairs[0].a, ids[0]);

    const text = mem('pairs');
    assert.match(text.stdout, /candidate pairs ≥ 0.85/);
    assert.match(text.stdout, new RegExp(`#${ids[0]} / #${ids[1]}`));
    assert.match(text.stdout, /cosine cannot tell a duplicate from a contradiction/);

    const judged = mem('pairs', 'unrelated', String(ids[0]), String(ids[1]), '--why', 'different tools');
    assert.equal(judged.status, 0, judged.stderr);
    assert.match(judged.stdout, /recorded as unrelated/);

    const after2 = JSON.parse(mem('pairs', '--json').stdout);
    assert.equal(after2.pairs.length, 0);
    assert.equal(after2.cached_skipped, 1);

    const cached = mem('pairs', '--cached');
    assert.equal(cached.status, 0, cached.stderr);
    assert.match(cached.stdout, /unrelated/);
    assert.match(cached.stdout, new RegExp(`#${ids[0]} / #${ids[1]}`));
  });

  it('refuses a verdict only a consolidation run could honour', () => {
    const bad = mem('pairs', 'duplicate', String(ids[0]), String(ids[1]));
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /changes both memories/);

    const nonsense = mem('pairs', 'probably', String(ids[0]), String(ids[1]));
    assert.equal(nonsense.status, 1);
    assert.match(nonsense.stderr, /is not a verdict/);

    const short = mem('pairs', 'unrelated', String(ids[0]));
    assert.equal(short.status, 1);
    assert.match(short.stderr, /usage: mem pairs unrelated/);
  });
});

describe('the maintenance tier reports the backlog', () => {
  it('counts candidates without judging or stamping anything', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, TWIN_ROWS);

    const report = await maintain({ paths: dbPaths, env: ENV, now: NOW });
    const step = report.steps.find((s) => s.step === 'pairs');
    assert.equal(step.candidates, 1);
    assert.equal(step.fresh, 1);
    assert.equal(step.cached_skipped, 0);
    assert.equal(step.threshold, PAIR_THRESHOLD);
    assert.equal(step.changed, 0, 'the step changes nothing');
    assert.deepEqual(step.worst.map((p) => [p.a, p.b]), [[ids[0], ids[1]]]);

    // THE POINT: a pass that stamped what it merely counted would empty tier 2's
    // queue without an LLM ever seeing it.
    const rows = await run(dbPaths, (conn) =>
      conn.all('SELECT consolidated_at FROM memories ORDER BY id'));
    assert.deepEqual(rows.map((r) => r.consolidated_at), [null, null, null]);
    assert.equal((await detect(dbPaths)).candidates, 1);
  });
});
