---
name: sqlserver-skill
description: Execute SQL Server queries against the project database. Use when the user asks to query, inspect, modify, or manage data in a SQL Server / MSSQL database — includes SELECT, INSERT, UPDATE, DELETE, DDL, and schema inspection.
---

# SQL Server Database Skill

Execute SQL queries against the project's SQL Server database using the `sqlserver_query` tool.

## Configuration

The project must have a `.agent/tools/sqlserver.json` file with connection credentials:

```json
{
  "host": "localhost",
  "port": 1433,
  "user": "sa",
  "password": "secret",
  "database": "mydb",
  "trustServerCertificate": true,
  "encrypt": true
}
```

## Usage

Use the `sqlserver_query` tool for all database operations.

### Reading data

```
sqlserver_query({ query: "SELECT TOP 10 * FROM users" })
sqlserver_query({ query: "SELECT name FROM sys.tables" })
sqlserver_query({ query: "EXEC sp_columns @table_name = 'users'" })
sqlserver_query({ query: "EXEC sp_helptext @objname = 'dbo.MyProcedure'" })
```

### Writing data

```
sqlserver_query({ query: "INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')" })
sqlserver_query({ query: "UPDATE users SET active = 1 WHERE id = 42" })
sqlserver_query({ query: "DELETE FROM sessions WHERE expires_at < GETDATE()" })
```

### Schema operations

```
sqlserver_query({ query: "CREATE TABLE logs (id INT IDENTITY(1,1) PRIMARY KEY, message NVARCHAR(MAX), created_at DATETIME2 DEFAULT GETDATE())" })
sqlserver_query({ query: "ALTER TABLE users ADD phone NVARCHAR(20)" })
```

### Using a different database

```
sqlserver_query({ query: "SELECT * FROM other_table", database: "other_db" })
```

## Guidelines

- For destructive operations (DROP, TRUNCATE, DELETE without WHERE), confirm with the user first.
- Results are truncated at 200 rows. Use `TOP` or `OFFSET/FETCH` for large tables.
- Use `SELECT name FROM sys.tables` instead of MySQL's `SHOW TABLES`.
- Use `EXEC sp_columns @table_name = 'tablename'` instead of MySQL's `DESCRIBE`.
- The `/sqlserver` command provides a quick way to run queries from the editor prompt.
- SQL Server uses `GETDATE()` / `SYSDATETIME()` instead of `NOW()`.
- Use `NVARCHAR` for Unicode text, `TOP N` instead of `LIMIT N`.
