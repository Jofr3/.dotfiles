import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	chmod,
	link,
	mkdtemp,
	readFile,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	canonicalToolName,
	ConfigStore,
	createInvocationSnapshot,
	findConfiguredTool,
	loadConfig,
	MAX_CONFIG_BYTES,
	parseConfig,
	type ConfigFileRuntime,
	type ConfigFileStat,
} from "../src/config.ts";

function validConfig(): Record<string, unknown> {
	return {
		version: 1,
		requestTimeoutMs: 10_000,
		servers: [{
			id: "local",
			url: "http://127.0.0.1:5000/",
			tools: [
				{ name: "search-hotels", confirmation: "not-required" },
				{ name: "update-hotel", toolset: "hotel-tools" },
			],
			denyTools: ["update-hotel"],
		}],
	};
}

function dynamicResolverConfig(): Record<string, unknown> {
	return {
		version: 1,
		requestTimeoutMs: 10_000,
		servers: [{
			id: "production",
			url: "https://toolbox.example.test/private?never=accepted",
			tools: [{
				name: "search-hotels",
				confirmation: "required",
				authTokens: ["my_oauth"],
				boundParams: ["example_database_password"],
			}],
			headers: {
				Authorization: { resolver: { provider: "onepassword-secrets-manager", dynamic: true } },
			},
			authTokens: {
				my_oauth: { resolver: { provider: "onepassword-secrets-manager", dynamic: true } },
			},
			boundParams: {
				example_database_password: { resolver: { provider: "onepassword-secrets-manager", dynamic: true } },
			},
		}],
	};
}

function resolverConfig(): Record<string, unknown> {
	return {
		version: 1,
		requestTimeoutMs: 10_000,
		servers: [{
			id: "production",
			url: "https://toolbox.example.test",
			tools: [{
				name: "search",
				toolset: "hotel-tools",
				authTokens: ["selected_oauth"],
				boundParams: ["tenant_id"],
			}],
			headers: {
				Authorization: { resolver: { provider: "bitwarden-secrets-manager", slot: "production-header" } },
			},
			authTokens: {
				selected_oauth: { resolver: { provider: "onepassword-secrets-manager", slot: "production-oauth" } },
				unused_oauth: { env: "UNUSED_ENV" },
			},
			boundParams: {
				tenant_id: { env: "TENANT_ENV" },
			},
		}],
	};
}

async function writeProtected(path: string, content: string | Buffer): Promise<void> {
	await writeFile(path, content);
	await chmod(path, 0o600);
}

function syntheticStat(overrides: Partial<ConfigFileStat> = {}): ConfigFileStat {
	return {
		dev: 10n,
		ino: 20n,
		mode: 0o100600n,
		nlink: 1n,
		uid: 1_000n,
		size: 0n,
		mtimeNs: 30n,
		ctimeNs: 40n,
		isFile: () => true,
		isSymbolicLink: () => false,
		...overrides,
	};
}

interface FakeRuntimeOptions {
	data?: Buffer;
	uid?: number | undefined;
	constants?: { O_RDONLY?: number; O_NOFOLLOW?: number; O_NONBLOCK?: number };
	lstats?: Array<ConfigFileStat | Error>;
	fstats?: ConfigFileStat[];
	openError?: Error & { code?: string };
	maxChunk?: number;
	shortAt?: number;
	probeBytes?: number;
}

