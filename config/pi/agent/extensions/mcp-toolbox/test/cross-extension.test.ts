import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createInvocationSnapshot, parseConfig } from "../src/config.ts";
import { ToolboxManager } from "../src/manager.ts";
import { SecretResolverConsumer } from "../src/resolver.ts";
import type { ToolboxSdkClientFactory } from "../src/sdk.ts";
import { SecretResolverProvider } from "../../bitwarden-secrets-manager/src/resolver.ts";

const PROTOCOL = "pi.secret-resolver/v1";
const REQUEST_CHANNEL = "pi:secret-resolver:v1:request";
const HEADER_SECRET = "BWS_HEADER_CANARY_NEVER_PUBLIC";
const OAUTH_SECRET = "BWS_OAUTH_CANARY_NEVER_PUBLIC";
const TENANT_SECRET = "BWS_TENANT_CANARY_NEVER_PUBLIC";
const UNUSED_SECRET = "BWS_UNUSED_CANARY_NEVER_FETCHED";
const TRANSPORT_ERROR_CANARY = "TOOLBOX_TRANSPORT_ERROR_CANARY";

interface ResolverRequest {
	protocol: string;
	consumer: string;
	slot: string;
	purpose: string;
	requestId: string;
	deadlineAt: number;
	signal: AbortSignal;
	respond(response: unknown): void;
}

class FakeEventBus {
	readonly observed: unknown[] = [];
	readonly listeners = new Set<(data: unknown) => void>();

	on(first: string | ((data: unknown) => void), second?: (data: unknown) => void): () => void {
		const listener = typeof first === "function" ? first : second;
		if (!listener) throw new Error("missing listener");
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit(channel: string, data: unknown): void {
		assert.equal(channel, REQUEST_CHANNEL);
		this.observed.push(data);
		for (const listener of this.listeners) listener(data);
	}
}

class FakeBitwardenSdk {
	readonly requestedIds: string[] = [];
	readonly values = new Map<string, string>([
		["11111111-2222-3333-8444-555555555555", HEADER_SECRET],
		["aaaaaaaa-bbbb-cccc-8ddd-eeeeeeeeeeee", OAUTH_SECRET],
		["ffffffff-eeee-dddd-8ccc-bbbbbbbbbbbb", TENANT_SECRET],
		["99999999-8888-7777-8666-555555555555", UNUSED_SECRET],
	]);

	secrets() {
		return {
			get: async (id: string) => {
				this.requestedIds.push(id);
				const value = this.values.get(id);
				if (!value) throw new Error("FAKE_BITWARDEN_ERROR_CANARY");
				return { id, value, note: "fake response only" };
			},
		};
	}
}

function installFakeProvider(bus: FakeEventBus, sdk: FakeBitwardenSdk): () => void {
	const bindings = new Map<string, string>([
		["mcp-toolbox\u0000production-authorization\u0000mcp-toolbox.header", "11111111-2222-3333-8444-555555555555"],
		["mcp-toolbox\u0000production-oauth\u0000mcp-toolbox.auth-token", "aaaaaaaa-bbbb-cccc-8ddd-eeeeeeeeeeee"],
		["mcp-toolbox\u0000production-tenant\u0000mcp-toolbox.bound-param", "ffffffff-eeee-dddd-8ccc-bbbbbbbbbbbb"],
		["mcp-toolbox\u0000unused-oauth\u0000mcp-toolbox.auth-token", "99999999-8888-7777-8666-555555555555"],
	]);
	return bus.on((data) => {
		const request = data as ResolverRequest;
		const binding = bindings.get(`${request.consumer}\u0000${request.slot}\u0000${request.purpose}`);
		if (!binding) {
			request.respond({ protocol: PROTOCOL, ok: false, code: "binding_denied" });
			return;
		}
		void sdk.secrets().get(binding).then(
			(response) => request.respond({ protocol: PROTOCOL, ok: true, value: response.value }),
			() => request.respond({ protocol: PROTOCOL, ok: false, code: "request_failed" }),
		);
	});
}

function resolverConfig(slot = "production-authorization") {
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
				boundParams: ["tenant_id"],
			}],
			headers: {
				Authorization: { resolver: { provider: "bitwarden-secrets-manager", slot } },
				"X-Shared-Authorization": { resolver: { provider: "bitwarden-secrets-manager", slot } },
			},
			authTokens: {
				selected_oauth: {
					resolver: { provider: "bitwarden-secrets-manager", slot: "production-oauth" },
				},
				unused_oauth: {
					resolver: { provider: "bitwarden-secrets-manager", slot: "unused-oauth" },
				},
			},
			boundParams: {
				tenant_id: {
					resolver: { provider: "bitwarden-secrets-manager", slot: "production-tenant" },
				},
			},
		}],
	});
}

