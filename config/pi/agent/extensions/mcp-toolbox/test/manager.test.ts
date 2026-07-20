import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogToolMetadata } from "../src/catalog.ts";
import {
	createInvocationSnapshot,
	findConfiguredTool,
	parseConfig,
	type ToolboxConfig,
} from "../src/config.ts";
import { CatalogChangedError, configuredToolsForToolset, ToolboxManager } from "../src/manager.ts";
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
	return { raw: { name }, getName: () => name } as RemoteTool;
}

function discoveredRemoteTool(
	name: string,
	fingerprint = "A".repeat(43),
	authTokens: readonly string[] = [],
	toolset?: string,
): RemoteTool {
	const metadata: CatalogToolMetadata = Object.freeze({
		name,
		...(toolset === undefined ? {} : { toolset }),
		parameters: Object.freeze([Object.freeze({ name: "query", type: "string", required: true })]),
		authTokens: Object.freeze([...authTokens]),
		usable: true,
		fingerprint,
	});
	return { raw: { name }, metadata, getName: () => name };
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

test("nested credential-routing arguments fail before resolver or SDK construction", async () => {
	const count = counters();
	let resolverCalls = 0;
	const resolver = {
		async resolve() { resolverCalls += 1; return "ONE_SHOT_SECRET_MUST_NOT_BE_CONSUMED"; },
	} as unknown as SecretResolverConsumer;
	const manager = new ToolboxManager(fakeFactory(count), resolver);
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{
			id: "one",
			url: "http://127.0.0.1:5000",
			tools: [{ name: "search", confirmation: "not-required", boundParams: ["database_password"] }],
			boundParams: {
				database_password: {
					resolver: { provider: "onepassword-secrets-manager", dynamic: true },
				},
			},
		}],
	});
	for (const arguments_ of [
		{ nested: [{ resolver: { provider: "onepassword-secrets-manager", dynamic: true } }] },
		{ nested: [{ requirement_id: "model-controlled" }] },
		{ nested: [{ note: "mcp-toolbox.bound-param" }] },
	]) {
		await assert.rejects(
			() => managerCall(manager, config, "one", "search", arguments_),
			/credential-routing data/u,
		);
	}
	assert.equal(resolverCalls, 0);
	assert.deepEqual(count, counters());
	await manager.shutdown();
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

test("reset aborts, clears active dynamic 1Password credential records immediately, boundedly drains, and disposes late clients", async () => {
	const secret = "MANAGER_RESET_SECRET_CANARY";
	let release: (() => void) | undefined;
	let observedCredentials: { headers: Record<string, string>; redactionValues: string[] } | undefined;
	const count = counters();
	const resolver = { async resolve() { return secret; } } as unknown as SecretResolverConsumer;
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
	}, resolver, { drainMs: 20 });
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{
			id: "one",
			url: "http://127.0.0.1:5000",
			tools: [{ name: "search", confirmation: "not-required" }],
			headers: {
				Authorization: { resolver: { provider: "onepassword-secrets-manager", dynamic: true } },
			},
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
});

test("discovery creates an exact deny-aware required-confirmation catalog and invokes with inferred dynamic auth", async () => {
	const secret = "DISCOVERED_AUTH_SECRET_CANARY";
	let resolverCalls = 0;
	let factories = 0;
	let invokes = 0;
	let disposals = 0;
	const resolver = {
		async resolve() {
			resolverCalls += 1;
			return secret;
		},
	} as unknown as SecretResolverConsumer;
	const factory: ToolboxSdkClientFactory = async (_server, _timeout, credentials) => {
		factories += 1;
		return {
			async loadTool(name) { return discoveredRemoteTool(name, "A".repeat(43), ["oauth"]); },
			async loadToolset() {
				return [
					discoveredRemoteTool("search", "A".repeat(43), ["oauth"]),
					discoveredRemoteTool("blocked", "B".repeat(43)),
				];
			},
			async invoke() {
				invokes += 1;
				assert.equal(credentials.authTokens.oauth, secret);
				return `echo ${secret}`;
			},
			async dispose() { disposals += 1; },
		};
	};
	const manager = new ToolboxManager(factory, resolver);
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{
			id: "local",
			url: "http://127.0.0.1:5000",
			denyTools: ["blocked"],
		}],
	});
	const catalog = await manager.refreshCatalogs(config, manager.captureGeneration());
	assert.deepEqual(catalog.map((entry) => entry.name), ["search"]);
	assert.deepEqual(manager.snapshot(), {
		generation: 1,
		initializedServers: 1,
		loadedTools: 1,
		activeOperations: 0,
	});
	const invocation = manager.createInvocationSnapshot(config, "local", "search");
	assert.equal(invocation.tool.confirmation, "required");
	assert.deepEqual(invocation.tool.authTokens, ["oauth"]);
	assert.equal(Object.isFrozen(invocation.discovery), true);
	assert.throws(() => manager.createInvocationSnapshot(config, "local", "Search"), /not in the discovered catalog/u);
	assert.throws(() => manager.createInvocationSnapshot(config, "local", "blocked"), /denied/u);

	const output = await manager.call(invocation, { query: "hotels" }, manager.captureGeneration());
	assert.equal(output.text.includes(secret), false);
	assert.equal(resolverCalls, 1);
	assert.equal(factories, 3, "one catalog client, one pre-credential verifier, one invocation client");
	assert.equal(invokes, 1);
	assert.equal(disposals, 3);
	await manager.reset();
	assert.throws(() => manager.createInvocationSnapshot(config, "local", "search"), /has not been discovered/u);
});

