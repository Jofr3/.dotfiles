// Schema + migration runner. Runs against a throwaway database file, but keeps
// `dataDir` pointed at the real one so the pinned deps resolve without npm.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  MIGRATIONS,
  SCHEMA_VERSION,
  migrate,
  openDb,
  pendingMigrations,
  readSchemaVersion,
  withDb,
} from '../../src/db.mjs';
import { resolvePaths } from '../../src/paths.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'mem-db-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
/** Paths pointing at a fresh database file, deps still resolved from dataDir. */
const scratchPaths = () => ({ ...resolvePaths(), dbPath: join(scratch, `db-${n++}.db`) });

const columnsOf = (conn, table) =>
  conn.all(`SELECT name FROM pragma_table_info('${table}')`).then((rows) => rows.map((r) => r.name));

describe('migrations', () => {
  it('creates schema v1 from nothing', async () => {
    const paths = scratchPaths();
    await withDb(async (conn) => {
      assert.equal(await readSchemaVersion(conn), SCHEMA_VERSION);

      const tables = (
        await conn.all(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
      ).map((r) => r.name);
      assert.deepEqual(tables, ['memories', 'memory_events', 'memory_links', 'meta']);
    }, { paths });
  });

  it('reports the version it moved through', async () => {
    const paths = scratchPaths();
    const conn = await openDb({ paths, runMigrations: false });
    try {
      assert.equal(await readSchemaVersion(conn), 0);
      assert.deepEqual(await migrate(conn), {
        from: 0,
        to: SCHEMA_VERSION,
        applied: MIGRATIONS.map((m) => m.version),
      });
    } finally {
      await conn.close();
    }
  });

  it('is idempotent — a second run applies nothing', async () => {
    const paths = scratchPaths();
    await withDb(async () => {}, { paths });

    await withDb(async (conn) => {
      assert.deepEqual(await migrate(conn), { from: SCHEMA_VERSION, to: SCHEMA_VERSION, applied: [] });
      assert.deepEqual(await migrate(conn), { from: SCHEMA_VERSION, to: SCHEMA_VERSION, applied: [] });
      assert.equal(await readSchemaVersion(conn), SCHEMA_VERSION);
    }, { paths });
  });

  it('refuses a database from a newer mem', async () => {
    const paths = scratchPaths();
    await withDb(async (conn) => {
      await conn.run("UPDATE meta SET v = ? WHERE k = 'schema_version'", String(SCHEMA_VERSION + 1));
      await assert.rejects(() => migrate(conn), /only knows v/);
    }, { paths });
  });

  it('refuses a meta table that is not ours', async () => {
    const paths = scratchPaths();
    const conn = await openDb({ paths, runMigrations: false });
    try {
      await conn.exec('CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)');
      await assert.rejects(() => migrate(conn), /no schema_version row/);
    } finally {
      await conn.close();
    }
  });

  it('pendingMigrations tracks the version', () => {
    assert.deepEqual(pendingMigrations(0), MIGRATIONS);
    assert.deepEqual(pendingMigrations(SCHEMA_VERSION), []);
  });
});

describe('schema v1', () => {
  it('has every column PLAN.md specifies', async () => {
    const paths = scratchPaths();
    await withDb(async (conn) => {
      assert.deepEqual(await columnsOf(conn, 'memories'), [
        'id', 'uid', 'kind', 'scope', 'project_key', 'text', 'why',
        'emb', 'emb_model', 'emb_dim', 'salience', 'confidence', 'pinned',
        'status', 'superseded_by', 'source_kind', 'source_session',
        'created_at', 'updated_at', 'last_injected_at', 'injected_count',
        'last_used_at', 'useful_count', 'expires_at', 'consolidated_at',
      ]);
      assert.deepEqual(await columnsOf(conn, 'memory_links'), ['src', 'dst', 'rel']);
      assert.deepEqual(await columnsOf(conn, 'memory_events'), ['id', 'memory_id', 'event', 'detail', 'at']);
      assert.deepEqual(await columnsOf(conn, 'meta'), ['k', 'v']);
    }, { paths });
  });

  // The lookup index is the performance design, not tidiness: it prunes rows
  // before any distance is computed (PLAN, 24.7ms -> 3.0ms).
  it('indexes (status, scope, project_key) and uses it for the retrieval filter', async () => {
    const paths = scratchPaths();
    await withDb(async (conn) => {
      const cols = (await conn.all("SELECT name FROM pragma_index_info('memories_lookup')")).map(
        (r) => r.name,
      );
      assert.deepEqual(cols, ['status', 'scope', 'project_key']);

      const plan = await conn.all(
        "EXPLAIN QUERY PLAN SELECT id FROM memories WHERE status = 'active' AND (scope = 'global' OR project_key = ?)",
        'x',
      );
      assert.match(
        plan.map((r) => r.detail).join(' '),
        /memories_lookup/,
        'retrieval filter must hit memories_lookup',
      );
    }, { paths });
  });

  it('applies the documented defaults', async () => {
    const paths = scratchPaths();
    await withDb(async (conn) => {
      await conn.run(
        'INSERT INTO memories (uid, kind, scope, text, emb, emb_model, emb_dim) VALUES (?,?,?,?,?,?,?)',
        'u1', 'preference', 'global', 'use pnpm', Buffer.alloc(4), 'test', 1,
      );
      const row = await conn.get('SELECT * FROM memories WHERE uid = ?', 'u1');
      assert.equal(row.salience, 0.5);
      assert.equal(row.confidence, 0.5);
      assert.equal(row.pinned, 0);
      assert.equal(row.status, 'active');
      assert.equal(row.injected_count, 0);
      assert.equal(row.useful_count, 0);
      assert.equal(row.project_key, null);
    }, { paths });
  });

  it('enforces uid uniqueness', async () => {
    const paths = scratchPaths();
    await withDb(async (conn) => {
      const insert = (uid) =>
        conn.run(
          'INSERT INTO memories (uid, kind, scope, text, emb, emb_model, emb_dim) VALUES (?,?,?,?,?,?,?)',
          uid, 'fact', 'global', 't', Buffer.alloc(4), 'test', 1,
        );
      await insert('dup');
      await assert.rejects(() => insert('dup'), /UNIQUE|constraint/i);
    }, { paths });
  });
});
