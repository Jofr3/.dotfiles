import assert from "node:assert/strict";
import test from "node:test";
import { DynamicSelectionSession, type DynamicToolContext } from "../src/dynamic.ts";
import { OnePasswordManager } from "../src/manager.ts";
import {
	ONEPASSWORD_RESOLVER_PROVIDER,
	SECRET_RESOLVER_V2_PROTOCOL,
	type SecretResolverV2Response,
} from "../src/resolver-protocol.ts";
import {
	MCP_TOOLBOX_REQUIREMENTS_PROTOCOL,
	RequirementMetadataCache,
} from "../src/requirements.ts";
import { SecretResolverProvider } from "../src/resolver.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_DESKTOP_ACCOUNT;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const TOKEN = "dynamic-test-service-account-placeholder";
const SECRET = "DYNAMIC_SECRET_VALUE_CANARY";
const ERROR_CANARY = "RAW_DYNAMIC_ERROR_CANARY";
const VAULT_ID = "vault-id-canary";
const ITEM_ID = "item-id-canary";
const FIELD_ID = "field-id-canary";
const REQUIREMENT_ID = "mcp1-A-mpdPu7zFntHC35CnfFzSwEPToAxpZRtK9b_birVu7Qw";
const FABRICATED_REQUIREMENT_ID = "mcp1-A-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const PURPOSE = "mcp-toolbox.auth-token" as const;
const REFERENCE = `op://${VAULT_ID}/${ITEM_ID}/credentials/${FIELD_ID}`;

function vaultRecord() {
	return {
		id: VAULT_ID,
		title: "Production Vault",
		description: SECRET,
		vaultType: "userCreated",
		activeItemCount: 1,
		contentVersion: 1,
		attributeVersion: 1,
		createdAt: SECRET,
		updatedAt: SECRET,
	};
}

function itemOverview() {
	return {
		id: ITEM_ID,
		title: "Production API",
		category: "ApiCredentials",
		vaultId: VAULT_ID,
		websites: [SECRET],
		tags: [SECRET],
		createdAt: SECRET,
		updatedAt: SECRET,
		state: "active",
	};
}

function fullItem() {
	return {
		id: ITEM_ID,
		title: "Production API",
		category: "ApiCredentials",
		vaultId: VAULT_ID,
		fields: [{
			id: FIELD_ID,
			title: "Access Token",
			sectionId: "credentials",
			fieldType: "Concealed",
			value: SECRET,
			details: { secret: SECRET },
		}],
		sections: [{ id: "credentials", title: "Credentials" }],
		notes: SECRET,
		tags: [SECRET],
		websites: [SECRET],
		version: 1,
		files: [SECRET],
		document: SECRET,
		createdAt: SECRET,
		updatedAt: SECRET,
	};
}

function requirementRecord() {
	return Object.freeze({
		requirementId: REQUIREMENT_ID,
		targetKind: "auth-token" as const,
		targetName: "my_oauth",
		purpose: PURPOSE,
	});
}

function requirementEvent(requirements: readonly object[] = [requirementRecord()]) {
	return Object.freeze({
		protocol: MCP_TOOLBOX_REQUIREMENTS_PROTOCOL,
		action: "replace" as const,
		server: "production",
		tool: "search-hotels",
		requirements: Object.freeze([...requirements]),
	});
}

interface DiscoveryHandles {
	vaultId: string;
	itemId: string;
	fieldId: string;
}

