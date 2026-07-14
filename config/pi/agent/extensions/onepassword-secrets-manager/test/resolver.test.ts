import assert from "node:assert/strict";
import test from "node:test";
import { parseResolverBindings } from "../src/resolver-bindings.ts";
import {
	ONEPASSWORD_RESOLVER_PROVIDER,
	SECRET_RESOLVER_V2_PROTOCOL,
	SECRET_RESOLVER_V2_REQUEST_CHANNEL,
	type SecretResolverV2Request,
	type SecretResolverV2Response,
} from "../src/resolver-protocol.ts";
import {
	ResolverProviderRegistrationError,
	SecretResolverProvider,
	type SecretValueSource,
} from "../src/resolver.ts";
import { PublicError } from "../src/safety.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_DESKTOP_ACCOUNT;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const REFERENCE = "op://example-vault/example-item/password";
const SECRET_VALUE = "FETCHED_SECRET_CANARY_NEVER_PUBLIC";
const ERROR_CANARY = "SDK_ERROR_CANARY_NEVER_PUBLIC";

class FakeEventBus {
	readonly loggedErrors: unknown[] = [];
	readonly observedEvents: unknown[] = [];
	#listeners = new Map<string, Set<(data: unknown) => void>>();

	on(channel: string, handler: (data: unknown) => void): () => void {
		const listeners = this.#listeners.get(channel) ?? new Set<(data: unknown) => void>();
		const safeHandler = async (data: unknown): Promise<void> => {
			try {
				await handler(data);
			} catch (error) {
				this.loggedErrors.push(error);
			}
		};
		const wrapped = (data: unknown): void => { void safeHandler(data); };
		listeners.add(wrapped);
		this.#listeners.set(channel, listeners);
		return () => { listeners.delete(wrapped); };
	}

	emit(channel: string, data: unknown): void {
		this.observedEvents.push(data);
		for (const listener of this.#listeners.get(channel) ?? []) listener(data);
	}
}

function bindings() {
	return parseResolverBindings({
		version: 1,
		bindings: [{
			consumer: "mcp-toolbox",
			slot: "production-db-password",
			purpose: "mcp-toolbox.bound-param",
			secretReference: REFERENCE,
		}],
	});
}

let nonce = 0;
function request(
	respond: (response: SecretResolverV2Response) => unknown,
	overrides: Partial<SecretResolverV2Request> = {},
): SecretResolverV2Request {
	nonce += 1;
	return Object.freeze({
		protocol: SECRET_RESOLVER_V2_PROTOCOL,
		provider: ONEPASSWORD_RESOLVER_PROVIDER,
		consumer: "mcp-toolbox",
		slot: "production-db-password",
		purpose: "mcp-toolbox.bound-param",
		requestId: `offline-test-request-${String(nonce).padStart(4, "0")}`,
		deadlineAt: Date.now() + 5_000,
		respond,
		...overrides,
	});
}

function responsePromise(
	bus: FakeEventBus,
	overrides: Partial<SecretResolverV2Request> = {},
): Promise<SecretResolverV2Response> {
	return new Promise((resolve) => {
		bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, request(resolve, overrides));
	});
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
	return { promise, resolve };
}

function assertFailure(response: SecretResolverV2Response, code: string): void {
	assert.equal(response.protocol, SECRET_RESOLVER_V2_PROTOCOL);
	assert.equal(Object.isFrozen(response), true);
	assert.equal(response.ok, false);
	if (!response.ok) assert.equal(response.code, code);
	assert.equal(JSON.stringify(response).includes(SECRET_VALUE), false);
	assert.equal(JSON.stringify(response).includes(ERROR_CANARY), false);
}

