import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	createDeferred,
	createOfflineModelRuntime,
	createTempDirectoryFixture,
} from "./fixtures.mjs";
import {
	importInstalledPackages,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const {
	SubAgentAssignmentRunner,
	createApprovedWorktreeWorkspaceResolver,
} = await importSubAgentsModule("assignment-runner.ts");
const { SubAgentSessionFactoryError, createSubAgentSession } = await importSubAgentsModule("agent-runtime.ts");
const { SubAgentManager, createSessionGeneration } = await importSubAgentsModule("manager.ts");
const {
	resolveCanonicalWorkspacePath,
	resolveSharedWorkspace,
} = await importSubAgentsModule("workspace/paths.ts");

const deferred = createDeferred;

function textFromUserContent(content) {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function userTexts(messages) {
	return messages
		.filter((message) => message.role === "user")
		.map((message) => textFromUserContent(message.content));
}

function childSpec(name, objective) {
	return {
		name,
		role: "Exercise one dynamically assigned read-only child runtime",
		objective,
		thinkingLevel: "off",
		tools: [],
	};
}

function inheritedFallbackRoute(ref) {
	return {
		requestedPolicy: "auto",
		requestedComplexity: "moderate",
		selectedModel: { ...ref },
		fallbackUsed: true,
		fallbackPath: [
			{ source: "tier", modelId: "gpt-5.6-terra", complexity: "moderate", outcome: "unavailable" },
			{ source: "tier", modelId: "gpt-5.6-sol", complexity: "complex", outcome: "unavailable" },
			{ source: "tier", modelId: "gpt-5.6-luna", complexity: "simple", outcome: "unavailable" },
			{ source: "inherit", modelId: ref.id, outcome: "selected" },
		],
		reason: `Automatic moderate route inherited ${ref.provider}/${ref.id}.`,
	};
}

async function createOfflineFixture(label) {
	const temporary = await createTempDirectoryFixture(`pi-sub-agent-runner-${label}`);
	const root = temporary.root;
	const { codingAgent, piAi } = await importInstalledPackages();
	const providerId = `assignment-runner-${label}`;
	const faux = piAi.fauxProvider({ provider: providerId, tokensPerSecond: 100_000 });
	const runtime = await createOfflineModelRuntime(codingAgent, piAi);
	runtime.registerNativeProvider(faux.provider);
	const model = runtime.getModel(providerId, "faux-1");
	assert.ok(model);
	const resolvedModel = {
		runtime,
		model,
		ref: { provider: model.provider, id: model.id },
	};
	let nonce = 0;
	const modelOwner = { async dispose() {} };
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration(label),
		nonce: () => `${label}-${++nonce}`,
		cleanupTimeoutMs: 500,
		modelRuntime: modelOwner,
	});
	const sessions = [];
	const runner = new SubAgentAssignmentRunner(manager, {
		async createSession(options) {
			const child = await createSubAgentSession(options);
			sessions.push(child);
			return child;
		},
	});
	return { root, temporary, codingAgent, piAi, faux, runtime, resolvedModel, manager, runner, sessions };
}

async function cleanupFixture(fixture) {
	try {
		await fixture.manager.disposeAll("assignment runner test complete");
	} finally {
		await fixture.temporary.cleanup();
	}
}

test("the assignment runner resolves a workspace before constructing the child session", async () => {
	const temporary = await createTempDirectoryFixture("pi-sub-agent-runner-workspace-seam");
	let manager;
	try {
		let nonce = 0;
		manager = new SubAgentManager({
			cwd: temporary.root,
			generation: createSessionGeneration("workspace-seam"),
			nonce: () => `workspace-seam-${++nonce}`,
			modelRuntime: { async dispose() {} },
		});
		const preparedWorkspace = await resolveSharedWorkspace(temporary.root);
		const resolvedModel = {
			runtime: { fake: "runtime" },
			model: { provider: "fake-provider", id: "fake-model" },
			ref: { provider: "fake-provider", id: "fake-model" },
		};
		const order = [];
		let seenOptions;
		const runner = new SubAgentAssignmentRunner(manager, {
			async resolveWorkspace(request) {
				order.push("resolveWorkspace");
				assert.match(request.id, /^sa1-/);
				assert.equal(request.generation, manager.generation);
				assert.equal(request.parentCwd, temporary.root);
				assert.equal(request.spec.name, "workspace-seam-child");
				return preparedWorkspace;
			},
			async createSession(options) {
				order.push("createSession");
				seenOptions = options;
				throw new SubAgentSessionFactoryError(
					"session_initialization_failed",
					"synthetic prepared-workspace session failure",
				);
			},
		});

		await assert.rejects(
			runner.createAndLaunch(
				childSpec("workspace-seam-child", "exercise the prepared workspace seam"),
				() => resolvedModel,
			),
			(error) => {
				assert.equal(error.code, "runtime_initialization_failed");
				return true;
			},
		);
		assert.deepEqual(order, ["resolveWorkspace", "createSession"]);
		assert.strictEqual(seenOptions.resolvedWorkspace, preparedWorkspace);
		assert.equal(seenOptions.cwd, temporary.root);
		assert.equal(runner.liveRuntimeCount, 0);
	} finally {
		if (manager) await manager.disposeAll("workspace seam test complete").catch(() => undefined);
		await temporary.cleanup();
	}
});