function fakeRuntime(options: FakeRuntimeOptions = {}): ConfigFileRuntime & { reads: Array<{ length: number; position: number }>; flags: number[] } {
	const data = options.data ?? Buffer.from(JSON.stringify(validConfig()));
	const base = syntheticStat({ size: BigInt(data.byteLength) });
	const lstats = [...(options.lstats ?? [base, base])];
	const fstats = [...(options.fstats ?? [base, base])];
	const reads: Array<{ length: number; position: number }> = [];
	const flags: number[] = [];
	return {
		reads,
		flags,
		constants: options.constants ?? { O_RDONLY: 0, O_NOFOLLOW: 0x20_000, O_NONBLOCK: 0x800 },
		getuid: () => options.uid === undefined && !("uid" in options) ? 1_000 : options.uid,
		async lstat() {
			const value = lstats.shift();
			if (!value) throw new Error("unexpected lstat");
			if (value instanceof Error) throw value;
			return value;
		},
		async open(_path, openFlags) {
			flags.push(openFlags);
			if (options.openError) throw options.openError;
			return {
				async stat() {
					const value = fstats.shift();
					if (!value) throw new Error("unexpected fstat");
					return value;
				},
				async read(buffer, offset, length, position) {
					reads.push({ length, position });
					if (options.shortAt !== undefined && position >= options.shortAt && position < data.byteLength) {
						return { bytesRead: 0 };
					}
					if (position >= data.byteLength) return { bytesRead: options.probeBytes ?? 0 };
					const bytesRead = Math.min(length, options.maxChunk ?? length, data.byteLength - position);
					data.copy(buffer, offset, position, position + bytesRead);
					return { bytesRead };
				},
				async close() {},
			};
		},
	};
}

const SYNTHETIC_PATH = "/synthetic/mcp-toolbox.json";

async function loadSynthetic(runtime: ConfigFileRuntime) {
	return loadConfig({ overridePath: SYNTHETIC_PATH, runtime });
}

test("tracked example config remains valid, HTTPS, and confirmation-gated", async () => {
	const example = JSON.parse(await readFile(new URL("../config.example.json", import.meta.url), "utf8"));
	const config = parseConfig(example);
	assert.equal(config.servers[0]!.id, "production");
	assert.match(config.servers[0]!.url, /^https:/u);
	assert.equal(config.servers[0]!.tools.length, 2);
	assert.ok(config.servers[0]!.tools.every((tool) => tool.confirmation === "required"));
	assert.ok(JSON.stringify(config).includes("onepassword-secrets-manager"));
	assert.ok(JSON.stringify(config).includes('"dynamic":true'));
	assert.equal(JSON.stringify(config).includes("example-production-db-password"), false);
	assert.equal(JSON.stringify(config).includes("op://"), false);
});

test("strict config parsing normalizes safe URLs, defaults security policy, and deeply freezes", () => {
	const config = parseConfig(validConfig());
	assert.equal(config.servers[0]!.url, "http://127.0.0.1:5000");
	assert.equal(config.servers[0]!.protocol, "2025-11-25");
	assert.equal(config.servers[0]!.tools[1]!.confirmation, "required");
	assert.equal(canonicalToolName("local", "search-hotels"), "local/search-hotels");
	assert.equal(findConfiguredTool(config, "local", "search-hotels").tool.name, "search-hotels");
	assert.throws(() => findConfiguredTool(config, "local", "update-hotel"), /denied/u);
	assert.equal(Object.isFrozen(config), true);
	assert.equal(Object.isFrozen(config.servers), true);
	assert.equal(Object.isFrozen(config.servers[0]), true);
	assert.equal(Object.isFrozen(config.servers[0]!.tools[0]), true);
	assert.equal(Object.isFrozen(config.servers[0]!.tools[0]!.authTokens), true);
	assert.throws(() => { config.servers[0]!.url = "https://redirected.invalid"; }, TypeError);
});

test("invocation snapshot contains only selected references and is immutable across config aliases", () => {
	const config = parseConfig(resolverConfig());
	const invocation = createInvocationSnapshot(config, "production", "search");
	assert.equal(invocation.server.url, "https://toolbox.example.test");
	assert.deepEqual(Object.keys(invocation.server.authTokens), ["selected_oauth"]);
	assert.equal(Object.hasOwn(invocation.server.authTokens, "unused_oauth"), false);
	assert.deepEqual(invocation.server.headers.Authorization, {
		resolver: { provider: "bitwarden-secrets-manager", slot: "production-header" },
	});
	assert.deepEqual(invocation.server.authTokens.selected_oauth, {
		resolver: { provider: "onepassword-secrets-manager", slot: "production-oauth" },
	});
	for (const value of [
		invocation,
		invocation.server,
		invocation.server.headers,
		invocation.server.headers.Authorization,
		(invocation.server.headers.Authorization as { resolver: object }).resolver,
		invocation.server.authTokens,
		invocation.server.boundParams,
		invocation.tool,
		invocation.tool.authTokens,
		invocation.tool.boundParams,
	]) assert.equal(Object.isFrozen(value), true);
	assert.throws(() => { invocation.server.url = "https://redirected.invalid"; }, TypeError);
	assert.equal(config.servers[0]!.url, "https://toolbox.example.test");
});

