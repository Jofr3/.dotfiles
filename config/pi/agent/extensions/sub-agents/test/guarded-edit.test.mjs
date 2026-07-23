import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	open,
	readFile,
	rename,
	rm,
	symlink,
	unlink,
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
	GuardedChildEditError,
	createGuardedChildEditTool,
} = await importSubAgentsModule("workspace/guarded-tools.ts");
const {
	resolveCanonicalWorkspacePath,
	resolveCanonicalWriteScope,
	resolveSharedWorkspace,
} = await importSubAgentsModule("workspace/paths.ts");
const { SubAgentManager } = await importSubAgentsModule("manager.ts");

async function fixture(prefix = "pi-sub-agent-guarded-edit-") {
	const temporary = await mkdtemp(join(tmpdir(), prefix));
	const project = join(temporary, "project");
	await mkdir(join(project, "src"), { recursive: true });
	const workspace = await resolveSharedWorkspace(project);
	return { temporary, project, workspace };
}

function createManager(project, generation = "sag1-guarded-edit") {
	let nonce = 0;
	return new SubAgentManager({
		cwd: project,
		generation,
		nonce: () => `guarded-edit-${++nonce}`,
		modelRuntime: { async dispose() {} },
	});
}

function createAgent(manager, name, overrides = {}) {
	return manager.createAgent({
		name,
		role: "Apply one guarded exact edit",
		objective: "Exercise canonical scope and child file lease enforcement.",
		tools: ["edit"],
		workspace: { mode: "shared", bashPolicy: "disabled" },
		...overrides,
	});
}

function guardedTool(manager, id, workspace, cwd, writeScope) {
	return createGuardedChildEditTool({
		cwd,
		workspace: workspace.identity,
		writeScope,
		claimFiles: async (targets) => {
			await manager.claimChildFileLeases(id, workspace.identity, targets);
		},
		recordMutation: async (target) => {
			await manager.recordChildFileMutation(id, target);
		},
	});
}

function assertGuardedError(error, code) {
	assert.ok(error instanceof GuardedChildEditError);
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
			assert.equal(guarded[key].toString(), base[key].toString(), `guarded edit changed ${key}`);
		} else {
			assert.deepEqual(guarded[key], base[key], `guarded edit changed ${key}`);
		}
	}
	assert.notStrictEqual(guarded.execute, base.execute);
}

