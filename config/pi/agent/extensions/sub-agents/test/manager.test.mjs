import assert from "node:assert/strict";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	InvalidAgentTransitionError,
	ManagerClosedError,
	StaleAgentIdError,
	SubAgentManager,
	SubAgentManagerError,
	canTransitionAgentState,
	createSessionGeneration,
} = await importSubAgentsModule("manager.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");

function deterministicOptions(label = "fixture") {
	let nonce = 0;
	let now = 1_000;
	return {
		cwd: process.cwd(),
		generation: createSessionGeneration(label),
		nonce: () => `nonce-${++nonce}`,
		now: () => ++now,
		cleanupTimeoutMs: 100,
	};
}

function agentSpec(name = "fixture-agent") {
	return {
		name,
		role: "Perform a dynamically assigned test role",
		objective: "Exercise the Phase 1 state model without starting a model runtime.",
	};
}

function deferred() {
	let resolvePromise;
	let rejectPromise;
	const promise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
}

test("the lifecycle state machine supports reusable assignments and rejects invalid or stale operations", async () => {
	assert.throws(
		() => new SubAgentManager({ ...deterministicOptions("invalid-generation"), generation: "sag1-bad\ngeneration" }),
		(error) => error instanceof SubAgentManagerError && error.code === "invalid_generation",
	);
	assert.throws(
		() => new SubAgentManager({ ...deterministicOptions("invalid-generation"), generation: `sag1-${"x".repeat(81)}` }),
		(error) => error instanceof SubAgentManagerError && error.code === "invalid_generation",
	);
	assert.equal(canTransitionAgentState("creating", "running"), true);
	assert.equal(canTransitionAgentState("running", "idle"), true);
	assert.equal(canTransitionAgentState("idle", "running"), true);
	assert.equal(canTransitionAgentState("removed", "running"), false);

	const manager = new SubAgentManager(deterministicOptions("generation-a"));
	const created = manager.createAgent({
		...agentSpec("reusable-worker"),
		tags: ["phase-1", "phase-1"],
		tools: ["read", "grep"],
	});
	assert.match(created.id, /^sa1-generation-a-/);
	assert.equal(created.state, "creating");
	assert.equal(created.spec.modelPolicy, "auto");
	assert.equal(created.spec.complexity, "moderate");
	assert.deepEqual(created.spec.tags, ["phase-1"]);
	assert.equal(created.spec.workspace.mode, "shared");
	assert.equal(created.spec.workspace.bashPolicy, "disabled");
	assert.equal(created.spec.workspace.writeScope, undefined);

	const firstRun = await manager.startAssignment(created.id);
	assert.equal(firstRun.state, "running");
	assert.equal(firstRun.assignmentCount, 1);
	assert.equal(firstRun.currentAssignment.state, "running");
	await assert.rejects(
		manager.startAssignment(created.id, "invalid overlap"),
		(error) => error instanceof InvalidAgentTransitionError && error.code === "invalid_transition",
	);

	const firstIdle = await manager.completeAssignment(created.id, {
		state: "idle",
		summary: "First assignment complete",
		files: ["src/a.ts"],
	});
	assert.equal(firstIdle.state, "idle");
	assert.equal(firstIdle.currentAssignment.state, "idle");
	assert.equal(firstIdle.latestResult.summary, "First assignment complete");

	await manager.startAssignment(created.id, "Investigate a follow-up with retained identity.");
	const blocked = await manager.completeAssignment(created.id, {
		state: "blocked",
		summary: "A parent decision is required",
		needs: "Choose the supported behavior",
	});
	assert.equal(blocked.state, "blocked");
	assert.equal(blocked.currentAssignment.state, "blocked");
	assert.match(blocked.currentAssignment.blocker, /Choose/);
	await manager.updateRuntimeActivity(created.id, {
		phase: "settled",
		activeToolCount: 0,
		activeTools: [],
		pendingMessageCount: 0,
	});

	const resumed = await manager.resumeBlockedAssignment(created.id);
	assert.equal(resumed.state, "running");
	assert.equal(resumed.assignmentCount, 2, "resuming does not create another assignment");
	const secondIdle = await manager.completeAssignment(created.id, {
		state: "idle",
		summary: "Follow-up complete",
	});
	assert.equal(secondIdle.state, "idle");
	assert.equal(secondIdle.usage.assignments, 2);

	const failed = await manager.failAgent(created.id, new Error("bounded synthetic failure"));
	assert.equal(failed.state, "failed");
	assert.equal(failed.lastError, "bounded synthetic failure");
	const removed = await manager.removeAgent(created.id, "test complete");
	assert.equal(removed.state, "removed");
	assert.equal(removed.removalReason, "test complete");
	assert.ok(removed.removedAt);
	assert.equal(manager.getSummary().historical, 1);

	const nextGeneration = new SubAgentManager(deterministicOptions("generation-b"));
	assert.throws(
		() => nextGeneration.getAgent(created.id),
		(error) => error instanceof StaleAgentIdError && error.code === "stale_agent",
	);
});

