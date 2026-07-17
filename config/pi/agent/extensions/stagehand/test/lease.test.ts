import assert from "node:assert/strict";
import test from "node:test";
import { StagehandCredentialLeaseBroker } from "../src/lease.ts";
import { EventStagehandLeaseClient } from "../../onepassword-secrets-manager/src/stagehand-lease.ts";

class Bus {
	#listeners = new Map<string, Set<(data: unknown) => void>>();
	observed: Array<{ channel: string; data: unknown }> = [];
	on(channel: string, handler: (data: unknown) => void): () => void {
		const listeners = this.#listeners.get(channel) ?? new Set();
		listeners.add(handler);
		this.#listeners.set(channel, listeners);
		return () => { listeners.delete(handler); };
	}
	emit(channel: string, data: unknown): void {
		this.observed.push({ channel, data });
		for (const handler of this.#listeners.get(channel) ?? []) handler(data);
	}
	count(): number { return [...this.#listeners.values()].reduce((total, listeners) => total + listeners.size, 0); }
}

function manager() {
	let runs = 0;
	const page = {
		url: () => "https://example.test/login",
		evaluate: async (_fn: Function, value: unknown) => value,
		waitForLoadState: async () => {},
		waitForTimeout: async () => {},
	};
	const fake = {
		getLiveConfiguration: () => ({ sdkLoggingConfigured: false }),
		authorizedPage: () => page,
		async run(_operation: string, _timeout: number, _signal: AbortSignal | undefined, work: Function) {
			runs += 1;
			return work({});
		},
	};
	return { fake, get runs() { return runs; } };
}

test("credential lease is capability-only, session-reused, revoked on reset, and listener-cleaned on shutdown", async () => {
	const bus = new Bus();
	const managed = manager();
	const broker = new StagehandCredentialLeaseBroker(managed.fake as never);
	broker.start(bus);
	assert.equal(bus.count(), 1);
	const client = new EventStagehandLeaseClient(bus, 100);
	const first = await client.acquire();
	const second = await client.acquire();
	assert.equal(first, second);
	assert.equal(broker.status().activeLeases, 1);
	const result = await first.run("login-form-fill", undefined, async (page) => page.url());
	assert.equal(result, "https://example.test/login");
	assert.equal(managed.runs, 1);
	for (const event of bus.observed) {
		const serialized = JSON.stringify(event.data);
		assert.equal(serialized.includes("CREDENTIAL_SENTINEL_NEVER_PUBLIC"), false);
		assert.equal(serialized.includes("op://"), false);
	}

	broker.revokeAll();
	assert.equal(first.isRevoked(), true);
	const replacement = await client.acquire();
	assert.notEqual(replacement, first);
	assert.equal(replacement.isRevoked(), false);
	client.reset();
	assert.equal(replacement.isRevoked(), true);
	client.shutdown();
	broker.shutdown();
	assert.equal(bus.count(), 0);
	assert.deepEqual(broker.status(), { activeLeases: 0, closed: true });
});

test("client shutdown cancels a pending acquisition timer immediately", async () => {
	const bus = new Bus();
	const client = new EventStagehandLeaseClient(bus, 5_000);
	const pending = client.acquire();
	assert.equal(client.status().acquiring, true);
	client.shutdown();
	await assert.rejects(pending, /unavailable/u);
	assert.deepEqual(client.status(), { cached: false, acquiring: false, closed: true });
});

test("credential lease refuses Stagehand SDK flow logging and sanitizes the consumer-visible failure", async () => {
	const bus = new Bus();
	const managed = manager();
	managed.fake.getLiveConfiguration = () => ({ sdkLoggingConfigured: true });
	const broker = new StagehandCredentialLeaseBroker(managed.fake as never);
	broker.start(bus);
	const client = new EventStagehandLeaseClient(bus, 100);
	const lease = await client.acquire();
	await assert.rejects(
		() => lease.run("login-form-fill", undefined, async () => "must not run"),
		(error: unknown) => error instanceof Error && /unavailable while SDK flow logging/u.test(error.message),
	);
	assert.equal(managed.runs, 0);
	broker.shutdown();
	client.shutdown();
});
