import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	importInstalledPackages,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const {
	SubAgentAssignmentRunner,
} = await importSubAgentsModule("assignment-runner.ts");
const { createSubAgentSession } = await importSubAgentsModule("agent-runtime.ts");
const {
	SubAgentManager,
	UnknownAgentIdError,
	createSessionGeneration,
} = await importSubAgentsModule("manager.ts");
const {
	SubAgentsWaitError,
	createSubAgentsWaitTool,
} = await importSubAgentsModule("tools/wait.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");

function counters(overrides = {}) {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: 0,
		...overrides,
	};
}

function snapshot(id, state, overrides = {}) {
	const sequence = overrides.assignmentCount ?? 1;
	return {
		id,
		generation: "sag1-wait-fixture",
		spec: {
			name: overrides.name ?? id.split("-").at(-1),
			role: "Exercise the bounded wait fixture",
			objective: "Reach the requested wait state.",
			modelPolicy: "auto",
			complexity: "moderate",
		},
		state,
		createdAt: 1,
		updatedAt: overrides.updatedAt ?? 2,
		assignmentCount: sequence,
		currentAssignment: sequence
			? {
					id: `${id}:assignment:${sequence}`,
					sequence,
					objective: "Reach the requested wait state.",
					state: state === "running" ? "running" : state === "removed" ? "aborted" : state,
					startedAt: 1,
					endedAt: state === "running" ? undefined : 2,
					usage: { totals: counters(), turns: 0 },
				}
			: undefined,
		latestReport: overrides.latestReport,
		latestResult: overrides.latestResult,
		events: [],
		omittedEventCount: 0,
		runtime: {
			phase: state === "running" ? "streaming" : "settled",
			activeToolCount: state === "running" ? 1 : 0,
			activeTools: [],
			pendingMessageCount: 0,
		},
		usage: {
			totals: counters(),
			reported: counters(),
			turns: 0,
			assignments: sequence,
		},
		leases: [],
		...overrides,
	};
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
		toolCallId: "wait-render",
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: true,
		showImages: false,
		isError: false,
	};
}

function waitRuntime(initial, usageById = new Map()) {
	const snapshots = new Map(initial.map((value) => [value.id, value]));
	const drainCalls = [];
	return {
		snapshots,
		drainCalls,
		runtime: {
			pollIntervalMs: 2,
			manager: {
				generation: "sag1-wait-fixture",
				listAgents() {
					return [...snapshots.values()].filter((value) => value.state !== "removed");
				},
				getAgent(id) {
					const value = snapshots.get(id);
					if (!value) throw new UnknownAgentIdError(id);
					return value;
				},
				async drainUsage(id) {
					drainCalls.push(id);
					return usageById.get(id) ?? counters();
				},
			},
		},
	};
}

test("sub_agents_wait supports any/all barriers, streams changed state, drains usage, and keeps children", async () => {
	const firstId = "sa1-wait-fixture-1-first";
	const secondId = "sa1-wait-fixture-2-second";
	const first = snapshot(firstId, "running", { name: "first-child" });
	const second = snapshot(secondId, "running", { name: "second-child" });
	const anyFixture = waitRuntime(
		[first, second],
		new Map([
			[firstId, counters({ input: 7, output: 3, totalTokens: 10, cost: 0.1 })],
			[secondId, counters({ input: 5, output: 2, totalTokens: 7, cost: 0.05 })],
		]),
	);
	const anyUpdates = [];
	setTimeout(() => {
		anyFixture.snapshots.set(firstId, snapshot(firstId, "idle", {
			name: "first-child",
			updatedAt: 3,
			latestResult: {
				summary: "First child completed the barrier fixture",
				details: "Bounded final details",
				files: ["src/first.ts"],
				completedAt: 3,
			},
		}));
	}, 8);
	const tool = createSubAgentsWaitTool(() => anyFixture.runtime);
	const anyResult = await tool.execute(
		"wait-any",
		{ ids: [firstId, secondId], condition: "any", timeoutSeconds: 1 },
		undefined,
		(partial) => anyUpdates.push(partial),
		{},
	);
	assert.equal(anyResult.details.completion, "satisfied");
	assert.equal(anyResult.details.matched, 1);
	assert.deepEqual(anyResult.details.outcomes.map((outcome) => outcome.state), ["idle", "running"]);
	assert.equal(anyResult.details.outcomes[0].output.summary, "First child completed the barrier fixture");
	assert.deepEqual(anyFixture.drainCalls.sort(), [firstId, secondId].sort());
	assert.equal(anyResult.usage.input, 12);
	assert.equal(anyResult.usage.output, 5);
	assert.equal(anyResult.usage.totalTokens, 17);
	assert.ok(Math.abs(anyResult.usage.cost.total - 0.15) < 1e-12);
	assert.ok(anyUpdates.length >= 2, "initial and changed state should stream partial updates");
	assert.equal(anyUpdates.every((update) => update.details.phase === "waiting"), true);
	assert.equal(anyFixture.snapshots.size, 2, "waiting must not remove selected children");

	const allFixture = waitRuntime([
		snapshot(firstId, "idle", { name: "first-child" }),
		snapshot(secondId, "running", { name: "second-child" }),
	]);
	setTimeout(() => {
		allFixture.snapshots.set(secondId, snapshot(secondId, "blocked", {
			name: "second-child",
			latestReport: {
				state: "blocked",
				summary: "Second child needs orchestration",
				files: [],
				needs: "A bounded decision",
				timestamp: 4,
			},
		}));
	}, 8);
	const allResult = await createSubAgentsWaitTool(() => allFixture.runtime).execute(
		"wait-all",
		{ condition: "all", timeoutSeconds: 1 },
		undefined,
		undefined,
		{},
	);
	assert.equal(allResult.details.selection, "all");
	assert.equal(allResult.details.completion, "satisfied");
	assert.equal(allResult.details.matched, 2);
	assert.equal(allResult.details.outcomes[1].state, "blocked");
	assert.equal(allResult.details.outcomes[1].output.summary, "Second child needs orchestration");

	assert.equal(tool.executionMode, "parallel");
	assert.ok(tool.promptGuidelines.some((line) => /never removes/.test(line)));
	const callComponent = tool.renderCall(
		{ ids: [firstId, secondId], condition: "any", timeoutSeconds: 10 },
		fakeTheme(),
		renderContext({ ids: [firstId, secondId], condition: "any", timeoutSeconds: 10 }),
	);
	assert.match(callComponent.render(300).join("\n"), /any of 2 selected/);
	const resultComponent = tool.renderResult(
		anyResult,
		{ expanded: true, isPartial: false },
		fakeTheme(),
		renderContext({ ids: [firstId, secondId] }),
	);
	assert.match(resultComponent.render(400).join("\n"), /first-child/);
});

