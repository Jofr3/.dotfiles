import assert from "node:assert/strict";
import test from "node:test";
import {
	importInstalledPackages,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const { SessionManager } = (await importInstalledPackages()).codingAgent;
const {
	HistoricalAgentIdError,
	SubAgentManager,
	createSessionGeneration,
} = await importSubAgentsModule("manager.ts");
const {
	SUB_AGENTS_STATE_CUSTOM_TYPE,
	SubAgentPersistenceError,
	parsePersistedSubAgentHistoryV1,
	reconstructSubAgentHistoryFromBranch,
} = await importSubAgentsModule("persistence.ts");
const { executeSubAgentsStatus } = await importSubAgentsModule("tools/status.ts");
const { executeSubAgentsWait } = await importSubAgentsModule("tools/wait.ts");
const { executeSubAgentsRemove } = await importSubAgentsModule("tools/remove.ts");
const { registerSubAgentsExtension } = await importSubAgentsModule("index.ts");

function counters(value = 0) {
	return {
		input: value,
		output: value,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: value * 2,
		cost: value / 100,
	};
}

function history(label, overrides = {}) {
	const generation = `sag1-${label}`;
	const state = overrides.state ?? "idle";
	const createdAt = overrides.createdAt ?? 1_000;
	const updatedAt = overrides.updatedAt ?? 1_200;
	const totals = overrides.totals ?? counters(2);
	const reported = overrides.reported ?? counters(1);
	const unreported = {
		input: totals.input - reported.input,
		output: totals.output - reported.output,
		cacheRead: totals.cacheRead - reported.cacheRead,
		cacheWrite: totals.cacheWrite - reported.cacheWrite,
		totalTokens: totals.totalTokens - reported.totalTokens,
		cost: totals.cost - reported.cost,
	};
	return {
		version: 1,
		generation,
		id: `sa1-${label}-1-fixture`,
		name: `${label}-worker`,
		role: "Represent one bounded historical checkpoint.",
		objectiveSummary: "Restore this checkpoint from only the active branch.",
		state,
		...(overrides.statusSummary ? { statusSummary: overrides.statusSummary } : {}),
		...(overrides.result === false
			? {}
			: {
					result: overrides.result ?? {
						summary: `${label} completed.`,
						completedAt: 1_150,
					},
				}),
		usage: {
			totals,
			reported,
			unreported,
			turns: 1,
			assignments: 1,
		},
		files: overrides.files ?? [`src/${label}.ts`],
		omittedFileCount: 0,
		createdAt,
		updatedAt,
		...(state === "removed"
			? {
					removedAt: overrides.removedAt ?? updatedAt,
					removalReason: overrides.removalReason ?? "Previous generation ended.",
				}
			: {}),
	};
}

function managerOptions(label) {
	let nonce = 0;
	let now = 10_000;
	return {
		cwd: process.cwd(),
		generation: createSessionGeneration(label),
		nonce: () => `nonce-${++nonce}`,
		now: () => ++now,
		cleanupTimeoutMs: 50,
	};
}

test("strict restoration parsing rejects malformed or inconsistent historical payloads", () => {
	const valid = history("strict-source");
	const parsed = parsePersistedSubAgentHistoryV1(valid);
	assert.deepEqual(parsed, valid);
	valid.files[0] = "mutated-after-parse.ts";
	assert.deepEqual(parsed.files, ["src/strict-source.ts"]);

	assert.throws(
		() => parsePersistedSubAgentHistoryV1({ ...history("unknown-field"), runtime: {} }),
		SubAgentPersistenceError,
	);
	assert.throws(
		() => parsePersistedSubAgentHistoryV1({
			...history("wrong-generation"),
			generation: "sag1-another-generation",
		}),
		SubAgentPersistenceError,
	);
	assert.throws(
		() => parsePersistedSubAgentHistoryV1({
			...history("bad-usage"),
			usage: {
				...history("bad-usage").usage,
				unreported: counters(99),
			},
		}),
		SubAgentPersistenceError,
	);
	assert.throws(
		() => parsePersistedSubAgentHistoryV1({
			...history("bad-removal"),
			removedAt: 1_200,
		}),
		SubAgentPersistenceError,
	);
	assert.throws(
		() => parsePersistedSubAgentHistoryV1({
			...history("string-cost"),
			usage: {
				...history("string-cost").usage,
				totals: { ...history("string-cost").usage.totals, cost: "0.02" },
			},
		}),
		SubAgentPersistenceError,
	);
	assert.throws(
		() => parsePersistedSubAgentHistoryV1({
			...history("oversized-id"),
			id: `sa1-${"x".repeat(300)}`,
		}),
		SubAgentPersistenceError,
	);
});

test("active-branch reconstruction keeps the latest checkpoint per ID across compaction and excludes abandoned branches", () => {
	const session = SessionManager.inMemory(process.cwd());
	session.appendCustomEntry("unrelated-state", { ignored: true });
	const oldA = history("branch-a", { updatedAt: 1_200 });
	const oldB = history("branch-b", { updatedAt: 1_210 });
	session.appendCustomEntry(SUB_AGENTS_STATE_CUSTOM_TYPE, oldA);
	session.appendCustomEntry(SUB_AGENTS_STATE_CUSTOM_TYPE, oldB);
	const branchPoint = session.getLeafId();

	session.appendCustomEntry(
		SUB_AGENTS_STATE_CUSTOM_TYPE,
		history("branch-a", {
			state: "removed",
			updatedAt: 1_400,
			removedAt: 1_400,
		}),
	);
	const abandonedLeaf = session.getLeafId();

	session.branch(branchPoint);
	session.appendCompaction("bounded summary", branchPoint, 2_000);
	const activeA = history("branch-a", {
		state: "blocked",
		statusSummary: "The active branch retained this blocker.",
		result: false,
		updatedAt: 1_300,
	});
	session.appendCustomEntry(SUB_AGENTS_STATE_CUSTOM_TYPE, activeA);
	session.appendCustomEntry(SUB_AGENTS_STATE_CUSTOM_TYPE, {
		...oldB,
		updatedAt: 1_350,
		unknown: "malformed latest checkpoint suppresses the older record",
	});

	assert.notEqual(session.getLeafId(), abandonedLeaf);
	const restored = reconstructSubAgentHistoryFromBranch(session.getBranch());
	assert.equal(restored.matchingEntries, 4);
	assert.equal(restored.invalidEntries, 1);
	assert.equal(restored.duplicateEntries, 2);
	assert.equal(restored.truncated, false);
	assert.deepEqual(restored.histories.map((entry) => entry.id), [activeA.id]);
	assert.equal(restored.histories[0].state, "blocked");
	assert.match(restored.histories[0].statusSummary, /active branch/);
});

test("active-branch reconstruction bounds the restored set newest-first", () => {
	const entries = [];
	for (let index = 0; index < 5; index += 1) {
		entries.push({
			type: "custom",
			id: `entry-${index}`,
			parentId: index === 0 ? null : `entry-${index - 1}`,
			timestamp: new Date(index).toISOString(),
			customType: SUB_AGENTS_STATE_CUSTOM_TYPE,
			data: history(`bounded-${index}`, { updatedAt: 1_200 + index }),
		});
	}
	const restored = reconstructSubAgentHistoryFromBranch(entries, 2);
	assert.deepEqual(
		restored.histories.map((entry) => entry.name),
		["bounded-4-worker", "bounded-3-worker"],
	);
	assert.equal(restored.truncated, true);
	assert.equal(restored.omittedCheckpointEntries, 3);
	assert.equal(restored.matchingEntries, 5);
});

test("the manager exposes restored checkpoints as immutable terminated history without reviving usage, leases, or IDs", async () => {
	const manager = new SubAgentManager(managerOptions("current-restoration"));
	const idle = parsePersistedSubAgentHistoryV1(history("old-idle"));
	const blocked = parsePersistedSubAgentHistoryV1(history("old-blocked", {
		state: "blocked",
		statusSummary: "Historical blocker needs a parent decision.",
		result: false,
		files: ["src/blocker.ts"],
	}));
	assert.deepEqual(manager.restoreHistoricalRecords([idle, blocked]), {
		restored: 2,
		duplicates: 0,
		rejected: 0,
		omitted: 0,
	});
	assert.equal(manager.getSummary().active, 0);
	assert.equal(manager.getSummary().historical, 2);
	assert.equal(manager.listAgents({ includeRemoved: false }).length, 0);

	const restored = manager.getAgent(blocked.id);
	assert.equal(restored.state, "removed");
	assert.equal(restored.restoredHistory.checkpointState, "blocked");
	assert.equal(restored.runtime.phase, "settled");
	assert.deepEqual(restored.leases, []);
	assert.deepEqual(restored.restoredHistory.files, ["src/blocker.ts"]);
	assert.match(restored.removalReason, /no live child runtime survived/i);
	restored.restoredHistory.files.push("mutated.ts");
	assert.deepEqual(manager.getAgent(blocked.id).restoredHistory.files, ["src/blocker.ts"]);

	assert.throws(
		() => manager.startAssignment(blocked.id, "must not revive"),
		(error) => error instanceof HistoricalAgentIdError && error.code === "historical_agent",
	);
	assert.throws(
		() => manager.drainUsage(blocked.id),
		(error) => error instanceof HistoricalAgentIdError && error.code === "historical_agent",
	);
	const created = manager.createAgent({
		name: "fresh-child",
		role: "Prove current IDs remain distinct.",
		objective: "Create a new current-generation child without reusing history.",
	});
	assert.match(created.id, /^sa1-current-restoration-/);
	assert.notEqual(created.id, idle.id);
	assert.equal(manager.getOverview().usage.totalTokens, idle.usage.totals.totalTokens + blocked.usage.totals.totalTokens);
	assert.equal(manager.getDashboardSnapshot(100, true).rows.some((row) => row.id === blocked.id), true);

	const currentGenerationHistory = {
		...idle,
		generation: manager.generation,
		id: `sa1-${manager.generation.slice("sag1-".length)}-history-fixture`,
	};
	assert.deepEqual(manager.restoreHistoricalRecords([currentGenerationHistory]), {
		restored: 0,
		duplicates: 0,
		rejected: 1,
		omitted: 0,
	});
	await manager.disposeAll("restoration test complete");
});

test("the production session_start path restores only the current SessionManager branch before tools become active", async () => {
	const session = SessionManager.inMemory(process.cwd());
	const persisted = history("production-start");
	session.appendCustomEntry(SUB_AGENTS_STATE_CUSTOM_TYPE, persisted);
	const handlers = new Map();
	const tools = new Map();
	const api = {
		on(name, handler) {
			handlers.set(name, handler);
		},
		registerTool(tool) {
			tools.set(tool.name, tool);
		},
		registerCommand() {},
		appendEntry(customType, data) {
			session.appendCustomEntry(customType, data);
		},
		sendMessage() {},
	};
	registerSubAgentsExtension(api);
	const context = {
		cwd: process.cwd(),
		mode: "rpc",
		hasUI: true,
		sessionManager: session,
		isProjectTrusted() {
			return true;
		},
		ui: {
			notify() {},
			setStatus() {},
			setWidget() {},
		},
	};
	await handlers.get("session_start")({ reason: "startup" }, context);
	const status = await tools.get("sub_agents_status").execute(
		"production-restored-status",
		{ ids: [persisted.id], includeRemoved: true },
		undefined,
		undefined,
		context,
	);
	assert.equal(status.details.succeeded, 1);
	assert.equal(status.details.outcomes[0].history.checkpointState, "idle");
	assert.equal(status.details.outcomes[0].state, "removed");
	const send = await tools.get("sub_agents_send").execute(
		"production-restored-send",
		{ messages: [{ id: persisted.id, message: "must not revive old runtime" }] },
		undefined,
		undefined,
		context,
	);
	assert.equal(send.details.accepted, 0);
	assert.equal(send.details.outcomes[0].state, "removed");
	await handlers.get("session_shutdown")({ reason: "quit" }, context);
});

test("status, wait, and repeated remove inspect restored history without draining old-session usage", async () => {
	const manager = new SubAgentManager(managerOptions("history-controls"));
	const persisted = parsePersistedSubAgentHistoryV1(history("control-history"));
	manager.restoreHistoricalRecords([persisted]);
	const runtime = { manager, now: () => 20_000 };

	const status = await executeSubAgentsStatus(
		{ ids: [persisted.id], includeRemoved: true, drainUsage: true },
		undefined,
		runtime,
	);
	assert.equal(status.details.failed, 0);
	assert.equal(status.details.outcomes[0].history.checkpointState, "idle");
	assert.equal(status.details.usageDrained.totalTokens, 0);
	assert.equal(status.details.outcomes[0].usage.unreported, true);

	const waited = await executeSubAgentsWait(
		{ ids: [persisted.id], states: ["removed"], timeoutSeconds: 1 },
		undefined,
		undefined,
		runtime,
	);
	assert.equal(waited.details.completion, "satisfied");
	assert.equal(waited.details.usageDrained.totalTokens, 0);
	assert.equal(waited.details.usageDrainFailures, 0);

	const removed = await executeSubAgentsRemove(
		{ scope: "selected", ids: [persisted.id], mode: "abort" },
		undefined,
		{ manager, runner: {} },
	);
	assert.equal(removed.details.succeeded, 1);
	assert.equal(removed.details.alreadyRemoved, 1);
	assert.equal(removed.details.outcomes[0].alreadyRemoved, true);
	assert.equal(removed.details.outcomes[0].usageDrainError, undefined);
	await manager.disposeAll("history controls complete");
});
