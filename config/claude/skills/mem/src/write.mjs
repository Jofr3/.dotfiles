// The write path — the only way a memory enters the store.
//
// Order matters and is deliberate: validate, then scrub, then resolve scope,
// then embed. Validation and scrubbing are microseconds and the embedding is
// ~11ms plus a possible model load, so a rejected write costs nothing — and,
// more importantly, a credential never reaches a vector either, only the error.
//
// PLAN countermeasure #3 is the interesting part: "near-duplicates update, they
// don't accumulate". Every add looks for its own nearest neighbour inside its
// own scope first; at cosine >= 0.93 it merges into that row instead of
// inserting. Without this, saying "use pnpm" three times over a month puts three
// near-identical rows into a five-item retrieval budget and crowds out
// everything else.
//
// Every mutation writes a memory_events row carrying the prior values of the
// fields it changed, because PLAN's reversibility section says undo must not
// depend on a backup existing. The one thing the event does *not* carry is the
// old embedding blob — it carries the old text, and re-embedding it costs 11ms.
//
// Timestamps in this file (created_at, updated_at, expires_at) are epoch
// MILLISECONDS, i.e. plain Date.now(). Nothing in the schema says which, so it
// is fixed here and everything downstream must agree.

import { randomUUID } from 'node:crypto';

import { withDb } from './db.mjs';
import { EMB_DIM, EMB_MODEL, embed, vectorBlob } from './embed.mjs';
import { resolveScope } from './scope.mjs';
import { assertNoSecrets } from './scrub.mjs';

export const KINDS = ['preference', 'decision', 'constraint', 'fact', 'correction', 'reference'];

/** Every status the schema allows. Import and the pruning ladder use the lot. */
export const STATUSES = ['staged', 'active', 'archived', 'superseded'];

/**
 * Statuses `add` may produce. 'archived' and 'superseded' are outcomes of the
 * pruning ladder and of consolidation, never of a write — reaching them from
 * here would let a fresh add silently look like the result of a decision that
 * was never taken.
 */
export const WRITABLE_STATUSES = ['staged', 'active'];

export const SOURCE_KINDS = ['user', 'auto', 'import'];

/**
 * PLAN phase 1: "cosine >= 0.93 in same scope -> update + bump confidence".
 *
 * Like search.mjs's VECTOR_THRESHOLD, this number is the *embedding model's*
 * geometry and not a preference — it just happens to have survived the slice 1.6
 * swap unchanged, so it reads as if it were a constant of nature. It is not.
 *
 * Re-measured under gte-small (build/embed-bench.mjs reports it every run):
 * 0.93 catches 6 of 12 hand-written restatements, against 1 of 12 under
 * all-MiniLM, while still clearing the closest pair of genuinely distinct
 * memories in the 200-row seed corpus at 0.915. It got better at its job for
 * free — but the headroom is 0.015, so the next model change has to re-measure
 * rather than assume, or `mem add` starts rejecting unrelated facts as
 * duplicates.
 */
export const DEDUP_THRESHOLD = 0.93;

/**
 * How hard a repeat confirmation moves confidence, as a fraction of the gap to
 * 1. Saturating rather than additive: 0.5 -> 0.63 -> 0.72 -> 0.79, approaching
 * but never reaching certainty, so a memory repeated ten times outranks one
 * repeated twice without ever becoming unfalsifiable.
 */
export const CONFIDENCE_BUMP = 0.25;

export const DEFAULT_KIND = 'fact';
export const DEFAULT_SALIENCE = 0.5;
export const DEFAULT_CONFIDENCE = 0.5;

/**
 * A memory is ONE fact. These caps are a forcing function, not a storage limit:
 * the retrieval budget is ~600 tokens for five items, so anything past a
 * paragraph cannot be injected without evicting everything else.
 */
export const MAX_TEXT = 1000;
export const MAX_WHY = 2000;

export const EVENT_CREATED = 'created';
export const EVENT_MERGED = 'merged';

export class WriteError extends Error {
  constructor(message, code = 'MEM_INVALID') {
    super(message);
    this.name = 'WriteError';
    this.code = code;
  }
}

/**
 * One fact on one line. Collapsing whitespace is what makes "the longer text
 * wins" an honest comparison and stops re-indented copies of the same sentence
 * from reading as different lengths.
 */
