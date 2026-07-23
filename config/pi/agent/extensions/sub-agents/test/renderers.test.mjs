import assert from "node:assert/strict";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const { createSubAgentsSpawnTool } = await importSubAgentsModule("tools/spawn.ts");
const { createSubAgentsStatusTool } = await importSubAgentsModule("tools/status.ts");
const { createSubAgentsSendTool } = await importSubAgentsModule("tools/send.ts");
const { createSubAgentsReconfigureTool } = await importSubAgentsModule("tools/reconfigure.ts");
const { createSubAgentsReleaseTool } = await importSubAgentsModule("tools/release.ts");
const { createSubAgentsWaitTool } = await importSubAgentsModule("tools/wait.ts");
const { createSubAgentsRemoveTool } = await importSubAgentsModule("tools/remove.ts");
const { cleanRendererLine } = await importSubAgentsModule("ui/renderers.ts");

const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/gu;
const FORBIDDEN_CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/u;

function theme(marker = "") {
	return {
		fg(_color, text) {
			return `\u001b[36m${marker}${text}\u001b[0m`;
		},
		bold(text) {
			return `\u001b[1m${text}\u001b[22m`;
		},
	};
}

function context(args, lastComponent, overrides = {}) {
	return {
		args,
		lastComponent,
		state: {},
		invalidate() {},
		toolCallId: "renderer-test",
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: true,
		showImages: false,
		isError: false,
		...overrides,
	};
}

function plain(lines) {
	return lines.join("\n").replace(ANSI, "");
}

function rendered(component, width = 200) {
	return plain(component.render(width));
}

function assertWidthSafe(component) {
	for (const width of [1, 7, 19, 48, 96]) {
		for (const line of component.render(width)) {
			const visible = line.replace(ANSI, "");
			assert.ok([...visible].length <= width, `line exceeds width ${width}: ${JSON.stringify(line)}`);
			assert.doesNotMatch(visible, FORBIDDEN_CONTROLS);
		}
	}
}

function result(content, details) {
	return { content: [{ type: "text", text: content }], details };
}

const ids = {
	one: "sa1-renderer-1-alpha",
	two: "sa1-renderer-2-beta",
};

const spawnInput = {
	agents: [
		{
			name: "alpha\u0007child",
			role: "renderer role",
			objective: "PRIVATE_SPAWN_OBJECTIVE",
			complexity: "simple",
		},
		{
			name: "beta child",
			role: "renderer role",
			objective: "another objective",
			complexity: "moderate",
		},
	],
};
const spawnResult = result("spawn fallback", {
	generation: "sag1-renderer",
	requested: 2,
	started: 1,
	failed: 1,
	outcomes: [
		{
			index: 0,
			ok: true,
			id: ids.one,
			state: "running",
			route: {
				requestedPolicy: "auto",
				requestedComplexity: "simple",
				selectedModel: { provider: "fixture", id: "gpt-5.6-luna" },
				selectedTier: "simple",
				fallbackUsed: false,
			},
		},
		{
			index: 1,
			ok: false,
			id: ids.two,
			state: "failed",
			code: "runtime_initialization_failed",
			message: "bounded renderer failure",
		},
	],
});

