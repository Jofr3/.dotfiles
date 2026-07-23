import assert from "node:assert/strict";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const { SubAgentManager, createSessionGeneration } = await importSubAgentsModule("manager.ts");
const {
	SUB_AGENTS_STATE_CUSTOM_TYPE,
	createSubAgentPersistenceRuntime,
	persistedSubAgentHistoryByteLength,
} = await importSubAgentsModule("persistence.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");
const {
	resolveCanonicalWorkspacePath,
	resolveSharedWorkspace,
} = await importSubAgentsModule("workspace/paths.ts");

function managerOptions(label) {
	let nonce = 0;
	let now = 1_000;
	return {
		cwd: process.cwd(),
		generation: createSessionGeneration(label),
		nonce: () => `nonce-${++nonce}`,
		now: () => ++now,
		cleanupTimeoutMs: 50,
	};
}

function spec(name = "checkpoint-worker") {
	return {
		name,
		role: "Exercise bounded persistence checkpoints.",
		objective: "Prove that only meaningful historical boundaries become custom entries.",
	};
}

function modelRoute(modelId = "gpt-5.6-terra") {
	return {
		requestedPolicy: "auto",
		requestedComplexity: "moderate",
		selectedModel: { provider: "fixture-provider", id: modelId },
		selectedTier: "moderate",
		fallbackUsed: false,
		fallbackPath: [
			{
				source: "tier",
				modelId,
				complexity: "moderate",
				outcome: "selected",
			},
		],
		reason: "Selected the bounded persistence fixture route.",
	};
}

function usageDelta(output = 2) {
	return {
		input: 3,
		output,
		cacheRead: 1,
		cacheWrite: 0,
		totalTokens: 4 + output,
		cost: 0.05,
		turns: 1,
	};
}

test("meaningful idle, blocked, failed, removed, and usage-reporting boundaries append bounded checkpoints only", async () => {
	const manager = new SubAgentManager(managerOptions("checkpoint-events"));
	const appended = [];
	const runtime = createSubAgentPersistenceRuntime({
		manager,
		appendEntry(customType, data) {
			appended.push({ customType, data });
		},
	});
	const child = manager.createAgent(spec());
	await manager.startAssignment(child.id);

	for (let index = 0; index < 50; index += 1) {
		await manager.recordReport(child.id, {
			state: "progress",
			summary: `stream-safe progress ${index}`,
		});
		await manager.updateRuntimeActivity(child.id, {
			phase: "streaming",
			streamingPreview: `private transient preview ${index}`,
			activeToolCount: 0,
			activeTools: [],
			pendingMessageCount: 0,
		});
	}
	await manager.addUsage(child.id, usageDelta());
	assert.equal(appended.length, 0, "progress, previews, and running usage must not append entries");

	await manager.completeAssignment(child.id, {
		state: "idle",
		summary: "First assignment complete.",
		files: ["src/first.ts"],
	});
	assert.equal(appended.length, 1);
	assert.equal(appended[0].data.state, "idle");
	assert.equal(appended[0].data.usage.unreported.output, 2);

	await manager.recordRuntimeEvent(child.id, "Post-settlement observation only");
	assert.equal(appended.length, 1, "ordinary terminal-state events are not checkpoint boundaries");
	assert.equal(
		runtime.checkpointAgent(child.id),
		"duplicate",
		"updatedAt alone is not a semantic checkpoint change",
	);
	assert.equal(appended.length, 1);
	await manager.drainUsage(child.id);
	assert.equal(appended.length, 2, "a nonzero terminal usage drain refreshes the durable watermark");
	assert.equal(appended[1].data.usage.unreported.totalTokens, 0);
	await manager.drainUsage(child.id);
	assert.equal(appended.length, 2, "a zero usage drain is not meaningful");

	await manager.startAssignment(child.id, "Abort safely for model reconfiguration.");
	await manager.interruptAssignmentForReconfiguration(child.id);
	assert.equal(appended.length, 3);
	assert.equal(appended[2].data.state, "idle");
	assert.equal(appended[2].data.statusSummary, "Assignment aborted before completion.");
	assert.equal(appended[2].data.result, undefined, "a prior assignment result must not be misattributed");
	await manager.recordModelRoute(child.id, modelRoute());
	assert.equal(appended.length, 4);
	assert.equal(appended[3].data.modelRoute.selectedModel.id, "gpt-5.6-terra");

	await manager.startAssignment(child.id, "Reach a settled blocker.");
	await manager.completeAssignment(child.id, {
		state: "blocked",
		summary: "A parent decision is required.",
		needs: "Choose the supported behavior.",
	});
	assert.equal(appended.length, 5);
	assert.equal(appended[4].data.state, "blocked");
	assert.match(appended[4].data.statusSummary, /Choose/);
	await manager.recordReport(child.id, {
		state: "blocked",
		summary: "The blocker now has updated bounded evidence.",
		files: ["src/blocker-evidence.ts"],
		needs: "Review the updated evidence.",
	});
	assert.equal(appended.length, 6);
	assert.match(appended[5].data.statusSummary, /updated evidence/i);
	assert.equal(appended[5].data.files.includes("src/blocker-evidence.ts"), true);
	await manager.updateRuntimeActivity(child.id, {
		phase: "settled",
		activeToolCount: 0,
		activeTools: [],
		pendingMessageCount: 0,
	});
	await manager.resumeBlockedAssignment(child.id);
	await manager.addUsage(child.id, usageDelta(1));
	await manager.failAgent(child.id, new Error("PRIVATE_PROVIDER_ERROR_MUST_NOT_PERSIST"), {
		runtimeSettled: true,
	});
	assert.equal(appended.length, 7);
	assert.equal(appended[6].data.state, "failed");
	assert.equal(
		appended[6].data.statusSummary,
		"Sub-agent failed; runtime error text was not persisted.",
	);
	assert.doesNotMatch(JSON.stringify(appended[6].data), /PRIVATE_PROVIDER_ERROR_MUST_NOT_PERSIST/);

	await manager.removeAgent(child.id, "checkpoint test removal");
	assert.equal(appended.length, 8);
	assert.equal(appended[7].data.state, "removed");
	assert.equal(appended[7].data.removalReason, "checkpoint test removal");
	assert.match(appended[7].data.statusSummary, /removed after a failure/);
	assert.doesNotMatch(JSON.stringify(appended[7].data), /PRIVATE_PROVIDER_ERROR_MUST_NOT_PERSIST/);
	assert.ok(appended[7].data.usage.unreported.totalTokens > 0);
	await manager.drainUsage(child.id);
	assert.equal(appended.length, 9);
	assert.equal(appended[8].data.state, "removed");
	assert.equal(appended[8].data.usage.unreported.totalTokens, 0);
	await manager.removeAgent(child.id, "duplicate removal");
	assert.equal(appended.length, 9, "idempotent removal emits no duplicate checkpoint");

	for (const entry of appended) {
		assert.equal(entry.customType, SUB_AGENTS_STATE_CUSTOM_TYPE);
		assert.ok(
			persistedSubAgentHistoryByteLength(entry.data) <= SUB_AGENT_BOUNDS.persistenceEntryBytes,
		);
		assert.doesNotMatch(JSON.stringify(entry.data), /private transient preview/);
	}
	assert.deepEqual(runtime.checkpointAll(), {
		appended: 0,
		duplicates: 1,
		ignored: 0,
		failed: 0,
	});
	runtime.shutdown();
});

