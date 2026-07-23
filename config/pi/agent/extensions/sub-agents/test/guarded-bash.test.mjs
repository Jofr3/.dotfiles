import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	importInstalledPackages,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const {
	GuardedChildBashError,
	createGuardedChildBashTool,
} = await importSubAgentsModule("workspace/guarded-tools.ts");
const {
	resolveCanonicalWorkspacePath,
	resolveSharedWorkspace,
} = await importSubAgentsModule("workspace/paths.ts");
const { SubAgentManager } = await importSubAgentsModule("manager.ts");

function deferred() {
	let resolvePromise;
	let rejectPromise;
	const promise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function fixture(prefix = "pi-sub-agent-guarded-bash-") {
	const temporary = await mkdtemp(join(tmpdir(), prefix));
	const project = join(temporary, "project");
	await mkdir(join(project, "src"), { recursive: true });
	const workspace = await resolveSharedWorkspace(project);
	return { temporary, project, workspace };
}

function createManager(project, generation = "sag1-guarded-bash") {
	let nonce = 0;
	return new SubAgentManager({
		cwd: project,
		generation,
		nonce: () => `guarded-bash-${++nonce}`,
		modelRuntime: { async dispose() {} },
	});
}

function createAgent(manager, name) {
	return manager.createAgent({
		name,
		role: "Run one foreground command under whole-workspace ownership",
		objective: "Exercise guarded workspace-exclusive bash without external services.",
		tools: ["bash"],
		workspace: { mode: "shared", bashPolicy: "workspace-exclusive" },
	});
}

function guardedTool(manager, id, workspace, cwd, operations) {
	return createGuardedChildBashTool({
		cwd,
		workspace: workspace.identity,
		claimWorkspace: async () => {
			await manager.claimChildWorkspaceLease(id, workspace.identity);
		},
		dependencies: { operations },
	});
}

function assertGuardedError(error, code) {
	assert.ok(error instanceof GuardedChildBashError);
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
			assert.equal(guarded[key].toString(), base[key].toString(), `guarded bash changed ${key}`);
		} else {
			assert.deepEqual(guarded[key], base[key], `guarded bash changed ${key}`);
		}
	}
	assert.notStrictEqual(guarded.execute, base.execute);
}

