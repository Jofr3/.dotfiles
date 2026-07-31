// Pair detection — the mechanical half of PLAN's "Contradiction handling".
//
// PLAN: "Cosine cannot separate duplicate from contradiction — 'we use Vitest'
// and 'we no longer use Vitest' sit around 0.9. So detection is mechanical,
// resolution is judged." This file is the mechanical half. Nothing here calls an
// LLM, classifies a pair, or changes a memory's status; it answers one question —
// WHICH PAIRS ARE WORTH PAYING A JUDGE FOR — and records the two facts that stop
// the same pair being paid for twice.
//
// Three mechanisms, and PLAN says why each exists:
//
//   the 0.85 threshold   the same number `mem stats` gauges the backlog with and
//                        review.mjs flags a staged capture with. It lives here
//                        now and those import it: one constant, one place.
//   the watermark        "at least one member changed since consolidated_at".
//                        Row-level, so a run over a store nobody has touched
//                        since the last pass finds nothing and costs no LLM call.
//   the verdict cache    Pair-level, in `meta` under `pair:<lo>:<hi>`. PLAN:
//                        `unrelated` is "recorded so the pair is never re-judged"
//                        — it is the one class that changes neither row, so
//                        nothing else in the store would remember it happened.
//
// "The watermark plus the `unrelated` cache keeps a weekly run at 1–3 LLM calls,
// not hundreds." NEITHER SUBSUMES THE OTHER, and the reason is the interesting
// part. The watermark cannot suppress one pair out of a row's many — stamping the
// row hides every pair it is in, judged or not — so a run that only got through
// part of its backlog must not stamp. The cache is what lets that run resume
// exactly where it stopped: the pairs it judged are skipped, the rest come back.
// And the cache cannot replace the watermark either, because it is consulted per
// pair and the watermark is what keeps the pair *scan* from happening at all.
//
// WHAT THIS COSTS, measured on the seeded fixtures rather than reasoned about.
// There is no ANN index in this build — `vector_distance_cos` is a scan — so the
// join is (changed rows × rows in scope) distances, twice, because the counts and
// the top-N cannot come out of one aggregate. At ~2 microseconds a distance:
//
//   200-row fixture, 169 active and eligible, nothing consolidated yet
//     every changed row × every row       54 ms      10 pairs
//   5000-row aged fixture, 3345 eligible
//     60 changed rows × 3345             945 ms     340 candidates
//     200 changed rows × 3345            2.6 s     1096 candidates
//     3345 changed rows × 3345          45.1 s    11010 candidates
//
// The last line is why the changed side is bounded and ordered by watermark: an
// unbounded first pass over a store that has never been consolidated is
// three-quarters of a minute and eleven thousand pairs, which is not a backlog
// anybody drains but a bill nobody pays. Bounded, it drains watermark-first across
// runs, and every bound it applied is in the report.
//
// (stats.mjs measured ~0.6 microseconds a pair for its own self-join over one
// materialised subset. This join is slower per distance — two subqueries, the
// inner one re-read per outer row — and that difference is exactly why the budget
// here is sixty rows and not stats' twelve hundred.)
//
// Timestamps are epoch milliseconds throughout, matching write.mjs.

import { existsSync } from 'node:fs';

import { openDb, withDb } from './db.mjs';
import { EMB_DIM, EMB_MODEL } from './embed.mjs';
import { resolvePaths } from './paths.mjs';
import { recordEvent } from './write.mjs';

/**
 * PLAN: "Tier 1 finds pairs at cosine >= 0.85 within the same scope". Slice 3.3
 * measured the same number from the other end — 0.82 leaked, 0.85 is where the
 * retrieval gate sits — and it is model geometry, so it moves when EMB_MODEL
 * does. stats.mjs and review.mjs import this rather than restating it.
 */
export const PAIR_THRESHOLD = 0.85;

/**
 * How many *changed* rows one detection pass looks at. Not a policy — a bound on
 * the quadratic, and the reason the pass makes progress instead of grinding: rows
 * are taken watermark-first (never-consolidated ones lead), so successive runs
 * work through a backlog rather than re-scanning its head.
 *
 * 200 is 2.6 s against the 3345 eligible rows of the 5k aged fixture and 54 ms
 * against the 200-row one — the ceiling for a command somebody typed. The
 * maintenance tier uses a smaller one (MAINTAIN_CHANGED_LIMIT) because nobody is
 * waiting for that output.
 */