test("fake-approved worktree resolver provisions before child session construction and retains after runtime failure", async () => {
	const temporary = await createTempDirectoryFixture("pi-sub-agent-runner-worktree-provision");
	let manager;
	try {
		const parentCwd = join(temporary.root, "repo", "project");
		const worktreeRoot = join(temporary.root, "state", "trees", "child", "project");
		const worktreeCwd = join(worktreeRoot, "src");
		await mkdir(parentCwd, { recursive: true });
		await mkdir(worktreeCwd, { recursive: true });
		let nonce = 0;
		manager = new SubAgentManager({
			cwd: parentCwd,
			generation: createSessionGeneration("worktree-provision"),
			nonce: () => `worktree-provision-${++nonce}`,
			modelRuntime: { async dispose() {} },
		});
		const workspaceId = `saw1-${"w".repeat(32)}`;
		const allocation = Object.freeze({ workspaceId, correlationToken: `sact1-${"t".repeat(32)}` });
		const identity = Object.freeze({
			mode: "worktree",
			root: worktreeRoot,
			key: `sawk1-${"k".repeat(32)}`,
			workspaceId,
			branch: `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`,
			baseCommit: "a".repeat(40),
		});
		const summary = Object.freeze({
			workspaceId,
			branchRef: identity.branch,
			baseCommit: identity.baseCommit.slice(0, 12),
			lastObservedCommit: identity.baseCommit.slice(0, 12),
			disposition: "ready",
		});
		const events = [];
		let preparedChildId;
		const worktrees = {
			async prepare(options) {
				events.push("prepare");
				assert.equal(options.cwd, parentCwd);
				assert.equal(options.trusted, true);
				assert.equal(options.sourceGeneration, manager.generation);
				assert.match(options.childId, /^sa1-/u);
				assert.equal(options.relativeCwd, "src");
				preparedChildId = options.childId;
				return Object.freeze({
					version: 1,
					repository: Object.freeze({ topLevel: "unused" }),
					sourceGeneration: options.sourceGeneration,
					childId: options.childId,
					parentRelativeRoot: "project",
					relativeCwd: options.relativeCwd,
					identity: Object.freeze({
						workspaceId,
						workspaceKey: identity.key,
						correlationToken: allocation.correlationToken,
						branchRef: identity.branch,
					}),
					approvalDigest: "d".repeat(64),
				});
			},
			async provisionApproved(plan, admission, options) {
				events.push(options?.signal ? "provision:signalled" : "provision");
				assert.equal(plan.childId, preparedChildId);
				assert.equal(admission.approvalDigest, plan.approvalDigest);
				assert.equal(admission.correlationToken, allocation.correlationToken);
				return Object.freeze({ summary, workspace: identity, allocation, relativeCwd: "src" });
			},
			async retain(seenAllocation) {
				events.push("retain");
				assert.strictEqual(seenAllocation, allocation);
				return Object.freeze({ ...summary, disposition: "retained" });
			},
		};
		const runner = new SubAgentAssignmentRunner(manager, {
			resolveWorkspace: createApprovedWorktreeWorkspaceResolver({
				worktrees,
				trusted: true,
				approve(plan, request) {
					events.push("approve");
					assert.equal(request.id, plan.childId);
					assert.equal(request.generation, manager.generation);
					assert.equal(request.spec.workspace.mode, "worktree");
					return {
						approvalDigest: plan.approvalDigest,
						correlationToken: plan.identity.correlationToken,
					};
				},
			}),
			async createSession(options) {
				events.push("createSession");
				assert.strictEqual(options.resolvedWorkspace.identity, identity);
				assert.equal(options.resolvedWorkspace.cwd, worktreeCwd);
				throw new SubAgentSessionFactoryError(
					"session_initialization_failed",
					"synthetic worktree runtime failure",
				);
			},
		});
		const resolvedModel = {
			runtime: { fake: "runtime" },
			model: { provider: "fake-provider", id: "fake-model" },
			ref: { provider: "fake-provider", id: "fake-model" },
		};
		let failureId;
		await assert.rejects(
			runner.createAndLaunch(
				{
					...childSpec("worktree-child", "exercise fake-approved worktree provisioning"),
					workspace: { mode: "worktree", cwd: "src", bashPolicy: "disabled" },
				},
				() => resolvedModel,
			),
			(error) => {
				assert.equal(error.code, "runtime_initialization_failed");
				assert.equal(error.worktreeOutcome?.workspaceId, workspaceId);
				assert.equal(error.worktreeOutcome?.disposition, "retained");
				failureId = error.agentId;
				return true;
			},
		);
		assert.deepEqual(events, ["prepare", "approve", "provision", "createSession", "retain"]);
		assert.equal(failureId, preparedChildId);
		assert.equal(manager.getAgent(failureId).state, "failed");
		assert.equal(runner.liveRuntimeCount, 0);
	} finally {
		if (manager) await manager.disposeAll("worktree provision test complete").catch(() => undefined);
		await temporary.cleanup();
	}
});