test("config rejects unknown fields, unsafe URLs, collisions, and undefined references", () => {
	const unknown = validConfig();
	(unknown.servers as Array<Record<string, unknown>>)[0]!.password = "do-not-accept";
	assert.throws(() => parseConfig(unknown), /is not supported/u);

	for (const url of [
		"http://example.com",
		"https://user:pass@example.com",
		"https://example.com?token=value",
		"https://example.com/mcp",
	]) {
		const config = validConfig();
		(config.servers as Array<Record<string, unknown>>)[0]!.url = url;
		assert.throws(() => parseConfig(config), /config\.servers\[0\]\.url/u);
	}

	const duplicate = validConfig();
	(duplicate.servers as Array<Record<string, unknown>>)[0]!.tools = [
		{ name: "same" },
		{ name: "same", toolset: "other" },
	];
	assert.throws(() => parseConfig(duplicate), /ambiguous canonical tool name/u);

	const undefinedAuth = validConfig();
	(undefinedAuth.servers as Array<Record<string, unknown>>)[0]!.tools = [
		{ name: "search", authTokens: ["missing"] },
	];
	assert.throws(() => parseConfig(undefinedAuth), /undefined authentication source/u);
});

test("resolver references accept exactly the two providers and preserve the selected provider", () => {
	const configured = resolverConfig();
	const parsed = parseConfig(configured);
	assert.deepEqual(parsed.servers[0]!.headers.Authorization, {
		resolver: { provider: "bitwarden-secrets-manager", slot: "production-header" },
	});
	assert.deepEqual(parsed.servers[0]!.authTokens.selected_oauth, {
		resolver: { provider: "onepassword-secrets-manager", slot: "production-oauth" },
	});

	const invalidReferences: unknown[] = [
		{ resolver: { provider: "unknown-provider", slot: "production-authorization" } },
		{ resolver: { provider: "bitwarden-secrets-manager", slot: "Unsafe Slot" } },
		{ resolver: { provider: "bitwarden-secrets-manager", slot: "${TOOLBOX_SLOT}" } },
		{ env: "TOOLBOX_AUTHORIZATION", resolver: { provider: "bitwarden-secrets-manager", slot: "production" } },
		{ resolver: { provider: "bitwarden-secrets-manager", slot: "production", extra: "x" } },
	];
	for (const reference of invalidReferences) {
		const invalid = validConfig();
		(invalid.servers as Array<Record<string, unknown>>)[0]!.headers = { Authorization: reference };
		assert.throws(() => parseConfig(invalid), /config\.servers\[0\]\.headers\.Authorization/u);
	}

	const resolverUrl = validConfig();
	(resolverUrl.servers as Array<Record<string, unknown>>)[0]!.url = {
		resolver: { provider: "bitwarden-secrets-manager", slot: "endpoint" },
	};
	assert.throws(() => parseConfig(resolverUrl), /config\.servers\[0\]\.url/u);

	const resolverToolField = validConfig();
	(resolverToolField.servers as Array<Record<string, unknown>>)[0]!.tools = [{
		name: "search",
		resolver: { provider: "bitwarden-secrets-manager", slot: "tool" },
	}];
	assert.throws(() => parseConfig(resolverToolField), /resolver is not supported/u);
});

