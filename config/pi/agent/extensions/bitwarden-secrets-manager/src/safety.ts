import { Buffer } from "node:buffer";

export const SDK_PACKAGE = "@bitwarden/sdk-napi";
export const SDK_VERSION = "1.0.0";
export const ACCESS_TOKEN_ENV = "BWS_ACCESS_TOKEN";
export const API_URL_ENV = "BWS_API_URL";
export const IDENTITY_URL_ENV = "BWS_IDENTITY_URL";
export const DEFAULT_RESULT_LIMIT = 20;
export const MAX_RESULT_LIMIT = 50;
export const MAX_METADATA_CALLS = 20;
export const REQUEST_DEADLINE_MS = 30_000;

const MAX_ACCESS_TOKEN_LENGTH = 8_192;
const MAX_ENDPOINT_BYTES = 2_048;
const MAX_METADATA_BYTES = 256;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const UNSAFE_CONFIGURATION_TEXT_PATTERN = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
const UNSAFE_TEXT_PATTERN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/gu;
const ANSI_CSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/gu;
const ANSI_OSC_PATTERN = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/gu;

export type PublicErrorCode =
	| "aborted"
	| "call_limit"
	| "configuration"
	| "consent"
	| "disabled"
	| "invalid_input"
	| "lifecycle"
	| "request"
	| "response"
	| "sdk"
	| "timeout"
	| "unexpected";

const PUBLIC_MESSAGES: Readonly<Record<PublicErrorCode, string>> = Object.freeze({
	aborted: "The Bitwarden metadata request was cancelled. An in-flight SDK request may still complete locally.",
	call_limit: "The Bitwarden metadata call limit for this session has been reached.",
	configuration: "Bitwarden Secrets Manager environment configuration is missing or invalid. Review the documented variables and reload Pi.",
	consent: "Bitwarden metadata disclosure was not approved; no request was started.",
	disabled: "Bitwarden metadata tools are disabled. Run /bitwarden-sm enable before using them.",
	invalid_input: "The Bitwarden metadata request parameters are invalid.",
	lifecycle: "The Bitwarden Secrets Manager client is no longer available for this session.",
	request: "The Bitwarden metadata request failed. No SDK error details were disclosed.",
	response: "Bitwarden returned an invalid or unsafe metadata response; it was not disclosed.",
	sdk: "The pinned Bitwarden SDK could not be initialized. No SDK error details were disclosed.",
	timeout: "The Bitwarden metadata request timed out. An in-flight SDK request may still complete locally.",
	unexpected: "The Bitwarden Secrets Manager extension could not complete the request safely.",
});

export class PublicError extends Error {
	readonly code: PublicErrorCode;

	constructor(code: PublicErrorCode) {
		super(PUBLIC_MESSAGES[code]);
		this.name = "BitwardenSecretsManagerError";
		this.code = code;
	}
}

export function asPublicError(error: unknown): Error {
	if (error instanceof PublicError) {
		return new Error(error.message);
	}
	return new Error(PUBLIC_MESSAGES.unexpected);
}

export interface RuntimeConfiguration {
	accessToken: string;
	settings: { apiUrl: string; identityUrl: string; userAgent: string } | undefined;
}

export type EndpointOverrideState = "none" | "paired" | "invalid";

export interface EnvironmentStatus {
	accessTokenConfigured: boolean;
	endpointOverrides: EndpointOverrideState;
}

function readOwnDataProperty(object: unknown, key: string): unknown {
	if (typeof object !== "object" || object === null) return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(object, key);
		if (!descriptor || !("value" in descriptor)) return undefined;
		return descriptor.value;
	} catch {
		return undefined;
	}
}

function readEnvironmentString(environment: unknown, key: string): string | undefined {
	const value = readOwnDataProperty(environment, key);
	return typeof value === "string" ? value : undefined;
}

function validateAccessToken(value: string | undefined): string {
	if (
		value === undefined ||
		value.length === 0 ||
		value.length > MAX_ACCESS_TOKEN_LENGTH ||
		value.trim() !== value ||
		UNSAFE_CONFIGURATION_TEXT_PATTERN.test(value)
	) {
		throw new PublicError("configuration");
	}
	return value;
}