export const CHANGED_LIMIT = 200;

/**
 * How many fresh pairs one pass hands back. PLAN's tier 2 "batches ~20 pairs per
 * LLM call" and wants a weekly run at "1–3 LLM calls", so sixty is the budget
 * that arithmetic implies. More than that waiting is reported as truncation.
 */
export const PAIR_LIMIT = 60;

/** PLAN's resolution table, verbatim. The cache stores one of these per pair. */
export const VERDICTS = ['duplicate', 'contradiction', 'refinement', 'complementary', 'unrelated'];

/**
 * The classes that leave BOTH rows active and unchanged in status. These are the
 * ones the cache exists for: a `duplicate` merges and a `contradiction`
 * supersedes, so the store itself remembers those happened — nothing records a
 * `refinement`, `complementary` or `unrelated` verdict except this cache, and
 * without it every one of them is re-judged on every run forever.
 */
export const KEEP_BOTH_VERDICTS = ['refinement', 'complementary', 'unrelated'];

/**
 * `meta` key prefix for one pair's verdict: `pair:<lo>:<hi>`.
 *
 * meta rather than memory_links, for the reason prune.mjs keeps dead-scope flags
 * there: this has to be answerable in one keyed lookup, and a link row carries no
 * date, so a verdict stored as a link could never be told apart from a verdict
 * given before the memory was rewritten. The link rows PLAN's table asks for
 * (`refines`, `related`) are still written — by the resolution half, in slice
 * 5b.2. The link is the relation; this is the receipt.
 */
export const PAIR_PREFIX = 'pair:';

/**
 * The resolution half's namespace, `proposal:<lo>:<hi>` — a pair the guard sent to
 * a human instead of resolving (resolve.mjs, slice 5b.2).
 *
 * It is declared HERE, next to the verdict's prefix, for one reason: `mem forget
 * --hard` has to clear both when it purges a memory, and it clears them through
 * `dropMetaFor` below. Putting the constant in resolve.mjs would mean manage.mjs
 * importing resolve.mjs, which imports manage.mjs — a cycle, to state a string.
 * Both pair-keyed namespaces live in one place; only this file's is written here.
 */
export const PROPOSAL_PREFIX = 'proposal:';

/** One pass advanced the watermark on these rows. Invertible from its own detail. */
export const EVENT_CONSOLIDATED = 'consolidated';

/** One pair got a verdict. Written where `mem show <lo>` will display it. */
export const EVENT_PAIR_JUDGED = 'pair-judged';

export class PairsError extends Error {
  constructor(message, code = 'MEM_INVALID') {
    super(message);
    this.name = 'PairsError';
    this.code = code;
  }
}

// ------------------------------------------------------------------- the key --

const asId = (value, field) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new PairsError(`${field} must be a memory id, got ${JSON.stringify(value)}.`);
  }
  return n;
};

/** The two ids in canonical order. A pair is unordered; its key must not be. */
export function orderPair(a, b) {
  const lo = asId(a, 'a');
  const hi = asId(b, 'b');
  if (lo === hi) throw new PairsError(`A memory cannot pair with itself (#${lo}).`);
  return lo < hi ? { a: lo, b: hi } : { a: hi, b: lo };
}

export function pairKey(a, b) {
  const ordered = orderPair(a, b);
  return `${PAIR_PREFIX}${ordered.a}:${ordered.b}`;
}

// ------------------------------------------------------------------ the SQL --

/**
 * "Changed since the watermark", as SQL. `updated_at` is what write.mjs moves
 * when a memory's text is restated or merged into, so it is the column that
 * answers "is this the same fact the judge saw" — and `consolidated_at IS NULL`
 * is the never-looked-at case, which has to read as changed or a fresh store
 * would have no backlog at all.
 *
 * It cannot evaluate to NULL: the first disjunct is 0/1, so the comparison in the
 * second (which is NULL exactly when consolidated_at is) never decides the answer.
 * That matters because the join negates it.
 */
export const changedSql = (t) =>
  `(${t}.consolidated_at IS NULL OR coalesce(${t}.updated_at, ${t}.created_at, 0) > ${t}.consolidated_at)`;

const stampSql = (t) => `coalesce(${t}.updated_at, ${t}.created_at, 0)`;

