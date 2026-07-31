#!/usr/bin/env node
// drizzle-db MCP server — the drizzle-db skill's commands as typed tools.
//
// Runs the skill's own lib/ in-process rather than shelling out to
// drizzle-db.mjs: the write-gating lives in classifyStatement, and importing it
// keeps one copy of that rule instead of two. Driver installation is still
// lazy (deps.mjs), so it happens inside a tool call, never at startup.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  serve, text, failure, renderTable, stringify, errorMessage, log,
} from '../lib/mcp-stdio.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(HERE, '..', '..', 'skills', 'drizzle-db', 'scripts', 'lib');

const { loadConnections, selectConnection, describeConnection } = await import(
  path.join(LIB, 'connections.mjs')
);
const { createClient, classifyStatement } = await import(path.join(LIB, 'client.mjs'));
const {
  tablesQuery, columnsQuery, constraintsQuery, indexesQuery, countQuery, versionQuery, splitTable,
} = await import(path.join(LIB, 'catalog.mjs'));

const DEFAULT_TIMEOUT = 30000;

// ------------------------------------------------------------------- helpers

function connections() {
  const { connections: found, errors } = loadConnections();
  for (const message of errors) log(`[drizzle-db] ${message}`);
  if (found.length === 0) {
    throw new Error(
      'No connections in the session environment. Set DATABASES (JSON array) or DATABASE_URL.',
    );
  }
  return found;
}

/** Resolve the tool's `connection` argument to one or many connections. */
function resolve(all, { connection, allConnections } = {}) {
  if (allConnections) return all;
  return [selectConnection(all, connection ?? null)];
}

