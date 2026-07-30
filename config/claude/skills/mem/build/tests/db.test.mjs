// Schema + migration runner. Runs against a throwaway database file, but keeps
// `dataDir` pointed at the real one so the pinned deps resolve without npm.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  MEMORY_COLUMNS,
  MIGRATIONS,
  SCHEMA_VERSION,
  migrate,
  openDb,
  pendingMigrations,
  readSchemaVersion,
  vectorProbe,
  withDb,
} from '../../src/db.mjs';
import { EMB_DIM, EMB_MODEL } from '../../src/embed.mjs';
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

// ---------------------------------------------------------------- schema v2 --
//
// The debt PLAN's schema section booked against phase 5a.3: v1 shipped
// `emb BLOB NOT NULL` and the pruning ladder's rung 3 needs to write NULL there.
// SQLite cannot drop a constraint, so the table is rebuilt, and a rebuild is
// exactly the migration where data goes missing quietly. Hence the fixture below
// is built at v1 with every awkward shape in it — a FORWARD self-reference, a
// link row, an event row, a NULL in every nullable column — and the assertions
// are about what survived rather than about what the DDL says.

function fakeFloats(seed) {
  const v = new Float32Array(EMB_DIM);
  for (let i = 0; i < EMB_DIM; i += 1) v[i] = Math.sin(seed * (i + 1));
  return v;
}

/** The blob form, for binding straight into `vector32(?)`. */
const fakeVector = (seed) => Buffer.from(fakeFloats(seed).buffer);

/** A database at v1 exactly, with rows in it. Returns its paths. */
async function seededV1() {
  const paths = scratchPaths();
  const conn = await openDb({ paths, runMigrations: false });
  try {
    const v1 = MIGRATIONS.find((m) => m.version === 1);
    for (const sql of v1.statements) await conn.exec(sql);
    await conn.run("INSERT INTO meta(k, v) VALUES ('schema_version', '1')");

    for (const i of [1, 2, 3]) {
      await conn.run(
        `INSERT INTO memories (id, uid, kind, scope, project_key, text, why, emb, emb_model, emb_dim,
                               salience, confidence, pinned, status, source_kind,
                               created_at, updated_at, injected_count, useful_count)
         VALUES (?,?,'preference','project','p/one',?,?,vector32(?),?,?,0.7,0.9,?,?,'user',1000,2000,4,2)`,
        i, `uid-${i}`, `memory ${i}`, i === 2 ? null : `because ${i}`,
        fakeVector(i), EMB_MODEL, EMB_DIM, i === 3 ? 1 : 0, i === 2 ? 'staged' : 'active',
      );
    }
    // The shape one-pass copies get wrong: row 1 points at a HIGHER id, so an
    // INSERT…SELECT carrying superseded_by fails the FK the moment it runs.
    await conn.run('UPDATE memories SET superseded_by = 3 WHERE id = 1');
    await conn.run("INSERT INTO memory_events (memory_id, event, detail, at) VALUES (1, 'created', '{\"a\":1}', 1234)");
    await conn.run("INSERT INTO memory_links (src, dst, rel) VALUES (1, 3, 'related')");
    assert.equal(await readSchemaVersion(conn), 1);
  } finally {
    await conn.close();
  }
  return paths;
}