test("wait timeouts return bounded current state and usage while caller aborts fail before drains", async () => {
	const id = "sa1-wait-timeout-1-running";
	const timeoutFixture = waitRuntime([
		snapshot(id, "running", { name: "timeout-child" }),
	], new Map([[id, counters({ input: 9, output: 1, totalTokens: 10, cost: 0.2 })]]));
	const timedOut = await createSubAgentsWaitTool(() => timeoutFixture.runtime).execute(
		"wait-timeout",
		{ ids: [id], states: ["idle"], timeoutSeconds: 0.02 },
		undefined,
		undefined,
		{},
	);
	assert.equal(timedOut.details.completion, "timed_out");
	assert.equal(timedOut.details.timedOut, true);
	assert.equal(timedOut.details.matched, 0);
	assert.equal(timedOut.details.outcomes[0].state, "running");
	assert.equal(timedOut.usage.totalTokens, 10);
	assert.deepEqual(timeoutFixture.drainCalls, [id]);

	const abortFixture = waitRuntime([snapshot(id, "running", { name: "abort-child" })]);
	const controller = new AbortController();
	setTimeout(() => controller.abort(), 8);
	await assert.rejects(
		createSubAgentsWaitTool(() => abortFixture.runtime).execute(
			"wait-abort",
			{ ids: [id], states: ["idle"], timeoutSeconds: 1 },
			controller.signal,
			undefined,
			{},
		),
		(error) => error instanceof SubAgentsWaitError && error.code === "cancelled",
	);
	assert.deepEqual(abortFixture.drainCalls, [], "cancelled waits must not hide advanced usage watermarks");
});

test("wait preserves selected lookup failures and handles an empty live barrier without polling", async () => {
	const known = "sa1-wait-selection-1-known";
	const unknown = "sa1-wait-selection-2-unknown";
	const selectedFixture = waitRuntime([snapshot(known, "idle", { name: "known-child" })]);
	const selected = await createSubAgentsWaitTool(() => selectedFixture.runtime).execute(
		"wait-selection",
		{ ids: [known, unknown] },
		undefined,
		undefined,
		{},
	);
	assert.equal(selected.details.completion, "satisfied");
	assert.equal(selected.details.succeeded, 1);
	assert.equal(selected.details.failed, 1);
	assert.equal(selected.details.outcomes[1].code, "unknown_agent");

	const emptyFixture = waitRuntime([]);
	const empty = await createSubAgentsWaitTool(() => emptyFixture.runtime).execute(
		"wait-empty",
		{},
		undefined,
		undefined,
		{},
	);
	assert.equal(empty.details.completion, "no_targets");
	assert.equal(empty.details.returned, 0);
	assert.equal(empty.details.satisfied, false);
});

function largeWaitSnapshot(index) {
	const prefix = `sa1-wait-bounds-${index.toString().padStart(3, "0")}-`;
	const id = prefix + "x".repeat(SUB_AGENT_BOUNDS.agentIdChars - prefix.length);
	return snapshot(id, "idle", {
		name: `${"😀".repeat(30)}-${index}`,
		latestResult: {
			summary: `PRIVATE_WAIT_SUMMARY_${index}_${"s".repeat(8_000)}`,
			details: `PRIVATE_WAIT_DETAILS_${index}_${"d".repeat(16_000)}`,
			files: Array.from({ length: 100 }, (_, file) => `src/${"f".repeat(100)}-${file}.ts`),
			completedAt: 2,
		},
	});
}