test("successful v2 handoff uses only the exact binding and keeps reference/value out of event and status", async () => {
	const bus = new FakeEventBus();
	let receivedReference: string | undefined;
	const source: SecretValueSource = {
		async resolveSecretValue(reference) {
			receivedReference = reference;
			return SECRET_VALUE;
		},
	};
	const provider = new SecretResolverProvider(source);
	provider.start(bus);
	provider.enable(bindings());
	const response = await responsePromise(bus);
	assert.deepEqual(response, { protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: true, value: SECRET_VALUE });
	assert.equal(Object.isFrozen(response), true);
	assert.equal(receivedReference, REFERENCE);
	const emitted = bus.observedEvents[0] as Record<string, unknown>;
	assert.equal(Object.hasOwn(emitted, "value"), false);
	assert.equal(Object.hasOwn(emitted, "secretReference"), false);
	assert.equal(JSON.stringify(emitted).includes(SECRET_VALUE), false);
	assert.equal(JSON.stringify(emitted).includes(REFERENCE), false);
	assert.equal(JSON.stringify(provider.status()).includes(REFERENCE), false);
	assert.equal(JSON.stringify(provider.status()).includes("production-db-password"), false);
	assert.deepEqual(bus.loggedErrors, []);
});

test("routing ignores every non-addressed or unsafe provider without callback, inspection, or accounting", async () => {
	const bus = new FakeEventBus();
	let sourceCalls = 0;
	let responses = 0;
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			sourceCalls += 1;
			return SECRET_VALUE;
		},
	});
	provider.start(bus);
	provider.enable(bindings());
	bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, request(() => { responses += 1; }, {
		provider: "bitwarden-secrets-manager" as typeof ONEPASSWORD_RESOLVER_PROVIDER,
	}));
	bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, Object.freeze({
		protocol: SECRET_RESOLVER_V2_PROTOCOL,
		respond: () => { responses += 1; },
	}));

	let providerGetter = 0;
	let respondGetter = 0;
	const hostile = {} as Record<string, unknown>;
	Object.defineProperty(hostile, "provider", {
		enumerable: true,
		get() {
			providerGetter += 1;
			return ONEPASSWORD_RESOLVER_PROVIDER;
		},
	});
	Object.defineProperty(hostile, "respond", {
		enumerable: true,
		get() {
			respondGetter += 1;
			return () => { responses += 1; };
		},
	});
	bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, hostile);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(providerGetter, 0);
	assert.equal(respondGetter, 0);
	assert.equal(responses, 0);
	assert.equal(sourceCalls, 0);
	assert.equal(provider.status().callsUsed, 0);
	assert.equal(provider.status().pending, 0);
});

test("addressed malformed requests receive exactly one frozen invalid_request response", async () => {
	const bus = new FakeEventBus();
	const provider = new SecretResolverProvider({ resolveSecretValue: async () => SECRET_VALUE });
	provider.start(bus);
	provider.enable(bindings());
	const malformed = { ...request(() => undefined) } as Record<string, unknown>;
	const response = new Promise<SecretResolverV2Response>((resolve) => {
		malformed.respond = resolve;
		bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, malformed);
	});
	assertFailure(await response, "invalid_request");

	const extra = { ...request(() => undefined), unexpected: true } as Record<string, unknown>;
	const extraResponse = new Promise<SecretResolverV2Response>((resolve) => {
		extra.respond = resolve;
		Object.freeze(extra);
		bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, extra);
	});
	assertFailure(await extraResponse, "invalid_request");

	const v1 = Object.freeze({
		protocol: "pi.secret-resolver/v1",
		provider: ONEPASSWORD_RESOLVER_PROVIDER,
		consumer: "mcp-toolbox",
		slot: "production-db-password",
		purpose: "mcp-toolbox.bound-param",
		requestId: "addressed-v1-request-0001",
		deadlineAt: Date.now() + 1_000,
		respond: () => undefined,
	});
	const v1Response = new Promise<SecretResolverV2Response>((resolve) => {
		bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, Object.freeze({ ...v1, respond: resolve }));
	});
	assertFailure(await v1Response, "invalid_request");

	const undefinedSignalResponse = new Promise<SecretResolverV2Response>((resolve) => {
		bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, request(resolve, { signal: undefined }));
	});
	assertFailure(await undefinedSignalResponse, "invalid_request");
	const mismatchedRequirement = new Promise<SecretResolverV2Response>((resolve) => {
		bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, request(resolve, {
			slot: "mcp1-B-agZKwxZncAXfB6p1TMx7g0dZQk97793GMxXC_ky7E_A",
			purpose: "mcp-toolbox.header",
		}));
	});
	assertFailure(await mismatchedRequirement, "invalid_request");
	assert.equal(provider.status().callsUsed, 0);
});

