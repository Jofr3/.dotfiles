---
name: database
description: Execute project database queries for MySQL/MariaDB or SQL Server/MSSQL based on .agent/credentials/database.json. Use when the user asks to query, inspect, modify, or manage data, including SELECT, INSERT, UPDATE, DELETE, DDL, and schema inspection.
---

# Database Skill

Execute SQL queries against the project's configured database using the `database_query` tool.

## Configuration

The project must have a `.agent/credentials/database.json` file. The path is shared for all database engines; the `type` field selects the SQL dialect.

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

## Project schemas

- MySQL/MariaDB: the configured `database` is the schema/catalog. Use the `database` tool parameter to query a different schema.
- SQL Server/MSSQL: schemas are namespaces like `dbo`. If `.agent/credentials/database.json` has `schema` or `schemas`, use those for schema-qualified table names and metadata filters. If not, discover available schemas with `sys.schemas` / `INFORMATION_SCHEMA.SCHEMATA` before assuming `dbo`.

## Usage

Use the `database_query` tool for all database operations.

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
- Do not print or expose credentials from `.agent/credentials/database.json`.
