import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	SubAgentsReleaseError,
	executeSubAgentsRelease,
} = await importSubAgentsModule("tools/release.ts");
const {
	SubAgentManager,
	UnknownAgentIdError,
	createSessionGeneration,
} = await importSubAgentsModule("manager.ts");
const {
	resolveCanonicalWorkspacePath,
	resolveSharedWorkspace,
} = await importSubAgentsModule("workspace/paths.ts");

function agentSpec(name) {
	return {
		name,
		role: "Exercise exact retained-lease release controls",
		objective: "Own or release one deterministic shared-workspace lease.",
		tools: ["edit"],
		workspace: { mode: "shared", bashPolicy: "disabled" },
	};
}

async function fixture(label = "release") {
	const root = await mkdtemp(join(tmpdir(), `pi-sub-agent-${label}-`));
	await mkdir(join(root, "src"), { recursive: true });
	await writeFile(join(root, "src", "target.txt"), "alpha\n", "utf8");
	const workspace = await resolveSharedWorkspace(root);
	let nonce = 0;
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration(label),
		nonce: () => `${label}-${++nonce}`,
		modelRuntime: { async dispose() {} },
	});
	const target = await resolveCanonicalWorkspacePath({
		workspace: workspace.identity,
		path: "src/target.txt",
		allowMissing: false,
	});
	return { root, workspace, manager, target };
}

async function cleanup(value) {
	await value.manager.disposeAll("release test complete");
	await rm(value.root, { recursive: true, force: true });
}

test("sub_agents_release releases exact settled idle/blocked owners, preserves state/context, and is idempotent", async () => {
	const value = await fixture("release-success");
	try {
		const idle = value.manager.createAgent(agentSpec("idle-owner"));
		await value.manager.startAssignment(idle.id);
		await value.manager.claimChildFileLeases(idle.id, value.workspace.identity, [value.target]);
		await value.manager.completeAssignment(idle.id, { state: "idle", summary: "retaining ownership" });

		const blocked = value.manager.createAgent(agentSpec("blocked-owner"));
		await value.manager.startAssignment(blocked.id);
		await value.manager.claimChildWorkspaceLease(blocked.id, value.workspace.identity).catch(() => undefined);
		await value.manager.completeAssignment(blocked.id, {
			state: "blocked",
			summary: "blocked with no additional ownership",
			needs: "parent resolution",
		});
		const unsettled = await executeSubAgentsRelease(
			{ ids: [blocked.id] },
			undefined,
			{ manager: value.manager },
		);
		assert.equal(unsettled.details.failed, 1);
		assert.equal(unsettled.details.outcomes[0].code, "lease_release_boundary");
		assert.deepEqual(value.manager.getAgent(blocked.id).leases, []);
		await value.manager.updateRuntimeActivity(blocked.id, {
			phase: "settled",
			activeToolCount: 0,
			activeTools: [],
			pendingMessageCount: 0,
		});

		const first = await executeSubAgentsRelease(
			{ ids: [idle.id, blocked.id] },
			undefined,
			{ manager: value.manager },
		);
		assert.equal(first.details.requested, 2);
		assert.equal(first.details.succeeded, 2);
		assert.equal(first.details.failed, 0);
		assert.equal(first.details.releasedTargets, 1);
		assert.equal(first.details.noOpTargets, 1);
		assert.equal(first.details.releasedLeases, 1);
		assert.equal(first.details.outcomes[0].action, "released");
		assert.equal(first.details.outcomes[0].releasedLeases, 1);
		assert.deepEqual(first.details.outcomes[0].releasedKinds, ["file"]);
		assert.equal(first.details.outcomes[1].action, "no-op");
		assert.equal(value.manager.getAgent(idle.id).state, "idle");
		assert.equal(value.manager.getAgent(blocked.id).state, "blocked");
		assert.deepEqual(value.manager.getAgent(idle.id).leases, []);
		assert.equal(value.manager.getAgent(idle.id).assignmentCount, 1);

		const repeated = await executeSubAgentsRelease(
			{ ids: [idle.id] },
			undefined,
			{ manager: value.manager },
		);
		assert.equal(repeated.details.noOpTargets, 1);
		assert.equal(repeated.details.releasedLeases, 0);
	} finally {
		await cleanup(value);
	}
});

test("sub_agents_release isolates running/unknown/stale failures and redacts internal errors", async () => {
	const value = await fixture("release-failures");
	const other = await fixture("release-stale");
	try {
		const running = value.manager.createAgent(agentSpec("running-owner"));
		await value.manager.startAssignment(running.id);
		await value.manager.claimChildFileLeases(running.id, value.workspace.identity, [value.target]);

		const result = await executeSubAgentsRelease(
			{
				ids: [
					running.id,
					"sa1-release-failures-unknown",
					other.manager.createAgent(agentSpec("stale-owner")).id,
				],
			},
			undefined,
			{ manager: value.manager },
		);
		assert.equal(result.details.succeeded, 0);
		assert.equal(result.details.failed, 3);
		assert.deepEqual(
			result.details.outcomes.map((outcome) => outcome.code),
			["lease_release_boundary", "unknown_agent", "stale_agent"],
		);
		assert.equal(value.manager.getAgent(running.id).leases.length, 1);
		assert.doesNotMatch(JSON.stringify(result), /\/tmp\/|canonical|reservation token/i);
	} finally {
		await cleanup(value);
		await cleanup(other);
	}
});

test("maximum release failures preserve every exact ID below transport bounds", async () => {
	const ids = Array.from({ length: 100 }, (_, index) => {
		const prefix = `sa1-release-bounds-${index.toString().padStart(3, "0")}-`;
		return prefix + "x".repeat(200 - prefix.length);
	});
	const result = await executeSubAgentsRelease(
		{ ids },
		undefined,
		{
			manager: {
				generation: "sag1-release-bounds",
				getAgent(id) {
					throw new UnknownAgentIdError(id);
				},
				async releaseChildLeasesWithResult(id) {
					throw new UnknownAgentIdError(id);
				},
			},
		},
	);
	assert.equal(result.details.outcomes.length, ids.length);
	assert.equal(result.details.failed, ids.length);
	assert.deepEqual(result.details.outcomes.map((outcome) => outcome.id), ids);
	assert.ok(Buffer.byteLength(result.content[0].text, "utf8") < 48 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") < 48 * 1024);
});

test("sub_agents_release fails before side effects when inactive or already cancelled", async () => {
	const value = await fixture("release-cancelled");
	try {
		const idle = value.manager.createAgent(agentSpec("cancelled-owner"));
		await value.manager.startAssignment(idle.id);
		await value.manager.claimChildFileLeases(idle.id, value.workspace.identity, [value.target]);
		await value.manager.completeAssignment(idle.id, { state: "idle", summary: "ready" });

		await assert.rejects(
			executeSubAgentsRelease({ ids: [idle.id] }, undefined, undefined),
			(error) => error instanceof SubAgentsReleaseError && error.code === "manager_inactive",
		);
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(
			executeSubAgentsRelease({ ids: [idle.id] }, controller.signal, { manager: value.manager }),
			(error) => error instanceof SubAgentsReleaseError && error.code === "cancelled",
		);
		assert.equal(value.manager.getAgent(idle.id).leases.length, 1);
	} finally {
		await cleanup(value);
	}
});
