# Connection configuration

Credentials come from the session's environment variables. Nothing is read from `.env` files, config
files, or shell history.

## The multi-connection variable

`DATABASES` is the primary variable and holds a **JSON array** of connections:

```bash
export DATABASES='[
  {"name": "prod",    "url": "postgres://app:pw@db.internal:5432/shop", "readonly": true},
  {"name": "staging", "url": "postgres://app:pw@stg.internal:5432/shop"},
  {"name": "local",   "url": "file:./dev.db", "default": true},
  {"name": "edge",    "url": "libsql://shop-acme.turso.io", "authToken": "eyJ..."}
]'
```

`DB_CONNECTIONS`, `DATABASE_CONNECTIONS` and `DATABASE_URLS` are accepted as aliases. If several are
set, their connections are merged.

Three other shapes are accepted for convenience:

```bash
# Object map — the key becomes the connection name
export DATABASES='{"prod":"postgres://...","local":"file:./dev.db"}'

# Array of bare URLs — names are derived from the database name
export DATABASES='["postgres://app:pw@db:5432/shop", "file:./dev.db"]'

# Newline-separated URLs
export DATABASES='postgres://app:pw@db:5432/shop
file:./dev.db'
```

## Single-connection variables

Used only when no multi-connection variable is set. Checked in this order:

`DRIZZLE_DATABASE_URL`, `DATABASE_URL`, `DB_URL`, `POSTGRES_URL`, `POSTGRESQL_URL`,
`NEON_DATABASE_URL`, `MYSQL_URL`, `MYSQL_DATABASE_URL`, `SQLITE_URL`, `SQLITE_PATH`,
`TURSO_DATABASE_URL`, `LIBSQL_URL`, `MSSQL_URL`.

`TURSO_AUTH_TOKEN` supplies the auth token for libsql connections that do not carry one.

## Connection fields

| Field | Meaning |
| --- | --- |
| `name` | Label used by `--conn`. Defaults to the database name, then `conn1`, `conn2`, … |
| `url` | Connection string. Aliases: `connectionString`, `uri`, `dsn`, `file`, `path` |
| `dialect` | `postgresql` \| `mysql` \| `sqlite` \| `mssql` \| `singlestore` \| `cockroach` \| `turso` |
| `driver` | Overrides inference — see the driver table below |
| `schema` | Default schema / search path for catalog commands |
| `authToken` | libsql / Turso token. Aliases: `auth_token`, `token` |
| `ssl` | `true`, `false`, `"require"`, or a driver-specific object |
| `readonly` | `true` blocks every mutating statement on this connection |
| `default` | `true` marks the connection used when `--conn` is omitted |
| `options` | Extra options merged into the underlying driver constructor |

Instead of a `url` you may give discrete parts: `host` (or `server`), `port`, `user` (or `username`),
`password`, `database` (or `db`).

`DATABASES_DEFAULT=<name>` picks the default connection without editing the JSON.

## Dialect and driver inference

The driver is derived from the URL scheme unless `driver` says otherwise:

| URL scheme | Driver | drizzle import | npm package |
| --- | --- | --- | --- |
| `postgres:` `postgresql:` `pg:` `cockroachdb:` | `postgres-js` | `drizzle-orm/postgres-js` | `postgres` |
| — (opt in with `"driver": "node-postgres"`) | `node-postgres` | `drizzle-orm/node-postgres` | `pg` |
| `https:` on a `*.neon.tech` host | `neon-http` | `drizzle-orm/neon-http` | `@neondatabase/serverless` |
| `mysql:` `mariadb:` `singlestore:` | `mysql2` | `drizzle-orm/mysql2` | `mysql2` |
| `file:` `sqlite:`, or a `.db`/`.sqlite` path, or `:memory:` | `better-sqlite3` | `drizzle-orm/better-sqlite3` | `better-sqlite3` |
| `libsql:` `turso:`, other `http(s):` | `libsql` | `drizzle-orm/libsql` | `@libsql/client` |
| `mssql:` `sqlserver:` | `mssql` | `drizzle-orm/mssql` | `mssql` |

`better-sqlite3` compiles a native addon on first install. If that fails on this machine, use
`libsql` instead — it reads local files too (`"url": "file:./dev.db", "driver": "libsql"`) and ships
prebuilt binaries.

The `mssql` path is wired up but has had less real-world exercise than the postgres, mysql and sqlite
paths; treat unexpected errors there as a driver-shape problem rather than a connection problem.

## Dependency resolution

Modules resolve in this order:

1. The current working directory's `node_modules` — so a project's pinned drizzle version wins.
2. `~/.cache/claude-drizzle-db` (override with `DRIZZLE_DB_CACHE_DIR`).
3. `npm install` into that cache directory.

Set `DRIZZLE_DB_NO_INSTALL=1` to forbid step 3; missing packages then raise an error naming the
package to install.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `No database connections found in the session environment` | No variable set — ask the user to export `DATABASES` or `DATABASE_URL` |
| `Multiple connections configured — pass --conn <name>` | Add `--conn`, or mark one connection `"default": true` |
| `DATABASES is not valid JSON` | Usually shell quoting: wrap the whole value in single quotes |
| `Cannot determine a driver for connection …` | Non-standard URL scheme — add an explicit `"driver"` |
| `timed out after 30000ms` | Unreachable host or missing VPN; raise with `--timeout` if the query is genuinely slow |