export function normaliseText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

// Exported because the import path validates the same fields against the same
// rules and must fail with the same error type — two copies of "what a valid
// salience is" would drift, and the copy that drifts loosest wins.
export function requireOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new WriteError(`Unknown ${field} '${value}' — expected one of: ${allowed.join(', ')}.`);
  }
  return value;
}

export function requireUnitInterval(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new WriteError(`${field} must be a number between 0 and 1, got ${JSON.stringify(value)}.`);
  }
  return n;
}

export function requireTimestamp(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new WriteError(`${field} must be an epoch-millisecond integer, got ${JSON.stringify(value)}.`);
  }
  return n;
}

/**
 * Check and normalise the caller's input without touching the model, the
 * database or git. Records which optional fields were given explicitly:
 * on a merge that is the difference between "the caller wants salience 0.9" and
 * "the caller said nothing and got the default", and only the former may
 * overwrite what is already stored.
 */
export function normaliseInput(input = {}) {
  const text = normaliseText(input.text);
  if (text === '') throw new WriteError('Refusing to store an empty memory — text is required.');
  if (text.length > MAX_TEXT) {
    throw new WriteError(
      `Memory text is ${text.length} characters, over the ${MAX_TEXT} cap. ` +
        'Split it into separate facts, or move the detail into --why.',
    );
  }

  const why = normaliseText(input.why);
  if (why.length > MAX_WHY) {
    throw new WriteError(`--why is ${why.length} characters, over the ${MAX_WHY} cap.`);
  }

  const explicit = {
    salience: input.salience !== undefined && input.salience !== null,
    confidence: input.confidence !== undefined && input.confidence !== null,
  };

  return {
    text,
    why: why === '' ? null : why,
    kind: requireOneOf(input.kind ?? DEFAULT_KIND, KINDS, 'kind'),
    status: requireOneOf(input.status ?? 'active', WRITABLE_STATUSES, 'status'),
    sourceKind: requireOneOf(input.sourceKind ?? 'user', SOURCE_KINDS, 'source'),
    sourceSession: input.sourceSession ?? null,
    salience: explicit.salience ? requireUnitInterval(input.salience, 'salience') : DEFAULT_SALIENCE,
    confidence: explicit.confidence
      ? requireUnitInterval(input.confidence, 'confidence')
      : DEFAULT_CONFIDENCE,
    pinned: input.pinned ? 1 : 0,
    expiresAt: input.expiresAt == null ? null : requireTimestamp(input.expiresAt, 'expires_at'),
    uid: input.uid ?? null,
    explicit,
  };
}

/**
 * The nearest stored memory to `vector` within one scope, as a similarity in
 * [-1, 1] (Turso's vector_distance_cos is 1 - cosine).
 *
 * Three filters carry weight:
 *   - `project_key IS ?` is null-safe equality, so a global write compares only
 *     against globals. This is *narrower* than retrieval's `scope = 'global' OR
 *     project_key = ?` union on purpose: merging a project fact into a global
 *     one would silently widen its blast radius to every other repo.
 *   - same emb_model/emb_dim, because a distance between two different vector
 *     spaces is a number with no meaning, and the schema stores the stamp per
 *     row precisely so this stays checkable.
 *   - emb IS NOT NULL, so a phase-5 tombstone cannot sort first (NULL sorts
 *     ahead of every real distance in ASC order).
 */
export async function nearestInScope(
  conn,
  vector,
  { scope, projectKey = null, statuses = ['active'], embModel = EMB_MODEL, embDim = EMB_DIM } = {},
) {
  if (statuses.length === 0) return null;
  const placeholders = statuses.map(() => '?').join(', ');

  const row = await conn.get(
    `SELECT id, uid, text, why, kind, status, salience, confidence, pinned,
            created_at, updated_at,
            vector_distance_cos(emb, vector32(?)) AS dist
       FROM memories
      WHERE status IN (${placeholders})
        AND scope = ?
        AND project_key IS ?
        AND emb_model = ?
        AND emb_dim = ?
        AND emb IS NOT NULL
      ORDER BY dist
      LIMIT 1`,
    vectorBlob(vector),
    ...statuses,
    scope,
    projectKey,
    embModel,
    embDim,
  );

  return row ? { ...row, similarity: 1 - row.dist } : null;
}

