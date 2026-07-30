// The pruning ladder — PLAN's "The pruning ladder — nothing is deleted", rungs
// 2 and 3, by rule rather than by hand.
//
//   1. Demote     strength decays; sinks in ranking.   decay.mjs, continuous
//   2. Archive    status='archived', out of retrieval, fully restorable.
//                 THIS FILE: the stale rule, TTL expiry, dead project scopes.
//   3. Tombstone  after 6 months archived, emb = NULL. Text and history stay.
//                 THIS FILE.
//   4. Purge      real deletion, only ever explicit.   manage.mjs, `forget --hard`
//
// WHY EVERY RULE HERE IS WRITTEN TO UNDER-FIRE. PLAN: "a false-positive prune is
// an *invisible* failure. You never notice the memory that should have been
// there. Recovering disk is worth far less than that." So every rung is a
// conjunction of independent conditions rather than a single threshold, `pinned`
// is exempt from all of it ("exempt from all automatic actions"), and each action
// writes a memory_events row carrying the prior state it would take to invert.
// Nothing here deletes anything.
//
// DRY RUN IS THE DEFAULT, at this module's level and not just the CLI's: every
// function has a `due()` half that only reads, and `apply()` takes the rows the
// former returned. That split is what let the stale rule be checked against a
// real store with `mem list --max-strength 0.15 --sort strength` (slice 5a.1)
// before anything automatic acted on it, and it is what slice 5a.4 will wrap in
// one run_id.
//
// Timestamps are epoch milliseconds throughout, matching write.mjs.

import { existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

import { withDb } from './db.mjs';
import { DAY_MS, ageDaysSql, strengthSql } from './decay.mjs';
import { EVENT_ARCHIVED } from './manage.mjs';
import { recordEvent } from './write.mjs';

/**
 * PLAN rung 2, the stale rule: `strength < 0.15 AND useful_count = 0 AND
 * age > 60d`. All three, and the conjunction is the safety: a decayed memory
 * that proved useful once is spared, a never-useful memory written last week is
 * spared, and a strong memory is spared however old it is.
 */
export const ARCHIVE_STRENGTH = 0.15;
export const ARCHIVE_MIN_AGE_DAYS = 60;

/** PLAN rung 2: dead project scope "after a 90-day grace period with a flag first". */
export const DEAD_SCOPE_GRACE_DAYS = 90;

/** PLAN rung 3: "after 6 months archived, emb = NULL". */
export const TOMBSTONE_AFTER_DAYS = 182;

/**
 * How many rows one apply() touches. Not a policy — a bound on the size of a
 * single transaction and of a single audit-log burst, so a first run against a
 * store that has never been maintained does not write fifty thousand events in
 * one go. What was left is reported, never silently dropped.
 */
export const APPLY_LIMIT = 2000;

export const EVENT_TOMBSTONED = 'tombstoned';
export const EVENT_SCOPE_FLAGGED = 'scope-flagged';
export const EVENT_SCOPE_REVIVED = 'scope-revived';

/** Why a row was archived. Recorded in the event so the log explains itself. */
export const REASON_STALE = 'stale';
export const REASON_EXPIRED = 'expired';
export const REASON_DEAD_SCOPE = 'dead-scope';

/** `meta` key holding the flag and its date for one dead scope. */
export const DEAD_SCOPE_PREFIX = 'dead_scope:';

// Enough to explain a decision in the audit log and in --json without carrying
// the 1.5 KB embedding around.
const ROW_COLUMNS = `id, uid, kind, scope, project_key, text, status, pinned,
                     salience, confidence, useful_count, injected_count,
                     created_at, updated_at, last_used_at, expires_at,
                     emb_model, emb_dim`;

// -------------------------------------------------------------- rung 2: TTL --

/**
 * Rung 2 by expiry: an active memory whose `expires_at` has passed.
 *
 * Retrieval already hides these between two runs (search.mjs's candidate WHERE
 * carries the same clause on purpose), so this rung changes nothing about what
 * gets injected. What it changes is honesty: the row stops claiming to be active,
 * `mem stats` stops counting it, and the scan it costs goes away.
 *
 * Only `status='active'`. A staged row with a TTL is a review-queue question and
 * archiving it out from under the reviewer would empty the queue by timeout.
 */
export async function ttlDue(conn, { now = Date.now(), limit = APPLY_LIMIT } = {}) {
  return conn.all(
    `SELECT ${ROW_COLUMNS} FROM memories
      WHERE status = 'active' AND pinned = 0
        AND expires_at IS NOT NULL AND expires_at <= ?
      ORDER BY expires_at, id
      LIMIT ?`,
    now,
    limit,
  );
}

// ------------------------------------------------------------ rung 2: stale --

/**
 * Rung 2 by the stale rule. The WHERE clause is PLAN's sentence, and the
 * strength half of it is decay.mjs's SQL twin of the same formula the JS side
 * scores fetched rows with — which is the whole reason that twin exists.
 *
 * `useful_count = 0` is doing more work than it looks: slice 5a.2's echo
 * heuristic is what puts a number in that column, and a memory that echoed even
 * once is never reached by this rule again. That is deliberate and it is why the
 * echo rule was allowed to be noisy — the noise spares memories, it does not
 * archive them.
 */
export async function staleDue(
  conn,
  {
    now = Date.now(),
    limit = APPLY_LIMIT,
    strength = ARCHIVE_STRENGTH,
    minAgeDays = ARCHIVE_MIN_AGE_DAYS,
  } = {},
) {
  const str = strengthSql({ now });
  const age = ageDaysSql({ now });
  return conn.all(
    `SELECT ${ROW_COLUMNS}, ${str} AS strength, ${age} AS age_days
       FROM memories
      WHERE status = 'active' AND pinned = 0
        AND coalesce(useful_count, 0) = 0
        AND ${str} < ?
        AND ${age} > ?
      ORDER BY ${str}, id
      LIMIT ?`,
    strength,
    minAgeDays,
    limit,
  );
}

// ------------------------------------------------------- rung 2: dead scope --

/**
 * Whether a project_key still names something that exists.
 *
 * Two shapes reach this, and only one of them is checkable. A key from a git
 * remote (`github.com/owner/repo`) cannot be verified without the network, which
 * a maintenance pass must never touch — so it is 'unknown' and never flagged. A
 * key from a path (scope.mjs's git-root and cwd fallbacks, always absolute) can
 * be checked with a stat.
 *
 * THE UNMOUNTED-VOLUME GUARD is the part that matters. If $HOME is not mounted —
 * an external disk, a container with a different layout, a machine mid-restore —
 * every path key looks deleted at once, and ninety days later the store archives
 * itself. So a missing directory is only 'dead' when its *parent* is still there:
 * a repo deleted out of ~/code leaves ~/code behind, while an unmounted volume
 * takes the parent with it. If the parent is gone too, the answer is 'unknown',
 * because "deleted" and "not currently visible" are genuinely indistinguishable
 * from here and one of them must not be guessed at.
 */
export function scopeLiveness(projectKey) {
  if (typeof projectKey !== 'string' || projectKey === '') {
    return { projectKey, state: 'unknown', why: 'no project key' };
  }
  if (!projectKey.startsWith('/')) {
    return { projectKey, state: 'unknown', why: 'remote key — not checkable offline' };
  }

  try {
    if (statSync(projectKey).isDirectory()) return { projectKey, state: 'live', why: 'directory exists' };
    return { projectKey, state: 'unknown', why: 'path exists but is not a directory' };
  } catch {
    // Fall through to the parent check.
  }

  const parent = dirname(projectKey);
  if (parent === projectKey || !existsSync(parent)) {
    return { projectKey, state: 'unknown', why: `parent ${parent} is gone too — cannot tell deleted from unmounted` };
  }
  return { projectKey, state: 'dead', why: `gone, but ${parent} is still there` };
}

/** Every project scope with at least one non-purged memory, and its row counts. */
export async function projectScopes(conn) {
  return conn.all(
    `SELECT project_key,
            count(*) AS memories,
            sum(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
            sum(pinned) AS pinned,
            max(coalesce(last_used_at, updated_at, created_at)) AS last_touched
       FROM memories
      WHERE scope = 'project' AND project_key IS NOT NULL
      GROUP BY project_key
      ORDER BY project_key`,
  );
}

/**
 * The dead-scope flags, read back from `meta`.
 *
 * They live there rather than in memory_events because a flag is a fact about a
 * *scope*, not about a row, and because the grace period has to be answerable by
 * one lookup rather than by scanning an append-only log for the newest entry that
 * has not been contradicted. The corresponding events are still written — the log
 * records the decision, meta holds the state.
 */
export async function readFlags(conn) {
  const rows = await conn.all('SELECT k, v FROM meta WHERE substr(k, 1, ?) = ?',
    DEAD_SCOPE_PREFIX.length, DEAD_SCOPE_PREFIX);
  const flags = new Map();
  for (const row of rows) {
    const key = row.k.slice(DEAD_SCOPE_PREFIX.length);
    let detail = null;
    try {
      detail = JSON.parse(row.v);
    } catch {
      detail = null;
    }
    const flaggedAt = Number(detail?.flagged_at);
    flags.set(key, {
      projectKey: key,
      flaggedAt: Number.isFinite(flaggedAt) ? flaggedAt : null,
      why: detail?.why ?? null,
    });
  }
  return flags;
}

/**
 * What the dead-scope rung would do, for every project scope in the store.
 *
 * `action` is one of:
 *   'flag'     — dead and not yet flagged. Nothing is archived on this run.
 *   'wait'     — flagged, still inside the grace period. Reports days left.
 *   'archive'  — flagged, grace expired. Its active rows come back in `due`.
 *   'revive'   — flagged but the directory is back. The flag is dropped.
 *   'none'     — live, or not checkable.
 *
 * "with a flag first" is the whole point of the two-phase shape: the first run
 * only says so, which gives ninety days and a `mem stats` line for someone to
 * notice that a path they still care about moved.
 */
export async function deadScopePlan(conn, { now = Date.now(), graceDays = DEAD_SCOPE_GRACE_DAYS } = {}) {
  const flags = await readFlags(conn);
  const scopes = await projectScopes(conn);
  const plan = [];

  for (const scope of scopes) {
    const liveness = scopeLiveness(scope.project_key);
    const flag = flags.get(scope.project_key) ?? null;

    let action = 'none';
    let daysLeft = null;

    if (liveness.state === 'dead') {
      if (!flag) {
        action = 'flag';
      } else if (flag.flaggedAt === null) {
        // A flag we cannot date cannot be aged. Re-flag rather than treat a
        // corrupt value as "flagged long ago", which is the direction that
        // archives things.
        action = 'flag';
      } else {
        const elapsed = (now - flag.flaggedAt) / DAY_MS;
        daysLeft = Math.max(0, graceDays - elapsed);
        action = elapsed >= graceDays ? 'archive' : 'wait';
      }
    } else if (flag) {
      action = 'revive';
    }

    plan.push({
      project_key: scope.project_key,
      memories: scope.memories,
      active: scope.active,
      pinned: scope.pinned,
      last_touched: scope.last_touched,
      state: liveness.state,
      why: liveness.why,
      flagged_at: flag?.flaggedAt ?? null,
      days_left: daysLeft === null ? null : Math.round(daysLeft * 10) / 10,
      action,
    });
  }

  // Flags for scopes with no memories left at all (purged, or exported away).
  // Nothing to archive, but the flag should not outlive its subject.
  const known = new Set(scopes.map((s) => s.project_key));
  for (const [key, flag] of flags) {
    if (known.has(key)) continue;
    plan.push({
      project_key: key,
      memories: 0, active: 0, pinned: 0, last_touched: null,
      state: scopeLiveness(key).state,
      why: 'no memories left in this scope',
      flagged_at: flag.flaggedAt,
      days_left: null,
      action: 'revive',
    });
  }

  return plan;
}

/** The active rows a scope past its grace period would archive. */
export async function deadScopeDue(conn, { now = Date.now(), limit = APPLY_LIMIT, graceDays } = {}) {
  const plan = await deadScopePlan(conn, { now, graceDays });
  const condemned = plan.filter((p) => p.action === 'archive').map((p) => p.project_key);
  if (condemned.length === 0) return { plan, due: [] };

  const due = await conn.all(
    `SELECT ${ROW_COLUMNS} FROM memories
      WHERE status = 'active' AND pinned = 0
        AND scope = 'project'
        AND project_key IN (${condemned.map(() => '?').join(', ')})
      ORDER BY project_key, id
      LIMIT ?`,
    ...condemned,
    limit,
  );
  return { plan, due };
}

const UPSERT_FLAG =
  'INSERT INTO meta(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v';

/**
 * Write the flag/revive half of the dead-scope rung. Archiving the rows of a
 * scope past its grace is `archiveRows`'s job, with the same reason string, so
 * one code path owns "how a row becomes archived".
 */
export async function applyScopeFlags(conn, plan, { now = Date.now(), runId = null } = {}) {
  const flagged = [];
  const revived = [];

  for (const entry of plan) {
    if (entry.action === 'flag') {
      await conn.run(
        UPSERT_FLAG,
        `${DEAD_SCOPE_PREFIX}${entry.project_key}`,
        JSON.stringify({ flagged_at: now, why: entry.why, project_key: entry.project_key }),
      );
      // memory_id NULL: this is a fact about a scope, like manage.mjs's purge
      // record. The log is what explains a mass archive ninety days later.
      await recordEvent(conn, {
        memoryId: null,
        event: EVENT_SCOPE_FLAGGED,
        at: now,
        detail: { project_key: entry.project_key, why: entry.why, memories: entry.memories, run_id: runId },
      });
      flagged.push(entry.project_key);
    } else if (entry.action === 'revive') {
      await conn.run('DELETE FROM meta WHERE k = ?', `${DEAD_SCOPE_PREFIX}${entry.project_key}`);
      await recordEvent(conn, {
        memoryId: null,
        event: EVENT_SCOPE_REVIVED,
        at: now,
        detail: { project_key: entry.project_key, why: entry.why, flagged_at: entry.flagged_at, run_id: runId },
      });
      revived.push(entry.project_key);
    }
  }

  return { flagged, revived };
}

// ---------------------------------------------------------- rung 2: archive --

/**
 * Move rows to `status='archived'`, writing one invertible event each.
 *
 * `previous.status` is what `mem forget --restore` reads to decide where a row
 * goes back to (manage.mjs's statusBeforeArchive), and it is the same event name
 * a hand `mem forget` writes — deliberately, because a row archived by rule and a
 * row archived by hand are the same state and restoring them must be one code
 * path, not two that can disagree.
 *
 * `updated_at` is untouched, for the reason manage.mjs states: an unused memory
 * decays from that column, so bumping it here would make archive-then-restore
 * look like the memory had just been restated.
 */
export async function archiveRows(conn, rows, { now = Date.now(), reason, runId = null } = {}) {
  const done = [];
  for (const row of rows) {
    if (row.pinned) continue; // Belt to the WHERE clauses' braces.
    await conn.run("UPDATE memories SET status = 'archived' WHERE id = ?", row.id);
    const eventId = await recordEvent(conn, {
      memoryId: row.id,
      event: EVENT_ARCHIVED,
      at: now,
      detail: {
        reason,
        via: 'prune',
        run_id: runId,
        previous: { status: row.status },
        // The evidence for the decision, so "why is this archived" is answerable
        // from the log rather than from a strength that has moved on since.
        at_decision: {
          strength: row.strength ?? null,
          age_days: row.age_days ?? null,
          useful_count: row.useful_count ?? 0,
          injected_count: row.injected_count ?? 0,
          expires_at: row.expires_at ?? null,
          project_key: row.project_key ?? null,
        },
      },
    });
    done.push({ id: row.id, uid: row.uid, text: row.text, from: row.status, to: 'archived', reason, eventId });
  }
  return done;
}

// -------------------------------------------------------- rung 3: tombstone --

/**
 * Rung 3: rows archived long enough that their vector is not worth its 1.5 KB.
 *
 * The clock comes from the audit log, not from a column — `setStatus` leaves
 * `updated_at` alone on purpose, so nothing on the row itself records *when* it
 * was archived. `coalesce(archived_at, updated_at, created_at)` covers the row
 * that arrived archived through `mem import` and therefore has no event.
 *
 * Reversible, at a price PLAN states: the text and the whole history stay, and
 * restoring needs a re-embed (`mem reembed --tombstoned`, ~11ms a row). With
 * VACUUM disabled in this build this bounds file growth rather than shrinking the
 * file, which is why it is the fourth rung down and not the first.
 */
export async function tombstoneDue(
  conn,
  { now = Date.now(), limit = APPLY_LIMIT, afterDays = TOMBSTONE_AFTER_DAYS } = {},
) {
  const cutoff = now - afterDays * DAY_MS;
  return conn.all(
    `SELECT ${ROW_COLUMNS}, archived_at, (? - archived_at) / ? AS archived_days_ago
       FROM (
         SELECT ${ROW_COLUMNS},
                coalesce(
                  (SELECT max(e.at) FROM memory_events e
                    WHERE e.memory_id = memories.id AND e.event = ?),
                  updated_at, created_at) AS archived_at
           FROM memories
          WHERE status = 'archived' AND pinned = 0 AND emb IS NOT NULL
       )
      WHERE archived_at IS NOT NULL AND archived_at <= ?
      ORDER BY archived_at, id
      LIMIT ?`,
    now,
    DAY_MS,
    EVENT_ARCHIVED,
    cutoff,
    limit,
  );
}

/**
 * Drop the vectors. The event carries the stamp the row is losing, which is all
 * an undo needs: the text is still there, so the vector is recomputable, and
 * knowing which model made the old one is what says whether recomputing it
 * lands in the same space.
 */
export async function tombstoneRows(conn, rows, { now = Date.now(), runId = null } = {}) {
  const done = [];
  for (const row of rows) {
    if (row.pinned) continue;
    await conn.run('UPDATE memories SET emb = NULL WHERE id = ? AND emb IS NOT NULL', row.id);
    const eventId = await recordEvent(conn, {
      memoryId: row.id,
      event: EVENT_TOMBSTONED,
      at: now,
      detail: {
        via: 'prune',
        run_id: runId,
        previous: { emb_model: row.emb_model, emb_dim: row.emb_dim, embedded: true },
        archived_at: row.archived_at ?? null,
        archived_days_ago: row.archived_days_ago ?? null,
      },
    });
    done.push({
      id: row.id,
      uid: row.uid,
      text: row.text,
      archived_at: row.archived_at ?? null,
      eventId,
    });
  }
  return done;
}

// ------------------------------------------------------------------- driver --

/** The rungs, in the order a run applies them. Named so `--rule` can pick one. */
export const RULES = ['expired', 'dead-scope', 'stale', 'tombstone'];

/**
 * What the ladder would do, without doing any of it.
 *
 * Order matters and is not alphabetical: expiry and dead scopes are *reasons a
 * human gave*, so they claim a row before the statistical rule does, and a row
 * archived on this run is not tombstoned on the same one (it has not been
 * archived for six months — it has been archived for no time at all). Each row
 * appears once, under the first rung that reaches it.
 */
export async function plan(conn, { now = Date.now(), limit = APPLY_LIMIT, rules = RULES, ...opts } = {}) {
  const wanted = new Set(rules);
  const claimed = new Set();
  // `full` records which rungs came back at their budget, measured *before* the
  // overlap filter — a rung that fetched `limit` rows has more waiting whether or
  // not another rung had already claimed some of them.
  const full = [];
  const take = (rule, rows) => {
    if (rows.length >= limit) full.push(rule);
    const kept = rows.filter((r) => !claimed.has(r.id));
    for (const row of kept) claimed.add(row.id);
    return kept;
  };

  const expired = wanted.has('expired') ? take('expired', await ttlDue(conn, { now, limit })) : [];

  let scopePlan = [];
  let deadScope = [];
  if (wanted.has('dead-scope')) {
    const found = await deadScopeDue(conn, { now, limit, graceDays: opts.graceDays });
    scopePlan = found.plan;
    deadScope = take('dead-scope', found.due);
  }

  const stale = wanted.has('stale')
    ? take('stale', await staleDue(conn, { now, limit, strength: opts.strength, minAgeDays: opts.minAgeDays }))
    : [];

  // Tombstoning reads `status='archived'`, so rows the rungs above are *about* to
  // archive are not in it — and must not be, or a row would be archived and
  // stripped of its vector in the same second.
  const tombstone = wanted.has('tombstone')
    ? take('tombstone', await tombstoneDue(conn, { now, limit, afterDays: opts.afterDays }))
    : [];

  // Reason strings travel with the rows rather than being mapped back from a key
  // at apply time, so the audit log and this plan can never disagree about why.
  const archive = [
    { rule: 'expired', reason: REASON_EXPIRED, rows: expired },
    { rule: 'dead-scope', reason: REASON_DEAD_SCOPE, rows: deadScope },
    { rule: 'stale', reason: REASON_STALE, rows: stale },
  ].filter((bucket) => wanted.has(bucket.rule));

  return {
    now,
    rules: [...wanted],
    limit,
    archive,
    tombstone,
    scopes: scopePlan,
    counts: {
      expired: expired.length,
      'dead-scope': deadScope.length,
      stale: stale.length,
      archived: expired.length + deadScope.length + stale.length,
      tombstoned: tombstone.length,
      flag: scopePlan.filter((s) => s.action === 'flag').length,
      wait: scopePlan.filter((s) => s.action === 'wait').length,
      revive: scopePlan.filter((s) => s.action === 'revive').length,
    },
    // A rung that filled its budget has more waiting. Said out loud, because a
    // truncated result that reads like a complete one is how a maintenance pass
    // silently stops keeping up.
    truncated: full,
  };
}

/**
 * Apply a plan. One transaction for the lot: a half-applied ladder leaves rows
 * archived with no event explaining it, which is exactly the state PLAN's
 * reversibility section exists to prevent.
 *
 * `runId` is threaded into every event detail but generated nowhere here — slice
 * 5a.4 owns the run and its undo. Passing nothing writes `run_id: null`, which is
 * the honest record of "somebody typed `mem prune --apply`".
 */
export async function applyPlan(conn, planned, { runId = null } = {}) {
  const { now } = planned;
  const work = conn.transactionAsync(async (tx) => {
    const scopes = await applyScopeFlags(tx, planned.scopes, { now, runId });

    const archived = {};
    for (const bucket of planned.archive) {
      archived[bucket.rule] = await archiveRows(tx, bucket.rows, {
        now,
        runId,
        reason: bucket.reason,
      });
    }
    const tombstoned = await tombstoneRows(tx, planned.tombstone, { now, runId });

    return { scopes, archived, tombstoned };
  });
  return work.immediate();
}

/**
 * Module-level entry point: plan, and apply only when asked. Matches the shape of
 * manage.mjs's wrappers.
 */
export async function prune({ conn, paths, env = process.env, apply = false, runId = null, ...opts } = {}) {
  const run = async (c) => {
    const planned = await plan(c, opts);
    const applied = apply ? await applyPlan(c, planned, { runId }) : null;
    return { ...planned, applied, dryRun: !apply };
  };
  return conn ? run(conn) : withDb(run, { paths, env });
}