// The canonical key, computed in SQL so the exclusion is one indexed lookup per
// pair. Written as an explicit CASE rather than min()/max(): those are aggregates
// with one argument and scalars with two, and a pair filter is not the place to
// bet on which one the parser picked.
const LO_SQL = '(CASE WHEN a.id < b.id THEN a.id ELSE b.id END)';
const HI_SQL = '(CASE WHEN a.id < b.id THEN b.id ELSE a.id END)';

/**
 * Whether this pair already has a verdict that still stands.
 *
 * "Still stands" is the whole subtlety. A cached verdict is a judgement about two
 * *texts*, so it survives for as long as neither of them has moved since it was
 * given — one comparison against the cache's own `at`, symmetric in a and b,
 * which is why the key's orientation does not leak into it. Every uncertain case
 * resolves towards re-judging: a value that is not JSON, a missing `at`, a clock
 * that ran backwards and left a row stamped in the future — all of them make the
 * comparison NULL or false, the pair comes back, and the worst outcome is one
 * extra call to a judge.
 *
 * The `CASE WHEN json_valid` is not padding. Slice 5a.4 measured it: json_extract
 * over a value that is not JSON *throws* in this build ("Parse error: malformed
 * JSON") and takes the whole statement down. One hand-edited meta row would
 * otherwise make pair detection impossible rather than slightly wrong. A bare
 * `AND json_valid(...)` conjunct is not enough — the planner may reorder it.
 */
const CACHED_SQL = `EXISTS (
        SELECT 1 FROM meta c
         WHERE c.k = '${PAIR_PREFIX}' || ${LO_SQL} || ':' || ${HI_SQL}
           AND ${stampSql('a')} <= (CASE WHEN json_valid(c.v) THEN json_extract(c.v, '$.at') END)
           AND ${stampSql('b')} <= (CASE WHEN json_valid(c.v) THEN json_extract(c.v, '$.at') END))`;

// Enough to judge a pair and to apply PLAN's guard to it (older pinned, or
// confidence 0.3 higher) without dragging a 1.5 KB vector per row through JS.
const SIDE_COLUMNS = `id, uid, kind, text, why, scope, project_key, pinned,
                      salience, confidence, created_at, updated_at, consolidated_at, emb`;

/**
 * One side of the join. Both sides carry the same guards, and every one of them
 * is load-bearing:
 *
 *   `status='active'` — staged rows are the review queue's business and archived
 *   or superseded ones have already been resolved. Judging either would propose
 *   changes to rows retrieval cannot reach.
 *   `emb IS NOT NULL` plus model and dim — slice 5a.3 measured that
 *   `vector_distance_cos(NULL, v)` throws rather than returning NULL, so a single
 *   tombstone in scope would take the whole query down; and distances only mean
 *   anything inside one vector space, which a store mid-`mem reembed` does not
 *   have.
 *   expiry — a row whose TTL has passed is about to be archived by tier 1 and is
 *   already hidden from retrieval. Paying a judge for it would be paying for a
 *   fact nobody can be told.
 *
 * NOT `pinned = 0`. Everywhere else in this plugin pinned means exempt, but PLAN's
 * guard is explicitly about "a memory captured yesterday from a throwaway
 * experiment must not silently supersede a pinned constraint" — the pinned row has
 * to be *found* for that guard to have anything to fire on.
 */
function sideSql({ scoped, changed, limit = null }) {
  const clauses = [
    "status = 'active'",
    'emb IS NOT NULL AND emb_model = ? AND emb_dim = ?',
    '(expires_at IS NULL OR expires_at > ?)',
  ];
  if (scoped) clauses.push("(scope = 'global' OR project_key = ?)");
  if (changed) clauses.push(changedSql('memories'));

  // Watermark first, and NULLs sort first in SQLite's ASC — so the rows nobody
  // has ever looked at lead, and a bounded pass drains a backlog in a stable
  // order instead of re-reading its head every run.
  const order = limit === null ? '' : `\n            ORDER BY consolidated_at, id LIMIT ${Number(limit)}`;
  return `(SELECT ${SIDE_COLUMNS}\n             FROM memories\n            WHERE ${clauses.join('\n              AND ')}${order})`;
}

const sideParams = ({ scoped, projectKey, now, embModel, embDim }) => [
  embModel,
  embDim,
  now,
  ...(scoped ? [projectKey] : []),
];

// ------------------------------------------------------------- the detector --

const round = (n, places = 4) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

const countRows = async (conn, sql, params) => (await conn.get(sql, ...params))?.n ?? 0;

