# Queries, schema discovery, and output

Read this before connecting to inspect a schema, execute SQL, or export rows.

## Confirm the command and target

```bash
hsql --info
hsql --help -a postgres
hsql --spec -a postgres
```

Replace `postgres` with the intended adapter. Confirm the exact profile or local file
with the user when it is not already clear. Never put remote credentials in arguments.

## Discover the schema

### Native catalog mode, when installed

Use this only if `hsql --help` or `hsql --spec` reports the flags:

```bash
hsql -P dev --catalog
hsql -P dev --catalog --path database_name.schema_name
hsql -P dev --catalog --path database_name.schema_name.table_name
hsql -P dev --catalog-search customer_id
```

A current catalog row includes `path`, `name`, `query_name`, `type`, and `type_label`.
Pass `path` back to `--path`; paste `query_name` into SQL rather than rebuilding a quoted
identifier. A quoted trailing `*` may filter a listing. Catalog modes do not run beside
`-c` or `-f`; use a separate invocation.

Not every version or adapter implements catalog search. If the flags are absent, use
metadata SQL appropriate to the dialect.

### Portable metadata fallbacks

Keep the result bounded and add schema/table predicates as soon as they are known.

**PostgreSQL and many information-schema databases**

```sql
select table_schema, table_name, table_type
from information_schema.tables
where table_schema not in ('pg_catalog', 'information_schema')
order by table_schema, table_name;
```

```sql
select ordinal_position, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'orders'
order by ordinal_position;
```

**DuckDB**

```sql
select table_catalog, table_schema, table_name, table_type
from information_schema.tables
order by table_catalog, table_schema, table_name;
```

Use `information_schema.columns` with exact catalog, schema, and table predicates for
columns.

**SQLite**

```sql
select name, type
from sqlite_schema
where type in ('table', 'view') and name not like 'sqlite_%'
order by name;
```

After obtaining the exact table name, use `pragma table_info('orders');`. Quote a name
according to SQLite rules; do not splice an untrusted name into the PRAGMA.

**MySQL/MariaDB**

```sql
select table_schema, table_name, table_type
from information_schema.tables
where table_schema = database()
order by table_name;
```

Use `information_schema.columns` with exact `table_schema` and `table_name` predicates
for columns.

**BigQuery**

Query a specifically qualified region, dataset, or project's `INFORMATION_SCHEMA` view;
do not attempt an unbounded project-wide inventory. The exact qualification depends on
the selected project and location.

## Execute and select result sets

```bash
hsql -P dev --on-error stop -c "select * from orders limit 20"
hsql -P dev --on-error stop -f ./report.sql
hsql -P dev --on-error stop --result last -f ./setup.sql -f ./report.sql
```

`-c` and `-f` repeat and run in command-line order on one connection. Read SQL files
first: a `.sql` extension does not imply read-only behavior. `--result all` is normally
the default; `last` or a one-based result number keeps only one result set.

Single-result formats may reject multiple emitted result sets. Use `--result last|N`, a
multi-result text layout, or `--jsonl` after checking local help.

## Choose a format

| Need | Typical option |
| --- | --- |
| Small human-readable result | default `table` |
| Markdown for a reply | `--markdown` |
| One scalar | `-tAc "select ..."` |
| Wide record | `--vertical` |
| Pipeline | `--csv` or `--jsonl` |
| Large complete export | `--limit -1 --format parquet -o ./result.parquet` |
| Execute while suppressing row output | `--format none` |

`-t` removes headers and footers and `-A` removes alignment. Use an explicit file path
with `-o`; only use a directory if the installed help/version confirms that behavior.

## Limits and completeness

`--limit N` bounds rows fetched per result set and commonly defaults to 500.
`--display-rows N` only bounds what text layouts print. For exploration, keep the hard
limit and add SQL predicates or `LIMIT`. For complete exports use `--limit -1` only after
checking expected size and output path.

```bash
hsql -P dev --limit 100 --stats --markdown -c "select * from orders"
```

Read stderr. If stats report `"truncated": true`, do not treat the output as complete.
Aggregate in SQL for counts, sums, and grouping instead of fetching an unlimited result
for client-side calculation.

## Mutations

Do not run a mutation as schema discovery or troubleshooting. Execute writes only after
explicit authorization for the exact target and effect. Read the full SQL, use
`--on-error stop`, verify restrictive predicates, and use a dialect-appropriate
transaction or dry run where available. A plain `EXPLAIN` is generally safer than
`EXPLAIN ANALYZE`, which executes the statement on many databases.
