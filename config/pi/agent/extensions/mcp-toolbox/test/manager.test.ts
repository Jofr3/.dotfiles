import assert from "node:assert/strict";
import test from "node:test";
import {
	createInvocationSnapshot,
	findConfiguredTool,
	parseConfig,
	type ToolboxConfig,
} from "../src/config.ts";
import { configuredToolsForToolset, ToolboxManager } from "../src/manager.ts";
import { SecretResolverConsumer } from "../src/resolver.ts";
import type { RemoteTool, ToolboxSdkClient, ToolboxSdkClientFactory } from "../src/sdk.ts";

interface FakeCounters {
	factories: number;
	loads: number;
	toolsets: number;
	invokes: number;
	disposals: number;
}

function configFor(id = "one", toolset?: string): ToolboxConfig {
	return parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{
			id,
			url: "http://127.0.0.1:5000",
			tools: [
				{ name: "search", ...(toolset ? { toolset } : {}), confirmation: "not-required" },
				{ name: "write", ...(toolset ? { toolset } : {}) },
			],
		}],
	});
}

function remoteTool(name: string): RemoteTool {
	return { raw: { name }, getName: () => name };
}

function inertResolver(): SecretResolverConsumer {
	return new SecretResolverConsumer({ emit() {} }, { maxWaitMs: 10 });
}

function fakeFactory(
	counts: FakeCounters,
	options: { failFirstLoad?: boolean; toolsetNames?: string[] } = {},
): ToolboxSdkClientFactory {
	let failed = false;
	return async () => {
		counts.factories += 1;
		const client: ToolboxSdkClient = {
			async loadTool(name) {
				counts.loads += 1;
				if (options.failFirstLoad && !failed) {
					failed = true;
					throw new Error("SYNTHETIC_LOAD_CANARY");
				}
				await Promise.resolve();
				return remoteTool(name);
			},
			async loadToolset() {
				counts.toolsets += 1;
				await Promise.resolve();
				return (options.toolsetNames ?? ["search", "write", "not-allowed"]).map(remoteTool);
			},
			async invoke(tool, arguments_) {
				counts.invokes += 1;
				return JSON.stringify({ tool: tool.getName(), arguments_ });
			},
			async dispose() {
				counts.disposals += 1;
			},
		};
		return client;
	};
}

function counters(): FakeCounters {
	return { factories: 0, loads: 0, toolsets: 0, invokes: 0, disposals: 0 };
}

function managerCall(
	manager: ToolboxManager,
	config: ToolboxConfig,
	server: string,
	tool: string,
	arguments_: Record<string, unknown>,
) {
	return manager.call(
		createInvocationSnapshot(config, server, tool),
		arguments_,
		manager.captureGeneration(),
	);
}

test("manager keeps every SDK client/tool invocation-scoped instead of caching credential closures", async () => {
	const count = counters();
	const manager = new ToolboxManager(fakeFactory(count), inertResolver());
	const config = configFor();
	assert.deepEqual(manager.snapshot(), {
		generation: 0,
		initializedServers: 0,
		loadedTools: 0,
		activeOperations: 0,
	});
	const [first, second] = await Promise.all([
		managerCall(manager, config, "one", "search", { query: "a" }),
		managerCall(manager, config, "one", "search", { query: "b" }),
	]);
	assert.match(first.text, /"query": "a"/u);
	assert.match(second.text, /"query": "b"/u);
	assert.equal(count.factories, 2);
	assert.equal(count.loads, 2);
	assert.equal(count.invokes, 2);
	assert.equal(count.disposals, 2);
	assert.equal(manager.snapshot().initializedServers, 0);
});

test("named toolsets select the exact allowlisted member without loading another tool's credentials", async () => {
	const count = counters();
	const manager = new ToolboxManager(fakeFactory(count), inertResolver());
	const config = configFor("one", "analytics");
	const search = findConfiguredTool(config, "one", "search");
	assert.deepEqual(
		configuredToolsForToolset(search.server, "analytics").map((tool) => tool.name),
		["search", "write"],
	);
	await Promise.all([
		managerCall(manager, config, "one", "search", {}),
		managerCall(manager, config, "one", "write", {}),
	]);
	assert.equal(count.toolsets, 2);
	assert.equal(count.loads, 0);
	assert.equal(count.invokes, 2);
	assert.equal(count.disposals, 2);
});

