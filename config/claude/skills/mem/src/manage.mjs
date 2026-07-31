// Curation by hand — list, show, forget, pin.
//
// `search` answers "what is relevant to this prompt"; this file answers "what is
// actually in there". The difference matters: retrieval hides rows on purpose
// (expired, staged, wrong scope, below the gate), and a store you cannot see in
// full is the black box PLAN's countermeasure #7 exists to prevent. So the
// inspection surface filters only when asked, and *marks* what retrieval would
// have hidden rather than hiding it too.
//
// Everything here is deliberately model-free: list, show, forget and pin never
// embed anything, so they keep working when the model cache is gone and cost a
// few milliseconds rather than ~250.
//
// PLAN's pruning ladder, rungs 2 and 4, are `forget` and `forget --hard`:
// "nothing is deleted" except when a human types it, because a false-positive
// prune is an *invisible* failure — you never notice the memory that should have
// been there.

import { withDb } from './db.mjs';
import { retention, strength, strengthSql } from './decay.mjs';
import { PROPOSAL_PREFIX, dropMetaFor, dropVerdictsFor } from './pairs.mjs';
import { KINDS, STATUSES, recordEvent } from './write.mjs';

/** One screenful. `list` is a scanning surface, not a dump — `export` is that. */
export const LIST_LIMIT = 20;

/**
 * Shortest uid prefix accepted as a reference. A UUID is 36 characters and
 * nobody types one; four hex characters over a store this size is already
 * unambiguous, and an ambiguous prefix is an error rather than a guess.
 */
export const MIN_UID_PREFIX = 4;

/**
 * The ORDER BY behind each `--sort`, as a function of `now` because one of them
 * needs it.
 *
 * 'oldest' is the odd one out and earns its place: everything else here answers
 * "what is newest / strongest", and a queue is drained from the front — the
 * review surface needs the item that has been waiting longest, not the one that
 * arrived last.
 *
 * 'strength' became a real ORDER BY in slice 5a.1. It used to fetch the whole
 * filtered set and sort it in JS, because strength is not a column; it is not a
 * column still, but decay.mjs can now write it as an expression, so the database
 * does the ordering and `--limit`/`--offset` mean what they say instead of
 * paginating a list already materialised in memory.
 */
const ORDER_BY = {
  updated: () => 'updated_at DESC, id DESC',
  created: () => 'created_at DESC, id DESC',
  oldest: () => 'created_at ASC, id ASC',
  id: () => 'id DESC',
  strength: (now) => `${strengthSql({ now })} DESC, id ASC`,
};

/** Derived from ORDER_BY so a sort can never be offered without being implemented. */
export const SORTS = Object.keys(ORDER_BY);

export const EVENT_ARCHIVED = 'archived';
export const EVENT_RESTORED = 'restored';
export const EVENT_PURGED = 'purged';
export const EVENT_PINNED = 'pinned';
export const EVENT_UNPINNED = 'unpinned';

export class ManageError extends Error {
  constructor(message, code = 'MEM_INVALID') {
    super(message);
    this.name = 'ManageError';
    this.code = code;
  }
}

// Never `SELECT *`: emb is 1.5 KB of float noise per row. `embedded` is the one
// thing worth knowing about it — a phase-5 tombstone is findable lexically but
// invisible to the vector leg, and that is not otherwise apparent from a row.
const ROW_COLUMNS = `id, uid, kind, scope, project_key, text, why,
                     salience, confidence, pinned, status, superseded_by,
                     source_kind, source_session,
                     created_at, updated_at, last_injected_at, injected_count,
                     last_used_at, useful_count, expires_at, consolidated_at,
                     emb_model, emb_dim, emb IS NOT NULL AS embedded`;

/**
 * Derived fields every read surface wants and no column stores: how strong the
 * memory currently is, and whether retrieval would have skipped it. Computed
 * here rather than in the CLI so `--json` and the printed output can never
 * disagree about it.
 */
