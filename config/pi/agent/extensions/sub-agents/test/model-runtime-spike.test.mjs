import assert from "node:assert/strict";
import test from "node:test";
import { importInstalledPackages } from "./installed-packages.mjs";

const TIER_IDS = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"];
const PRIVATE_CONFIG_MARKER = "private-provider-config-marker";
const PRIVATE_OAUTH_CONFIG_MARKER = "Private Offline OAuth Fixture";

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

class SafeModelError extends Error {
	constructor(code, message) {
		super(message);
		this.name = "SafeModelError";
		this.code = code;
	}
}

function normalizeDisplayName(value) {
	return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function requireAvailableModel(runtime, provider, modelId) {
	const model = runtime.getModel(provider, modelId);
	if (!model) throw new SafeModelError("missing_model", `Model not found: ${provider}/${modelId}`);
	const available = await runtime.getAvailable(provider);
	if (!available.some((candidate) => candidate.id === modelId)) {
		throw new SafeModelError("model_unavailable", `Model is unavailable: ${provider}/${modelId}`);
	}
	return model;
}

function resolveCanonicalModel(models, requestedId, preferredProvider) {
	const exact = models.filter((model) => model.id === requestedId);
	if (preferredProvider) {
		const preferred = exact.find((model) => model.provider === preferredProvider);
		if (preferred) return preferred;
	}
	if (exact.length === 1) return exact[0];
	if (exact.length > 1) {
		const candidates = exact.map((model) => `${model.provider}/${model.id}`).sort().join(", ");
		throw new SafeModelError("ambiguous_model", `Model id is ambiguous; specify a provider. Candidates: ${candidates}`);
	}

	const normalized = normalizeDisplayName(requestedId);
	const displayMatches = models.filter((model) => normalizeDisplayName(model.name) === normalized);
	if (displayMatches.length > 0) {
		const candidates = displayMatches
			.map((model) => `${model.provider}/${model.id}`)
			.sort()
			.join(", ");
		throw new SafeModelError(
			"exact_id_required",
			`No exact model id matched. Display-name matches are diagnostic only: ${candidates}`,
		);
	}
	throw new SafeModelError("missing_model", `Model not found: ${requestedId}`);
}

function guardRegistrySurface(registry) {
	const allowed = new Set([
		"getRegisteredProviderConfig",
		"getRegisteredNativeProvider",
		"getRegisteredProviderIds",
	]);
	return new Proxy(registry, {
		get(target, property) {
			assert.equal(typeof property, "string", "The mirror must use named public ModelRegistry methods");
			assert.ok(allowed.has(property), `The mirror accessed an unsupported ModelRegistry member: ${property}`);
			return target[property].bind(target);
		},
	});
}

class LazyModelRuntimeMirror {
	#createRuntime;
	#runtimePromise;
	#syncTail = Promise.resolve();
	#mirroredProviderIds = new Set();

	constructor(createRuntime) {
		this.#createRuntime = createRuntime;
	}

	#getRuntime() {
		this.#runtimePromise ??= Promise.resolve().then(() => this.#createRuntime());
		return this.#runtimePromise;
	}

	synchronize(hostRegistry) {
		const operation = this.#syncTail.then(async () => {
			const runtime = await this.#getRuntime();
			const nextProviderIds = new Set(hostRegistry.getRegisteredProviderIds());

			for (const providerId of this.#mirroredProviderIds) {
				if (!nextProviderIds.has(providerId)) runtime.unregisterProvider(providerId);
			}

			for (const providerId of [...nextProviderIds].sort()) {
				const nativeProvider = hostRegistry.getRegisteredNativeProvider(providerId);
				const providerConfig = hostRegistry.getRegisteredProviderConfig(providerId);
				if (Boolean(nativeProvider) === Boolean(providerConfig)) {
					runtime.unregisterProvider(providerId);
					throw new SafeModelError("provider_mirror_failed", `Could not mirror provider: ${providerId}`);
				}

				// Reset first because ModelRuntime's legacy registration API intentionally
				// merges updates. A mirror needs the host's current effective registration,
				// including removal of fields that existed in an older snapshot.
				runtime.unregisterProvider(providerId);
				try {
					if (nativeProvider) runtime.registerNativeProvider(nativeProvider);
					else runtime.registerProvider(providerId, providerConfig);
				} catch {
					throw new SafeModelError("provider_mirror_failed", `Could not mirror provider: ${providerId}`);
				}
			}

			this.#mirroredProviderIds = nextProviderIds;
			return runtime;
		});
		this.#syncTail = operation.catch(() => {});
		return operation;
	}

	async snapshot() {
		const runtime = await this.#getRuntime();
		return {
			providers: [...this.#mirroredProviderIds].sort(),
			models: runtime
				.getModels()
				.filter((model) => this.#mirroredProviderIds.has(model.provider))
				.map((model) => ({ provider: model.provider, id: model.id }))
				.sort((a, b) => `${a.provider}/${a.id}`.localeCompare(`${b.provider}/${b.id}`)),
		};
	}
}

test("public ModelRegistry registrations can be mirrored into one lazy child ModelRuntime", async () => {
	const { codingAgent, piAi } = await importInstalledPackages();
	const { ModelRegistry, ModelRuntime } = codingAgent;
	const { InMemoryCredentialStore, fauxProvider } = piAi;

	const runtimeOptions = () => ({
		credentials: new InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	const hostRuntime = await ModelRuntime.create(runtimeOptions());
	const hostRegistry = new ModelRegistry(hostRuntime);

	const tierProvider = fauxProvider({
		provider: "subscription-fixture",
		models: TIER_IDS.map((id) => modelDefinition(id, `Fixture ${id}`)),
	});
	hostRegistry.registerProvider(tierProvider.provider);

	const configuredProvider = {
		baseUrl: "https://model-runtime-spike.invalid/v1",
		api: "openai-completions",
		headers: { "x-internal-fixture": PRIVATE_CONFIG_MARKER },
		models: [modelDefinition("configured-v1", "Shared Display Name")],
	};
	hostRegistry.registerProvider("configured-fixture", configuredProvider);

	const oauthCalls = { login: 0, refresh: 0, getApiKey: 0 };
	const oauthProvider = {
		baseUrl: "https://oauth-model-runtime-spike.invalid/v1",
		api: "openai-responses",
		models: [modelDefinition("oauth-v1", "Shared Display Name")],
		oauth: {
			name: PRIVATE_OAUTH_CONFIG_MARKER,
			async login() {
				oauthCalls.login += 1;
				throw new Error("OAuth login must not run in this offline spike");
			},
			async refreshToken() {
				oauthCalls.refresh += 1;
				throw new Error("OAuth refresh must not run in this offline spike");
			},
			getApiKey() {
				oauthCalls.getApiKey += 1;
				throw new Error("OAuth credential conversion must not run in this offline spike");
			},
		},
	};
	hostRegistry.registerProvider("oauth-fixture", oauthProvider);

	let runtimeCreations = 0;
	const mirror = new LazyModelRuntimeMirror(async () => {
		runtimeCreations += 1;
		return ModelRuntime.create(runtimeOptions());
	});
	assert.equal(runtimeCreations, 0, "The child runtime must be lazy");

	const publicHostRegistry = guardRegistrySurface(hostRegistry);
	const [childRuntimeA, childRuntimeB] = await Promise.all([
		mirror.synchronize(publicHostRegistry),
		mirror.synchronize(publicHostRegistry),
	]);
	assert.strictEqual(childRuntimeA, childRuntimeB);
	assert.equal(runtimeCreations, 1, "Concurrent synchronization must create one shared child runtime");

	assert.strictEqual(childRuntimeA.getRegisteredNativeProvider("subscription-fixture"), tierProvider.provider);
	assert.strictEqual(childRuntimeA.getProvider("subscription-fixture"), tierProvider.provider);
	const availableFixtureTiers = await childRuntimeA.getAvailable("subscription-fixture");
	for (const tierId of TIER_IDS) {
		const inherited = childRuntimeA.getModel("subscription-fixture", tierId);
		assert.equal(inherited?.provider, "subscription-fixture");
		assert.equal(inherited?.id, tierId);
		const routed = resolveCanonicalModel(availableFixtureTiers, tierId, "subscription-fixture");
		assert.strictEqual(routed, inherited, `Preferred-provider routing must resolve ${tierId} by canonical id`);
	}

	const mirroredConfig = childRuntimeA.getRegisteredProviderConfig("configured-fixture");
	assert.ok(mirroredConfig);
	assert.equal(mirroredConfig.headers["x-internal-fixture"], PRIVATE_CONFIG_MARKER);
	assert.equal(childRuntimeA.getModel("configured-fixture", "configured-v1")?.name, "Shared Display Name");
	assert.deepEqual(await childRuntimeA.getAvailable("configured-fixture"), [], "Missing auth must fail closed");
	await assert.rejects(
		requireAvailableModel(childRuntimeA, "configured-fixture", "configured-v1"),
		(error) =>
			error instanceof SafeModelError &&
			error.code === "model_unavailable" &&
			!error.message.includes(PRIVATE_CONFIG_MARKER) &&
			!error.message.includes("model-runtime-spike.invalid"),
		"Missing-auth diagnostics must contain model identity only, never provider configuration",
	);

	const mirroredOAuth = childRuntimeA.getRegisteredProviderConfig("oauth-fixture");
	assert.ok(mirroredOAuth);
	assert.strictEqual(mirroredOAuth.oauth.login, oauthProvider.oauth.login);
	assert.strictEqual(mirroredOAuth.oauth.refreshToken, oauthProvider.oauth.refreshToken);
	assert.strictEqual(mirroredOAuth.oauth.getApiKey, oauthProvider.oauth.getApiKey);
	assert.deepEqual(await childRuntimeA.getAvailable("oauth-fixture"), []);
	assert.deepEqual(oauthCalls, { login: 0, refresh: 0, getApiKey: 0 });

	assert.throws(
		() => resolveCanonicalModel(childRuntimeA.getModels(), "Shared Display Name"),
		(error) =>
			error instanceof SafeModelError &&
			error.code === "exact_id_required" &&
			error.message.includes("configured-fixture/configured-v1") &&
			error.message.includes("oauth-fixture/oauth-v1"),
		"Ambiguous display names must remain diagnostic and never select a model",
	);
	assert.throws(
		() => resolveCanonicalModel(childRuntimeA.getModels(), "does-not-exist"),
		(error) => error instanceof SafeModelError && error.code === "missing_model",
	);

	// Installed built-in metadata proves the tier IDs are shared by several
	// providers. Automatic routing therefore needs an inherited/preferred
	// provider or must fail ambiguity instead of hardcoding one provider.
	for (const tierId of TIER_IDS) {
		const builtInCandidates = childRuntimeA
			.getModels()
			.filter((model) => model.id === tierId && model.provider !== "subscription-fixture");
		assert.ok(builtInCandidates.some((model) => model.provider === "openai"));
		assert.ok(builtInCandidates.some((model) => model.provider === "openai-codex"));
		assert.throws(
			() => resolveCanonicalModel(builtInCandidates, tierId),
			(error) => error instanceof SafeModelError && error.code === "ambiguous_model",
		);
	}

	const snapshotText = JSON.stringify(await mirror.snapshot());
	assert.ok(!snapshotText.includes(PRIVATE_CONFIG_MARKER));
	assert.ok(!snapshotText.includes("baseUrl"));
	assert.ok(!snapshotText.includes("headers"));
	assert.ok(!snapshotText.includes(PRIVATE_OAUTH_CONFIG_MARKER));

	// Re-sync on each spawn/control boundary is the supported update strategy:
	// there is no provider-registration event on ExtensionContext. Resetting the
	// child registration avoids stale fields from ModelRuntime's merge semantics.
	hostRegistry.registerProvider("configured-fixture", {
		baseUrl: "https://model-runtime-spike-v2.invalid/v1",
		api: "openai-completions",
		models: [modelDefinition("configured-v2", "Configured Version Two")],
	});
	await mirror.synchronize(publicHostRegistry);
	assert.equal(childRuntimeA.getModel("configured-fixture", "configured-v1"), undefined);
	assert.equal(childRuntimeA.getModel("configured-fixture", "configured-v2")?.id, "configured-v2");
	assert.equal(
		childRuntimeA.getRegisteredProviderConfig("configured-fixture").headers["x-internal-fixture"],
		PRIVATE_CONFIG_MARKER,
		"The host's effective merged registration remains mirrored in memory",
	);

	hostRegistry.unregisterProvider("configured-fixture");
	await mirror.synchronize(publicHostRegistry);
	assert.equal(childRuntimeA.getRegisteredProviderConfig("configured-fixture"), undefined);
	assert.equal(childRuntimeA.getModel("configured-fixture", "configured-v2"), undefined);

	const finalSnapshot = JSON.stringify(await mirror.snapshot());
	assert.ok(!finalSnapshot.includes(PRIVATE_CONFIG_MARKER));
	assert.deepEqual(oauthCalls, { login: 0, refresh: 0, getApiKey: 0 });
});