/**
 * Candidate pairs for tier 2 — PLAN's sentence, as a query.
 *
 * Read-only. Sorted by similarity, capped, and every bound it applied is in the
 * report: a truncated result that reads like a complete one is how a consolidation
 * pass silently stops keeping up, which is the exact failure `mem stats` trends.
 *
 * `projectKey` restricts the scan to one project plus the globals (what a human
 * typing `mem pairs --project` wants); passing null looks at every scope, which
 * is what a store-wide consolidation run wants. Either way the join pairs only
 * within one (scope, project_key) — write.mjs's dedup and review.mjs's flagging
 * draw the same line, because a global memory and a project one saying the same
 * thing are not a duplicate to merge, they are a scope decision somebody took.
 *
 * `a` and `b` in each pair are in canonical id order, matching the cache key.
 * Which of them is *older* is a question for the resolution half — both rows'
 * `created_at`, `pinned` and `confidence` come back so it can answer it without
 * another query.
 */
export async function detectPairs(
  conn,
  {
    now = Date.now(),
    threshold = PAIR_THRESHOLD,
    projectKey = null,
    limit = PAIR_LIMIT,
    changedLimit = CHANGED_LIMIT,
    embModel = EMB_MODEL,
    embDim = EMB_DIM,
  } = {},
) {
  const t0 = performance.now();
  if (!(threshold >= 0 && threshold <= 1)) {
    throw new PairsError(`threshold must be between 0 and 1, got ${threshold}.`);
  }

  const scoped = projectKey !== null && projectKey !== undefined;
  const shared = { scoped, projectKey, now, embModel, embDim };

  const CHANGED = sideSql({ scoped, changed: true, limit: changedLimit });
  const ELIGIBLE = sideSql({ scoped, changed: false });
  const changedParams = sideParams(shared);
  const eligibleParams = sideParams(shared);

  const eligible = await countRows(
    conn,
    `SELECT count(*) AS n FROM ${ELIGIBLE}`,
    eligibleParams,
  );
  const changedTotal = await countRows(
    conn,
    `SELECT count(*) AS n FROM ${sideSql({ scoped, changed: true })}`,
    changedParams,
  );

  const empty = {
    now,
    threshold,
    project_key: scoped ? projectKey : null,
    limit,
    changed_limit: changedLimit,
    eligible,
    changed: { total: changedTotal, examined: 0, truncated: changedTotal > changedLimit },
    examined_ids: [],
    candidates: 0,
    cached_skipped: 0,
    fresh: 0,
    pairs: [],
    truncated: false,
    ms: round(performance.now() - t0, 1),
  };
  if (eligible < 2 || changedTotal === 0) return empty;

  // The examined set is read separately from the join so it is exact: a changed
  // row with no near neighbour is still a row this pass has *looked at*, and it is
  // the caller's decision (see markConsolidated) whether that is worth stamping.
  const examined = (
    await conn.all(
      `SELECT id FROM ${CHANGED} ORDER BY id`,
      ...changedParams,
    )
  ).map((r) => r.id);

  // b.id <> a.id, and one orientation per unordered pair: when both sides changed,
  // only the (lo, hi) direction survives; when only `a` did, `a` is the only side
  // that can host it, so the pair is kept whichever way round the ids run.
  const JOIN = `FROM ${CHANGED} a
         JOIN ${ELIGIBLE} b
           ON b.id <> a.id AND b.scope = a.scope AND b.project_key IS a.project_key
              AND (b.id > a.id OR NOT ${changedSql('b')})
        WHERE vector_distance_cos(a.emb, b.emb) <= ?`;
  const joinParams = [...changedParams, ...eligibleParams, 1 - threshold];

  // Two passes over the join rather than one, for stats.mjs's reason: the counts
  // are over every candidate and the list is the top few, and one aggregate cannot
  // be both. This is the expensive line in the file — it genuinely doubles the
  // vector math, 401 ms to 945 ms at the maintenance tier's budget — and it is
  // still the right trade: the count IS the backlog, and a pass that reported only
  // the sixty pairs it could show would say "sixty" whether sixty or eleven
  // thousand were waiting. The list query is skipped entirely when the count says
  // there is nothing fresh.
  const totals = await conn.get(
    `SELECT count(*) AS candidates, sum(CASE WHEN ${CACHED_SQL} THEN 1 ELSE 0 END) AS cached ${JOIN}`,
    ...joinParams,
  );
  const candidates = totals?.candidates ?? 0;
  const cachedSkipped = totals?.cached ?? 0;
  const fresh = Math.max(0, candidates - cachedSkipped);

  const rows = fresh === 0
    ? []
    : await conn.all(
        `SELECT a.id AS a_id, b.id AS b_id,
                a.uid AS a_uid, b.uid AS b_uid,
                a.text AS a_text, b.text AS b_text,
                a.why AS a_why, b.why AS b_why,
                a.kind AS a_kind, b.kind AS b_kind,
                a.pinned AS a_pinned, b.pinned AS b_pinned,
                a.salience AS a_salience, b.salience AS b_salience,
                a.confidence AS a_confidence, b.confidence AS b_confidence,
                a.created_at AS a_created_at, b.created_at AS b_created_at,
                a.updated_at AS a_updated_at, b.updated_at AS b_updated_at,
                a.consolidated_at AS a_consolidated_at, b.consolidated_at AS b_consolidated_at,
                a.scope AS scope, a.project_key AS project_key,
                1.0 - vector_distance_cos(a.emb, b.emb) AS similarity
           ${JOIN} AND NOT ${CACHED_SQL}
          ORDER BY similarity DESC, a_id, b_id
          LIMIT ?`,
        ...joinParams,
        Math.max(1, limit),
      );

  return {
    ...empty,
    changed: { total: changedTotal, examined: examined.length, truncated: changedTotal > examined.length },
    examined_ids: examined,
    candidates,
    cached_skipped: cachedSkipped,
    fresh,
    pairs: rows.map(normalisePair),
    truncated: fresh > rows.length,
    ms: round(performance.now() - t0, 1),
  };
}

