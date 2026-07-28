import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	GuardedChildBashError,
	GuardedChildEditError,
	GuardedChildWriteError,
	createGuardedChildBashTool,
	createGuardedChildEditTool,
	createGuardedChildWriteTool,
} = await importSubAgentsModule("workspace/guarded-tools.ts");
const {
	GuardedChildReadError,
	createGuardedChildReadTool,
} = await importSubAgentsModule("workspace/guarded-read-tools.ts");
const {
	ParentMutationInterceptor,
} = await importSubAgentsModule("workspace/parent-mutations.ts");
const { SubAgentManager } = await importSubAgentsModule("manager.ts");

const generation = "sag1-worktree-tools";
const oid = "a".repeat(40);
const workspaceId = `saw1-${"w".repeat(32)}`;

async function fixture() {
	const temporary = await mkdtemp(join(tmpdir(), "pi-sub-agent-worktree-tools-"));
	const shared = join(temporary, "shared");
	const worktree = join(temporary, "worktree");
	await Promise.all([
		mkdir(join(shared, "src"), { recursive: true }),
		mkdir(join(worktree, "src"), { recursive: true }),
		mkdir(join(worktree, ".git"), { recursive: true }),
	]);
	await Promise.all([
		writeFile(join(shared, "src", "target.txt"), "shared\n", "utf8"),
		writeFile(join(worktree, "src", "target.txt"), "alpha\n", "utf8"),
		writeFile(join(worktree, ".git", "config"), "must-not-read\n", "utf8"),
	]);
	let nonce = 0;
	const manager = new SubAgentManager({
		cwd: shared,
		generation,
		nonce: () => `worktree-tools-${++nonce}`,
		modelRuntime: { async dispose() {} },
	});
	const child = manager.createAgent({
		name: "worktree-tool-child",
		role: "Exercise guarded tools in one registered worktree",
		objective: "Use only fake registered worktree filesystem state.",
		tools: ["read", "edit", "write", "bash"],
		workspace: { mode: "worktree", bashPolicy: "workspace-exclusive" },
	});
	await manager.startAssignment(child.id);
	const identity = manager.registerWorktreeWorkspace({
		workspaceId,
		root: worktree,
		branch: `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`,
		baseCommit: oid,
		ownerAgentId: child.id,
	});
	return { temporary, shared, worktree, manager, child, identity };
}

