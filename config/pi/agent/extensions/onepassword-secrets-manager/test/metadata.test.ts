import assert from "node:assert/strict";
import test from "node:test";
import {
	mapFullItemMetadata,
	mapItemMetadataList,
	mapVaultMetadataList,
	MAX_METADATA_OUTPUT_BYTES,
	MAX_METADATA_RAW_RECORDS,
	serializeFieldMetadata,
	serializeItemMetadata,
	serializeVaultMetadata,
} from "../src/metadata.ts";
import { OnePasswordManager } from "../src/manager.ts";
import { PublicError } from "../src/safety.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_DESKTOP_ACCOUNT;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const TOKEN = "metadata-test-service-account-placeholder";
const SECRET = "DYNAMIC_SECRET_VALUE_CANARY";
const RAW_ERROR = "RAW_SDK_ERROR_CANARY";
const VAULT_ID = "vault-id-canary";
const ITEM_ID = "item-id-canary";
const FIELD_ID = "field-id-canary";

function vaultRecord(overrides: Record<string, unknown> = {}) {
	return {
		id: VAULT_ID,
		title: "Production Vault",
		description: `description-${SECRET}`,
		vaultType: "userCreated",
		activeItemCount: 1,
		contentVersion: 9,
		attributeVersion: 3,
		createdAt: SECRET,
		updatedAt: SECRET,
		...overrides,
	};
}

function itemOverview(overrides: Record<string, unknown> = {}) {
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
		...overrides,
	};
}

function fullItem(overrides: Record<string, unknown> = {}) {
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
			details: { type: "Otp", content: { code: SECRET, toJSON: () => SECRET } },
		}],
		sections: [{ id: "credentials", title: "Credentials" }],
		notes: SECRET,
		tags: [SECRET],
		websites: [{ url: SECRET }],
		version: 7,
		files: [{ secret: SECRET }],
		document: { secret: SECRET },
		createdAt: SECRET,
		updatedAt: SECRET,
		...overrides,
	};
}

function fakeSdk(client: object, validate: (reference: string) => void = () => undefined) {
	class Secrets {
		static validateSecretReference(reference: string): void { validate(reference); }
	}
	class DesktopAuth { constructor(_account: string) {} }
	return { default: { Secrets, DesktopAuth, createClient: async () => client } };
}

function fakeClient(options: {
	vaults?: () => unknown;
	items?: (vaultId: string, filter: unknown) => unknown;
	get?: (vaultId: string, itemId: string) => unknown;
	resolve?: (reference: string) => unknown;
} = {}) {
	return {
		secrets: { resolve: options.resolve ?? (() => SECRET) },
		vaults: { list: options.vaults ?? (() => [vaultRecord()]) },
		items: {
			list: options.items ?? (() => [itemOverview()]),
			get: options.get ?? (() => fullItem()),
		},
	};
}

async function expectCode(promise: Promise<unknown>, code: PublicError["code"]): Promise<void> {
	await assert.rejects(promise, (error: unknown) => error instanceof PublicError && error.code === code);
}

test("strict metadata mappers expose only documented safe projections", () => {
	const vaults = mapVaultMetadataList([vaultRecord()]);
	const items = mapItemMetadataList([itemOverview()], VAULT_ID);
	const item = mapFullItemMetadata(fullItem(), VAULT_ID, ITEM_ID);
	assert.deepEqual(vaults[0], {
		id: VAULT_ID,
		title: "Production Vault",
		vaultType: "userCreated",
		activeItemCount: 1,
	});
	assert.deepEqual(items[0], {
		id: ITEM_ID,
		title: "Production API",
		category: "ApiCredentials",
		state: "active",
	});
	assert.deepEqual(item.fields[0], {
		id: FIELD_ID,
		title: "Access Token",
		fieldType: "Concealed",
		section: { id: "credentials", title: "Credentials" },
	});
	const vaultOutput = serializeVaultMetadata(vaults);
	const itemOutput = serializeItemMetadata(items);
	const fieldOutput = serializeFieldMetadata(item, item.fields);
	assert.match(vaultOutput, /"vaultId":"vault-id-canary"/u);
	assert.match(itemOutput, /"itemId":"item-id-canary"/u);
	assert.match(fieldOutput, /"fieldId":"field-id-canary"/u);
	assert.match(fieldOutput, /"sectionId":"credentials"/u);
	for (const output of [vaultOutput, itemOutput, fieldOutput]) {
		assert.ok(Buffer.byteLength(output, "utf8") <= MAX_METADATA_OUTPUT_BYTES);
		assert.doesNotMatch(output, new RegExp(SECRET, "u"));
		assert.equal(output.split("\n").length, 1);
	}
});

