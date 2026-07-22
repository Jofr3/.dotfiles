import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { importInstalledPackages } from "./installed-packages.mjs";

function deferred() {
	let resolvePromise;
	let rejectPromise;
	const promise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function stripAtPrefix(path) {
	return path.startsWith("@") ? path.slice(1) : path;
}

async function canonicalLeasePath(cwd, path) {
	const absolutePath = resolve(cwd, stripAtPrefix(path));
	try {
		return await realpath(absolutePath);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
			return absolutePath;
		}
		throw error;
	}
}

function guardFileTool(baseDefinition, cwd, claim) {
	return {
		...baseDefinition,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const leasePath = await canonicalLeasePath(cwd, params.path);
			await claim({ kind: "file", path: leasePath });
			return baseDefinition.execute(toolCallId, params, signal, onUpdate, ctx);
		},
	};
}

function guardBashTool(baseDefinition, cwd, claim) {
	return {
		...baseDefinition,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			await claim({ kind: "workspace", cwd });
			return baseDefinition.execute(toolCallId, params, signal, onUpdate, ctx);
		},
	};
}

function assertDefinitionMetadataPreserved(baseDefinition, guardedDefinition) {
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
		assert.strictEqual(guardedDefinition[key], baseDefinition[key], `Guard wrapper changed ${baseDefinition.name}.${key}`);
	}
	assert.notStrictEqual(guardedDefinition.execute, baseDefinition.execute);
}