function containsUnsafeEndpointText(value: string): boolean {
	if (UNSAFE_CONFIGURATION_TEXT_PATTERN.test(value)) return true;
	try {
		return UNSAFE_CONFIGURATION_TEXT_PATTERN.test(decodeURIComponent(value));
	} catch {
		return true;
	}
}

function validateEndpoint(value: string | undefined): string {
	if (
		value === undefined ||
		value.length === 0 ||
		Buffer.byteLength(value, "utf8") > MAX_ENDPOINT_BYTES ||
		value.trim() !== value ||
		containsUnsafeEndpointText(value) ||
		!value.startsWith("https://") ||
		value.includes("\\")
	) {
		throw new PublicError("configuration");
	}

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new PublicError("configuration");
	}

	if (
		parsed.protocol !== "https:" ||
		parsed.hostname.length === 0 ||
		parsed.username.length > 0 ||
		parsed.password.length > 0 ||
		parsed.search.length > 0 ||
		parsed.hash.length > 0
	) {
		throw new PublicError("configuration");
	}
	return parsed.toString();
}

export function parseRuntimeConfiguration(environment: unknown): RuntimeConfiguration {
	const accessToken = validateAccessToken(readEnvironmentString(environment, ACCESS_TOKEN_ENV));
	const apiUrl = readEnvironmentString(environment, API_URL_ENV);
	const identityUrl = readEnvironmentString(environment, IDENTITY_URL_ENV);

	if ((apiUrl === undefined) !== (identityUrl === undefined)) {
		throw new PublicError("configuration");
	}

	if (apiUrl === undefined || identityUrl === undefined) {
		return { accessToken, settings: undefined };
	}

	return {
		accessToken,
		settings: {
			apiUrl: validateEndpoint(apiUrl),
			identityUrl: validateEndpoint(identityUrl),
			userAgent: `pi-bitwarden-secrets-manager/1.0.0 ${SDK_PACKAGE}/${SDK_VERSION}`,
		},
	};
}

export function inspectEnvironment(environment: unknown): EnvironmentStatus {
	const accessToken = readEnvironmentString(environment, ACCESS_TOKEN_ENV);
	const apiUrl = readEnvironmentString(environment, API_URL_ENV);
	const identityUrl = readEnvironmentString(environment, IDENTITY_URL_ENV);
	let endpointOverrides: EndpointOverrideState = "none";

	if (apiUrl !== undefined || identityUrl !== undefined) {
		if (apiUrl === undefined || identityUrl === undefined) {
			endpointOverrides = "invalid";
		} else {
			try {
				validateEndpoint(apiUrl);
				validateEndpoint(identityUrl);
				endpointOverrides = "paired";
			} catch {
				endpointOverrides = "invalid";
			}
		}
	}

	return {
		accessTokenConfigured: typeof accessToken === "string" && accessToken.length > 0,
		endpointOverrides,
	};
}

export function assertOrganizationId(value: unknown): asserts value is string {
	if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
		throw new PublicError("invalid_input");
	}
}

export function normalizeResultLimit(value: unknown): number {
	if (value === undefined) return DEFAULT_RESULT_LIMIT;
	if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_RESULT_LIMIT) {
		throw new PublicError("invalid_input");
	}
	return value as number;
}

export function sanitizeMetadataString(value: unknown): string | undefined {
	if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > MAX_METADATA_BYTES) {
		return undefined;
	}
	const sanitized = value.replace(ANSI_OSC_PATTERN, "").replace(ANSI_CSI_PATTERN, "").replace(UNSAFE_TEXT_PATTERN, "");
	if (sanitized.length === 0 || Buffer.byteLength(sanitized, "utf8") > MAX_METADATA_BYTES) {
		return undefined;
	}
	return sanitized;
}

export function sanitizeMetadataId(value: unknown): string | undefined {
	if (typeof value !== "string" || !UUID_PATTERN.test(value)) return undefined;
	return value;
}