const statusInput = { ids: [ids.one, ids.two], detail: "timeline", drainUsage: true };
const statusResult = result("status fallback", {
	generation: "sag1-renderer",
	selection: "selected",
	includeRemoved: false,
	detail: "timeline",
	eventLimit: 2,
	drainUsage: true,
	requested: 2,
	returned: 2,
	succeeded: 1,
	failed: 1,
	omitted: 0,
	truncatedAgentDetails: 0,
	timelineEventsOmittedByTransport: 0,
	outputTruncated: false,
	outcomes: [
		{
			ok: true,
			id: ids.one,
			name: "status alpha",
			state: "running",
			updatedAt: 2,
			assignment: { sequence: 3, state: "running", summary: "PRIVATE_STATUS_OBJECTIVE", startedAt: 1 },
			model: { provider: "fixture", id: "gpt-5.6-terra", tier: "moderate", fallbackUsed: false, reason: "fixture" },
			pendingModel: { provider: "fixture", id: "gpt-5.6-sol", afterAssignmentSequence: 3 },
			runtime: {
				phase: "tools",
				activeToolCount: 2,
				activeTools: [{ id: "tool-1", name: "grep", startedAt: 1, updatedAt: 2 }],
				omittedActiveToolCount: 1,
				pendingMessageCount: 1,
			},
			report: { state: "progress", summary: "renderer evidence", files: ["src/a.ts"], omittedFileCount: 0, timestamp: 2 },
			usage: {
				totals: { input: 5, output: 4, cacheRead: 0, cacheWrite: 0, totalTokens: 9, cost: 0.1 },
				reported: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 },
				turns: 1,
				assignments: 1,
				unreported: true,
			},
			events: [{ sequence: 7, kind: "runtime", state: "running", summary: "renderer event", timestamp: 2 }],
			omittedEventCount: 2,
		},
		{ ok: false, id: ids.two, code: "unknown_agent", message: "Unknown sub-agent ID" },
	],
});

const sendInput = {
	messages: [
		{ id: ids.one, message: "PRIVATE_SEND_MESSAGE", delivery: "steer" },
		{ id: ids.two, message: "PRIVATE_SEND_MESSAGE_TWO" },
	],
};
const sendResult = result("send fallback", {
	generation: "sag1-renderer",
	requested: 2,
	accepted: 1,
	failed: 1,
	outcomes: [
		{ index: 0, ok: true, id: ids.one, state: "running", dispatch: "steer", assignmentSequence: 4, pendingMessageCount: 2 },
		{ index: 1, ok: false, id: ids.two, state: "blocked", code: "assignment_not_settled", message: "The blocked runtime has not settled" },
	],
});

const releaseInput = { ids: [ids.one, ids.two] };
const releaseResult = result("release fallback", {
	generation: "sag1-renderer",
	requested: 2,
	succeeded: 1,
	failed: 1,
	releasedTargets: 1,
	noOpTargets: 0,
	releasedLeases: 2,
	outcomes: [
		{
			index: 0,
			ok: true,
			id: ids.one,
			state: "blocked",
			action: "released",
			releasedLeases: 2,
			remainingLeases: 0,
			releasedKinds: ["file", "workspace"],
		},
		{ index: 1, ok: false, id: ids.two, state: "running", code: "lease_release_boundary", message: "Target is still running" },
	],
});

const reconfigureInput = {
	changes: [
		{ id: ids.one, modelPolicy: "auto", complexity: "complex", runningBehavior: "queue" },
		{ id: ids.two, modelPolicy: "inherit", runningBehavior: "abort-and-switch" },
	],
};
const reconfigureResult = result("reconfigure fallback", {
	generation: "sag1-renderer",
	requested: 2,
	succeeded: 1,
	failed: 1,
	applied: 0,
	queued: 1,
	abortedAndApplied: 0,
	truncatedAgentDetails: 0,
	outputTruncated: false,
	outcomes: [
		{
			index: 0,
			ok: true,
			id: ids.one,
			state: "running",
			action: "queued",
			oldRoute: { provider: "fixture", model: "gpt-5.6-terra" },
			newRoute: { provider: "fixture", model: "gpt-5.6-sol", tier: "complex", fallbackUsed: false },
			thinking: { old: "high", requested: "xhigh", effective: "xhigh" },
			afterAssignmentSequence: 4,
		},
		{ index: 1, ok: false, id: ids.two, state: "failed", code: "target_failed", message: "Cannot reconfigure failed target" },
	],
});

