// The decay model — PLAN's "Decay: spaced repetition, not a linear timer".
//
// Half of this file checks the formula against the numbers PLAN states outright
// (halflife 30 days unused, ~88 after five uses, retention 0.5 at one halflife,
// pinned pegged at 1.0). The other half is the reason decay.mjs exists at all:
// the model is written twice, once in JS for rows already fetched and once in
// SQL for rows that must be filtered and ordered before they are fetched, and
// two copies of a formula in two languages drift. So they are run against each
// other over a matrix of rows and required to agree to 1e-12 — not "close
// enough", because an epsilon that has to be widened later is a bug nobody goes
// back and investigates.
//
// Like manage.test.mjs, nothing here loads the embedding model: rows are seeded
// through SQL with a synthetic vector.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import {
  DAY_MS,
  DECAY_COLUMNS,
  HALFLIFE_ALPHA,
  HALFLIFE_H0,
  ageDaysSql,
  decaySql,
  halflifeDays,
  retention,
  retentionSql,
  strength,
  strengthSql,
} from '../../src/decay.mjs';
import { EMB_DIM, EMB_MODEL } from '../../src/embed.mjs';
import { listMemories } from '../../src/manage.mjs';
import { resolvePaths } from '../../src/paths.mjs';

const paths = resolvePaths();
const scratch = mkdtempSync(join(tmpdir(), 'mem-decay-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const scratchPaths = () => ({ ...paths, dbPath: join(scratch, `decay-${n++}.db`) });
const ENV = { MEM_PROJECT_KEY: 'test/decay' };
const NOW = 1_750_000_000_000;
const DAY = DAY_MS;

function fakeVector(seed) {
  const v = new Float32Array(EMB_DIM);
  for (let i = 0; i < EMB_DIM; i += 1) v[i] = Math.sin(seed * (i + 1));
  return Buffer.from(v.buffer);
}

const SEED_SQL = `
  INSERT INTO memories (uid, kind, scope, project_key, text, emb, emb_model, emb_dim,
                        salience, confidence, pinned, status,
                        created_at, updated_at, last_used_at, useful_count, injected_count)
  VALUES (?, 'fact', 'project', 'test/decay', ?, vector32(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`;

async function seed(dbPaths, rows) {
  return withDb(async (conn) => {
    const ids = [];
    for (const [i, row] of rows.entries()) {
      const r = {
        text: `memory ${i}`,
        salience: 0.5,
        confidence: 0.5,
        pinned: 0,
        status: 'active',
        created_at: NOW - DAY,
        updated_at: NOW - DAY,
        last_used_at: null,
        useful_count: 0,
        ...row,
      };
      const info = await conn.run(
        SEED_SQL,
        `uid-${i}`, r.text, fakeVector(i + 1), EMB_MODEL, EMB_DIM,
        r.salience, r.confidence, r.pinned, r.status,
        r.created_at, r.updated_at, r.last_used_at, r.useful_count,
      );
      ids.push(info.lastInsertRowid);
    }
    return ids;
  }, { paths: dbPaths, env: ENV });
}

describe('halflifeDays', () => {
  it('is H0 for a memory that has never proved useful', () => {
    assert.equal(halflifeDays(0), HALFLIFE_H0);
    assert.equal(halflifeDays(0), 30);
  });

  // PLAN: "Used 5×: halflife ≈ 87 days."
  it('reaches ~88 days after five uses, as PLAN states', () => {
    assert.ok(Math.abs(halflifeDays(5) - 87.9) < 0.5, `got ${halflifeDays(5)}`);
  });

  it('grows monotonically with use', () => {
    for (let k = 0; k < 20; k += 1) assert.ok(halflifeDays(k + 1) > halflifeDays(k));
  });

  // Sublinear on purpose: α = 0.6, so the hundredth use is worth far less than
  // the second. Without that a single much-used memory would outlive everything.
  it('grows sublinearly — the hundredth use buys less than the first', () => {
    const first = halflifeDays(1) - halflifeDays(0);
    const hundredth = halflifeDays(100) - halflifeDays(99);
    assert.ok(hundredth < first, `${hundredth} should be under ${first}`);
    assert.ok(halflifeDays(100) < 100 * HALFLIFE_H0);
  });

  it('takes overrides, so a tuning pass does not have to edit the module', () => {
    assert.equal(halflifeDays(0, { h0: 10 }), 10);
    assert.equal(halflifeDays(3, { h0: 1, alpha: 1 }), 4);
    assert.equal(HALFLIFE_ALPHA, 0.6);
  });

  it('treats a missing or negative count as never used', () => {
    assert.equal(halflifeDays(null), HALFLIFE_H0);
    assert.equal(halflifeDays(undefined), HALFLIFE_H0);
    assert.equal(halflifeDays(-5), HALFLIFE_H0);
  });
});

describe('retention', () => {
  const aged = (days, extra = {}) => ({
    pinned: 0,
    useful_count: 0,
    last_used_at: NOW - days * DAY,
    ...extra,
  });

  // PLAN: "Never used: retention 0.5 at 30 days, 0.25 at 60."
  it('halves at one halflife and quarters at two, exactly as PLAN says', () => {
    assert.ok(Math.abs(retention(aged(0), NOW) - 1) < 1e-12);
    assert.ok(Math.abs(retention(aged(30), NOW) - 0.5) < 1e-12);
    assert.ok(Math.abs(retention(aged(60), NOW) - 0.25) < 1e-12);
  });

  it('decays more slowly for a memory that keeps proving useful', () => {
    const cold = retention(aged(60), NOW);
    const warm = retention(aged(60, { useful_count: 5 }), NOW);
    assert.ok(warm > cold, `${warm} should beat ${cold}`);
    // Five uses put the halflife past 60 days, so it has not even halved yet.
    assert.ok(warm > 0.5);
  });

  // PLAN: "`pinned = 1` forces retention to 1.0 — never decays, never pruned,
  // exempt from all automatic actions."
  it('is pegged at 1.0 for a pinned memory, however old', () => {
    assert.equal(retention(aged(3650, { pinned: 1 }), NOW), 1);
    assert.equal(retention(aged(3650, { pinned: 1, useful_count: 0 }), NOW), 1);
  });

  it('falls back through last_used_at → updated_at → created_at', () => {
    const used = retention({ pinned: 0, useful_count: 0, last_used_at: NOW, updated_at: NOW - 90 * DAY }, NOW);
    assert.ok(Math.abs(used - 1) < 1e-12, 'last_used_at wins when present');

    const written = retention({ pinned: 0, useful_count: 0, last_used_at: null, updated_at: NOW - 30 * DAY }, NOW);
    assert.ok(Math.abs(written - 0.5) < 1e-12, 'updated_at is next');

    const created = retention(
      { pinned: 0, useful_count: 0, last_used_at: null, updated_at: null, created_at: NOW - 60 * DAY },
      NOW,
    );
    assert.ok(Math.abs(created - 0.25) < 1e-12, 'created_at last');
  });

  // A row with no timestamps at all is undecayed rather than infinitely old:
  // only import can produce one, and inventing decay for it would be worse.
  it('treats a row with no timestamps as written this instant', () => {
    assert.equal(retention({ pinned: 0, useful_count: 0 }, NOW), 1);
  });

  it('never exceeds 1 for a clock that ran backwards', () => {
    assert.equal(retention(aged(-100), NOW), 1);
  });
});

describe('strength', () => {
  it('is salience × retention × confidence', () => {
    const row = { salience: 0.8, confidence: 0.5, pinned: 1, useful_count: 0, last_used_at: NOW };
    assert.ok(Math.abs(strength(row, NOW) - 0.4) < 1e-12);
  });

  it('clamps salience and confidence into [0, 1]', () => {
    const wild = { salience: 5, confidence: -2, pinned: 1, last_used_at: NOW, useful_count: 0 };
    assert.equal(strength(wild, NOW), 0);
    const high = { salience: 5, confidence: 5, pinned: 1, last_used_at: NOW, useful_count: 0 };
    assert.equal(strength(high, NOW), 1);
  });

  // The whole point of the replacement in the search boost: two memories the
  // writer rated identically must not rank identically a month later.
  it('separates two equally-salient memories by how recently they were used', () => {
    const base = { salience: 0.9, confidence: 0.9, pinned: 0, useful_count: 0 };
    const fresh = strength({ ...base, last_used_at: NOW - DAY }, NOW);
    const stale = strength({ ...base, last_used_at: NOW - 120 * DAY }, NOW);
    assert.ok(fresh > stale * 4, `${fresh} vs ${stale}`);
    assert.ok(fresh <= 0.81 && fresh > 0.79);
  });
});

// The reason this module exists: one model, two languages, and a test that fails
// when they part company.
describe('the SQL twin agrees with the JS', () => {
  // Deliberately includes the awkward rows — nulls the JS side handles with `??`
  // and `clamp01`, which SQL would otherwise propagate into a NULL strength that
  // sorts ahead of every real one in an ASC order. `useful_count` is not among
  // them because the schema declares it NOT NULL and the insert is rejected; the
  // `coalesce` around it in decaySql is for a LEFT JOIN, not for a stored row.
  const MATRIX = [
    { label: 'default, a day old' },
    { label: 'fresh', last_used_at: NOW },
    { label: 'one halflife', last_used_at: NOW - 30 * DAY },
    { label: 'two halflives', last_used_at: NOW - 60 * DAY },
    { label: 'ancient', last_used_at: NOW - 3650 * DAY },
    { label: 'pinned and ancient', pinned: 1, last_used_at: NOW - 3650 * DAY },
    { label: 'used five times', useful_count: 5, last_used_at: NOW - 60 * DAY },
    { label: 'used a hundred times', useful_count: 100, last_used_at: NOW - 400 * DAY },
    { label: 'no last_used_at', last_used_at: null, updated_at: NOW - 45 * DAY },
    { label: 'no last_used_at or updated_at', last_used_at: null, updated_at: null, created_at: NOW - 15 * DAY },
    { label: 'no timestamps at all', last_used_at: null, updated_at: null, created_at: null },
    { label: 'zero salience', salience: 0 },
    { label: 'zero confidence', confidence: 0 },
    { label: 'full marks', salience: 1, confidence: 1, last_used_at: NOW - 7 * DAY },
    { label: 'lopsided', salience: 0.13, confidence: 0.87, last_used_at: NOW - 3 * DAY },
    { label: 'used in the future', last_used_at: NOW + 10 * DAY },
    { label: 'pinned = 2', pinned: 2, last_used_at: NOW - 500 * DAY },
  ];

  it('matches to 1e-12 over every row shape that exists', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, MATRIX);

    const sql = decaySql({ now: NOW });
    const rows = await withDb(
      (conn) =>
        conn.all(
          `SELECT id, ${DECAY_COLUMNS.join(', ')},
                  ${sql.retention} AS sql_retention,
                  ${sql.strength}  AS sql_strength
             FROM memories ORDER BY id`,
        ),
      { paths: dbPaths, env: ENV },
    );

    assert.equal(rows.length, MATRIX.length);
    rows.forEach((row, i) => {
      const label = MATRIX[i].label;
      const jsRetention = retention(row, NOW);
      const jsStrength = strength(row, NOW);
      assert.ok(
        Math.abs(row.sql_retention - jsRetention) < 1e-12,
        `${label}: retention SQL ${row.sql_retention} vs JS ${jsRetention}`,
      );
      assert.ok(
        Math.abs(row.sql_strength - jsStrength) < 1e-12,
        `${label}: strength SQL ${row.sql_strength} vs JS ${jsStrength}`,
      );
      assert.ok(row.sql_strength !== null, `${label}: strength must never be NULL`);
    });
  });

  it('orders identically to the JS, which is what --sort strength depends on', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, MATRIX);

    const fromSql = await withDb(
      (conn) => conn.all(`SELECT id FROM memories ORDER BY ${strengthSql({ now: NOW })} DESC, id ASC`),
      { paths: dbPaths, env: ENV },
    );
    const fromJs = MATRIX.map((row, i) => ({
      id: ids[i],
      strength: strength(
        {
          salience: 0.5, confidence: 0.5, pinned: 0, useful_count: 0,
          created_at: NOW - DAY, updated_at: NOW - DAY, last_used_at: null,
          ...row,
        },
        NOW,
      ),
    }))
      .sort((a, b) => b.strength - a.strength || a.id - b.id)
      .map((r) => r.id);

    assert.deepEqual(fromSql.map((r) => r.id), fromJs);
  });

  it('pins to exactly 1.0 in SQL too, not merely close to it', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { pinned: 1, last_used_at: NOW - 3650 * DAY, salience: 0.6, confidence: 0.5 },
    ]);
    const row = await withDb(
      (conn) =>
        conn.get(
          `SELECT ${retentionSql({ now: NOW })} AS r, ${strengthSql({ now: NOW })} AS s FROM memories`,
        ),
      { paths: dbPaths, env: ENV },
    );
    assert.equal(row.r, 1);
    assert.ok(Math.abs(row.s - 0.3) < 1e-12);
  });

  it('honours the same overrides on both sides', async () => {
    const dbPaths = scratchPaths();
    const opts = { now: NOW, h0: 10, alpha: 1 };
    await seed(dbPaths, [{ useful_count: 3, last_used_at: NOW - 40 * DAY }]);
    const row = await withDb(
      (conn) => conn.get(`SELECT ${retentionSql(opts)} AS r FROM memories`),
      { paths: dbPaths, env: ENV },
    );
    const js = retention(
      { pinned: 0, useful_count: 3, last_used_at: NOW - 40 * DAY },
      NOW,
      { h0: 10, alpha: 1 },
    );
    assert.ok(Math.abs(row.r - js) < 1e-12, `${row.r} vs ${js}`);
  });

  it('measures age from created_at, which is not the decay clock', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ created_at: NOW - 90 * DAY, updated_at: NOW - DAY, last_used_at: NOW }]);
    const row = await withDb(
      (conn) => conn.get(`SELECT ${ageDaysSql({ now: NOW })} AS age FROM memories`),
      { paths: dbPaths, env: ENV },
    );
    assert.ok(Math.abs(row.age - 90) < 1e-9, `got ${row.age}`);
  });
});

