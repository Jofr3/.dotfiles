import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseResolverBindings as parseBitwardenBindings } from "../../bitwarden-secrets-manager/src/resolver-bindings.ts";
import { SecretResolverProvider as BitwardenResolverProvider } from "../../bitwarden-secrets-manager/src/resolver.ts";
import { parseResolverBindings as parseOnePasswordBindings } from "../../onepassword-secrets-manager/src/resolver-bindings.ts";
import { SecretResolverProvider as OnePasswordResolverProvider } from "../../onepassword-secrets-manager/src/resolver.ts";
import { createInvocationSnapshot, parseConfig } from "../src/config.ts";
import { ToolboxManager } from "../src/manager.ts";
import {
	BITWARDEN_RESOLVER_PROVIDER,
	CredentialResolverError,
	ONEPASSWORD_RESOLVER_PROVIDER,
	SECRET_RESOLVER_V2_REQUEST_CHANNEL,
	SecretResolverConsumer,
} from "../src/resolver.ts";
import type { ToolboxSdkClientFactory } from "../src/sdk.ts";

for (const name of [
	"BWS_ACCESS_TOKEN",
	"BWS_API_URL",
	"BWS_IDENTITY_URL",
	"OP_SERVICE_ACCOUNT_TOKEN",
	"PI_BITWARDEN_RESOLVER_BINDINGS",
	"PI_MCP_TOOLBOX_CONFIG",
	"PI_ONEPASSWORD_RESOLVER_BINDINGS",
]) delete process.env[name];

const BW_HEADER_SECRET = "BWS_HEADER_CANARY_NEVER_PUBLIC";
const BW_OAUTH_SECRET = "BWS_OAUTH_CANARY_NEVER_PUBLIC";
const OP_HEADER_SECRET = "OP_HEADER_CANARY_NEVER_PUBLIC";
const OP_DATABASE_SECRET = "OP_DATABASE_CANARY_NEVER_PUBLIC";
const UNUSED_SECRET = "UNUSED_CANARY_NEVER_FETCHED";
const SOURCE_ERROR_CANARY = "ONEPASSWORD_SOURCE_ERROR_CANARY_NEVER_PUBLIC";

const BW_HEADER_ID = "11111111-2222-3333-8444-555555555555";
const BW_OAUTH_ID = "aaaaaaaa-bbbb-cccc-8ddd-eeeeeeeeeeee";
const BW_UNUSED_ID = "99999999-8888-7777-8666-555555555555";
const OP_HEADER_REFERENCE = "op://example-vault/example-header/password";
const OP_DATABASE_REFERENCE = "op://example-vault/example-database/password";

interface ObservedEvent {
	channel: string;
	data: unknown;
}

interface ResolverRequest {
	provider: string;
	consumer: string;
	slot: string;
	purpose: string;
	signal: AbortSignal;
	respond(response: unknown): void;
}

class SharedEventBus {
	readonly observed: ObservedEvent[] = [];
	#listeners = new Map<string, Set<(data: unknown) => void>>();

	on(channel: string, handler: (data: unknown) => void): () => void {
		const listeners = this.#listeners.get(channel) ?? new Set<(data: unknown) => void>();
		listeners.add(handler);
		this.#listeners.set(channel, listeners);
		return () => { listeners.delete(handler); };
	}

	emit(channel: string, data: unknown): void {
		this.observed.push({ channel, data });
		for (const listener of this.#listeners.get(channel) ?? []) listener(data);
	}
}

class FakeBitwardenSource {
	readonly requested: string[] = [];
	readonly values = new Map([
		[BW_HEADER_ID, BW_HEADER_SECRET],
		[BW_OAUTH_ID, BW_OAUTH_SECRET],
		[BW_UNUSED_ID, UNUSED_SECRET],
	]);

	async resolveSecretValue(id: string): Promise<string> {
		this.requested.push(id);
		const value = this.values.get(id);
		if (value === undefined) throw new Error("FAKE_BITWARDEN_SOURCE_FAILURE");
		return value;
	}
}

class FakeOnePasswordSource {
	readonly requested: string[] = [];
	readonly values = new Map([
		[OP_HEADER_REFERENCE, OP_HEADER_SECRET],
		[OP_DATABASE_REFERENCE, OP_DATABASE_SECRET],
	]);
	fail = false;