async function withClient(conn, fn) {
  const client = await createClient(conn);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

/** Fail a tool call rather than let a wedged driver hang the server. */
function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/** Rows as a table, or as JSON when the caller asks for it. */
function present(rows, { json, maxRows, maxWidth }) {
  if (json) return text(stringify(rows));
  return text(renderTable(rows, {
    maxRows: maxRows ?? 100,
    maxWidth: maxWidth ?? 80,
  }));
}

// -------------------------------------------------------------- shared schema

const CONNECTION_ARG = {
  connection: {
    type: 'string',
    description:
      'Connection name to run against. Required when more than one is configured — '
      + 'the server will not guess between e.g. "prod" and "staging".',
  },
};

const OUTPUT_ARGS = {
  json: { type: 'boolean', description: 'Return JSON instead of an aligned text table.', default: false },
  maxRows: { type: 'integer', description: 'Rows to render (0 = unlimited).', default: 100 },
  maxWidth: { type: 'integer', description: 'Truncate each cell at n characters (0 = unlimited).', default: 80 },
  timeout: { type: 'integer', description: 'Abort the call after n milliseconds.', default: DEFAULT_TIMEOUT },
};

const TABLE_ARG = {
  table: {
    type: 'string',
    description: 'Table name. Accepts "schema.table"; a separate `schema` argument wins over the prefix.',
  },
  schema: { type: 'string', description: 'Restrict to one schema.' },
};

// --------------------------------------------------------------------- tools

const tools = [
  {
    name: 'connections',
    description:
      'List every database connection this session exposes, with passwords redacted. '
      + 'Start here: it reports the names to pass as `connection`, each one\'s dialect, and '
      + 'which are marked readonly. Never try to read credentials from .env files or shell history instead.',
    inputSchema: {
      type: 'object',
      properties: { json: OUTPUT_ARGS.json },
      additionalProperties: false,
    },
    handler: async ({ json }) => present(connections().map(describeConnection), { json }),
  },

  {
    name: 'ping',
    description:
      'Open a connection and report the server version and round-trip time. '
      + 'Use to verify connectivity before assuming a database is unreachable.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_ARG,
        allConnections: { type: 'boolean', description: 'Ping every configured connection.', default: false },
        json: OUTPUT_ARGS.json,
        timeout: OUTPUT_ARGS.timeout,
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const targets = resolve(connections(), args);
      const results = [];
      for (const conn of targets) {
        const started = process.hrtime.bigint();
        try {
          const { rows } = await withTimeout(
            withClient(conn, (client) => client.query(versionQuery(conn.dialect))),
            args.timeout ?? DEFAULT_TIMEOUT,
            `ping ${conn.name}`,
          );
          results.push({
            connection: conn.name,
            dialect: conn.dialect,
            ok: true,
            ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
            version: Object.values(rows[0] ?? {})[0] ?? null,
          });
        } catch (err) {
          results.push({
            connection: conn.name, dialect: conn.dialect, ok: false, error: errorMessage(err),
          });
        }
      }
      return present(results, args);
    },
  },

  {
    name: 'tables',
    description: 'List tables and views on a connection.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_ARG,
        schema: TABLE_ARG.schema,
        allConnections: { type: 'boolean', description: 'List across every connection.', default: false },
        ...OUTPUT_ARGS,
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const targets = resolve(connections(), args);
      const rows = [];
      for (const conn of targets) {
        const result = await withTimeout(
          withClient(conn, (client) => client.query(tablesQuery(conn.dialect, args.schema ?? null))),
          args.timeout ?? DEFAULT_TIMEOUT,
          `tables ${conn.name}`,
        );
        rows.push(...result.rows.map((r) => (targets.length > 1 ? { connection: conn.name, ...r } : r)));
      }
      return present(rows, args);
    },
  },

  {
    name: 'describe',
    description:
      'Columns, constraints and indexes for one table. Prefer this over guessing at a '
      + 'schema from application code — the live database is the authority.',
    inputSchema: {
      type: 'object',
      properties: { ...TABLE_ARG, ...CONNECTION_ARG, ...OUTPUT_ARGS },
      required: ['table'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const [conn] = resolve(connections(), args);
      const parts = splitTable(args.table);
      const schema = args.schema || parts.schema;

      const result = await withTimeout(withClient(conn, async (client) => {
        const run = async (query) => {
          if (!query) return [];
          try {
            return (await client.query(query)).rows;
          } catch (err) {
            return [{ error: errorMessage(err) }];
          }
        };
        return {
          table: schema ? `${schema}.${parts.table}` : parts.table,
          connection: conn.name,
          dialect: conn.dialect,
          columns: await run(columnsQuery(conn.dialect, parts.table, schema)),
          constraints: await run(constraintsQuery(conn.dialect, parts.table, schema)),
          indexes: await run(indexesQuery(conn.dialect, parts.table, schema)),
        };
      }), args.timeout ?? DEFAULT_TIMEOUT, `describe ${args.table}`);

      if (result.columns.length === 0) {
        return failure(`Table "${args.table}" not found on connection "${conn.name}".`);
      }
      if (args.json) return text(stringify(result));

      const opts = { maxRows: args.maxRows ?? 100, maxWidth: args.maxWidth ?? 80 };
      const section = (title, rows) => `\n${title}\n${renderTable(rows, opts)}`;
      return text([
        `${result.table}  [${conn.name} · ${conn.dialect}]`,
        section('Columns', result.columns),
        result.constraints.length ? section('Constraints', result.constraints) : '',
        result.indexes.length ? section('Indexes', result.indexes) : '',
      ].filter(Boolean).join('\n'));
    },
  },

  {
    name: 'count',
    description: 'Row count for a table.',
    inputSchema: {
      type: 'object',
      properties: { ...TABLE_ARG, ...CONNECTION_ARG, ...OUTPUT_ARGS },
      required: ['table'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const [conn] = resolve(connections(), args);
      const parts = splitTable(args.table);
      const { rows } = await withTimeout(
        withClient(conn, (client) => client.query(
          countQuery(conn.dialect, parts.table, args.schema || parts.schema),
        )),
        args.timeout ?? DEFAULT_TIMEOUT,
        `count ${args.table}`,
      );
      return present(rows, args);
    },
  },

  {
    name: 'query',
    description:
      'Run a SQL statement. Reads (SELECT/SHOW/EXPLAIN/…) run freely — bound exploratory '
      + 'queries on unfamiliar tables with a LIMIT.\n\n'
      + 'Writes are gated, and the gate is not a formality: INSERT/UPDATE/DELETE/MERGE need '
      + '`write: true`, and DROP/TRUNCATE/ALTER/GRANT/REVOKE need `write: true` and `force: true`. '
      + 'Before setting either, tell the user the exact statement and the exact connection name, '
      + 'and get confirmation. A connection marked readonly refuses writes outright — do not work '
      + 'around it by adding a duplicate connection.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'The statement to run. A single trailing semicolon is stripped.' },
        ...CONNECTION_ARG,
        write: {
          type: 'boolean',
          description: 'Permit INSERT/UPDATE/DELETE/MERGE. Requires prior user confirmation.',
          default: false,
        },
        force: {
          type: 'boolean',
          description:
            'With `write`, additionally permit DROP/TRUNCATE/ALTER/GRANT/REVOKE. '
            + 'Requires explicit user confirmation of this specific statement.',
          default: false,
        },
        ...OUTPUT_ARGS,
      },
      required: ['sql'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const [conn] = resolve(connections(), args);
      const statement = String(args.sql ?? '').trim().replace(/;\s*$/, '');
      if (!statement) return failure('Empty SQL statement.');

      const kind = classifyStatement(statement);
      if (kind !== 'read') {
        if (conn.readonly) {
          return failure(`Connection "${conn.name}" is marked readonly — refusing a ${kind} statement.`);
        }
        if (!args.write) {
          return failure(
            `Refusing to run a ${kind} statement without write: true. `
            + `Confirm the statement and the target connection ("${conn.name}") with the user, then retry.`,
          );
        }
        if (kind === 'destructive' && !args.force) {
          return failure(
            'Refusing a destructive statement (DROP/TRUNCATE/ALTER/GRANT/REVOKE) without force: true. '
            + 'Get explicit user confirmation first.',
          );
        }
      }

      const { rows, rowCount } = await withTimeout(
        withClient(conn, (client) => client.query(statement)),
        args.timeout ?? DEFAULT_TIMEOUT,
        'query',
      );

      if (kind !== 'read' && rows.length === 0) {
        const affected = rowCount ?? 0;
        return args.json
          ? text(stringify({ ok: true, statement: kind, rowsAffected: affected, connection: conn.name }))
          : text(`OK — ${affected} row${affected === 1 ? '' : 's'} affected on "${conn.name}"`);
      }
      return present(rows, args);
    },
  },
];

serve({
  name: 'drizzle-db',
  version: '0.1.0',
  tools,
  instructions:
    'Live SQL access using credentials from the session environment. Call `connections` first to '
    + 'learn the connection names and which are readonly. Reads are free; writes are gated behind '
    + 'explicit flags and require user confirmation. Never echo a connection URL containing a password.',
});