function harness(admitRequirement = true) {
	const validations: string[] = [];
	let handles: DiscoveryHandles | undefined;
	const confirmations: string[] = [];
	let getCalls = 0;
	let resolveCalls = 0;
	let failResolve = false;
	class Secrets {
		static validateSecretReference(reference: string): void { validations.push(reference); }
	}
	class DesktopAuth { constructor(_account: string) {} }
	const client = {
		secrets: {
			resolve: async (_reference: string) => {
				resolveCalls += 1;
				if (failResolve) throw new Error(`${ERROR_CANARY}-${SECRET}`);
				return SECRET;
			},
		},
		vaults: { list: async () => [vaultRecord()] },
		items: {
			list: async () => [itemOverview()],
			get: async () => { getCalls += 1; return fullItem(); },
		},
	};
	const manager = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		loadSdk: async () => ({ default: { Secrets, DesktopAuth, createClient: async () => client } }),
	});
	const resolver = new SecretResolverProvider(manager);
	let dynamic!: DynamicSelectionSession;
	const requirements = new RequirementMetadataCache((records) => {
		for (const record of records) resolver.revokeDynamicGrant(record.requirementId, record.purpose);
		dynamic.invalidateRequirements(records);
	});
	dynamic = new DynamicSelectionSession(manager, resolver, requirements);
	resolver.enableDynamic();
	requirements.enable();
	if (admitRequirement) assert.equal(requirements.handleEvent(requirementEvent()), true);
	const context: DynamicToolContext = {
		hasUI: true,
		ui: {
			async confirm(_title, message) { confirmations.push(message); return true; },
		},
	};
	return {
		manager,
		resolver,
		dynamic,
		requirements,
		context,
		validations,
		confirmations,
		get handles() { return handles; },
		setHandles(value: DiscoveryHandles) { handles = value; },
		get getCalls() { return getCalls; },
		get resolveCalls() { return resolveCalls; },
		setFailResolve(value: boolean) { failResolve = value; },
	};
}

async function discover(instance: ReturnType<typeof harness>): Promise<void> {
	const vaults = await instance.dynamic.listVaults({ limit: 20 });
	assert.equal(vaults.details.ok, true);
	const vaultId = JSON.parse(vaults.content[0]!.text).vaults[0].vaultId as string;
	const items = await instance.dynamic.listItems({ vaultId, state: "active", limit: 20 });
	assert.equal(items.details.ok, true);
	const itemId = JSON.parse(items.content[0]!.text).items[0].itemId as string;
	const fields = await instance.dynamic.listFields({ vaultId, itemId, limit: 20 });
	assert.equal(fields.details.ok, true);
	const fieldId = JSON.parse(fields.content[0]!.text).fields[0].fieldId as string;
	instance.setHandles({ vaultId, itemId, fieldId });
	for (const result of [vaults, items, fields]) {
		const serialized = JSON.stringify(result);
		assert.equal(serialized.includes(SECRET), false);
		assert.equal(serialized.includes(REFERENCE), false);
		assert.equal(serialized.includes(VAULT_ID), false);
		assert.equal(serialized.includes(ITEM_ID), false);
		assert.equal(serialized.includes(FIELD_ID), false);
	}
}

let nonce = 0;
function request(
	resolver: SecretResolverProvider,
	overrides: Record<string, unknown> = {},
): Promise<SecretResolverV2Response> {
	nonce += 1;
	return new Promise((respond) => {
		resolver.handleRequest(Object.freeze({
			protocol: SECRET_RESOLVER_V2_PROTOCOL,
			provider: ONEPASSWORD_RESOLVER_PROVIDER,
			consumer: "mcp-toolbox",
			slot: REQUIREMENT_ID,
			purpose: PURPOSE,
			requestId: `dynamic-request-${String(nonce).padStart(8, "0")}`,
			deadlineAt: Date.now() + 5_000,
			respond,
			...overrides,
		}));
	});
}

function assertFailure(response: SecretResolverV2Response, code: string): void {
	assert.equal(response.ok, false);
	if (!response.ok) assert.equal(response.code, code);
}

function grantInput(instance: ReturnType<typeof harness>, requirementId = REQUIREMENT_ID) {
	const handles = instance.handles ?? { vaultId: VAULT_ID, itemId: ITEM_ID, fieldId: FIELD_ID };
	return { ...handles, requirementId };
}

async function grant(instance: ReturnType<typeof harness>) {
	return instance.dynamic.grantSecret(grantInput(instance), undefined, instance.context);
}