test("dynamic references accept only the exact value-free 1Password shape and survive frozen snapshots", () => {
	const configured = dynamicResolverConfig();
	(configured.servers as Array<Record<string, unknown>>)[0]!.url = "https://toolbox.example.test";
	const config = parseConfig(configured);
	const invocation = createInvocationSnapshot(config, "production", "search-hotels");
	for (const reference of [
		invocation.server.headers.Authorization,
		invocation.server.authTokens.my_oauth,
		invocation.server.boundParams.example_database_password,
	]) {
		assert.deepEqual(reference, {
			resolver: { provider: "onepassword-secrets-manager", dynamic: true },
		});
		assert.equal(Object.isFrozen(reference), true);
		assert.equal(Object.isFrozen((reference as { resolver: object }).resolver), true);
		assert.equal(Object.hasOwn((reference as { resolver: object }).resolver, "slot"), false);
	}

	let getterInvoked = false;
	const accessor = { provider: "onepassword-secrets-manager" } as Record<string, unknown>;
	Object.defineProperty(accessor, "dynamic", {
		enumerable: true,
		get() {
			getterInvoked = true;
			return true;
		},
	});
	const invalidReferences: unknown[] = [
		{ resolver: { provider: "onepassword-secrets-manager", dynamic: false } },
		{ resolver: { provider: "bitwarden-secrets-manager", dynamic: true } },
		{ resolver: { provider: "onepassword-secrets-manager", dynamic: true, slot: "mixed" } },
		{ resolver: { provider: "onepassword-secrets-manager", dynamic: true, value: "SECRET_CANARY" } },
		{ resolver: { provider: "onepassword-secrets-manager", dynamic: true, env: "SECRET_ENV" } },
		{ env: "SECRET_ENV", resolver: { provider: "onepassword-secrets-manager", dynamic: true } },
		{ resolver: accessor },
	];
	for (const reference of invalidReferences) {
		const invalid = dynamicResolverConfig();
		(invalid.servers as Array<Record<string, unknown>>)[0]!.url = "https://toolbox.example.test";
		(invalid.servers as Array<Record<string, unknown>>)[0]!.headers = { Authorization: reference };
		assert.throws(() => parseConfig(invalid), /config\.servers\[0\]\.headers\.Authorization/u);
	}
	assert.equal(getterInvoked, false);
});

test("config caps provider-aware resolver tuples and total credential references, and rejects header collisions", () => {
	const configured = validConfig();
	const headers: Record<string, unknown> = {};
	for (let index = 0; index < 21; index += 1) {
		headers[`X-Credential-${index}`] = {
			resolver: { provider: "bitwarden-secrets-manager", slot: `production-${index}` },
		};
	}
	(configured.servers as Array<Record<string, unknown>>)[0]!.headers = headers;
	assert.throws(() => parseConfig(configured), /more than 20 resolver references/u);

	const providerIsolated = validConfig();
	const providerHeaders: Record<string, unknown> = {};
	for (let index = 0; index < 11; index += 1) {
		for (const [suffix, provider] of [
			["Bw", "bitwarden-secrets-manager"],
			["Op", "onepassword-secrets-manager"],
		] as const) {
			providerHeaders[`X-${suffix}-${index}`] = {
				resolver: { provider, slot: `shared-${index}` },
			};
		}
	}
	(providerIsolated.servers as Array<Record<string, unknown>>)[0]!.headers = providerHeaders;
	assert.throws(() => parseConfig(providerIsolated), /more than 20 resolver references/u);

	const dynamicBound = validConfig();
	const dynamicHeaders: Record<string, unknown> = {};
	for (let index = 0; index < 21; index += 1) {
		dynamicHeaders[`X-Dynamic-${index}`] = {
			resolver: { provider: "onepassword-secrets-manager", dynamic: true },
		};
	}
	(dynamicBound.servers as Array<Record<string, unknown>>)[0]!.headers = dynamicHeaders;
	assert.throws(() => parseConfig(dynamicBound), /more than 20 resolver references/u);

	const total = validConfig();
	const totalHeaders: Record<string, unknown> = {};
	for (let index = 0; index < 32; index += 1) {
		totalHeaders[`X-Value-${index}`] = { env: `TOTAL_HEADER_${index}` };
	}
	Object.assign((total.servers as Array<Record<string, unknown>>)[0]!, {
		headers: totalHeaders,
		authTokens: { extra: { env: "TOTAL_AUTH" } },
		tools: [{ name: "search", authTokens: ["extra"] }],
	});
	assert.throws(() => parseConfig(total), /more than 32 credential references/u);

	const collision = validConfig();
	Object.assign((collision.servers as Array<Record<string, unknown>>)[0]!, {
		headers: { my_oauth_token: { env: "TEST_HEADER" } },
		authTokens: { my_oauth: { env: "TEST_TOKEN" } },
	});
	assert.throws(() => parseConfig(collision), /collides with an SDK-generated authentication header/u);
});