describe('schema v2 — emb becomes nullable', () => {
  it('rebuilds the table without losing a row, a column or a link', async () => {
    const paths = await seededV1();

    await withDb(async (conn) => {
      assert.equal(await readSchemaVersion(conn), SCHEMA_VERSION);
      assert.deepEqual(await columnsOf(conn, 'memories'), MEMORY_COLUMNS);

      const rows = await conn.all(
        `SELECT id, uid, text, why, status, pinned, salience, confidence, superseded_by,
                created_at, updated_at, injected_count, useful_count, emb_model, emb_dim,
                emb IS NOT NULL AS embedded
           FROM memories ORDER BY id`,
      );
      assert.equal(rows.length, 3);
      assert.deepEqual(rows.map((r) => r.uid), ['uid-1', 'uid-2', 'uid-3']);
      assert.deepEqual(rows.map((r) => r.embedded), [1, 1, 1]);
      assert.deepEqual(rows.map((r) => r.status), ['active', 'staged', 'active']);
      assert.deepEqual(rows.map((r) => r.pinned), [0, 0, 1]);
      assert.deepEqual(rows.map((r) => r.why), ['because 1', null, 'because 3']);
      assert.equal(rows[0].salience, 0.7);
      assert.equal(rows[0].confidence, 0.9);
      assert.equal(rows[0].injected_count, 4);
      assert.equal(rows[0].useful_count, 2);
      assert.equal(rows[0].created_at, 1000);
      assert.equal(rows[0].updated_at, 2000);
      assert.equal(rows[0].emb_model, EMB_MODEL);

      // The forward reference, restored by the second pass rather than lost.
      assert.equal(rows[0].superseded_by, 3);

      assert.deepEqual(await conn.all('SELECT src, dst, rel FROM memory_links'), [
        { src: 1, dst: 3, rel: 'related' },
      ]);
      const events = await conn.all('SELECT memory_id, event, detail, at FROM memory_events');
      assert.deepEqual(events, [{ memory_id: 1, event: 'created', detail: '{"a":1}', at: 1234 }]);
    }, { paths });
  });

  it('keeps the self-referencing foreign key through the rename', async () => {
    const paths = await seededV1();
    await withDb(async (conn) => {
      const fks = await conn.all("SELECT * FROM pragma_foreign_key_list('memories')");
      assert.equal(fks.length, 1);
      assert.equal(fks[0].table, 'memories', 'the FK must not still name memories_v2');
      assert.equal(fks[0].from, 'superseded_by');
      assert.equal(fks[0].to, 'id');
      assert.deepEqual(await conn.all('PRAGMA foreign_key_check'), []);

      await assert.rejects(
        () => conn.run('UPDATE memories SET superseded_by = 9999 WHERE id = 2'),
        /FOREIGN KEY/i,
        'the constraint must still be enforced, not merely declared',
      );
    }, { paths });
  });

  // The index goes with the dropped table, and losing it would turn PLAN's
  // 3.0ms scoped scan back into a 24.7ms full one — silently, since the query
  // still returns the right answer.
  it('recreates memories_lookup and still uses it', async () => {
    const paths = await seededV1();
    await withDb(async (conn) => {
      const cols = (await conn.all("SELECT name FROM pragma_index_info('memories_lookup')")).map((r) => r.name);
      assert.deepEqual(cols, ['status', 'scope', 'project_key']);
      const plan = await conn.all(
        "EXPLAIN QUERY PLAN SELECT id FROM memories WHERE status = 'active' AND (scope = 'global' OR project_key = ?)",
        'x',
      );
      assert.match(plan.map((r) => r.detail).join(' '), /memories_lookup/);
      assert.deepEqual(
        (await conn.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => r.name),
        ['memories', 'memory_events', 'memory_links', 'meta'],
        'memories_v2 must not survive the rename',
      );
    }, { paths });
  });

  it('lets rung 3 write the tombstone v1 made impossible', async () => {
    const v1 = await seededV1();
    const conn1 = await openDb({ paths: v1, runMigrations: false });
    try {
      await assert.rejects(
        () => conn1.run('UPDATE memories SET emb = NULL WHERE id = 1'),
        /NOT NULL/i,
        'v1 must be the version that cannot tombstone — otherwise this migration is pointless',
      );
    } finally {
      await conn1.close();
    }

    await withDb(async (conn) => {
      await conn.run('UPDATE memories SET emb = NULL WHERE id = 1');
      const row = await conn.get('SELECT emb IS NULL AS tombstoned, text FROM memories WHERE id = 1');
      assert.equal(row.tombstoned, 1);
      assert.equal(row.text, 'memory 1', 'the text is the whole point of a tombstone');

      await conn.run(
        `INSERT INTO memories (uid, kind, scope, text, emb, emb_model, emb_dim)
         VALUES ('fresh', 'fact', 'global', 'no vector at all', NULL, ?, ?)`,
        EMB_MODEL, EMB_DIM,
      );
    }, { paths: v1 });
  });
});

// The reason every vector query in this codebase carries `emb IS NOT NULL`, and
// it is NOT the reason PLAN gives. PLAN predicted a silent mis-ranking (NULL
// sorting ahead of every real distance in ASC order); measured, this Turso build
// throws instead and takes the whole statement with it. Louder — but a hook that
// fails open injects nothing, so the whole store would have gone dark rather than
// one row jumping the queue.
describe('the emb IS NOT NULL guard', () => {
  it('makes an unguarded distance query throw once one row is tombstoned', async () => {
    const paths = await seededV1();
    await withDb(async (conn) => {
      await conn.run('UPDATE memories SET emb = NULL WHERE id = 2');

      await assert.rejects(
        () => conn.all(
          'SELECT id, vector_distance_cos(emb, vector32(?)) AS dist FROM memories ORDER BY dist',
          fakeVector(1),
        ),
        /vector/i,
      );

      const guarded = await conn.all(
        `SELECT id, vector_distance_cos(emb, vector32(?)) AS dist
           FROM memories WHERE emb IS NOT NULL ORDER BY dist`,
        fakeVector(1),
      );
      assert.deepEqual(guarded.map((r) => r.id), [1, 3]);
    }, { paths });
  });

  it('vectorProbe carries both guards — tombstones and foreign vector spaces', async () => {
    const paths = await seededV1();
    await withDb(async (conn) => {
      await conn.run("UPDATE memories SET status = 'active' WHERE id = 2");
      await conn.run('UPDATE memories SET emb = NULL WHERE id = 2');
      await conn.run("UPDATE memories SET emb_model = 'some/other-model' WHERE id = 3");

      // vectorProbe takes a vector, not a blob — it does the vector32() itself.
      const hits = await vectorProbe(conn, fakeFloats(1), { projectKey: 'p/one' });
      assert.deepEqual(
        hits.map((r) => r.id),
        [1],
        'the tombstone and the foreign-model row must both be out',
      );
    }, { paths });
  });
});
