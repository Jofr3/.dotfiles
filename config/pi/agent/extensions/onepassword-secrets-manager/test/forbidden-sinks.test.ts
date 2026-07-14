import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_DESKTOP_ACCOUNT;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const SOURCE_FILES = [
	"dynamic.ts",
	"index.ts",
	"lifecycle.ts",
	"manager.ts",
	"metadata.ts",
	"presentation.ts",
	"resolver-bindings.ts",
	"resolver-protocol.ts",
	"requirements.ts",
	"resolver.ts",
	"safety.ts",
];

async function sources(files: readonly string[]): Promise<string> {
	return (await Promise.all(files.map((file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8")))).join("\n");
}

test("runtime source has no shell, process-output, persistence, message, editor, clipboard, temp, or console sink", async () => {
	const source = await sources(SOURCE_FILES);
	for (const forbidden of [
		"pi.exec(",
		"sendMessage(",
		"sendUserMessage(",
		"appendEntry(",
		"setEditorText(",
		"pasteToEditor(",
		"writeFile(",
		"mkdtemp(",
		"console.",
		"clipboard",
		"child_process",
		"process.stdout",
		"process.stderr",
	]) {
		assert.equal(source.includes(forbidden), false, forbidden);
	}
});

test("fetched-value path has no serialization, event emission, UI, status, file, logging, or error-detail sink", async () => {
	const source = await sources(["manager.ts", "resolver.ts"]);
	for (const forbidden of [
		"JSON.stringify",
		"events.emit",
		".emit(",
		"notify(",
		"setStatus(",
		"sendMessage(",
		"sendUserMessage(",
		"appendEntry(",
		"writeFile(",
		"console.",
		"cause:",
	]) {
		assert.equal(source.includes(forbidden), false, forbidden);
	}
});

test("extension registers only status plus fixed metadata/grant tools and no reveal tool", async () => {
	const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
	const registered = [...source.matchAll(/name:\s*"([a-z0-9_]+)"/gu)].map((match) => match[1]);
	assert.deepEqual(registered, [
		"onepassword_list_vaults",
		"onepassword_list_items",
		"onepassword_list_fields",
		"onepassword_grant_secret",
		"onepassword_sm_status",
	]);
	assert.equal(source.includes("SECRET_VALUE"), false);
	assert.equal(/name:\s*"[^"]*(?:reveal|resolve_secret|get_secret)/u.test(source), false);
	const grantStart = source.indexOf('name: "onepassword_grant_secret"');
	const grantEnd = source.indexOf("\n\t\t});", grantStart);
	const grant = source.slice(grantStart, grantEnd);
	for (const forbidden of ["slot:", "purpose:", "consumer:", "provider:", "secretReference:", "value:"]) {
		assert.equal(grant.includes(forbidden), false, forbidden);
	}
});

test("status implementation cannot import SDK or read resolver bindings", async () => {
	const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
	const start = source.indexOf('name: "onepassword_sm_status"');
	const end = source.indexOf('pi.registerCommand("onepassword-sm"', start);
	const execute = start >= 0 && end > start ? source.slice(start, end) : "";
	assert.match(execute, /manager\.status\(\)/u);
	assert.match(execute, /resolver\.status\(\)/u);
	assert.doesNotMatch(execute, /loadResolverBindings/u);
	assert.doesNotMatch(execute, /resolveSecretValue/u);
	assert.doesNotMatch(execute, /import\(/u);
});

test("dynamic reference/value paths have no generic serialization or public sink", async () => {
	const source = await sources(["manager.ts", "resolver.ts"]);
	for (const forbidden of [
		"JSON.stringify",
		"console.",
		"appendEntry(",
		"sendMessage(",
		"sendUserMessage(",
		"notify(",
		"setStatus(",
		"writeFile(",
		"cause:",
	]) assert.equal(source.includes(forbidden), false, forbidden);
	const metadata = await sources(["metadata.ts"]);
	assert.equal(metadata.includes("JSON.stringify"), false);
	assert.equal(metadata.includes("mkdtemp"), false);
});
