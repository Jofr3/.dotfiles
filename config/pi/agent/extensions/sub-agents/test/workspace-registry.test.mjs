import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	WorkspaceRegistry,
	WorkspaceRegistryClosedError,
	WorkspaceRegistryError,
} = await importSubAgentsModule("workspace/registry.ts");
const {
	WorkspaceLeaseManager,
	WorkspaceLeaseManagerError,
} = await importSubAgentsModule("workspace/leases.ts");
const { resolveCanonicalWorkspacePath, resolveSharedWorkspace } =
	await importSubAgentsModule("workspace/paths.ts");

const generation = "sag1-registry-tests";
const ownerOne = "sa1-registry-tests-1-owner";
const ownerTwo = "sa1-registry-tests-2-owner";
const oid = "1".repeat(40);
const workspaceIds = Object.freeze({
	first: `saw1-${"f".repeat(32)}`,
	second: `saw1-${"s".repeat(32)}`,
	stale: `saw1-${"t".repeat(32)}`,
	other: `saw1-${"o".repeat(32)}`,
	replacement: `saw1-${"r".repeat(32)}`,
	external: `saw1-${"e".repeat(32)}`,
});

async function fixture() {
	const temporary = await mkdtemp(join(tmpdir(), "pi-sub-agent-workspace-registry-"));
	const shared = join(temporary, "shared");
	const first = join(temporary, "first-worktree");
	const second = join(temporary, "second-worktree");
	await Promise.all([
		mkdir(join(shared, "src"), { recursive: true }),
		mkdir(join(first, "src"), { recursive: true }),
		mkdir(join(second, "src"), { recursive: true }),
	]);
	await Promise.all([
		writeFile(join(first, "src", "same.txt"), "first", "utf8"),
		writeFile(join(second, "src", "same.txt"), "second", "utf8"),
	]);
	let nonce = 0;
	const registry = new WorkspaceRegistry({
		generation,
		workspaceRoot: shared,
		nonce: () => `opaque-${String(++nonce).padStart(32, "0")}`,
	});
	return { temporary, shared, first, second, registry };
}

function registration(root, workspaceId, ownerAgentId) {
	return {
		workspaceId,
		root,
		branch: `refs/heads/pi/sub-agents/1234567890abcdef/${workspaceId}`,
		baseCommit: oid,
		ownerAgentId,
	};
}

function target(identity, relativePath = "src/same.txt") {
	return Object.freeze({
		workspaceKey: identity.key,
		path: join(identity.root, ...relativePath.split("/")),
		relativePath,
		exists: true,
	});
}

function assertRegistryError(error, code) {
	assert.ok(error instanceof WorkspaceRegistryError);
	assert.equal(error.code, code);
	return true;
}

test("registry emits frozen exact identities and only non-path list labels", async () => {
	const value = await fixture();
	try {
		const first = value.registry.registerWorktree(
			registration(value.first, workspaceIds.first, ownerOne),
		);
		const second = value.registry.registerWorktree(
			registration(value.second, workspaceIds.second, ownerTwo),
		);

		assert.ok(Object.isFrozen(first));
		assert.match(first.key, /^sawk1-/);
		assert.match(second.key, /^sawk1-/);
		assert.notEqual(first.key, second.key);
		assert.notEqual(first.key, value.registry.sharedIdentity.key);
		assert.equal(value.registry.authorize(first, ownerOne).identity, first);
		assert.equal(value.registry.lookupByWorkspaceId(workspaceIds.first).identity, first);
		assert.equal(value.registry.lookupByOwner(ownerTwo).identity, second);

		const listed = value.registry.list();
		assert.ok(Object.isFrozen(listed));
		assert.deepEqual(listed.map((entry) => entry.displayLabel), [
			"shared",
			`worktree:${workspaceIds.first}`,
			`worktree:${workspaceIds.second}`,
		]);
		assert.equal(JSON.stringify(listed).includes(value.temporary), false);
		assert.equal(listed.every((entry) => !("root" in entry) && !("key" in entry)), true);
	} finally {
		await rm(value.temporary, { recursive: true, force: true });
	}
});

