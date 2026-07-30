// `mem stats` — PLAN's "Knowing whether it's working".
//
// PLAN lists seven numbers and one sentence about why they exist: "turns 'is my
// memory rotting?' into numbers". Each of the six rot modes in the table above it
// has a detector, and this file is where the detectors are read out.
//
//   status counts                      what is in there, by state
//   ACTIVE-ROW SCAN TIME               the number that matters — see below
//   duplicate pairs >= 0.85            near-duplicate drift / contradictions
//   injected:useful ratio, p50, worst  over-general slop, the only detector for it
//   never injected, by age bucket      never-matched cruft
//   mean-cosine-to-sample              over-general slop again, from the other side
//   consolidation runs                 proposed / accepted / undone
//
// WHY SCAN TIME IS THE HEADLINE. PLAN measured 20k rows at 24.7 ms and the same
// table filtered to 2k active rows at 3.0 ms, and drew the conclusion the whole
// pruning ladder rests on: "retrieval cost is proportional to the number of
// *active* memories, not stored ones". So this reports both — the scoped active
// scan every prompt actually pays for, and the same scan with the status filter
// off, which is what it would cost if nothing were ever archived. The ratio
// between them is the ladder's return on investment, and it is the one number
// that says whether maintenance is worth running.
//
// NOTHING HERE EMBEDS AND NOTHING HERE WRITES. The probe vector is an existing
// row's stored blob, so the scan is timed on a machine with no model cached; and
// the connection is opened read-only, because a command whose whole job is to
// report what is there must not be able to change it.
//
// The two pairwise scans are O(n^2) and O(n x sample), so both are bounded and
// both report what they left out. A capped metric that reads like a complete one
// is worse than no metric.

import { statSync } from 'node:fs';

import { openDb, readSchemaVersion, pendingMigrations } from './db.mjs';
import { ageDaysSql } from './decay.mjs';
import { EMB_DIM, EMB_MODEL } from './embed.mjs';
import { PAIR_THRESHOLD } from './pairs.mjs';
import { resolvePaths } from './paths.mjs';
import {
  ARCHIVE_MIN_AGE_DAYS,
  ARCHIVE_STRENGTH,
  DEAD_SCOPE_GRACE_DAYS,
  TOMBSTONE_AFTER_DAYS,
  plan as prunePlan,
} from './prune.mjs';
import { resolveProjectKey } from './scope.mjs';
import { STATUSES } from './write.mjs';

/**
 * The pair threshold now lives in pairs.mjs, which is the mechanism this gauge is
 * a gauge *of*; re-exported because callers (and stats.test.mjs) have imported it
 * from here since slice 5a.3, and because two copies of a number that has to move
 * with EMB_MODEL is exactly the drift decay.mjs's twin formulas are tested against.
 */
export { PAIR_THRESHOLD };

/**
 * Row budget for the duplicate-pair self-join. It compares every active row with
 * every other one in its scope, so the work is quadratic: measured on this build
 * at ~0.6 microseconds a pair, which is 10 ms at 174 rows and eight seconds at
 * five thousand. 1200 rows is ~0.4 s, and past it the count is reported as a
 * sample rather than a total. Slice 5b.1's `detectPairs` is the incremental
 * version, bounded by the `consolidated_at` watermark; this is the gauge, not the
 * mechanism, and it deliberately counts pairs that detector will never offer —
 * see the note on `duplicatePairs`.
 */
export const PAIR_ROW_LIMIT = 1200;

/**
 * The slop detector's sample size and row budget. PLAN: "high mean cosine to a
 * random sample" — a memory like "the user likes clean code" sits close to
 * everything, which is precisely how it clears a low threshold on every prompt
 * and helps on none. 32 rows is enough for a mean to be meaningful and cheap
 * enough to run over the whole store (~5 microseconds a comparison here).
 */
export const SLOP_SAMPLE = 32;
export const SLOP_ROW_LIMIT = 2000;

/** How many offenders each detector names. PLAN asks for "worst 10". */
export const WORST_N = 10;

/** Repeats of the scan timing. The median of three, so one hiccup cannot set it. */
export const SCAN_REPEATS = 3;