test("real config loading requires 0600 regular single-link current-user files", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-mcp-toolbox-config-test-"));
	const good = join(directory, "good.json");
	await writeProtected(good, JSON.stringify(validConfig()));
	assert.equal((await loadConfig({ overridePath: good })).source, "override");

	const wrongMode = join(directory, "wrong-mode.json");
	await writeProtected(wrongMode, JSON.stringify(validConfig()));
	await chmod(wrongMode, 0o640);
	await assert.rejects(() => loadConfig({ overridePath: wrongMode }), /exactly 0600/u);

	const specialMode = join(directory, "special-mode.json");
	await writeProtected(specialMode, JSON.stringify(validConfig()));
	await chmod(specialMode, 0o4600);
	await assert.rejects(() => loadConfig({ overridePath: specialMode }), /exactly 0600/u);

	const hardLink = join(directory, "hard-link.json");
	await link(good, hardLink);
	await assert.rejects(() => loadConfig({ overridePath: hardLink }), /exactly one link/u);

	const symbolic = join(directory, "symbolic.json");
	await symlink(good, symbolic);
	await assert.rejects(() => loadConfig({ overridePath: symbolic }), /symbolic link/u);
	await assert.rejects(() => loadConfig({ overridePath: directory }), /regular file/u);

	const fifo = join(directory, "config.fifo");
	execFileSync("mkfifo", [fifo]);
	await assert.rejects(() => loadConfig({ overridePath: fifo }), /regular file/u);
});

test("config loading accepts exact size bound, rejects growth, and fatally decodes UTF-8", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-mcp-toolbox-size-test-"));
	const json = JSON.stringify(validConfig());
	const exact = join(directory, "exact.json");
	await writeProtected(exact, json + " ".repeat(MAX_CONFIG_BYTES - Buffer.byteLength(json)));
	assert.equal((await loadConfig({ overridePath: exact })).source, "override");

	const oversized = join(directory, "oversized.json");
	await writeProtected(oversized, Buffer.alloc(MAX_CONFIG_BYTES + 1, 0x20));
	await assert.rejects(() => loadConfig({ overridePath: oversized }), /exceeds 256KB/u);

	const invalidUtf8 = join(directory, "invalid-utf8.json");
	await writeProtected(invalidUtf8, Buffer.from([0xc3, 0x28]));
	await assert.rejects(() => loadConfig({ overridePath: invalidUtf8 }), /valid UTF-8/u);
});

test("override path is authoritative and rejects blank, trimmed, controlled, or relative values", async () => {
	for (const path of ["", " relative.json", "relative.json", "/tmp/path\nname"] as const) {
		await assert.rejects(() => loadConfig({ overridePath: path }), /absolute path without whitespace or controls/u);
	}
	const missing = join(tmpdir(), `pi-mcp-toolbox-missing-${Date.now()}.json`);
	await assert.rejects(() => loadConfig({ overridePath: missing }), /could not be inspected/u);
	assert.deepEqual(await loadConfig({ packagePath: missing }), { source: "none" });

	const directory = await mkdtemp(join(tmpdir(), "pi-mcp-toolbox-authoritative-test-"));
	const packagePath = join(directory, "config.json");
	await writeProtected(packagePath, JSON.stringify(validConfig()));
	await assert.rejects(() => loadConfig({ overridePath: missing, packagePath }), /could not be inspected/u);
});

