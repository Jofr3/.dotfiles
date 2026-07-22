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
	SubAgentAssignmentRunnerError,
} = await importSubAgentsModule("assignment-runner.ts");
const { createSubAgentSession } = await importSubAgentsModule("agent-runtime.ts");
const {
	SubAgentManager,
	UnknownAgentIdError,
	createSessionGeneration,
} = await importSubAgentsModule("manager.ts");
const {
	SubAgentsSendError,
	createSubAgentsSendTool,
} = await importSubAgentsModule("tools/send.ts");
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

function snapshot(id, state, sequence = 1) {
	return {
		id,
		state,
		assignmentCount: sequence,
		currentAssignment: sequence
			? { id: `${id}:assignment:${sequence}`, sequence, state }
			: undefined,
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
		toolCallId: "send-render",
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: true,
		showImages: false,
		isError: false,
	};
}

test("sub_agents_send dispatches idle prompts and running messages concurrently with per-target outcomes", async () => {
	const ids = {
		idle: "sa1-send-unit-1-idle",
		running: "sa1-send-unit-2-running",
		blocked: "sa1-send-unit-3-blocked",
		unknown: "sa1-send-unit-4-unknown",
	};
	const snapshots = new Map([
		[ids.idle, snapshot(ids.idle, "idle", 1)],
		[ids.running, snapshot(ids.running, "running", 2)],
		[ids.blocked, snapshot(ids.blocked, "blocked", 1)],
	]);
	const bothStarted = deferred();
	const starts = [];
	const delivered = [];
	const runtime = {
		manager: {
			generation: "sag1-send-unit",
			getAgent(id) {
				const current = snapshots.get(id);
				if (!current) throw new UnknownAgentIdError(id);
				return current;
			},
		},
		runner: {
			async prompt(id, message) {
				starts.push({ id, method: "prompt" });
				if (starts.length === 2) bothStarted.resolve();
				await bothStarted.promise;
				delivered.push({ id, message, delivery: "prompt" });
				const next = snapshot(id, "running", 2);
				snapshots.set(id, next);
				return {
					id,
					assignmentId: next.currentAssignment.id,
					accepted: true,
					snapshot: next,
				};
			},
			async send(id, message, delivery) {
				starts.push({ id, method: delivery });
				if (starts.length === 2) bothStarted.resolve();
				await bothStarted.promise;
				delivered.push({ id, message, delivery });
				return {
					id,
					assignmentId: snapshots.get(id).currentAssignment.id,
					delivery,
					accepted: true,
					pendingMessageCount: 3,
				};
			},
			async waitForAssignment() {
				throw new Error("unused");
			},
		},
	};
	const input = {
		messages: [
			{ id: ids.idle, message: "IDLE_MESSAGE_PRIVATE" },
			{ id: ids.running, message: "RUNNING_MESSAGE_PRIVATE", delivery: "steer" },
			{ id: ids.blocked, message: "BLOCKED_MESSAGE_PRIVATE" },
			{ id: ids.unknown, message: "UNKNOWN_MESSAGE_PRIVATE" },
		],
	};
	const tool = createSubAgentsSendTool(() => runtime);
	const result = await tool.execute("send-unit", input, undefined, undefined, {});

	assert.equal(starts.length, 2, "the two valid targets must cross the shared start barrier");
	assert.deepEqual(
		delivered
			.map(({ id, delivery }) => ({ id, delivery }))
			.sort((left, right) => left.id.localeCompare(right.id)),
		[
			{ id: ids.idle, delivery: "prompt" },
			{ id: ids.running, delivery: "steer" },
		],
	);
	assert.equal(result.details.requested, 4);
	assert.equal(result.details.accepted, 2);
	assert.equal(result.details.failed, 2);
	assert.deepEqual(result.details.outcomes.map((outcome) => outcome.index), [0, 1, 2, 3]);
	assert.equal(result.details.outcomes[0].dispatch, "prompt");
	assert.equal(result.details.outcomes[0].assignmentSequence, 2);
	assert.equal(result.details.outcomes[1].dispatch, "steer");
	assert.equal(result.details.outcomes[1].pendingMessageCount, 3);
	assert.equal(result.details.outcomes[2].code, "target_blocked");
	assert.equal(result.details.outcomes[3].code, "unknown_agent");
	assert.doesNotMatch(JSON.stringify(result), /MESSAGE_PRIVATE/);

	assert.equal(tool.executionMode, "parallel");
	assert.ok(tool.promptGuidelines.some((line) => /delivery=steer/.test(line)));
	const callComponent = tool.renderCall(input, fakeTheme(), renderContext(input));
	assert.match(callComponent.render(200).join("\n"), /4 targets · 1 steer/);
	const resultComponent = tool.renderResult(
		result,
		{ expanded: true, isPartial: false },
		fakeTheme(),
		renderContext(input),
	);
	const rendered = resultComponent.render(300).join("\n");
	assert.match(rendered, /2 accepted/);
	assert.match(rendered, /target_blocked/);
});

