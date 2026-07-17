import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import {
	DATABASE_PROFILE_MAX_BYTES,
	parseDatabaseProfile,
	parseLegacyDatabaseProfile,
} from "../profile.ts";
import { canonicalizeProjectScope } from "../project-scope.ts";
import {
	DATABASE_PROFILE_CONSUMER,
	DATABASE_PROFILE_CONTRACT,
	DATABASE_PROFILE_PURPOSE,
	DATABASE_PROFILE_ROLE,
	DATABASE_QUERY_TOOL,
	DATABASE_REQUIREMENTS_CHANNEL,
	DATABASE_REQUIREMENTS_PROTOCOL,
	deriveDatabaseRequirementId,
	deriveProjectScopeId,
} from "../protocol.ts";
import { DatabaseRequirementStore } from "../requirements.ts";
import {
	DatabaseProfileResolverConsumer,
	DatabaseProfileResolutionError,
} from "../profile-resolver.ts";
import {
	DatabaseRequirementMetadataCache,
	parseDatabaseRequirementEvent,
} from "../../onepassword-secrets-manager/src/database-profile.ts";

const PASSWORD = "PROFILE_PASSWORD_CANARY_DO_NOT_EXPOSE";

function mysqlProfile(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		version: 1,
		engine: "mysql",
		host: "127.0.0.1",
		port: 3306,
		user: "app_user",
		password: PASSWORD,
		database: "app_db",
		...overrides,
	});
}

function sqlServerProfile(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		version: 1,
		engine: "sqlserver",
		host: "sql.example.test",
		port: 1433,
		user: "app_user",
		password: PASSWORD,
		database: "app_db",
		schema: "dbo",
		encrypt: true,
		trustServerCertificate: false,
		...overrides,
	});
}

function rejectsProfile(text: unknown): void {
	assert.throws(() => parseDatabaseProfile(text), /profile is invalid/u);
}

test("atomic JSON profile contract accepts only the documented MySQL and SQL Server shapes", () => {
	assert.deepEqual(parseDatabaseProfile(mysqlProfile()), {
		version: 1,
		engine: "mysql",
		host: "127.0.0.1",
		port: 3306,
		user: "app_user",
		password: PASSWORD,
		database: "app_db",
	});
	assert.deepEqual(parseDatabaseProfile(JSON.stringify({
		version: 1,
		engine: "mysql",
		socket: "/run/mysqld/mysqld.sock",
		user: "socket_user",
		password: PASSWORD,
		database: "socket_db",
	})), {
		version: 1,
		engine: "mysql",
		socket: "/run/mysqld/mysqld.sock",
		port: 3306,
		user: "socket_user",
		password: PASSWORD,
		database: "socket_db",
	});
	assert.deepEqual(parseDatabaseProfile(sqlServerProfile()), {
		version: 1,
		engine: "sqlserver",
		host: "sql.example.test",
		port: 1433,
		user: "app_user",
		password: PASSWORD,
		database: "app_db",
		schema: "dbo",
		encrypt: true,
		trustServerCertificate: false,
	});
});