export function decorate(row, now = Date.now()) {
  return {
    ...row,
    strength: strength(row, now),
    retention: retention(row, now),
    expired: row.expires_at !== null && row.expires_at !== undefined && row.expires_at <= now,
  };
}

/**
 * Find one memory by `#12`, `12`, a full uid, or an unambiguous uid prefix.
 *
 * A purely numeric ref is always an id: uids are UUIDs, so the two namespaces
 * cannot collide. An ambiguous prefix throws and names the candidates — picking
 * the first match would eventually archive the wrong memory silently.
 */
export async function resolveRef(conn, ref) {
  const raw = String(ref ?? '').trim();
  if (raw === '') {
    throw new ManageError('Which memory? Give an id like 12, or a uid.', 'MEM_BAD_REF');
  }

  const bare = raw.replace(/^#/, '');

  if (/^\d+$/.test(bare)) {
    const row = await conn.get(`SELECT ${ROW_COLUMNS} FROM memories WHERE id = ?`, Number(bare));
    if (row) return row;
    throw new ManageError(`No memory #${bare}.`, 'MEM_NOT_FOUND');
  }

  const exact = await conn.get(`SELECT ${ROW_COLUMNS} FROM memories WHERE uid = ?`, bare);
  if (exact) return exact;

  if (bare.length < MIN_UID_PREFIX) {
    throw new ManageError(
      `'${raw}' is too short to match a uid — give at least ${MIN_UID_PREFIX} characters, or an id.`,
      'MEM_BAD_REF',
    );
  }

  // substr rather than LIKE so a '%' or '_' in the ref is a literal, not a
  // wildcard that quietly matches everything.
  const matches = await conn.all(
    `SELECT ${ROW_COLUMNS} FROM memories WHERE substr(uid, 1, ?) = ? ORDER BY id LIMIT 6`,
    bare.length,
    bare,
  );
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new ManageError(`No memory matching '${raw}'.`, 'MEM_NOT_FOUND');

  const shown = matches.slice(0, 5).map((m) => `#${m.id} ${m.uid}`).join('\n  ');
  throw new ManageError(
    `'${raw}' matches ${matches.length} memories:\n  ${shown}\nUse an id or a longer prefix.`,
    'MEM_AMBIGUOUS_REF',
  );
}

/** Resolve several refs, keeping the caller's order and rejecting duplicates. */
export async function resolveRefs(conn, refs) {
  const rows = [];
  const seen = new Set();
  for (const ref of refs) {
    const row = await resolveRef(conn, ref);
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return rows;
}

function requireSubset(values, allowed, field) {
  for (const value of values) {
    if (!allowed.includes(value)) {
      throw new ManageError(
        `Unknown ${field} '${value}' — expected one of: ${allowed.join(', ')}.`,
      );
    }
  }
  return values;
}

/**
 * The WHERE body shared by `list` and `export`, so the two never disagree about
 * what `--status archived --global` selects.
 *
 * The scopes are named rather than boolean because there are three of them and
 * they are not opposites: 'project' is retrieval's union (this project *plus*
 * globals), 'project-only' excludes the globals, 'all' is every project on the
 * machine. Defaults differ by caller on purpose — `list` scopes to the project
 * because that is what you are looking at, `export` does not because a backup
 * that quietly omits the other repos is worse than no backup.
 */
export function buildFilter({
  statuses = null,
  kinds = null,
  scope = 'all',
  projectKey = null,
  pinned = null,
  minStrength = null,
  maxStrength = null,
  now = Date.now(),
} = {}) {
  const clauses = [];
  const params = [];

  if (statuses?.length) {
    requireSubset(statuses, STATUSES, 'status');
    clauses.push(`status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }
  if (kinds?.length) {
    requireSubset(kinds, KINDS, 'kind');
    clauses.push(`kind IN (${kinds.map(() => '?').join(', ')})`);
    params.push(...kinds);
  }

  if (scope === 'project') {
    // Null-safe by accident of SQL: a null projectKey makes this false for every
    // project row, so it degrades to globals-only rather than to everything.
    clauses.push("(scope = 'global' OR project_key = ?)");
    params.push(projectKey);
  } else if (scope === 'project-only') {
    clauses.push("(scope = 'project' AND project_key = ?)");
    params.push(projectKey);
  } else if (scope === 'global') {
    clauses.push("scope = 'global'");
  } else if (scope !== 'all') {
    throw new ManageError(
      `Unknown scope '${scope}' — expected one of: project, project-only, global, all.`,
    );
  }

  if (pinned !== null && pinned !== undefined) clauses.push(`pinned = ${pinned ? 1 : 0}`);

  // Strength bounds are a WHERE clause over an expression, not over a column —
  // decay.mjs writes it. This is the filter that answers "what has gone stale",
  // and it is the same shape phase 5a.3's archiving rule takes, one threshold and
  // a couple of extra conjuncts. Having it here means the rule gets measured by
  // hand on a real store before anything automatic starts acting on it.
  if (minStrength !== null && minStrength !== undefined) {
    clauses.push(`${strengthSql({ now })} >= ${requireStrength(minStrength, 'min-strength')}`);
  }
  if (maxStrength !== null && maxStrength !== undefined) {
    clauses.push(`${strengthSql({ now })} <= ${requireStrength(maxStrength, 'max-strength')}`);
  }

  return { sql: clauses.length === 0 ? '1' : clauses.join(' AND '), params };
}

/**
 * Strength is a product of three values in [0, 1], so it cannot leave that range.
 * A bound outside it is a typo (`--min-strength 15` for 0.15) that would
 * otherwise silently match nothing or everything.
 */
function requireStrength(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new ManageError(`--${field} must be between 0 and 1, got ${JSON.stringify(value)}.`);
  }
  return String(n);
}

/**
 * List memories. Returns `{ rows, total }` — `total` is the number the filter
 * matched, so the caller can say "20 of 143" instead of implying it showed
 * everything.
 *
 * One SQL path for every sort since 5a.1, strength included. `now` is threaded
 * into both the filter and the ORDER BY so a query that bounds strength and
 * orders by it reads one clock, not two.
 */
export async function listMemories(
  conn,
  { sort = 'updated', limit = LIST_LIMIT, offset = 0, now = Date.now(), ...filter } = {},
) {
  if (!SORTS.includes(sort)) {
    throw new ManageError(`Unknown sort '${sort}' — expected one of: ${SORTS.join(', ')}.`);
  }
  const { sql, params } = buildFilter({ ...filter, now });

  const counted = await conn.get(`SELECT count(*) AS n FROM memories WHERE ${sql}`, ...params);
  const total = counted?.n ?? 0;

  const rows = await conn.all(
    `SELECT ${ROW_COLUMNS} FROM memories WHERE ${sql} ORDER BY ${ORDER_BY[sort](now)} LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );
  return { rows: rows.map((row) => decorate(row, now)), total };
}

/** Parse a memory_events row's detail back into an object. */
function readEvent(row) {
  let detail = null;
  if (row.detail !== null && row.detail !== undefined) {
    try {
      detail = JSON.parse(row.detail);
    } catch {
      detail = { raw: row.detail };
    }
  }
  return { ...row, detail };
}

export async function memoryEvents(conn, memoryId, limit = 10) {
  const rows = await conn.all(
    'SELECT id, event, detail, at FROM memory_events WHERE memory_id = ? ORDER BY at DESC, id DESC LIMIT ?',
    memoryId,
    limit,
  );
  return rows.map(readEvent);
}

/**
 * Everything known about one memory, audit log included. The events are the
 * point: "why does this say pnpm when I remember writing yarn" is answerable
 * only from the log, and PLAN makes reversibility non-negotiable.
 */
export async function showMemory(conn, ref, { events = 10, now = Date.now() } = {}) {
  const row = await resolveRef(conn, ref);
  return {
    memory: decorate(row, now),
    events: events > 0 ? await memoryEvents(conn, row.id, events) : [],
  };
}

/**
 * The last status this memory was archived *from*. Restoring a staged
 * auto-capture straight to 'active' would promote something nobody reviewed
 * into retrieval, which is precisely what staging exists to prevent.
 */
async function statusBeforeArchive(conn, memoryId) {
  const row = await conn.get(
    "SELECT detail FROM memory_events WHERE memory_id = ? AND event = ? ORDER BY at DESC, id DESC LIMIT 1",
    memoryId,
    EVENT_ARCHIVED,
  );
  const previous = row ? readEvent(row).detail?.previous?.status : null;
  return STATUSES.includes(previous) && previous !== 'archived' ? previous : 'active';
}

async function setStatus(conn, row, status, event, now, extra = {}) {
  // updated_at is deliberately untouched. An unused memory decays from it
  // (search.mjs), so bumping it here would make archiving-then-restoring look
  // like the memory had just been re-stated, resetting its decay clock.
  await conn.run('UPDATE memories SET status = ? WHERE id = ?', status, row.id);
  const eventId = await recordEvent(conn, {
    memoryId: row.id,
    event,
    at: now,
    detail: { ...extra, previous: { status: row.status } },
  });
  return { id: row.id, uid: row.uid, text: row.text, from: row.status, to: status, eventId };
}

/**
 * PLAN's pruning ladder, rungs 2 and 4.
 *
 * Default is rung 2 — `status='archived'`, out of retrieval, fully restorable,
 * the row and its history untouched. `--hard` is rung 4, "real deletion, only
 * ever explicit", and it takes the memory_events rows with it: leaving the text
 * behind in the audit log would make "purge" a lie, and someone hard-forgetting
 * a memory is usually removing something they do not want stored anywhere.
 *
 * `pinned` blocks both without `force`. PLAN exempts pinned memories from every
 * automatic action; a typo'd id is close enough to automatic.
 */
export async function forgetMemory(
  conn,
  ref,
  { hard = false, restore = false, force = false, now = Date.now(), reason = null } = {},
) {
  const row = await resolveRef(conn, ref);

  if (restore) {
    if (hard) throw new ManageError('--restore and --hard contradict each other.');
    if (row.status !== 'archived') {
      throw new ManageError(`#${row.id} is ${row.status}, not archived — nothing to restore.`);
    }
    const to = await statusBeforeArchive(conn, row.id);
    return { action: EVENT_RESTORED, ...(await setStatus(conn, row, to, EVENT_RESTORED, now)) };
  }

  if (row.pinned && !force) {
    throw new ManageError(
      `#${row.id} is pinned — unpin it first, or pass --force.`,
      'MEM_PINNED',
    );
  }

  if (hard) {
    const events = await conn.get(
      'SELECT count(*) AS n FROM memory_events WHERE memory_id = ?',
      row.id,
    );
    await conn.run('DELETE FROM memory_events WHERE memory_id = ?', row.id);
    await conn.run('DELETE FROM memory_links WHERE src = ? OR dst = ?', row.id, row.id);
    // And the consolidation verdicts about it (slice 5b.1). Not tidiness: SQLite
    // hands the next INSERT the highest rowid + 1, so purging the newest row means
    // some later memory gets this id — and a leftover `pair:<id>:<other>` entry
    // would suppress a judgement between two rows that never met.
    const verdicts = await dropVerdictsFor(conn, row.id);
    // And any proposal parked about it (5b.2), for the same id-reuse reason: a
    // pending review item naming a memory that no longer exists would either
    // vanish silently or, once the id came round again, describe two rows that
    // were never judged together.
    const proposals = await dropMetaFor(conn, row.id, PROPOSAL_PREFIX);
    // Any row that superseded this one now points at nothing; leave the pointer
    // dangling and the FK would fail on the next write.
    await conn.run('UPDATE memories SET superseded_by = NULL WHERE superseded_by = ?', row.id);
    await conn.run('DELETE FROM memories WHERE id = ?', row.id);

    // The purge record carries no text — see above. It exists so a store that
    // suddenly has fewer memories can still say when and how many.
    const eventId = await recordEvent(conn, {
      memoryId: null,
      event: EVENT_PURGED,
      at: now,
      detail: {
        id: row.id,
        uid: row.uid,
        status: row.status,
        events_deleted: events?.n ?? 0,
        pair_verdicts_deleted: verdicts,
        proposals_deleted: proposals,
        reason,
      },
    });
    return {
      action: EVENT_PURGED,
      id: row.id,
      uid: row.uid,
      text: row.text,
      from: row.status,
      to: null,
      eventsDeleted: events?.n ?? 0,
      verdictsDeleted: verdicts,
      proposalsDeleted: proposals,
      eventId,
    };
  }

  if (row.status === 'archived') {
    throw new ManageError(`#${row.id} is already archived.`);
  }
  return {
    action: EVENT_ARCHIVED,
    ...(await setStatus(conn, row, 'archived', EVENT_ARCHIVED, now, { reason })),
  };
}

/**
 * Pin or unpin. PLAN: pinned forces retention to 1.0 — never decays, never
 * pruned, exempt from every automatic action — so this is the one lever that
 * takes a memory out of the store's own hands.
 *
 * Idempotent, and says so: `changed: false` rather than a spurious event, so the
 * audit log records decisions and not repeated assertions of the status quo.
 */
export async function setPinned(conn, ref, pinned, { now = Date.now() } = {}) {
  const row = await resolveRef(conn, ref);
  const to = pinned ? 1 : 0;
  if (row.pinned === to) {
    return { id: row.id, uid: row.uid, text: row.text, pinned: to, changed: false, eventId: null };
  }

  // As with archiving: updated_at stays put, or unpinning would reset the decay
  // clock of a memory that has been sitting there untouched for months.
  await conn.run('UPDATE memories SET pinned = ? WHERE id = ?', to, row.id);
  const eventId = await recordEvent(conn, {
    memoryId: row.id,
    event: to ? EVENT_PINNED : EVENT_UNPINNED,
    at: now,
    detail: { previous: { pinned: row.pinned } },
  });
  return { id: row.id, uid: row.uid, text: row.text, pinned: to, changed: true, eventId };
}

/** Open the database if the caller has no connection, then run `fn`. */
function onConn(fn, { conn, paths, env }) {
  return conn ? fn(conn) : withDb(fn, { paths, env });
}

export async function list(opts = {}) {
  const { conn, paths, env, ...rest } = opts;
  return onConn((c) => listMemories(c, rest), { conn, paths, env });
}

export async function show(ref, opts = {}) {
  const { conn, paths, env, ...rest } = opts;
  return onConn((c) => showMemory(c, ref, rest), { conn, paths, env });
}

/**
 * Forget several memories in one transaction — either all of them go or none
 * do, so a half-applied batch never has to be reconstructed by hand.
 */
export async function forget(refs, opts = {}) {
  const { conn, paths, env, ...rest } = opts;
  const run = (c) =>
    c
      .transactionAsync(async (tx) => {
        const results = [];
        for (const ref of refs) results.push(await forgetMemory(tx, ref, rest));
        return results;
      })
      .immediate();
  return onConn(run, { conn, paths, env });
}

export async function pin(refs, pinned, opts = {}) {
  const { conn, paths, env, ...rest } = opts;
  const run = (c) =>
    c
      .transactionAsync(async (tx) => {
        const results = [];
        for (const ref of refs) results.push(await setPinned(tx, ref, pinned, rest));
        return results;
      })
      .immediate();
  return onConn(run, { conn, paths, env });
}
