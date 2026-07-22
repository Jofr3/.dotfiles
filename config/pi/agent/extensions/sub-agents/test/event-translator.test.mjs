import assert from "node:assert/strict";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	ChildEventTranslator,
	createChildEventTranslator,
} = await importSubAgentsModule("event-translator.ts");
const { SubAgentManager, createSessionGeneration } = await importSubAgentsModule("manager.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");

function deterministicManager(label) {
	let nonce = 0;
	let now = 10_000;
	return {
		manager: new SubAgentManager({
			cwd: process.cwd(),
			generation: createSessionGeneration(label),
			nonce: () => `${label}-${++nonce}`,
			now: () => ++now,
			cleanupTimeoutMs: 100,
		}),
		now: () => ++now,
	};
}

function spec(name) {
	return {
		name,
		role: "Translate one synthetic child event stream",
		objective: "Verify bounded runtime activity and lifecycle state.",
	};
}

function usage({ input = 0, output = 0, cacheRead = 0, cacheWrite = 0, totalTokens, cost = 0 } = {}) {
	return {
		input,
		output,
		cacheRead,
		cacheWrite,
		totalTokens: totalTokens ?? input + output + cacheRead + cacheWrite,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
	};
}

function assistant({
	text,
	thinking,
	stopReason = "stop",
	errorMessage,
	messageUsage = usage(),
} = {}) {
	const content = [];
	if (thinking !== undefined) content.push({ type: "thinking", thinking });
	if (text !== undefined) content.push({ type: "text", text });
	return {
		role: "assistant",
		content,
		api: "faux",
		provider: "offline-translator",
		model: "offline-model",
		usage: messageUsage,
		stopReason,
		errorMessage,
		timestamp: 1,
	};
}

async function createRunningTranslator(label) {
	const fixture = deterministicManager(label);
	const created = fixture.manager.createAgent(spec(label));
	await fixture.manager.startAssignment(created.id);
	const translator = createChildEventTranslator({
		manager: fixture.manager,
		id: created.id,
		now: fixture.now,
	});
	assert.ok(translator instanceof ChildEventTranslator);
	return { ...fixture, created, translator };
}

