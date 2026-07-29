// Export and import — PLAN countermeasure #7, "plain-text export to JSONL so the
// store is never a black box", and the backup half of "reversibility is
// non-negotiable".
//
// Format: one JSON object per line, no header, no wrapper. That is what makes
// `mem export | jq`, `grep`, `git diff` and hand-editing work, and a format you
// can fix with a text editor is worth more than one that round-trips a byte
// faster.
//
// Two decisions the format rests on:
//
// **The embedding is not exported.** It is 1.5 KB of float noise per row, it
// would dwarf the text it describes, and it is derivable — 11 ms of re-embedding
// on import. Leaving it out is also what makes an export survive a model change:
// the file has no emb_model stamp to be wrong about, and import re-embeds with
// whatever model is current. (Consequence, deliberate: importing rewrites every
// row's vector with today's model. That is a repair, not a loss.)
//
// **`superseded_by` travels as a uid, not an id.** ids are per-database
// autoincrements and mean nothing in another store; uid is the stable key. A
// pointer exported as an integer would silently point at an unrelated memory
// after a restore, which is the worst kind of corruption this file could cause.
//
// Round-trip identity is therefore between *files*: export → import → export
// gives byte-identical output. Fixed field order, ordering by (created_at, uid)
// rather than by id, and omitted nulls are all in service of that.

import { randomUUID } from 'node:crypto';

import { checkpoint, withDb } from './db.mjs';
import { EMB_DIM, EMB_MODEL, embedMany, vectorBlob } from './embed.mjs';
import { buildFilter } from './manage.mjs';
import { assertNoSecrets } from './scrub.mjs';
import {
  DEFAULT_CONFIDENCE,
  DEFAULT_KIND,
  DEFAULT_SALIENCE,
  KINDS,
  MAX_TEXT,
  MAX_WHY,
  SOURCE_KINDS,
  STATUSES,
  normaliseText,
  recordEvent,
  requireOneOf,
  requireTimestamp,
  requireUnitInterval,
} from './write.mjs';

/**
 * The exported fields, in the order they appear on every line. Fixed rather than
 * derived from the row, because a field order that depends on the driver's
 * column order is a byte-identity bug waiting for a schema migration.
 *
 * Absent by design: `id` (per-database), `emb` (derivable), `emb_model` /
 * `emb_dim` (a stamp for a vector that is not in the file), `superseded_by`
 * (exported as `superseded_uid`).
 */
export const EXPORT_FIELDS = [
  'uid',
  'kind',
  'scope',
  'project_key',
  'status',
  'pinned',
  'text',
  'why',
  'salience',
  'confidence',
  'source_kind',
  'source_session',
  'created_at',
  'updated_at',
  'last_injected_at',
  'injected_count',
  'last_used_at',
  'useful_count',
  'expires_at',
  'consolidated_at',
  'superseded_uid',
];

export const IMPORT_MODES = ['skip', 'update'];

/** transformers.js batches: PLAN measured 32 texts in 43ms vs 11ms each. */
export const EMBED_BATCH = 32;

/** SQLite's default parameter ceiling is 999; stay well inside it. */
const ID_CHUNK = 400;

export const EVENT_IMPORTED = 'imported';
export const EVENT_IMPORT_CREATED = 'created';
export const EVENT_IMPORT_UPDATED = 'updated';

export class TransferError extends Error {
  constructor(message, code = 'MEM_INVALID', invalid = []) {
    super(message);
    this.name = 'TransferError';
    this.code = code;
    this.invalid = invalid;
  }
}

/**
 * One row as one record. Nulls are omitted rather than written out: it halves
 * the line length of a typical memory and reads far better in a diff, and since
 * an absent field and a null field mean the same thing on import, the round trip
 * is unaffected.
 */
export function toRecord(row) {
  const record = {};
  for (const field of EXPORT_FIELDS) {
    const value = row[field];
    if (value !== null && value !== undefined) record[field] = value;
  }
  return record;
}

/** One record as one line. `toRecord` fixed the key order; stringify keeps it. */
export const serialiseRecord = (record) => JSON.stringify(record);

/** Records as a JSONL document, trailing newline included. */
export function serialise(records) {
  return records.map((r) => `${serialiseRecord(r)}\n`).join('');
}

/**
 * Parse a JSONL document into `{ record, line }` pairs. Blank lines are skipped;
 * anything else that is not a JSON object is an error naming its line number,
 * because a file that half-parses is how you end up with half a store.
 */
export function parse(text) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    if (trimmed === '') return;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch (err) {
      throw new TransferError(`Line ${index + 1} is not valid JSON: ${err.message}`, 'MEM_BAD_JSONL');
    }
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new TransferError(`Line ${index + 1} is not a JSON object.`, 'MEM_BAD_JSONL');
    }
    out.push({ record, line: index + 1 });
  });
  return out;
}

