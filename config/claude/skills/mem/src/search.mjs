// Hybrid retrieval — PLAN's "Retrieval" section, steps 1-6.
//
// The seven steps, in order: scope the candidates, rank them by vector distance,
// rank them again lexically, fuse the two rankings by reciprocal rank, multiply
// by a strength boost, drop everything that fails the gate, cap at five. Step 7
// (the hooks that call this) is phase 3.
//
// PLAN is blunt that "the real risk is precision, not performance": a memory
// system fails by injecting five stale half-relevant facts on every prompt until
// the model starts obeying them. So the gate is the point of this file, not the
// ranking. `search()` returning [] is a success, and on an unrelated prompt it is
// the *only* correct answer.
//
// What fts_match actually does in this Turso build, measured rather than assumed
// (0.7.x, probed on this machine — it is not SQLite FTS5 and does not behave like
// it):
//
//   fts_match(text, 'a b')   OR across terms, never AND      'pnpm monday' hits both docs
//   operators                none — AND/OR/NOT are terms     'use NOT pnpm' matched "not docker"
//   quoted phrases           not honoured                    "dependencies install" matched anyway
//   prefix 'depend*'         no match                        no prefix, no stemming, no substrings
//   tokenizer                splits on every non-alphanumeric  MEM_PROJECT_KEY -> mem|project|key
//                            but NOT on camelCase              getUserById -> one token
//   case                     insensitive
//   fts_score(text)          returns 0 — the scoring index is feature-gated off
//
// Two consequences drive the design below. Because it is pure OR and does not
// drop stopwords, feeding it a raw prompt matches half the store on "the" and
// "use" — so the query is tokenised and stopworded here first. And because
// fts_score is dead, the lexical leg cannot be ranked in SQL at all; SQL is used
// only to prune, and the ranking happens in JS over the matched rows.
//
// Timestamps are epoch milliseconds throughout, matching write.mjs.

import { withDb } from './db.mjs';
import { EMB_DIM, EMB_MODEL, embedQuery, vectorBlob } from './embed.mjs';
import { resolveScope } from './scope.mjs';

/** PLAN retrieval steps 2 and 3: twenty candidates from each leg. */
export const VECTOR_LIMIT = 20;
export const LEXICAL_LIMIT = 20;

/** PLAN step 4: reciprocal rank fusion, sum of 1/(60 + rank). */
export const RRF_K = 60;

/** PLAN step 6: "Cap 5 items / ~600 tokens." */
export const MAX_RESULTS = 5;

/**
 * PLAN step 6: keep only vector-sim >= a threshold. PLAN also says outright that
 * the value "is a starting guess and must be tuned against the harness in Phase
 * 3", so it is a named export and an option, not a literal buried in a WHERE
 * clause.
 *
 * THIS CONSTANT IS MODEL GEOMETRY, NOT A PREFERENCE. It was 0.35 for
 * all-MiniLM-L6-v2, whose scores spread over 0.1-0.9. gte-small (slice 1.6)
 * packs every sentence pair into roughly 0.75-0.95, where 0.35 is not a gate at
 * all — everything passes. Swapping the model in embed.mjs without moving this
 * turns the gate off silently, which is why they are documented as a pair.
 *
 * Measured by build/embed-bench.mjs: 200 seeded memories, 32 questions with a
 * known answer, 9 answerable-by-nothing. "keeps" is right answers still
 * retrieved, "admits" is junk prompts that would inject something:
 *
 *   gte-small@q8         t=0.79  keeps 81%  admits 1/9
 *                        t=0.81  keeps 78%  admits 1/9
 *                        t=0.814 keeps 78%  admits 0/9   <- efficient point
 *                        t=0.82  keeps 72%  admits 0/9   <- shipped
 *                        t=0.83  keeps 63%  admits 0/9
 *   all-MiniLM@q8 (old)  t=0.35  keeps 53%  admits 0/9
 *
 * 0.82 rather than the efficient 0.814 because 0.814 is a hair above the
 * *maximum* of a nine-sample negative distribution, and fitting a production
 * threshold to a sample maximum is how a gate that measured clean starts leaking.
 * The 6 points of recall buy margin, and 72%-at-zero-junk still beats the old
 * model's 53% by a wide margin. Phase 3.3 re-tunes this against the real harness.
 */
