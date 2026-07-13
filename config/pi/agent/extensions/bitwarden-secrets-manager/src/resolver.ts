import { bindingTupleKey, type ResolverBindings } from "./resolver-bindings.ts";
import {
	SECRET_RESOLVER_CONSUMER_PATTERN,
	SECRET_RESOLVER_PROTOCOL,
	SECRET_RESOLVER_PURPOSE_PATTERN,
	SECRET_RESOLVER_REQUEST_CHANNEL,
	SECRET_RESOLVER_REQUEST_ID_PATTERN,
	SECRET_RESOLVER_SLOT_PATTERN,
	type ResolverEventBus,
	type SecretResolverFailureCode,
	type SecretResolverResponse,
} from "./resolver-protocol.ts";
import { PublicError, REQUEST_DEADLINE_MS } from "./safety.ts";

export const MAX_RESOLVER_CALLS = 20;
export const MAX_RESOLVER_PENDING = 4;
export const RESOLVER_DEADLINE_MS = 30_000;
export const RESOLVER_DRAIN_MS = 1_000;

const REQUEST_KEYS = new Set([
	"protocol",
	"consumer",
	"slot",
	"purpose",
	"requestId",
	"deadlineAt",
	"signal",
	"respond",
]);
const PROVIDER_REGISTRY_SYMBOL = Symbol.for("pi.bitwarden-secret-resolver.provider-registry.v1");

export interface SecretValueSource {
	resolveSecretValue(secretId: string, signal?: AbortSignal, deadlineMs?: number): Promise<string>;
}

export interface ResolverProviderOptions {
	maxCalls?: number;
	maxPending?: number;
	deadlineMs?: number;
	drainMs?: number;
	now?: () => number;
}

export interface ResolverProviderStatus {
	enabled: boolean;
	bindingCount: number;
	callsUsed: number;
	callLimit: number;
	pending: number;
	pendingLimit: number;
}

interface ValidRequest {
	consumer: string;
	slot: string;
	purpose: string;
	requestId: string;
	deadlineAt: number;
	signal?: AbortSignal;
	respond: (response: SecretResolverResponse) => unknown;
}

interface ActiveInvocation {
	controller: AbortController;
	respond: (response: SecretResolverResponse) => void;
}

class ResolverFailure {
	readonly code: SecretResolverFailureCode;

	constructor(code: SecretResolverFailureCode) {
		this.code = code;
	}
}

export class ResolverProviderRegistrationError extends Error {
	constructor() {
		super("A Bitwarden secret resolver provider is already registered on this Pi event bus.");
		this.name = "BitwardenResolverProviderRegistrationError";
	}
}

function providerRegistry(): WeakMap<object, object> {
	let descriptor: PropertyDescriptor | undefined;
	try {
		descriptor = Object.getOwnPropertyDescriptor(globalThis, PROVIDER_REGISTRY_SYMBOL);
	} catch {
		throw new ResolverProviderRegistrationError();
	}
	if (descriptor !== undefined) {
		if (!("value" in descriptor) || !(descriptor.value instanceof WeakMap)) {
			throw new ResolverProviderRegistrationError();
		}
		return descriptor.value as WeakMap<object, object>;
	}

	const registry = new WeakMap<object, object>();
	try {
		Object.defineProperty(globalThis, PROVIDER_REGISTRY_SYMBOL, {
			value: registry,
			configurable: false,
			enumerable: false,
			writable: false,
		});
	} catch {
		throw new ResolverProviderRegistrationError();
	}
	return registry;
}

function ownDataValue(value: unknown, key: string): unknown {
	if (typeof value !== "object" || value === null) return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	} catch {
		return undefined;
	}
}

function extractResponder(value: unknown): ((response: SecretResolverResponse) => unknown) | undefined {
	const responder = ownDataValue(value, "respond");
	return typeof responder === "function" ? responder as (response: SecretResolverResponse) => unknown : undefined;
}

function isNativeAbortSignal(value: unknown): value is AbortSignal {
	if (value === undefined) return true;
	try {
		return typeof AbortSignal === "function" && value instanceof AbortSignal;
	} catch {
		return false;
	}
}

