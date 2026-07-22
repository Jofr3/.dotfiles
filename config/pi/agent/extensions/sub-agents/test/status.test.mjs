import assert from "node:assert/strict";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	SubAgentManager,
	createSessionGeneration,
} = await importSubAgentsModule("manager.ts");
const {
	SubAgentsStatusError,
	createSubAgentsStatusTool,
} = await importSubAgentsModule("tools/status.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");

function deterministicManager(label) {
	let nonce = 0;
	let now = 100_000;
	return new SubAgentManager({
		cwd: process.cwd(),
		generation: createSessionGeneration(label),
		nonce: () => `${label}-${++nonce}`,
		now: () => ++now,
		cleanupTimeoutMs: 100,
	});
}

function spec(name) {
	return {
		name,
		role: `Inspect bounded status for ${name}`,
		objective: `Complete the ${name} status fixture.`,
		modelPolicy: "auto",
		complexity: "moderate",
		thinkingLevel: "high",
		tags: ["status", "offline"],
	};
}

function route() {
	return {
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
		reason: "Selected the deterministic moderate fixture route.",
	};
}

function complexRoute() {
	return {
		requestedPolicy: "auto",
		requestedComplexity: "complex",
		selectedModel: { provider: "fixture-provider", id: "gpt-5.6-sol" },
		selectedTier: "complex",
		fallbackUsed: false,
		fallbackPath: [
			{
				source: "tier",
				modelId: "gpt-5.6-sol",
				complexity: "complex",
				outcome: "selected",
			},
		],
		reason: "Selected the deterministic complex fixture route.",
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
		toolCallId: "status-render",
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: true,
		showImages: false,
		isError: false,
	};
}

test("sub_agents_status observes live/removed selections with bounded compact and timeline metadata", async () => {
	const manager = deterministicManager("status-selection");
	const live = manager.createAgent(spec("live-child"));
	await manager.recordModelRoute(live.id, route());
	await manager.recordEffectiveThinkingLevel(live.id, "high");
	const running = await manager.startAssignment(live.id);
	await manager.queueModelReconfiguration(live.id, {
		afterAssignmentId: running.currentAssignment.id,
		route: complexRoute(),
		requestedThinkingLevel: "xhigh",
	});
	await manager.updateRuntimeActivity(live.id, {
		phase: "tools",
		streamingPreview: "Inspecting the current bounded status fixture.",
		activeToolCount: 1,
		activeTools: [
			{
				toolCallId: "tool-call-1",
				toolName: "grep",
				startedAt: 100_100,
				updatedAt: 100_101,
			},
		],
		pendingMessageCount: 2,
	});
	await manager.recordReport(live.id, {
		state: "progress",
		summary: "Status fixture evidence collected",
		files: ["src/a.ts"],
	});
	await manager.addUsage(live.id, {
		input: 11,
		output: 7,
		cacheRead: 3,
		totalTokens: 21,
		cost: 0.125,
		turns: 1,
	});

	const historical = manager.createAgent(spec("removed-child"));
	await manager.startAssignment(historical.id);
	await manager.completeAssignment(historical.id, {
		state: "idle",
		summary: "Historical fixture complete",
	});
	await manager.removeAgent(historical.id, "status fixture cleanup");

	const runtime = { manager, now: () => 101_000 };
	const tool = createSubAgentsStatusTool(() => runtime);
	try {
		const compact = await tool.execute(
			"status-compact",
			{},
			undefined,
			undefined,
			{},
		);
		assert.equal(compact.details.selection, "all");
		assert.equal(compact.details.succeeded, 1);
		assert.equal(compact.details.failed, 0);
		assert.equal(compact.details.outcomes[0].id, live.id);
		assert.equal(compact.details.outcomes[0].state, "running");
		assert.equal(compact.details.outcomes[0].model.id, "gpt-5.6-terra");
		assert.equal(compact.details.outcomes[0].requested.effectiveThinkingLevel, "high");
		assert.equal(compact.details.outcomes[0].pendingModel.id, "gpt-5.6-sol");
		assert.equal(compact.details.outcomes[0].pendingModel.afterAssignmentSequence, 1);
		assert.equal(compact.details.outcomes[0].pendingModel.requestedThinkingLevel, "xhigh");
		assert.equal(compact.details.outcomes[0].runtime.activeTools[0].name, "grep");
		assert.equal(compact.details.outcomes[0].runtime.pendingMessageCount, 2);
		assert.equal(compact.details.outcomes[0].report.summary, "Status fixture evidence collected");
		assert.equal(compact.details.outcomes[0].usage.unreported, true);
		assert.equal(compact.usage, undefined, "observational status must not attach nested usage");
		assert.equal(manager.getAgent(live.id).usage.reported.input, 0);

		const unknown = `${live.id.slice(0, live.id.lastIndexOf("-") + 1)}missing`;
		const stale = "sa1-another-generation-1-missing";
		const selected = await tool.execute(
			"status-selected",
			{
				ids: [live.id, historical.id, unknown, stale],
				detail: "timeline",
				eventLimit: 2,
			},
			undefined,
			undefined,
			{},
		);
		assert.equal(selected.details.succeeded, 1);
		assert.equal(selected.details.failed, 3);
		assert.deepEqual(
			selected.details.outcomes.slice(1).map((outcome) => outcome.code),
			["removed_excluded", "unknown_agent", "stale_agent"],
		);
		assert.ok(selected.details.outcomes[0].events.length <= 2);
		assert.ok(selected.details.outcomes[0].omittedEventCount > 0);

		const withRemoved = await tool.execute(
			"status-removed",
			{ ids: [historical.id], includeRemoved: true },
			undefined,
			undefined,
			{},
		);
		assert.equal(withRemoved.details.outcomes[0].state, "removed");
		assert.equal(withRemoved.details.outcomes[0].result.summary, "Historical fixture complete");

		assert.equal(tool.executionMode, "parallel");
		assert.ok(tool.promptGuidelines.some((line) => /drainUsage/.test(line)));
		const callComponent = tool.renderCall(
			{ ids: [live.id], detail: "timeline", drainUsage: true },
			fakeTheme(),
			renderContext({ ids: [live.id], detail: "timeline", drainUsage: true }),
		);
		assert.match(callComponent.render(200).join("\n"), /1 selected · timeline · drain usage/);
		const resultComponent = tool.renderResult(
			selected,
			{ expanded: true, isPartial: false },
			fakeTheme(),
			renderContext({ ids: [live.id], detail: "timeline" }),
		);
		assert.match(resultComponent.render(300).join("\n"), /live-child/);
	} finally {
		await manager.disposeAll("status selection test complete");
	}
});

