// Phase 5b's exit criterion, as a test.
//
// PLAN: "run against a hand-built adversarial set — genuine duplicates, genuine
// contradictions, refinements that must *not* be treated as contradictions, and a
// newer-but-wrong memory facing a pinned one. Old memories end up
// `superseded_by`, never duplicated alongside; the pinned guard holds; `mem undo`
// restores the pre-run state exactly."
//
// The set is build/adversarial.mjs — twenty memories whose eight designed pairs
// are the only ones that clear the 0.85 threshold, measured on the real model.
// This file drives it with RECORDED verdicts, which is what makes it a test:
//
//   the judge is a subprocess and a paid one, so a suite that called it would be
//   neither hermetic nor free, and would fail on somebody's laptop for reasons
//   that are not about this code;
//   what phase 5b has to guarantee is what the system DOES with a verdict — the
//   guard, the routing, the resolutions, the undo — and every one of those is on
//   this side of the plain-data boundary judge.mjs draws.
//
// The other half — whether a real model says `refinement` where the set says
// `refinement` — is `node build/adversarial.mjs --live`, and it was run: eight of
// eight, after three of the texts were rewritten because the model's reading was
// better than mine and one prompt bug was fixed. The notes are in that file.
//
// So the assertions here are mostly about what did NOT happen. A consolidation
// tier that merges too eagerly looks fine in a test that only checks the merge.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  CASES,
  PROJECT_KEY,
  ROWS,
  caseFor,
  checkMatrix,
  compare,
  defaultVectorMode,
  diffState,
  readState,
  recordedJudge,
  runAdversarial,
  scratchPaths,
  seedAdversarial,
  vectorsFor,
} from '../adversarial.mjs';
import { consolidate } from '../../src/consolidate.mjs';
import { withDb } from '../../src/db.mjs';
import { modelCached } from '../../src/embed.mjs';
import { undo } from '../../src/maintain.mjs';
import { readVerdict } from '../../src/pairs.mjs';
import { readProposals } from '../../src/resolve.mjs';
import { review as reviewQueue, promote as promoteItems } from '../../src/review.mjs';

const ENV = { MEM_PROJECT_KEY: PROJECT_KEY };
const NOW = 1_750_000_000_000;

// The real model when it is cached, hand-built angles at the measured cosines
// when it is not — see VECTOR_MODES in adversarial.mjs. Everything below holds
// either way; only `the fixture itself` is a claim about the real vector space.
const MODE = defaultVectorMode();

const scratches = [];
const store = (label) => {
  const s = scratchPaths({ label: `mem-consolidate-${label}-` });
  scratches.push(s);
  return s.paths;
};
after(() => {
  for (const s of scratches) s.cleanup();
});

/**
 * One applying pass over the whole set, shared by most of what follows. Seeded,
 * consolidated and read back once — every assertion is against the store as it
 * ended up, not against the report that says what happened to it.
 */