export const VECTOR_THRESHOLD = 0.82;

/**
 * The other half of the gate — PLAN's "or an exact lexical hit". With OR
 * semantics, merely appearing in the lexical leg means almost nothing (one
 * shared common word does it), so a lexical pass demands that the row cover this
 * fraction of the query's total IDF mass: either most of a short query's terms,
 * or the one rare token that carried the query's meaning. That rare-token case
 * is the whole reason the lexical leg exists — identifiers like MEM_PROJECT_KEY
 * or pnpm-lock.yaml are precisely what the embedding model represents worst.
 */
export const LEXICAL_GATE_COVERAGE = 0.6;

/** PLAN step 5: `× (1 + 0.3·salience + 0.2·pinned)`, with strength for salience. */
export const STRENGTH_WEIGHT = 0.3;
export const PINNED_WEIGHT = 0.2;

/** PLAN decay: `halflife_days = H0 × (1 + useful_count)^α`, H0 = 30, α = 0.6. */
export const HALFLIFE_H0 = 30;
export const HALFLIFE_ALPHA = 0.6;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Single characters match nothing useful and every prompt is full of them. */
export const MIN_TERM_LENGTH = 2;

/**
 * A prompt is not a search query. Past a dozen content words the OR leg stops
 * discriminating and just costs rows, so the terms are capped — visibly, in the
 * returned `terms`, so a surprising result can be explained.
 */
export const MAX_TERMS = 12;

/**
 * Dropped before the lexical leg runs. fts_match does no stopword removal of its
 * own, so without this "which package manager does this project use?" matches
 * every memory containing "use" or "this" and the fusion drowns. The vector leg
 * is what carries a query's grammar; the lexical leg only has to carry its rare
 * tokens. Deliberately contains no domain words — "project", "key", "test",
 * "build" and "deploy" all stay, because they are the tokens worth matching on.
 */
export const STOPWORDS = new Set([
  'about', 'after', 'all', 'also', 'am', 'an', 'and', 'any', 'anything', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'done', 'down',
  'each', 'for', 'from', 'get', 'got', 'had', 'has', 'have', 'he', 'her', 'here', 'him',
  'his', 'how', 'if', 'in', 'into', 'is', 'it', 'its', 'just',
  'make', 'made', 'may', 'me', 'might', 'more', 'most', 'much', 'must', 'my',
  'need', 'no', 'not', 'now', 'of', 'off', 'on', 'once', 'one', 'only', 'or', 'other',
  'our', 'out', 'over', 'own', 'please', 'said', 'same', 'she', 'should', 'so', 'some',
  'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they',
  'thing', 'things', 'this', 'those', 'through', 'to', 'too', 'up', 'us', 'use', 'used',
  'using', 'very', 'want', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'why', 'will', 'with', 'would', 'you', 'your', 'yes',
]);

/**
 * Split text the way this Turso build's fts_match splits it: lowercase, break on
 * every run of non-alphanumerics (so `MEM_PROJECT_KEY`, `pnpm-lock.yaml` and
 * `don't` all come apart), and leave camelCase alone (so does fts_match —
 * `getUserById` is one token there and must stay one token here, or the query
 * terms would not be the terms the database can match).
 *
 * Used for both the query and the matched rows, which is what makes the JS-side
 * scoring agree with the SQL-side matching.
 */
export function tokenise(text) {
  if (typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TERM_LENGTH);
}

/** The distinctive words of a query: tokenised, stopworded, deduped, capped. */
export function queryTerms(query) {
  const seen = new Set();
  for (const token of tokenise(query)) {
    if (!STOPWORDS.has(token)) seen.add(token);
    if (seen.size >= MAX_TERMS) break;
  }
  return [...seen];
}

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * PLAN: `halflife_days = H0 × (1 + useful_count)^α`. Spaced repetition, not a
 * linear timer — a memory that keeps proving useful becomes durable. Used five
 * times, its halflife is ~88 days instead of 30.
 */
export function halflifeDays(usefulCount = 0, { h0 = HALFLIFE_H0, alpha = HALFLIFE_ALPHA } = {}) {
  return h0 * (1 + Math.max(0, usefulCount ?? 0)) ** alpha;
}

