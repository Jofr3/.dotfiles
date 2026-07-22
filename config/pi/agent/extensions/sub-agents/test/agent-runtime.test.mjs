import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
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
	resolveReadOnlyChildTools,
} = await importSubAgentsModule("agent-runtime.ts");
const { captureParentContextSnapshot } = await importSubAgentsModule("resource-loader.ts");

const PRIVATE_FAILURE_MARKER = "private-child-session-initialization-marker";

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
				workspace: { mode: "shared", cwd: "packages/a", bashPolicy: "disabled" },
			}),
			resolvedModel,
			parentContext,
			onEvent: (event) => events.push(event.type),
			onReport() {},
		});

		assert.equal(child.cwd, resolve(nested));
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
				spec: childSpec({ tools: ["write"] }),
			}),
			(error) => assertFactoryError(error, "mutating_tools_disabled"),
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
