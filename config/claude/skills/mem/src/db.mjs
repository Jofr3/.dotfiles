// Database access and schema migrations.
//
// The schema is plain SQLite (PLAN risk register: portable to libSQL or
// better-sqlite3 if the Turso rewrite disappoints), so nothing here may depend
// on Turso-specific DDL. Version is tracked in the `meta` table rather than
// PRAGMA user_version, because meta is where the other cross-cutting facts
// live (emb_model) and it survives export/import as ordinary rows.

import { existsSync } from 'node:fs';

import { depsReady, loadTurso } from './deps.mjs';
import { EMB_DIM, EMB_MODEL, vectorBlob } from './embed.mjs';
import { ensureDataDir, resolvePaths } from './paths.mjs';

/**
 * Every column of `memories`, in schema order. Named once because migration v2
 * rebuilds the table and a copy that silently omits a column would lose data
 * without failing.
 */
export const MEMORY_COLUMNS = [
  'id', 'uid', 'kind', 'scope', 'project_key', 'text', 'why',
  'emb', 'emb_model', 'emb_dim',
  'salience', 'confidence', 'pinned', 'status', 'superseded_by',
  'source_kind', 'source_session',
  'created_at', 'updated_at', 'last_injected_at', 'injected_count',
  'last_used_at', 'useful_count', 'expires_at', 'consolidated_at',
];

// Everything except the self-referencing FK. The v2 copy inserts these first and
// fills superseded_by afterwards — see the migration's comment.
const COPY_COLUMNS = MEMORY_COLUMNS.filter((c) => c !== 'superseded_by').join(', ');

/**
 * Ordered migrations. Append, never edit: a released version has already run
 * on real databases. Each entry is a list of single statements so a failure
 * names the statement that broke.
 */