/**
 * Age buckets for never-injected memories, in days. PLAN wants the distribution
 * rather than a count because the two ends mean opposite things: a fortnight of
 * never-matched captures is normal, two years of them is the gate being wrong.
 * The 60-day edge is deliberately the archiving rule's own minimum age, so the
 * bucket past it is "what the ladder can already reach".
 */
export const AGE_BUCKETS = [7, 30, 60, 180];

const round = (n, places = 1) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** Median of an already-sorted-or-not numeric array; null when empty. */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Nearest-rank percentile, 0-1. Same convention as tune.mjs's latency block. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

// ------------------------------------------------------------------ counts --

/**
 * Rows by status, plus the three cross-cutting states that are not statuses:
 * pinned (exempt from the ladder), tombstoned (rung 3 already reached it), and
 * expired-but-still-active (retrieval hides it, the TTL rung has not run yet).
 */
export async function statusCounts(conn, { now = Date.now() } = {}) {
  const rows = await conn.all(
    `SELECT status, count(*) AS n,
            sum(pinned) AS pinned,
            sum(CASE WHEN emb IS NULL THEN 1 ELSE 0 END) AS tombstoned,
            sum(CASE WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 1 ELSE 0 END) AS expired
       FROM memories GROUP BY status`,
    now,
  );

  const out = { total: 0, pinned: 0, tombstoned: 0, expired_active: 0 };
  for (const status of STATUSES) out[status] = 0;
  for (const row of rows) {
    out[row.status] = row.n;
    out.total += row.n;
    out.pinned += row.pinned ?? 0;
    out.tombstoned += row.tombstoned ?? 0;
    if (row.status === 'active') out.expired_active = row.expired ?? 0;
  }
  return out;
}

/** Rows whose vector was made by a model other than the one pinned now. */
export async function stampCounts(conn) {
  return conn.all(
    `SELECT emb_model, emb_dim, count(*) AS n,
            sum(CASE WHEN emb IS NULL THEN 1 ELSE 0 END) AS tombstoned
       FROM memories GROUP BY emb_model, emb_dim ORDER BY n DESC`,
  );
}

// --------------------------------------------------------------- scan time --

const SCAN_GUARDS = 'emb IS NOT NULL AND emb_model = ? AND emb_dim = ?';

/**
 * Time the real retrieval query shape, twice: once as a prompt pays for it
 * (`status='active'`, scoped to one project plus the globals, expiry honoured)
 * and once with the status and scope filters off.
 *
 * PLAN's benchmark is the whole argument for the pruning ladder — 24.7 ms over
 * 20k rows against 3.0 ms over the 2k of them that were active — so the pair is
 * reported together rather than the active figure alone. On its own the active
 * number says "retrieval is fast"; beside the other one it says whether that is
 * because of the archiving or in spite of it.
 *
 * The probe vector is a stored row's blob, in the currently pinned space. That is
 * what makes this measurable with no model cached, and it also makes it the
 * *fastest* realistic probe — the distances are real, and one of them is zero.
 */
