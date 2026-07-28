import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	importInstalledPackages,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const {
	SubAgentAssignmentRunner,
	SubAgentAssignmentRunnerError,
} = await importSubAgentsModule("assignment-runner.ts");
const { SubAgentManager, createSessionGeneration } = await importSubAgentsModule("manager.ts");
const { ChildModelRuntimeAdapter, SUB_AGENT_TIER_MODEL_IDS } = await importSubAgentsModule("model-runtime.ts");
const { SubAgentModelRouter } = await importSubAgentsModule("model-router.ts");
const {
	SubAgentsSpawnError,
	createSubAgentsSpawnTool,
} = await importSubAgentsModule("tools/spawn.ts");

function deferred() {
	let resolvePromise;
	let rejectPromise;
	const promise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function spec(name, complexity = "moderate", overrides = {}) {
	return {
		name,
		role: `Handle the ${name} validation slice`,
		objective: `Complete the ${name} objective.`,
		modelPolicy: "auto",
		complexity,
		tools: [],
		...overrides,
	};
}

function routeFor(complexity) {
	const modelId = SUB_AGENT_TIER_MODEL_IDS[complexity];
	return {
		requestedPolicy: "auto",
		requestedComplexity: complexity,
		selectedModel: { provider: "fixture-provider", id: modelId },
		selectedTier: complexity,
		fallbackUsed: false,
		fallbackPath: [
			{ source: "tier", modelId, complexity, outcome: "selected" },
		],
		reason: `Selected ${modelId}.`,
	};
}

function fakeTheme() {
	return {
		fg(_color, text) {
			return text;
		},
		bold(text) {
			return text;
		},
	};
}

function renderContext(args, lastComponent) {
	return {
		args,
		lastComponent,
		state: {},
		invalidate() {},
		toolCallId: "spawn-render",
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: true,
		showImages: false,
		isError: false,
	};
}

test("sub_agents_spawn starts a whole batch concurrently and reports ordered partial outcomes", async () => {
	const allStarted = deferred();
	const starts = [];
	const snapshots = new Map();
	const routerCalls = [];
	const input = {
		agents: [
			spec("simple-child", "simple"),
			spec("failing-child", "moderate"),
			spec("complex-child", "complex"),
		],
	};
	const manager = {
		generation: "sag1-spawn-unit",
		getAgent(id) {
			const snapshot = snapshots.get(id);
			if (!snapshot) throw new Error("missing fixture snapshot");
			return snapshot;
		},
	};
	const router = {
		async resolve(request) {
			routerCalls.push(request);
			return { route: routeFor(request.spec.complexity) };
		},
	};
	const runner = {
		async createAndLaunch(agentSpec, resolveModel) {
			const index = starts.length;
			const id = `sa1-spawn-unit-${index + 1}`;
			starts.push({ id, name: agentSpec.name });
			if (starts.length === input.agents.length) allStarted.resolve();
			await allStarted.promise;
			if (agentSpec.name === "failing-child") {
				snapshots.set(id, { id, state: "failed" });
				throw new SubAgentAssignmentRunnerError(
					"runtime_initialization_failed",
					"Synthetic bounded initialization failure",
					id,
				);
			}
			const resolved = await resolveModel({
				id,
				generation: manager.generation,
				spec: agentSpec,
			});
			const snapshot = {
				id,
				state: "running",
				modelRoute: resolved.route,
			};
			snapshots.set(id, snapshot);
			return {
				id,
				assignmentId: `${id}:assignment:1`,
				accepted: true,
				snapshot,
			};
		},
	};
	const runtime = { manager, router, runner };
	const tool = createSubAgentsSpawnTool(() => runtime);
	const context = {
		modelRegistry: { marker: "host-registry" },
		model: { provider: "fixture-provider", id: SUB_AGENT_TIER_MODEL_IDS.complex },
	};

	const result = await tool.execute("spawn-call", input, undefined, undefined, context);
	assert.equal(starts.length, 3, "every batch entry must start before the shared barrier releases");
	assert.equal(result.details.requested, 3);
	assert.equal(result.details.started, 2);
	assert.equal(result.details.failed, 1);
	assert.deepEqual(result.details.outcomes.map((outcome) => outcome.index), [0, 1, 2]);
	assert.deepEqual(result.details.outcomes.map((outcome) => outcome.ok), [true, false, true]);
	assert.equal(result.details.outcomes[1].id, "sa1-spawn-unit-2");
	assert.equal(result.details.outcomes[1].state, "failed");
	assert.equal(result.details.outcomes[1].code, "runtime_initialization_failed");
	assert.equal(routerCalls.length, 2);
	assert.equal(routerCalls.every((call) => call.hostRegistry === context.modelRegistry), true);
	assert.equal(routerCalls.every((call) => call.parentModel === context.model), true);
	assert.match(result.content[0].text, /2 started · 1 failed/);
	assert.match(result.content[0].text, /sa1-spawn-unit-1/);
	assert.match(result.content[0].text, /sa1-spawn-unit-2/);
	assert.match(result.content[0].text, /sa1-spawn-unit-3/);

	assert.equal(tool.executionMode, "sequential");
	assert.equal(tool.parameters.type, "object");
	assert.ok(tool.promptGuidelines.some((line) => /complexity=simple/.test(line)));
	const callComponent = tool.renderCall(input, fakeTheme(), renderContext(input));
	assert.match(callComponent.render(200).join("\n"), /3 agents/);
	const resultComponent = tool.renderResult(
		result,
		{ expanded: true, isPartial: false },
		fakeTheme(),
		renderContext(input),
	);
	const rendered = resultComponent.render(300).join("\n");
	assert.match(rendered, /2 started/);
	assert.match(rendered, /failing-child/);
	assert.match(rendered, /Synthetic bounded initialization failure/);
});

test("sub_agents_spawn admits fake worktree plans through approval-capable UI before provisioning", async () => {
	const workspaceId = `saw1-${"a".repeat(32)}`;
	const workspaceKey = `sawk1-${"b".repeat(32)}`;
	const branchRef = `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`;
	const baseCommit = "d".repeat(40);
	const correlationToken = `sact1-${"c".repeat(32)}`;
	const repositoryPath = "/operator-only/repository/path";
	const logicalRoot = "/private/state/trees/worktree/logical";
	const childId = "sa1-spawn-approval-1";
	const events = [];
	let confirmation;
	const summary = Object.freeze({
		workspaceId,
		branchRef,
		baseCommit: baseCommit.slice(0, 12),
		lastObservedCommit: baseCommit.slice(0, 12),
		disposition: "ready",
	});
	const worktrees = {
		async prepare(request) {
			events.push(`prepare:${request.childId}:${request.relativeCwd}`);
			assert.equal(request.trusted, true);
			assert.equal(request.cwd, "/parent/workspace");
			return Object.freeze({
				version: 1,
				repository: Object.freeze({
					topLevel: repositoryPath,
					commonDirectory: "/operator-only/repository/.git",
					headCommit: "d".repeat(40),
					objectFormat: "sha1",
					trusted: true,
					insideWorkTree: true,
					bare: false,
					clean: true,
					configFingerprint: "f".repeat(64),
				}),
				sourceGeneration: "sag1-spawn-approval",
				childId: request.childId,
				parentRelativeRoot: "packages/app",
				relativeCwd: request.relativeCwd,
				identity: Object.freeze({ workspaceId, workspaceKey, correlationToken, branchRef }),
				approvalDigest: "e".repeat(64),
			});
		},
		async provisionApproved(plan, admission, options) {
			events.push(options?.signal ? "provision:signalled" : "provision");
			assert.equal(plan.childId, childId);
			assert.equal(admission.approvalDigest, plan.approvalDigest);
			assert.equal(admission.correlationToken, correlationToken);
			return Object.freeze({
				summary,
				workspace: Object.freeze({
					mode: "worktree",
					root: logicalRoot,
					key: workspaceKey,
					workspaceId,
					branch: branchRef,
					baseCommit,
				}),
				allocation: Object.freeze({ workspaceId, correlationToken }),
				relativeCwd: "src",
			});
		},
		async retain() {
			events.push("retain");
			return summary;
		},
	};
	const snapshots = new Map();
	const runtime = {
		manager: {
			generation: "sag1-spawn-approval",
			getAgent(id) { return snapshots.get(id); },
		},
		router: { async resolve() { return { route: routeFor("moderate") }; } },
		runner: {
			async createAndLaunch(agentSpec, resolveModel, signal, options) {
				assert.equal(agentSpec.workspace.mode, "worktree");
				assert.equal(typeof options?.resolveWorkspace, "function");
				const resolved = await resolveModel({ id: childId, generation: "sag1-spawn-approval", spec: agentSpec });
				const workspace = await options.resolveWorkspace({
					id: childId,
					generation: "sag1-spawn-approval",
					spec: agentSpec,
					parentCwd: "/parent/workspace",
					signal,
				});
				assert.equal(workspace.identity.workspaceId, workspaceId);
				assert.equal(workspace.cwd, `${logicalRoot}/src`);
				const snapshot = {
					id: childId,
					state: "running",
					modelRoute: resolved.route,
					workspace: {
						mode: "worktree",
						workspaceId,
						branchRef,
						baseCommit,
						disposition: "active",
					},
				};
				snapshots.set(childId, snapshot);
				return { id: childId, assignmentId: `${childId}:assignment:1`, accepted: true, snapshot };
			},
		},
		worktrees,
		worktreeModeEnabled: true,
	};
	const tool = createSubAgentsSpawnTool(() => runtime);
	const result = await tool.execute(
		"spawn-worktree-approval",
		{ agents: [spec("approved-worktree", "moderate", {
			workspace: { mode: "worktree", cwd: "src" },
		})] },
		undefined,
		undefined,
		{
			modelRegistry: {},
			model: undefined,
			hasUI: true,
			isProjectTrusted() { return true; },
			ui: {
				async confirm(title, message) {
					confirmation = { title, message };
					return true;
				},
			},
		},
	);

	assert.deepEqual(events, [`prepare:${childId}:src`, "provision"]);
	assert.equal(result.details.started, 1);
	assert.equal(result.details.outcomes[0].ok, true);
	assert.equal(result.details.outcomes[0].worktree.workspaceId, workspaceId);
	assert.equal(result.details.outcomes[0].worktree.branchRef, branchRef);
	assert.equal(result.details.outcomes[0].worktree.disposition, "active");
	assert.match(result.content[0].text, /worktree saw1-/);
	assert.match(result.content[0].text, /active/);
	assert.match(confirmation.title, /Authorize sub-agent Git worktree/);
	assert.match(confirmation.message, /approved-worktree/);
	assert.match(confirmation.message, /operator-only\/repository\/path/);
	assert.match(confirmation.message, /retained by default/);
	assert.doesNotMatch(JSON.stringify(result), /operator-only|private\/state/);
});

test("sub_agents_spawn binds immutable worktree batch metadata and admits one complete batch before provisioning", async () => {
	const baseCommit = "a".repeat(40);
	const snapshots = new Map();
	const confirmations = [];
	const prepareCwds = [];
	let provisionCalls = 0;
	const input = { agents: [
		spec("original-one", "moderate", { workspace: { mode: "worktree", cwd: "src-a" } }),
		spec("original-two", "moderate", { workspace: { mode: "worktree", cwd: "src-b" } }),
	] };
	const worktrees = {
		async prepare(request) {
			prepareCwds.push(request.relativeCwd);
			const suffix = request.childId.endsWith("-1") ? "q" : "u";
			const digestChar = request.childId.endsWith("-1") ? "b" : "c";
			const workspaceId = `saw1-${suffix.repeat(32)}`;
			const workspaceKey = `sawk1-${suffix.repeat(32)}`;
			const correlationToken = `sact1-${suffix.repeat(32)}`;
			const branchRef = `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`;
			return Object.freeze({
				version: 1,
				repository: Object.freeze({
					topLevel: "/operator-only/immutable-repo",
					commonDirectory: "/operator-only/immutable-repo/.git",
					headCommit: baseCommit,
					objectFormat: "sha1",
					trusted: true,
					insideWorkTree: true,
					bare: false,
					clean: true,
					configFingerprint: "f".repeat(64),
				}),
				sourceGeneration: "sag1-spawn-batch-plan",
				childId: request.childId,
				parentRelativeRoot: "",
				relativeCwd: request.relativeCwd,
				identity: Object.freeze({ workspaceId, workspaceKey, correlationToken, branchRef }),
				approvalDigest: digestChar.repeat(64),
			});
		},
		async provisionApproved(plan) {
			provisionCalls += 1;
			const summary = Object.freeze({
				workspaceId: plan.identity.workspaceId,
				branchRef: plan.identity.branchRef,
				baseCommit: baseCommit.slice(0, 12),
				lastObservedCommit: baseCommit.slice(0, 12),
				disposition: "ready",
			});
			return Object.freeze({
				summary,
				workspace: Object.freeze({
					mode: "worktree",
					root: "/private/immutable-worktree/logical",
					key: plan.identity.workspaceKey,
					workspaceId: plan.identity.workspaceId,
					branch: plan.identity.branchRef,
					baseCommit,
				}),
				allocation: Object.freeze({
					workspaceId: plan.identity.workspaceId,
					correlationToken: plan.identity.correlationToken,
				}),
			});
		},
		async retain(allocation) {
			return Object.freeze({
				workspaceId: allocation.workspaceId,
				branchRef: `refs/heads/pi/sub-agents/0123456789abcdef/${allocation.workspaceId}`,
				baseCommit: baseCommit.slice(0, 12),
				lastObservedCommit: baseCommit.slice(0, 12),
				disposition: "retained",
			});
		},
	};
	const runtime = {
		manager: {
			generation: "sag1-spawn-batch-plan",
			getAgent(id) { return snapshots.get(id) ?? { id, state: "failed" }; },
		},
		router: { async resolve() { return { route: routeFor("moderate") }; } },
		runner: {
			async createAndLaunch(agentSpec, resolveModel, signal, options) {
				const index = agentSpec.name.endsWith("one") ? 0 : 1;
				const id = `sa1-spawn-batch-plan-${index + 1}`;
				await resolveModel({ id, generation: "sag1-spawn-batch-plan", spec: agentSpec });
				if (index === 0) {
					input.agents[0].name = "tampered-one";
					input.agents[0].objective = "Tampered objective must not reach approval.";
					input.agents[0].workspace.cwd = "tampered-cwd";
					input.agents.push(spec("late-bash", "moderate", {
						tools: ["bash"],
						workspace: { mode: "worktree", bashPolicy: "workspace-exclusive" },
					}));
					runtime.worktreeModeEnabled = false;
				}
				const workspace = await options.resolveWorkspace({
					id,
					generation: "sag1-spawn-batch-plan",
					spec: agentSpec,
					parentCwd: "/parent/workspace",
					signal,
				});
				assert.match(workspace.identity.workspaceId, /^saw1-/);
				const snapshot = { id, state: "running", modelRoute: routeFor("moderate") };
				snapshots.set(id, snapshot);
				return { id, assignmentId: `${id}:assignment:1`, accepted: true, snapshot };
			},
		},
		worktrees,
		worktreeModeEnabled: true,
	};
	const tool = createSubAgentsSpawnTool(() => runtime);
	const result = await tool.execute(
		"spawn-worktree-batch-plan",
		input,
		undefined,
		undefined,
		{
			modelRegistry: {},
			model: undefined,
			hasUI: true,
			isProjectTrusted() { return true; },
			ui: {
				async confirm(title, message) {
					assert.equal(provisionCalls, 0, "batch approval must happen before child-side provisioning");
					confirmations.push({ title, message });
					return true;
				},
			},
		},
	);

	assert.deepEqual(prepareCwds.sort(), ["src-a", "src-b"]);
	assert.equal(confirmations.length, 1);
	assert.equal(provisionCalls, 2);
	assert.equal(result.details.started, 2);
	assert.equal(result.details.failed, 0);
	assert.match(confirmations[0].title, /Git worktree batch/);
	assert.match(confirmations[0].message, /complete generated Git worktree batch/);
	assert.match(confirmations[0].message, /original-one/);
	assert.match(confirmations[0].message, /original-two/);
	assert.match(confirmations[0].message, /Worktree requests in this spawn call: 2/);
	assert.match(confirmations[0].message, /Worktree children also requesting bash: 0/);
	assert.doesNotMatch(confirmations[0].message, /tampered|late-bash|Worktree requests in this spawn call: 3|Worktree children also requesting bash: 1/);
});

test("sub_agents_spawn rejects duplicate worktree approval digests before provisioning", async () => {
	const workspaceId = `saw1-${"v".repeat(32)}`;
	const workspaceKey = `sawk1-${"x".repeat(32)}`;
	const correlationToken = `sact1-${"y".repeat(32)}`;
	const branchRef = `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`;
	const baseCommit = "8".repeat(40);
	let confirmCalls = 0;
	let provisionCalls = 0;
	const snapshots = new Map();
	const runtime = {
		manager: {
			generation: "sag1-spawn-duplicate-digest",
			getAgent(id) { return snapshots.get(id) ?? { id, state: "failed" }; },
		},
		router: { async resolve() { return { route: routeFor("moderate") }; } },
		runner: {
			async createAndLaunch(agentSpec, resolveModel, signal, options) {
				const index = agentSpec.name.endsWith("one") ? 0 : 1;
				const id = `sa1-spawn-duplicate-digest-${index + 1}`;
				await resolveModel({ id, generation: "sag1-spawn-duplicate-digest", spec: agentSpec });
				await options.resolveWorkspace({
					id,
					generation: "sag1-spawn-duplicate-digest",
					spec: agentSpec,
					parentCwd: "/parent/workspace",
					signal,
				});
				throw new Error("duplicate digest test should not initialize runtime");
			},
		},
		worktrees: {
			async prepare(request) {
				return Object.freeze({
					version: 1,
					repository: Object.freeze({
						topLevel: "/operator-only/duplicate-digest-repo",
						commonDirectory: "/operator-only/duplicate-digest-repo/.git",
						headCommit: baseCommit,
						objectFormat: "sha1",
						trusted: true,
						insideWorkTree: true,
						bare: false,
						clean: true,
						configFingerprint: "f".repeat(64),
					}),
					sourceGeneration: "sag1-spawn-duplicate-digest",
					childId: request.childId,
					parentRelativeRoot: "",
					identity: Object.freeze({ workspaceId, workspaceKey, correlationToken, branchRef }),
					approvalDigest: "7".repeat(64),
				});
			},
			async provisionApproved() {
				provisionCalls += 1;
				throw new Error("duplicate digest must not reach provisioning");
			},
			async retain() { throw new Error("unused"); },
		},
		worktreeModeEnabled: true,
	};
	const tool = createSubAgentsSpawnTool(() => runtime);
	const result = await tool.execute(
		"spawn-duplicate-worktree-digest",
		{ agents: [
			spec("duplicate-one", "moderate", { workspace: { mode: "worktree" } }),
			spec("duplicate-two", "moderate", { workspace: { mode: "worktree" } }),
		] },
		undefined,
		undefined,
		{
			modelRegistry: {},
			model: undefined,
			hasUI: true,
			isProjectTrusted() { return true; },
			ui: { async confirm() { confirmCalls += 1; return true; } },
		},
	);

	assert.equal(confirmCalls, 0);
	assert.equal(provisionCalls, 0);
	assert.equal(result.details.started, 0);
	assert.equal(result.details.failed, 2);
	assert.equal(result.details.outcomes.every((outcome) => !outcome.ok && /duplicate approval digest/.test(outcome.message)), true);
});

test("sub_agents_spawn holds shared siblings behind complete worktree admission", async () => {
	const workspaceId = `saw1-${"m".repeat(32)}`;
	const workspaceKey = `sawk1-${"n".repeat(32)}`;
	const correlationToken = `sact1-${"o".repeat(32)}`;
	const branchRef = `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`;
	const baseCommit = "c".repeat(40);
	const snapshots = new Map();
	const events = [];
	let confirmResolve;
	const confirmEntered = new Promise((resolve) => {
		confirmResolve = resolve;
	});
	let releaseConfirm;
	const confirmReleased = new Promise((resolve) => {
		releaseConfirm = resolve;
	});
	const summary = Object.freeze({
		workspaceId,
		branchRef,
		baseCommit: baseCommit.slice(0, 12),
		lastObservedCommit: baseCommit.slice(0, 12),
		disposition: "ready",
	});
	const worktrees = {
		async prepare(request) {
			events.push(`prepare:${request.childId}`);
			return Object.freeze({
				version: 1,
				repository: Object.freeze({
					topLevel: "/operator-only/admission-repo",
					commonDirectory: "/operator-only/admission-repo/.git",
					headCommit: baseCommit,
					objectFormat: "sha1",
					trusted: true,
					insideWorkTree: true,
					bare: false,
					clean: true,
					configFingerprint: "f".repeat(64),
				}),
				sourceGeneration: "sag1-spawn-admission-barrier",
				childId: request.childId,
				parentRelativeRoot: "",
				identity: Object.freeze({ workspaceId, workspaceKey, correlationToken, branchRef }),
				approvalDigest: "9".repeat(64),
			});
		},
		async provisionApproved() {
			events.push("provision");
			return Object.freeze({
				summary,
				workspace: Object.freeze({
					mode: "worktree",
					root: "/private/admission-worktree/logical",
					key: workspaceKey,
					workspaceId,
					branch: branchRef,
					baseCommit,
				}),
				allocation: Object.freeze({ workspaceId, correlationToken }),
			});
		},
		async retain() { return summary; },
	};
	const runtime = {
		manager: {
			generation: "sag1-spawn-admission-barrier",
			getAgent(id) { return snapshots.get(id) ?? { id, state: "failed" }; },
		},
		router: { async resolve(request) { return { route: routeFor(request.spec.complexity) }; } },
		runner: {
			async createAndLaunch(agentSpec, resolveModel, signal, options) {
				const index = agentSpec.name === "worktree-before-shared" ? 0 : 1;
				const id = `sa1-spawn-admission-barrier-${index + 1}`;
				events.push(`create:${agentSpec.name}`);
				await resolveModel({ id, generation: "sag1-spawn-admission-barrier", spec: agentSpec });
				if (agentSpec.workspace?.mode === "worktree") {
					assert.equal(typeof options?.resolveWorkspace, "function");
					await options.resolveWorkspace({
						id,
						generation: "sag1-spawn-admission-barrier",
						spec: agentSpec,
						parentCwd: "/parent/workspace",
						signal,
					});
				} else {
					assert.equal(options?.resolveWorkspace, undefined);
				}
				const snapshot = { id, state: "running", modelRoute: routeFor(agentSpec.complexity) };
				snapshots.set(id, snapshot);
				return { id, assignmentId: `${id}:assignment:1`, accepted: true, snapshot };
			},
		},
		worktrees,
		worktreeModeEnabled: true,
	};
	const tool = createSubAgentsSpawnTool(() => runtime);
	const execution = tool.execute(
		"spawn-worktree-admission-barrier",
		{ agents: [
			spec("worktree-before-shared", "moderate", { workspace: { mode: "worktree" } }),
			spec("shared-after-worktree", "simple", { workspace: { mode: "shared" } }),
		] },
		undefined,
		undefined,
		{
			modelRegistry: {},
			model: undefined,
			hasUI: true,
			isProjectTrusted() { return true; },
			ui: {
				async confirm() {
					events.push("confirm:entered");
					confirmResolve();
					await confirmReleased;
					events.push("confirm:approved");
					return true;
				},
			},
		},
	);

	await confirmEntered;
	await Promise.resolve();
	assert.deepEqual(events.filter((event) => event.startsWith("create:")), ["create:worktree-before-shared"]);
	releaseConfirm();
	const result = await execution;

	assert.equal(result.details.started, 2);
	assert.equal(result.details.failed, 0);
	assert.ok(events.indexOf("confirm:approved") < events.indexOf("create:shared-after-worktree"));
	assert.ok(events.indexOf("create:shared-after-worktree") < events.indexOf("provision"));
});

test("sub_agents_spawn does not use a wired worktree manager while the release gate is disabled", async () => {
	let prepareCalls = 0;
	let createCalls = 0;
	const runtime = {
		manager: {
			generation: "sag1-spawn-worktree-gated",
			getAgent(id) { return { id, state: "failed" }; },
		},
		router: { async resolve() { return { route: routeFor("moderate") }; } },
		runner: {
			async createAndLaunch(_agentSpec, _resolveModel, _signal, options) {
				createCalls += 1;
				assert.equal(options?.resolveWorkspace, undefined);
				throw new SubAgentAssignmentRunnerError(
					"runtime_initialization_failed",
					"Worktree mode is still disabled by the release gate",
					"sa1-spawn-worktree-gated-1",
				);
			},
		},
		worktrees: {
			async prepare() {
				prepareCalls += 1;
				throw new Error("worktree manager must remain behind the disabled gate");
			},
			async provisionApproved() { throw new Error("unused"); },
			async retain() { throw new Error("unused"); },
		},
		worktreeModeEnabled: false,
	};
	const tool = createSubAgentsSpawnTool(() => runtime);
	const result = await tool.execute(
		"spawn-worktree-gated",
		{ agents: [spec("gated-worktree", "moderate", { workspace: { mode: "worktree" } })] },
		undefined,
		undefined,
		{ modelRegistry: {}, model: undefined, hasUI: true, ui: { async confirm() { return true; } } },
	);
	assert.equal(createCalls, 1);
	assert.equal(prepareCalls, 0);
	assert.equal(result.details.started, 0);
	assert.equal(result.details.outcomes[0].code, "runtime_initialization_failed");
});

test("sub_agents_spawn reports path-free retained and uncertain worktree outcomes from child failures", async () => {
	const workspaceId = `saw1-${"w".repeat(32)}`;
	const branchRef = `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`;
	const outcomes = [
		{ disposition: "retained", id: "sa1-spawn-worktree-1" },
		{ disposition: "uncertain", id: "sa1-spawn-worktree-2" },
	];
	const tool = createSubAgentsSpawnTool(() => ({
		manager: {
			generation: "sag1-spawn-worktree",
			getAgent(id) { return { id, state: "failed" }; },
		},
		router: { async resolve() { return { route: routeFor("moderate") }; } },
		runner: {
			async createAndLaunch(_agentSpec, resolveModel) {
				const next = outcomes.shift();
				await resolveModel({ id: next.id, generation: "sag1-spawn-worktree", spec: _agentSpec });
				throw new SubAgentAssignmentRunnerError(
					"runtime_initialization_failed",
					"Synthetic worktree runtime boundary",
					next.id,
					{
						worktreeOutcome: {
							workspaceId,
							branchRef,
							baseCommit: "a".repeat(12),
							lastObservedCommit: "b".repeat(12),
							disposition: next.disposition,
						},
					},
				);
			},
		},
	}));

	const result = await tool.execute(
		"spawn-worktree-outcomes",
		{ agents: [
			spec("retained-worktree", "moderate", { workspace: { mode: "worktree" } }),
			spec("uncertain-worktree", "moderate", { workspace: { mode: "worktree" } }),
		] },
		undefined,
		undefined,
		{ modelRegistry: {}, model: undefined },
	);

	assert.equal(result.details.started, 0);
	assert.equal(result.details.failed, 2);
	assert.equal(result.details.outcomes[0].worktree.workspaceId, workspaceId);
	assert.equal(result.details.outcomes[0].worktree.branchRef, branchRef);
	assert.equal(result.details.outcomes[0].worktree.disposition, "retained");
	assert.equal(result.details.outcomes[1].worktree.disposition, "uncertain");
	assert.match(result.content[0].text, /worktree saw1-/);
	assert.match(result.content[0].text, /retained/);
	assert.match(result.content[0].text, /uncertain/);
	const rendered = tool.renderResult(
		result,
		{ expanded: true, isPartial: false },
		fakeTheme(),
		renderContext({ agents: [spec("retained-worktree"), spec("uncertain-worktree")] }),
	).render(300).join("\n");
	assert.match(rendered, /worktree: saw1-/);
	assert.match(rendered, /retained/);
	assert.match(rendered, /uncertain/);
	assert.doesNotMatch(JSON.stringify(result), /\/tmp\/|state\/trees|repo\/project/);
});

test("bash-capable spawn batches require exact operator approval before any child starts", async () => {
	let starts = 0;
	const snapshots = new Map();
	const runtime = {
		manager: {
			generation: "sag1-spawn-bash-approval",
			getAgent(id) {
				return snapshots.get(id);
			},
		},
		router: {
			async resolve() {
				return { route: routeFor("moderate") };
			},
		},
		runner: {
			async createAndLaunch(agentSpec, resolveModel) {
				starts += 1;
				const id = `sa1-spawn-bash-approval-${starts}`;
				const resolved = await resolveModel({
					id,
					generation: "sag1-spawn-bash-approval",
					spec: agentSpec,
				});
				const snapshot = { id, state: "running", modelRoute: resolved.route };
				snapshots.set(id, snapshot);
				return { id, assignmentId: `${id}:assignment:1`, accepted: true, snapshot };
			},
		},
	};
	const tool = createSubAgentsSpawnTool(() => runtime);
	const input = {
		agents: [spec("bash-child", "moderate", {
			tools: ["bash"],
			workspace: { mode: "shared", bashPolicy: "workspace-exclusive" },
		})],
	};
	for (const context of [
		{ modelRegistry: {}, model: undefined, hasUI: false },
		{
			modelRegistry: {},
			model: undefined,
			hasUI: true,
			ui: { async confirm() { return false; } },
		},
	]) {
		await assert.rejects(
			tool.execute("bash-denied", input, undefined, undefined, context),
			(error) => error instanceof SubAgentsSpawnError && error.code === "bash_not_approved",
		);
		assert.equal(starts, 0);
	}
	let confirmation;
	const approved = await tool.execute(
		"bash-approved",
		input,
		undefined,
		undefined,
		{
			modelRegistry: {},
			model: undefined,
			hasUI: true,
			ui: {
				async confirm(title, message) {
					confirmation = { title, message };
					return true;
				},
			},
		},
	);
	assert.equal(starts, 1);
	assert.equal(approved.details.started, 1);
	assert.match(confirmation.title, /Authorize sub-agent bash/);
	assert.match(confirmation.message, /same-UID local shell execution/);
	assert.match(confirmation.message, /Complete the bash-child objective/);
	assert.match(confirmation.message, /until they are removed, including later messages/);
	assert.doesNotMatch(confirmation.message, /Handle the bash-child validation slice/);
	assert.ok(tool.promptGuidelines.some((line) => /explicit operator approval/.test(line)));
});

test("maximum spawn batches keep model-visible content and structured details below tool transport bounds", async () => {
	const agents = Array.from({ length: 64 }, (_, index) =>
		spec(`${"😀".repeat(56)}-${index}`, "simple"),
	);
	const runtime = {
		manager: {
			generation: "sag1-spawn-output-bounds",
			getAgent() {
				throw new Error("unused");
			},
		},
		router: {
			async resolve() {
				return {
					route: {
						...routeFor("simple"),
						selectedModel: {
							provider: "😀".repeat(64),
							id: "😀".repeat(128),
						},
					},
				};
			},
		},
		runner: {
			async createAndLaunch(agentSpec, resolveModel) {
				const index = agents.indexOf(agentSpec);
				const id = `sa1-${index.toString().padStart(2, "0")}-${"a".repeat(190)}`;
				const resolved = await resolveModel({
					id,
					generation: "sag1-spawn-output-bounds",
					spec: agentSpec,
				});
				return {
					id,
					assignmentId: `${id}:assignment:1`,
					accepted: true,
					snapshot: { id, state: "running", modelRoute: resolved.route },
				};
			},
		},
	};
	const tool = createSubAgentsSpawnTool(() => runtime);
	const result = await tool.execute(
		"bounded-spawn",
		{ agents },
		undefined,
		undefined,
		{ modelRegistry: {}, model: undefined },
	);
	assert.equal(result.details.started, 64);
	assert.equal(result.content[0].text.split("\n").length, 65);
	assert.ok(Buffer.byteLength(result.content[0].text, "utf8") < 50 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") < 50 * 1024);
	assert.equal(result.details.outcomes.every((outcome) => outcome.route.selectedModelTruncated), true);
});

test("spawn fails closed without an active generation and redacts unknown initialization errors", async () => {
	const inactive = createSubAgentsSpawnTool(() => undefined);
	await assert.rejects(
		inactive.execute("inactive", { agents: [spec("inactive-child")] }, undefined, undefined, {}),
		(error) => error instanceof SubAgentsSpawnError && error.code === "manager_inactive",
	);

	const runtime = {
		manager: {
			generation: "sag1-spawn-redaction",
			getAgent() {
				throw new Error("not created");
			},
		},
		router: { async resolve() { throw new Error("unused"); } },
		runner: {
			async createAndLaunch() {
				throw new Error("PRIVATE_UNKNOWN_PROVIDER_FAILURE");
			},
		},
	};
	const tool = createSubAgentsSpawnTool(() => runtime);
	const result = await tool.execute(
		"redaction",
		{ agents: [spec("redaction-child")] },
		undefined,
		undefined,
		{ modelRegistry: {}, model: undefined },
	);
	assert.equal(result.details.started, 0);
	assert.equal(result.details.failed, 1);
	assert.equal(result.details.outcomes[0].code, "spawn_failed");
	assert.equal(result.details.outcomes[0].message, "Could not initialize the sub-agent");
	assert.doesNotMatch(JSON.stringify(result), /PRIVATE_UNKNOWN_PROVIDER_FAILURE/);
});

test("caller cancellation is forwarded into in-flight child initialization", async () => {
	const entered = deferred();
	let observedSignal;
	const controller = new AbortController();
	const tool = createSubAgentsSpawnTool(() => ({
		manager: {
			generation: "sag1-spawn-cancellation",
			getAgent() { throw new Error("cancelled before snapshot"); },
		},
		router: { async resolve() { return { runtime: {}, model: {}, ref: { provider: "fixture", id: "fixture" } }; } },
		runner: {
			async createAndLaunch(_spec, _resolve, signal) {
				observedSignal = signal;
				entered.resolve();
				await new Promise((resolvePromise) => signal.addEventListener("abort", resolvePromise, { once: true }));
				throw new SubAgentAssignmentRunnerError(
					"cancelled",
					"The sub-agent operation was cancelled",
					undefined,
					{ runtimeSettled: true },
				);
			},
		},
	}));
	const execution = tool.execute(
		"spawn-cancelled",
		{ agents: [spec("cancelled-child")] },
		controller.signal,
		undefined,
		{ modelRegistry: {}, model: undefined },
	);
	await entered.promise;
	controller.abort();
	const result = await execution;
	assert.strictEqual(observedSignal, controller.signal);
	assert.equal(result.details.started, 0);
	assert.equal(result.details.outcomes[0].code, "cancelled");
});

function modelDefinition(id) {
	return {
		id,
		name: id,
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
	};
}

test("the spawn tool wires the production manager, router, and runner with isolated partial failure", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-spawn-production-"));
	const { codingAgent, piAi } = await importInstalledPackages();
	const providerId = "spawn-production-provider";
	const hostRuntime = await codingAgent.ModelRuntime.create({
		credentials: new piAi.InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	const hostRegistry = new codingAgent.ModelRegistry(hostRuntime);
	const faux = piAi.fauxProvider({
		provider: providerId,
		models: Object.values(SUB_AGENT_TIER_MODEL_IDS).map(modelDefinition),
		tokensPerSecond: 100_000,
	});
	hostRegistry.registerProvider(faux.provider);
	faux.setResponses([piAi.fauxAssistantMessage("production spawn complete")]);

	const childModelRuntime = new ChildModelRuntimeAdapter({
		createRuntime: () => codingAgent.ModelRuntime.create({
			credentials: new piAi.InMemoryCredentialStore(),
			modelsPath: null,
			allowModelNetwork: false,
		}),
	});
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration("spawn-production"),
		modelRuntime: childModelRuntime,
		cleanupTimeoutMs: 1_000,
	});
	const runner = new SubAgentAssignmentRunner(manager);
	const router = new SubAgentModelRouter(childModelRuntime);
	const tool = createSubAgentsSpawnTool(() => ({ manager, runner, router }));
	const parentModel = hostRuntime.getModel(providerId, SUB_AGENT_TIER_MODEL_IDS.complex);
	assert.ok(parentModel);

	try {
		const result = await tool.execute(
			"production-spawn",
			{
				agents: [
					spec("production-simple", "simple"),
					spec("production-missing-model", "moderate", {
						modelPolicy: "explicit",
						model: { provider: "missing-provider", id: "missing-model" },
					}),
				],
			},
			undefined,
			undefined,
			{ modelRegistry: hostRegistry, model: parentModel },
		);
		assert.equal(result.details.started, 1);
		assert.equal(result.details.failed, 1);
		const success = result.details.outcomes[0];
		const failure = result.details.outcomes[1];
		assert.equal(success.ok, true);
		assert.equal(success.route.selectedModel.id, SUB_AGENT_TIER_MODEL_IDS.simple);
		assert.equal(success.route.requestedComplexity, "simple");
		assert.equal(failure.ok, false);
		assert.equal(failure.code, "model_resolution_failed");
		assert.match(failure.id, /^sa1-/);
		assert.equal(manager.getAgent(failure.id).state, "failed");
		const settled = await runner.waitForAssignment(success.id);
		assert.equal(settled.state, "idle");
		assert.equal(settled.latestResult.summary, "production spawn complete");
	} finally {
		await manager.disposeAll("spawn production test complete");
		await rm(root, { recursive: true, force: true });
	}
});
