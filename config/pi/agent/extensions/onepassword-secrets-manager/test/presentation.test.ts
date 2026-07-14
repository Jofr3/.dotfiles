import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { ManagerStatus } from "../src/manager.ts";
import {
	DYNAMIC_ENABLE_CONFIRMATION,
	dynamicGrantConfirmation,
	RESOLVER_ENABLE_CONFIRMATION,
	statusPayload,
	statusText,
} from "../src/presentation.ts";
import type { ResolverProviderStatus } from "../src/resolver.ts";
import type { AuthenticationMode } from "../src/safety.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_DESKTOP_ACCOUNT;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const ACCOUNT_DISCLOSURE_SENTINEL = "presentation-account-disclosure-sentinel";

const resolverStatus: ResolverProviderStatus = {
	enabled: false,
	mode: "disabled",
	bindingCount: 0,
	grantCount: 0,
	metadataEnabled: false,
	callsUsed: 0,
	callLimit: 20,
	pending: 0,
	pendingLimit: 4,
};

function managerStatus(
	authenticationMode: AuthenticationMode,
	serviceAccountTokenConfigured: boolean,
	desktopAccountConfigured: boolean,
): ManagerStatus {
	return {
		phase: "not_initialized",
		serviceAccountTokenConfigured,
		desktopAccountConfigured,
		authenticationMode,
		callsUsed: 0,
		callLimit: 20,
		pending: 0,
		pendingLimit: 4,
		metadataCallsUsed: 0,
		metadataCallLimit: 20,
		metadataPending: 0,
		metadataPendingLimit: 4,
	};
}

test("status presentation exposes only authentication booleans and safe mode categories", () => {
	const cases: readonly [AuthenticationMode, boolean, boolean][] = [
		["none", false, false],
		["service_account", true, false],
		["desktop", false, true],
		["ambiguous", true, true],
	];
	for (const [mode, tokenConfigured, desktopConfigured] of cases) {
		const status = managerStatus(mode, tokenConfigured, desktopConfigured);
		const payload = statusPayload(status, resolverStatus);
		const text = statusText(status, resolverStatus);
		assert.equal(payload.authenticationMode, mode);
		assert.equal(payload.serviceAccountTokenConfigured, tokenConfigured);
		assert.equal(payload.desktopAccountConfigured, desktopConfigured);
		assert.equal(payload.offline, true);
		assert.match(text, new RegExp(`Authentication mode: ${mode}`, "u"));
		assert.equal(JSON.stringify(payload).includes(ACCOUNT_DISCLOSURE_SENTINEL), false);
		assert.equal(text.includes(ACCOUNT_DISCLOSURE_SENTINEL), false);
	}
});

test("resolver confirmation explains lazy desktop authorization without interpolating an account", async () => {
	assert.match(RESOLVER_ENABLE_CONFIRMATION, /Authentication remains lazy until the first accepted secret resolution/u);
	assert.match(RESOLVER_ENABLE_CONFIRMATION, /mutually exclusive/u);
	assert.match(RESOLVER_ENABLE_CONFIRMATION, /Desktop mode may show 1Password authorization UI/u);
	assert.match(RESOLVER_ENABLE_CONFIRMATION, /installed and unlocked/u);
	assert.match(RESOLVER_ENABLE_CONFIRMATION, /No \/login command is needed/u);
	assert.equal(RESOLVER_ENABLE_CONFIRMATION.includes(ACCOUNT_DISCLOSURE_SENTINEL), false);

	const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
	assert.match(source, /statusPayload\(manager\.status\(\), resolver\.status\(\)\)/u);
	assert.match(source, /statusText\(manager\.status\(\), resolver\.status\(\)\)/u);
	assert.match(source, /RESOLVER_ENABLE_CONFIRMATION/u);
	assert.match(source, /Authentication remains lazy until the first accepted secret resolution/u);
	assert.equal(source.includes(ACCOUNT_DISCLOSURE_SENTINEL), false);
});

test("dynamic consent and grant presentation disclose verified metadata but no secret material", () => {
	assert.match(DYNAMIC_ENABLE_CONFIRMATION, /active model/u);
	assert.match(DYNAMIC_ENABLE_CONFIRMATION, /tool and RPC events/u);
	assert.match(DYNAMIC_ENABLE_CONFIRMATION, /persisted in the Pi session/u);
	assert.match(DYNAMIC_ENABLE_CONFIRMATION, /opaque session handle/u);
	assert.match(DYNAMIC_ENABLE_CONFIRMATION, /process-local event channel/u);
	assert.match(DYNAMIC_ENABLE_CONFIRMATION, /cooperative/u);
	assert.match(DYNAMIC_ENABLE_CONFIRMATION, /less restrictive than protected static bindings/u);
	assert.match(DYNAMIC_ENABLE_CONFIRMATION, /items\.get/u);
	assert.match(DYNAMIC_ENABLE_CONFIRMATION, /decrypts the full item/u);
	assert.match(DYNAMIC_ENABLE_CONFIRMATION, /does not read resolver-bindings\.json/u);
	const requirement = {
		requirementId: "mcp1-B-agZKwxZncAXfB6p1TMx7g0dZQk97793GMxXC_ky7E_A",
		server: "production",
		tool: "search-hotels",
		targetKind: "bound-param" as const,
		targetName: "example_database_password",
		purpose: "mcp-toolbox.bound-param" as const,
	};
	const confirmation = dynamicGrantConfirmation(
		{ id: "vault-id", title: "Vault", vaultType: "userCreated", activeItemCount: 1 },
		{
			item: { id: "item-id", vaultId: "vault-id", title: "Item", category: "Login" },
			field: {
				id: "field-id",
				title: "Password",
				fieldType: "Concealed",
				section: { id: "section-id", title: "Credentials" },
			},
		},
		requirement,
	);
	for (const text of [
		requirement.requirementId,
		"production",
		"search-hotels",
		"bound-param",
		"example_database_password",
		"mcp-toolbox.bound-param",
	]) assert.equal(confirmation.includes(text), true, text);
	for (const hidden of ["vault-id", "item-id", "field-id", "section-id"]) {
		assert.equal(confirmation.includes(hidden), false, hidden);
	}
	assert.match(confirmation, /one-shot/u);
	assert.match(confirmation, /arms after this tool turn/u);
	assert.match(confirmation, /No field value, account credential, token, or secret reference/u);
	assert.match(confirmation, /Derived resolver purpose: mcp-toolbox\.bound-param/u);
	assert.doesNotMatch(confirmation, /Target slot:|configured-slot/u);

	const escaped = dynamicGrantConfirmation(
		{ id: "vault-id", title: 'Vault "Production" \\', vaultType: "userCreated", activeItemCount: 1 },
		{
			item: { id: "item-id", vaultId: "vault-id", title: 'Item "Database"', category: "Login" },
			field: { id: "field-id", title: 'Password "Primary"', fieldType: "Concealed" },
		},
		requirement,
	);
	assert.match(escaped, /Vault: "Vault \\"Production\\" \\\\"/u);
	assert.match(escaped, /Item: "Item \\"Database\\""/u);
	assert.match(escaped, /Field: "Password \\"Primary\\""/u);
});
