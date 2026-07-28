import assert from "node:assert/strict";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	WorktreeStateError,
	createWorktreeStateStore,
	computeWorktreeRepositoryKey,
} = await importSubAgentsModule("workspace/worktree-state.ts");

const OID = "a".repeat(40);

async function fixture(prefix = "pi-worktree-state-") {
	const temporary = await mkdtemp(join(tmpdir(), prefix));
	const agentDirectory = join(temporary, "agent");
	const repositoryTopLevel = join(temporary, "repository");
	const gitCommonDirectory = join(temporary, "git-common");
	const stateRoot = join(temporary, "private-state");
	await Promise.all([
		mkdir(agentDirectory),
		mkdir(repositoryTopLevel),
		mkdir(gitCommonDirectory),
	]);
	let tick = 0;
	const store = createWorktreeStateStore({
		agentDirectory,
		stateRoot,
		now: () => new Date(1_700_000_000_000 + tick++),
	});
	return { temporary, agentDirectory, repositoryTopLevel, gitCommonDirectory, stateRoot, store };
}

function assertStateError(error, code) {
	assert.ok(error instanceof WorktreeStateError);
	assert.equal(error.code, code);
	return true;
}

function allocation(repository, identity, suffix = "one") {
	const createdAt = new Date(1_700_000_100_000).toISOString();
	return {
		correlationToken: identity.correlationToken,
		sourceGeneration: "sag1-state-tests",
		childId: `sa1-state-tests-${suffix}`,
		repositoryTopLevel: repository.repositoryTopLevel,
		gitCommonDirectory: repository.gitCommonDirectory,
		worktreePath: join(repository.treesDirectory, identity.workspaceId),
		logicalRoot: join(repository.treesDirectory, identity.workspaceId, "packages", suffix),
		workspaceId: identity.workspaceId,
		workspaceKey: identity.workspaceKey,
		branchRef: identity.branchRef,
		baseCommit: OID,
		createdAt,
	};
}

async function cleanup(value) {
	await rm(value.temporary, { recursive: true, force: true });
}

test("private store creates strict records, CASes exact revisions, and emits a path-free bounded catalog", async () => {
	const value = await fixture();
	try {
		const repository = await value.store.openRepository(value.repositoryTopLevel, value.gitCommonDirectory);
		assert.equal(repository.repoKey, computeWorktreeRepositoryKey(repository.gitCommonDirectory));
		for (const directory of [
			value.stateRoot,
			repository.repositoryStateDirectory,
			repository.recordsDirectory,
			repository.treesDirectory,
			repository.emptyHooksDirectory,
		]) {
			assert.equal((await stat(directory)).mode & 0o777, 0o700);
		}
		const identity = value.store.generateIdentity(repository);
		assert.match(identity.workspaceId, /^saw1-[A-Za-z0-9_-]{32,}$/u);
		assert.match(identity.workspaceKey, /^sawk1-[A-Za-z0-9_-]{32,}$/u);
		assert.match(identity.correlationToken, /^sact1-[A-Za-z0-9_-]{32,}$/u);
		assert.equal(identity.branchRef, `refs/heads/pi/sub-agents/${repository.repoKey.slice(0, 16)}/${identity.workspaceId}`);

		let revisionOne;
		let retained;
		await value.store.withRepositoryLock(repository, async (transaction) => {
			revisionOne = await transaction.createRecord(allocation(repository, identity));
			assert.equal(revisionOne.revision, 1);
			assert.equal(revisionOne.state, "allocating");
			const ready = await transaction.compareAndSwap(revisionOne, {
				state: "ready",
				lastObservedCommit: OID,
				observedStatus: "clean",
				updatedAt: new Date(1_700_000_100_001).toISOString(),
				failureCategory: null,
			});
			await assert.rejects(
				transaction.compareAndSwap(ready, {
					state: "retained",
					updatedAt: new Date(1_700_000_100_000).toISOString(),
				}),
				(error) => assertStateError(error, "invalid_transition"),
			);
			retained = await transaction.compareAndSwap(ready, {
				state: "retained",
				updatedAt: new Date(1_700_000_100_002).toISOString(),
				failureCategory: "runtime-failed",
			});
			await assert.rejects(
				transaction.compareAndSwap(revisionOne, {
					state: "ready",
					updatedAt: new Date(1_700_000_100_003).toISOString(),
				}),
				(error) => assertStateError(error, "revision_conflict"),
			);
		});
		assert.equal((await value.store.readRecord(repository, identity.workspaceId)).revision, retained.revision);
		const recordPath = join(repository.recordsDirectory, `${identity.workspaceId}.json`);
		assert.equal((await stat(recordPath)).mode & 0o777, 0o600);
		const stored = JSON.parse(await readFile(recordPath, "utf8"));
		assert.equal(stored.repositoryTopLevel, repository.repositoryTopLevel);

		const catalog = await value.store.catalog({ workspaceId: identity.workspaceId });
		assert.equal(catalog.entries.length, 1);
		assert.equal(catalog.entries[0].disposition, "retained");
		assert.equal(catalog.entries[0].baseCommit, OID.slice(0, 12));
		assert.equal(JSON.stringify(catalog).includes(value.temporary), false);
		assert.equal("correlationToken" in catalog.entries[0], false);
		const lookup = await value.store.readCatalogRecord(identity.workspaceId);
		assert.equal(lookup.record.revision, retained.revision);
		assert.equal(lookup.repository.repositoryTopLevel, repository.repositoryTopLevel);
		assert.equal(lookup.repository.recordsDirectory, repository.recordsDirectory);
	} finally {
		await cleanup(value);
	}
});

