import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	importInstalledPackages,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const { SubAgentAssignmentRunner } = await importSubAgentsModule("assignment-runner.ts");
const { createSubAgentSession } = await importSubAgentsModule("agent-runtime.ts");
const {
	SubAgentManager,
	UnknownAgentIdError,
	createSessionGeneration,
} = await importSubAgentsModule("manager.ts");
const {
	SubAgentsReconfigureError,
	createSubAgentsReconfigureTool,
} = await importSubAgentsModule("tools/reconfigure.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");

function deferred() {
	let resolvePromise;
	let rejectPromise;
	const promise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function modelDefinition(id) {
	return {
		id,
		name: id,
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
	};
}

function route(provider, model, complexity = "moderate") {
	return {
		requestedPolicy: "auto",
		requestedComplexity: complexity,
		selectedModel: { provider, id: model },
		selectedTier: complexity,
		fallbackUsed: false,
		fallbackPath: [
			{ source: "tier", modelId: model, complexity, outcome: "selected" },
		],
		reason: `Selected ${provider}/${model}.`,
	};
}

function childSpec(objective) {
	return {
		name: "reconfigurable-child",
		role: "Exercise model reconfiguration while retaining isolated context",
		objective,
		thinkingLevel: "off",
		tools: [],
	};
}

function textFromUserContent(content) {
	if (typeof content === "string") return content;
	return content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
}

function fakeTheme() {
	return {
		fg(_color, text) {
			return text;
		},
		bold(text) {
			return text;
		},
	};
}

function renderContext(args, lastComponent) {
	return {
		args,
		lastComponent,
		state: {},
		invalidate() {},
		toolCallId: "reconfigure-render",
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: true,
		showImages: false,
		isError: false,
	};
}

async function createProductionFixture(label) {
	const root = await mkdtemp(join(tmpdir(), `pi-sub-agent-reconfigure-${label}-`));
	const { codingAgent, piAi } = await importInstalledPackages();
	const providerId = `reconfigure-${label}`;
	const modelIds = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"];
	const faux = piAi.fauxProvider({
		provider: providerId,
		models: modelIds.map(modelDefinition),
		tokensPerSecond: 100_000,
	});
	const runtime = await codingAgent.ModelRuntime.create({
		credentials: new piAi.InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	runtime.registerNativeProvider(faux.provider);
	const models = new Map(modelIds.map((id) => [id, runtime.getModel(providerId, id)]));
	assert.equal([...models.values()].every(Boolean), true);
	let nonce = 0;
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration(label),
		nonce: () => `${label}-${++nonce}`,
		modelRuntime: { async dispose() {} },
		cleanupTimeoutMs: 1_000,
	});
	const sessions = [];
	const runner = new SubAgentAssignmentRunner(manager, {
		async createSession(options) {
			const child = await createSubAgentSession(options);
			sessions.push(child);
			return child;
		},
	});
	const resolved = (id, complexity) => ({
		runtime,
		model: models.get(id),
		ref: { provider: providerId, id },
		route: route(providerId, id, complexity),
	});
	return { root, piAi, faux, runtime, manager, runner, sessions, providerId, resolved };
}

async function cleanupProductionFixture(fixture) {
	await fixture.manager.disposeAll("reconfiguration test complete");
	await rm(fixture.root, { recursive: true, force: true });
}

test("manager pending routes are bounded to one assignment and block premature reuse", async () => {
	const manager = new SubAgentManager({
		cwd: process.cwd(),
		generation: createSessionGeneration("pending-boundary"),
		modelRuntime: { async dispose() {} },
	});
	try {
		const child = manager.createAgent(childSpec("exercise the pending manager boundary"));
		await manager.recordModelRoute(child.id, route("fixture", "old-model", "simple"));
		await manager.recordEffectiveThinkingLevel(child.id, "low");
		const running = await manager.startAssignment(child.id);
		await manager.queueModelReconfiguration(child.id, {
			afterAssignmentId: running.currentAssignment.id,
			route: route("fixture", "new-model", "complex"),
			requestedThinkingLevel: "high",
		});
		await manager.completeAssignment(child.id, {
			state: "idle",
			summary: "Reached the pending model boundary",
		});
		const pending = manager.getAgent(child.id).pendingModelReconfiguration;
		assert.equal(pending.afterAssignmentId, running.currentAssignment.id);
		assert.equal(pending.route.selectedModel.id, "new-model");
		await assert.rejects(
			manager.startAssignment(child.id, "must not start before the pending route applies"),
			(error) => error.code === "model_reconfiguration_pending",
		);
		await manager.recordModelConfiguration(
			child.id,
			route("fixture", "new-model", "complex"),
			"high",
		);
		const next = await manager.startAssignment(child.id, "start after the replacement applies");
		assert.equal(next.currentAssignment.modelRoute.selectedModel.id, "new-model");
		assert.equal(next.pendingModelReconfiguration, undefined);
	} finally {
		await manager.disposeAll("pending boundary test complete");
	}
});

test("idle reconfiguration switches model/thinking immediately and retains child context", async () => {
	const fixture = await createProductionFixture("idle");
	let retainedFirstResult = false;
	try {
		fixture.faux.setResponses([
			fixture.piAi.fauxAssistantMessage("first model result"),
			(context) => {
				retainedFirstResult = context.messages.some(
					(message) =>
						message.role === "assistant" &&
						message.content.some(
							(part) => part.type === "text" && part.text === "first model result",
						),
				);
				return fixture.piAi.fauxAssistantMessage("second model result");
			},
		]);
		const initialModel = fixture.resolved("gpt-5.6-luna", "simple");
		const launch = await fixture.runner.createAndLaunch(
			childSpec("complete the first model assignment"),
			() => initialModel,
		);
		const firstIdle = await fixture.runner.waitForAssignment(launch.id, launch.assignmentId);
		assert.equal(firstIdle.state, "idle");
		assert.equal(firstIdle.effectiveThinkingLevel, "off");

		const replacement = fixture.resolved("gpt-5.6-terra", "moderate");
		const changed = await fixture.runner.reconfigure(
			launch.id,
			replacement,
			"high",
			"queue",
		);
		assert.equal(changed.action, "applied");
		assert.equal(changed.oldRoute.selectedModel.id, "gpt-5.6-luna");
		assert.equal(changed.newRoute.selectedModel.id, "gpt-5.6-terra");
		assert.equal(changed.snapshot.modelRoute.selectedModel.id, "gpt-5.6-terra");
		assert.equal(changed.snapshot.effectiveThinkingLevel, "high");
		assert.equal(changed.snapshot.pendingModelReconfiguration, undefined);
		assert.equal(fixture.sessions[0].modelRef.id, "gpt-5.6-terra");
		assert.equal(fixture.sessions[0].thinkingLevel, "high");

		const followUp = await fixture.runner.prompt(launch.id, "complete the retained-context follow-up");
		const secondIdle = await fixture.runner.waitForAssignment(launch.id, followUp.assignmentId);
		assert.equal(secondIdle.state, "idle");
		assert.equal(secondIdle.currentAssignment.modelRoute.selectedModel.id, "gpt-5.6-terra");
		assert.equal(retainedFirstResult, true);
		assert.deepEqual(
			fixture.sessions[0].session.messages
				.filter((message) => message.role === "user")
				.map((message) => textFromUserContent(message.content)),
			[
				"complete the first model assignment",
				"complete the retained-context follow-up",
			],
		);
	} finally {
		await cleanupProductionFixture(fixture);
	}
});

test("running queue applies the latest replacement at the exact safe assignment boundary", async () => {
	const fixture = await createProductionFixture("queue");
	const started = deferred();
	const release = deferred();
	try {
		fixture.faux.setResponses([
			async () => {
				started.resolve();
				await release.promise;
				return fixture.piAi.fauxAssistantMessage("running assignment complete");
			},
		]);
		const initial = fixture.resolved("gpt-5.6-luna", "simple");
		const launch = await fixture.runner.createAndLaunch(
			childSpec("wait at the running reconfiguration barrier"),
			() => initial,
		);
		await started.promise;
		const firstQueued = await fixture.runner.reconfigure(
			launch.id,
			fixture.resolved("gpt-5.6-terra", "moderate"),
			"medium",
			"queue",
		);
		const latestQueued = await fixture.runner.reconfigure(
			launch.id,
			fixture.resolved("gpt-5.6-sol", "complex"),
			"xhigh",
			"queue",
		);
		assert.equal(firstQueued.action, "queued");
		assert.equal(latestQueued.action, "queued");
		assert.equal(latestQueued.afterAssignmentId, launch.assignmentId);
		assert.equal(
			fixture.manager.getAgent(launch.id).pendingModelReconfiguration.route.selectedModel.id,
			"gpt-5.6-sol",
		);
		assert.equal(fixture.sessions[0].modelRef.id, "gpt-5.6-luna");

		release.resolve();
		const settled = await fixture.runner.waitForAssignment(launch.id, launch.assignmentId);
		assert.equal(settled.state, "idle");
		assert.equal(settled.currentAssignment.state, "idle");
		assert.equal(settled.currentAssignment.modelRoute.selectedModel.id, "gpt-5.6-luna");
		assert.equal(settled.modelRoute.selectedModel.id, "gpt-5.6-sol");
		assert.equal(settled.effectiveThinkingLevel, "high", "the SDK clamps xhigh to this model's supported maximum");
		assert.equal(settled.pendingModelReconfiguration, undefined);
		assert.equal(fixture.sessions[0].modelRef.id, "gpt-5.6-sol");
	} finally {
		release.resolve();
		await cleanupProductionFixture(fixture);
	}
});

test("abort-and-switch marks the interrupted assignment aborted before applying the replacement", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-reconfigure-abort-"));
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration("abort-switch"),
		modelRuntime: { async dispose() {} },
	});
	const promptDone = deferred();
	let eventListener;
	let streaming = false;
	let currentModel = { provider: "fixture", id: "old-model" };
	let thinkingLevel = "low";
	let disposed = false;
	const session = {
		get isIdle() {
			return !streaming;
		},
		get isStreaming() {
			return streaming;
		},
		pendingMessageCount: 0,
		clearQueue() {
			return { steering: [], followUp: [] };
		},
		prompt(_text, options) {
			streaming = true;
			eventListener({ type: "agent_start" });
			options.preflightResult(true);
			return promptDone.promise;
		},
		async steer() {},
		async followUp() {},
	};
	const runtime = {
		id: undefined,
		session,
		get thinkingLevel() {
			return thinkingLevel;
		},
		async reconfigureModel(resolved, requestedThinkingLevel) {
			currentModel = { ...resolved.ref };
			if (requestedThinkingLevel) thinkingLevel = requestedThinkingLevel;
			return { modelRef: currentModel, thinkingLevel };
		},
		async abort() {
			if (!streaming) return;
			const assistant = {
				role: "assistant",
				content: [],
				stopReason: "aborted",
				timestamp: Date.now(),
			};
			streaming = false;
			eventListener({ type: "message_end", message: assistant });
			eventListener({ type: "agent_end", messages: [assistant], willRetry: false });
			eventListener({ type: "agent_settled" });
			promptDone.resolve();
		},
		async waitForIdle() {
			await promptDone.promise;
		},
		dispose() {
			disposed = true;
		},
		async close() {
			this.dispose();
		},
	};
	const runner = new SubAgentAssignmentRunner(manager, {
		async createSession(options) {
			runtime.id = options.id;
			eventListener = options.onEvent;
			return runtime;
		},
	});
	try {
		const initialRoute = route("fixture", "old-model", "simple");
		const launch = await runner.createAndLaunch(
			childSpec("remain active until abort-and-switch"),
			() => ({ runtime: {}, model: {}, ref: currentModel, route: initialRoute }),
		);
		const replacementRoute = route("fixture", "new-model", "complex");
		const changed = await runner.reconfigure(
			launch.id,
			{ runtime: {}, model: {}, ref: { provider: "fixture", id: "new-model" }, route: replacementRoute },
			"high",
			"abort-and-switch",
		);
		assert.equal(changed.action, "aborted-and-applied");
		assert.equal(changed.snapshot.state, "idle");
		assert.equal(changed.snapshot.currentAssignment.state, "aborted");
		assert.equal(changed.snapshot.currentAssignment.result, undefined);
		assert.equal(changed.snapshot.latestResult, undefined);
		assert.equal(changed.snapshot.modelRoute.selectedModel.id, "new-model");
		assert.equal(changed.snapshot.effectiveThinkingLevel, "high");
		assert.deepEqual(currentModel, { provider: "fixture", id: "new-model" });
	} finally {
		await manager.disposeAll("abort-and-switch test complete");
		await rm(root, { recursive: true, force: true });
	}
	assert.equal(disposed, true);
});