test("core specifications, reports, timelines, snapshots, and usage are bounded", async () => {
	const manager = new SubAgentManager(deterministicOptions("bounds"));
	assert.throws(
		() => manager.createAgent({ ...agentSpec(), modelPolicy: "explicit" }),
		(error) => error instanceof SubAgentManagerError && error.code === "invalid_spec",
	);
	assert.throws(
		() => manager.createAgent({ ...agentSpec(), name: "x".repeat(SUB_AGENT_BOUNDS.nameChars + 1) }),
		(error) => error instanceof SubAgentManagerError && error.code === "invalid_spec",
	);

	const mutableSpec = {
		...agentSpec("bounded-worker"),
		tags: ["original"],
		workspace: { mode: "shared", writeScope: ["src/a.ts"] },
	};
	const created = manager.createAgent(mutableSpec);
	mutableSpec.tags[0] = "mutated";
	mutableSpec.workspace.writeScope[0] = "outside.ts";
	assert.deepEqual(manager.getAgent(created.id).spec.tags, ["original"]);
	assert.deepEqual(manager.getAgent(created.id).spec.workspace.writeScope, ["src/a.ts"]);
	const mutableRoute = {
		requestedPolicy: "auto",
		requestedComplexity: "moderate",
		selectedModel: { provider: "fixture-provider", id: "gpt-5.6-terra" },
		selectedTier: "moderate",
		fallbackUsed: false,
		fallbackPath: [
			{
				source: "tier",
				modelId: "gpt-5.6-terra",
				complexity: "moderate",
				outcome: "selected",
			},
		],
		reason: "Automatic moderate route selected the fixture model.",
	};
	await manager.recordModelRoute(created.id, mutableRoute);
	mutableRoute.selectedModel.provider = "mutated-provider";
	mutableRoute.fallbackPath[0].modelId = "mutated-model";
	assert.deepEqual(manager.getAgent(created.id).modelRoute.selectedModel, {
		provider: "fixture-provider",
		id: "gpt-5.6-terra",
	});
	await manager.startAssignment(created.id);
	assert.deepEqual(manager.getAgent(created.id).currentAssignment.modelRoute, manager.getAgent(created.id).modelRoute);
	await assert.rejects(
		manager.recordModelRoute(created.id, {
			...mutableRoute,
			selectedModel: { provider: "fixture-provider", id: "gpt-5.6-terra" },
			fallbackPath: [
				{
					source: "tier",
					modelId: "gpt-5.6-terra",
					complexity: "moderate",
					outcome: "selected",
				},
			],
		}),
		(error) => error instanceof SubAgentManagerError && error.code === "model_route_boundary",
	);

	for (let index = 0; index < SUB_AGENT_BOUNDS.eventTimeline + 12; index += 1) {
		await manager.recordReport(created.id, {
			state: "progress",
			summary: `bounded report ${index}`,
			files: ["src/a.ts", "src/a.ts"],
		});
	}
	await manager.addUsage(created.id, {
		input: 10,
		output: 4,
		cacheRead: 2,
		totalTokens: 16,
		cost: 0.25,
		turns: 1,
	});
	const snapshot = manager.getAgent(created.id);
	assert.equal(snapshot.events.length, SUB_AGENT_BOUNDS.eventTimeline);
	assert.ok(snapshot.omittedEventCount >= 12);
	assert.deepEqual(snapshot.latestReport.files, ["src/a.ts"]);
	assert.deepEqual(snapshot.usage.totals, {
		input: 10,
		output: 4,
		cacheRead: 2,
		cacheWrite: 0,
		totalTokens: 16,
		cost: 0.25,
	});
	assert.equal(snapshot.usage.turns, 1);

	snapshot.events.length = 0;
	snapshot.latestReport.files.push("mutated");
	assert.equal(manager.getAgent(created.id).events.length, SUB_AGENT_BOUNDS.eventTimeline);
	assert.deepEqual(manager.getAgent(created.id).latestReport.files, ["src/a.ts"]);
});

