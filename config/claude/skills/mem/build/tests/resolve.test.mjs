// Resolution — PLAN's table, its guard, and the review queue the guard routes to.
//
// The tests are weighted the way the risk is. Applying a resolution is a handful
// of UPDATEs and each has one test; NOT applying one has six, because every way
// this file can be wrong is a memory that quietly stops existing:
//
//   the guard lets a pinned memory be retired by a newer one          (PLAN's own case)
//   the guard lets a confident memory be retired by an unsure one
//   a refinement is resolved as a contradiction and a true fact goes
//   a dry run writes something, so "preview" silences a pair
//   an unjudged pair gets a verdict cached and is never offered again
//   the watermark advances over pairs nobody judged                   (5b.1's one rule)
//
// Vectors are hand-built at a known angle, as in pairs.test.mjs, so a pair sits
// where the test wants it and no embedding model is needed — resolution is
// deliberately model-free and the suite proves it by never warming one.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { EMB_DIM, EMB_MODEL } from '../../src/embed.mjs';
import { forgetMemory, memoryEvents } from '../../src/manage.mjs';
import { detectPairs, readVerdict } from '../../src/pairs.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import {
  AUTO_CLASSES,
  DEMOTE_FACTOR,
  GUARD_CONFIDENCE_MARGIN,
  PROPOSAL_PREFIX,
  applyPlan,
  betterWorded,
  byAge,
  consolidatePairs,
  consolidationProposals,
  planPair,
  readProposal,
  readProposals,
} from '../../src/resolve.mjs';
import { discard as discardItems, promote as promoteItems, review as reviewQueue } from '../../src/review.mjs';

