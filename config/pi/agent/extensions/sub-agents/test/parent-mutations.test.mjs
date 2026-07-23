import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const { SubAgentManager } = await importSubAgentsModule("manager.ts");
const {
	ParentMutationInterceptor,
	isParentMutationToolName,
} = await importSubAgentsModule("workspace/parent-mutations.ts");
const {
	resolveCanonicalWorkspacePath,
	resolveSharedWorkspace,
} = await importSubAgentsModule("workspace/paths.ts");
function assertLeaseConflict(error, expected = {}) {
	assert.equal(error?.code, "lease_conflict");
	for (const [key, value] of Object.entries(expected)) {
		assert.equal(error?.conflict?.[key], value, `conflict.${key}`);
	}
	return true;
}

async function fixture() {
	const temporary = await mkdtemp(join(tmpdir(), "pi-sub-agent-parent-mutation-"));
	const root = join(temporary, "workspace");
	await Promise.all([
		mkdir(join(root, "src"), { recursive: true }),
		mkdir(join(root, "generated"), { recursive: true }),
	]);
	await Promise.all([
		writeFile(join(root, "src", "first.txt"), "first", "utf8"),
		writeFile(join(root, "src", "second.txt"), "second", "utf8"),
	]);
	const manager = new SubAgentManager({ cwd: root });
	const workspace = await resolveSharedWorkspace(root);
	return {
		temporary,
		root,
		manager,
		workspace,
		interceptor: new ParentMutationInterceptor(manager),
	};
}

function child(manager, name = "child-owner") {
	return manager.createAgent({
		name,
		role: "Own a shared workspace target",
		objective: "Exercise parent and child mutation coordination.",
	});
}

async function target(workspace, path, allowMissing = false) {
	return resolveCanonicalWorkspacePath({
		workspace: workspace.identity,
		cwd: workspace.cwd,
		path,
		allowMissing,
	});
}

