import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

async function indexSource(): Promise<string> {
	return readFile(new URL("../src/index.ts", import.meta.url), "utf8");
}

test("dynamic commands are explicit, UI-gated, mutually exclusive, and dynamic mode never loads bindings", async () => {
	const source = await indexSource();
	for (const action of ["status", "resolver-enable", "resolver-disable", "dynamic-enable", "dynamic-disable"]) {
		assert.equal(source.includes(`"${action}"`), true);
	}
	const dynamicStart = source.indexOf('if (action === "dynamic-enable")');
	const dynamicEnd = source.indexOf('if (action === "resolver-disable"', dynamicStart);
	const branch = source.slice(dynamicStart, dynamicEnd);
	assert.match(branch, /if \(!ctx\.hasUI\) return/u);
	assert.match(branch, /DYNAMIC_ENABLE_CONFIRMATION/u);
	assert.match(branch, /await ctx\.waitForIdle\(\)/u);
	assert.match(branch, /resolver\.enableDynamic\(\)/u);
	assert.match(branch, /registerDynamicTools\(\)/u);
	assert.match(branch, /activateDynamicTools\(\)/u);
	assert.doesNotMatch(branch, /loadBindings|loadResolverBindings/u);
	assert.doesNotMatch(branch, /import\("@1password\/sdk"\)/u);
	assert.match(branch, /resolver\.status\(\)\.enabled/u);
});

test("dynamic activation preserves unrelated tools and disable filters exactly the fixed dynamic names", async () => {
	const source = await indexSource();
	assert.match(source, /new Set\(\[\.\.\.pi\.getActiveTools\(\), \.\.\.DYNAMIC_TOOL_NAMES\]\)/u);
	assert.match(source, /pi\.getActiveTools\(\)\.filter\(\(name\) => !dynamicNames\.has\(name\)\)/u);
	assert.match(source, /const drain = disableResolverLifecycle\(resolver, manager, dynamic, requirements\)/u);
	assert.match(source, /deactivateDynamicTools\(\);\n\t\tawait drain/u);
	assert.match(source, /resolver\.armDynamicGrants\(\)/u);
	assert.match(source, /databaseProvider\?\.arm\(\)/u);
	const names = [
		"onepassword_list_vaults",
		"onepassword_list_items",
		"onepassword_search_items",
		"onepassword_list_fields",
		"onepassword_grant_secret",
		"onepassword_grant_database_profile",
		"onepassword_reveal_field",
		"onepassword_fill_login",
	];
	for (const name of names) assert.equal(source.includes(`name: "${name}"`), true);
});

test("dynamic schemas are bounded and grant accepts only discovered IDs plus one opaque requirementId", async () => {
	const source = await indexSource();
	assert.match(source, /maximum: 50/u);
	assert.match(source, /additionalProperties: false/gmu);
	assert.match(source, /\^mcp1-\(H\|A\|B\)-\[A-Za-z0-9_-\]\{42\}\[AEIMQUYcgkosw048\]\$/u);
	const start = source.indexOf('name: "onepassword_grant_secret"');
	const end = source.indexOf("\n\t\t});", start);
	const grant = source.slice(start, end);
	for (const required of ["vaultId:", "itemId:", "fieldId:", "requirementId:"]) {
		assert.equal(grant.includes(required), true, required);
	}
	for (const forbidden of ["slot:", "purpose:", "consumer:", "provider:", "secretReference:", "value:", "account:"]) {
		assert.equal(grant.includes(forbidden), false, forbidden);
	}
	assert.match(grant, /executionMode: "sequential"/u);
});

test("active-tool guidance enforces requirements-first discovery, wait boundaries, and later-turn MCP use", async () => {
	const source = await indexSource();
	for (const text of [
		"first call mcp_toolbox_requirements",
		"use only a returned requirementId",
		"call onepassword_list_vaults and wait",
		"call onepassword_list_items",
		"call onepassword_list_fields",
		"call onepassword_grant_secret",
		"mcp_toolbox_call only in a later tool turn",
		"Never put grant and MCP Toolbox calls in the same or a parallel tool batch",
		"dynamic:true",
		"Never invent, alter, or manually configure a requirement ID, slot, purpose, provider, or credential value",
	]) assert.equal(source.includes(text), true, text);
});

test("status and dynamic enable remain offline while static enable alone reads the protected binding file", async () => {
	const source = await indexSource();
	const statusStart = source.indexOf('name: "onepassword_sm_status"');
	const commandStart = source.indexOf('pi.registerCommand("onepassword-sm"', statusStart);
	const status = source.slice(statusStart, commandStart);
	assert.match(status, /manager\.status\(\)/u);
	assert.match(status, /resolver\.status\(\)/u);
	assert.doesNotMatch(status, /loadBindings|resolveSecretValue|listVaultMetadata|import\(/u);
	const staticStart = source.indexOf('if (action === "resolver-enable")');
	const dynamicStart = source.indexOf('if (action === "dynamic-enable")');
	const staticBranch = source.slice(staticStart, dynamicStart);
	assert.match(staticBranch, /const loaded = await loadBindings\(\)/u);
});