test("the manager owns a bounded parent-context snapshot for its exact session generation", async () => {
	const manager = new SubAgentManager(deterministicOptions("parent-context"));
	const source = [{ path: "/project/CLAUDE.md", content: "CURRENT_PARENT_CONTEXT" }];
	const trusted = manager.captureParentContext(source, true);
	source[0].content = "MUTATED_SOURCE";
	assert.equal(trusted.generation, manager.generation);
	assert.equal(trusted.trusted, true);
	assert.deepEqual(manager.getParentContextSnapshot().files, [
		{ path: "/project/CLAUDE.md", content: "CURRENT_PARENT_CONTEXT" },
	]);

	const untrusted = manager.captureParentContext(
		[{ path: "/project/CLAUDE.md", content: "MUST_NOT_BE_COPIED" }],
		false,
	);
	assert.equal(untrusted.trusted, false);
	assert.deepEqual(manager.getParentContextSnapshot().files, []);

	manager.captureParentContext(
		[{ path: "/project/CLAUDE.md", content: "REPLACEMENT_CONTEXT" }],
		true,
	);
	assert.throws(() => manager.captureParentContext([{ path: "", content: "invalid" }], true));
	assert.equal(
		manager.getParentContextSnapshot(),
		undefined,
		"a rejected current-turn capture cannot leave older trusted context active",
	);

	await manager.disposeAll("context lifecycle test");
	assert.equal(manager.getParentContextSnapshot(), undefined);
});

test("resource cleanup and background rejection handling are idempotent and race-safe", async () => {
	const manager = new SubAgentManager(deterministicOptions("cleanup"));
	const created = manager.createAgent(agentSpec("cleanup-worker"));
	await manager.startAssignment(created.id);

	const background = deferred();
	let unsubscribeCalls = 0;
	let abortCalls = 0;
	let waitCalls = 0;
	let disposeCalls = 0;
	let timerFired = false;
	const timer = setTimeout(() => {
		timerFired = true;
	}, 20);
	const controller = new AbortController();

	manager.trackSubscription(created.id, () => {
		unsubscribeCalls += 1;
	});
	manager.trackTimer(created.id, timer);
	manager.trackAbortController(created.id, controller);
	const handledBackground = manager.trackBackground(created.id, background.promise);
	manager.registerRuntimeCleanup(created.id, {
		abort() {
			abortCalls += 1;
			background.reject(new Error("expected abort rejection"));
		},
		async waitForIdle() {
			waitCalls += 1;
			await handledBackground;
		},
		dispose() {
			disposeCalls += 1;
		},
	});

	const [firstRemoval, secondRemoval] = await Promise.all([
		manager.removeAgent(created.id, "concurrent removal"),
		manager.removeAgent(created.id, "duplicate removal"),
	]);
	assert.equal(firstRemoval.state, "removed");
	assert.equal(secondRemoval.state, "removed");
	assert.equal(unsubscribeCalls, 1);
	assert.equal(abortCalls, 1);
	assert.equal(waitCalls, 1);
	assert.equal(disposeCalls, 1);
	assert.equal(controller.signal.aborted, true);
	await manager.removeAgent(created.id, "settled repeated removal");
	assert.equal(abortCalls, 1, "settled removed history must not retain and rerun cleanup hooks");
	assert.equal(waitCalls, 1);
	assert.equal(disposeCalls, 1);
	await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
	assert.equal(timerFired, false);

	const failing = manager.createAgent(agentSpec("background-failure"));
	await manager.startAssignment(failing.id);
	await manager.trackBackground(failing.id, Promise.reject(new Error("observed background failure")));
	const failed = manager.getAgent(failing.id);
	assert.equal(failed.state, "failed");
	assert.equal(failed.lastError, "observed background failure");

	const malformed = manager.createAgent(agentSpec("malformed-failure"));
	await manager.startAssignment(malformed.id);
	const sanitized = await manager.failAgent(malformed.id, new Error("unsafe\n\t\u001b[31m failure"));
	assert.equal(sanitized.lastError, "unsafe [31m failure");
	const hostile = manager.createAgent(agentSpec("hostile-failure"));
	await manager.startAssignment(hostile.id);
	const contained = await manager.failAgent(hostile.id, {
		toString() {
			throw new Error("hostile conversion");
		},
	});
	assert.equal(contained.lastError, "Unknown runtime error");

	await manager.disposeAll("test shutdown");
	await manager.disposeAll("duplicate shutdown");
	assert.equal(manager.closed, true);
	assert.equal(manager.getSummary().active, 0);
	assert.throws(() => manager.createAgent(agentSpec("late")), ManagerClosedError);
});