test("parent edit/write reservations block child claims until tool_result cleanup", async () => {
	const { temporary, root, manager, workspace, interceptor } = await fixture();
	try {
		assert.equal(isParentMutationToolName("edit"), true);
		assert.equal(isParentMutationToolName("read"), false);
		const owner = child(manager);
		const first = await target(workspace, "src/first.txt");
		const missing = await target(workspace, "generated/new/nested.txt", true);

		const editEvent = {
			toolName: "edit",
			toolCallId: "parent-edit-1",
			input: { path: "src/first.txt", edits: [] },
		};
		assert.equal(await interceptor.handleToolCall(editEvent, root), undefined);
		assert.equal(interceptor.activeReservationCount, 1);
		assert.throws(() => {
			editEvent.input.path = "src/second.txt";
		}, TypeError);
		assert.throws(() => {
			editEvent.input = { path: "src/second.txt", edits: [] };
		}, TypeError);
		assert.equal(editEvent.input.path, "src/first.txt");
		await assert.rejects(
			manager.claimChildFileLeases(owner.id, workspace.identity, [first]),
			(error) => assertLeaseConflict(error, {
				ownerKind: "parent",
				heldKind: "parent-file",
			}),
		);
		interceptor.handleToolResult({ toolName: "edit", toolCallId: "parent-edit-1" });
		assert.equal(interceptor.activeReservationCount, 0);
		await manager.claimChildFileLeases(owner.id, workspace.identity, [first]);

		assert.equal(await interceptor.handleToolCall({
			toolName: "write",
			toolCallId: "parent-write-1",
			input: { path: "generated/new/nested.txt", content: "new" },
		}, root), undefined);
		assert.equal(interceptor.activeReservationCount, 1);
		await assert.rejects(
			manager.claimChildFileLeases(owner.id, workspace.identity, [missing]),
			(error) => assertLeaseConflict(error, { ownerKind: "parent" }),
		);
		interceptor.handleToolResult({ toolName: "write", toolCallId: "parent-write-1" });
		assert.equal(interceptor.activeReservationCount, 0);
		await manager.claimChildFileLeases(owner.id, workspace.identity, [missing]);
	} finally {
		interceptor.shutdown();
		await manager.disposeAll("parent mutation test cleanup");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("parent bash reserves the workspace and execution-end cleanup covers blocked or aborted outcomes", async () => {
	const { temporary, root, manager, workspace, interceptor } = await fixture();
	try {
		const owner = child(manager);
		const first = await target(workspace, "src/first.txt");
		assert.equal(await interceptor.handleToolCall({
			toolName: "bash",
			toolCallId: "parent-bash-1",
			input: { command: "printf safe" },
		}, root), undefined);
		assert.equal(interceptor.activeReservationCount, 1);
		await assert.rejects(
			manager.claimChildFileLeases(owner.id, workspace.identity, [first]),
			(error) => assertLeaseConflict(error, {
				ownerKind: "parent",
				heldKind: "parent-workspace",
			}),
		);

		interceptor.handleToolExecutionEnd({ toolName: "bash", toolCallId: "parent-bash-1" });
		assert.equal(interceptor.activeReservationCount, 0);
		await manager.claimChildFileLeases(owner.id, workspace.identity, [first]);
	} finally {
		interceptor.shutdown();
		await manager.disposeAll("parent mutation test cleanup");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("child ownership blocks parent mutations with bounded sanitized owner guidance", async () => {
	const { temporary, root, manager, workspace, interceptor } = await fixture();
	try {
		const owner = child(manager, "owner\u001b[31m\nname");
		const first = await target(workspace, "src/first.txt");
		await manager.claimChildFileLeases(owner.id, workspace.identity, [first]);

		const decision = await interceptor.handleToolCall({
			toolName: "write",
			toolCallId: "parent-conflict-1",
			input: { path: "src/first.txt", content: "blocked" },
		}, root);
		assert.equal(decision?.block, true);
		assert.match(decision.reason, new RegExp(owner.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
		assert.match(decision.reason, /owner name/);
		assert.match(decision.reason, /src\/first\.txt/);
		assert.match(decision.reason, /settle|redirect|remove/);
		assert.doesNotMatch(decision.reason, /\u001b|\n/);
		assert.ok(decision.reason.length <= 1_200);
		assert.equal(interceptor.activeReservationCount, 0);
	} finally {
		interceptor.shutdown();
		await manager.disposeAll("parent mutation test cleanup");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("concurrent parent preflight admits only non-conflicting mutations", async () => {
	const { temporary, root, manager, interceptor } = await fixture();
	try {
		await symlink("first.txt", join(root, "src", "alias.txt"));
		const sameTargetEvents = [
			{ toolName: "edit", toolCallId: "same-direct", input: { path: "src/first.txt", edits: [] } },
			{ toolName: "write", toolCallId: "same-alias", input: { path: "src/alias.txt", content: "alias" } },
		];
		const sameTarget = await Promise.all(
			sameTargetEvents.map((event) => interceptor.handleToolCall(event, root)),
		);
		assert.equal(sameTarget.filter((decision) => decision === undefined).length, 1);
		assert.equal(sameTarget.filter((decision) => decision?.block).length, 1);
		const sameWinner = sameTarget.findIndex((decision) => decision === undefined);
		let fakeExecutions = 0;
		for (const decision of sameTarget) {
			if (!decision?.block) fakeExecutions += 1;
		}
		assert.equal(fakeExecutions, 1, "a blocked preflight must never reach tool execution");
		interceptor.handleToolExecutionEnd(sameTargetEvents[sameWinner]);

		const distinctEvents = [
			{ toolName: "edit", toolCallId: "distinct-first", input: { path: "src/first.txt", edits: [] } },
			{ toolName: "write", toolCallId: "distinct-second", input: { path: "src/second.txt", content: "second" } },
		];
		const distinct = await Promise.all(
			distinctEvents.map((event) => interceptor.handleToolCall(event, root)),
		);
		assert.deepEqual(distinct, [undefined, undefined]);
		for (const event of distinctEvents) interceptor.handleToolExecutionEnd(event);

		const workspaceConflictEvents = [
			{ toolName: "bash", toolCallId: "bash-contender", input: { command: "printf safe" } },
			{ toolName: "edit", toolCallId: "file-contender", input: { path: "src/first.txt", edits: [] } },
		];
		const workspaceConflict = await Promise.all(
			workspaceConflictEvents.map((event) => interceptor.handleToolCall(event, root)),
		);
		assert.equal(workspaceConflict.filter((decision) => decision === undefined).length, 1);
		assert.equal(workspaceConflict.filter((decision) => decision?.block).length, 1);
		const workspaceWinner = workspaceConflict.findIndex((decision) => decision === undefined);
		interceptor.handleToolExecutionEnd(workspaceConflictEvents[workspaceWinner]);
		assert.equal(interceptor.activeReservationCount, 0);
	} finally {
		interceptor.shutdown();
		await manager.disposeAll("parent mutation test cleanup");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("parent path failures and duplicate live IDs fail closed without reservation leaks", async () => {
	const { temporary, root, manager, interceptor } = await fixture();
	try {
		const missingEdit = await interceptor.handleToolCall({
			toolName: "edit",
			toolCallId: "missing-edit",
			input: { path: "src/missing.txt", edits: [] },
		}, root);
		assert.equal(missingEdit?.block, true);
		assert.match(missingEdit.reason, /path_unavailable/);

		const outsideWrite = await interceptor.handleToolCall({
			toolName: "write",
			toolCallId: "outside-write",
			input: { path: "../outside.txt", content: "blocked" },
		}, root);
		assert.equal(outsideWrite?.block, true);
		assert.match(outsideWrite.reason, /path_outside_root/);
		assert.doesNotMatch(outsideWrite.reason, new RegExp(temporary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

		assert.equal(await interceptor.handleToolCall({
			toolName: "write",
			toolCallId: "duplicate-live-id",
			input: { path: "src/new.txt", content: "new" },
		}, root), undefined);
		const duplicate = await interceptor.handleToolCall({
			toolName: "edit",
			toolCallId: "duplicate-live-id",
			input: { path: "src/first.txt", edits: [] },
		}, root);
		assert.equal(duplicate?.block, true);
		assert.match(duplicate.reason, /already owns an active reservation/);
		assert.equal(interceptor.activeReservationCount, 1);
		interceptor.handleToolExecutionEnd({ toolName: "edit", toolCallId: "duplicate-live-id" });
		assert.equal(interceptor.activeReservationCount, 1, "a mismatched completion must not release ownership");
		interceptor.handleToolExecutionEnd({ toolName: "write", toolCallId: "duplicate-live-id" });
		assert.equal(interceptor.activeReservationCount, 0);
	} finally {
		interceptor.shutdown();
		await manager.disposeAll("parent mutation test cleanup");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("tool_execution_end retries a tool_result release failure without losing the opaque token", async () => {
	const { temporary, root, manager } = await fixture();
	let releaseAttempts = 0;
	const wrapper = {
		generation: manager.generation,
		cwd: manager.cwd,
		reserveParentFiles: manager.reserveParentFiles.bind(manager),
		reserveParentWorkspace: manager.reserveParentWorkspace.bind(manager),
		releaseParentReservation(token) {
			releaseAttempts += 1;
			if (releaseAttempts === 1) throw new Error("synthetic first release failure");
			return manager.releaseParentReservation(token);
		},
	};
	const interceptor = new ParentMutationInterceptor(wrapper);
	try {
		assert.equal(await interceptor.handleToolCall({
			toolName: "edit",
			toolCallId: "release-retry",
			input: { path: "src/first.txt", edits: [] },
		}, root), undefined);
		interceptor.handleToolResult({ toolName: "edit", toolCallId: "release-retry" });
		assert.equal(interceptor.activeReservationCount, 1);
		interceptor.handleToolExecutionEnd({ toolName: "edit", toolCallId: "release-retry" });
		assert.equal(interceptor.activeReservationCount, 0);
		assert.equal(releaseAttempts, 2);
	} finally {
		interceptor.shutdown();
		await manager.disposeAll("parent mutation test cleanup");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("aliases share one identity and shutdown retains ownership until the matching completion", async () => {
	const { temporary, root, manager, workspace, interceptor } = await fixture();
	try {
		await symlink("first.txt", join(root, "src", "alias.txt"));
		assert.equal(await interceptor.handleToolCall({
			toolName: "edit",
			toolCallId: "canonical-owner",
			input: { path: "src/alias.txt", edits: [] },
		}, root), undefined);
		const aliasConflict = await interceptor.handleToolCall({
			toolName: "write",
			toolCallId: "canonical-contender",
			input: { path: "src/first.txt", content: "blocked" },
		}, root);
		assert.equal(aliasConflict?.block, true);
		assert.match(aliasConflict.reason, /another parent mutation/);
		assert.equal(interceptor.activeReservationCount, 1);

		interceptor.shutdown();
		assert.equal(interceptor.activeReservationCount, 1);
		const owner = child(manager);
		const canonical = await target(workspace, "src/first.txt");
		await assert.rejects(
			manager.claimChildFileLeases(owner.id, workspace.identity, [canonical]),
			(error) => assertLeaseConflict(error, { ownerKind: "parent" }),
		);
		const idle = interceptor.waitForIdle();
		let idleSettled = false;
		void idle.then(() => { idleSettled = true; });
		await Promise.resolve();
		assert.equal(idleSettled, false);
		const inactive = await interceptor.handleToolCall({
			toolName: "bash",
			toolCallId: "after-shutdown",
			input: { command: "printf blocked" },
		}, root);
		assert.equal(inactive?.block, true);
		assert.match(inactive.reason, /generation is inactive/);
		interceptor.handleToolExecutionEnd({ toolName: "edit", toolCallId: "canonical-owner" });
		await idle;
		assert.equal(interceptor.activeReservationCount, 0);
		await manager.claimChildFileLeases(owner.id, workspace.identity, [canonical]);
	} finally {
		interceptor.shutdown();
		await manager.disposeAll("parent mutation test cleanup");
		await rm(temporary, { recursive: true, force: true });
	}
});
