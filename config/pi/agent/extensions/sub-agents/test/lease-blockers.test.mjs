import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importInstalledPackages, importSubAgentsModule } from "./installed-packages.mjs";

const { SubAgentAssignmentRunner } = await importSubAgentsModule("assignment-runner.ts");
const { createSubAgentSession } = await importSubAgentsModule("agent-runtime.ts");
const { SubAgentManager, createSessionGeneration } = await importSubAgentsModule("manager.ts");
const { createSubAgentNotificationRuntime } = await importSubAgentsModule("notifications.ts");
const { executeSubAgentsRelease } = await importSubAgentsModule("tools/release.ts");
const { executeSubAgentsSend } = await importSubAgentsModule("tools/send.ts");
const { executeSubAgentsStatus } = await importSubAgentsModule("tools/status.ts");
const {
	resolveCanonicalWorkspacePath,
	resolveSharedWorkspace,
} = await importSubAgentsModule("workspace/paths.ts");

async function fixture(label = "lease-blocker") {
	const root = await mkdtemp(join(tmpdir(), `pi-sub-agent-${label}-`));
	const targetPath = join(root, "target.txt");
	await writeFile(targetPath, "alpha\n", "utf8");
	const { codingAgent, piAi } = await importInstalledPackages();
	const providerId = `lease-blocker-${label}`;
	const faux = piAi.fauxProvider({ provider: providerId, tokensPerSecond: 100_000 });
	const modelRuntime = await codingAgent.ModelRuntime.create({
		credentials: new piAi.InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	modelRuntime.registerNativeProvider(faux.provider);
	const model = modelRuntime.getModel(providerId, "faux-1");
	assert.ok(model);
	const resolvedModel = {
		runtime: modelRuntime,
		model,
		ref: { provider: model.provider, id: model.id },
	};
	let nonce = 0;
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration(label),
		nonce: () => `${label}-${++nonce}`,
		cleanupTimeoutMs: 500,
		modelRuntime: { async dispose() {} },
	});
	const runner = new SubAgentAssignmentRunner(manager, {
		createSession: (options) => createSubAgentSession(options),
	});
	const workspace = await resolveSharedWorkspace(root);
	const target = await resolveCanonicalWorkspacePath({
		workspace: workspace.identity,
		path: "target.txt",
		allowMissing: false,
	});
	return { root, target, targetPath, piAi, faux, resolvedModel, manager, runner, workspace, modelRuntime };
}

async function cleanup(value) {
	await value.manager.disposeAll("lease blocker test complete");
	await rm(value.root, { recursive: true, force: true });
}

function ownerSpec(name) {
	return {
		name,
		role: "Retain one exact shared-workspace lease",
		objective: "Hold the target until the parent explicitly releases ownership.",
		tools: ["edit"],
		workspace: { mode: "shared", bashPolicy: "disabled" },
	};
}

function contenderSpec(name) {
	return {
		name,
		role: "Attempt and later resume one guarded edit",
		objective: "Replace alpha with beta in target.txt after ownership is resolved.",
		thinkingLevel: "off",
		tools: ["edit"],
		workspace: { mode: "shared", bashPolicy: "disabled" },
		notifyOn: ["blocked"],
	};
}