function testConsumer(bus: FakeEventBus): SecretResolverConsumer {
	let nonce = 0;
	return new SecretResolverConsumer(bus, {
		maxWaitMs: 100,
		requestId: () => `cross-extension-request-${String(++nonce).padStart(4, "0")}`,
	});
}

function assertNoCanaries(value: unknown): void {
	const serialized = value instanceof Error ? value.message : JSON.stringify(value);
	for (const canary of [HEADER_SECRET, OAUTH_SECRET, TENANT_SECRET, UNUSED_SECRET, TRANSPORT_ERROR_CANARY]) {
		assert.equal(serialized.includes(canary), false, `public sink contained ${canary}`);
	}
}

test("fake Bitwarden provider handoff resolves only selected slots and redacts canary echoes sink-wide", async () => {
	const bus = new FakeEventBus();
	const bitwarden = new FakeBitwardenSdk();
	installFakeProvider(bus, bitwarden);
	const resolver = testConsumer(bus);
	let disposals = 0;
	const factory: ToolboxSdkClientFactory = async (_server, _timeout, credentials) => {
		assert.equal(credentials.headers.Authorization, HEADER_SECRET);
		assert.equal(credentials.headers["X-Shared-Authorization"], HEADER_SECRET);
		assert.equal(credentials.authTokens.selected_oauth, OAUTH_SECRET);
		assert.equal(Object.hasOwn(credentials.authTokens, "unused_oauth"), false);
		assert.equal(credentials.boundParams.tenant_id, TENANT_SECRET);
		return {
			async loadTool(name) { return { raw: { name }, getName: () => name }; },
			async loadToolset() { return []; },
			async invoke() {
				return JSON.stringify({
					message: `${HEADER_SECRET} ${OAUTH_SECRET} ${TENANT_SECRET}`,
					password: HEADER_SECRET,
				});
			},
			async dispose() { disposals += 1; },
		};
	};
	const manager = new ToolboxManager(factory, resolver);
	const config = resolverConfig();
	const selected = createInvocationSnapshot(config, "production", "search");
	const output = await manager.call(selected, { query: "hotels" }, manager.captureGeneration());
	assert.match(output.text, /\[redacted\]/u);
	assertNoCanaries(output);
	assert.deepEqual(bitwarden.requestedIds.sort(), [
		"11111111-2222-3333-8444-555555555555",
		"aaaaaaaa-bbbb-cccc-8ddd-eeeeeeeeeeee",
		"ffffffff-eeee-dddd-8ccc-bbbbbbbbbbbb",
	].sort());
	assert.equal(disposals, 1);
	for (const event of bus.observed) {
		assert.equal(Object.hasOwn(event as object, "value"), false);
		assert.equal(Object.hasOwn(event as object, "secretId"), false);
		assertNoCanaries(event);
	}
	assertNoCanaries(manager.snapshot());
	assertNoCanaries(config);
});

test("transport, disposal, and resolver-denial errors cannot disclose exact values or provider discovery details", async () => {
	const bus = new FakeEventBus();
	installFakeProvider(bus, new FakeBitwardenSdk());
	const resolver = testConsumer(bus);
	const failingFactory: ToolboxSdkClientFactory = async () => ({
		async loadTool(name) { return { raw: { name }, getName: () => name }; },
		async loadToolset() { return []; },
		async invoke() {
			throw new Error(`${TRANSPORT_ERROR_CANARY} ${HEADER_SECRET} ${OAUTH_SECRET} ${TENANT_SECRET}`);
		},
		async dispose() {
			throw new Error(`${HEADER_SECRET} disposal failure`);
		},
	});
	const manager = new ToolboxManager(failingFactory, resolver);
	const config = resolverConfig();
	const selected = createInvocationSnapshot(config, "production", "search");
	let transportError: unknown;
	try {
		await manager.call(selected, {}, manager.captureGeneration());
	} catch (error) {
		transportError = error;
	}
	assert.ok(transportError instanceof Error);
	assert.match(transportError.message, /no downstream error details/u);
	assertNoCanaries(transportError);

	let factoryCalls = 0;
	const deniedConfig = resolverConfig("not-bound");
	const denied = createInvocationSnapshot(deniedConfig, "production", "search");
	const deniedManager = new ToolboxManager(async () => {
		factoryCalls += 1;
		throw new Error("must not initialize");
	}, testConsumer(bus));
	let deniedError: unknown;
	try {
		await deniedManager.call(denied, {}, deniedManager.captureGeneration());
	} catch (error) {
		deniedError = error;
	}
	assert.ok(deniedError instanceof Error);
	assert.equal(factoryCalls, 0);
	assert.doesNotMatch(deniedError.message, /not-bound|binding_denied|Bitwarden/u);
	assertNoCanaries(deniedError);
});

