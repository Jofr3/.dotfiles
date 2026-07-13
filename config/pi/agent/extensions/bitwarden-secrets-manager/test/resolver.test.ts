import assert from "node:assert/strict";
import test from "node:test";
import { parseResolverBindings } from "../src/resolver-bindings.ts";
import {
	SECRET_RESOLVER_PROTOCOL,
	SECRET_RESOLVER_REQUEST_CHANNEL,
	type SecretResolverRequest,
	type SecretResolverResponse,
} from "../src/resolver-protocol.ts";
import {
	ResolverProviderRegistrationError,
	SecretResolverProvider,
	type SecretValueSource,
} from "../src/resolver.ts";
import { PublicError } from "../src/safety.ts";

const SECRET_ID = "11111111-2222-3333-8444-555555555555";
const SECRET_VALUE = "FETCHED_SECRET_CANARY_NEVER_PUBLIC";
const SDK_ERROR_CANARY = "SDK_ERROR_CANARY_NEVER_PUBLIC";

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
			slot: "production-authorization",
			purpose: "mcp-toolbox.header",
			secretId: SECRET_ID,
		}],
	});
}

let nonce = 0;
function request(
	respond: (response: SecretResolverResponse) => unknown,
	overrides: Partial<SecretResolverRequest> = {},
): SecretResolverRequest {
	nonce += 1;
	return Object.freeze({
		protocol: SECRET_RESOLVER_PROTOCOL,
		consumer: "mcp-toolbox",
		slot: "production-authorization",
		purpose: "mcp-toolbox.header",
		requestId: `offline-test-request-${String(nonce).padStart(4, "0")}`,
		deadlineAt: Date.now() + 5_000,
		respond,
		...overrides,
	});
}

function responsePromise(
	bus: FakeEventBus,
	overrides: Partial<SecretResolverRequest> = {},
): Promise<SecretResolverResponse> {
	return new Promise((resolve) => {
		bus.emit(SECRET_RESOLVER_REQUEST_CHANNEL, request(resolve, overrides));
	});
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
	return { promise, resolve };
}

function assertFailure(response: SecretResolverResponse, code: string): void {
	assert.equal(response.protocol, SECRET_RESOLVER_PROTOCOL);
	assert.equal(response.ok, false);
	if (!response.ok) assert.equal(response.code, code);
	assert.equal(JSON.stringify(response).includes(SECRET_VALUE), false);
	assert.equal(JSON.stringify(response).includes(SDK_ERROR_CANARY), false);
}

test("successful handoff uses only the bound UUID and keeps the value out of the event payload", async () => {
	const bus = new FakeEventBus();
	let requestedId: string | undefined;
	const source: SecretValueSource = {
		async resolveSecretValue(secretId) {
			requestedId = secretId;
			return SECRET_VALUE;
		},
	};
	const provider = new SecretResolverProvider(source);
	provider.start(bus);
	provider.enable(bindings());

	const response = await responsePromise(bus);
	assert.deepEqual(response, { protocol: SECRET_RESOLVER_PROTOCOL, ok: true, value: SECRET_VALUE });
	assert.equal(requestedId, SECRET_ID);
	const emitted = bus.observedEvents[0] as Record<string, unknown>;
	assert.equal(Object.hasOwn(emitted, "value"), false);
	assert.equal(Object.hasOwn(emitted, "secretId"), false);
	assert.equal(JSON.stringify(emitted).includes(SECRET_VALUE), false);
	assert.deepEqual(provider.status(), {
		enabled: true,
		bindingCount: 1,
		callsUsed: 1,
		callLimit: 20,
		pending: 0,
		pendingLimit: 4,
	});
	const publicStatus = JSON.stringify(provider.status());
	assert.equal(publicStatus.includes(SECRET_ID), false);
	assert.equal(publicStatus.includes("production-authorization"), false);
	assert.deepEqual(bus.loggedErrors, []);
});