test("catalog refresh advances generation and aborts older discovered calls before replacing membership", async () => {
	let factoryIndex = 0;
	let invokes = 0;
	let markInvocationLoadStarted: (() => void) | undefined;
	const invocationLoadStarted = new Promise<void>((resolve) => { markInvocationLoadStarted = resolve; });
	const manager = new ToolboxManager(async () => {
		factoryIndex += 1;
		const clientIndex = factoryIndex;
		return {
			async loadTool(name, signal) {
				if (clientIndex === 3) {
					markInvocationLoadStarted?.();
					await new Promise<void>((_resolve, reject) => {
						const stopped = (): void => reject(new Error("synthetic aborted stale load"));
						signal.addEventListener("abort", stopped, { once: true });
						if (signal.aborted) stopped();
					});
				}
				return discoveredRemoteTool(name, "A".repeat(43));
			},
			async loadToolset() { return [discoveredRemoteTool("search", "A".repeat(43))]; },
			async invoke() { invokes += 1; return "must not invoke"; },
			async dispose() {},
		};
	}, inertResolver());
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{ id: "local", url: "http://127.0.0.1:5000" }],
	});
	await manager.refreshCatalogs(config, manager.captureGeneration());
	const invocation = manager.createInvocationSnapshot(config, "local", "search");
	const staleCall = manager.call(invocation, {}, manager.captureGeneration());
	void staleCall.catch(() => undefined);
	await invocationLoadStarted;

	await manager.refreshCatalogs(config, manager.captureGeneration());
	await assert.rejects(staleCall, /interrupted by reload or shutdown/u);
	assert.equal(invokes, 0);
	assert.deepEqual(manager.snapshot(), {
		generation: 2,
		initializedServers: 1,
		loadedTools: 1,
		activeOperations: 0,
	});
});

test("a stale refresh cannot erase a newer catalog while stale cleanup is pending", async () => {
	let factoryIndex = 0;
	let markStaleLoadStarted: (() => void) | undefined;
	let markStaleDisposeStarted: (() => void) | undefined;
	let markStaleDisposeFinished: (() => void) | undefined;
	let releaseStaleDispose: (() => void) | undefined;
	const staleLoadStarted = new Promise<void>((resolve) => { markStaleLoadStarted = resolve; });
	const staleDisposeStarted = new Promise<void>((resolve) => { markStaleDisposeStarted = resolve; });
	const staleDisposeFinished = new Promise<void>((resolve) => { markStaleDisposeFinished = resolve; });
	const staleDisposeRelease = new Promise<void>((resolve) => { releaseStaleDispose = resolve; });
	const manager = new ToolboxManager(async () => {
		factoryIndex += 1;
		const clientIndex = factoryIndex;
		return {
			async loadTool(name) { return discoveredRemoteTool(name, "A".repeat(43)); },
			async loadToolset(_name, signal) {
				if (clientIndex === 2) {
					markStaleLoadStarted?.();
					await new Promise<void>((_resolve, reject) => {
						const stopped = (): void => reject(new Error("synthetic stale refresh aborted"));
						signal.addEventListener("abort", stopped, { once: true });
						if (signal.aborted) stopped();
					});
				}
				const fingerprint = clientIndex === 3 ? "B".repeat(43) : "A".repeat(43);
				return [discoveredRemoteTool("search", fingerprint)];
			},
			async invoke() { return "unused"; },
			async dispose() {
				if (clientIndex === 2) {
					markStaleDisposeStarted?.();
					await staleDisposeRelease;
					markStaleDisposeFinished?.();
				}
			},
		};
	}, inertResolver());
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{ id: "local", url: "http://127.0.0.1:5000" }],
	});
	await manager.refreshCatalogs(config, manager.captureGeneration());
	const staleRefresh = manager.refreshCatalogs(config, manager.captureGeneration());
	void staleRefresh.catch(() => undefined);
	await staleLoadStarted;
	const currentRefresh = manager.refreshCatalogs(config, manager.captureGeneration());
	await staleDisposeStarted;
	await currentRefresh;
	assert.equal(manager.createInvocationSnapshot(config, "local", "search").discovery?.fingerprint, "B".repeat(43));
	releaseStaleDispose?.();
	await assert.rejects(staleRefresh, /interrupted by reload or shutdown/u);
	await staleDisposeFinished;
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(manager.createInvocationSnapshot(config, "local", "search").discovery?.fingerprint, "B".repeat(43));
});

