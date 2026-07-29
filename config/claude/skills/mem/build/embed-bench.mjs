#!/usr/bin/env node
// Which embedding model? — measured, not assumed.
//
// Slice 1.3 measured the incumbent (all-MiniLM-L6-v2) against two stored
// memories and found the relevant and irrelevant score bands OVERLAPPING: a
// paraphrase of a stored fact scored 0.273 while an unrelated memory scored
// 0.256. No threshold separates those, so the retrieval gate cannot work on top
// of that model no matter how it is tuned. MiniLM is a *symmetric* similarity
// model — trained to compare like with like — and this system asks a question
// against a stored statement, which is asymmetric.
//
// So the metric this file exists for is SEPARATION:
//
//     separation = (worst score a right answer gets) - (best score a junk query gets)
//
// Positive means some threshold admits every right answer and rejects every junk
// query. Negative means no threshold does, and recall@5 will happily hide that —
// a model can rank the right answer first every time and still be unusable,
// because the gate has no way to tell "first of 200, and correct" from "first of
// 200, and noise".
//
// Method
//   corpus     the 200 memories seed.mjs generates, embedded as PASSAGES
//   positives  EVAL below — 32 questions with a known right answer, most of them
//              paraphrases sharing no content words with their target
//   negatives  NEGATIVES below — questions the store genuinely cannot answer;
//              a good model scores their best match LOW
//
// Each model runs in its own child process, so `loadMs` is a real cold load and
// not a number flattered by an onnxruntime already warmed by the previous model.
// A second, smaller child measures the whole hook path (node boot + import +
// load + one embed) as wall time, which is the ~400ms budget PLAN actually cares
// about.
//
//   node build/embed-bench.mjs              table
//   node build/embed-bench.mjs --json       machine-readable
//   node build/embed-bench.mjs --models e5-small@q8,bge-small@q8
//   node build/embed-bench.mjs --all        include the fp32 and 768d variants

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadTransformers } from '../src/deps.mjs';
import { ensureDataDir, resolvePaths } from '../src/paths.mjs';
import { seedRecords } from './seed.mjs';

const SELF = fileURLToPath(import.meta.url);

// ------------------------------------------------------------------ models --
//
// Prefixes are not decoration — they are the entire mechanism by which an
// asymmetric model knows which side of the comparison it is looking at, and
// getting them wrong measures a different model than the one named.
//
//   e5-*      'query: ' / 'passage: '                      (intfloat's card)
//   bge-*     an instruction on the QUERY only, none on the passage (BAAI's card,
//             short-query-to-passage retrieval)
//   gte-*     no prefixes; trained asymmetric without them
//   MiniLM    no prefixes; symmetric, the incumbent
//
// `dim` is asserted at runtime, so a wrong entry here fails loudly rather than
// quietly benchmarking a truncated vector.

const BGE_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

export const MODELS = [
  {
    key: 'minilm@q8',
    modelId: 'Xenova/all-MiniLM-L6-v2',
    dtype: 'q8',
    dim: 384,
    queryPrefix: '',
    passagePrefix: '',
    note: 'incumbent — symmetric',
    tier: 'core',
  },
  {
    key: 'e5-small@q8',
    modelId: 'Xenova/e5-small-v2',
    dtype: 'q8',
    dim: 384,
    queryPrefix: 'query: ',
    passagePrefix: 'passage: ',
    tier: 'core',
  },
  {
    key: 'bge-small@q8',
    modelId: 'Xenova/bge-small-en-v1.5',
    dtype: 'q8',
    dim: 384,
    queryPrefix: BGE_QUERY_PREFIX,
    passagePrefix: '',
    tier: 'core',
  },
  {
    key: 'gte-small@q8',
    modelId: 'Xenova/gte-small',
    dtype: 'q8',
    dim: 384,
    queryPrefix: '',
    passagePrefix: '',
    tier: 'core',
  },
  // The same L6 encoder as the incumbent, but fine-tuned on 215M question-answer
  // pairs instead of on symmetric sentence pairs. If asymmetric training is what
  // slice 1.3 was missing, this isolates it: identical architecture, identical
  // size, identical speed, different objective.
  {
    key: 'multi-qa-MiniLM@q8',
    modelId: 'Xenova/multi-qa-MiniLM-L6-cos-v1',
    dtype: 'q8',
    dim: 384,
    queryPrefix: '',
    passagePrefix: '',
    note: 'asymmetric QA-tuned',
    tier: 'core',
  },
  // Is q8 the thing costing us separation, or the model? Only a matched fp32 run
  // answers that, and it is worth knowing before blaming the architecture.
  {
    key: 'e5-small@fp32',
    modelId: 'Xenova/e5-small-v2',
    dtype: 'fp32',
    dim: 384,
    queryPrefix: 'query: ',
    passagePrefix: 'passage: ',
    tier: 'extra',
  },
  {
    key: 'bge-small@fp32',
    modelId: 'Xenova/bge-small-en-v1.5',
    dtype: 'fp32',
    dim: 384,
    queryPrefix: BGE_QUERY_PREFIX,
    passagePrefix: '',
    tier: 'extra',
  },
  {
    key: 'multi-qa-MiniLM@fp32',
    modelId: 'Xenova/multi-qa-MiniLM-L6-cos-v1',
    dtype: 'fp32',
    dim: 384,
    queryPrefix: '',
    passagePrefix: '',
    tier: 'extra',
  },
  // 768d: schema stores emb_dim per row so this is *allowed*, and knowing what a
  // bigger model buys says whether 384d is the binding constraint or not.
  {
    key: 'bge-base@q8',
    modelId: 'Xenova/bge-base-en-v1.5',
    dtype: 'q8',
    dim: 768,
    queryPrefix: BGE_QUERY_PREFIX,
    passagePrefix: '',
    tier: 'extra',
  },
  {
    key: 'multi-qa-mpnet@q8',
    modelId: 'Xenova/multi-qa-mpnet-base-dot-v1',
    dtype: 'q8',
    dim: 768,
    queryPrefix: '',
    passagePrefix: '',
    tier: 'extra',
  },
];

