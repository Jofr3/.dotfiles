import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_DESKTOP_ACCOUNT;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

test("package README documents exact requirements-first workflow, persistence, one-shot behavior, and upstream limitation", async () => {
	const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
	for (const required of [
		"/onepassword-sm dynamic-enable",
		"/onepassword-sm dynamic-disable",
		"mcp_toolbox_requirements",
		"onepassword_list_vaults",
		"onepassword_list_items",
		"onepassword_list_fields",
		"onepassword_grant_secret",
		"mcp_toolbox_call",
		"does **not** read or require `resolver-bindings.json`",
		"less restrictive",
		"least-privilege",
		'"provider": "onepassword-secrets-manager"',
		'"dynamic": true',
		"has `dynamic: true` and **no slot**",
		"opaque `requirementId`",
		"model-visible",
		"tool/RPC events",
		"persisted in the Pi session",
		"pi:mcp-toolbox:requirements:v1",
		"cooperative metadata handshake",
		"not an authentication boundary",
		"observe or spoof requirement metadata",
		"next admitted matching request only",
		"later tool turn",
		"Never issue grant and MCP calls in the same or a parallel tool batch",
		"decrypts and materializes the **full item**",
		"field `value`/`details`",
		"cannot prevent or zeroize upstream SDK/WASM copies",
		"Protected static MCP Toolbox workflow",
	]) assert.equal(readme.includes(required), true, required);
	assert.match(readme, /Static mappings remain reusable/u);
	assert.match(readme, /A retry always needs another approved grant/u);
	assert.match(readme, /no credential values, endpoint URLs, environment names, static slots/u);
});

test("global extension guide includes concise no-manual-slot dynamic warnings and canonical README link", async () => {
	const guide = await readFile(new URL("../../../../EXTENSIONS.md", import.meta.url), "utf8");
	for (const required of [
		"### 1Password dynamic workflow",
		"less restrictive than protected static bindings",
		"active model",
		"tool/RPC events",
		"least-privilege",
		'"provider": "onepassword-secrets-manager"',
		'"dynamic": true',
		"there is no user-authored slot",
		"mcp_toolbox_requirements(server, tool)",
		"onepassword_grant_secret(..., requirementId)",
		"later tool turn",
		"same/parallel batch",
		"in-memory and one-shot",
		"cooperative and not an authentication boundary",
		"observe or spoof requirement metadata",
		"decrypts the full item",
		"onepassword-secrets-manager/README.md",
		"protected static-slot instructions",
	]) assert.equal(guide.includes(required), true, required);
});
