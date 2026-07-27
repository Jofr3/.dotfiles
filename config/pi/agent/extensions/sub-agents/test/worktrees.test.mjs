import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const { WorktreeManager } = await importSubAgentsModule("workspace/worktrees.ts");

const oid = "a".repeat(40);
const workspaceId = `saw1-${"w".repeat(32)}`;
const workspaceKey = `sawk1-${"k".repeat(32)}`;
const correlationToken = `sact1-${"t".repeat(32)}`;
const childId = "sa1-worktree-tests-owner";
const generation = "sag1-worktree-tests";

function coded(code, message = code) {
	const error = new Error(message);
	error.code = code;
	return error;
}

function exactInspection(repository, clean = true) {
	return {
		trusted: true,
		insideWorkTree: true,
		bare: false,
		topLevel: repository.top,
		commonDirectory: repository.common,
		headCommit: oid,
		objectFormat: "sha1",
		clean,
		configFingerprint: "f".repeat(64),
	};
}

function completeReconciliation(path, branchRef) {
	const registration = { path, head: oid, branch: branchRef, locked: true };
	return {
		pathExists: true,
		branchExists: true,
		branchCommit: oid,
		registration,
		exact: true,
		inspection: {
			registered: true,
			registration,
			head: oid,
			branchRef,
			refCommit: oid,
			clean: true,
			indexMatchesBase: true,
		},
	};
}

class FakeState {
	constructor(repository, events, config = {}) {
		this.repositoryInput = repository;
		this.events = events;
		this.record = undefined;
		this.deleted = false;
		this.openCount = 0;
		this.releaseErrorOnce = config.releaseErrorOnce ?? false;
	}
	generateIdentity({ repoKey }) {
		return {
			workspaceId,
			workspaceKey,
			correlationToken,
			branchRef: `refs/heads/pi/sub-agents/${repoKey.slice(0, 16)}/${workspaceId}`,
		};
	}
	async openRepository(top, common) {
		this.openCount++;
		this.events.push("state:open");
		return {
			repoKey: "b".repeat(64),
			repositoryTopLevel: top,
			gitCommonDirectory: common,
			repositoryStateDirectory: join(this.repositoryInput.temporary, "state"),
			recordsDirectory: join(this.repositoryInput.temporary, "state", "records"),
			treesDirectory: join(this.repositoryInput.temporary, "trees"),
			emptyHooksDirectory: join(this.repositoryInput.temporary, "hooks"),
		};
	}
	async withRepositoryLock(repository, operation) {
		this.events.push("state:lock");
		const transaction = {
			repository,
			ownerToken: "owner",
			createRecord: async (input) => {
				this.events.push("state:create");
				this.record = Object.freeze({
					version: 1, revision: 1, state: "allocating", ...input,
					lastObservedCommit: input.lastObservedCommit ?? input.baseCommit,
					observedStatus: input.observedStatus ?? "unknown",
					updatedAt: input.updatedAt ?? input.createdAt,
					failureCategory: input.failureCategory ?? null,
				});
				return this.record;
			},
			readRecord: async () => {
				if (!this.record || this.deleted) throw coded("record_missing");
				return this.record;
			},
			compareAndSwap: async (expected, transition) => {
				assert.equal(this.record, expected, "manager must CAS the exact latest revision");
				this.events.push(`state:cas:${expected.state}->${transition.state}`);
				this.record = Object.freeze({
					...expected,
					...transition,
					revision: expected.revision + 1,
					lastObservedCommit: transition.lastObservedCommit ?? expected.lastObservedCommit,
					observedStatus: transition.observedStatus ?? expected.observedStatus,
					failureCategory: transition.failureCategory === undefined ? expected.failureCategory : transition.failureCategory,
				});
				return this.record;
			},
			deleteRecord: async (expected) => {
				assert.equal(this.record, expected);
				assert.equal(expected.state, "cleaned");
				this.events.push("state:delete");
				this.deleted = true;
			},
		};
		const result = await operation(transaction);
		if (this.releaseErrorOnce) {
			this.releaseErrorOnce = false;
			throw coded("lock_release_failed");
		}
		return result;
	}
	async catalog() { return { entries: [], unresolvedRecords: 0, unresolvedRepositories: 0, truncated: false }; }
}

