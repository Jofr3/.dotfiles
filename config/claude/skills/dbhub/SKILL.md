---
description: Execute SQL queries and explore database schema using the dbhub MCP server. Use when the user asks about database tables, columns, data, or needs to run SQL queries. Activates for schema exploration, data lookups, debugging data issues, or any database-related questions.
user_invocable: true
---

Use the dbhub MCP tools (`mcp__dbhub__execute_sql` and `mcp__dbhub__search_objects`) to interact with the project's SQL Server database.

## When to Activate

- User asks about database structure ("What columns does the Empreses table have?")
- User wants to query data ("Show me the latest invoices")
- User asks to explore the schema ("List all tables", "Find tables related to contracts")
- User needs to debug data issues ("Why is this record missing?")
- User says "check the database", "run a query", or "look up in the DB"
- User provides a table name or SQL query as the argument: $ARGUMENTS

## Tools

### `mcp__dbhub__search_objects`
Browse and discover database objects. Supports these `object_type` values:
- `schema` - List database schemas
- `table` - List tables (filter by `schema`)
- `column` - List columns (filter by `schema` and `table`)
- `procedure` - List stored procedures
- `function` - List functions
- `index` - List indexes (filter by `schema` and `table`)

Use `pattern` with SQL LIKE syntax (`%` = any chars, `_` = one char) to filter results.
Use `detail_level`: `names` (minimal), `summary` (metadata), `full` (all details).

### `mcp__dbhub__execute_sql`
Run SQL queries directly. Pass the query in the `sql` parameter. Multiple statements can be separated by `;`.

## Steps

### If user asks about schema/structure:

1. Use `mcp__dbhub__search_objects` with the appropriate `object_type` and filters
2. Present the results in a readable format (table for columns, list for tables)
3. If the user asks about a specific table, show columns with `detail_level: "summary"` or `"full"`

### If user asks to query data:

1. If the table/schema is unclear, first use `search_objects` to find the right table
2. Write and execute the SQL query with `execute_sql`
3. Present results clearly — use tables for tabular data
4. For large result sets, use `TOP` or `LIMIT` to avoid overwhelming output

### If user provides a SQL query or table name as argument:

1. If it looks like SQL, execute it directly with `execute_sql`
2. If it's a table name, show its columns using `search_objects` with `object_type: "column"`

## Safety

- Always use `SELECT` queries for data exploration unless the user explicitly asks for modifications
- For `UPDATE`, `DELETE`, or `INSERT` operations, confirm with the user before executing
- Use `TOP N` in SELECT queries when the result set could be large
- Never drop tables or alter schema without explicit user confirmation
