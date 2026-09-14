---
name: sqlit
description: Interact with project databases using the sqlit CLI, including schema inspection, SQL queries and files, exports, and authorized data changes. Use for SQL Server, MySQL, PostgreSQL, and Cloudflare D1 database access, or when sqlit is explicitly requested. Credentials usually come from the DATABASES environment variable. Do not select for SQL code editing alone or when the user explicitly chooses another database client.
---

# sqlit

Use `sqlit query` for commands that execute SQL and exit. Bare `sqlit`,
`sqlit -c NAME`, connection URLs, and `sqlit connect PROVIDER` open the TUI;
use those when interactive exploration is requested.

The configured drivers are SQL Server, MySQL, PostgreSQL, and Cloudflare D1.
Their provider names are `mssql`, `mysql`, `postgresql`, and `d1` respectively.
Check the installed surface when starting work or troubleshooting a mismatch:

```bash
sqlit --version
sqlit query --help
sqlit connections add mssql --help  # substitute the selected provider
```

The command details below were checked against sqlit 1.6.4. A provider appearing
in help does not prove its driver is installed. Diagnose missing-driver errors
for the selected provider instead of assuming all advertised providers work.

## Resolve credentials

Start with `DATABASES`. In this setup it is a JSON array of records containing
`name`, `type`, and `url`. The field named `url` can contain a driver-specific
DSN rather than a URL. Parse it as data; do not execute it or print its contents.

List candidate names and types without exposing connection strings:

```bash
python3 - <<'PY'
import json, os
raw = os.environ.get("DATABASES")
try:
    records = json.loads(raw) if raw else []
except json.JSONDecodeError:
    raise SystemExit("DATABASES is not valid JSON; contents withheld.")
if not isinstance(records, list):
    raise SystemExit("DATABASES has an unexpected structure; contents withheld.")
for record in records:
    if isinstance(record, dict):
        print(json.dumps({key: record.get(key) for key in ("name", "type")}))
PY
```

Match the record to the current project and requested environment using its
name and project configuration. Select the exact record before parsing secrets.
Do not use the first entry, silently substitute production for development, or
test several accounts until one connects. Resolve ambiguous matches with the user.

If the variable is absent, empty, malformed, or has no usable project record,
search the project's files. Include ignored and hidden configuration files:

```bash
rg --files --hidden --no-ignore -g '.env*' -g '.dev.vars*' \
  -g '*compose*.yml' -g '*compose*.yaml' -g 'wrangler.*' \
  -g '*config*' -g '*settings*' -g '*database*' \
  -g '!.git/**' -g '!node_modules/**' -g '!.venv/**' -g '!vendor/**' \
  -g '!dist/**' -g '!build/**' .
```

Inspect relevant `.env` files, application/ORM settings, Compose configuration,
and, for D1, Wrangler configuration and `.dev.vars*`. Follow references to
project-specific secret files or environment variables as needed. Parse secret
values inside the process using them; report only redacted connection metadata.
Do not source an unfamiliar environment file as shell code. Example files can
identify required variables, but placeholder credentials are not usable records.

If the search does not establish a complete connection, ask for the missing
credentials or their local file/environment-variable location. For a server
database this typically means host, database, user, password/auth method, and
any nondefault port/TLS settings. For D1 it means Cloudflare account ID, API
token, and database name. An authentication failure on an existing match is
reason to diagnose that connection or ask for updated credentials.

Read [references/connections.md](references/connections.md) when translating a
record or setting up a connection. It covers the actual MySQL Go DSNs, SQL
Server URL parameters, PostgreSQL URLs, D1, and temporary headless profiles.

## Run queries

Headless queries require a saved connection **name**, not a URL in `-c`:

```bash
sqlit connections list
sqlit query -c PROJECT_ENV -q 'SELECT 1 AS ok' --format json --limit 10
sqlit query -c PROJECT_ENV -f ./report.sql --format csv > ./report.csv
```

Reuse a named connection only when it matches the resolved project and target.
For task-only credentials, use the temporary profile pattern in the connection
reference. Keep passwords, tokens, and full DSNs out of command arguments,
generated source files, logs, and replies. Preserve TLS/authentication options
from the source connection; resolve unsupported options instead of dropping them.

Inspect the real schema before composing queries. MySQL, PostgreSQL, and SQL
Server expose `information_schema.tables` and `information_schema.columns`;
filter by the relevant schema/table. D1 uses SQLite SQL: inspect `sqlite_schema`
and `PRAGMA table_info(...)`. Use `TOP (N)` on SQL Server and `LIMIT N` on
MySQL, PostgreSQL, and D1 for small samples, with an appropriate `ORDER BY`.

`--format` accepts `table`, `json`, and `csv`. `--limit` defaults to 1000 fetched
rows; `--limit 0` removes the fetch cap. This is not a server-side execution or
mutation limit. Use SQL predicates and aggregates to bound the work. Keep a
small fetch limit for exploration and remove it only for a complete result or
export the task calls for. Table output may shorten long cell values; use JSON
or CSV when exact values matter.

Read a SQL file before executing it. Do not assume that an arbitrary migration
file, multiple statements, or explicit transactions work identically through
every driver, particularly D1's HTTP API.

## Changes and results

Execute writes when the user's request authorizes the change and the target
and affected scope are clear; existing authorization does not need repeating.
For inspection or analysis requests, keep SQL read-only. Headless execution is
not protected by the TUI's confirmation prompts. Before a write, inspect the
SQL and affected rows, use a transaction where supported, and verify the result.
If a write times out or its outcome is uncertain, check its effect before any
retry; do not replay it automatically.

Check exit status before trusting output. Errors can appear on stdout; JSON
and CSV row-count/truncation notices appear on stderr. Preserve those notices,
and do not present a capped result as complete. Report the project/environment,
relevant result or affected row count, and any truncation or unresolved error.