test("the assignment runner launches in the background and reuses an idle child with retained context", async () => {
	const fixture = await createOfflineFixture("reuse");
	const firstStarted = deferred();
	const releaseFirst = deferred();
	let secondSawFirstResult = false;
	try {
		fixture.faux.setResponses([
			async () => {
				firstStarted.resolve();
				await releaseFirst.promise;
				return fixture.piAi.fauxAssistantMessage("first assignment complete");
			},
			(context) => {
				secondSawFirstResult = context.messages.some(
					(message) =>
						message.role === "assistant" &&
						message.content.some(
							(part) => part.type === "text" && part.text === "first assignment complete",
						),
				);
				return fixture.piAi.fauxAssistantMessage("second assignment complete");
			},
		]);

		const first = await fixture.runner.createAndLaunch(
			childSpec("reusable-child", "complete the first assignment"),
			async ({ id, generation, spec }) => {
				assert.match(id, /^sa1-/);
				assert.equal(generation, fixture.manager.generation);
				assert.equal(spec.name, "reusable-child");
				return {
					...fixture.resolvedModel,
					route: inheritedFallbackRoute(fixture.resolvedModel.ref),
				};
			},
		);
		await firstStarted.promise;
		assert.equal(first.accepted, true);
		assert.equal(first.snapshot.state, "running");
		assert.deepEqual(first.snapshot.modelRoute.selectedModel, fixture.resolvedModel.ref);
		assert.deepEqual(first.snapshot.currentAssignment.modelRoute, first.snapshot.modelRoute);
		assert.equal(fixture.runner.liveRuntimeCount, 1);
		assert.equal(fixture.manager.getAgent(first.id).currentAssignment.id, first.assignmentId);

		releaseFirst.resolve();
		const firstIdle = await fixture.runner.waitForAssignment(first.id, first.assignmentId);
		assert.equal(firstIdle.state, "idle");
		assert.equal(firstIdle.assignmentCount, 1);
		assert.equal(firstIdle.latestResult.summary, "first assignment complete");

		const second = await fixture.runner.prompt(first.id, "complete the second assignment");
		assert.notEqual(second.assignmentId, first.assignmentId);
		const secondIdle = await fixture.runner.waitForAssignment(first.id, second.assignmentId);
		assert.equal(secondIdle.state, "idle");
		assert.equal(secondIdle.assignmentCount, 2);
		assert.equal(secondIdle.usage.assignments, 2);
		assert.equal(secondIdle.latestResult.summary, "second assignment complete");
		assert.equal(secondSawFirstResult, true);
		assert.deepEqual(userTexts(fixture.sessions[0].session.messages), [
			"complete the first assignment",
			"complete the second assignment",
		]);
	} finally {
		await cleanupFixture(fixture);
	}
	assert.equal(fixture.runner.liveRuntimeCount, 0);
	assert.equal(fixture.sessions.every((session) => session.disposed), true);
});

test("a guarded-bash child reacquires whole-workspace ownership before a later assignment starts", async () => {
	const fixture = await createOfflineFixture("bash-reacquire");
	try {
		fixture.faux.setResponses([
			() => fixture.piAi.fauxAssistantMessage("first foreground-only assignment complete"),
			() => fixture.piAi.fauxAssistantMessage("second foreground-only assignment complete"),
		]);
		const spec = {
			...childSpec("bash-reacquire-child", "complete the first assignment without invoking bash"),
			tools: ["bash"],
			workspace: { mode: "shared", bashPolicy: "workspace-exclusive" },
		};
		const first = await fixture.runner.createAndLaunch(spec, () => fixture.resolvedModel);
		const firstIdle = await fixture.runner.waitForAssignment(first.id, first.assignmentId);
		assert.equal(firstIdle.state, "idle");
		assert.deepEqual(firstIdle.leases.map((lease) => lease.kind), ["workspace"]);

		const released = await fixture.manager.releaseChildLeases(first.id, "test explicit idle release");
		assert.deepEqual(released.leases, []);
		const second = await fixture.runner.prompt(first.id, "complete the second assignment without invoking bash");
		assert.deepEqual(second.snapshot.leases.map((lease) => lease.kind), ["workspace"]);
		const secondIdle = await fixture.runner.waitForAssignment(first.id, second.assignmentId);
		assert.equal(secondIdle.state, "idle");
		assert.deepEqual(secondIdle.leases.map((lease) => lease.kind), ["workspace"]);
	} finally {
		await cleanupFixture(fixture);
	}
});