test("guarded edit preserves the built-in contract, claims before mutation, and records bounded files", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project);
	try {
		const targetPath = join(project, "src", "target.txt");
		await writeFile(targetPath, "alpha\nbeta\n", "utf8");
		const target = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/target.txt",
			allowMissing: false,
		});
		const scope = await resolveCanonicalWriteScope(workspace.identity, ["src/target.txt"]);
		const child = createAgent(manager, "successful-editor");
		await manager.startAssignment(child.id);
		await manager.recordReport(child.id, {
			state: "progress",
			summary: "Preparing the guarded edit",
		});

		const { codingAgent } = await importInstalledPackages();
		const base = codingAgent.createEditToolDefinition(project);
		const guarded = guardedTool(manager, child.id, workspace, project, scope);
		assertDefinitionMetadataPreserved(base, guarded);

		const result = await guarded.execute(
			"guarded-edit-success",
			{ path: "@src/target.txt", edits: [{ oldText: "alpha", newText: "gamma" }] },
			undefined,
			undefined,
			undefined,
		);
		assert.equal(await readFile(targetPath, "utf8"), "gamma\nbeta\n");
		assert.deepEqual(Object.keys(result.details).sort(), ["diff", "firstChangedLine", "patch"]);
		assert.equal(result.content[0].text, "Successfully replaced 1 block(s) in @src/target.txt.");
		assert.match(result.details.diff, /gamma/);
		assert.match(result.details.patch, /^--- @src\/target\.txt\n\+\+\+ @src\/target\.txt\n/);
		assert.doesNotMatch(result.details.patch, new RegExp(project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

		const snapshot = manager.getAgent(child.id);
		assert.deepEqual(snapshot.leases.map((lease) => lease.path), ["src/target.txt"]);
		assert.deepEqual(snapshot.currentAssignment.modifiedFiles, ["src/target.txt"]);
		assert.deepEqual(snapshot.latestReport.files, ["src/target.txt"]);
		assert.equal(snapshot.leases[0].path, target.relativePath);

		await manager.completeAssignment(child.id, {
			state: "idle",
			summary: "Guarded edit complete",
		});
		assert.deepEqual(manager.getAgent(child.id).latestResult.files, ["src/target.txt"]);
	} finally {
		await manager.disposeAll("guarded edit success complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded edit rejects out-of-scope targets before a lease or filesystem mutation", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-edit-scope");
	try {
		const targetPath = join(project, "src", "target.txt");
		await Promise.all([
			writeFile(targetPath, "alpha\n", "utf8"),
			writeFile(join(project, "src", "allowed.txt"), "allowed\n", "utf8"),
		]);
		const scope = await resolveCanonicalWriteScope(workspace.identity, ["src/allowed.txt"]);
		const child = createAgent(manager, "scope-editor");
		await manager.startAssignment(child.id);
		const guarded = guardedTool(manager, child.id, workspace, project, scope);

		await assert.rejects(
			guarded.execute(
				"guarded-edit-outside-scope",
				{ path: "src/target.txt", edits: [{ oldText: "alpha", newText: "denied" }] },
				undefined,
				undefined,
				undefined,
			),
			(error) => assertGuardedError(error, "path_outside_scope"),
		);
		assert.equal(await readFile(targetPath, "utf8"), "alpha\n");
		assert.deepEqual(manager.getAgent(child.id).leases, []);
	} finally {
		await manager.disposeAll("guarded edit scope complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded edit reports a child lease conflict without reaching the built-in mutation", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-edit-conflict");
	try {
		const targetPath = join(project, "src", "target.txt");
		await writeFile(targetPath, "alpha\n", "utf8");
		const target = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/target.txt",
			allowMissing: false,
		});
		const owner = createAgent(manager, "lease-owner");
		const contender = createAgent(manager, "lease-contender");
		await Promise.all([
			manager.startAssignment(owner.id),
			manager.startAssignment(contender.id),
		]);
		await manager.claimChildFileLeases(owner.id, workspace.identity, [target]);
		const guarded = guardedTool(manager, contender.id, workspace, project, undefined);

		await assert.rejects(
			guarded.execute(
				"guarded-edit-conflict",
				{ path: "src/target.txt", edits: [{ oldText: "alpha", newText: "denied" }] },
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
		assert.equal(await readFile(targetPath, "utf8"), "alpha\n");
		assert.deepEqual(manager.getAgent(contender.id).leases, []);
	} finally {
		await manager.disposeAll("guarded edit conflict complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded edit binds delegation to the claimed canonical identity and rejects an alias swap", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-edit-race");
	try {
		const firstPath = join(project, "src", "first.txt");
		const secondPath = join(project, "src", "second.txt");
		const aliasPath = join(project, "src", "alias.txt");
		await Promise.all([
			writeFile(firstPath, "first\n", "utf8"),
			writeFile(secondPath, "second\n", "utf8"),
		]);
		await symlink(firstPath, aliasPath);
		const child = createAgent(manager, "race-editor");
		await manager.startAssignment(child.id);
		const guarded = createGuardedChildEditTool({
			cwd: project,
			workspace: workspace.identity,
			claimFiles: async (targets) => {
				await manager.claimChildFileLeases(child.id, workspace.identity, targets);
				await unlink(aliasPath);
				await symlink(secondPath, aliasPath);
			},
			recordMutation: async (target) => {
				await manager.recordChildFileMutation(child.id, target);
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-edit-alias-race",
				{ path: "src/alias.txt", edits: [{ oldText: "first", newText: "changed" }] },
				undefined,
				undefined,
				undefined,
			),
			(error) => assertGuardedError(error, "path_identity_changed"),
		);
		assert.equal(await readFile(firstPath, "utf8"), "first\n");
		assert.equal(await readFile(secondPath, "utf8"), "second\n");
		assert.deepEqual(manager.getAgent(child.id).currentAssignment.modifiedFiles, undefined);
		assert.deepEqual(manager.getAgent(child.id).leases.map((lease) => lease.path), ["src/first.txt"]);
	} finally {
		await manager.disposeAll("guarded edit race complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded edit binds the built-in mutation window to the claimed inode after its final path check", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-edit-inode-race");
	try {
		const targetPath = join(project, "src", "target.txt");
		const originalPath = join(project, "src", "original-unlinked.txt");
		const replacementPath = join(project, "src", "replacement.txt");
		await Promise.all([
			writeFile(targetPath, "original\n", "utf8"),
			writeFile(replacementPath, "replacement\n", "utf8"),
		]);
		const child = createAgent(manager, "inode-race-editor");
		await manager.startAssignment(child.id);
		let injected = false;
		const guarded = createGuardedChildEditTool({
			cwd: project,
			workspace: workspace.identity,
			claimFiles: async (targets) => {
				await manager.claimChildFileLeases(child.id, workspace.identity, targets);
			},
			recordMutation: async (target) => {
				await manager.recordChildFileMutation(child.id, target);
			},
			dependencies: {
				async openFile(path, flags) {
					if (!injected) {
						injected = true;
						await rename(targetPath, originalPath);
						await symlink(replacementPath, targetPath);
					}
					return open(path, flags);
				},
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-edit-inode-race",
				{ path: "src/target.txt", edits: [{ oldText: "original", newText: "changed" }] },
				undefined,
				undefined,
				undefined,
			),
			/Could not edit file|changed at the guarded mutation boundary|ELOOP/,
		);
		assert.equal(injected, true);
		assert.equal(await readFile(originalPath, "utf8"), "original\n");
		assert.equal(await readFile(replacementPath, "utf8"), "replacement\n");
		assert.equal(manager.getAgent(child.id).currentAssignment.modifiedFiles, undefined);
	} finally {
		await manager.disposeAll("guarded edit inode race complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("post-write abort records the changed file and returns an explicit do-not-retry outcome", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-edit-post-write-abort");
	try {
		const targetPath = join(project, "src", "target.txt");
		await writeFile(targetPath, "alpha\n", "utf8");
		const child = createAgent(manager, "post-write-abort-editor");
		await manager.startAssignment(child.id);
		const controller = new AbortController();
		const guarded = createGuardedChildEditTool({
			cwd: project,
			workspace: workspace.identity,
			claimFiles: async (targets) => {
				await manager.claimChildFileLeases(child.id, workspace.identity, targets);
			},
			recordMutation: async (target) => {
				await manager.recordChildFileMutation(child.id, target);
			},
			dependencies: {
				afterWrite() {
					controller.abort();
				},
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-edit-post-write-abort",
				{ path: "src/target.txt", edits: [{ oldText: "alpha", newText: "changed" }] },
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
		assert.deepEqual(
			manager.getAgent(child.id).currentAssignment.modifiedFiles,
			["src/target.txt"],
		);
	} finally {
		await manager.disposeAll("guarded edit post-write abort complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("an already-aborted guarded edit performs no claim", async () => {
	const { temporary, project, workspace } = await fixture();
	try {
		await writeFile(join(project, "src", "target.txt"), "alpha\n", "utf8");
		let claims = 0;
		const guarded = createGuardedChildEditTool({
			cwd: project,
			workspace: workspace.identity,
			claimFiles() {
				claims += 1;
			},
			recordMutation() {},
		});
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(
			guarded.execute(
				"guarded-edit-aborted",
				{ path: "src/target.txt", edits: [{ oldText: "alpha", newText: "denied" }] },
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