test("a stale refresh that ignores abort cannot process late results or load another toolset", async () => {
	let factoryIndex = 0;
	let staleLoads = 0;
	let markStaleLoadStarted: (() => void) | undefined;
	let releaseStaleLoad: (() => void) | undefined;
	const staleLoadStarted = new Promise<void>((resolve) => { markStaleLoadStarted = resolve; });
	const staleLoadRelease = new Promise<void>((resolve) => { releaseStaleLoad = resolve; });
	const manager = new ToolboxManager(async () => {
		factoryIndex += 1;
		const clientIndex = factoryIndex;
		return {
			async loadTool(name) { return discoveredRemoteTool(name, "A".repeat(43)); },
			async loadToolset(name) {
				if (clientIndex === 2) {
					staleLoads += 1;
					markStaleLoadStarted?.();
					await staleLoadRelease;
					return [discoveredRemoteTool("stale", "C".repeat(43))];
				}
				const fingerprint = clientIndex === 3 ? "B".repeat(43) : "A".repeat(43);
				return [discoveredRemoteTool(name ? "analytics-search" : "search", fingerprint, [], name)];
			},
			async invoke() { return "unused"; },
			async dispose() {},
		};
	}, inertResolver());
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{
			id: "local",
			url: "http://127.0.0.1:5000",
			toolsets: ["analytics"],
		}],
	});
	await manager.refreshCatalogs(config, manager.captureGeneration());
	const staleRefresh = manager.refreshCatalogs(config, manager.captureGeneration());
	void staleRefresh.catch(() => undefined);
	await staleLoadStarted;
	await manager.refreshCatalogs(config, manager.captureGeneration());
	releaseStaleLoad?.();
	await assert.rejects(staleRefresh, /interrupted by reload or shutdown/u);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(staleLoads, 1, "the stale operation must not issue its configured named-toolset load");
	assert.equal(manager.createInvocationSnapshot(config, "local", "search").discovery?.fingerprint, "B".repeat(43));
});

test("a stale verifier cannot invalidate a catalog committed by a newer refresh", async () => {
	let factoryIndex = 0;
	let markVerifierStarted: (() => void) | undefined;
	let releaseVerifier: (() => void) | undefined;
	const verifierStarted = new Promise<void>((resolve) => { markVerifierStarted = resolve; });
	const verifierRelease = new Promise<void>((resolve) => { releaseVerifier = resolve; });
	const manager = new ToolboxManager(async () => {
		factoryIndex += 1;
		const clientIndex = factoryIndex;
		return {
			async loadTool(name) {
				if (clientIndex === 2) {
					markVerifierStarted?.();
					await verifierRelease;
					return discoveredRemoteTool(name, "C".repeat(43));
				}
				return discoveredRemoteTool(name, "A".repeat(43));
			},
			async loadToolset() {
				const fingerprint = clientIndex === 3 ? "B".repeat(43) : "A".repeat(43);
				return [discoveredRemoteTool("search", fingerprint)];
			},
			async invoke() { return "must not invoke"; },
			async dispose() {},
		};
	}, inertResolver());
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{ id: "local", url: "http://127.0.0.1:5000" }],
	});
	await manager.refreshCatalogs(config, manager.captureGeneration());
	const invocation = manager.createInvocationSnapshot(config, "local", "search");
	const staleCall = manager.call(invocation, {}, manager.captureGeneration());
	void staleCall.catch(() => undefined);
	await verifierStarted;
	await manager.refreshCatalogs(config, manager.captureGeneration());
	releaseVerifier?.();
	await assert.rejects(staleCall, /interrupted by reload or shutdown/u);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(manager.createInvocationSnapshot(config, "local", "search").discovery?.fingerprint, "B".repeat(43));
});

