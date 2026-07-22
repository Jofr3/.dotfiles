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
	SubAgentsRemoveError,
	createSubAgentsRemoveTool,
} = await importSubAgentsModule("tools/remove.ts");
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
	const assignmentCount = overrides.assignmentCount ?? (state === "creating" ? 0 : 1);
	return {
		id,
		generation: "sag1-remove-fixture",
		spec: {
			name: overrides.name ?? id.split("-").at(-1),
			role: "Exercise the bounded remove fixture",
			objective: "Reach a removable state.",
			modelPolicy: "auto",
			complexity: "moderate",
		},
		state,
		createdAt: 1,
		updatedAt: overrides.updatedAt ?? 2,
		removedAt: state === "removed" ? 2 : undefined,
		removalReason: state === "removed" ? "previous removal" : undefined,
		assignmentCount,
		currentAssignment: assignmentCount
			? {
					id: `${id}:assignment:${assignmentCount}`,
					sequence: assignmentCount,
					objective: "Reach a removable state.",
					state: state === "running" ? "running" : state === "removed" ? "aborted" : state,
					startedAt: 1,
					endedAt: state === "running" ? undefined : 2,
					usage: { totals: counters(), turns: 0 },
				}
			: undefined,
		latestReport: overrides.latestReport,
		latestResult: overrides.latestResult,
		lastError: overrides.lastError,
		events: [],
		omittedEventCount: 0,
		runtime: {
			phase: state === "running" ? "streaming" : state === "creating" ? "initializing" : "settled",
			activeToolCount: state === "running" ? 1 : 0,
			activeTools: [],
			pendingMessageCount: 0,
		},
		usage: {
			totals: counters(),
			reported: counters(),
			turns: 0,
			assignments: assignmentCount,
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
		toolCallId: "remove-render",
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: true,
		showImages: false,
		isError: false,
	};
}

function removeFixture(initial, options = {}) {
	const snapshots = new Map(initial.map((value) => [value.id, value]));
	const usage = new Map(options.usage ?? []);
	const sendCalls = [];
	const removeCalls = [];
	const drainCalls = [];
	return {
		snapshots,
		sendCalls,
		removeCalls,
		drainCalls,
		runtime: {
			pollIntervalMs: options.pollIntervalMs ?? 2,
			manager: {
				generation: "sag1-remove-fixture",
				listAgents({ includeRemoved } = {}) {
					return [...snapshots.values()].filter((value) => includeRemoved || value.state !== "removed");
				},
				getAgent(id) {
					const value = snapshots.get(id);
					if (!value) throw new UnknownAgentIdError(id);
					return value;
				},
				async removeAgent(id, reason) {
					removeCalls.push({ id, reason });
					if (options.removeError?.has(id)) throw new Error(`PRIVATE_REMOVE_FAILURE_${id}`);
					const value = snapshots.get(id);
					if (!value) throw new UnknownAgentIdError(id);
					if (value.state === "removed") return value;
					const removed = {
						...value,
						state: "removed",
						removedAt: Date.now(),
						removalReason: reason,
						runtime: { ...value.runtime, phase: "settled", activeToolCount: 0, activeTools: [] },
						currentAssignment: value.currentAssignment
							? {
									...value.currentAssignment,
									state: value.currentAssignment.state === "running" ? "aborted" : value.currentAssignment.state,
									endedAt: value.currentAssignment.endedAt ?? Date.now(),
								}
							: undefined,
					};
					snapshots.set(id, removed);
					return removed;
				},
				async drainUsage(id) {
					drainCalls.push(id);
					if (options.drainError?.has(id)) throw new Error(`PRIVATE_DRAIN_FAILURE_${id}`);
					const delta = usage.get(id) ?? counters();
					usage.set(id, counters());
					return delta;
				},
			},
			runner: {
				async send(id, message, delivery) {
					sendCalls.push({ id, message, delivery });
					if (options.sendError?.has(id)) throw new Error(`PRIVATE_SEND_FAILURE_${id}`);
					const value = snapshots.get(id);
					if (!value) throw new UnknownAgentIdError(id);
					if (value.state !== "running") {
						const error = new Error("boundary");
						error.name = "SubAgentAssignmentRunnerError";
						error.code = "assignment_not_running";
						throw error;
					}
					if (options.onSend) await options.onSend({ id, message, delivery, snapshots });
					return {
						id,
						assignmentId: value.currentAssignment.id,
						delivery,
						accepted: true,
						pendingMessageCount: 1,
					};
				},
			},
		},
	};
}

