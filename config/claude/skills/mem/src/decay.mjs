// The decay model — PLAN's "Decay: spaced repetition, not a linear timer".
//
//   halflife_days = H0 × (1 + useful_count)^α           H0 = 30, α = 0.6
//   retention     = exp(−ln2 × days_since_last_use / halflife_days)
//   strength      = salience × retention × confidence
//
// A memory that keeps proving useful becomes durable; one that never does fades.
// `pinned = 1` forces retention to 1.0 — never decays, never pruned, exempt from
// every automatic action. `strength` replaces raw salience in the retrieval
// boost, so stale memories sink in ranking long before pruning touches them.
//
// WHY THIS FILE EXISTS TWICE OVER, IN JS AND IN SQL.
//
// Both are needed and neither can be dropped. JS scores rows that have already
// been fetched — the search boost, `mem show`, the profile — where re-querying
// to compute a number over columns already in hand would be absurd. SQL scores
// rows that have *not* been fetched: `mem list --sort strength` must order and
// LIMIT in the database rather than pulling the whole store into memory to sort
// it, and phase 5a.3's archiving rule (`strength < 0.15 AND useful_count = 0 AND
// age > 60d`) is a WHERE clause over every row there is.
//
// So the two live side by side in one file, and `decay.test.mjs` asserts they
// agree to 1e-12 over a matrix of rows rather than trusting that they do. Two
// copies of a formula in two languages is exactly the drift PLAN's countermeasure
// against "the copy that drifts loosest wins" is about; the answer is not to have
// one copy, which is impossible here, but to have a test that fails when they
// part company. The expressions are written to associate their arithmetic the
// same way — `(salience × retention) × confidence`, `(−ln2 × days) / halflife` —
// because agreeing to the last bit is cheap and an epsilon that has to be widened
// later is a bug nobody investigates.
//
// STRENGTH IS NOT A STORED COLUMN, and PLAN's tier-1 job list ("recompute
// strength from decay") does not need it to be. It is a pure function of columns
// the row already has plus the current time, so computing it in the query is both
// cheaper than a maintenance pass and never stale between two of them — which is
// what PLAN's rung 1 ("Demote — strength decays; sinks in ranking. Automatic,
// continuous.") actually asks for. A stored column would decay in steps at
// whatever hour the maintenance run happened to fire.
//
// Timestamps are epoch milliseconds throughout, matching write.mjs.

/** PLAN: `H0 = 30`, `α = 0.6`. */
export const HALFLIFE_H0 = 30;
export const HALFLIFE_ALPHA = 0.6;

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The columns the model reads. Any query that wants `strengthSql` must select or
 * at least expose these, and the list is here so a caller trimming a SELECT can
 * check it against something rather than against the formula's body.
 */
export const DECAY_COLUMNS = [
  'salience',
  'confidence',
  'pinned',
  'useful_count',
  'last_used_at',
  'updated_at',
  'created_at',
];

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
 *
 * `last_injected_at` is deliberately absent from that chain (slice 3.2): if
 * injecting a memory reset its own decay clock, every memory the hook ever
 * surfaced would stay strong on the strength of having been surfaced, and the
 * ranking would be a feedback loop measuring itself.
 */
export function retention(row, now = Date.now(), opts) {
  if (row.pinned) return 1;
  const since = row.last_used_at ?? row.updated_at ?? row.created_at ?? now;
  const days = Math.max(0, (now - since) / DAY_MS);
  return Math.exp((-Math.LN2 * days) / halflifeDays(row.useful_count, opts));
}

/**
 * PLAN: `strength = salience × retention × confidence`, and it "replaces raw
 * salience in the retrieval boost, so stale memories sink in ranking long before
 * pruning touches them".
 */
export function strength(row, now = Date.now(), opts) {
  return clamp01(row.salience) * retention(row, now, opts) * clamp01(row.confidence);
}