test("guarded bash preserves the built-in contract, claims the workspace, streams output, and propagates abort state", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project);
	let fullOutputPath;
	try {
		const child = createAgent(manager, "successful-bash");
		await manager.startAssignment(child.id);
		let capturedSignal;
		const operations = {
			async exec(command, cwd, options) {
				assert.equal(command, "offline foreground command");
				assert.equal(cwd, project);
				capturedSignal = options.signal;
				options.onData(Buffer.from("offline bash output\n"));
				return { exitCode: 0 };
			},
		};
		const guarded = guardedTool(manager, child.id, workspace, project, operations);
		const { codingAgent } = await importInstalledPackages();
		assertDefinitionMetadataPreserved(codingAgent.createBashToolDefinition(project), guarded);
		assert.equal(guarded.executionMode, "sequential");

		const controller = new AbortController();
		const updates = [];
		const result = await guarded.execute(
			"guarded-bash-success",
			{ command: "offline foreground command", timeout: 3 },
			controller.signal,
			(update) => updates.push(update),
			undefined,
		);
		assert.strictEqual(capturedSignal, controller.signal);
		assert.equal(result.content[0].text, "offline bash output\n");
		assert.equal(result.details, undefined);
		assert.ok(updates.length >= 1);
		assert.deepEqual(manager.getAgent(child.id).leases, [{
			kind: "workspace",
			workspaceKey: "shared",
			ownerAgentId: child.id,
			path: undefined,
			acquiredAt: manager.getAgent(child.id).leases[0].acquiredAt,
		}]);

		const truncated = guardedTool(manager, child.id, workspace, project, {
			async exec(_command, _cwd, options) {
				options.onData(Buffer.alloc(60 * 1024, "x"));
				return { exitCode: 0 };
			},
		});
		const truncatedResult = await truncated.execute(
			"guarded-bash-truncated",
			{ command: "large foreground output" },
			undefined,
			undefined,
			undefined,
		);
		assert.equal(truncatedResult.details.truncation.truncated, true);
		assert.equal(truncatedResult.details.truncation.truncatedBy, "bytes");
		assert.equal(typeof truncatedResult.details.fullOutputPath, "string");
		assert.match(truncatedResult.content[0].text, /Full output:/);
		fullOutputPath = truncatedResult.details.fullOutputPath;
	} finally {
		if (fullOutputPath) await rm(fullOutputPath, { force: true });
		await manager.disposeAll("guarded bash success complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded bash reports a conflicting child file lease before any command executes", async () => {
	const { temporary, project, workspace } = await fixture();
	const manager = createManager(project, "sag1-guarded-bash-conflict");
	try {
		const targetPath = join(project, "src", "target.txt");
		await writeFile(targetPath, "owned\n", "utf8");
		const target = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "src/target.txt",
			allowMissing: false,
		});
		const owner = manager.createAgent({
			name: "file-owner",
			role: "Own one exact file",
			objective: "Hold one lease for the guarded bash conflict test.",
			tools: ["edit"],
			workspace: { mode: "shared", bashPolicy: "disabled" },
		});
		const contender = createAgent(manager, "bash-contender");
		await Promise.all([manager.startAssignment(owner.id), manager.startAssignment(contender.id)]);
		await manager.claimChildFileLeases(owner.id, workspace.identity, [target]);
		let executions = 0;
		const guarded = guardedTool(manager, contender.id, workspace, project, {
			async exec() {
				executions += 1;
				return { exitCode: 0 };
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-bash-conflict",
				{ command: "must not execute" },
				undefined,
				undefined,
				undefined,
			),
			(error) => {
				assertGuardedError(error, "lease_conflict");
				assert.match(error.message, new RegExp(owner.id));
				assert.match(error.message, /file-owner/);
				return true;
			},
		);
		assert.equal(executions, 0);
		assert.deepEqual(manager.getAgent(contender.id).leases, []);
	} finally {
		await manager.disposeAll("guarded bash conflict complete");
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded bash rejects obvious background jobs before a claim while allowing non-background ampersands", async () => {
	const { temporary, project, workspace } = await fixture();
	try {
		let claims = 0;
		const commands = [];
		const guarded = createGuardedChildBashTool({
			cwd: project,
			workspace: workspace.identity,
			claimWorkspace() {
				claims += 1;
			},
			dependencies: {
				operations: {
					async exec(command) {
						commands.push(command);
						return { exitCode: 0 };
					},
				},
			},
		});

		await assert.rejects(
			guarded.execute(
				"guarded-bash-background",
				{ command: "sleep 10 &" },
				undefined,
				undefined,
				undefined,
			),
			(error) => assertGuardedError(error, "detached_process_rejected"),
		);
		assert.equal(claims, 0);
		assert.deepEqual(commands, []);

		for (const command of [
			"printf '%s' '&'",
			"printf \\&",
			"true && true",
			"printf x 2>&1",
			"printf x &>output.txt",
			"printf x |& cat",
		]) {
			await guarded.execute(`allowed-${claims}`, { command }, undefined, undefined, undefined);
		}
		assert.equal(claims, 6);
		assert.deepEqual(commands, [
			"printf '%s' '&'",
			"printf \\&",
			"true && true",
			"printf x 2>&1",
			"printf x &>output.txt",
			"printf x |& cat",
		]);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded bash performs no claim when already aborted and forwards an in-flight abort to Pi's backend", async () => {
	const { temporary, project, workspace } = await fixture();
	try {
		let claims = 0;
		let executions = 0;
		const entered = deferred();
		let receivedSignal;
		const guarded = createGuardedChildBashTool({
			cwd: project,
			workspace: workspace.identity,
			claimWorkspace() {
				claims += 1;
			},
			dependencies: {
				operations: {
					async exec(_command, _cwd, options) {
						executions += 1;
						receivedSignal = options.signal;
						entered.resolve();
						await new Promise((resolvePromise, rejectPromise) => {
							const onAbort = () => rejectPromise(new Error("aborted"));
							if (options.signal?.aborted) onAbort();
							else options.signal?.addEventListener("abort", onAbort, { once: true });
						});
						return { exitCode: 0 };
					},
				},
			},
		});

		const alreadyAborted = new AbortController();
		alreadyAborted.abort();
		await assert.rejects(
			guarded.execute(
				"guarded-bash-already-aborted",
				{ command: "must not execute" },
				alreadyAborted.signal,
				undefined,
				undefined,
			),
			/Command aborted/,
		);
		assert.equal(claims, 0);
		assert.equal(executions, 0);

		const controller = new AbortController();
		const running = guarded.execute(
			"guarded-bash-in-flight-abort",
			{ command: "foreground wait" },
			controller.signal,
			undefined,
			undefined,
		);
		await entered.promise;
		controller.abort();
		await assert.rejects(running, /Command aborted/);
		assert.equal(claims, 1);
		assert.equal(executions, 1);
		assert.strictEqual(receivedSignal, controller.signal);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});