function parseRequest(value: unknown): ValidRequest {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new ResolverFailure("invalid_request");
	}
	let descriptors: Record<PropertyKey, PropertyDescriptor>;
	try {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) throw new ResolverFailure("invalid_request");
		descriptors = Object.getOwnPropertyDescriptors(value);
		for (const key of Reflect.ownKeys(descriptors)) {
			if (typeof key !== "string" || !REQUEST_KEYS.has(key)) throw new ResolverFailure("invalid_request");
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
				throw new ResolverFailure("invalid_request");
			}
		}
	} catch (error) {
		if (error instanceof ResolverFailure) throw error;
		throw new ResolverFailure("invalid_request");
	}
	const read = (key: string): unknown => {
		const descriptor = descriptors[key];
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	};
	const protocol = read("protocol");
	const consumer = read("consumer");
	const slot = read("slot");
	const purpose = read("purpose");
	const requestId = read("requestId");
	const deadlineAt = read("deadlineAt");
	const signal = read("signal");
	const respond = read("respond");
	if (
		protocol !== SECRET_RESOLVER_PROTOCOL ||
		typeof consumer !== "string" ||
		!SECRET_RESOLVER_CONSUMER_PATTERN.test(consumer) ||
		typeof slot !== "string" ||
		!SECRET_RESOLVER_SLOT_PATTERN.test(slot) ||
		typeof purpose !== "string" ||
		!SECRET_RESOLVER_PURPOSE_PATTERN.test(purpose) ||
		typeof requestId !== "string" ||
		!SECRET_RESOLVER_REQUEST_ID_PATTERN.test(requestId) ||
		!Number.isSafeInteger(deadlineAt) ||
		!isNativeAbortSignal(signal) ||
		typeof respond !== "function"
	) {
		throw new ResolverFailure("invalid_request");
	}
	return {
		consumer,
		slot,
		purpose,
		requestId,
		deadlineAt: deadlineAt as number,
		...(signal === undefined ? {} : { signal }),
		respond: respond as (response: SecretResolverResponse) => unknown,
	};
}

function failureResponse(code: SecretResolverFailureCode): SecretResolverResponse {
	return Object.freeze({ protocol: SECRET_RESOLVER_PROTOCOL, ok: false, code });
}

function successResponse(value: string): SecretResolverResponse {
	return Object.freeze({ protocol: SECRET_RESOLVER_PROTOCOL, ok: true, value });
}

function safelyConsumeCallbackResult(value: unknown): void {
	if (value === undefined || value === null) return;
	try {
		Promise.resolve(value).catch(() => undefined);
	} catch {
		// A hostile thenable must not escape into Pi's event-bus logger.
	}
}

function oneShotResponder(
	callback: ((response: SecretResolverResponse) => unknown) | undefined,
): (response: SecretResolverResponse) => void {
	let used = false;
	return (response) => {
		if (used || callback === undefined) return;
		used = true;
		try {
			safelyConsumeCallbackResult(Reflect.apply(callback, undefined, [response]));
		} catch {
			// Consumer exceptions can contain a secret and are intentionally ignored.
		}
	};
}

function fixedFailureCode(error: unknown): SecretResolverFailureCode {
	if (error instanceof ResolverFailure) return error.code;
	if (error instanceof PublicError) {
		switch (error.code) {
			case "aborted": return "aborted";
			case "call_limit": return "call_limit";
			case "configuration": return "configuration";
			case "lifecycle": return "lifecycle";
			case "request": return "request_failed";
			case "response": return "response_rejected";
			case "sdk": return "sdk_unavailable";
			case "timeout": return "deadline_exceeded";
			default: return "unexpected";
		}
	}
	return "unexpected";
}

function boundedDrain(work: readonly Promise<void>[], drainMs: number): Promise<void> {
	if (work.length === 0) return Promise.resolve();
	return new Promise((resolve) => {
		let settled = false;
		const finish = (): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(finish, drainMs);
		void Promise.all(work).then(finish, finish);
	});
}

export class SecretResolverProvider {
	readonly #source: SecretValueSource;
	readonly #maxCalls: number;
	readonly #maxPending: number;
	readonly #deadlineMs: number;
	readonly #drainMs: number;
	readonly #now: () => number;
	readonly #ownershipToken = Object.freeze({});
	#bindings: ReadonlyMap<string, string> | undefined;
	#unsubscribe: (() => void) | undefined;
	#bus: object | undefined;
	#callsUsed = 0;
	#pending = 0;
	#epoch = 0;
	#closed = false;
	#seenRequestIds = new Set<string>();
	#invocations = new Set<ActiveInvocation>();
	#activeWork = new Set<Promise<void>>();
	#operationTail: Promise<void> = Promise.resolve();
	#shutdownDrain: Promise<void> | undefined;

