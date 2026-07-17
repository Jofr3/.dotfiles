import assert from "node:assert/strict";
import test from "node:test";
import { parseResolverBindings } from "../src/resolver-bindings.ts";
import {
	ONEPASSWORD_RESOLVER_PROVIDER,
	SECRET_RESOLVER_V2_PROTOCOL,
	SECRET_RESOLVER_V2_REQUEST_CHANNEL,
	type SecretResolverV2Response,
} from "../src/resolver-protocol.ts";
import { SecretResolverProvider } from "../src/resolver.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const REFERENCE = "op://example-vault/example-item/password";
const SECRET_VALUE = "CROSS_EXTENSION_SECRET_CANARY";

class SharedEventBus {
	readonly payloads: unknown[] = [];
	#listeners = new Map<string, Set<(data: unknown) => void>>();

	on(channel: string, handler: (data: unknown) => void): () => void {
		const listeners = this.#listeners.get(channel) ?? new Set<(data: unknown) => void>();
		listeners.add(handler);
		this.#listeners.set(channel, listeners);
		return () => { listeners.delete(handler); };
	}

	emit(channel: string, data: unknown): void {
		this.payloads.push(data);
		for (const listener of this.#listeners.get(channel) ?? []) listener(data);
	}
}

let nonce = 0;
async function mcpStyleResolve(
	bus: SharedEventBus,
	provider: string,
	overrides: { slot?: string; timeoutMs?: number } = {},
): Promise<SecretResolverV2Response | Readonly<{ ok: false; code: "unavailable" }>> {
	nonce += 1;
	const timeoutMs = overrides.timeoutMs ?? 20;
	return new Promise((resolve) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			resolve(Object.freeze({ ok: false, code: "unavailable" }));
		}, timeoutMs);
		const respond = (response: SecretResolverV2Response): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(response);
		};
		bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, Object.freeze({
			protocol: SECRET_RESOLVER_V2_PROTOCOL,
			provider,
			consumer: "mcp-toolbox",
			slot: overrides.slot ?? "production-db-password",
			purpose: "mcp-toolbox.bound-param",
			requestId: `mcp-cross-extension-${String(nonce).padStart(4, "0")}`,
			deadlineAt: Date.now() + timeoutMs,
			respond,
		}));
	});
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

test("mock MCP v2 consumer resolves one exact 1Password credential through the one-shot callback", async () => {
	const bus = new SharedEventBus();
	let sourceCalls = 0;
	const provider = new SecretResolverProvider({
		async resolveSecretValue(reference) {
			assert.equal(reference, REFERENCE);
			sourceCalls += 1;
			return SECRET_VALUE;
		},
	});
	provider.start(bus);
	provider.enable(bindings());
	const response = await mcpStyleResolve(bus, ONEPASSWORD_RESOLVER_PROVIDER);
	assert.deepEqual(response, {
		protocol: SECRET_RESOLVER_V2_PROTOCOL,
		ok: true,
		value: SECRET_VALUE,
	});
	assert.equal(sourceCalls, 1);
	const payload = bus.payloads[0] as Record<string, unknown>;
	assert.equal(Object.isFrozen(payload), true);
	assert.equal(Object.hasOwn(payload, "value"), false);
	assert.equal(Object.hasOwn(payload, "secretReference"), false);
	assert.equal(JSON.stringify(payload).includes(SECRET_VALUE), false);
	assert.equal(JSON.stringify(payload).includes(REFERENCE), false);
	await provider.shutdown();
});

test("mock MCP failures remain fixed and provider routing isolates matching tuples", async () => {
	const bus = new SharedEventBus();
	let sourceCalls = 0;
	const provider = new SecretResolverProvider({
		async resolveSecretValue() {
			sourceCalls += 1;
			return SECRET_VALUE;
		},
	});
	provider.start(bus);
	const disabled = await mcpStyleResolve(bus, ONEPASSWORD_RESOLVER_PROVIDER);
	assert.equal(disabled.ok, false);
	if (!disabled.ok) assert.equal(disabled.code, "disabled");

	provider.enable(bindings());
	const denied = await mcpStyleResolve(bus, ONEPASSWORD_RESOLVER_PROVIDER, { slot: "unbound-password" });
	assert.equal(denied.ok, false);
	if (!denied.ok) assert.equal(denied.code, "binding_denied");

	const otherProvider = await mcpStyleResolve(bus, "bitwarden-secrets-manager", { timeoutMs: 5 });
	assert.deepEqual(otherProvider, { ok: false, code: "unavailable" });
	assert.equal(sourceCalls, 0);
	assert.equal(provider.status().callsUsed, 0);
	await provider.shutdown();
});
