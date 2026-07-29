# Migrations with drizzle-kit

Docs: <https://orm.drizzle.team/docs/kit-overview>

## Config

`drizzle.config.ts` at the project root:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',            // postgresql | mysql | sqlite | turso | singlestore | mssql
  schema: './src/db/schema.ts',     // file, glob, or directory
  out: './drizzle',                 // where migration files land
  dbCredentials: { url: process.env.DATABASE_URL! },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
```

Turso needs a token: `dbCredentials: { url: ..., authToken: process.env.TURSO_AUTH_TOKEN }`.

With several databases, keep one config per target (`drizzle.prod.config.ts`) and select it with
`--config`. Match the `url` to the connection you are actually targeting — this skill's session
variables and the drizzle-kit config are separate sources of truth and can drift apart.

## Commands

| Command | Effect |
| --- | --- |
| `drizzle-kit generate` | Diff schema against the last snapshot, write a new SQL migration |
| `drizzle-kit migrate` | Apply pending migration files |
| `drizzle-kit push` | Diff and apply straight to the database, no migration file |
| `drizzle-kit pull` | Introspect the database and generate a drizzle schema from it |
| `drizzle-kit check` | Detect collisions between generated migrations |
| `drizzle-kit up` | Upgrade older snapshot files to the current format |
| `drizzle-kit export` | Print the schema as raw SQL DDL |
| `drizzle-kit studio` | Local database browser UI |

Run them through the project's own tooling (`npx drizzle-kit …`, or the `package.json` script) so the
project's pinned version is used.

## Which workflow

**generate + migrate** — for anything with more than one environment. Migrations are reviewable,
versioned, and replayable. This is the default choice.

```bash
npx drizzle-kit generate --name add_user_roles
# read drizzle/0003_add_user_roles.sql before applying it
npx drizzle-kit migrate
```

**push** — local development and prototypes only. It applies the diff immediately with no artifact,
so there is nothing to review and nothing to roll back. Never run it against a shared or production
database.

**pull** — the database already exists and the code does not describe it yet. Generates schema plus a
baseline snapshot, so later `generate` runs diff from reality rather than from empty.

## Applying migrations from code

```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
await migrate(db, { migrationsFolder: './drizzle' });
```

Use a single dedicated connection for this, not a shared pool.

## Before running anything destructive

`generate` happily emits `DROP COLUMN` / `DROP TABLE` when a schema entry disappears — including when
it disappeared by accident. So:

1. Read the generated SQL file before applying it.
2. Rename columns in two steps (add new, backfill, drop old) rather than one, unless downtime is fine.
3. Confirm with the user before applying anything that drops or rewrites a column on a database that
   holds real data.
4. Verify the result with this skill's CLI: `drizzle-db.mjs describe <table> --conn <name>`.