/** Append to the audit log. Returns the new event id. */
export async function recordEvent(conn, { memoryId, event, detail = null, at = Date.now() }) {
  const info = await conn.run(
    'INSERT INTO memory_events (memory_id, event, detail, at) VALUES (?, ?, ?, ?)',
    memoryId,
    event,
    detail === null ? null : JSON.stringify(detail),
    at,
  );
  return info.lastInsertRowid;
}

/**
 * Decide what a merge changes. Kept pure so the policy is testable without a
 * database, and so the same list drives the UPDATE, the event detail and what
 * the CLI prints.
 *
 * Longest-wins on text and why: the two phrasings are already near-identical by
 * construction (>= 0.93), so the longer one is the more specific one, and
 * discarding specificity is the failure that cannot be undone from the row
 * alone. Salience and confidence never go down — a repeat is evidence for a
 * fact, never against it — and pinned is sticky, so re-adding a pinned memory
 * cannot quietly unpin it.
 */
export function mergePlan(existing, incoming) {
  const changes = [];
  const change = (field, from, to) => {
    if (from !== to) changes.push({ field, from, to });
  };

  if (incoming.text.length > existing.text.length) change('text', existing.text, incoming.text);
  if (incoming.why && (!existing.why || incoming.why.length > existing.why.length)) {
    change('why', existing.why ?? null, incoming.why);
  }

  const salienceFloor = incoming.explicit?.salience
    ? Math.max(existing.salience, incoming.salience)
    : existing.salience;
  change('salience', existing.salience, salienceFloor);

  const confidenceBase = incoming.explicit?.confidence
    ? Math.max(existing.confidence, incoming.confidence)
    : existing.confidence;
  change('confidence', existing.confidence, bumpConfidence(confidenceBase));

  change('pinned', existing.pinned, existing.pinned === 1 || incoming.pinned === 1 ? 1 : 0);

  return changes;
}

/** Saturating move toward 1. Exported so `mem stats` and tests share one curve. */
export function bumpConfidence(confidence, factor = CONFIDENCE_BUMP) {
  return Math.min(1, confidence + (1 - confidence) * factor);
}

/**
 * Validate, scrub, scope and embed — everything before the database is touched.
 * Split out from the commit so the expensive half runs outside the write
 * transaction and so callers that batch (import, seeding) can reuse it.
 */
export async function prepareMemory(input, { paths, env = process.env, cwd } = {}) {
  const prepared = normaliseInput(input);

  // Before embedding, on purpose: a rejected write must not have cost a model
  // load, and the secret must not exist as a vector anywhere either.
  assertNoSecrets({ text: prepared.text, why: prepared.why }, { env });

  const scope = resolveScope({ scope: input.scope ?? 'project', cwd, env });
  const vector = await embed(prepared.text, { paths, env });

  return {
    ...prepared,
    scope: scope.scope,
    projectKey: scope.projectKey,
    scopeSource: scope.source,
    vector,
    embModel: EMB_MODEL,
    embDim: EMB_DIM,
  };
}