test("profile parser rejects aliases, unknown/duplicate/nested keys, unsafe routing, invalid ports and non-booleans", () => {
	for (const value of [
		mysqlProfile({ version: 2 }),
		mysqlProfile({ engine: "mariadb" }),
		mysqlProfile({ engine: "mssql" }),
		mysqlProfile({ unknown: true }),
		mysqlProfile({ host: " 127.0.0.1" }),
		mysqlProfile({ host: "db\nattacker" }),
		mysqlProfile({ host: "--execute=DROP TABLE users" }),
		mysqlProfile({ user: "--defaults-extra-file=/tmp/attacker" }),
		mysqlProfile({ database: "--execute=DROP TABLE users" }),
		mysqlProfile({ host: "op://vault/item/host" }),
		mysqlProfile({ user: "OP://vault/item/user" }),
		mysqlProfile({ database: "op://vault/item/database" }),
		mysqlProfile({ host: "127.0.0.1", socket: "/tmp/mysql.sock" }),
		mysqlProfile({ host: undefined, socket: "relative/mysql.sock" }),
		mysqlProfile({ port: 0 }),
		mysqlProfile({ port: 65536 }),
		mysqlProfile({ port: 3306.5 }),
		mysqlProfile({ port: "3306" }),
		mysqlProfile({ schema: "dbo" }),
		mysqlProfile({ encrypt: true }),
		sqlServerProfile({ host: undefined }),
		sqlServerProfile({ socket: "/tmp/sql.sock" }),
		sqlServerProfile({ encrypt: "true" }),
		sqlServerProfile({ trustServerCertificate: 0 }),
		sqlServerProfile({ port: undefined }),
		'{"version":1,"engine":"mysql","host":"db","port":3306,"user":"u","password":"p","database":"d","database":"other"}',
		'{"version":1,"engine":"mysql","host":{"nested":true},"user":"u","password":"p","database":"d"}',
		'{"version":1,"engine":"mysql","host":"db","user":"u","password":"p","database":"d","extra":[1]}',
		'{"version":1,"engine":"mysql","host":"db","user":"u","password":"p","database":"d","port":1e3}',
	]) rejectsProfile(value);
});

test("profile parser enforces byte, flat-depth, Unicode, and secret-reference bounds", () => {
	rejectsProfile(" ".repeat(DATABASE_PROFILE_MAX_BYTES + 1));
	rejectsProfile(mysqlProfile({ password: `op://vault/item/field` }));
	rejectsProfile(mysqlProfile({ password: `OP://vault/item/field` }));
	rejectsProfile(mysqlProfile({ password: `x\u0000y` }));
	rejectsProfile(mysqlProfile({ password: "p".repeat(8 * 1024 + 1) }));
	rejectsProfile(mysqlProfile({ user: "u".repeat(257) }));
	rejectsProfile(mysqlProfile({ database: "d".repeat(257) }));
	rejectsProfile(mysqlProfile({ host: "h".repeat(256) }));
	rejectsProfile(mysqlProfile({ host: "db\u2028name" }));
	rejectsProfile('{"version":1,"engine":"mysql","host":"db","user":"u","password":"p","database":"d","x":{"y":{"z":1}}}');
	assert.equal(parseDatabaseProfile(mysqlProfile({ password: " leading and trailing allowed " })).password, " leading and trailing allowed ");
});

test("legacy plaintext parser preserves engine aliases and safe defaults without widening dynamic profile contract", () => {
	assert.deepEqual(parseLegacyDatabaseProfile(JSON.stringify({
		type: "mariadb",
		host: "localhost",
		user: "legacy",
		password: PASSWORD,
		database: "legacy_db",
	})), {
		version: 1,
		engine: "mysql",
		host: "localhost",
		port: 3306,
		user: "legacy",
		password: PASSWORD,
		database: "legacy_db",
	});
	assert.deepEqual(parseLegacyDatabaseProfile(JSON.stringify({
		type: "mssql",
		host: "localhost",
		user: "legacy",
		password: PASSWORD,
		database: "legacy_db",
	})), {
		version: 1,
		engine: "sqlserver",
		host: "localhost",
		port: 1433,
		user: "legacy",
		password: PASSWORD,
		database: "legacy_db",
		encrypt: true,
		trustServerCertificate: false,
	});
});