test("a guarded child lease conflict becomes a notified blocker, then release plus send resumes the same assignment", async () => {
	const value = await fixture();
	const sent = [];
	const notifications = createSubAgentNotificationRuntime({
		manager: value.manager,
		flushDelayMs: 1_000,
		sendMessage(message, options) {
			sent.push({ message, options });
		},
	});
	try {
		const owner = value.manager.createAgent(ownerSpec("retained-owner"));
		await value.manager.startAssignment(owner.id);
		await value.manager.claimChildFileLeases(
			owner.id,
			value.workspace.identity,
			[value.target],
		);
		await value.manager.completeAssignment(owner.id, {
			state: "idle",
			summary: "Ownership retained for follow-up work",
		});

		value.faux.setResponses([
			value.piAi.fauxAssistantMessage(
				value.piAi.fauxToolCall("edit", {
					path: "target.txt",
					edits: [{ oldText: "alpha", newText: "beta" }],
				}),
				{ stopReason: "toolUse" },
			),
			value.piAi.fauxAssistantMessage("Waiting for the parent to resolve retained ownership."),
			value.piAi.fauxAssistantMessage(
				value.piAi.fauxToolCall("edit", {
					path: "target.txt",
					edits: [{ oldText: "alpha", newText: "beta" }],
				}),
				{ stopReason: "toolUse" },
			),
			value.piAi.fauxAssistantMessage("The resumed guarded edit completed."),
		]);

		const launch = await value.runner.createAndLaunch(
			contenderSpec("blocked-contender"),
			() => value.resolvedModel,
		);
		const blocked = await value.runner.waitForAssignment(launch.id, launch.assignmentId);
		assert.equal(blocked.state, "blocked");
		assert.equal(blocked.currentAssignment.state, "blocked");
		assert.equal(blocked.assignmentCount, 1);
		assert.equal(blocked.latestReport.state, "blocked");
		assert.match(blocked.latestReport.summary, /Lease conflict held by sub-agent .* for target target\.txt/);
		assert.match(blocked.latestReport.summary, new RegExp(owner.id));
		assert.match(blocked.latestReport.summary, /retained-owner/);
		assert.match(blocked.currentAssignment.blocker, new RegExp(owner.id));
		assert.deepEqual(blocked.leases, []);
		assert.equal(await readFile(value.targetPath, "utf8"), "alpha\n");
		await assert.rejects(
			value.manager.claimChildFileLeases(launch.id, value.workspace.identity, [value.target]),
			(error) => error?.code === "agent_unavailable",
			"a blocked child cannot retry lease acquisition before an explicit resume boundary",
		);
		const status = await executeSubAgentsStatus(
			{ ids: [launch.id], detail: "compact" },
			undefined,
			{ manager: value.manager },
		);
		assert.equal(status.details.outcomes[0].state, "blocked");
		assert.match(status.details.outcomes[0].report.summary, new RegExp(owner.id));
		assert.match(status.details.outcomes[0].report.summary, /retained-owner/);

		const batch = notifications.flushNow();
		assert.ok(batch);
		assert.equal(sent.length, 1);
		assert.deepEqual(sent[0].options, { deliverAs: "followUp", triggerTurn: true });
		assert.equal(sent[0].message.details.events[0].state, "blocked");
		assert.match(sent[0].message.details.events[0].summary, new RegExp(owner.id));

		const released = await executeSubAgentsRelease(
			{ ids: [owner.id] },
			undefined,
			{ manager: value.manager },
		);
		assert.equal(released.details.releasedTargets, 1);
		assert.equal(released.details.releasedLeases, 1);
		assert.deepEqual(value.manager.getAgent(owner.id).leases, []);

		const resumed = await executeSubAgentsSend(
			{
				messages: [{
					id: launch.id,
					message: "The previous owner released target.txt. Resume the same assignment and retry the guarded edit.",
				}],
			},
			undefined,
			{ manager: value.manager, runner: value.runner },
		);
		assert.equal(resumed.details.accepted, 1);
		assert.equal(resumed.details.outcomes[0].dispatch, "resume");
		assert.equal(resumed.details.outcomes[0].assignmentSequence, 1);
		const completed = await value.runner.waitForAssignment(launch.id, launch.assignmentId);
		assert.equal(completed.state, "idle");
		assert.equal(completed.assignmentCount, 1, "resume must retain the exact assignment boundary");
		assert.equal(completed.latestReport, undefined, "the resolved blocker must not remain current");
		assert.equal(completed.latestResult.summary, "The resumed guarded edit completed.");
		assert.deepEqual(completed.currentAssignment.modifiedFiles, ["target.txt"]);
		assert.deepEqual(completed.leases.map((lease) => lease.path), ["target.txt"]);
		assert.equal(await readFile(value.targetPath, "utf8"), "beta\n");
	} finally {
		notifications.shutdown();
		await cleanup(value);
	}
});

