import assert from "node:assert/strict";
import test from "node:test";
import { DynamicSelectionSession } from "../src/dynamic.ts";
import { OnePasswordManager } from "../src/manager.ts";
import { mapFullItemMetadata } from "../src/metadata.ts";
import { RequirementMetadataCache } from "../src/requirements.ts";
import { SecretResolverProvider } from "../src/resolver.ts";
import { PublicError } from "../src/safety.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const TOKEN = "fake-service-account-token-never-public";
const SECRET = "FAKE_LOGIN_SECRET_CANARY_NEVER_PUBLIC";
const RAW_VAULT_ID = "raw-login-vault-canary";
const RAW_ITEM_ID = "raw-login-item-canary";
const RAW_SECTION_ID = "raw-security-section-canary";
const RAW_RECOVERY_FIELD_ID = "raw-recovery-field-canary";
const REFERENCE = `op://${RAW_VAULT_ID}/${RAW_ITEM_ID}/username`;

function fullLoginItem(usernameSectionId: unknown = null) {
	return {
		id: RAW_ITEM_ID,
		title: "Fake SDK Login",
		category: "Login",
		vaultId: RAW_VAULT_ID,
		fields: [
			{
				id: "username",
				title: "Username",
				sectionId: usernameSectionId,
				fieldType: "Text",
				value: `${SECRET}-username`,
				details: null,
			},
			{
				id: "password",
				title: "Password",
				sectionId: null,
				fieldType: "Concealed",
				value: `${SECRET}-password`,
				details: null,
			},
			{
				id: RAW_RECOVERY_FIELD_ID,
				title: "Recovery Code",
				sectionId: RAW_SECTION_ID,
				fieldType: "Concealed",
				value: `${SECRET}-recovery`,
				details: null,
			},
		],
		sections: [{ id: RAW_SECTION_ID, title: "Security" }],
		notes: REFERENCE,
		tags: [SECRET],
		websites: [{ url: "https://example.invalid", label: "website", autofillBehavior: "ExactDomain" }],
		version: 1,
		files: [{ canary: SECRET }],
		document: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
	};
}

test("pinned SDK Login null-section shape lists fields and passes reveal verification", async () => {
	let getCalls = 0;
	class Secrets { static validateSecretReference(): void {} }
	const client = {
		secrets: { resolve: async () => SECRET },
		vaults: { list: async () => [{
			id: RAW_VAULT_ID,
			title: "Fake Login Vault",
			description: SECRET,
			vaultType: "userCreated",
			activeItemCount: 1,
			contentVersion: 1,
			attributeVersion: 1,
			createdAt: new Date(0),
			updatedAt: new Date(0),
		}] },
		items: {
			list: async () => [{
				id: RAW_ITEM_ID,
				title: "Fake SDK Login",
				category: "Login",
				vaultId: RAW_VAULT_ID,
				websites: [],
				tags: [SECRET],
				createdAt: new Date(0),
				updatedAt: new Date(0),
				state: "active",
			}],
			get: async () => { getCalls += 1; return fullLoginItem(); },
		},
	};
	const manager = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		loadSdk: async () => ({ default: { Secrets, createClient: async () => client } }),
	});
	const resolver = new SecretResolverProvider(manager);
	const requirements = new RequirementMetadataCache();
	const dynamic = new DynamicSelectionSession(manager, resolver, requirements);
	resolver.enableDynamic();

	try {
		const vaultResult = await dynamic.listVaults({ limit: 20 });
		const vaultId = JSON.parse(vaultResult.content[0]!.text).vaults[0].vaultId as string;
		const itemResult = await dynamic.listItems({ vaultId, state: "active", limit: 20 });
		const itemId = JSON.parse(itemResult.content[0]!.text).items[0].itemId as string;
		const fieldResult = await dynamic.listFields({ vaultId, itemId, limit: 20 });

		assert.deepEqual(fieldResult.details, { ok: true, recordCount: 3 });
		const fields = JSON.parse(fieldResult.content[0]!.text).fields as Array<Record<string, unknown>>;
		const username = fields.find((field) => field.title === "Username");
		const password = fields.find((field) => field.title === "Password");
		const recovery = fields.find((field) => field.title === "Recovery Code");
		assert.ok(username);
		assert.ok(password);
		assert.ok(recovery);
		assert.equal("section" in username, false);
		assert.equal("section" in password, false);
		assert.deepEqual((recovery.section as Record<string, unknown>).title, "Security");
		assert.match((recovery.section as Record<string, unknown>).sectionId as string, /^ops_[A-Za-z0-9_-]{43}$/u);
		assert.match(username.fieldId as string, /^opf_[A-Za-z0-9_-]{43}$/u);

		const verified = await dynamic.verifyFieldChoice(vaultId, itemId, password.fieldId as string);
		assert.equal(verified.selection.field.title, "Password");
		assert.equal(verified.selection.field.section, undefined);
		assert.equal(getCalls, 2, "listing and reveal verification must each re-fetch and map the item");

		const publicResults = JSON.stringify([vaultResult, itemResult, fieldResult]);
		for (const canary of [
			TOKEN,
			SECRET,
			REFERENCE,
			RAW_VAULT_ID,
			RAW_ITEM_ID,
			"username",
			"password",
			RAW_RECOVERY_FIELD_ID,
			RAW_SECTION_ID,
		]) assert.equal(publicResults.includes(canary), false, `public result exposed ${canary}`);
	} finally {
		requirements.shutdown();
		await resolver.shutdown();
		await manager.shutdown();
	}
});