test("dynamic discovery chain, cached requirement approval, later-turn arming, and atomic one-shot resolution", async () => {
	const instance = harness();
	await discover(instance);
	const grantResult = await grant(instance);
	assert.equal(grantResult.details.ok, true);
	assert.equal(instance.resolver.status().grantCount, 1);
	assert.equal(instance.getCalls, 2, "field discovery and grant verification must use separate items.get calls");
	assert.deepEqual(instance.validations, [REFERENCE]);
	assert.equal(JSON.stringify(grantResult).includes(REFERENCE), false);
	assert.equal(JSON.stringify(grantResult).includes(SECRET), false);
	assert.equal(instance.confirmations.length, 1);
	const confirmation = instance.confirmations[0] as string;
	for (const expected of [
		REQUIREMENT_ID,
		"production",
		"search-hotels",
		"auth-token",
		"my_oauth",
		PURPOSE,
		"Production Vault",
		"Production API",
		"Access Token",
	]) assert.equal(confirmation.includes(expected), true, expected);
	for (const hidden of [VAULT_ID, ITEM_ID, FIELD_ID, "credentials", REFERENCE]) {
		assert.equal(confirmation.includes(hidden), false, hidden);
	}
	assert.equal(confirmation.includes(SECRET), false);
	assert.equal(confirmation.includes(TOKEN), false);
	assert.equal(confirmation.includes("Derived resolver purpose:"), true);
	assert.equal(confirmation.includes("Target slot:"), false);

	assertFailure(await request(instance.resolver), "binding_denied");
	assert.equal(instance.resolver.status().grantCount, 1);
	instance.resolver.armDynamicGrants();
	const [first, second] = await Promise.all([request(instance.resolver), request(instance.resolver)]);
	assert.equal([first, second].filter((response) => response.ok).length, 1);
	assert.equal([first, second].filter((response) => !response.ok && response.code === "binding_denied").length, 1);
	assert.equal(instance.resolveCalls, 1);
	assert.equal(instance.resolver.status().grantCount, 0);
	assert.equal(JSON.stringify(instance.resolver.status()).includes(REFERENCE), false);
	assert.equal(JSON.stringify(instance.resolver.status()).includes(REQUIREMENT_ID), false);
});

test("wrong tuple does not consume an armed grant, but admitted SDK failure does", async () => {
	const instance = harness();
	await discover(instance);
	assert.equal((await grant(instance)).details.ok, true);
	instance.resolver.armDynamicGrants();
	const aborted = new AbortController();
	aborted.abort();
	assertFailure(await request(instance.resolver, { signal: aborted.signal }), "aborted");
	assert.equal(instance.resolver.status().grantCount, 1);
	assertFailure(await request(instance.resolver, { deadlineAt: Date.now() - 1 }), "deadline_exceeded");
	assert.equal(instance.resolver.status().grantCount, 1);
	assertFailure(await request(instance.resolver, { slot: "wrong-slot" }), "binding_denied");
	assert.equal(instance.resolver.status().grantCount, 1);
	instance.setFailResolve(true);
	assertFailure(await request(instance.resolver), "request_failed");
	assert.equal(instance.resolver.status().grantCount, 0);
	assertFailure(await request(instance.resolver), "binding_denied");
	assert.equal(instance.resolveCalls, 1);
});

test("grant refuses uncached and fabricated IDs before SDK work, then enforces UI denial", async () => {
	const instance = harness(false);
	const guessed = await grant(instance);
	assert.deepEqual(guessed.details, { ok: false, code: "invalid_input" });
	assert.equal(instance.manager.status().metadataCallsUsed, 0);
	await discover(instance);
	assert.deepEqual((await grant(instance)).details, { ok: false, code: "invalid_input" });
	assert.equal(instance.getCalls, 1, "uncached requirement rejection must precede grant verification");
	assert.equal(instance.requirements.handleEvent(requirementEvent()), true);
	const fabricated = await instance.dynamic.grantSecret(
		grantInput(instance, FABRICATED_REQUIREMENT_ID), undefined, instance.context,
	);
	assert.deepEqual(fabricated.details, { ok: false, code: "invalid_input" });
	assert.equal(instance.getCalls, 1);

	const before = instance.manager.status().metadataCallsUsed;
	const noUi = await instance.dynamic.grantSecret(
		grantInput(instance), undefined, { hasUI: false, ui: instance.context.ui },
	);
	assert.deepEqual(noUi.details, { ok: false, code: "approval_required" });
	assert.equal(instance.manager.status().metadataCallsUsed, before);
	assert.equal(instance.resolver.status().grantCount, 0);

	const denied = await instance.dynamic.grantSecret(
		grantInput(instance), undefined, { hasUI: true, ui: { confirm: async () => false } },
	);
	assert.deepEqual(denied.details, { ok: false, code: "approval_denied" });
	assert.equal(instance.manager.status().metadataCallsUsed, before + 1);
	assert.equal(instance.resolver.status().grantCount, 0);
});

