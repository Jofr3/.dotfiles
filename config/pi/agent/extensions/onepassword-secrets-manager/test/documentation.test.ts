import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;

test("package README documents default dynamic-only requirements-first behavior and limitations", async () => {
	const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
	for (const required of [
		"Dynamic mode is enabled **by default during extension registration**",
		"Only a 1Password service account is supported",
		"OP_SERVICE_ACCOUNT_TOKEN",
		"/onepassword-sm disable",
		"/onepassword-sm enable",
		"mcp_toolbox_requirements",
		"onepassword_search_items",
		"onepassword_list_vaults",
		"onepassword_list_items",
		"onepassword_list_fields",
		"onepassword_grant_secret",
		"mcp_toolbox_call",
		'"provider": "onepassword-secrets-manager"',
		'"dynamic": true',
		"No vault, item, field, title, slot, value, environment variable, or `op://` reference is configured",
		"active model",
		"tool/RPC events",
		"persisted in the Pi session",
		"later tool turn",
		"Every secret handoff still requires exact one-shot approval",
		"event bus is cooperative, not authenticated",
		"decrypts the full item",
		"cannot prevent or zero upstream copies",
	]) assert.equal(readme.includes(required), true, required);
	assert.doesNotMatch(readme, /DesktopAuth|resolver-enable|dynamic-enable|Protected static MCP Toolbox workflow/u);
	assert.match(readme, /first exact admitted resolver request consumes it/u);
});

test("global extension guide documents default dynamic-only MCP credential routing", async () => {
	const guide = await readFile(new URL("../../../../EXTENSIONS.md", import.meta.url), "utf8");
	for (const required of [
		"Default-on dynamic, service-account-only 1Password",
		"OP_SERVICE_ACCOUNT_TOKEN",
		"### 1Password dynamic workflow",
		"enabled in memory by default",
		"active model",
		"tool/RPC events",
		"least-privilege",
		'"provider": "onepassword-secrets-manager"',
		'"dynamic": true',
		"Environment references, literal values, static slots, Bitwarden, project credential files",
		"mcp_toolbox_requirements(server, tool)",
		"onepassword_grant_secret(..., requirementId)",
		"later tool turn",
		"in-memory and one-shot",
		"cooperative and not an authentication boundary",
		"decrypts the full item",
		"onepassword-secrets-manager/README.md",
	]) assert.equal(guide.includes(required), true, required);
});