class FakeRegistry {
	constructor(events) {
		this.events = events;
		this.collision = false;
		this.registered = undefined;
	}
	registerWorktree(input) {
		this.events.push("registry:register");
		if (this.collision) throw coded("duplicate_workspace");
		const identity = Object.freeze({
			mode: "worktree", root: input.root, key: input.key, workspaceId: input.workspaceId,
			branch: input.branch, baseCommit: input.baseCommit,
		});
		this.registered = { identity, ownerAgentId: input.ownerAgentId };
		return identity;
	}
	authorize(identity, owner) {
		if (!this.registered || identity !== this.registered.identity || owner !== this.registered.ownerAgentId) throw coded("owner_mismatch");
		return this.registered;
	}
}

async function fixture(config = {}) {
	const temporary = await mkdtemp(join(tmpdir(), "pi-worktrees-manager-"));
	const top = join(temporary, "repo");
	const parent = join(top, "packages", "one");
	const common = join(temporary, "git-common");
	await Promise.all([mkdir(parent, { recursive: true }), mkdir(common, { recursive: true })]);
	const repository = { temporary, top, parent, common };
	const events = [];
	const inspection = exactInspection(repository);
	let inspectCalls = 0;
	let reconciliationMode = config.reconciliation ?? "complete";
	let collected;
	const git = {
		async inspectRepository(options) {
			events.push(`git:inspect:${++inspectCalls}`);
			if (config.stale && inspectCalls === 2) return { ...inspection, headCommit: "c".repeat(40) };
			return inspection;
		},
		async registerNoCheckoutWorktree(options) {
			events.push("git:register");
			if (config.registerError) throw coded(config.registerError);
			return { path: options.path, branchRef: options.branchRef, baseCommit: options.baseCommit, locked: true };
		},
		async materializeTree(options) {
			events.push("git:materialize");
			await mkdir(join(options.worktree.path, "packages", "one", "src"), { recursive: true });
			if (config.materializeError) throw coded(config.materializeError);
			return { ...options.worktree, entryCount: 1, blobCount: 1 };
		},
		async reconcileWorktree(options) {
			events.push(`git:reconcile:${options.signal === undefined ? "unaborted" : "signalled"}`);
			if (reconciliationMode === "throws") throw coded("git_failed");
			if (reconciliationMode === "absent") return { pathExists: false, branchExists: false, exact: false };
			if (reconciliationMode === "incomplete") {
				return { pathExists: true, branchExists: true, branchCommit: oid, exact: false,
					registration: { path: options.path, head: oid, branch: options.branchRef, locked: true } };
			}
			return completeReconciliation(options.path, options.branchRef);
		},
		async collectSummary(options) {
			events.push("git:collect");
			return collected ?? completeReconciliation(options.path, options.expectedBranchRef).inspection;
		},
		async listWorktrees() { throw new Error("not used"); },
		async inspectWorktree() { throw new Error("not used"); },
	};
	const state = new FakeState(repository, events, config);
	const registry = new FakeRegistry(events);
	registry.collision = config.registryCollision ?? false;
	let tick = 0;
	const manager = new WorktreeManager({ git, state, registry, now: () => new Date(1_700_000_000_000 + tick++) });
	const prepare = (extra = {}) => manager.prepare({ cwd: parent, trusted: true, sourceGeneration: generation, childId, ...extra });
	const admit = (plan, signal) => manager.provisionApproved(plan, {
		approvalDigest: plan.approvalDigest,
		correlationToken: plan.identity.correlationToken,
	}, { signal });
	return { temporary, repository, events, git, state, registry, manager, prepare, admit,
		setCollected(value) { collected = value; }, setReconciliation(value) { reconciliationMode = value; } };
}

async function usingFixture(config, operation) {
	const value = await fixture(config);
	try { await operation(value); }
	finally { await rm(value.temporary, { recursive: true, force: true }); }
}

test("clean approved provision revalidates, allocates, reconciles, CASes ready, then registers exact identity", async () => {
	await usingFixture({}, async (value) => {
		const plan = await value.prepare({ relativeCwd: "src" });
		assert.equal(plan.parentRelativeRoot, join("packages", "one"));
		assert.ok(Object.isFrozen(plan));
		const result = await value.admit(plan);
		assert.equal(result.summary.disposition, "ready");
		assert.equal(result.workspace.root, join(value.temporary, "trees", workspaceId, "packages", "one"));
		assert.equal(result.workspace.key, workspaceKey);
		assert.equal(result.relativeCwd, "src");
		assert.deepEqual(value.events, [
			"git:inspect:1", "state:open", "state:lock", "git:inspect:2", "state:create",
			"git:register", "git:materialize", "git:reconcile:unaborted", "state:cas:allocating->ready", "registry:register",
		]);
		assert.deepEqual(Object.keys(result.summary).sort(), ["baseCommit", "branchRef", "disposition", "lastObservedCommit", "workspaceId"]);
	});
});

