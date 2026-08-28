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
});

test("column introspection requires a table and SQLite rejects other schemas", () => {
	assert.throws(() => buildIntrospectionQuery(profile("postgresql"), "columns", undefined, undefined), /requires table/);
	assert.throws(() => buildIntrospectionQuery(profile("sqlite"), "tables", "attached", undefined), /only the main schema/);
});