test("real provider/consumer race aborts sibling resolver work on first source failure", async () => {
	const bus = new FakeEventBus();
	const sourceCalls: Array<{ id: string; signal: AbortSignal | undefined }> = [];
	let rejectFirst: ((error: Error) => void) | undefined;
	const provider = new SecretResolverProvider({
		async resolveSecretValue(id, signal) {
			sourceCalls.push({ id, signal });
			if (sourceCalls.length === 1) {
				return new Promise<string>((_resolve, reject) => { rejectFirst = reject; });
			}
			return new Promise<string>((resolve, reject) => {
				if (signal?.aborted) {
					reject(new Error("SIBLING_ABORTED_CANARY"));
					return;
				}
				const timer = setTimeout(() => resolve("LATE_SIBLING_SECRET_CANARY"), 100);
				signal?.addEventListener("abort", () => {
					clearTimeout(timer);
					reject(new Error("SIBLING_ABORTED_CANARY"));
				}, { once: true });
			});
		},
	}, { drainMs: 50 });
	provider.start(bus);
	provider.enable({
		version: 1,
		bindings: [
			{
				consumer: "mcp-toolbox",
				slot: "production-authorization",
				purpose: "mcp-toolbox.header",
				secretId: "11111111-2222-3333-8444-555555555555",
			},
			{
				consumer: "mcp-toolbox",
				slot: "production-oauth",
				purpose: "mcp-toolbox.auth-token",
				secretId: "aaaaaaaa-bbbb-cccc-8ddd-eeeeeeeeeeee",
			},
			{
				consumer: "mcp-toolbox",
				slot: "production-tenant",
				purpose: "mcp-toolbox.bound-param",
				secretId: "ffffffff-eeee-dddd-8ccc-bbbbbbbbbbbb",
			},
		],
	});
	const resolver = testConsumer(bus);
	let factories = 0;
	const manager = new ToolboxManager(async () => {
		factories += 1;
		throw new Error("SDK_MUST_NOT_INITIALIZE_CANARY");
	}, resolver, { drainMs: 50 });
	const config = resolverConfig();
	const invocation = createInvocationSnapshot(config, "production", "search");
	const call = manager.call(invocation, {}, manager.captureGeneration());
	void call.catch(() => undefined);
	while (bus.observed.length < 3 || !rejectFirst) await new Promise((resolve) => setTimeout(resolve, 0));
	rejectFirst(new Error("FIRST_PROVIDER_FAILURE_CANARY"));
	await assert.rejects(
		call,
		(error: unknown) => error instanceof Error &&
			!error.message.includes("FIRST_PROVIDER_FAILURE_CANARY") &&
			!error.message.includes("LATE_SIBLING_SECRET_CANARY"),
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(factories, 0);
	assert.ok(
		bus.observed.slice(0, 3).filter((event) => (event as ResolverRequest).signal.aborted).length >= 2,
		"sibling resolver signals were not aborted after the first failure",
	);
	assert.ok(
		sourceCalls.slice(1).every((call) => call.signal?.aborted),
		"a source sibling remained active after consumer cancellation",
	);
	resolver.shutdown();
	await Promise.all([manager.shutdown(), provider.shutdown()]);
});

test("fetched-value source has no logging, persistence, message, notification, or temporary-file sink", async () => {
	const files = ["credentials.ts", "index.ts", "manager.ts", "resolver.ts", "sdk.ts"];
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
