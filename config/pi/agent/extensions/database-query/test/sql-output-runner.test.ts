import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
	formatDatabaseOutput,
	MAX_CELL_BYTES,
	MAX_DISPLAY_COLUMNS,
	MAX_DISPLAY_ROWS,
	MAX_MODEL_OUTPUT_BYTES,
	MAX_STDERR_BYTES,
	MAX_STDOUT_BYTES,
} from "../output.ts";
import type { DatabaseProfile } from "../profile.ts";
import {
	buildDatabaseClientInvocation,
	DATABASE_EXECUTION_TIMEOUT_MS,
	nixProfileExecutableCandidate,
	SpawnDatabaseRunner,
} from "../runner.ts";
import {
	classifySql,
	MAX_QUERY_BYTES,
	MAX_SQL_DEPTH,
	MAX_SQL_STATEMENTS,
} from "../sql-safety.ts";

const PASSWORD = "RUNNER_PASSWORD_CANARY_NEVER_PUBLIC";
const PROFILE_TEXT = JSON.stringify({
	version: 1,
	engine: "mysql",
	host: "127.0.0.1",
	port: 3306,
	user: "runner",
	password: PASSWORD,
	database: "runner_db",
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
const SQLSERVER: DatabaseProfile = Object.freeze({
	version: 1,
	engine: "sqlserver",
	host: "sql.example.test",
	port: 1433,
	user: "runner",
	password: PASSWORD,
	database: "runner_db",
	schema: "dbo",
	encrypt: true,
	trustServerCertificate: false,
});

function decision(query: string, engine: "mysql" | "sqlserver" = "mysql") {
	return classifySql(query, engine);
}

function assertDecision(
	query: string,
	classification: "read-only" | "mutation" | "ddl" | "administrative" | "unknown" | "multiple",
	engine: "mysql" | "sqlserver" = "mysql",
): void {
	const result = decision(query, engine);
	assert.equal(result.classification, classification, query);
	assert.equal(result.requiresConfirmation, classification !== "read-only", query);
}

test("SQL classifier handles comments, quoted text, CTEs, locks, and engine-specific read-only forms", () => {
	for (const query of [
		"SELECT 1",
		"-- DELETE FROM users\nSELECT 'DROP TABLE x; still text' AS value",
		"/* UPDATE hidden */ SELECT `delete` FROM `table`",
		"WITH recent AS (SELECT id FROM events WHERE note = 'UPDATE x') SELECT id FROM recent",
		"EXPLAIN SELECT * FROM users",
		"SHOW TABLES",
		"DESCRIBE users",
	]) {
		const result = decision(query);
		assert.equal(result.classification, "read-only", query);
		assert.equal(result.requiresConfirmation, false, query);
		assert.equal(result.statementCount, 1);
		assert.match(result.queryHash, /^[a-f0-9]{64}$/u);
		assert.equal(result.preview.includes("\n"), false);
	}
	assert.equal(decision("WITH changed AS (SELECT id FROM t) UPDATE t SET x = 1").classification, "mutation");
	assert.equal(decision("SELECT * FROM jobs FOR UPDATE").classification, "mutation");
	assert.equal(decision("SELECT id INTO archive FROM users", "sqlserver").classification, "mutation");
	assert.equal(decision("EXPLAIN ANALYZE SELECT 1").classification, "administrative");
	assert.equal(decision("CREATE TABLE x(id INT)").classification, "ddl");
	assert.equal(decision("GRANT SELECT ON x TO y").classification, "administrative");
	assert.equal(decision("PRINT 'hello'", "sqlserver").classification, "unknown");
});

test("function-bearing SELECT-like statements are never assumed read-only, including quoted, qualified, nested, CTE, and comment-separated calls", () => {
	for (const keyword of [
		"SELECT", "FROM", "JOIN", "WHERE", "HAVING", "ON", "AS", "IN", "EXISTS",
		"NOT", "AND", "OR", "BY", "VALUES", "USING", "WHEN", "THEN", "ELSE",
		"DISTINCT", "ALL", "ANY", "SOME", "OVER", "UNION", "INTERSECT", "EXCEPT", "WITH",
	]) assertDecision(`SELECT app.${keyword}()`, "unknown", "mysql");

	for (const [query, engine] of [
		["SELECT NOW()", "mysql"],
		["SELECT VALUES(id)", "mysql"],
		["SELECT TOP()", "mysql"],
		["SELECT APPLY()", "mysql"],
		["SELECT OPTION()", "mysql"],
		["SELECT COUNT(*) FROM users", "mysql"],
		["SELECT app.audit_read()", "mysql"],
		["SELECT app.écrit()", "mysql"],
		["SELECT app.routine§()", "mysql"],
		["SELECT `app`.`audit_read` ()", "mysql"],
		["SELECT dbo.audit_read()", "sqlserver"],
		["SELECT dbo.函数()", "sqlserver"],
		["SELECT dbo.routine#()", "sqlserver"],
		["SELECT [dbo].[audit_read] ()", "sqlserver"],
		["SELECT audit_read /* comment gap */ ()", "sqlserver"],
		["SELECT * FROM dbo.table_function()", "sqlserver"],
		["SELECT * FROM (SELECT audit_read()) AS nested", "mysql"],
		["WITH nested AS (SELECT audit_read()) SELECT value FROM nested", "sqlserver"],
		["EXPLAIN SELECT COUNT(*) FROM users", "mysql"],
		["SHOW TABLES WHERE SLEEP(1)", "mysql"],
	] as const) assertDecision(query, "unknown", engine);
});

test("sequence, assignment, variable, output, row-lock, and SQL Server table-hint forms require confirmation at every nesting depth", () => {
	for (const [query, classification, engine] of [
		["SELECT NEXT VALUE FOR dbo.order_seq", "mutation", "sqlserver"],
		["SELECT NEXT /* gap */ VALUE FOR order_seq", "mutation", "mysql"],
		["SELECT * FROM (SELECT NEXT VALUE FOR dbo.order_seq AS id) AS nested", "mutation", "sqlserver"],
		["WITH nested AS (SELECT NEXT VALUE FOR dbo.order_seq AS id) SELECT id FROM nested", "mutation", "sqlserver"],
		["SELECT PREVIOUS VALUE FOR order_seq", "unknown", "mysql"],
		["SELECT @user_value := 1", "mutation", "mysql"],
		["SELECT value INTO @user_value FROM source", "mutation", "mysql"],
		["SELECT @local_value = value FROM source", "mutation", "sqlserver"],
		["SELECT @local_value += value FROM source", "mutation", "sqlserver"],
		["SELECT @user_value", "unknown", "mysql"],
		["SELECT @@session.sql_mode", "unknown", "mysql"],
		["SELECT @@SPID", "unknown", "sqlserver"],
		["WITH nested AS (SELECT @user_value) SELECT value FROM nested", "unknown", "mysql"],
		["SELECT value INTO archive FROM source", "mutation", "sqlserver"],
		["SELECT value FROM source INTO OUTFILE '/tmp/export'", "mutation", "mysql"],
		["SELECT value FROM source INTO DUMPFILE '/tmp/export'", "mutation", "mysql"],
		["WITH nested AS (SELECT value INTO archive FROM source) SELECT value FROM nested", "mutation", "sqlserver"],
		["SELECT * FROM jobs FOR UPDATE", "mutation", "mysql"],
		["SELECT * FROM jobs FOR SHARE", "mutation", "mysql"],
		["SELECT * FROM jobs LOCK IN SHARE MODE", "mutation", "mysql"],
		["SELECT * FROM (SELECT * FROM jobs FOR UPDATE) AS nested", "mutation", "mysql"],
		["WITH nested AS (SELECT * FROM jobs FOR SHARE) SELECT * FROM nested", "mutation", "mysql"],
		["SELECT * FROM jobs WITH (NOLOCK)", "unknown", "sqlserver"],
		["SELECT * FROM jobs WITH /* gap */ (UPDLOCK)", "mutation", "sqlserver"],
	] as const) assertDecision(query, classification, engine);

	for (const hint of [
		"UPDLOCK", "XLOCK", "HOLDLOCK", "TABLOCK", "TABLOCKX", "ROWLOCK", "PAGLOCK",
		"READCOMMITTED", "READCOMMITTEDLOCK", "REPEATABLEREAD", "SERIALIZABLE",
	]) assertDecision(`WITH nested AS (SELECT * FROM jobs WITH (${hint})) SELECT * FROM nested`, "mutation", "sqlserver");
});

test("plain SELECT structure and risk-like inert text remain read-only controls", () => {
	for (const [query, engine] of [
		["SELECT id, status FROM users WHERE id = 1", "mysql"],
		["SELECT naïve FROM users", "mysql"],
		["SELECT (id) FROM users WHERE id IN (1, 2)", "mysql"],
		["SELECT id FROM users WHERE EXISTS (SELECT 1 FROM jobs WHERE jobs.user_id = users.id)", "mysql"],
		["SELECT * FROM (SELECT id FROM users) AS nested", "mysql"],
		["WITH nested(id) AS (SELECT id FROM users) SELECT id FROM nested", "sqlserver"],
		["SELECT TOP (10) id FROM dbo.Users", "sqlserver"],
		["SELECT * FROM dbo.Users CROSS APPLY (SELECT dbo.Users.id AS id) AS nested", "sqlserver"],
		["SELECT 'audit_read() NEXT VALUE FOR @x := 1 INTO OUTFILE FOR UPDATE WITH (UPDLOCK)' AS inert", "mysql"],
		["SELECT `audit_read() NEXT VALUE FOR @x INTO OUTFILE FOR UPDATE` FROM users", "mysql"],
		["SELECT [NEXT VALUE FOR @x INTO archive FOR UPDATE WITH (UPDLOCK)] FROM dbo.Users", "sqlserver"],
		["/* audit_read() NEXT VALUE FOR @x := 1 INTO OUTFILE FOR UPDATE WITH (UPDLOCK) */ SELECT 1", "sqlserver"],
	] as const) assertDecision(query, "read-only", engine);
});

test("multiple statements are confirmation-required while semicolons in comments, identifiers, and strings are inert", () => {
	for (const query of [
		"SELECT ';' AS semi",
		"SELECT `semi;colon` FROM t",
		"SELECT 1 /* ; DROP TABLE x */",
		"SELECT 1 -- ; DELETE FROM x\n",
	]) assert.equal(decision(query).statementCount, 1, query);
	const mysqlDashAmbiguity = decision("SELECT 1--1; DROP TABLE users");
	assert.equal(mysqlDashAmbiguity.requiresConfirmation, true);
	assert.equal(mysqlDashAmbiguity.classification, "multiple");
	assert.equal(mysqlDashAmbiguity.statementCount, 2);
	assert.equal(decision("SELECT 1-- real MySQL comment\n").requiresConfirmation, false);
	assert.equal(decision("/* outer /* nested */ hidden */ SELECT 1", "sqlserver").requiresConfirmation, false);
	assert.throws(() => decision("/* outer /* nested */ hidden */ SELECT 1", "mysql"));
	const multiple = decision("SELECT 1; SELECT 2;");
	assert.deepEqual({
		classification: multiple.classification,
		requiresConfirmation: multiple.requiresConfirmation,
		statementCount: multiple.statementCount,
	}, { classification: "multiple", requiresConfirmation: true, statementCount: 2 });
	assert.throws(() => decision(Array.from({ length: MAX_SQL_STATEMENTS + 1 }, () => "SELECT 1").join(";")));
});

test("SQL parser fails closed on client commands, executable comments, GO, controls, size and depth", () => {
	for (const [query, engine] of [
		["source /tmp/attacker.sql", "mysql"],
		["\\! rm -rf /", "mysql"],
		["!! whoami", "mysql"],
		[":!! whoami", "sqlserver"],
		["SELECT $(danger)", "mysql"],
		["/*!50000 DELETE FROM users */ SELECT 1", "mysql"],
		["/*M! INTO OUTFILE '/tmp/export' */ SELECT 1", "mysql"],
		["/*m!100100 SET @x = 1 */ SELECT 1", "mysql"],
		["SELECT value FROM source /*M! INTO OUTFILE '/tmp/export' */", "mysql"],
		["/*+ MAX_EXECUTION_TIME(1) */ SELECT 1", "mysql"],
		["SELECT 1\nGO\nSELECT 2", "sqlserver"],
		["SELECT \u0000", "mysql"],
		["SELECT 'unterminated", "mysql"],
		["SELECT 'mode\\'ambiguous'; DROP TABLE users", "mysql"],
		["SELECT `mode\\`ambiguous`; DROP TABLE users", "mysql"],
		["SELECT [unterminated", "sqlserver"],
	] as const) assert.throws(() => classifySql(query, engine));
	assert.throws(() => decision(`SELECT '${"x".repeat(MAX_QUERY_BYTES)}'`));
	assert.throws(() => decision(`${"(".repeat(MAX_SQL_DEPTH + 1)}SELECT 1${")".repeat(MAX_SQL_DEPTH + 1)}`));
});

test("output redacts the atomic profile and password before applying row, column, cell and model bounds", () => {
	const raw = Buffer.from([
		`header\tvalue\npassword\t${PASSWORD}\nprofile\t${PROFILE_TEXT}\n`,
		`host\t${MYSQL.host}\nuser\t${MYSQL.user}\ndatabase\t${MYSQL.database}\nport\t${MYSQL.port}\n`,
		...Array.from({ length: MAX_DISPLAY_ROWS + 20 }, (_, index) => `row-${index}\tvalue\n`),
	].join(""), "utf8");
	const output = formatDatabaseOutput(raw, MYSQL, PROFILE_TEXT);
	assert.equal(output.text.includes(PASSWORD), false);
	assert.equal(output.text.includes(PROFILE_TEXT), false);
	for (const scalar of [MYSQL.host, MYSQL.user, MYSQL.database, String(MYSQL.port)]) {
		assert.equal(output.text.includes(scalar!), false, `profile scalar leaked: ${scalar}`);
	}
	assert.equal(output.text.includes("[REDACTED]"), true);
	assert.equal(output.truncated, true);
	assert.equal(output.displayedRows, MAX_DISPLAY_ROWS);
	assert.ok(Buffer.byteLength(output.text, "utf8") <= MAX_MODEL_OUTPUT_BYTES);
	assert.match(output.text, /full output was not persisted/u);

	const wide = formatDatabaseOutput(
		Buffer.from(`${Array.from({ length: MAX_DISPLAY_COLUMNS + 10 }, (_, index) => `column-${index}`).join("\t")}\n`),
		MYSQL,
	);
	assert.equal(wide.truncated, true);
	assert.match(wide.text, /columns truncated/u);
	const longCell = formatDatabaseOutput(Buffer.from(`${"é".repeat(MAX_CELL_BYTES)}\n`), MYSQL);
	assert.equal(longCell.truncated, true);
	assert.ok(Buffer.byteLength(longCell.text.split("\n")[0]!, "utf8") <= MAX_CELL_BYTES);
	assert.equal(formatDatabaseOutput(Buffer.alloc(0), MYSQL).text, "Query executed successfully. No rows returned.");
	const sentinelCollisionProfile = Object.freeze({ ...MYSQL, password: "REDACTED" });
	const sentinelCollision = formatDatabaseOutput(Buffer.from("value\tREDACTED\n"), sentinelCollisionProfile);
	assert.equal(sentinelCollision.text.includes("REDACTED"), false, "redaction marker must not contain a profile value");
});

test("output rejects invalid UTF-8 and raw byte overflow without retaining a full spill file", () => {
	assert.throws(() => formatDatabaseOutput(Buffer.from([0xc3, 0x28]), MYSQL));
	assert.throws(() => formatDatabaseOutput(Buffer.alloc(MAX_STDOUT_BYTES + 1), MYSQL));
});

test("trusted Nix profile candidates derive only from a bounded system account name", () => {
	assert.equal(
		nixProfileExecutableCandidate("mysql", "alice"),
		"/etc/profiles/per-user/alice/bin/mysql",
	);
	assert.equal(
		nixProfileExecutableCandidate("sqlserver", "alice"),
		"/etc/profiles/per-user/alice/bin/sqlcmd",
	);
	for (const username of ["", "../alice", "alice/bob", " alice", "alice ", "a\nname", 42, null]) {
		assert.equal(nixProfileExecutableCandidate("mysql", username), undefined);
	}
});

test("client invocation uses fixed absolute executables, password-only child environment, and no query/password argv", () => {
	const mysql = buildDatabaseClientInvocation(MYSQL, "/usr/bin/mysql");
	assert.equal(mysql.executable, "/usr/bin/mysql");
	assert.deepEqual(mysql.environment, { LC_ALL: "C", LANG: "C", MYSQL_PWD: PASSWORD });
	assert.equal(mysql.args.includes(PASSWORD), false);
	assert.equal(mysql.args.some((argument) => argument.includes("SELECT")), false);
	assert.equal(mysql.args.includes("--no-defaults"), true);
	assert.equal(mysql.args.includes("--user"), true);
	assert.equal(mysql.args.includes("runner_db"), false, "database must not be an option-like positional argument");
	assert.equal(mysql.args.includes("--database=runner_db"), true);

	const sqlserver = buildDatabaseClientInvocation(SQLSERVER, "/usr/bin/sqlcmd");
	assert.deepEqual(sqlserver.environment, { LC_ALL: "C", LANG: "C", SQLCMDPASSWORD: PASSWORD });
	assert.equal(sqlserver.args.includes(PASSWORD), false);
	assert.equal(sqlserver.args.includes("-C"), false);
	const trusted = buildDatabaseClientInvocation({ ...SQLSERVER, trustServerCertificate: true }, "/usr/bin/sqlcmd");
	assert.equal(trusted.args.includes("-C"), true);
	assert.throws(() => buildDatabaseClientInvocation(MYSQL, "mysql"));
});

class FakeReadable extends EventEmitter {}
class FakeInput extends EventEmitter {
	readonly writes: Array<{ value: unknown; encoding: unknown }> = [];
	end(value?: unknown, encoding?: unknown): this {
		this.writes.push({ value, encoding });
		return this;
	}
}
class FakeChild extends EventEmitter {
	readonly stdin = new FakeInput();
	readonly stdout = new FakeReadable();
	readonly stderr = new FakeReadable();
	readonly kills: string[] = [];
	pid: number | undefined;
	kill(signal?: string): boolean { this.kills.push(signal ?? "SIGTERM"); return true; }
}

function fakeRunnerHarness() {
	const child = new FakeChild();
	let invocation: { command: string; args: readonly string[]; options: Record<string, unknown> } | undefined;
	const runner = new SpawnDatabaseRunner({
		resolveExecutable: () => "/usr/bin/mysql",
		now: (() => { let now = 1_000; return () => ++now; })(),
		spawnProcess(command, args, options) {
			invocation = { command, args, options: options as Record<string, unknown> };
			return child as never;
		},
	});
	return { child, runner, get invocation() { return invocation; } };
}

test("fake child receives SQL only through stdin with isolated env and bounded stdout/stderr", async () => {
	const harness = fakeRunnerHarness();
	const query = "SELECT 'stdin only'";
	const pending = harness.runner.run(MYSQL, query, "/offline/project");
	assert.ok(harness.invocation);
	assert.equal(harness.invocation!.command, "/usr/bin/mysql");
	assert.equal(harness.invocation!.args.includes(query), false);
	assert.equal(harness.invocation!.args.includes(PASSWORD), false);
	assert.deepEqual(harness.invocation!.options.env, { LC_ALL: "C", LANG: "C", MYSQL_PWD: PASSWORD });
	assert.equal(harness.invocation!.options.cwd, "/offline/project");
	assert.equal(harness.invocation!.options.shell, false);
	assert.deepEqual(harness.invocation!.options.stdio, ["pipe", "pipe", "pipe"]);
	assert.deepEqual(harness.child.stdin.writes, [{ value: `${query}\n`, encoding: "utf8" }]);
	harness.child.stdout.emit("data", Buffer.from("id\tname\n1\talice\n"));
	harness.child.stderr.emit("data", Buffer.from("ignored diagnostic canary"));
	harness.child.emit("close", 0);
	const result = await pending;
	assert.equal(result.ok, true);
	if (result.ok) assert.equal(result.stdout.toString("utf8"), "id\tname\n1\talice\n");

	const overflow = fakeRunnerHarness();
	const overflowPending = overflow.runner.run(MYSQL, "SELECT 1", "/offline/project");
	overflow.child.stderr.emit("data", Buffer.alloc(MAX_STDERR_BYTES + 1));
	overflow.child.emit("close", 1);
	assert.deepEqual((await overflowPending).ok, false);
	assert.equal(overflow.child.kills.includes("SIGTERM"), true);
});

test("fake child abort and stdout overflow terminate work with fixed failures and no output spill", async () => {
	const aborted = fakeRunnerHarness();
	const controller = new AbortController();
	const abortPending = aborted.runner.run(MYSQL, "SELECT 1", "/offline/project", controller.signal);
	controller.abort();
	aborted.child.emit("close", null);
	const abortResult = await abortPending;
	assert.deepEqual({ ok: abortResult.ok, ...(!abortResult.ok ? { code: abortResult.code } : {}) }, { ok: false, code: "aborted" });
	assert.equal(aborted.child.kills.includes("SIGTERM"), true);

	const overflow = fakeRunnerHarness();
	const overflowPending = overflow.runner.run(MYSQL, "SELECT 1", "/offline/project");
	overflow.child.stdout.emit("data", Buffer.alloc(MAX_STDOUT_BYTES + 1));
	overflow.child.emit("close", 1);
	const overflowResult = await overflowPending;
	assert.deepEqual({ ok: overflowResult.ok, ...(!overflowResult.ok ? { code: overflowResult.code } : {}) }, { ok: false, code: "output_limit" });
});

test("runtime sources pin time/output bounds and contain no temp-file, shell, log, message, or inherited-env sink", async () => {
	assert.equal(DATABASE_EXECUTION_TIMEOUT_MS, 30_000);
	const files = ["extension.ts", "output.ts", "profile-resolver.ts", "profile.ts", "project-scope.ts", "protocol.ts", "requirements.ts", "runner.ts", "sql-safety.ts", "static-config.ts"];
	const source = (await Promise.all(files.map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")))).join("\n");
	for (const forbidden of [
		"console.",
		"writeFile",
		"appendFile",
		"mkdtemp",
		"tmpdir(",
		"process.stdout",
		"process.stderr",
		"shell: true",
		"...process.env",
		"env: process.env",
		"execFile(",
	]) assert.equal(source.includes(forbidden), false, forbidden);
	assert.match(source, /stdio: \["pipe", "pipe", "pipe"\]/u);
	assert.match(source, /child\.stdin\.end\(query/u);
	assert.match(source, /MAX_STDOUT_BYTES/u);
	assert.match(source, /MAX_MODEL_OUTPUT_BYTES/u);
});
