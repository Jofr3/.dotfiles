import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseProfile } from "../profile.ts";
import type { DatabaseRunner, DatabaseRunResult } from "../runner.ts";
import {
	classifyMssqlFailure,
	DefaultDatabaseRunner,
	MssqlDatabaseRunner,
	serializeMssqlResult,
} from "../mssql-runner.ts";

const PASSWORD = "MSSQL_RUNNER_PASSWORD_CANARY";
const SQLSERVER: DatabaseProfile = Object.freeze({
	version: 1,
	engine: "sqlserver",
	host: "sql.example.test",
	port: 1433,
	user: "runner",
	password: PASSWORD,
	database: "runner_db",
	encrypt: true,
	trustServerCertificate: false,
});
const MYSQL: DatabaseProfile = Object.freeze({
	version: 1,
	engine: "mysql",
	host: "127.0.0.1",
	port: 3306,
	user: "runner",
	password: PASSWORD,
	database: "runner_db",
});

function ownError(values: Record<string, unknown>): object {
	return Object.freeze(Object.assign(Object.create(null), values));
}

test("mssql errors collapse from fixed own fields without reading messages or getters", () => {
	assert.equal(classifyMssqlFailure(ownError({ code: "ELOGIN" }), "connect"), "authentication_failed");
	assert.equal(classifyMssqlFailure(ownError({ number: 4060, code: "EREQUEST" }), "query"), "database_unavailable");
	assert.equal(classifyMssqlFailure(ownError({ number: 18456 }), "connect"), "authentication_failed");
	assert.equal(classifyMssqlFailure(ownError({ code: "DEPTH_ZERO_SELF_SIGNED_CERT" }), "connect"), "tls_error");
	assert.equal(classifyMssqlFailure(ownError({ code: "ESOCKET" }), "connect"), "connection_failed");
	assert.equal(classifyMssqlFailure(ownError({ code: "EREQUEST" }), "query"), "query_error");
	assert.equal(classifyMssqlFailure(ownError({ code: "ETIMEOUT" }), "query"), "timeout");
	let getterCalls = 0;
	const guarded = Object.create(null) as Record<string, unknown>;
	Object.defineProperty(guarded, "code", { value: "EREQUEST", enumerable: true });
	Object.defineProperty(guarded, "message", {
		enumerable: true,
		get() { getterCalls += 1; return `${PASSWORD}:secret-host`; },
	});
	Object.freeze(guarded);
	assert.equal(classifyMssqlFailure(guarded, "query"), "query_error");
	assert.equal(getterCalls, 0);
});

test("mssql result serialization emits bounded TSV without invoking unsupported values", () => {
	const first = [{ id: 1, name: "Alice\tAdmin", note: null }];
	Object.defineProperty(first, "columns", { value: { id: {}, name: {}, note: {} }, enumerable: false });
	const output = serializeMssqlResult({ recordsets: [first], rowsAffected: [1] });
	assert.ok(output);
	assert.equal(output!.toString("utf8"), "id\tname\tnote\n1\tAlice\\tAdmin\tNULL\n");
	assert.equal(serializeMssqlResult({ recordsets: [], rowsAffected: [2] })!.toString("utf8"), "rows_affected_1\t2\n");
});

class FakeRequest {
	queryText = "";
	cancelled = false;
	readonly result: unknown;
	constructor(result: unknown) { this.result = result; }
	async query(query: string): Promise<unknown> { this.queryText = query; return this.result; }
	cancel(): void { this.cancelled = true; }
}

class FakePool {
	static instances: FakePool[] = [];
	readonly config: Readonly<Record<string, unknown>>;
	readonly fakeRequest: FakeRequest;
	closed = false;
	constructor(config: Readonly<Record<string, unknown>>) {
		this.config = config;
		this.fakeRequest = new FakeRequest({ recordsets: [[{ ok: 1 }]], rowsAffected: [1] });
		FakePool.instances.push(this);
	}
	on(): void {}
	async connect(): Promise<this> { return this; }
	request(): FakeRequest { return this.fakeRequest; }
	async close(): Promise<void> { this.closed = true; }
}

test("in-process SQL Server runner keeps password/query out of public results and closes its pool", async () => {
	FakePool.instances.length = 0;
	const runner = new MssqlDatabaseRunner({ loadMssql: async () => ({ ConnectionPool: FakePool }) });
	const result = await runner.run(SQLSERVER, "SELECT 1 AS ok", "/offline/project");
	assert.equal(result.ok, true);
	if (result.ok) assert.equal(result.stdout.toString("utf8"), "ok\n1\n");
	const pool = FakePool.instances[0]!;
	assert.equal(pool.config.password, PASSWORD);
	assert.equal(pool.config.server, SQLSERVER.host);
	assert.equal(pool.config.database, SQLSERVER.database);
	assert.deepEqual(pool.config.options, {
		encrypt: true,
		trustServerCertificate: false,
		enableArithAbort: true,
	});
	assert.equal(pool.fakeRequest.queryText, "SELECT 1 AS ok");
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(pool.closed, true);
	const publicResult = JSON.stringify(result);
	assert.equal(publicResult.includes(PASSWORD), false);
	assert.equal(publicResult.includes(SQLSERVER.host!), false);
	assert.equal(publicResult.includes("runner_db"), false);
});

test("default runner routes SQL Server in-process and leaves MySQL on the bounded CLI runner", async () => {
	const calls: string[] = [];
	const result = (name: string): DatabaseRunResult => Object.freeze({
		ok: true,
		stdout: Buffer.from(`${name}\n`),
		elapsedMs: 1,
	});
	const sqlserver: DatabaseRunner = { async run() { calls.push("sqlserver"); return result("sqlserver"); } };
	const cli: DatabaseRunner = { async run() { calls.push("mysql"); return result("mysql"); } };
	const router = new DefaultDatabaseRunner(sqlserver, cli);
	assert.equal((await router.run(SQLSERVER, "SELECT 1", "/offline")).ok, true);
	assert.equal((await router.run(MYSQL, "SELECT 1", "/offline")).ok, true);
	assert.deepEqual(calls, ["sqlserver", "mysql"]);
});

test("mssql module load failures remain fixed and nonsecret", async () => {
	const runner = new MssqlDatabaseRunner({
		loadMssql: async () => { throw new Error(`${PASSWORD}:module details`); },
	});
	const result = await runner.run(SQLSERVER, "SELECT 1", "/offline/project");
	assert.deepEqual({ ok: result.ok, ...(!result.ok ? { code: result.code } : {}) }, {
		ok: false,
		code: "client_unavailable",
	});
	assert.equal(JSON.stringify(result).includes(PASSWORD), false);
});