// -------------------------------------------------------------------- eval --
//
// 32 questions against the seed corpus. `expect` holds every memory that would
// be a correct answer — several facts have a legitimate second phrasing in the
// corpus, and scoring those as misses would measure the corpus, not the model.
//
// `tier` splits the two failure modes apart:
//   literal    the question reuses the memory's own words. MiniLM passes these;
//              they prove the pipeline works, not that the model does.
//   paraphrase the question shares NO content word with the memory. This is the
//              real case — a user asks "which package manager?" of a memory that
//              says "always use pnpm to install dependencies" — and it is where
//              a symmetric model collapses.
//
// Every `expect` string is checked against the corpus at startup, so a typo here
// is an immediate error rather than a silent zero.

export const EVAL = [
  // --- literal: shares the memory's own vocabulary -------------------------
  { q: 'how do I install dependencies?', tier: 'literal', expect: ['always use pnpm to install dependencies'] },
  { q: 'what do we use for unit tests?', tier: 'literal', expect: ['prefer Vitest over Jest for unit tests'] },
  { q: 'when is the staging database reset?', tier: 'literal', expect: ['the staging database is reset every Monday morning'] },
  { q: 'what are the commit message conventions?', tier: 'literal', expect: ['I prefer terse commit messages in the imperative mood', 'commit conventions are documented in CONTRIBUTING.md'] },
  { q: 'how long does the session token last?', tier: 'literal', expect: ['the session token expires after fifteen minutes, not fifteen hours'] },
  { q: 'what is the rate limit?', tier: 'literal', expect: ['rate limiting allows sixty requests a minute per token'] },
  { q: 'which branch is the default?', tier: 'literal', expect: ['the default branch is main and has been since the migration'] },
  { q: 'where do the runbooks live?', tier: 'literal', expect: ['runbooks are kept in ops/runbooks and indexed from the wiki'] },

  // --- paraphrase: no content word in common with the target ---------------
  { q: 'which package manager should I use?', tier: 'paraphrase', expect: ['always use pnpm to install dependencies'] },
  { q: 'what framework do we write specs with?', tier: 'paraphrase', expect: ['prefer Vitest over Jest for unit tests'] },
  { q: 'am I allowed to overwrite a colleague’s remote history?', tier: 'paraphrase', expect: ['never force push a branch somebody else is working on'] },
  { q: 'can I ship to production on Friday evening?', tier: 'paraphrase', expect: ['nothing goes out on a Friday afternoon'] },
  { q: 'how are secrets supplied at runtime?', tier: 'paraphrase', expect: ['credentials never enter the repository, sops-nix supplies them at runtime'] },
  { q: 'what operating system does the user run?', tier: 'paraphrase', expect: ['I work on NixOS with home-manager managing the dotfiles'] },
  { q: 'which text editor does the user work in?', tier: 'paraphrase', expect: ['I use neovim with lazy.nvim and treesitter'] },
  { q: 'is it safe to signal status with red and green?', tier: 'paraphrase', expect: ['I cannot distinguish red from green, so never encode meaning in colour alone'] },
  { q: 'should I build up to the answer or lead with it?', tier: 'paraphrase', expect: ['give me the conclusion first and the reasoning after'] },
  { q: 'how does the user want dates written?', tier: 'paraphrase', expect: ['I prefer metric units and ISO dates'] },
  { q: 'should I say sorry when I get something wrong?', tier: 'paraphrase', expect: ['do not apologise, just correct the mistake and carry on'] },
  { q: 'are containers how we ship?', tier: 'paraphrase', expect: ['deploy with nix flakes rather than docker images'] },
  { q: 'where does asynchronous work get queued?', tier: 'paraphrase', expect: ['background jobs run on a Postgres-backed queue instead of Redis'] },
  { q: 'what status code answers a malformed payload?', tier: 'paraphrase', expect: ['answer validation failures with 422 rather than 400'] },
  { q: 'how heavy may the first page load be?', tier: 'paraphrase', expect: ['the initial route has a budget of 250 kilobytes gzipped'] },
  { q: 'how is the interface styled?', tier: 'paraphrase', expect: ['styling is Tailwind on top of a small set of design tokens'] },
  { q: 'may I leave a value untyped in TypeScript?', tier: 'paraphrase', expect: ['no any in committed code — take unknown and narrow it'] },
  { q: 'where do application logs end up?', tier: 'paraphrase', expect: ['logs are structured JSON shipped to Loki'] },
  { q: 'which latency statistic matters?', tier: 'paraphrase', expect: ['watch p95 and p99, never the mean'] },
  { q: 'how many people work here?', tier: 'paraphrase', expect: ['the team is four engineers, one designer and a part-time product manager'] },
  { q: 'what does the company sell?', tier: 'paraphrase', expect: ['the product is a booking tool for independent clinics'] },
  { q: 'when is the user offline for the day?', tier: 'paraphrase', expect: ['my working hours are roughly 09:00 to 18:00 Central European Time'] },
  { q: 'how long is an iteration?', tier: 'paraphrase', expect: ['we work in two-week iterations without story points'] },
  { q: 'who runs our builds?', tier: 'paraphrase', expect: ['CI runs on GitHub Actions with a self-hosted ARM runner'] },
];

