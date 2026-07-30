// The tuning harness.
//
// Two halves, and the split matters. The metrics are pure functions over probe
// objects, so they are tested against hand-built probes where the right answer is
// arithmetic — a precision figure computed by the same reasoning that produced it
// would prove nothing.
//
// The half that needs the model and the seeded fixture is there for one claim:
// `mem tune` sweeps 40 thresholds off ONE search per case, on the grounds that the
// gate is a pure filter over an already-scored list. If replay() ever stops
// agreeing with searchScoped()'s own gate, every number the harness prints is
// wrong and nothing else in the suite would notice. So the fidelity test runs both
// and compares, at thresholds either side of the committed one.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { modelCached } from '../../src/embed.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import {
  LEXICAL_GATE_COVERAGE,
  MAX_RESULTS,
  VECTOR_THRESHOLD,
  queryTerms,
  searchScoped,
} from '../../src/search.mjs';
import {
  GRID_MAX,
  GRID_MIN,
  GRID_STEP,
  MARGIN,
  crossCheck,
  evaluate,
  grid,
  harnessPath,
  isPositive,
  loadHarness,
  probeCase,
  recommend,
  replay,
  separation,
  timings,
  tuneStorePaths,
} from '../../src/tune.mjs';
import { CASES } from '../harness.mjs';

const paths = resolvePaths();
const store = tuneStorePaths(paths);
const HARNESS = harnessPath(paths);
const CLI = join(paths.pluginRoot, 'bin', 'mem');
const ENV = { ...process.env, MEM_NO_INSTALL: '1' };

const needsFixture = {
  skip: !modelCached(paths)
    ? "model not cached — run 'mem warm'"
    : !existsSync(store.dbPath)
      ? `no seeded fixture at ${store.dbPath} — run 'node build/seed.mjs'`
      : false,
};

