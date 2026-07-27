import assert from "node:assert/strict";
import {
	chmod,
	mkdir,
	readFile,
	readlink,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";
import { isLocalGitAvailable, withTempGitRepository } from "./git-fixtures.mjs";

const {
	WorktreeGitError,
	assertGitMaterializedBlobBudget,
	assertGitOrdinaryIndexFlags,
	createWorktreeGitOperations,
	parseGitCatFileBatch,
	parseGitIndexEntriesZ,
	parseGitLsTreeZ,
	parseGitWorktreePorcelainZ,
} = await importSubAgentsModule("workspace/worktree-git.ts");
const { createWorktreeStateStore } = await importSubAgentsModule("workspace/worktree-state.ts");
const { WorkspaceLeaseManager } = await importSubAgentsModule("workspace/leases.ts");
const { createWorktreeManager } = await importSubAgentsModule("workspace/worktrees.ts");

const OID_A = "a".repeat(40);
const OID_B = "b".repeat(40);
const REPOSITORY_KEY = "d".repeat(64);
const WORKSPACE_IDS = Object.freeze([
	`saw1-${"a".repeat(32)}`,
	`saw1-${"b".repeat(32)}`,
]);

async function requireProductionGit(context) {
	if (process.platform !== "linux") {
		context.skip("production no-follow materialization currently requires Linux");
		return false;
	}
	if (await isLocalGitAvailable()) return true;
	context.skip("local git executable is unavailable");
	return false;
}

function assertWorktreeGitCode(error, code) {
	assert.ok(error instanceof WorktreeGitError, `expected WorktreeGitError, received ${error}`);
	assert.equal(error.code, code);
	return true;
}

async function createProductionOperations(temporary, options = {}) {
	const home = join(temporary, "home");
	const processTemporary = join(temporary, "tmp");
	const hooks = join(temporary, "empty-hooks");
	await Promise.all([
		chmod(home, 0o700),
		chmod(processTemporary, 0o700),
		chmod(hooks, 0o700),
	]);
	if (options.createFixtureTrees !== false) {
		for (const directory of [
			join(temporary, "worktree-state"),
			join(temporary, "worktree-state", "repositories"),
			join(temporary, "worktree-state", "repositories", REPOSITORY_KEY),
			join(temporary, "worktree-state", "repositories", REPOSITORY_KEY, "trees"),
		]) {
			await mkdir(directory, { recursive: true, mode: 0o700 });
			await chmod(directory, 0o700);
		}
	}
	const git = await createWorktreeGitOperations({
		operationalEnvironment: process.env,
		privateHomeDirectory: home,
		privateTemporaryDirectory: processTemporary,
		emptyHooksDirectory: hooks,
	});
	return {
		git,
		home,
		processTemporary,
		hooks,
		trees: join(temporary, "worktree-state", "repositories", REPOSITORY_KEY, "trees"),
	};
}

function branchRef(workspaceId) {
	return `refs/heads/pi/sub-agents/${REPOSITORY_KEY.slice(0, 16)}/${workspaceId}`;
}

test("production parsers reject truncated NUL and object-batch framing", () => {
	const path = resolve("/tmp", "pi-production-parser");
	const worktree = Buffer.from(`worktree ${path}\0HEAD ${OID_A}\0branch refs/heads/main\0\0`);
	assert.equal(parseGitWorktreePorcelainZ(worktree)[0].path, path);
	assert.throws(() => parseGitWorktreePorcelainZ(worktree.subarray(0, -1)), /double-NUL|inside a record/u);
	assert.throws(
		() => parseGitWorktreePorcelainZ(Buffer.from(`worktree ${path}\0HEAD ${OID_A}\0branch refs/heads/main\0unknown value\0\0`)),
		/unsupported field/u,
	);

	const tree = Buffer.from(`100644 blob ${OID_A}\tsrc/value.txt\0`);
	assert.equal(parseGitLsTreeZ(tree)[0].path, "src/value.txt");
	assert.throws(() => parseGitLsTreeZ(tree.subarray(0, -1)), /NUL terminated/u);
	assert.throws(() => parseGitLsTreeZ(Buffer.from(`100644 blob ${OID_A}\t../escape\0`)), /unsafe/u);
	const repeatedTree = parseGitLsTreeZ(Buffer.from(`100644 blob ${OID_A}\ta.txt\0` + `100644 blob ${OID_A}\tb.txt\0`));
	const repeatedObjects = new Map([[OID_A, Buffer.from("four")]]);
	assert.doesNotThrow(() => assertGitMaterializedBlobBudget(repeatedTree, repeatedObjects, 8));
	assert.throws(() => assertGitMaterializedBlobBudget(repeatedTree, repeatedObjects, 7), /exceed/u);

	const index = Buffer.from(`100644 ${OID_A} 0\tsrc/value.txt\0`);
	assert.equal(parseGitIndexEntriesZ(index)[0].stage, 0);
	assert.throws(() => parseGitIndexEntriesZ(index.subarray(0, -1)), /NUL terminated/u);
	assert.throws(() => parseGitIndexEntriesZ(Buffer.from(`100644 ${OID_A} 2\tsrc/value.txt\0`)), /conflicted/u);
	assert.doesNotThrow(() => assertGitOrdinaryIndexFlags(Buffer.from("H src/value.txt\0")));
	assert.throws(() => assertGitOrdinaryIndexFlags(Buffer.from("h src/value.txt\0")), /index flags/u);
	assert.throws(() => assertGitOrdinaryIndexFlags(Buffer.from("S src/value.txt\0")), /index flags/u);

	const batch = Buffer.from(`${OID_A} blob 4\none\n\n`);
	assert.equal(parseGitCatFileBatch(batch, [OID_A]).get(OID_A).toString("utf8"), "one\n");
	assert.throws(() => parseGitCatFileBatch(batch, [OID_B]), /out of order/u);
	assert.throws(() => parseGitCatFileBatch(batch.subarray(0, -1), [OID_A]), /framing/u);
});

test("production Git operations inspect from a subdirectory and materialize two exact isolated locked worktrees", async (context) => {
	if (!await requireProductionGit(context)) return;
	await withTempGitRepository({
		prefix: "pi-sub-agents-production-git",
		files: {
			".gitignore": "ignored/\n",
			"README.md": "production fixture\n",
			"scripts/run.sh": "#!/bin/sh\nprintf production\n",
			"src/nested/value.txt": "one\n",
		},
		executableFiles: ["scripts/run.sh"],
		symlinks: { "value-link": "src/nested/value.txt" },
	}, async ({ baseCommit, repository, temporary }) => {
		const production = await createProductionOperations(temporary);
		for (const directory of [production.home, production.processTemporary, production.hooks]) {
			assert.equal((await stat(directory)).mode & 0o777, 0o700);
		}

		const inspection = await production.git.inspectRepository({
			cwd: join(repository, "src", "nested"),
			trusted: true,
		});
		assert.equal(inspection.topLevel, resolve(repository));
		assert.equal(inspection.headCommit, baseCommit);
		assert.equal(inspection.clean, true);
		assert.match(inspection.configFingerprint, /^[0-9a-f]{64}$/u);

		const registered = [];
		for (const workspaceId of WORKSPACE_IDS) {
			const path = join(production.trees, workspaceId);
			const branch = branchRef(workspaceId);
			const record = await production.git.registerNoCheckoutWorktree({
				repository: inspection,
				path,
				branchRef: branch,
				baseCommit,
				lockReason: `pi sub-agent ${workspaceId}`,
			});
			assert.deepEqual(record, { path, branchRef: branch, baseCommit, locked: true });
			const materialized = await production.git.materializeTree({ repository: inspection, worktree: record });
			assert.equal(materialized.path, path);
			assert.equal(materialized.entryCount, 5);
			assert.equal(materialized.blobCount, 5);
			registered.push(record);
		}

		const listed = await production.git.listWorktrees({ repository: inspection });
		for (const record of registered) {
			const entry = listed.find((candidate) => candidate.path === record.path);
			assert.ok(entry);
			assert.equal(entry.branch, record.branchRef);
			assert.equal(entry.head, baseCommit);
			assert.equal(entry.locked, `pi sub-agent ${record.branchRef.slice(record.branchRef.lastIndexOf("/") + 1)}`);
			assert.equal(await readFile(join(record.path, "src", "nested", "value.txt"), "utf8"), "one\n");
			assert.equal(await readlink(join(record.path, "value-link")), "src/nested/value.txt");
			assert.notEqual((await stat(join(record.path, "scripts", "run.sh"))).mode & 0o111, 0);
		}

		const firstPath = registered[0].path;
		const secondPath = registered[1].path;
		await writeFile(join(firstPath, "src", "nested", "value.txt"), "equivalent-write\n");
		assert.equal(await readFile(join(secondPath, "src", "nested", "value.txt"), "utf8"), "one\n");
		let firstInspection = await production.git.inspectWorktree({
			repository: inspection,
			path: firstPath,
			expectedBranchRef: registered[0].branchRef,
			expectedBaseCommit: baseCommit,
		});
		const secondInspection = await production.git.collectSummary({
			repository: inspection,
			path: secondPath,
			expectedBranchRef: registered[1].branchRef,
			expectedBaseCommit: baseCommit,
		});
		assert.equal(firstInspection.clean, false);
		assert.equal(firstInspection.indexMatchesBase, true);
		assert.equal(secondInspection.clean, true);
		assert.equal(secondInspection.indexMatchesBase, true);
		await mkdir(join(secondPath, "ignored"));
		await writeFile(join(secondPath, "ignored", "cache"), "ignored\n");
		const ignoredInspection = await production.git.inspectWorktree({
			repository: inspection,
			path: secondPath,
			expectedBranchRef: registered[1].branchRef,
			expectedBaseCommit: baseCommit,
		});
		assert.equal(ignoredInspection.clean, false);
		await rm(join(secondPath, "ignored"), { recursive: true });

		await writeFile(join(secondPath, "src", "nested", "value.txt"), "equivalent-write\n");
		await writeFile(join(firstPath, "src", "nested", "value.txt"), "one\n");
		assert.equal(await readFile(join(secondPath, "src", "nested", "value.txt"), "utf8"), "equivalent-write\n");
		await writeFile(join(secondPath, "src", "nested", "value.txt"), "one\n");
		firstInspection = await production.git.inspectWorktree({
			repository: inspection,
			path: firstPath,
			expectedBranchRef: registered[0].branchRef,
			expectedBaseCommit: baseCommit,
		});
		assert.equal(firstInspection.clean, true);
		const reconciliation = await production.git.reconcileWorktree({
			repository: inspection,
			path: firstPath,
			branchRef: registered[0].branchRef,
			baseCommit,
		});
		assert.equal(reconciliation.exact, true);
		assert.equal(reconciliation.branchCommit, baseCommit);
	});
});

test("production manager provisions one real protected worktree transaction and retains it without cleanup", async (context) => {
	if (!await requireProductionGit(context)) return;
	await withTempGitRepository({
		prefix: "pi-sub-agents-production-manager",
		files: {
			"README.md": "manager fixture\n",
			"packages/child/src/value.txt": "one\n",
		},
	}, async ({ baseCommit, repository, temporary }) => {
		const production = await createProductionOperations(temporary, { createFixtureTrees: false });
		const agentDirectory = join(temporary, "agent");
		await mkdir(agentDirectory, { mode: 0o700 });
		const state = createWorktreeStateStore({
			agentDirectory,
			stateRoot: join(temporary, "worktree-state"),
		});
		const generation = "sag1-production-manager";
		const childId = "sa1-production-manager-1-owner";
		const parentCwd = join(repository, "packages", "child");
		const coordinator = new WorkspaceLeaseManager({ generation, workspaceRoot: parentCwd });
		const manager = createWorktreeManager({ git: production.git, state, registry: coordinator });
		const plan = await manager.prepare({
			cwd: parentCwd,
			trusted: true,
			sourceGeneration: generation,
			childId,
			relativeCwd: "src",
		});
		assert.equal(plan.repository.headCommit, baseCommit);
		const result = await manager.provisionApproved(plan, {
			approvalDigest: plan.approvalDigest,
			correlationToken: plan.identity.correlationToken,
		});
		assert.equal(result.summary.disposition, "ready");
		assert.equal(result.workspace.mode, "worktree");
		assert.equal(result.workspace.workspaceId, plan.identity.workspaceId);
		assert.equal(await readFile(join(result.workspace.root, "src", "value.txt"), "utf8"), "one\n");
		const ownership = await manager.inspectOwned(result.allocation, result.workspace);
		assert.equal(ownership.exactOwnership, true);
		assert.equal(ownership.clean, true);
		const retained = await manager.retain(result.allocation);
		assert.equal(retained.disposition, "retained");
		const catalog = await manager.catalog({ workspaceId: result.workspace.workspaceId });
		assert.equal(catalog.entries.length, 1);
		assert.equal(catalog.entries[0].disposition, "retained");
		assert.equal(JSON.stringify(catalog).includes(temporary), false);
	});
});

test("production Git operations refuse permissive private directories, dirty parents, cancellation, and unsafe repository config", async (context) => {
	if (!await requireProductionGit(context)) return;

	await withTempGitRepository({
		prefix: "pi-sub-agents-production-refusal",
		files: { "src/value.txt": "one\n" },
	}, async ({ repository, temporary }) => {
		await chmod(join(temporary, "home"), 0o755);
		await assert.rejects(
			createWorktreeGitOperations({
				operationalEnvironment: process.env,
				privateHomeDirectory: join(temporary, "home"),
				privateTemporaryDirectory: join(temporary, "tmp"),
				emptyHooksDirectory: join(temporary, "empty-hooks"),
			}),
			(error) => assertWorktreeGitCode(error, "invalid_input"),
		);
		await chmod(join(temporary, "home"), 0o700);
		const { git } = await createProductionOperations(temporary);

		await writeFile(join(repository, "src", "value.txt"), "dirty\n");
		await assert.rejects(
			git.inspectRepository({ cwd: join(repository, "src"), trusted: true }),
			(error) => assertWorktreeGitCode(error, "ineligible_repository"),
		);
		await writeFile(join(repository, "src", "value.txt"), "one\n");

		const controller = new AbortController();
		controller.abort(new Error("production cancellation"));
		await assert.rejects(
			git.inspectRepository({ cwd: join(repository, "src"), trusted: true, signal: controller.signal }),
			(error) => assertWorktreeGitCode(error, "cancelled"),
		);

		const configPath = join(repository, ".git", "config");
		const config = await readFile(configPath, "utf8");
		await writeFile(configPath, `${config}\n[alias]\n\tblocked = !false\n`);
		await assert.rejects(
			git.inspectRepository({ cwd: join(repository, "src"), trusted: true }),
			(error) => assertWorktreeGitCode(error, "unsafe_repository"),
		);
		await writeFile(configPath, `${config}\n[extensions]\n\tworktreeConfig = false\n\tworktreeConfig = true\n`);
		await assert.rejects(
			git.inspectRepository({ cwd: join(repository, "src"), trusted: true }),
			(error) => assertWorktreeGitCode(error, "unsafe_repository"),
		);
		await writeFile(configPath, `${config}\n[core]\n\tfileMode = false\n\tignoreStat = true\n`);
		await assert.rejects(
			git.inspectRepository({ cwd: join(repository, "src"), trusted: true }),
			(error) => assertWorktreeGitCode(error, "unsafe_repository"),
		);
	});
});