/**
 * PLAN: `retention = exp(−ln2 × days_since_last_use / halflife_days)`, and
 * `pinned = 1` forces 1.0 — pinned memories never decay.
 *
 * A memory that has never been used decays from when it was last *written*,
 * because "never used" and "used a moment ago" must not score the same. Hence
 * the fall back through last_used_at → updated_at → created_at.
 */
export function retention(row, now = Date.now()) {
  if (row.pinned) return 1;
  const since = row.last_used_at ?? row.updated_at ?? row.created_at ?? now;
  const days = Math.max(0, (now - since) / DAY_MS);
  return Math.exp((-Math.LN2 * days) / halflifeDays(row.useful_count));
}

/**
 * PLAN: `strength = salience × retention × confidence`, and it "replaces raw
 * salience in the retrieval boost, so stale memories sink in ranking long before
 * pruning touches them".
 */
export function strength(row, now = Date.now()) {
  return clamp01(row.salience) * retention(row, now) * clamp01(row.confidence);
}

/**
 * PLAN step 5: `× (1 + 0.3·salience + 0.2·pinned) × recency_decay`.
 *
 * Recency is *not* multiplied in again on top. PLAN's decay section supersedes
 * the earlier line — retention is already inside `strength`, and applying it
 * twice would square the decay and bury month-old memories that are still right.
 */
export function boostFactor(row, now = Date.now()) {
  return 1 + STRENGTH_WEIGHT * strength(row, now) + PINNED_WEIGHT * (row.pinned ? 1 : 0);
}

/**
 * PLAN step 4: fuse by reciprocal rank, `Σ 1/(60 + rank)`.
 *
 * Rank fusion rather than score fusion on purpose: a cosine similarity and a
 * term-overlap score are not on a common scale and normalising them would be an
 * invented calibration. Ranks are comparable by construction, and k = 60 keeps
 * any single leg from dominating on its top hit alone.
 *
 * `legs` is `{ name: [id, …] }` in rank order. Returns id → { rrf, ranks }.
 */
export function fuse(legs, k = RRF_K) {
  const fused = new Map();
  for (const [name, ids] of Object.entries(legs)) {
    ids.forEach((id, index) => {
      const rank = index + 1;
      const entry = fused.get(id) ?? { rrf: 0, ranks: {} };
      entry.rrf += 1 / (k + rank);
      entry.ranks[name] = rank;
      fused.set(id, entry);
    });
  }
  return fused;
}

/**
 * Rank the lexical matches. Pure, so the scoring is testable without a database.
 *
 * `rows` must be *every* candidate fts_match returned, not a truncated page: the
 * document frequencies are counted from it, and because fts_match is a pure OR,
 * every candidate row containing a term is in there — which makes the df exact
 * for the scoped candidate set rather than an estimate.
 *
 * Score is IDF coverage: of the total inverse-document-frequency mass of the
 * query's terms, how much did this row account for. A row matching only "test"
 * when half the store says "test" scores near zero; a row matching the single
 * occurrence of "mem_project_key" scores near one. That ratio is what the gate
 * reads, and it is why a common-word coincidence cannot clear it.
 */
export function rankLexical(rows, terms, candidateCount = rows.length) {
  if (terms.length === 0 || rows.length === 0) return [];

  const df = new Map(terms.map((term) => [term, 0]));
  const matches = [];
  for (const row of rows) {
    const tokens = new Set(tokenise(row.text));
    const hits = terms.filter((term) => tokens.has(term));
    if (hits.length === 0) continue;
    for (const term of hits) df.set(term, df.get(term) + 1);
    matches.push({ row, hits });
  }

  const n = Math.max(candidateCount, rows.length, 1);
  const idf = new Map(terms.map((t) => [t, Math.log(1 + n / (1 + df.get(t)))]));
  const total = terms.reduce((sum, t) => sum + idf.get(t), 0);

  return matches
    .map(({ row, hits }) => ({
      ...row,
      terms: hits,
      coverage: total === 0 ? 0 : hits.reduce((sum, t) => sum + idf.get(t), 0) / total,
    }))
    // Ties broken by id so a given store and query always answer identically.
    .sort((a, b) => b.coverage - a.coverage || a.id - b.id);
}

