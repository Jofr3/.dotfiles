import type { ConnectionProfile } from "./config.ts";
import type { SqlParameter } from "./sql.ts";

export type SchemaAction = "tables" | "columns";

export interface IntrospectionQuery {
	statement: string;
	parameters: SqlParameter[];
	operation: string;
}

export function buildIntrospectionQuery(
	profile: ConnectionProfile,
	action: SchemaAction,
	schema: string | undefined,
	table: string | undefined,
): IntrospectionQuery {
	if (!profile.dialect) throw new Error(`Connection ${profile.name} has no database dialect.`);
	if (action === "columns" && !table?.trim()) throw new Error("drizzle_schema action=columns requires table.");

	if (profile.dialect === "postgresql") {
		if (action === "tables") {
			return schema?.trim()
				? {
					statement: `SELECT table_schema AS schema_name, table_name, table_type
FROM information_schema.tables
WHERE table_schema = :p1
ORDER BY table_schema, table_name`,
					parameters: [schema.trim()],
					operation: "SCHEMA TABLES",
				}
				: {
					statement: `SELECT table_schema AS schema_name, table_name, table_type
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name`,
					parameters: [],
					operation: "SCHEMA TABLES",
				};
		}
		const conditions = ["table_name = :p1"];
		const parameters: SqlParameter[] = [table!.trim()];
		if (schema?.trim()) {
			conditions.push("table_schema = :p2");
			parameters.push(schema.trim());
		} else {
			conditions.push("table_schema NOT IN ('pg_catalog', 'information_schema')");
		}
		return {
			statement: `SELECT table_schema AS schema_name, table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE ${conditions.join(" AND ")}
ORDER BY table_schema, table_name, ordinal_position`,
			parameters,
			operation: "SCHEMA COLUMNS",
		};
	}

	if (profile.dialect === "sqlserver") {
		if (action === "tables") {
			return schema?.trim()
				? {
					statement: `SELECT TABLE_SCHEMA AS schema_name, TABLE_NAME AS table_name, TABLE_TYPE AS table_type
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = :p1
ORDER BY TABLE_SCHEMA, TABLE_NAME`,
					parameters: [schema.trim()],
					operation: "SCHEMA TABLES",
				}
				: {
					statement: `SELECT TABLE_SCHEMA AS schema_name, TABLE_NAME AS table_name, TABLE_TYPE AS table_type
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
ORDER BY TABLE_SCHEMA, TABLE_NAME`,
					parameters: [],
					operation: "SCHEMA TABLES",
				};
		}
		const conditions = ["TABLE_NAME = :p1"];
		const parameters: SqlParameter[] = [table!.trim()];
		if (schema?.trim()) {
			conditions.push("TABLE_SCHEMA = :p2");
			parameters.push(schema.trim());
		} else {
			conditions.push("TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')");
		}
		return {
			statement: `SELECT TABLE_SCHEMA AS schema_name, TABLE_NAME AS table_name, ORDINAL_POSITION AS ordinal_position,
       COLUMN_NAME AS column_name, DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable,
       COLUMN_DEFAULT AS column_default, CHARACTER_MAXIMUM_LENGTH AS character_maximum_length,
       NUMERIC_PRECISION AS numeric_precision, NUMERIC_SCALE AS numeric_scale,
       DATETIME_PRECISION AS datetime_precision
FROM INFORMATION_SCHEMA.COLUMNS
WHERE ${conditions.join(" AND ")}
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
			parameters,
			operation: "SCHEMA COLUMNS",
		};
	}

	if (profile.dialect === "mysql") {
		if (action === "tables") {
			return schema?.trim()
				? {
					statement: `SELECT table_schema AS schema_name, table_name, table_type
FROM information_schema.tables
WHERE table_schema = :p1
ORDER BY table_name`,
					parameters: [schema.trim()],
					operation: "SCHEMA TABLES",
				}
				: {
					statement: `SELECT table_schema AS schema_name, table_name, table_type
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name`,
					parameters: [],
					operation: "SCHEMA TABLES",
				};
		}
		const databaseCondition = schema?.trim() ? "table_schema = :p2" : "table_schema = DATABASE()";
		return {
			statement: `SELECT table_schema AS schema_name, table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale,
       column_key, extra
FROM information_schema.columns
WHERE table_name = :p1 AND ${databaseCondition}
ORDER BY ordinal_position`,
			parameters: schema?.trim() ? [table!.trim(), schema.trim()] : [table!.trim()],
			operation: "SCHEMA COLUMNS",
		};
	}

	if (schema?.trim() && schema.trim() !== "main") {
		throw new Error("SQLite/libSQL introspection supports only the main schema.");
	}
	if (action === "tables") {
		return {
			statement: `SELECT name AS table_name, type AS table_type
FROM sqlite_schema
WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
ORDER BY name`,
			parameters: [],
			operation: "SCHEMA TABLES",
		};
	}
	return {
		statement: `SELECT cid AS ordinal_position, name AS column_name, type AS data_type,
       CASE WHEN "notnull" = 0 THEN 'YES' ELSE 'NO' END AS is_nullable,
       dflt_value AS column_default, pk AS primary_key_position
FROM pragma_table_info(:p1)
ORDER BY cid`,
		parameters: [table!.trim()],
		operation: "SCHEMA COLUMNS",
	};
}