test("sub_agents_remove gracefully finalizes running children, removes settled children, drains usage, and repeats idempotently", async () => {
	const runningId = "sa1-remove-fixture-1-running";
	const idleId = "sa1-remove-fixture-2-idle";
	const removedId = "sa1-remove-fixture-3-removed";
	const fixture = removeFixture([
		snapshot(runningId, "running", { name: "running-child" }),
		snapshot(idleId, "idle", {
			name: "idle-child",
			latestResult: {
				summary: "Idle child already had a final result",
				details: "Bounded result details",
				files: ["src/idle.ts"],
				completedAt: 2,
			},
		}),
		snapshot(removedId, "removed", { name: "removed-child" }),
	], {
		usage: [
			[runningId, counters({ input: 7, output: 3, totalTokens: 10, cost: 0.1 })],
			[idleId, counters({ input: 5, output: 2, totalTokens: 7, cost: 0.05 })],
		],
		onSend({ id, snapshots }) {
			setTimeout(() => {
				const value = snapshots.get(id);
				snapshots.set(id, {
					...value,
					state: "idle",
					updatedAt: 3,
					currentAssignment: { ...value.currentAssignment, state: "idle", endedAt: 3 },
					latestResult: {
						summary: "Graceful child returned its final summary",
						details: "Completed before bounded removal",
						files: ["src/running.ts"],
						completedAt: 3,
					},
				});
			}, 5);
		},
	});
	const tool = createSubAgentsRemoveTool(() => fixture.runtime);
	const result = await tool.execute(
		"remove-graceful",
		{
			scope: "selected",
			ids: [runningId, idleId, removedId],
			mode: "graceful",
			gracePeriodSeconds: 1,
		},
		undefined,
		undefined,
		{},
	);
	assert.equal(result.details.succeeded, 3);
	assert.equal(result.details.failed, 0);
	assert.equal(result.details.newlyRemoved, 2);
	assert.equal(result.details.alreadyRemoved, 1);
	assert.equal(result.details.forcedAborts, 0);
	assert.equal(result.details.gracefulCompleted, 1);
	assert.equal(fixture.sendCalls.length, 1);
	assert.equal(fixture.sendCalls[0].id, runningId);
	assert.equal(fixture.sendCalls[0].delivery, "steer");
	assert.match(fixture.sendCalls[0].message, /final summary/);
	assert.doesNotMatch(JSON.stringify(result), /At the next safe boundary/);
	assert.deepEqual(
		fixture.removeCalls.map((call) => call.id).sort(),
		[runningId, idleId, removedId].sort(),
	);
	assert.deepEqual(fixture.drainCalls.sort(), [runningId, idleId, removedId].sort());
	assert.equal(result.details.outcomes[0].grace.outcome, "completed");
	assert.equal(result.details.outcomes[0].output.summary, "Graceful child returned its final summary");
	assert.equal(result.details.outcomes[1].grace.outcome, "not_needed");
	assert.equal(result.details.outcomes[1].output.summary, "Idle child already had a final result");
	assert.equal(result.details.outcomes[2].alreadyRemoved, true);
	assert.equal(result.usage.input, 12);
	assert.equal(result.usage.output, 5);
	assert.equal(result.usage.totalTokens, 17);
	assert.ok(Math.abs(result.usage.cost.total - 0.15) < 1e-12);
	assert.equal([...fixture.snapshots.values()].every((value) => value.state === "removed"), true);

	const repeated = await tool.execute(
		"remove-repeat",
		{ scope: "selected", ids: [runningId, idleId, removedId], mode: "graceful" },
		undefined,
		undefined,
		{},
	);
	assert.equal(repeated.details.newlyRemoved, 0);
	assert.equal(repeated.details.alreadyRemoved, 3);
	assert.equal(repeated.details.forcedAborts, 0);
	assert.equal(repeated.usage.totalTokens, 0, "repeated removal must not double-report usage");

	assert.equal(tool.executionMode, "parallel");
	assert.ok(tool.promptGuidelines.some((line) => /repeated selected removal is idempotent/.test(line)));
	const callComponent = tool.renderCall(
		{ scope: "selected", ids: [runningId], mode: "graceful", gracePeriodSeconds: 5 },
		fakeTheme(),
		renderContext({ scope: "selected", ids: [runningId], mode: "graceful" }),
	);
	assert.match(callComponent.render(300).join("\n"), /graceful · 1 selected/);
	const resultComponent = tool.renderResult(
		result,
		{ expanded: true, isPartial: false },
		fakeTheme(),
		renderContext({ scope: "selected", ids: [runningId, idleId, removedId] }),
	);
	assert.match(resultComponent.render(400).join("\n"), /running-child/);
});