test("registry rejects forged, stale, duplicate, and owner-mismatched identities without per-entry retirement", async () => {
	const value = await fixture();
	try {
		const identity = value.registry.registerWorktree(
			registration(value.first, workspaceIds.first, ownerOne),
		);
		assert.throws(
			() => value.registry.authorize(Object.freeze({ ...identity }), ownerOne),
			(error) => assertRegistryError(error, "invalid_workspace"),
		);
		assert.throws(
			() => value.registry.authorize(identity, ownerTwo),
			(error) => assertRegistryError(error, "owner_mismatch"),
		);
		assert.throws(
			() => value.registry.registerWorktree(
				registration(value.second, workspaceIds.stale, "sa1-old-generation-1-owner"),
			),
			(error) => assertRegistryError(error, "stale_agent"),
		);

		for (const duplicate of [
			{ ...registration(value.second, workspaceIds.other, ownerTwo), key: identity.key },
			registration(value.first, workspaceIds.other, ownerTwo),
			registration(value.second, workspaceIds.first, ownerTwo),
			registration(value.second, workspaceIds.other, ownerOne),
		]) {
			assert.throws(
				() => value.registry.registerWorktree(duplicate),
				(error) => assertRegistryError(error, "duplicate_workspace"),
			);
		}

		assert.equal(typeof value.registry.unregisterWorktree, "undefined");
		assert.equal(value.registry.authorize(identity, ownerOne).identity, identity);
		assert.throws(
			() => value.registry.registerWorktree(
				registration(value.first, workspaceIds.replacement, ownerTwo),
			),
			(error) => assertRegistryError(error, "duplicate_workspace"),
		);
	} finally {
		await rm(value.temporary, { recursive: true, force: true });
	}
});

test("lease authority isolates equivalent sibling paths and rejects forged worktree ownership", async () => {
	const value = await fixture();
	try {
		let now = 10;
		const leases = new WorkspaceLeaseManager({
			generation,
			workspaceRoot: value.shared,
			now: () => ++now,
		});
		const first = leases.registerWorktree(
			registration(value.first, workspaceIds.first, ownerOne),
		);
		const second = leases.registerWorktree(
			registration(value.second, workspaceIds.second, ownerTwo),
		);
		const firstLease = leases.claimChildFiles({
			agentId: ownerOne,
			agentName: "one",
			workspace: first,
			targets: [target(first)],
		});
		const secondLease = leases.claimChildFiles({
			agentId: ownerTwo,
			agentName: "two",
			workspace: second,
			targets: [target(second)],
		});
		assert.equal(firstLease[0].path, "src/same.txt");
		assert.equal(secondLease[0].path, "src/same.txt");
		assert.equal(firstLease[0].workspaceKey, `worktree:${workspaceIds.first}`);
		assert.equal(secondLease[0].workspaceKey, `worktree:${workspaceIds.second}`);
		assert.equal(JSON.stringify(leases.listLeases()).includes(value.temporary), false);
		assert.throws(
			() => leases.claimChildFiles({
				agentId: ownerTwo,
				agentName: "two",
				workspace: first,
				targets: [target(first)],
			}),
			(error) => error instanceof WorkspaceLeaseManagerError && error.code === "invalid_lease_request",
		);
		leases.assertInvariants();
	} finally {
		await rm(value.temporary, { recursive: true, force: true });
	}
});

