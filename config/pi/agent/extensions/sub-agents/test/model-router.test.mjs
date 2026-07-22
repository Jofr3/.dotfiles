import assert from "node:assert/strict";
import test from "node:test";
import { importInstalledPackages, importSubAgentsModule } from "./installed-packages.mjs";

const {
	ChildModelRuntimeAdapter,
	SUB_AGENT_TIER_MODEL_IDS,
} = await importSubAgentsModule("model-runtime.ts");
const {
	SUB_AGENT_MODEL_ROUTING_PROMPT_GUIDELINES,
	SUB_AGENT_TIER_FALLBACKS,
	SubAgentModelRouter,
} = await importSubAgentsModule("model-router.ts");

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

async function createOfflineRuntime(codingAgent, piAi) {
	return codingAgent.ModelRuntime.create({
		credentials: new piAi.InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
}

async function createRouterFixture(label, providers) {
	const { codingAgent, piAi } = await importInstalledPackages();
	const hostRuntime = await createOfflineRuntime(codingAgent, piAi);
	const registry = new codingAgent.ModelRegistry(hostRuntime);
	for (const provider of providers) {
		const faux = piAi.fauxProvider({
			provider: provider.id,
			models: provider.models.map(modelDefinition),
		});
		registry.registerProvider(faux.provider);
	}
	const adapter = new ChildModelRuntimeAdapter({
		createRuntime: () => createOfflineRuntime(codingAgent, piAi),
	});
	return {
		registry,
		adapter,
		router: new SubAgentModelRouter(adapter),
		parentModel(id, provider = providers[0]?.id) {
			return provider ? { provider, id } : undefined;
		},
		async dispose() {
			await adapter.dispose();
		},
	};
}

function routeRequest(fixture, spec, parentModel) {
	return { hostRegistry: fixture.registry, spec, parentModel };
}

function pathSummary(route) {
	return route.fallbackPath.map((step) => ({
		source: step.source,
		complexity: step.complexity,
		modelId: step.modelId,
		outcome: step.outcome,
	}));
}

test("auto, inherit, and explicit policies produce deterministic bounded route metadata", async () => {
	const provider = "route-primary";
	const fixture = await createRouterFixture("policies", [
		{
			id: provider,
			models: [
				SUB_AGENT_TIER_MODEL_IDS.simple,
				SUB_AGENT_TIER_MODEL_IDS.moderate,
				SUB_AGENT_TIER_MODEL_IDS.complex,
				"parent-v1",
			],
		},
	]);
	try {
		const parentModel = fixture.parentModel("parent-v1", provider);
		const defaultRoute = await fixture.router.resolve(
			routeRequest(fixture, {}, parentModel),
		);
		assert.deepEqual(defaultRoute.ref, {
			provider,
			id: SUB_AGENT_TIER_MODEL_IDS.moderate,
		});
		assert.equal(defaultRoute.route.requestedPolicy, "auto");
		assert.equal(defaultRoute.route.requestedComplexity, "moderate");
		assert.equal(defaultRoute.route.selectedTier, "moderate");
		assert.equal(defaultRoute.route.fallbackUsed, false);
		assert.deepEqual(pathSummary(defaultRoute.route), [
			{
				source: "tier",
				complexity: "moderate",
				modelId: SUB_AGENT_TIER_MODEL_IDS.moderate,
				outcome: "selected",
			},
		]);

		for (const [complexity, modelId] of Object.entries(SUB_AGENT_TIER_MODEL_IDS)) {
			const selected = await fixture.router.resolve(
				routeRequest(fixture, { modelPolicy: "auto", complexity }, parentModel),
			);
			assert.equal(selected.ref.id, modelId);
			assert.equal(selected.route.selectedTier, complexity);
		}

		const inherited = await fixture.router.resolve(
			routeRequest(fixture, { modelPolicy: "inherit", complexity: "complex" }, parentModel),
		);
		assert.equal(inherited.ref.id, "parent-v1");
		assert.equal(inherited.route.requestedPolicy, "inherit");
		assert.equal(inherited.route.selectedTier, undefined);
		assert.deepEqual(pathSummary(inherited.route), [
			{
				source: "inherit",
				complexity: undefined,
				modelId: "parent-v1",
				outcome: "selected",
			},
		]);

		const explicit = await fixture.router.resolve(
			routeRequest(
				fixture,
				{
					modelPolicy: "explicit",
					model: { provider, id: SUB_AGENT_TIER_MODEL_IDS.simple },
					complexity: "complex",
				},
				parentModel,
			),
		);
		assert.equal(explicit.ref.id, SUB_AGENT_TIER_MODEL_IDS.simple);
		assert.equal(explicit.route.requestedPolicy, "explicit");
		assert.equal(explicit.route.requestedComplexity, "complex");
		assert.equal(explicit.route.fallbackUsed, false);
		assert.match(explicit.route.reason, /Explicit model override/);
		assert.equal(Object.isFrozen(explicit.route), true);
		assert.equal(Object.isFrozen(explicit.route.fallbackPath), true);
		assert.equal(Object.isFrozen(explicit.route.selectedModel), true);
	} finally {
		await fixture.dispose();
	}

	assert.deepEqual(SUB_AGENT_TIER_FALLBACKS, {
		simple: ["simple", "moderate", "complex"],
		moderate: ["moderate", "complex", "simple"],
		complex: ["complex", "moderate"],
	});
	assert.equal(SUB_AGENT_MODEL_ROUTING_PROMPT_GUIDELINES.length, 3);
	assert.ok(SUB_AGENT_MODEL_ROUTING_PROMPT_GUIDELINES.every((line) => line.includes("sub_agents_spawn")));
});

test("automatic routing follows the exact simple, moderate, and complex fallback orders", async () => {
	const simple = await createRouterFixture("simple-fallback", [
		{ id: "simple-fallback", models: [SUB_AGENT_TIER_MODEL_IDS.moderate, "parent-v1"] },
	]);
	try {
		const selected = await simple.router.resolve(
			routeRequest(simple, { modelPolicy: "auto", complexity: "simple" }, simple.parentModel("parent-v1")),
		);
		assert.equal(selected.ref.id, SUB_AGENT_TIER_MODEL_IDS.moderate);
		assert.deepEqual(
			pathSummary(selected.route).map((step) => [step.complexity, step.outcome]),
			[["simple", "unavailable"], ["moderate", "selected"]],
		);
		assert.equal(selected.route.fallbackUsed, true);
	} finally {
		await simple.dispose();
	}

	const moderate = await createRouterFixture("moderate-fallback", [
		{ id: "moderate-fallback", models: [SUB_AGENT_TIER_MODEL_IDS.simple, "parent-v1"] },
	]);
	try {
		const selected = await moderate.router.resolve(
			routeRequest(
				moderate,
				{ modelPolicy: "auto", complexity: "moderate" },
				moderate.parentModel("parent-v1"),
			),
		);
		assert.equal(selected.ref.id, SUB_AGENT_TIER_MODEL_IDS.simple);
		assert.deepEqual(
			pathSummary(selected.route).map((step) => [step.complexity, step.outcome]),
			[["moderate", "unavailable"], ["complex", "unavailable"], ["simple", "selected"]],
		);
	} finally {
		await moderate.dispose();
	}

	const complex = await createRouterFixture("complex-fallback", [
		{ id: "complex-fallback", models: [SUB_AGENT_TIER_MODEL_IDS.simple, "parent-v1"] },
	]);
	try {
		const selected = await complex.router.resolve(
			routeRequest(
				complex,
				{ modelPolicy: "auto", complexity: "complex" },
				complex.parentModel("parent-v1"),
			),
		);
		assert.equal(selected.ref.id, "parent-v1");
		assert.deepEqual(pathSummary(selected.route), [
			{
				source: "tier",
				complexity: "complex",
				modelId: SUB_AGENT_TIER_MODEL_IDS.complex,
				outcome: "unavailable",
			},
			{
				source: "tier",
				complexity: "moderate",
				modelId: SUB_AGENT_TIER_MODEL_IDS.moderate,
				outcome: "unavailable",
			},
			{
				source: "inherit",
				complexity: undefined,
				modelId: "parent-v1",
				outcome: "selected",
			},
		]);
		assert.equal(selected.route.fallbackPath.some((step) => step.complexity === "simple"), false);
	} finally {
		await complex.dispose();
	}
});

test("ambiguous preferred tiers and unavailable routes fail closed instead of silently downgrading", async () => {
	const ambiguous = await createRouterFixture("ambiguous", [
		{
			id: "ambiguous-a",
			models: [SUB_AGENT_TIER_MODEL_IDS.simple, SUB_AGENT_TIER_MODEL_IDS.moderate],
		},
		{ id: "ambiguous-b", models: [SUB_AGENT_TIER_MODEL_IDS.simple] },
	]);
	try {
		await assert.rejects(
			ambiguous.router.resolve(
				routeRequest(ambiguous, { modelPolicy: "auto", complexity: "simple" }, undefined),
			),
			(error) => {
				assert.equal(error.name, "ChildModelRuntimeError");
				assert.equal(error.code, "model_ambiguous");
				assert.deepEqual(error.candidates, [
					{ provider: "ambiguous-a", id: SUB_AGENT_TIER_MODEL_IDS.simple },
					{ provider: "ambiguous-b", id: SUB_AGENT_TIER_MODEL_IDS.simple },
				]);
				return true;
			},
		);
	} finally {
		await ambiguous.dispose();
	}

	const missing = await createRouterFixture("missing", [
		{ id: "missing-provider", models: ["unrelated-v1"] },
	]);
	try {
		await assert.rejects(
			missing.router.resolve(
				routeRequest(missing, { modelPolicy: "auto", complexity: "complex" }, undefined),
			),
			(error) => {
				assert.equal(error.name, "ChildModelRuntimeError");
				assert.equal(error.code, "model_unavailable");
				assert.match(error.message, /gpt-5\.6-sol, gpt-5\.6-terra/);
				assert.doesNotMatch(error.message, /gpt-5\.6-luna/);
				return true;
			},
		);
		await assert.rejects(
			missing.router.resolve(
				routeRequest(missing, { modelPolicy: "explicit" }, undefined),
			),
			(error) => error?.name === "ChildModelRuntimeError" && error.code === "invalid_model_reference",
		);
		await assert.rejects(
			missing.router.resolve(
				routeRequest(
					missing,
					{ modelPolicy: "inherit", model: { provider: "missing-provider", id: "unrelated-v1" } },
					undefined,
				),
			),
			(error) => error?.name === "ChildModelRuntimeError" && error.code === "invalid_model_reference",
		);
	} finally {
		await missing.dispose();
	}
});