test("lock release failure cannot publish a ready registry identity or lose the protected outcome", async () => {
	await usingFixture({ releaseErrorOnce: true }, async (value) => {
		const result = await value.admit(await value.prepare());
		assert.equal(result.summary.disposition, "uncertain");
		assert.ok(result.allocation);
		assert.equal(result.workspace, undefined);
		assert.equal(value.registry.registered, undefined);
		assert.equal(value.state.record.state, "ready");
	});
});

test("stale repository revalidation fails before revision-1 record creation", async () => {
	await usingFixture({ stale: true }, async (value) => {
		const plan = await value.prepare();
		await assert.rejects(value.admit(plan), /eligibility changed/u);
		assert.equal(value.state.record, undefined);
		assert.ok(!value.events.includes("git:register"));
	});
});

test("cancellation before admission side effects creates no state record or Git artifact", async () => {
	await usingFixture({}, async (value) => {
		const plan = await value.prepare();
		await assert.rejects(value.manager.provisionApproved(plan, {
			approvalDigest: "0".repeat(64), correlationToken: plan.identity.correlationToken,
		}), /does not exactly admit/u);
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(value.admit(plan, controller.signal), { name: "AbortError" });
		assert.equal(value.state.openCount, 0);
		assert.equal(value.state.record, undefined);
		assert.deepEqual(value.events, ["git:inspect:1"]);
	});
});

test("failed allocation proven wholly absent transitions cleaned and deletes only that exact revision", async () => {
	await usingFixture({ registerError: "git_failed", reconciliation: "absent" }, async (value) => {
		const result = await value.admit(await value.prepare());
		assert.equal(result.summary.disposition, "cleaned");
		assert.equal(result.allocation, undefined);
		assert.equal(value.state.deleted, true);
		assert.match(value.events.join(","), /git:reconcile:unaborted,state:cas:allocating->cleaned,state:delete/u);
	});
});

test("an operation error followed by proof of a complete clean artifact is retained", async () => {
	await usingFixture({ materializeError: "materialization_failed" }, async (value) => {
		const result = await value.admit(await value.prepare());
		assert.equal(result.summary.disposition, "retained");
		assert.equal(value.state.record.failureCategory, "materialization-failed");
		assert.ok(result.allocation);
		assert.deepEqual(value.events.slice(-2), ["state:cas:allocating->ready", "state:cas:ready->retained"]);
	});
});

test("cancellation observed after complete materialization reconciles to retained instead of publishing", async () => {
	await usingFixture({}, async (value) => {
		const controller = new AbortController();
		const materialize = value.git.materializeTree;
		value.git.materializeTree = async (options) => {
			const result = await materialize(options);
			controller.abort();
			return result;
		};
		const result = await value.admit(await value.prepare(), controller.signal);
		assert.equal(result.summary.disposition, "retained");
		assert.equal(result.workspace, undefined);
		assert.equal(value.state.record.failureCategory, "cancelled");
	});
});

test("incomplete reconciliation is uncertain and preserves the protected record", async () => {
	await usingFixture({ reconciliation: "incomplete" }, async (value) => {
		const result = await value.admit(await value.prepare());
		assert.equal(result.summary.disposition, "uncertain");
		assert.equal(value.state.deleted, false);
		assert.equal(value.state.record.failureCategory, "reconciliation-incomplete");
		assert.ok(result.allocation);
	});
});

test("registry collision after completed materialization retains instead of adopting or deleting", async () => {
	await usingFixture({ registryCollision: true }, async (value) => {
		const result = await value.admit(await value.prepare());
		assert.equal(result.summary.disposition, "retained");
		assert.equal(value.state.record.failureCategory, "ownership-mismatch");
		assert.deepEqual(value.events.slice(-4), ["state:cas:allocating->ready", "registry:register", "state:lock", "state:cas:ready->retained"]);
	});
});

test("exact ownership inspection requires manager handle, protected record, registry identity, and Git identity", async () => {
	await usingFixture({}, async (value) => {
		const result = await value.admit(await value.prepare());
		const exact = await value.manager.inspectOwned(result.allocation, result.workspace);
		assert.equal(exact.exactOwnership, true);
		assert.equal(exact.clean, true);
		value.setCollected({ registered: true, head: oid, branchRef: "refs/heads/other", refCommit: oid, clean: true, indexMatchesBase: true });
		const mismatch = await value.manager.inspectOwned(result.allocation, result.workspace);
		assert.equal(mismatch.exactOwnership, false);
		await assert.rejects(value.manager.inspectOwned(Object.freeze({ ...result.allocation }), result.workspace), /forged/u);
	});
});