describe('the adversarial set, consolidated with --apply', () => {
  let ids;
  let report;
  let before_;
  let state;
  let paths;

  before(async () => {
    paths = store('apply');
    const run = await runAdversarial({ paths, env: ENV, now: NOW, vectorMode: MODE, judge: recordedJudge() });
    ({ ids, report, before: before_ } = run);
    state = await readState(paths, ids, { env: ENV });
  });

  it('finds every designed pair and judges all of them', () => {
    assert.equal(report.detected.fresh, CASES.length, 'detection did not offer the eight designed pairs');
    assert.equal(report.judged, CASES.length);
    // A pair the recorded judge does not know is one detection found and the set
    // did not design — which is a fixture failure, and has to be loud.
    assert.deepEqual(report.unjudged, []);
    assert.deepEqual(report.errors, []);
  });

  it('classifies every case the way the set says, guard reason included', () => {
    for (const c of compare(report, ids)) {
      assert.deepEqual(
        c.actual,
        { class: c.expected.class, route: c.expected.route, action: c.expected.action, guard: c.expected.guard },
        `${c.pair.join(' / ')}`,
      );
    }
  });

  // ---------------------------------------------------------------- duplicates --

  it('merges a genuine duplicate: one row survives, the other is superseded_by it', () => {
    const c = caseFor('dup-old', 'dup-new');
    const survivor = state.rows[c.survivor];
    const loser = state.rows[c.loser];

    assert.equal(survivor.status, 'active');
    assert.equal(loser.status, 'superseded');
    // PLAN: "Old memories end up `superseded_by`, never duplicated alongside."
    assert.equal(loser.superseded_by, survivor.id);
    assert.equal(survivor.superseded_by, null);
    // The longer wording is the one that survived, and it was not rewritten — the
    // whole reason nothing in resolution needs the embedding model.
    assert.equal(survivor.text, ROWS.find((r) => r.tag === c.survivor).text);
  });

  it('does not touch the merged row\'s decay clock', () => {
    const c = caseFor('dup-old', 'dup-new');
    for (const tag of c.pair) {
      assert.equal(
        state.rows[tag].updated_at,
        before_.rows[tag].updated_at,
        `${tag}: consolidation moved updated_at, which would extend its half-life`,
      );
    }
  });

  // ------------------------------------------------------------- contradictions --

  it('never retires a memory on a contradiction without asking, even unguarded', () => {
    const c = caseFor('con-old', 'con-new');
    // No guard fires on this pair: nothing is pinned, the confidences match. It
    // waits anyway, which is PLAN's policy and the single most load-bearing line
    // in this subsystem — a wrong `contradiction` is a true memory gone.
    assert.equal(c.guard, null);
    for (const tag of c.pair) assert.equal(state.rows[tag].status, 'active', `${tag} was resolved automatically`);
    assert.ok(
      state.proposals.some((key) => key.endsWith(`${state.rows[c.pair[0]].id}:${state.rows[c.pair[1]].id}`)),
      'the contradiction did not reach the review queue',
    );
  });

  // ---------------------------------------------------------------- refinements --

  it('keeps both sides of a refinement and links them instead of retiring one', () => {
    const c = caseFor('ref-general', 'ref-specific');
    const general = state.rows[c.general];
    const specific = state.rows[c.specific];

    // The failure this case exists for: read as a contradiction, the general rule
    // is superseded and "run the formatter before committing" stops being true.
    assert.equal(general.status, 'active');
    assert.equal(specific.status, 'active');
    assert.equal(general.superseded_by, null);
    assert.ok(
      state.links.some((l) => l.src === specific.id && l.dst === general.id && l.rel === 'refines'),
      'no refines link was written',
    );
  });

  it('demotes the general side by one notch, not into invisibility', () => {
    const c = caseFor('ref-general', 'ref-specific');
    const was = before_.rows[c.general].salience;
    const now = state.rows[c.general].salience;
    assert.ok(now < was, 'the general memory was not demoted');
    assert.equal(now, Math.round(was * 0.8 * 1e4) / 1e4);
    // Still retrievable. A demotion that reached 0 would be a deletion nobody
    // recorded as one.
    assert.ok(now >= 0.05);
  });

  // --------------------------------------------------------------- the guards --

  it('holds the pinned guard: a newer memory cannot retire a pinned one', () => {
    const c = caseFor('pin-rule', 'pin-challenger');
    const pinned = state.rows['pin-rule'];

    assert.equal(c.guard, 'older-pinned');
    assert.equal(pinned.status, 'active');
    assert.equal(pinned.superseded_by, null);
    assert.deepEqual(
      { salience: pinned.salience, confidence: pinned.confidence, pinned: pinned.pinned },
      {
        salience: before_.rows['pin-rule'].salience,
        confidence: before_.rows['pin-rule'].confidence,
        pinned: 1,
      },
    );
    assert.equal(state.rows['pin-challenger'].status, 'active');
  });

  it('holds the pinned guard on the row that would CHANGE, not only on the older one', () => {
    // The guard's third reason. Here the pinned row is the NEWER of the two and
    // the resolution is a refinement, so PLAN's written sentence ("if the older
    // memory is pinned…") does not cover it — and without the third reason a
    // memory pinned yesterday gets demoted by one written last year.
    const c = caseFor('pin2-general', 'pin2-specific');
    assert.equal(c.guard, 'pinned-row-changed');
    assert.equal(state.rows['pin2-general'].salience, before_.rows['pin2-general'].salience);
    assert.equal(state.links.filter((l) => l.rel === 'refines' && l.dst === state.rows['pin2-general'].id).length, 0);
  });

  it('holds the confidence guard on an otherwise auto-safe class', () => {
    // A duplicate is applied without asking; this one is not, because the store
    // trusts the older row 0.45 more than the newer. Same class, different answer.
    const c = caseFor('conf-old', 'conf-new');
    assert.equal(c.guard, 'older-more-confident');
    for (const tag of c.pair) assert.equal(state.rows[tag].status, 'active', `${tag} was merged anyway`);
  });

  // -------------------------------------------------------- the quiet classes --

  it('records an unrelated pair without changing either memory', () => {
    const c = caseFor('unrel-a', 'unrel-b');
    for (const tag of c.pair) {
      const row = state.rows[tag];
      assert.equal(row.status, 'active');
      assert.equal(row.salience, before_.rows[tag].salience);
    }
    assert.deepEqual(
      state.verdicts.find((v) => v.pair === c.pair.join('|')),
      { pair: c.pair.join('|'), verdict: 'unrelated' },
      'nothing recorded the verdict, so the pair will be paid for again every run',
    );
  });

  it('links a complementary pair and keeps both', () => {
    const c = caseFor('comp-a', 'comp-b');
    const [a, b] = c.pair.map((tag) => state.rows[tag]);
    assert.equal(a.status, 'active');
    assert.equal(b.status, 'active');
    assert.ok(state.links.some((l) => l.rel === 'related' && l.src === Math.min(a.id, b.id)));
  });

  it('leaves the twelve memories nobody paired alone', () => {
    for (const row of ROWS) {
      if (CASES.some((c) => c.pair.includes(row.tag))) continue;
      const { consolidated_at: _a, ...now } = state.rows[row.tag];
      const { consolidated_at: _b, ...was } = before_.rows[row.tag];
      assert.deepEqual(now, was, `${row.tag} changed and nothing was ever proposed about it`);
    }
  });

  // ------------------------------------------------------------ the bookkeeping --

  it('caches a verdict for every judged pair, so none is paid for twice', async () => {
    await withDb(
      async (conn) => {
        for (const c of CASES) {
          const entry = await readVerdict(conn, ids.get(c.pair[0]), ids.get(c.pair[1]));
          assert.equal(entry?.verdict, c.verdict.class, `${c.pair.join(' / ')} has no cached verdict`);
          assert.equal(entry.run_id, report.run_id);
        }
      },
      { paths, env: ENV },
    );
  });

  it('advances the watermark, because this pass judged everything it found', () => {
    assert.deepEqual(report.stamped.blocked, []);
    assert.equal(report.stamped.stamped, ROWS.length);
    for (const row of ROWS) assert.equal(state.rows[row.tag].consolidated_at, NOW, row.tag);
  });

  it('takes the pre-run export before it writes anything', () => {
    assert.ok(report.backup, 'no pre-run export was written');
    // Every memory, not only the ones it touched: the export is the floor under
    // the whole run, and PLAN asks for the store.
    assert.equal(report.backup.memories, ROWS.length);
    assert.match(report.backup.path, /backups\/cons-.*\.jsonl$/);
  });

  it('runs under one run id that every event it wrote carries', async () => {
    assert.match(report.run_id, /^cons-\d{8}T\d{6}-[0-9a-f]{6}$/);
    await withDb(
      async (conn) => {
        const rows = await conn.all(
          "SELECT event, count(*) AS n FROM memory_events WHERE json_extract(detail, '$.run_id') = ? GROUP BY event",
          report.run_id,
        );
        const by = Object.fromEntries(rows.map((r) => [r.event, r.n]));
        assert.deepEqual(by, {
          merged: 1,
          superseded: 1,
          linked: 2,
          demoted: 1,
          proposed: 4,
          'pair-judged': 8,
          consolidated: 1,
          consolidation: 1,
        });
      },
      { paths, env: ENV },
    );
  });
});

