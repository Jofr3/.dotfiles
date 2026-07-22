import assert from "node:assert/strict";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const { SubAgentAssignmentRunner } = await importSubAgentsModule("assignment-runner.ts");
const {
	SubAgentManager,
	createSessionGeneration,
} = await importSubAgentsModule("manager.ts");
const { createSubAgentsReconfigureTool } = await importSubAgentsModule("tools/reconfigure.ts");
const { createSubAgentsRemoveTool } = await importSubAgentsModule("tools/remove.ts");
const { createSubAgentsSendTool } = await importSubAgentsModule("tools/send.ts");
const { createSubAgentsSpawnTool } = await importSubAgentsModule("tools/spawn.ts");
const { createSubAgentsStatusTool } = await importSubAgentsModule("tools/status.ts");
const {
	SubAgentsWaitError,
	createSubAgentsWaitTool,
} = await importSubAgentsModule("tools/wait.ts");

function deferred() {
	let resolvePromise;
	let rejectPromise;
	const promise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function childSpec(name, objective = `Complete the ${name} control-race fixture.`) {
	return {
		name,
		role: `Exercise deterministic cross-control races for ${name}`,
		objective,
		modelPolicy: "auto",
		complexity: "moderate",
		thinkingLevel: "off",
		tools: [],
	};
}

function route(complexity = "moderate") {
	const model = complexity === "simple"
		? "gpt-5.6-luna"
		: complexity === "complex"
			? "gpt-5.6-sol"
			: "gpt-5.6-terra";
	return {
		requestedPolicy: "auto",
		requestedComplexity: complexity,
		selectedModel: { provider: "control-race-provider", id: model },
		selectedTier: complexity,
		fallbackUsed: false,
		fallbackPath: [
			{ source: "tier", modelId: model, complexity, outcome: "selected" },
		],
		reason: `Selected deterministic ${complexity} control-race route.`,
	};
}

function resolvedModel(complexity = "moderate") {
	const selectedRoute = route(complexity);
	return {
		runtime: {},
		model: {},
		ref: { ...selectedRoute.selectedModel },
		route: selectedRoute,
	};
}

function assistantMessage(text, stopReason = "stop") {
	return {
		role: "assistant",
		content: text ? [{ type: "text", text }] : [],
		stopReason,
		timestamp: Date.now(),
	};
}

function createControlledRuntime(options) {
	let streaming = false;
	let disposed = false;
	let thinkingLevel = options.spec.thinkingLevel ?? "off";
	let modelRef = { ...options.resolvedModel.ref };
	let currentPrompt;
	let nextDeliveryBarrier;
	let nextAbortBarrier;
	let abortInFlight;
	let pendingMessageCount = 0;
	const promptTexts = [];
	const deliveryCalls = [];

	const settle = (text, stopReason = "stop") => {
		if (!streaming || !currentPrompt) return;
		const prompt = currentPrompt;
		const message = assistantMessage(text, stopReason);
		streaming = false;
		currentPrompt = undefined;
		pendingMessageCount = 0;
		options.onEvent({ type: "message_end", message });
		options.onEvent({ type: "agent_end", messages: [message], willRetry: false });
		options.onEvent({ type: "queue_update", steering: [], followUp: [] });
		options.onEvent({ type: "agent_settled" });
		prompt.resolve();
	};

	const deliver = async (message, delivery) => {
		deliveryCalls.push({ message, delivery });
		pendingMessageCount += 1;
		options.onEvent({
			type: "queue_update",
			steering: delivery === "steer" ? [message] : [],
			followUp: delivery === "followUp" ? [message] : [],
		});
		const barrier = nextDeliveryBarrier;
		nextDeliveryBarrier = undefined;
		if (barrier) {
			barrier.entered.resolve();
			await barrier.release.promise;
		}
	};

	const session = {
		get isIdle() {
			return !streaming;
		},
		get isStreaming() {
			return streaming;
		},
		get pendingMessageCount() {
			return pendingMessageCount;
		},
		clearQueue() {
			const followUp = Array.from({ length: pendingMessageCount }, () => ({}));
			pendingMessageCount = 0;
			options.onEvent({ type: "queue_update", steering: [], followUp: [] });
			return { steering: [], followUp };
		},
		prompt(text, promptOptions) {
			if (streaming) throw new Error("controlled session is already streaming");
			promptTexts.push(text);
			streaming = true;
			currentPrompt = deferred();
			options.onEvent({ type: "agent_start" });
			promptOptions.preflightResult(true);
			return currentPrompt.promise;
		},
		steer(message) {
			return deliver(message, "steer");
		},
		followUp(message) {
			return deliver(message, "followUp");
		},
	};

	const runtime = {
		id: options.id,
		generation: options.generation,
		session,
		promptTexts,
		deliveryCalls,
		get modelRef() {
			return { ...modelRef };
		},
		get thinkingLevel() {
			return thinkingLevel;
		},
		get disposed() {
			return disposed;
		},
		setNextDeliveryBarrier(entered, release) {
			nextDeliveryBarrier = { entered, release };
		},
		setNextAbortBarrier(entered, release) {
			nextAbortBarrier = { entered, release };
		},
		settle,
		async reconfigureModel(next, requestedThinkingLevel) {
			modelRef = { ...next.ref };
			if (requestedThinkingLevel) thinkingLevel = requestedThinkingLevel;
			return { modelRef: { ...modelRef }, thinkingLevel };
		},
		abort() {
			if (abortInFlight) return abortInFlight;
			if (!streaming) return Promise.resolve();
			const barrier = nextAbortBarrier;
			nextAbortBarrier = undefined;
			abortInFlight = (async () => {
				if (barrier) {
					barrier.entered.resolve();
					await barrier.release.promise;
				}
				if (streaming) settle("", "aborted");
			})().finally(() => {
				abortInFlight = undefined;
			});
			return abortInFlight;
		},
		async waitForIdle() {
			await currentPrompt?.promise;
		},
		dispose() {
			disposed = true;
		},
		async close() {
			await this.abort();
			await this.waitForIdle();
			this.dispose();
		},
	};
	return runtime;
}

function createFixture(label, options = {}) {
	let nonce = 0;
	const manager = new SubAgentManager({
		cwd: process.cwd(),
		generation: createSessionGeneration(label),
		nonce: () => `${label}-${++nonce}`,
		modelRuntime: { async dispose() {} },
		cleanupTimeoutMs: 500,
	});
	const runtimes = new Map();
	const createRuntime = options.createSession ?? (async (sessionOptions) => {
		const runtime = createControlledRuntime(sessionOptions);
		runtimes.set(sessionOptions.id, runtime);
		return runtime;
	});
	const runner = new SubAgentAssignmentRunner(manager, { createSession: createRuntime });
	const router = options.router ?? {
		async resolve(request) {
			return resolvedModel(request.spec.complexity ?? "moderate");
		},
	};
	const runtime = { manager, runner, router, pollIntervalMs: 2 };
	return {
		manager,
		runner,
		router,
		runtime,
		runtimes,
		spawn: createSubAgentsSpawnTool(() => runtime),
		status: createSubAgentsStatusTool(() => runtime),
		send: createSubAgentsSendTool(() => runtime),
		reconfigure: createSubAgentsReconfigureTool(() => runtime),
		wait: createSubAgentsWaitTool(() => runtime),
		remove: createSubAgentsRemoveTool(() => runtime),
	};
}

async function waitFor(predicate, message) {
	const deadline = Date.now() + 1_000;
	while (Date.now() < deadline) {
		const value = predicate();
		if (value) return value;
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	throw new Error(message);
}

const toolContext = { modelRegistry: {}, model: undefined };

test("spawn is immediately observable and removal during initialization wins without leaking a runtime", async () => {
	const entered = deferred();
	const release = deferred();
	let createdRuntime;
	let fixture;
	fixture = createFixture("control-spawn-remove", {
		async createSession(options) {
			entered.resolve();
			await release.promise;
			createdRuntime = createControlledRuntime(options);
			fixture.runtimes.set(options.id, createdRuntime);
			return createdRuntime;
		},
	});
	try {
		const spawning = fixture.spawn.execute(
			"race-spawn",
			{ agents: [childSpec("initializing-child")] },
			undefined,
			undefined,
			toolContext,
		);
		await entered.promise;
		const [creating] = fixture.manager.listAgents({ includeRemoved: false });
		assert.ok(creating);
		assert.equal(creating.state, "creating");

		const status = await fixture.status.execute(
			"race-status",
			{ ids: [creating.id] },
			undefined,
			undefined,
			{},
		);
		assert.equal(status.details.outcomes[0].state, "creating");

		const removed = await fixture.remove.execute(
			"race-remove",
			{ scope: "selected", ids: [creating.id], mode: "abort" },
			undefined,
			undefined,
			{},
		);
		assert.equal(removed.details.newlyRemoved, 1);
		assert.equal(fixture.manager.getAgent(creating.id).state, "removed");

		release.resolve();
		const spawnResult = await spawning;
		assert.equal(spawnResult.details.started, 0);
		assert.equal(spawnResult.details.failed, 1);
		assert.equal(spawnResult.details.outcomes[0].state, "removed");
		assert.equal(createdRuntime.disposed, true);
		assert.equal(fixture.runner.liveRuntimeCount, 0);
	} finally {
		release.resolve();
		await fixture.manager.disposeAll("spawn/remove race complete");
	}
});

test("two concurrent sends linearize while settlement redirects only the later message to a new assignment", async () => {
	const fixture = createFixture("control-send-settle");
	try {
		const launch = await fixture.runner.createAndLaunch(
			childSpec("send-child", "complete the initial send assignment"),
			() => resolvedModel("moderate"),
		);
		const runtime = fixture.runtimes.get(launch.id);
		const deliveryEntered = deferred();
		const releaseDelivery = deferred();
		runtime.setNextDeliveryBarrier(deliveryEntered, releaseDelivery);

		const first = fixture.send.execute(
			"race-send-first",
			{ messages: [{ id: launch.id, message: "first concurrent follow-up" }] },
			undefined,
			undefined,
			{},
		);
		await deliveryEntered.promise;
		const second = fixture.send.execute(
			"race-send-second",
			{ messages: [{ id: launch.id, message: "second concurrent boundary message" }] },
			undefined,
			undefined,
			{},
		);

		assert.deepEqual(runtime.deliveryCalls, [
			{ message: "first concurrent follow-up", delivery: "followUp" },
		]);
		runtime.settle("initial assignment settled during concurrent delivery");
		await fixture.runner.waitForAssignment(launch.id, launch.assignmentId);
		releaseDelivery.resolve();
		const [firstResult, secondResult] = await Promise.all([first, second]);

		assert.equal(firstResult.details.outcomes[0].dispatch, "followUp");
		assert.equal(secondResult.details.outcomes[0].dispatch, "prompt");
		assert.deepEqual(runtime.deliveryCalls, [
			{ message: "first concurrent follow-up", delivery: "followUp" },
		]);
		assert.deepEqual(runtime.promptTexts, [
			"complete the initial send assignment",
			"second concurrent boundary message",
		]);
		assert.equal(fixture.manager.getAgent(launch.id).assignmentCount, 2);
	} finally {
		await fixture.manager.disposeAll("concurrent send race complete");
	}
});

test("idle reconfiguration retains one child context and does not rebuild an unrelated child", async () => {
	const fixture = createFixture("control-unrelated");
	try {
		const first = await fixture.runner.createAndLaunch(
			childSpec("reconfigured-child", "first retained-context assignment"),
			() => resolvedModel("simple"),
		);
		const second = await fixture.runner.createAndLaunch(
			childSpec("unrelated-child", "unrelated stable assignment"),
			() => resolvedModel("simple"),
		);
		const firstRuntime = fixture.runtimes.get(first.id);
		const secondRuntime = fixture.runtimes.get(second.id);
		firstRuntime.settle("first child initial result");
		secondRuntime.settle("unrelated child result");
		await Promise.all([
			fixture.runner.waitForAssignment(first.id, first.assignmentId),
			fixture.runner.waitForAssignment(second.id, second.assignmentId),
		]);

		const changed = await fixture.reconfigure.execute(
			"race-reconfigure-idle",
			{ changes: [{ id: first.id, modelPolicy: "auto", complexity: "complex", thinkingLevel: "high" }] },
			undefined,
			undefined,
			toolContext,
		);
		assert.equal(changed.details.applied, 1);
		assert.equal(firstRuntime.modelRef.id, "gpt-5.6-sol");

		const sent = await fixture.send.execute(
			"race-send-retained",
			{ messages: [{ id: first.id, message: "second retained-context assignment" }] },
			undefined,
			undefined,
			{},
		);
		assert.equal(sent.details.outcomes[0].dispatch, "prompt");
		assert.deepEqual(firstRuntime.promptTexts, [
			"first retained-context assignment",
			"second retained-context assignment",
		]);
		assert.strictEqual(fixture.runtimes.get(first.id), firstRuntime);
		assert.strictEqual(fixture.runtimes.get(second.id), secondRuntime);
		assert.equal(secondRuntime.modelRef.id, "gpt-5.6-luna");
		assert.equal(fixture.manager.getAgent(second.id).assignmentCount, 1);
		assert.equal(fixture.manager.getAgent(second.id).state, "idle");
		assert.equal(fixture.runner.liveRuntimeCount, 2);
	} finally {
		await fixture.manager.disposeAll("unrelated child stability complete");
	}
});

test("removal wins both pre-dispatch reconfiguration and an in-flight abort-and-switch race", async () => {
	const routeEntered = deferred();
	const releaseRoute = deferred();
	let holdRoute = true;
	const fixture = createFixture("control-reconfigure-remove", {
		router: {
			async resolve(request) {
				if (holdRoute) {
					routeEntered.resolve();
					await releaseRoute.promise;
				}
				return resolvedModel(request.spec.complexity ?? "moderate");
			},
		},
	});
	try {
		const queuedRace = await fixture.runner.createAndLaunch(
			childSpec("route-race-child"),
			() => resolvedModel("simple"),
		);
		const delayedReconfigure = fixture.reconfigure.execute(
			"race-reconfigure-delayed",
			{ changes: [{ id: queuedRace.id, modelPolicy: "auto", complexity: "complex" }] },
			undefined,
			undefined,
			toolContext,
		);
		await routeEntered.promise;
		const routeRaceRemoval = await fixture.remove.execute(
			"race-remove-before-route",
			{ scope: "selected", ids: [queuedRace.id], mode: "abort" },
			undefined,
			undefined,
			{},
		);
		assert.equal(routeRaceRemoval.details.newlyRemoved, 1);
		releaseRoute.resolve();
		const routeRaceResult = await delayedReconfigure;
		assert.equal(routeRaceResult.details.failed, 1);
		assert.equal(routeRaceResult.details.outcomes[0].state, "removed");
		assert.equal(routeRaceResult.details.outcomes[0].code, "runtime_missing");

		holdRoute = false;
		const abortRace = await fixture.runner.createAndLaunch(
			childSpec("abort-switch-race-child"),
			() => resolvedModel("simple"),
		);
		const abortRuntime = fixture.runtimes.get(abortRace.id);
		const abortEntered = deferred();
		const releaseAbort = deferred();
		abortRuntime.setNextAbortBarrier(abortEntered, releaseAbort);
		const abortingReconfigure = fixture.reconfigure.execute(
			"race-reconfigure-abort",
			{
				changes: [{
					id: abortRace.id,
					modelPolicy: "auto",
					complexity: "complex",
					runningBehavior: "abort-and-switch",
				}],
			},
			undefined,
			undefined,
			toolContext,
		);
		await abortEntered.promise;
		const removing = fixture.remove.execute(
			"race-remove-during-abort",
			{ scope: "selected", ids: [abortRace.id], mode: "abort" },
			undefined,
			undefined,
			{},
		);
		await waitFor(
			() => fixture.manager.getAgent(abortRace.id).state === "stopping",
			"remove did not enter the stopping boundary",
		);
		releaseAbort.resolve();
		const [abortRaceResult, abortRaceRemoval] = await Promise.all([
			abortingReconfigure,
			removing,
		]);
		assert.equal(abortRaceResult.details.failed, 1);
		assert.equal(abortRaceResult.details.outcomes[0].code, "reconfiguration_failed");
		assert.equal(abortRaceRemoval.details.newlyRemoved, 1);
		assert.equal(fixture.manager.getAgent(abortRace.id).state, "removed");
		assert.equal(abortRuntime.modelRef.id, "gpt-5.6-luna");
		assert.equal(abortRuntime.disposed, true);
		assert.equal(fixture.runner.liveRuntimeCount, 0);
	} finally {
		releaseRoute.resolve();
		await fixture.manager.disposeAll("reconfigure/remove races complete");
	}
});

test("wait and remove converge on removed state while concurrent usage drains report each token once", async () => {
	const fixture = createFixture("control-wait-remove");
	try {
		const launch = await fixture.runner.createAndLaunch(
			childSpec("wait-remove-child"),
			() => resolvedModel("moderate"),
		);
		await fixture.manager.addUsage(launch.id, {
			input: 11,
			output: 7,
			cacheRead: 3,
			totalTokens: 21,
			cost: 0.25,
			turns: 1,
		});
		const waitStarted = deferred();
		const waiting = fixture.wait.execute(
			"race-wait-remove",
			{ ids: [launch.id], states: ["removed"], timeoutSeconds: 1 },
			undefined,
			() => waitStarted.resolve(),
			{},
		);
		await waitStarted.promise;
		const removing = fixture.remove.execute(
			"race-remove-waited",
			{ scope: "selected", ids: [launch.id], mode: "abort" },
			undefined,
			undefined,
			{},
		);
		const [waitResult, removeResult] = await Promise.all([waiting, removing]);
		assert.equal(waitResult.details.completion, "satisfied");
		assert.equal(waitResult.details.outcomes[0].state, "removed");
		assert.equal(removeResult.details.newlyRemoved, 1);
		assert.equal(waitResult.usage.input + removeResult.usage.input, 11);
		assert.equal(waitResult.usage.output + removeResult.usage.output, 7);
		assert.equal(waitResult.usage.totalTokens + removeResult.usage.totalTokens, 21);
		assert.equal(waitResult.usage.cost.total + removeResult.usage.cost.total, 0.25);
		assert.deepEqual(
			fixture.manager.getAgent(launch.id).usage.reported,
			fixture.manager.getAgent(launch.id).usage.totals,
		);
	} finally {
		await fixture.manager.disposeAll("wait/remove race complete");
	}
});

test("parent cancellation during wait stops before usage drain and leaves the child reusable", async () => {
	const fixture = createFixture("control-wait-abort");
	try {
		const launch = await fixture.runner.createAndLaunch(
			childSpec("parent-abort-child"),
			() => resolvedModel("moderate"),
		);
		await fixture.manager.addUsage(launch.id, {
			input: 5,
			output: 2,
			totalTokens: 7,
			cost: 0.1,
			turns: 1,
		});
		const controller = new AbortController();
		await assert.rejects(
			fixture.wait.execute(
				"race-parent-abort",
				{ ids: [launch.id], states: ["idle"], timeoutSeconds: 1 },
				controller.signal,
				() => controller.abort(),
				{},
			),
			(error) => error instanceof SubAgentsWaitError && error.code === "cancelled",
		);
		const snapshot = fixture.manager.getAgent(launch.id);
		assert.equal(snapshot.state, "running");
		assert.equal(snapshot.usage.reported.totalTokens, 0);
		assert.equal(fixture.runner.hasLiveRuntime(launch.id), true);
	} finally {
		await fixture.manager.disposeAll("parent wait cancellation complete");
	}
});