test("a released declared missing-file scope refreshes its identity before a later assignment", async () => {
	const value = await fixture("missing-scope-reacquire");
	try {
		const requestedPath = "generated.txt";
		value.faux.setResponses([
			value.piAi.fauxAssistantMessage(
				value.piAi.fauxToolCall("write", {
					path: requestedPath,
					content: "first\n",
				}),
				{ stopReason: "toolUse" },
			),
			value.piAi.fauxAssistantMessage("Created the declared missing target."),
			value.piAi.fauxAssistantMessage(
				value.piAi.fauxToolCall("write", {
					path: requestedPath,
					content: "second\n",
				}),
				{ stopReason: "toolUse" },
			),
			value.piAi.fauxAssistantMessage("Reacquired and updated the declared target."),
		]);

		const launched = await value.runner.createAndLaunch(
			{
				name: "missing-scope-writer",
				role: "Create and later update one declared shared-workspace file",
				objective: "Exercise release and reacquisition after a missing target becomes existing.",
				thinkingLevel: "off",
				tools: ["write"],
				workspace: {
					mode: "shared",
					writeScope: [requestedPath],
					bashPolicy: "disabled",
				},
			},
			() => value.resolvedModel,
		);
		const firstIdle = await value.runner.waitForAssignment(launched.id, launched.assignmentId);
		assert.equal(firstIdle.state, "idle");
		assert.equal(await readFile(join(value.root, requestedPath), "utf8"), "first\n");
		assert.deepEqual(firstIdle.leases.map((lease) => lease.path), [requestedPath]);

		await value.manager.releaseChildLeases(launched.id, "test missing-scope release");
		assert.deepEqual(value.manager.getAgent(launched.id).leases, []);

		const secondLaunch = await value.runner.prompt(
			launched.id,
			"Reacquire the declared scope and update generated.txt.",
		);
		const secondIdle = await value.runner.waitForAssignment(launched.id, secondLaunch.assignmentId);
		assert.equal(secondIdle.state, "idle");
		assert.equal(secondIdle.assignmentCount, 2);
		assert.equal(await readFile(join(value.root, requestedPath), "utf8"), "second\n");
		assert.deepEqual(secondIdle.leases.map((lease) => lease.path), [requestedPath]);
	} finally {
		await cleanup(value);
	}
});

test("a released idle child that loses its declared scope becomes blocked before the next prompt starts", async () => {
	const value = await fixture();
	try {
		value.faux.setResponses([
			value.piAi.fauxAssistantMessage("Initial declared-scope assignment complete."),
		]);
		const launched = await value.runner.createAndLaunch(
			{
				...contenderSpec("declared-scope-child"),
				workspace: {
					mode: "shared",
					writeScope: ["target.txt"],
					bashPolicy: "disabled",
				},
			},
			() => value.resolvedModel,
		);
		const firstIdle = await value.runner.waitForAssignment(launched.id, launched.assignmentId);
		assert.equal(firstIdle.state, "idle");
		assert.deepEqual(firstIdle.leases.map((lease) => lease.path), ["target.txt"]);
		await value.manager.releaseChildLeases(launched.id, "test explicit idle release");

		const owner = value.manager.createAgent(ownerSpec("new-scope-owner"));
		await value.manager.startAssignment(owner.id);
		await value.manager.claimChildFileLeases(owner.id, value.workspace.identity, [value.target]);
		await value.manager.completeAssignment(owner.id, {
			state: "idle",
			summary: "Retained the released declared scope",
		});

		await assert.rejects(
			value.runner.prompt(launched.id, "Start another mutating assignment."),
			(error) => error?.code === "assignment_rejected",
		);
		const blocked = value.manager.getAgent(launched.id);
		assert.equal(blocked.state, "blocked");
		assert.equal(blocked.assignmentCount, 2);
		assert.equal(blocked.currentAssignment.sequence, 2);
		assert.equal(blocked.runtime.phase, "settled");
		assert.match(blocked.currentAssignment.blocker, new RegExp(owner.id));
		assert.match(blocked.latestReport.summary, /new-scope-owner/);
		assert.deepEqual(blocked.leases, []);
		assert.equal(await readFile(value.targetPath, "utf8"), "alpha\n");
	} finally {
		await cleanup(value);
	}
});
