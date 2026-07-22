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

	assert.equal(tool.executionMode, "parallel");
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