test("successful worktree runtime initialization records a path-free workspace summary", async () => {
	const temporary = await createTempDirectoryFixture("pi-sub-agent-runner-worktree-summary");
	let manager;
	try {
		const parentCwd = join(temporary.root, "repo", "project");
		const worktreeRoot = join(temporary.root, "state", "trees", "summary-child", "project");
		await mkdir(parentCwd, { recursive: true });
		await mkdir(worktreeRoot, { recursive: true });

		let nonce = 0;
		manager = new SubAgentManager({
			cwd: parentCwd,
			generation: createSessionGeneration("worktree-summary"),
			nonce: () => `worktree-summary-${++nonce}`,
			cleanupTimeoutMs: 500,
			modelRuntime: { async dispose() {} },
		});
		const workspaceId = `saw1-${"s".repeat(32)}`;
		const branch = `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`;
		const baseCommit = "c".repeat(40);
		let identity;
		let childId;
		const resolveWorkspace = async (request) => {
			childId = request.id;
			identity ??= manager.registerWorktreeWorkspace({
				workspaceId,
				root: worktreeRoot,
				branch,
				baseCommit,
				ownerAgentId: request.id,
				key: `sawk1-${"s".repeat(32)}`,
			});
			return Object.freeze({ identity, cwd: worktreeRoot });
		};
		const runner = new SubAgentAssignmentRunner(manager, {
			async createSession(options) {
				let streaming = false;
				return {
					id: options.id,
					generation: options.generation,
					cwd: worktreeRoot,
					workspace: identity,
					selectedTools: Object.freeze([]),
					thinkingLevel: "off",
					session: {
						get isIdle() { return !streaming; },
						get isStreaming() { return streaming; },
						pendingMessageCount: 0,
						prompt(_text, options) {
							streaming = true;
							options.preflightResult(true);
							return Promise.resolve().then(async () => {
								streaming = false;
								await manager.completeAssignment(childId, {
									state: "idle",
									summary: "worktree summary assignment complete",
								});
							});
						},
						async steer() {},
						async followUp() {},
					},
					async abort() { streaming = false; },
					async waitForIdle() {},
					dispose() {},
					async close() {},
				};
			},
		});
		const launched = await runner.createAndLaunch(
			{
				...childSpec("worktree-summary-child", "record summary before model work"),
				workspace: { mode: "worktree" },
			},
			() => ({ runtime: {}, model: {}, ref: { provider: "fake", id: "fake" } }),
			undefined,
			{ resolveWorkspace },
		);
		assert.deepEqual(launched.snapshot.workspace, {
			mode: "worktree",
			workspaceId,
			branchRef: branch,
			baseCommit,
			disposition: "active",
		});
		assert.equal(JSON.stringify(launched.snapshot.workspace).includes(worktreeRoot), false);
		assert.equal(manager.getAgent(launched.id).workspace.workspaceId, workspaceId);
	} finally {
		if (manager) await manager.disposeAll("worktree summary test complete").catch(() => undefined);
		await temporary.cleanup();
	}
});

