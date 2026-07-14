import assert from "node:assert/strict";
import test from "node:test";
import {
	inspectAuthenticationConfiguration,
	inspectServiceAccountToken,
	MAX_DESKTOP_ACCOUNT_BYTES,
	MAX_SERVICE_ACCOUNT_TOKEN_BYTES,
	parseDesktopAccount,
	parseServiceAccountToken,
	PublicError,
	selectAuthentication,
} from "../src/safety.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_DESKTOP_ACCOUNT;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const TOKEN_PLACEHOLDER = "test-only-service-account-token-placeholder";
const DESKTOP_ACCOUNT_PLACEHOLDER = "test-only-desktop-account-placeholder";

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

test("desktop account parsing accepts only a bounded, trimmed own safe string", () => {
	assert.equal(
		parseDesktopAccount({ PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER }),
		DESKTOP_ACCOUNT_PLACEHOLDER,
	);
	assert.equal(
		parseDesktopAccount({ PI_ONEPASSWORD_DESKTOP_ACCOUNT: "é".repeat(MAX_DESKTOP_ACCOUNT_BYTES / 2) }).length,
		MAX_DESKTOP_ACCOUNT_BYTES / 2,
	);
	for (const account of [
		undefined,
		"",
		` ${DESKTOP_ACCOUNT_PLACEHOLDER}`,
		`${DESKTOP_ACCOUNT_PLACEHOLDER} `,
		`${DESKTOP_ACCOUNT_PLACEHOLDER}\u0000`,
		`${DESKTOP_ACCOUNT_PLACEHOLDER}\u2028`,
		`${DESKTOP_ACCOUNT_PLACEHOLDER}\u202e`,
		"é".repeat(MAX_DESKTOP_ACCOUNT_BYTES / 2 + 1),
	]) {
		expectCode(() => parseDesktopAccount({ PI_ONEPASSWORD_DESKTOP_ACCOUNT: account }), "configuration");
	}
	const inherited = Object.create({ PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER });
	expectCode(() => parseDesktopAccount(inherited), "configuration");
});

test("presence inspection reports only booleans and safe deterministic mode categories", () => {
	assert.deepEqual(inspectAuthenticationConfiguration({}), {
		serviceAccountTokenConfigured: false,
		desktopAccountConfigured: false,
		authenticationMode: "none",
	});
	assert.deepEqual(inspectAuthenticationConfiguration({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER }), {
		serviceAccountTokenConfigured: true,
		desktopAccountConfigured: false,
		authenticationMode: "service_account",
	});
	assert.deepEqual(inspectAuthenticationConfiguration({
		PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER,
	}), {
		serviceAccountTokenConfigured: false,
		desktopAccountConfigured: true,
		authenticationMode: "desktop",
	});
	assert.equal(inspectAuthenticationConfiguration({
		OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER,
		PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER,
	}).authenticationMode, "ambiguous");
	assert.equal(inspectAuthenticationConfiguration({ PI_ONEPASSWORD_DESKTOP_ACCOUNT: " invalid " }).authenticationMode, "desktop");
});

test("environment accessors and inherited or ambient account aliases are never consumed", () => {
	let invoked = false;
	const environment = Object.create({
		OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER,
		PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER,
	});
	Object.defineProperty(environment, "OP_SERVICE_ACCOUNT_TOKEN", {
		enumerable: true,
		get() {
			invoked = true;
			return TOKEN_PLACEHOLDER;
		},
	});
	Object.defineProperty(environment, "PI_ONEPASSWORD_DESKTOP_ACCOUNT", {
		enumerable: true,
		get() {
			invoked = true;
			return DESKTOP_ACCOUNT_PLACEHOLDER;
		},
	});
	assert.deepEqual(inspectAuthenticationConfiguration(environment), {
		serviceAccountTokenConfigured: false,
		desktopAccountConfigured: false,
		authenticationMode: "none",
	});
	assert.equal(inspectServiceAccountToken(environment), false);
	expectCode(() => selectAuthentication(environment), "configuration");
	assert.equal(invoked, false);

	assert.equal(inspectAuthenticationConfiguration({ OP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER }).authenticationMode, "none");
	expectCode(() => selectAuthentication({ OP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER }), "configuration");

	let descriptorReads = 0;
	const hostileEnvironment = new Proxy(Object.create(null), {
		getOwnPropertyDescriptor() {
			descriptorReads += 1;
			throw new Error("descriptor failure");
		},
	});
	assert.equal(inspectAuthenticationConfiguration(hostileEnvironment).authenticationMode, "none");
	expectCode(() => selectAuthentication(hostileEnvironment), "configuration");
	assert.equal(descriptorReads, 4);
});

test("authentication selection is mutually exclusive and malformed settings never permit fallback", () => {
	assert.deepEqual(selectAuthentication({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER }), {
		mode: "service_account",
		value: TOKEN_PLACEHOLDER,
	});
	assert.deepEqual(selectAuthentication({ PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER }), {
		mode: "desktop",
		value: DESKTOP_ACCOUNT_PLACEHOLDER,
	});
	for (const environment of [
		{},
		{ OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER, PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER },
		{ OP_SERVICE_ACCOUNT_TOKEN: " invalid ", PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER },
		{ OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER, PI_ONEPASSWORD_DESKTOP_ACCOUNT: 42 },
	]) {
		expectCode(() => selectAuthentication(environment), "configuration");
	}
});
