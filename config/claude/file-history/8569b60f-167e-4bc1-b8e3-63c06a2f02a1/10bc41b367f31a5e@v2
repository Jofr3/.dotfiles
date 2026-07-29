// Dialect-specific introspection queries: list tables, describe a table.

/** Escape a value for use inside a single-quoted SQL literal. */
export function lit(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Split "schema.table" into parts, honouring optional double quotes. */
export function splitTable(ref) {
  const match = String(ref).match(/^(?:"([^"]+)"|([^.]+))\.(?:"([^"]+)"|(.+))$/);
  if (!match) return { schema: null, table: String(ref).replace(/^"|"$/g, '') };
  return { schema: match[1] ?? match[2], table: match[3] ?? match[4] };
}

const PG_SYSTEM_SCHEMAS = "('pg_catalog','information_schema','pg_toast')";
const MYSQL_SYSTEM_SCHEMAS = "('information_schema','performance_schema','mysql','sys')";
const MSSQL_SYSTEM_SCHEMAS = "('sys','INFORMATION_SCHEMA')";

export function tablesQuery(dialect, schema) {
  switch (dialect) {
    case 'postgresql':
      return `
        select table_schema as "schema", table_name as "name", table_type as "type"
        from information_schema.tables
        where ${schema ? `table_schema = ${lit(schema)}` : `table_schema not in ${PG_SYSTEM_SCHEMAS}`}
        order by table_schema, table_name`;
    case 'mysql':
      return `
        select table_schema as \`schema\`, table_name as \`name\`, table_type as \`type\`,
               table_rows as \`approx_rows\`
        from information_schema.tables
        where ${schema ? `table_schema = ${lit(schema)}` : `table_schema not in ${MYSQL_SYSTEM_SCHEMAS}`}
        order by table_schema, table_name`;
    case 'mssql':
      return `
        select table_schema as [schema], table_name as [name], table_type as [type]
        from information_schema.tables
        where ${schema ? `table_schema = ${lit(schema)}` : `table_schema not in ${MSSQL_SYSTEM_SCHEMAS}`}
        order by table_schema, table_name`;
    case 'sqlite':
      return `
        select 'main' as "schema", name, type
        from sqlite_master
        where type in ('table','view') and name not like 'sqlite_%'
        order by type, name`;
    default:
      throw new Error(`No table listing implemented for dialect "${dialect}"`);
  }
}

export function columnsQuery(dialect, table, schema) {
  switch (dialect) {
    case 'postgresql':
      return `
        select column_name as "column", data_type as "type", udt_name as "udt",
               is_nullable as "nullable", column_default as "default",
               character_maximum_length as "length",
               numeric_precision as "precision", numeric_scale as "scale"
        from information_schema.columns
        where table_name = ${lit(table)}
          ${schema ? `and table_schema = ${lit(schema)}` : `and table_schema not in ${PG_SYSTEM_SCHEMAS}`}
        order by ordinal_position`;
    case 'mysql':
      return `
        select column_name as \`column\`, column_type as \`type\`, is_nullable as \`nullable\`,
               column_default as \`default\`, extra as \`extra\`, column_key as \`key\`,
               column_comment as \`comment\`
        from information_schema.columns
        where table_name = ${lit(table)}
          and table_schema = ${schema ? lit(schema) : 'database()'}
        order by ordinal_position`;
    case 'mssql':
      return `
        select column_name as [column], data_type as [type], is_nullable as [nullable],
               column_default as [default], character_maximum_length as [length]
        from information_schema.columns
        where table_name = ${lit(table)}
          ${schema ? `and table_schema = ${lit(schema)}` : ''}
        order by ordinal_position`;
    case 'sqlite':
      return `
        select name as "column", type as "type",
               case "notnull" when 1 then 'NO' else 'YES' end as "nullable",
               dflt_value as "default", pk as "pk"
        from pragma_table_info(${lit(table)})`;
    default:
      throw new Error(`No column introspection implemented for dialect "${dialect}"`);
  }
}

export function constraintsQuery(dialect, table, schema) {
  switch (dialect) {
    case 'postgresql':
    case 'mssql': {
      const q = (id) => (dialect === 'postgresql' ? `"${id}"` : `[${id}]`);
      return `
        select tc.constraint_type as ${q('type')}, tc.constraint_name as ${q('name')},
               kcu.column_name as ${q('column')},
               ccu.table_schema as ${q('ref_schema')}, ccu.table_name as ${q('ref_table')},
               ccu.column_name as ${q('ref_column')}
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on kcu.constraint_name = tc.constraint_name
         and kcu.constraint_schema = tc.constraint_schema
        left join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name
         and ccu.constraint_schema = tc.constraint_schema
         and tc.constraint_type = 'FOREIGN KEY'
        where tc.table_name = ${lit(table)}
          ${schema ? `and tc.table_schema = ${lit(schema)}` : ''}
        order by tc.constraint_type, tc.constraint_name, kcu.ordinal_position`;
    }
    case 'mysql':
      return `
        select tc.constraint_type as \`type\`, kcu.constraint_name as \`name\`,
               kcu.column_name as \`column\`,
               kcu.referenced_table_schema as \`ref_schema\`,
               kcu.referenced_table_name as \`ref_table\`,
               kcu.referenced_column_name as \`ref_column\`
        from information_schema.key_column_usage kcu
        join information_schema.table_constraints tc
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
         and tc.table_name = kcu.table_name
        where kcu.table_name = ${lit(table)}
          and kcu.table_schema = ${schema ? lit(schema) : 'database()'}
        order by tc.constraint_type, kcu.constraint_name, kcu.ordinal_position`;
    case 'sqlite':
      return `
        select 'FOREIGN KEY' as "type", id as "name", "from" as "column",
               "table" as "ref_table", "to" as "ref_column",
               on_update as "on_update", on_delete as "on_delete"
        from pragma_foreign_key_list(${lit(table)})`;
    default:
      return null;
  }
}

export function indexesQuery(dialect, table, schema) {
  switch (dialect) {
    case 'postgresql':
      return `
        select indexname as "name", indexdef as "definition"
        from pg_indexes
        where tablename = ${lit(table)} ${schema ? `and schemaname = ${lit(schema)}` : ''}
        order by indexname`;
    case 'mysql':
      return `
        select index_name as \`name\`, group_concat(column_name order by seq_in_index) as \`columns\`,
               case non_unique when 0 then 'UNIQUE' else '' end as \`kind\`
        from information_schema.statistics
        where table_name = ${lit(table)}
          and table_schema = ${schema ? lit(schema) : 'database()'}
        group by index_name, non_unique
        order by index_name`;
    case 'sqlite':
      return `
        select name as "name",
               case "unique" when 1 then 'UNIQUE' else '' end as "kind",
               origin as "origin"
        from pragma_index_list(${lit(table)})`;
    case 'mssql':
      return `
        select i.name as [name], i.type_desc as [kind],
               case i.is_unique when 1 then 'UNIQUE' else '' end as [unique]
        from sys.indexes i
        join sys.tables t on t.object_id = i.object_id
        where t.name = ${lit(table)} and i.name is not null
        order by i.name`;
    default:
      return null;
  }
}

export function countQuery(dialect, table, schema) {
  const quote = dialect === 'mysql' ? '`' : dialect === 'mssql' ? null : '"';
  const qualify = (name) => (quote ? `${quote}${name.replace(new RegExp(quote, 'g'), quote + quote)}${quote}` : `[${name}]`);
  const ref = schema ? `${qualify(schema)}.${qualify(table)}` : qualify(table);
  const alias = dialect === 'mysql' ? '`count`' : dialect === 'mssql' ? '[count]' : '"count"';
  return `select count(*) as ${alias} from ${ref}`;
}

/** Best-effort server version string per dialect. */
export function versionQuery(dialect) {
  switch (dialect) {
    case 'postgresql': return 'select version() as "version"';
    case 'mysql': return 'select version() as `version`';
    case 'mssql': return 'select @@version as [version]';
    case 'sqlite': return 'select sqlite_version() as "version"';
    default: return 'select 1 as "ok"';
  }
}