// ------------------------------------------------------------------- the undo --

describe('mem undo, against the same run', () => {
  it('restores the pre-run state exactly', async () => {
    const paths = store('undo');
    const { ids, report, before: was } = await runAdversarial({
      paths,
      env: ENV,
      now: NOW,
      vectorMode: MODE,
      judge: recordedJudge(),
    });
    const during = await readState(paths, ids, { env: ENV });
    // The run has to have changed something, or "restores it exactly" is a claim
    // about a no-op.
    assert.ok(!diffState(was, during).clean, 'the pass changed nothing to undo');

    const result = await undo(report.run_id, { paths, env: ENV, now: NOW + 1000 });
    assert.deepEqual(result.blocked, []);
    assert.deepEqual(result.unsupported, []);
    assert.ok(result.complete);

    const after = await readState(paths, ids, { env: ENV });
    const left = diffState(was, after);
    assert.deepEqual(left.rows, [], 'rows did not come back');
    assert.deepEqual(left.links, [], 'a link was left behind');
    assert.deepEqual(left.proposals, [], 'a proposal was left behind');
    assert.deepEqual(left.verdicts, [], 'a verdict was left behind — the pair is silenced forever');
  });

  it('declines rather than fights a decision taken after the run', async () => {
    const paths = store('undo-moved');
    const { ids, report } = await runAdversarial({
      paths,
      env: ENV,
      now: NOW,
      vectorMode: MODE,
      judge: recordedJudge(),
    });
    const c = caseFor('dup-old', 'dup-new');

    // Somebody restores the merged-away memory by hand, then undoes the run.
    await withDb(
      (conn) => conn.run("UPDATE memories SET status = 'active', superseded_by = NULL WHERE id = ?", ids.get(c.loser)),
      { paths, env: ENV },
    );
    const result = await undo(report.run_id, { paths, env: ENV, now: NOW + 1000 });

    assert.ok(
      result.blocked.some((b) => b.event === 'superseded' && b.memory_id === ids.get(c.loser)),
      'the undo overwrote a state somebody else had already restored',
    );
    assert.equal(result.complete, false);
    // And everything else still went back.
    assert.ok(result.undone.length > 10);
  });

  it('picks up exactly the rest when it is run again', async () => {
    const paths = store('undo-twice');
    const { ids, report, before: was } = await runAdversarial({
      paths,
      env: ENV,
      now: NOW,
      vectorMode: MODE,
      judge: recordedJudge(),
    });
    const c = caseFor('ref-general', 'ref-specific');

    // Block one inversion, undo, unblock it, undo again.
    await withDb((conn) => conn.run('UPDATE memories SET salience = 0.42 WHERE id = ?', ids.get(c.general)), {
      paths,
      env: ENV,
    });
    const first = await undo(report.run_id, { paths, env: ENV, now: NOW + 1000 });
    assert.equal(first.blocked.length, 1);

    const demoted = Math.round(was.rows[c.general].salience * 0.8 * 1e4) / 1e4;
    await withDb((conn) => conn.run('UPDATE memories SET salience = ? WHERE id = ?', demoted, ids.get(c.general)), {
      paths,
      env: ENV,
    });
    const second = await undo(report.run_id, { paths, env: ENV, now: NOW + 2000 });

    assert.equal(second.undone.length, 1, 'the second undo redid work the first one had already done');
    assert.equal(second.undone[0].action, 'undemoted');
    const after = await readState(paths, ids, { env: ENV });
    assert.equal(after.rows[c.general].salience, was.rows[c.general].salience);
  });
});