test("explicit concurrent status drains advance each child watermark once and attach Pi usage", async () => {
	const manager = deterministicManager("status-drain");
	const child = manager.createAgent(spec("usage-child"));
	await manager.startAssignment(child.id);
	await manager.addUsage(child.id, {
		input: 17,
		output: 9,
		cacheRead: 4,
		cacheWrite: 2,
		totalTokens: 32,
		cost: 0.75,
		turns: 2,
	});
	const tool = createSubAgentsStatusTool(() => ({ manager, now: () => 101_000 }));
	try {
		const observed = await tool.execute(
			"observe",
			{ ids: [child.id] },
			undefined,
			undefined,
			{},
		);
		assert.equal(observed.details.outcomes[0].usage.unreported, true);
		assert.equal(manager.getAgent(child.id).usage.reported.totalTokens, 0);

		const drains = await Promise.all([
			tool.execute("drain-a", { ids: [child.id], drainUsage: true }, undefined, undefined, {}),
			tool.execute("drain-b", { ids: [child.id], drainUsage: true }, undefined, undefined, {}),
		]);
		assert.equal(drains.reduce((sum, result) => sum + result.usage.input, 0), 17);
		assert.equal(drains.reduce((sum, result) => sum + result.usage.output, 0), 9);
		assert.equal(drains.reduce((sum, result) => sum + result.usage.totalTokens, 0), 32);
		assert.equal(drains.reduce((sum, result) => sum + result.usage.cost.total, 0), 0.75);
		assert.equal(
			drains.reduce((sum, result) => sum + result.details.usageDrained.cacheRead, 0),
			4,
		);
		assert.equal(manager.getAgent(child.id).usage.reported.totalTokens, 32);
		assert.equal(drains.every((result) => result.details.outcomes[0].usage.unreported === false), true);
	} finally {
		await manager.disposeAll("status drain test complete");
	}
});

