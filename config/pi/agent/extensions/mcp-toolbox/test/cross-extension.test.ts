import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createInvocationSnapshot, parseConfig } from "../src/config.ts";
import { ToolboxManager } from "../src/manager.ts";
import {
	CredentialResolverError,
	ONEPASSWORD_RESOLVER_PROVIDER,
	SECRET_RESOLVER_V2_PROTOCOL,
	SECRET_RESOLVER_V2_REQUEST_CHANNEL,
	SecretResolverConsumer,
} from "../src/resolver.ts";
import type { ToolboxSdkClientFactory } from "../src/sdk.ts";

const SECRET = "DYNAMIC_ONEPASSWORD_SECRET_CANARY_NEVER_PUBLIC";
const SOURCE_ERROR = "DYNAMIC_ONEPASSWORD_ERROR_CANARY_NEVER_PUBLIC";
const ENDPOINT = "https://toolbox-cross-extension.example.test";

interface ResolverRequest {
	provider: string;
	consumer: string;
	slot: string;
	purpose: string;
	respond(response: unknown): void;
}

class SharedEventBus {
	readonly observed: Array<{ channel: string; data: unknown }> = [];
	readonly listeners = new Set<(data: unknown) => void>();

	on(channel: string, handler: (data: unknown) => void): () => void {
		if (channel === SECRET_RESOLVER_V2_REQUEST_CHANNEL) this.listeners.add(handler);
		return () => { this.listeners.delete(handler); };
	}

	emit(channel: string, data: unknown): void {
		this.observed.push({ channel, data });
		for (const listener of this.listeners) listener(data);
	}
}

function config() {
	return parseConfig({
		version: 1,
		requestTimeoutMs: 1_000,
		servers: [{
			id: "production",
			url: ENDPOINT,
			tools: [{
				name: "search",
				confirmation: "not-required",
				boundParams: ["database_password"],
			}],
			boundParams: {
				database_password: {
					resolver: { provider: ONEPASSWORD_RESOLVER_PROVIDER, dynamic: true },
				},
			},
		}],
	});
}

function consumer(bus: SharedEventBus): SecretResolverConsumer {
	let nonce = 0;
	return new SecretResolverConsumer(bus, {
		maxWaitMs: 100,
		requestId: () => `dynamic-only-cross-${String(++nonce).padStart(8, "0")}`,
	});
}

function assertNoSecret(value: unknown): void {
	const text = value instanceof Error ? value.message : JSON.stringify(value);
	for (const canary of [SECRET, SOURCE_ERROR]) assert.equal(text.includes(canary), false);
}

test("MCP accepts one dynamic 1Password callback and redacts it from all public output", async () => {
	const bus = new SharedEventBus();
	bus.on(SECRET_RESOLVER_V2_REQUEST_CHANNEL, (data) => {
		const request = data as ResolverRequest;
		assert.equal(request.provider, ONEPASSWORD_RESOLVER_PROVIDER);
		request.respond(Object.freeze({ protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: true, value: SECRET }));
	});
	let disposals = 0;
	const factory: ToolboxSdkClientFactory = async (_server, _timeout, credentials) => {
		assert.equal(credentials.boundParams.database_password, SECRET);
		return {
			async loadTool(name) { return { raw: { name }, getName: () => name }; },
			async loadToolset() { return []; },
			async invoke() { return JSON.stringify({ password: SECRET, message: `value=${SECRET}` }); },
			async dispose() { disposals += 1; },
		};
	};
	const resolver = consumer(bus);
	const manager = new ToolboxManager(factory, resolver);
	const invocation = createInvocationSnapshot(config(), "production", "search");
	const output = await manager.call(invocation, { query: "hotels" }, manager.captureGeneration());
	assertNoSecret(output);
	assert.match(output.text, /[�█◆*\uE000-\uF8FF]/u);
	assert.equal(disposals, 1);
	assert.equal(bus.observed.length, 1);
	const event = bus.observed[0]!;
	assert.equal(event.channel, SECRET_RESOLVER_V2_REQUEST_CHANNEL);
	assert.equal(Object.isFrozen(event.data), true);
	assertNoSecret(event.data);
	assert.equal(Object.hasOwn(event.data as object, "value"), false);
	resolver.shutdown();
	await manager.shutdown();
});

test("dynamic 1Password denial remains fixed and prevents SDK construction", async () => {
	const bus = new SharedEventBus();
	bus.on(SECRET_RESOLVER_V2_REQUEST_CHANNEL, (data) => {
		(data as ResolverRequest).respond(Object.freeze({
			protocol: SECRET_RESOLVER_V2_PROTOCOL,
			ok: false,
			code: "binding_denied",
		}));
	});
	const resolver = consumer(bus);
	let factoryCalls = 0;
	const manager = new ToolboxManager(async () => {
		factoryCalls += 1;
		throw new Error(SOURCE_ERROR);
	}, resolver);
	const invocation = createInvocationSnapshot(config(), "production", "search");
	let failure: unknown;
	try { await manager.call(invocation, {}, manager.captureGeneration()); }
	catch (error) { failure = error; }
	assert.ok(failure instanceof CredentialResolverError);
	assertNoSecret(failure);
	assert.equal(factoryCalls, 0);
	resolver.shutdown();
	await manager.shutdown();
});

test("resolver callbacks are process-local one-shot capabilities, not response events", async () => {
	const bus = new SharedEventBus();
	let callbackCalls = 0;
	bus.on(SECRET_RESOLVER_V2_REQUEST_CHANNEL, (data) => {
		const request = data as ResolverRequest;
		callbackCalls += 1;
		request.respond(Object.freeze({ protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: true, value: SECRET }));
		request.respond(Object.freeze({ protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: true, value: "LATE" }));
	});
	const resolver = consumer(bus);
	const invocation = createInvocationSnapshot(config(), "production", "search");
	const planned = invocation.server.boundParams.database_password;
	assert.deepEqual(planned, { resolver: { provider: ONEPASSWORD_RESOLVER_PROVIDER, dynamic: true } });
	const requestPromise = resolver.resolve(
		ONEPASSWORD_RESOLVER_PROVIDER,
		(await import("../src/requirements.ts")).deriveRequirementId(
			"production", "search", "bound-param", "database_password",
		),
		"mcp-toolbox.bound-param",
		new AbortController().signal,
		Date.now() + 1_000,
	);
	assert.equal(await requestPromise, SECRET);
	assert.equal(callbackCalls, 1);
	assert.equal(bus.observed.length, 1);
	assert.equal(JSON.stringify(bus.observed).includes(SECRET), false);
	resolver.shutdown();
});

test("credential path has no logging, persistence, project-file, environment, or alternate-provider sink", async () => {
	const files = [
		"config.ts", "credentials.ts", "index.ts", "managed-config.ts", "managed-server.ts",
		"manager.ts", "requirements.ts", "resolver.ts", "sdk.ts",
	];
	const source = (await Promise.all(
		files.map((file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8")),
	)).join("\n");
	for (const forbidden of [
		"console.", "appendEntry(", "sendMessage(", "sendUserMessage(", "writeFile(",
		"projectFallback", "project-credentials", "BITWARDEN_RESOLVER_PROVIDER", "EnvironmentReference",
		"requireEnvironmentValue", "selectedEnvironmentValues",
	]) assert.equal(source.includes(forbidden), false, `unexpected alternate credential path: ${forbidden}`);
});
