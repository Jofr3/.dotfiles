import assert from "node:assert/strict";
import test from "node:test";
import {
	inspectAuthenticationConfiguration,
	inspectServiceAccountToken,
	MAX_SERVICE_ACCOUNT_TOKEN_BYTES,
	parseServiceAccountToken,
	PublicError,
	selectAuthentication,
} from "../src/safety.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const TOKEN_PLACEHOLDER = "test-only-service-account-token-placeholder";

function expectCode(action: () => unknown, code: PublicError["code"]): void {
	assert.throws(action, (error: unknown) => error instanceof PublicError && error.code === code);
}

test("service-account token parsing accepts only a bounded own safe string", () => {
	assert.equal(parseServiceAccountToken({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER }), TOKEN_PLACEHOLDER);
	for (const token of [
		undefined,
		"",
		` ${TOKEN_PLACEHOLDER}`,
		`${TOKEN_PLACEHOLDER}\n`,
		`${TOKEN_PLACEHOLDER}\u202e`,
		"x".repeat(MAX_SERVICE_ACCOUNT_TOKEN_BYTES + 1),
	]) {
		expectCode(() => parseServiceAccountToken({ OP_SERVICE_ACCOUNT_TOKEN: token }), "configuration");
	}
});

test("presence inspection reports only the service-account setting and safe mode", () => {
	assert.deepEqual(inspectAuthenticationConfiguration({}), {
		serviceAccountTokenConfigured: false,
		authenticationMode: "none",
	});
	assert.deepEqual(inspectAuthenticationConfiguration({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER }), {
		serviceAccountTokenConfigured: true,
		authenticationMode: "service_account",
	});
	assert.equal(
		inspectAuthenticationConfiguration({ OP_SERVICE_ACCOUNT_TOKEN: " invalid " }).authenticationMode,
		"service_account",
	);
});

test("environment accessors, inherited values, and unsupported account settings are never consumed", () => {
	let invoked = false;
	const environment = Object.create({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER });
	Object.defineProperty(environment, "OP_SERVICE_ACCOUNT_TOKEN", {
		enumerable: true,
		get() {
			invoked = true;
			return TOKEN_PLACEHOLDER;
		},
	});
	assert.deepEqual(inspectAuthenticationConfiguration(environment), {
		serviceAccountTokenConfigured: false,
		authenticationMode: "none",
	});
	assert.equal(inspectServiceAccountToken(environment), false);
	expectCode(() => selectAuthentication(environment), "configuration");
	assert.equal(invoked, false);

	for (const unsupported of [
		{ OP_ACCOUNT: "unsupported-account" },
		{ PI_ONEPASSWORD_DESKTOP_ACCOUNT: "unsupported-account" },
	]) {
		assert.equal(inspectAuthenticationConfiguration(unsupported).authenticationMode, "none");
		expectCode(() => selectAuthentication(unsupported), "configuration");
	}
	let unsupportedAccessorReads = 0;
	const serviceAccountEnvironment = { OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER } as Record<string, unknown>;
	Object.defineProperty(serviceAccountEnvironment, "PI_ONEPASSWORD_DESKTOP_ACCOUNT", {
		enumerable: true,
		get() {
			unsupportedAccessorReads += 1;
			return "unsupported-account";
		},
	});
	assert.deepEqual(selectAuthentication(serviceAccountEnvironment), {
		mode: "service_account",
		value: TOKEN_PLACEHOLDER,
	});
	assert.equal(unsupportedAccessorReads, 0);

	let descriptorReads = 0;
	const hostileEnvironment = new Proxy(Object.create(null), {
		getOwnPropertyDescriptor() {
			descriptorReads += 1;
			throw new Error("descriptor failure");
		},
	});
	assert.equal(inspectAuthenticationConfiguration(hostileEnvironment).authenticationMode, "none");
	expectCode(() => selectAuthentication(hostileEnvironment), "configuration");
	assert.equal(descriptorReads, 2);
});

test("authentication selection requires one valid service-account token", () => {
	assert.deepEqual(selectAuthentication({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER }), {
		mode: "service_account",
		value: TOKEN_PLACEHOLDER,
	});
	for (const environment of [
		{},
		{ OP_SERVICE_ACCOUNT_TOKEN: " invalid " },
		{ OP_SERVICE_ACCOUNT_TOKEN: 42 },
	]) {
		expectCode(() => selectAuthentication(environment), "configuration");
	}
});