test("read-only catalog does not create an absent state root", async () => {
	const value = await fixture("pi-worktree-empty-catalog-");
	try {
		const catalog = await value.store.catalog();
		assert.deepEqual(catalog, {
			entries: [],
			unresolvedRecords: 0,
			unresolvedRepositories: 0,
			truncated: false,
		});
		await assert.rejects(stat(value.stateRoot));
	} finally {
		await cleanup(value);
	}
});

test("repository lock serializes local callers and an existing crash lock is never broken", async () => {
	const value = await fixture("pi-worktree-lock-");
	try {
		const repository = await value.store.openRepository(value.repositoryTopLevel, value.gitCommonDirectory);
		const order = [];
		let releaseFirst;
		const firstGate = new Promise((resolvePromise) => { releaseFirst = resolvePromise; });
		let firstEntered;
		const entered = new Promise((resolvePromise) => { firstEntered = resolvePromise; });
		const first = value.store.withRepositoryLock(repository, async () => {
			order.push("first-enter");
			firstEntered();
			await firstGate;
			order.push("first-exit");
		});
		await entered;
		const second = value.store.withRepositoryLock(repository, async () => {
			order.push("second-enter");
		});
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
		assert.deepEqual(order, ["first-enter"]);
		releaseFirst();
		await Promise.all([first, second]);
		assert.deepEqual(order, ["first-enter", "first-exit", "second-enter"]);

		const lockDirectory = join(repository.repositoryStateDirectory, "repository-operation.lock");
		await mkdir(lockDirectory, { mode: 0o700 });
		await assert.rejects(
			value.store.withRepositoryLock(repository, async () => {}),
			(error) => assertStateError(error, "repository_locked"),
		);
		assert.equal((await stat(lockDirectory)).isDirectory(), true);
	} finally {
		await cleanup(value);
	}
});

