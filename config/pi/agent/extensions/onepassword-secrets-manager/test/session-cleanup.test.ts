import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { OnePasswordManager } from "../src/manager.ts";
import type { StagehandCredentialLease, StagehandLeaseSource } from "../src/stagehand-lease.ts";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "typebox") return { url: "onepassword-cleanup-test:typebox", shortCircuit: true };
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url === "onepassword-cleanup-test:typebox") {
			return {
				format: "module",
				shortCircuit: true,
				source: `
					const node = (kind, value, options = {}) => ({ kind, value, ...options });
					export const Type = {
						Object: (properties, options = {}) => node("object", properties, options),
						String: (options = {}) => node("string", undefined, options),
						Integer: (options = {}) => node("integer", undefined, options),
						Optional: (value) => ({ ...value, optional: true }),
					};
				`,
			};
		}
		return nextLoad(url, context);
	},
});

class Bus {
	#listeners = new Map<string, Set<(data: unknown) => void>>();
	on(channel: string, handler: (data: unknown) => void): () => void {
		const values = this.#listeners.get(channel) ?? new Set();
		values.add(handler);
		this.#listeners.set(channel, values);
		return () => { values.delete(handler); };
	}
	emit(channel: string, data: unknown): void { for (const handler of this.#listeners.get(channel) ?? []) handler(data); }
	count(): number { return [...this.#listeners.values()].reduce((total, values) => total + values.size, 0); }
}

class FakeLeaseSource implements StagehandLeaseSource {
	resetCalls = 0;
	shutdownCalls = 0;
	acquire(): Promise<StagehandCredentialLease> { return Promise.reject(new Error("not used")); }
	reset(): void { this.resetCalls += 1; }
	shutdown(): void { this.shutdownCalls += 1; this.reset(); }
	status() { return Object.freeze({ cached: false, acquiring: false, closed: this.shutdownCalls > 0 }); }
}

test("session switch, fork, reload, and shutdown synchronously revoke resources and remove listeners", async () => {
	const bus = new Bus();
	const leases = new FakeLeaseSource();
	const tools = new Map<string, unknown>();
	const commands = new Map<string, { handler(args: string, ctx: unknown): Promise<void> }>();
	const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
	const active: string[] = [];
	const pi = {
		events: bus,
		registerTool(tool: { name: string }) { tools.set(tool.name, tool); },
		registerCommand(name: string, command: { handler(args: string, ctx: unknown): Promise<void> }) { commands.set(name, command); },
		on(name: string, handler: (event: unknown, ctx: unknown) => unknown) {
			const values = handlers.get(name) ?? [];
			values.push(handler);
			handlers.set(name, values);
		},
		getActiveTools() { return [...active]; },
		setActiveTools(names: string[]) { active.splice(0, active.length, ...names); },
	};
	const ctx = {
		hasUI: true,
		mode: "tui",
		waitForIdle: async () => {},
		ui: {
			confirm: async () => true,
			notify() {},
			setStatus() {},
			custom: async () => undefined,
		},
	};
	const manager = new OnePasswordManager({ readEnvironment: () => ({}) });
	const { registerOnePasswordSecretsManagerExtension } = await import(`../src/index.ts?cleanup=${Math.random()}`);
	registerOnePasswordSecretsManagerExtension(pi as never, { manager, stagehandLeases: leases });
	assert.equal(bus.count(), 4, "resolver, MCP requirement, database requirement, and database profile listeners must be registered");
	const command = commands.get("onepassword-sm")!;
	const lifecycle = async (name: string, event: unknown = {}) => {
		for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
	};

	await command.handler("dynamic-enable", ctx);
	assert.equal(active.includes("onepassword_fill_login"), true);
	await lifecycle("session_before_switch", { reason: "resume" });
	assert.equal(leases.resetCalls, 1);
	assert.equal(active.includes("onepassword_fill_login"), false);

	await command.handler("dynamic-enable", ctx);
	await lifecycle("session_before_fork", { position: "before" });
	assert.equal(leases.resetCalls, 2);

	await command.handler("dynamic-enable", ctx);
	await lifecycle("session_shutdown", { reason: "reload" });
	assert.equal(leases.shutdownCalls, 1);
	assert.equal(bus.count(), 0, "reload/shutdown must remove every process-local listener");
	assert.equal(active.includes("onepassword_fill_login"), false);
});