test("disabled, denied, malformed, and arbitrary-id requests fail before source access", async () => {
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

	const arbitrary = request(() => undefined) as unknown as Record<string, unknown>;
	const mutableArbitrary = { ...arbitrary, secretId: "ffffffff-eeee-dddd-8ccc-bbbbbbbbbbbb" };
	const arbitraryResponse = new Promise<SecretResolverResponse>((resolve) => {
		mutableArbitrary.respond = resolve;
		bus.emit(SECRET_RESOLVER_REQUEST_CHANNEL, mutableArbitrary);
	});
	assertFailure(await arbitraryResponse, "invalid_request");

	const malformedResponse = new Promise<SecretResolverResponse>((resolve) => {
		bus.emit(SECRET_RESOLVER_REQUEST_CHANNEL, { protocol: "wrong", respond: resolve });
	});
	assertFailure(await malformedResponse, "invalid_request");
	assert.equal(sourceCalls, 0);
	assert.deepEqual(bus.loggedErrors, []);
});

test("provider call limit is separate, charged once accepted, and not replenished by disable", async () => {
	const bus = new FakeEventBus();
	let sourceCalls = 0;
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			sourceCalls += 1;
			return SECRET_VALUE;
		},
	}, { maxCalls: 1 });
	provider.start(bus);
	provider.enable(bindings());
	assert.equal((await responsePromise(bus)).ok, true);
	provider.disable();
	provider.enable(bindings());
	assertFailure(await responsePromise(bus), "call_limit");
	assert.equal(sourceCalls, 1);
	assert.equal(provider.status().callsUsed, 1);
});

test("source operations are serialized and pending requests are bounded", async () => {
	const bus = new FakeEventBus();
	const releaseFirst = deferred<void>();
	let sourceCalls = 0;
	let active = 0;
	let maximumActive = 0;
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			sourceCalls += 1;
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			if (sourceCalls === 1) await releaseFirst.promise;
			active -= 1;
			return SECRET_VALUE;
		},
	}, { maxPending: 2 });
	provider.start(bus);
	provider.enable(bindings());
	const first = responsePromise(bus);
	const second = responsePromise(bus);
	assertFailure(await responsePromise(bus), "busy");
	releaseFirst.resolve();
	assert.equal((await first).ok, true);
	assert.equal((await second).ok, true);
	assert.equal(maximumActive, 1);
	assert.equal(sourceCalls, 2);
});

test("deadline and cancellation respond once and discard late source completion", async () => {
	const bus = new FakeEventBus();
	const release = deferred<string>();
	const provider = new SecretResolverProvider({
		resolveSecretValue: async () => release.promise,
	}, { deadlineMs: 5 });
	provider.start(bus);
	provider.enable(bindings());

	let responses = 0;
	let timeoutResponse: SecretResolverResponse | undefined;
	bus.emit(SECRET_RESOLVER_REQUEST_CHANNEL, request((response) => {
		responses += 1;
		timeoutResponse = response;
	}, { deadlineAt: Date.now() + 1_000 }));
	await new Promise((resolve) => setTimeout(resolve, 15));
	assert.ok(timeoutResponse);
	assertFailure(timeoutResponse, "deadline_exceeded");
	release.resolve(SECRET_VALUE);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(responses, 1);

	const controller = new AbortController();
	controller.abort();
	assertFailure(await responsePromise(bus, { signal: controller.signal }), "aborted");
	assert.deepEqual(bus.loggedErrors, []);
});

test("duplicate request ids receive one fixed duplicate response without another fetch", async () => {
	const bus = new FakeEventBus();
	let sourceCalls = 0;
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			sourceCalls += 1;
			return SECRET_VALUE;
		},
	});
	provider.start(bus);
	provider.enable(bindings());
	const requestId = "fixed-duplicate-request-id";
	assert.equal((await responsePromise(bus, { requestId })).ok, true);
	assertFailure(await responsePromise(bus, { requestId }), "duplicate_request");
	assert.equal(sourceCalls, 1);
});

