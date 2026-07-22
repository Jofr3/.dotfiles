import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	importInstalledPackages,
	importInstalledTypeBoxValue,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const {
	REPORT_TO_PARENT_TOOL_NAME,
	ReportToParentError,
	createReportToParentTool,
	reportToParentSchema,
} = await importSubAgentsModule("tools/report-to-parent.ts");
const { SubAgentAssignmentRunner } = await importSubAgentsModule("assignment-runner.ts");
const { createSubAgentSession } = await importSubAgentsModule("agent-runtime.ts");
const { SubAgentManager, createSessionGeneration } = await importSubAgentsModule("manager.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");
const { Check } = await importInstalledTypeBoxValue();

function childSpec(name, objective) {
	return {
		name,
		role: "Exercise the bounded child-to-parent reporting boundary",
		objective,
		thinkingLevel: "off",
		tools: [],
	};
}

async function createOfflineFixture(label) {
	const root = await mkdtemp(join(tmpdir(), `pi-sub-agent-report-${label}-`));
	const { codingAgent, piAi } = await importInstalledPackages();
	const providerId = `report-to-parent-${label}`;
	const faux = piAi.fauxProvider({ provider: providerId, tokensPerSecond: 100_000 });
	const runtime = await codingAgent.ModelRuntime.create({
		credentials: new piAi.InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	runtime.registerNativeProvider(faux.provider);
	const model = runtime.getModel(providerId, "faux-1");
	assert.ok(model);
	const resolvedModel = {
		runtime,
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
	const sessions = [];
	const runner = new SubAgentAssignmentRunner(manager, {
		async createSession(options) {
			const child = await createSubAgentSession(options);
			sessions.push(child);
			return child;
		},
	});
	return { root, piAi, faux, resolvedModel, manager, runner, sessions };
}

async function cleanupFixture(fixture) {
	await fixture.manager.disposeAll("report-to-parent test complete");
	await rm(fixture.root, { recursive: true, force: true });
}

test("report_to_parent has one strict bounded child-only schema and a fixed owning-parent sink", async () => {
	assert.equal(REPORT_TO_PARENT_TOOL_NAME, "report_to_parent");
	assert.equal(reportToParentSchema.additionalProperties, false);
	assert.deepEqual(Object.keys(reportToParentSchema.properties).sort(), [
		"details",
		"files",
		"needs",
		"state",
		"summary",
	]);
	assert.equal(Check(reportToParentSchema, { state: "progress", summary: "still working" }), true);
	assert.equal(Check(reportToParentSchema, { state: "blocked", summary: "need input", needs: "choose A or B" }), true);
	assert.equal(Check(reportToParentSchema, { state: "result", summary: "done", files: ["src/a.ts"] }), true);
	assert.equal(Check(reportToParentSchema, { state: "unknown", summary: "invalid" }), false);
	assert.equal(Check(reportToParentSchema, { state: "result", summary: "done", agentId: "peer" }), false);
	assert.equal(Check(reportToParentSchema, { state: "result", summary: "x".repeat(SUB_AGENT_BOUNDS.reportSummaryChars + 1) }), false);
	assert.equal(Check(reportToParentSchema, {
		state: "result",
		summary: "done",
		files: Array.from({ length: SUB_AGENT_BOUNDS.reportFiles + 1 }, (_, index) => `src/${index}.ts`),
	}), false);

	const received = [];
	const tool = createReportToParentTool((report) => received.push(report));
	assert.equal(tool.name, "report_to_parent");
	assert.equal(tool.executionMode, "sequential");
	const result = await tool.execute(
		"report-call",
		{
			state: "result",
			summary: "  bounded result  ",
			details: "  supporting detail  ",
			files: ["src/a.ts", " src/a.ts "],
		},
		undefined,
		undefined,
		{},
	);
	assert.deepEqual(received, [{
		state: "result",
		summary: "bounded result",
		details: "supporting detail",
		files: ["src/a.ts"],
		needs: undefined,
	}]);
	assert.deepEqual(result.details, { version: 1, recorded: true, state: "result" });
	assert.equal(result.content[0].text, "Recorded result report for the parent.");
	assert.doesNotMatch(JSON.stringify(result), /bounded result|supporting detail|src\/a\.ts/);

	const cancelled = new AbortController();
	cancelled.abort();
	await assert.rejects(
		tool.execute(
			"cancelled-report",
			{ state: "progress", summary: "not recorded" },
			cancelled.signal,
			undefined,
			{},
		),
		(error) => error instanceof ReportToParentError && error.code === "cancelled",
	);
	assert.equal(received.length, 1);

	const privateFailure = "PRIVATE_PARENT_MANAGER_FAILURE";
	const failingTool = createReportToParentTool(() => {
		throw new Error(privateFailure);
	});
	await assert.rejects(
		failingTool.execute(
			"failed-report",
			{ state: "result", summary: "safe summary" },
			undefined,
			undefined,
			{},
		),
		(error) => {
			assert.ok(error instanceof ReportToParentError);
			assert.equal(error.code, "report_failed");
			assert.doesNotMatch(error.message, new RegExp(privateFailure));
			return true;
		},
	);
});

test("structured results override final text, later assignments fall back cleanly, and blockers settle explicitly", async () => {
	const fixture = await createOfflineFixture("integration");
	try {
		fixture.faux.setResponses([
			fixture.piAi.fauxAssistantMessage(
				fixture.piAi.fauxToolCall("report_to_parent", {
					state: "result",
					summary: "structured result summary",
					details: "structured result details",
					files: ["src/result.ts"],
				}),
				{ stopReason: "toolUse" },
			),
			fixture.piAi.fauxAssistantMessage("final assistant text must not replace the structured result"),
			fixture.piAi.fauxAssistantMessage(
				fixture.piAi.fauxToolCall("report_to_parent", {
					state: "progress",
					summary: "second assignment progress",
				}),
				{ stopReason: "toolUse" },
			),
			fixture.piAi.fauxAssistantMessage("second assignment final fallback"),
			fixture.piAi.fauxAssistantMessage("third assignment final fallback without any report"),
			fixture.piAi.fauxAssistantMessage(
				fixture.piAi.fauxToolCall("report_to_parent", {
					state: "blocked",
					summary: "parent decision required",
					details: "two supported paths remain",
					files: ["src/decision.ts"],
					needs: "choose path A or path B",
				}),
				{ stopReason: "toolUse" },
			),
			fixture.piAi.fauxAssistantMessage("waiting for the parent decision"),
		]);

		const launch = await fixture.runner.createAndLaunch(
			childSpec("result-child", "produce a structured result"),
			() => fixture.resolvedModel,
		);
		let settled = await fixture.runner.waitForAssignment(launch.id, launch.assignmentId);
		assert.equal(settled.state, "idle");
		assert.equal(settled.latestReport.state, "result");
		assert.equal(settled.latestResult.summary, "structured result summary");
		assert.equal(settled.latestResult.details, "structured result details");
		assert.deepEqual(settled.latestResult.files, ["src/result.ts"]);
		assert.deepEqual(fixture.sessions[0].selectedTools, ["report_to_parent"]);
		assert.deepEqual(fixture.sessions[0].session.getAllTools().map((tool) => tool.name), [
			"report_to_parent",
		]);

		const second = await fixture.runner.prompt(launch.id, "report progress, then finish normally");
		settled = await fixture.runner.waitForAssignment(launch.id, second.assignmentId);
		assert.equal(settled.state, "idle");
		assert.equal(settled.latestReport.state, "progress");
		assert.equal(settled.latestResult.summary, "second assignment final fallback");

		const third = await fixture.runner.prompt(launch.id, "finish without calling the report tool");
		settled = await fixture.runner.waitForAssignment(launch.id, third.assignmentId);
		assert.equal(settled.state, "idle");
		assert.equal(settled.latestReport, undefined, "a new assignment cannot reuse a stale report");
		assert.equal(settled.latestResult.summary, "third assignment final fallback without any report");

		const blockedLaunch = await fixture.runner.createAndLaunch(
			childSpec("blocked-child", "report the exact orchestration blocker"),
			() => fixture.resolvedModel,
		);
		const blocked = await fixture.runner.waitForAssignment(
			blockedLaunch.id,
			blockedLaunch.assignmentId,
		);
		assert.equal(blocked.state, "blocked");
		assert.equal(blocked.latestReport.state, "blocked");
		assert.equal(blocked.latestReport.summary, "parent decision required");
		assert.equal(blocked.latestReport.details, "two supported paths remain");
		assert.deepEqual(blocked.latestReport.files, ["src/decision.ts"]);
		assert.equal(blocked.currentAssignment.blocker, "choose path A or path B");
		assert.equal(blocked.latestResult, undefined);
	} finally {
		await cleanupFixture(fixture);
	}
});