function assertNoPrivatePath(value, temporary) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(temporary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

function assertGuardedError(error, Class, code, temporary) {
	assert.ok(error instanceof Class);
	assert.equal(error.code, code);
	assertNoPrivatePath(error.message, temporary);
	return true;
}

test("guarded child tools honor registered worktree identities while parent interception stays shared-scoped", async () => {
	const value = await fixture();
	try {
		const options = { cwd: value.worktree, workspace: value.identity };
		const read = createGuardedChildReadTool(options);
		const bash = createGuardedChildBashTool({
			...options,
			claimWorkspace: async () => {
				await value.manager.claimChildWorkspaceLease(value.child.id, value.identity);
			},
			dependencies: {
				operations: {
					async exec(command, cwd, operationOptions) {
						assert.equal(command, "printf worktree");
						assert.equal(cwd, value.worktree);
						operationOptions.onData(Buffer.from("worktree bash\n"));
						return { exitCode: 0 };
					},
				},
			},
		});
		const edit = createGuardedChildEditTool({
			...options,
			claimFiles: async (targets) => {
				await value.manager.claimChildFileLeases(value.child.id, value.identity, targets);
			},
			recordMutation: async (target) => {
				await value.manager.recordChildFileMutation(value.child.id, target);
			},
		});
		const write = createGuardedChildWriteTool({
			...options,
			claimFiles: async (targets) => {
				await value.manager.claimChildFileLeases(value.child.id, value.identity, targets);
			},
			reconcileFile: async (target) => {
				await value.manager.reconcileChildFileLease(value.child.id, value.identity, target);
			},
			recordMutation: async (target) => {
				await value.manager.recordChildFileMutation(value.child.id, target);
			},
		});

		const readResult = await read.execute(
			"worktree-read",
			{ path: "src/target.txt" },
			undefined,
			undefined,
			undefined,
		);
		assert.equal(readResult.content[0].text, "alpha\n");

		const bashResult = await bash.execute(
			"worktree-bash",
			{ command: "printf worktree", timeout: 1 },
			undefined,
			undefined,
			undefined,
		);
		assert.equal(bashResult.content[0].text, "worktree bash\n");

		const interceptor = new ParentMutationInterceptor(value.manager);
		try {
			assert.equal(await interceptor.handleToolCall({
				toolName: "edit",
				toolCallId: "parent-shared-edit",
				input: { path: "src/target.txt", edits: [] },
			}, value.shared), undefined);
			interceptor.handleToolExecutionEnd({ toolName: "edit", toolCallId: "parent-shared-edit" });
			assert.equal(await interceptor.handleToolCall({
				toolName: "bash",
				toolCallId: "parent-shared-bash",
				input: { command: "printf shared" },
			}, value.shared), undefined);
			interceptor.handleToolExecutionEnd({ toolName: "bash", toolCallId: "parent-shared-bash" });
			assert.equal(interceptor.activeReservationCount, 0);
		} finally {
			interceptor.shutdown();
		}

		await edit.execute(
			"worktree-edit",
			{ path: "src/target.txt", edits: [{ oldText: "alpha", newText: "gamma" }] },
			undefined,
			undefined,
			undefined,
		);
		await write.execute(
			"worktree-write",
			{ path: "src/new.txt", content: "created\n" },
			undefined,
			undefined,
			undefined,
		);
		assert.equal(await readFile(join(value.worktree, "src", "target.txt"), "utf8"), "gamma\n");
		assert.equal(await readFile(join(value.worktree, "src", "new.txt"), "utf8"), "created\n");
		assert.equal(await readFile(join(value.shared, "src", "target.txt"), "utf8"), "shared\n");

		const snapshot = value.manager.getAgent(value.child.id);
		assert.deepEqual(
			snapshot.leases
				.map((lease) => [lease.kind, lease.workspaceKey, lease.path])
				.sort((left, right) => String(left[2] ?? "").localeCompare(String(right[2] ?? ""))),
			[
				["workspace", `worktree:${workspaceId}`, undefined],
				["file", `worktree:${workspaceId}`, "src/new.txt"],
				["file", `worktree:${workspaceId}`, "src/target.txt"],
			],
		);
		assert.deepEqual(snapshot.currentAssignment.modifiedFiles, ["src/target.txt", "src/new.txt"]);
		assertNoPrivatePath(snapshot.leases, value.temporary);
	} finally {
		await value.manager.disposeAll("worktree guarded tools test cleanup");
		await rm(value.temporary, { recursive: true, force: true });
	}
});

test("guarded non-bash worktree file tools deny Git administrative paths", async () => {
	const value = await fixture();
	try {
		const options = { cwd: value.worktree, workspace: value.identity };
		const read = createGuardedChildReadTool(options);
		const edit = createGuardedChildEditTool({
			...options,
			claimFiles() {},
			recordMutation() {},
		});
		const write = createGuardedChildWriteTool({
			...options,
			claimFiles() {},
			reconcileFile() {},
			recordMutation() {},
		});

		await assert.rejects(
			read.execute("worktree-read-git", { path: ".git/config" }, undefined, undefined, undefined),
			(error) => assertGuardedError(error, GuardedChildReadError, "invalid_read_path", value.temporary),
		);
		await assert.rejects(
			edit.execute(
				"worktree-edit-git",
				{ path: ".git/config", edits: [{ oldText: "must", newText: "must" }] },
				undefined,
				undefined,
				undefined,
			),
			(error) => assertGuardedError(error, GuardedChildEditError, "invalid_edit_path", value.temporary),
		);
		await assert.rejects(
			write.execute("worktree-write-git", { path: ".git/new", content: "blocked" }, undefined, undefined, undefined),
			(error) => assertGuardedError(error, GuardedChildWriteError, "invalid_write_path", value.temporary),
		);

		const bash = createGuardedChildBashTool({
			...options,
			claimWorkspace: async () => {
				await value.manager.claimChildWorkspaceLease(value.child.id, value.identity);
			},
			dependencies: { operations: { async exec() { return { exitCode: 0 }; } } },
		});
		assert.equal(bash.executionMode, "sequential");
	} finally {
		await value.manager.disposeAll("worktree git-path denial test cleanup");
		await rm(value.temporary, { recursive: true, force: true });
	}
});