const waitInput = { ids: [ids.one, ids.two], condition: "all", states: ["idle", "blocked"], timeoutSeconds: 10 };
const waitProgressResult = result("wait progress", {
	phase: "waiting",
	generation: "sag1-renderer",
	selection: "selected",
	condition: "all",
	states: ["idle", "blocked"],
	requested: 2,
	returned: 2,
	matched: 1,
	failed: 0,
	omitted: 0,
	elapsedMs: 1_250,
	outcomes: [
		{ ok: true, id: ids.one, state: "idle", matched: true, assignmentSequence: 4, activeToolCount: 0, pendingMessageCount: 0 },
		{ ok: true, id: ids.two, state: "running", matched: false, assignmentSequence: 2, activeToolCount: 1, pendingMessageCount: 2 },
	],
});
const waitResult = result("wait fallback", {
	phase: "complete",
	generation: "sag1-renderer",
	selection: "selected",
	condition: "all",
	states: ["idle", "blocked"],
	timeoutSeconds: 10,
	completion: "satisfied",
	satisfied: true,
	timedOut: false,
	requested: 2,
	returned: 2,
	succeeded: 2,
	failed: 0,
	matched: 2,
	omitted: 0,
	elapsedMs: 2_500,
	usageDrained: { input: 5, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 8, cost: 0.1 },
	usageDrainFailures: 0,
	truncatedAgentDetails: 0,
	outputTruncated: false,
	outcomes: [
		{
			ok: true,
			id: ids.one,
			name: "wait alpha",
			state: "idle",
			matched: true,
			updatedAt: 2,
			assignment: { sequence: 4, state: "completed", startedAt: 1, endedAt: 2 },
			output: { kind: "result", summary: "WAIT_EXPANDED_RESULT", details: "bounded wait detail", files: ["src/wait.ts"], omittedFileCount: 0, timestamp: 2 },
			usageDrained: { input: 5, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 8, cost: 0.1 },
		},
		{ ok: true, id: ids.two, name: "wait beta", state: "blocked", matched: true, updatedAt: 2, blocker: "parent decision required" },
	],
});

const removeInput = { scope: "selected", ids: [ids.one, ids.two], mode: "graceful", gracePeriodSeconds: 5 };
const removeResult = result("remove fallback", {
	generation: "sag1-renderer",
	scope: "selected",
	mode: "graceful",
	gracePeriodSeconds: 5,
	requested: 2,
	returned: 2,
	succeeded: 1,
	failed: 1,
	newlyRemoved: 1,
	alreadyRemoved: 0,
	forcedAborts: 1,
	gracefulCompleted: 0,
	omitted: 0,
	elapsedMs: 5_000,
	usageDrained: { input: 2, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: 0.02 },
	usageDrainFailures: 0,
	truncatedAgentDetails: 0,
	outputTruncated: false,
	outcomes: [
		{
			index: 0,
			ok: true,
			id: ids.one,
			name: "remove alpha",
			state: "removed",
			mode: "graceful",
			initialState: "running",
			forcedAbort: true,
			grace: { requested: true, outcome: "timed_out", escalated: true, durationMs: 5_000 },
			output: { kind: "report", summary: "REMOVE_EXPANDED_REPORT", details: "bounded remove detail", files: ["src/remove.ts"], omittedFileCount: 0, timestamp: 2 },
			usageDrained: { input: 2, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: 0.02 },
		},
		{ index: 1, ok: false, id: ids.two, state: "failed", code: "remove_failed", message: "Could not remove target" },
	],
});