test("a pre-resolved registered worktree child reacquires file and workspace ownership before later model work", async () => {
	const temporary = await createTempDirectoryFixture("pi-sub-agent-runner-worktree-reacquire");
	let manager;
	try {
		const parentCwd = join(temporary.root, "repo", "project");
		const worktreeRoot = join(temporary.root, "state", "trees", "child", "project");
		await mkdir(join(parentCwd, "src"), { recursive: true });
		await mkdir(join(worktreeRoot, "src"), { recursive: true });
		await writeFile(join(parentCwd, "src", "owned.txt"), "parent copy\n", "utf8");
		await writeFile(join(worktreeRoot, "src", "owned.txt"), "worktree copy\n", "utf8");

		let nonce = 0;
		manager = new SubAgentManager({
			cwd: parentCwd,
			generation: createSessionGeneration("worktree-reacquire"),
			nonce: () => `worktree-reacquire-${++nonce}`,
			cleanupTimeoutMs: 500,
			modelRuntime: { async dispose() {} },
		});
		const workspaceId = `saw1-${"r".repeat(32)}`;
		const branch = `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`;
		let identity;
		let childId;
		const resolveWorkspace = async (request) => {
			assert.equal(request.spec.workspace.mode, "worktree");
			childId = request.id;
			identity ??= manager.registerWorktreeWorkspace({
				workspaceId,
				root: worktreeRoot,
				branch,
				baseCommit: "a".repeat(40),
				ownerAgentId: request.id,
				key: `sawk1-${"k".repeat(32)}`,
			});
			return Object.freeze({ identity, cwd: worktreeRoot });
		};
		const expectedLeaseKeys = [
			`file:worktree:${workspaceId}:src/owned.txt`,
			`workspace:worktree:${workspaceId}:`,
		];
		const observedLeaseKeys = [];
		const leaseKeys = () => manager.getAgent(childId).leases
			.map((lease) => `${lease.kind}:${lease.workspaceKey}:${lease.path ?? ""}`)
			.sort();
		const claimWorktreeOwnership = async () => {
			await manager.claimChildWorkspaceLease(childId, identity);
			const target = await resolveCanonicalWorkspacePath({
				workspace: identity,
				cwd: identity.root,
				path: "src/owned.txt",
				allowMissing: false,
			});
			await manager.claimChildFileLeases(childId, identity, [target]);
		};
		let promptCount = 0;
		const runner = new SubAgentAssignmentRunner(manager, {
			async createSession(options) {
				assert.strictEqual(options.resolvedWorkspace.identity, identity);
				await claimWorktreeOwnership();
				let streaming = false;
				let disposed = false;
				return {
					id: options.id,
					generation: options.generation,
					cwd: worktreeRoot,
					workspace: identity,
					selectedTools: Object.freeze(["edit", "bash"]),
					thinkingLevel: "off",
					prepareAssignmentWorkspace: claimWorktreeOwnership,
					session: {
						get isIdle() { return !streaming; },
						get isStreaming() { return streaming; },
						pendingMessageCount: 0,
						prompt(_text, options) {
							streaming = true;
							options.preflightResult(true);
							observedLeaseKeys.push(leaseKeys());
							const count = ++promptCount;
							return Promise.resolve().then(async () => {
								streaming = false;
								await manager.completeAssignment(childId, {
									state: "idle",
									summary: `${count === 1 ? "first" : "second"} worktree assignment complete`,
								});
							});
						},
						async steer() {},
						async followUp() {},
					},
					async abort() { streaming = false; },
					async waitForIdle() {},
					dispose() { disposed = true; },
					async close() { this.dispose(); },
					get disposed() { return disposed; },
				};
			},
		});

		const spec = {
			...childSpec("worktree-reacquire-child", "complete the first assignment without using tools"),
			tools: ["edit", "bash"],
			workspace: {
				mode: "worktree",
				writeScope: ["src/owned.txt"],
				bashPolicy: "workspace-exclusive",
			},
		};
		const first = await runner.createAndLaunch(
			spec,
			() => ({ runtime: {}, model: {}, ref: { provider: "fake", id: "fake" } }),
			undefined,
			{ resolveWorkspace },
		);
		const firstIdle = await runner.waitForAssignment(first.id, first.assignmentId);
		assert.equal(firstIdle.state, "idle");
		assert.equal(first.id, childId);
		assert.deepEqual(
			firstIdle.leases.map((lease) => `${lease.kind}:${lease.workspaceKey}:${lease.path ?? ""}`).sort(),
			expectedLeaseKeys,
		);
		assert.equal(JSON.stringify(firstIdle.leases).includes(worktreeRoot), false);

		const released = await manager.releaseChildLeases(first.id, "test explicit worktree idle release");
		assert.deepEqual(released.leases, []);
		const second = await runner.prompt(first.id, "complete the second worktree assignment without using tools");
		assert.deepEqual(
			second.snapshot.leases.map((lease) => `${lease.kind}:${lease.workspaceKey}:${lease.path ?? ""}`).sort(),
			expectedLeaseKeys,
		);
		const secondIdle = await runner.waitForAssignment(first.id, second.assignmentId);
		assert.equal(secondIdle.state, "idle");
		assert.deepEqual(observedLeaseKeys, [expectedLeaseKeys, expectedLeaseKeys]);
	} finally {
		if (manager) await manager.disposeAll("worktree reacquire test complete").catch(() => undefined);
		await temporary.cleanup();
	}
});