test("downstream failures are fixed, canary-free, disposed, and retry with a fresh client", async () => {
	const count = counters();
	const manager = new ToolboxManager(fakeFactory(count, { failFirstLoad: true }), inertResolver());
	const config = configFor();
	await assert.rejects(
		() => managerCall(manager, config, "one", "search", {}),
		(error: unknown) => error instanceof Error &&
			error.message.includes("no downstream error details") &&
			!error.message.includes("SYNTHETIC_LOAD_CANARY"),
	);
	assert.equal(count.factories, 1);
	assert.equal(count.disposals, 1);
	await managerCall(manager, config, "one", "search", {});
	assert.equal(count.factories, 2);
	assert.equal(count.loads, 2);
	assert.equal(count.disposals, 2);
});

test("generation captured before confirmation fails closed after reset", async () => {
	const count = counters();
	const manager = new ToolboxManager(fakeFactory(count), inertResolver());
	const config = configFor();
	const invocation = createInvocationSnapshot(config, "one", "search");
	const beforeApproval = manager.captureGeneration();
	await manager.reset();
	await assert.rejects(
		() => manager.call(invocation, {}, beforeApproval),
		/interrupted by reload or shutdown/u,
	);
	assert.equal(count.factories, 0);
});

test("reset aborts, clears active credential records immediately, boundedly drains, and disposes late clients", async () => {
	const secret = "MANAGER_RESET_SECRET_CANARY";
	process.env.PI_MCP_TOOLBOX_MANAGER_TEST = secret;
	let release: (() => void) | undefined;
	let observedCredentials: { headers: Record<string, string>; redactionValues: string[] } | undefined;
	const count = counters();
	const manager = new ToolboxManager(async (_server, _timeout, credentials) => {
		count.factories += 1;
		observedCredentials = credentials;
		return {
			async loadTool(name) {
				count.loads += 1;
				await new Promise<void>((resolve) => { release = resolve; });
				return remoteTool(name);
			},
			async loadToolset() { return []; },
			async invoke() { count.invokes += 1; return "unexpected"; },
			async dispose() { count.disposals += 1; },
		};
	}, inertResolver(), { drainMs: 20 });
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{
			id: "one",
			url: "http://127.0.0.1:5000",
			tools: [{ name: "search", confirmation: "not-required" }],
			headers: { Authorization: { env: "PI_MCP_TOOLBOX_MANAGER_TEST" } },
		}],
	});
	const call = managerCall(manager, config, "one", "search", {});
	void call.catch(() => undefined);
	while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
	const started = Date.now();
	await manager.reset();
	assert.ok(Date.now() - started < 500);
	await assert.rejects(call, /interrupted by reload or shutdown/u);
	assert.equal(count.invokes, 0);
	assert.deepEqual(Object.keys(observedCredentials!.headers), []);
	assert.deepEqual(observedCredentials!.redactionValues, []);
	release();
	for (let attempt = 0; attempt < 20 && count.disposals === 0; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	assert.equal(count.disposals, 1);
	delete process.env.PI_MCP_TOOLBOX_MANAGER_TEST;
});

test("shutdown is permanent and reset drain completes early when active work releases", async () => {
	let release: (() => void) | undefined;
	const manager = new ToolboxManager(async () => ({
		async loadTool(name) {
			await new Promise<void>((resolve) => { release = resolve; });
			return remoteTool(name);
		},
		async loadToolset() { return []; },
		async invoke() { return "unexpected"; },
	}), inertResolver(), { drainMs: 500 });
	const config = configFor();
	const call = managerCall(manager, config, "one", "search", {});
	void call.catch(() => undefined);
	while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
	const drain = manager.shutdown();
	release();
	await drain;
	await assert.rejects(call, /interrupted by reload or shutdown/u);
	await assert.rejects(
		() => manager.call(
			createInvocationSnapshot(config, "one", "search"),
			{},
			manager.captureGeneration(),
		),
		/interrupted by reload or shutdown/u,
	);
});