test("grant schema parser rejects every model-controlled routing field", async () => {
	const instance = harness();
	await discover(instance);
	for (const input of [
		{ ...grantInput(instance), consumer: "attacker" },
		{ ...grantInput(instance), provider: "attacker" },
		{ ...grantInput(instance), purpose: PURPOSE },
		{ ...grantInput(instance), slot: "manual-slot" },
		grantInput(instance, "not-a-requirement"),
	]) {
		const result = await instance.dynamic.grantSecret(input, undefined, instance.context);
		assert.deepEqual(result.details, { ok: false, code: "invalid_input" });
	}
	assert.equal(instance.confirmations.length, 0);
	assert.equal(instance.resolver.status().grantCount, 0);
	assert.equal(instance.getCalls, 1);
});

test("dynamic reset aborts a pending grant confirmation and cannot install a late grant", async () => {
	const instance = harness();
	await discover(instance);
	let confirmationStarted!: () => void;
	const started = new Promise<void>((resolve) => { confirmationStarted = resolve; });
	const pending = instance.dynamic.grantSecret(grantInput(instance), undefined, {
		hasUI: true,
		ui: {
			confirm: async (_title, _message, options) => {
				confirmationStarted();
				return new Promise<boolean>((resolve) => {
					if (options?.signal?.aborted) { resolve(false); return; }
					options?.signal?.addEventListener("abort", () => resolve(false), { once: true });
				});
			},
		},
	});
	await started;
	instance.dynamic.reset();
	const result = await pending;
	assert.equal(result.details.ok, false);
	assert.equal(instance.resolver.status().grantCount, 0);
	assert.equal(instance.validations.length, 0);
});

test("scoped requirement replacement makes pending grants stale and revokes existing grants", async () => {
	const instance = harness();
	await discover(instance);
	assert.equal((await grant(instance)).details.ok, true);
	instance.resolver.armDynamicGrants();
	assert.equal(instance.resolver.status().grantCount, 1);
	assert.equal(instance.requirements.handleEvent(requirementEvent([])), true);
	assert.equal(instance.resolver.status().grantCount, 0);
	assert.deepEqual((await grant(instance)).details, { ok: false, code: "invalid_input" });
	assert.equal(instance.getCalls, 2, "stale requirement rejection must happen before another verification");

	assert.equal(instance.requirements.handleEvent(requirementEvent()), true);
	let confirmationStarted!: () => void;
	const started = new Promise<void>((resolve) => { confirmationStarted = resolve; });
	const pending = instance.dynamic.grantSecret(grantInput(instance), undefined, {
		hasUI: true,
		ui: {
			confirm: async (_title, _message, options) => {
				confirmationStarted();
				return new Promise<boolean>((resolve) => {
					if (options?.signal?.aborted) { resolve(false); return; }
					options?.signal?.addEventListener("abort", () => resolve(false), { once: true });
				});
			},
		},
	});
	await started;
	assert.equal(instance.requirements.handleEvent(requirementEvent([])), true);
	assert.deepEqual((await pending).details, { ok: false, code: "lifecycle" });
	assert.equal(instance.resolver.status().grantCount, 0);
});

test("re-grant revokes the old requirement before fresh confirmation and lifecycle reset clears all state", async () => {
	const instance = harness();
	await discover(instance);
	assert.equal((await grant(instance)).details.ok, true);
	instance.resolver.armDynamicGrants();
	assert.equal(instance.resolver.status().grantCount, 1);
	const cancelled = await instance.dynamic.grantSecret(
		grantInput(instance), undefined, { hasUI: true, ui: { confirm: async () => false } },
	);
	assert.deepEqual(cancelled.details, { ok: false, code: "approval_denied" });
	assert.equal(instance.resolver.status().grantCount, 0);
	instance.requirements.disable();
	instance.dynamic.reset();
	await instance.resolver.disable();
	await instance.manager.reset();
	assert.deepEqual(instance.requirements.status(), { enabled: false, scopeCount: 0, requirementCount: 0 });
	const stale = await instance.dynamic.listVaults({});
	assert.deepEqual(stale.details, { ok: false, code: "disabled" });
	assert.equal(instance.manager.status().metadataCallsUsed, 5);
});
