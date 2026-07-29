---
name: drizzle-db
description: Use for ANY task that touches a database — testing a connection, listing tables, describing a schema, reading/counting rows, checking what data actually exists, or writing drizzle-orm schema/query/migration code. Also use proactively when debugging: whenever an issue depends on real data (does that user exist, what state is the order in, is that column null, did the row get written), query the database for the missing context instead of guessing. Credentials come from session environment variables (DATABASES may hold an array of connections; DATABASE_URL holds one). Triggers on any mention of database, db, SQL, table, row, record, schema, migration, seed, postgres/mysql/sqlite/turso/neon/supabase, drizzle/drizzle-kit/db.select, or phrasings like "test the database connection", "list the last users created", "is that user in the db", "what does the data look like", "check prod data", "why is this record wrong".
version: 1.1.0
---

# Drizzle DB

Talk to SQL databases through [drizzle-orm](https://orm.drizzle.team/docs/overview), with credentials
supplied by the session's environment variables. Covers two jobs:

1. **Live database access** — inspect and query a real database via the bundled `drizzle-db` CLI.
2. **Writing drizzle code** — schemas, queries and migrations in the user's project.

## Reach for this whenever data is the answer

Anything the database can settle, ask the database — don't reason from the code alone, and don't ask
the user to paste a row. The CLI is read-only by default and cheap to run, so a query is almost always
faster than a guess.

- **Direct requests** — "test the database connection", "list the last 10 users created", "how many
  orders are pending", "what columns does `invoices` have".
- **Debugging** — a bug report, a failing test, or a stack trace whose cause depends on real state.
  Before theorising, pull the facts: does the row exist, what is its actual state, is the column null,
  is the foreign key dangling, when was it last updated, does the live schema match the code's
  expectations. A `SELECT` that disproves a theory in one round-trip is worth more than three rounds
  of speculation.
- **Verifying your own work** — after writing an insert/update path, a migration, or a seed script,
  query the table to confirm what actually landed.
- **Grounding claims** — if you are about to say "the table probably has…" or "the user is likely…",
  stop and run `describe` or a `select` instead.

Read-only exploration needs no permission. Anything that writes still follows the rules below.

## 1. Live database access

Everything runs through one script. Always use it rather than hand-rolling a connection script:

```bash
node ~/.claude/skills/drizzle-db/scripts/drizzle-db.mjs <command> [options]
```

It resolves `drizzle-orm` and the right driver from the project's `node_modules` first, and falls back
to a shared cache in `~/.cache/claude-drizzle-db`, installing on demand. Nothing is added to the
user's project.

### Start every session here

```bash
node ~/.claude/skills/drizzle-db/scripts/drizzle-db.mjs connections
```

This prints every connection the session exposes, with passwords redacted. It tells you the names to
pass to `--conn`, which dialect each one is, and which are marked `readonly`. If it reports no
connections, tell the user which variable to set (see `references/connections.md`) — do not go hunting
for credentials in `.env` files, config files, or shell history.

### Commands

| Command | What it does |
| --- | --- |
| `connections` | List configured connections (credentials redacted) |
| `ping [--all]` | Verify connectivity, report server version |
| `tables [--schema s]` | List tables and views |
| `describe <table>` | Columns, constraints, indexes. Accepts `schema.table` |
| `count <table>` | Row count |
| `query <sql>` | Run a statement. `-` reads it from stdin |
| `query-file <path>` | Run SQL from a file |

Useful options: `--conn <name>` (required when several connections exist), `--json`,
`--max-rows <n>` (default 100), `--max-width <n>` (default 80), `--timeout <ms>` (default 30000).

For multi-line or quote-heavy SQL, pipe it in rather than fighting shell escaping:

```bash
node ~/.claude/skills/drizzle-db/scripts/drizzle-db.mjs query - --conn prod <<'SQL'
select u.email, count(o.id) as orders
from users u left join orders o on o.user_id = u.id
group by 1 order by 2 desc limit 20
SQL
```

### Rules for touching real data

These are enforced by the script, but hold to them yourself as well:

- **Reads are free; writes are not.** `INSERT`/`UPDATE`/`DELETE`/`MERGE` are refused without
  `--write`, and `DROP`/`TRUNCATE`/`ALTER`/`GRANT`/`REVOKE` also need `--force`. Before passing either
  flag, tell the user exactly which statement will run against which named connection and get
  confirmation. Never add them speculatively.
- **Confirm the target.** When more than one connection exists, `--conn` is mandatory — the script
  will not guess. Re-read the connection name before any write; `prod` and `staging` differ by four
  characters.
- **Never print credentials.** Report connections using the script's redacted output. Do not echo
  `DATABASES`/`DATABASE_URL`, do not `env | grep`, and do not copy a URL with a password
  into a file, a commit, or a summary.
- **Bound your reads.** Add `limit` to exploratory queries on unfamiliar tables.
- **A `readonly` connection is a hard stop.** Do not work around it by adding a duplicate connection.

## 2. Writing drizzle code in a project

When the task is code rather than a live lookup:

- Read the project's existing schema before adding to it — usually `src/db/schema.ts`,
  `drizzle/schema.ts`, or wherever `drizzle.config.ts` points. Match its table naming, id strategy,
  and timestamp conventions instead of importing a different house style.
- Use the project's installed `drizzle-orm` version and its own scripts (`package.json`) for
  drizzle-kit commands.
- If the database exists but the project has no schema file, `drizzle-kit pull` generates one from the
  live database — better than writing it by hand from `describe` output.

Reference material, read as needed:

- `references/connections.md` — the session-variable format, every accepted field, dialect/driver inference
- `references/queries.md` — select/insert/update/delete, joins, relational queries, transactions, raw SQL
- `references/schema.md` — table, column, index, relation and enum definitions per dialect
- `references/migrations.md` — drizzle-kit config and the generate/migrate/push/pull workflows

## Choosing between the two

If the user asks *what is in* the database — data, row counts, schema shape, a sanity check — use the
CLI and answer directly. Do not write a throwaway script in their repo to answer a question.

If the user asks for *code that talks to* the database, write it into their project using their
drizzle version, and use the CLI to verify the schema you are coding against actually matches
production.

If the user asks about *something else entirely* but the answer turns on real data — a bug, a wrong
number, unexpected behaviour — use the CLI to gather the facts first, then continue with the actual
task. Say which connection you queried and what you found, so the reasoning stays checkable.