export async function scanTiming(
  conn,
  { now = Date.now(), projectKey = null, limit = 20, repeats = SCAN_REPEATS, embModel = EMB_MODEL, embDim = EMB_DIM } = {},
) {
  const probe = await conn.get(
    `SELECT id FROM memories WHERE status = 'active' AND ${SCAN_GUARDS} ORDER BY id LIMIT 1`,
    embModel,
    embDim,
  );
  if (!probe) {
    return {
      probe_id: null,
      active_rows: 0,
      all_rows: 0,
      active_ms: null,
      all_ms: null,
      speedup: null,
      note: `no active row embedded with ${embModel} ${embDim}d — nothing to time`,
    };
  }

  const counted = await conn.get(
    `SELECT sum(CASE WHEN status = 'active' AND (scope = 'global' OR project_key = ?)
                       AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS active,
            count(*) AS all_rows
       FROM memories WHERE ${SCAN_GUARDS}`,
    projectKey,
    now,
    embModel,
    embDim,
  );

  const time = async (fn) => {
    const samples = [];
    for (let i = 0; i < Math.max(1, repeats); i += 1) {
      const t0 = performance.now();
      await fn();
      samples.push(performance.now() - t0);
    }
    return { median: median(samples), min: Math.min(...samples) };
  };

  const active = await time(() =>
    conn.all(
      `SELECT id, vector_distance_cos(emb, (SELECT emb FROM memories WHERE id = ?)) AS dist
         FROM memories
        WHERE status = 'active' AND (scope = 'global' OR project_key = ?)
          AND (expires_at IS NULL OR expires_at > ?)
          AND ${SCAN_GUARDS}
        ORDER BY dist LIMIT ?`,
      probe.id, projectKey, now, embModel, embDim, limit,
    ));

  const all = await time(() =>
    conn.all(
      `SELECT id, vector_distance_cos(emb, (SELECT emb FROM memories WHERE id = ?)) AS dist
         FROM memories
        WHERE ${SCAN_GUARDS}
        ORDER BY dist LIMIT ?`,
      probe.id, embModel, embDim, limit,
    ));

  return {
    probe_id: probe.id,
    active_rows: counted?.active ?? 0,
    all_rows: counted?.all_rows ?? 0,
    active_ms: round(active.median, 2),
    active_min_ms: round(active.min, 2),
    all_ms: round(all.median, 2),
    all_min_ms: round(all.min, 2),
    speedup: all.median && active.median ? round(all.median / active.median, 2) : null,
    repeats: Math.max(1, repeats),
    project_key: projectKey,
    note: null,
  };
}

// --------------------------------------------------------- duplicate pairs --

/**
 * Outstanding pairs at cosine >= threshold within one scope — PLAN's
 * near-duplicate and contradiction detectors, which are the same query because
 * "cosine cannot separate duplicate from contradiction". That is why this is a
 * count and a list and not an action: resolving them needs the phase-5b judge.
 *
 * `consolidated_at` is deliberately NOT filtered on, and since slice 5b.1 wrote
 * the watermark that is a real difference rather than a gap: `detectPairs` answers
 * "what would a judge be asked next", this answers "how much near-duplication is
 * in the store at all". A store whose every pair has been judged `complementary`
 * reports a large number here and nothing there, and both are true: this is the
 * one PLAN wants trended ("if outstanding duplicate pairs trend up, consolidation
 * isn't keeping pace"), because a number that fell every time a judge said
 * "unrelated" would trend towards zero while the store went on rotting.
 *
 * Same scope *and* same project_key, matching write.mjs's dedup and review.mjs's
 * flagging: a global memory and a project one saying the same thing are not a
 * duplicate to merge, they are a scope decision somebody took.
 */
export async function duplicatePairs(
  conn,
  { threshold = PAIR_THRESHOLD, rowLimit = PAIR_ROW_LIMIT, worst = WORST_N, embModel = EMB_MODEL, embDim = EMB_DIM } = {},
) {
  const eligible = await conn.get(
    `SELECT count(*) AS n FROM memories WHERE status = 'active' AND ${SCAN_GUARDS}`,
    embModel,
    embDim,
  );
  const total = eligible?.n ?? 0;
  const sampled = Math.min(total, rowLimit);

  if (sampled < 2) {
    return { threshold, pairs: 0, active: total, sampled, exact: true, worst: [], note: null };
  }

  // The sample is the lowest `rowLimit` ids rather than a random draw: stats has
  // to be reproducible run to run, or a moving number cannot be trended, and PLAN
  // asks for exactly that ("if outstanding duplicate pairs trend up"). Older rows
  // are also the ones a duplicate has had time to accumulate against.
  const SUBSET = `(SELECT id, emb, scope, project_key, text, emb_model, emb_dim
                     FROM memories WHERE status = 'active' AND ${SCAN_GUARDS}
                    ORDER BY id LIMIT ${Number(sampled)})`;

  const rows = await conn.all(
    `SELECT a.id AS a_id, b.id AS b_id, a.text AS a_text, b.text AS b_text,
            a.scope AS scope, a.project_key AS project_key,
            1.0 - vector_distance_cos(a.emb, b.emb) AS similarity
       FROM ${SUBSET} a JOIN ${SUBSET} b
         ON b.id > a.id AND b.scope = a.scope AND b.project_key IS a.project_key
      WHERE vector_distance_cos(a.emb, b.emb) <= ?
      ORDER BY similarity DESC
      LIMIT ?`,
    embModel, embDim, embModel, embDim, 1 - threshold, Math.max(worst, 1),
  );

  const counted = await conn.get(
    `SELECT count(*) AS n
       FROM ${SUBSET} a JOIN ${SUBSET} b
         ON b.id > a.id AND b.scope = a.scope AND b.project_key IS a.project_key
      WHERE vector_distance_cos(a.emb, b.emb) <= ?`,
    embModel, embDim, embModel, embDim, 1 - threshold,
  );

  return {
    threshold,
    pairs: counted?.n ?? 0,
    active: total,
    sampled,
    exact: sampled === total,
    worst: rows.map((r) => ({
      a: r.a_id,
      b: r.b_id,
      similarity: round(r.similarity, 4),
      scope: r.scope === 'global' ? 'global' : r.project_key,
      a_text: r.a_text,
      b_text: r.b_text,
    })),
    note: sampled === total ? null : `quadratic — counted over the oldest ${sampled} of ${total} active rows`,
  };
}

