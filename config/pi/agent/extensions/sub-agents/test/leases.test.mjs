import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	WorkspaceLeaseConflictError,
	WorkspaceLeaseManager,
	WorkspaceLeaseManagerClosedError,
	WorkspaceLeaseManagerError,
} = await importSubAgentsModule("workspace/leases.ts");
const {
	resolveCanonicalWorkspacePath,
	resolveCanonicalWriteScope,
	resolveSharedWorkspace,
} = await importSubAgentsModule("workspace/paths.ts");
const { SubAgentManager, SubAgentManagerError } = await importSubAgentsModule("manager.ts");

async function fixture(prefix = "pi-sub-agent-leases-") {
	const temporary = await mkdtemp(join(tmpdir(), prefix));
	const project = join(temporary, "project");
	await mkdir(join(project, "src"), { recursive: true });
	const workspace = await resolveSharedWorkspace(project);
	return { temporary, project, workspace };
}

function createLeaseManager(workspaceRoot, generation = "sag1-lease-tests") {
	let now = 1_000;
	let nonce = 0;
	return new WorkspaceLeaseManager({
		generation,
		workspaceRoot,
		now: () => ++now,
		nonce: () => `reservation-${++nonce}`,
	});
}

function agent(number, generation = "lease-tests") {
	return {
		agentId: `sa1-${generation}-${number}-fixture`,
		agentName: `worker-${number}`,
	};
}

function assertConflict(error, expected = {}) {
	assert.equal(error?.name, WorkspaceLeaseConflictError.name);
	assert.equal(error?.code, "lease_conflict");
	for (const [field, value] of Object.entries(expected)) {
		assert.deepEqual(error.conflict[field], value);
	}
	assert.doesNotMatch(error.message, /reservation-/);
	return true;
}