test("releasing retained idle leases refreshes persisted file metadata", async () => {
	const manager = new SubAgentManager(managerOptions("checkpoint-release"));
	const appended = [];
	const runtime = createSubAgentPersistenceRuntime({
		manager,
		appendEntry(customType, data) {
			appended.push({ customType, data });
		},
	});
	const child = manager.createAgent(spec("release-worker"));
	await manager.startAssignment(child.id);
	const workspace = await resolveSharedWorkspace(process.cwd());
	const target = await resolveCanonicalWorkspacePath({
		workspace: workspace.identity,
		cwd: workspace.cwd,
		path: "agent/extensions/sub-agents/persistence.ts",
	});
	await manager.claimChildFileLeases(child.id, workspace.identity, [target]);
	await manager.completeAssignment(child.id, {
		state: "idle",
		summary: "Lease-bearing assignment complete.",
	});
	assert.equal(appended.length, 1);
	assert.equal(appended[0].data.files.includes(target.relativePath), true);

	await manager.releaseChildLeases(child.id);
	assert.equal(appended.length, 2);
	assert.equal(appended[1].data.files.includes(target.relativePath), false);
	runtime.shutdown();
	await manager.disposeAll("release checkpoint test complete");
});

test("failed appends remain retryable and post-dispose bulk checkpointing captures lifecycle removals", async () => {
	const manager = new SubAgentManager(managerOptions("checkpoint-retry"));
	const appended = [];
	let failNextAppend = true;
	const runtime = createSubAgentPersistenceRuntime({
		manager,
		appendEntry(customType, data) {
			if (failNextAppend) {
				failNextAppend = false;
				throw new Error("synthetic append failure");
			}
			appended.push({ customType, data });
		},
	});
	const child = manager.createAgent(spec("retry-worker"));
	await manager.startAssignment(child.id);
	await manager.completeAssignment(child.id, {
		state: "idle",
		summary: "Retryable checkpoint ready.",
	});
	assert.equal(appended.length, 0, "a failed append must not be marked as persisted");
	assert.deepEqual(runtime.checkpointAll(), {
		appended: 1,
		duplicates: 0,
		ignored: 0,
		failed: 0,
	});
	assert.equal(appended[0].data.state, "idle");
	assert.deepEqual(runtime.checkpointAll(), {
		appended: 0,
		duplicates: 1,
		ignored: 0,
		failed: 0,
	});

	await manager.startAssignment(child.id, "Remain live until generation disposal.");
	await manager.addUsage(child.id, usageDelta());
	await manager.disposeAll("session generation replaced");
	assert.equal(appended.length, 1, "manager disposal clears listeners before cleanup removal events");
	assert.deepEqual(runtime.checkpointAll(), {
		appended: 1,
		duplicates: 0,
		ignored: 0,
		failed: 0,
	});
	assert.equal(appended[1].data.state, "removed");
	assert.equal(appended[1].data.removalReason, "session generation replaced");
	assert.ok(appended[1].data.usage.unreported.totalTokens > 0);
	assert.deepEqual(runtime.checkpointAll(), {
		appended: 0,
		duplicates: 1,
		ignored: 0,
		failed: 0,
	});

	runtime.shutdown();
	assert.deepEqual(runtime.checkpointAll(), {
		appended: 0,
		duplicates: 0,
		ignored: 0,
		failed: 0,
	});
});