class EventBus {
	readonly observed: Array<{ channel: string; data: unknown }> = [];
	#listeners = new Map<string, Set<(data: unknown) => void>>();
	on(channel: string, handler: (data: unknown) => void): () => void {
		const listeners = this.#listeners.get(channel) ?? new Set<(data: unknown) => void>();
		listeners.add(handler);
		this.#listeners.set(channel, listeners);
		return () => { listeners.delete(handler); };
	}
	emit(channel: string, data: unknown): void {
		this.observed.push({ channel, data });
		for (const handler of this.#listeners.get(channel) ?? []) handler(data);
	}
}

function scope(path: string) {
	return Object.freeze({ projectPath: path, projectScopeId: deriveProjectScopeId(path) });
}

test("canonical project scope uses realpath, not basename, and aliases a symlink to its target", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-db-scope-test-"));
	try {
		const left = join(root, "left", "same-name");
		const right = join(root, "right", "same-name");
		const alias = join(root, "same-name-link");
		await mkdir(left, { recursive: true });
		await mkdir(right, { recursive: true });
		await symlink(left, alias, "dir");
		const leftScope = canonicalizeProjectScope(left);
		const rightScope = canonicalizeProjectScope(right);
		const aliasScope = canonicalizeProjectScope(alias);
		assert.equal(basename(leftScope.projectPath), basename(rightScope.projectPath));
		assert.notEqual(leftScope.projectPath, rightScope.projectPath);
		assert.notEqual(leftScope.projectScopeId, rightScope.projectScopeId, "same basename must not authorize another project");
		assert.deepEqual(aliasScope, leftScope, "symlink aliases must canonicalize to one scope");
		assert.equal(Object.isFrozen(leftScope), true);
		for (const invalid of ["relative/path", `${left}\n`, `${left}/missing`, "", null]) {
			assert.throws(() => canonicalizeProjectScope(invalid));
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("producer and 1Password consumer agree on exact frozen protocol metadata and isolate project/profile replacements", () => {
	const bus = new EventBus();
	const invalidated: string[][] = [];
	const cache = new DatabaseRequirementMetadataCache((records) => {
		invalidated.push(records.map((record) => record.requirementId));
	});
	cache.start(bus);
	cache.enable();
	let nonce = 0;
	const store = new DatabaseRequirementStore(bus, (size) => {
		assert.equal(size, 24);
		const bytes = Buffer.alloc(size);
		bytes.writeUInt32BE(++nonce, size - 4);
		return bytes;
	});
	const projectA = scope("/offline/projects/alpha");
	const projectB = scope("/offline/other/alpha");
	const primary = store.prepare(projectA, "primary");
	const reporting = store.prepare(projectA, "reporting");
	const otherProject = store.prepare(projectB, "primary");
	for (const requirement of [primary, reporting, otherProject]) {
		assert.equal(cache.lookup(requirement.requirementId)?.requirementId, requirement.requirementId);
		assert.equal(Object.isFrozen(requirement), true);
		assert.equal(requirement.consumer, DATABASE_PROFILE_CONSUMER);
		assert.equal(requirement.tool, DATABASE_QUERY_TOOL);
		assert.equal(requirement.purpose, DATABASE_PROFILE_PURPOSE);
		assert.equal(requirement.profileRole, DATABASE_PROFILE_ROLE);
		assert.equal(requirement.contract, DATABASE_PROFILE_CONTRACT);
	}
	assert.notEqual(primary.requirementId, reporting.requirementId);
	assert.notEqual(primary.requirementId, otherProject.requirementId);
	assert.throws(() => store.inspect(primary.requirementId, projectB));
	assert.equal(store.inspect(primary.requirementId, projectA), primary);

	const replacement = store.prepare(projectA, "primary");
	assert.equal(cache.lookup(primary.requirementId), undefined);
	assert.equal(cache.lookup(replacement.requirementId)?.profileName, "primary");
	assert.equal(cache.lookup(reporting.requirementId)?.profileName, "reporting");
	assert.equal(cache.lookup(otherProject.requirementId)?.projectPath, projectB.projectPath);
	assert.deepEqual(invalidated, [[primary.requirementId]]);

	for (const event of bus.observed) {
		assert.equal(event.channel, DATABASE_REQUIREMENTS_CHANNEL);
		assert.equal(Object.isFrozen(event.data), true);
		const parsed = parseDatabaseRequirementEvent(event.data);
		assert.equal(Object.isFrozen(parsed), true);
		const serialized = JSON.stringify(event.data);
		assert.equal(serialized.includes(PASSWORD), false);
		assert.equal(serialized.includes("op://"), false);
	}
	assert.throws(() => store.prepare(projectA, "Project1_database"));
	assert.throws(() => store.prepare(projectA, "../primary"));
	cache.shutdown();
});

function validProtocolEvent() {
	const projectPath = "/offline/projects/strict";
	const projectScopeId = deriveProjectScopeId(projectPath);
	const preparationId = `dbn1-${Buffer.alloc(24, 7).toString("base64url")}`;
	const base = {
		preparationId,
		projectScopeId,
		consumer: DATABASE_PROFILE_CONSUMER,
		tool: DATABASE_QUERY_TOOL,
		purpose: DATABASE_PROFILE_PURPOSE,
		profileName: "primary",
		profileRole: DATABASE_PROFILE_ROLE,
		contract: DATABASE_PROFILE_CONTRACT,
	} as const;
	const requirement = Object.freeze({
		requirementId: deriveDatabaseRequirementId(base),
		...base,
		projectPath,
	});
	return Object.freeze({
		protocol: DATABASE_REQUIREMENTS_PROTOCOL,
		action: "replace" as const,
		projectScopeId,
		profileName: "primary",
		requirements: Object.freeze([requirement]),
	});
}

test("requirement parser rejects mutable, accessor, prototype, symbol, sparse, extra, malformed and oversized events atomically", () => {
	const valid = validProtocolEvent();
	assert.equal(parseDatabaseRequirementEvent(valid).action, "replace");
	let getterCalls = 0;
	const accessor = { ...valid } as Record<string, unknown>;
	Object.defineProperty(accessor, "protocol", {
		enumerable: true,
		get() { getterCalls += 1; return DATABASE_REQUIREMENTS_PROTOCOL; },
	});
	Object.freeze(accessor);
	const custom = Object.assign(Object.create({ inherited: true }), valid);
	Object.freeze(custom);
	const nullPrototype = Object.assign(Object.create(null), valid);
	Object.freeze(nullPrototype);
	const symbol = { ...valid } as Record<PropertyKey, unknown>;
	symbol[Symbol("extra")] = true;
	Object.freeze(symbol);
	const sparse: unknown[] = [];
	sparse.length = 1;
	Object.freeze(sparse);
	const requirement = valid.requirements[0]!;
	const invalidCases: unknown[] = [
		{ ...valid },
		Object.freeze({ ...valid, extra: true }),
		accessor,
		custom,
		nullPrototype,
		symbol,
		Object.freeze({ ...valid, requirements: [requirement] }),
		Object.freeze({ ...valid, requirements: sparse }),
		Object.freeze({ ...valid, requirements: Object.freeze([Object.freeze({ ...requirement, extra: true })]) }),
		Object.freeze({ ...valid, projectScopeId: deriveProjectScopeId("/offline/other") }),
		Object.freeze({ ...valid, profileName: "other" }),
		Object.freeze({ ...valid, protocol: "pi.database.profile-requirements/v2" }),
		Object.freeze({ protocol: DATABASE_REQUIREMENTS_PROTOCOL, action: "invalidate", extra: true }),
	];
	for (const candidate of invalidCases) assert.throws(() => parseDatabaseRequirementEvent(candidate));
	assert.equal(getterCalls, 0, "getters must never execute during admission");

	const hugePath = `/${"a".repeat(4097)}`;
	const hugeScope = deriveProjectScopeId(hugePath);
	const hugeBase = {
		preparationId: requirement.preparationId,
		projectScopeId: hugeScope,
		consumer: DATABASE_PROFILE_CONSUMER,
		tool: DATABASE_QUERY_TOOL,
		purpose: DATABASE_PROFILE_PURPOSE,
		profileName: "primary",
		profileRole: DATABASE_PROFILE_ROLE,
		contract: DATABASE_PROFILE_CONTRACT,
	} as const;
	const hugeRequirement = Object.freeze({
		requirementId: deriveDatabaseRequirementId(hugeBase),
		...hugeBase,
		projectPath: hugePath,
	});
	assert.throws(() => parseDatabaseRequirementEvent(Object.freeze({
		protocol: DATABASE_REQUIREMENTS_PROTOCOL,
		action: "replace",
		projectScopeId: hugeScope,
		profileName: "primary",
		requirements: Object.freeze([hugeRequirement]),
	})));
});

test("profile resolver callback accepts only exact frozen plain responses and never invokes accessors", async () => {
	const event = validProtocolEvent();
	const requirement = event.requirements[0]!;
	const cases: Array<{ response: () => unknown; accepted: boolean }> = [
		{ response: () => Object.freeze({ protocol: "pi.database.profile-resolver/v1", ok: true, value: mysqlProfile() }), accepted: true },
		{ response: () => ({ protocol: "pi.database.profile-resolver/v1", ok: true, value: mysqlProfile() }), accepted: false },
		{ response: () => Object.freeze({ protocol: "pi.database.profile-resolver/v1", ok: true, value: mysqlProfile(), extra: true }), accepted: false },
		{ response: () => Object.freeze(Object.assign(Object.create(null), { protocol: "pi.database.profile-resolver/v1", ok: true, value: mysqlProfile() })), accepted: false },
		{ response: () => Object.freeze({ protocol: "pi.database.profile-resolver/v2", ok: true, value: mysqlProfile() }), accepted: false },
		{ response: () => Object.freeze({ protocol: "pi.database.profile-resolver/v1", ok: false, code: "not_a_code" }), accepted: false },
	];
	for (const entry of cases) {
		const bus = new EventBus();
		bus.on("pi:database:profile-resolver:v1:request", (request) => {
			(request as { respond(value: unknown): void }).respond(entry.response());
		});
		const consumer = new DatabaseProfileResolverConsumer(bus, {
			random: () => Buffer.alloc(24, 1),
			timeoutMs: 50,
		});
		if (entry.accepted) assert.equal(await consumer.resolve(requirement), mysqlProfile());
		else await assert.rejects(
			() => consumer.resolve(requirement),
			(error: unknown) => error instanceof DatabaseProfileResolutionError && error.code === "response_rejected",
		);
		consumer.shutdown();
	}

	let getterCalls = 0;
	const getterResponse = { protocol: "pi.database.profile-resolver/v1", value: mysqlProfile() } as Record<string, unknown>;
	Object.defineProperty(getterResponse, "ok", {
		enumerable: true,
		get() { getterCalls += 1; return true; },
	});
	Object.freeze(getterResponse);
	const bus = new EventBus();
	bus.on("pi:database:profile-resolver:v1:request", (request) => {
		(request as { respond(value: unknown): void }).respond(getterResponse);
	});
	const consumer = new DatabaseProfileResolverConsumer(bus, { random: () => Buffer.alloc(24, 2), timeoutMs: 50 });
	await assert.rejects(() => consumer.resolve(requirement), DatabaseProfileResolutionError);
	assert.equal(getterCalls, 0);
	consumer.shutdown();
});

test("profile resolver rejects an oversized callback value at the protocol boundary", async () => {
	const requirement = validProtocolEvent().requirements[0]!;
	const bus = new EventBus();
	bus.on("pi:database:profile-resolver:v1:request", (request) => {
		(request as { respond(value: unknown): void }).respond(Object.freeze({
			protocol: "pi.database.profile-resolver/v1",
			ok: true,
			value: "x".repeat(DATABASE_PROFILE_MAX_BYTES + 1),
		}));
	});
	const consumer = new DatabaseProfileResolverConsumer(bus, { random: () => Buffer.alloc(24, 3), timeoutMs: 50 });
	await assert.rejects(
		() => consumer.resolve(requirement),
		(error: unknown) => error instanceof DatabaseProfileResolutionError && error.code === "response_rejected",
	);
	consumer.shutdown();
});