// ------------------------------------------------------------------ the dry run --

describe('the dry run, which is the default', () => {
  it('reports the same plan and writes absolutely nothing', async () => {
    const paths = store('dry');
    const vectors = await vectorsFor(MODE, { paths, env: ENV });
    const ids = await withDb((conn) => seedAdversarial(conn, { now: NOW, projectKey: PROJECT_KEY, vectors }), {
      paths,
      env: ENV,
    });
    const was = await readState(paths, ids, { env: ENV });

    const dry = await consolidate({ paths, env: ENV, now: NOW, judge: recordedJudge() });
    assert.equal(dry.dry_run, true);
    assert.equal(dry.planned.length, CASES.length);
    for (const c of compare(dry, ids)) assert.ok(c.ok, `${c.pair.join(' / ')} previewed differently`);

    const after = await readState(paths, ids, { env: ENV });
    assert.ok(diffState(was, after).clean, 'the preview changed the store');
    assert.deepEqual(dry.applied, []);
    assert.deepEqual(dry.proposed, []);
    assert.equal(dry.backup, null, 'a preview rotated the backups');
    assert.equal(dry.stamped, null, 'a preview advanced the watermark');

    // AND IT SILENCED NOTHING: no verdict cached means the same run twice gives
    // the same answer twice, which is what makes --dry-run safe to type.
    const again = await consolidate({ paths, env: ENV, now: NOW, judge: recordedJudge() });
    assert.equal(again.planned.length, CASES.length);
    assert.equal(again.detected.cached_skipped, 0);
  });

  it('still pays for the judge — the judgement is the part it cannot predict', async () => {
    const paths = store('dry-pays');
    const vectors = await vectorsFor(MODE, { paths, env: ENV });
    await withDb((conn) => seedAdversarial(conn, { now: NOW, projectKey: PROJECT_KEY, vectors }), {
      paths,
      env: ENV,
    });
    const judge = recordedJudge();
    await consolidate({ paths, env: ENV, now: NOW, judge });
    assert.equal(judge.saw.length, CASES.length, 'the dry run skipped the judge and previewed nothing real');
  });
});

