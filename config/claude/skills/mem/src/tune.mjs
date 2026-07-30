// The tuning harness — PLAN phase 3: "`mem tune` reporting precision/recall
// across candidate thresholds", against build/harness.json.
//
// This is the file that decides VECTOR_THRESHOLD, which is the one number in the
// plugin that trades the two failure modes against each other: too low and every
// prompt drags five half-relevant facts into context until the model starts
// obeying them, too high and the store is write-only. Slice 1.6 chose 0.82 by
// measuring the *model* — cosine scores over an unscoped 200-memory corpus. This
// measures the *shipped path*: hard project scoping, the status and expiry
// guards, rank fusion, the strength boost, the lexical leg's coverage gate and
// the cap at five. Those are not small differences. Scoping alone cuts the
// candidate set from 174 rows to ~60, which makes recall easier and negatives
// harder at the same time.
//
// One search per case, not one per (case × threshold). The gate is a pure filter
// on (similarity, coverage) applied before the cap, and `score` — rrf × boost —
// does not depend on the threshold. So a single `searchScoped(…, {gate: false})`
// per case returns the whole scored candidate list in final rank order, and every
// candidate threshold is then a filter-and-slice over that array in memory.
// `replay()` is written to be exactly searchScoped's own two lines, and there is
// a test that runs both and compares, because "the sweep is free" is only true
// while the replay stays faithful.
//
// The two defaults that make this a build tool rather than a user command: it
// reads the fixture store from build/seed.mjs (never the real one), and its
// harness path points into build/. It ships in src/ because the metrics are
// ordinary code worth testing, not because a user has a reason to run it.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withDb } from './db.mjs';
import { EMB_DIM, EMB_MODEL, embedQuery, modelCached, vectorBlob } from './embed.mjs';
import { resolvePaths } from './paths.mjs';
import {
  LEXICAL_GATE_COVERAGE,
  MAX_RESULTS,
  VECTOR_THRESHOLD,
  queryTerms,
  searchScoped,
} from './search.mjs';

/**
 * Candidate thresholds. The range is model geometry, not a preference: gte-small
 * packs unrelated sentence pairs into roughly 0.74-0.95, so below 0.74 every
 * candidate passes and above 0.92 nothing does. The step is 0.005 because that is
 * the resolution at which the 1.6 numbers changed (0.814 vs 0.82 was 6 points of
 * recall), and a coarser grid would hide the decision.
 */
export const GRID_MIN = 0.74;
export const GRID_MAX = 0.93;
export const GRID_STEP = 0.005;

/**
 * How far above the efficient point the recommendation sits.
 *
 * The efficient point is the lowest threshold that admits no negative — which
 * means it sits a hair above the *maximum* similarity in a finite negative
 * sample. Shipping that is fitting a production constant to a sample maximum, and
 * the first negative the harness does not contain walks straight through it. One
 * grid step of margin is cheap insurance measured in a few points of recall; the
 * report prints exactly how many, so the trade is visible rather than asserted.
 */
export const MARGIN = GRID_STEP;

/** Spawns of the real hook for the latency figure. Enough for a p95 to mean something. */
export const DEFAULT_SPAWNS = 12;

export const POSITIVE_TIERS = ['literal', 'paraphrase'];
export const NEGATIVE_TIERS = ['offtopic', 'adjacent', 'filtered'];

export const isPositive = (tier) => POSITIVE_TIERS.includes(tier);

const round = (n, places = 4) =>
  n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10 ** places) / 10 ** places;

/** The grid, inclusive of both ends, snapped to avoid float drift in the labels. */
export function grid({ min = GRID_MIN, max = GRID_MAX, step = GRID_STEP, extra = [] } = {}) {
  const values = new Set();
  for (let t = min; t <= max + step / 2; t += step) values.add(round(t, 6));
  for (const t of extra) if (Number.isFinite(t)) values.add(round(t, 6));
  return [...values].sort((a, b) => a - b);
}

// ------------------------------------------------------------------ harness --

export const harnessPath = (paths = resolvePaths()) => join(paths.pluginRoot, 'build', 'harness.json');

/**
 * Read the case corpus. Shape errors throw: the whole value of this harness is
 * that a number coming out of it means what it says, and a case list that half
 * parsed would report a precision measured over an unknown denominator.
 */
