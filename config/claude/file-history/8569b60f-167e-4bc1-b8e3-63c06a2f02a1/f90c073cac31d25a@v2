// Builds a drizzle-orm client for a normalized connection and exposes a
// uniform `query(text)` that returns plain row objects across every dialect.

import { loadModule, pick, pickDefault } from './deps.mjs';

const READ_ONLY_HEADS = new Set([
  'select', 'show', 'describe', 'desc', 'explain', 'pragma', 'values', 'table', 'analyze',
]);
const DESTRUCTIVE_HEADS = new Set(['drop', 'truncate', 'alter', 'rename', 'grant', 'revoke']);

/** Strip comments/leading noise and return the first keyword of a statement. */
export function firstKeyword(text) {
  const stripped = String(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/^[\s(;]+/, '');
  return (stripped.match(/^([a-z_]+)/i) || [, ''])[1].toLowerCase();
}

/** Classify a statement as 'read' | 'write' | 'destructive'. */
export function classifyStatement(text) {
  const head = firstKeyword(text);
  if (DESTRUCTIVE_HEADS.has(head)) return 'destructive';
  if (head === 'with') {
    // A CTE is only a read if its body never mutates.
    return /\b(insert|update|delete|merge)\b/i.test(text) ? 'write' : 'read';
  }
  if (READ_ONLY_HEADS.has(head)) return 'read';
  if (!head) return 'read';
  return 'write';
}

/** Coerce whatever a driver returns into an array of row objects. */
function toRows(result, driver) {
  if (result == null) return [];

  if (driver === 'mysql2' && Array.isArray(result)) {
    // mysql2 returns [rows, fields] for reads and [OkPacket, undefined] for writes.
    return Array.isArray(result[0]) ? result[0] : [];
  }

  if (Array.isArray(result)) return result;
  if (Array.isArray(result.rows)) return result.rows;
  if (Array.isArray(result.recordset)) return result.recordset; // mssql
  if (Array.isArray(result.records)) return result.records;

  // Write acknowledgements (better-sqlite3 RunResult, mssql rowsAffected) carry no
  // rows of their own — rowCountOf reports the effect instead.
  if (typeof result.changes === 'number') return [];
  if (Array.isArray(result.rowsAffected)) return [];

  if (typeof result === 'object') return [result];
  return [{ result }];
}

/** Pull the affected-row count out of whatever the driver returned. */
function rowCountOf(result, driver, rows) {
  if (result == null) return null;
  if (driver === 'mysql2' && Array.isArray(result)) {
    return Array.isArray(result[0]) ? result[0].length : (result[0]?.affectedRows ?? null);
  }
  if (Array.isArray(result)) return result.count ?? result.length; // postgres.js tags the array
  if (typeof result.rowCount === 'number') return result.rowCount; // node-postgres
  if (typeof result.rowsAffected === 'number') return result.rowsAffected; // libsql
  if (Array.isArray(result.rowsAffected)) return result.rowsAffected[0]; // mssql
  if (typeof result.changes === 'number') return result.changes; // better-sqlite3
  return rows.length;
}

/** Uniform result envelope handed back by every adapter. */
function shape(result, driver) {
  const rows = toRows(result, driver);
  return { rows, rowCount: rowCountOf(result, driver, rows) };
}

async function drizzleSql() {
  return pick(await loadModule('drizzle-orm'), 'sql');
}

async function postgresJsClient(conn) {
  const postgres = pickDefault(await loadModule('postgres'));
  const sql = await drizzleSql();
  const drizzle = pick(await loadModule('drizzle-orm/postgres-js'), 'drizzle');

  const client = postgres(conn.url, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    ...(conn.ssl !== undefined ? { ssl: conn.ssl } : {}),
    ...(conn.options || {}),
  });
  const db = drizzle(client);

  return {
    db,
    async query(text) {
      return shape(await db.execute(sql.raw(text)), conn.driver);
    },
    async close() {
      await client.end({ timeout: 5 });
    },
  };
}