// --------------------------------------------------------- PLAN read literally --

describe('--duplicates-only, PLAN\'s letter', () => {
  it('applies duplicates and sends the three keep-both classes to review', async () => {
    const paths = store('narrow');
    const { ids, report } = await runAdversarial({
      paths,
      env: ENV,
      now: NOW,
      vectorMode: MODE,
      judge: recordedJudge(),
      duplicatesOnly: true,
    });

    // Per pair, not per class: there are two duplicates here and one of them is
    // guarded, so a class-keyed map would answer for whichever came last.
    const routed = Object.fromEntries(compare(report, ids).map((c) => [c.pair.join('|'), c.actual?.route]));
    assert.equal(routed['dup-old|dup-new'], 'apply', 'the unguarded duplicate was not applied');
    for (const key of ['ref-general|ref-specific', 'unrel-a|unrel-b', 'comp-a|comp-b', 'con-old|con-new']) {
      assert.equal(routed[key], 'review', `${key} was applied under --duplicates-only`);
    }
    // Only the unguarded duplicate is still applied; the rest are review items.
    assert.equal(report.applied.length, 1);
    assert.equal(report.proposed.length, CASES.length - 1);
  });
});

// ------------------------------------------------------- the queue on the end --

describe('what the guard routed to a human', () => {
  it('reaches the review queue as an item the existing renderer can print', async () => {
    const paths = store('queue');
    const { ids } = await runAdversarial({
      paths,
      env: ENV,
      now: NOW,
      vectorMode: MODE,
      judge: recordedJudge(),
    });

    const queue = await reviewQueue({ paths, env: ENV, now: NOW, scope: 'all', limit: 50 });
    const items = queue.items.filter((i) => i.type === 'consolidation-pair');
    assert.equal(items.length, 4);
    for (const item of items) {
      assert.ok(item.memory?.id, 'no memory on the item');
      assert.ok(item.duplicate?.id, 'no counterpart on the item');
      assert.deepEqual(item.actions, ['promote', 'discard']);
      assert.ok(item.proposal.wants, 'nothing says what promoting would do');
    }

    // Promoting the contradiction is what finally retires the old memory —
    // PLAN's "old memories end up superseded_by", by way of a human.
    const c = caseFor('con-old', 'con-new');
    const item = items.find((i) => i.memory.id === ids.get(c.loser));
    assert.ok(item, 'the contradiction is not in the queue');

    const done = await promoteItems([item.ref], { paths, env: ENV, now: NOW + 1000 });
    assert.equal(done[0].accepted, true);

    const state = await readState(paths, ids, { env: ENV });
    assert.equal(state.rows[c.loser].status, 'superseded');
    assert.equal(state.rows[c.loser].superseded_by, ids.get(c.survivor));
    assert.equal(state.rows[c.survivor].status, 'active');

    // And the pinned pair is still sitting there, untouched, waiting.
    await withDb(
      async (conn) => {
        const pending = await readProposals(conn);
        assert.ok(pending.some((p) => p.a === ids.get('pin-rule') || p.b === ids.get('pin-rule')));
      },
      { paths, env: ENV },
    );
  });
});

// ------------------------------------------------------------- the fixture --

describe('the fixture itself', () => {
  it('is exactly eight pairs in the real vector space, and nothing spurious', { skip: !modelCached() && 'no model cached — run `mem warm`' }, async () => {
    // The claim that makes this set adversarial rather than convenient: under the
    // model this plugin actually ships, twenty realistic memories produce these
    // eight pairs and no others. If a model swap breaks it, this fails first.
    const result = checkMatrix(await vectorsFor('model'));
    assert.deepEqual(result.missing, [], 'a designed pair no longer clears the threshold');
    assert.deepEqual(result.extra, [], 'the set now pairs something it did not mean to');
    assert.ok(result.headroom.similarity < 0.85);
  });

  it('would notice a pair the recorded judge does not know about', async () => {
    // The recorded judge leaves an unrecognised pair unjudged rather than guessing,
    // so a fixture that drifts is a failing assertion and not a quiet pass.
    const judge = recordedJudge();
    const answer = await judge([
      { key: 'pair:1:2', a: 1, b: 2, rows: [{ text: 'something nobody wrote' }, { text: 'nor this' }] },
    ]);
    assert.equal(answer.verdicts.size, 0);
    assert.deepEqual(answer.unjudged, ['pair:1:2']);
  });
});
