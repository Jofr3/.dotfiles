import assert from "node:assert/strict";
import test from "node:test";
import {
	ConfigStore,
	createInvocationSnapshot,
	parseConfig,
} from "../../mcp-toolbox/src/config.ts";
import { resolveCredentialMaterial } from "../../mcp-toolbox/src/credentials.ts";
import { ToolboxManager } from "../../mcp-toolbox/src/manager.ts";
import {
	createRequirementInvalidationEvent,
	deriveRequirementId,
	MCP_TOOLBOX_REQUIREMENTS_CHANNEL,
} from "../../mcp-toolbox/src/requirements.ts";
import { discoverRequirements } from "../../mcp-toolbox/src/requirements-tool.ts";
import {
	CredentialResolverError,
	SECRET_RESOLVER_V2_REQUEST_CHANNEL,
	SecretResolverConsumer,
} from "../../mcp-toolbox/src/resolver.ts";
import { DynamicSelectionSession, type DynamicToolContext } from "../src/dynamic.ts";
import { OnePasswordManager } from "../src/manager.ts";
import { RequirementMetadataCache } from "../src/requirements.ts";
import { SecretResolverProvider } from "../src/resolver.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_DESKTOP_ACCOUNT;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;
delete process.env.PI_MCP_TOOLBOX_CONFIG;

const TOKEN = "E2E_SERVICE_ACCOUNT_TOKEN_CANARY";
const SECRET = "E2E_DYNAMIC_SECRET_VALUE_CANARY";
const REFERENCE = "op://vault-e2e/item-e2e/credentials/password-e2e";
const ENDPOINT = "https://e2e-endpoint-canary.example.test";
const VAULT_ID = "vault-e2e";
const ITEM_ID = "item-e2e";
const FIELD_ID = "password-e2e";

class SharedEventBus {
	readonly observed: Array<{ channel: string; data: unknown }> = [];
	#listeners = new Map<string, Set<(data: unknown) => void>>();

	on(channel: string, listener: (data: unknown) => void): () => void {
		const listeners = this.#listeners.get(channel) ?? new Set<(data: unknown) => void>();
		listeners.add(listener);
		this.#listeners.set(channel, listeners);
		return () => { listeners.delete(listener); };
	}

	emit(channel: string, data: unknown): void {
		this.observed.push({ channel, data });
		for (const listener of this.#listeners.get(channel) ?? []) listener(data);
	}
}

function toolboxConfig() {
	return parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{
			id: "production",
			url: ENDPOINT,
			tools: [
				{
					name: "search-hotels",
					confirmation: "not-required",
					boundParams: ["example_database_password"],
				},
				{
					name: "update-hotel",
					confirmation: "not-required",
					boundParams: ["example_database_password"],
				},
			],
			boundParams: {
				example_database_password: {
					resolver: { provider: "onepassword-secrets-manager", dynamic: true },
				},
			},
		}, {
			id: "secondary",
			url: ENDPOINT,
			tools: [{
				name: "search-hotels",
				confirmation: "not-required",
				boundParams: ["example_database_password"],
			}],
			boundParams: {
				example_database_password: {
					resolver: { provider: "onepassword-secrets-manager", dynamic: true },
				},
			},
		}],
	});
}

function fakeVault() {
	return {
		id: VAULT_ID,
		title: "E2E Vault",
		vaultType: "userCreated",
		activeItemCount: 1,
		contentVersion: 1,
		attributeVersion: 1,
		description: SECRET,
		createdAt: SECRET,
		updatedAt: SECRET,
	};
}

function fakeItemOverview() {
	return {
		id: ITEM_ID,
		vaultId: VAULT_ID,
		title: "E2E Database",
		category: "ApiCredentials",
		state: "active",
		createdAt: SECRET,
		updatedAt: SECRET,
		websites: [ENDPOINT],
		tags: [SECRET],
	};
}

function fakeFullItem() {
	return {
		id: ITEM_ID,
		vaultId: VAULT_ID,
		title: "E2E Database",
		category: "ApiCredentials",
		fields: [{
			id: FIELD_ID,
			title: "Primary Password",
			fieldType: "Concealed",
			sectionId: "credentials",
			value: SECRET,
			details: { canary: SECRET },
		}],
		sections: [{ id: "credentials", title: "Credentials" }],
		notes: SECRET,
		websites: [ENDPOINT],
		tags: [SECRET],
		files: [SECRET],
		document: SECRET,
		version: 1,
		createdAt: SECRET,
		updatedAt: SECRET,
	};
}

function assertPublicNoSecret(value: unknown): void {
	const text = JSON.stringify(value);
	for (const canary of [SECRET, REFERENCE, TOKEN, ENDPOINT]) {
		assert.equal(text.includes(canary), false, `public metadata leaked ${canary}`);
	}
}