/**
 * Questions this store cannot answer. A model earns its separation by scoring
 * these LOW, and the last three are deliberately adjacent to real memories
 * ("booking", "colour", "review") — an easy negative set would manufacture a
 * separation that vanishes in use.
 */
export const NEGATIVES = [
  'what is the capital of France?',
  'write me a haiku about otters',
  'how do I make a sourdough starter?',
  'who won the 1998 football world cup?',
  'what is the boiling point of mercury?',
  'summarise the plot of Moby-Dick',
  'recommend a hotel to book in Lisbon',
  'what colour was Napoleon’s horse?',
  'review my landlord’s tenancy agreement',
];

/**
 * Restatements of a corpus memory: same fact, different words. The write path
 * rejects a new memory within DEDUP_THRESHOLD of an existing one, and 0.93 was
 * chosen against MiniLM's geometry. A model that packs every sentence into a
 * narrow high band needs a different constant, or `mem add` starts refusing
 * unrelated writes — so the threshold has to be re-measured alongside the model,
 * not inherited.
 *
 * The left side is verified to exist in the corpus at startup, same as EVAL.
 */
export const DUPLICATE_PAIRS = [
  ['always use pnpm to install dependencies', 'install packages with pnpm'],
  ['prefer Vitest over Jest for unit tests', 'unit testing is done with Vitest, not Jest'],
  ['nothing goes out on a Friday afternoon', 'no deploys on Friday afternoons'],
  ['commits have to be signed', 'every commit must carry a signature'],
  ['the default branch is main and has been since the migration', 'main is the default branch'],
  ['no any in committed code — take unknown and narrow it', 'never commit any; use unknown and narrow it'],
  ['watch p95 and p99, never the mean', 'look at p95 and p99 instead of averages'],
  ['I prefer metric units and ISO dates', 'use metric units and ISO date formatting'],
  ['do not apologise, just correct the mistake and carry on', 'skip the apology and just fix it'],
  ['give me the conclusion first and the reasoning after', 'lead with the conclusion, explain afterwards'],
  ['delete dead code instead of commenting it out', 'remove dead code rather than commenting it out'],
  ['never force push a branch somebody else is working on', 'do not force push a shared branch'],
];

// ----------------------------------------------------------------- corpus --

/** The 200 memories seed.mjs builds. Deterministic. */
export function corpusRecords(count = 200) {
  // `now` is pinned: generate() only uses it for timestamps, but pinning it
  // keeps two runs of the bench comparing the same 200 strings.
  return seedRecords({ count, now: 1_753_800_000_000 });
}

export function corpusTexts(count = 200) {
  return corpusRecords(count).map((r) => r.text);
}

/**
 * Index pairs the corpus contains ON PURPOSE: a superseded phrasing and the
 * memory that replaced it ("use Jest" / "prefer Vitest over Jest"). They are
 * near-identical by construction and often *contradictory*, so counting them as
 * "unrelated memories that scored high" would blame the model for the fixture.
 * Phase 5b's judge is what resolves them; dedup calibration must skip them.
 */