test("held directory descriptors prevent a records-parent symlink swap from redirecting CAS writes", async () => {
	const value = await fixture("pi-worktree-descriptor-anchor-");
	try {
		const repository = await value.store.openRepository(value.repositoryTopLevel, value.gitCommonDirectory);
		const identity = value.store.generateIdentity(repository);
		const originalRecords = `${repository.recordsDirectory}-original`;
		const redirectedRecords = join(value.temporary, "redirected-records");
		await mkdir(redirectedRecords, { mode: 0o700 });
		await value.store.withRepositoryLock(repository, async (transaction) => {
			const initial = await transaction.createRecord(allocation(repository, identity));
			await rename(repository.recordsDirectory, originalRecords);
			await symlink(redirectedRecords, repository.recordsDirectory);
			const ready = await transaction.compareAndSwap(initial, {
				state: "ready",
				lastObservedCommit: OID,
				observedStatus: "clean",
				updatedAt: new Date(1_700_000_100_001).toISOString(),
				failureCategory: null,
			});
			assert.equal(ready.revision, 2);
		});
		const stored = JSON.parse(await readFile(join(originalRecords, `${identity.workspaceId}.json`), "utf8"));
		assert.equal(stored.revision, 2);
		await assert.rejects(readFile(join(redirectedRecords, `${identity.workspaceId}.json`), "utf8"));
	} finally {
		await cleanup(value);
	}
});

test("record provenance, malformed catalog entries, and destructive delete boundaries fail closed", async () => {
	const value = await fixture("pi-worktree-provenance-");
	try {
		const repository = await value.store.openRepository(value.repositoryTopLevel, value.gitCommonDirectory);
		const identity = value.store.generateIdentity(repository);
		let record;
		await value.store.withRepositoryLock(repository, async (transaction) => {
			record = await transaction.createRecord(allocation(repository, identity));
			await assert.rejects(
				transaction.deleteRecord(record),
				(error) => assertStateError(error, "invalid_transition"),
			);
		});
		const path = join(repository.recordsDirectory, `${identity.workspaceId}.json`);
		await chmod(path, 0o644);
		await assert.rejects(
			value.store.readRecord(repository, identity.workspaceId),
			(error) => assertStateError(error, "unsafe_state"),
		);
		await chmod(path, 0o600);
		await writeFile(join(repository.recordsDirectory, "not-an-owned-record.json"), "{}\n", { mode: 0o600 });
		let catalog = await value.store.catalog();
		assert.equal(catalog.entries.length, 1);
		assert.equal(catalog.unresolvedRecords, 1);

		const duplicateRepository = join(value.stateRoot, "repositories", "0".repeat(64));
		const duplicateRecords = join(duplicateRepository, "records");
		await mkdir(duplicateRecords, { recursive: true, mode: 0o700 });
		await chmod(duplicateRepository, 0o700);
		await chmod(duplicateRecords, 0o700);
		await writeFile(join(duplicateRecords, `${identity.workspaceId}.json`), "{}\n", { mode: 0o600 });
		catalog = await value.store.catalog({ workspaceId: identity.workspaceId });
		assert.equal(catalog.entries.length, 0, "a malformed duplicate workspace claim suppresses the valid catalog row");
		assert.ok(catalog.unresolvedRecords >= 1);
	} finally {
		await cleanup(value);
	}
});

test("state-root overlap with repository, Git common directory, or Pi agent directory is rejected before private layout creation", async () => {
	for (const protectedKind of ["repository", "common", "agent"]) {
		const value = await fixture(`pi-worktree-overlap-${protectedKind}-`);
		try {
			const stateRoot = protectedKind === "repository"
				? join(value.repositoryTopLevel, "state")
				: protectedKind === "common"
					? join(value.gitCommonDirectory, "state")
					: join(value.agentDirectory, "state");
			const store = createWorktreeStateStore({ agentDirectory: value.agentDirectory, stateRoot });
			await assert.rejects(
				store.openRepository(value.repositoryTopLevel, value.gitCommonDirectory),
				(error) => assertStateError(error, "unsafe_state"),
			);
			await assert.rejects(stat(stateRoot));
		} finally {
			await cleanup(value);
		}
	}
});