export const MIGRATIONS = [
  {
    version: 1,
    name: 'schema-v1',
    statements: [
      `CREATE TABLE memories (
         id             INTEGER PRIMARY KEY,
         uid            TEXT UNIQUE,          -- stable id, survives export/import
         kind           TEXT NOT NULL,        -- preference|decision|constraint|fact|correction|reference
         scope          TEXT NOT NULL,        -- global | project
         project_key    TEXT,                 -- normalised git remote, else abs path; NULL when global
         text           TEXT NOT NULL,        -- ONE fact, self-contained, imperative
         why            TEXT,                 -- rationale / where it came from
         emb            BLOB NOT NULL,        -- vector32
         emb_model      TEXT NOT NULL,        -- 'Xenova/gte-small@q8'; mem reembed rewrites stale ones
         emb_dim        INTEGER NOT NULL,
         salience       REAL NOT NULL DEFAULT 0.5,
         confidence     REAL NOT NULL DEFAULT 0.5,
         pinned         INTEGER NOT NULL DEFAULT 0,
         status         TEXT NOT NULL DEFAULT 'active',  -- staged|active|archived|superseded
         superseded_by  INTEGER REFERENCES memories(id),
         source_kind    TEXT,                 -- user|auto|import
         source_session TEXT,
         created_at     INTEGER, updated_at INTEGER,
         last_injected_at INTEGER, injected_count INTEGER NOT NULL DEFAULT 0,
         last_used_at     INTEGER, useful_count   INTEGER NOT NULL DEFAULT 0,
         expires_at     INTEGER,
         consolidated_at INTEGER              -- watermark; skip unchanged pairs on re-run
       )`,
      // The one index that matters: retrieval cost tracks *active* rows, not
      // stored ones, because this prunes before any distance is computed.
      `CREATE INDEX memories_lookup ON memories(status, scope, project_key)`,
      `CREATE TABLE memory_links  (src INTEGER, dst INTEGER, rel TEXT, PRIMARY KEY(src,dst,rel))`,
      `CREATE TABLE memory_events (id INTEGER PRIMARY KEY, memory_id INTEGER, event TEXT,
                                   detail TEXT, at INTEGER)`,
      `CREATE TABLE meta          (k TEXT PRIMARY KEY, v TEXT)`,
    ],
  },
  {
    version: 2,
    name: 'emb-nullable',
    // The debt PLAN's schema section records against this slice: v1 shipped
    // `emb BLOB NOT NULL`, and the pruning ladder's rung 3 tombstones a row by
    // setting `emb = NULL`, which that constraint makes impossible. Slices 1.3,
    // 1.4, 1.5 and 1.6 each tripped over it; reembed.mjs has carried an
    // untestable `emb IS NULL` guard since 1.6 waiting for this.
    //
    // SQLite cannot drop a column constraint, so the table is rebuilt. The order
    // below is not the textbook twelve steps and each deviation was forced by
    // this build, measured rather than assumed:
    //
    //   `PRAGMA defer_foreign_keys` does NOT take effect here, so the copy
    //   cannot carry superseded_by in one pass — a row superseded by a *higher*
    //   id fails the FK the moment it is inserted. So the copy leaves that
    //   column NULL and a second UPDATE fills it once every id exists.
    //
    //   `DROP TABLE` performs an implicit DELETE with foreign keys enabled, and
    //   memories references itself, so dropping a table whose rows still point
    //   at each other fails too. Clearing the old table's pointers first is
    //   safe: their values are already in the new table.
    //
    //   `ALTER TABLE … RENAME` rewrites the new table's own FK clause to name
    //   `memories`, so the self-reference survives (asserted in db.test.mjs).
    //   The index goes with the dropped table and is recreated by hand.
    //
    // Everything runs inside the runner's transaction, so an interruption leaves
    // the database at v1 with its data intact rather than half-rebuilt.
    statements: [
      `CREATE TABLE memories_v2 (
         id             INTEGER PRIMARY KEY,
         uid            TEXT UNIQUE,
         kind           TEXT NOT NULL,
         scope          TEXT NOT NULL,
         project_key    TEXT,
         text           TEXT NOT NULL,
         why            TEXT,
         emb            BLOB,                 -- NULL only for tombstoned rows (ladder rung 3)
         emb_model      TEXT NOT NULL,
         emb_dim        INTEGER NOT NULL,
         salience       REAL NOT NULL DEFAULT 0.5,
         confidence     REAL NOT NULL DEFAULT 0.5,
         pinned         INTEGER NOT NULL DEFAULT 0,
         status         TEXT NOT NULL DEFAULT 'active',
         superseded_by  INTEGER REFERENCES memories_v2(id),
         source_kind    TEXT,
         source_session TEXT,
         created_at     INTEGER, updated_at INTEGER,
         last_injected_at INTEGER, injected_count INTEGER NOT NULL DEFAULT 0,
         last_used_at     INTEGER, useful_count   INTEGER NOT NULL DEFAULT 0,
         expires_at     INTEGER,
         consolidated_at INTEGER
       )`,
      `INSERT INTO memories_v2 (${COPY_COLUMNS}) SELECT ${COPY_COLUMNS} FROM memories`,
      `UPDATE memories_v2
          SET superseded_by = (SELECT m.superseded_by FROM memories m WHERE m.id = memories_v2.id)`,
      `UPDATE memories SET superseded_by = NULL`,
      `DROP TABLE memories`,
      `ALTER TABLE memories_v2 RENAME TO memories`,
      `CREATE INDEX memories_lookup ON memories(status, scope, project_key)`,
    ],
  },
];

/** The version a freshly migrated database ends up at. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

const UPSERT_META =
  'INSERT INTO meta(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v';

async function tableExists(conn, name) {
  const row = await conn.get(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
    name,
  );
  return row !== undefined && row !== null;
}

/**
 * Current schema version. 0 means "nothing has been created yet" — detected by
 * the absence of `meta` rather than by the file's absence, so an empty file
 * left behind by a crashed first run still migrates cleanly.
 */