test("SDK errors and consumer callback failures cannot reach the event-bus logger", async () => {
	const bus = new FakeEventBus();
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			throw new Error(`${SDK_ERROR_CANARY} ${SECRET_VALUE}`);
		},
	});
	provider.start(bus);
	provider.enable(bindings());
	assertFailure(await responsePromise(bus), "unexpected");

	const sdkProvider = new SecretResolverProvider({
		async resolveSecretValue() {
			throw new PublicError("sdk");
		},
	});
	const sdkBus = new FakeEventBus();
	sdkProvider.start(sdkBus);
	sdkProvider.enable(bindings());
	assertFailure(await responsePromise(sdkBus), "sdk_unavailable");

	const callbackProvider = new SecretResolverProvider({
		async resolveSecretValue() { return SECRET_VALUE; },
	});
	const callbackBus = new FakeEventBus();
	callbackProvider.start(callbackBus);
	callbackProvider.enable(bindings());
	callbackBus.emit(SECRET_RESOLVER_REQUEST_CHANNEL, request((response) => {
		if (response.ok) throw new Error(response.value);
	}));
	callbackBus.emit(SECRET_RESOLVER_REQUEST_CHANNEL, request(async (response) => {
		if (response.ok) return Promise.reject(new Error(response.value));
	}));
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.deepEqual(bus.loggedErrors, []);
	assert.deepEqual(sdkBus.loggedErrors, []);
	assert.deepEqual(callbackBus.loggedErrors, []);
});

test("disable synchronously revokes callbacks, preserves accounting, and drains active source work", async () => {
	const bus = new FakeEventBus();
	const started = deferred<void>();
	const release = deferred<string>();
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			started.resolve();
			return release.promise;
		},
	});
	provider.start(bus);
	provider.enable(bindings());
	let response: SecretResolverResponse | undefined;
	let responses = 0;
	bus.emit(SECRET_RESOLVER_REQUEST_CHANNEL, request((received) => {
		responses += 1;
		response = received;
	}));
	await started.promise;

	const drain = provider.disable();
	assert.ok(response);
	assertFailure(response, "lifecycle");
	assert.equal(responses, 1);
	assert.deepEqual(provider.status(), {
		enabled: false,
		bindingCount: 0,
		callsUsed: 1,
		callLimit: 20,
		pending: 1,
		pendingLimit: 4,
	});
	let drained = false;
	void drain.then(() => { drained = true; });
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(drained, false);

	release.resolve(SECRET_VALUE);
	await drain;
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(responses, 1);
	assert.equal(provider.status().pending, 0);
	assert.deepEqual(bus.loggedErrors, []);
});

test("disable revokes queued requests and stale queued work never reaches the source", async () => {
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
	release.resolve(SECRET_VALUE);
	await drain;
	assert.equal(sourceCalls, 1);
	assert.equal(provider.status().pending, 0);
});

test("denied request IDs cannot poison replay tracking before enablement or admission", async () => {
	const bus = new FakeEventBus();
	let sourceCalls = 0;
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			sourceCalls += 1;
			return SECRET_VALUE;
		},
	}, { maxCalls: 1 });
	provider.start(bus);
	const admittedId = "reusable-after-disabled-0001";
	for (let index = 0; index < 200; index += 1) {
		assertFailure(await responsePromise(bus, {
			requestId: index === 0 ? admittedId : `disabled-request-${String(index).padStart(5, "0")}`,
		}), "disabled");
	}
	provider.enable(bindings());
	assert.equal((await responsePromise(bus, { requestId: admittedId })).ok, true);
	assert.equal(sourceCalls, 1);
});