test("all management tools render compact calls/results, expanded bounded detail, and reuse row components", () => {
	const fixtures = [
		{ tool: createSubAgentsSpawnTool(() => undefined), input: spawnInput, result: spawnResult, compact: "1 started", expanded: "gpt-5.6-luna" },
		{ tool: createSubAgentsStatusTool(() => undefined), input: statusInput, result: statusResult, compact: "1 agents", expanded: "renderer event" },
		{ tool: createSubAgentsSendTool(() => undefined), input: sendInput, result: sendResult, compact: "1 accepted", expanded: "assignment_not_settled" },
		{ tool: createSubAgentsReleaseTool(() => undefined), input: releaseInput, result: releaseResult, compact: "1 released", expanded: "lease_release_boundary" },
		{ tool: createSubAgentsReconfigureTool(() => undefined), input: reconfigureInput, result: reconfigureResult, compact: "1 queued", expanded: "gpt-5.6-sol" },
		{ tool: createSubAgentsWaitTool(() => undefined), input: waitInput, result: waitResult, compact: "2/2 matched", expanded: "WAIT_EXPANDED_RESULT" },
		{ tool: createSubAgentsRemoveTool(() => undefined), input: removeInput, result: removeResult, compact: "1 removed", expanded: "REMOVE_EXPANDED_REPORT" },
	];

	for (const fixture of fixtures) {
		const call = fixture.tool.renderCall(fixture.input, theme(), context(fixture.input));
		const reusedCall = fixture.tool.renderCall(fixture.input, theme("new:"), context(fixture.input, call));
		assert.strictEqual(reusedCall, call, `${fixture.tool.name} call renderer replaced its component`);
		assert.match(rendered(reusedCall), /new:/);
		assertWidthSafe(reusedCall);

		const compact = fixture.tool.renderResult(
			fixture.result,
			{ expanded: false, isPartial: false },
			theme(),
			context(fixture.input),
		);
		assert.match(rendered(compact), new RegExp(fixture.compact));
		assert.doesNotMatch(rendered(compact), new RegExp(fixture.expanded));
		assertWidthSafe(compact);

		const expanded = fixture.tool.renderResult(
			fixture.result,
			{ expanded: true, isPartial: false },
			theme("expanded:"),
			context(fixture.input, compact),
		);
		assert.strictEqual(expanded, compact, `${fixture.tool.name} result renderer replaced its component`);
		assert.match(rendered(expanded), new RegExp(fixture.expanded));
		assert.match(rendered(expanded), /expanded:/);
		assertWidthSafe(expanded);
	}

	const sendCall = rendered(createSubAgentsSendTool(() => undefined).renderCall(sendInput, theme(), context(sendInput)));
	assert.doesNotMatch(sendCall, /PRIVATE_SEND_MESSAGE/);
	const spawnCall = rendered(createSubAgentsSpawnTool(() => undefined).renderCall(spawnInput, theme(), context(spawnInput)));
	assert.doesNotMatch(spawnCall, /PRIVATE_SPAWN_OBJECTIVE/);
	const expandedStatus = rendered(
		createSubAgentsStatusTool(() => undefined).renderResult(
			statusResult,
			{ expanded: true, isPartial: false },
			theme(),
			context(statusInput),
		),
	);
	assert.doesNotMatch(expandedStatus, /PRIVATE_STATUS_OBJECTIVE/);
});

test("wait partial updates show expanded per-target state, stay compact by default, and reuse the component", () => {
	const tool = createSubAgentsWaitTool(() => undefined);
	const compact = tool.renderResult(
		waitProgressResult,
		{ expanded: false, isPartial: true },
		theme(),
		context(waitInput, undefined, { isPartial: true, expanded: false }),
	);
	assert.match(rendered(compact), /1\/2 matched/);
	assert.doesNotMatch(rendered(compact), /sa1-renderer-2-beta/);

	const expanded = tool.renderResult(
		waitProgressResult,
		{ expanded: true, isPartial: true },
		theme(),
		context(waitInput, compact, { isPartial: true, expanded: true }),
	);
	assert.strictEqual(expanded, compact);
	assert.match(rendered(expanded), /sa1-renderer-1-alpha/);
	assert.match(rendered(expanded), /tools 1 · queued 2/);
	assertWidthSafe(expanded);
});

test("renderer fallbacks and dynamic fields strip terminal controls before width-safe display", () => {
	assert.equal(cleanRendererLine("alpha\u0000\u001b[31mred\u001b[0m\u2028beta"), "alpha red beta");
	const tool = createSubAgentsSendTool(() => undefined);
	const fallback = tool.renderResult(
		{ content: [{ type: "text", text: "fallback\u0007\u001b[31m red\u001b[0m\nsecond" }], details: undefined },
		{ expanded: true, isPartial: false },
		theme(),
		context(sendInput),
	);
	const text = rendered(fallback);
	assert.match(text, /fallback red/);
	assert.match(text, /second/);
	assert.doesNotMatch(text, FORBIDDEN_CONTROLS);
	assertWidthSafe(fallback);
});
