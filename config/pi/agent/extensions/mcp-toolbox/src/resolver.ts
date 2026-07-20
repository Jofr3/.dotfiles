import { randomBytes } from "node:crypto";
import { parseDynamicRequirementId } from "./requirements.ts";

export const SECRET_RESOLVER_V2_PROTOCOL_VERSION = 2 as const;
export const SECRET_RESOLVER_V2_PROTOCOL = "pi.secret-resolver/v2" as const;
export const SECRET_RESOLVER_V2_REQUEST_CHANNEL = "pi:secret-resolver:v2:request" as const;
export const ONEPASSWORD_RESOLVER_PROVIDER = "onepassword-secrets-manager" as const;

export type ResolverProvider = typeof ONEPASSWORD_RESOLVER_PROVIDER;

const CONSUMER_IDENTITY = "mcp-toolbox";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const MAX_VALUE_BYTES = 64 * 1024;
const MAX_RESOLVER_CALLS = 20;
const MAX_RESOLVER_PENDING = 4;
const MAX_RESOLVER_WAIT_MS = 30_000;

const RESOLVER_PURPOSES = new Set<string>([
	"mcp-toolbox.header",
	"mcp-toolbox.auth-token",
	"mcp-toolbox.bound-param",
]);

const FAILURE_CODES = new Set([
	"aborted",
	"binding_denied",
	"busy",
	"call_limit",
	"configuration",
	"deadline_exceeded",
	"disabled",
	"duplicate_request",
	"invalid_request",
	"lifecycle",
	"request_failed",
	"response_rejected",
	"sdk_unavailable",
	"unexpected",
]);

export type ResolverPurpose =
	| "mcp-toolbox.header"
	| "mcp-toolbox.auth-token"
	| "mcp-toolbox.bound-param";

export type CredentialResolverFailureCode =
	| "unavailable"
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

export interface ResolverEventBus {
	emit(channel: string, data: unknown): void;
}

export interface SecretResolverConsumerOptions {
	maxCalls?: number;
	maxPending?: number;
	maxWaitMs?: number;
	now?: () => number;
	requestId?: () => string;
}

type ResolverResponse =
	| Readonly<{ protocol: typeof SECRET_RESOLVER_V2_PROTOCOL; ok: true; value: string }>
	| Readonly<{ protocol: typeof SECRET_RESOLVER_V2_PROTOCOL; ok: false; code: string }>;

export class CredentialResolverError extends Error {
	readonly code: CredentialResolverFailureCode;

	constructor(code: CredentialResolverFailureCode = "unexpected") {
		super("MCP Toolbox credential resolution failed; the configured provider was unavailable or did not approve the request");
		this.name = "McpToolboxCredentialResolverError";
		this.code = code;
	}
}

function ownDataRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	try {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) return undefined;
		const descriptors = Object.getOwnPropertyDescriptors(value);
		const output: Record<string, unknown> = Object.create(null);
		for (const key of Reflect.ownKeys(descriptors)) {
			if (typeof key !== "string") return undefined;
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
			output[key] = descriptor.value;
		}
		return output;
	} catch {
		return undefined;
	}
}

function parseResponse(value: unknown): ResolverResponse | undefined {
	let frozen = false;
	try {
		frozen = Object.isFrozen(value);
	} catch {
		return undefined;
	}
	const object = frozen ? ownDataRecord(value) : undefined;
	if (!object || object.protocol !== SECRET_RESOLVER_V2_PROTOCOL || typeof object.ok !== "boolean") return undefined;
	const keys = Object.keys(object).sort().join(",");
	if (object.ok === true) {
		if (keys !== "ok,protocol,value") return undefined;
		if (
			typeof object.value !== "string" ||
			object.value.length === 0 ||
			Buffer.byteLength(object.value, "utf8") > MAX_VALUE_BYTES ||
			/[\r\n\0]/u.test(object.value)
		) return undefined;
		return { protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: true, value: object.value };
	}
	if (keys !== "code,ok,protocol" || typeof object.code !== "string" || !FAILURE_CODES.has(object.code)) {
		return undefined;
	}
	return { protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: false, code: object.code };
}

function defaultRequestId(): string {
	return randomBytes(24).toString("base64url");
}

export class SecretResolverConsumer {
	readonly #bus: ResolverEventBus;
	readonly #maxCalls: number;
	readonly #maxPending: number;
	readonly #maxWaitMs: number;
	readonly #now: () => number;
	readonly #requestId: () => string;
	#callsUsed = 0;
	#closed = false;
	#epoch = 0;
	readonly #controllers = new Set<AbortController>();

