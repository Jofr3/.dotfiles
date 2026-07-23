import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const { SubAgentManager, createSessionGeneration } = await importSubAgentsModule("manager.ts");
const {
	SUB_AGENTS_EVENT_CUSTOM_TYPE,
	SubAgentNotificationInbox,
	createSubAgentNotificationRuntime,
} = await importSubAgentsModule("notifications.ts");

function deterministicManager(label = "notifications") {
	let nonce = 0;
	let now = 1_000;
	return new SubAgentManager({
		cwd: process.cwd(),
		generation: createSessionGeneration(label),
		nonce: () => `nonce-${++nonce}`,
		now: () => ++now,
		cleanupTimeoutMs: 100,
	});
}

function agentSpec(name, notifyOn) {
	return {
		name,
		role: "Exercise the bounded parent notification path",
		objective: "Produce one deterministic manager state transition.",
		notifyOn,
	};
}

test("the bounded inbox deduplicates repeated state events, evicts oldest overflow, and owns one timer", () => {
	const batches = [];
	let now = 100;
	const inbox = new SubAgentNotificationInbox({
		generation: "sag1-inbox",
		onBatch: (batch) => batches.push(batch),
		flushDelayMs: 1_000,
		maxEvents: 3,
		now: () => ++now,
	});

	assert.equal(
		inbox.enqueue({
			id: "child-a",
			name: "worker-a",
			state: "idle",
			summary: "first\nsummary\u0000",
			assignmentId: "assignment-a",
		}),
		true,
	);
	assert.equal(inbox.hasScheduledFlush, true);
	assert.equal(
		inbox.enqueue({
			id: "child-a",
			name: "worker-a",
			state: "idle",
			summary: "replacement summary",
			assignmentId: "assignment-a",
		}),
		true,
	);
	assert.equal(inbox.pendingCount, 1);
	assert.equal(inbox.deduplicatedCount, 1);
	assert.equal(inbox.hasScheduledFlush, true, "a duplicate must not create a second timer");

	for (const [id, state] of [
		["child-b", "blocked"],
		["child-c", "failed"],
		["child-d", "idle"],
	]) {
		assert.equal(inbox.enqueue({ id, name: id, state, summary: `${state} summary` }), true);
	}
	assert.equal(inbox.pendingCount, 3);
	assert.equal(inbox.omittedCount, 1);

	const batch = inbox.flushNow();
	assert.ok(batch);
	assert.equal(inbox.hasScheduledFlush, false);
	assert.equal(inbox.pendingCount, 0);
	assert.equal(batches.length, 1);
	assert.equal(batch, batches[0]);
	assert.deepEqual(batch.events.map((event) => event.id), ["child-b", "child-c", "child-d"]);
	assert.equal(batch.omitted, 1);
	assert.equal(batch.deduplicated, 1);
	assert.equal(Object.isFrozen(batch), true);
	assert.equal(Object.isFrozen(batch.events), true);

	assert.equal(inbox.enqueue({ id: "late", name: "late", state: "failed", summary: "late" }), true);
	inbox.shutdown();
	inbox.shutdown();
	assert.equal(inbox.closed, true);
	assert.equal(inbox.hasScheduledFlush, false);
	assert.equal(inbox.pendingCount, 0);
	assert.equal(inbox.enqueue({ id: "ignored", name: "ignored", state: "idle", summary: "ignored" }), false);
});

test("manager observers receive defensive bounded events without affecting authoritative state", async () => {
	const manager = deterministicManager("manager-events");
	const observed = [];
	const unsubscribe = manager.subscribeEvents((event) => observed.push(event));
	manager.subscribeEvents(() => {
		throw new Error("observer failure must be isolated");
	});
	const child = manager.createAgent(agentSpec("observed-worker", ["idle"]));
	await manager.startAssignment(child.id);
	const completed = await manager.completeAssignment(child.id, {
		state: "idle",
		summary: "observed result",
	});
	assert.equal(completed.state, "idle");
	assert.ok(observed.length > 0);
	assert.equal(Object.isFrozen(observed.at(-1)), true);
	assert.equal(Object.isFrozen(observed.at(-1).event), true);
	assert.equal(Object.isFrozen(observed.at(-1).notifyOn), true);
	assert.equal(observed.at(-1).notificationSummary, "observed result");
	const countBeforeUnsubscribe = observed.length;
	unsubscribe();
	unsubscribe();
	await manager.recordRuntimeEvent(child.id, "not observed after unsubscribe");
	assert.equal(observed.length, countBeforeUnsubscribe);
	await manager.disposeAll("manager event cleanup");
});