describe('SQL literals', () => {
  // Only numbers this module generated ever reach the interpolation, and the
  // guard is what keeps that true.
  it('refuses anything that is not a finite number', () => {
    assert.throws(() => decaySql({ now: 'now' }), TypeError);
    assert.throws(() => decaySql({ now: NaN }), TypeError);
    assert.throws(() => decaySql({ now: Infinity }), TypeError);
    // Number(null) is 0 and Number('') is 0, so a coercing guard would inline a
    // missing option as a plausible-looking zero instead of complaining.
    assert.throws(() => decaySql({ alpha: null }), TypeError);
    assert.throws(() => decaySql({ h0: '30' }), TypeError);
    assert.throws(() => decaySql({ now: 1e21 }), RangeError);
    assert.throws(() => ageDaysSql({ now: 'yesterday' }), TypeError);
  });

  it('qualifies columns when asked, so it can go in a joined query', () => {
    const sql = strengthSql({ now: NOW, prefix: 'm.' });
    assert.ok(sql.includes('m.salience'));
    assert.ok(sql.includes('m.last_used_at'));
    assert.ok(!/[^.]\bsalience\b/.test(sql.replaceAll('m.salience', '')));
  });

  it('names every column it reads', () => {
    const sql = strengthSql({ now: NOW });
    for (const column of DECAY_COLUMNS) assert.ok(sql.includes(column), `missing ${column}`);
  });
});