export function supersededPairs(records = corpusRecords()) {
  const byUid = new Map(records.map((r, i) => [r.uid, i]));
  const pairs = [];
  records.forEach((r, i) => {
    if (r.supersededByUid && byUid.has(r.supersededByUid)) pairs.push([i, byUid.get(r.supersededByUid)]);
  });
  return pairs;
}

/** A typo in EVAL.expect would score as a silent miss. Fail on it instead. */
export function checkEval(texts = corpusTexts()) {
  const set = new Set(texts);
  const missing = [];
  for (const item of EVAL) {
    for (const want of item.expect) if (!set.has(want)) missing.push({ q: item.q, want });
  }
  for (const [original] of DUPLICATE_PAIRS) {
    if (!set.has(original)) missing.push({ q: '(duplicate pair)', want: original });
  }
  if (missing.length > 0) {
    const lines = missing.map((m) => `  ${m.q}\n    -> not in corpus: ${JSON.stringify(m.want)}`);
    throw new Error(`EVAL references texts the corpus does not contain:\n${lines.join('\n')}`);
  }
  return { queries: EVAL.length, negatives: NEGATIVES.length, corpus: texts.length };
}

// ---------------------------------------------------------------- metrics --

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot; // both sides are L2-normalised by the pipeline
}

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const quantile = (xs, p) => {
  const s = [...xs].sort((x, y) => x - y);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
};

// -------------------------------------------------------------- variants --
//
// Raw cosine is what the schema stores and what Turso's vector_distance_cos
// computes, so it is the number that has to work. But every one of these models
// is anisotropic — all 200 memories sit inside a narrow cone, so gte puts every
// score between 0.75 and 0.86 and the absolute value carries almost no signal.
// Two standard corrections, measured rather than assumed:
//
//   centered  subtract the corpus centroid from both sides and renormalise.
//             Composes with the SQL design: store centred vectors, keep the
//             centroid in `meta`, and vector_distance_cos is unchanged. The
//             centroid drifts as memories are added, which is a re-embed — the
//             same machinery a model swap needs.
//   zscore    rescale each query's scores by the mean and spread of that query's
//             OWN distribution over the corpus. Needs every score, not a
//             top-k — so it cannot be a SQL ORDER BY, only a re-rank of
//             candidates already fetched. Measured as an upper bound.

export const VARIANTS = ['raw', 'centered', 'zscore'];

function centroidOf(vectors) {
  const c = new Float64Array(vectors[0].length);
  for (const v of vectors) for (let i = 0; i < v.length; i += 1) c[i] += v[i];
  for (let i = 0; i < c.length; i += 1) c[i] /= vectors.length;
  return c;
}

function recenter(v, c) {
  const out = new Float64Array(v.length);
  let norm = 0;
  for (let i = 0; i < v.length; i += 1) {
    out[i] = v[i] - c[i];
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i += 1) out[i] /= norm;
  return out;
}

const rowScores = (qv, corpusVectors) => corpusVectors.map((v) => cosine(qv, v));

function standardise(scores) {
  const mean = scores.reduce((a, s) => a + s, 0) / scores.length;
  const sd = Math.sqrt(scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length) || 1;
  return scores.map((s) => (s - mean) / sd);
}

/** Score matrices for one variant: [query][memory] and [negative][memory]. */
export function scoreMatrices({ corpusVectors, queryVectors, negativeVectors }, variant) {
  if (variant === 'centered') {
    const c = centroidOf(corpusVectors);
    const cv = corpusVectors.map((v) => recenter(v, c));
    return {
      queries: queryVectors.map((q) => rowScores(recenter(q, c), cv)),
      negatives: negativeVectors.map((q) => rowScores(recenter(q, c), cv)),
    };
  }
  const queries = queryVectors.map((q) => rowScores(q, corpusVectors));
  const negatives = negativeVectors.map((q) => rowScores(q, corpusVectors));
  if (variant === 'zscore') {
    return { queries: queries.map(standardise), negatives: negatives.map(standardise) };
  }
  return { queries, negatives };
}

const round = (n, places = 4) =>
  n === null || n === undefined ? null : Math.round(n * 10 ** places) / 10 ** places;

/**
 * Turn raw vectors into the numbers the decision rests on.
 *
 * The headline is `separation`. `cleanRecall` is its practical restatement: with
 * the threshold placed just above the best junk score — the highest a gate can
 * be set without admitting noise — how many right answers still get through?
 * A negative separation and a cleanRecall well under recall@5 are the same fact
 * said twice.
 */