function largeSnapshot(index) {
	const id = `sa1-output-${index.toString().padStart(3, "0")}-${"x".repeat(170)}`;
	const events = Array.from({ length: SUB_AGENT_BOUNDS.eventTimeline }, (_, eventIndex) => ({
		sequence: eventIndex + 1,
		kind: "runtime",
		state: "running",
		summary: `${"timeline-status-summary ".repeat(30)}${eventIndex}`,
		timestamp: 1_000 + eventIndex,
	}));
	return {
		id,
		generation: "sag1-output-bounds",
		spec: {
			name: `${"😀".repeat(30)}-${index}`,
			role: "r".repeat(1_000),
			objective: "o".repeat(12_000),
			modelPolicy: "auto",
			complexity: "complex",
			thinkingLevel: "xhigh",
			tags: Array.from({ length: 20 }, (_, tag) => `tag-${tag}-${"t".repeat(70)}`),
		},
		state: "running",
		createdAt: 1,
		updatedAt: 2,
		assignmentCount: 1,
		currentAssignment: {
			id: `${id}:assignment:1`,
			sequence: 1,
			objective: "assignment ".repeat(1_000),
			state: "running",
			startedAt: 1,
			usage: {
				totals: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: 0.01 },
				turns: 1,
			},
		},
		latestReport: {
			state: "progress",
			summary: "report ".repeat(400),
			files: Array.from({ length: 100 }, (_, file) => `src/${"f".repeat(100)}-${file}.ts`),
			timestamp: 2,
		},
		modelRoute: route(),
		events,
		omittedEventCount: 5_000,
		runtime: {
			phase: "tools",
			streamingPreview: "preview ".repeat(500),
			activeToolCount: 32,
			activeTools: Array.from({ length: 32 }, (_, tool) => ({
				toolCallId: `tool-${tool}-${"i".repeat(100)}`,
				toolName: `tool-${tool}-${"n".repeat(100)}`,
				startedAt: 1,
				updatedAt: 2,
			})),
			pendingMessageCount: 100,
		},
		usage: {
			totals: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: 0.01 },
			reported: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 },
			turns: 1,
			assignments: 1,
		},
		leases: [],
	};
}

test("maximum timeline snapshots preserve every selected outcome under content/details transport bounds", async () => {
	const snapshots = Array.from({ length: SUB_AGENT_BOUNDS.controlTargets }, (_, index) => largeSnapshot(index));
	const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
	const manager = {
		generation: "sag1-output-bounds",
		listAgents() {
			return snapshots;
		},
		getAgent(id) {
			const snapshot = byId.get(id);
			if (!snapshot) throw new Error("PRIVATE_STATUS_LOOKUP_FAILURE");
			return snapshot;
		},
		async drainUsage() {
			throw new Error("unused");
		},
	};
	const tool = createSubAgentsStatusTool(() => ({ manager, now: () => 10_000 }));
	const result = await tool.execute(
		"status-output-bounds",
		{ detail: "timeline", eventLimit: SUB_AGENT_BOUNDS.eventTimeline },
		undefined,
		undefined,
		{},
	);
	assert.equal(result.details.outcomes.length, SUB_AGENT_BOUNDS.controlTargets);
	assert.equal(result.details.succeeded, SUB_AGENT_BOUNDS.controlTargets);
	assert.equal(result.details.failed, 0);
	assert.ok(result.details.truncatedAgentDetails > 0);
	assert.ok(result.details.timelineEventsOmittedByTransport > 0);
	assert.equal(result.details.outputTruncated, true);
	assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 48 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") <= 48 * 1024);
	assert.equal(new Set(result.details.outcomes.map((outcome) => outcome.id)).size, snapshots.length);
	assert.doesNotMatch(JSON.stringify(result), /PRIVATE_STATUS_LOOKUP_FAILURE/);
});

test("status fails closed before side effects without an active generation and redacts unknown lookup errors", async () => {
	const inactive = createSubAgentsStatusTool(() => undefined);
	await assert.rejects(
		inactive.execute("inactive", {}, undefined, undefined, {}),
		(error) => error instanceof SubAgentsStatusError && error.code === "manager_inactive",
	);
	const controller = new AbortController();
	controller.abort();
	const runtime = {
		manager: {
			generation: "sag1-cancelled",
			listAgents() {
				return [];
			},
			getAgent() {
				throw new Error("unused");
			},
			async drainUsage() {
				throw new Error("unused");
			},
		},
	};
	const cancelled = createSubAgentsStatusTool(() => runtime);
	await assert.rejects(
		cancelled.execute("cancelled", {}, controller.signal, undefined, {}),
		(error) => error instanceof SubAgentsStatusError && error.code === "cancelled",
	);

	const privateFailure = createSubAgentsStatusTool(() => ({
		manager: {
			generation: "sag1-private-failure",
			listAgents() {
				return [];
			},
			getAgent() {
				throw new Error("PRIVATE_STATUS_LOOKUP_FAILURE");
			},
			async drainUsage() {
				throw new Error("unused");
			},
		},
	}));
	const redacted = await privateFailure.execute(
		"redacted",
		{ ids: ["sa1-private-failure-1-missing"] },
		undefined,
		undefined,
		{},
	);
	assert.equal(redacted.details.outcomes[0].code, "status_failed");
	assert.doesNotMatch(JSON.stringify(redacted), /PRIVATE_STATUS_LOOKUP_FAILURE/);
});
