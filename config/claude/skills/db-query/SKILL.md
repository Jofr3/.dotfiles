---
name: db-query
description: >
  Interact with databases using CLI tools (mysql, psql, sqlcmd, sqlite3).
  Use this skill whenever the user wants to query, inspect, modify, or manage
  a database — whether they ask to "check the database", "run a query",
  "look up a record", "update a row", "show me the tables", "what's in the
  users table", or any variation involving SQL or database operations.
  Also trigger when the user mentions table names, column names, SQL keywords,
  or wants to debug data issues. Even casual references like "check if that
  record exists" or "how many rows in X" should trigger this skill.
  Supports MySQL, PostgreSQL, SQL Server, and SQLite.
---

# Database Query Skill

Execute SQL queries against databases using the appropriate CLI tool. Read
credentials from the project's `.claude/auth/database.json` file and build
the correct command for the database engine.

## Credentials File

Look for credentials at `.claude/auth/database.json` relative to the project
root. The file structure:

```json
{
  "DB_CONNECTION": "mysql|pgsql|sqlsrv|sqlite",
  "DB_HOST": "hostname",
  "DB_PORT": 3306,
  "DB_DATABASE": "database_name",
  "DB_USERNAME": "user",
  "DB_PASSWORD": "password"
}
```

For SQLite, only `DB_CONNECTION` and `DB_DATABASE` (the file path) are needed.

If the credentials file doesn't exist, ask the user for connection details
before proceeding.

## CLI Tool Mapping

| DB_CONNECTION | CLI Tool | Notes |
|---|---|---|
| `mysql` | `mysql` | Default port 3306 |
| `pgsql` | `psql` | Default port 5432 |
| `sqlsrv` | `sqlcmd` | Default port 1433 |
| `sqlite` | `sqlite3` | File-based, no host/port |

## Building Commands

### MySQL
```bash
mysql -h "$HOST" -P "$PORT" -u "$USER" --password="$PASS" "$DB" << 'EOSQL'
SQL_QUERY;
EOSQL
```
Using a heredoc with single-quoted delimiter (`'EOSQL'`) prevents shell
expansion inside the SQL. The `--password="..."` form with double quotes
handles special characters (`#`, `!`, `*`, `^`) in passwords reliably.

For tabular output add `-t`. For vertical output add `-E`.
For batch/script output (no borders) omit `-t`.

### PostgreSQL
```bash
PGPASSWORD="$PASS" psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -c "SQL_QUERY"
```

### SQL Server
```bash
sqlcmd -S "$HOST,$PORT" -U "$USER" -P "$PASS" -d "$DB" -Q "SQL_QUERY"
```

### SQLite
```bash
sqlite3 "$DB_PATH" "SQL_QUERY"
```
Use `.headers on` and `.mode column` for readable output:
```bash
sqlite3 "$DB_PATH" -header -column "SQL_QUERY"
```

## Safety Rules for Destructive Operations

**CRITICAL**: Before executing any query that modifies data or schema, you MUST
show the full SQL to the user and ask for explicit confirmation using the
AskUserQuestion tool. Never run destructive queries silently.

Destructive operations include:
- `INSERT`, `UPDATE`, `DELETE`
- `DROP`, `ALTER`, `TRUNCATE`
- `CREATE` (tables, indexes, etc.)
- `RENAME`
- `REPLACE`
- `GRANT`, `REVOKE`
- Any query that is NOT a pure read operation

Read-only operations that can run without confirmation:
- `SELECT`
- `SHOW` (tables, databases, columns, indexes, status, etc.)
- `DESCRIBE` / `DESC` / `EXPLAIN`
- `USE`
- `SET` (session variables for formatting)

When asking for confirmation, present:
1. The exact SQL that will be executed
2. Which database it targets
3. A brief note on what it will affect (e.g., "This will delete 3 rows from the users table")

If you can, run a SELECT first to show the user what will be affected before
asking for confirmation on the destructive query.

## Query Formatting Tips

- For large result sets, add `LIMIT` to avoid overwhelming output
- Use `COUNT(*)` first when the user asks "how many" questions
- When exploring a database, start with `SHOW TABLES` or equivalent
- For schema inspection, use `DESCRIBE table_name` or equivalent
- Quote the password in the CLI command to handle special characters — use
  double quotes around the password

## Password Escaping

Database passwords often contain special shell characters (`#`, `*`, `!`,
`^`, `@`, etc.). Use `--password="..."` with double quotes for MySQL.
Pass the SQL via heredoc to avoid shell expansion issues with `-e`:

```bash
mysql -h host -u user --password="pa$$w0rd#!" db << 'EOSQL'
SELECT 1;
EOSQL
```

Inside double quotes, escape `$` as `\$`, backticks as `` \` ``, and `"` as
`\"`. Most other special characters (`#`, `*`, `!`, `^`, `@`) are safe as-is
inside double quotes. The single-quoted heredoc delimiter (`'EOSQL'`) prevents
any expansion in the SQL body.

## Workflow

1. Read `.claude/auth/database.json` from the project root
2. Determine the database engine from `DB_CONNECTION`
3. Build the CLI command with proper escaping
4. Classify the query as read-only or destructive
5. If destructive: show the SQL and ask for confirmation before executing
6. Execute and present results clearly
7. If the query fails, read the error, suggest fixes, and retry if appropriate