test("configured idle, blocker, and failure manager events coalesce into bounded parent follow-ups", async () => {
	const manager = deterministicManager("runtime");
	const sent = [];
	const runtime = createSubAgentNotificationRuntime({
		manager,
		flushDelayMs: 1_000,
		sendMessage(message, options) {
			sent.push({ message, options });
		},
	});

	const completed = [];
	for (let index = 0; index < 10; index += 1) {
		const child = manager.createAgent(agentSpec(`worker-${index}`, ["idle"]));
		completed.push(child);
		await manager.startAssignment(child.id);
		await manager.completeAssignment(child.id, {
			state: "idle",
			summary: `result ${index}`,
		});
	}
	assert.equal(runtime.pendingCount, 10);
	assert.equal(runtime.hasScheduledFlush, true);
	assert.equal(sent.length, 0);

	const firstBatch = runtime.flushNow();
	assert.ok(firstBatch);
	assert.equal(sent.length, 1);
	assert.deepEqual(sent[0].options, { deliverAs: "followUp", triggerTurn: true });
	assert.equal(sent[0].message.customType, SUB_AGENTS_EVENT_CUSTOM_TYPE);
	assert.equal(sent[0].message.display, true);
	assert.equal(sent[0].message.details.source, "sub-agents");
	assert.equal(sent[0].message.details.version, 1);
	assert.equal(sent[0].message.details.count, 10);
	assert.equal(sent[0].message.details.generation, manager.generation);
	assert.equal((sent[0].message.content.match(/worker-/g) ?? []).length, 10);
	assert.ok(Buffer.byteLength(sent[0].message.content, "utf8") < 48 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(sent[0].message.details), "utf8") < 48 * 1024);

	const progress = manager.createAgent(agentSpec("progress-only", ["idle", "blocked", "failed"]));
	await manager.startAssignment(progress.id);
	await manager.recordReport(progress.id, { state: "progress", summary: "do not wake the parent" });
	assert.equal(runtime.pendingCount, 0, "progress reports must remain internal");

	const failureOnly = manager.createAgent(agentSpec("failure-only", ["failed"]));
	await manager.startAssignment(failureOnly.id);
	await manager.completeAssignment(failureOnly.id, { state: "idle", summary: "not configured" });
	assert.equal(runtime.pendingCount, 0);
	await manager.failAgent(failureOnly.id, new Error("bounded failure"));
	assert.equal(runtime.pendingCount, 1);

	const blocked = manager.createAgent(agentSpec("blocked-worker", ["blocked"]));
	await manager.startAssignment(blocked.id);
	await manager.completeAssignment(blocked.id, {
		state: "blocked",
		summary: "orchestration is required",
		needs: "choose a safe path",
	});
	assert.equal(runtime.pendingCount, 2);

	const unconfigured = manager.createAgent(agentSpec("unconfigured", undefined));
	await manager.startAssignment(unconfigured.id);
	await manager.failAgent(unconfigured.id, new Error("must stay internal"));
	assert.equal(runtime.pendingCount, 2);

	runtime.flushNow();
	assert.equal(sent.length, 2);
	assert.deepEqual(
		sent[1].message.details.events.map((event) => [event.name, event.state, event.summary]),
		[
			["failure-only", "failed", "bounded failure"],
			["blocked-worker", "blocked", "orchestration is required"],
		],
	);

	await manager.recordRuntimeEvent(completed[0].id, "idle diagnostics must not repeat completion");
	await manager.recordRuntimeEvent(failureOnly.id, "late failed-state diagnostics must not repeat failure");
	await manager.trackBackground(
		failureOnly.id,
		Promise.reject(new Error("a second background failure must not repeat the terminal notification")),
	);
	assert.equal(runtime.pendingCount, 0);
	runtime.shutdown();
	await manager.failAgent(completed[0].id, new Error("late failure after shutdown"));
	assert.equal(runtime.pendingCount, 0);
	assert.equal(sent.length, 2);
	await manager.disposeAll("notification test cleanup");
});

test("maximum coalesced parent content and details remain below the notification transport budget", async () => {
	const manager = deterministicManager("maximum-transport");
	const sent = [];
	const runtime = createSubAgentNotificationRuntime({
		manager,
		flushDelayMs: 1_000,
		sendMessage(message, options) {
			sent.push({ message, options });
		},
	});
	for (let index = 0; index < 20; index += 1) {
		const dynamicName = index % 2 === 0 ? "\"".repeat(100) : "€".repeat(100);
		const dynamicSummary = index % 2 === 0 ? "\\".repeat(7_990) : "€".repeat(2_000);
		const child = manager.createAgent(
			agentSpec(`worker-${index}-${dynamicName}`, ["idle"]),
		);
		await manager.startAssignment(child.id);
		await manager.completeAssignment(child.id, {
			state: "idle",
			summary: `${index}-${dynamicSummary}`,
		});
	}
	runtime.flushNow();
	assert.equal(sent.length, 1);
	assert.equal(sent[0].message.details.count, 20);
	assert.ok(Buffer.byteLength(sent[0].message.content, "utf8") < 48 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(sent[0].message.details), "utf8") < 48 * 1024);
	runtime.shutdown();
	await manager.disposeAll("maximum transport cleanup");
});

test("delivery failures are contained and shutdown cancels pending manager notifications", async () => {
	const manager = deterministicManager("delivery-failure");
	const runtime = createSubAgentNotificationRuntime({
		manager,
		flushDelayMs: 1_000,
		sendMessage() {
			throw new Error("private sender failure");
		},
	});
	const child = manager.createAgent(agentSpec("failing-sender", ["idle"]));
	await manager.startAssignment(child.id);
	await manager.completeAssignment(child.id, { state: "idle", summary: "ready" });
	assert.doesNotThrow(() => runtime.flushNow());
	assert.equal(runtime.deliveryFailures, 1);

	const later = manager.createAgent(agentSpec("shutdown-pending", ["failed"]));
	await manager.startAssignment(later.id);
	await manager.failAgent(later.id, new Error("pending"));
	assert.equal(runtime.hasScheduledFlush, true);
	runtime.shutdown();
	assert.equal(runtime.hasScheduledFlush, false);
	assert.equal(runtime.pendingCount, 0);
	await manager.disposeAll("delivery failure cleanup");
});