// -------------------------------------------------- injected:useful, cruft --

/**
 * PLAN: "`injected_count` high with `useful_count` ~ 0 is precisely the
 * over-general-slop signature, and nothing else catches it."
 *
 * The p50 is over rows that were injected at all — including the never-injected
 * ones would drag the median to zero and measure store size instead of retrieval
 * quality. The worst list is ordered by injected_count among the zero-useful rows,
 * because "injected forty times, never once echoed" is the actionable end of the
 * distribution and "injected once, never echoed" is noise.
 */
export async function usefulness(conn, { worst = WORST_N } = {}) {
  const rows = await conn.all(
    `SELECT id, uid, text, status, pinned, injected_count, useful_count, last_injected_at, last_used_at
       FROM memories
      WHERE coalesce(injected_count, 0) > 0
      ORDER BY injected_count DESC, id`,
  );

  const ratios = rows.map((r) => r.useful_count / r.injected_count);
  const totals = await conn.get(
    'SELECT sum(coalesce(injected_count, 0)) AS injected, sum(coalesce(useful_count, 0)) AS useful FROM memories',
  );

  return {
    injected_rows: rows.length,
    injections: totals?.injected ?? 0,
    usefuls: totals?.useful ?? 0,
    // The store-wide ratio and the median row's ratio answer different questions:
    // the first is "how often does an injection land", the second is "how does a
    // typical memory do", and a few heavily-injected rows can pull them apart.
    ratio_overall: totals?.injected ? round((totals.useful ?? 0) / totals.injected, 3) : null,
    ratio_p50: round(median(ratios), 3),
    never_useful: rows.filter((r) => r.useful_count === 0).length,
    worst: rows
      .filter((r) => r.useful_count === 0)
      .slice(0, worst)
      .map((r) => ({
        id: r.id,
        injected_count: r.injected_count,
        useful_count: r.useful_count,
        status: r.status,
        pinned: r.pinned === 1,
        text: r.text,
      })),
  };
}

/**
 * PLAN's never-matched-cruft detector: `injected_count = 0` plus age. Bucketed,
 * because the shape is the signal — captures from last week have not had their
 * chance yet, and rows past the 60-day edge are already inside the archiving
 * rule's reach.
 */
export async function neverInjected(conn, { now = Date.now(), buckets = AGE_BUCKETS } = {}) {
  const age = ageDaysSql({ now });
  const rows = await conn.all(
    `SELECT status, ${age} AS age_days FROM memories WHERE coalesce(injected_count, 0) = 0`,
  );

  const edges = [...buckets].sort((a, b) => a - b);
  const labels = [
    ...edges.map((edge, i) => (i === 0 ? `<${edge}d` : `${edges[i - 1]}-${edge}d`)),
    `>${edges[edges.length - 1]}d`,
  ];
  const counts = labels.map(() => 0);
  const activeCounts = labels.map(() => 0);

  for (const row of rows) {
    let index = edges.findIndex((edge) => row.age_days < edge);
    if (index === -1) index = labels.length - 1;
    counts[index] += 1;
    if (row.status === 'active') activeCounts[index] += 1;
  }

  return {
    total: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    buckets: labels.map((label, i) => ({ label, n: counts[i], active: activeCounts[i] })),
  };
}

