#!/usr/bin/env node
// drizzle-db — inspect and query databases through drizzle-orm, using
// connection credentials supplied via session environment variables.
//
// Run `node drizzle-db.mjs help` for usage.

import fs from 'node:fs';
import { loadConnections, selectConnection, describeConnection } from './lib/connections.mjs';
import { createClient, classifyStatement } from './lib/client.mjs';
import {
  tablesQuery, columnsQuery, constraintsQuery, indexesQuery, countQuery, versionQuery,
  splitTable,
} from './lib/catalog.mjs';

const USAGE = `
drizzle-db — query databases via drizzle-orm using session-variable credentials

Usage: node drizzle-db.mjs <command> [options]

Commands
  connections                 List connections found in the session env (credentials redacted)
  ping                        Open each/one connection and report the server version
  tables                      List tables and views
  describe <table>            Columns, constraints and indexes for a table ("schema.table" ok)
  count <table>               Row count for a table
  query <sql>                 Run SQL. Use "-" to read the statement from stdin
  query-file <path>           Run SQL read from a file

Options
  --conn <name>               Connection to use (default: the only one, or the one marked default)
  --all                       For connections/ping/tables: apply to every connection
  --schema <name>             Restrict catalog commands to one schema
  --json                      Emit JSON instead of a text table
  --max-rows <n>              Rows to print (default 100; 0 = unlimited)
  --max-width <n>             Truncate cell text at n chars (default 80; 0 = unlimited)
  --write                     Allow INSERT/UPDATE/DELETE/MERGE (refused by default)
  --force                     Additionally allow DROP/TRUNCATE/ALTER/GRANT/REVOKE (with --write)
  --timeout <ms>              Abort if the command takes longer (default 30000)

Environment
  DATABASES                   JSON array of connections (see references/connections.md)
  DATABASE_URL                Single-connection fallback
  DATABASES_DEFAULT           Name of the connection to use when --conn is omitted
  DRIZZLE_DB_NO_INSTALL=1     Never auto-install drivers into the cache
`.trim();

function parseArgs(argv) {
  const flags = {
    json: false, all: false, write: false, force: false,
    maxRows: 100, maxWidth: 80, timeout: 30000,
    conn: null, schema: null,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`Option ${arg} requires a value`);
      return argv[i];
    };
    switch (arg) {
      case '--json': flags.json = true; break;
      case '--all': flags.all = true; break;
      case '--write': flags.write = true; break;
      case '--force': flags.force = true; break;
      case '--conn': case '-c': flags.conn = next(); break;
      case '--schema': case '-s': flags.schema = next(); break;
      case '--max-rows': flags.maxRows = Number(next()); break;
      case '--max-width': flags.maxWidth = Number(next()); break;
      case '--timeout': flags.timeout = Number(next()); break;
      case '--help': case '-h': positional.push('help'); break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
        positional.push(arg);
    }
  }
  return { flags, positional };
}

// ---------------------------------------------------------------- formatting

function cell(value, maxWidth) {
  let text;
  if (value === null || value === undefined) text = 'NULL';
  else if (value instanceof Date) text = value.toISOString();
  else if (Buffer.isBuffer(value)) text = `<${value.length} bytes>`;
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);

  text = text.replace(/\s*\n\s*/g, ' ⏎ ');
  if (maxWidth > 0 && text.length > maxWidth) text = `${text.slice(0, maxWidth - 1)}…`;
  return text;
}