// The user-facing half: strength is a filter now, not only a sort. This is the
// query shape phase 5a.3's archiving rule takes, run by hand first.
describe('listMemories bounds on strength', () => {
  // Strengths, so the bounds below are not magic numbers:
  //   fresh    0.9 × 1     × 0.9 = 0.81
  //   pinned   0.6 × 1     × 0.6 = 0.36     ← retention pegged despite ten years
  //   middling 0.5 × 0.5   × 0.5 = 0.125    ← one halflife
  //   stale    0.4 × 2^-10 × 0.4 = 0.00016  ← ten halflives
  const STORE = [
    { text: 'fresh and strong', salience: 0.9, confidence: 0.9, last_used_at: NOW },
    { text: 'middling', salience: 0.5, confidence: 0.5, last_used_at: NOW - 30 * DAY },
    { text: 'stale', salience: 0.4, confidence: 0.4, last_used_at: NOW - 300 * DAY },
    { text: 'pinned and ancient', pinned: 1, salience: 0.6, confidence: 0.6, last_used_at: NOW - 3650 * DAY },
  ];

  it('sorts by strength in SQL, strongest first', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, STORE);
    const { rows, total } = await withDb(
      (conn) => listMemories(conn, { sort: 'strength', now: NOW, scope: 'all' }),
      { paths: dbPaths, env: ENV },
    );
    assert.equal(total, 4);
    assert.deepEqual(rows.map((r) => r.text), [
      'fresh and strong',
      'pinned and ancient',
      'middling',
      'stale',
    ]);
  });

  // Pagination is the thing the old JS sort could only fake.
  it('paginates a strength sort in the database', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, STORE);
    const page = await withDb(
      (conn) => listMemories(conn, { sort: 'strength', now: NOW, scope: 'all', limit: 2, offset: 1 }),
      { paths: dbPaths, env: ENV },
    );
    assert.equal(page.total, 4);
    assert.deepEqual(page.rows.map((r) => r.text), ['pinned and ancient', 'middling']);
  });

  // The pinned row is older than everything and would top any age-ordered list;
  // it is out of this one because retention is pegged, which is what PLAN means
  // by "exempt from all automatic actions".
  it('finds what has gone stale, and leaves the pinned row out of it', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, STORE);
    const { rows, total } = await withDb(
      (conn) => listMemories(conn, { maxStrength: 0.01, now: NOW, scope: 'all' }),
      { paths: dbPaths, env: ENV },
    );
    assert.equal(total, 1);
    assert.deepEqual(rows.map((r) => r.text), ['stale']);
  });

  it('bounds from below too, and the two compose', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, STORE);
    const both = await withDb(
      (conn) => listMemories(conn, { minStrength: 0.01, maxStrength: 0.15, now: NOW, scope: 'all' }),
      { paths: dbPaths, env: ENV },
    );
    assert.deepEqual(both.rows.map((r) => r.text), ['middling']);
  });

  it('agrees with the strength it then reports for each row', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, STORE);
    const { rows } = await withDb(
      (conn) => listMemories(conn, { minStrength: 0.3, now: NOW, scope: 'all' }),
      { paths: dbPaths, env: ENV },
    );
    assert.ok(rows.length > 0);
    for (const row of rows) assert.ok(row.strength >= 0.3, `${row.text} at ${row.strength}`);
  });

  // `--min-strength 15` meaning 0.15 is the typo this refuses.
  it('rejects a bound outside [0, 1] rather than matching nothing', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, STORE);
    await withDb(
      async (conn) => {
        await assert.rejects(
          () => listMemories(conn, { minStrength: 15, now: NOW }),
          /between 0 and 1/,
        );
        await assert.rejects(
          () => listMemories(conn, { maxStrength: 'stale', now: NOW }),
          /between 0 and 1/,
        );
      },
      { paths: dbPaths, env: ENV },
    );
  });
});