/**
 * A JS number as a SQL literal.
 *
 * These are inlined rather than bound as `?` because the expressions below get
 * pasted into a SELECT list, a WHERE clause and an ORDER BY of the same
 * statement, and a caller interleaving three sets of bind parameters in the right
 * positional order is a bug waiting for its first `--offset`. Only numbers this
 * module generated ever reach here, and the guard is what keeps that true: a
 * string that came from a flag arrives as NaN and throws, and exponent notation
 * (which SQLite will not parse the same way) throws rather than producing a
 * statement that fails at run time somewhere else.
 */
function num(value, what) {
  // `typeof` rather than `Number(value)`: Number(null) is 0 and Number('') is 0,
  // so a coercing check would happily inline a caller's missing option as a
  // plausible-looking zero — an alpha of 0 makes every halflife H0 and a `now` of
  // 0 makes every memory 55 years stale, both silently.
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`decay: ${what} must be a finite number, got ${JSON.stringify(value)}.`);
  }
  const text = String(value);
  if (/[eE]/.test(text)) {
    throw new RangeError(`decay: ${what} is out of range for a SQL literal (${text}).`);
  }
  return text.includes('.') ? text : `${text}.0`;
}

/**
 * The model as SQL, for queries that must filter or order by strength without
 * fetching every row first.
 *
 * `prefix` qualifies the column references (`'m.'`) for a joined query; the
 * default leaves them bare. `now` is the same clock the JS side is passed, so a
 * caller that mixes the two in one operation gets one consistent instant rather
 * than two readings a few milliseconds apart.
 *
 * Every column is `coalesce`d because the JS side uses `??` and `clamp01`, and
 * SQL's NULL propagation would otherwise turn one missing value into a NULL
 * strength that sorts ahead of every real one in an ASC order — the same silent
 * failure `emb IS NOT NULL` exists to prevent in search.mjs.
 */
export function decaySql({
  now = Date.now(),
  h0 = HALFLIFE_H0,
  alpha = HALFLIFE_ALPHA,
  prefix = '',
} = {}) {
  const t = num(now, 'now');
  const col = (name) => `${prefix}${name}`;

  // coalesce(..., NOW) mirrors the JS `?? now`: a row with no timestamps at all
  // is treated as written this instant, i.e. undecayed, rather than as infinitely
  // old. Only import can produce one, and inventing decay for it would be worse.
  const since = `coalesce(${col('last_used_at')}, ${col('updated_at')}, ${col('created_at')}, ${t})`;
  const days = `max(0.0, (${t} - ${since}) / ${num(DAY_MS, 'DAY_MS')})`;
  const halflife = `(${num(h0, 'h0')} * pow(1.0 + max(0.0, coalesce(${col('useful_count')}, 0.0)), ${num(alpha, 'alpha')}))`;

  // `!= 0` rather than `= 1` because the JS side tests `if (row.pinned)`, and a
  // store that somehow holds pinned = 2 must not decay in SQL while staying put
  // in JS.
  const retentionSql = `(CASE WHEN coalesce(${col('pinned')}, 0) != 0 THEN 1.0
        ELSE exp(-ln(2.0) * ${days} / ${halflife}) END)`;

  const clamp = (name) => `min(1.0, max(0.0, coalesce(${col(name)}, 0.0)))`;
  const strengthSqlText = `(${clamp('salience')} * ${retentionSql} * ${clamp('confidence')})`;

  return { days, halflife, retention: retentionSql, strength: strengthSqlText, now };
}

/** Just the strength expression — what almost every caller wants. */
export function strengthSql(opts) {
  return decaySql(opts).strength;
}

/** Just the retention expression. */
export function retentionSql(opts) {
  return decaySql(opts).retention;
}

/**
 * How many days old a row is, in SQL, from `created_at` — the age PLAN's
 * archiving rule means by "age > 60d". Not the decay clock: that one falls back
 * through last_used_at first, and the two answer different questions.
 */
export function ageDaysSql({ now = Date.now(), prefix = '' } = {}) {
  const t = num(now, 'now');
  const created = `coalesce(${prefix}created_at, ${prefix}updated_at, ${t})`;
  return `max(0.0, (${t} - ${created}) / ${num(DAY_MS, 'DAY_MS')})`;
}