test("duplicate targets fail closed while independent targets still dispatch", async () => {
	const duplicate = "sa1-send-duplicates-1-duplicate";
	const unique = "sa1-send-duplicates-2-unique";
	const calls = [];
	const snapshots = new Map([
		[duplicate, snapshot(duplicate, "running", 1)],
		[unique, snapshot(unique, "running", 1)],
	]);
	const tool = createSubAgentsSendTool(() => ({
		manager: {
			generation: "sag1-send-duplicates",
			getAgent(id) {
				return snapshots.get(id);
			},
		},
		runner: {
			async prompt() {
				throw new Error("unused");
			},
			async send(id, message, delivery) {
				calls.push({ id, message, delivery });
				return {
					id,
					assignmentId: snapshots.get(id).currentAssignment.id,
					delivery,
					accepted: true,
					pendingMessageCount: 1,
				};
			},
			async waitForAssignment() {
				throw new Error("unused");
			},
		},
	}));
	const result = await tool.execute(
		"send-duplicates",
		{
			messages: [
				{ id: duplicate, message: "first duplicate" },
				{ id: unique, message: "unique message" },
				{ id: duplicate, message: "second duplicate", delivery: "steer" },
			],
		},
		undefined,
		undefined,
		{},
	);
	assert.deepEqual(calls, [{ id: unique, message: "unique message", delivery: "followUp" }]);
	assert.equal(result.details.accepted, 1);
	assert.deepEqual(result.details.outcomes.map((outcome) => outcome.ok), [false, true, false]);
	assert.equal(result.details.outcomes[0].code, "duplicate_target");
	assert.equal(result.details.outcomes[2].code, "duplicate_target");
});

