// Embeddings — transformers.js, fully offline once the model is cached.
//
// One model, pinned here and stamped onto every row as `emb_model`: changing it
// later is a migration (`mem reembed` rewrites the rows carrying the old stamp),
// never a silent mix of two vector spaces. Vectors come out mean-pooled and L2
// normalised, so cosine similarity is just a dot product and Turso's
// vector_distance_cos(a, b) is 1 - similarity.
//
// WHY gte-small AND NOT all-MiniLM-L6-v2
//
// Slice 1.3 found the incumbent's relevant and irrelevant score bands
// overlapping: a paraphrase of a stored fact scored 0.273 while an unrelated
// memory scored 0.256, so no gate threshold could tell them apart. MiniLM is a
// *symmetric* similarity model and this system compares a question against a
// stored statement.
//
// Slice 1.6 measured ten configurations against 200 seeded memories, 32
// questions (24 of them paraphrases sharing no content word with their target)
// and 9 unanswerable ones — build/embed-bench.mjs, numbers in PLAN.md. gte-small
// won on every retrieval metric that matters:
//
//                    AUC    separation   clean-r@5   cold ms
//   all-MiniLM-L6    0.854    -0.218        69%        277
//   gte-small        0.969    -0.031        78%        321
//
// AUC is the probability a right answer outscores a junk query; 0.969 against
// 0.854 is the whole finding. Strict separation is still slightly negative —
// two hard paraphrases sit under two word-overlap negatives — so phase 3.3
// tunes a threshold that trades recall against precision rather than one that
// settles the question. gte needs no query/passage prefix, but the prefix
// machinery below stays because the next swap may.
//
// Ruled out by the same run: q8 vs fp32 changes AUC by at most 0.007, in no
// consistent direction, while costing 2-3x the embed time; and 768d models
// score worse, not better. Quantisation and dimensionality were never it.
//
// TWO CONSTANTS MOVE WITH THIS ONE, because both are model geometry:
// search.mjs VECTOR_THRESHOLD (0.35 -> 0.82) and, at least to re-measure,
// write.mjs DEDUP_THRESHOLD (0.93 survived; see PLAN.md).
//
// Measured, cached, this machine: model load 157ms, single embed 2.0ms, cold
// end-to-end (node boot + import + load + one embed) 321ms against a 400ms hook
// budget.

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { depsReady, loadTransformers } from './deps.mjs';
import { ensureDataDir, resolvePaths } from './paths.mjs';

export const EMB_MODEL_ID = 'Xenova/gte-small';
export const EMB_DTYPE = 'q8';
/** What goes in memories.emb_model — id and quantisation together. */
export const EMB_MODEL = `${EMB_MODEL_ID}@${EMB_DTYPE}`;
export const EMB_DIM = 384;

/**
 * Asymmetric models want to be told which side of the comparison they are
 * looking at, and they disagree about how: e5 wants 'query: ' / 'passage: ',
 * bge wants an instruction on the query only, gte wants neither. Empty for the
 * pinned model, but every embed goes through prefixFor() anyway — a swap to a
 * prefixed model must be these two constants and nothing else, and a prefix
 * applied on one side only is a silent 20-point recall loss, not an error.
 *
 * A prefix is part of the vector space: changing one is a `mem reembed`, which
 * is why they are folded into EMB_MODEL_TAG rather than left implicit.
 */
export const QUERY_PREFIX = '';
export const PASSAGE_PREFIX = '';

export const ROLES = ['query', 'passage'];

export function prefixFor(role) {
  if (role === 'query') return QUERY_PREFIX;
  if (role === 'passage') return PASSAGE_PREFIX;
  throw new Error(`Unknown embedding role ${JSON.stringify(role)} — expected one of ${ROLES.join(', ')}.`);
}

const POOLING = { pooling: 'mean', normalize: true };

/** Files transformers.js needs on disk before it can work without the network. */
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];

/** Where the transformers.js FS cache puts this model inside modelsDir. */
export function modelDir(paths = resolvePaths()) {
  return join(paths.modelsDir, ...EMB_MODEL_ID.split('/'));
}

/** True when every file the model needs is already downloaded. */
export function modelCached(paths = resolvePaths()) {
  const dir = modelDir(paths);
  return MODEL_FILES.every((f) => existsSync(join(dir, ...f.split('/'))));
}

/**
 * Point transformers.js at our cache instead of its default one inside
 * node_modules — that directory is disposable (a dependency reinstall wipes it)
 * and PLAN puts the model under ${CLAUDE_PLUGIN_DATA}/models.
 */
function configureEnv(tenv, paths, offline) {
  tenv.cacheDir = paths.modelsDir;
  tenv.useFSCache = true;
  // The FS cache lays files out as <dir>/<model>/<file>, which is exactly the
  // layout localModelPath expects — so pointing both at modelsDir means offline
  // loads resolve straight off disk. It also has to stay on: transformers.js
  // rejects a config with local *and* remote models disabled.
  tenv.localModelPath = paths.modelsDir;
  tenv.allowLocalModels = true;
  tenv.allowRemoteModels = !offline;
  return tenv;
}

let extractorPromise = null;

/**
 * The feature-extraction pipeline, created once per process. Concurrent callers
 * share the single load; a failed load is not memoised, so a later call retries.
 *
 * `offline` refuses to reach the network and fails with an actionable message
 * instead — what doctor and the hooks want. It defaults to MEM_NO_INSTALL, so
 * the one env var disables every implicit download.
 */
