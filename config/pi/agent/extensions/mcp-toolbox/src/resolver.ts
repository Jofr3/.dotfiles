import { randomBytes } from "node:crypto";

const SECRET_RESOLVER_PROTOCOL = "pi.secret-resolver/v1" as const;
const SECRET_RESOLVER_REQUEST_CHANNEL = "pi:secret-resolver:v1:request" as const;
const CONSUMER_IDENTITY = "mcp-toolbox";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const MAX_VALUE_BYTES = 64 * 1024;
const MAX_RESOLVER_CALLS = 20;
const MAX_RESOLVER_PENDING = 4;
const MAX_RESOLVER_WAIT_MS = 30_000;

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
	| Readonly<{ protocol: typeof SECRET_RESOLVER_PROTOCOL; ok: true; value: string }>
	| Readonly<{ protocol: typeof SECRET_RESOLVER_PROTOCOL; ok: false; code: string }>;

export class CredentialResolverError extends Error {
	constructor() {
		super("MCP Toolbox credential resolution failed; the configured provider was unavailable or did not approve the request");
		this.name = "McpToolboxCredentialResolverError";
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
	const object = ownDataRecord(value);
	if (!object || object.protocol !== SECRET_RESOLVER_PROTOCOL || typeof object.ok !== "boolean") return undefined;
	const keys = Object.keys(object).sort().join(",");
	if (object.ok === true) {
		if (keys !== "ok,protocol,value") return undefined;
		if (
			typeof object.value !== "string" ||
			object.value.length === 0 ||
			Buffer.byteLength(object.value, "utf8") > MAX_VALUE_BYTES ||
			/[\r\n\0]/u.test(object.value)
		) return undefined;
		return { protocol: SECRET_RESOLVER_PROTOCOL, ok: true, value: object.value };
	}
	if (keys !== "code,ok,protocol" || typeof object.code !== "string" || !FAILURE_CODES.has(object.code)) {
		return undefined;
	}
	return { protocol: SECRET_RESOLVER_PROTOCOL, ok: false, code: object.code };
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

	async resolve(slot: string, purpose: ResolverPurpose, signal: AbortSignal, deadlineAt: number): Promise<string> {
		if (this.#closed || signal.aborted) throw new CredentialResolverError();
		if (this.#callsUsed >= this.#maxCalls || this.#controllers.size >= this.#maxPending) {
			throw new CredentialResolverError();
		}
		const now = this.#now();
		const effectiveDeadline = Math.min(deadlineAt, now + this.#maxWaitMs);
		if (!Number.isSafeInteger(effectiveDeadline) || effectiveDeadline <= now) throw new CredentialResolverError();
		let requestId: string;
		try {
			requestId = this.#requestId();
		} catch {
			throw new CredentialResolverError();
		}
		if (!REQUEST_ID_PATTERN.test(requestId)) throw new CredentialResolverError();

		this.#callsUsed += 1;
		const epoch = this.#epoch;
		const controller = new AbortController();
		this.#controllers.add(controller);
		const externalAbort = (): void => controller.abort("mcp-toolbox-cancelled");
		signal.addEventListener("abort", externalAbort, { once: true });
		if (signal.aborted) externalAbort();

		return new Promise<string>((resolve, reject) => {
			let settled = false;
			const finish = (callback: () => void): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				controller.signal.removeEventListener("abort", onAbort);
				signal.removeEventListener("abort", externalAbort);
				this.#controllers.delete(controller);
				callback();
			};
			const fail = (): void => finish(() => reject(new CredentialResolverError()));
			const onAbort = (): void => fail();
			const timer = setTimeout(() => controller.abort("resolver-deadline"), effectiveDeadline - now);
			controller.signal.addEventListener("abort", onAbort, { once: true });
			if (controller.signal.aborted) {
				onAbort();
				return;
			}
			const respond = (raw: unknown): void => {
				if (settled || this.#closed || epoch !== this.#epoch || controller.signal.aborted) return;
				const response = parseResponse(raw);
				if (!response || !response.ok) {
					fail();
					return;
				}
				finish(() => resolve(response.value));
			};
			const request = Object.freeze({
				protocol: SECRET_RESOLVER_PROTOCOL,
				consumer: CONSUMER_IDENTITY,
				slot,
				purpose,
				requestId,
				deadlineAt: effectiveDeadline,
				signal: controller.signal,
				respond,
			});
			try {
				this.#bus.emit(SECRET_RESOLVER_REQUEST_CHANNEL, request);
			} catch {
				fail();
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
