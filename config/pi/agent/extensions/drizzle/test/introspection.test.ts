import assert from "node:assert/strict";
import test from "node:test";
import type { ConnectionProfile, DatabaseDialect } from "../src/config.ts";
import { buildIntrospectionQuery } from "../src/introspection.ts";

function profile(dialect: DatabaseDialect): ConnectionProfile {
	return {
		name: dialect,
		dialect,
		available: true,
		source: "test",
		url: "test",
		allowWrites: false,
		confirmWrites: true,
		maxRows: 100,
		timeoutMs: 30_000,
	};
}

test("introspection binds user-provided schema and table names", () => {
	const pg = buildIntrospectionQuery(profile("postgresql"), "columns", "public", "users");
	assert.deepEqual(pg.parameters, ["users", "public"]);
	assert.match(pg.statement, /table_name = :p1/);
	assert.match(pg.statement, /table_schema = :p2/);

	const mysql = buildIntrospectionQuery(profile("mysql"), "tables", "app", undefined);
	assert.deepEqual(mysql.parameters, ["app"]);
	assert.match(mysql.statement, /table_schema = :p1/);

	const hostileSchema = "dbo' OR 1=1 --";
	const hostileTable = "users' OR 1=1 --";
	const sqlServer = buildIntrospectionQuery(profile("sqlserver"), "columns", hostileSchema, hostileTable);
	assert.deepEqual(sqlServer.parameters, [hostileTable, hostileSchema]);
	assert.match(sqlServer.statement, /INFORMATION_SCHEMA\.COLUMNS/);
	assert.match(sqlServer.statement, /TABLE_NAME = :p1/);
	assert.match(sqlServer.statement, /TABLE_SCHEMA = :p2/);
	assert.doesNotMatch(sqlServer.statement, /OR 1=1/);
});

test("SQL Server table introspection binds optional schemas and excludes system schemas by default", () => {
	const scoped = buildIntrospectionQuery(profile("sqlserver"), "tables", "dbo", undefined);
	assert.deepEqual(scoped.parameters, ["dbo"]);
	assert.match(scoped.statement, /TABLE_SCHEMA = :p1/);

	const unscoped = buildIntrospectionQuery(profile("sqlserver"), "tables", undefined, undefined);
	assert.deepEqual(unscoped.parameters, []);
	assert.match(unscoped.statement, /TABLE_SCHEMA NOT IN/);
});

test("column introspection requires a table and SQLite rejects other schemas", () => {
	assert.throws(() => buildIntrospectionQuery(profile("postgresql"), "columns", undefined, undefined), /requires table/);
	assert.throws(() => buildIntrospectionQuery(profile("sqlserver"), "columns", undefined, undefined), /requires table/);
	assert.throws(() => buildIntrospectionQuery(profile("sqlite"), "tables", "attached", undefined), /only the main schema/);
});
