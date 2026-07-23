import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	open,
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
import {
	importInstalledPackages,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const {
	GuardedChildWriteError,
	createGuardedChildWriteTool,
} = await importSubAgentsModule("workspace/guarded-tools.ts");
const {
	resolveCanonicalWorkspacePath,
	resolveCanonicalWriteScope,
	resolveSharedWorkspace,
} = await importSubAgentsModule("workspace/paths.ts");
const { SubAgentManager } = await importSubAgentsModule("manager.ts");

async function fixture(prefix = "pi-sub-agent-guarded-write-") {
	const temporary = await mkdtemp(join(tmpdir(), prefix));
	const project = join(temporary, "project");
	await mkdir(join(project, "src"), { recursive: true });
	const workspace = await resolveSharedWorkspace(project);
	return { temporary, project, workspace };
}

function createManager(project, generation = "sag1-guarded-write") {
	let nonce = 0;
	return new SubAgentManager({
		cwd: project,
		generation,
		nonce: () => `guarded-write-${++nonce}`,
		modelRuntime: { async dispose() {} },
	});
}

function createAgent(manager, name, overrides = {}) {
	return manager.createAgent({
		name,
		role: "Apply one guarded exact write",
		objective: "Exercise canonical scope, creation, reconciliation, and child file leases.",
		tools: ["write"],
		workspace: { mode: "shared", bashPolicy: "disabled" },
		...overrides,
	});
}

function guardedTool(manager, id, workspace, cwd, writeScope, dependencies) {
	return createGuardedChildWriteTool({
		cwd,
		workspace: workspace.identity,
		writeScope,
		claimFiles: async (targets) => {
			await manager.claimChildFileLeases(id, workspace.identity, targets);
		},
		reconcileFile: async (target) => {
			await manager.reconcileChildFileLease(id, workspace.identity, target);
		},
		recordMutation: async (target) => {
			await manager.recordChildFileMutation(id, target);
		},
		dependencies,
	});
}

function assertGuardedError(error, code) {
	assert.ok(error instanceof GuardedChildWriteError);
	assert.equal(error.code, code);
	assert.doesNotMatch(error.message, /\/tmp\//);
	return true;
}

function assertDefinitionMetadataPreserved(base, guarded) {
	for (const key of [
		"name",
		"label",
		"description",
		"promptSnippet",
		"promptGuidelines",
		"parameters",
		"prepareArguments",
		"renderShell",
		"renderCall",
		"renderResult",
	]) {
		if (typeof base[key] === "function") {
			assert.equal(guarded[key].toString(), base[key].toString(), `guarded write changed ${key}`);
		} else {
			assert.deepEqual(guarded[key], base[key], `guarded write changed ${key}`);
		}
	}
	assert.notStrictEqual(guarded.execute, base.execute);
}

test("guarded write preserves the built-in contract, creates a missing file, reconciles its lease, and records it", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project);
	try {
		const requestedPath = "src/generated/target.txt";
		const targetPath = join(project, requestedPath);
		const otherPath = join(project, "src", "other.txt");
		await writeFile(otherPath, "other\n", "utf8");
		const scope = await resolveCanonicalWriteScope(workspace.identity, [requestedPath]);
		const owner = createAgent(manager, "successful-writer", {
			workspace: { mode: "shared", writeScope: [requestedPath], bashPolicy: "disabled" },
		});
		const contender = createAgent(manager, "sibling-writer");
		await manager.claimChildFileLeases(owner.id, workspace.identity, scope.paths);
		await Promise.all([manager.startAssignment(owner.id), manager.startAssignment(contender.id)]);

		const other = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/other.txt",
			allowMissing: false,
		});
		await assert.rejects(
			manager.claimChildFileLeases(contender.id, workspace.identity, [other]),
			(error) => error?.code === "lease_conflict",
		);

		const { codingAgent } = await importInstalledPackages();
		const base = codingAgent.createWriteToolDefinition(project);
		const guarded = guardedTool(manager, owner.id, workspace, project, scope);
		assertDefinitionMetadataPreserved(base, guarded);

		const result = await guarded.execute(
			"guarded-write-create",
			{ path: `@${requestedPath}`, content: "created\n" },
			undefined,
			undefined,
			undefined,
		);
		assert.equal(await readFile(targetPath, "utf8"), "created\n");
		assert.equal(result.details, undefined);
		assert.equal(result.content[0].text, `Successfully wrote 8 bytes to @${requestedPath}`);
		assert.doesNotMatch(result.content[0].text, new RegExp(project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

		const snapshot = manager.getAgent(owner.id);
		assert.deepEqual(snapshot.leases.map((lease) => lease.path), [requestedPath]);
		assert.deepEqual(snapshot.currentAssignment.modifiedFiles, [requestedPath]);
		await manager.claimChildFileLeases(contender.id, workspace.identity, [other]);
		assert.deepEqual(manager.getAgent(contender.id).leases.map((lease) => lease.path), ["src/other.txt"]);

		await manager.completeAssignment(owner.id, {
			state: "idle",
			summary: "Guarded write complete",
		});
		assert.deepEqual(manager.getAgent(owner.id).latestResult.files, [requestedPath]);
	} finally {
		await manager.disposeAll("guarded write create complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded write overwrites an existing canonical file and rewrites non-ASCII success output", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-write-overwrite");
	try {
		const targetPath = join(project, "src", "target.txt");
		await writeFile(targetPath, "old content\n", "utf8");
		const child = createAgent(manager, "overwrite-writer");
		await manager.startAssignment(child.id);
		const guarded = guardedTool(manager, child.id, workspace, project);

		const content = "replacement 👋\n";
		const result = await guarded.execute(
			"guarded-write-overwrite",
			{ path: "src/target.txt", content },
			undefined,
			undefined,
			undefined,
		);
		assert.equal(await readFile(targetPath, "utf8"), content);
		assert.equal(
			result.content[0].text,
			`Successfully wrote ${content.length} bytes to src/target.txt`,
		);
		assert.doesNotMatch(result.content[0].text, new RegExp(project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
		assert.equal(result.details, undefined);
		assert.deepEqual(manager.getAgent(child.id).currentAssignment.modifiedFiles, ["src/target.txt"]);
	} finally {
		await manager.disposeAll("guarded write overwrite complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded write follows approved in-root aliases while leasing and reporting canonical targets", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-write-aliases");
	try {
		const existingPath = join(project, "src", "existing.txt");
		const existingAlias = join(project, "src", "existing-alias.txt");
		const realDirectory = join(project, "src", "real-directory");
		const directoryAlias = join(project, "src", "directory-alias");
		await Promise.all([
			writeFile(existingPath, "old\n", "utf8"),
			mkdir(realDirectory),
		]);
		await Promise.all([
			symlink(existingPath, existingAlias),
			symlink(realDirectory, directoryAlias),
		]);
		const child = createAgent(manager, "alias-writer");
		await manager.startAssignment(child.id);
		const guarded = guardedTool(manager, child.id, workspace, project);

		const existingResult = await guarded.execute(
			"guarded-write-existing-alias",
			{ path: "src/existing-alias.txt", content: "changed\n" },
			undefined,
			undefined,
			undefined,
		);
		const missingResult = await guarded.execute(
			"guarded-write-directory-alias",
			{ path: "src/directory-alias/generated.txt", content: "generated\n" },
			undefined,
			undefined,
			undefined,
		);

		assert.equal(await readFile(existingPath, "utf8"), "changed\n");
		assert.equal(await readFile(join(realDirectory, "generated.txt"), "utf8"), "generated\n");
		assert.equal(existingResult.content[0].text, "Successfully wrote 8 bytes to src/existing-alias.txt");
		assert.equal(missingResult.content[0].text, "Successfully wrote 10 bytes to src/directory-alias/generated.txt");
		assert.deepEqual(
			manager.getAgent(child.id).leases.map((lease) => lease.path),
			["src/existing.txt", "src/real-directory/generated.txt"],
		);
		assert.deepEqual(
			manager.getAgent(child.id).currentAssignment.modifiedFiles,
			["src/existing.txt", "src/real-directory/generated.txt"],
		);
	} finally {
		await manager.disposeAll("guarded write aliases complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded write rejects out-of-scope targets before a lease or filesystem mutation", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-write-scope");
	try {
		const targetPath = join(project, "src", "target.txt");
		const scope = await resolveCanonicalWriteScope(workspace.identity, ["src/allowed.txt"]);
		const child = createAgent(manager, "scope-writer");
		await manager.startAssignment(child.id);
		const guarded = guardedTool(manager, child.id, workspace, project, scope);

		await assert.rejects(
			guarded.execute(
				"guarded-write-outside-scope",
				{ path: "src/target.txt", content: "denied\n" },
				undefined,
				undefined,
				undefined,
			),
			(error) => assertGuardedError(error, "path_outside_scope"),
		);
		await assert.rejects(readFile(targetPath, "utf8"), /ENOENT/);
		assert.deepEqual(manager.getAgent(child.id).leases, []);
	} finally {
		await manager.disposeAll("guarded write scope complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded write reports a child lease conflict without reaching file creation", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-write-conflict");
	try {
		const targetPath = join(project, "src", "target.txt");
		const target = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/target.txt",
			allowMissing: true,
		});
		const owner = createAgent(manager, "lease-owner");
		const contender = createAgent(manager, "lease-contender");
		await Promise.all([manager.startAssignment(owner.id), manager.startAssignment(contender.id)]);
		await manager.claimChildFileLeases(owner.id, workspace.identity, [target]);
		const guarded = guardedTool(manager, contender.id, workspace, project);

		await assert.rejects(
			guarded.execute(
				"guarded-write-conflict",
				{ path: "src/target.txt", content: "denied\n" },
				undefined,
				undefined,
				undefined,
			),
			(error) => {
				assertGuardedError(error, "lease_conflict");
				assert.match(error.message, new RegExp(owner.id));
				assert.match(error.message, /lease-owner/);
				return true;
			},
		);
		await assert.rejects(readFile(targetPath, "utf8"), /ENOENT/);
		assert.deepEqual(manager.getAgent(contender.id).leases, []);
	} finally {
		await manager.disposeAll("guarded write conflict complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded write rewrites pre-mutation filesystem errors without exposing canonical absolute paths", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-write-error-path");
	try {
		const child = createAgent(manager, "error-path-writer");
		await manager.startAssignment(child.id);
		const guarded = guardedTool(manager, child.id, workspace, project, undefined, {
			async mkdirPath(dir) {
				throw new Error(`mkdir failed at ${dir}`);
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-write-error-path",
				{ path: "src/generated/target.txt", content: "denied\n" },
				undefined,
				undefined,
				undefined,
			),
			(error) => {
				assert.doesNotMatch(error.message, new RegExp(project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
				assert.match(error.message, /src\/generated/);
				return true;
			},
		);
		assert.equal(manager.getAgent(child.id).currentAssignment.modifiedFiles, undefined);
	} finally {
		await manager.disposeAll("guarded write error path complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded overwrite binds the built-in mutation window to the claimed inode", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-write-inode-race");
	try {
		const targetPath = join(project, "src", "target.txt");
		const originalPath = join(project, "src", "original-unlinked.txt");
		const replacementPath = join(project, "src", "replacement.txt");
		await Promise.all([
			writeFile(targetPath, "original\n", "utf8"),
			writeFile(replacementPath, "replacement\n", "utf8"),
		]);
		const child = createAgent(manager, "inode-race-writer");
		await manager.startAssignment(child.id);
		let injected = false;
		const guarded = guardedTool(manager, child.id, workspace, project, undefined, {
			async openFile(path, flags, mode) {
				if (!injected) {
					injected = true;
					await rename(targetPath, originalPath);
					await symlink(replacementPath, targetPath);
				}
				return open(path, flags, mode);
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-write-inode-race",
				{ path: "src/target.txt", content: "changed\n" },
				undefined,
				undefined,
				undefined,
			),
			/ELOOP|changed at the guarded mutation boundary/,
		);
		assert.equal(injected, true);
		assert.equal(await readFile(originalPath, "utf8"), "original\n");
		assert.equal(await readFile(replacementPath, "utf8"), "replacement\n");
		assert.equal(manager.getAgent(child.id).currentAssignment.modifiedFiles, undefined);
	} finally {
		await manager.disposeAll("guarded write inode race complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded write rejects a missing-target identity change after lease acquisition", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-write-claim-race");
	try {
		const targetPath = join(project, "src", "target.txt");
		const child = createAgent(manager, "claim-race-writer");
		await manager.startAssignment(child.id);
		const guarded = createGuardedChildWriteTool({
			cwd: project,
			workspace: workspace.identity,
			claimFiles: async (targets) => {
				await manager.claimChildFileLeases(child.id, workspace.identity, targets);
				await writeFile(targetPath, "external\n", "utf8");
			},
			reconcileFile: async (target) => {
				await manager.reconcileChildFileLease(child.id, workspace.identity, target);
			},
			recordMutation: async (target) => {
				await manager.recordChildFileMutation(child.id, target);
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-write-claim-race",
				{ path: "src/target.txt", content: "guarded\n" },
				undefined,
				undefined,
				undefined,
			),
			(error) => assertGuardedError(error, "path_identity_changed"),
		);
		assert.equal(await readFile(targetPath, "utf8"), "external\n");
		assert.equal(manager.getAgent(child.id).currentAssignment.modifiedFiles, undefined);
	} finally {
		await manager.disposeAll("guarded write claim race complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded write revalidates newly created parents before opening the target", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-write-parent-race");
	try {
		const generated = join(project, "src", "generated");
		const moved = join(project, "src", "generated-original");
		const replacement = join(project, "src", "replacement");
		await mkdir(replacement);
		const child = createAgent(manager, "parent-race-writer");
		await manager.startAssignment(child.id);
		const guarded = guardedTool(manager, child.id, workspace, project, undefined, {
			async afterMkdir() {
				await rename(generated, moved);
				await symlink(replacement, generated);
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-write-parent-race",
				{ path: "src/generated/target.txt", content: "denied\n" },
				undefined,
				undefined,
				undefined,
			),
			(error) => assertGuardedError(error, "mutation_outcome_uncertain"),
		);
		await assert.rejects(readFile(join(replacement, "target.txt"), "utf8"), /ENOENT/);
		await assert.rejects(readFile(join(moved, "target.txt"), "utf8"), /ENOENT/);
		assert.equal(manager.getAgent(child.id).currentAssignment.modifiedFiles, undefined);
	} finally {
		await manager.disposeAll("guarded write parent race complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("abort after recursive parent creation reports explicit uncertainty without claiming file content changed", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-write-post-mkdir-abort");
	try {
		const parentPath = join(project, "src", "generated");
		const targetPath = join(parentPath, "target.txt");
		const child = createAgent(manager, "post-mkdir-abort-writer");
		await manager.startAssignment(child.id);
		const controller = new AbortController();
		const guarded = guardedTool(manager, child.id, workspace, project, undefined, {
			afterMkdir() {
				controller.abort();
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-write-post-mkdir-abort",
				{ path: "src/generated/target.txt", content: "denied\n" },
				controller.signal,
				undefined,
				undefined,
			),
			(error) => {
				assertGuardedError(error, "mutation_outcome_uncertain");
				assert.match(error.message, /may have created parent directories/);
				return true;
			},
		);
		await assert.rejects(readFile(targetPath, "utf8"), /ENOENT/);
		assert.equal((await stat(parentPath)).isDirectory(), true);
		assert.equal(manager.getAgent(child.id).currentAssignment.modifiedFiles, undefined);
		assert.deepEqual(manager.getAgent(child.id).leases.map((lease) => lease.path), ["src/generated/target.txt"]);
	} finally {
		await manager.disposeAll("guarded write post-mkdir abort complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("post-write abort records the changed file and returns an explicit do-not-retry outcome", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-write-post-write-abort");
	try {
		const targetPath = join(project, "src", "target.txt");
		const child = createAgent(manager, "post-write-abort-writer");
		await manager.startAssignment(child.id);
		const controller = new AbortController();
		const guarded = guardedTool(manager, child.id, workspace, project, undefined, {
			afterWrite() {
				controller.abort();
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-write-post-write-abort",
				{ path: "src/target.txt", content: "changed\n" },
				controller.signal,
				undefined,
				undefined,
			),
			(error) => {
				assertGuardedError(error, "mutation_outcome_uncertain");
				assert.match(error.message, /Do not retry it blindly/);
				return true;
			},
		);
		assert.equal(await readFile(targetPath, "utf8"), "changed\n");
		assert.deepEqual(manager.getAgent(child.id).currentAssignment.modifiedFiles, ["src/target.txt"]);
	} finally {
		await manager.disposeAll("guarded write post-write abort complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("post-create reconciliation failure retains conservative ownership and records an uncertain mutation", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-write-reconcile-failure");
	try {
		const targetPath = join(project, "src", "target.txt");
		const child = createAgent(manager, "reconciliation-failure-writer");
		await manager.startAssignment(child.id);
		const guarded = createGuardedChildWriteTool({
			cwd: project,
			workspace: workspace.identity,
			claimFiles: async (targets) => {
				await manager.claimChildFileLeases(child.id, workspace.identity, targets);
			},
			reconcileFile() {
				throw new Error("private reconciliation failure");
			},
			recordMutation: async (target) => {
				await manager.recordChildFileMutation(child.id, target);
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-write-reconcile-failure",
				{ path: "src/target.txt", content: "changed\n" },
				undefined,
				undefined,
				undefined,
			),
			(error) => {
				assertGuardedError(error, "mutation_outcome_uncertain");
				assert.match(error.message, /remains conservative/);
				assert.doesNotMatch(error.message, /private reconciliation failure/);
				return true;
			},
		);
		assert.equal(await readFile(targetPath, "utf8"), "changed\n");
		assert.deepEqual(manager.getAgent(child.id).leases.map((lease) => lease.path), ["src/target.txt"]);
		assert.deepEqual(manager.getAgent(child.id).currentAssignment.modifiedFiles, ["src/target.txt"]);
	} finally {
		await manager.disposeAll("guarded write reconciliation failure complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("an already-aborted guarded write performs no claim", async () => {
	const { temporary, project, workspace } = await fixture();
	try {
		let claims = 0;
		const guarded = createGuardedChildWriteTool({
			cwd: project,
			workspace: workspace.identity,
			claimFiles() {
				claims += 1;
			},
			reconcileFile() {},
			recordMutation() {},
		});
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(
			guarded.execute(
				"guarded-write-aborted",
				{ path: "src/target.txt", content: "denied\n" },
				controller.signal,
				undefined,
				undefined,
			),
			/Operation aborted/,
		);
		assert.equal(claims, 0);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});