test("background failure and explicit removal share one bounded runtime quiescence", async () => {
	const manager = new SubAgentManager(deterministicOptions("shared-quiescence"));
	const child = manager.createAgent(agentSpec("shared-quiescence-worker"));
	await manager.startAssignment(child.id);
	const idleGate = deferred();
	let abortCalls = 0;
	let waitCalls = 0;
	let disposeCalls = 0;
	manager.registerRuntimeCleanup(child.id, {
		abort() {
			abortCalls += 1;
		},
		async waitForIdle() {
			waitCalls += 1;
			await idleGate.promise;
		},
		dispose() {
			disposeCalls += 1;
		},
	});
	const handled = manager.trackBackground(child.id, Promise.reject(new Error("shared failure")));
	for (let attempt = 0; attempt < 20 && waitCalls === 0; attempt += 1) await Promise.resolve();
	assert.equal(waitCalls, 1);
	const removal = manager.removeAgent(child.id, "concurrent failure removal");
	idleGate.resolve();
	const [, removed] = await Promise.all([handled, removal]);
	assert.equal(removed.state, "removed");
	assert.equal(abortCalls, 1);
	assert.equal(waitCalls, 1);
	assert.equal(disposeCalls, 1);
	await manager.disposeAll("shared quiescence complete");
});

test("explicit removal retries one expired background quiescence before disposal", async () => {
	const manager = new SubAgentManager({
		...deterministicOptions("retry-expired-quiescence"),
		cleanupTimeoutMs: 10,
	});
	const child = manager.createAgent(agentSpec("retry-expired-quiescence-worker"));
	await manager.startAssignment(child.id);
	const firstAbort = deferred();
	let abortCalls = 0;
	let waitCalls = 0;
	manager.registerRuntimeCleanup(child.id, {
		abort() {
			abortCalls += 1;
			return abortCalls === 1 ? firstAbort.promise : undefined;
		},
		waitForIdle() { waitCalls += 1; },
		dispose() {},
	});
	await manager.trackBackground(child.id, Promise.reject(new Error("start bounded failure cleanup")));
	assert.equal(manager.getAgent(child.id).state, "failed");
	assert.equal(abortCalls, 1);
	assert.equal(waitCalls, 0);
	firstAbort.resolve();
	await Promise.resolve();
	const removed = await manager.removeAgent(child.id, "retry after expired background cleanup");
	assert.equal(removed.state, "removed");
	assert.equal(abortCalls, 2);
	assert.equal(waitCalls, 1);
	await manager.disposeAll("retried quiescence complete");
});

test("hanging runtime abort and dispose hooks are bounded during removal", async () => {
	const manager = new SubAgentManager({
		...deterministicOptions("bounded-cleanup-hooks"),
		cleanupTimeoutMs: 10,
	});
	const child = manager.createAgent(agentSpec("bounded-cleanup-hooks-worker"));
	const abortGate = deferred();
	let waitCalls = 0;
	manager.registerRuntimeCleanup(child.id, {
		abort: () => abortGate.promise,
		waitForIdle() {
			waitCalls += 1;
		},
		dispose: () => new Promise(() => undefined),
	});
	const keepAlive = setTimeout(() => undefined, 1_000);
	try {
		const startedAt = Date.now();
		const removed = await manager.removeAgent(child.id, "bounded hanging cleanup");
		assert.ok(Date.now() - startedAt < 500);
		assert.equal(removed.state, "removed");
		assert.match(removed.lastError, /runtime quiescence timed out/);
		assert.match(removed.lastError, /dispose timed out/);
		abortGate.resolve();
		await Promise.resolve();
		await Promise.resolve();
		assert.equal(waitCalls, 0, "a late abort completion must not start waitForIdle after disposal");
		await assert.rejects(
			manager.disposeAll("bounded hanging cleanup complete"),
			(error) => error instanceof SubAgentManagerError && error.code === "cleanup_incomplete",
		);
	} finally {
		clearTimeout(keepAlive);
	}
});

