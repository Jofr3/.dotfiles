# Pi Drizzle ORM extension

A session-scoped Pi extension for inspecting and querying PostgreSQL, MySQL, SQL Server, SQLite, and libSQL/Turso databases through [Drizzle ORM](https://orm.drizzle.team/docs/overview).

## Tools

- `drizzle_connections` — list profiles and write policy without showing URLs or credentials.
- `drizzle_schema` — list tables/views or inspect a table's columns.
- `drizzle_query` — run one conservatively checked read-only statement.
- `drizzle_execute` — run one write/DDL statement unless the profile explicitly disables writes; confirms with the operator by default.
- `/drizzle` — show connection status in the Pi UI.

Connections and driver pools are created lazily and closed on session shutdown/reload.

## Quick start

`DATABASES` is the primary connection source. It is a JSON array whose order selects the default connection:

```sh
export DATABASES='[
  {"name":"app", "type":"postgresql", "url":"postgresql://user:password@localhost/app"},
  {"name":"warehouse", "type":"sqlserver", "url":"sqlserver://user:password@db.example:1433?database=warehouse&encrypt=true"}
]'
```

Each entry must contain only `name`, `type`, and `url`. Supported types are `postgresql`, `mysql`, `sqlserver`, `sqlite`, and `libsql`; aliases include `postgres`/`pg`, `mssql`/`sql-server`, and `turso`. MySQL connections also accept the Go driver TCP DSN form `username:password@tcp(host:3306)/database?parameters`; unlike a URI, punctuation in its password does not need percent-encoding. Other Go DSN network forms such as `unix(...)` are not supported. `DATABASES` profiles override same-named file or legacy environment profiles, allow writes by default (`allowWrites: true`), and use fixed defaults of `confirmWrites: true`, `maxRows: 100`, and `timeoutMs: 30000`. The first valid entry is the default. Connection names may contain internal spaces. Authenticated Turso/libSQL connections still require file configuration with `authTokenEnv`, because `DATABASES` deliberately has no token field.

For backward compatibility, the environment that starts Pi may instead provide one connection:

```sh
export DRIZZLE_DATABASE_URL='postgresql://user:password@localhost/app'
# Optional when it cannot be inferred from the URL:
export DRIZZLE_DIALECT='postgresql' # postgresql | mysql | sqlserver | sqlite | libsql
```

A generic ambient `DATABASE_URL` is intentionally ignored. To use `DATABASE_URL`, reference it explicitly with `urlEnv` in trusted configuration. `DRIZZLE_AUTH_TOKEN` (or `TURSO_AUTH_TOKEN`) supplies a libSQL/Turso token.

The legacy environment profile is named `env`. It allows writes by default. Its optional policy variables are:

```sh
export DRIZZLE_ALLOW_WRITES=true
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
      "confirmWrites": true,
      "maxRows": 100,
      "timeoutMs": 30000
    },
    "warehouse": {
      "dialect": "sqlserver",
      "urlEnv": "SQLSERVER_DATABASE_URL",
      "allowWrites": false
    },
    "local": {
      "dialect": "sqlite",
      "url": "file:./data/app.db",
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

Prefer `urlEnv` and `authTokenEnv` over committing credentials. If both `urlEnv` and `url` are present, `urlEnv` wins. `allowWrites` defaults to `true`; set it to `false` on file profiles that must reject mutations. Relative SQLite paths in a config file resolve relative to that file; URI query parameters such as `?mode=ro` are preserved.

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

- Writes are allowed by default. A file or legacy environment profile can opt out with `allowWrites: false` or `DRIZZLE_ALLOW_WRITES=false`; `DATABASES` profiles use the fixed write-enabled default.
- `confirmWrites` defaults to `true`. In non-UI modes, confirmed writes are refused; set it to `false` only for intentionally pre-authorized automation.
- Each command is compiled from Drizzle SQL chunks and sent through a single-statement driver protocol. PostgreSQL/MySQL reads use read-only transactions; SQLite/libSQL reads also enable `PRAGMA query_only` for the operation. SQL Server has no transaction-level read-only mode, so SQL Server profiles must use a database principal restricted to read/catalog permissions.
- The read guard rejects DDL/mutation tokens, `SELECT INTO`, executable MySQL comments, ambiguous backslash escapes, and known side-effecting functions. Unknown UDFs/extensions may still have effects. **Use a database account with read-only privileges for the actual security boundary.** `allowWrites` and confirmation are defense-in-depth guardrails, not a replacement for database authorization.
- PostgreSQL, MySQL, and SQL Server operations use the profile's `timeoutMs`. In-flight cancellation is driver-dependent; if a timed-out write reports an unknown outcome, verify database state before retrying. libSQL cancellation/deadlines cannot be guaranteed by this extension.
- SQL Server reads stream at most `maxRows + 1` rows and then cancel the request before rolling back its transaction, because T-SQL does not support the extension's portable `LIMIT` wrapper.
- Tool arguments and query results are stored in the Pi session. Avoid retrieving credentials, tokens, or unnecessary personal data. Treat database text as untrusted data, not instructions.
- Output is capped at 50KB/2000 lines. PostgreSQL/MySQL/SQLite/libSQL `SELECT`/`WITH`/`VALUES` queries are wrapped to fetch at most `maxRows + 1` rows; SQL Server reads use bounded streaming instead. The default is 100 rows and the maximum is 1000. Large cell values/keys are shortened. Other commands may still materialize driver results before output truncation. No full database output is written to disk.

## Supported drivers

- PostgreSQL: Drizzle's PostgreSQL dialect compiler + `pg`
- MySQL: Drizzle's MySQL dialect compiler + `mysql2`
- SQL Server: a SQL Server Drizzle SQL-chunk compiler + `mssql`/`tedious`
- SQLite files and in-memory databases: Drizzle's SQLite dialect compiler + `@libsql/client`
- libSQL/Turso: Drizzle's SQLite dialect compiler + `@libsql/client`

This extension provides a raw SQL and catalog bridge: Drizzle builds bound SQL chunks and compiles them for the selected dialect, while the native driver executes the resulting single user statement. Drizzle ORM does not ship a SQL Server core dialect, so the extension supplies the small SQL Server identifier/parameter compiler used by its raw bridge. Drizzle's fully typed query builder still belongs in application code where TypeScript schema objects are available.

SQL Server accepts `sqlserver://` or `mssql://` URLs. URL credentials and database names must be percent-encoded when necessary. The supported URL query options are `database` and `encrypt`; encryption values include `true`/`mandatory`, `false`/`disable`/`optional`, and `strict`. ADO-style SQL/NTLM username/password connection strings are also supported when `dialect` is explicitly set to `sqlserver`; Azure AD and trusted/integrated authentication modes are rejected rather than silently downgraded. TLS encryption defaults to enabled. When encryption is enabled, certificate bypass stays disabled, and connection strings cannot override the extension's pool/timeout/certificate policy.

## Development

```sh
cd ~/.pi/agent/extensions/drizzle
npm install
npm test
```