test("a settled blocked worktree child reacquires file and workspace ownership before resumed model work", async () => {
	const temporary = await createTempDirectoryFixture("pi-sub-agent-runner-worktree-blocked-resume");
	let manager;
	try {
		const parentCwd = join(temporary.root, "repo", "project");
		const worktreeRoot = join(temporary.root, "state", "trees", "blocked-child", "project");
		await mkdir(join(parentCwd, "src"), { recursive: true });
		await mkdir(join(worktreeRoot, "src"), { recursive: true });
		await writeFile(join(parentCwd, "src", "owned.txt"), "parent copy\n", "utf8");
		await writeFile(join(worktreeRoot, "src", "owned.txt"), "worktree copy\n", "utf8");

		let nonce = 0;
		manager = new SubAgentManager({
			cwd: parentCwd,
			generation: createSessionGeneration("worktree-blocked-resume"),
			nonce: () => `worktree-blocked-resume-${++nonce}`,
			cleanupTimeoutMs: 500,
			modelRuntime: { async dispose() {} },
		});
		const workspaceId = `saw1-${"b".repeat(32)}`;
		const branch = `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`;
		let identity;
		let childId;
		const resolveWorkspace = async (request) => {
			assert.equal(request.spec.workspace.mode, "worktree");
			childId = request.id;
			identity ??= manager.registerWorktreeWorkspace({
				workspaceId,
				root: worktreeRoot,
				branch,
				baseCommit: "b".repeat(40),
				ownerAgentId: request.id,
				key: `sawk1-${"q".repeat(32)}`,
			});
			return Object.freeze({ identity, cwd: worktreeRoot });
		};
		const expectedLeaseKeys = [
			`file:worktree:${workspaceId}:src/owned.txt`,
			`workspace:worktree:${workspaceId}:`,
		];
		const leaseKeys = () => manager.getAgent(childId).leases
			.map((lease) => `${lease.kind}:${lease.workspaceKey}:${lease.path ?? ""}`)
			.sort();
		const observedModelWorkLeaseKeys = [];
		const prepareEvents = [];
		const claimWorktreeOwnership = async () => {
			prepareEvents.push(`prepare:${manager.getAgent(childId).state}`);
			await manager.claimChildWorkspaceLease(childId, identity);
			const target = await resolveCanonicalWorkspacePath({
				workspace: identity,
				cwd: identity.root,
				path: "src/owned.txt",
				allowMissing: false,
			});
			await manager.claimChildFileLeases(childId, identity, [target]);
		};
		let promptCount = 0;
		const runner = new SubAgentAssignmentRunner(manager, {
			async createSession(options) {
				assert.strictEqual(options.resolvedWorkspace.identity, identity);
				await claimWorktreeOwnership();
				let streaming = false;
				let disposed = false;
				return {
					id: options.id,
					generation: options.generation,
					cwd: worktreeRoot,
					workspace: identity,
					selectedTools: Object.freeze(["edit", "bash"]),
					thinkingLevel: "off",
					prepareAssignmentWorkspace: claimWorktreeOwnership,
					session: {
						get isIdle() { return !streaming; },
						get isStreaming() { return streaming; },
						pendingMessageCount: 0,
						prompt(_text, options) {
							streaming = true;
							options.preflightResult(true);
							observedModelWorkLeaseKeys.push(leaseKeys());
							const count = ++promptCount;
							return Promise.resolve().then(async () => {
								streaming = false;
								if (count === 1) {
									await manager.completeAssignment(childId, {
										state: "blocked",
										summary: "blocked on a sibling owner",
										needs: "release sibling ownership, then resume",
									});
									await manager.updateRuntimeActivity(childId, {
										phase: "settled",
										activeToolCount: 0,
										activeTools: [],
										pendingMessageCount: 0,
									});
								} else {
									await manager.completeAssignment(childId, {
										state: "idle",
										summary: "resumed worktree assignment complete",
									});
								}
							});
						},
						async steer() {},
						async followUp() {},
					},
					async abort() { streaming = false; },
					async waitForIdle() {},
					dispose() { disposed = true; },
					async close() { this.dispose(); },
					get disposed() { return disposed; },
				};
			},
		});

		const spec = {
			...childSpec("worktree-blocked-resume-child", "start and become blocked"),
			tools: ["edit", "bash"],
			workspace: {
				mode: "worktree",
				writeScope: ["src/owned.txt"],
				bashPolicy: "workspace-exclusive",
			},
		};
		const first = await runner.createAndLaunch(
			spec,
			() => ({ runtime: {}, model: {}, ref: { provider: "fake", id: "fake" } }),
			undefined,
			{ resolveWorkspace },
		);
		const firstBlocked = await runner.waitForAssignment(first.id, first.assignmentId);
		assert.equal(firstBlocked.state, "blocked");
		assert.equal(firstBlocked.runtime.phase, "settled");
		assert.deepEqual(
			firstBlocked.leases.map((lease) => `${lease.kind}:${lease.workspaceKey}:${lease.path ?? ""}`).sort(),
			expectedLeaseKeys,
		);

		const released = await manager.releaseChildLeases(first.id, "test explicit blocked worktree release");
		assert.deepEqual(released.leases, []);
		const resumed = await runner.resumeBlocked(first.id, "resume the blocked worktree assignment");
		assert.equal(resumed.assignmentId, first.assignmentId);
		assert.deepEqual(
			resumed.snapshot.leases.map((lease) => `${lease.kind}:${lease.workspaceKey}:${lease.path ?? ""}`).sort(),
			expectedLeaseKeys,
		);
		const resumedIdle = await runner.waitForAssignment(first.id, resumed.assignmentId);
		assert.equal(resumedIdle.state, "idle");
		assert.equal(resumedIdle.assignmentCount, 1);
		assert.deepEqual(observedModelWorkLeaseKeys, [expectedLeaseKeys, expectedLeaseKeys]);
		assert.deepEqual(prepareEvents, ["prepare:creating", "prepare:running", "prepare:running"]);
		assert.equal(JSON.stringify(resumedIdle.leases).includes(worktreeRoot), false);
	} finally {
		if (manager) await manager.disposeAll("worktree blocked resume test complete").catch(() => undefined);
		await temporary.cleanup();
	}
});