export async function loadExtractor({
  paths = resolvePaths(),
  env = process.env,
  offline = env.MEM_NO_INSTALL === '1',
} = {}) {
  if (extractorPromise) return extractorPromise;

  extractorPromise = (async () => {
    if (offline && !modelCached(paths)) {
      throw new Error(
        `Embedding model ${EMB_MODEL} is not cached in ${modelDir(paths)} ` +
          `(downloads disabled). Run 'mem warm' to fetch it.`,
      );
    }
    if (!offline) ensureDataDir(paths);

    const { pipeline, env: tenv } = await loadTransformers({ paths, env });
    configureEnv(tenv, paths, offline);
    return pipeline('feature-extraction', EMB_MODEL_ID, { dtype: EMB_DTYPE });
  })();

  try {
    return await extractorPromise;
  } catch (err) {
    extractorPromise = null;
    throw err;
  }
}

/**
 * Drop the memoised pipeline. Only tests and a future model swap need this —
 * normal code wants exactly one model per process.
 */
export function resetExtractor() {
  extractorPromise = null;
}

function toVector(tensor, row = 0) {
  const [, dim] = tensor.dims.length === 2 ? tensor.dims : [1, tensor.dims[0]];
  if (dim !== EMB_DIM) {
    throw new Error(`Embedding model returned ${dim} dimensions, expected ${EMB_DIM}.`);
  }
  // Copy: tensor.data is a view into a buffer shared by the whole batch.
  return new Float32Array(tensor.data.subarray(row * dim, (row + 1) * dim));
}

function requireText(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Cannot embed empty text.');
  }
  return value;
}

/**
 * Embed one string. Returns a normalised Float32Array of length EMB_DIM.
 *
 * `role` defaults to 'passage' because storing is the common case and every
 * write path wants it; retrieval is the one exception and calls embedQuery()
 * by name. Defaulting the other way would make a forgotten option corrupt the
 * stored vectors rather than degrade one search.
 */
export async function embed(text, opts = {}) {
  const extractor = await loadExtractor(opts);
  const tensor = await extractor(prefixFor(opts.role ?? 'passage') + requireText(text), POOLING);
  return toVector(tensor);
}

/**
 * Embed a search query. Separate from embed() so the asymmetric side of the
 * comparison is impossible to get by accident — with a prefixed model, calling
 * embed() here would compare a passage-shaped vector against passages and look
 * like it worked.
 */
export const embedQuery = (text, opts = {}) => embed(text, { ...opts, role: 'query' });

/**
 * Embed many strings in one forward pass — far cheaper than N calls (PLAN: 43ms
 * for 32 vs 11ms each).
 *
 * Caveat, measured on 4.2.0: the q8 kernel is batch-size sensitive, so a vector
 * produced in a batch is only ~0.97-0.99 cosine to the same text embedded
 * alone. Fine for bulk seeding and for retrieval ranking, but write-time dedup
 * compares against a threshold (0.93) and should embed one at a time so the
 * comparison is against a stable vector.
 */
export async function embedMany(texts, opts = {}) {
  if (texts.length === 0) return [];
  const extractor = await loadExtractor(opts);
  const prefix = prefixFor(opts.role ?? 'passage');
  const tensor = await extractor(texts.map((t) => prefix + requireText(t)), POOLING);
  return texts.map((_, i) => toVector(tensor, i));
}

/**
 * Cosine similarity. Vectors from embed() are already unit length, so this is a
 * dot product, but the denominator stays for vectors read back from elsewhere.
 */
export function cosine(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}.`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Encode a vector for SQL. Turso's vector32() accepts either '[1,2,3]' text or
 * the raw little-endian f32 blob (both verified on 0.7.1); the blob avoids
 * formatting 384 floats into a string on every query.
 */
export function vectorBlob(vec) {
  const f32 = vec instanceof Float32Array ? vec : Float32Array.from(vec);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

/**
 * Read-only description of the model cache for `doctor`. Never downloads, never
 * installs dependencies, never throws.
 */
export function embedStatus(paths = resolvePaths()) {
  const dir = modelDir(paths);
  const files = MODEL_FILES.map((name) => {
    const file = join(dir, ...name.split('/'));
    let bytes = null;
    try {
      bytes = statSync(file).size;
    } catch {
      bytes = null;
    }
    return { name, bytes, present: bytes !== null };
  });

  return {
    model: EMB_MODEL,
    modelId: EMB_MODEL_ID,
    dtype: EMB_DTYPE,
    dim: EMB_DIM,
    queryPrefix: QUERY_PREFIX,
    passagePrefix: PASSAGE_PREFIX,
    cacheDir: dir,
    cached: files.every((f) => f.present),
    bytes: files.reduce((sum, f) => sum + (f.bytes ?? 0), 0),
    files,
    depsReady: depsReady(paths),
  };
}

/**
 * Download (if needed) and load the model, then embed once to prove it works.
 * The mutating counterpart to embedStatus — what `mem warm` runs, so that no
 * other command has to pay a download at an awkward moment.
 */
export async function warmModel({ paths = resolvePaths(), env = process.env } = {}) {
  const cachedBefore = modelCached(paths);

  const t0 = performance.now();
  await loadExtractor({ paths, env, offline: false });
  const loadMs = performance.now() - t0;

  const t1 = performance.now();
  const vector = await embed('mem warm probe', { paths, env });
  const embedMs = performance.now() - t1;

  return {
    model: EMB_MODEL,
    dim: vector.length,
    cacheDir: modelDir(paths),
    downloaded: !cachedBefore,
    loadMs,
    embedMs,
  };
}
