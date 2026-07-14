import { Buffer } from "node:buffer";

export const SDK_PACKAGE = "@1password/sdk";
export const SDK_VERSION = "0.4.0";
export const SERVICE_ACCOUNT_TOKEN_ENV = "OP_SERVICE_ACCOUNT_TOKEN";
export const DESKTOP_ACCOUNT_ENV = "PI_ONEPASSWORD_DESKTOP_ACCOUNT";
export const REQUEST_DEADLINE_MS = 30_000;
export const MAX_SECRET_VALUE_BYTES = 64 * 1024;
export const MAX_SERVICE_ACCOUNT_TOKEN_BYTES = 8 * 1024;
export const MAX_DESKTOP_ACCOUNT_BYTES = 1024;

const UNSAFE_CONFIGURATION_TEXT = /[\p{Cc}\p{Cf}\u2028\u2029]/u;

export type PublicErrorCode =
	| "aborted"
	| "busy"
	| "call_limit"
	| "configuration"
	| "invalid_input"
	| "lifecycle"
	| "request"
	| "response"
	| "sdk"
	| "timeout"
	| "unexpected";

const PUBLIC_MESSAGES: Readonly<Record<PublicErrorCode, string>> = Object.freeze({
	aborted: "The 1Password request was cancelled. An in-flight SDK request may still complete locally.",
	busy: "The 1Password request limit for pending operations has been reached.",
	call_limit: "The 1Password resolver call limit for this session has been reached.",
	configuration: "1Password environment or resolver configuration is missing or invalid.",
	invalid_input: "The 1Password resolver request is invalid.",
	lifecycle: "The 1Password client is no longer available for this session.",
	request: "The 1Password request failed. No SDK error details were disclosed.",
	response: "1Password returned an invalid or unsafe response; it was rejected.",
	sdk: "The pinned 1Password SDK could not be initialized. No SDK error details were disclosed.",
	timeout: "The 1Password request timed out. An in-flight SDK request may still complete locally.",
	unexpected: "The 1Password extension could not complete the request safely.",
});

export class PublicError extends Error {
	readonly code: PublicErrorCode;

	constructor(code: PublicErrorCode) {
		super(PUBLIC_MESSAGES[code]);
		this.name = "OnePasswordSecretsManagerError";
		this.code = code;
	}
}

export type AuthenticationMode = "service_account" | "desktop" | "none" | "ambiguous";

export interface AuthenticationInspection {
	serviceAccountTokenConfigured: boolean;
	desktopAccountConfigured: boolean;
	authenticationMode: AuthenticationMode;
}

export type AuthenticationSelection = Readonly<{
	mode: "service_account" | "desktop";
	value: string;
}>;

type EnvironmentSetting =
	| Readonly<{ state: "absent" }>
	| Readonly<{ state: "configured"; value: string }>
	| Readonly<{ state: "invalid" }>;

function readEnvironmentSetting(environment: unknown, key: string): EnvironmentSetting {
	if (typeof environment !== "object" || environment === null) return { state: "absent" };
	let descriptor: PropertyDescriptor | undefined;
	try {
		descriptor = Object.getOwnPropertyDescriptor(environment, key);
	} catch {
		return { state: "invalid" };
	}
	if (descriptor === undefined || ("value" in descriptor && descriptor.value === undefined)) {
		return { state: "absent" };
	}
	if (!("value" in descriptor) || typeof descriptor.value !== "string") return { state: "invalid" };
	return descriptor.value.length === 0
		? { state: "absent" }
		: { state: "configured", value: descriptor.value };
}

function modeFor(serviceAccountTokenConfigured: boolean, desktopAccountConfigured: boolean): AuthenticationMode {
	if (serviceAccountTokenConfigured && desktopAccountConfigured) return "ambiguous";
	if (serviceAccountTokenConfigured) return "service_account";
	if (desktopAccountConfigured) return "desktop";
	return "none";
}

function validateServiceAccountToken(token: string): string {
	if (
		Buffer.byteLength(token, "utf8") > MAX_SERVICE_ACCOUNT_TOKEN_BYTES ||
		token.trim() !== token ||
		UNSAFE_CONFIGURATION_TEXT.test(token)
	) {
		throw new PublicError("configuration");
	}
	return token;
}

function validateDesktopAccount(account: string): string {
	if (
		Buffer.byteLength(account, "utf8") > MAX_DESKTOP_ACCOUNT_BYTES ||
		account.trim() !== account ||
		UNSAFE_CONFIGURATION_TEXT.test(account)
	) {
		throw new PublicError("configuration");
	}
	return account;
}

export function parseServiceAccountToken(environment: unknown): string {
	const setting = readEnvironmentSetting(environment, SERVICE_ACCOUNT_TOKEN_ENV);
	if (setting.state !== "configured") throw new PublicError("configuration");
	return validateServiceAccountToken(setting.value);
}

export function parseDesktopAccount(environment: unknown): string {
	const setting = readEnvironmentSetting(environment, DESKTOP_ACCOUNT_ENV);
	if (setting.state !== "configured") throw new PublicError("configuration");
	return validateDesktopAccount(setting.value);
}

/** Presence-only inspection; it does not validate credentials or initialize the SDK. */
export function inspectAuthenticationConfiguration(environment: unknown): AuthenticationInspection {
	const token = readEnvironmentSetting(environment, SERVICE_ACCOUNT_TOKEN_ENV);
	const desktop = readEnvironmentSetting(environment, DESKTOP_ACCOUNT_ENV);
	const serviceAccountTokenConfigured = token.state === "configured";
	const desktopAccountConfigured = desktop.state === "configured";
	return {
		serviceAccountTokenConfigured,
		desktopAccountConfigured,
		authenticationMode: modeFor(serviceAccountTokenConfigured, desktopAccountConfigured),
	};
}

/** Presence-only compatibility helper; it never invokes environment accessors. */
export function inspectServiceAccountToken(environment: unknown): boolean {
	return inspectAuthenticationConfiguration(environment).serviceAccountTokenConfigured;
}

/** Select and validate exactly one authentication mode from one environment snapshot. */
export function selectAuthentication(environment: unknown): AuthenticationSelection {
	const token = readEnvironmentSetting(environment, SERVICE_ACCOUNT_TOKEN_ENV);
	const desktop = readEnvironmentSetting(environment, DESKTOP_ACCOUNT_ENV);
	const tokenConfigured = token.state === "configured";
	const desktopConfigured = desktop.state === "configured";
	const mode = modeFor(tokenConfigured, desktopConfigured);

	// Ambiguity is based on configured presence and takes precedence over value validation.
	if (mode === "ambiguous") throw new PublicError("configuration");
	// A malformed descriptor/value must never permit fallback to the other mode.
	if (token.state === "invalid" || desktop.state === "invalid") throw new PublicError("configuration");
	if (mode === "service_account" && token.state === "configured") {
		return Object.freeze({ mode, value: validateServiceAccountToken(token.value) });
	}
	if (mode === "desktop" && desktop.state === "configured") {
		return Object.freeze({ mode, value: validateDesktopAccount(desktop.value) });
	}
	throw new PublicError("configuration");
}