export function score({ corpus, queries, negatives }) {
  const perQuery = EVAL.map((item, qi) => {
    const scores = queries[qi].map((s, i) => ({ i, text: corpus[i], s }));
    scores.sort((a, b) => b.s - a.s);

    const expect = new Set(item.expect);
    const rank = scores.findIndex((r) => expect.has(r.text)) + 1; // 0 => not found
    const relevant = Math.max(...scores.filter((r) => expect.has(r.text)).map((r) => r.s));

    return {
      q: item.q,
      tier: item.tier,
      rank: rank || null,
      rr: rank ? 1 / rank : 0,
      hit5: rank > 0 && rank <= 5,
      relevant,
      top1: scores[0].s,
      top1Text: scores[0].text,
      // A distractor beating the right answer: the model ranked something else
      // above it. Survivable at rank 2-5; the reason recall@5 is not rank@1.
      intruded: !expect.has(scores[0].text),
    };
  });

  const perNegative = NEGATIVES.map((q, ni) => {
    let best = -Infinity;
    let bestText = null;
    negatives[ni].forEach((s, i) => {
      if (s > best) {
        best = s;
        bestText = corpus[i];
      }
    });
    return { q, top1: best, top1Text: bestText };
  });

  const relevantScores = perQuery.map((r) => r.relevant);
  const negativeScores = perNegative.map((r) => r.top1);
  const worstRelevant = Math.min(...relevantScores);
  const bestIrrelevant = Math.max(...negativeScores);
  const separation = worstRelevant - bestIrrelevant;

  // The most permissive threshold that still admits nothing junk.
  const threshold = bestIrrelevant;
  const cleanRecall =
    perQuery.filter((r) => r.hit5 && r.relevant > threshold).length / perQuery.length;

  const byTier = {};
  for (const tier of ['literal', 'paraphrase']) {
    const rows = perQuery.filter((r) => r.tier === tier);
    byTier[tier] = {
      n: rows.length,
      recall5: rows.filter((r) => r.hit5).length / rows.length,
      mrr: rows.reduce((a, r) => a + r.rr, 0) / rows.length,
      worstRelevant: Math.min(...rows.map((r) => r.relevant)),
      medianRelevant: median(rows.map((r) => r.relevant)),
      cleanRecall: rows.filter((r) => r.hit5 && r.relevant > threshold).length / rows.length,
    };
  }

  // Strict separation is a min against a max, so one pathological question owns
  // it. The p10/p90 version says whether the overlap is a tail or the whole
  // distribution — a model that is broadly separable but loses two hard
  // paraphrases is a different proposition from one whose bands genuinely sit
  // on top of each other, and the strict number cannot tell them apart.
  const separationP10 = quantile(relevantScores, 0.1) - quantile(negativeScores, 0.9);

  // The rank-order version of the same question, and the one that does not
  // hinge on a single query: over every (right answer, junk query) pair, how
  // often does the right answer score higher? 1.0 is a clean threshold, 0.5 is
  // a coin flip. Unlike `separation` it degrades smoothly, so two models that
  // both show "the bands overlap" can still be told apart.
  let wins = 0;
  for (const r of relevantScores) for (const n of negativeScores) if (r > n) wins += 1;
  const auc = wins / (relevantScores.length * negativeScores.length);

  // What a gate actually costs at each setting. `keeps` is right answers still
  // retrieved, `admits` is junk queries that would inject something — the pair
  // phase 3.3 has to trade off, and the reason a single threshold number is not
  // an answer on its own.
  const grid = [];
  const lo = Math.min(...relevantScores, ...negativeScores);
  const hi = Math.max(...relevantScores, ...negativeScores);
  for (let i = 0; i <= 20; i += 1) {
    const t = lo + ((hi - lo) * i) / 20;
    grid.push({
      t: round(t),
      keeps: round(perQuery.filter((r) => r.hit5 && r.relevant >= t).length / perQuery.length, 3),
      admits: round(perNegative.filter((r) => r.top1 >= t).length / perNegative.length, 3),
    });
  }

  return {
    auc,
    sweep: grid,
    n: perQuery.length,
    recall5: perQuery.filter((r) => r.hit5).length / perQuery.length,
    recall1: perQuery.filter((r) => r.rank === 1).length / perQuery.length,
    mrr: perQuery.reduce((a, r) => a + r.rr, 0) / perQuery.length,
    separation,
    separationP10,
    worstRelevant,
    bestIrrelevant,
    cleanRecall,
    usableThreshold: separation > 0 ? (worstRelevant + bestIrrelevant) / 2 : null,
    relevant: { min: worstRelevant, p10: quantile(relevantScores, 0.1), median: median(relevantScores), max: Math.max(...relevantScores) },
    negative: { min: Math.min(...negativeScores), median: median(negativeScores), p90: quantile(negativeScores, 0.9), max: bestIrrelevant },
    intrusions: perQuery.filter((r) => r.intruded).length,
    byTier,
    perQuery,
    perNegative,
  };
}

// ----------------------------------------------------------------- worker --

/**
 * Load one model and describe the space it puts these 241 strings in.
 *
 * Corpus goes through in batches of 32 and queries one at a time, deliberately:
 * that is exactly how the system uses the model (seed/import batch, search does
 * not), and the q8 kernel is batch-size sensitive, so a bench that embedded both
 * sides the same way would measure a configuration that never runs.
 */
