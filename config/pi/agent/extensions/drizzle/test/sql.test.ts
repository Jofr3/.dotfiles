import assert from "node:assert/strict";
import test from "node:test";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { PgDialect } from "drizzle-orm/pg-core";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import { analyzeSql, assertMutationSql, assertReadOnlySql, bindSql, limitReadQuery, maskSql } from "../src/sql.ts";

test("read-only analysis ignores literals and comments but catches mutating CTEs", () => {
	assert.equal(assertReadOnlySql("SELECT 'delete', \"update\" FROM users -- drop table users").readOnly, true);
	assert.equal(assertReadOnlySql("WITH rows AS (SELECT 1) SELECT * FROM rows").readOnly, true);
	assert.throws(
		() => assertReadOnlySql("WITH removed AS (DELETE FROM users RETURNING *) SELECT * FROM removed"),
		/drizzle_execute/,
	);
	assert.equal(assertMutationSql("UPDATE users SET active = false").readOnly, false);
});

test("analysis rejects multiple statements, ambiguous lexer syntax, and empty SQL", () => {
	assert.throws(() => analyzeSql("SELECT 1; SELECT 2"), /multiple SQL statements|exactly one SQL statement/);
	assert.throws(() => analyzeSql("SELECT 1 AS x$tag$; DROP TABLE users"), /multiple SQL statements/);
	assert.throws(() => analyzeSql("SELECT E'\\\\''; DROP TABLE users"), /Backslash SQL escapes/);
	assert.throws(() => analyzeSql("SELECT 1--1; DROP TABLE users"), /multiple SQL statements/);
	assert.throws(() => analyzeSql("SELECT 1 /*!50000 INTO OUTFILE '/tmp/x' */"), /executable comments/);
	assert.throws(() => analyzeSql(" -- only a comment"), /empty/);
	assert.equal(analyzeSql("SELECT ';' AS value;").operation, "select");
});

test("read guard rejects SELECT forms and functions with known side effects", () => {
	for (const statement of [
		"SELECT 1 INTO created_by_read_tool",
		"SELECT 'owned' INTO OUTFILE '/tmp/file'",
		"SELECT setval('sequence_name', 500)",
		"WITH x AS MATERIALIZED (SELECT set_config('statement_timeout', '0', false)) SELECT pg_sleep_for(interval '1 hour') FROM x",
		"SELECT pg_advisory_lock(42)",
		"SELECT pg_catalog.\"set_config\"('statement_timeout', '0', false)",
		"SELECT `sleep`(3600)",
		"SELECT load_extension('unsafe')",
	]) {
		assert.throws(() => assertReadOnlySql(statement), /drizzle_execute/);
		assert.doesNotThrow(() => assertMutationSql(statement));
	}
});

test("maskSql preserves UTF-16 offsets and hides quoted placeholders", () => {
	const source = "SELECT '😀 :p1', :p1 AS value";
	const masked = maskSql(source);
	assert.equal(masked.length, source.length);
	assert.equal(masked.indexOf(":p1"), source.lastIndexOf(":p1"));
});

test("portable placeholders and row limits compile through each Drizzle dialect", () => {
	const query = bindSql("SELECT :p1 AS id, :p2 AS name, :p1 AS again", [42, "Ada"]);
	const pg = new PgDialect().sqlToQuery(query);
	const mysql = new MySqlDialect().sqlToQuery(query);
	const sqlite = new SQLiteAsyncDialect().sqlToQuery(query);
	assert.equal(pg.sql, "SELECT $1 AS id, $2 AS name, $3 AS again");
	assert.deepEqual(pg.params, [42, "Ada", 42]);
	assert.equal(mysql.sql, "SELECT ? AS id, ? AS name, ? AS again");
	assert.deepEqual(mysql.params, [42, "Ada", 42]);
	assert.equal(sqlite.sql, "SELECT ? AS id, ? AS name, ? AS again");
	assert.deepEqual(sqlite.params, [42, "Ada", 42]);

	const limited = new PgDialect().sqlToQuery(limitReadQuery(bindSql("SELECT id FROM users;"), "select", 10));
	assert.match(limited.sql, /^SELECT \* FROM \(SELECT id FROM users\)/);
	assert.match(limited.sql, /LIMIT \$1$/);
	assert.deepEqual(limited.params, [11]);
});

test("binding rejects missing and unused parameters and ignores placeholders in strings", () => {
	assert.throws(() => bindSql("SELECT :p2", [1]), /no matching parameter/);
	assert.throws(() => bindSql("SELECT :p1", [1, 2]), /parameter 2 is not referenced/);
	assert.throws(() => bindSql("SELECT ':p1'", [1]), /no :p1 placeholders/);
	assert.doesNotThrow(() => bindSql("SELECT ':p1'"));
});