function toolSnapshot(id, state) {
	return {
		id,
		state,
		currentAssignment: state === "running"
			? { id: `${id}:assignment:1`, sequence: 1 }
			: undefined,
	};
}

test("sub_agents_reconfigure reports independent applied/queued outcomes, duplicates, and bounded output", async () => {
	const appliedId = "sa1-reconfigure-tool-1-applied";
	const queuedId = "sa1-reconfigure-tool-2-queued";
	const snapshots = new Map([
		[appliedId, toolSnapshot(appliedId, "idle")],
		[queuedId, toolSnapshot(queuedId, "running")],
	]);
	const calls = [];
	const runtime = {
		manager: {
			generation: "sag1-reconfigure-tool",
			getAgent(id) {
				const value = snapshots.get(id);
				if (!value) throw new UnknownAgentIdError(id);
				return value;
			},
		},
		router: {
			async resolve(request) {
				if (request.spec.model?.id === "private-failure") {
					throw new Error("PRIVATE_MODEL_ROUTING_FAILURE");
				}
				const id = request.spec.model?.id ?? `gpt-5.6-${request.spec.complexity === "complex" ? "sol" : "terra"}`;
				return {
					runtime: {},
					model: {},
					ref: { provider: "fixture-provider", id },
					route: route("fixture-provider", id, request.spec.complexity ?? "moderate"),
				};
			},
		},
		runner: {
			async reconfigure(id, resolved, thinking, behavior) {
				calls.push({ id, resolved, thinking, behavior });
				const before = snapshots.get(id);
				const action = before.state === "running" ? "queued" : "applied";
				const after = {
					...before,
					modelRoute: action === "applied" ? resolved.route : undefined,
				};
				snapshots.set(id, after);
				return {
					id,
					action,
					oldRoute: route("fixture-provider", "old-model", "simple"),
					newRoute: resolved.route,
					oldThinkingLevel: "low",
					requestedThinkingLevel: thinking,
					effectiveThinkingLevel: action === "applied" ? thinking : undefined,
					afterAssignmentSequence: before.currentAssignment?.sequence,
					snapshot: after,
				};
			},
		},
	};
	const tool = createSubAgentsReconfigureTool(() => runtime);
	const input = {
		changes: [
			{ id: appliedId, modelPolicy: "auto", complexity: "moderate", thinkingLevel: "high" },
			{ id: queuedId, modelPolicy: "auto", complexity: "complex", runningBehavior: "queue" },
		],
	};
	const result = await tool.execute(
		"reconfigure-tool",
		input,
		undefined,
		undefined,
		{ modelRegistry: {}, model: { provider: "fixture-provider", id: "parent" } },
	);
	assert.equal(result.details.succeeded, 2);
	assert.equal(result.details.applied, 1);
	assert.equal(result.details.queued, 1);
	assert.equal(result.details.failed, 0);
	assert.deepEqual(result.details.outcomes.map((outcome) => outcome.action), ["applied", "queued"]);
	assert.equal(calls.length, 2);
	assert.match(result.content[0].text, /1 applied · 1 queued/);
	assert.equal(tool.executionMode, "parallel");
	assert.ok(tool.promptGuidelines.some((line) => /abort-and-switch/.test(line)));
	const callComponent = tool.renderCall(input, fakeTheme(), renderContext(input));
	assert.match(callComponent.render(200).join("\n"), /2 targets/);
	const resultComponent = tool.renderResult(
		result,
		{ expanded: true, isPartial: false },
		fakeTheme(),
		renderContext(input),
	);
	assert.match(resultComponent.render(300).join("\n"), /gpt-5.6-terra/);

	calls.length = 0;
	const duplicate = await tool.execute(
		"reconfigure-duplicate",
		{
			changes: [
				{ id: appliedId, modelPolicy: "inherit" },
				{ id: appliedId, modelPolicy: "inherit" },
			],
		},
		undefined,
		undefined,
		{ modelRegistry: {}, model: { provider: "fixture-provider", id: "parent" } },
	);
	assert.equal(duplicate.details.failed, 2);
	assert.equal(duplicate.details.outcomes.every((outcome) => outcome.code === "duplicate_target"), true);
	assert.equal(calls.length, 0);

	const maximumIds = Array.from({ length: SUB_AGENT_BOUNDS.controlTargets }, (_, index) => {
		const prefix = `sa1-reconfigure-bounds-${index.toString().padStart(3, "0")}-`;
		return prefix + "x".repeat(SUB_AGENT_BOUNDS.agentIdChars - prefix.length);
	});
	for (const id of maximumIds) snapshots.set(id, toolSnapshot(id, "idle"));
	const bounded = await tool.execute(
		"reconfigure-bounds",
		{
			changes: maximumIds.map((id) => ({
				id,
				modelPolicy: "explicit",
				model: { provider: "p".repeat(128), id: "m".repeat(256) },
			})),
		},
		undefined,
		undefined,
		{ modelRegistry: {}, model: undefined },
	);
	assert.equal(bounded.details.outcomes.length, SUB_AGENT_BOUNDS.controlTargets);
	assert.ok(bounded.details.truncatedAgentDetails > 0);
	assert.ok(Buffer.byteLength(bounded.content[0].text, "utf8") <= 48 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(bounded.details), "utf8") <= 48 * 1024);
});