test("abort mode stops immediately while graceful timeout and caller cancellation escalate visibly", async () => {
	const abortId = "sa1-remove-modes-1-abort";
	const abortFixture = removeFixture([snapshot(abortId, "running", { name: "abort-child" })]);
	const aborted = await createSubAgentsRemoveTool(() => abortFixture.runtime).execute(
		"remove-abort",
		{ scope: "selected", ids: [abortId], mode: "abort" },
		undefined,
		undefined,
		{},
	);
	assert.equal(abortFixture.sendCalls.length, 0);
	assert.equal(aborted.details.forcedAborts, 1);
	assert.equal(aborted.details.outcomes[0].forcedAbort, true);
	assert.equal(abortFixture.snapshots.get(abortId).currentAssignment.state, "aborted");

	const timeoutId = "sa1-remove-modes-2-timeout";
	const timeoutFixture = removeFixture([snapshot(timeoutId, "running", { name: "timeout-child" })]);
	const timedOut = await createSubAgentsRemoveTool(() => timeoutFixture.runtime).execute(
		"remove-timeout",
		{ scope: "selected", ids: [timeoutId], mode: "graceful", gracePeriodSeconds: 0.02 },
		undefined,
		undefined,
		{},
	);
	assert.equal(timeoutFixture.sendCalls.length, 1);
	assert.equal(timedOut.details.forcedAborts, 1);
	assert.equal(timedOut.details.outcomes[0].grace.outcome, "timed_out");
	assert.equal(timedOut.details.outcomes[0].grace.escalated, true);

	const cancelledId = "sa1-remove-modes-3-cancelled";
	const cancelledFixture = removeFixture([snapshot(cancelledId, "running", { name: "cancelled-child" })]);
	const controller = new AbortController();
	setTimeout(() => controller.abort(), 5);
	const cancelled = await createSubAgentsRemoveTool(() => cancelledFixture.runtime).execute(
		"remove-cancelled-after-start",
		{ scope: "selected", ids: [cancelledId], mode: "graceful", gracePeriodSeconds: 1 },
		controller.signal,
		undefined,
		{},
	);
	assert.equal(cancelled.details.outcomes[0].grace.outcome, "cancelled");
	assert.equal(cancelled.details.outcomes[0].forcedAbort, true);
	assert.equal(cancelledFixture.snapshots.get(cancelledId).state, "removed");

	const preCancelled = removeFixture([snapshot("sa1-remove-modes-4-pre", "idle")]);
	const preController = new AbortController();
	preController.abort();
	await assert.rejects(
		createSubAgentsRemoveTool(() => preCancelled.runtime).execute(
			"remove-pre-cancelled",
			{ scope: "all" },
			preController.signal,
			undefined,
			{},
		),
		(error) => error instanceof SubAgentsRemoveError && error.code === "cancelled",
	);
	assert.deepEqual(preCancelled.removeCalls, []);
});

test("remove validates selected/all scope, preserves partial failures, and redacts unknown cleanup errors", async () => {
	const goodId = "sa1-remove-errors-1-good";
	const removeErrorId = "sa1-remove-errors-2-remove";
	const drainErrorId = "sa1-remove-errors-3-drain";
	const unknownId = "sa1-remove-errors-4-unknown";
	const fixture = removeFixture([
		snapshot(goodId, "idle", { name: "good-child" }),
		snapshot(removeErrorId, "idle", { name: "remove-error-child" }),
		snapshot(drainErrorId, "idle", { name: "drain-error-child" }),
	], {
		removeError: new Set([removeErrorId]),
		drainError: new Set([drainErrorId]),
	});
	const tool = createSubAgentsRemoveTool(() => fixture.runtime);
	const result = await tool.execute(
		"remove-partial",
		{ scope: "selected", ids: [goodId, removeErrorId, drainErrorId, unknownId], mode: "abort" },
		undefined,
		undefined,
		{},
	);
	assert.equal(result.details.succeeded, 2);
	assert.equal(result.details.failed, 2);
	assert.equal(result.details.usageDrainFailures, 1);
	assert.equal(result.details.outcomes[1].code, "remove_failed");
	assert.equal(result.details.outcomes[2].usageDrainError.code, "remove_failed");
	assert.equal(result.details.outcomes[3].code, "unknown_agent");
	assert.doesNotMatch(JSON.stringify(result), /PRIVATE_(REMOVE|DRAIN)_FAILURE/);
	assert.equal(fixture.snapshots.get(goodId).state, "removed");
	assert.equal(fixture.snapshots.get(removeErrorId).state, "idle");
	assert.equal(fixture.snapshots.get(drainErrorId).state, "removed");

	await assert.rejects(
		tool.execute("remove-selected-empty", { scope: "selected" }, undefined, undefined, {}),
		(error) => error instanceof SubAgentsRemoveError && error.code === "invalid_request",
	);
	await assert.rejects(
		tool.execute("remove-all-with-ids", { scope: "all", ids: [goodId] }, undefined, undefined, {}),
		(error) => error instanceof SubAgentsRemoveError && error.code === "invalid_request",
	);
	await assert.rejects(
		createSubAgentsRemoveTool(() => undefined).execute(
			"remove-inactive",
			{ scope: "all" },
			undefined,
			undefined,
			{},
		),
		(error) => error instanceof SubAgentsRemoveError && error.code === "manager_inactive",
	);
});