test("worktree workspace leases are scoped away from sibling and parent workspaces", async () => {
	const value = await fixture();
	try {
		const shared = await resolveSharedWorkspace(value.shared);
		await writeFile(join(value.shared, "src", "same.txt"), "shared", "utf8");
		let now = 100;
		const leases = new WorkspaceLeaseManager({
			generation,
			workspaceRoot: value.shared,
			now: () => ++now,
		});
		const first = leases.registerWorktree(
			registration(value.first, workspaceIds.first, ownerOne),
		);
		const second = leases.registerWorktree(
			registration(value.second, workspaceIds.second, ownerTwo),
		);
		const firstSame = await resolveCanonicalWorkspacePath({
			workspace: first,
			path: "src/same.txt",
		});
		const secondSame = await resolveCanonicalWorkspacePath({
			workspace: second,
			path: "src/same.txt",
		});
		const sharedSame = await resolveCanonicalWorkspacePath({
			workspace: shared.identity,
			path: "src/same.txt",
		});

		const firstBash = leases.claimChildWorkspace({
			agentId: ownerOne,
			agentName: "one",
			workspace: first,
		});
		assert.deepEqual(firstBash, [{
			kind: "workspace",
			workspaceKey: `worktree:${workspaceIds.first}`,
			ownerAgentId: ownerOne,
			path: undefined,
			acquiredAt: 101,
		}]);
		assert.deepEqual(
			leases.claimChildFiles({
				agentId: ownerOne,
				agentName: "one",
				workspace: first,
				targets: [firstSame],
			}).map((entry) => [entry.workspaceKey, entry.path]),
			[[`worktree:${workspaceIds.first}`, "src/same.txt"]],
		);

		const secondFile = leases.claimChildFiles({
			agentId: ownerTwo,
			agentName: "two",
			workspace: second,
			targets: [secondSame],
		});
		assert.equal(secondFile[0].workspaceKey, `worktree:${workspaceIds.second}`);
		assert.equal(secondFile[0].path, "src/same.txt");
		const secondBash = leases.claimChildWorkspace({
			agentId: ownerTwo,
			agentName: "two",
			workspace: second,
		});
		assert.equal(secondBash[0].workspaceKey, `worktree:${workspaceIds.second}`);
		assert.equal(secondBash[0].kind, "workspace");

		const parent = leases.reserveParentWorkspace({
			reservationId: "parent-shared-bash",
			workspace: shared.identity,
		});
		assert.equal(parent.leases[0].workspaceKey, "shared");
		assert.equal(parent.leases[0].kind, "parent-workspace");
		assert.equal(leases.releaseParentReservation(parent.token).length, 1);
		const parentFile = leases.reserveParentFiles({
			reservationId: "parent-shared-file",
			workspace: shared.identity,
			targets: [sharedSame],
		});
		assert.equal(parentFile.leases[0].workspaceKey, "shared");
		assert.equal(parentFile.leases[0].path, "src/same.txt");
		leases.assertInvariants();

		const visible = JSON.stringify(leases.listLeases());
		assert.equal(visible.includes(value.temporary), false);
		assert.match(visible, new RegExp(`worktree:${workspaceIds.first}`));
		assert.match(visible, new RegExp(`worktree:${workspaceIds.second}`));
	} finally {
		await rm(value.temporary, { recursive: true, force: true });
	}
});

test("released workspaceRoot constructor and shared parent labels remain compatible", async () => {
	const value = await fixture();
	try {
		const shared = await resolveSharedWorkspace(value.shared);
		const existing = join(value.shared, "src", "shared.txt");
		await writeFile(existing, "shared", "utf8");
		const canonical = await resolveCanonicalWorkspacePath({
			workspace: shared.identity,
			path: "src/shared.txt",
		});
		const leases = new WorkspaceLeaseManager({ generation, workspaceRoot: value.shared });
		const reservation = leases.reserveParentFiles({
			reservationId: "parent-call",
			workspace: shared.identity,
			targets: [canonical],
		});
		assert.equal(reservation.leases[0].workspaceKey, "shared");
		assert.equal(reservation.leases[0].path, "src/shared.txt");
		assert.equal(leases.releaseParentReservation(reservation.token).length, 1);
	} finally {
		await rm(value.temporary, { recursive: true, force: true });
	}
});

test("lease manager owns its registry authority and rejects malformed generation-owned child IDs", async () => {
	const value = await fixture();
	try {
		const externalIdentity = value.registry.registerWorktree(
			registration(value.first, workspaceIds.external, ownerOne),
		);
		const leases = new WorkspaceLeaseManager({ generation, workspaceRoot: value.shared });
		assert.throws(
			() => leases.claimChildWorkspace({
				agentId: ownerOne,
				agentName: "owner",
				workspace: externalIdentity,
			}),
			(error) => error?.code === "invalid_lease_request",
		);
		assert.throws(
			() => leases.listChildLeases("sa1-registry-tests-bad/value"),
			(error) => error?.code === "stale_agent",
		);
	} finally {
		await rm(value.temporary, { recursive: true, force: true });
	}
});

test("closed registries invalidate every identity", async () => {
	const value = await fixture();
	try {
		const identity = value.registry.registerWorktree(
			registration(value.first, workspaceIds.first, ownerOne),
		);
		assert.equal(value.registry.authorize(identity, ownerOne).identity, identity);
		const closed = value.registry.close();
		assert.equal(closed.length, 2);
		assert.equal(value.registry.closed, true);
		assert.throws(() => value.registry.authorize(identity, ownerOne), WorkspaceRegistryClosedError);
		assert.throws(() => value.registry.list(), WorkspaceRegistryClosedError);
		assert.deepEqual(value.registry.close(), []);
	} finally {
		await rm(value.temporary, { recursive: true, force: true });
	}
});