test("full-item accessors and hostile record/array shapes fail without invoking canaries", () => {
	let valueGetter = 0;
	const field = {
		id: FIELD_ID,
		title: "Access Token",
		fieldType: "Concealed",
	} as Record<string, unknown>;
	Object.defineProperty(field, "value", {
		enumerable: true,
		get() { valueGetter += 1; throw new Error(SECRET); },
	});
	assert.throws(
		() => mapFullItemMetadata(fullItem({ fields: [field], sections: [] }), VAULT_ID, ITEM_ID),
		(error: unknown) => error instanceof PublicError && error.code === "response",
	);
	assert.equal(valueGetter, 0);

	let notesGetter = 0;
	const item = fullItem();
	Object.defineProperty(item, "notes", {
		enumerable: true,
		get() { notesGetter += 1; throw new Error(SECRET); },
	});
	assert.throws(
		() => mapFullItemMetadata(item, VAULT_ID, ITEM_ID),
		(error: unknown) => error instanceof PublicError && error.code === "response",
	);
	assert.equal(notesGetter, 0);

	const custom = Object.assign(Object.create({ inherited: true }), vaultRecord());
	assert.throws(() => mapVaultMetadataList([custom]), PublicError);
	const symbolRecord = vaultRecord();
	Object.defineProperty(symbolRecord, Symbol("canary"), { value: SECRET, enumerable: true });
	assert.throws(() => mapVaultMetadataList([symbolRecord]), PublicError);
	const sparse = new Array(1);
	assert.throws(() => mapVaultMetadataList(sparse), PublicError);
});

test("raw record cap is enforced before traversing records and text/enums are sanitized", () => {
	let descriptorReads = 0;
	const hostile = new Proxy(vaultRecord(), {
		getOwnPropertyDescriptor(target, key) {
			descriptorReads += 1;
			return Reflect.getOwnPropertyDescriptor(target, key);
		},
	});
	const excessive = Array.from(
		{ length: MAX_METADATA_RAW_RECORDS + 1 },
		(_, index) => index === 0 ? hostile : vaultRecord({ id: `vault-${index}` }),
	);
	assert.throws(() => mapVaultMetadataList(excessive), PublicError);
	assert.equal(descriptorReads, 0);
	for (const title of [" unsafe", "unsafe\n", "unsafe\u001b[31m", "unsafe\u202e", "unsafe\u2028"] ) {
		assert.throws(() => mapVaultMetadataList([vaultRecord({ title })]), PublicError);
	}
	assert.throws(() => mapVaultMetadataList([vaultRecord({ vaultType: "malicious" })]), PublicError);
	assert.throws(() => mapItemMetadataList([itemOverview({ vaultId: "other-vault" })], VAULT_ID), PublicError);
});

test("manager metadata calls use only fixed documented methods and stay separate from secret accounting", async () => {
	const calls: unknown[][] = [];
	let loads = 0;
	let creations = 0;
	const client = fakeClient({
		vaults: (...args: unknown[]) => { calls.push(["vaults.list", ...args]); return [vaultRecord()]; },
		items: (vaultId, filter) => { calls.push(["items.list", vaultId, filter]); return [itemOverview()]; },
		get: (vaultId, itemId) => { calls.push(["items.get", vaultId, itemId]); return fullItem(); },
		resolve: (reference) => { calls.push(["secrets.resolve", reference]); return SECRET; },
	});
	const manager = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		loadSdk: async () => { loads += 1; return fakeSdk(client); },
	});
	assert.equal(manager.status().metadataCallsUsed, 0);
	assert.equal(loads, 0);
	assert.equal((await manager.listVaultMetadata()).length, 1);
	assert.equal((await manager.listItemMetadata(VAULT_ID, "active")).length, 1);
	assert.equal((await manager.getItemFieldMetadata(VAULT_ID, ITEM_ID)).fields.length, 1);
	assert.equal(await manager.resolveSecretValue("op://vault/item/field"), SECRET);
	assert.equal(loads, 1);
	assert.equal(creations, 0);
	assert.equal(manager.status().metadataCallsUsed, 3);
	assert.equal(manager.status().callsUsed, 1);
	assert.deepEqual(calls.map((entry) => entry[0]), ["vaults.list", "items.list", "items.get", "secrets.resolve"]);
	assert.equal(calls[0].length, 1, "vault titles use the SDK's documented no-argument list behavior");
	assert.deepEqual(calls[1].slice(1), [VAULT_ID, { type: "ByState", content: { active: true, archived: false } }]);
});