test("only one live provider may own an event bus and a closed stale listener stays inert", async () => {
	const bus = new FakeEventBus();
	let firstCalls = 0;
	let duplicateCalls = 0;
	const first = new SecretResolverProvider({
		async resolveSecretValue() { firstCalls += 1; return SECRET_VALUE; },
	});
	const duplicate = new SecretResolverProvider({
		async resolveSecretValue() { duplicateCalls += 1; return SECRET_VALUE; },
	});
	first.start(bus);
	assert.throws(() => duplicate.start(bus), ResolverProviderRegistrationError);
	const reloadedModule = await import(new URL("../src/resolver.ts?offline-reload-ownership=1", import.meta.url).href);
	const reloaded = new reloadedModule.SecretResolverProvider({ resolveSecretValue: async () => SECRET_VALUE });
	assert.throws(
		() => reloaded.start(bus),
		(error: unknown) => error instanceof Error && error.name === "BitwardenResolverProviderRegistrationError",
	);
	first.enable(bindings());
	assert.equal((await responsePromise(bus)).ok, true);
	assert.equal(firstCalls, 1);
	assert.equal(duplicateCalls, 0);
	await first.shutdown();

	const staleListeners = new Set<(data: unknown) => void>();
	const hostileBus = {
		on(_channel: string, listener: (data: unknown) => void) {
			staleListeners.add(listener);
			return () => { throw new Error("unsubscribe failure"); };
		},
		emit(data: unknown) {
			for (const listener of staleListeners) listener(data);
		},
	};
	let oldCalls = 0;
	const oldProvider = new SecretResolverProvider({
		async resolveSecretValue() { oldCalls += 1; return SECRET_VALUE; },
	});
	oldProvider.start(hostileBus);
	oldProvider.enable(bindings());
	await oldProvider.shutdown();
	const replacement = new SecretResolverProvider({ resolveSecretValue: async () => SECRET_VALUE });
	replacement.start(hostileBus);
	replacement.enable(bindings());
	const response = await new Promise<SecretResolverResponse>((resolve) => {
		hostileBus.emit(request(resolve));
	});
	assert.equal(response.ok, true);
	assert.equal(oldCalls, 0);
	await replacement.shutdown();
});

test("hostile callback thenables and exact rejection canaries never reach the event-bus logger", async () => {
	const bus = new FakeEventBus();
	const provider = new SecretResolverProvider({ resolveSecretValue: async () => SECRET_VALUE });
	provider.start(bus);
	provider.enable(bindings());
	let thenCalls = 0;
	bus.emit(SECRET_RESOLVER_REQUEST_CHANNEL, request((response) => ({
		then() {
			thenCalls += 1;
			throw new Error(response.ok ? `${response.value}-${SDK_ERROR_CANARY}` : SDK_ERROR_CANARY);
		},
	})));
	bus.emit(SECRET_RESOLVER_REQUEST_CHANNEL, request((response) => Promise.reject(
		new Error(response.ok ? `${response.value}-${SDK_ERROR_CANARY}` : SDK_ERROR_CANARY),
	)));
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(thenCalls, 1);
	assert.deepEqual(bus.loggedErrors, []);
	await provider.shutdown();
});

test("provider shutdown obeys its fixed drain bound without logging secret-bearing work", async () => {
	const bus = new FakeEventBus();
	const started = deferred<void>();
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			started.resolve();
			return new Promise<string>(() => undefined);
		},
	}, { drainMs: 5 });
	provider.start(bus);
	provider.enable(bindings());
	const pending = responsePromise(bus);
	await started.promise;
	const startedAt = Date.now();
	await provider.shutdown();
	assert.ok(Date.now() - startedAt < 500);
	assertFailure(await pending, "lifecycle");
	assert.equal(provider.status().pending, 1);
	assert.deepEqual(bus.loggedErrors, []);
});

test("shutdown unsubscribes, invalidates pending work, and permits a clean replacement provider", async () => {
	const bus = new FakeEventBus();
	const release = deferred<string>();
	const oldProvider = new SecretResolverProvider({ resolveSecretValue: async () => release.promise });
	oldProvider.start(bus);
	oldProvider.enable(bindings());
	const pending = responsePromise(bus);
	oldProvider.shutdown();
	assertFailure(await pending, "lifecycle");
	release.resolve(SECRET_VALUE);

	const replacement = new SecretResolverProvider({ resolveSecretValue: async () => SECRET_VALUE });
	replacement.start(bus);
	assertFailure(await responsePromise(bus), "disabled");
	replacement.enable(bindings());
	assert.equal((await responsePromise(bus)).ok, true);
	assert.equal(oldProvider.status().enabled, false);
	assert.deepEqual(bus.loggedErrors, []);
});

test("an absent provider produces no response so the consumer can synthesize unavailable", async () => {
	const bus = new FakeEventBus();
	let responded = false;
	bus.emit(SECRET_RESOLVER_REQUEST_CHANNEL, request(() => { responded = true; }));
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(responded, false);
});