test("child events become bounded previews, tool activity, timelines, usage, and an idle result", async () => {
	const { manager, created, translator } = await createRunningTranslator("bounded-events");
	const privateThinking = "PRIVATE_THINKING_MUST_NOT_BE_RETAINED";
	const privateDelta = "RAW_TOKEN_DELTA_MUST_NOT_BE_RETAINED";
	const privateArgs = "TOOL_ARGUMENTS_MUST_NOT_BE_RETAINED";
	const privatePartial = "PARTIAL_TOOL_OUTPUT_MUST_NOT_BE_RETAINED";
	const longPreview = `preview-${"x".repeat(SUB_AGENT_BOUNDS.streamingPreviewChars + 200)}-tail`;

	translator.handle({ type: "agent_start" });
	translator.handle({
		type: "message_update",
		message: assistant({ text: longPreview, thinking: privateThinking }),
		assistantMessageEvent: {
			type: "text_delta",
			contentIndex: 1,
			delta: privateDelta,
			partial: assistant({ text: longPreview, thinking: privateThinking }),
		},
	});
	translator.handle({
		type: "tool_execution_start",
		toolCallId: "call-read",
		toolName: "read",
		args: { path: privateArgs },
	});
	translator.handle({
		type: "tool_execution_update",
		toolCallId: "call-read",
		toolName: "read",
		args: { path: privateArgs },
		partialResult: { content: [{ type: "text", text: privatePartial }] },
	});
	await translator.flush();

	let snapshot = manager.getAgent(created.id);
	assert.equal(snapshot.state, "running");
	assert.equal(snapshot.runtime.phase, "tools");
	assert.equal(snapshot.runtime.streamingPreview.length, SUB_AGENT_BOUNDS.streamingPreviewChars);
	assert.ok(snapshot.runtime.streamingPreview.endsWith("-tail"));
	assert.equal(snapshot.runtime.activeToolCount, 1);
	assert.deepEqual(snapshot.runtime.activeTools.map(({ toolCallId, toolName }) => ({ toolCallId, toolName })), [
		{ toolCallId: "call-read", toolName: "read" },
	]);
	assert.doesNotMatch(JSON.stringify(snapshot), new RegExp([
		privateThinking,
		privateDelta,
		privateArgs,
		privatePartial,
	].join("|")));

	translator.handle({
		type: "tool_execution_end",
		toolCallId: "call-read",
		toolName: "read",
		result: { content: [{ type: "text", text: privatePartial }] },
		isError: true,
	});
	const final = assistant({
		text: "bounded final result",
		messageUsage: usage({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4, totalTokens: 10, cost: 0.1 }),
	});
	translator.handle({ type: "message_end", message: final });
	translator.handle({
		type: "turn_end",
		message: final,
		toolResults: [
			{
				role: "toolResult",
				toolCallId: "nested",
				toolName: "offline-nested",
				content: [{ type: "text", text: "done" }],
				usage: usage({ input: 5, output: 6, totalTokens: 11, cost: 0.2 }),
				isError: false,
				timestamp: 2,
			},
		],
	});
	translator.handle({ type: "compaction_start", reason: "threshold" });
	translator.handle({
		type: "compaction_end",
		reason: "threshold",
		result: {
			summary: "bounded compacted context",
			firstKeptEntryId: "entry",
			tokensBefore: 100,
			usage: usage({ input: 7, output: 8, totalTokens: 15, cost: 0.3 }),
		},
		aborted: false,
		willRetry: false,
	});
	translator.handle({ type: "queue_update", steering: ["one"], followUp: ["two", "three"] });
	translator.handle({ type: "agent_end", messages: [final], willRetry: false });
	translator.handle({ type: "agent_settled" });
	await translator.flush();

	snapshot = manager.getAgent(created.id);
	assert.equal(snapshot.state, "idle", "a failed tool call does not fail a later successful child run");
	assert.equal(snapshot.latestResult.summary, "bounded final result");
	assert.deepEqual(snapshot.runtime, {
		phase: "settled",
		streamingPreview: undefined,
		activeToolCount: 0,
		activeTools: [],
		pendingMessageCount: 0,
	});
	assert.deepEqual(snapshot.usage.totals, {
		input: 13,
		output: 16,
		cacheRead: 3,
		cacheWrite: 4,
		totalTokens: 36,
		cost: 0.6000000000000001,
	});
	assert.equal(snapshot.usage.turns, 1);
	assert.ok(snapshot.events.some((event) => event.summary === "Tool failed: read"));
	assert.ok(snapshot.events.some((event) => event.summary === "Compaction completed: threshold"));
	assert.doesNotMatch(JSON.stringify(snapshot.events), new RegExp([
		privateThinking,
		privateDelta,
		privateArgs,
		privatePartial,
	].join("|")));
	await translator.close();
	await manager.disposeAll("bounded event test complete");
});