// Never `SELECT *`: emb is 1.5 KB of float noise per row and nothing downstream
// of here wants it.
const COLUMNS = `id, uid, kind, scope, project_key, text, why,
                 salience, confidence, pinned, status,
                 created_at, updated_at, last_used_at, useful_count,
                 last_injected_at, injected_count, expires_at`;

/**
 * PLAN step 1: `status='active' AND (scope='global' OR project_key = ?)`.
 *
 * A null projectKey makes `project_key = ?` false for every row, so it degrades
 * to globals-only rather than to everything — the safe direction.
 *
 * The expiry clause is not in PLAN's step 1. It is here because TTL expiry is a
 * tier-1 maintenance job that runs on a schedule, and between two runs an expired
 * memory is still `status='active'`; injecting a fact the user explicitly gave a
 * lifetime to is the kind of error nobody notices.
 */
function candidateWhere(statuses) {
  return `status IN (${statuses.map(() => '?').join(', ')})
            AND (scope = 'global' OR project_key = ?)
            AND (expires_at IS NULL OR expires_at > ?)`;
}

const candidateParams = (statuses, projectKey, now) => [...statuses, projectKey, now];

/** How many memories the query was actually allowed to see. */
export async function countCandidates(conn, { statuses, projectKey, now }) {
  const row = await conn.get(
    `SELECT count(*) AS n FROM memories WHERE ${candidateWhere(statuses)}`,
    ...candidateParams(statuses, projectKey, now),
  );
  return row?.n ?? 0;
}

/**
 * PLAN step 2. Ordered by distance, capped in SQL.
 *
 * Same two guards as the write path's dedup lookup: rows embedded by another
 * model are skipped, because a distance between two vector spaces is a number
 * with no meaning; and `emb IS NOT NULL` skips phase-5 tombstones, which would
 * otherwise sort *first*, NULL being ahead of every real distance in ASC order.
 * A tombstoned row can still surface through the lexical leg, which is the point
 * of keeping its text.
 */
export async function vectorLeg(
  conn,
  vector,
  { statuses, projectKey, now, limit = VECTOR_LIMIT, embModel = EMB_MODEL, embDim = EMB_DIM },
) {
  const rows = await conn.all(
    `SELECT ${COLUMNS}, vector_distance_cos(emb, vector32(?)) AS dist
       FROM memories
      WHERE ${candidateWhere(statuses)}
        AND emb IS NOT NULL AND emb_model = ? AND emb_dim = ?
      ORDER BY dist
      LIMIT ?`,
    vectorBlob(vector),
    ...candidateParams(statuses, projectKey, now),
    embModel,
    embDim,
    limit,
  );
  return rows.map(({ dist, ...row }) => ({ ...row, similarity: 1 - dist }));
}

/**
 * PLAN step 3, with one deviation the measurements forced.
 *
 * PLAN says `fts_match(text, ?) … LIMIT 20`. There is nothing to order that
 * LIMIT by — fts_score() returns 0 in this build — so a SQL limit would hand
 * back an arbitrary twenty rows in rowid order, i.e. the twenty oldest matches.
 * The cap is therefore applied after ranking in JS, which is what "the lexical
 * leg is twenty candidates" was there to mean.
 *
 * The unbounded fetch is affordable, and the comparison is the reason: this
 * pulls the *text* of rows sharing a rare word, while the vector leg beside it
 * already reads the 1.5 KB embedding of every single candidate. Text is the
 * cheap half of a query that PLAN measured at 24.7 ms over 20k rows.
 */
export async function lexicalLeg(
  conn,
  terms,
  { statuses, projectKey, now, limit = LEXICAL_LIMIT, candidateCount },
) {
  if (terms.length === 0) return [];

  const rows = await conn.all(
    `SELECT ${COLUMNS} FROM memories
      WHERE ${candidateWhere(statuses)} AND fts_match(text, ?)`,
    ...candidateParams(statuses, projectKey, now),
    terms.join(' '),
  );

  return rankLexical(rows, terms, candidateCount ?? rows.length).slice(0, limit);
}

