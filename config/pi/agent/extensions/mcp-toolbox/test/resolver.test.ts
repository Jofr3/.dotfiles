import assert from "node:assert/strict";
import test from "node:test";
import { CredentialResolverError, SecretResolverConsumer } from "../src/resolver.ts";

const REQUEST_CHANNEL = "pi:secret-resolver:v1:request";
const PROTOCOL = "pi.secret-resolver/v1";
const SECRET_VALUE = "RESOLVER_SECRET_CANARY_NEVER_PUBLIC";

interface RequestPayload {
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

async function expectFixedFailure(promise: Promise<unknown>): Promise<void> {
	await assert.rejects(
		promise,
		(error: unknown) => error instanceof CredentialResolverError &&
			!error.message.includes(SECRET_VALUE) &&
			!/(binding_denied|disabled|sdk_unavailable)/u.test(error.message),
	);
}

test("request uses the finalized frozen protocol and contains no value or secret id", async () => {
	const bus = new FakeEventBus();
	bus.on((data) => {
		const request = requestFrom(data);
		request.respond({ protocol: PROTOCOL, ok: true, value: SECRET_VALUE });
	});
	const resolver = consumer(bus);
	const value = await resolver.resolve(
		"production-authorization",
		"mcp-toolbox.header",
		new AbortController().signal,
		Date.now() + 1_000,
	);
	assert.equal(value, SECRET_VALUE);
	assert.equal(bus.events.length, 1);
	const event = bus.events[0]!;
	const request = requestFrom(event.data);
	assert.equal(event.channel, REQUEST_CHANNEL);
	assert.equal(request.protocol, PROTOCOL);
	assert.equal(request.consumer, "mcp-toolbox");
	assert.equal(request.slot, "production-authorization");
	assert.equal(request.purpose, "mcp-toolbox.header");
	assert.match(request.requestId, /^[A-Za-z0-9_-]{16,128}$/u);
	assert.equal(Object.isFrozen(request), true);
	assert.equal(Object.hasOwn(request, "secretId"), false);
	assert.equal(Object.hasOwn(request, "value"), false);
	assert.equal(JSON.stringify(request).includes(SECRET_VALUE), false);
});

test("provider absence and load order fail closed, then a later request can succeed", async () => {
	const bus = new FakeEventBus();
	const resolver = consumer(bus, { maxWaitMs: 5 });
	await expectFixedFailure(resolver.resolve(
		"production-oauth",
		"mcp-toolbox.auth-token",
		new AbortController().signal,
		Date.now() + 1_000,
	));
	bus.on((data) => requestFrom(data).respond({ protocol: PROTOCOL, ok: true, value: SECRET_VALUE }));
	assert.equal(await resolver.resolve(
		"production-oauth",
		"mcp-toolbox.auth-token",
		new AbortController().signal,
		Date.now() + 1_000,
	), SECRET_VALUE);
});

test("first response wins and duplicate or late responses are ignored", async () => {
	const bus = new FakeEventBus();
	let late: (() => void) | undefined;
	bus.on((data) => {
		const request = requestFrom(data);
		request.respond({ protocol: PROTOCOL, ok: true, value: SECRET_VALUE });
		request.respond({ protocol: PROTOCOL, ok: false, code: "binding_denied" });
		late = () => request.respond({ protocol: PROTOCOL, ok: true, value: "LATE_CANARY" });
	});
	const resolver = consumer(bus);
	assert.equal(await resolver.resolve(
		"production-tenant",
		"mcp-toolbox.bound-param",
		new AbortController().signal,
		Date.now() + 1_000,
	), SECRET_VALUE);
	late?.();
	await Promise.resolve();
});

test("denials, malformed responses, and accessor-backed responses use one fixed failure", async () => {
	for (const responseFactory of [
		() => ({ protocol: PROTOCOL, ok: false, code: "binding_denied" }),
		() => ({ protocol: PROTOCOL, ok: true, value: `${SECRET_VALUE}\nunsafe` }),
		() => ({ protocol: "wrong", ok: true, value: SECRET_VALUE }),
	]) {
		const bus = new FakeEventBus();
		bus.on((data) => requestFrom(data).respond(responseFactory()));
		await expectFixedFailure(consumer(bus).resolve(
			"production-authorization",
			"mcp-toolbox.header",
			new AbortController().signal,
			Date.now() + 1_000,
		));
	}

	let getterInvoked = false;
	const accessorResponse = { protocol: PROTOCOL, ok: true } as Record<string, unknown>;
	Object.defineProperty(accessorResponse, "value", {
		enumerable: true,
		get() {
			getterInvoked = true;
			return SECRET_VALUE;
		},
	});
	const bus = new FakeEventBus();
	bus.on((data) => requestFrom(data).respond(accessorResponse));
	await expectFixedFailure(consumer(bus).resolve(
		"production-authorization",
		"mcp-toolbox.header",
		new AbortController().signal,
		Date.now() + 1_000,
	));
	assert.equal(getterInvoked, false);
});

test("cancellation, shutdown, pending bounds, and call limits are fail-closed", async () => {
	const cancellationBus = new FakeEventBus();
	let cancelledRequest: RequestPayload | undefined;
	cancellationBus.on((data) => { cancelledRequest = requestFrom(data); });
	const resolver = consumer(cancellationBus);
	const controller = new AbortController();
	const pending = resolver.resolve(
		"production-authorization",
		"mcp-toolbox.header",
		controller.signal,
		Date.now() + 1_000,
	);
	controller.abort();
	await expectFixedFailure(pending);
	cancelledRequest?.respond({ protocol: PROTOCOL, ok: true, value: SECRET_VALUE });

	const shutdownBus = new FakeEventBus();
	const shutdownResolver = consumer(shutdownBus);
	const shutdownPending = shutdownResolver.resolve(
		"production-oauth",
		"mcp-toolbox.auth-token",
		new AbortController().signal,
		Date.now() + 1_000,
	);
	shutdownResolver.shutdown();
	await expectFixedFailure(shutdownPending);
	await expectFixedFailure(shutdownResolver.resolve(
		"production-oauth",
		"mcp-toolbox.auth-token",
		new AbortController().signal,
		Date.now() + 1_000,
	));

	const boundedBus = new FakeEventBus();
	const bounded = consumer(boundedBus, { maxPending: 1, maxCalls: 1, maxWaitMs: 5 });
	const first = bounded.resolve(
		"production-tenant",
		"mcp-toolbox.bound-param",
		new AbortController().signal,
		Date.now() + 1_000,
	);
	await expectFixedFailure(bounded.resolve(
		"production-tenant",
		"mcp-toolbox.bound-param",
		new AbortController().signal,
		Date.now() + 1_000,
	));
	await expectFixedFailure(first);
	await expectFixedFailure(bounded.resolve(
		"production-tenant",
		"mcp-toolbox.bound-param",
		new AbortController().signal,
		Date.now() + 1_000,
	));
});