// ------------------------------------------------------------ slop detector --

/**
 * PLAN's second slop detector: "high mean cosine to a random sample".
 *
 * The two slop detectors are worth having both of. The injected:useful ratio needs
 * the memory to have been injected — so it says nothing about a slop memory in a
 * store nobody has queried yet — while this one is a property of the vector alone
 * and works on a store that has never served a prompt. What it cannot do is tell
 * "matches everything" from "this store is about one subject"; the *distribution*
 * is reported for that reason, since a single row well above its own p90 is the
 * finding and a whole store at 0.8 is a corpus, not a fault.
 */
export async function slop(
  conn,
  { sample = SLOP_SAMPLE, rowLimit = SLOP_ROW_LIMIT, worst = 5, embModel = EMB_MODEL, embDim = EMB_DIM } = {},
) {
  const eligible = await conn.get(
    `SELECT count(*) AS n FROM memories WHERE status = 'active' AND ${SCAN_GUARDS}`,
    embModel,
    embDim,
  );
  const total = eligible?.n ?? 0;
  if (total < 3) {
    return { sample: 0, scored: 0, p50: null, p90: null, max: null, worst: [], exact: true, note: null };
  }

  // Evenly spaced by id rather than random, for the same reproducibility reason
  // as the pair scan, and spaced rather than "the first 32" so the sample is not
  // all from the store's first week.
  const ids = (await conn.all(
    `SELECT id FROM memories WHERE status = 'active' AND ${SCAN_GUARDS} ORDER BY id`,
    embModel, embDim,
  )).map((r) => r.id);
  const stride = Math.max(1, Math.floor(ids.length / Math.min(sample, ids.length)));
  const sampleIds = ids.filter((_, i) => i % stride === 0).slice(0, sample);

  const scored = Math.min(total, rowLimit);
  const rows = await conn.all(
    `SELECT a.id, a.text, a.status,
            avg(1.0 - vector_distance_cos(a.emb, b.emb)) AS mean_cos
       FROM (SELECT id, text, status, emb FROM memories
              WHERE status = 'active' AND ${SCAN_GUARDS} ORDER BY id LIMIT ${Number(scored)}) a
       JOIN memories b
         ON b.id <> a.id AND b.id IN (${sampleIds.map(() => '?').join(', ')})
      GROUP BY a.id
      ORDER BY mean_cos DESC`,
    embModel, embDim, ...sampleIds,
  );

  const means = rows.map((r) => r.mean_cos);
  return {
    sample: sampleIds.length,
    scored: rows.length,
    exact: scored === total,
    p50: round(median(means), 4),
    p90: round(percentile(means, 0.9), 4),
    max: round(percentile(means, 1), 4),
    worst: rows.slice(0, worst).map((r) => ({ id: r.id, mean_cos: round(r.mean_cos, 4), text: r.text })),
    note: scored === total ? null : `scored the oldest ${scored} of ${total} active rows`,
  };
}

// ---------------------------------------------------------------- the log --

/**
 * PLAN: "consolidation runs: proposed / accepted / undone".
 *
 * `undone` and the run count start reporting in slice 5a.4, which is what makes
 * a run_id exist; `proposed` and `accepted` still wait on phase 5b's judge, so
 * the block says so rather than being left out. Both halves are derived from
 * `memory_events` and from `run_id` in the event detail.
 */
export const CONSOLIDATION_EVENTS = ['proposed', 'accepted', 'undone'];

