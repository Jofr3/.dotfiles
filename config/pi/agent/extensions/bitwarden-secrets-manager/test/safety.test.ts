import assert from "node:assert/strict";
import test from "node:test";
import {
	assertOrganizationId,
	inspectEnvironment,
	normalizeResultLimit,
	parseRuntimeConfiguration,
	PublicError,
	sanitizeMetadataString,
} from "../src/safety.ts";

const ORGANIZATION_ID = "a1111111-2222-3333-8444-555555555555";
const TOKEN_PLACEHOLDER = "test-only-machine-credential-placeholder";

function expectPublicError(action: () => unknown, code: PublicError["code"]): void {
	assert.throws(action, (error: unknown) => error instanceof PublicError && error.code === code);
}

test("runtime configuration accepts a bounded token and paired HTTPS endpoints", () => {
	const defaults = parseRuntimeConfiguration({ BWS_ACCESS_TOKEN: TOKEN_PLACEHOLDER });
	assert.equal(defaults.accessToken, TOKEN_PLACEHOLDER);
	assert.equal(defaults.settings, undefined);

	const custom = parseRuntimeConfiguration({
		BWS_ACCESS_TOKEN: TOKEN_PLACEHOLDER,
		BWS_API_URL: "https://vault.example.test/api",
		BWS_IDENTITY_URL: "https://vault.example.test/identity",
	});
	assert.equal(custom.settings?.apiUrl, "https://vault.example.test/api");
	assert.equal(custom.settings?.identityUrl, "https://vault.example.test/identity");
	assert.match(custom.settings?.userAgent ?? "", /^pi-bitwarden-secrets-manager\//u);
});

test("runtime configuration rejects unsafe credentials and endpoint overrides", () => {
	for (const token of [
		undefined,
		"",
		` ${TOKEN_PLACEHOLDER}`,
		`${TOKEN_PLACEHOLDER}\n`,
		`${TOKEN_PLACEHOLDER}\u202e`,
		"x".repeat(8_193),
	]) {
		expectPublicError(() => parseRuntimeConfiguration({ BWS_ACCESS_TOKEN: token }), "configuration");
	}

	const invalidEnvironments = [
		{ BWS_ACCESS_TOKEN: TOKEN_PLACEHOLDER, BWS_API_URL: "https://api.example.test" },
		{
			BWS_ACCESS_TOKEN: TOKEN_PLACEHOLDER,
			BWS_API_URL: "http://api.example.test",
			BWS_IDENTITY_URL: "https://identity.example.test",
		},
		{
			BWS_ACCESS_TOKEN: TOKEN_PLACEHOLDER,
			BWS_API_URL: "https://user@example.test/api",
			BWS_IDENTITY_URL: "https://identity.example.test",
		},
		{
			BWS_ACCESS_TOKEN: TOKEN_PLACEHOLDER,
			BWS_API_URL: "https://api.example.test?debug=true",
			BWS_IDENTITY_URL: "https://identity.example.test#fragment",
		},
		{
			BWS_ACCESS_TOKEN: TOKEN_PLACEHOLDER,
			BWS_API_URL: "https://api.example.test/%0aheader",
			BWS_IDENTITY_URL: "https:\\identity.example.test",
		},
		{
			BWS_ACCESS_TOKEN: TOKEN_PLACEHOLDER,
			BWS_API_URL: "https://api.example.test/\u202eunsafe",
			BWS_IDENTITY_URL: "https://identity.example.test",
		},
		{
			BWS_ACCESS_TOKEN: TOKEN_PLACEHOLDER,
			BWS_API_URL: "https://api.example.test/%E2%80%AEunsafe",
			BWS_IDENTITY_URL: "https://identity.example.test",
		},
	];
	for (const environment of invalidEnvironments) {
		expectPublicError(() => parseRuntimeConfiguration(environment), "configuration");
	}
});

test("environment status reports only booleans and endpoint state without invoking accessors", () => {
	let getterInvoked = false;
	const environment = Object.create(null) as Record<string, string>;
	Object.defineProperty(environment, "BWS_ACCESS_TOKEN", {
		get() {
			getterInvoked = true;
			return TOKEN_PLACEHOLDER;
		},
	});
	Object.defineProperty(environment, "BWS_API_URL", { value: "https://api.example.test" });

	assert.deepEqual(inspectEnvironment(environment), {
		accessTokenConfigured: false,
		endpointOverrides: "invalid",
	});
	assert.equal(getterInvoked, false);
});

test("organization IDs and result limits are strictly bounded", () => {
	assert.doesNotThrow(() => assertOrganizationId(ORGANIZATION_ID));
	for (const value of [ORGANIZATION_ID.toUpperCase(), `${ORGANIZATION_ID} `, "../organization", ""]) {
		expectPublicError(() => assertOrganizationId(value), "invalid_input");
	}
	assert.equal(normalizeResultLimit(undefined), 20);
	assert.equal(normalizeResultLimit(50), 50);
	for (const value of [0, 51, 1.5, "20", Number.NaN]) {
		expectPublicError(() => normalizeResultLimit(value), "invalid_input");
	}
});

test("metadata text strips terminal and bidirectional controls and rejects oversized values", () => {
	assert.equal(sanitizeMetadataString("safe\u001b[31m-name\u001b[0m\u202e"), "safe-name");
	assert.equal(sanitizeMetadataString("line\nname"), "linename");
	assert.equal(sanitizeMetadataString("x".repeat(257)), undefined);
	assert.equal(sanitizeMetadataString(Object.create({ toString: () => "unsafe" })), undefined);
});