	constructor(source: SecretValueSource, options: ResolverProviderOptions = {}) {
		this.#source = source;
		this.#maxCalls = options.maxCalls ?? MAX_RESOLVER_CALLS;
		this.#maxPending = options.maxPending ?? MAX_RESOLVER_PENDING;
		this.#deadlineMs = options.deadlineMs ?? RESOLVER_DEADLINE_MS;
		this.#drainMs = options.drainMs ?? RESOLVER_DRAIN_MS;
		this.#now = options.now ?? Date.now;
		if (
			!Number.isSafeInteger(this.#maxCalls) || this.#maxCalls < 1 ||
			!Number.isSafeInteger(this.#maxPending) || this.#maxPending < 1 ||
			!Number.isSafeInteger(this.#deadlineMs) || this.#deadlineMs < 1 || this.#deadlineMs > RESOLVER_DEADLINE_MS ||
			!Number.isSafeInteger(this.#drainMs) || this.#drainMs < 1 || this.#drainMs > REQUEST_DEADLINE_MS
		) {
			throw new Error("Invalid secret resolver provider bounds");
		}
	}

	start(bus: ResolverEventBus): void {
		if (this.#closed) throw new ResolverProviderRegistrationError();
		if (this.#unsubscribe !== undefined) return;
		if ((typeof bus !== "object" && typeof bus !== "function") || bus === null) {
			throw new ResolverProviderRegistrationError();
		}

		const registry = providerRegistry();
		if (registry.has(bus as object)) throw new ResolverProviderRegistrationError();
		registry.set(bus as object, this.#ownershipToken);
		this.#bus = bus as object;
		try {
			const unsubscribe = bus.on(SECRET_RESOLVER_REQUEST_CHANNEL, (data: unknown) => {
				this.handleRequest(data);
			});
			if (typeof unsubscribe !== "function") throw new ResolverProviderRegistrationError();
			this.#unsubscribe = unsubscribe;
		} catch {
			if (registry.get(bus as object) === this.#ownershipToken) registry.delete(bus as object);
			this.#bus = undefined;
			throw new ResolverProviderRegistrationError();
		}
	}

	enable(configuration: ResolverBindings): void {
		if (this.#closed) throw new ResolverFailure("lifecycle");
		this.#epoch += 1;
		this.#revokeActive("resolver-reenabled");
		const bindings = new Map<string, string>();
		for (const binding of configuration.bindings) {
			bindings.set(bindingTupleKey(binding.consumer, binding.slot, binding.purpose), binding.secretId);
		}
		this.#bindings = bindings;
	}

	disable(): Promise<void> {
		if (this.#closed) return this.#shutdownDrain ?? Promise.resolve();
		this.#epoch += 1;
		this.#bindings = undefined;
		this.#revokeActive("resolver-disabled");
		return boundedDrain([...this.#activeWork], this.#drainMs);
	}

	shutdown(): Promise<void> {
		if (this.#shutdownDrain !== undefined) return this.#shutdownDrain;
		this.#closed = true;
		this.#epoch += 1;
		this.#bindings = undefined;
		this.#unsubscribeFromBus();
		this.#revokeActive("resolver-shutdown");
		this.#shutdownDrain = boundedDrain([...this.#activeWork], this.#drainMs);
		return this.#shutdownDrain;
	}

	status(): ResolverProviderStatus {
		return {
			enabled: !this.#closed && this.#bindings !== undefined,
			bindingCount: this.#bindings?.size ?? 0,
			callsUsed: this.#callsUsed,
			callLimit: this.#maxCalls,
			pending: this.#pending,
			pendingLimit: this.#maxPending,
		};
	}

	handleRequest(data: unknown): void {
		if (this.#closed) return;
		const fallbackRespond = oneShotResponder(extractResponder(data));
		try {
			const request = parseRequest(data);
			const respond = oneShotResponder(request.respond);
			void this.#process(request, respond).catch(() => {
				respond(failureResponse("unexpected"));
			});
		} catch (error) {
			fallbackRespond(failureResponse(fixedFailureCode(error)));
		}
	}

	#unsubscribeFromBus(): void {
		const unsubscribe = this.#unsubscribe;
		this.#unsubscribe = undefined;
		try {
			unsubscribe?.();
		} catch {
			// The closed guard makes a stale listener inert if unsubscription fails.
		}
		const bus = this.#bus;
		this.#bus = undefined;
		if (bus !== undefined) {
			try {
				const registry = providerRegistry();
				if (registry.get(bus) === this.#ownershipToken) registry.delete(bus);
			} catch {
				// Ownership was already established; closed listeners still fail inertly.
			}
		}
	}

	#revokeActive(reason: string): void {
		const lifecycle = failureResponse("lifecycle");
		for (const invocation of this.#invocations) {
			invocation.respond(lifecycle);
			try {
				invocation.controller.abort(reason);
			} catch {
				// Native AbortController failures are treated as non-cancellable work.
			}
		}
	}

	#enqueue<T>(task: () => Promise<T>): Promise<T> {
		const operation = this.#operationTail.then(task, task);
		this.#operationTail = operation.then(
			() => undefined,
			() => undefined,
		);
		return operation;
	}

	#trackOperation(operation: Promise<unknown>): void {
		const drain = operation.then(
			() => undefined,
			() => undefined,
		);
		this.#activeWork.add(drain);
		void drain.then(() => {
			this.#activeWork.delete(drain);
			this.#pending = Math.max(0, this.#pending - 1);
		});
	}

	async #process(request: ValidRequest, respond: (response: SecretResolverResponse) => void): Promise<void> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let externalAbort: (() => void) | undefined;
		let invocation: ActiveInvocation | undefined;
		let operationTracked = false;
		let timedOut = false;
		const requestEpoch = this.#epoch;
		try {
			if (this.#closed) throw new ResolverFailure("lifecycle");
			const bindings = this.#bindings;
			if (bindings === undefined) throw new ResolverFailure("disabled");
			const secretId = bindings.get(bindingTupleKey(request.consumer, request.slot, request.purpose));
			if (secretId === undefined) throw new ResolverFailure("binding_denied");
			if (request.signal?.aborted) throw new ResolverFailure("aborted");
			const remaining = request.deadlineAt - this.#now();
			if (remaining <= 0) throw new ResolverFailure("deadline_exceeded");
			if (this.#seenRequestIds.has(request.requestId)) throw new ResolverFailure("duplicate_request");
			if (this.#callsUsed >= this.#maxCalls) throw new ResolverFailure("call_limit");
			if (this.#pending >= this.#maxPending) throw new ResolverFailure("busy");

			this.#seenRequestIds.add(request.requestId);
			this.#callsUsed += 1;
			this.#pending += 1;

			const controller = new AbortController();
			invocation = { controller, respond };
			this.#invocations.add(invocation);
			externalAbort = () => controller.abort("consumer-aborted");
			if (request.signal !== undefined) {
				EventTarget.prototype.addEventListener.call(request.signal, "abort", externalAbort, { once: true });
			}
			const timeoutMs = Math.min(remaining, this.#deadlineMs);
			timer = setTimeout(() => {
				timedOut = true;
				controller.abort("resolver-deadline");
			}, timeoutMs);

			const operation = this.#enqueue(async () => {
				if (controller.signal.aborted) {
					throw new ResolverFailure(timedOut ? "deadline_exceeded" : requestEpoch !== this.#epoch || this.#closed ? "lifecycle" : "aborted");
				}
				if (this.#closed || requestEpoch !== this.#epoch) throw new ResolverFailure("lifecycle");
				return this.#source.resolveSecretValue(secretId, controller.signal, timeoutMs);
			});
			this.#trackOperation(operation);
			operationTracked = true;

			const value = await new Promise<string>((resolve, reject) => {
				let settled = false;
				const finish = (callback: () => void): void => {
					if (settled) return;
					settled = true;
					controller.signal.removeEventListener("abort", onAbort);
					callback();
				};
				const onAbort = (): void => finish(() => reject(new ResolverFailure(
					timedOut ? "deadline_exceeded" : requestEpoch !== this.#epoch || this.#closed ? "lifecycle" : "aborted",
				)));
				controller.signal.addEventListener("abort", onAbort, { once: true });
				if (controller.signal.aborted) {
					onAbort();
					return;
				}
				operation.then(
					(secret) => finish(() => resolve(secret)),
					(error: unknown) => finish(() => reject(error)),
				);
			});
			if (this.#closed || requestEpoch !== this.#epoch) throw new ResolverFailure("lifecycle");
			if (controller.signal.aborted) throw new ResolverFailure(timedOut ? "deadline_exceeded" : "aborted");
			if (typeof value !== "string") throw new ResolverFailure("response_rejected");
			respond(successResponse(value));
		} catch (error) {
			respond(failureResponse(fixedFailureCode(error)));
		} finally {
			if (timer !== undefined) clearTimeout(timer);
			if (externalAbort !== undefined && request.signal !== undefined) {
				try {
					EventTarget.prototype.removeEventListener.call(request.signal, "abort", externalAbort);
				} catch {
					// A native signal with a hostile override must not escape this handler.
				}
			}
			if (invocation !== undefined) this.#invocations.delete(invocation);
			if (invocation !== undefined && !operationTracked) {
				this.#pending = Math.max(0, this.#pending - 1);
			}
		}
	}
}
