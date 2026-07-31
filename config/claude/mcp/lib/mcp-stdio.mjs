// A minimal MCP server over stdio — newline-delimited JSON-RPC 2.0.
//
// Deliberately dependency-free. These servers are spawned by Claude Code at
// startup, so anything that installs on first run risks stalling `initialize`;
// the skills' own deps.mjs cache-install still happens lazily, inside a tool
// call, where a slow first run is visible and harmless.
//
// The one hard rule: stdout carries protocol frames and nothing else. Every
// diagnostic goes to stderr.

import process from 'node:process';
import { appendFileSync } from 'node:fs';

/** Protocol revisions we can speak. We echo the client's if we know it. */
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
const LATEST = SUPPORTED[0];

const JSON_RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
};

export function log(...parts) {
  process.stderr.write(`${parts.join(' ')}\n`);
}

/** Collapse an error and its cause chain into one line. */
export function errorMessage(err) {
  const parts = [];
  for (let e = err, depth = 0; e && depth < 4; e = e.cause, depth += 1) {
    const message = String(e?.message ?? e).trim().replace(/\s*\n\s*/g, ' ');
    if (message && !parts.includes(message)) parts.push(message);
  }
  return parts.join(' — ') || 'unknown error';
}

/** BigInt/Buffer-safe JSON, matching how the drizzle-db CLI serialises rows. */
export function stringify(value, indent = 2) {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (Buffer.isBuffer(v)) return `<${v.length} bytes>`;
    if (v instanceof Date) return v.toISOString();
    return v;
  }, indent);
}

/**
 * Render rows as an aligned text table — the same shape the CLI prints, so
 * tool output reads identically to what the skill used to produce.
 */
export function renderTable(rows, { maxRows = 100, maxWidth = 80 } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return '(0 rows)';

  const shown = maxRows > 0 ? rows.slice(0, maxRows) : rows;
  const columns = [...new Set(shown.flatMap((r) => Object.keys(r ?? {})))];
  if (columns.length === 0) return `(${rows.length} rows, no columns)`;

  const cell = (value) => {
    let text;
    if (value === null || value === undefined) text = 'NULL';
    else if (value instanceof Date) text = value.toISOString();
    else if (Buffer.isBuffer(value)) text = `<${value.length} bytes>`;
    else if (typeof value === 'object') text = JSON.stringify(value);
    else text = String(value);
    text = text.replace(/\s*\n\s*/g, ' ⏎ ');
    if (maxWidth > 0 && text.length > maxWidth) text = `${text.slice(0, maxWidth - 1)}…`;
    return text;
  };

  const body = shown.map((row) => columns.map((c) => cell(row?.[c])));
  const widths = columns.map((c, i) => Math.max(c.length, ...body.map((r) => r[i].length)));
  const line = (cells) => cells.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd();

  return [
    line(columns),
    widths.map((w) => '─'.repeat(w)).join('  '),
    ...body.map(line),
    '',
    rows.length === shown.length
      ? `(${rows.length} row${rows.length === 1 ? '' : 's'})`
      : `(showing ${shown.length} of ${rows.length} rows — raise maxRows to see more)`,
  ].join('\n');
}

/** Wrap a plain string as an MCP tool result. */
export function text(value) {
  return { content: [{ type: 'text', text: String(value) }] };
}

/** Wrap a failure as an MCP tool result. Errors are reported in-band so the
 *  model can read and act on them, not swallowed as protocol faults. */
export function failure(value) {
  return { content: [{ type: 'text', text: String(value) }], isError: true };
}

/**
 * Run an MCP server.
 *
 * @param {object} options
 * @param {string} options.name        server name reported to the client
 * @param {string} options.version     server version
 * @param {Array}  options.tools       [{ name, description, inputSchema, handler }]
 * @param {string} [options.instructions]
 */
export function serve({ name, version, tools, instructions }) {
  const registry = new Map(tools.map((t) => [t.name, t]));

  // Claim fd 1 for protocol frames only. Anything else that reaches for stdout
  // — a driver's console.log, a stray debug print — is rerouted to stderr, so a
  // single careless write can't desynchronise the stream. Child processes that
  // inherit fd 1 directly bypass this, which is why they must be spawned with
  // their stdout piped or pointed at fd 2.
  const writeFrame = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, encoding, callback) => (
    process.stderr.write(chunk, encoding, callback)
  );

  const send = (message) => {
    writeFrame(`${JSON.stringify(message)}\n`);
  };

  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });

  const replyError = (id, code, message) => send({
    jsonrpc: '2.0', id, error: { code, message },
  });

  // Set MCP_DEBUG_LOG=<path> to record every method a client asks for. Useful
  // for finding out what a host actually negotiates, rather than guessing.
  const debugLog = process.env.MCP_DEBUG_LOG;
  const trace = debugLog
    ? (method) => {
      try {
        appendFileSync(debugLog, `${name}\t${method}\n`);
      } catch { /* tracing must never break the server */ }
    }
    : () => {};

  async function handle(message) {
    const { id, method, params } = message;
    trace(method);
    // Notifications carry no id and must never be answered.
    const isNotification = id === undefined || id === null;

    switch (method) {
      case 'initialize': {
        const asked = params?.protocolVersion;
        reply(id, {
          protocolVersion: SUPPORTED.includes(asked) ? asked : LATEST,
          // Tools only. Prompts and resources were tried and removed: a real
          // session negotiates both but loads neither into the model's context,
          // so they only ever duplicated the skills, which do auto-trigger.
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version },
          ...(instructions ? { instructions } : {}),
        });
        return;
      }

      case 'notifications/initialized':
      case 'notifications/cancelled':
        return;

      case 'ping':
        if (!isNotification) reply(id, {});
        return;

      case 'tools/list':
        reply(id, {
          tools: tools.map(({ name: n, description, inputSchema }) => ({
            name: n, description, inputSchema,
          })),
        });
        return;

      case 'tools/call': {
        const tool = registry.get(params?.name);
        if (!tool) {
          replyError(id, JSON_RPC.invalidParams, `Unknown tool: ${params?.name}`);
          return;
        }
        try {
          const result = await tool.handler(params?.arguments ?? {});
          reply(id, result);
        } catch (err) {
          // A thrown handler is a tool-level failure, not a transport fault.
          reply(id, failure(`${tool.name}: ${errorMessage(err)}`));
        }
        return;
      }

      default:
        if (!isNotification) {
          replyError(id, JSON_RPC.methodNotFound, `Method not found: ${method}`);
        }
    }
  }

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          send({
            jsonrpc: '2.0',
            id: null,
            error: { code: JSON_RPC.parseError, message: 'Invalid JSON' },
          });
          newline = buffer.indexOf('\n');
          continue;
        }
        // Batches are legal JSON-RPC; handle each element independently.
        const batch = Array.isArray(message) ? message : [message];
        for (const entry of batch) {
          handle(entry).catch((err) => {
            log(`[${name}] unhandled: ${errorMessage(err)}`);
            if (entry?.id !== undefined && entry?.id !== null) {
              replyError(entry.id, JSON_RPC.internalError, errorMessage(err));
            }
          });
        }
      }
      newline = buffer.indexOf('\n');
    }
  });

  process.stdin.on('end', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  log(`[${name}] ready — ${tools.length} tools`);
}