const paths = resolvePaths();
const scratch = mkdtempSync(join(tmpdir(), 'mem-resolve-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const store = () => ({ ...paths, dbPath: join(scratch, `resolve-${n++}.db`) });
const ENV = { MEM_PROJECT_KEY: 'test/resolve' };
const KEY = 'test/resolve';
const NOW = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function vec(theta) {
  const v = new Float32Array(EMB_DIM);
  v[0] = Math.cos(theta);
  v[1] = Math.sin(theta);
  return Buffer.from(v.buffer);
}

const SEED_SQL = `
  INSERT INTO memories (uid, kind, scope, project_key, text, why, emb, emb_model, emb_dim,
                        salience, confidence, pinned, status,
                        created_at, updated_at, consolidated_at,
                        injected_count, useful_count, last_used_at, last_injected_at)
  VALUES (?, ?, ?, ?, ?, ?, vector32(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

async function seed(dbPaths, rows) {
  return withDb(
    async (conn) => {
      const ids = [];
      for (const [i, row] of rows.entries()) {
        const r = {
          uid: `uid-${i}`,
          kind: 'preference',
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
          injected_count: 0,
          useful_count: 0,
          last_used_at: null,
          last_injected_at: null,
          ...row,
        };
        // A row written once has updated_at == created_at; several tests below are
        // about the decay clock NOT moving, and a fixture that sets them apart by
        // default would make those assertions about the fixture instead.
        if (row.updated_at === undefined) r.updated_at = r.created_at;
        if (r.scope === 'global') r.project_key = null;
        const info = await conn.run(
          SEED_SQL,
          r.uid, r.kind, r.scope, r.project_key, r.text, r.why, vec(r.theta), EMB_MODEL, EMB_DIM,
          r.salience, r.confidence, r.pinned, r.status,
          r.created_at, r.updated_at, r.consolidated_at,
          r.injected_count, r.useful_count, r.last_used_at, r.last_injected_at,
        );
        ids.push(Number(info.lastInsertRowid));
      }
      return ids;
    },
    { paths: dbPaths, env: ENV },
  );
}

const run = (dbPaths, fn) => withDb(fn, { paths: dbPaths, env: ENV });
const rowOf = (conn, id) => conn.get('SELECT * FROM memories WHERE id = ?', id);
const onePair = (conn) => detectPairs(conn, { now: NOW }).then((r) => r.pairs[0]);

/** A judge that answers every pair the same way. Stands in for `judgePairs`. */
const judging = (classOf, { general = null, errors = [], unjudged = [] } = {}) => {
  const judge = async (pairs) => {
    judge.saw = pairs.map((p) => p.key);
    const verdicts = new Map();
    for (const pair of pairs) {
      if (unjudged.includes(pair.key)) continue;
      verdicts.set(pair.key, {
        pair: pair.key,
        class: typeof classOf === 'function' ? classOf(pair) : classOf,
        why: 'because the test says so',
        general,
      });
    }
    return {
      verdicts,
      calls: 1,
      judged: verdicts.size,
      unjudged: [...unjudged],
      unknown: [],
      invalid: [],
      errors: [...errors],
    };
  };
  return judge;
};

/** Two near-identical rows (cos 0.955): the pair every test below starts from. */
const TWINS = [
  { text: 'use pnpm', theta: 0, created_at: NOW - 90 * DAY },
  { text: 'use pnpm, never npm, it is the only installer we support', theta: 0.3, created_at: NOW - DAY },
];

const consolidate = (dbPaths, opts = {}) =>
  run(dbPaths, (conn) => consolidatePairs(conn, { now: NOW, runId: 'test-run', ...opts }));

describe('who is older, who is better worded', () => {
  const row = (id, text, created_at) => ({ id, text, created_at });

  it('reads age from created_at, with the id as the tie-break', () => {
    const older = row(1, 'a', NOW - DAY);
    const newer = row(2, 'b', NOW);
    assert.equal(byAge([newer, older]).older.id, 1);
    assert.equal(byAge([older, newer]).newer.id, 2);
    assert.equal(byAge([row(7, 'a', NOW), row(3, 'b', NOW)]).older.id, 3, 'same ms, lower id is older');
  });

  it('keeps the longer wording, and the older row when there is nothing to choose', () => {
    assert.equal(betterWorded([row(1, 'short', NOW - DAY), row(2, 'much longer text', NOW)]).id, 2);
    assert.equal(betterWorded([row(1, 'aaaa', NOW - DAY), row(2, 'bbbb', NOW)]).id, 1);
  });
});

describe('PLAN\'s guard', () => {
  const planFor = async (dbPaths, klass, opts = {}) => {
    const pair = await run(dbPaths, onePair);
    return planPair(pair, { class: klass, why: 'w', general: null }, opts);
  };

  it('routes a contradiction that would retire a PINNED older memory', async () => {
    const dbPaths = store();
    await seed(dbPaths, [{ ...TWINS[0], pinned: 1 }, TWINS[1]]);

    const plan = await planFor(dbPaths, 'contradiction');
    assert.equal(plan.action, 'supersede');
    assert.equal(plan.route, 'review');
    assert.equal(plan.guard.reason, 'older-pinned');
  });

  it('routes when the older memory is more than 0.3 more confident', async () => {
    const dbPaths = store();
    await seed(dbPaths, [{ ...TWINS[0], confidence: 0.9 }, { ...TWINS[1], confidence: 0.5 }]);

    const plan = await planFor(dbPaths, 'contradiction');
    assert.equal(plan.route, 'review');
    assert.equal(plan.guard.reason, 'older-more-confident');
    assert.equal(plan.guard.gap, 0.4);
  });

  it('does not route at exactly 0.3 — "more than" is more than', async () => {
    const dbPaths = store();
    await seed(dbPaths, [{ ...TWINS[0], confidence: 0.8 }, { ...TWINS[1], confidence: 0.5 }]);

    const plan = await planFor(dbPaths, 'duplicate');
    assert.equal(GUARD_CONFIDENCE_MARGIN, 0.3);
    assert.equal(plan.guard, null);
    assert.equal(plan.route, 'apply');
  });

  it('never lets a confident NEWER memory be blocked by an unsure old one', async () => {
    const dbPaths = store();
    await seed(dbPaths, [{ ...TWINS[0], confidence: 0.2 }, { ...TWINS[1], confidence: 0.95 }]);

    const plan = await planFor(dbPaths, 'contradiction');
    // The guard is one-directional: this is the case the whole subsystem is for.
    assert.equal(plan.guard, null);
  });

  it('routes when the resolution would change a pinned row whichever one it is', async () => {
    const dbPaths = store();
    // The NEWER row is pinned and is the one a duplicate merge would retire.
    await seed(dbPaths, [
      { ...TWINS[0], text: 'use pnpm for everything in this repo, no exceptions' },
      { ...TWINS[1], text: 'use pnpm', pinned: 1 },
    ]);

    const plan = await planFor(dbPaths, 'duplicate');
    assert.equal(plan.route, 'review');
    assert.equal(plan.guard.reason, 'pinned-row-changed');
  });

  it('leaves the keep-both classes alone: nothing is touched, nothing to guard', async () => {
    const dbPaths = store();
    await seed(dbPaths, [{ ...TWINS[0], pinned: 1 }, TWINS[1]]);

    const plan = await planFor(dbPaths, 'unrelated');
    assert.equal(plan.action, 'none');
    assert.equal(plan.guard, null);
    assert.equal(plan.route, 'apply');
  });

  it('sends every contradiction to a human even with no guard reason at all', async () => {
    const dbPaths = store();
    await seed(dbPaths, TWINS);

    const plan = await planFor(dbPaths, 'contradiction');
    assert.equal(plan.guard, null, 'nothing about these rows trips the guard');
    assert.equal(plan.auto, false);
    assert.equal(plan.route, 'review', 'contradictions route by policy, not by guard');
    assert.ok(!AUTO_CLASSES.includes('contradiction'));
  });
});

describe('the resolution table', () => {
  it('duplicate: merges into the better-worded one, sums counts, keeps the earliest created_at', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, [
      { ...TWINS[0], injected_count: 3, useful_count: 2, salience: 0.4, confidence: 0.6, why: 'a longer rationale' },
      { ...TWINS[1], injected_count: 5, useful_count: 1, salience: 0.7, confidence: 0.5 },
    ]);

    const report = await consolidate(dbPaths, { apply: true, judge: judging('duplicate') });
    assert.equal(report.applied.length, 1);
    const [result] = report.applied;
    assert.equal(result.action, 'merge');
    assert.equal(result.survivor, b, 'the longer wording survives');
    assert.equal(result.loser, a);

    await run(dbPaths, async (conn) => {
      const survivor = await rowOf(conn, b);
      const loser = await rowOf(conn, a);
      assert.equal(survivor.text, 'use pnpm, never npm, it is the only installer we support');
      assert.equal(survivor.injected_count, 8, 'counts are summed');
      assert.equal(survivor.useful_count, 3);
      assert.equal(survivor.created_at, NOW - 90 * DAY, 'the merged memory is as old as its older half');
      assert.equal(survivor.salience, 0.7, 'max, never a decrease');
      assert.equal(survivor.confidence, 0.6);
      assert.equal(survivor.why, 'a longer rationale', 'the better rationale survives too');
      // updated_at is the decay clock. Consolidation is the store tidying itself,
      // not the user restating anything, so it must not hand out free half-life.
      assert.equal(survivor.updated_at, NOW - DAY);
      assert.equal(loser.status, 'superseded');
      assert.equal(loser.superseded_by, b);
      assert.equal(loser.text, 'use pnpm', 'the retired wording is still there to restore');
    });
  });

  it('contradiction: the newer supersedes the older, once a human says so', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, [
      { text: 'we use vitest for tests', theta: 0, created_at: NOW - 90 * DAY },
      { text: 'we moved off vitest to bun test', theta: 0.3, created_at: NOW - DAY },
    ]);

    const report = await consolidate(dbPaths, { apply: true, judge: judging('contradiction') });
    assert.equal(report.applied.length, 0, 'not automatic, ever');
    assert.equal(report.proposed.length, 1);

    // …and through the queue, it applies.
    const results = await promoteItems([report.proposed[0].key.replace('pair:', PROPOSAL_PREFIX)], {
      paths: dbPaths,
      env: ENV,
      now: NOW,
    });
    assert.equal(results[0].action, 'supersede');
    await run(dbPaths, async (conn) => {
      assert.equal((await rowOf(conn, a)).status, 'superseded');
      assert.equal((await rowOf(conn, a)).superseded_by, b);
      assert.equal((await rowOf(conn, b)).status, 'active');
    });
  });

  it('refinement: keeps both, links `refines`, demotes the general one', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, [
      { text: 'use pnpm', theta: 0, created_at: NOW - 90 * DAY, salience: 0.5 },
      { text: 'use pnpm, and never npm — it is the only supported installer', theta: 0.3 },
    ]);

    const report = await consolidate(dbPaths, { apply: true, judge: judging('refinement', { general: 'a' }) });
    assert.equal(report.applied.length, 1);
    assert.equal(report.applied[0].action, 'refine');

    await run(dbPaths, async (conn) => {
      const links = await conn.all('SELECT src, dst, rel FROM memory_links');
      assert.deepEqual(links, [{ src: b, dst: a, rel: 'refines' }], 'the specific one refines the general one');
      const general = await rowOf(conn, a);
      assert.equal(general.salience, Math.round(0.5 * DEMOTE_FACTOR * 10000) / 10000);
      assert.equal(general.status, 'active', 'both memories are still here');
      assert.equal((await rowOf(conn, b)).status, 'active');
      assert.equal(general.updated_at, NOW - 90 * DAY, 'a demotion is not a restatement');
    });
  });

  it('refinement: falls back to the shorter text when the judge will not say', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, [
      { text: 'deploy on fridays', theta: 0 },
      { text: 'deploy on fridays, but never after 4pm', theta: 0.3 },
    ]);

    await consolidate(dbPaths, { apply: true, judge: judging('refinement') });
    await run(dbPaths, async (conn) => {
      assert.deepEqual(await conn.all('SELECT src, dst, rel FROM memory_links'), [
        { src: b, dst: a, rel: 'refines' },
      ]);
    });
  });

  it('complementary: links `related` and changes neither row', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, TWINS);

    await consolidate(dbPaths, { apply: true, judge: judging('complementary') });
    await run(dbPaths, async (conn) => {
      assert.deepEqual(await conn.all('SELECT src, dst, rel FROM memory_links'), [
        { src: a, dst: b, rel: 'related' },
      ]);
      assert.equal((await rowOf(conn, a)).salience, 0.5);
      assert.equal((await rowOf(conn, b)).status, 'active');
    });
  });

  it('unrelated: records the verdict and touches nothing', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, TWINS);

    const report = await consolidate(dbPaths, { apply: true, judge: judging('unrelated') });
    assert.equal(report.applied[0].action, 'none');
    await run(dbPaths, async (conn) => {
      assert.deepEqual(await conn.all('SELECT src, dst, rel FROM memory_links'), []);
      assert.equal((await readVerdict(conn, a, b)).verdict, 'unrelated');
      // …and the pair is not offered a second time.
      assert.equal((await detectPairs(conn, { now: NOW })).pairs.length, 0);
    });
  });

  it('caches a verdict for every class, not just the one that changes nothing', async () => {
    for (const klass of ['duplicate', 'refinement', 'complementary', 'unrelated']) {
      const dbPaths = store();
      const [a, b] = await seed(dbPaths, [
        { text: 'use pnpm', theta: 0, created_at: NOW - 90 * DAY },
        { text: 'use pnpm for installs, always', theta: 0.3 },
      ]);
      await consolidate(dbPaths, { apply: true, judge: judging(klass) });
      await run(dbPaths, async (conn) => {
        const cached = await readVerdict(conn, a, b);
        assert.equal(cached?.verdict, klass, `${klass} left no receipt`);
      });
    }
  });
});

describe('applying over a store that moved', () => {
  it('refuses a plan whose memory is no longer active', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, TWINS);

    await run(dbPaths, async (conn) => {
      const pair = await onePair(conn);
      const plan = planPair(pair, { class: 'duplicate', why: 'w', general: null });
      await conn.run("UPDATE memories SET status = 'archived' WHERE id = ?", a);

      const result = await applyPlan(conn, plan, { now: NOW });
      assert.equal(result.ok, false);
      assert.match(result.why, /archived/);
      assert.equal((await rowOf(conn, b)).status, 'active');
    });
  });

  it('leaves a skipped pair uncached, so the next run sees it again', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, TWINS);

    const report = await consolidate(dbPaths, {
      apply: true,
      judge: async (pairs) => {
        // Something archives the row between detection and resolution.
        await run(dbPaths, (conn) => conn.run("UPDATE memories SET status = 'archived' WHERE id = ?", a));
        return judging('duplicate')(pairs);
      },
    });
    assert.equal(report.skipped.length, 1);
    assert.equal(report.applied.length, 0);
    await run(dbPaths, async (conn) => {
      assert.equal(await readVerdict(conn, a, b), null);
      assert.equal(report.stamped.stamped, 0);
      assert.ok(report.stamped.blocked.length > 0);
    });
  });
});

describe('the dry run', () => {
  it('plans everything and writes nothing at all', async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, TWINS);

    const report = await consolidate(dbPaths, { judge: judging('duplicate') });
    assert.equal(report.dry_run, true);
    assert.equal(report.planned.length, 1);
    assert.equal(report.planned[0].action, 'merge');
    assert.equal(report.by_class.duplicate, 1);
    assert.equal(report.applied.length, 0);

    await run(dbPaths, async (conn) => {
      assert.equal((await rowOf(conn, a)).status, 'active');
      assert.equal((await rowOf(conn, b)).status, 'active');
      assert.equal(await readVerdict(conn, a, b), null, 'a preview must not silence the pair');
      assert.deepEqual(await readProposals(conn), []);
      assert.equal((await rowOf(conn, a)).consolidated_at, null);
      assert.equal((await memoryEvents(conn, a, 10)).length, 0);
    });

    // Run it twice: the same answer, because nothing was recorded.
    const second = await consolidate(dbPaths, { judge: judging('duplicate') });
    assert.equal(second.planned.length, 1);
  });
});

describe('the watermark — 5b.1\'s one rule', () => {
  it('stamps the rows it examined when every pair was judged and resolved', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, TWINS);

    const report = await consolidate(dbPaths, { apply: true, judge: judging('unrelated') });
    assert.deepEqual(report.stamped.blocked, []);
    assert.equal(report.stamped.stamped, 2);
    await run(dbPaths, async (conn) => {
      for (const id of ids) assert.equal((await rowOf(conn, id)).consolidated_at, NOW);
    });
  });

  it('stamps nothing when a batch failed — stamping hides pairs nobody judged', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, TWINS);

    const report = await consolidate(dbPaths, {
      apply: true,
      judge: judging('unrelated', { errors: [{ pairs: ['pair:9:9'], message: 'usage limit' }] }),
    });
    assert.equal(report.stamped.stamped, 0);
    assert.match(report.stamped.blocked.join(' '), /judge call/);
    await run(dbPaths, async (conn) => {
      for (const id of ids) assert.equal((await rowOf(conn, id)).consolidated_at, null);
    });
  });

  it('stamps nothing when a pair went unjudged, and leaves that pair offerable', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, TWINS);
    const key = await run(dbPaths, async (conn) => (await onePair(conn)).key);

    const report = await consolidate(dbPaths, {
      apply: true,
      judge: judging('duplicate', { unjudged: [key] }),
    });
    assert.equal(report.judged, 0);
    assert.equal(report.stamped.stamped, 0);
    await run(dbPaths, async (conn) => {
      for (const id of ids) assert.equal((await rowOf(conn, id)).consolidated_at, null);
      assert.equal(await readVerdict(conn, ids[0], ids[1]), null);
      assert.equal((await detectPairs(conn, { now: NOW })).pairs.length, 1, 'still on the backlog');
    });
  });

  it('stamps nothing when detection itself was truncated', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, [
      { text: 'one', theta: 0 },
      { text: 'two', theta: 0.1 },
      { text: 'three', theta: 0.2 },
    ]);

    const report = await consolidate(dbPaths, { apply: true, limit: 1, judge: judging('unrelated') });
    assert.equal(report.detected.truncated, true);
    assert.equal(report.stamped.stamped, 0);
    await run(dbPaths, async (conn) => {
      for (const id of ids) assert.equal((await rowOf(conn, id)).consolidated_at, null);
    });
  });

  it('stamps an examined row that turned out to have no fresh pairs at all', async () => {
    const dbPaths = store();
    const ids = await seed(dbPaths, [{ text: 'alone', theta: 0 }, { text: 'far away', theta: 1.2 }]);

    let called = false;
    const report = await consolidate(dbPaths, {
      apply: true,
      judge: async (...args) => {
        called = true;
        return judging('unrelated')(...args);
      },
    });
    assert.equal(called, false, 'no pairs, no LLM call');
    assert.equal(report.stamped.stamped, 2);
    await run(dbPaths, async (conn) => {
      for (const id of ids) assert.equal((await rowOf(conn, id)).consolidated_at, NOW);
    });
  });
});

describe('the review queue, second producer', () => {
  const proposalKeyFor = (a, b) => `${PROPOSAL_PREFIX}${Math.min(a, b)}:${Math.max(a, b)}`;

  const withProposal = async () => {
    const dbPaths = store();
    const [a, b] = await seed(dbPaths, [
      { text: 'we use vitest', theta: 0, created_at: NOW - 90 * DAY, pinned: 1 },
      { text: 'we no longer use vitest', theta: 0.3, created_at: NOW - DAY },
    ]);
    const report = await consolidate(dbPaths, { apply: true, judge: judging('contradiction') });
    return { dbPaths, a, b, report };
  };

  it('shows a routed pair in the same queue as the staged captures', async () => {
    const { dbPaths, a, b } = await withProposal();

    const queue = await reviewQueue({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(queue.total, 1);
    const [item] = queue.items;
    assert.equal(item.type, 'consolidation-pair');
    assert.equal(item.ref, proposalKeyFor(a, b));
    assert.deepEqual(item.actions, ['promote', 'discard']);
    // The row the reviewer is being asked about is the one that would change.
    assert.equal(item.memory.id, a);
    assert.equal(item.duplicate.id, b);
    assert.equal(item.proposal.guard.reason, 'older-pinned');
    assert.match(item.proposal.wants, /retire #/);
  });

  it('applies the proposal on promote and takes it out of the queue', async () => {
    const { dbPaths, a, b } = await withProposal();

    const [result] = await promoteItems([proposalKeyFor(a, b)], { paths: dbPaths, env: ENV, now: NOW });
    assert.equal(result.action, 'supersede');
    // The guard's job was to get a human here; the human is here.
    await run(dbPaths, async (conn) => {
      assert.equal((await rowOf(conn, a)).status, 'superseded');
      assert.equal(await readProposal(conn, a, b), null);
    });
    assert.equal((await reviewQueue({ paths: dbPaths, env: ENV, now: NOW })).total, 0);
  });

  it('changes nothing on discard, and does not pay to ask again', async () => {
    const { dbPaths, a, b } = await withProposal();

    const [result] = await discardItems([proposalKeyFor(a, b)], { paths: dbPaths, env: ENV, now: NOW });
    assert.equal(result.action, 'declined');
    await run(dbPaths, async (conn) => {
      assert.equal((await rowOf(conn, a)).status, 'active');
      assert.equal(await readProposal(conn, a, b), null);
      // The verdict stays cached: a human answered, and re-judging it next week is
      // how a queue teaches people to ignore it.
      assert.equal((await readVerdict(conn, a, b)).verdict, 'contradiction');
      assert.equal((await detectPairs(conn, { now: NOW })).pairs.length, 0);
      assert.ok((await memoryEvents(conn, a, 10)).some((e) => e.event === 'declined'));
    });
  });

  it('hides a proposal once one of its memories has been restated', async () => {
    const { dbPaths, a, b } = await withProposal();

    await run(dbPaths, (conn) =>
      conn.run('UPDATE memories SET text = ?, updated_at = ? WHERE id = ?', 'we use vitest again', NOW + DAY, a),
    );
    assert.equal((await reviewQueue({ paths: dbPaths, env: ENV, now: NOW })).total, 0, 'stale, so not shown');

    const err = await promoteItems([proposalKeyFor(a, b)], { paths: dbPaths, env: ENV, now: NOW }).then(
      () => null,
      (e) => e,
    );
    assert.equal(err.code, 'MEM_STALE');
    await run(dbPaths, async (conn) => assert.equal((await rowOf(conn, a)).status, 'active'));
  });

  it('resolves a proposal by its pair key too, and refuses one about a purged row', async () => {
    const { dbPaths, a, b } = await withProposal();

    await run(dbPaths, async (conn) => {
      const item = await consolidationProposals.resolve(conn, `pair:${a}:${b}`, { now: NOW });
      assert.equal(item.ref, proposalKeyFor(a, b));
      assert.equal(await consolidationProposals.resolve(conn, 'nonsense', { now: NOW }), null);
    });

    // `mem forget --hard` reuses ids, so the proposal has to go with the memory.
    await run(dbPaths, (conn) => forgetMemory(conn, String(b), { hard: true, now: NOW }));
    await run(dbPaths, async (conn) => {
      assert.deepEqual(await readProposals(conn), []);
      assert.equal(await readVerdict(conn, a, b), null);
    });
  });

  it('does not let a staged capture and a proposal collide in the queue', async () => {
    const { dbPaths, a, b } = await withProposal();
    await seed(dbPaths, [{ uid: 'staged-1', text: 'a staged guess', theta: 1.0, status: 'staged' }]);

    const queue = await reviewQueue({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(queue.total, 2);
    assert.deepEqual(queue.totals, { 'staged-memory': 1, 'consolidation-pair': 1 });
    assert.deepEqual(
      queue.items.map((i) => i.type).sort(),
      ['consolidation-pair', 'staged-memory'],
    );
    assert.ok(queue.items.some((i) => i.ref === proposalKeyFor(a, b)));
  });
});

// The CLI is the only surface a person actually reads a proposal on, and the one
// place the new item type meets code that was written before it existed. `mem
// consolidate` is slice 5b.3's, so the proposal is made through the module and
// triaged through the command — which is exactly the split a user will hit if the
// maintenance tier ever makes one for them.
describe('through `mem review`', () => {
  const home = mkdtempSync(join(tmpdir(), 'mem-resolve-cli-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  // The CLI resolves turso from its data dir and never from cwd (deps.mjs), so a
  // scratch data dir needs the real node_modules or the command cannot open a db.
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));

  const cliPaths = { ...paths, dataDir: home, dbPath: join(home, 'mem.db') };
  const cli = (...argv) =>
    spawnSync(process.execPath, [join(paths.pluginRoot, 'bin', 'mem'), ...argv], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_DATA: home, MEM_PROJECT_KEY: KEY, MEM_NO_INSTALL: '1' },
    });

  it('prints a proposal in the queue and applies it on promote', async () => {
    const [a, b] = await seed(cliPaths, [
      { text: 'we use vitest', theta: 0, created_at: NOW - 90 * DAY, pinned: 1 },
      { text: 'we no longer use vitest', theta: 0.3, created_at: NOW - DAY },
    ]);
    await run(cliPaths, (conn) =>
      consolidatePairs(conn, { now: NOW, runId: 'cli-run', apply: true, judge: judging('contradiction') }),
    );

    const listed = cli('review');
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /consolidation-pair/);
    assert.match(listed.stdout, /we use vitest/);
    assert.match(listed.stdout, /2 awaiting review|1 awaiting review/);

    const json = JSON.parse(cli('review', '--json').stdout);
    const item = json.items.find((i) => i.type === 'consolidation-pair');
    assert.equal(item.proposal.guard.reason, 'older-pinned');

    const promoted = cli('review', 'promote', item.ref);
    assert.equal(promoted.status, 0, promoted.stderr);
    assert.match(promoted.stdout, new RegExp(`Retired #${a}`));
    assert.match(promoted.stdout, new RegExp(`superseded by #${b}`));

    await run(cliPaths, async (conn) => {
      assert.equal((await rowOf(conn, a)).status, 'superseded');
      assert.deepEqual(await readProposals(conn), []);
    });
    assert.doesNotMatch(cli('review').stdout, /consolidation-pair/);
  });
});