test("retries replace terminal failures while final errors and explicit blockers transition safely", async () => {
	const retrying = await createRunningTranslator("retry-success");
	const firstError = assistant({
		stopReason: "error",
		errorMessage: "transient offline failure",
		messageUsage: usage({ input: 2, totalTokens: 2 }),
	});
	retrying.translator.handle({
		type: "turn_end",
		message: firstError,
		toolResults: [],
	});
	retrying.translator.handle({ type: "agent_end", messages: [firstError], willRetry: true });
	retrying.translator.handle({
		type: "auto_retry_start",
		attempt: 1,
		maxAttempts: 2,
		delayMs: 1,
		errorMessage: "PRIVATE_RETRY_ERROR_NOT_RETAINED",
	});
	const recovered = assistant({
		text: "retry recovered",
		messageUsage: usage({ output: 3, totalTokens: 3 }),
	});
	retrying.translator.handle({ type: "turn_end", message: recovered, toolResults: [] });
	retrying.translator.handle({ type: "auto_retry_end", success: true, attempt: 1 });
	retrying.translator.handle({ type: "agent_end", messages: [recovered], willRetry: false });
	retrying.translator.handle({ type: "agent_settled" });
	await retrying.translator.flush();
	const recoveredSnapshot = retrying.manager.getAgent(retrying.created.id);
	assert.equal(recoveredSnapshot.state, "idle");
	assert.equal(recoveredSnapshot.latestResult.summary, "retry recovered");
	assert.equal(recoveredSnapshot.usage.turns, 2);
	assert.doesNotMatch(JSON.stringify(recoveredSnapshot), /PRIVATE_RETRY_ERROR_NOT_RETAINED/);

	const failing = await createRunningTranslator("terminal-failure");
	const terminalError = assistant({
		stopReason: "error",
		errorMessage: "bounded terminal model failure",
	});
	failing.translator.handle({ type: "turn_end", message: terminalError, toolResults: [] });
	failing.translator.handle({ type: "agent_end", messages: [terminalError], willRetry: false });
	failing.translator.handle({ type: "agent_settled" });
	await failing.translator.flush();
	const failedSnapshot = failing.manager.getAgent(failing.created.id);
	assert.equal(failedSnapshot.state, "failed");
	assert.equal(failedSnapshot.lastError, "bounded terminal model failure");
	assert.equal(failedSnapshot.currentAssignment.state, "failed");

	const blocked = await createRunningTranslator("explicit-blocker");
	await blocked.translator.recordBlocker({
		summary: "Parent input is required",
		needs: "Choose one supported path",
	});
	blocked.translator.handle({ type: "agent_settled" });
	await blocked.translator.flush();
	const blockedSnapshot = blocked.manager.getAgent(blocked.created.id);
	assert.equal(blockedSnapshot.state, "blocked");
	assert.equal(blockedSnapshot.currentAssignment.blocker, "Choose one supported path");
	assert.equal(blockedSnapshot.runtime.phase, "settled");

	await Promise.all([
		retrying.manager.disposeAll("retry test complete"),
		failing.manager.disposeAll("failure test complete"),
		blocked.manager.disposeAll("blocker test complete"),
	]);
});

test("high-volume activity keeps bounded summaries and one bounded event timeline", async () => {
	const { manager, created, translator } = await createRunningTranslator("activity-storm");
	translator.handle({ type: "agent_start" });
	const callCount = SUB_AGENT_BOUNDS.activeToolCalls + 40;
	for (let index = 0; index < callCount; index += 1) {
		translator.handle({
			type: "tool_execution_start",
			toolCallId: `call-${index}`,
			toolName: `read-${index}`,
			args: {},
		});
	}
	await translator.flush();
	let snapshot = manager.getAgent(created.id);
	assert.equal(snapshot.runtime.activeToolCount, callCount);
	assert.equal(snapshot.runtime.activeTools.length, SUB_AGENT_BOUNDS.activeToolCalls);

	for (let index = 0; index < callCount; index += 1) {
		translator.handle({
			type: "tool_execution_end",
			toolCallId: `call-${index}`,
			toolName: `read-${index}`,
			result: {},
			isError: false,
		});
	}
	translator.handle({ type: "agent_end", messages: [], willRetry: false });
	translator.handle({ type: "agent_settled" });
	await translator.flush();

	snapshot = manager.getAgent(created.id);
	assert.equal(snapshot.state, "idle");
	assert.equal(snapshot.latestResult.summary, "Assignment completed without a text result.");
	assert.equal(snapshot.runtime.activeToolCount, 0);
	assert.equal(snapshot.events.length, SUB_AGENT_BOUNDS.eventTimeline);
	assert.ok(snapshot.omittedEventCount > 0);
	await manager.disposeAll("activity storm complete");
});