test("operations admitted just before shutdown recheck the closed generation before mutation", async () => {
	const manager = new SubAgentManager(deterministicOptions("queued-before-close"));
	const child = manager.createAgent(agentSpec("queued-before-close-worker"));
	const pendingStart = manager.startAssignment(child.id);
	const disposal = manager.disposeAll("close before queued mutation");
	await assert.rejects(
		pendingStart,
		(error) => error instanceof ManagerClosedError,
	);
	await disposal;
	const removed = manager.getAgent(child.id);
	assert.equal(removed.state, "removed");
	assert.equal(removed.assignmentCount, 0);
});

test("manager shutdown bounds a hanging shared model-runtime disposal", async () => {
	const manager = new SubAgentManager({
		...deterministicOptions("hanging-model-disposal"),
		cleanupTimeoutMs: 10,
		modelRuntime: { dispose: () => new Promise(() => undefined) },
	});
	const startedAt = Date.now();
	await assert.rejects(
		manager.disposeAll("bounded model runtime shutdown"),
		(error) => error instanceof SubAgentManagerError && error.code === "cleanup_incomplete",
	);
	assert.ok(Date.now() - startedAt < 500);
});

test("manager shutdown disposes child sessions before the shared model runtime", async () => {
	const order = [];
	const modelRuntime = {
		async dispose() {
			order.push("model-runtime");
		},
	};
	const manager = new SubAgentManager({ ...deterministicOptions("runtime-owner"), modelRuntime });
	const child = manager.createAgent(agentSpec("runtime-owner-child"));
	manager.registerRuntimeCleanup(child.id, {
		dispose() {
			order.push("child-runtime");
		},
	});

	await manager.disposeAll("runtime ownership test");
	assert.deepEqual(order, ["child-runtime", "model-runtime"]);
	assert.equal(manager.modelRuntime, modelRuntime);
});

test("settled current-generation history is capped without imposing a live-agent count gate", async () => {
	const manager = new SubAgentManager(deterministicOptions("bounded-current-history"));
	const ids = [];
	for (let index = 0; index < SUB_AGENT_BOUNDS.currentHistoricalAgents + 3; index += 1) {
		const created = manager.createAgent(agentSpec(`historical-${index}`));
		ids.push(created.id);
		await manager.removeAgent(created.id, "bounded history fixture");
	}
	await Promise.resolve();
	const history = manager.listAgents({ includeRemoved: true });
	assert.equal(history.length, SUB_AGENT_BOUNDS.currentHistoricalAgents);
	assert.equal(manager.getSummary().historical, SUB_AGENT_BOUNDS.currentHistoricalAgents);
	assert.throws(
		() => manager.getAgent(ids[0]),
		(error) => error instanceof SubAgentManagerError && error.code === "unknown_agent",
	);
	assert.equal(manager.getAgent(ids.at(-1)).state, "removed");
	await manager.disposeAll("bounded history complete");
});

test("the manager has no numeric child-count gate and disposeAll quarantines cleanup failures", async () => {
	const manager = new SubAgentManager(deterministicOptions("unbounded-pool"));
	const agents = [];
	for (let index = 0; index < 256; index += 1) {
		agents.push(manager.createAgent(agentSpec(`dynamic-${index}`)));
	}
	assert.equal(new Set(agents.map((agent) => agent.id)).size, agents.length);
	assert.equal(manager.getSummary().active, agents.length);

	let disposed = 0;
	manager.registerRuntimeCleanup(agents[0].id, {
		dispose() {
			disposed += 1;
			throw new Error("synthetic cleanup problem");
		},
	});
	await assert.rejects(
		manager.disposeAll("phase boundary"),
		(error) => error instanceof SubAgentManagerError && error.code === "cleanup_incomplete",
	);
	assert.equal(disposed, 1);
	assert.equal(manager.getSummary().counts.removed, agents.length);
	assert.match(manager.getAgent(agents[0].id).lastError, /synthetic cleanup problem/);
});