/** Flip a join row into canonical id order. The SQL does not, the key does. */
function normalisePair(row) {
  const side = (which) => ({
    id: row[`${which}_id`],
    uid: row[`${which}_uid`],
    kind: row[`${which}_kind`],
    text: row[`${which}_text`],
    why: row[`${which}_why`],
    pinned: row[`${which}_pinned`],
    salience: row[`${which}_salience`],
    confidence: row[`${which}_confidence`],
    created_at: row[`${which}_created_at`],
    updated_at: row[`${which}_updated_at`],
    consolidated_at: row[`${which}_consolidated_at`],
  });
  const first = side('a');
  const second = side('b');
  const [lo, hi] = first.id < second.id ? [first, second] : [second, first];

  return {
    key: pairKey(lo.id, hi.id),
    a: lo.id,
    b: hi.id,
    similarity: round(row.similarity),
    scope: row.scope,
    project_key: row.project_key ?? null,
    rows: [lo, hi],
    a_text: lo.text,
    b_text: hi.text,
  };
}

// ---------------------------------------------------------- the watermark --

const chunk = (items, size = 400) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Advance `consolidated_at` on the rows a pass examined — the watermark half of
 * PLAN's "at least one member changed since consolidated_at".
 *
 * CALL IT ONLY FOR ROWS WHOSE PAIRS WERE ALL ACTUALLY JUDGED. Stamping a row
 * hides *every* pair it is in, so stamping after a truncated pass would bury the
 * pairs that pass never got to — silently, and until the row happens to change
 * again. `detectPairs` reports `truncated` and hands back `examined_ids` for
 * exactly this decision; the verdict cache is what makes resuming an unstamped
 * backlog cheap.
 *
 * IT MUST NOT TOUCH `updated_at`, and that is not tidiness. `updated_at` is one
 * of the two columns the changed predicate reads, so bumping it here would mark
 * every row this stamps as changed in the same statement — the watermark would
 * never hold and every run would re-scan the whole store. (decay.mjs reads that
 * column too, so bumping it would also make consolidation look like a restatement
 * and reset the row's decay.)
 *
 * One event for the lot rather than one per row: a bulk stamp is a fact about a
 * run, the previous values are what an inversion needs, and four hundred audit
 * rows saying "the watermark moved" would drown the log that explains archives.
 */
export async function markConsolidated(conn, ids, { now = Date.now(), runId = null } = {}) {
  const unique = [...new Set((ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (unique.length === 0) {
    return { stamped: 0, at: now, ids: [], previous: {}, missing: [], eventId: null };
  }

  const previous = {};
  for (const part of chunk(unique)) {
    const rows = await conn.all(
      `SELECT id, consolidated_at FROM memories WHERE id IN (${part.map(() => '?').join(', ')})`,
      ...part,
    );
    for (const row of rows) previous[row.id] = row.consolidated_at ?? null;
  }

  const present = unique.filter((id) => Object.hasOwn(previous, id));
  const missing = unique.filter((id) => !Object.hasOwn(previous, id));

  for (const part of chunk(present)) {
    await conn.run(
      `UPDATE memories SET consolidated_at = ? WHERE id IN (${part.map(() => '?').join(', ')})`,
      now,
      ...part,
    );
  }

  const eventId = present.length === 0
    ? null
    : await recordEvent(conn, {
        memoryId: null,
        event: EVENT_CONSOLIDATED,
        at: now,
        detail: { run_id: runId, at: now, ids: present, previous, missing },
      });

  return { stamped: present.length, at: now, ids: present, previous, missing, eventId };
}

// ------------------------------------------------------- the verdict cache --

const parseEntry = (key, value) => {
  let detail = null;
  try {
    detail = JSON.parse(value);
  } catch {
    detail = null;
  }
  const ids = key.slice(PAIR_PREFIX.length).split(':').map(Number);
  const at = Number(detail?.at);
  return {
    key,
    a: Number.isInteger(ids[0]) ? ids[0] : null,
    b: Number.isInteger(ids[1]) ? ids[1] : null,
    verdict: detail?.verdict ?? null,
    at: Number.isFinite(at) ? at : null,
    similarity: detail?.similarity ?? null,
    why: detail?.why ?? null,
    run_id: detail?.run_id ?? null,
    // An entry we cannot read is reported, not repaired: the SQL treats it as
    // absent, so the pair is simply judged again.
    readable: detail !== null && Number.isFinite(at),
  };
};

/** One pair's verdict, or null. Says nothing about whether it still stands. */
export async function readVerdict(conn, a, b) {
  const key = pairKey(a, b);
  const row = await conn.get('SELECT k, v FROM meta WHERE k = ?', key);
  return row ? parseEntry(row.k, row.v) : null;
}

/** Every cached verdict, newest first. What `mem pairs --cached` prints. */
export async function readPairCache(conn, { limit = 100 } = {}) {
  const rows = await conn.all(
    'SELECT k, v FROM meta WHERE substr(k, 1, ?) = ? ORDER BY k',
    PAIR_PREFIX.length,
    PAIR_PREFIX,
  );
  return rows
    .map((row) => parseEntry(row.k, row.v))
    .sort((x, y) => (y.at ?? 0) - (x.at ?? 0) || (x.key < y.key ? -1 : 1))
    .slice(0, Math.max(1, limit));
}

const UPSERT_META =
  'INSERT INTO meta(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v';

/**
 * Record a verdict for one pair so detection stops offering it.
 *
 * `at` is the receipt's date and the only thing the exclusion compares against, so
 * it is written from the run's clock rather than from either row: a verdict given
 * now covers both texts as they are now, and the moment either of them is
 * restated the pair comes back for a fresh look.
 *
 * Both rows must exist. A verdict about an id that does not is not a cache entry,
 * it is a way for a typo to suppress a real contradiction forever.
 */
export async function cacheVerdict(
  conn,
  { a, b, verdict = 'unrelated', similarity = null, why = null, runId = null, now = Date.now() } = {},
) {
  const ordered = orderPair(a, b);
  if (!VERDICTS.includes(verdict)) {
    throw new PairsError(`verdict must be one of ${VERDICTS.join(', ')} — got '${verdict}'.`);
  }

  const rows = await conn.all(
    'SELECT id, uid, text, status FROM memories WHERE id IN (?, ?)',
    ordered.a,
    ordered.b,
  );
  const found = new Map(rows.map((r) => [r.id, r]));
  const missing = [ordered.a, ordered.b].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new PairsError(
      `no memory #${missing.join(' or #')} — nothing to record a verdict about.`,
      'MEM_NOT_FOUND',
    );
  }

  const key = pairKey(ordered.a, ordered.b);
  const previous = await readVerdict(conn, ordered.a, ordered.b);
  const record = {
    a: ordered.a,
    b: ordered.b,
    verdict,
    at: now,
    similarity: similarity === null ? null : round(similarity),
    why,
    run_id: runId,
  };
  await conn.run(UPSERT_META, key, JSON.stringify(record));

  // On the lower id rather than nowhere: a verdict is a fact about two rows, and
  // `mem show <id>` is where somebody asks why this memory stopped being offered
  // for consolidation. The detail names both.
  const eventId = await recordEvent(conn, {
    memoryId: ordered.a,
    event: EVENT_PAIR_JUDGED,
    at: now,
    detail: {
      ...record,
      run_id: runId,
      pair: key,
      previous: previous === null ? null : { verdict: previous.verdict, at: previous.at },
    },
  });

  return {
    key,
    ...record,
    replaced: previous,
    rows: [found.get(ordered.a), found.get(ordered.b)],
    eventId,
  };
}

/**
 * Drop one pair's verdict, so the pair is offered again. The inverse of
 * `cacheVerdict` — slice 5b.3's undo needs it, and so does anyone who judged a
 * pair wrong. No event: the meta row is the state, and its removal is recorded by
 * whatever asked for it.
 */
export async function dropVerdict(conn, a, b) {
  const key = pairKey(a, b);
  const existing = await readVerdict(conn, a, b);
  if (existing === null) return { key, dropped: false, previous: null };
  await conn.run('DELETE FROM meta WHERE k = ?', key);
  return { key, dropped: true, previous: existing };
}

/**
 * Every verdict mentioning one memory. What `mem forget --hard` calls: rung 4 is
 * a real deletion, SQLite reuses the highest rowid, and a stale entry left behind
 * would eventually suppress a genuine pair between two rows that never met.
 *
 * The two LIKE patterns are exact despite the wildcards: ids are digits, so
 * `pair:5:%` cannot match `pair:50:7` (the character after `5` must be a colon)
 * and `pair:%:5` cannot match `pair:1:52`.
 */
export async function dropVerdictsFor(conn, id) {
  return dropMetaFor(conn, id, PAIR_PREFIX);
}

/**
 * The same deletion for any `<prefix><lo>:<hi>` namespace — the verdict cache and,
 * since 5b.2, the proposals resolve.mjs parks for review. One function because the
 * id-reuse argument above is about the *key shape*, not about verdicts, and two
 * copies of it would eventually disagree about the wildcards.
 */
export async function dropMetaFor(conn, id, prefix = PAIR_PREFIX) {
  const n = asId(id, 'id');
  const rows = await conn.all(
    'SELECT k FROM meta WHERE substr(k, 1, ?) = ? AND (k LIKE ? OR k LIKE ?)',
    prefix.length,
    prefix,
    `${prefix}${n}:%`,
    `${prefix}%:${n}`,
  );
  for (const row of rows) await conn.run('DELETE FROM meta WHERE k = ?', row.k);
  return rows.map((r) => r.k);
}

// ------------------------------------------------------------- entry points --

/**
 * `mem pairs`. Read-only by construction — it opens with `fileMustExist` and
 * never migrates, because a command whose whole job is to say what a judge would
 * be asked cannot be allowed to change the store while answering.
 */
export async function pairs({ conn, paths = resolvePaths(), env = process.env, ...opts } = {}) {
  if (conn) return detectPairs(conn, opts);
  if (!existsSync(paths.dbPath)) {
    return { ...emptyReport(opts), store: paths.dbPath, exists: false };
  }

  const handle = await openDb({ paths, env, readonly: true, runMigrations: false });
  try {
    return { ...(await detectPairs(handle, opts)), store: paths.dbPath, exists: true };
  } finally {
    await handle.close().catch(() => {});
  }
}

/** The shape `pairs()` returns for a store that does not exist yet. */
function emptyReport({
  now = Date.now(),
  threshold = PAIR_THRESHOLD,
  limit = PAIR_LIMIT,
  changedLimit = CHANGED_LIMIT,
  projectKey = null,
} = {}) {
  return {
    now,
    threshold,
    project_key: projectKey,
    limit,
    changed_limit: changedLimit,
    eligible: 0,
    changed: { total: 0, examined: 0, truncated: false },
    examined_ids: [],
    candidates: 0,
    cached_skipped: 0,
    fresh: 0,
    pairs: [],
    truncated: false,
    ms: 0,
  };
}

/** `mem pairs <verdict> <a> <b>` — the writable half, one pair at a time. */
export async function judgePair({ conn, paths, env = process.env, ...opts } = {}) {
  const run = (c) => cacheVerdict(c, opts);
  return conn ? run(conn) : withDb(run, { paths, env });
}
