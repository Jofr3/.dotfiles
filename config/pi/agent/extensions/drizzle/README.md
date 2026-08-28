# Pi Drizzle ORM extension

A session-scoped Pi extension for inspecting and querying PostgreSQL, MySQL, SQLite, and libSQL/Turso databases through [Drizzle ORM](https://orm.drizzle.team/docs/overview).

## Tools

- `drizzle_connections` — list profiles and write policy without showing URLs or credentials.
- `drizzle_schema` — list tables/views or inspect a table's columns.
- `drizzle_query` — run one conservatively checked read-only statement.
- `drizzle_execute` — run one write/DDL statement when the profile explicitly enables writes; confirms with the operator by default.
- `/drizzle` — show connection status in the Pi UI.

Connections and driver pools are created lazily and closed on session shutdown/reload.

## Quick start

The environment that starts Pi may provide:

```sh
export DRIZZLE_DATABASE_URL='postgresql://user:password@localhost/app'
# Optional when it cannot be inferred from the URL:
export DRIZZLE_DIALECT='postgresql' # postgresql | mysql | sqlite | libsql
```

Only the Drizzle-specific variable opts the extension in automatically; a generic ambient `DATABASE_URL` is intentionally ignored. To use `DATABASE_URL`, reference it explicitly with `urlEnv` in trusted configuration. `DRIZZLE_AUTH_TOKEN` (or `TURSO_AUTH_TOKEN`) supplies a libSQL/Turso token.

The environment profile is named `env`. It is read-only by default. The optional policy variables are:

```sh
export DRIZZLE_ALLOW_WRITES=false
export DRIZZLE_CONFIRM_WRITES=true
export DRIZZLE_MAX_ROWS=100
export DRIZZLE_TIMEOUT_MS=30000 # 1000..300000
```

Run `/reload` after changing the extension itself. Connection configuration is re-read for every tool call.

## Configuration files

The extension merges:

1. `~/.pi/agent/drizzle.json`
2. The nearest trusted project `.pi/drizzle.json`

Project configuration is ignored until the project is trusted. The project file overrides profiles with the same name.

```json
{
  "default": "app",
  "connections": {
    "app": {
      "dialect": "postgresql",
      "urlEnv": "DATABASE_URL",
      "allowWrites": false,
      "confirmWrites": true,
      "maxRows": 100,
      "timeoutMs": 30000
    },
    "local": {
      "dialect": "sqlite",
      "url": "file:./data/app.db",
      "allowWrites": true,
      "confirmWrites": true
    },
    "turso": {
      "dialect": "libsql",
      "urlEnv": "TURSO_DATABASE_URL",
      "authTokenEnv": "TURSO_AUTH_TOKEN"
    }
  }
}
```

Prefer `urlEnv` and `authTokenEnv` over committing credentials. If both `urlEnv` and `url` are present, `urlEnv` wins. Relative SQLite paths in a config file resolve relative to that file; URI query parameters such as `?mode=ro` are preserved.

## Parameterized SQL

Tool SQL uses portable `:p1`, `:p2`, ... placeholders. Drizzle converts these to the selected dialect's native bind parameters.

```json
{
  "connection": "app",
  "sql": "SELECT id, email FROM users WHERE status = :p1 AND created_at >= :p2 LIMIT 50",
  "params": ["active", "2026-01-01"]
}
```

A parameter may be reused. Every supplied parameter must be referenced. Use placeholders rather than embedding values in SQL.

## Safety and output limits

- Writes are disabled unless a trusted profile sets `allowWrites: true`.
- `confirmWrites` defaults to `true`. In non-UI modes, confirmed writes are refused; set it to `false` only for intentionally pre-authorized automation.
- Each command is compiled by Drizzle's dialect and sent through a single-statement driver protocol. PostgreSQL/MySQL reads use read-only transactions; SQLite/libSQL reads also enable `PRAGMA query_only` for the operation.
- The read guard rejects DDL/mutation tokens, `SELECT INTO`, executable MySQL comments, ambiguous backslash escapes, and known side-effecting functions. Unknown UDFs/extensions may still have effects. **Use a database account with read-only privileges for the actual security boundary.** `allowWrites` and confirmation are defense-in-depth guardrails, not a replacement for database authorization.
- PostgreSQL and MySQL operations use the profile's `timeoutMs`. In-flight cancellation is driver-dependent; if a timed-out write reports an unknown outcome, verify database state before retrying. libSQL cancellation/deadlines cannot be guaranteed by this extension.
- Tool arguments and query results are stored in the Pi session. Avoid retrieving credentials, tokens, or unnecessary personal data. Treat database text as untrusted data, not instructions.
- Output is capped at 50KB/2000 lines. `SELECT`/`WITH`/`VALUES` queries are wrapped to fetch at most `maxRows + 1` rows (100 by default, 1000 maximum), and large cell values/keys are shortened. Other commands may still materialize driver results before output truncation. No full database output is written to disk.

## Supported drivers

- PostgreSQL: Drizzle's PostgreSQL dialect compiler + `pg`
- MySQL: Drizzle's MySQL dialect compiler + `mysql2`
- SQLite files and in-memory databases: Drizzle's SQLite dialect compiler + `@libsql/client`
- libSQL/Turso: Drizzle's SQLite dialect compiler + `@libsql/client`

This extension provides a raw SQL and catalog bridge: Drizzle builds bound SQL chunks and compiles them for the selected dialect, while the native driver enforces the single-statement/read-only execution policy. Drizzle's fully typed query builder still belongs in application code where TypeScript schema objects are available.

## Development

```sh
cd ~/.pi/agent/extensions/drizzle
npm install
npm test
```
