---
name: mysql-skill
description: Execute MySQL queries against the project database. Use when the user asks to query, inspect, modify, or manage data in a MySQL/MariaDB database — includes SELECT, INSERT, UPDATE, DELETE, DDL, and schema inspection.
---

# MySQL Database Skill

Execute SQL queries against the project's MySQL database using the `mysql_query` tool.

## Configuration

The project must have a `.agent/tools/mysql.json` file with connection credentials:

```json
{
  "host": "localhost",
  "port": 3306,
  "user": "root",
  "password": "secret",
  "database": "mydb"
}
```

## Usage

Use the `mysql_query` tool for all database operations.

### Reading data

```
mysql_query({ query: "SELECT * FROM users LIMIT 10" })
mysql_query({ query: "SHOW TABLES" })
mysql_query({ query: "DESCRIBE users" })
mysql_query({ query: "SHOW CREATE TABLE orders" })
```

### Writing data

```
mysql_query({ query: "INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')" })
mysql_query({ query: "UPDATE users SET active = 1 WHERE id = 42" })
mysql_query({ query: "DELETE FROM sessions WHERE expires_at < NOW()" })
```

### Schema operations

```
mysql_query({ query: "CREATE TABLE logs (id INT AUTO_INCREMENT PRIMARY KEY, message TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)" })
mysql_query({ query: "ALTER TABLE users ADD COLUMN phone VARCHAR(20)" })
```

### Using a different database

```
mysql_query({ query: "SELECT * FROM other_table", database: "other_db" })
```

## Guidelines

- Always use parameterized-style safe values. The tool uses `execute()` which prevents SQL injection for single statements.
- For destructive operations (DROP, TRUNCATE, DELETE without WHERE), confirm with the user first.
- Results are truncated at 200 rows. Use LIMIT for large tables.
- The `/mysql` command provides a quick way to run queries from the editor prompt.