test("disabled and unbound requests fail before source access and do not consume budget", async () => {
	const bus = new FakeEventBus();
	let sourceCalls = 0;
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			sourceCalls += 1;
			return SECRET_VALUE;
		},
	});
	provider.start(bus);
	assertFailure(await responsePromise(bus), "disabled");
	provider.enable(bindings());
	assertFailure(await responsePromise(bus, { slot: "not-bound" }), "binding_denied");
	assert.equal(sourceCalls, 0);
	assert.equal(provider.status().callsUsed, 0);
});

test("accepted source work is serialized, pending is bounded, and call budget is not replenished", async () => {
	const bus = new FakeEventBus();
	const release = deferred<void>();
	let sourceCalls = 0;
	let active = 0;
	let maximumActive = 0;
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			sourceCalls += 1;
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			if (sourceCalls === 1) await release.promise;
			active -= 1;
			return SECRET_VALUE;
		},
	}, { maxCalls: 3, maxPending: 2 });
	provider.start(bus);
	provider.enable(bindings());
	const first = responsePromise(bus);
	const second = responsePromise(bus);
	assertFailure(await responsePromise(bus), "busy");
	release.resolve();
	assert.equal((await first).ok, true);
	assert.equal((await second).ok, true);
	assert.equal(maximumActive, 1);
	assert.equal(sourceCalls, 2);
	await provider.disable();
	provider.enable(bindings());
	assert.equal((await responsePromise(bus)).ok, true);
	assertFailure(await responsePromise(bus), "call_limit");
});

test("deadline, cancellation, and duplicate IDs respond once and discard late success", async () => {
	const bus = new FakeEventBus();
	const release = deferred<string>();
	const provider = new SecretResolverProvider({ resolveSecretValue: async () => release.promise }, { deadlineMs: 5 });
	provider.start(bus);
	provider.enable(bindings());
	let responses = 0;
	let timeoutResponse: SecretResolverV2Response | undefined;
	bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, request((response) => {
		responses += 1;
		timeoutResponse = response;
	}));
	await new Promise((resolve) => setTimeout(resolve, 15));
	assert.ok(timeoutResponse);
	assertFailure(timeoutResponse, "deadline_exceeded");
	release.resolve(SECRET_VALUE);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(responses, 1);

	const controller = new AbortController();
	controller.abort();
	assertFailure(await responsePromise(bus, { signal: controller.signal }), "aborted");

	const hostileSignal = new AbortController().signal;
	let abortedGetterCalls = 0;
	Object.defineProperty(hostileSignal, "aborted", {
		get() {
			abortedGetterCalls += 1;
			return true;
		},
	});
	assert.equal((await responsePromise(bus, { signal: hostileSignal })).ok, true);
	assert.equal(abortedGetterCalls, 0);

	const duplicateBus = new FakeEventBus();
	let duplicateCalls = 0;
	const duplicateProvider = new SecretResolverProvider({
		async resolveSecretValue() {
			duplicateCalls += 1;
			return SECRET_VALUE;
		},
	});
	duplicateProvider.start(duplicateBus);
	duplicateProvider.enable(bindings());
	const requestId = "fixed-duplicate-request-id";
	assert.equal((await responsePromise(duplicateBus, { requestId })).ok, true);
	assertFailure(await responsePromise(duplicateBus, { requestId }), "duplicate_request");
	assert.equal(duplicateCalls, 1);
});

