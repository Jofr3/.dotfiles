export const SECRET_RESOLVER_V1_PROTOCOL_VERSION = 1 as const;
export const SECRET_RESOLVER_V1_PROTOCOL = "pi.secret-resolver/v1" as const;
export const SECRET_RESOLVER_V1_REQUEST_CHANNEL = "pi:secret-resolver:v1:request" as const;

/** Legacy aliases retained without changing the v1 request contract. */
export const SECRET_RESOLVER_PROTOCOL_VERSION = SECRET_RESOLVER_V1_PROTOCOL_VERSION;
export const SECRET_RESOLVER_PROTOCOL = SECRET_RESOLVER_V1_PROTOCOL;
export const SECRET_RESOLVER_REQUEST_CHANNEL = SECRET_RESOLVER_V1_REQUEST_CHANNEL;

export const SECRET_RESOLVER_V2_PROTOCOL_VERSION = 2 as const;
export const SECRET_RESOLVER_V2_PROTOCOL = "pi.secret-resolver/v2" as const;
export const SECRET_RESOLVER_V2_REQUEST_CHANNEL = "pi:secret-resolver:v2:request" as const;

export const BITWARDEN_RESOLVER_PROVIDER = "bitwarden-secrets-manager" as const;

export const SECRET_RESOLVER_PROVIDER_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u;
export const SECRET_RESOLVER_CONSUMER_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u;
export const SECRET_RESOLVER_SLOT_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/u;
export const SECRET_RESOLVER_PURPOSE_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u;
export const SECRET_RESOLVER_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;

/** Codes a provider may return. Messages and causes never cross the callback. */
export type SecretResolverProviderFailureCode =
	| "aborted"
	| "binding_denied"
	| "busy"
	| "call_limit"
	| "configuration"
	| "deadline_exceeded"
	| "disabled"
	| "duplicate_request"
	| "invalid_request"
	| "lifecycle"
	| "request_failed"
	| "response_rejected"
	| "sdk_unavailable"
	| "unexpected";

/**
 * `unavailable` is synthesized only by a consumer when no addressed provider
 * invokes its callback before the consumer's deadline.
 */
export type SecretResolverFailureCode = SecretResolverProviderFailureCode | "unavailable";

/** Original provider-less v1 response retained for legacy Bitwarden consumers. */
export type SecretResolverResponse =
	| Readonly<{
			protocol: typeof SECRET_RESOLVER_V1_PROTOCOL;
			ok: true;
			value: string;
	  }>
	| Readonly<{
			protocol: typeof SECRET_RESOLVER_V1_PROTOCOL;
			ok: false;
			code: SecretResolverFailureCode;
	  }>;

/** Provider-aware v2 responses match the request protocol and omit routing data. */
export type SecretResolverV2Response =
	| Readonly<{
			protocol: typeof SECRET_RESOLVER_V2_PROTOCOL;
			ok: true;
			value: string;
	  }>
	| Readonly<{
			protocol: typeof SECRET_RESOLVER_V2_PROTOCOL;
			ok: false;
			code: SecretResolverProviderFailureCode;
	  }>;

/**
 * Original v1 process-local capability handoff. Its meaning is intentionally
 * unchanged and only the Bitwarden provider listens on its channel.
 */
export interface SecretResolverRequest {
	protocol: typeof SECRET_RESOLVER_V1_PROTOCOL;
	consumer: string;
	slot: string;
	purpose: string;
	requestId: string;
	deadlineAt: number;
	signal?: AbortSignal;
	respond(response: SecretResolverResponse): unknown;
}

/**
 * Provider-aware v2 capability handoff. Consumers must shallow-freeze the
 * exact request before emitting it; `provider` is routing, not authentication.
 */
export interface SecretResolverV2Request {
	protocol: typeof SECRET_RESOLVER_V2_PROTOCOL;
	provider: typeof BITWARDEN_RESOLVER_PROVIDER;
	consumer: string;
	slot: string;
	purpose: string;
	requestId: string;
	deadlineAt: number;
	signal?: AbortSignal;
	respond(response: SecretResolverV2Response): unknown;
}

export type SecretResolverV1Request = SecretResolverRequest;
export type SecretResolverV1Response = SecretResolverResponse;

/** Minimal Pi event-bus seam for provider and offline fake-bus tests. */
export interface ResolverEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
}