function largeRemoveSnapshot(index) {
	const prefix = `sa1-remove-bounds-${index.toString().padStart(3, "0")}-`;
	const id = prefix + "x".repeat(SUB_AGENT_BOUNDS.agentIdChars - prefix.length);
	return snapshot(id, "idle", {
		name: `${"😀".repeat(30)}-${index}`,
		latestResult: {
			summary: `PRIVATE_REMOVE_SUMMARY_${index}_${"s".repeat(8_000)}`,
			details: `PRIVATE_REMOVE_DETAILS_${index}_${"d".repeat(16_000)}`,
			files: Array.from({ length: 100 }, (_, file) => `src/${"f".repeat(100)}-${file}.ts`),
			completedAt: 2,
		},
	});
}

test("scope=all removes every call-start child while bounded details prioritize failures", async () => {
	const snapshots = Array.from(
		{ length: SUB_AGENT_BOUNDS.controlTargets + 10 },
		(_, index) => largeRemoveSnapshot(index),
	);
	const failedId = snapshots.at(-1).id;
	const fixture = removeFixture(snapshots, { removeError: new Set([failedId]) });
	const result = await createSubAgentsRemoveTool(() => fixture.runtime).execute(
		"remove-all-bounds",
		{ scope: "all", mode: "abort" },
		undefined,
		undefined,
		{},
	);
	assert.equal(result.details.requested, snapshots.length);
	assert.equal(result.details.returned, SUB_AGENT_BOUNDS.controlTargets);
	assert.equal(result.details.omitted, 10);
	assert.equal(result.details.succeeded, snapshots.length - 1);
	assert.equal(result.details.failed, 1);
	assert.ok(result.details.outcomes.some((outcome) => outcome.id === failedId && !outcome.ok));
	assert.equal(fixture.removeCalls.length, snapshots.length, "scope=all must act on every live call-start child");
	assert.equal(
		[...fixture.snapshots.values()].filter((value) => value.state !== "removed").length,
		1,
	);
	assert.ok(result.details.truncatedAgentDetails > 0);
	assert.equal(result.details.outputTruncated, true);
	assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 48 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") <= 48 * 1024);
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

test("the remove tool disposes a production in-process child runtime and retains final output", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-remove-production-"));
	const { codingAgent, piAi } = await importInstalledPackages();
	const providerId = "remove-production-provider";
	const faux = piAi.fauxProvider({
		provider: providerId,
		models: [modelDefinition("remove-production-model")],
		tokensPerSecond: 100_000,
	});
	const modelRuntime = await codingAgent.ModelRuntime.create({
		credentials: new piAi.InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	modelRuntime.registerNativeProvider(faux.provider);
	const model = modelRuntime.getModel(providerId, "remove-production-model");
	assert.ok(model);
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration("remove-production"),
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
	try {
		faux.setResponses([piAi.fauxAssistantMessage("production remove final output")]);
		const launch = await runner.createAndLaunch(
			{
				name: "remove-production-child",
				role: "Exercise production remove cleanup",
				objective: "complete before production removal",
				thinkingLevel: "off",
				tools: [],
			},
			() => ({
				runtime: modelRuntime,
				model,
				ref: { provider: model.provider, id: model.id },
			}),
		);
		await runner.waitForAssignment(launch.id, launch.assignmentId);
		assert.equal(runner.liveRuntimeCount, 1);
		const result = await createSubAgentsRemoveTool(() => ({ manager, runner, pollIntervalMs: 2 })).execute(
			"remove-production",
			{ scope: "selected", ids: [launch.id], mode: "graceful" },
			undefined,
			undefined,
			{},
		);
		assert.equal(result.details.newlyRemoved, 1);
		assert.equal(result.details.outcomes[0].output.summary, "production remove final output");
		assert.equal(manager.getAgent(launch.id).state, "removed");
		assert.equal(runner.liveRuntimeCount, 0);
		assert.equal(sessions[0].disposed, true);
		assert.deepEqual(manager.getAgent(launch.id).usage.reported, manager.getAgent(launch.id).usage.totals);
	} finally {
		await manager.disposeAll("remove production test complete");
		await rm(root, { recursive: true, force: true });
	}
});
