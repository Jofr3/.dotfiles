export const SECRET_RESOLVER_PROTOCOL_VERSION = 1 as const;
export const SECRET_RESOLVER_PROTOCOL = "pi.secret-resolver/v1" as const;
export const SECRET_RESOLVER_REQUEST_CHANNEL = "pi:secret-resolver:v1:request" as const;

export const SECRET_RESOLVER_CONSUMER_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u;
export const SECRET_RESOLVER_SLOT_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/u;
export const SECRET_RESOLVER_PURPOSE_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u;
export const SECRET_RESOLVER_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;

/**
 * `unavailable` is synthesized by a consumer when no provider invokes its
 * callback before the consumer's own deadline. The provider never emits a
 * response event and never sends that code itself.
 */
export type SecretResolverFailureCode =
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
	| "unavailable"
	| "unexpected";

export type SecretResolverResponse =
	| Readonly<{
			protocol: typeof SECRET_RESOLVER_PROTOCOL;
			ok: true;
			value: string;
	  }>
	| Readonly<{
			protocol: typeof SECRET_RESOLVER_PROTOCOL;
			ok: false;
			code: SecretResolverFailureCode;
	  }>;

/**
 * A request is a process-local capability handoff. `respond` must be one-shot
 * on both sides. A secret value may cross only as the success argument passed
 * directly to this callback; it must never be put in an event payload.
 */
export interface SecretResolverRequest {
	protocol: typeof SECRET_RESOLVER_PROTOCOL;
	consumer: string;
	slot: string;
	purpose: string;
	requestId: string;
	deadlineAt: number;
	signal?: AbortSignal;
	respond(response: SecretResolverResponse): unknown;
}

/** Minimal Pi event-bus seam for provider and offline fake-bus tests. */
export interface ResolverEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
}
