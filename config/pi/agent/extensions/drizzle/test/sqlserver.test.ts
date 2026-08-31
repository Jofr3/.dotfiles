import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { ConnectionProfile } from "../src/config.ts";
import { executeLimitedSqlServerRead, sanitizeDatabaseError, secureSqlServerConfig } from "../src/manager.ts";

test("SQL Server URLs are parsed with bounded resources and verified TLS defaults", () => {
	const config = secureSqlServerConfig(
		"sqlserver://reader:p%40ss@db.example.test:1444?database=warehouse&encrypt=disable",
		45_000,
	);
	assert.equal(config.server, "db.example.test");
	assert.equal(config.port, 1444);
	assert.equal(config.user, "reader");
	assert.equal(config.password, "p@ss");
	assert.equal(config.database, "warehouse");
	assert.equal(config.connectionTimeout, 10_000);
	assert.equal(config.requestTimeout, 45_000);
	assert.equal(config.pool?.max, 4);
	assert.equal(config.options?.encrypt, false);
	assert.equal(config.options?.trustServerCertificate, false);
});

test("SQL Server connection strings cannot weaken certificate or pool policy", () => {
	const config = secureSqlServerConfig(
		"Server=db.example.test,1433;Database=warehouse;User Id=reader;Password=secret;Encrypt=true;TrustServerCertificate=true;Max Pool Size=99",
		30_000,
	);
	assert.equal(config.server, "db.example.test");
	assert.equal(config.database, "warehouse");
	assert.equal(config.pool?.max, 4);
	assert.equal(config.options?.encrypt, true);
	assert.equal(config.options?.trustServerCertificate, false);
	assert.throws(
		() => secureSqlServerConfig(
			"Server=db.example.test;Database=warehouse;User Id=reader;Password=secret;Authentication=Active Directory Password",
			30_000,
		),
		/authentication.*not supported|Unsupported.*authentication/i,
	);
	assert.throws(
		() => secureSqlServerConfig("Server=db.example.test;Database=warehouse;Trusted_Connection=true", 30_000),
		/authentication|username/i,
	);
});

test("SQL Server URLs reject duplicate, unknown, and unsafe options", () => {
	assert.throws(
		() => secureSqlServerConfig("sqlserver://reader:secret@db.example.test?database=a&database=b", 30_000),
		/duplicate query option/,
	);
	assert.throws(
		() => secureSqlServerConfig("sqlserver://reader:secret@db.example.test?trustServerCertificate=true", 30_000),
		/unsupported query option/,
	);
	assert.throws(
		() => secureSqlServerConfig("sqlserver://reader:secret@db.example.test#fragment", 30_000),
		/fragments are not supported/,
	);
});

test("SQL Server bounded streaming keeps maxRows+1 rows and treats its cancellation as success", async () => {
	class FakeRequest extends EventEmitter {
		stream = false;
		paused = false;
		cancelled = false;

		pause() {
			this.paused = true;
			return true;
		}

		cancel() {
			this.cancelled = true;
		}

		async query() {
			this.emit("recordset", { id: { name: "id" } });
			for (let id = 1; id <= 10; id++) {
				this.emit("row", { id });
				if (this.cancelled) {
					const error = Object.assign(new Error("cancelled"), { code: "ECANCEL" });
					this.emit("error", error);
					throw error;
				}
			}
		}
	}

	const request = new FakeRequest();
	const result = await executeLimitedSqlServerRead(request as never, "SELECT id FROM rows", 2);
	assert.deepEqual(result.rows, [{ id: 1 }, { id: 2 }, { id: 3 }]);
	assert.deepEqual(result.columns, ["id"]);
	assert.equal(request.stream, true);
	assert.equal(request.paused, true);
	assert.equal(request.cancelled, true);
});

test("SQL Server bounded streaming rejects non-cancellation error events", async () => {
	class FakeRequest extends EventEmitter {
		stream = false;
		pause() { return true; }
		cancel() {}
		async query() {
			this.emit("recordset", { id: { name: "id" } });
			this.emit("error", Object.assign(new Error("query failed"), { code: "EREQUEST" }));
		}
	}

	await assert.rejects(
		executeLimitedSqlServerRead(new FakeRequest() as never, "SELECT id FROM rows", 2),
		/query failed/,
	);
});

test("SQL Server errors redact decoded URL credentials", () => {
	const profile: ConnectionProfile = {
		name: "warehouse",
		dialect: "sqlserver",
		available: true,
		source: "env:DATABASES[0]",
		url: "sqlserver://reader-marker:password-marker@db.example.test?database=warehouse",
		allowWrites: false,
		confirmWrites: true,
		maxRows: 100,
		timeoutMs: 30_000,
	};
	const error = sanitizeDatabaseError(
		new Error("Login failed for user 'reader-marker' with password-marker"),
		profile,
		{ readOnly: true },
	);
	assert.doesNotMatch(error.message, /reader-marker|password-marker/);
	assert.match(error.message, /\[redacted\]/);
});
