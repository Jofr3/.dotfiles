import assert from "node:assert/strict";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	UsageLedgerError,
	applyUsageDelta,
	beginUsageAssignment,
	createAssignmentUsage,
	createUsageCounters,
	createUsageLedger,
	drainUsageLedger,
	getUnreportedUsage,
	hasUnreportedUsage,
} = await importSubAgentsModule("usage-ledger.ts");
const {
	SubAgentManager,
	SubAgentManagerError,
	createSessionGeneration,
} = await importSubAgentsModule("manager.ts");

function deterministicManager(label) {
	let nonce = 0;
	let now = 20_000;
	return new SubAgentManager({
		cwd: process.cwd(),
		generation: createSessionGeneration(label),
		nonce: () => `${label}-${++nonce}`,
		now: () => ++now,
		cleanupTimeoutMs: 100,
	});
}

function agentSpec(name) {
	return {
		name,
		role: "Exercise atomic child usage accounting",
		objective: "Accumulate and drain deterministic fake usage without model calls.",
	};
}

const ZERO_USAGE = Object.freeze({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: 0,
});

test("usage ledger helpers attribute immutable totals per child and assignment", () => {
	const originalLedger = createUsageLedger();
	const originalAssignment = createAssignmentUsage();
	const startedLedger = beginUsageAssignment(originalLedger);
	const update = applyUsageDelta(startedLedger, originalAssignment, {
		input: 10,
		output: 4,
		cacheRead: 2,
		cacheWrite: 1,
		totalTokens: 17,
		cost: 0.25,
		turns: 2,
	});

	assert.deepEqual(originalLedger, {
		totals: ZERO_USAGE,
		reported: ZERO_USAGE,
		turns: 0,
		assignments: 0,
	});
	assert.deepEqual(originalAssignment, { totals: ZERO_USAGE, turns: 0 });
	assert.deepEqual(update.ledger.totals, {
		input: 10,
		output: 4,
		cacheRead: 2,
		cacheWrite: 1,
		totalTokens: 17,
		cost: 0.25,
	});
	assert.deepEqual(update.assignment.totals, update.ledger.totals);
	assert.equal(update.ledger.turns, 2);
	assert.equal(update.assignment.turns, 2);
	assert.equal(update.ledger.assignments, 1);
	assert.equal(hasUnreportedUsage(update.ledger), true);
	assert.deepEqual(getUnreportedUsage(update.ledger), update.ledger.totals);

	const drained = drainUsageLedger(update.ledger);
	assert.deepEqual(drained.delta, update.ledger.totals);
	assert.deepEqual(drained.ledger.reported, update.ledger.totals);
	assert.equal(hasUnreportedUsage(drained.ledger), false);
	assert.deepEqual(drainUsageLedger(drained.ledger).delta, ZERO_USAGE);
});

test("usage updates fail atomically on invalid values and aggregate overflow", () => {
	const ledger = beginUsageAssignment(createUsageLedger());
	const assignment = createAssignmentUsage();
	assert.throws(
		() => applyUsageDelta(ledger, assignment, { input: 1, output: Number.NaN }),
		(error) => error instanceof UsageLedgerError && error.code === "invalid_usage",
	);
	assert.deepEqual(ledger.totals, ZERO_USAGE);
	assert.deepEqual(assignment.totals, ZERO_USAGE);

	const nearLimit = applyUsageDelta(ledger, assignment, {
		input: Number.MAX_SAFE_INTEGER,
	}).ledger;
	assert.throws(
		() => applyUsageDelta(nearLimit, assignment, { input: 1 }),
		(error) => error instanceof UsageLedgerError && error.code === "invalid_usage",
	);
	assert.equal(nearLimit.totals.input, Number.MAX_SAFE_INTEGER);

	const invalidReported = createUsageLedger();
	invalidReported.reported.input = 1;
	assert.throws(
		() => getUnreportedUsage(invalidReported),
		(error) => error instanceof UsageLedgerError && error.code === "invalid_usage",
	);
	assert.deepEqual(createUsageCounters(), ZERO_USAGE);
});