test("field listing emits only a fixed safe diagnostic for rejected SDK metadata", async () => {
	class Secrets { static validateSecretReference(): void {} }
	const malformed = fullLoginItem();
	(malformed.fields[0] as Record<string, unknown>).unexpected = SECRET;
	const client = {
		secrets: { resolve: async () => SECRET },
		vaults: { list: async () => [{
			id: RAW_VAULT_ID,
			title: "Fake Login Vault",
			description: SECRET,
			vaultType: "userCreated",
			activeItemCount: 1,
			contentVersion: 1,
			attributeVersion: 1,
			createdAt: new Date(0),
			updatedAt: new Date(0),
		}] },
		items: {
			list: async () => [{
				id: RAW_ITEM_ID,
				title: "Fake SDK Login",
				category: "Login",
				vaultId: RAW_VAULT_ID,
				websites: [],
				tags: [SECRET],
				createdAt: new Date(0),
				updatedAt: new Date(0),
				state: "active",
			}],
			get: async () => malformed,
		},
	};
	const manager = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		loadSdk: async () => ({ default: { Secrets, createClient: async () => client } }),
	});
	const resolver = new SecretResolverProvider(manager);
	const requirements = new RequirementMetadataCache();
	const dynamic = new DynamicSelectionSession(manager, resolver, requirements);
	resolver.enableDynamic();
	try {
		const vaultResult = await dynamic.listVaults({ limit: 20 });
		const vaultId = JSON.parse(vaultResult.content[0]!.text).vaults[0].vaultId as string;
		const itemResult = await dynamic.listItems({ vaultId, state: "active", limit: 20 });
		const itemId = JSON.parse(itemResult.content[0]!.text).items[0].itemId as string;
		const fieldResult = await dynamic.listFields({ vaultId, itemId, limit: 20 });
		assert.deepEqual(fieldResult.details, {
			ok: false,
			code: "response_rejected",
			diagnostic: "field_record",
		});
		assert.equal(fieldResult.content[0]!.text, "1Password dynamic request failed (response_rejected:field_record).");
		assert.equal(JSON.stringify(fieldResult).includes(SECRET), false);
		assert.equal(JSON.stringify(fieldResult).includes(RAW_VAULT_ID), false);
		assert.equal(JSON.stringify(fieldResult).includes(RAW_ITEM_ID), false);
	} finally {
		requirements.shutdown();
		await resolver.shutdown();
		await manager.shutdown();
	}
});

test("literal null and own undefined compatibility do not admit other malformed section IDs", () => {
	const undefinedSection = fullLoginItem();
	undefinedSection.fields[0]!.sectionId = undefined;
	assert.equal(mapFullItemMetadata(undefinedSection, RAW_VAULT_ID, RAW_ITEM_ID).fields[0]!.section, undefined);
	for (const sectionId of [false, 0, "missing-section"]) {
		const item = fullLoginItem();
		item.fields[0]!.sectionId = sectionId;
		assert.throws(
			() => mapFullItemMetadata(item, RAW_VAULT_ID, RAW_ITEM_ID),
			(error: unknown) => error instanceof PublicError && error.code === "response",
		);
	}
});

test("Database metadata does not require unused or secret-bearing SDK members", () => {
	const item = {
		id: RAW_ITEM_ID,
		title: "Fake SDK Database",
		category: "Database",
		vaultId: RAW_VAULT_ID,
		fields: [
			{ id: "database_type", title: "Type", fieldType: "Menu" },
			{ id: "server", title: "Server", sectionId: null, fieldType: "Text" },
			{ id: "password", title: "Password", fieldType: "Concealed" },
		],
		sections: [],
	};
	const metadata = mapFullItemMetadata(item, RAW_VAULT_ID, RAW_ITEM_ID);
	assert.equal(metadata.category, "Database");
	assert.deepEqual(metadata.fields, [
		{ id: "database_type", title: "Type", fieldType: "Menu" },
		{ id: "server", title: "Server", fieldType: "Text" },
		{ id: "password", title: "Password", fieldType: "Concealed" },
	]);
});