test("maximum wait results preserve every exact ID under content/details transport bounds", async () => {
	const snapshots = Array.from({ length: SUB_AGENT_BOUNDS.controlTargets }, (_, index) => largeWaitSnapshot(index));
	const fixture = waitRuntime(snapshots);
	const result = await createSubAgentsWaitTool(() => fixture.runtime).execute(
		"wait-bounds",
		{ ids: snapshots.map((value) => value.id) },
		undefined,
		undefined,
		{},
	);
	assert.equal(result.details.outcomes.length, SUB_AGENT_BOUNDS.controlTargets);
	assert.equal(result.details.succeeded, SUB_AGENT_BOUNDS.controlTargets);
	assert.equal(new Set(result.details.outcomes.map((outcome) => outcome.id)).size, snapshots.length);
	assert.ok(result.details.truncatedAgentDetails > 0);
	assert.equal(result.details.outputTruncated, true);
	assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 48 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") <= 48 * 1024);
});

test("wait fails closed without an active generation and redacts unknown manager/drain failures", async () => {
	const inactive = createSubAgentsWaitTool(() => undefined);
	await assert.rejects(
		inactive.execute("wait-inactive", {}, undefined, undefined, {}),
		(error) => error instanceof SubAgentsWaitError && error.code === "manager_inactive",
	);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		createSubAgentsWaitTool(() => ({ manager: {} })).execute(
			"wait-cancelled",
			{},
			controller.signal,
			undefined,
			{},
		),
		(error) => error instanceof SubAgentsWaitError && error.code === "cancelled",
	);

	const id = "sa1-wait-private-1-child";
	const privateSnapshot = snapshot(id, "idle", { name: "private-child" });
	const redacted = await createSubAgentsWaitTool(() => ({
		manager: {
			generation: "sag1-wait-private",
			listAgents() {
				return [privateSnapshot];
			},
			getAgent() {
				return privateSnapshot;
			},
			async drainUsage() {
				throw new Error("PRIVATE_PROVIDER_WAIT_DRAIN_FAILURE");
			},
		},
	})).execute("wait-private", { ids: [id] }, undefined, undefined, {});
	assert.equal(redacted.details.usageDrainFailures, 1);
	assert.equal(redacted.details.outcomes[0].usageDrainError.code, "wait_failed");
	assert.doesNotMatch(JSON.stringify(redacted), /PRIVATE_PROVIDER_WAIT_DRAIN_FAILURE/);
});

function modelDefinition(id) {
	return {
		id,
		name: id,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
	};
}

test("the wait tool settles a production in-process child, returns its output, and drains usage once", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-wait-production-"));
	const { codingAgent, piAi } = await importInstalledPackages();
	const providerId = "wait-production-provider";
	const faux = piAi.fauxProvider({
		provider: providerId,
		models: [modelDefinition("wait-production-model")],
		tokensPerSecond: 100_000,
	});
	const modelRuntime = await codingAgent.ModelRuntime.create({
		credentials: new piAi.InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	modelRuntime.registerNativeProvider(faux.provider);
	const model = modelRuntime.getModel(providerId, "wait-production-model");
	assert.ok(model);
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration("wait-production"),
		modelRuntime: { async dispose() {} },
		cleanupTimeoutMs: 1_000,
	});
	const runner = new SubAgentAssignmentRunner(manager, {
		async createSession(options) {
			return createSubAgentSession(options);
		},
	});
	try {
		faux.setResponses([piAi.fauxAssistantMessage("production wait complete")]);
		const launch = await runner.createAndLaunch(
			{
				name: "wait-production-child",
				role: "Exercise the production wait control boundary",
				objective: "complete the production wait fixture",
				thinkingLevel: "off",
				tools: [],
			},
			() => ({
				runtime: modelRuntime,
				model,
				ref: { provider: model.provider, id: model.id },
			}),
		);
		const updates = [];
		const tool = createSubAgentsWaitTool(() => ({ manager, pollIntervalMs: 2 }));
		const result = await tool.execute(
			"wait-production",
			{ ids: [launch.id], timeoutSeconds: 1 },
			undefined,
			(partial) => updates.push(partial),
			{},
		);
		assert.equal(result.details.completion, "satisfied");
		assert.equal(result.details.outcomes[0].state, "idle");
		assert.equal(result.details.outcomes[0].output.summary, "production wait complete");
		assert.ok(updates.length >= 1);
		assert.deepEqual(manager.getAgent(launch.id).usage.reported, manager.getAgent(launch.id).usage.totals);

		const repeated = await tool.execute(
			"wait-production-repeat",
			{ ids: [launch.id], timeoutSeconds: 1 },
			undefined,
			undefined,
			{},
		);
		assert.equal(repeated.usage.totalTokens, 0, "a repeated wait must not double-report child usage");
	} finally {
		await manager.disposeAll("wait production test complete");
		await rm(root, { recursive: true, force: true });
	}
});