test("secure loader fails closed without UID, O_NOFOLLOW, or O_NONBLOCK", async () => {
	for (const options of [
		{ uid: undefined },
		{ constants: { O_RDONLY: 0, O_NOFOLLOW: 0, O_NONBLOCK: 0x800 } },
		{ constants: { O_RDONLY: 0, O_NOFOLLOW: 0x20_000, O_NONBLOCK: 0 } },
	] satisfies FakeRuntimeOptions[]) {
		await assert.rejects(() => loadSynthetic(fakeRuntime(options)), /checks are unavailable/u);
	}
});

test("secure loader binds bigint identity and all metadata across lstat/open/read", async () => {
	const data = Buffer.from(JSON.stringify(validConfig()));
	const base = syntheticStat({ size: BigInt(data.length) });
	const changedCases: FakeRuntimeOptions[] = [
		{ data, lstats: [syntheticStat({ ...base, uid: 1_001n }), base] },
		{ data, fstats: [syntheticStat({ ...base, ino: 21n }), base] },
		{ data, fstats: [base, syntheticStat({ ...base, size: BigInt(data.length - 1) })] },
		{ data, fstats: [base, syntheticStat({ ...base, mtimeNs: 31n })] },
		{ data, lstats: [base, syntheticStat({ ...base, dev: 11n })] },
		{ data, fstats: [syntheticStat({ ...base, uid: 1_001n }), base] },
	];
	for (const options of changedCases) {
		await assert.rejects(() => loadSynthetic(fakeRuntime(options)), /unsafe|owned by the current user|changed/u);
	}

	const openError = Object.assign(new Error("gone"), { code: "ENOENT" });
	await assert.rejects(
		() => loadSynthetic(fakeRuntime({ data, openError })),
		/changed while it was being opened/u,
	);
	const finalMissing = Object.assign(new Error("gone"), { code: "ENOENT" });
	await assert.rejects(
		() => loadSynthetic(fakeRuntime({ data, lstats: [base, finalMissing] })),
		/path changed while it was being read/u,
	);
});

test("bounded positional reads handle chunks and reject short or growing files", async () => {
	const data = Buffer.from(JSON.stringify(validConfig()));
	const chunked = fakeRuntime({ data, maxChunk: 7 });
	await loadSynthetic(chunked);
	assert.ok(chunked.reads.length > 2);
	assert.equal(chunked.reads.at(-1)?.length, 1);
	assert.equal(chunked.reads.at(-1)?.position, data.length);
	assert.ok((chunked.flags[0]! & 0x20_000) !== 0);
	assert.ok((chunked.flags[0]! & 0x800) !== 0);

	await assert.rejects(
		() => loadSynthetic(fakeRuntime({ data, shortAt: 7, maxChunk: 7 })),
		/changed while it was being read/u,
	);
	await assert.rejects(
		() => loadSynthetic(fakeRuntime({ data, probeBytes: 1 })),
		/grew while it was being read/u,
	);
});

test("ConfigStore clones loader-owned objects, catches sync throws, and keeps failed reload invalid", async () => {
	let calls = 0;
	let syncFailure = false;
	const owned = { config: validConfig(), source: "package" as const };
	const store = new ConfigStore(() => {
		calls += 1;
		if (syncFailure) throw new Error("new config invalid");
		return owned;
	});
	const [first, second] = await Promise.all([store.get(), store.get()]);
	assert.equal(first, second);
	assert.equal(calls, 1);
	(owned.config.servers as Array<Record<string, unknown>>)[0]!.url = "https://mutated.invalid";
	assert.equal(first.config!.servers[0]!.url, "http://127.0.0.1:5000");
	assert.equal(Object.isFrozen(first), true);

	syncFailure = true;
	await assert.rejects(() => store.reload(), /new config invalid/u);
	await assert.rejects(() => store.get(), /new config invalid/u);
	assert.equal(calls, 2);

	await assert.rejects(
		() => new ConfigStore(() => ({ config: validConfig(), source: "none" })).get(),
		/must be absent/u,
	);
});