test("failed guarded-bash initialization releases its preclaimed workspace ownership", async () => {
	const fixture = await createOfflineFixture("bash-init-failure");
	let failedId;
	const runner = new SubAgentAssignmentRunner(fixture.manager, {
		async createSession(options) {
			return createSubAgentSession({
				...options,
				dependencies: {
					async createSession() {
						throw new Error("private synthetic initialization failure");
					},
				},
			});
		},
	});
	try {
		await assert.rejects(
			runner.createAndLaunch(
				{
					...childSpec("bash-init-failure-child", "fail after the workspace preclaim"),
					tools: ["bash"],
					workspace: { mode: "shared", bashPolicy: "workspace-exclusive" },
				},
				() => fixture.resolvedModel,
			),
			(error) => {
				failedId = error.agentId;
				assert.match(error.message, /Could not initialize the child runtime/);
				assert.doesNotMatch(error.message, /private synthetic/);
				return true;
			},
		);
		assert.ok(failedId);
		const failed = fixture.manager.getAgent(failedId);
		assert.equal(failed.state, "failed");
		assert.deepEqual(failed.leases, []);
		assert.equal(runner.hasLiveRuntime(failedId), false);
	} finally {
		await cleanupFixture(fixture);
	}
});

test("steering and follow-up messages stay inside one running assignment boundary", async () => {
	const fixture = await createOfflineFixture("messages");
	const firstStarted = deferred();
	const releaseFirst = deferred();
	let continuation = 0;
	try {
		fixture.faux.setResponses([
			async () => {
				firstStarted.resolve();
				await releaseFirst.promise;
				return fixture.piAi.fauxAssistantMessage("initial response");
			},
			() => fixture.piAi.fauxAssistantMessage(`continuation ${++continuation}`),
			() => fixture.piAi.fauxAssistantMessage(`continuation ${++continuation}`),
			() => fixture.piAi.fauxAssistantMessage(`continuation ${++continuation}`),
		]);

		const launch = await fixture.runner.createAndLaunch(
			childSpec("message-child", "inspect the initial concern"),
			() => fixture.resolvedModel,
		);
		await firstStarted.promise;
		const steering = await fixture.runner.send(launch.id, "redirect to the narrower concern", "steer");
		const followUp = await fixture.runner.send(launch.id, "then provide a final summary", "followUp");
		assert.equal(steering.assignmentId, launch.assignmentId);
		assert.equal(followUp.assignmentId, launch.assignmentId);
		assert.equal(steering.delivery, "steer");
		assert.equal(followUp.delivery, "followUp");
		assert.ok(followUp.pendingMessageCount >= 1);

		releaseFirst.resolve();
		const settled = await fixture.runner.waitForAssignment(launch.id, launch.assignmentId);
		assert.equal(settled.state, "idle");
		assert.equal(settled.assignmentCount, 1);
		assert.equal(settled.usage.assignments, 1);
		assert.deepEqual(userTexts(fixture.sessions[0].session.messages), [
			"inspect the initial concern",
			"redirect to the narrower concern",
			"then provide a final summary",
		]);
		assert.match(settled.latestResult.summary, /continuation/);
	} finally {
		await cleanupFixture(fixture);
	}
});

test("abort and removal races settle without leaking the child runtime", async () => {
	const fixture = await createOfflineFixture("abort-race");
	const responseStarted = deferred();
	const releaseResponse = deferred();
	try {
		fixture.faux.setResponses([
			async () => {
				responseStarted.resolve();
				await releaseResponse.promise;
				return fixture.piAi.fauxAssistantMessage("response after abort request");
			},
		]);
		const launch = await fixture.runner.createAndLaunch(
			childSpec("abort-child", "wait until the parent aborts this assignment"),
			() => fixture.resolvedModel,
		);
		await responseStarted.promise;

		const aborting = fixture.runner.abortAssignment(launch.id);
		const removing = fixture.manager.removeAgent(launch.id, "concurrent abort/remove test");
		releaseResponse.resolve();
		const [abortResult, removeResult] = await Promise.allSettled([aborting, removing]);
		assert.equal(abortResult.status, "fulfilled");
		assert.ok(["stopping", "removed"].includes(abortResult.value.state));
		assert.equal(removeResult.status, "fulfilled");
		assert.equal(removeResult.value.state, "removed");
		assert.equal(fixture.manager.getAgent(launch.id).state, "removed");
		assert.equal(fixture.manager.getAgent(launch.id).currentAssignment.state, "aborted");
		assert.equal(fixture.sessions[0].disposed, true);
		assert.equal(fixture.runner.hasLiveRuntime(launch.id), false);
	} finally {
		await cleanupFixture(fixture);
	}
});