/**
 * Steps 1-6 against an open connection, given an already-embedded query.
 * Split out from `search` the way write.mjs splits commit from prepare: the
 * model load and the database work are separable, and this half is the one worth
 * driving directly from tests and from a tuning harness.
 */
export async function searchScoped(
  conn,
  vector,
  terms,
  {
    statuses = ['active'],
    projectKey = null,
    now = Date.now(),
    limit = MAX_RESULTS,
    threshold = VECTOR_THRESHOLD,
    coverage = LEXICAL_GATE_COVERAGE,
    k = RRF_K,
    vectorLimit = VECTOR_LIMIT,
    lexicalLimit = LEXICAL_LIMIT,
    embModel = EMB_MODEL,
    embDim = EMB_DIM,
    gate = true,
  } = {},
) {
  const scope = { statuses, projectKey, now };
  const candidates = await countCandidates(conn, scope);

  // Sequential, not Promise.all: these share one connection, and two statements
  // interleaving on it is not a guarantee this driver makes.
  const vectorRows = await vectorLeg(conn, vector, { ...scope, limit: vectorLimit, embModel, embDim });
  const lexicalRows = await lexicalLeg(conn, terms, {
    ...scope,
    limit: lexicalLimit,
    candidateCount: candidates,
  });

  const byId = new Map();
  for (const row of vectorRows) byId.set(row.id, { ...row, coverage: 0, terms: [] });
  for (const row of lexicalRows) {
    const existing = byId.get(row.id);
    if (existing) {
      existing.coverage = row.coverage;
      existing.terms = row.terms;
    } else {
      // Reachable only through the lexical leg: a tombstoned row, or one the
      // vector leg's top 20 did not reach. It has no comparable similarity.
      byId.set(row.id, { ...row, similarity: null });
    }
  }

  const fused = fuse(
    { vector: vectorRows.map((r) => r.id), lexical: lexicalRows.map((r) => r.id) },
    k,
  );

  const scored = [...byId.values()].map((row) => {
    const { rrf, ranks } = fused.get(row.id);
    const boost = boostFactor(row, now);
    return { ...row, rrf, ranks, strength: strength(row, now), boost, score: rrf * boost };
  });

  // PLAN step 6. The gate runs before the cap, not after: capping first would
  // let five weak items fill the budget and hide a sixth that actually cleared.
  const passed = gate
    ? scored.filter((r) => (r.similarity !== null && r.similarity >= threshold) || r.coverage >= coverage)
    : scored;

  const results = passed
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, limit);

  return {
    results,
    stats: {
      candidates,
      vectorHits: vectorRows.length,
      lexicalHits: lexicalRows.length,
      fused: scored.length,
      gated: scored.length - passed.length,
      threshold,
      coverage,
    },
  };
}

/**
 * Search, with diagnostics. Opens the database unless handed a `conn`.
 *
 * Scope follows the write path: `--global` (scope: 'global') searches only
 * global memories, anything else unions globals with this project's, which is
 * PLAN's "recall unions only those two".
 */
export async function searchDetail(
  query,
  { conn, paths, env = process.env, cwd, scope = 'project', projectKey, ...opts } = {},
) {
  const text = typeof query === 'string' ? query.trim() : '';
  if (text === '') throw new Error('Cannot search for an empty query.');

  const resolved =
    projectKey !== undefined
      ? { projectKey, source: 'explicit' }
      : resolveScope({ scope, cwd, env });

  const terms = queryTerms(text);
  // embedQuery, not embed: this is the only place a *question* is embedded, and
  // with a prefixed model the passage-side prefix here would quietly cost recall
  // rather than fail.
  const vector = await embedQuery(text, { paths, env });

  const run = (c) => searchScoped(c, vector, terms, { ...opts, projectKey: resolved.projectKey });
  const { results, stats } = conn ? await run(conn) : await withDb(run, { paths, env });

  return {
    query: text,
    terms,
    results,
    stats: { ...stats, projectKey: resolved.projectKey, scopeSource: resolved.source },
  };
}

/**
 * The retrieval entry point: a query in, at most five memories out, and an empty
 * array when nothing clears the gate — which on a prompt unrelated to anything
 * stored is the correct and expected answer, not a failure.
 */
export async function search(query, opts) {
  return (await searchDetail(query, opts)).results;
}