function renderTable(rows, { maxRows, maxWidth }) {
  if (rows.length === 0) return '(0 rows)';

  const shown = maxRows > 0 ? rows.slice(0, maxRows) : rows;
  const columns = [...new Set(shown.flatMap((r) => Object.keys(r ?? {})))];
  if (columns.length === 0) return `(${rows.length} rows, no columns)`;

  const body = shown.map((row) => columns.map((c) => cell(row?.[c], maxWidth)));
  const widths = columns.map((c, i) => Math.max(c.length, ...body.map((r) => r[i].length)));
  const line = (cells) => cells.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd();

  const out = [
    line(columns),
    widths.map((w) => '─'.repeat(w)).join('  '),
    ...body.map(line),
    '',
    rows.length === shown.length
      ? `(${rows.length} row${rows.length === 1 ? '' : 's'})`
      : `(showing ${shown.length} of ${rows.length} rows — raise --max-rows to see more)`,
  ];
  return out.join('\n');
}

function emit(payload, flags) {
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(payload, replacer, 2)}\n`);
    return;
  }
  if (Array.isArray(payload)) {
    process.stdout.write(`${renderTable(payload, flags)}\n`);
    return;
  }
  process.stdout.write(`${payload}\n`);
}

/** Drizzle wraps driver errors, so surface the cause chain too. */
function errorMessage(err) {
  const parts = [];
  for (let e = err, depth = 0; e && depth < 4; e = e.cause, depth += 1) {
    const message = String(e.message ?? e).trim().replace(/\s*\n\s*/g, ' ');
    if (message && !parts.includes(message)) parts.push(message);
  }
  return parts.join(' — ');
}

function replacer(_key, value) {
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return `<${value.length} bytes>`;
  return value;
}

function section(title, rows, flags) {
  return [`\n${title}`, renderTable(rows, flags)].join('\n');
}

// ------------------------------------------------------------------ commands

async function withClient(conn, fn) {
  const client = await createClient(conn);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

async function cmdConnections(connections, flags) {
  emit(connections.map(describeConnection), flags);
}

async function cmdPing(targets, flags) {
  const results = [];
  for (const conn of targets) {
    const started = process.hrtime.bigint();
    try {
      const { rows } = await withClient(conn, (client) => client.query(versionQuery(conn.dialect)));
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      results.push({
        connection: conn.name,
        dialect: conn.dialect,
        ok: true,
        ms: Math.round(ms),
        version: Object.values(rows[0] ?? {})[0] ?? null,
      });
    } catch (err) {
      results.push({ connection: conn.name, dialect: conn.dialect, ok: false, error: errorMessage(err) });
    }
  }
  emit(results, flags);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

async function cmdTables(targets, flags) {
  const all = [];
  for (const conn of targets) {
    const { rows } = await withClient(conn, (client) => client.query(tablesQuery(conn.dialect, flags.schema)));
    all.push(...rows.map((r) => (targets.length > 1 ? { connection: conn.name, ...r } : r)));
  }
  emit(all, flags);
}

async function cmdDescribe(conn, ref, flags) {
  const parts = splitTable(ref);
  const schema = flags.schema || parts.schema;
  const { table } = parts;

  const result = await withClient(conn, async (client) => {
    const run = async (query) => {
      if (!query) return [];
      try {
        return (await client.query(query)).rows;
      } catch (err) {
        return [{ error: errorMessage(err) }];
      }
    };
    return {
      table: schema ? `${schema}.${table}` : table,
      connection: conn.name,
      dialect: conn.dialect,
      columns: await run(columnsQuery(conn.dialect, table, schema)),
      constraints: await run(constraintsQuery(conn.dialect, table, schema)),
      indexes: await run(indexesQuery(conn.dialect, table, schema)),
    };
  });

  if (result.columns.length === 0) {
    throw new Error(`Table "${ref}" not found on connection "${conn.name}".`);
  }

  if (flags.json) {
    emit(result, flags);
    return;
  }
  emit([
    `${result.table}  [${conn.name} · ${conn.dialect}]`,
    section('Columns', result.columns, flags),
    result.constraints.length ? section('Constraints', result.constraints, flags) : '',
    result.indexes.length ? section('Indexes', result.indexes, flags) : '',
  ].filter(Boolean).join('\n'), flags);
}

async function cmdCount(conn, ref, flags) {
  const parts = splitTable(ref);
  const schema = flags.schema || parts.schema;
  const { rows } = await withClient(conn, (client) => client.query(countQuery(conn.dialect, parts.table, schema)));
  emit(rows, flags);
}

async function cmdQuery(conn, statement, flags) {
  const text = statement.trim().replace(/;\s*$/, '');
  if (!text) throw new Error('Empty SQL statement.');

  const kind = classifyStatement(text);
  if (kind !== 'read') {
    if (conn.readonly) {
      throw new Error(`Connection "${conn.name}" is marked readonly — refusing a ${kind} statement.`);
    }
    if (!flags.write) {
      throw new Error(
        `Refusing to run a ${kind} statement without --write. `
        + 'Confirm with the user before mutating data, then re-run with --write.',
      );
    }
    if (kind === 'destructive' && !flags.force) {
      throw new Error(
        'Refusing a destructive statement (DROP/TRUNCATE/ALTER/GRANT/REVOKE) without --force. '
        + 'Get explicit user confirmation first.',
      );
    }
  }

  const { rows, rowCount } = await withClient(conn, (client) => client.query(text));

  if (kind !== 'read' && rows.length === 0) {
    const affected = rowCount ?? 0;
    emit(
      flags.json
        ? { ok: true, statement: kind, rowsAffected: affected }
        : `OK — ${affected} row${affected === 1 ? '' : 's'} affected`,
      flags,
    );
    return;
  }
  emit(rows, flags);
}

// ---------------------------------------------------------------------- main

function readStdin() {
  if (process.stdin.isTTY) return '';
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || command === 'help') {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const { connections, errors } = loadConnections();
  for (const message of errors) process.stderr.write(`[drizzle-db] ${message}\n`);

  if (command === 'connections') {
    if (connections.length === 0) {
      process.stderr.write(
        '[drizzle-db] No connections in the session environment. Set DATABASES or DATABASE_URL.\n',
      );
      process.exitCode = 1;
      return;
    }
    await cmdConnections(connections, flags);
    return;
  }

  const targets = flags.all && ['ping', 'tables'].includes(command)
    ? connections
    : [selectConnection(connections, flags.conn)];

  if (targets.length === 0) throw new Error('No connections available.');

  switch (command) {
    case 'ping':
      await cmdPing(targets, flags);
      break;
    case 'tables':
      await cmdTables(targets, flags);
      break;
    case 'describe':
    case 'schema': {
      const ref = positional[1];
      if (!ref) throw new Error('describe requires a table name: describe <table>');
      await cmdDescribe(targets[0], ref, flags);
      break;
    }
    case 'count': {
      const ref = positional[1];
      if (!ref) throw new Error('count requires a table name: count <table>');
      await cmdCount(targets[0], ref, flags);
      break;
    }
    case 'query': {
      const arg = positional.slice(1).join(' ');
      const statement = !arg || arg === '-' ? readStdin() : arg;
      await cmdQuery(targets[0], statement, flags);
      break;
    }
    case 'query-file': {
      const file = positional[1];
      if (!file) throw new Error('query-file requires a path: query-file <path>');
      await cmdQuery(targets[0], fs.readFileSync(file, 'utf8'), flags);
      break;
    }
    default:
      throw new Error(`Unknown command "${command}". Run \`help\` for usage.`);
  }
}

const timeoutMs = Number(
  (process.argv.includes('--timeout') && process.argv[process.argv.indexOf('--timeout') + 1]) || 30000,
);
const timer = setTimeout(() => {
  process.stderr.write(`[drizzle-db] timed out after ${timeoutMs}ms\n`);
  process.exit(2);
}, timeoutMs);
timer.unref();

main()
  .then(() => {
    clearTimeout(timer);
  })
  .catch((err) => {
    clearTimeout(timer);
    process.stderr.write(`[drizzle-db] ${errorMessage(err)}\n`);
    process.exitCode = 1;
  });