test("background prompt rejection is observed, sanitized, and isolated in the failed child", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runner-rejection-"));
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration("rejection"),
		modelRuntime: { async dispose() {} },
	});
	const rejection = deferred();
	let disposed = false;
	let streaming = false;
	const session = {
		get isIdle() {
			return !streaming;
		},
		get isStreaming() {
			return streaming;
		},
		pendingMessageCount: 0,
		prompt(_text, options) {
			streaming = true;
			options.preflightResult(true);
			return rejection.promise.finally(() => {
				streaming = false;
			});
		},
		async steer() {},
		async followUp() {},
	};
	const fakeRuntime = {
		id: undefined,
		session,
		async abort() {
			rejection.reject(new Error("PRIVATE_PROVIDER_REJECTION_DETAIL"));
		},
		async waitForIdle() {
			await rejection.promise.catch(() => undefined);
		},
		dispose() {
			disposed = true;
		},
		async close() {
			this.dispose();
		},
	};
	const runner = new SubAgentAssignmentRunner(manager, {
		async createSession(options) {
			fakeRuntime.id = options.id;
			return fakeRuntime;
		},
	});
	try {
		const launch = await runner.createAndLaunch(
			childSpec("rejecting-child", "run the rejecting assignment"),
			() => ({ runtime: {}, model: {}, ref: { provider: "fake", id: "fake" } }),
		);
		rejection.reject(new Error("PRIVATE_PROVIDER_REJECTION_DETAIL"));
		const failed = await runner.waitForAssignment(launch.id, launch.assignmentId);
		assert.equal(failed.state, "failed");
		assert.equal(failed.currentAssignment.state, "failed");
		assert.equal(failed.lastError, "Child assignment execution failed");
		assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_PROVIDER_REJECTION_DETAIL/);
	} finally {
		await manager.disposeAll("rejection test complete");
		await rm(root, { recursive: true, force: true });
	}
	assert.equal(disposed, true);
});

test("cancelling a hung model resolution returns boundedly and quarantines its provisional generation", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runner-cancel-model-"));
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration("cancel-model"),
		cleanupTimeoutMs: 10,
		modelRuntime: { async dispose() {} },
	});
	const runner = new SubAgentAssignmentRunner(manager, {
		async createSession() { throw new Error("session creation must not start"); },
	});
	const entered = deferred();
	const controller = new AbortController();
	try {
		const launch = runner.createAndLaunch(
			childSpec("cancelled-model-child", "never finish model resolution"),
			async () => {
				entered.resolve();
				return new Promise(() => undefined);
			},
			controller.signal,
		);
		await entered.promise;
		const startedAt = Date.now();
		controller.abort();
		await assert.rejects(launch, (error) => error?.code === "cancelled");
		assert.ok(Date.now() - startedAt < 500);
		assert.equal(manager.getSummary().active, 0);
		await assert.rejects(manager.disposeAll("hung model cancellation"), (error) => error?.code === "cleanup_incomplete");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("cancelling hung prompt preflight returns after bounded manager cleanup", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runner-cancel-preflight-"));
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration("cancel-preflight"),
		cleanupTimeoutMs: 10,
		modelRuntime: { async dispose() {} },
	});
	const promptEntered = deferred();
	let disposed = false;
	const runner = new SubAgentAssignmentRunner(manager, {
		async createSession(options) {
			let streaming = false;
			return {
				id: options.id,
				thinkingLevel: "off",
				session: {
					get isIdle() { return !streaming; },
					get isStreaming() { return streaming; },
					pendingMessageCount: 0,
					prompt() {
						streaming = true;
						promptEntered.resolve();
						return new Promise(() => undefined);
					},
					async steer() {},
					async followUp() {},
				},
				abort() { return new Promise(() => undefined); },
				waitForIdle() { return new Promise(() => undefined); },
				dispose() { disposed = true; },
				async close() { this.dispose(); },
			};
		},
	});
	const controller = new AbortController();
	try {
		const launch = runner.createAndLaunch(
			childSpec("cancelled-preflight-child", "never accept prompt preflight"),
			() => ({ runtime: {}, model: {}, ref: { provider: "fixture", id: "fixture" } }),
			controller.signal,
		);
		await promptEntered.promise;
		const startedAt = Date.now();
		controller.abort();
		await assert.rejects(launch, (error) => error?.code === "cancelled");
		assert.ok(Date.now() - startedAt < 500);
		assert.equal(disposed, true);
		await assert.rejects(manager.disposeAll("hung preflight cancellation"), (error) => error?.code === "cleanup_incomplete");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("cancelling session initialization removes the provisional child and closes a late runtime", async () => {
	const fixture = await createOfflineFixture("cancel-initialize");
	const entered = deferred();
	const release = deferred();
	let closeCalls = 0;
	const runner = new SubAgentAssignmentRunner(fixture.manager, {
		async createSession() {
			entered.resolve();
			await release.promise;
			return {
				async close() { closeCalls += 1; },
			};
		},
	});
	const controller = new AbortController();
	try {
		const launch = runner.createAndLaunch(
			childSpec("cancelled-child", "never begin after cancellation"),
			() => ({
				...fixture.resolvedModel,
				route: inheritedFallbackRoute(fixture.resolvedModel.ref),
			}),
			controller.signal,
		);
		await entered.promise;
		controller.abort();
		release.resolve();
		await assert.rejects(
			launch,
			(error) => error?.code === "cancelled",
		);
		assert.equal(runner.liveRuntimeCount, 0);
		assert.equal(closeCalls, 1);
		assert.equal(fixture.manager.getSummary().active, 0);
		assert.equal(fixture.manager.listAgents({ includeRemoved: true }).at(-1).state, "removed");
	} finally {
		release.resolve();
		await cleanupFixture(fixture);
	}
});