export async function eventStats(conn, { events = CONSOLIDATION_EVENTS } = {}) {
  const histogram = await conn.all(
    'SELECT event, count(*) AS n, max(at) AS last_at FROM memory_events GROUP BY event ORDER BY n DESC',
  );

  const consolidation = {};
  for (const name of events) consolidation[name] = 0;
  for (const row of histogram) {
    if (Object.hasOwn(consolidation, row.event)) consolidation[row.event] = row.n;
  }

  // json_extract is present in this build. Counting runs in SQL keeps this O(1)
  // in the number of events rather than dragging every detail blob through JS.
  //
  // The `CASE WHEN json_valid` is load-bearing, and it was not here before slice
  // 5a.4 measured why: `json_extract` over a `detail` that is not JSON *throws*
  // in this build ("Parse error: malformed JSON") rather than returning NULL, so
  // one legacy or hand-edited event row would take `mem stats` down entirely.
  // Wrapping it in a CASE rather than adding an `AND json_valid(detail)` conjunct
  // is deliberate: the planner may evaluate conjuncts in either order.
  const runs = await conn.get(
    `SELECT count(DISTINCT (CASE WHEN json_valid(detail)
                                 THEN json_extract(detail, '$.run_id') END)) AS n
       FROM memory_events WHERE detail IS NOT NULL`,
  );

  return {
    ...consolidation,
    runs: runs?.n ?? 0,
    note: CONSOLIDATION_EVENTS.every((e) => consolidation[e] === 0)
      ? 'phase 5b has not shipped — nothing proposes, accepts or undoes yet'
      : null,
    histogram: histogram.map((r) => ({ event: r.event, n: r.n, last_at: r.last_at })),
  };
}

// ---------------------------------------------------------------- assembly --

function fileBytes(path) {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

/**
 * Every metric, over an open connection. Split from `stats()` the way search.mjs
 * splits `searchScoped` from `search`, so a test can drive it against a seeded
 * database without going through path resolution.
 */
export async function collect(
  conn,
  { now = Date.now(), projectKey = null, worst = WORST_N, ladder = true, ...opts } = {},
) {
  const t0 = performance.now();

  const schemaVersion = await readSchemaVersion(conn);
  const status = await statusCounts(conn, { now });
  const scan = await scanTiming(conn, { now, projectKey, ...opts });
  const duplicates = await duplicatePairs(conn, { worst, ...opts });
  const useful = await usefulness(conn, { worst });
  const cruft = await neverInjected(conn, { now });
  const slopStats = await slop(conn, opts);
  const events = await eventStats(conn);

  // What the ladder can already reach. Read-only — `plan()` never writes — and it
  // is the other half of this slice: the counts above say the store is rotting,
  // these say whether anything is going to do something about it.
  const due = ladder
    ? await (async () => {
        const planned = await prunePlan(conn, { now });
        return {
          rules: {
            expired: planned.counts.expired,
            'dead-scope': planned.counts['dead-scope'],
            stale: planned.counts.stale,
            tombstone: planned.counts.tombstoned,
          },
          thresholds: {
            strength: ARCHIVE_STRENGTH,
            min_age_days: ARCHIVE_MIN_AGE_DAYS,
            grace_days: DEAD_SCOPE_GRACE_DAYS,
            tombstone_after_days: TOMBSTONE_AFTER_DAYS,
          },
          scopes: planned.scopes,
          truncated: planned.truncated,
        };
      })()
    : null;

  return {
    now,
    schema_version: schemaVersion,
    pending_migrations: pendingMigrations(schemaVersion).map((m) => m.version),
    model: { emb_model: EMB_MODEL, emb_dim: EMB_DIM, stamps: await stampCounts(conn) },
    status,
    scan,
    duplicates,
    usefulness: useful,
    never_injected: cruft,
    slop: slopStats,
    ladder: due,
    consolidation: events,
    elapsed_ms: round(performance.now() - t0, 1),
  };
}

/**
 * `mem stats`. Read-only by construction: `openDb({ readonly: true })` also means
 * fileMustExist, so this can neither create a store nor migrate one — a stats
 * command that quietly rebuilt the schema on a v1 database would be the worst
 * possible surprise from a command someone ran to look at numbers. A pending
 * migration is reported instead.
 */
export async function stats({ conn, paths = resolvePaths(), env = process.env, cwd, ...opts } = {}) {
  const projectKey = opts.projectKey ?? resolveProjectKey({ cwd, env }).projectKey;
  const body = async (c) => ({
    ...(await collect(c, { ...opts, projectKey })),
    store: {
      path: paths.dbPath,
      bytes: fileBytes(paths.dbPath),
      wal_bytes: fileBytes(`${paths.dbPath}-wal`),
    },
  });

  if (conn) return body(conn);

  const c = await openDb({ paths, env, readonly: true, runMigrations: false });
  try {
    return await body(c);
  } finally {
    await c.close();
  }
}