test("assignment-boundary races re-read authoritative state without duplicating delivery", async () => {
	const idleToRunning = "sa1-send-race-1-idle-running";
	const runningToIdle = "sa1-send-race-2-running-idle";
	const snapshots = new Map([
		[idleToRunning, snapshot(idleToRunning, "idle", 1)],
		[runningToIdle, snapshot(runningToIdle, "running", 1)],
	]);
	const calls = [];
	let idlePromptAttempts = 0;
	let runningSendAttempts = 0;
	const runtime = {
		manager: {
			generation: "sag1-send-race",
			getAgent(id) {
				return snapshots.get(id);
			},
		},
		runner: {
			async prompt(id, message) {
				calls.push({ id, method: "prompt", message });
				if (id === idleToRunning && idlePromptAttempts++ === 0) {
					snapshots.set(id, snapshot(id, "running", 2));
					throw new SubAgentAssignmentRunnerError(
						"assignment_not_idle",
						"synthetic idle-to-running race",
						id,
					);
				}
				const next = snapshot(id, "running", 2);
				snapshots.set(id, next);
				return { id, assignmentId: next.currentAssignment.id, accepted: true, snapshot: next };
			},
			async send(id, message, delivery) {
				calls.push({ id, method: delivery, message });
				if (id === runningToIdle && runningSendAttempts++ === 0) {
					snapshots.set(id, snapshot(id, "idle", 1));
					throw new SubAgentAssignmentRunnerError(
						"assignment_not_running",
						"synthetic running-to-idle race",
						id,
					);
				}
				return {
					id,
					assignmentId: snapshots.get(id).currentAssignment.id,
					delivery,
					accepted: true,
					pendingMessageCount: 1,
				};
			},
			async waitForAssignment(id, assignmentId) {
				const current = snapshots.get(id);
				if (current.currentAssignment?.id !== assignmentId) {
					throw new SubAgentAssignmentRunnerError(
						"assignment_changed",
						"synthetic assignment changed",
						id,
					);
				}
				return current;
			},
		},
	};
	const tool = createSubAgentsSendTool(() => runtime);
	const result = await tool.execute(
		"send-race",
		{
			messages: [
				{ id: idleToRunning, message: "deliver exactly once after concurrent prompt" },
				{ id: runningToIdle, message: "deliver exactly once after settlement" },
			],
		},
		undefined,
		undefined,
		{},
	);
	assert.equal(result.details.accepted, 2);
	assert.equal(result.details.outcomes[0].dispatch, "followUp");
	assert.equal(result.details.outcomes[1].dispatch, "prompt");
	assert.deepEqual(
		calls.map(({ id, method }) => ({ id, method })),
		[
			{ id: idleToRunning, method: "prompt" },
			{ id: runningToIdle, method: "followUp" },
			{ id: idleToRunning, method: "followUp" },
			{ id: runningToIdle, method: "prompt" },
		],
	);
});

test("maximum send failures stay bounded and never echo message text", async () => {
	const ids = Array.from({ length: SUB_AGENT_BOUNDS.controlTargets }, (_, index) => {
		const prefix = `sa1-send-bounds-${index.toString().padStart(3, "0")}-`;
		return prefix + "x".repeat(SUB_AGENT_BOUNDS.agentIdChars - prefix.length);
	});
	const messages = ids.map((id, index) => ({
		id,
		message: `PRIVATE_SEND_PAYLOAD_${index}_${"m".repeat(SUB_AGENT_BOUNDS.objectiveChars - 30)}`,
	}));
	const tool = createSubAgentsSendTool(() => ({
		manager: {
			generation: "sag1-send-bounds",
			getAgent(id) {
				return snapshot(id, "blocked", 1);
			},
		},
		runner: {
			async prompt() {
				throw new Error("unused");
			},
			async send() {
				throw new Error("unused");
			},
			async waitForAssignment() {
				throw new Error("unused");
			},
		},
	}));
	const result = await tool.execute("send-bounds", { messages }, undefined, undefined, {});
	assert.equal(result.details.outcomes.length, SUB_AGENT_BOUNDS.controlTargets);
	assert.equal(result.details.failed, SUB_AGENT_BOUNDS.controlTargets);
	assert.ok(Buffer.byteLength(result.content[0].text, "utf8") < 48 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") < 48 * 1024);
	assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SEND_PAYLOAD/);
});