async function runModel(cfg, { paths, env }) {
  const { pipeline, env: tenv } = await loadTransformers({ paths, env });
  tenv.cacheDir = paths.modelsDir;
  tenv.useFSCache = true;
  tenv.localModelPath = paths.modelsDir;
  tenv.allowLocalModels = true;
  tenv.allowRemoteModels = true;

  const t0 = performance.now();
  const extractor = await pipeline('feature-extraction', cfg.modelId, { dtype: cfg.dtype });
  const loadMs = performance.now() - t0;

  const POOL = { pooling: 'mean', normalize: true };
  const vecOf = (tensor, row, dim) =>
    new Float32Array(tensor.data.subarray(row * dim, (row + 1) * dim));

  const probe = await extractor('dimension probe', POOL);
  const dim = probe.dims.at(-1);
  if (dim !== cfg.dim) throw new Error(`${cfg.key}: model is ${dim}d, MODELS says ${cfg.dim}d`);

  const records = corpusRecords();
  const corpus = records.map((r) => r.text);

  const corpusVectors = [];
  const tBatch = performance.now();
  for (let i = 0; i < corpus.length; i += 32) {
    const batch = corpus.slice(i, i + 32).map((t) => cfg.passagePrefix + t);
    const tensor = await extractor(batch, POOL);
    for (let r = 0; r < batch.length; r += 1) corpusVectors.push(vecOf(tensor, r, dim));
  }
  const corpusMs = performance.now() - tBatch;

  const embedOne = async (text) => {
    const t = performance.now();
    const tensor = await extractor(cfg.queryPrefix + text, POOL);
    return { vec: vecOf(tensor, 0, dim), ms: performance.now() - t };
  };

  const singleMs = [];
  const queryVectors = [];
  for (const item of EVAL) {
    const { vec, ms } = await embedOne(item.q);
    queryVectors.push(vec);
    singleMs.push(ms);
  }
  const negativeVectors = [];
  for (const q of NEGATIVES) {
    const { vec, ms } = await embedOne(q);
    negativeVectors.push(vec);
    singleMs.push(ms);
  }

  const vectors = { corpusVectors, queryVectors, negativeVectors };
  const variants = Object.fromEntries(
    VARIANTS.map((v) => [v, score({ corpus, ...scoreMatrices(vectors, v) })]),
  );

  // ---- dedup calibration -------------------------------------------------
  //
  // Two distributions that the write path's one constant has to sit between:
  // the closest pair of DISTINCT memories (must stay below the threshold, or
  // `mem add` rejects a legitimate write) and the restatement pairs (must stay
  // above it, or duplicates accumulate). Both are model-specific geometry, so
  // both move when the model does.
  const skip = new Set(supersededPairs(records).map(([a, b]) => `${Math.min(a, b)}:${Math.max(a, b)}`));
  let closestDistinct = { s: -1, a: null, b: null };
  let closestAny = { s: -1, a: null, b: null };
  for (let i = 0; i < corpusVectors.length; i += 1) {
    for (let j = i + 1; j < corpusVectors.length; j += 1) {
      const s = cosine(corpusVectors[i], corpusVectors[j]);
      if (s > closestAny.s) closestAny = { s, a: corpus[i], b: corpus[j] };
      if (s > closestDistinct.s && !skip.has(`${i}:${j}`)) {
        closestDistinct = { s, a: corpus[i], b: corpus[j] };
      }
    }
  }

  const byText = new Map(corpus.map((t, i) => [t, i]));
  const dupScores = [];
  for (const [original, restatement] of DUPLICATE_PAIRS) {
    const tensor = await extractor(cfg.passagePrefix + restatement, POOL);
    const s = cosine(corpusVectors[byText.get(original)], vecOf(tensor, 0, dim));
    dupScores.push({ cos: round(s), original, restatement });
  }
  const minDuplicate = Math.min(...dupScores.map((d) => d.cos));

  return {
    key: cfg.key,
    modelId: cfg.modelId,
    dtype: cfg.dtype,
    dim,
    queryPrefix: cfg.queryPrefix,
    passagePrefix: cfg.passagePrefix,
    timing: {
      loadMs: round(loadMs, 1),
      corpusMs: round(corpusMs, 1),
      perEmbedMedianMs: round(median(singleMs), 2),
      perEmbedMaxMs: round(Math.max(...singleMs), 2),
      perBatch32Ms: round((corpusMs / corpus.length) * 32, 1),
    },
    metrics: variants.raw,
    variants,
    dedup: {
      closestDistinct: { cos: round(closestDistinct.s), a: closestDistinct.a, b: closestDistinct.b },
      closestAny: { cos: round(closestAny.s), a: closestAny.a, b: closestAny.b },
      minDuplicate: round(minDuplicate),
      medianDuplicate: round(median(dupScores.map((d) => d.cos))),
      // Halfway between "closest distinct pair" and "loosest restatement".
      // null when they cross — then no single cosine threshold can dedup, and
      // the write path needs a different rule rather than a different constant.
      suggested:
        minDuplicate > closestDistinct.s ? round((minDuplicate + closestDistinct.s) / 2, 3) : null,
      margin: round(minDuplicate - closestDistinct.s),
      pairs: dupScores,
    },
  };
}

