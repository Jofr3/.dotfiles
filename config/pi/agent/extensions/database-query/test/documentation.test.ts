import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DATABASE_ROOT = new URL("../", import.meta.url);
const CONFIG_ROOT = new URL("../../../../", import.meta.url);

async function text(url: URL): Promise<string> {
	return readFile(url, "utf8");
}

test("database README and model-facing guidance document the exact direct one-shot workflow", async () => {
	const [readme, skill, extensions, claude] = await Promise.all([
		text(new URL("README.md", DATABASE_ROOT)),
		text(new URL("agent/skills/database/SKILL.md", CONFIG_ROOT)),
		text(new URL("EXTENSIONS.md", CONFIG_ROOT)),
		text(new URL("CLAUDE.md", CONFIG_ROOT)),
	]);
	for (const document of [readme, skill, extensions, claude]) {
		for (const required of [
			"/onepassword-sm dynamic-enable",
			"database_profile_requirements",
			"onepassword_list_vaults",
			"onepassword_list_items",
			"onepassword_list_fields",
			"onepassword_grant_database_profile",
			"database_query",
			"later turn",
			"profileId",
			"MCP Toolbox",
		]) assert.equal(document.includes(required), true, required);
	}
	for (const required of [
		"hints/display/scope metadata",
		"authorization boundary",
		"pi.database.connection-profile/v1",
		"fresh profile",
		"process-wide event bus is not an authentication boundary",
		"MYSQL_PWD",
		"SQLCMDPASSWORD",
		"200 physical rows",
		"full-output",
	]) assert.equal(readme.includes(required), true, required);
});

test("SQL policy documentation states the conservative confirmation boundary without claiming semantic read-only proof", async () => {
	const [readme, skill, extension] = await Promise.all([
		text(new URL("README.md", DATABASE_ROOT)),
		text(new URL("agent/skills/database/SKILL.md", CONFIG_ROOT)),
		text(new URL("extension.ts", DATABASE_ROOT)),
	]);
	for (const document of [readme.toLowerCase(), skill.toLowerCase()]) {
		for (const required of [
			"function-call syntax is always confirmation-required",
			"/*m!...*/",
			"sequence access",
			"unquoted `@`/`@@`",
			"select ... into",
			"outfile",
			"for update",
			"for share",
			"sql server table hints",
			"nested",
			"conservative lexical",
			"server-side definitions",
			"syntactically plain sql can",
			"ordinary",
		]) assert.equal(document.includes(required), true, required);
	}
	assert.equal(extension.includes("Function-bearing SELECTs"), true);
	assert.equal(extension.includes("no function-call, sequence, variable/assignment, output, locking/table-hint, or nested stateful syntax"), true);
});

test("database skill forbids credential scraping/bootstrap and removed database override", async () => {
	const skill = await text(new URL("agent/skills/database/SKILL.md", CONFIG_ROOT));
	for (const forbidden of [
		"Automatic configuration bootstrap",
		"Use the `database` tool parameter",
		'database_query({ query: "SELECT * FROM other_table", database:',
		"ensure `.agent/credentials/database.json` exists in the current project or an ancestor directory",
		"Inspect local project configuration for existing connection details",
	]) assert.equal(skill.includes(forbidden), false, forbidden);
	for (const required of [
		"Do not read `.env`",
		"Do not create/rewrite credential files",
		"There is no model-controlled database/catalog override",
		"Never inspect this plaintext file",
		"fails closed in JSON/print/headless mode",
	]) assert.equal(skill.includes(required), true, required);
});

test("extension inventories describe the current direct database and 1Password surfaces", async () => {
	const [extensions, claude] = await Promise.all([
		text(new URL("EXTENSIONS.md", CONFIG_ROOT)),
		text(new URL("CLAUDE.md", CONFIG_ROOT)),
	]);
	for (const document of [extensions, claude]) {
		for (const required of [
			"database-query/",
			"database_profile_requirements",
			"/database-profile-clear",
			"one-shot",
			"bitwarden-secrets-manager",
			"mcp-toolbox",
			"resource-toggler",
			"stagehand",
		]) assert.equal(document.includes(required), true, required);
	}
});