	constructor(bus: ResolverEventBus, options: SecretResolverConsumerOptions = {}) {
		this.#bus = bus;
		this.#maxCalls = options.maxCalls ?? MAX_RESOLVER_CALLS;
		this.#maxPending = options.maxPending ?? MAX_RESOLVER_PENDING;
		this.#maxWaitMs = options.maxWaitMs ?? MAX_RESOLVER_WAIT_MS;
		this.#now = options.now ?? Date.now;
		this.#requestId = options.requestId ?? defaultRequestId;
		if (
			!Number.isSafeInteger(this.#maxCalls) || this.#maxCalls < 1 ||
			!Number.isSafeInteger(this.#maxPending) || this.#maxPending < 1 ||
			!Number.isSafeInteger(this.#maxWaitMs) || this.#maxWaitMs < 1
		) throw new Error("Invalid MCP Toolbox resolver bounds");
	}

	async resolve(
		provider: ResolverProvider,
		slot: string,
		purpose: ResolverPurpose,
		signal: AbortSignal,
		deadlineAt: number,
	): Promise<string> {
		const dynamicRequirement = parseDynamicRequirementId(slot);
		if (this.#closed) throw new CredentialResolverError("lifecycle");
		if (
			provider !== ONEPASSWORD_RESOLVER_PROVIDER ||
			dynamicRequirement === undefined ||
			!RESOLVER_PURPOSES.has(purpose) ||
			dynamicRequirement.purpose !== purpose ||
			!(signal instanceof AbortSignal)
		) throw new CredentialResolverError("configuration");
		if (signal.aborted) throw new CredentialResolverError("aborted");
		if (this.#callsUsed >= this.#maxCalls) throw new CredentialResolverError("call_limit");
		if (this.#controllers.size >= this.#maxPending) {
			throw new CredentialResolverError("busy");
		}
		let now: number;
		try {
			now = this.#now();
		} catch {
			throw new CredentialResolverError("unexpected");
		}
		const effectiveDeadline = Math.min(deadlineAt, now + this.#maxWaitMs);
		if (!Number.isSafeInteger(effectiveDeadline) || effectiveDeadline <= now) {
			throw new CredentialResolverError("deadline_exceeded");
		}
		let requestId: string;
		try {
			requestId = this.#requestId();
		} catch {
			throw new CredentialResolverError("unexpected");
		}
		if (!REQUEST_ID_PATTERN.test(requestId)) throw new CredentialResolverError("unexpected");

		this.#callsUsed += 1;
		const epoch = this.#epoch;
		const controller = new AbortController();
		this.#controllers.add(controller);
		const externalAbort = (): void => controller.abort("mcp-toolbox-cancelled");
		signal.addEventListener("abort", externalAbort, { once: true });
		if (signal.aborted) externalAbort();

		return new Promise<string>((resolve, reject) => {
			let settled = false;
			let abortCode: CredentialResolverFailureCode = "aborted";
			const finish = (callback: () => void): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				controller.signal.removeEventListener("abort", onAbort);
				signal.removeEventListener("abort", externalAbort);
				this.#controllers.delete(controller);
				callback();
			};
			const fail = (code: CredentialResolverFailureCode): void => {
				finish(() => reject(new CredentialResolverError(code)));
			};
			const onAbort = (): void => fail(abortCode);
			const timer = setTimeout(() => {
				abortCode = "deadline_exceeded";
				controller.abort("resolver-deadline");
			}, effectiveDeadline - now);
			controller.signal.addEventListener("abort", onAbort, { once: true });
			if (controller.signal.aborted) {
				onAbort();
				return;
			}
			const respond = (raw: unknown): void => {
				if (settled || this.#closed || epoch !== this.#epoch || controller.signal.aborted) return;
				const response = parseResponse(raw);
				if (!response) {
					fail("response_rejected");
					return;
				}
				if (!response.ok) {
					fail(response.code as CredentialResolverFailureCode);
					return;
				}
				finish(() => resolve(response.value));
			};
			const request = Object.freeze({
				protocol: SECRET_RESOLVER_V2_PROTOCOL,
				provider,
				consumer: CONSUMER_IDENTITY,
				slot,
				purpose,
				requestId,
				deadlineAt: effectiveDeadline,
				signal: controller.signal,
				respond,
			});
			try {
				this.#bus.emit(SECRET_RESOLVER_V2_REQUEST_CHANNEL, request);
			} catch {
				fail("unavailable");
			}
		});
	}

	shutdown(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.#epoch += 1;
		for (const controller of this.#controllers) controller.abort("resolver-consumer-shutdown");
	}
}
