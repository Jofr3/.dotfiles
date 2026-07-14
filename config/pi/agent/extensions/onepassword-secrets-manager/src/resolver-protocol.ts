export const SECRET_RESOLVER_V2_PROTOCOL_VERSION = 2 as const;
export const SECRET_RESOLVER_V2_PROTOCOL = "pi.secret-resolver/v2" as const;
export const SECRET_RESOLVER_V2_REQUEST_CHANNEL = "pi:secret-resolver:v2:request" as const;
export const ONEPASSWORD_RESOLVER_PROVIDER = "onepassword-secrets-manager" as const;

export const SECRET_RESOLVER_PROVIDER_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u;
export const SECRET_RESOLVER_CONSUMER_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u;
export const SECRET_RESOLVER_LEGACY_SLOT_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/u;
export const SECRET_RESOLVER_SLOT_PATTERN = /^(?:[a-z][a-z0-9._-]{0,127}|mcp1-(?:H|A|B)-[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/u;
export const SECRET_RESOLVER_PURPOSE_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u;
export const SECRET_RESOLVER_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;

/** `unavailable` is consumer-synthesized and is never emitted by a provider. */
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
 * A request is a process-local capability handoff. It must be shallow-frozen.
 * The value may cross only as the argument passed directly to `respond`.
 */
export interface SecretResolverV2Request {
	protocol: typeof SECRET_RESOLVER_V2_PROTOCOL;
	provider: typeof ONEPASSWORD_RESOLVER_PROVIDER;
	consumer: string;
	slot: string;
	purpose: string;
	requestId: string;
	deadlineAt: number;
	signal?: AbortSignal;
	respond(response: SecretResolverV2Response): unknown;
}

/** Minimal Pi event-bus seam for the provider and offline fake-bus tests. */
export interface ResolverEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
}