test("actual MCP requirement planner and consumer complete an offline no-manual-slot 1Password one-shot flow", async () => {
	const bus = new SharedEventBus();
	let vaultListCalls = 0;
	let itemListCalls = 0;
	let itemGetCalls = 0;
	let secretResolveCalls = 0;
	const validatedReferences: string[] = [];
	class Secrets {
		static validateSecretReference(reference: string): void { validatedReferences.push(reference); }
	}
	class DesktopAuth { constructor(_account: string) {} }
	const client = {
		secrets: {
			resolve: async (reference: string) => {
				secretResolveCalls += 1;
				assert.equal(reference, REFERENCE);
				return SECRET;
			},
		},
		vaults: {
			list: async (...args: unknown[]) => {
				vaultListCalls += 1;
				assert.deepEqual(args, [], "documented vaults.list call must receive no argument");
				return [fakeVault()];
			},
		},
		items: {
			list: async () => { itemListCalls += 1; return [fakeItemOverview()]; },
			get: async () => { itemGetCalls += 1; return fakeFullItem(); },
		},
	};
	let sdkLoads = 0;
	let clientCreations = 0;
	const manager = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		loadSdk: async () => {
			sdkLoads += 1;
			return {
				default: {
					Secrets,
					DesktopAuth,
					createClient: async () => { clientCreations += 1; return client; },
				},
			};
		},
	});
	const provider = new SecretResolverProvider(manager);
	let dynamic!: DynamicSelectionSession;
	const requirementCache = new RequirementMetadataCache((records) => {
		for (const record of records) provider.revokeDynamicGrant(record.requirementId, record.purpose);
		dynamic.invalidateRequirements(records);
	});
	dynamic = new DynamicSelectionSession(manager, provider, requirementCache);
	provider.start(bus);
	requirementCache.start(bus);
	provider.enableDynamic();
	requirementCache.enable();

	const config = toolboxConfig();
	assert.equal(JSON.stringify(config).includes('"slot"'), false, "dynamic config must not contain a manual slot");
	const store = new ConfigStore(() => ({ config, source: "package" }));
	const searchRequirements = await discoverRequirements(
		store,
		{ server: "production", tool: "search-hotels" },
		{ emit: (event) => bus.emit(MCP_TOOLBOX_REQUIREMENTS_CHANNEL, event) },
	);
	assert.equal(searchRequirements.details.requirements.length, 1);
	assertPublicNoSecret(searchRequirements);
	assert.equal(sdkLoads, 0, "requirements discovery must not load the 1Password SDK");
	assert.equal(clientCreations, 0);
	const requirementId = searchRequirements.details.requirements[0]!.requirementId;
	assert.equal(
		requirementId,
		deriveRequirementId("production", "search-hotels", "bound-param", "example_database_password"),
	);
	assert.equal(requirementCache.lookup(requirementId)?.tool, "search-hotels");

	// An unfrozen spoofed replacement is an admission failure and cannot evict prior exact metadata.
	bus.emit(MCP_TOOLBOX_REQUIREMENTS_CHANNEL, {
		protocol: "pi.mcp-toolbox.requirements/v1",
		action: "replace",
		server: "production",
		tool: "search-hotels",
		requirements: [],
	});
	assert.equal(requirementCache.lookup(requirementId)?.tool, "search-hotels");

	const vaults = await dynamic.listVaults({ limit: 20 });
	const vaultId = JSON.parse(vaults.content[0]!.text).vaults[0].vaultId as string;
	const items = await dynamic.listItems({ vaultId, limit: 20 });
	const itemId = JSON.parse(items.content[0]!.text).items[0].itemId as string;
	const fields = await dynamic.listFields({ vaultId, itemId, limit: 20 });
	const fieldId = JSON.parse(fields.content[0]!.text).fields[0].fieldId as string;
	for (const result of [vaults, items, fields]) {
		assertPublicNoSecret(result);
		const serialized = JSON.stringify(result);
		for (const rawId of [VAULT_ID, ITEM_ID, FIELD_ID, "credentials"]) {
			assert.equal(serialized.includes(rawId), false, rawId);
		}
	}
	assert.deepEqual([vaultListCalls, itemListCalls, itemGetCalls], [1, 1, 1]);
	const confirmations: string[] = [];
	const context: DynamicToolContext = {
		hasUI: true,
		ui: {
			async confirm(_title, message) { confirmations.push(message); return true; },
		},
	};
	const grantInput = { vaultId, itemId, fieldId, requirementId };
	assert.deepEqual(Object.keys(grantInput), ["vaultId", "itemId", "fieldId", "requirementId"]);
	const grant = await dynamic.grantSecret(grantInput, undefined, context);
	assert.equal(grant.details.ok, true);
	assertPublicNoSecret(grant);
	assert.equal(itemGetCalls, 2);
	assert.deepEqual(validatedReferences, [REFERENCE]);
	assert.equal(confirmations.length, 1);
	for (const expected of [
		"production",
		"search-hotels",
		"bound-param",
		"example_database_password",
		"mcp-toolbox.bound-param",
		requirementId,
		"E2E Vault",
		"E2E Database",
		"Primary Password",
	]) assert.equal(confirmations[0]!.includes(expected), true, expected);
	for (const forbidden of [
		SECRET, REFERENCE, TOKEN, ENDPOINT, "Target slot:",
		VAULT_ID, ITEM_ID, FIELD_ID, "credentials",
	]) {
		assert.equal(confirmations[0]!.includes(forbidden), false, forbidden);
	}

	let requestNonce = 0;
	const consumer = new SecretResolverConsumer(bus, {
		maxWaitMs: 100,
		requestId: () => `onepassword-e2e-${String(++requestNonce).padStart(8, "0")}`,
	});
	const searchInvocation = createInvocationSnapshot(config, "production", "search-hotels");
	const updateInvocation = createInvocationSnapshot(config, "production", "update-hotel");
	const secondaryInvocation = createInvocationSnapshot(config, "secondary", "search-hotels");
	const resolve = (invocation: typeof searchInvocation) => resolveCredentialMaterial(
		invocation.server,
		invocation.tool,
		consumer,
		new AbortController().signal,
		Date.now() + 1_000,
	);

	const sameTurn = await Promise.allSettled([resolve(searchInvocation), resolve(searchInvocation)]);
	assert.ok(sameTurn.every((result) => result.status === "rejected" && result.reason instanceof CredentialResolverError));
	assert.equal(provider.status().grantCount, 1, "staged same/parallel-turn attempts must not consume the grant");
	assert.equal(secretResolveCalls, 0);

	provider.armDynamicGrants();
	await assert.rejects(() => resolve(updateInvocation), CredentialResolverError);
	assert.equal(provider.status().grantCount, 1, "another tool's derived requirement ID must not consume this grant");
	await assert.rejects(() => resolve(secondaryInvocation), CredentialResolverError);
	assert.equal(provider.status().grantCount, 1, "another server's derived requirement ID must not consume this grant");
	assert.equal(secretResolveCalls, 0);

	let sdkFactoryCalls = 0;
	let sdkInvokeCalls = 0;
	let sdkDisposeCalls = 0;
	const toolboxManager = new ToolboxManager(async (_server, _timeout, credentials) => {
		sdkFactoryCalls += 1;
		assert.equal(credentials.boundParams.example_database_password, SECRET);
		return {
			async loadTool(name) { return { raw: { name }, getName: () => name }; },
			async loadToolset() { return []; },
			async invoke() { sdkInvokeCalls += 1; return JSON.stringify({ ok: true }); },
			async dispose() { sdkDisposeCalls += 1; },
		};
	}, consumer);
	const callOutput = await toolboxManager.call(
		searchInvocation,
		{ query: "hotels" },
		toolboxManager.captureGeneration(),
	);
	assert.match(callOutput.text, /"ok": true/u);
	assertPublicNoSecret(callOutput);
	assert.deepEqual([sdkFactoryCalls, sdkInvokeCalls, sdkDisposeCalls], [1, 1, 1]);
	assert.equal(secretResolveCalls, 1);
	assert.equal(provider.status().grantCount, 0);
	await assert.rejects(
		() => toolboxManager.call(searchInvocation, { query: "hotels" }, toolboxManager.captureGeneration()),
		CredentialResolverError,
	);
	assert.equal(sdkFactoryCalls, 1, "a consumed one-shot grant must fail before MCP client construction");
	assert.equal(secretResolveCalls, 1, "one-shot consumption must require a new approval");

	const resolverEvents = bus.observed.filter((event) => event.channel === SECRET_RESOLVER_V2_REQUEST_CHANNEL);
	assert.equal(resolverEvents.length, 6);
	const slots = resolverEvents.map((event) => (event.data as { slot: string }).slot);
	assert.equal(slots.filter((slot) => slot === requirementId).length, 4);
	assert.equal(slots.includes(deriveRequirementId(
		"production",
		"update-hotel",
		"bound-param",
		"example_database_password",
	)), true);
	assert.equal(slots.includes(deriveRequirementId(
		"secondary",
		"search-hotels",
		"bound-param",
		"example_database_password",
	)), true);
	for (const event of bus.observed) {
		const serialized = JSON.stringify(event.data);
		for (const canary of [SECRET, REFERENCE, TOKEN, ENDPOINT]) {
			assert.equal(serialized.includes(canary), false, `${event.channel} leaked ${canary}`);
		}
	}

	// Re-grant, then exercise the producer's reload/shutdown invalidation shape.
	const secondGrant = await dynamic.grantSecret(grantInput, undefined, context);
	assert.equal(secondGrant.details.ok, true);
	assert.equal(provider.status().grantCount, 1);
	bus.emit(MCP_TOOLBOX_REQUIREMENTS_CHANNEL, createRequirementInvalidationEvent());
	assert.equal(provider.status().grantCount, 0);
	assert.deepEqual(requirementCache.status(), { enabled: true, scopeCount: 0, requirementCount: 0 });
	assert.deepEqual((await dynamic.grantSecret(grantInput, undefined, context)).details, {
		ok: false,
		code: "invalid_input",
	});
	assert.equal(itemGetCalls, 3, "stale ID rejection after invalidation must precede SDK work");

	consumer.shutdown();
	requirementCache.shutdown();
	await Promise.all([toolboxManager.shutdown(), provider.shutdown(), manager.shutdown()]);
});