test("guarded built-in definitions preserve metadata/results and claim before edit, write, or bash side effects", async () => {
	const { codingAgent } = await importInstalledPackages();
	const root = await mkdtemp(resolve(tmpdir(), "pi-sub-agents-guarded-tools-"));

	try {
		const existingPath = resolve(root, "existing.txt");
		await writeFile(existingPath, "alpha\nbeta\n", "utf8");

		const operationEvents = [];
		let editContent = Buffer.from("alpha\nbeta\n");
		let bashSignal;
		const editBase = codingAgent.createEditToolDefinition(root, {
			operations: {
				async access(path) {
					operationEvents.push(`edit:access:${path}`);
				},
				async readFile(path) {
					operationEvents.push(`edit:read:${path}`);
					return editContent;
				},
				async writeFile(path, content) {
					operationEvents.push(`edit:write:${path}`);
					editContent = Buffer.from(content);
				},
			},
		});
		const writeBase = codingAgent.createWriteToolDefinition(root, {
			operations: {
				async mkdir(path) {
					operationEvents.push(`write:mkdir:${path}`);
				},
				async writeFile(path, content) {
					operationEvents.push(`write:write:${path}:${content}`);
				},
			},
		});
		const bashBase = codingAgent.createBashToolDefinition(root, {
			operations: {
				async exec(command, cwd, options) {
					operationEvents.push(`bash:exec:${cwd}:${command}`);
					bashSignal = options.signal;
					if (options.signal?.aborted) throw new Error("aborted");
					options.onData(Buffer.from("offline bash output\n"));
					return { exitCode: 0 };
				},
			},
		});

		const claims = [];
		const claim = async (request) => claims.push(request);
		const guardedEdit = guardFileTool(editBase, root, claim);
		const guardedWrite = guardFileTool(writeBase, root, claim);
		const guardedBash = guardBashTool(bashBase, root, claim);
		assertDefinitionMetadataPreserved(editBase, guardedEdit);
		assertDefinitionMetadataPreserved(writeBase, guardedWrite);
		assertDefinitionMetadataPreserved(bashBase, guardedBash);

		const editResult = await guardedEdit.execute(
			"edit-success",
			{ path: "@existing.txt", edits: [{ oldText: "alpha", newText: "gamma" }] },
			undefined,
			undefined,
			undefined,
		);
		assert.equal(editContent.toString("utf8"), "gamma\nbeta\n");
		assert.deepEqual(Object.keys(editResult.details).sort(), ["diff", "firstChangedLine", "patch"]);
		assert.match(editResult.details.diff, /gamma/);
		assert.match(editResult.details.patch, /existing\.txt/);

		const writeResult = await guardedWrite.execute(
			"write-success",
			{ path: "@nested/new.txt", content: "new content" },
			undefined,
			undefined,
			undefined,
		);
		assert.equal(writeResult.details, undefined);
		assert.match(writeResult.content[0].text, /Successfully wrote 11 bytes/);

		const bashUpdates = [];
		const bashController = new AbortController();
		const bashResult = await guardedBash.execute(
			"bash-success",
			{ command: "offline-command", timeout: 3 },
			bashController.signal,
			(update) => bashUpdates.push(update),
			undefined,
		);
		assert.strictEqual(bashSignal, bashController.signal);
		assert.equal(bashResult.details, undefined);
		assert.equal(bashResult.content[0].text, "offline bash output\n");
		assert.ok(bashUpdates.length >= 1);

		assert.deepEqual(claims, [
			{ kind: "file", path: await realpath(existingPath) },
			{ kind: "file", path: resolve(root, "nested/new.txt") },
			{ kind: "workspace", cwd: root },
		]);
		assert.ok(operationEvents[0].startsWith("edit:access:"), "The successful edit should begin after its claim");

		let rejectedOperationCount = 0;
		const deniedClaim = async () => {
			throw new Error("synthetic lease conflict");
		};
		const deniedEdit = guardFileTool(
			codingAgent.createEditToolDefinition(root, {
				operations: {
					async access() {
						rejectedOperationCount += 1;
					},
					async readFile() {
						rejectedOperationCount += 1;
						return Buffer.from("alpha");
					},
					async writeFile() {
						rejectedOperationCount += 1;
					},
				},
			}),
			root,
			deniedClaim,
		);
		const deniedWrite = guardFileTool(
			codingAgent.createWriteToolDefinition(root, {
				operations: {
					async mkdir() {
						rejectedOperationCount += 1;
					},
					async writeFile() {
						rejectedOperationCount += 1;
					},
				},
			}),
			root,
			deniedClaim,
		);
		const deniedBash = guardBashTool(
			codingAgent.createBashToolDefinition(root, {
				operations: {
					async exec() {
						rejectedOperationCount += 1;
						return { exitCode: 0 };
					},
				},
			}),
			root,
			deniedClaim,
		);

		await assert.rejects(
			deniedEdit.execute(
				"edit-denied",
				{ path: "existing.txt", edits: [{ oldText: "alpha", newText: "denied" }] },
				undefined,
				undefined,
				undefined,
			),
			/synthetic lease conflict/,
		);
		await assert.rejects(
			deniedWrite.execute(
				"write-denied",
				{ path: "denied.txt", content: "denied" },
				undefined,
				undefined,
				undefined,
			),
			/synthetic lease conflict/,
		);
		await assert.rejects(
			deniedBash.execute("bash-denied", { command: "denied" }, undefined, undefined, undefined),
			/synthetic lease conflict/,
		);
		assert.equal(rejectedOperationCount, 0, "No built-in operation may start after a rejected claim");

		const abortedEditController = new AbortController();
		abortedEditController.abort();
		const editEventsBeforeAbort = operationEvents.length;
		await assert.rejects(
			guardedEdit.execute(
				"edit-aborted",
				{ path: "existing.txt", edits: [{ oldText: "gamma", newText: "aborted" }] },
				abortedEditController.signal,
				undefined,
				undefined,
			),
			/Operation aborted/,
		);
		assert.equal(operationEvents.length, editEventsBeforeAbort, "An already-aborted edit must not reach filesystem operations");

		const abortedWriteController = new AbortController();
		abortedWriteController.abort();
		const writeEventsBeforeAbort = operationEvents.length;
		await assert.rejects(
			guardedWrite.execute(
				"write-aborted",
				{ path: "aborted.txt", content: "aborted" },
				abortedWriteController.signal,
				undefined,
				undefined,
			),
			/Operation aborted/,
		);
		assert.equal(operationEvents.length, writeEventsBeforeAbort, "An already-aborted write must not reach filesystem operations");

		const abortedBashController = new AbortController();
		abortedBashController.abort();
		await assert.rejects(
			guardedBash.execute(
				"bash-aborted",
				{ command: "aborted" },
				abortedBashController.signal,
				undefined,
				undefined,
			),
			/Command aborted/,
		);
		assert.strictEqual(bashSignal, abortedBashController.signal);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("built-in mutation queues cover the full write window and serialize existing symlink aliases", async () => {
	const { codingAgent } = await importInstalledPackages();
	const root = await mkdtemp(resolve(tmpdir(), "pi-sub-agents-tool-queue-"));

	try {
		const targetPath = resolve(root, "target.txt");
		const aliasPath = resolve(root, "alias.txt");
		await writeFile(targetPath, "initial", "utf8");
		await symlink(targetPath, aliasPath);

		const firstMkdirEntered = deferred();
		const releaseFirstMkdir = deferred();
		const secondMkdirEntered = deferred();
		const events = [];
		let mkdirCount = 0;
		const base = codingAgent.createWriteToolDefinition(root, {
			operations: {
				async mkdir() {
					mkdirCount += 1;
					events.push(`mkdir:${mkdirCount}`);
					if (mkdirCount === 1) {
						firstMkdirEntered.resolve();
						await releaseFirstMkdir.promise;
					} else {
						secondMkdirEntered.resolve();
					}
				},
				async writeFile(_path, content) {
					events.push(`write:${content}`);
				},
			},
		});
		const claims = [];
		const guarded = guardFileTool(base, root, async (request) => claims.push(request));

		const firstRun = guarded.execute(
			"first-write",
			{ path: "@target.txt", content: "first" },
			undefined,
			undefined,
			undefined,
		);
		await firstMkdirEntered.promise;

		const secondRun = guarded.execute(
			"second-write",
			{ path: "alias.txt", content: "second" },
			undefined,
			undefined,
			undefined,
		);
		const secondEnteredBeforeRelease = await Promise.race([
			secondMkdirEntered.promise.then(() => true),
			new Promise((resolvePromise) => setTimeout(() => resolvePromise(false), 50)),
		]);
		assert.equal(secondEnteredBeforeRelease, false, "The symlink alias must wait for the target's whole mkdir/write window");
		assert.equal(mkdirCount, 1);

		releaseFirstMkdir.resolve();
		await Promise.all([firstRun, secondRun]);
		assert.equal(mkdirCount, 2);
		assert.deepEqual(events, ["mkdir:1", "write:first", "mkdir:2", "write:second"]);
		const canonicalTarget = await realpath(targetPath);
		assert.deepEqual(claims, [
			{ kind: "file", path: canonicalTarget },
			{ kind: "file", path: canonicalTarget },
		]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
