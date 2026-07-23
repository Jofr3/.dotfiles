import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	createGuardedChildBashTool,
	createGuardedChildEditTool,
	createGuardedChildWriteTool,
} = await importSubAgentsModule("workspace/guarded-tools.ts");
const { SubAgentManager } = await importSubAgentsModule("manager.ts");
const { ParentMutationInterceptor } = await importSubAgentsModule("workspace/parent-mutations.ts");
const {
	resolveCanonicalWorkspacePath,
	resolveCanonicalWriteScope,
	resolveSharedWorkspace,
} = await importSubAgentsModule("workspace/paths.ts");

let fixtureSequence = 0;

function deferred() {
	let resolvePromise;
	let rejectPromise;
	const promise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function createRendezvous(parties) {
	const arrivals = new Set();
	const ready = deferred();
	const released = deferred();
	let releaseCalled = false;
	return {
		ready: ready.promise,
		get arrivals() {
			return new Set(arrivals);
		},
		async arrive(label) {
			assert.equal(arrivals.has(label), false, `duplicate rendezvous arrival: ${label}`);
			arrivals.add(label);
			if (arrivals.size === parties) ready.resolve();
			await released.promise;
		},
		release() {
			if (releaseCalled) return;
			releaseCalled = true;
			released.resolve();
		},
	};
}

function createMutationHold() {
	const entrants = new Set();
	const entered = deferred();
	const released = deferred();
	let releaseCalled = false;
	return {
		entered: entered.promise,
		get entrants() {
			return new Set(entrants);
		},
		async hold(label) {
			assert.equal(entrants.has(label), false, `duplicate mutation hold entry: ${label}`);
			entrants.add(label);
			entered.resolve();
			await released.promise;
		},
		release() {
			if (releaseCalled) return;
			releaseCalled = true;
			released.resolve();
		},
	};
}

async function withWatchdog(promise, label, timeoutMs = 2_000) {
	let timer;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeoutMs);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function fixture() {
	fixtureSequence += 1;
	const temporary = await mkdtemp(join(tmpdir(), "pi-sub-agent-workspace-concurrency-"));
	const project = join(temporary, "project");
	await Promise.all([
		mkdir(join(project, "src"), { recursive: true }),
		mkdir(join(project, "generated"), { recursive: true }),
	]);
	const workspace = await resolveSharedWorkspace(project);
	let nonce = 0;
	const manager = new SubAgentManager({
		cwd: project,
		generation: `sag1-workspace-concurrency-${fixtureSequence}`,
		nonce: () => `concurrency-${fixtureSequence}-${++nonce}`,
		modelRuntime: { async dispose() {} },
	});
	return { temporary, project, workspace, manager };
}

function createFileAgent(manager, name, tools = ["edit", "write"]) {
	return manager.createAgent({
		name,
		role: "Mutate an approved shared-workspace file under retained ownership",
		objective: "Exercise deterministic guarded mutation coordination.",
		tools,
		workspace: { mode: "shared", bashPolicy: "disabled" },
	});
}

function createBashAgent(manager, name) {
	return manager.createAgent({
		name,
		role: "Run one foreground command under complete shared-workspace ownership",
		objective: "Exercise deterministic workspace-exclusive bash coordination.",
		tools: ["bash"],
		workspace: { mode: "shared", bashPolicy: "workspace-exclusive" },
	});
}

function editTool(manager, child, workspace, project, dependencies) {
	return createGuardedChildEditTool({
		cwd: project,
		workspace: workspace.identity,
		claimFiles: (targets) => manager.claimChildFileLeases(child.id, workspace.identity, targets),
		recordMutation: (target) => manager.recordChildFileMutation(child.id, target),
		dependencies,
	});
}

function writeTool(manager, child, workspace, project, dependencies) {
	return createGuardedChildWriteTool({
		cwd: project,
		workspace: workspace.identity,
		claimFiles: (targets) => manager.claimChildFileLeases(child.id, workspace.identity, targets),
		reconcileFile: (target) => manager.reconcileChildFileLease(child.id, workspace.identity, target),
		recordMutation: (target) => manager.recordChildFileMutation(child.id, target),
		dependencies,
	});
}

function bashTool(manager, child, workspace, project, operations) {
	return createGuardedChildBashTool({
		cwd: project,
		workspace: workspace.identity,
		claimWorkspace: () => manager.claimChildWorkspaceLease(child.id, workspace.identity),
		dependencies: { operations },
	});
}

function assertOneLeaseWinner(settled) {
	assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
	assert.equal(settled.filter((result) => result.status === "rejected").length, 1);
	const winner = settled.findIndex((result) => result.status === "fulfilled");
	const loser = winner === 0 ? 1 : 0;
	assert.equal(settled[loser].reason?.code, "lease_conflict");
	return { winner, loser };
}

async function settleConflictWhileWinnerIsMutating(runs, hold, label) {
	const observed = runs.map((run, index) => run.then(
		(value) => ({ status: "fulfilled", index, value }),
		(reason) => ({ status: "rejected", index, reason }),
	));
	let overlapError;
	try {
		await withWatchdog(hold.entered, `${label} winner mutation window`);
		const firstSettlement = await withWatchdog(
			Promise.race(observed),
			`${label} conflicting contender rejection`,
		);
		assert.equal(firstSettlement.status, "rejected");
		assert.equal(firstSettlement.reason?.code, "lease_conflict");
	} catch (error) {
		overlapError = error;
	} finally {
		hold.release();
	}
	const settled = await Promise.allSettled(runs);
	if (overlapError) throw overlapError;
	const outcome = assertOneLeaseWinner(settled);
	assert.deepEqual([...hold.entrants], [String(outcome.winner)]);
	return outcome;
}

async function cleanup(value, reason) {
	await value.manager.disposeAll(reason);
	await rm(value.temporary, { recursive: true, force: true });
}

test("concurrent same-file child edits and edit/write contenders admit exactly one retained owner", async () => {
	const value = await fixture();
	try {
		const samePath = join(value.project, "src", "same.txt");
		const crossPath = join(value.project, "src", "cross.txt");
		await Promise.all([
			writeFile(samePath, "alpha\n", "utf8"),
			writeFile(crossPath, "alpha\n", "utf8"),
		]);

		const sameChildren = [
			createFileAgent(value.manager, "same-file-one", ["edit"]),
			createFileAgent(value.manager, "same-file-two", ["edit"]),
		];
		await Promise.all(sameChildren.map((child) => value.manager.startAssignment(child.id)));
		const sameHold = createMutationHold();
		const sameRuns = [
			editTool(value.manager, sameChildren[0], value.workspace, value.project, {
				afterWrite: () => sameHold.hold("0"),
			}).execute(
				"same-file-one",
				{ path: "src/same.txt", edits: [{ oldText: "alpha", newText: "one" }] },
			),
			editTool(value.manager, sameChildren[1], value.workspace, value.project, {
				afterWrite: () => sameHold.hold("1"),
			}).execute(
				"same-file-two",
				{ path: "src/same.txt", edits: [{ oldText: "alpha", newText: "two" }] },
			),
		];
		const sameOutcome = await settleConflictWhileWinnerIsMutating(
			sameRuns,
			sameHold,
			"same-file edit",
		);
		assert.equal(await readFile(samePath, "utf8"), `${sameOutcome.winner === 0 ? "one" : "two"}\n`);
		assert.equal(value.manager.getAgent(sameChildren[sameOutcome.winner].id).leases.length, 1);
		assert.deepEqual(value.manager.getAgent(sameChildren[sameOutcome.loser].id).leases, []);

		const crossChildren = [
			createFileAgent(value.manager, "cross-editor", ["edit"]),
			createFileAgent(value.manager, "cross-writer", ["write"]),
		];
		await Promise.all(crossChildren.map((child) => value.manager.startAssignment(child.id)));
		const crossHold = createMutationHold();
		const crossRuns = [
			editTool(value.manager, crossChildren[0], value.workspace, value.project, {
				afterWrite: () => crossHold.hold("0"),
			}).execute(
				"cross-edit",
				{ path: "src/cross.txt", edits: [{ oldText: "alpha", newText: "edited" }] },
			),
			writeTool(value.manager, crossChildren[1], value.workspace, value.project, {
				afterWrite: () => crossHold.hold("1"),
			}).execute(
				"cross-write",
				{ path: "src/cross.txt", content: "written\n" },
			),
		];
		const crossOutcome = await settleConflictWhileWinnerIsMutating(
			crossRuns,
			crossHold,
			"edit/write cross-conflict",
		);
		assert.equal(await readFile(crossPath, "utf8"), crossOutcome.winner === 0 ? "edited\n" : "written\n");
		assert.equal(value.manager.getAgent(crossChildren[crossOutcome.winner].id).leases.length, 1);
		assert.deepEqual(value.manager.getAgent(crossChildren[crossOutcome.loser].id).leases, []);
	} finally {
		await cleanup(value, "same-file concurrency test complete");
	}
});

test("concurrent symlink-alias edits and missing-file writes converge on one canonical owner", async () => {
	const value = await fixture();
	try {
		const canonicalPath = join(value.project, "src", "canonical.txt");
		const aliasPath = join(value.project, "src", "alias.txt");
		await writeFile(canonicalPath, "alpha\n", "utf8");
		await symlink("canonical.txt", aliasPath);

		const aliasChildren = [
			createFileAgent(value.manager, "canonical-editor", ["edit"]),
			createFileAgent(value.manager, "alias-editor", ["edit"]),
		];
		await Promise.all(aliasChildren.map((child) => value.manager.startAssignment(child.id)));
		const aliasHold = createMutationHold();
		const aliasRuns = [
			editTool(value.manager, aliasChildren[0], value.workspace, value.project, {
				afterWrite: () => aliasHold.hold("0"),
			}).execute(
				"canonical-edit",
				{ path: "src/canonical.txt", edits: [{ oldText: "alpha", newText: "canonical" }] },
			),
			editTool(value.manager, aliasChildren[1], value.workspace, value.project, {
				afterWrite: () => aliasHold.hold("1"),
			}).execute(
				"alias-edit",
				{ path: "src/alias.txt", edits: [{ oldText: "alpha", newText: "alias" }] },
			),
		];
		const aliasOutcome = await settleConflictWhileWinnerIsMutating(
			aliasRuns,
			aliasHold,
			"symlink-alias edit",
		);
		assert.equal(
			await readFile(canonicalPath, "utf8"),
			`${aliasOutcome.winner === 0 ? "canonical" : "alias"}\n`,
		);
		assert.deepEqual(
			value.manager.getAgent(aliasChildren[aliasOutcome.winner].id).leases.map((lease) => lease.path),
			["src/canonical.txt"],
		);

		await mkdir(join(value.project, "generated", "real"));
		await symlink("real", join(value.project, "generated", "alias"));
		const newChildren = [
			createFileAgent(value.manager, "new-writer-one", ["write"]),
			createFileAgent(value.manager, "new-writer-two", ["write"]),
		];
		await Promise.all(newChildren.map((child) => value.manager.startAssignment(child.id)));
		const newHold = createMutationHold();
		const newRuns = [
			writeTool(value.manager, newChildren[0], value.workspace, value.project, {
				afterWrite: () => newHold.hold("0"),
			}).execute(
				"new-write-one",
				{ path: "generated/real/new.txt", content: "one\n" },
			),
			writeTool(value.manager, newChildren[1], value.workspace, value.project, {
				afterWrite: () => newHold.hold("1"),
			}).execute(
				"new-write-two",
				{ path: "generated/alias/new.txt", content: "two\n" },
			),
		];
		const newOutcome = await settleConflictWhileWinnerIsMutating(
			newRuns,
			newHold,
			"aliased missing-file write",
		);
		assert.equal(
			await readFile(join(value.project, "generated", "real", "new.txt"), "utf8"),
			`${newOutcome.winner === 0 ? "one" : "two"}\n`,
		);
		assert.deepEqual(
			value.manager.getAgent(newChildren[newOutcome.winner].id).leases.map((lease) => lease.path),
			["generated/real/new.txt"],
		);
		assert.deepEqual(value.manager.getAgent(newChildren[newOutcome.loser].id).leases, []);
	} finally {
		await cleanup(value, "alias and new-file concurrency test complete");
	}
});

test("different-file guarded edits overlap inside independent built-in mutation windows", async () => {
	const value = await fixture();
	const rendezvous = createRendezvous(2);
	try {
		await Promise.all([
			writeFile(join(value.project, "src", "left.txt"), "left\n", "utf8"),
			writeFile(join(value.project, "src", "right.txt"), "right\n", "utf8"),
		]);
		const children = [
			createFileAgent(value.manager, "left-editor", ["edit"]),
			createFileAgent(value.manager, "right-editor", ["edit"]),
		];
		await Promise.all(children.map((child) => value.manager.startAssignment(child.id)));
		const runs = [
			editTool(value.manager, children[0], value.workspace, value.project, {
				afterWrite: () => rendezvous.arrive("left"),
			}).execute(
				"overlap-left",
				{ path: "src/left.txt", edits: [{ oldText: "left", newText: "LEFT" }] },
			),
			editTool(value.manager, children[1], value.workspace, value.project, {
				afterWrite: () => rendezvous.arrive("right"),
			}).execute(
				"overlap-right",
				{ path: "src/right.txt", edits: [{ oldText: "right", newText: "RIGHT" }] },
			),
		];

		let overlapError;
		try {
			await withWatchdog(rendezvous.ready, "both distinct file mutation windows");
			assert.deepEqual([...rendezvous.arrivals].sort(), ["left", "right"]);
			assert.deepEqual(
				children.map((child) => value.manager.getAgent(child.id).leases.map((lease) => lease.path)),
				[["src/left.txt"], ["src/right.txt"]],
			);
		} catch (error) {
			overlapError = error;
		} finally {
			rendezvous.release();
		}
		const settled = await Promise.allSettled(runs);
		if (overlapError) throw overlapError;
		assert.deepEqual(settled.map((result) => result.status), ["fulfilled", "fulfilled"]);
		assert.equal(await readFile(join(value.project, "src", "left.txt"), "utf8"), "LEFT\n");
		assert.equal(await readFile(join(value.project, "src", "right.txt"), "utf8"), "RIGHT\n");
	} finally {
		rendezvous.release();
		await cleanup(value, "different-file overlap test complete");
	}
});

test("an active workspace-exclusive bash child blocks edit, write, and sibling bash before execution", async () => {
	const value = await fixture();
	const entered = deferred();
	const release = deferred();
	try {
		const editPath = join(value.project, "src", "bash-blocked.txt");
		const newPath = join(value.project, "generated", "bash-blocked-new.txt");
		await writeFile(editPath, "alpha\n", "utf8");
		const bashChild = createBashAgent(value.manager, "workspace-owner");
		const editChild = createFileAgent(value.manager, "bash-blocked-editor", ["edit"]);
		const writeChild = createFileAgent(value.manager, "bash-blocked-writer", ["write"]);
		const secondBashChild = createBashAgent(value.manager, "bash-blocked-bash");
		await Promise.all(
			[bashChild, editChild, writeChild, secondBashChild].map((child) =>
				value.manager.startAssignment(child.id),
			),
		);
		const bashRun = bashTool(value.manager, bashChild, value.workspace, value.project, {
			async exec() {
				entered.resolve();
				await release.promise;
				return { exitCode: 0 };
			},
		}).execute("workspace-bash", { command: "offline foreground hold" });

		try {
			await withWatchdog(entered.promise, "workspace-exclusive bash execution");
			assert.equal(value.manager.getAgent(bashChild.id).leases[0].kind, "workspace");
			let siblingBashExecutions = 0;
			const blocked = await Promise.allSettled([
				editTool(value.manager, editChild, value.workspace, value.project).execute(
					"bash-blocked-edit",
					{ path: "src/bash-blocked.txt", edits: [{ oldText: "alpha", newText: "denied" }] },
				),
				writeTool(value.manager, writeChild, value.workspace, value.project).execute(
					"bash-blocked-write",
					{ path: "generated/bash-blocked-new.txt", content: "denied\n" },
				),
				bashTool(value.manager, secondBashChild, value.workspace, value.project, {
					async exec() {
						siblingBashExecutions += 1;
						return { exitCode: 0 };
					},
				}).execute("bash-blocked-bash", { command: "must not execute" }),
			]);
			assert.deepEqual(blocked.map((result) => result.status), ["rejected", "rejected", "rejected"]);
			assert.deepEqual(
				blocked.map((result) => result.reason?.code),
				["lease_conflict", "lease_conflict", "lease_conflict"],
			);
			assert.equal(siblingBashExecutions, 0);
			assert.equal(await readFile(editPath, "utf8"), "alpha\n");
			await assert.rejects(readFile(newPath, "utf8"), /ENOENT/);
			assert.deepEqual(value.manager.getAgent(editChild.id).leases, []);
			assert.deepEqual(value.manager.getAgent(writeChild.id).leases, []);
			assert.deepEqual(value.manager.getAgent(secondBashChild.id).leases, []);
		} finally {
			release.resolve();
			await bashRun;
		}
	} finally {
		release.resolve();
		await cleanup(value, "workspace bash conflict test complete");
	}
});

test("a child mutation lease blocks a concurrent main mutation until explicit idle release", async () => {
	const value = await fixture();
	const interceptor = new ParentMutationInterceptor(value.manager);
	const entered = deferred();
	const release = deferred();
	try {
		const path = join(value.project, "src", "child-owned.txt");
		await writeFile(path, "alpha\n", "utf8");
		const child = createFileAgent(value.manager, "active-child-owner", ["edit"]);
		await value.manager.startAssignment(child.id);
		const childRun = editTool(value.manager, child, value.workspace, value.project, {
			async afterWrite() {
				entered.resolve();
				await release.promise;
			},
		}).execute(
			"child-owned-edit",
			{ path: "src/child-owned.txt", edits: [{ oldText: "alpha", newText: "child" }] },
		);

		try {
			await withWatchdog(entered.promise, "active child mutation window");
			const blocked = await interceptor.handleToolCall({
				toolName: "write",
				toolCallId: "parent-blocked-by-child",
				input: { path: "src/child-owned.txt", content: "parent\n" },
			}, value.project);
			assert.equal(blocked?.block, true);
			assert.match(blocked.reason, new RegExp(child.id));
			assert.match(blocked.reason, /src\/child-owned\.txt/);
			assert.equal(interceptor.activeReservationCount, 0);
		} finally {
			release.resolve();
			await childRun;
		}

		await value.manager.completeAssignment(child.id, {
			state: "idle",
			summary: "Child mutation reached a settled idle boundary",
		});
		await value.manager.releaseChildLeases(child.id);
		const admitted = {
			toolName: "write",
			toolCallId: "parent-after-child-release",
			input: { path: "src/child-owned.txt", content: "parent\n" },
		};
		assert.equal(await interceptor.handleToolCall(admitted, value.project), undefined);
		interceptor.handleToolExecutionEnd(admitted);
		assert.equal(interceptor.activeReservationCount, 0);
	} finally {
		release.resolve();
		interceptor.shutdown();
		await cleanup(value, "child-to-parent conflict test complete");
	}
});

test("an active main reservation blocks a guarded child claim and its completion permits the retry", async () => {
	const value = await fixture();
	const interceptor = new ParentMutationInterceptor(value.manager);
	try {
		const path = join(value.project, "src", "parent-owned.txt");
		await writeFile(path, "alpha\n", "utf8");
		const child = createFileAgent(value.manager, "parent-blocked-child", ["edit"]);
		await value.manager.startAssignment(child.id);
		const parentEvent = {
			toolName: "edit",
			toolCallId: "active-parent-edit",
			input: { path: "src/parent-owned.txt", edits: [] },
		};
		assert.equal(await interceptor.handleToolCall(parentEvent, value.project), undefined);
		assert.equal(interceptor.activeReservationCount, 1);

		const guarded = editTool(value.manager, child, value.workspace, value.project);
		await assert.rejects(
			guarded.execute(
				"child-blocked-by-parent",
				{ path: "src/parent-owned.txt", edits: [{ oldText: "alpha", newText: "child" }] },
			),
			(error) => error?.code === "lease_conflict" && /parent mutation/.test(error.message),
		);
		assert.equal(await readFile(path, "utf8"), "alpha\n");
		assert.deepEqual(value.manager.getAgent(child.id).leases, []);

		interceptor.handleToolResult(parentEvent);
		assert.equal(interceptor.activeReservationCount, 0);
		await guarded.execute(
			"child-after-parent",
			{ path: "src/parent-owned.txt", edits: [{ oldText: "alpha", newText: "child" }] },
		);
		assert.equal(await readFile(path, "utf8"), "child\n");
	} finally {
		interceptor.shutdown();
		await cleanup(value, "parent-to-child conflict test complete");
	}
});

test("settled abort cleanup, terminal failure, and generation shutdown release child ownership", async () => {
	const value = await fixture();
	let disposed = false;
	let replacementManager;
	try {
		await Promise.all([
			writeFile(join(value.project, "src", "abort.txt"), "abort\n", "utf8"),
			writeFile(join(value.project, "src", "failure.txt"), "failure\n", "utf8"),
			writeFile(join(value.project, "src", "shutdown.txt"), "shutdown\n", "utf8"),
		]);
		const [abortTarget, failureTarget, shutdownTarget] = await Promise.all(
			["abort.txt", "failure.txt", "shutdown.txt"].map((name) =>
				resolveCanonicalWorkspacePath({
					workspace: value.workspace.identity,
					path: `src/${name}`,
					allowMissing: false,
				}),
			),
		);
		const abortChild = createFileAgent(value.manager, "abort-cleanup-owner", ["edit"]);
		const failureChild = createFileAgent(value.manager, "terminal-failure-owner", ["edit"]);
		const shutdownChild = createFileAgent(value.manager, "shutdown-owner", ["edit"]);
		await Promise.all(
			[abortChild, failureChild, shutdownChild].map((child) => value.manager.startAssignment(child.id)),
		);
		await Promise.all([
			value.manager.claimChildFileLeases(abortChild.id, value.workspace.identity, [abortTarget]),
			value.manager.claimChildFileLeases(failureChild.id, value.workspace.identity, [failureTarget]),
			value.manager.claimChildFileLeases(shutdownChild.id, value.workspace.identity, [shutdownTarget]),
		]);

		let abortCalls = 0;
		let idleWaits = 0;
		value.manager.registerRuntimeCleanup(abortChild.id, {
			abort() {
				abortCalls += 1;
			},
			async waitForIdle() {
				idleWaits += 1;
			},
			dispose() {},
		});
		const removed = await value.manager.removeAgent(abortChild.id, "deterministic abort cleanup");
		assert.equal(removed.state, "removed");
		assert.equal(abortCalls, 1);
		assert.equal(idleWaits, 1);
		assert.deepEqual(removed.leases, []);
		const afterAbort = value.manager.reserveParentFiles(
			"after-abort-cleanup",
			value.workspace.identity,
			[abortTarget],
		);
		value.manager.releaseParentReservation(afterAbort.token);

		const failed = await value.manager.failAgent(
			failureChild.id,
			new Error("synthetic settled failure"),
			{ runtimeSettled: true },
		);
		assert.equal(failed.state, "failed");
		assert.deepEqual(failed.leases, []);
		const afterFailure = value.manager.reserveParentFiles(
			"after-terminal-failure",
			value.workspace.identity,
			[failureTarget],
		);
		value.manager.releaseParentReservation(afterFailure.token);

		const shutdownOrder = [];
		value.manager.registerRuntimeCleanup(shutdownChild.id, {
			abort() {
				shutdownOrder.push("abort");
			},
			async waitForIdle() {
				shutdownOrder.push("waitForIdle");
				throw new Error("synthetic unproven idle boundary");
			},
			dispose() {
				shutdownOrder.push("dispose");
			},
		});
		assert.equal(value.manager.getAgent(shutdownChild.id).leases.length, 1);
		await value.manager.disposeAll("deterministic generation shutdown");
		disposed = true;
		assert.deepEqual(shutdownOrder, ["abort", "waitForIdle", "dispose"]);
		assert.equal(value.manager.closed, true);
		assert.equal(value.manager.getAgent(shutdownChild.id).state, "removed");
		assert.deepEqual(value.manager.getAgent(shutdownChild.id).leases, []);
		assert.match(value.manager.getAgent(shutdownChild.id).lastError, /retained workspace ownership/);

		// A replacement generation may coordinate this path only after the old
		// runtime's synchronous dispose boundary and complete lease-manager close.
		replacementManager = new SubAgentManager({
			cwd: value.project,
			generation: `sag1-workspace-concurrency-replacement-${fixtureSequence}`,
			nonce: () => "replacement-owner",
			modelRuntime: { async dispose() {} },
		});
		const replacement = createFileAgent(replacementManager, "replacement-owner", ["edit"]);
		await replacementManager.startAssignment(replacement.id);
		const replacementClaim = await replacementManager.claimChildFileLeases(
			replacement.id,
			value.workspace.identity,
			[shutdownTarget],
		);
		assert.deepEqual(replacementClaim.leases.map((lease) => lease.path), ["src/shutdown.txt"]);
	} finally {
		await replacementManager?.disposeAll("replacement generation cleanup");
		if (!disposed) await value.manager.disposeAll("lifecycle release test cleanup");
		await rm(value.temporary, { recursive: true, force: true });
	}
});

test("opposing concurrent multi-file claims are sorted, all-or-nothing, and retry without deadlock", async () => {
	const value = await fixture();
	try {
		await Promise.all([
			writeFile(join(value.project, "src", "a.txt"), "a\n", "utf8"),
			writeFile(join(value.project, "src", "b.txt"), "b\n", "utf8"),
		]);
		const scope = await resolveCanonicalWriteScope(value.workspace.identity, [
			"src/b.txt",
			"src/a.txt",
		]);
		assert.deepEqual(scope.paths.map((target) => target.relativePath), ["src/a.txt", "src/b.txt"]);
		const children = [
			createFileAgent(value.manager, "multi-file-one", ["edit", "write"]),
			createFileAgent(value.manager, "multi-file-two", ["edit", "write"]),
		];
		await Promise.all(children.map((child) => value.manager.startAssignment(child.id)));
		const claims = await Promise.allSettled([
			value.manager.claimChildFileLeases(
				children[0].id,
				value.workspace.identity,
				[scope.paths[1], scope.paths[0]],
			),
			value.manager.claimChildFileLeases(
				children[1].id,
				value.workspace.identity,
				[scope.paths[0], scope.paths[1]],
			),
		]);
		const outcome = assertOneLeaseWinner(claims);
		assert.deepEqual(
			value.manager.getAgent(children[outcome.winner].id).leases.map((lease) => lease.path),
			["src/a.txt", "src/b.txt"],
		);
		assert.deepEqual(value.manager.getAgent(children[outcome.loser].id).leases, []);

		await value.manager.failAgent(
			children[outcome.winner].id,
			new Error("release the winning atomic claim"),
			{ runtimeSettled: true },
		);
		const retried = await value.manager.claimChildFileLeases(
			children[outcome.loser].id,
			value.workspace.identity,
			[scope.paths[1], scope.paths[0]],
		);
		assert.deepEqual(retried.leases.map((lease) => lease.path), ["src/a.txt", "src/b.txt"]);
	} finally {
		await cleanup(value, "atomic multi-file concurrency test complete");
	}
});
