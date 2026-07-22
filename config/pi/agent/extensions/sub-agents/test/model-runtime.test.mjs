import assert from "node:assert/strict";
import test from "node:test";
import { importInstalledPackages, importSubAgentsModule } from "./installed-packages.mjs";

const {
	ChildModelRuntimeAdapter,
	ChildModelRuntimeError,
	SUB_AGENT_TIER_MODEL_IDS,
} = await importSubAgentsModule("model-runtime.ts");

const PRIVATE_CONFIG_MARKER = "offline-private-provider-marker";

function modelDefinition(id, name = id) {
	return {
		id,
		name,
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

async function createHost(codingAgent, piAi) {
	const runtime = await createOfflineRuntime(codingAgent, piAi);
	return { runtime, registry: new codingAgent.ModelRegistry(runtime) };
}

function assertSafeError(error, code) {
	assert.ok(error instanceof ChildModelRuntimeError);
	assert.equal(error.code, code);
	assert.ok(!error.message.includes(PRIVATE_CONFIG_MARKER));
	assert.ok(!error.message.includes("private-runtime-failure"));
	assert.ok(!error.message.includes("model-runtime-production-test.invalid"));
	return true;
}

test("the production adapter lazily mirrors current host registrations and disposes after child cleanup", async () => {
	const { codingAgent, piAi } = await importInstalledPackages();
	const host = await createHost(codingAgent, piAi);
	const native = piAi.fauxProvider({
		provider: "native-fixture",
		models: [modelDefinition("native-v1")],
	});
	host.registry.registerProvider(native.provider);
	host.registry.registerProvider("configured-fixture", {
		baseUrl: "https://model-runtime-production-test.invalid/v1",
		apiKey: "offline-placeholder",
		api: "openai-completions",
		headers: { "x-offline-private": PRIVATE_CONFIG_MARKER },
		models: [modelDefinition("configured-v1")],
	});

	let creations = 0;
	const adapter = new ChildModelRuntimeAdapter({
		createRuntime: async () => {
			creations += 1;
			return createOfflineRuntime(codingAgent, piAi);
		},
	});
	assert.equal(adapter.initialized, false);
	assert.deepEqual(adapter.getSnapshot(), {
		initialized: false,
		closed: false,
		mirroredProviders: [],
		mirroredModels: [],
	});

	const [childA, childB] = await Promise.all([
		adapter.synchronize(host.registry),
		adapter.synchronize(host.registry),
	]);
	assert.strictEqual(childA, childB);
	assert.equal(creations, 1);
	assert.strictEqual(childA.getRegisteredNativeProvider("native-fixture"), native.provider);
	assert.equal(childA.getModel("configured-fixture", "configured-v1")?.id, "configured-v1");
	assert.deepEqual(adapter.getSnapshot(), {
		initialized: true,
		closed: false,
		mirroredProviders: ["configured-fixture", "native-fixture"],
		mirroredModels: [
			{ provider: "configured-fixture", id: "configured-v1" },
			{ provider: "native-fixture", id: "native-v1" },
		],
	});
	assert.ok(!JSON.stringify(adapter.getSnapshot()).includes(PRIVATE_CONFIG_MARKER));

	// Host legacy registrations merge by design. Reset-before-register in the
	// child removes the old model while preserving the host's current effective
	// non-model configuration only inside ModelRuntime.
	host.registry.registerProvider("configured-fixture", {
		baseUrl: "https://model-runtime-production-test-v2.invalid/v1",
		api: "openai-completions",
		models: [modelDefinition("configured-v2")],
	});
	await adapter.synchronize(host.registry);
	assert.equal(childA.getModel("configured-fixture", "configured-v1"), undefined);
	assert.equal(childA.getModel("configured-fixture", "configured-v2")?.id, "configured-v2");

	host.registry.unregisterProvider("configured-fixture");
	await adapter.synchronize(host.registry);
	assert.equal(childA.getRegisteredProviderConfig("configured-fixture"), undefined);
	assert.equal(childA.getModel("configured-fixture", "configured-v2"), undefined);

	await adapter.dispose();
	await adapter.dispose();
	assert.equal(adapter.closed, true);
	assert.equal(adapter.initialized, false);
	assert.equal(childA.getRegisteredNativeProvider("native-fixture"), undefined);
	assert.deepEqual(adapter.getSnapshot().mirroredProviders, []);
	await assert.rejects(adapter.synchronize(host.registry), (error) => assertSafeError(error, "runtime_closed"));
});

test("explicit, inherited, and canonical tier resolution require available exact model identities", async () => {
	const { codingAgent, piAi } = await importInstalledPackages();
	const host = await createHost(codingAgent, piAi);
	const primary = piAi.fauxProvider({
		provider: "subscription-primary",
		models: [
			modelDefinition(SUB_AGENT_TIER_MODEL_IDS.simple, "Luna Diagnostic Name"),
			modelDefinition(SUB_AGENT_TIER_MODEL_IDS.moderate),
			modelDefinition(SUB_AGENT_TIER_MODEL_IDS.complex),
			modelDefinition("diagnostic-id", "Diagnostic Display Name"),
		],
	});
	const alternate = piAi.fauxProvider({
		provider: "subscription-alternate",
		models: [modelDefinition(SUB_AGENT_TIER_MODEL_IDS.simple)],
	});
	host.registry.registerProvider(primary.provider);
	host.registry.registerProvider(alternate.provider);
	host.registry.registerProvider("unavailable-fixture", {
		baseUrl: "https://model-runtime-production-test.invalid/v1",
		api: "openai-completions",
		headers: { "x-offline-private": PRIVATE_CONFIG_MARKER },
		models: [modelDefinition("unavailable-v1")],
	});

	const adapter = new ChildModelRuntimeAdapter({
		createRuntime: () => createOfflineRuntime(codingAgent, piAi),
	});
	const explicit = await adapter.resolveExplicit(host.registry, {
		provider: "subscription-primary",
		id: SUB_AGENT_TIER_MODEL_IDS.moderate,
	});
	assert.deepEqual(explicit.ref, {
		provider: "subscription-primary",
		id: "gpt-5.6-terra",
	});

	const inherited = await adapter.resolveInherited(host.registry, {
		provider: "subscription-primary",
		id: SUB_AGENT_TIER_MODEL_IDS.complex,
	});
	assert.equal(inherited.model.id, "gpt-5.6-sol");
	await assert.rejects(adapter.resolveInherited(host.registry, undefined), (error) =>
		assertSafeError(error, "missing_inherited_model"),
	);

	const preferredSimple = await adapter.resolveTierModel(host.registry, "simple", "subscription-alternate");
	assert.equal(preferredSimple.model.provider, "subscription-alternate");
	const uniqueComplex = await adapter.resolveTierModel(host.registry, "complex");
	assert.equal(uniqueComplex.model.provider, "subscription-primary");
	await assert.rejects(adapter.resolveTierModel(host.registry, "simple"), (error) => {
		assertSafeError(error, "model_ambiguous");
		assert.deepEqual(error.candidates, [
			{ provider: "subscription-alternate", id: "gpt-5.6-luna" },
			{ provider: "subscription-primary", id: "gpt-5.6-luna" },
		]);
		return true;
	});

	await assert.rejects(
		adapter.resolveCanonicalModel(host.registry, "Diagnostic Display Name"),
		(error) => assertSafeError(error, "exact_model_id_required"),
	);
	await assert.rejects(
		adapter.resolveExplicit(host.registry, { provider: "unavailable-fixture", id: "unavailable-v1" }),
		(error) => assertSafeError(error, "model_unavailable"),
	);
	await assert.rejects(
		adapter.resolveExplicit(host.registry, { provider: "subscription-primary", id: "missing" }),
		(error) => assertSafeError(error, "missing_model"),
	);
	await assert.rejects(
		adapter.resolveCanonicalModel(host.registry, "missing"),
		(error) => assertSafeError(error, "missing_model"),
	);

	await adapter.dispose();
});

test("runtime initialization failures are bounded, nonsecret, and retryable", async () => {
	const { codingAgent, piAi } = await importInstalledPackages();
	const host = await createHost(codingAgent, piAi);
	let attempts = 0;
	const adapter = new ChildModelRuntimeAdapter({
		createRuntime: async () => {
			attempts += 1;
			if (attempts === 1) throw new Error("private-runtime-failure");
			return createOfflineRuntime(codingAgent, piAi);
		},
	});

	await assert.rejects(adapter.synchronize(host.registry), (error) =>
		assertSafeError(error, "runtime_initialization_failed"),
	);
	assert.equal(adapter.initialized, false);
	const runtime = await adapter.synchronize(host.registry);
	assert.ok(runtime);
	assert.equal(attempts, 2);
	await adapter.dispose();
});
