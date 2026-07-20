import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { CredentialMaterial } from "../src/credentials.ts";
import { managedToolboxConfig, ManagedServerRegistry } from "../src/managed-config.ts";
import { createManagedAwareSdkFactory, parseManagedDatabaseFields } from "../src/managed-server.ts";
import type { ToolboxSdkClientFactory } from "../src/sdk.ts";

function emptyCredentials(): CredentialMaterial {
	return {
		headers: Object.create(null) as Record<string, string>,
		authTokens: Object.create(null) as Record<string, string>,
		boundParams: Object.create(null) as Record<string, string>,
		redactionValues: [],
		resolverValuesUsed: false,
	};
}

test("managed database fields strictly normalize supported 1Password Database metadata mappings", () => {
	const credentials = emptyCredentials();
	credentials.boundParams = Object.assign(Object.create(null), {
		database_type: "MariaDB",
		server: "db.example.test",
		port: "3307",
		database: "app",
		username: "app-user",
		password: "FAKE_MANAGED_PASSWORD_CANARY",
	});
	assert.deepEqual(parseManagedDatabaseFields(credentials), {
		engine: "mysql",
		host: "db.example.test",
		port: "3307",
		database: "app",
		user: "app-user",
		password: "FAKE_MANAGED_PASSWORD_CANARY",
	});
	credentials.boundParams.database_type = "Microsoft SQL Server";
	assert.equal(parseManagedDatabaseFields(credentials).engine, "mssql");
	credentials.boundParams.port = "0";
	assert.throws(() => parseManagedDatabaseFields(credentials), /port is invalid/u);
	credentials.boundParams.port = "1433";
	delete credentials.boundParams.server;
	assert.throws(() => parseManagedDatabaseFields(credentials), /incomplete/u);
});

test("managed-aware SDK factory delegates non-managed identities without runtime startup", async () => {
	const registry = new ManagedServerRegistry();
	registry.adopt(managedToolboxConfig(54_321));
	let calls = 0;
	const signal = new AbortController().signal;
	const client = {
		loadTool: async () => { throw new Error("unused"); },
		loadToolset: async () => [],
		invoke: async () => "unused",
	};
	const base: ToolboxSdkClientFactory = async (server, timeout, credentials, receivedSignal) => {
		calls += 1;
		assert.equal(server.id, "external");
		assert.equal(timeout, 1234);
		assert.equal(credentials.resolverValuesUsed, false);
		assert.equal(receivedSignal, signal);
		return client;
	};
	const factory = createManagedAwareSdkFactory(registry, base);
	const result = await factory({
		id: "external",
		url: "https://toolbox.example.test",
		protocol: "2025-11-25",
		headers: Object.freeze(Object.create(null)),
		authTokens: Object.freeze(Object.create(null)),
		boundParams: Object.freeze(Object.create(null)),
	}, 1234, emptyCredentials(), signal);
	assert.equal(result, client);
	assert.equal(calls, 1);
});

test("managed templates and installer are value-free and pin the exact runtime artifact", async () => {
	const [mysql, mssql, runtime, installer, ignored] = await Promise.all([
		readFile(new URL("../managed/mysql.yaml", import.meta.url), "utf8"),
		readFile(new URL("../managed/mssql.yaml", import.meta.url), "utf8"),
		readFile(new URL("../src/managed-server.ts", import.meta.url), "utf8"),
		readFile(new URL("../scripts/install-managed-runtime.mjs", import.meta.url), "utf8"),
		readFile(new URL("../.gitignore", import.meta.url), "utf8"),
	]);
	for (const template of [mysql, mssql]) {
		for (const variable of ["HOST", "PORT", "DATABASE", "USER", "PASSWORD"]) {
			assert.match(template, new RegExp(`\\$\\{PI_MCP_DB_${variable}\\}`, "u"));
		}
		assert.equal(template.includes("example-only"), false);
	}
	for (const source of [runtime, installer]) {
		assert.match(source, /1\.5\.0/u);
		assert.match(source, /7df2d9941ce34e53af0eacc74e09b29f6ac38543b010b637a0938f2dd2d75609/u);
		assert.match(source, /304_021_960/u);
	}
	assert.match(ignored, /^runtime\/$/mu);
	assert.doesNotMatch(runtime, /stdio:\s*["']pipe["']/u);
});