test("fixed SDK errors and hostile callback throws, rejections, and thenables never reach the bus logger", async () => {
	const bus = new FakeEventBus();
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			throw new Error(`${ERROR_CANARY}-${SECRET_VALUE}`);
		},
	});
	provider.start(bus);
	provider.enable(bindings());
	assertFailure(await responsePromise(bus), "unexpected");

	const sdkBus = new FakeEventBus();
	const sdkProvider = new SecretResolverProvider({
		async resolveSecretValue() {
			throw new PublicError("sdk");
		},
	});
	sdkProvider.start(sdkBus);
	sdkProvider.enable(bindings());
	assertFailure(await responsePromise(sdkBus), "sdk_unavailable");

	const callbackBus = new FakeEventBus();
	const callbackProvider = new SecretResolverProvider({ resolveSecretValue: async () => SECRET_VALUE });
	callbackProvider.start(callbackBus);
	callbackProvider.enable(bindings());
	let thenCalls = 0;
	callbackBus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, request((response) => {
		if (response.ok) throw new Error(response.value);
	}));
	callbackBus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, request(async (response) => {
		if (response.ok) return Promise.reject(new Error(response.value));
	}));
	callbackBus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, request((response) => ({
		then() {
			thenCalls += 1;
			throw new Error(response.ok ? response.value : ERROR_CANARY);
		},
	})));
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(thenCalls, 1);
	assert.deepEqual(bus.loggedErrors, []);
	assert.deepEqual(sdkBus.loggedErrors, []);
	assert.deepEqual(callbackBus.loggedErrors, []);
});

test("disable synchronously revokes active and queued callbacks, drains, and discards late values", async () => {
	const bus = new FakeEventBus();
	const started = deferred<void>();
	const release = deferred<string>();
	let sourceCalls = 0;
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			sourceCalls += 1;
			started.resolve();
			return release.promise;
		},
	}, { maxPending: 2 });
	provider.start(bus);
	provider.enable(bindings());
	const active = responsePromise(bus);
	const queued = responsePromise(bus);
	await started.promise;
	const drain = provider.disable();
	assertFailure(await active, "lifecycle");
	assertFailure(await queued, "lifecycle");
	assert.equal(provider.status().enabled, false);
	assert.equal(provider.status().pending, 2);
	release.resolve(SECRET_VALUE);
	await drain;
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(sourceCalls, 1);
	assert.equal(provider.status().pending, 0);
});

test("shutdown is bounded, unsubscribes, keeps stale listeners inert, and permits replacement", async () => {
	const listeners = new Set<(data: unknown) => void>();
	const hostileBus = {
		on(_channel: string, listener: (data: unknown) => void) {
			listeners.add(listener);
			return () => { throw new Error("unsubscribe failure"); };
		},
		emit(data: unknown) {
			for (const listener of listeners) listener(data);
		},
	};
	const started = deferred<void>();
	let oldCalls = 0;
	const oldProvider = new SecretResolverProvider({
		async resolveSecretValue() {
			oldCalls += 1;
			started.resolve();
			return new Promise<string>(() => undefined);
		},
	}, { drainMs: 5 });
	oldProvider.start(hostileBus);
	oldProvider.enable(bindings());
	const pending = new Promise<SecretResolverV2Response>((resolve) => hostileBus.emit(request(resolve)));
	await started.promise;
	const startedAt = Date.now();
	await oldProvider.shutdown();
	assert.ok(Date.now() - startedAt < 500);
	assertFailure(await pending, "lifecycle");

	const replacement = new SecretResolverProvider({ resolveSecretValue: async () => SECRET_VALUE });
	replacement.start(hostileBus);
	replacement.enable(bindings());
	const response = await new Promise<SecretResolverV2Response>((resolve) => hostileBus.emit(request(resolve)));
	assert.equal(response.ok, true);
	assert.equal(oldCalls, 1);
	await replacement.shutdown();
});

test("only one live 1Password provider can own one bus, including across module reloads", async () => {
	const bus = new FakeEventBus();
	const first = new SecretResolverProvider({ resolveSecretValue: async () => SECRET_VALUE });
	const duplicate = new SecretResolverProvider({ resolveSecretValue: async () => SECRET_VALUE });
	first.start(bus);
	assert.throws(() => duplicate.start(bus), ResolverProviderRegistrationError);
	const reloadedModule = await import(new URL("../src/resolver.ts?offline-reload-ownership=1", import.meta.url).href);
	const reloaded = new reloadedModule.SecretResolverProvider({ resolveSecretValue: async () => SECRET_VALUE });
	assert.throws(
		() => reloaded.start(bus),
		(error: unknown) => error instanceof Error && error.name === "OnePasswordResolverProviderRegistrationError",
	);
	await first.shutdown();
	const replacement = new SecretResolverProvider({ resolveSecretValue: async () => SECRET_VALUE });
	replacement.start(bus);
	await replacement.shutdown();
});