/** id → uid, for turning `superseded_by` pointers into stable keys. */
async function uidsById(conn, ids) {
  const map = new Map();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const rows = await conn.all(
      `SELECT id, uid FROM memories WHERE id IN (${chunk.map(() => '?').join(', ')})`,
      ...chunk,
    );
    for (const row of rows) map.set(row.id, row.uid);
  }
  return map;
}

const EXPORT_COLUMNS = `id, uid, kind, scope, project_key, text, why,
                        salience, confidence, pinned, status, superseded_by,
                        source_kind, source_session,
                        created_at, updated_at, last_injected_at, injected_count,
                        last_used_at, useful_count, expires_at, consolidated_at`;

/**
 * Every matching memory, as records, in a deterministic order.
 *
 * Ordered by (created_at, uid) and not by id: ids are assigned in import order,
 * so ordering by them would make the round trip depend on how the file happened
 * to be written. uid breaks the tie because two memories written in the same
 * millisecond are ordinary, and a tie broken arbitrarily is not deterministic.
 *
 * The default filter is *nothing* — archived rows, staged rows, other projects'
 * rows, all of it. A backup that quietly omits what retrieval would have hidden
 * is worse than no backup.
 */
export async function exportRecords(conn, filter = {}) {
  const { sql, params } = buildFilter(filter);
  const rows = await conn.all(
    `SELECT ${EXPORT_COLUMNS} FROM memories WHERE ${sql} ORDER BY created_at, uid`,
    ...params,
  );

  const targets = [...new Set(rows.map((r) => r.superseded_by).filter((id) => id != null))];
  const uids = targets.length > 0 ? await uidsById(conn, targets) : new Map();

  return rows.map((row) =>
    toRecord({ ...row, superseded_uid: row.superseded_by == null ? null : uids.get(row.superseded_by) ?? null }),
  );
}

/** Export as a JSONL string. Opens the database unless handed a `conn`. */
export async function exportJsonl({ conn, paths, env, ...filter } = {}) {
  const run = async (c) => {
    const records = await exportRecords(c, filter);
    return { text: serialise(records), count: records.length, records };
  };
  return conn ? run(conn) : withDb(run, { paths, env });
}

const nonNegativeInt = (value, field) => {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new TransferError(`${field} must be a non-negative whole number, got ${JSON.stringify(value)}.`);
  }
  return n;
};

const optionalTimestamp = (value, field) =>
  value === null || value === undefined ? null : requireTimestamp(value, field);

/**
 * Validate and fill in one record. Deliberately stricter than the export is
 * lossy: a hand-edited file is an expected input, so every default is stated
 * here rather than left to the schema, and every unstated field has one obvious
 * meaning.
 *
 * `status` accepts all four values, unlike the `add` path — an export contains
 * archived and superseded rows and restoring them as 'active' would resurrect
 * decisions that were already taken.
 */