/**
 * Node boot + import + model load + one query embed, measured as wall time by
 * the parent. This is the number the ~400ms hook budget is about; `loadMs`
 * alone leaves out about a third of it.
 */
async function runCold(cfg, { paths, env }) {
  const { pipeline, env: tenv } = await loadTransformers({ paths, env });
  tenv.cacheDir = paths.modelsDir;
  tenv.useFSCache = true;
  tenv.localModelPath = paths.modelsDir;
  tenv.allowLocalModels = true;
  tenv.allowRemoteModels = false;

  const t0 = performance.now();
  const extractor = await pipeline('feature-extraction', cfg.modelId, { dtype: cfg.dtype });
  const loadMs = performance.now() - t0;
  const t1 = performance.now();
  await extractor(`${cfg.queryPrefix}which package manager should I use?`, {
    pooling: 'mean',
    normalize: true,
  });
  return { key: cfg.key, loadMs: round(loadMs, 1), firstEmbedMs: round(performance.now() - t1, 1) };
}

// ----------------------------------------------------------------- driver --

const MARKER = '__BENCH_JSON__';

function spawnChild(args, { verbose }) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const child = spawn(process.execPath, [SELF, ...args], {
      stdio: ['ignore', 'pipe', verbose ? 'inherit' : 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr?.on('data', (d) => {
      err += d;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const wallMs = performance.now() - t0;
      const line = out.split('\n').find((l) => l.startsWith(MARKER));
      if (code !== 0 || !line) {
        reject(new Error(`child ${args.join(' ')} failed (exit ${code})\n${err || out}`.trim()));
        return;
      }
      resolve({ ...JSON.parse(line.slice(MARKER.length)), wallMs: round(wallMs, 1) });
    });
  });
}