test("metadata raw errors are replaced, accepted failures consume budget, and reset does not replenish it", async () => {
	const manager = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		maxMetadataCalls: 2,
		loadSdk: async () => fakeSdk(fakeClient({
			vaults: () => { throw new Error(`${RAW_ERROR}-${SECRET}`); },
		})),
	});
	await expectCode(manager.listVaultMetadata(), "request");
	assert.equal(manager.status().metadataCallsUsed, 1);
	await manager.reset();
	await expectCode(manager.listVaultMetadata(), "request");
	await manager.reset();
	await expectCode(Promise.resolve().then(() => manager.listVaultMetadata()), "call_limit");
	assert.equal(manager.status().metadataCallsUsed, 2);
	assert.equal(manager.status().callsUsed, 0);
});

test("metadata and secret SDK work share one queue while pending limits remain separate", async () => {
	let releaseVaults!: () => void;
	const vaultBarrier = new Promise<void>((resolve) => { releaseVaults = resolve; });
	let vaultStarted!: () => void;
	const vaultStart = new Promise<void>((resolve) => { vaultStarted = resolve; });
	let active = 0;
	let maximumActive = 0;
	const enter = (): void => { active += 1; maximumActive = Math.max(maximumActive, active); };
	const leave = (): void => { active -= 1; };
	const manager = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		maxMetadataPending: 1,
		loadSdk: async () => fakeSdk(fakeClient({
			vaults: async () => {
				enter();
				vaultStarted();
				await vaultBarrier;
				leave();
				return [vaultRecord()];
			},
			resolve: async () => {
				enter();
				await new Promise((resolve) => setTimeout(resolve, 1));
				leave();
				return SECRET;
			},
		})),
	});
	const metadata = manager.listVaultMetadata();
	await vaultStart;
	await expectCode(Promise.resolve().then(() => manager.listVaultMetadata()), "busy");
	const secret = manager.resolveSecretValue("op://vault/item/field");
	assert.equal(manager.status().metadataPending, 1);
	assert.equal(manager.status().pending, 1);
	releaseVaults();
	assert.equal((await metadata).length, 1);
	assert.equal(await secret, SECRET);
	assert.equal(maximumActive, 1);
	assert.equal(manager.status().metadataCallsUsed, 1);
	assert.equal(manager.status().callsUsed, 1);
});

test("pre-aborted metadata calls remain lazy and consume no metadata budget", async () => {
	let environmentReads = 0;
	let loads = 0;
	const controller = new AbortController();
	controller.abort();
	const manager = new OnePasswordManager({
		readEnvironment: () => { environmentReads += 1; return { OP_SERVICE_ACCOUNT_TOKEN: TOKEN }; },
		loadSdk: async () => { loads += 1; return fakeSdk(fakeClient()); },
	});
	await expectCode(Promise.resolve().then(() => manager.listVaultMetadata(controller.signal)), "aborted");
	assert.equal(environmentReads, 0);
	assert.equal(loads, 0);
	assert.equal(manager.status().metadataCallsUsed, 0);
});

test("service metadata mode never constructs DesktopAuth and desktop metadata construction stays lazy", async () => {
	let serviceDesktopConstructions = 0;
	class ServiceDesktopAuth { constructor() { serviceDesktopConstructions += 1; } }
	const service = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		loadSdk: async () => fakeSdk(fakeClient(), () => undefined),
	});
	// Replace the default fake constructor with a canary without changing the service auth selection.
	const serviceWithCanary = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		loadSdk: async () => {
			const sdk = fakeSdk(fakeClient());
			sdk.default.DesktopAuth = ServiceDesktopAuth;
			return sdk;
		},
	});
	assert.equal(service.status().phase, "not_initialized");
	assert.equal(serviceWithCanary.status().phase, "not_initialized");
	await serviceWithCanary.listVaultMetadata();
	assert.equal(serviceDesktopConstructions, 0);

	let desktopConstructions = 0;
	class DesktopAuth { constructor(account: string) { desktopConstructions += 1; assert.equal(account, "desktop-account"); } }
	const desktop = new OnePasswordManager({
		readEnvironment: () => ({ PI_ONEPASSWORD_DESKTOP_ACCOUNT: "desktop-account" }),
		loadSdk: async () => {
			const sdk = fakeSdk(fakeClient());
			sdk.default.DesktopAuth = DesktopAuth;
			return sdk;
		},
	});
	assert.equal(desktop.status().authenticationMode, "desktop");
	assert.equal(desktopConstructions, 0);
	await desktop.listVaultMetadata();
	assert.equal(desktopConstructions, 1);
});