export function loadHarness(path) {
  if (!existsSync(path)) {
    throw new Error(`no harness at ${path} — write one with 'node build/harness.mjs --write'`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err.message}`);
  }
  const cases = parsed?.cases;
  if (!Array.isArray(cases) || cases.length === 0) throw new Error(`${path} holds no cases`);

  cases.forEach((c, i) => {
    const where = `${path} case ${i}`;
    if (typeof c.prompt !== 'string' || c.prompt.trim() === '') throw new Error(`${where}: no prompt`);
    if (!Array.isArray(c.should_retrieve)) throw new Error(`${where}: should_retrieve must be an array`);
    if (!isPositive(c.tier) && !NEGATIVE_TIERS.includes(c.tier)) {
      throw new Error(`${where}: unknown tier '${c.tier}'`);
    }
    if (isPositive(c.tier) === (c.should_retrieve.length === 0)) {
      throw new Error(
        `${where}: a ${c.tier} case ${isPositive(c.tier) ? 'needs at least one' : 'must have no'} should_retrieve uid`,
      );
    }
  });

  return { ...parsed, path, cases };
}

/**
 * Check every claim the harness makes about the store, before measuring anything.
 *
 * The uids are seed-derived, so a re-seeded or edited fixture invalidates the
 * whole file at once. Failing here — loudly, with the command to fix it — is the
 * difference between "recall dropped" and "the harness is pointing at rows that
 * no longer exist", and those two look identical in a summary table.
 */
export async function crossCheck(conn, harness, { now = Date.now() } = {}) {
  const rows = await conn.all(
    `SELECT uid, text, scope, project_key, status, expires_at FROM memories`,
  );
  const byUid = new Map(rows.map((r) => [r.uid, r]));
  const problems = [];

  const check = (uid, text, where, wantReachable, projectKey) => {
    const row = byUid.get(uid);
    if (!row) return problems.push(`${where}: uid ${uid} ("${text}") is not in the store`);
    if (typeof text === 'string' && row.text !== text) {
      return problems.push(`${where}: uid ${uid} now says "${row.text}", harness says "${text}"`);
    }
    const live =
      row.status === 'active' &&
      (row.expires_at === null || row.expires_at > now) &&
      (row.scope === 'global' || row.project_key === projectKey);
    if (wantReachable && !live) {
      problems.push(`${where}: "${row.text}" is ${row.status} or out of scope — the case is impossible`);
    }
    if (!wantReachable && live) {
      problems.push(`${where}: "${row.text}" is reachable after all — the case is no longer a negative`);
    }
    return undefined;
  };

  harness.cases.forEach((c, i) => {
    const where = `case ${i} (${c.prompt})`;
    c.should_retrieve.forEach((uid, j) => check(uid, c.expect_text?.[j], where, true, c.project_key));
    (c.allow ?? []).forEach((uid, j) => check(uid, c.allow_text?.[j], where, true, c.project_key));
    (c.blocked ?? []).forEach((b) => check(b.uid, b.text, where, false, c.project_key));
  });

  if (problems.length > 0) {
    throw new Error(
      `${harness.path} is stale against ${rows.length} stored memories ` +
        `(${problems.length} problem${problems.length === 1 ? '' : 's'}):\n  ` +
        `${problems.slice(0, 8).join('\n  ')}` +
        (problems.length > 8 ? `\n  … and ${problems.length - 8} more` : '') +
        "\n  Re-seed with 'node build/seed.mjs', then 'node build/harness.mjs --write'.",
    );
  }
  return rows.length;
}

// -------------------------------------------------------------------- probe --

/**
 * The true cosine between this prompt and specific rows, whatever their rank.
 *
 * Needed because "not in the candidate list" and "similarity 0" are different
 * facts that look identical if you only read the candidates: the vector leg stops
 * at twenty rows, so a right answer ranked twenty-first is absent from the probe
 * with no score attached. Reporting that as 0 would drag `worst_relevant` — and
 * therefore the whole separation figure — down to nonsense, and it would hide the
 * one diagnosis a threshold cannot fix: a miss caused by VECTOR_LIMIT rather than
 * by the gate.
 */
async function similarityTo(conn, vector, uids, { embModel, embDim }) {
  if (uids.length === 0) return new Map();
  const rows = await conn.all(
    `SELECT uid, vector_distance_cos(emb, vector32(?)) AS dist
       FROM memories
      WHERE uid IN (${uids.map(() => '?').join(', ')})
        AND emb IS NOT NULL AND emb_model = ? AND emb_dim = ?`,
    vectorBlob(vector),
    ...uids,
    embModel,
    embDim,
  );
  return new Map(rows.map((r) => [r.uid, 1 - r.dist]));
}

/**
 * Everything the sweep needs from one case, in two queries.
 *
 * `gate: false` and no limit, so what comes back is the full fused candidate list
 * in final rank order — which is what makes every threshold afterwards free. The
 * rows are stripped to the four fields the replay and the report use, because
 * holding 52 cases × 40 rows of full memory objects in memory to filter a number
 * out of them would be silly.
 *
 * The second query is similarityTo() over this case's own right answers, which is
 * off the retrieval path and exists only so a miss can be attributed.
 */
export async function probeCase(conn, testCase, { now = Date.now(), embDim = EMB_DIM, embModel = EMB_MODEL, paths, env } = {}) {
  const terms = queryTerms(testCase.prompt);

  const t0 = performance.now();
  const vector = await embedQuery(testCase.prompt, { paths, env });
  const embedMs = performance.now() - t0;

  const expectedSimilarity = await similarityTo(conn, vector, testCase.should_retrieve, { embModel, embDim });

  // A prompt with no distinctive term never reaches the database in the hook
  // either — it short-circuits before the model loads. Nothing retrieved, no
  // query timed.
  if (terms.length === 0) {
    return { ...testCase, terms, candidates: [], expectedSimilarity, stats: {}, embedMs, queryMs: 0, shortCircuit: true };
  }

  const t1 = performance.now();
  const { results, stats } = await searchScoped(conn, vector, terms, {
    projectKey: testCase.project_key,
    now,
    gate: false,
    limit: Number.MAX_SAFE_INTEGER,
    embDim,
    embModel,
  });
  const queryMs = performance.now() - t1;

  return {
    ...testCase,
    terms,
    candidates: results.map((r) => ({
      uid: r.uid,
      text: r.text,
      similarity: r.similarity,
      coverage: r.coverage,
    })),
    expectedSimilarity,
    stats,
    embedMs,
    queryMs,
    shortCircuit: false,
  };
}

/**
 * searchScoped's last two statements, over an already-scored candidate list.
 *
 * Filtering an already-sorted array and slicing it is the same answer as sorting
 * after filtering, because the comparator is total (score, then id) — which is
 * what makes replaying the gate here exact rather than approximate.
 */
export function replay(candidates, { threshold = VECTOR_THRESHOLD, coverage = LEXICAL_GATE_COVERAGE, limit = MAX_RESULTS } = {}) {
  return candidates
    .filter((r) => (r.similarity !== null && r.similarity >= threshold) || r.coverage >= coverage)
    .slice(0, limit);
}

// ------------------------------------------------------------------ metrics --

/**
 * Precision, recall and — the one PLAN's exit criterion actually names — how many
 * prompts unrelated to anything stored got an injection.
 *
 * Three deliberate choices in here:
 *
 * `allow` uids are neither true nor false positives. A prompt about package
 * managers also surfacing "corepack installs the pinned package manager" is a
 * defensible answer, and counting it as noise would measure the annotation rather
 * than the system. Only a uid in neither set is noise.
 *
 * `hitRate` sits beside `recall` because they answer different questions. Recall
 * is micro-averaged over expected memories; hitRate is the fraction of prompts
 * that got *something* right, which is what a turn actually experiences — a case
 * with two valid answers is not half-served by one of them.
 *
 * `admits` counts negative *cases*, not items. One negative case injecting three
 * memories is one poisoned turn, not three.
 */
export function evaluate(probes, { threshold = VECTOR_THRESHOLD, coverage = LEXICAL_GATE_COVERAGE, limit = MAX_RESULTS } = {}) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let hits = 0;
  let positives = 0;
  let negatives = 0;
  let admits = 0;
  let lexicalAdmits = 0;
  let beyondLimit = 0;
  let items = 0;
  const misses = [];
  const admitted = [];
  // Noise alongside a right answer. Not the same failure as an admitted negative
  // — the turn got what it asked for — but it is what `precision` is made of, and
  // without the list there is no way to tell a genuine irrelevance from a
  // defensible answer the harness forgot to put in `allow`.
  const noise = [];
  // Per tier, because the aggregate hides the finding. A literal prompt and a
  // paraphrase of the same memory are not two samples of one difficulty; the gate
  // is nearly free on the first and does most of its damage on the second, and one
  // combined hit rate reports a number that describes neither.
  const byTier = {};
  const tally = (tier, field) => {
    byTier[tier] ??= { cases: 0, served: 0, admitted: 0 };
    byTier[tier][field] += 1;
  };

  for (const probe of probes) {
    const got = replay(probe.candidates, { threshold, coverage, limit });
    items += got.length;
    const gotUids = new Set(got.map((r) => r.uid));
    const candidateUids = new Set(probe.candidates.map((r) => r.uid));
    const allow = new Set(probe.allow ?? []);
    tally(probe.tier, 'cases');

    if (isPositive(probe.tier)) {
      positives += 1;
      const wanted = probe.should_retrieve;
      const found = wanted.filter((uid) => gotUids.has(uid));
      tp += found.length;
      fn += wanted.length - found.length;
      const extra = got.filter((r) => !wanted.includes(r.uid) && !allow.has(r.uid));
      fp += extra.length;
      if (extra.length > 0) {
        noise.push({
          prompt: probe.prompt,
          tier: probe.tier,
          served: found.length > 0,
          got: extra.map((r) => ({ text: r.text, similarity: round(r.similarity), coverage: round(r.coverage) })),
        });
      }
      if (found.length > 0) {
        hits += 1;
        tally(probe.tier, 'served');
      } else {
        const best = Math.max(...wanted.map((uid) => probe.expectedSimilarity?.get(uid) ?? 0), 0);
        // Cleared the gate and still did not come back: the vector leg's top-20
        // never reached it, so no threshold recovers this one. A different bug
        // entirely, and one that would read as "the gate is too tight".
        const overLimit = best >= threshold && !wanted.some((uid) => candidateUids.has(uid));
        if (overLimit) beyondLimit += 1;
        misses.push({
          prompt: probe.prompt,
          tier: probe.tier,
          expect: probe.expect_text ?? [],
          best_similarity: round(best),
          beyond_vector_limit: overLimit,
        });
      }
    } else {
      negatives += 1;
      fp += got.length;
      if (got.length > 0) {
        admits += 1;
        tally(probe.tier, 'admitted');
        // Immune to the threshold: these rows passed on IDF coverage, so no
        // amount of tightening the vector gate removes them. Reported separately
        // because they set the floor the sweep cannot go below.
        if (got.every((r) => r.similarity === null || r.similarity < threshold)) lexicalAdmits += 1;
        admitted.push({
          prompt: probe.prompt,
          tier: probe.tier,
          got: got.map((r) => ({ text: r.text, similarity: round(r.similarity), coverage: round(r.coverage) })),
        });
      }
    }
  }

  return {
    threshold: round(threshold, 6),
    coverage: round(coverage, 6),
    tp,
    fp,
    fn,
    precision: round(tp + fp === 0 ? 1 : tp / (tp + fp)),
    recall: round(tp + fn === 0 ? 1 : tp / (tp + fn)),
    hits,
    positives,
    hit_rate: round(positives === 0 ? 1 : hits / positives),
    negatives,
    admits,
    lexical_admits: lexicalAdmits,
    beyond_vector_limit: beyondLimit,
    items,
    mean_items: round(probes.length === 0 ? 0 : items / probes.length, 2),
    by_tier: byTier,
    misses,
    admitted,
    noise,
  };
}

/** The whole grid. Cheap — no I/O per row, which is the point of probeCase. */
export function sweep(probes, thresholds, { coverage = LEXICAL_GATE_COVERAGE, limit = MAX_RESULTS } = {}) {
  return thresholds.map((threshold) => {
    const { misses, admitted, noise, by_tier: _byTier, ...row } = evaluate(probes, { threshold, coverage, limit });
    return row;
  });
}

/**
 * The band the gate has to separate, measured on the shipped path.
 *
 * `worst_relevant` is the lowest similarity any case's own right answer reached;
 * `best_irrelevant` is the highest any negative case's top candidate reached.
 * Their difference is slice 1.6's separation metric — negative there for every
 * model, and the reason a threshold is a trade rather than a solved problem.
 * Recomputing it here says whether project scoping and the status guards widened
 * the band or only moved it.
 *
 * The relevant side comes from expectedSimilarity, not from the candidate list:
 * a right answer outside the top twenty has a real cosine and no rank, and
 * scoring it as 0 would report a separation of -0.84 that means nothing.
 */
export function separation(probes) {
  let worstRelevant = null;
  let bestIrrelevant = null;
  let worstCase = null;
  let bestCase = null;

  for (const probe of probes) {
    if (isPositive(probe.tier)) {
      const best = Math.max(
        ...probe.should_retrieve.map((uid) => probe.expectedSimilarity?.get(uid) ?? 0),
        0,
      );
      if (worstRelevant === null || best < worstRelevant) {
        worstRelevant = best;
        worstCase = probe.prompt;
      }
    } else {
      const top = Math.max(...probe.candidates.map((r) => r.similarity ?? 0), 0);
      if (bestIrrelevant === null || top > bestIrrelevant) {
        bestIrrelevant = top;
        bestCase = probe.prompt;
      }
    }
  }

  return {
    worst_relevant: round(worstRelevant),
    worst_relevant_prompt: worstCase,
    best_irrelevant: round(bestIrrelevant),
    best_irrelevant_prompt: bestCase,
    separation: round((worstRelevant ?? 0) - (bestIrrelevant ?? 0)),
  };
}

/**
 * Pick a threshold from the sweep.
 *
 * The rule, in order, and it is deliberately not "maximise F1": the two errors are
 * not symmetric. A missed memory costs one prompt the benefit of one fact. An
 * admitted one puts a false statement in front of the model as something the user
 * believes, and PLAN is blunt that this is how a memory system fails.
 *
 *   1. Fewest admitted negatives. Zero if any threshold reaches it — and if none
 *      does, the floor is the lexical leg, which no threshold can raise.
 *   2. Among those, the lowest threshold: same precision, most recall. That is the
 *      efficient point.
 *   3. Ship one grid step above it, for the reason on MARGIN.
 */
export function recommend(rows) {
  if (rows.length === 0) throw new Error('nothing to recommend from — the sweep is empty');

  const floor = Math.min(...rows.map((r) => r.admits));
  const clean = rows.filter((r) => r.admits === floor);
  const efficient = clean[0];

  const target = efficient.threshold + MARGIN;
  // The first grid point at or above the margin, or the top of the grid if the
  // margin runs off the end — which would itself be a finding worth seeing.
  const shipped = rows.find((r) => r.threshold >= target - GRID_STEP / 100) ?? rows[rows.length - 1];

  return {
    efficient: efficient.threshold,
    shipped: shipped.threshold,
    margin: round(shipped.threshold - efficient.threshold, 6),
    admits_floor: floor,
    zero_admits_possible: floor === 0,
    recall_cost: round(efficient.hit_rate - shipped.hit_rate),
    at_efficient: efficient,
    at_shipped: shipped,
  };
}

// ------------------------------------------------------------------ latency --

const percentile = (sorted, p) =>
  sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

export function timings(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    best: round(sorted[0], 1),
    p50: round(percentile(sorted, 0.5), 1),
    p95: round(percentile(sorted, 0.95), 1),
    max: round(sorted[sorted.length - 1], 1),
    samples: sorted.map((ms) => round(ms, 1)),
  };
}

/**
 * p95 of the real thing: `hooks/prompt-recall.mjs` in a fresh process, once per
 * sampled prompt, paying the transformers import and the ONNX model load every
 * time. This is the number PLAN's phase-3 exit criterion is about (<400ms) and it
 * is measured here rather than in the test suite because the suite runs nine
 * ONNX loads concurrently and its own contention added 130ms to the p95 in 3.2.
 *
 * Cases are sampled by stride rather than by slice, so the sample spans both
 * outcomes: an empty result skips markInjected and the render, so a run of
 * negatives alone would measure the cheap path and call it the budget.
 *
 * It runs after the sweep, and it does write to the fixture: the hook bumps
 * injected_count and last_injected_at on whatever it injects, and leaves a turn
 * record under <seed>/turns/. Neither column is in the ranking (see
 * markInjected), so it cannot bias a re-run — but the order is not an accident
 * either, and `--spawns 0` skips the writes altogether.
 */
export function hookLatency(harnessCases, { paths, spawns = DEFAULT_SPAWNS, pluginRoot, session = 'mem-tune' } = {}) {
  const n = Math.min(spawns, harnessCases.length);
  if (n <= 0) return null;

  const hook = join(pluginRoot, 'hooks', 'prompt-recall.mjs');
  if (!existsSync(hook)) return null;

  const stride = harnessCases.length / n;
  const sampled = Array.from({ length: n }, (_, i) => harnessCases[Math.floor(i * stride)]);

  const samples = [];
  let injected = 0;
  for (const testCase of sampled) {
    const t0 = performance.now();
    const out = spawnSync(process.execPath, [hook], {
      encoding: 'utf8',
      input: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        session_id: session,
        cwd: paths.dataDir,
        prompt: testCase.prompt,
      }),
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: paths.dataDir,
        // The hook resolves its own project key from cwd; the harness says which
        // project the prompt is asked in, and that is the whole point of the case.
        ...(testCase.project_key ? { MEM_PROJECT_KEY: testCase.project_key } : {}),
        MEM_NO_INSTALL: '1',
      },
    });
    samples.push(performance.now() - t0);
    if (out.status !== 0) {
      throw new Error(`prompt-recall exited ${out.status} on "${testCase.prompt}": ${out.stderr}`);
    }
    if (out.stdout.trim() !== '') injected += 1;
  }

  return { ...timings(samples), injected, sampled: sampled.length };
}

// ---------------------------------------------------------------------- run --

/** The default fixture: the seeded store, never the user's own. */
export function tuneStorePaths(base = resolvePaths()) {
  const dataDir = join(base.dataDir, 'seed');
  return { ...base, dataDir, dbPath: join(dataDir, 'mem.db') };
}

/**
 * Load, probe, sweep, recommend, time. Returns one report object; the CLI decides
 * how to print it.
 */
export async function tune({
  paths: base = resolvePaths(),
  storePaths = tuneStorePaths(base),
  harness: harnessFile = harnessPath(base),
  coverage = LEXICAL_GATE_COVERAGE,
  limit = MAX_RESULTS,
  spawns = DEFAULT_SPAWNS,
  thresholds,
  now = Date.now(),
  env = { ...process.env, MEM_NO_INSTALL: '1' },
  onProgress,
} = {}) {
  const harness = loadHarness(harnessFile);

  if (!existsSync(storePaths.dbPath)) {
    throw new Error(
      `no fixture store at ${storePaths.dbPath} — build it with 'node build/seed.mjs'`,
    );
  }
  if (!modelCached(base)) {
    throw new Error("the embedding model is not cached — run 'mem warm' first");
  }

  const started = performance.now();
  const { probes, memories } = await withDb(
    async (conn) => {
      const total = await crossCheck(conn, harness, { now });
      const out = [];
      for (const [i, testCase] of harness.cases.entries()) {
        out.push(await probeCase(conn, testCase, { now, paths: base, env }));
        onProgress?.({ done: i + 1, total: harness.cases.length });
      }
      return { probes: out, memories: total };
    },
    { paths: storePaths, env, readonly: true },
  );

  const rows = sweep(probes, thresholds ?? grid({ extra: [VECTOR_THRESHOLD] }), { coverage, limit });
  const pick = recommend(rows);
  const shipped = evaluate(probes, { threshold: VECTOR_THRESHOLD, coverage, limit });
  const recommended = evaluate(probes, { threshold: pick.shipped, coverage, limit });

  const active = await withDb(
    (conn) =>
      conn.get(
        `SELECT count(*) AS n FROM memories
          WHERE status = 'active' AND (expires_at IS NULL OR expires_at > ?)`,
        now,
      ),
    { paths: storePaths, env, readonly: true },
  );

  return {
    harness: { path: harness.path, ...harness.shape },
    store: {
      db: storePaths.dbPath,
      memories,
      retrievable: active?.n ?? 0,
      model: EMB_MODEL,
      dim: EMB_DIM,
    },
    gate: { coverage: round(coverage, 6), limit, committed: VECTOR_THRESHOLD },
    grid: { min: GRID_MIN, max: GRID_MAX, step: GRID_STEP, margin: MARGIN },
    band: separation(probes),
    sweep: rows,
    recommend: pick,
    committed: { threshold: VECTOR_THRESHOLD, ...shipped },
    recommended: { threshold: pick.shipped, ...recommended },
    latency: {
      // Not the hook budget — the two halves of it that scale with the store
      // rather than with the model. Both in-process and warm, by construction.
      embed: timings(probes.map((p) => p.embedMs)),
      query: timings(probes.filter((p) => !p.shortCircuit).map((p) => p.queryMs)),
      hook: hookLatency(harness.cases, { paths: storePaths, spawns, pluginRoot: base.pluginRoot }),
    },
    elapsed_ms: round(performance.now() - started, 1),
  };
}