function parseArgs(argv) {
  const out = { json: false, all: false, models: null, worker: null, cold: null, verbose: false, coldRuns: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--all') out.all = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a === '--models') out.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--worker') out.worker = argv[++i];
    else if (a === '--cold') out.cold = argv[++i];
    else if (a === '--cold-runs') out.coldRuns = Number(argv[++i]);
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function selectModels(args) {
  if (args.models) {
    return args.models.map((key) => {
      const cfg = MODELS.find((m) => m.key === key);
      if (!cfg) throw new Error(`Unknown model "${key}". Known: ${MODELS.map((m) => m.key).join(', ')}`);
      return cfg;
    });
  }
  return MODELS.filter((m) => args.all || m.tier === 'core');
}

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const sig = (x, places = 3) => (x >= 0 ? ' ' : '') + x.toFixed(places);

function report(results, shape) {
  const lines = [];
  lines.push(
    `${shape.corpus} memories, ${shape.queries} questions ` +
      `(${EVAL.filter((e) => e.tier === 'literal').length} literal, ` +
      `${EVAL.filter((e) => e.tier === 'paraphrase').length} paraphrase), ` +
      `${shape.negatives} negatives`,
  );
  lines.push('');
  lines.push('model                dim  r@5   r@1   MRR    worst-rel  best-irr  SEPARATION  p10-sep   AUC   clean-r@5  load ms  embed ms  cold ms');
  lines.push('-'.repeat(138));
  for (const r of results) {
    const m = r.metrics;
    lines.push(
      [
        r.key.padEnd(19),
        String(r.dim).padStart(4),
        pct(m.recall5).padStart(5),
        pct(m.recall1).padStart(5),
        m.mrr.toFixed(3).padStart(6),
        sig(m.worstRelevant).padStart(10),
        sig(m.bestIrrelevant).padStart(9),
        sig(m.separation).padStart(11),
        sig(m.separationP10).padStart(8),
        m.auc.toFixed(3).padStart(6),
        pct(m.cleanRecall).padStart(10),
        String(r.timing.loadMs).padStart(8),
        String(r.timing.perEmbedMedianMs).padStart(9),
        String(r.cold?.wallMs ?? '-').padStart(8),
      ].join(' '),
    );
  }
  lines.push('');
  lines.push('paraphrase-only (the case that decides it):');
  for (const r of results) {
    const t = r.metrics.byTier.paraphrase;
    lines.push(
      `  ${r.key.padEnd(16)} r@5 ${pct(t.recall5).padStart(4)}   MRR ${t.mrr.toFixed(3)}` +
        `   worst-rel ${sig(t.worstRelevant)}   clean-r@5 ${pct(t.cleanRecall).padStart(4)}`,
    );
  }
  lines.push('');
  lines.push('score normalisation — does the overlap survive it?');
  lines.push('                     raw                    centered               zscore');
  lines.push('                     sep    p10sep  clean   sep    p10sep  clean   sep    p10sep  clean');
  for (const r of results) {
    const cell = (v) =>
      `${sig(v.separation).padStart(6)} ${sig(v.separationP10).padStart(6)} ${pct(v.cleanRecall).padStart(5)}`;
    lines.push(`  ${r.key.padEnd(18)} ${VARIANTS.map((v) => cell(r.variants[v])).join('  ')}`);
  }
  lines.push('');
  lines.push('write-path dedup calibration (current constant: 0.93):');
  lines.push('  model                closest-distinct  loosest-restatement  margin  suggested');
  for (const r of results) {
    const d = r.dedup;
    lines.push(
      `  ${r.key.padEnd(19)} ${d.closestDistinct.cos.toFixed(3).padStart(16)}` +
        ` ${d.minDuplicate.toFixed(3).padStart(20)} ${sig(d.margin).padStart(7)}` +
        ` ${(d.suggested === null ? 'none — bands cross' : d.suggested.toFixed(3)).padStart(10)}`,
    );
  }

  const best = [...results].sort((a, b) => b.metrics.separation - a.metrics.separation)[0];
  lines.push('');
  lines.push(`threshold sweep for ${best.key} — what a gate costs at each setting:`);
  lines.push('  threshold  right answers kept  junk admitted');
  for (const row of best.metrics.sweep) {
    lines.push(`  ${row.t.toFixed(3).padStart(9)}  ${pct(row.keeps).padStart(18)}  ${pct(row.admits).padStart(13)}`);
  }

  lines.push('');
  lines.push(
    best.metrics.separation > 0
      ? `WINNER ${best.key}: separation ${sig(best.metrics.separation)} — a threshold at ` +
          `${best.metrics.usableThreshold.toFixed(3)} admits every right answer and rejects every junk query.`
      : `BEST ${best.key}: separation ${sig(best.metrics.separation)}, AUC ${best.metrics.auc.toFixed(3)}, ` +
          `${pct(best.metrics.cleanRecall)} of right answers survive a gate that admits no junk. ` +
          'Strict separation is still negative — the bands touch in the tail, so the gate trades recall for precision rather than settling it.',
  );
  return lines.join('\n');
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      'usage: embed-bench.mjs [--json] [--all] [--models a,b] [--verbose]\n' +
        `models: ${MODELS.map((m) => m.key).join(', ')}\n`,
    );
    return 0;
  }

  const paths = resolvePaths();
  const env = process.env;

  // Child modes print one JSON line and exit; the parent does the aggregation.
  if (args.worker) {
    const cfg = MODELS.find((m) => m.key === args.worker);
    if (!cfg) throw new Error(`Unknown model "${args.worker}"`);
    const result = await runModel(cfg, { paths, env });
    process.stdout.write(`${MARKER}${JSON.stringify(result)}\n`);
    return 0;
  }
  if (args.cold) {
    const cfg = MODELS.find((m) => m.key === args.cold);
    if (!cfg) throw new Error(`Unknown model "${args.cold}"`);
    process.stdout.write(`${MARKER}${JSON.stringify(await runCold(cfg, { paths, env }))}\n`);
    return 0;
  }

  ensureDataDir(paths);
  const shape = checkEval();
  const configs = selectModels(args);

  const results = [];
  for (const cfg of configs) {
    if (!args.json) process.stderr.write(`[bench] ${cfg.key} ...\n`);
    const result = await spawnChild(['--worker', cfg.key], args);

    // Cold path, best of N: the first run pays a cold page cache, and the hook
    // budget is about the steady state, not about the first boot after a
    // download. All samples are kept in --json so the spread stays visible.
    const colds = [];
    for (let i = 0; i < args.coldRuns; i += 1) colds.push(await spawnChild(['--cold', cfg.key], args));
    result.cold = {
      wallMs: Math.min(...colds.map((c) => c.wallMs)),
      loadMs: Math.min(...colds.map((c) => c.loadMs)),
      firstEmbedMs: Math.min(...colds.map((c) => c.firstEmbedMs)),
      samples: colds,
    };
    results.push(result);
  }

  if (args.json) {
    // perQuery/perNegative stay in — they are how you tell "the model is wrong"
    // from "the question was bad", and this file is evidence for a decision.
    process.stdout.write(`${JSON.stringify({ shape, results }, null, 2)}\n`);
  } else {
    process.stdout.write(`${report(results, shape)}\n`);
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err?.stack ?? err}\n`);
      process.exit(1);
    },
  );
}