const scratch = mkdtempSync(join(tmpdir(), 'mem-tune-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const writeHarness = (body) => {
  const file = join(scratch, `harness-${n++}.json`);
  writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
  return file;
};

/** A probe as probeCase would return it, minus the fields the metrics ignore. */
const probe = ({ tier, expect = [], allow = [], got = [], truth = {} }) => ({
  prompt: `probe ${tier}`,
  tier,
  should_retrieve: expect,
  allow,
  expect_text: expect,
  candidates: got,
  expectedSimilarity: new Map(Object.entries(truth)),
});

const row = (uid, similarity, coverage = 0) => ({ uid, text: uid, similarity, coverage });

describe('the threshold grid', () => {
  it('spans the measured band inclusively', () => {
    const g = grid();
    assert.equal(g[0], GRID_MIN);
    assert.equal(g[g.length - 1], GRID_MAX);
    assert.ok(g.every((t, i) => i === 0 || t > g[i - 1]), 'must be strictly increasing');
    // Float accumulation is why the values are rounded before they become labels:
    // 0.74 + 0.005 * 21 is 0.8449999999999999 without it.
    assert.ok(g.includes(0.845), `0.845 missing from ${g.join(' ')}`);
  });

  it('folds an off-grid extra in without duplicating an on-grid one', () => {
    const withExtra = grid({ extra: [0.8123, GRID_MIN] });
    assert.ok(withExtra.includes(0.8123));
    assert.equal(withExtra.filter((t) => t === GRID_MIN).length, 1);
  });

  it('honours a narrowed range', () => {
    assert.deepEqual(grid({ min: 0.8, max: 0.81, step: 0.005 }), [0.8, 0.805, 0.81]);
  });
});

describe('replay', () => {
  const candidates = [row('a', 0.9), row('b', 0.86, 0.9), row('c', 0.7, 0.7), row('d', 0.7, 0.1), row('e', null, 0.8)];

  it('keeps a row on similarity or on coverage, either one', () => {
    const kept = replay(candidates, { threshold: 0.85, coverage: 0.6 }).map((r) => r.uid);
    // a and b on similarity, c and e on coverage; d clears neither leg.
    assert.deepEqual(kept, ['a', 'b', 'c', 'e']);
  });

  it('lets a lexical-only row through, which is the whole point of the second leg', () => {
    const kept = replay([row('lex', null, 0.95)], { threshold: 0.99, coverage: 0.6 });
    assert.deepEqual(kept.map((r) => r.uid), ['lex']);
  });

  it('caps after filtering, never before', () => {
    // Cap-then-filter would answer ['a'] here: the two weak rows sit ahead of c.
    const kept = replay([row('a', 0.9), row('x', 0.1), row('y', 0.1), row('c', 0.9)], {
      threshold: 0.85,
      limit: 2,
    });
    assert.deepEqual(kept.map((r) => r.uid), ['a', 'c']);
  });

  it('preserves the incoming rank order', () => {
    const kept = replay([row('second', 0.99), row('first', 0.86)], { threshold: 0.85 });
    assert.deepEqual(kept.map((r) => r.uid), ['second', 'first']);
  });
});

describe('evaluate', () => {
  it('counts a right answer as a hit and anything unlisted as noise', () => {
    const m = evaluate([probe({ tier: 'literal', expect: ['a'], got: [row('a', 0.9), row('junk', 0.9)] })], {
      threshold: 0.85,
    });
    assert.equal(m.tp, 1);
    assert.equal(m.fp, 1);
    assert.equal(m.fn, 0);
    assert.equal(m.hits, 1);
    assert.equal(m.precision, 0.5);
    assert.equal(m.recall, 1);
  });

  it('treats an allowed memory as neither right nor wrong', () => {
    const m = evaluate([probe({ tier: 'literal', expect: ['a'], allow: ['b'], got: [row('a', 0.9), row('b', 0.9)] })], {
      threshold: 0.85,
    });
    assert.equal(m.fp, 0, 'a defensible second answer is not noise');
    assert.equal(m.precision, 1);
    assert.equal(m.noise.length, 0);
  });

  it('lists the noise that made up the precision figure', () => {
    const m = evaluate([probe({ tier: 'literal', expect: ['a'], got: [row('a', 0.9), row('junk', 0.87)] })], {
      threshold: 0.85,
    });
    assert.equal(m.noise.length, 1);
    assert.equal(m.noise[0].served, true, 'the turn still got what it asked for');
    assert.deepEqual(m.noise[0].got.map((g) => g.text), ['junk']);
  });

  it('reports a case that missed its answer AND dragged something else in', () => {
    const m = evaluate([probe({ tier: 'paraphrase', expect: ['a'], got: [row('junk', 0.9)], truth: { a: 0.7 } })], {
      threshold: 0.85,
    });
    assert.equal(m.noise[0].served, false);
    assert.equal(m.misses.length, 1);
  });

  it('reports per-tier counts, because the aggregate hides which half is failing', () => {
    const m = evaluate(
      [
        probe({ tier: 'literal', expect: ['a'], got: [row('a', 0.9)] }),
        probe({ tier: 'paraphrase', expect: ['b'], got: [], truth: { b: 0.7 } }),
        probe({ tier: 'offtopic', got: [row('x', 0.9)] }),
      ],
      { threshold: 0.85 },
    );
    assert.deepEqual(m.by_tier.literal, { cases: 1, served: 1, admitted: 0 });
    assert.deepEqual(m.by_tier.paraphrase, { cases: 1, served: 0, admitted: 0 });
    assert.deepEqual(m.by_tier.offtopic, { cases: 1, served: 0, admitted: 1 });
  });

  it('separates recall from hit rate when a case has two right answers', () => {
    const m = evaluate([probe({ tier: 'literal', expect: ['a', 'b'], got: [row('a', 0.9)], truth: { b: 0.5 } })], {
      threshold: 0.85,
    });
    assert.equal(m.recall, 0.5, 'one of two expected memories came back');
    assert.equal(m.hit_rate, 1, 'the prompt was still served');
  });

  it('counts an admitted negative once, however many memories it dragged in', () => {
    const m = evaluate(
      [
        probe({ tier: 'offtopic', got: [row('x', 0.9), row('y', 0.9), row('z', 0.9)] }),
        probe({ tier: 'adjacent', got: [row('q', 0.1)] }),
      ],
      { threshold: 0.85 },
    );
    assert.equal(m.admits, 1, 'one poisoned turn, not three');
    assert.equal(m.negatives, 2);
    assert.equal(m.fp, 3, 'the item count is still three');
    assert.equal(m.admitted.length, 1);
  });

  it('flags a negative admitted purely on lexical coverage as threshold-immune', () => {
    const m = evaluate([probe({ tier: 'adjacent', got: [row('lex', 0.1, 0.9)] })], { threshold: 0.85, coverage: 0.6 });
    assert.equal(m.admits, 1);
    assert.equal(m.lexical_admits, 1, 'no threshold removes this one');
  });

  it('reports a miss at its true cosine, not at the rank it failed to reach', () => {
    // The right answer is nowhere in the candidate list: outside the vector leg's
    // top twenty. Reporting 0 here is what made the separation figure nonsense.
    const m = evaluate([probe({ tier: 'paraphrase', expect: ['a'], got: [row('other', 0.9)], truth: { a: 0.778 } })], {
      threshold: 0.85,
    });
    assert.equal(m.hits, 0);
    assert.equal(m.misses[0].best_similarity, 0.778);
    assert.equal(m.misses[0].beyond_vector_limit, false, 'below the gate, so the gate is the reason');
  });

  it('distinguishes a miss the gate caused from one VECTOR_LIMIT caused', () => {
    const m = evaluate([probe({ tier: 'paraphrase', expect: ['a'], got: [row('other', 0.99)], truth: { a: 0.9 } })], {
      threshold: 0.85,
    });
    assert.equal(m.misses[0].beyond_vector_limit, true, 'cleared the gate and never became a candidate');
    assert.equal(m.beyond_vector_limit, 1);
  });

  it('scores an empty harness as perfect rather than as a division by zero', () => {
    const m = evaluate([], {});
    assert.equal(m.precision, 1);
    assert.equal(m.recall, 1);
    assert.equal(m.hit_rate, 1);
  });
});

describe('separation', () => {
  it('measures the worst right answer against the best wrong one', () => {
    const band = separation([
      probe({ tier: 'literal', expect: ['a'], got: [row('a', 0.95)], truth: { a: 0.95 } }),
      probe({ tier: 'paraphrase', expect: ['b'], got: [], truth: { b: 0.78 } }),
      probe({ tier: 'offtopic', got: [row('x', 0.84), row('y', 0.7)] }),
    ]);
    assert.equal(band.worst_relevant, 0.78);
    assert.equal(band.best_irrelevant, 0.84);
    assert.equal(band.separation, -0.06);
    assert.match(band.worst_relevant_prompt, /paraphrase/);
  });
});

describe('recommend', () => {
  const sweepRow = (threshold, admits, hitRate) => ({ threshold, admits, hit_rate: hitRate });

  it('takes the lowest zero-admit threshold and steps one grid point above it', () => {
    const pick = recommend([
      sweepRow(0.83, 3, 0.7),
      sweepRow(0.84, 1, 0.65),
      sweepRow(0.845, 0, 0.6),
      sweepRow(0.85, 0, 0.55),
      sweepRow(0.855, 0, 0.5),
    ]);
    assert.equal(pick.efficient, 0.845);
    assert.equal(pick.shipped, 0.85);
    assert.equal(pick.margin, MARGIN);
    assert.equal(pick.zero_admits_possible, true);
    assert.ok(Math.abs(pick.recall_cost - 0.05) < 1e-9, 'the margin costs recall and says so');
  });

  it('falls back to the admit floor when no threshold reaches zero', () => {
    const pick = recommend([sweepRow(0.83, 4, 0.7), sweepRow(0.84, 2, 0.6), sweepRow(0.845, 2, 0.55)]);
    assert.equal(pick.admits_floor, 2);
    assert.equal(pick.zero_admits_possible, false);
    assert.equal(pick.efficient, 0.84, 'the floor is the lexical leg, not the vector gate');
  });

  it('stops at the top of the grid rather than recommending off the end', () => {
    const pick = recommend([sweepRow(0.9, 1, 0.3), sweepRow(GRID_MAX, 0, 0.2)]);
    assert.equal(pick.shipped, GRID_MAX);
  });

  it('refuses an empty sweep instead of inventing a threshold', () => {
    assert.throws(() => recommend([]), /empty/);
  });
});

describe('timings', () => {
  it('reports the percentiles a budget is argued from', () => {
    const t = timings([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    assert.equal(t.n, 10);
    assert.equal(t.best, 10);
    assert.equal(t.p50, 50);
    assert.equal(t.p95, 100);
    assert.equal(t.max, 100);
  });

  it('sorts the samples it prints, so a run can be eyeballed', () => {
    assert.deepEqual(timings([3, 1, 2]).samples, [1, 2, 3]);
  });
});

describe('loadHarness', () => {
  const good = { cases: [{ prompt: 'p', tier: 'literal', should_retrieve: ['u'] }] };

  it('reads the committed harness', () => {
    const harness = loadHarness(HARNESS);
    assert.equal(harness.cases.length, CASES.length, 'harness.json is out of date with harness.mjs');
    assert.ok(harness.shape.negatives > 0, 'a harness with no negatives measures the wrong thing');
    assert.ok(
      harness.cases.every((c) => isPositive(c.tier) === (c.should_retrieve.length > 0)),
      'every negative must expect nothing',
    );
  });

  it('says where to get one when there is none', () => {
    assert.throws(() => loadHarness(join(scratch, 'absent.json')), /build\/harness\.mjs --write/);
  });

  it('rejects a positive case with nothing to retrieve', () => {
    const file = writeHarness({ cases: [{ prompt: 'p', tier: 'literal', should_retrieve: [] }] });
    assert.throws(() => loadHarness(file), /needs at least one/);
  });

  it('rejects a negative case that expects a memory', () => {
    const file = writeHarness({ cases: [{ prompt: 'p', tier: 'offtopic', should_retrieve: ['u'] }] });
    assert.throws(() => loadHarness(file), /must have no/);
  });

  it('rejects an unknown tier rather than scoring it as a negative', () => {
    const file = writeHarness({ cases: [{ prompt: 'p', tier: 'maybe', should_retrieve: [] }] });
    assert.throws(() => loadHarness(file), /unknown tier/);
  });

  it('rejects an empty case list and unparseable JSON', () => {
    assert.throws(() => loadHarness(writeHarness({ cases: [] })), /no cases/);
    assert.throws(() => loadHarness(writeHarness('{ nope')), /not valid JSON/);
  });

  it('accepts the minimal valid shape', () => {
    assert.equal(loadHarness(writeHarness(good)).cases.length, 1);
  });
});

describe('the harness against the seeded fixture', needsFixture, () => {
  let harness;
  before(() => {
    harness = loadHarness(HARNESS);
  });

  it('names memories that all still exist, say what it claims, and are in scope', async () => {
    const total = await withDb((conn) => crossCheck(conn, harness), { paths: store, env: ENV, readonly: true });
    assert.ok(total > 0);
  });

  it('fails loudly when a uid has gone, rather than reading as lost recall', async () => {
    const broken = { ...harness, cases: [{ ...harness.cases[0], should_retrieve: ['not-a-uid'] }] };
    await assert.rejects(
      () => withDb((conn) => crossCheck(conn, broken), { paths: store, env: ENV, readonly: true }),
      /is not in the store[\s\S]*build\/harness\.mjs --write/,
    );
  });

  it('fails when a memory has been reworded under a uid the harness still points at', async () => {
    const first = harness.cases.find((c) => c.should_retrieve.length > 0);
    const broken = { ...harness, cases: [{ ...first, expect_text: ['something else entirely'] }] };
    await assert.rejects(
      () => withDb((conn) => crossCheck(conn, broken), { paths: store, env: ENV, readonly: true }),
      /harness says/,
    );
  });

  it('fails when a filtered negative becomes answerable', async () => {
    // Claim a live memory is what blocks the case. It is reachable, so the case
    // is no longer a negative and the harness has to be re-authored.
    const live = harness.cases.find((c) => c.should_retrieve.length > 0);
    const blocked = harness.cases.find((c) => c.blocked);
    const broken = {
      ...harness,
      cases: [{ ...blocked, blocked: [{ uid: live.should_retrieve[0], text: live.expect_text[0] }], project_key: live.project_key }],
    };
    await assert.rejects(
      () => withDb((conn) => crossCheck(conn, broken), { paths: store, env: ENV, readonly: true }),
      /no longer a negative/,
    );
  });
});

// The claim the whole sweep rests on. If this drifts, `mem tune` reports numbers
// for a gate the plugin does not have.
describe('replaying the gate matches running it', needsFixture, () => {
  const SAMPLE = 6;

  it('answers exactly what searchScoped answers, at thresholds either side of the committed one', async () => {
    const harness = loadHarness(HARNESS);
    const now = Date.now();
    // Spread across the case list so both positives and negatives are covered:
    // a negative's candidate list is the one where the gate does most of the work.
    const stride = harness.cases.length / SAMPLE;
    const sampled = Array.from({ length: SAMPLE }, (_, i) => harness.cases[Math.floor(i * stride)]);

    await withDb(
      async (conn) => {
        for (const testCase of sampled) {
          const p = await probeCase(conn, testCase, { now, paths, env: ENV });
          const terms = queryTerms(testCase.prompt);
          if (terms.length === 0) continue;

          for (const threshold of [0.78, VECTOR_THRESHOLD - GRID_STEP, VECTOR_THRESHOLD, 0.9]) {
            const { results } = await searchScoped(
              conn,
              // Re-embedding would be a second forward pass; the vector is
              // deterministic, so probeCase's candidate list already encodes it.
              await (await import('../../src/embed.mjs')).embedQuery(testCase.prompt, { paths, env: ENV }),
              terms,
              { projectKey: testCase.project_key, now, threshold, coverage: LEXICAL_GATE_COVERAGE, limit: MAX_RESULTS },
            );
            assert.deepEqual(
              replay(p.candidates, { threshold, coverage: LEXICAL_GATE_COVERAGE, limit: MAX_RESULTS }).map((r) => r.uid),
              results.map((r) => r.uid),
              `replay diverged at ${threshold} on "${testCase.prompt}"`,
            );
          }
        }
      },
      { paths: store, env: ENV, readonly: true },
    );
  });
});

// PLAN phase 3, exit: "**injects nothing** on prompts unrelated to any stored
// memory (this is the test that matters most)". This is that test, at the value
// actually committed in search.mjs — so lowering the constant without re-running
// `mem tune` fails here rather than in somebody's context window.
describe('the committed threshold', needsFixture, () => {
  let metrics;

  before(async () => {
    const harness = loadHarness(HARNESS);
    const now = Date.now();
    const probes = await withDb(
      async (conn) => {
        await crossCheck(conn, harness, { now });
        const out = [];
        for (const testCase of harness.cases) out.push(await probeCase(conn, testCase, { now, paths, env: ENV }));
        return out;
      },
      { paths: store, env: ENV, readonly: true },
    );
    metrics = evaluate(probes, { threshold: VECTOR_THRESHOLD, coverage: LEXICAL_GATE_COVERAGE, limit: MAX_RESULTS });
  });

  it('admits nothing on a prompt the store cannot answer', () => {
    assert.equal(
      metrics.admits,
      0,
      `${metrics.admits} of ${metrics.negatives} negatives injected something at ` +
        `${VECTOR_THRESHOLD}:\n${metrics.admitted.map((a) => `  ${a.prompt} -> ${a.got.map((g) => g.text).join('; ')}`).join('\n')}`,
    );
  });

  // The other direction, deliberately slack. Recall here is 0.55 and the point of
  // the floor is to catch a change that turns the gate off in the *quiet*
  // direction — a store nothing comes out of also admits nothing.
  it('still serves at least half of the prompts it should', () => {
    assert.ok(
      metrics.hit_rate >= 0.5,
      `hit rate fell to ${metrics.hit_rate} (${metrics.hits}/${metrics.positives})`,
    );
  });

  it('never fills the context: mean items per prompt stays under one', () => {
    assert.ok(metrics.mean_items < 1, `mean ${metrics.mean_items} memories per prompt`);
  });

  // The finding the aggregate hides, asserted so a model or prefix change that
  // trades one for the other cannot pass unnoticed.
  it('serves a prompt that reuses the memory\'s own words nearly always', () => {
    const t = metrics.by_tier.literal;
    assert.ok(t.served / t.cases >= 0.75, `literal ${t.served}/${t.cases}`);
  });

  it('serves a paraphrase far less often, which is the cost being paid', () => {
    const t = metrics.by_tier.paraphrase;
    assert.ok(t.served / t.cases >= 0.25, `paraphrase collapsed to ${t.served}/${t.cases}`);
    assert.ok(
      t.served / t.cases < metrics.by_tier.literal.served / metrics.by_tier.literal.cases,
      'paraphrase scoring at or above literal would mean the tiers are mislabelled',
    );
  });
});

describe('mem tune', needsFixture, () => {
  // --spawns 0 throughout: the hook timing is what the command is for, but it
  // writes injected_count to the shared fixture and adds a second of ONNX loads
  // to a suite that already has nine. recall.test.mjs owns spawning the hook.
  const run = (args) =>
    spawnSync(process.execPath, [CLI, 'tune', ...args], { encoding: 'utf8', env: ENV });

  it('reports the sweep as JSON', () => {
    const out = run(['--json', '--spawns', '0']);
    assert.equal(out.status, 0, out.stderr);
    const report = JSON.parse(out.stdout);

    assert.equal(report.gate.committed, VECTOR_THRESHOLD);
    assert.ok(report.sweep.length > 10, 'a sweep of one threshold is not a sweep');
    assert.ok(report.sweep.some((r) => r.threshold === VECTOR_THRESHOLD), 'the committed value must be on the grid');
    assert.ok(report.sweep.every((r, i) => i === 0 || r.threshold > report.sweep[i - 1].threshold));
    // Tightening the gate can only remove items, never add them.
    assert.ok(report.sweep.every((r, i) => i === 0 || r.items <= report.sweep[i - 1].items));
    assert.equal(report.committed.threshold, VECTOR_THRESHOLD);
    assert.equal(report.latency.hook, null, '--spawns 0 must skip the hook entirely');
    assert.ok(report.latency.query.p95 > 0);
    assert.equal(report.harness.cases, CASES.length);
  });

  it('prints a table a human can read the decision off', () => {
    const out = run(['--spawns', '0']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /threshold\s+hits/);
    assert.match(out.stdout, /recommend \d\.\d{3}/);
    assert.match(out.stdout, new RegExp(`committed ${VECTOR_THRESHOLD.toFixed(3)}`));
    assert.match(out.stdout, /separation/);
  });

  it('explains a missing harness instead of reporting an empty sweep', () => {
    const out = run(['--json', '--spawns', '0', '--harness', join(scratch, 'nope.json')]);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /mem tune: no harness at/);
  });

  it('explains a missing fixture store', () => {
    const out = run(['--json', '--spawns', '0', '--data', join(scratch, 'no-store')]);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /node build\/seed\.mjs/);
  });

  it('rejects a nonsense --spawns rather than timing something else', () => {
    assert.equal(run(['--spawns', '-1']).status, 1);
    assert.match(run(['--spawns', 'lots']).stderr, /must be a number/);
  });

  it('is listed in help, so it is findable without reading the source', () => {
    const out = spawnSync(process.execPath, [CLI, 'help'], { encoding: 'utf8', env: ENV });
    assert.match(out.stdout, /^\s+tune\s+Sweep the retrieval gate/m);
  });
});