export function normaliseRecord(record, { line = null, now = Date.now(), env = process.env } = {}) {
  const where = line === null ? '' : `Line ${line}: `;
  const fail = (message) => {
    throw new TransferError(`${where}${message}`);
  };

  const text = normaliseText(record.text);
  if (text === '') fail('a record needs non-empty text.');
  if (text.length > MAX_TEXT) fail(`text is ${text.length} characters, over the ${MAX_TEXT} cap.`);

  const why = normaliseText(record.why);
  if (why.length > MAX_WHY) fail(`why is ${why.length} characters, over the ${MAX_WHY} cap.`);

  const projectKey =
    typeof record.project_key === 'string' && record.project_key.trim() !== ''
      ? record.project_key.trim()
      : null;

  // A record with a project_key is a project memory and one without is global.
  // Inferring rather than defaulting means a hand-written file needs one field,
  // not two that have to agree.
  const scope = record.scope ?? (projectKey === null ? 'global' : 'project');
  if (scope === 'project' && projectKey === null) {
    fail("scope is 'project' but there is no project_key — a project memory needs one.");
  }
  if (scope !== 'global' && scope !== 'project') {
    fail(`unknown scope '${scope}' — expected 'global' or 'project'.`);
  }

  const uid = typeof record.uid === 'string' && record.uid.trim() !== '' ? record.uid.trim() : null;

  let normalised;
  try {
    normalised = {
      uid: uid ?? randomUUID(),
      generatedUid: uid === null,
      kind: requireOneOf(record.kind ?? DEFAULT_KIND, KINDS, 'kind'),
      scope,
      // The schema's retrieval clause depends on a global memory storing NULL.
      projectKey: scope === 'global' ? null : projectKey,
      text,
      why: why === '' ? null : why,
      salience:
        record.salience === undefined || record.salience === null
          ? DEFAULT_SALIENCE
          : requireUnitInterval(record.salience, 'salience'),
      confidence:
        record.confidence === undefined || record.confidence === null
          ? DEFAULT_CONFIDENCE
          : requireUnitInterval(record.confidence, 'confidence'),
      pinned: record.pinned ? 1 : 0,
      status: requireOneOf(record.status ?? 'active', STATUSES, 'status'),
      sourceKind: requireOneOf(record.source_kind ?? 'import', SOURCE_KINDS, 'source_kind'),
      sourceSession: record.source_session ?? null,
      createdAt: optionalTimestamp(record.created_at, 'created_at') ?? now,
      updatedAt: optionalTimestamp(record.updated_at, 'updated_at') ?? now,
      lastInjectedAt: optionalTimestamp(record.last_injected_at, 'last_injected_at'),
      injectedCount: nonNegativeInt(record.injected_count, 'injected_count'),
      lastUsedAt: optionalTimestamp(record.last_used_at, 'last_used_at'),
      usefulCount: nonNegativeInt(record.useful_count, 'useful_count'),
      expiresAt: optionalTimestamp(record.expires_at, 'expires_at'),
      consolidatedAt: optionalTimestamp(record.consolidated_at, 'consolidated_at'),
      supersededUid: record.superseded_uid ?? null,
      line,
    };
  } catch (err) {
    // requireOneOf and friends throw WriteError; re-label so the line number
    // survives, since "unknown kind 'preferences'" without one is unactionable
    // in a thousand-line file.
    throw err instanceof TransferError ? err : new TransferError(`${where}${err.message}`);
  }

  // Same guard as the write path, for the same reason: a credential must not
  // reach the store, and an import file is the easiest way to smuggle one in.
  assertNoSecrets({ text: normalised.text, why: normalised.why }, { env });

  return normalised;
}