test("reconfigure fails closed when inactive/cancelled and redacts route or runner failures", async () => {
	const id = "sa1-reconfigure-errors-1-target";
	await assert.rejects(
		createSubAgentsReconfigureTool(() => undefined).execute(
			"inactive",
			{ changes: [{ id, modelPolicy: "inherit" }] },
			undefined,
			undefined,
			{},
		),
		(error) => error instanceof SubAgentsReconfigureError && error.code === "manager_inactive",
	);
	const controller = new AbortController();
	controller.abort();
	const inertRuntime = {
		manager: { generation: "sag1-inert", getAgent() { return toolSnapshot(id, "idle"); } },
		router: { async resolve() { throw new Error("unused"); } },
		runner: { async reconfigure() { throw new Error("unused"); } },
	};
	await assert.rejects(
		createSubAgentsReconfigureTool(() => inertRuntime).execute(
			"cancelled",
			{ changes: [{ id, modelPolicy: "inherit" }] },
			controller.signal,
			undefined,
			{},
		),
		(error) => error instanceof SubAgentsReconfigureError && error.code === "cancelled",
	);

	const routeFailureRuntime = {
		manager: { generation: "sag1-errors", getAgent() { return toolSnapshot(id, "idle"); } },
		router: { async resolve() { throw new Error("PRIVATE_ROUTE_FAILURE"); } },
		runner: { async reconfigure() { throw new Error("unused"); } },
	};
	const routeFailure = await createSubAgentsReconfigureTool(() => routeFailureRuntime).execute(
		"route-failure",
		{ changes: [{ id, modelPolicy: "inherit" }] },
		undefined,
		undefined,
		{ modelRegistry: {}, model: undefined },
	);
	assert.equal(routeFailure.details.outcomes[0].code, "model_resolution_failed");
	assert.doesNotMatch(JSON.stringify(routeFailure), /PRIVATE_ROUTE_FAILURE/);

	const runnerFailureRuntime = {
		manager: { generation: "sag1-errors", getAgent() { return toolSnapshot(id, "idle"); } },
		router: {
			async resolve() {
				return {
					runtime: {},
					model: {},
					ref: { provider: "fixture", id: "replacement" },
					route: route("fixture", "replacement"),
				};
			},
		},
		runner: { async reconfigure() { throw new Error("PRIVATE_RUNNER_FAILURE"); } },
	};
	const runnerFailure = await createSubAgentsReconfigureTool(() => runnerFailureRuntime).execute(
		"runner-failure",
		{ changes: [{ id, modelPolicy: "inherit" }] },
		undefined,
		undefined,
		{ modelRegistry: {}, model: undefined },
	);
	assert.equal(runnerFailure.details.outcomes[0].code, "reconfigure_failed");
	assert.doesNotMatch(JSON.stringify(runnerFailure), /PRIVATE_RUNNER_FAILURE/);
});