test("file claims are canonical, idempotent, exclusive only on conflicts, and defensive", async () => {
	const { temporary, project, workspace } = await fixture();
	try {
		const firstPath = join(project, "src", "first.txt");
		const aliasPath = join(project, "src", "first-alias.txt");
		const secondPath = join(project, "src", "second.txt");
		await Promise.all([
			writeFile(firstPath, "first", "utf8"),
			writeFile(secondPath, "second", "utf8"),
		]);
		await symlink(firstPath, aliasPath);
		const first = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/first.txt",
		});
		const alias = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/first-alias.txt",
		});
		const second = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/second.txt",
		});
		assert.deepEqual(alias, first);

		const leases = createLeaseManager(workspace.identity.root);
		const owner = agent(1);
		const firstClaim = leases.claimChildFiles({
			...owner,
			workspace: workspace.identity,
			targets: [first],
		});
		const repeated = leases.claimChildFiles({
			...owner,
			workspace: workspace.identity,
			targets: [alias, first],
		});
		assert.deepEqual(repeated, firstClaim);
		assert.equal(firstClaim[0].path, "src/first.txt");
		assert.equal(firstClaim[0].ownerAgentId, owner.agentId);
		assert.equal(Object.isFrozen(firstClaim), true);
		assert.equal(Object.isFrozen(firstClaim[0]), true);

		const other = agent(2);
		assert.deepEqual(
			leases.claimChildFiles({
				...other,
				workspace: workspace.identity,
				targets: [second],
			}),
			[
				{
					kind: "file",
					workspaceKey: "shared",
					ownerAgentId: other.agentId,
					path: "src/second.txt",
					acquiredAt: 1_002,
				},
			],
		);
		assert.throws(
			() => leases.claimChildFiles({
				...other,
				workspace: workspace.identity,
				targets: [alias],
			}),
			(error) => assertConflict(error, {
				requestedKind: "file",
				path: "src/first.txt",
				ownerKind: "child",
				ownerAgentId: owner.agentId,
				ownerAgentName: owner.agentName,
				heldKind: "file",
				heldPath: "src/first.txt",
			}),
		);
		leases.assertInvariants();

		const snapshot = leases.listLeases();
		assert.throws(() => {
			snapshot[0].path = "mutated";
		}, TypeError);
		assert.notEqual(leases.listLeases()[0].path, "mutated");
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("post-create reconciliation narrows one exact provisional lease without reacquiring ownership", async () => {
	const { temporary, project, workspace } = await fixture();
	try {
		const existingPath = join(project, "src", "existing.txt");
		const createdPath = join(project, "src", "generated", "target.txt");
		await writeFile(existingPath, "existing", "utf8");
		const missing = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/generated/target.txt",
			allowMissing: true,
		});
		const existing = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/existing.txt",
			allowMissing: false,
		});
		const leases = createLeaseManager(workspace.identity.root);
		const owner = agent(1);
		const other = agent(2);
		leases.claimChildFiles({
			...owner,
			workspace: workspace.identity,
			targets: [missing],
		});
		assert.throws(
			() => leases.claimChildFiles({
				...other,
				workspace: workspace.identity,
				targets: [existing],
			}),
			(error) => assertConflict(error, { ownerAgentId: owner.agentId }),
		);

		await mkdir(join(project, "src", "generated"), { recursive: true });
		await writeFile(createdPath, "created", "utf8");
		const created = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/generated/target.txt",
			allowMissing: false,
		});
		const before = leases.listChildLeases(owner.agentId);
		const reconciled = leases.reconcileChildFile({
			...owner,
			workspace: workspace.identity,
			target: created,
		});
		assert.deepEqual(reconciled, before);
		assert.deepEqual(
			leases.claimChildFiles({
				...other,
				workspace: workspace.identity,
				targets: [existing],
			}).map((entry) => entry.path),
			["src/existing.txt"],
		);
		assert.deepEqual(
			leases.reconcileChildFile({
				...owner,
				workspace: workspace.identity,
				target: created,
			}),
			reconciled,
		);
		assert.throws(
			() => leases.reconcileChildFile({
				...agent(3),
				workspace: workspace.identity,
				target: created,
			}),
			(error) =>
				error instanceof WorkspaceLeaseManagerError &&
				error.code === "invalid_lease_request",
		);
		leases.assertInvariants();
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("sorted multi-file claims are all-or-nothing and never retain a partial contested set", async () => {
	const { temporary, workspace } = await fixture();
	try {
		await Promise.all([
			writeFile(join(workspace.identity.root, "src", "z.txt"), "z", "utf8"),
			writeFile(join(workspace.identity.root, "src", "a.txt"), "a", "utf8"),
		]);
		const scope = await resolveCanonicalWriteScope(workspace.identity, [
			"src/z.txt",
			"src/a.txt",
		]);
		const [a, z] = scope.paths;
		const leases = createLeaseManager(workspace.identity.root);
		const firstOwner = agent(1);
		const secondOwner = agent(2);
		leases.claimChildFiles({
			...firstOwner,
			workspace: workspace.identity,
			targets: [z],
		});

		assert.throws(
			() => leases.claimChildFiles({
				...secondOwner,
				workspace: workspace.identity,
				targets: [z, a],
			}),
			(error) => assertConflict(error, { ownerAgentId: firstOwner.agentId }),
		);
		assert.deepEqual(leases.listChildLeases(secondOwner.agentId), []);
		assert.doesNotThrow(() => leases.reserveParentFiles({
			reservationId: "reservation-free-a",
			workspace: workspace.identity,
			targets: [a],
		}));
		leases.assertInvariants();
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("workspace ownership and parent reservations enforce one symmetric non-blocking conflict matrix", async () => {
	const { temporary, workspace } = await fixture();
	try {
		await Promise.all([
			writeFile(join(workspace.identity.root, "src", "first.txt"), "first", "utf8"),
			writeFile(join(workspace.identity.root, "src", "second.txt"), "second", "utf8"),
		]);
		const first = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/first.txt",
		});
		const second = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/second.txt",
		});
		const leases = createLeaseManager(workspace.identity.root);
		const owner = agent(1);
		const other = agent(2);

		const parentFileReservation = leases.reserveParentFiles({
			reservationId: "reservation-parent-file",
			workspace: workspace.identity,
			targets: [first],
		});
		assert.throws(
			() => leases.reserveParentFiles({
				reservationId: "reservation-parent-file",
				workspace: workspace.identity,
				targets: [first],
			}),
			(error) =>
				error instanceof WorkspaceLeaseManagerError &&
				error.code === "duplicate_parent_reservation",
		);
		assert.doesNotThrow(() => leases.claimChildFiles({
			...owner,
			workspace: workspace.identity,
			targets: [second],
		}));
		assert.throws(
			() => leases.claimChildWorkspace({ ...other, workspace: workspace.identity }),
			(error) => assertConflict(error, {
				requestedKind: "workspace",
				ownerKind: "parent",
				heldKind: "parent-file",
				heldPath: "src/first.txt",
			}),
		);
		assert.deepEqual(
			leases.releaseParentReservation(parentFileReservation.token).map((entry) => entry.kind),
			["parent-file"],
		);
		const replacementParentFileReservation = leases.reserveParentFiles({
			reservationId: "reservation-parent-file",
			workspace: workspace.identity,
			targets: [first],
		});
		assert.notEqual(replacementParentFileReservation.token, parentFileReservation.token);
		assert.deepEqual(leases.releaseParentReservation(parentFileReservation.token), []);
		assert.throws(
			() => leases.claimChildFiles({
				...other,
				workspace: workspace.identity,
				targets: [first],
			}),
			(error) => assertConflict(error, { ownerKind: "parent" }),
		);
		leases.releaseParentReservation(replacementParentFileReservation.token);
		assert.throws(
			() => leases.reserveParentWorkspace({
				reservationId: "reservation-parent-workspace",
				workspace: workspace.identity,
			}),
			(error) => assertConflict(error, {
				requestedKind: "parent-workspace",
				ownerKind: "child",
				ownerAgentId: owner.agentId,
				heldKind: "file",
				heldPath: "src/second.txt",
			}),
		);
		leases.releaseChildLeases(owner.agentId);
		const parentWorkspaceReservation = leases.reserveParentWorkspace({
			reservationId: "reservation-parent-workspace",
			workspace: workspace.identity,
		});
		assert.throws(
			() => leases.claimChildFiles({
				...other,
				workspace: workspace.identity,
				targets: [first],
			}),
			(error) => assertConflict(error, {
				requestedKind: "file",
				ownerKind: "parent",
				heldKind: "parent-workspace",
			}),
		);
		leases.releaseParentReservation(parentWorkspaceReservation.token);

		leases.claimChildWorkspace({ ...owner, workspace: workspace.identity });
		assert.doesNotThrow(() => leases.claimChildFiles({
			...owner,
			workspace: workspace.identity,
			targets: [first],
		}));
		assert.throws(
			() => leases.reserveParentFiles({
				reservationId: "reservation-conflicted",
				workspace: workspace.identity,
				targets: [second],
			}),
			(error) => assertConflict(error, {
				requestedKind: "parent-file",
				ownerAgentId: owner.agentId,
				heldKind: "workspace",
			}),
		);
		leases.assertInvariants();
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("missing names in one canonical provisional namespace coordinate conservatively", async () => {
	const { temporary, workspace } = await fixture();
	try {
		const first = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/missing-a/first.txt",
		});
		const second = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/missing-b/second.txt",
		});
		assert.equal(first.provisionalNamespace, second.provisionalNamespace);
		const leases = createLeaseManager(workspace.identity.root);
		leases.claimChildFiles({
			...agent(1),
			workspace: workspace.identity,
			targets: [first],
		});
		assert.throws(
			() => leases.claimChildFiles({
				...agent(2),
				workspace: workspace.identity,
				targets: [second],
			}),
			(error) => assertConflict(error, {
				path: "src/missing-b/second.txt",
				heldPath: "src/missing-a/first.txt",
			}),
		);
		assert.doesNotThrow(() => leases.claimChildFiles({
			...agent(1),
			workspace: workspace.identity,
			targets: [second],
		}));

		await mkdir(join(workspace.identity.root, "src", "missing-a"));
		await writeFile(
			join(workspace.identity.root, "src", "missing-a", "partial.txt"),
			"partial",
			"utf8",
		);
		const exactAfterPartialCreation = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/missing-a/partial.txt",
		});
		assert.throws(
			() => leases.claimChildFiles({
				...agent(2),
				workspace: workspace.identity,
				targets: [exactAfterPartialCreation],
			}),
			(error) => assertConflict(error, { heldPath: "src/missing-a/first.txt" }),
		);

		leases.releaseChildLeases(agent(1).agentId);
		leases.claimChildFiles({
			...agent(1),
			workspace: workspace.identity,
			targets: [exactAfterPartialCreation],
		});
		const missingBelowExactDirectory = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/missing-a/later/child.txt",
		});
		assert.throws(
			() => leases.claimChildFiles({
				...agent(2),
				workspace: workspace.identity,
				targets: [missingBelowExactDirectory],
			}),
			(error) => assertConflict(error, { heldPath: "src/missing-a/partial.txt" }),
		);
		leases.assertInvariants();
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("release is exact and idempotent while close invalidates the whole generation", async () => {
	const { temporary, workspace } = await fixture();
	try {
		const first = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/first.txt",
		});
		const second = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/second.txt",
		});
		const leases = createLeaseManager(workspace.identity.root);
		const owner = agent(1);
		leases.claimChildFiles({
			...owner,
			workspace: workspace.identity,
			targets: [first, second],
		});
		await writeFile(first.path, "created after claim", "utf8");
		assert.equal(
			leases.releaseChildFileLeases(owner.agentId, workspace.identity, [first]).length,
			1,
		);
		assert.deepEqual(leases.releaseChildFileLeases(owner.agentId, workspace.identity, [first]), []);
		assert.deepEqual(leases.listChildLeases(owner.agentId).map((entry) => entry.path), ["src/second.txt"]);
		assert.equal(leases.releaseChildLeases(owner.agentId).length, 1);
		assert.deepEqual(leases.releaseChildLeases(owner.agentId), []);

		leases.reserveParentWorkspace({
			reservationId: "reservation-close",
			workspace: workspace.identity,
		});
		assert.equal(leases.close().length, 1);
		assert.deepEqual(leases.close(), []);
		assert.equal(leases.closed, true);
		assert.deepEqual(leases.listLeases(), []);
		assert.throws(
			() => leases.claimChildFiles({
				...owner,
				workspace: workspace.identity,
				targets: [first],
			}),
			WorkspaceLeaseManagerClosedError,
		);

		const replacement = createLeaseManager(workspace.identity.root, "sag1-replacement");
		assert.throws(
			() => replacement.claimChildFiles({
				...owner,
				workspace: workspace.identity,
				targets: [first],
			}),
			(error) => error instanceof WorkspaceLeaseManagerError && error.code === "stale_agent",
		);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("the session manager owns lease state, publishes defensive child snapshots, and releases on removal/disposal", async () => {
	const { temporary, project, workspace } = await fixture();
	try {
		await writeFile(join(project, "src", "owned.txt"), "owned", "utf8");
		const target = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/owned.txt",
		});
		const generation = "sag1-manager-leases";
		const manager = new SubAgentManager({
			cwd: project,
			generation,
			nonce: (() => {
				let value = 0;
				return () => `lease-${++value}`;
			})(),
			now: (() => {
				let value = 2_000;
				return () => ++value;
			})(),
			modelRuntime: { async dispose() {} },
		});
		const first = manager.createAgent({
			name: "first-owner",
			role: "Own one canonical file",
			objective: "Exercise manager lease ownership.",
		});
		const second = manager.createAgent({
			name: "second-owner",
			role: "Attempt one conflicting claim",
			objective: "Exercise manager lease conflicts.",
		});

		const claimed = await manager.claimChildFileLeases(first.id, workspace.identity, [target]);
		assert.deepEqual(claimed.leases.map((entry) => entry.path), ["src/owned.txt"]);
		claimed.leases.length = 0;
		assert.equal(manager.getAgent(first.id).leases.length, 1);
		await assert.rejects(
			manager.claimChildFileLeases(second.id, workspace.identity, [target]),
			(error) => assertConflict(error, { ownerAgentId: first.id }),
		);

		await manager.removeAgent(first.id, "release ownership");
		assert.deepEqual(manager.getAgent(first.id).leases, []);
		await manager.startAssignment(second.id);
		await manager.claimChildFileLeases(second.id, workspace.identity, [target]);
		assert.equal(manager.getAgent(second.id).leases.length, 1);
		await assert.rejects(
			manager.releaseChildLeases(second.id),
			(error) => error instanceof SubAgentManagerError && error.code === "lease_release_boundary",
		);
		await manager.completeAssignment(second.id, {
			state: "idle",
			summary: "Lease owner reached an idle boundary",
		});
		await manager.releaseChildLeases(second.id);
		assert.deepEqual(manager.getAgent(second.id).leases, []);
		await manager.startAssignment(second.id, "Exercise a parent reservation conflict.");

		const parentToolReservation = manager.reserveParentFiles(
			"parent-tool-call",
			workspace.identity,
			[target],
		);
		await assert.rejects(
			manager.claimChildFileLeases(second.id, workspace.identity, [target]),
			(error) => assertConflict(error, { ownerKind: "parent", heldKind: "parent-file" }),
		);
		assert.equal(manager.releaseParentReservation(parentToolReservation.token).length, 1);
		await manager.claimChildFileLeases(second.id, workspace.identity, [target]);
		await manager.failAgent(
			second.id,
			new Error("terminal child failure"),
			{ runtimeSettled: true },
		);
		assert.deepEqual(manager.getAgent(second.id).leases, []);
		const afterTerminalFailure = manager.reserveParentFiles(
			"after-terminal-failure",
			workspace.identity,
			[target],
		);
		manager.releaseParentReservation(afterTerminalFailure.token);

		const backgroundFailure = manager.createAgent({
			name: "background-failure-owner",
			role: "Fail one tracked background assignment",
			objective: "Prove terminal background failures release ownership.",
		});
		await manager.startAssignment(backgroundFailure.id);
		await manager.claimChildFileLeases(backgroundFailure.id, workspace.identity, [target]);
		await manager.trackBackground(
			backgroundFailure.id,
			Promise.reject(new Error("terminal background failure")),
		);
		assert.equal(manager.getAgent(backgroundFailure.id).state, "failed");
		assert.deepEqual(manager.getAgent(backgroundFailure.id).leases, []);
		const afterBackgroundFailure = manager.reserveParentFiles(
			"after-background-failure",
			workspace.identity,
			[target],
		);
		manager.releaseParentReservation(afterBackgroundFailure.token);

		const uncertainFailure = manager.createAgent({
			name: "uncertain-failure-owner",
			role: "Retain ownership until cleanup settles",
			objective: "Prove uncertain failure cannot release a live mutation lease.",
		});
		await manager.startAssignment(uncertainFailure.id);
		await manager.claimChildFileLeases(uncertainFailure.id, workspace.identity, [target]);
		await manager.failAgent(uncertainFailure.id, new Error("uncertain terminal boundary"));
		assert.equal(manager.getAgent(uncertainFailure.id).leases.length, 1);
		assert.throws(
			() => manager.reserveParentFiles("blocked-by-uncertain", workspace.identity, [target]),
			(error) => assertConflict(error, { ownerAgentId: uncertainFailure.id }),
		);
		await manager.removeAgent(uncertainFailure.id, "settle uncertain failure");
		const afterUncertainCleanup = manager.reserveParentFiles(
			"after-uncertain-cleanup",
			workspace.identity,
			[target],
		);
		manager.releaseParentReservation(afterUncertainCleanup.token);

		const rejectedWaitFailure = manager.createAgent({
			name: "rejected-wait-owner",
			role: "Retain ownership when idle settlement rejects",
			objective: "Prove rejected waits never count as safe lease release.",
		});
		await manager.startAssignment(rejectedWaitFailure.id);
		await manager.claimChildFileLeases(rejectedWaitFailure.id, workspace.identity, [target]);
		manager.registerRuntimeCleanup(rejectedWaitFailure.id, {
			abort() {},
			async waitForIdle() {
				throw new Error("synthetic rejected idle wait");
			},
			dispose() {},
		});
		await manager.trackBackground(
			rejectedWaitFailure.id,
			Promise.reject(new Error("background failure with rejected settlement")),
		);
		assert.equal(manager.getAgent(rejectedWaitFailure.id).leases.length, 1);
		assert.throws(
			() => manager.reserveParentFiles("blocked-by-rejected-wait", workspace.identity, [target]),
			(error) => assertConflict(error, { ownerAgentId: rejectedWaitFailure.id }),
		);
		await manager.removeAgent(rejectedWaitFailure.id, "cleanup rejected wait");
		assert.equal(manager.getAgent(rejectedWaitFailure.id).leases.length, 1);
		assert.throws(
			() => manager.reserveParentFiles("still-blocked-after-rejected-wait", workspace.identity, [target]),
			(error) => assertConflict(error, { ownerAgentId: rejectedWaitFailure.id }),
		);

		await manager.disposeAll("lease lifecycle complete");
		assert.throws(
			() => manager.reserveParentWorkspace("late-parent-tool", workspace.identity),
			(error) => error instanceof SubAgentManagerError && error.code === "manager_closed",
		);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("removal retains leases when idle settlement times out instead of exposing an uncertain mutation", async () => {
	const { temporary, project, workspace } = await fixture();
	try {
		const targetPath = join(project, "src", "timed-out.txt");
		await writeFile(targetPath, "owned", "utf8");
		const target = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/timed-out.txt",
			allowMissing: false,
		});
		const manager = new SubAgentManager({
			cwd: project,
			generation: "sag1-manager-lease-timeout",
			cleanupTimeoutMs: 5,
			nonce: () => "lease-timeout",
			modelRuntime: { async dispose() {} },
		});
		const child = manager.createAgent({
			name: "timed-out-owner",
			role: "Retain one lease across uncertain cleanup",
			objective: "Prove a timeout cannot release ownership early.",
		});
		await manager.startAssignment(child.id);
		await manager.claimChildFileLeases(child.id, workspace.identity, [target]);
		manager.registerRuntimeCleanup(child.id, {
			abort() {},
			waitForIdle() {
				return new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
			},
			dispose() {},
		});

		const removed = await manager.removeAgent(child.id, "timeout ownership test");
		assert.equal(removed.state, "removed");
		assert.equal(removed.leases.length, 1);
		assert.match(removed.lastError, /retained workspace ownership/);
		assert.throws(
			() => manager.reserveParentFiles("blocked-after-timeout", workspace.identity, [target]),
			(error) => assertConflict(error, { ownerAgentId: child.id }),
		);
		await manager.disposeAll("timeout ownership test complete");
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("forged workspace and canonical target metadata fail before ownership changes", async () => {
	const { temporary, workspace } = await fixture();
	try {
		const target = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/first.txt",
		});
		const leases = createLeaseManager(workspace.identity.root);
		const request = { ...agent(1), workspace: workspace.identity, targets: [target] };
		assert.throws(
			() => leases.claimChildFiles({
				...request,
				workspace: { ...workspace.identity, key: "shared:/forged" },
			}),
			(error) => error instanceof WorkspaceLeaseManagerError && error.code === "invalid_lease_request",
		);
		assert.throws(
			() => leases.claimChildFiles({
				...request,
				targets: [{ ...target, relativePath: "src/forged.txt" }],
			}),
			(error) => error instanceof WorkspaceLeaseManagerError && error.code === "invalid_lease_request",
		);

		const otherRoot = join(temporary, "other-project");
		await mkdir(otherRoot);
		const otherWorkspace = await resolveSharedWorkspace(otherRoot);
		const otherTarget = await resolveCanonicalWorkspacePath({
			workspace: otherWorkspace.identity,
			path: "other.txt",
		});
		assert.throws(
			() => leases.claimChildFiles({
				...agent(1),
				workspace: otherWorkspace.identity,
				targets: [otherTarget],
			}),
			(error) => error instanceof WorkspaceLeaseManagerError && error.code === "invalid_lease_request",
		);

		const danglingAfterResolution = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/dangling-after-resolution.txt",
		});
		await symlink(
			join(temporary, "missing-outside-target"),
			danglingAfterResolution.path,
		);
		assert.throws(
			() => leases.claimChildFiles({
				...agent(1),
				workspace: workspace.identity,
				targets: [danglingAfterResolution],
			}),
			(error) => error instanceof WorkspaceLeaseManagerError && error.code === "invalid_lease_request",
		);

		await writeFile(target.path, "created after resolution", "utf8");
		assert.throws(
			() => leases.claimChildFiles(request),
			(error) => error instanceof WorkspaceLeaseManagerError && error.code === "invalid_lease_request",
		);
		assert.deepEqual(leases.listLeases(), []);
		leases.assertInvariants();
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});
