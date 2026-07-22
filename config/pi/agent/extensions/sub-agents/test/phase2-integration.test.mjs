import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importInstalledPackages, importSubAgentsModule } from "./installed-packages.mjs";

const { SubAgentAssignmentRunner } = await importSubAgentsModule("assignment-runner.ts");
const { SubAgentManager, createSessionGeneration } = await importSubAgentsModule("manager.ts");
const { ChildModelRuntimeAdapter, SUB_AGENT_TIER_MODEL_IDS } = await importSubAgentsModule("model-runtime.ts");
const { SubAgentModelRouter } = await importSubAgentsModule("model-router.ts");

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

function textFromUserContent(content) {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function latestUserText(messages) {
	const message = [...messages].reverse().find((candidate) => candidate.role === "user");
	return message ? textFromUserContent(message.content) : "";
}

function createBarrier(parties, timeoutMs = 2_000) {
	const arrivals = new Set();
	let release;
	const released = new Promise((resolve) => {
		release = resolve;
	});
	return {
		get size() {
			return arrivals.size;
		},
		async arrive(label) {
			assert.equal(arrivals.has(label), false, `duplicate barrier arrival: ${label}`);
			arrivals.add(label);
			if (arrivals.size === parties) release();
			let timer;
			try {
				await Promise.race([
					released,
					new Promise((_, reject) => {
						timer = setTimeout(
							() => reject(new Error(`timed out waiting for Phase 2 overlap: ${[...arrivals].join(", ")}`)),
							timeoutMs,
						);
					}),
				]);
			} finally {
				if (timer) clearTimeout(timer);
			}
		},
	};
}

function childSpec(complexity) {
	return {
		name: `${complexity}-child`,
		role: `Handle the dynamically assigned ${complexity} Phase 2 validation slice`,
		objective: `${complexity}-objective`,
		modelPolicy: "auto",
		complexity,
		thinkingLevel: "off",
		tools: ["read"],
	};
}

test("Phase 2 routes concurrent isolated children, contains sibling failure, and reuses retained context", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-phase2-"));
	const { codingAgent, piAi } = await importInstalledPackages();
	const providerId = "phase2-subscription";
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

	const childModelRuntime = new ChildModelRuntimeAdapter({
		createRuntime: () => codingAgent.ModelRuntime.create({
			credentials: new piAi.InMemoryCredentialStore(),
			modelsPath: null,
			allowModelNetwork: false,
		}),
	});
	let nonce = 0;
	const manager = new SubAgentManager({
		cwd: root,
		generation: createSessionGeneration("phase2-integration"),
		nonce: () => `phase2-${++nonce}`,
		cleanupTimeoutMs: 1_000,
		modelRuntime: childModelRuntime,
	});
	const runner = new SubAgentAssignmentRunner(manager);
	const router = new SubAgentModelRouter(childModelRuntime);
	const parentModel = { provider: providerId, id: SUB_AGENT_TIER_MODEL_IDS.complex };
	const barrier = createBarrier(3);
	const capturedPrompts = new Map();
	let activeResponses = 0;
	let maximumConcurrentResponses = 0;
	let reusedContext = false;

	const initialResponse = async (context) => {
		const objective = latestUserText(context.messages);
		capturedPrompts.set(objective, context.systemPrompt);
		activeResponses += 1;
		maximumConcurrentResponses = Math.max(maximumConcurrentResponses, activeResponses);
		try {
			await barrier.arrive(objective);
		} finally {
			activeResponses -= 1;
		}
		if (objective === "moderate-objective") {
			return piAi.fauxAssistantMessage([], {
				stopReason: "error",
				errorMessage: "synthetic isolated Phase 2 failure",
			});
		}
		return piAi.fauxAssistantMessage(`${objective} complete`);
	};
	faux.setResponses([
		initialResponse,
		initialResponse,
		initialResponse,
		(context) => {
			reusedContext = context.messages.some(
				(message) =>
					message.role === "assistant" &&
					message.content.some(
						(part) => part.type === "text" && part.text === "simple-objective complete",
					),
			);
			return piAi.fauxAssistantMessage("simple follow-up complete");
		},
	]);

	try {
		const complexities = ["simple", "moderate", "complex"];
		const launches = await Promise.all(
			complexities.map((complexity) =>
				runner.createAndLaunch(childSpec(complexity), ({ spec }) =>
					router.resolve({ hostRegistry, parentModel, spec }),
				),
			),
		);
		assert.equal(new Set(launches.map((launch) => launch.id)).size, 3);
		assert.equal(manager.getSummary().counts.running, 3);
		assert.equal(runner.liveRuntimeCount, 3);

		const settled = await Promise.all(
			launches.map((launch) => runner.waitForAssignment(launch.id, launch.assignmentId)),
		);
		assert.equal(barrier.size, 3);
		assert.equal(maximumConcurrentResponses, 3);
		assert.deepEqual(settled.map((snapshot) => snapshot.state), ["idle", "failed", "idle"]);
		assert.deepEqual(
			settled.map((snapshot) => snapshot.modelRoute.selectedModel.id),
			[
				SUB_AGENT_TIER_MODEL_IDS.simple,
				SUB_AGENT_TIER_MODEL_IDS.moderate,
				SUB_AGENT_TIER_MODEL_IDS.complex,
			],
		);
		assert.deepEqual(
			settled.map((snapshot) => snapshot.currentAssignment.modelRoute.requestedComplexity),
			complexities,
		);
		assert.equal(capturedPrompts.size, 3);
		assert.equal(new Set(capturedPrompts.values()).size, 3);
		for (const complexity of complexities) {
			const prompt = capturedPrompts.get(`${complexity}-objective`);
			assert.match(prompt, new RegExp(`${complexity}-child`));
			assert.match(prompt, new RegExp(`${complexity}-objective`));
		}

		const simpleLaunch = launches[0];
		const followUp = await runner.prompt(simpleLaunch.id, "simple-follow-up");
		const reused = await runner.waitForAssignment(simpleLaunch.id, followUp.assignmentId);
		assert.equal(reused.state, "idle");
		assert.equal(reused.assignmentCount, 2);
		assert.equal(reusedContext, true);
		assert.equal(reused.modelRoute.selectedModel.id, SUB_AGENT_TIER_MODEL_IDS.simple);
		assert.equal(reused.currentAssignment.modelRoute.selectedModel.id, SUB_AGENT_TIER_MODEL_IDS.simple);
		assert.equal(manager.getAgent(launches[1].id).state, "failed");
	} finally {
		await manager.disposeAll("Phase 2 integration test complete");
		await rm(root, { recursive: true, force: true });
	}
	assert.equal(runner.liveRuntimeCount, 0);
});