const INSERT_SQL = `
  INSERT INTO memories (uid, kind, scope, project_key, text, why, emb,
                        emb_model, emb_dim,
                        salience, confidence, pinned, status,
                        source_kind, source_session,
                        created_at, updated_at, last_injected_at, injected_count,
                        last_used_at, useful_count, expires_at, consolidated_at)
  VALUES (?, ?, ?, ?, ?, ?, vector32(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const UPDATE_SQL = `
  UPDATE memories SET kind = ?, scope = ?, project_key = ?, text = ?, why = ?,
                      emb = vector32(?), emb_model = ?, emb_dim = ?,
                      salience = ?, confidence = ?, pinned = ?, status = ?,
                      source_kind = ?, source_session = ?,
                      created_at = ?, updated_at = ?,
                      last_injected_at = ?, injected_count = ?,
                      last_used_at = ?, useful_count = ?,
                      expires_at = ?, consolidated_at = ?
   WHERE uid = ?`;

/** The value list shared by insert and update, minus the embedding blob. */
function rowValues(r) {
  return [
    r.kind, r.scope, r.projectKey, r.text, r.why,
    EMB_MODEL, EMB_DIM,
    r.salience, r.confidence, r.pinned, r.status,
    r.sourceKind, r.sourceSession,
    r.createdAt, r.updatedAt, r.lastInjectedAt, r.injectedCount,
    r.lastUsedAt, r.usefulCount, r.expiresAt, r.consolidatedAt,
  ];
}

/** Embed in batches, since import is the one bulk write path there is. */
async function embedRecords(records, { paths, env }) {
  const vectors = [];
  for (let i = 0; i < records.length; i += EMBED_BATCH) {
    const batch = records.slice(i, i + EMBED_BATCH);
    vectors.push(...(await embedMany(batch.map((r) => r.text), { paths, env })));
  }
  return vectors;
}

/**
 * Import records into the store. `uid` is the key: a record whose uid is already
 * present is skipped (or updated, with `mode: 'update'`), never inserted twice.
 *
 * Explicitly *not* the write path's semantic dedup. `mem add` merges anything
 * within 0.93 cosine because a human restating a preference should not create a
 * second row; import must not, because a restore that quietly merges two
 * memories into one is a restore that lost data — and it would make round-trip
 * identity impossible to state, let alone test.
 *
 * The whole import is one transaction. A file that fails halfway leaves the
 * store exactly as it was, rather than in a state nobody can describe.
 */
export async function importRecords(
  conn,
  parsed,
  { now = Date.now(), mode = 'skip', skipInvalid = false, dryRun = false, source = null, paths, env = process.env } = {},
) {
  requireOneOf(mode, IMPORT_MODES, 'import mode');

  const invalid = [];
  const records = [];
  for (const { record, line } of parsed) {
    try {
      records.push(normaliseRecord(record, { line, now, env }));
    } catch (err) {
      invalid.push({ line, uid: record?.uid ?? null, message: err.message });
    }
  }

  if (invalid.length > 0 && !skipInvalid) {
    throw new TransferError(
      `${invalid.length} of ${parsed.length} records are invalid:\n` +
        invalid.map((i) => `  ${i.message}`).join('\n') +
        '\nFix them, or pass --skip-invalid to import the rest.',
      'MEM_INVALID',
      invalid,
    );
  }

  // Duplicate uids *within* the file would insert twice in the same run, since
  // the existence check happens before any of them lands.
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.uid)) {
      throw new TransferError(
        `Line ${record.line}: uid ${record.uid} appears more than once in this file.`,
        'MEM_DUPLICATE_UID',
      );
    }
    seen.add(record.uid);
  }

  const existing = new Set(
    (await conn.all('SELECT uid FROM memories')).map((r) => r.uid),
  );

  const toInsert = records.filter((r) => !existing.has(r.uid));
  const toUpdate = mode === 'update' ? records.filter((r) => existing.has(r.uid)) : [];
  const skipped = records.length - toInsert.length - toUpdate.length;

  const result = {
    total: parsed.length,
    inserted: 0,
    updated: 0,
    skipped,
    invalid,
    generatedUids: records.filter((r) => r.generatedUid).length,
    linked: 0,
    unresolved: [],
    dryRun,
    mode,
  };

  // A dry run never loads the model: validating a file must work offline, which
  // is most of what makes it useful before a restore.
  if (dryRun) {
    result.inserted = toInsert.length;
    result.updated = toUpdate.length;
    return result;
  }

  const writes = [...toInsert, ...toUpdate];
  if (writes.length === 0) return result;

  // Outside the transaction: embedding is ~11ms a row and holding a write lock
  // across it is how a bulk import blocks every other process for a minute.
  const vectors = await embedRecords(writes, { paths, env });
  const vectorFor = new Map(writes.map((r, i) => [r.uid, vectors[i]]));

  const apply = conn.transactionAsync(async (tx) => {
    for (const record of toInsert) {
      const info = await tx.run(
        INSERT_SQL,
        record.uid,
        record.kind,
        record.scope,
        record.projectKey,
        record.text,
        record.why,
        vectorBlob(vectorFor.get(record.uid)),
        ...rowValues(record).slice(5),
      );
      await recordEvent(tx, {
        memoryId: info.lastInsertRowid,
        event: EVENT_IMPORT_CREATED,
        at: now,
        detail: { uid: record.uid, via: 'import', source, line: record.line },
      });
      result.inserted += 1;
    }

    for (const record of toUpdate) {
      const before = await tx.get(
        'SELECT id, text, why, status, pinned, salience, confidence, updated_at FROM memories WHERE uid = ?',
        record.uid,
      );
      const values = rowValues(record);
      await tx.run(
        UPDATE_SQL,
        values[0],
        values[1],
        values[2],
        values[3],
        values[4],
        vectorBlob(vectorFor.get(record.uid)),
        ...values.slice(5),
        record.uid,
      );
      await recordEvent(tx, {
        memoryId: before.id,
        event: EVENT_IMPORT_UPDATED,
        at: now,
        // Enough prior state to put the row back by hand: everything the update
        // overwrote that was not derivable from the file.
        detail: { via: 'import', source, line: record.line, previous: before },
      });
      result.updated += 1;
    }

    // Second pass: ids exist only now, and a memory may be superseded by one
    // further down the same file.
    for (const record of writes) {
      if (!record.supersededUid) continue;
      const target = await tx.get('SELECT id FROM memories WHERE uid = ?', record.supersededUid);
      if (!target) {
        result.unresolved.push({ uid: record.uid, superseded_uid: record.supersededUid });
        continue;
      }
      await tx.run('UPDATE memories SET superseded_by = ? WHERE uid = ?', target.id, record.uid);
      result.linked += 1;
    }

    await recordEvent(tx, {
      memoryId: null,
      event: EVENT_IMPORTED,
      at: now,
      detail: {
        source,
        mode,
        total: result.total,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        invalid: invalid.length,
      },
    });
  });
  await apply.immediate();

  // PLAN measured a 21s stall querying in the same process right after a bulk
  // insert transaction; folding the WAL back in is the fix.
  await checkpoint(conn).catch(() => {});

  return result;
}

/** Parse and import a JSONL document. Opens the database unless handed a `conn`. */
export async function importJsonl(text, { conn, paths, env = process.env, ...opts } = {}) {
  const parsed = parse(text);
  const run = (c) => importRecords(c, parsed, { ...opts, paths, env });
  return conn ? run(conn) : withDb(run, { paths, env });
}