test("the manager tracks each current assignment while retaining per-child totals", async () => {
	const manager = deterministicManager("per-assignment");
	const created = manager.createAgent(agentSpec("usage-child"));
	const first = await manager.startAssignment(created.id);
	assert.deepEqual(first.currentAssignment.usage, { totals: ZERO_USAGE, turns: 0 });

	await manager.addUsage(created.id, {
		input: 3,
		output: 2,
		totalTokens: 5,
		cost: 0.1,
		turns: 1,
	});
	const firstIdle = await manager.completeAssignment(created.id, {
		state: "idle",
		summary: "First usage boundary complete",
	});
	assert.deepEqual(firstIdle.currentAssignment.usage, {
		totals: {
			input: 3,
			output: 2,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 5,
			cost: 0.1,
		},
		turns: 1,
	});
	assert.deepEqual(await manager.drainUsage(created.id), firstIdle.usage.totals);

	await manager.startAssignment(created.id, "Exercise a second usage boundary.");
	await manager.addUsage(created.id, {
		cacheRead: 7,
		cacheWrite: 4,
		totalTokens: 11,
		cost: 0.2,
		turns: 2,
	});
	const second = manager.getAgent(created.id);
	assert.deepEqual(second.currentAssignment.usage, {
		totals: {
			input: 0,
			output: 0,
			cacheRead: 7,
			cacheWrite: 4,
			totalTokens: 11,
			cost: 0.2,
		},
		turns: 2,
	});
	assert.deepEqual(second.usage.totals, {
		input: 3,
		output: 2,
		cacheRead: 7,
		cacheWrite: 4,
		totalTokens: 16,
		cost: 0.30000000000000004,
	});
	assert.equal(second.usage.turns, 3);
	assert.equal(second.usage.assignments, 2);
	assert.deepEqual(await manager.drainUsage(created.id), {
		input: 0,
		output: 0,
		cacheRead: 7,
		cacheWrite: 4,
		totalTokens: 11,
		cost: 0.20000000000000004,
	});
	await manager.disposeAll("per-assignment usage test complete");
});

test("concurrent manager usage updates and drains neither lose nor double count", async () => {
	const manager = deterministicManager("concurrent-drain");
	const created = manager.createAgent(agentSpec("concurrent-usage-child"));
	await manager.startAssignment(created.id);

	await Promise.all(
		Array.from({ length: 64 }, () =>
			manager.addUsage(created.id, {
				input: 1,
				output: 2,
				totalTokens: 3,
				cost: 0.01,
				turns: 1,
			}),
		),
	);
	const beforeDrain = manager.getAgent(created.id);
	assert.equal(beforeDrain.usage.totals.input, 64);
	assert.equal(beforeDrain.currentAssignment.usage.totals.output, 128);
	assert.equal(beforeDrain.usage.turns, 64);

	const drains = await Promise.all(
		Array.from({ length: 16 }, () => manager.drainUsage(created.id)),
	);
	assert.equal(drains.filter((delta) => delta.input === 64).length, 1);
	assert.equal(drains.filter((delta) => delta.input === 0).length, 15);
	assert.equal(drains.reduce((sum, delta) => sum + delta.input, 0), 64);
	assert.equal(drains.reduce((sum, delta) => sum + delta.output, 0), 128);
	assert.equal(drains.reduce((sum, delta) => sum + delta.totalTokens, 0), 192);
	assert.equal(manager.getAgent(created.id).usage.reported.input, 64);

	const beforeInvalid = manager.getAgent(created.id);
	await assert.rejects(
		manager.addUsage(created.id, { input: 1, output: Number.POSITIVE_INFINITY }),
		(error) => error instanceof SubAgentManagerError && error.code === "invalid_usage",
	);
	assert.deepEqual(manager.getAgent(created.id).usage, beforeInvalid.usage);
	assert.deepEqual(manager.getAgent(created.id).currentAssignment.usage, beforeInvalid.currentAssignment.usage);

	await manager.addUsage(created.id, { output: 5, totalTokens: 5, cost: 0.5 });
	const finalDrains = await Promise.all([
		manager.drainUsage(created.id),
		manager.drainUsage(created.id),
	]);
	assert.equal(finalDrains.reduce((sum, delta) => sum + delta.output, 0), 5);
	assert.equal(finalDrains.reduce((sum, delta) => sum + delta.totalTokens, 0), 5);
	assert.equal(finalDrains.reduce((sum, delta) => sum + delta.cost, 0), 0.5);
	await manager.disposeAll("concurrent usage test complete");
});
