import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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

const { SubAgentAssignmentRunner } = await importSubAgentsModule("assignment-runner.ts");
const { createSubAgentSession } = await importSubAgentsModule("agent-runtime.ts");
const { SubAgentManager, createSessionGeneration } = await importSubAgentsModule("manager.ts");

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
