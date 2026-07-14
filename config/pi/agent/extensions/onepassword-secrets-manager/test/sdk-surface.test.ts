import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { resolveSdkSurface } from "../src/manager.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_DESKTOP_ACCOUNT;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const require = createRequire(import.meta.url);

async function declarations(name: string): Promise<string> {
	const sdkEntry = require.resolve("@1password/sdk");
	return readFile(resolve(dirname(sdkEntry), name), "utf8");
}

test("pinned official SDK manifest and declarations expose only the required inspected surface", async () => {
	const sdkEntry = require.resolve("@1password/sdk");
	const packageJson = JSON.parse(await readFile(resolve(dirname(sdkEntry), "..", "package.json"), "utf8"));
	assert.equal(packageJson.name, "@1password/sdk");
	assert.equal(packageJson.version, "0.4.0");
	assert.equal(packageJson.dependencies["@1password/sdk-core"], "0.4.0");
	assert.deepEqual(packageJson.exports, {
		".": { types: "./dist/sdk.d.ts", default: "./dist/sdk.js" },
	});

	const sdk = await declarations("sdk.d.ts");
	const client = await declarations("client.d.ts");
	const vaults = await declarations("vaults.d.ts");
	const items = await declarations("items.d.ts");
	const secrets = await declarations("secrets.d.ts");
	const types = await declarations("types.d.ts");
	assert.match(sdk, /export \{ Secrets \} from "\.\/secrets\.js"/u);
	assert.match(sdk, /export \{ DesktopAuth \} from "\.\/configuration\.js"/u);
	assert.match(sdk, /createClient: \(config: ClientConfiguration\) => Promise<Client>/u);
	assert.match(client, /secrets: SecretsApi/u);
	assert.match(client, /items: ItemsApi/u);
	assert.match(client, /vaults: VaultsApi/u);
	assert.match(vaults, /list\(params\?: VaultListParams\): Promise<VaultOverview\[\]>/u);
	assert.match(items, /list\(vaultId: string, \.\.\.filters: ItemListFilter\[\]\): Promise<ItemOverview\[\]>/u);
	assert.match(items, /get\(vaultId: string, itemId: string\): Promise<Item>/u);
	assert.match(secrets, /resolve\(secretReference: string\): Promise<string>/u);
	assert.match(secrets, /static validateSecretReference\(secretReference: string\): void/u);
	assert.match(types, /export interface ItemField \{[\s\S]*value: string;[\s\S]*details\?: ItemFieldDetails;/u);
	assert.match(types, /export interface Item \{[\s\S]*fields: ItemField\[\];[\s\S]*notes: string;[\s\S]*files: ItemFile\[\];/u);
	assert.match(types, /export interface VaultOverview \{[\s\S]*activeItemCount: number;/u);
});

test("runtime manager resolves only documented list/get/resolve methods through data descriptors", async () => {
	const managerSource = await readFile(new URL("../src/manager.ts", import.meta.url), "utf8");
	const safetySource = await readFile(new URL("../src/safety.ts", import.meta.url), "utf8");
	const source = `${managerSource}\n${safetySource}`;
	assert.match(managerSource, /import\("@1password\/sdk"\)/u);
	assert.match(managerSource, /"createClient"/u);
	assert.match(managerSource, /"DesktopAuth"/u);
	assert.match(managerSource, /Reflect\.construct\(desktopAuth\.constructor, \[accountName\]\)/u);
	assert.match(managerSource, /"validateSecretReference"/u);
	assert.match(managerSource, /immediateDataMethod\(secrets, "resolve"\)/u);
	assert.match(managerSource, /immediateDataMethod\(vaults, "list"\)/u);
	assert.match(managerSource, /immediateDataMethod\(items, "list"\)/u);
	assert.match(managerSource, /immediateDataMethod\(items, "get"\)/u);
	assert.match(managerSource, /integrationName: INTEGRATION_NAME/u);
	assert.match(managerSource, /integrationVersion: INTEGRATION_VERSION/u);
	assert.match(managerSource, /selectAuthentication\(this\.#readEnvironment\(\)\)/u);
	assert.match(safetySource, /"PI_ONEPASSWORD_DESKTOP_ACCOUNT"/u);
	assert.doesNotMatch(source, /["']OP_ACCOUNT["']/u);
	for (const forbidden of [
		"OP_CONNECT_",
		"resolveAll",
		"getOverview",
		"createAll",
		"getAll",
		"deleteAll",
		"grantGroupPermissions",
		"revokeGroupPermissions",
		"shares",
		"groups",
	]) assert.equal(source.includes(forbidden), false, forbidden);
});

test("mock root and client surfaces reject accessors without invocation", async () => {
	class Secrets { static validateSecretReference(): void {} }
	let desktopAccessor = 0;
	const defaultExport = { Secrets, createClient: async () => undefined } as Record<string, unknown>;
	Object.defineProperty(defaultExport, "DesktopAuth", {
		enumerable: true,
		get() { desktopAccessor += 1; return class DesktopAuth {}; },
	});
	assert.throws(() => resolveSdkSurface({ default: defaultExport }));
	assert.equal(desktopAccessor, 0);

	let malformedInvoked = false;
	const malformed = () => { malformedInvoked = true; };
	assert.throws(() => resolveSdkSurface({
		default: { Secrets, createClient: async () => undefined, DesktopAuth: malformed },
	}));
	assert.equal(malformedInvoked, false);

	let listAccessor = 0;
	const vaults = Object.create(null);
	Object.defineProperty(vaults, "list", {
		enumerable: true,
		get() { listAccessor += 1; return async () => []; },
	});
	class DesktopAuth {}
	const manager = new (await import("../src/manager.ts")).OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: "test-placeholder" }),
		loadSdk: async () => ({
			default: {
				Secrets,
				DesktopAuth,
				createClient: async () => ({ secrets: { resolve: async () => "x" }, vaults }),
			},
		}),
	});
	await assert.rejects(
		manager.listVaultMetadata(),
		(error: unknown) => error instanceof Error && (error as { code?: string }).code === "sdk",
	);
	assert.equal(listAccessor, 0);
});