async function nodePostgresClient(conn) {
  const pg = pickDefault(await loadModule('pg'));
  const sql = await drizzleSql();
  const drizzle = pick(await loadModule('drizzle-orm/node-postgres'), 'drizzle');

  const Pool = pg.Pool || pg.default?.Pool;
  const pool = new Pool({
    connectionString: conn.url,
    max: 1,
    ...(conn.ssl !== undefined ? { ssl: conn.ssl } : {}),
    ...(conn.options || {}),
  });
  const db = drizzle(pool);

  return {
    db,
    async query(text) {
      return shape(await db.execute(sql.raw(text)), conn.driver);
    },
    async close() {
      await pool.end();
    },
  };
}

async function neonHttpClient(conn) {
  const neon = pick(await loadModule('@neondatabase/serverless'), 'neon');
  const sql = await drizzleSql();
  const drizzle = pick(await loadModule('drizzle-orm/neon-http'), 'drizzle');

  const db = drizzle(neon(conn.url));
  return {
    db,
    async query(text) {
      return shape(await db.execute(sql.raw(text)), conn.driver);
    },
    async close() {},
  };
}

async function mysql2Client(conn) {
  const mysql = pickDefault(await loadModule('mysql2/promise'));
  const sql = await drizzleSql();
  const drizzle = pick(await loadModule('drizzle-orm/mysql2'), 'drizzle');

  const connection = await mysql.createConnection({
    uri: conn.url,
    ...(conn.ssl !== undefined ? { ssl: conn.ssl } : {}),
    ...(conn.options || {}),
  });
  const db = drizzle(connection, { mode: 'default' });

  return {
    db,
    async query(text) {
      return shape(await db.execute(sql.raw(text)), conn.driver);
    },
    async close() {
      await connection.end();
    },
  };
}

async function sqliteLike(conn, { makeClient, modulePath, closeClient }) {
  const sql = await drizzleSql();
  const drizzle = pick(await loadModule(modulePath), 'drizzle');
  const client = await makeClient();
  const db = drizzle(client);

  return {
    db,
    async query(text) {
      const kind = classifyStatement(text);
      // better-sqlite3 throws if .all() is used on a statement that returns no rows.
      const result = kind === 'read' ? await db.all(sql.raw(text)) : await db.run(sql.raw(text));
      return shape(result, conn.driver);
    },
    async close() {
      await closeClient?.(client);
    },
  };
}

async function betterSqliteClient(conn) {
  const Database = pickDefault(await loadModule('better-sqlite3'));
  const file = conn.url.replace(/^file:/, '') || ':memory:';
  return sqliteLike(conn, {
    modulePath: 'drizzle-orm/better-sqlite3',
    makeClient: () => new Database(file, { readonly: !!conn.readonly, ...(conn.options || {}) }),
    closeClient: (client) => client.close(),
  });
}

async function libsqlClient(conn) {
  const createClientFn = pick(await loadModule('@libsql/client'), 'createClient');
  return sqliteLike(conn, {
    modulePath: 'drizzle-orm/libsql',
    makeClient: () => createClientFn({
      url: conn.url,
      ...(conn.authToken ? { authToken: conn.authToken } : {}),
      ...(conn.options || {}),
    }),
    closeClient: (client) => client.close?.(),
  });
}

async function mssqlClient(conn) {
  const mssql = pickDefault(await loadModule('mssql'));
  const sql = await drizzleSql();
  const drizzle = pick(await loadModule('drizzle-orm/mssql'), 'drizzle');

  const pool = await mssql.connect(conn.url);
  const db = drizzle(pool);

  return {
    db,
    async query(text) {
      return shape(await db.execute(sql.raw(text)), conn.driver);
    },
    async close() {
      await pool.close();
    },
  };
}

const FACTORIES = {
  'postgres-js': postgresJsClient,
  'node-postgres': nodePostgresClient,
  'neon-http': neonHttpClient,
  mysql2: mysql2Client,
  'better-sqlite3': betterSqliteClient,
  libsql: libsqlClient,
  mssql: mssqlClient,
};

/**
 * Create a client for a connection.
 * Returns { db, dialect, driver, query(text) -> rows, close() }.
 */
export async function createClient(conn) {
  const factory = FACTORIES[conn.driver];
  if (!factory) {
    throw new Error(`Unsupported driver "${conn.driver}". Known: ${Object.keys(FACTORIES).join(', ')}`);
  }
  const base = await factory(conn);
  return { ...base, dialect: conn.dialect, driver: conn.driver, connection: conn };
}
