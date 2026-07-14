import assert from "node:assert/strict";
import test from "node:test";
import { deriveRequirementId } from "../src/requirements.ts";
import {
	BITWARDEN_RESOLVER_PROVIDER,
	CredentialResolverError,
	ONEPASSWORD_RESOLVER_PROVIDER,
	SECRET_RESOLVER_V2_PROTOCOL,
	SECRET_RESOLVER_V2_REQUEST_CHANNEL,
	SecretResolverConsumer,
	type ResolverProvider,
} from "../src/resolver.ts";

const SECRET_VALUE = "RESOLVER_SECRET_CANARY_NEVER_PUBLIC";

interface RequestPayload {
	protocol: string;
	provider: string;
	consumer: string;
	slot: string;
	purpose: string;
	requestId: string;
	deadlineAt: number;
	signal: AbortSignal;
	respond(response: unknown): void;
}

class FakeEventBus {
	readonly events: Array<{ channel: string; data: unknown }> = [];
	readonly listeners = new Set<(data: unknown) => void>();

	on(listener: (data: unknown) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit(channel: string, data: unknown): void {
		this.events.push({ channel, data });
		for (const listener of this.listeners) listener(data);
	}
}

function requestFrom(data: unknown): RequestPayload {
	return data as RequestPayload;
}

function consumer(bus: FakeEventBus, overrides: Record<string, unknown> = {}): SecretResolverConsumer {
	let nonce = 0;
	return new SecretResolverConsumer(bus, {
		maxWaitMs: 25,
		requestId: () => `offline-consumer-request-${String(++nonce).padStart(4, "0")}`,
		...overrides,
	});
}

function success(value = SECRET_VALUE): Readonly<Record<string, unknown>> {
	return Object.freeze({ protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: true, value });
}

function failure(code: string): Readonly<Record<string, unknown>> {
	return Object.freeze({ protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: false, code });
}

function resolve(
	resolver: SecretResolverConsumer,
	provider: ResolverProvider = BITWARDEN_RESOLVER_PROVIDER,
	signal = new AbortController().signal,
): Promise<string> {
	return resolver.resolve(
		provider,
		"production-authorization",
		"mcp-toolbox.header",
		signal,
		Date.now() + 1_000,
	);
}

async function expectFixedFailure(promise: Promise<unknown>): Promise<void> {
	await assert.rejects(
		promise,
		(error: unknown) => error instanceof CredentialResolverError &&
			!error.message.includes(SECRET_VALUE) &&
			!/(binding_denied|disabled|sdk_unavailable)/u.test(error.message),
	);
}

test("consumer emits an exact frozen provider-aware v2 request with no value or secret identifier", async () => {
	const bus = new FakeEventBus();
	bus.on((data) => requestFrom(data).respond(success()));
	const resolver = consumer(bus);
	assert.equal(await resolver.resolve(
		ONEPASSWORD_RESOLVER_PROVIDER,
		"production-db-password",
		"mcp-toolbox.bound-param",
		new AbortController().signal,
		Date.now() + 1_000,
	), SECRET_VALUE);

	assert.equal(bus.events.length, 1);
	const event = bus.events[0]!;
	const request = requestFrom(event.data);
	assert.equal(event.channel, SECRET_RESOLVER_V2_REQUEST_CHANNEL);
	assert.deepEqual(Object.keys(request).sort(), [
		"consumer",
		"deadlineAt",
		"protocol",
		"provider",
		"purpose",
		"requestId",
		"respond",
		"signal",
		"slot",
	]);
	assert.equal(request.protocol, SECRET_RESOLVER_V2_PROTOCOL);
	assert.equal(request.provider, ONEPASSWORD_RESOLVER_PROVIDER);
	assert.equal(request.consumer, "mcp-toolbox");
	assert.equal(request.slot, "production-db-password");
	assert.equal(request.purpose, "mcp-toolbox.bound-param");
	assert.match(request.requestId, /^[A-Za-z0-9_-]{16,128}$/u);
	assert.equal(request.signal instanceof AbortSignal, true);
	assert.equal(Object.isFrozen(request), true);
	assert.equal(Object.hasOwn(request, "secretId"), false);
	assert.equal(Object.hasOwn(request, "secretReference"), false);
	assert.equal(Object.hasOwn(request, "value"), false);
	assert.equal(JSON.stringify(request).includes(SECRET_VALUE), false);
});

test("dynamic requirement slots are 1Password-only and require exact prefix-purpose agreement", async () => {
	const requirementId = deriveRequirementId("production", "search-hotels", "header", "Authorization");
	const bus = new FakeEventBus();
	bus.on((data) => requestFrom(data).respond(success()));
	const resolver = consumer(bus);
	assert.equal(await resolver.resolve(
		ONEPASSWORD_RESOLVER_PROVIDER,
		requirementId,
		"mcp-toolbox.header",
		new AbortController().signal,
		Date.now() + 1_000,
	), SECRET_VALUE);
	assert.equal(requestFrom(bus.events[0]!.data).slot, requirementId);
	assert.equal(requestFrom(bus.events[0]!.data).provider, ONEPASSWORD_RESOLVER_PROVIDER);

	for (const [provider, slot, purpose] of [
		[BITWARDEN_RESOLVER_PROVIDER, requirementId, "mcp-toolbox.header"],
		[ONEPASSWORD_RESOLVER_PROVIDER, requirementId, "mcp-toolbox.bound-param"],
		[ONEPASSWORD_RESOLVER_PROVIDER, `${requirementId.slice(0, -1)}p`, "mcp-toolbox.header"],
	] as const) {
		const rejectingBus = new FakeEventBus();
		await expectFixedFailure(consumer(rejectingBus).resolve(
			provider,
			slot,
			purpose,
			new AbortController().signal,
			Date.now() + 1_000,
		));
		assert.equal(rejectingBus.events.length, 0);
	}
});

test("provider routing is selected once: a wrong provider stays silent until timeout and a later request succeeds", async () => {
	const bus = new FakeEventBus();
	let bitwardenCallbacks = 0;
	bus.on((data) => {
		const request = requestFrom(data);
		if (request.provider !== BITWARDEN_RESOLVER_PROVIDER) return;
		bitwardenCallbacks += 1;
		request.respond(success());
	});
	const resolver = consumer(bus, { maxWaitMs: 5 });
	await expectFixedFailure(resolve(resolver, ONEPASSWORD_RESOLVER_PROVIDER));
	assert.equal(bitwardenCallbacks, 0);
	assert.equal(await resolve(resolver, BITWARDEN_RESOLVER_PROVIDER), SECRET_VALUE);
	assert.equal(bitwardenCallbacks, 1);
	assert.deepEqual(bus.events.map((event) => requestFrom(event.data).provider), [
		ONEPASSWORD_RESOLVER_PROVIDER,
		BITWARDEN_RESOLVER_PROVIDER,
	]);
});

test("first callback invocation wins and duplicate or late responses are ignored", async () => {
	const bus = new FakeEventBus();
	let late: (() => void) | undefined;
	bus.on((data) => {
		const request = requestFrom(data);
		request.respond(success());
		request.respond(failure("binding_denied"));
		late = () => request.respond(success("LATE_CANARY"));
	});
	const resolver = consumer(bus);
	assert.equal(await resolve(resolver), SECRET_VALUE);
	late?.();
	await Promise.resolve();

	const malformedFirstBus = new FakeEventBus();
	malformedFirstBus.on((data) => {
		const request = requestFrom(data);
		request.respond(Object.freeze({ protocol: "pi.secret-resolver/v1", ok: true, value: SECRET_VALUE }));
		request.respond(success());
	});
	await expectFixedFailure(resolve(consumer(malformedFirstBus)));
});

test("strict v2 response parsing rejects mutable, v1, unknown, symbol, accessor, unsafe-value, and consumer-only failures", async () => {
	let getterInvoked = false;
	const accessor = { protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: true } as Record<string, unknown>;
	Object.defineProperty(accessor, "value", {
		enumerable: true,
		get() {
			getterInvoked = true;
			return SECRET_VALUE;
		},
	});
	Object.freeze(accessor);
	const symbolResponse = { protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: true, value: SECRET_VALUE } as Record<PropertyKey, unknown>;
	Object.defineProperty(symbolResponse, Symbol("extra"), { value: true, enumerable: true });
	Object.freeze(symbolResponse);

	const responses: unknown[] = [
		{ protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: true, value: SECRET_VALUE },
		Object.freeze({ protocol: "pi.secret-resolver/v1", ok: true, value: SECRET_VALUE }),
		Object.freeze({ protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: true, value: SECRET_VALUE, extra: true }),
		symbolResponse,
		accessor,
		success(`${SECRET_VALUE}\nunsafe`),
		failure("unavailable"),
	];
	for (const response of responses) {
		const bus = new FakeEventBus();
		bus.on((data) => requestFrom(data).respond(response));
		await expectFixedFailure(resolve(consumer(bus)));
	}
	assert.equal(getterInvoked, false);
});

test("provider failures, cancellation, shutdown, pending bounds, call limits, and invalid providers fail closed", async () => {
	const denialBus = new FakeEventBus();
	denialBus.on((data) => requestFrom(data).respond(failure("binding_denied")));
	await expectFixedFailure(resolve(consumer(denialBus)));

	const cancellationBus = new FakeEventBus();
	let cancelledRequest: RequestPayload | undefined;
	cancellationBus.on((data) => { cancelledRequest = requestFrom(data); });
	const cancellationResolver = consumer(cancellationBus);
	const controller = new AbortController();
	const pending = resolve(cancellationResolver, BITWARDEN_RESOLVER_PROVIDER, controller.signal);
	controller.abort();
	await expectFixedFailure(pending);
	cancelledRequest?.respond(success());

	const shutdownBus = new FakeEventBus();
	const shutdownResolver = consumer(shutdownBus);
	const shutdownPending = resolve(shutdownResolver);
	shutdownResolver.shutdown();
	await expectFixedFailure(shutdownPending);
	await expectFixedFailure(resolve(shutdownResolver));

	const boundedBus = new FakeEventBus();
	const bounded = consumer(boundedBus, { maxPending: 1, maxCalls: 1, maxWaitMs: 5 });
	const first = resolve(bounded);
	await expectFixedFailure(resolve(bounded));
	await expectFixedFailure(first);
	await expectFixedFailure(resolve(bounded));

	await expectFixedFailure((consumer(new FakeEventBus()) as SecretResolverConsumer).resolve(
		"unknown-provider" as ResolverProvider,
		"production-authorization",
		"mcp-toolbox.header",
		new AbortController().signal,
		Date.now() + 1_000,
	));
});