export async function readSchemaVersion(conn) {
  if (!(await tableExists(conn, 'meta'))) return 0;

  const row = await conn.get("SELECT v FROM meta WHERE k = 'schema_version'");
  if (!row) {
    throw new Error(
      'Database has a meta table but no schema_version row — refusing to migrate over it.',
    );
  }

  const version = Number(row.v);
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Unreadable schema_version in meta: ${JSON.stringify(row.v)}`);
  }
  return version;
}

/** Migrations that would run against a database at `current`. */
export function pendingMigrations(current) {
  return MIGRATIONS.filter((m) => m.version > current);
}

/**
 * Bring `conn` up to SCHEMA_VERSION. Each migration commits atomically together
 * with its own version bump, so an interrupted run leaves the database at a
 * real version and never half-applied. Idempotent: a database already at
 * SCHEMA_VERSION does no writes at all.
 */
export async function migrate(conn) {
  const from = await readSchemaVersion(conn);

  if (from > SCHEMA_VERSION) {
    throw new Error(
      `Database is at schema v${from} but this mem only knows v${SCHEMA_VERSION}. Upgrade the plugin.`,
    );
  }

  const pending = pendingMigrations(from);
  for (const migration of pending) {
    const apply = conn.transactionAsync(async (tx) => {
      for (const sql of migration.statements) {
        try {
          await tx.exec(sql);
        } catch (err) {
          throw new Error(
            `Migration v${migration.version} (${migration.name}) failed on:\n${sql}\n${err.message}`,
          );
        }
      }
      await tx.run(UPSERT_META, 'schema_version', String(migration.version));
    });
    await apply.immediate();
  }

  return { from, to: SCHEMA_VERSION, applied: pending.map((m) => m.version) };
}

/**
 * Open the database. Writable opens create the data directory, install the
 * pinned deps if needed, and migrate; pass `readonly` for an inspect-only
 * handle that creates nothing (what `doctor` uses).
 */
export async function openDb({
  paths = resolvePaths(),
  env = process.env,
  readonly = false,
  runMigrations = true,
  timeout = 5000,
} = {}) {
  const { connect } = await loadTurso({ paths, env });

  if (!readonly) ensureDataDir(paths);

  const conn = await connect(
    paths.dbPath,
    readonly ? { readonly: true, fileMustExist: true, timeout } : { timeout },
  );
  await conn.exec('PRAGMA foreign_keys = ON');

  if (!readonly && runMigrations) await migrate(conn);
  return conn;
}

/** Open, run `fn`, close — even when `fn` throws. */
export async function withDb(fn, opts) {
  const conn = await openDb(opts);
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

/**
 * Fold the WAL back into the main file. PLAN measured a 21s stall querying in
 * the same process straight after a 20k-row insert transaction; checkpointing
 * after bulk writes is the fix.
 */
export async function checkpoint(conn) {
  const [row] = await conn.pragma('wal_checkpoint(TRUNCATE)', {});
  return row ?? null;
}

/**
 * The scoped nearest-neighbour scan — PLAN retrieval steps 1 and 2 — run on its
 * own so `doctor` can time the real query shape (and prove vector32 /
 * vector_distance_cos are present in the installed Turso) before search.mjs
 * exists. Passing `projectKey = null` scopes it to globals only.
 *
 * Carries the same two guards as search.mjs's vectorLeg, added in slice 5a.3
 * when the audit of every vector query found this one — the oldest — without
 * them. `emb IS NOT NULL` is not the mis-ranking hazard PLAN predicted in this
 * Turso build: `vector_distance_cos(NULL, v)` *throws* ("Conversion error:
 * Invalid vector type") and takes the whole statement with it, so one tombstone
 * would have made `mem doctor`'s cold-path timing report a failed probe rather
 * than a slightly wrong neighbour. Louder, but only where someone is looking.
 */
export async function vectorProbe(
  conn,
  vector,
  { projectKey = null, limit = 20, embModel = EMB_MODEL, embDim = EMB_DIM } = {},
) {
  return conn.all(
    `SELECT id, uid, vector_distance_cos(emb, vector32(?)) AS dist
       FROM memories
      WHERE status = 'active' AND (scope = 'global' OR project_key = ?)
        AND emb IS NOT NULL AND emb_model = ? AND emb_dim = ?
      ORDER BY dist
      LIMIT ?`,
    vectorBlob(vector),
    projectKey,
    embModel,
    embDim,
    limit,
  );
}

/**
 * Read-only description of the database for `doctor`. Never creates the file,
 * never installs dependencies, never throws — an unreadable database is a
 * report, not a crash.
 */
export async function dbStatus(paths = resolvePaths(), env = process.env) {
  const report = {
    path: paths.dbPath,
    exists: existsSync(paths.dbPath),
    schemaVersion: null,
    latestVersion: SCHEMA_VERSION,
    pending: [],
    tables: [],
    memories: null,
    error: null,
  };

  if (!report.exists) return report;
  if (!depsReady(paths)) {
    report.error = 'dependencies not installed';
    return report;
  }

  let conn;
  try {
    conn = await openDb({ paths, env, readonly: true, runMigrations: false });
    report.schemaVersion = await readSchemaVersion(conn);
    report.pending = pendingMigrations(report.schemaVersion).map((m) => m.version);
    report.tables = (
      await conn.all(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
    ).map((r) => r.name);
    if (report.tables.includes('memories')) {
      const row = await conn.get('SELECT count(*) AS n FROM memories');
      report.memories = row?.n ?? 0;
    }
  } catch (err) {
    report.error = err.message;
  } finally {
    if (conn) await conn.close().catch(() => {});
  }

  return report;
}

/** Create or migrate the database. What `mem init` runs. */
export async function initDb(opts) {
  return withDb(async (conn) => migrate(conn), { ...opts, runMigrations: false });
}