	async resolveSecretValue(reference: string): Promise<string> {
		this.requested.push(reference);
		if (this.fail) throw new Error(`${SOURCE_ERROR_CANARY}:${OP_DATABASE_SECRET}`);
		const value = this.values.get(reference);
		if (value === undefined) throw new Error("FAKE_ONEPASSWORD_SOURCE_FAILURE");
		return value;
	}
}

function bitwardenBindings() {
	return parseBitwardenBindings({
		version: 1,
		bindings: [
			{
				consumer: "mcp-toolbox",
				slot: "shared-authorization",
				purpose: "mcp-toolbox.header",
				secretId: BW_HEADER_ID,
			},
			{
				consumer: "mcp-toolbox",
				slot: "production-oauth",
				purpose: "mcp-toolbox.auth-token",
				secretId: BW_OAUTH_ID,
			},
			{
				consumer: "mcp-toolbox",
				slot: "unused-oauth",
				purpose: "mcp-toolbox.auth-token",
				secretId: BW_UNUSED_ID,
			},
		],
	});
}

function onePasswordBindings() {
	return parseOnePasswordBindings({
		version: 1,
		bindings: [
			{
				consumer: "mcp-toolbox",
				slot: "shared-authorization",
				purpose: "mcp-toolbox.header",
				secretReference: OP_HEADER_REFERENCE,
			},
			{
				consumer: "mcp-toolbox",
				slot: "production-db-password",
				purpose: "mcp-toolbox.bound-param",
				secretReference: OP_DATABASE_REFERENCE,
			},
		],
	});
}

function mixedProviderConfig() {
	return parseConfig({
		version: 1,
		requestTimeoutMs: 1_000,
		servers: [{
			id: "production",
			url: "https://toolbox.example.test",
			tools: [{
				name: "search",
				confirmation: "not-required",
				authTokens: ["selected_oauth"],
				boundParams: ["database_password"],
			}],
			headers: {
				Authorization: {
					resolver: { provider: BITWARDEN_RESOLVER_PROVIDER, slot: "shared-authorization" },
				},
				"X-Database-Authorization": {
					resolver: { provider: ONEPASSWORD_RESOLVER_PROVIDER, slot: "shared-authorization" },
				},
				"X-Database-Authorization-Copy": {
					resolver: { provider: ONEPASSWORD_RESOLVER_PROVIDER, slot: "shared-authorization" },
				},
			},
			authTokens: {
				selected_oauth: {
					resolver: { provider: BITWARDEN_RESOLVER_PROVIDER, slot: "production-oauth" },
				},
				unused_oauth: {
					resolver: { provider: BITWARDEN_RESOLVER_PROVIDER, slot: "unused-oauth" },
				},
			},
			boundParams: {
				database_password: {
					resolver: { provider: ONEPASSWORD_RESOLVER_PROVIDER, slot: "production-db-password" },
				},
			},
		}],
	});
}

function onePasswordOnlyConfig(slot = "production-db-password") {
	return parseConfig({
		version: 1,
		requestTimeoutMs: 1_000,
		servers: [{
			id: "production",
			url: "https://toolbox.example.test",
			tools: [{ name: "search", confirmation: "not-required", boundParams: ["database_password"] }],
			boundParams: {
				database_password: {
					resolver: { provider: ONEPASSWORD_RESOLVER_PROVIDER, slot },
				},
			},
		}],
	});
}

function testConsumer(bus: SharedEventBus, maxWaitMs = 100): SecretResolverConsumer {
	let nonce = 0;
	return new SecretResolverConsumer(bus, {
		maxWaitMs,
		requestId: () => `cross-extension-request-${String(++nonce).padStart(4, "0")}`,
	});
}

function assertNoCanaries(value: unknown): void {
	const serialized = value instanceof Error ? value.message : JSON.stringify(value);
	for (const canary of [
		BW_HEADER_SECRET,
		BW_OAUTH_SECRET,
		OP_HEADER_SECRET,
		OP_DATABASE_SECRET,
		UNUSED_SECRET,
		SOURCE_ERROR_CANARY,
	]) {
		assert.equal(serialized.includes(canary), false, `public sink contained ${canary}`);
	}
}

test("MCP routes provider-aware tuples to Bitwarden and fake 1Password together without collisions", async () => {
	const bus = new SharedEventBus();
	const bitwardenSource = new FakeBitwardenSource();
	const onePasswordSource = new FakeOnePasswordSource();
	const bitwarden = new BitwardenResolverProvider(bitwardenSource);
	const onePassword = new OnePasswordResolverProvider(onePasswordSource);
	bitwarden.start(bus);
	onePassword.start(bus);
	bitwarden.enable(bitwardenBindings());
	onePassword.enable(onePasswordBindings());

	let disposals = 0;
	const factory: ToolboxSdkClientFactory = async (_server, _timeout, credentials) => {
		assert.equal(credentials.headers.Authorization, BW_HEADER_SECRET);
		assert.equal(credentials.headers["X-Database-Authorization"], OP_HEADER_SECRET);
		assert.equal(credentials.headers["X-Database-Authorization-Copy"], OP_HEADER_SECRET);
		assert.equal(credentials.authTokens.selected_oauth, BW_OAUTH_SECRET);
		assert.equal(Object.hasOwn(credentials.authTokens, "unused_oauth"), false);
		assert.equal(credentials.boundParams.database_password, OP_DATABASE_SECRET);
		return {
			async loadTool(name) { return { raw: { name }, getName: () => name }; },
			async loadToolset() { return []; },
			async invoke() {
				return JSON.stringify({
					message: `${BW_HEADER_SECRET} ${BW_OAUTH_SECRET} ${OP_HEADER_SECRET} ${OP_DATABASE_SECRET}`,
					password: OP_DATABASE_SECRET,
				});
			},
			async dispose() { disposals += 1; },
		};
	};
	const resolver = testConsumer(bus);
	const manager = new ToolboxManager(factory, resolver);
	const config = mixedProviderConfig();
	const invocation = createInvocationSnapshot(config, "production", "search");
	assert.equal(
		(invocation.server.headers.Authorization as { resolver: { provider: string } }).resolver.provider,
		BITWARDEN_RESOLVER_PROVIDER,
	);
	assert.equal(
		(invocation.server.headers["X-Database-Authorization"] as { resolver: { provider: string } }).resolver.provider,
		ONEPASSWORD_RESOLVER_PROVIDER,
	);

	const output = await manager.call(invocation, { query: "hotels" }, manager.captureGeneration());
	assert.match(output.text, /[�█◆*\uE000-\uF8FF]/u);
	assertNoCanaries(output);
	assert.deepEqual(bitwardenSource.requested.sort(), [BW_HEADER_ID, BW_OAUTH_ID].sort());
	assert.deepEqual(onePasswordSource.requested.sort(), [OP_HEADER_REFERENCE, OP_DATABASE_REFERENCE].sort());
	assert.equal(disposals, 1);
	assert.equal(bitwarden.status().callsUsed, 2);
	assert.equal(onePassword.status().callsUsed, 2);

	const v2Events = bus.observed.filter((event) => event.channel === SECRET_RESOLVER_V2_REQUEST_CHANNEL);
	assert.equal(v2Events.length, 4, "duplicate same-provider tuples should resolve once");
	assert.deepEqual(
		new Set(v2Events.map((event) => (event.data as ResolverRequest).provider)),
		new Set([BITWARDEN_RESOLVER_PROVIDER, ONEPASSWORD_RESOLVER_PROVIDER]),
	);
	for (const event of v2Events) {
		const payload = event.data as Record<string, unknown>;
		assert.equal(Object.isFrozen(payload), true);
		assert.equal(Object.hasOwn(payload, "value"), false);
		assert.equal(Object.hasOwn(payload, "secretId"), false);
		assert.equal(Object.hasOwn(payload, "secretReference"), false);
		assertNoCanaries(payload);
		assert.equal(JSON.stringify(payload).includes(OP_HEADER_REFERENCE), false);
		assert.equal(JSON.stringify(payload).includes(OP_DATABASE_REFERENCE), false);
	}
	assertNoCanaries(manager.snapshot());
	assertNoCanaries(config);

	resolver.shutdown();
	await Promise.all([manager.shutdown(), bitwarden.shutdown(), onePassword.shutdown()]);
});

test("fake 1Password source failure stays fixed, canary-free, and prevents MCP client construction", async () => {
	const bus = new SharedEventBus();
	const source = new FakeOnePasswordSource();
	source.fail = true;
	const provider = new OnePasswordResolverProvider(source);
	provider.start(bus);
	provider.enable(onePasswordBindings());
	const resolver = testConsumer(bus);
	let factoryCalls = 0;
	const manager = new ToolboxManager(async () => {
		factoryCalls += 1;
		throw new Error("MCP_FACTORY_MUST_NOT_RUN");
	}, resolver);
	const config = onePasswordOnlyConfig();
	const invocation = createInvocationSnapshot(config, "production", "search");
	let failure: unknown;
	try {
		await manager.call(invocation, {}, manager.captureGeneration());
	} catch (error) {
		failure = error;
	}
	assert.ok(failure instanceof CredentialResolverError);
	assert.equal(factoryCalls, 0);
	assert.deepEqual(source.requested, [OP_DATABASE_REFERENCE]);
	assertNoCanaries(failure);
	for (const event of bus.observed) assertNoCanaries(event.data);

	resolver.shutdown();
	await Promise.all([manager.shutdown(), provider.shutdown()]);
});

test("a request for absent 1Password is invisible to matching Bitwarden bindings and times out unavailable", async () => {
	const bus = new SharedEventBus();
	const source = new FakeBitwardenSource();
	const bitwarden = new BitwardenResolverProvider(source);
	bitwarden.start(bus);
	bitwarden.enable(parseBitwardenBindings({
		version: 1,
		bindings: [{
			consumer: "mcp-toolbox",
			slot: "production-db-password",
			purpose: "mcp-toolbox.bound-param",
			secretId: BW_HEADER_ID,
		}],
	}));
	const resolver = testConsumer(bus, 10);
	let factoryCalls = 0;
	const manager = new ToolboxManager(async () => {
		factoryCalls += 1;
		throw new Error("MCP_FACTORY_MUST_NOT_RUN");
	}, resolver);
	const invocation = createInvocationSnapshot(onePasswordOnlyConfig(), "production", "search");
	await assert.rejects(
		() => manager.call(invocation, {}, manager.captureGeneration()),
		(error: unknown) => error instanceof CredentialResolverError,
	);
	assert.equal(factoryCalls, 0);
	assert.deepEqual(source.requested, []);
	assert.equal(bitwarden.status().callsUsed, 0);
	assert.equal(bus.observed.length, 1);
	assert.equal((bus.observed[0]!.data as ResolverRequest).provider, ONEPASSWORD_RESOLVER_PROVIDER);

	resolver.shutdown();
	await Promise.all([manager.shutdown(), bitwarden.shutdown()]);
});

test("provider callbacks remain process-local one-shot capabilities and never become response events", async () => {
	const bus = new SharedEventBus();
	let callbackInvocations = 0;
	bus.on(SECRET_RESOLVER_V2_REQUEST_CHANNEL, (data) => {
		const request = data as ResolverRequest;
		if (request.provider !== ONEPASSWORD_RESOLVER_PROVIDER) return;
		callbackInvocations += 1;
		request.respond(Object.freeze({
			protocol: "pi.secret-resolver/v2",
			ok: true,
			value: OP_DATABASE_SECRET,
		}));
		request.respond(Object.freeze({
			protocol: "pi.secret-resolver/v2",
			ok: true,
			value: "LATE_DUPLICATE_VALUE_CANARY",
		}));
	});
	const resolver = testConsumer(bus);
	const value = await resolver.resolve(
		ONEPASSWORD_RESOLVER_PROVIDER,
		"production-db-password",
		"mcp-toolbox.bound-param",
		new AbortController().signal,
		Date.now() + 1_000,
	);
	assert.equal(value, OP_DATABASE_SECRET);
	assert.equal(callbackInvocations, 1);
	assert.equal(bus.observed.length, 1);
	assert.equal(Object.hasOwn(bus.observed[0]!.data as object, "value"), false);
	assert.equal(JSON.stringify(bus.observed).includes(OP_DATABASE_SECRET), false);
	resolver.shutdown();
});

test("fetched-value source has no logging, persistence, message, notification, or temporary-file sink", async () => {
	const files = [
		"credentials.ts",
		"index.ts",
		"manager.ts",
		"requirements-tool.ts",
		"requirements.ts",
		"resolver.ts",
		"sdk.ts",
	];
	const source = (
		await Promise.all(files.map((file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8")))
	).join("\n");
	for (const forbidden of [
		"console.",
		"appendEntry(",
		"sendMessage(",
		"sendUserMessage(",
		"writeFile(",
		"mkdtemp(",
		"pasteToEditor(",
		"setEditorText(",
		"clipboard",
	]) {
		assert.equal(source.includes(forbidden), false, `unexpected sink ${forbidden}`);
	}
});