const INSERT_MEMORY = `
  INSERT INTO memories (uid, kind, scope, project_key, text, why,
                        emb, emb_model, emb_dim,
                        salience, confidence, pinned, status,
                        source_kind, source_session,
                        created_at, updated_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, vector32(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

async function insertMemory(conn, prepared, now) {
  const uid = prepared.uid ?? randomUUID();
  let info;
  try {
    info = await conn.run(
      INSERT_MEMORY,
      uid,
      prepared.kind,
      prepared.scope,
      prepared.projectKey,
      prepared.text,
      prepared.why,
      vectorBlob(prepared.vector),
      prepared.embModel,
      prepared.embDim,
      prepared.salience,
      prepared.confidence,
      prepared.pinned,
      prepared.status,
      prepared.sourceKind,
      prepared.sourceSession,
      now,
      now,
      prepared.expiresAt,
    );
  } catch (err) {
    if (/UNIQUE/i.test(err.message)) {
      throw new WriteError(`A memory with uid ${uid} already exists.`, 'MEM_DUPLICATE_UID');
    }
    throw err;
  }
  return { id: info.lastInsertRowid, uid };
}

async function applyMerge(conn, existing, changes, prepared, now) {
  const assignments = changes.map((c) => `${c.field} = ?`);
  const params = changes.map((c) => c.to);

  // The embedding travels with the text: keeping the old vector next to new
  // wording would make the row unfindable by the phrasing it now stores.
  if (changes.some((c) => c.field === 'text')) {
    assignments.push('emb = vector32(?)');
    params.push(vectorBlob(prepared.vector));
  }

  assignments.push('updated_at = ?');
  params.push(now);

  await conn.run(`UPDATE memories SET ${assignments.join(', ')} WHERE id = ?`, ...params, existing.id);
}

/**
 * The transactional half. Dedup lookup and write share one immediate
 * transaction, so two `mem add`s racing on the same fact cannot both decide
 * they are the first.
 */
export async function commitMemory(
  conn,
  prepared,
  { now = Date.now(), dedup = true, threshold = DEDUP_THRESHOLD, dedupStatuses } = {},
) {
  // Same-status by default. A staged auto-capture must not silently bump the
  // confidence of a memory a human already reviewed and activated; it lands in
  // the review queue as its own row, where a person can see it. Repeat captures
  // of the same thing still collapse into each other, which is what keeps the
  // queue readable.
  const statuses = dedupStatuses ?? [prepared.status];

  const work = conn.transactionAsync(async (tx) => {
    const nearest = dedup
      ? await nearestInScope(tx, prepared.vector, {
          scope: prepared.scope,
          projectKey: prepared.projectKey,
          statuses,
          embModel: prepared.embModel,
          embDim: prepared.embDim,
        })
      : null;

    if (nearest && nearest.similarity >= threshold) {
      const changes = mergePlan(nearest, prepared);
      await applyMerge(tx, nearest, changes, prepared, now);

      const eventId = await recordEvent(tx, {
        memoryId: nearest.id,
        event: EVENT_MERGED,
        at: now,
        detail: {
          threshold,
          similarity: nearest.similarity,
          // Enough to invert: every changed field's prior value, plus the
          // updated_at the row is losing. The old embedding is recoverable by
          // re-embedding changes[text].from.
          changes,
          previous: { updated_at: nearest.updated_at },
          incoming: {
            text: prepared.text,
            why: prepared.why,
            kind: prepared.kind,
            source_kind: prepared.sourceKind,
            source_session: prepared.sourceSession,
          },
        },
      });

      const after = await tx.get('SELECT * FROM memories WHERE id = ?', nearest.id);
      return { action: EVENT_MERGED, row: after, changes, similarity: nearest.similarity, nearest, eventId };
    }

    const { id, uid } = await insertMemory(tx, prepared, now);
    const eventId = await recordEvent(tx, {
      memoryId: id,
      event: EVENT_CREATED,
      at: now,
      detail: {
        uid,
        kind: prepared.kind,
        scope: prepared.scope,
        project_key: prepared.projectKey,
        scope_source: prepared.scopeSource,
        status: prepared.status,
        source_kind: prepared.sourceKind,
        source_session: prepared.sourceSession,
        threshold,
        // Why this was *not* a merge: the runner-up and how close it came. When
        // duplicates start slipping through, this is the evidence for retuning.
        nearest: nearest ? { id: nearest.id, similarity: nearest.similarity } : null,
      },
    });

    const row = await tx.get('SELECT * FROM memories WHERE id = ?', id);
    return { action: EVENT_CREATED, row, changes: [], similarity: nearest?.similarity ?? null, nearest, eventId };
  });

  return work.immediate();
}

/**
 * Add one memory. Opens the database itself unless handed a `conn`.
 *
 * Returns { action: 'created' | 'merged', row, changes, similarity, nearest,
 * eventId, scopeSource } — `scopeSource` says which rule chose the project key,
 * so the CLI can show *why* a memory landed where it did instead of leaving a
 * mis-scope to be discovered weeks later.
 */
export async function addMemory(input, { conn, paths, env = process.env, cwd, ...opts } = {}) {
  const prepared = await prepareMemory(input, { paths, env, cwd });
  const commit = (c) => commitMemory(c, prepared, opts);

  const result = conn ? await commit(conn) : await withDb(commit, { paths, env });
  return { ...result, scopeSource: prepared.scopeSource };
}
