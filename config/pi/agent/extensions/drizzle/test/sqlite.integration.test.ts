import assert from "node:assert/strict";
import test from "node:test";
import type { ConnectionProfile } from "../src/config.ts";
import { buildIntrospectionQuery } from "../src/introspection.ts";
import { DrizzleManager } from "../src/manager.ts";
import { assertReadOnlySql, bindSql } from "../src/sql.ts";

const profile: ConnectionProfile = {
	name: "test",
	dialect: "sqlite",
	available: true,
	source: "test",
	url: "file::memory:",
	allowWrites: true,
	confirmWrites: false,
	maxRows: 100,
	timeoutMs: 30_000,
};

test("DrizzleManager executes parameterized SQLite reads, writes, and introspection", async () => {
	const manager = new DrizzleManager();
	try {
		await manager.execute(profile, bindSql("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"), { readOnly: false });
		const inserted = await manager.execute(
			profile,
			bindSql("INSERT INTO users (id, name) VALUES (:p1, :p2)", [1, "Ada"]),
			{ readOnly: false },
		);
		assert.equal(inserted.affectedRows, 1);

		const selected = await manager.execute(
			profile,
			bindSql("SELECT id, name FROM users WHERE id = :p1", [1]),
			{ readOnly: true },
		);
		assert.deepEqual(selected.rows, [{ id: 1, name: "Ada" }]);
		assert.deepEqual(selected.columns, ["id", "name"]);
		await assert.rejects(
			manager.execute(profile, bindSql("INSERT INTO users (id, name) VALUES (2, 'blocked')"), { readOnly: true }),
			/readonly|read-only/i,
		);

		const introspection = buildIntrospectionQuery(profile, "columns", undefined, "users");
		assert.equal(assertReadOnlySql(introspection.statement).readOnly, true);
		const columns = await manager.execute(
			profile,
			bindSql(introspection.statement, introspection.parameters),
			{ readOnly: true },
		);
		assert.equal(columns.rows.length, 2);
		assert.deepEqual(
			columns.rows.map((row) => (row as { column_name: string }).column_name),
			["id", "name"],
		);
	} finally {
		await manager.closeAll();
	}
});
