import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
	importInstalledPackages,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const {
	READ_ONLY_CHILD_TOOL_NAMES,
	SubAgentSessionFactoryError,
	createSubAgentSession,
	resolveEnabledChildTools,
	resolveReadOnlyChildTools,
} = await importSubAgentsModule("agent-runtime.ts");
const { SubAgentManager } = await importSubAgentsModule("manager.ts");
const { captureParentContextSnapshot } = await importSubAgentsModule("resource-loader.ts");

const PRIVATE_FAILURE_MARKER = "private-child-session-initialization-marker";

function deferred() {
	let resolvePromise;
	let rejectPromise;
	const promise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function childSpec(overrides = {}) {
	return {
		name: "read-only-runtime",
		role: "Inspect the approved project without mutating it",
		objective: "Return a bounded summary of the approved files.",
		thinkingLevel: "off",
		...overrides,
	};
}

function assertFactoryError(error, code) {
	assert.ok(error instanceof SubAgentSessionFactoryError);
	assert.equal(error.code, code);
	assert.ok(!error.message.includes(PRIVATE_FAILURE_MARKER));
	return true;
}

async function createOfflineResolvedModel(providerId = "child-runtime-faux") {
	const { codingAgent, piAi } = await importInstalledPackages();
	const faux = piAi.fauxProvider({ provider: providerId, tokensPerSecond: 100_000 });
	const runtime = await codingAgent.ModelRuntime.create({
		credentials: new piAi.InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	runtime.registerNativeProvider(faux.provider);
	const model = runtime.getModel(providerId, "faux-1");
	assert.ok(model);
	return {
		codingAgent,
		piAi,
		faux,
		resolvedModel: {
			runtime,
			model,
			ref: { provider: model.provider, id: model.id },
		},
	};
}

test("the child session factory creates one isolated reusable in-memory read-only session", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runtime-"));
	let child;
	try {
		const project = join(root, "project");
		const nested = join(project, "packages", "a");
		await mkdir(nested, { recursive: true });
		const { faux, piAi, resolvedModel } = await createOfflineResolvedModel();
		const capturedSystemPrompts = [];
		faux.setResponses([
			(context) => {
				capturedSystemPrompts.push(context.systemPrompt);
				return piAi.fauxAssistantMessage("read-only child complete");
			},
		]);

		const generation = "sag1-agent-runtime-production";
		const parentContext = captureParentContextSnapshot({
			generation,
			trusted: true,
			contextFiles: [{ path: join(project, "CLAUDE.md"), content: "APPROVED_CHILD_RUNTIME_CONTEXT" }],
			capturedAt: 1,
		});
		const events = [];
		child = await createSubAgentSession({
			id: "sa1-agent-runtime-production-1-child",
			generation,
			cwd: project,
			spec: childSpec({
				tools: ["read", "grep", "read"],
				workspace: { mode: "shared", cwd: "packages/a", writeScope: [], bashPolicy: "disabled" },
			}),
			resolvedModel,
			parentContext,
			onEvent: (event) => events.push(event.type),
			onReport() {},
		});

		assert.equal(child.cwd, resolve(nested));
		assert.deepEqual(child.workspace, {
			mode: "shared",
			root: resolve(project),
			key: `shared:${resolve(project)}`,
		});
		assert.ok(Object.isFrozen(child.workspace));
		assert.deepEqual(child.writeScope.paths, []);
		assert.equal(child.sessionManager.isPersisted(), false);
		assert.equal(child.sessionManager.getCwd(), resolve(nested));
		assert.equal(child.session.sessionFile, undefined);
		assert.strictEqual(child.session.sessionManager, child.sessionManager);
		assert.strictEqual(child.session.settingsManager, child.settingsManager);
		assert.strictEqual(child.session.resourceLoader, child.resourceLoader);
		assert.strictEqual(child.session.modelRuntime, resolvedModel.runtime);
		assert.deepEqual(child.modelRef, resolvedModel.ref);
		assert.deepEqual(child.selectedTools, ["read", "grep", "report_to_parent"]);
		assert.deepEqual(child.session.getAllTools().map((tool) => tool.name).sort(), [
			"grep",
			"read",
			"report_to_parent",
		]);
		assert.deepEqual(child.session.getActiveToolNames().sort(), [
			"grep",
			"read",
			"report_to_parent",
		]);
		assert.equal(child.thinkingLevel, "off");
		assert.ok(Object.isFrozen(child.selectedTools));
		assert.ok(Object.isFrozen(child.modelRef));

		await child.session.prompt("begin the isolated assignment");
		assert.equal(child.session.getLastAssistantText(), "read-only child complete");
		assert.ok(events.includes("agent_start"));
		assert.ok(events.includes("agent_settled"));
		assert.equal(capturedSystemPrompts.length, 1);
		assert.match(capturedSystemPrompts[0], /APPROVED_CHILD_RUNTIME_CONTEXT/);
		assert.doesNotMatch(capturedSystemPrompts[0], /sub_agents_spawn/);
		assert.equal(child.disposed, false);
		await child.close();
		await child.close();
		assert.equal(child.disposed, true);
	} finally {
		if (child && !child.disposed) await child.close().catch(() => undefined);
		await rm(root, { recursive: true, force: true });
	}
});

test("read-only selection and workspace validation fail closed before child session creation", async () => {
	assert.deepEqual(resolveReadOnlyChildTools(undefined), READ_ONLY_CHILD_TOOL_NAMES);
	assert.deepEqual(resolveReadOnlyChildTools([]), []);
	assert.deepEqual(resolveReadOnlyChildTools(["ls", "find", "ls"]), ["ls", "find"]);
	assert.deepEqual(resolveEnabledChildTools(["read", "edit", "write", "bash", "read"]), ["read", "edit", "write", "bash"]);
	assert.throws(
		() => resolveReadOnlyChildTools(["edit"]),
		(error) => assertFactoryError(error, "mutating_tools_disabled"),
	);
	assert.throws(
		() => resolveReadOnlyChildTools(["unknown-tool"]),
		(error) => assertFactoryError(error, "unsupported_tool"),
	);

	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runtime-boundary-"));
	try {
		const project = join(root, "project");
		const outside = join(root, "outside");
		await Promise.all([mkdir(project, { recursive: true }), mkdir(outside, { recursive: true })]);
		await symlink(outside, join(project, "outside-link"));
		const { resolvedModel } = await createOfflineResolvedModel("child-runtime-boundary-faux");
		let createCalls = 0;
		const createSession = async () => {
			createCalls += 1;
			throw new Error("must not initialize");
		};
		const base = {
			id: "sa1-agent-runtime-boundary-1-child",
			generation: "sag1-agent-runtime-boundary",
			cwd: project,
			resolvedModel,
			onEvent() {},
			onReport() {},
			dependencies: { createSession },
		};

		await assert.rejects(
			createSubAgentSession({
				...base,
				spec: childSpec({ tools: ["bash"] }),
			}),
			(error) => assertFactoryError(error, "mutating_tools_disabled"),
		);
		await assert.rejects(
			createSubAgentSession({
				...base,
				spec: childSpec({
					tools: [],
					workspace: { mode: "shared", bashPolicy: "workspace-exclusive" },
				}),
			}),
			(error) => assertFactoryError(error, "invalid_runtime_request"),
		);
		await assert.rejects(
			createSubAgentSession({
				...base,
				spec: childSpec({
					tools: ["bash"],
					workspace: { mode: "shared", bashPolicy: "workspace-exclusive" },
				}),
			}),
			(error) => assertFactoryError(error, "invalid_runtime_request"),
		);
		await assert.rejects(
			createSubAgentSession({
				...base,
				spec: childSpec({ tools: ["write"] }),
			}),
			(error) => assertFactoryError(error, "invalid_runtime_request"),
		);
		await assert.rejects(
			createSubAgentSession({
				...base,
				spec: childSpec({ workspace: { mode: "worktree" } }),
			}),
			(error) => assertFactoryError(error, "unsupported_workspace"),
		);
		await assert.rejects(
			createSubAgentSession({
				...base,
				spec: childSpec({ workspace: { mode: "invalid" } }),
			}),
			(error) => assertFactoryError(error, "invalid_runtime_request"),
		);
		await assert.rejects(
			createSubAgentSession({
				...base,
				spec: childSpec({ thinkingLevel: "invalid" }),
			}),
			(error) => assertFactoryError(error, "invalid_runtime_request"),
		);
		await assert.rejects(
			createSubAgentSession({
				...base,
				spec: childSpec({ workspace: { mode: "shared", cwd: "../outside" } }),
			}),
			(error) => assertFactoryError(error, "workspace_outside_root"),
		);
		await assert.rejects(
			createSubAgentSession({
				...base,
				spec: childSpec({ workspace: { mode: "shared", cwd: "outside-link" } }),
			}),
			(error) => assertFactoryError(error, "workspace_outside_root"),
		);
		assert.equal(createCalls, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("the child session factory installs guarded edit and atomically claims a declared scope", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runtime-edit-"));
	let child;
	let manager;
	try {
		const target = join(root, "target.txt");
		await writeFile(target, "alpha\n", "utf8");
		const generation = "sag1-agent-runtime-edit";
		let nonce = 0;
		manager = new SubAgentManager({
			cwd: root,
			generation,
			nonce: () => `runtime-edit-${++nonce}`,
			modelRuntime: { async dispose() {} },
		});
		const spec = childSpec({
			name: "guarded-edit-runtime",
			role: "Edit one exact leased file",
			objective: "Prove the guarded edit definition replaces the built-in child mutator.",
			tools: ["edit"],
			workspace: {
				mode: "shared",
				writeScope: ["target.txt"],
				bashPolicy: "disabled",
			},
		});
		const record = manager.createAgent(spec);
		const { resolvedModel } = await createOfflineResolvedModel("child-runtime-edit-faux");
		child = await createSubAgentSession({
			id: record.id,
			generation,
			cwd: root,
			spec: record.spec,
			resolvedModel,
			onEvent() {},
			onReport() {},
			claimFileLeases: async (workspace, targets) => {
				await manager.claimChildFileLeases(record.id, workspace, targets);
			},
			onFileMutation: async (mutationTarget) => {
				await manager.recordChildFileMutation(record.id, mutationTarget);
			},
		});

		assert.deepEqual(child.selectedTools, ["edit", "report_to_parent"]);
		assert.deepEqual(child.session.getAllTools().map((tool) => tool.name).sort(), [
			"edit",
			"report_to_parent",
		]);
		assert.deepEqual(child.session.getActiveToolNames().sort(), ["edit", "report_to_parent"]);
		assert.deepEqual(child.writeScope.paths.map((entry) => entry.relativePath), ["target.txt"]);
		assert.deepEqual(manager.getAgent(record.id).leases.map((lease) => lease.path), ["target.txt"]);
		assert.deepEqual(
			child.session.getToolDefinition("edit").promptGuidelines,
			(await importInstalledPackages()).codingAgent.createEditToolDefinition(root).promptGuidelines,
		);
	} finally {
		if (child && !child.disposed) await child.close().catch(() => undefined);
		if (manager) await manager.disposeAll("guarded edit runtime test complete");
		await rm(root, { recursive: true, force: true });
	}
});

test("the child session factory installs guarded write and preclaims a missing declared target", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runtime-write-"));
	let child;
	let manager;
	try {
		const generation = "sag1-agent-runtime-write";
		let nonce = 0;
		manager = new SubAgentManager({
			cwd: root,
			generation,
			nonce: () => `runtime-write-${++nonce}`,
			modelRuntime: { async dispose() {} },
		});
		const spec = childSpec({
			name: "guarded-write-runtime",
			role: "Create one exact leased file",
			objective: "Prove the guarded write definition replaces the built-in child mutator.",
			tools: ["write"],
			workspace: {
				mode: "shared",
				writeScope: ["generated/target.txt"],
				bashPolicy: "disabled",
			},
		});
		const record = manager.createAgent(spec);
		const { resolvedModel } = await createOfflineResolvedModel("child-runtime-write-faux");
		child = await createSubAgentSession({
			id: record.id,
			generation,
			cwd: root,
			spec: record.spec,
			resolvedModel,
			onEvent() {},
			onReport() {},
			claimFileLeases: async (workspace, targets) => {
				await manager.claimChildFileLeases(record.id, workspace, targets);
			},
			reconcileFileLease: async (workspace, target) => {
				await manager.reconcileChildFileLease(record.id, workspace, target);
			},
			onFileMutation: async (mutationTarget) => {
				await manager.recordChildFileMutation(record.id, mutationTarget);
			},
		});

		assert.deepEqual(child.selectedTools, ["write", "report_to_parent"]);
		assert.deepEqual(child.session.getAllTools().map((tool) => tool.name).sort(), [
			"report_to_parent",
			"write",
		]);
		assert.deepEqual(child.session.getActiveToolNames().sort(), ["report_to_parent", "write"]);
		assert.deepEqual(child.writeScope.paths.map((entry) => entry.relativePath), ["generated/target.txt"]);
		assert.deepEqual(manager.getAgent(record.id).leases.map((lease) => lease.path), ["generated/target.txt"]);
		assert.deepEqual(
			child.session.getToolDefinition("write").promptGuidelines,
			(await importInstalledPackages()).codingAgent.createWriteToolDefinition(root).promptGuidelines,
		);
	} finally {
		if (child && !child.disposed) await child.close().catch(() => undefined);
		if (manager) await manager.disposeAll("guarded write runtime test complete");
		await rm(root, { recursive: true, force: true });
	}
});

test("the child session factory installs guarded bash and preclaims whole-workspace ownership", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runtime-bash-"));
	let child;
	let manager;
	try {
		const generation = "sag1-agent-runtime-bash";
		let nonce = 0;
		manager = new SubAgentManager({
			cwd: root,
			generation,
			nonce: () => `runtime-bash-${++nonce}`,
			modelRuntime: { async dispose() {} },
		});
		const spec = childSpec({
			name: "guarded-bash-runtime",
			role: "Run foreground commands under whole-workspace ownership",
			objective: "Prove guarded bash replaces the unguarded child built-in.",
			tools: ["bash"],
			workspace: {
				mode: "shared",
				bashPolicy: "workspace-exclusive",
			},
		});
		const record = manager.createAgent(spec);
		const { resolvedModel } = await createOfflineResolvedModel("child-runtime-bash-faux");
		child = await createSubAgentSession({
			id: record.id,
			generation,
			cwd: root,
			spec: record.spec,
			resolvedModel,
			onEvent() {},
			onReport() {},
			claimWorkspaceLease: async (workspace) => {
				await manager.claimChildWorkspaceLease(record.id, workspace);
			},
		});

		assert.deepEqual(child.selectedTools, ["bash", "report_to_parent"]);
		assert.deepEqual(child.session.getAllTools().map((tool) => tool.name).sort(), [
			"bash",
			"report_to_parent",
		]);
		assert.deepEqual(child.session.getActiveToolNames().sort(), ["bash", "report_to_parent"]);
		assert.deepEqual(manager.getAgent(record.id).leases.map((lease) => lease.kind), ["workspace"]);
		assert.deepEqual(
			child.session.getToolDefinition("bash").parameters,
			(await importInstalledPackages()).codingAgent.createBashToolDefinition(root).parameters,
		);
		await child.prepareAssignmentWorkspace();
		assert.equal(manager.getAgent(record.id).leases.length, 1);
	} finally {
		if (child && !child.disposed) await child.close().catch(() => undefined);
		if (manager) await manager.disposeAll("guarded bash runtime test complete");
		await rm(root, { recursive: true, force: true });
	}
});

test("a mixed guarded-bash child executes sibling mutation tools sequentially", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runtime-mixed-mutation-"));
	const bashEntered = deferred();
	const releaseBash = deferred();
	let child;
	let manager;
	try {
		const generation = "sag1-agent-runtime-mixed-mutation";
		let nonce = 0;
		manager = new SubAgentManager({
			cwd: root,
			generation,
			nonce: () => `runtime-mixed-mutation-${++nonce}`,
			modelRuntime: { async dispose() {} },
		});
		const spec = childSpec({
			name: "mixed-mutation-runtime",
			role: "Exercise one guarded bash and write batch under shared ownership",
			objective: "Prove same-child bash cannot overlap a sibling guarded file mutation.",
			tools: ["bash", "write"],
			workspace: {
				mode: "shared",
				writeScope: ["target.txt"],
				bashPolicy: "workspace-exclusive",
			},
		});
		const record = manager.createAgent(spec);
		const { faux, piAi, resolvedModel } = await createOfflineResolvedModel("child-runtime-mixed-mutation-faux");
		faux.setResponses([
			piAi.fauxAssistantMessage([
				piAi.fauxToolCall("bash", { command: "offline foreground hold" }),
				piAi.fauxToolCall("write", { path: "target.txt", content: "written\n" }),
			], { stopReason: "toolUse" }),
			piAi.fauxAssistantMessage("Sequential guarded mutation batch complete."),
		]);
		const events = [];
		child = await createSubAgentSession({
			id: record.id,
			generation,
			cwd: root,
			spec: record.spec,
			resolvedModel,
			onEvent(event) {
				events.push({ type: event.type, toolName: event.toolName });
			},
			onReport() {},
			claimFileLeases: (workspace, targets) =>
				manager.claimChildFileLeases(record.id, workspace, targets),
			reconcileFileLease: (workspace, target) =>
				manager.reconcileChildFileLease(record.id, workspace, target),
			claimWorkspaceLease: (workspace) =>
				manager.claimChildWorkspaceLease(record.id, workspace),
			onFileMutation: (target) => manager.recordChildFileMutation(record.id, target),
			dependencies: {
				guardedBashOperations: {
					async exec() {
						bashEntered.resolve();
						await releaseBash.promise;
						return { exitCode: 0 };
					},
				},
			},
		});
		await manager.startAssignment(record.id);

		const run = child.session.prompt("Run the mixed guarded mutation batch.");
		await bashEntered.promise;
		assert.equal(
			events.some((event) => event.type === "tool_execution_start" && event.toolName === "write"),
			false,
			"the sibling write must not start while guarded bash is still running",
		);
		await assert.rejects(readFile(join(root, "target.txt"), "utf8"), /ENOENT/);

		releaseBash.resolve();
		await run;
		assert.equal(await readFile(join(root, "target.txt"), "utf8"), "written\n");
		assert.equal(
			events.some((event) => event.type === "tool_execution_start" && event.toolName === "write"),
			true,
		);
		assert.deepEqual(manager.getAgent(record.id).currentAssignment.modifiedFiles, ["target.txt"]);
	} finally {
		releaseBash.resolve();
		if (child && !child.disposed) await child.close().catch(() => undefined);
		if (manager) await manager.disposeAll("mixed guarded mutation runtime test complete");
		await rm(root, { recursive: true, force: true });
	}
});

test("partial child initialization unsubscribes, aborts, waits, and disposes with bounded errors", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runtime-partial-"));
	try {
		const { resolvedModel } = await createOfflineResolvedModel("child-runtime-partial-faux");
		const cleanupOrder = [];
		let capturedOptions;
		const fakeSession = {
			model: resolvedModel.model,
			modelRuntime: resolvedModel.runtime,
			sessionFile: undefined,
			thinkingLevel: "off",
			getAllTools() {
				return capturedOptions.tools.map((name) => ({ name }));
			},
			getActiveToolNames() {
				return [...capturedOptions.tools];
			},
			get resourceLoader() {
				return capturedOptions.resourceLoader;
			},
			get sessionManager() {
				return capturedOptions.sessionManager;
			},
			get settingsManager() {
				return capturedOptions.settingsManager;
			},
			subscribe() {
				throw new Error(PRIVATE_FAILURE_MARKER);
			},
			async abort() {
				cleanupOrder.push("abort");
			},
			async waitForIdle() {
				cleanupOrder.push("wait");
			},
			dispose() {
				cleanupOrder.push("dispose");
			},
		};

		await assert.rejects(
			createSubAgentSession({
				id: "sa1-agent-runtime-partial-1-child",
				generation: "sag1-agent-runtime-partial",
				cwd: root,
				spec: childSpec({ tools: ["read"] }),
				resolvedModel,
				onEvent() {},
				onReport() {},
				dependencies: {
					async createSession(options) {
						capturedOptions = options;
						return { session: fakeSession };
					},
				},
			}),
			(error) => assertFactoryError(error, "event_subscription_failed"),
		);
		assert.deepEqual(cleanupOrder, ["abort", "wait", "dispose"]);
		assert.equal(capturedOptions.sessionManager.isPersisted(), false);
		assert.equal(capturedOptions.sessionManager.getCwd(), resolve(root));

		await assert.rejects(
			createSubAgentSession({
				id: "sa1-agent-runtime-partial-2-child",
				generation: "sag1-agent-runtime-partial",
				cwd: root,
				spec: childSpec(),
				resolvedModel,
				onEvent() {},
				onReport() {},
				dependencies: {
					async createSession() {
						throw new Error(PRIVATE_FAILURE_MARKER);
					},
				},
			}),
			(error) => assertFactoryError(error, "session_initialization_failed"),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