test("send fails closed before side effects and redacts unknown runner failures", async () => {
	const inactive = createSubAgentsSendTool(() => undefined);
	await assert.rejects(
		inactive.execute(
			"inactive",
			{ messages: [{ id: "sa1-inactive-1-child", message: "hello" }] },
			undefined,
			undefined,
			{},
		),
		(error) => error instanceof SubAgentsSendError && error.code === "manager_inactive",
	);

	const controller = new AbortController();
	controller.abort();
	let called = false;
	const cancelled = createSubAgentsSendTool(() => ({
		manager: {
			generation: "sag1-send-cancelled",
			getAgent() {
				called = true;
				throw new Error("unused");
			},
		},
		runner: {},
	}));
	await assert.rejects(
		cancelled.execute(
			"cancelled",
			{ messages: [{ id: "sa1-send-cancelled-1-child", message: "hello" }] },
			controller.signal,
			undefined,
			{},
		),
		(error) => error instanceof SubAgentsSendError && error.code === "cancelled",
	);
	assert.equal(called, false);

	const id = "sa1-send-private-1-child";
	const privateFailure = createSubAgentsSendTool(() => ({
		manager: {
			generation: "sag1-send-private",
			getAgent() {
				return snapshot(id, "running", 1);
			},
		},
		runner: {
			async prompt() {
				throw new Error("unused");
			},
			async send() {
				throw new Error("PRIVATE_PROVIDER_SEND_FAILURE");
			},
			async waitForAssignment() {
				throw new Error("unused");
			},
		},
	}));
	const redacted = await privateFailure.execute(
		"private",
		{ messages: [{ id, message: "PRIVATE_MESSAGE_TEXT" }] },
		undefined,
		undefined,
		{},
	);
	assert.equal(redacted.details.outcomes[0].code, "send_failed");
	assert.doesNotMatch(JSON.stringify(redacted), /PRIVATE_PROVIDER_SEND_FAILURE|PRIVATE_MESSAGE_TEXT/);
});

function userText(message) {
	if (typeof message.content === "string") return message.content;
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

test("the send tool reuses a production child for an idle assignment and a running follow-up", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-send-production-"));
	const { codingAgent, piAi } = await importInstalledPackages();
	const providerId = "send-production-provider";
	const faux = piAi.fauxProvider({ provider: providerId, tokensPerSecond: 100_000 });
	const modelRuntime = await codingAgent.ModelRuntime.create({
		credentials: new piAi.InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	modelRuntime.registerNativeProvider(faux.provider);
	const model = modelRuntime.getModel(providerId, "faux-1");
	assert.ok(model);
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration("send-production"),
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
	const secondStarted = deferred();
	const releaseSecond = deferred();
	let followUpWasVisible = false;
	try {
		faux.setResponses([
			piAi.fauxAssistantMessage("initial assignment complete"),
			async () => {
				secondStarted.resolve();
				await releaseSecond.promise;
				return piAi.fauxAssistantMessage("second assignment first response");
			},
			(context) => {
				followUpWasVisible = context.messages.some(
					(message) => message.role === "user" && userText(message) === "final follow-up message",
				);
				return piAi.fauxAssistantMessage("second assignment final response");
			},
		]);
		const launch = await runner.createAndLaunch(
			{
				name: "send-production-child",
				role: "Exercise reusable child messaging",
				objective: "complete the initial assignment",
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
		assert.equal(manager.getAgent(launch.id).state, "idle");

		const tool = createSubAgentsSendTool(() => ({ manager, runner }));
		const newAssignment = await tool.execute(
			"send-production-idle",
			{ messages: [{ id: launch.id, message: "start the second assignment" }] },
			undefined,
			undefined,
			{},
		);
		assert.equal(newAssignment.details.outcomes[0].dispatch, "prompt");
		await secondStarted.promise;
		const assignmentId = manager.getAgent(launch.id).currentAssignment.id;

		const followUp = await tool.execute(
			"send-production-running",
			{ messages: [{ id: launch.id, message: "final follow-up message" }] },
			undefined,
			undefined,
			{},
		);
		assert.equal(followUp.details.outcomes[0].dispatch, "followUp");
		releaseSecond.resolve();
		const settled = await runner.waitForAssignment(launch.id, assignmentId);
		assert.equal(settled.state, "idle");
		assert.equal(settled.assignmentCount, 2);
		assert.equal(settled.latestResult.summary, "second assignment final response");
		assert.equal(followUpWasVisible, true);
		assert.deepEqual(
			sessions[0].session.messages
				.filter((message) => message.role === "user")
				.map(userText),
			[
				"complete the initial assignment",
				"start the second assignment",
				"final follow-up message",
			],
		);
	} finally {
		releaseSecond.resolve();
		await manager.disposeAll("send production test complete");
		await rm(root, { recursive: true, force: true });
	}
});
