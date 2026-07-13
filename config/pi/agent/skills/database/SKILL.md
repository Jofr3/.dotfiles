---
name: database
description: Execute project database queries for MySQL/MariaDB or SQL Server/MSSQL. Bootstrap .agent/credentials/database.json from existing app connection settings when possible; ask the user when details are missing or uncertain. Use for SELECT, INSERT, UPDATE, DELETE, DDL, and schema inspection.
---

# Database Skill

Execute SQL queries against the project's configured database using the `database_query` tool.

## Configuration

The `database_query` tool requires a `.agent/credentials/database.json` file. The path is shared for all database engines; the `type` field selects the SQL dialect.

Before falling back to application code, raw database CLIs, or ad-hoc scripts, bootstrap this file automatically when the project's own connection settings can be found.

### MySQL / MariaDB

```json
{
  "type": "mysql",
  "host": "localhost",
  "port": 3306,
  "user": "root",
  "password": "secret",
  "database": "mydb"
}
```

`"type": "mariadb"` is also accepted.

### SQL Server / MSSQL

```json
{
  "type": "sqlserver",
  "host": "localhost",
  "port": 1433,
  "user": "sa",
  "password": "secret",
  "database": "mydb",
  "schema": "dbo",
  "trustServerCertificate": true,
  "encrypt": true
}
```

`"type": "mssql"` is also accepted.

## Automatic configuration bootstrap

When a database task starts, ensure `.agent/credentials/database.json` exists in the current project or an ancestor directory. If it is missing or invalid:

1. Locate the project root (`git rev-parse --show-toplevel` when available; otherwise use `cwd`).
2. Inspect local project configuration for existing connection details. Common sources include `.env`, `.env.local`, `config/database.*`, `database.*`, `db.*`, `connection.*`, `connexio_bd.php`, `wp-config.php`, Symfony/Laravel/CodeIgniter/CakePHP config files, Django `settings.py`, Node/ORM config, and `DATABASE_URL` values.
3. Prefer static inspection. Recognize keys such as `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_NAME`, `DB_USER`, `DB_USERNAME`, `DB_PASSWORD`, `MYSQL_*`, `MARIADB_*`, `MSSQL_*`, `SQLSERVER_*`, PDO DSNs, `mysqli` calls, and framework config arrays.
4. If the engine, host/socket, user, password, and database are confidently inferable, create `<project-root>/.agent/credentials/database.json`, create parent directories as needed, and set restrictive permissions (`chmod 700 .agent/credentials`, `chmod 600 .agent/credentials/database.json`).
5. Ensure credentials are not committed. If the project is a git repo and `.agent/credentials/database.json` is not already ignored, add `.agent/credentials/` to the project `.gitignore` or otherwise make the path ignored.
6. Retry the query with `database_query`.

Do **not** prompt the user when all required fields are confidently inferred. Do prompt when any required field is missing, contradictory, dynamically computed, or would require executing project code to discover. Ask the user how to proceed (provide missing fields, identify the trusted config source, allow a one-time fallback through app code, create a template only, or skip the database task).

## Project schemas

- MySQL/MariaDB: the configured `database` is the schema/catalog. Use the `database` tool parameter to query a different schema.
- SQL Server/MSSQL: schemas are namespaces like `dbo`. If `.agent/credentials/database.json` has `schema` or `schemas`, use those for schema-qualified table names and metadata filters. If not, discover available schemas with `sys.schemas` / `INFORMATION_SCHEMA.SCHEMATA` before assuming `dbo`.

## Usage

Use the `database_query` tool for all database operations. If configuration is missing, follow the automatic bootstrap workflow above first.

```
database_query({ query: "SELECT * FROM users LIMIT 10" })
database_query({ query: "SELECT TOP 10 * FROM dbo.Users" })
database_query({ query: "SELECT * FROM other_table", database: "other_db" })
```

The `/database` command provides a quick way to run a query from the editor prompt.

## Dialect-specific schema inspection

Choose SQL syntax based on `.agent/credentials/database.json` → `type`.

### MySQL / MariaDB

```
database_query({ query: "SHOW TABLES" })
database_query({ query: "DESCRIBE users" })
database_query({ query: "SHOW CREATE TABLE orders" })
database_query({ query: "SELECT * FROM users LIMIT 10" })
```

For MySQL, the configured `database` is the schema/catalog. Use `INFORMATION_SCHEMA` when you need portable metadata queries.

### SQL Server / MSSQL

```
database_query({ query: "SELECT s.name AS schema_name, t.name AS table_name FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id ORDER BY s.name, t.name" })
database_query({ query: "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Users' ORDER BY ORDINAL_POSITION" })
database_query({ query: "EXEC sp_columns @table_name = 'Users', @table_owner = 'dbo'" })
database_query({ query: "EXEC sp_helptext @objname = 'dbo.MyProcedure'" })
database_query({ query: "SELECT TOP 10 * FROM dbo.Users" })
```

For SQL Server, schemas are namespaces such as `dbo`. Qualify table names (`dbo.Users`) when the project config specifies a schema.

## Dialect reminders

- MySQL: `LIMIT 10`, `NOW()`, `AUTO_INCREMENT`, backticks for identifiers.
- SQL Server: `TOP 10` or `OFFSET/FETCH`, `GETDATE()` / `SYSDATETIME()`, `IDENTITY(1,1)`, square brackets for identifiers, `NVARCHAR` for Unicode.
- MySQL table list: `SHOW TABLES`; SQL Server table list: `sys.tables` joined to `sys.schemas` or `INFORMATION_SCHEMA.TABLES`.
- MySQL column details: `DESCRIBE table`; SQL Server column details: `INFORMATION_SCHEMA.COLUMNS` or `sp_columns`.

## Safety guidelines

- Confirm with the user before destructive operations (`DROP`, `TRUNCATE`, broad `DELETE`, broad `UPDATE`).
- Results are truncated at 200 rows. Use `LIMIT`, `TOP`, or `OFFSET/FETCH` for large tables.
- Do not print or expose credentials from `.agent/credentials/database.json` or source config files; redact secrets in summaries.
- Prefer creating `database.json` with a local script that reads source config and writes the JSON without echoing secret values into the conversation/tool arguments.
- Do not run PHP/Python/Node application snippets, `mysql`, `sqlcmd`, or other DB clients through `bash` as a fallback unless the user explicitly approves that fallback.