test("catalog mismatch advances generation and aborts sibling discovered calls", async () => {
	let factoryIndex = 0;
	let invokes = 0;
	let markSiblingLoadStarted: (() => void) | undefined;
	const siblingLoadStarted = new Promise<void>((resolve) => { markSiblingLoadStarted = resolve; });
	const manager = new ToolboxManager(async () => {
		factoryIndex += 1;
		const clientIndex = factoryIndex;
		return {
			async loadTool(name, signal) {
				if (clientIndex === 3) {
					markSiblingLoadStarted?.();
					await new Promise<void>((_resolve, reject) => {
						const stopped = (): void => reject(new Error("synthetic aborted sibling load"));
						signal.addEventListener("abort", stopped, { once: true });
						if (signal.aborted) stopped();
					});
				}
				const fingerprint = clientIndex === 4 ? "B".repeat(43) : "A".repeat(43);
				return discoveredRemoteTool(name, fingerprint);
			},
			async loadToolset() { return [discoveredRemoteTool("search", "A".repeat(43))]; },
			async invoke() { invokes += 1; return "must not invoke"; },
			async dispose() {},
		};
	}, inertResolver());
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{ id: "local", url: "http://127.0.0.1:5000" }],
	});
	await manager.refreshCatalogs(config, manager.captureGeneration());
	const invocation = manager.createInvocationSnapshot(config, "local", "search");
	const sibling = manager.call(invocation, {}, manager.captureGeneration());
	void sibling.catch(() => undefined);
	await siblingLoadStarted;

	const mismatch = manager.call(invocation, {}, manager.captureGeneration());
	await assert.rejects(mismatch, (error: unknown) => error instanceof CatalogChangedError);
	await assert.rejects(sibling, /interrupted by reload or shutdown/u);
	assert.equal(invokes, 0);
	assert.equal(manager.snapshot().generation, 2);
	assert.throws(() => manager.createInvocationSnapshot(config, "local", "search"), /has not been discovered/u);
});

test("catalog mismatch is not masked while asynchronous verifier cleanup remains pending", async () => {
	let factoryIndex = 0;
	let markDisposeStarted: (() => void) | undefined;
	let releaseDispose: (() => void) | undefined;
	const disposeStarted = new Promise<void>((resolve) => { markDisposeStarted = resolve; });
	const disposeRelease = new Promise<void>((resolve) => { releaseDispose = resolve; });
	const manager = new ToolboxManager(async () => {
		factoryIndex += 1;
		const clientIndex = factoryIndex;
		return {
			async loadTool(name) {
				return discoveredRemoteTool(name, clientIndex === 2 ? "B".repeat(43) : "A".repeat(43));
			},
			async loadToolset() { return [discoveredRemoteTool("search", "A".repeat(43))]; },
			async invoke() { return "must not invoke"; },
			async dispose() {
				if (clientIndex === 2) {
					markDisposeStarted?.();
					await disposeRelease;
				}
			},
		};
	}, inertResolver());
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{ id: "local", url: "http://127.0.0.1:5000" }],
	});
	await manager.refreshCatalogs(config, manager.captureGeneration());
	const invocation = manager.createInvocationSnapshot(config, "local", "search");
	const mismatch = manager.call(invocation, {}, manager.captureGeneration());
	const observed = mismatch.then(
		() => "unexpected-success",
		(error: unknown) => error instanceof CatalogChangedError ? "catalog-changed" : String(error),
	);
	await disposeStarted;
	const outcome = await Promise.race([
		observed,
		new Promise<string>((resolve) => setTimeout(() => resolve("still-pending"), 50)),
	]);
	releaseDispose?.();
	assert.equal(outcome, "catalog-changed");
	await observed;
});

test("catalog changes fail before resolver consumption and invalidate exact cached membership", async () => {
	let factories = 0;
	let resolverCalls = 0;
	const manager = new ToolboxManager(async () => {
		factories += 1;
		const fingerprint = factories === 1 ? "A".repeat(43) : "B".repeat(43);
		return {
			async loadTool(name) { return discoveredRemoteTool(name, fingerprint); },
			async loadToolset() { return [discoveredRemoteTool("search", fingerprint)]; },
			async invoke() { return "must not invoke"; },
			async dispose() {},
		};
	}, {
		async resolve() { resolverCalls += 1; return "MUST_NOT_RESOLVE"; },
	} as unknown as SecretResolverConsumer);
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{ id: "local", url: "http://127.0.0.1:5000" }],
	});
	await manager.refreshCatalogs(config, manager.captureGeneration());
	const invocation = manager.createInvocationSnapshot(config, "local", "search");
	await assert.rejects(
		() => manager.call(invocation, {}, manager.captureGeneration()),
		(error: unknown) => error instanceof CatalogChangedError,
	);
	assert.equal(resolverCalls, 0);
	assert.equal(manager.snapshot().generation, 2);
	assert.throws(() => manager.createInvocationSnapshot(config, "local", "search"), /has not been discovered/u);
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
