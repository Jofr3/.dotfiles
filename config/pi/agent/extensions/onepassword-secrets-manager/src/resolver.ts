import {
	consumeDynamicSecretGrant,
	type DynamicSecretGrantCapability,
	hasDynamicSecretGrant,
	revokeDynamicSecretGrant,
} from "./manager.ts";
import { bindingTupleKey, type ResolverBindings } from "./resolver-bindings.ts";
import {
	ONEPASSWORD_RESOLVER_PROVIDER,
	SECRET_RESOLVER_CONSUMER_PATTERN,
	SECRET_RESOLVER_PROVIDER_PATTERN,
	SECRET_RESOLVER_PURPOSE_PATTERN,
	SECRET_RESOLVER_REQUEST_ID_PATTERN,
	SECRET_RESOLVER_LEGACY_SLOT_PATTERN,
	SECRET_RESOLVER_V2_PROTOCOL,
	SECRET_RESOLVER_V2_REQUEST_CHANNEL,
	type ResolverEventBus,
	type SecretResolverProviderFailureCode,
	type SecretResolverV2Response,
} from "./resolver-protocol.ts";
import { parseDynamicRequirementId } from "./requirements.ts";
import { PublicError, REQUEST_DEADLINE_MS } from "./safety.ts";

export const MAX_RESOLVER_CALLS = 20;
export const MAX_RESOLVER_PENDING = 4;
export const RESOLVER_DEADLINE_MS = 30_000;
export const RESOLVER_DRAIN_MS = 1_000;
export const DYNAMIC_RESOLVER_CONSUMER = "mcp-toolbox";
export const DYNAMIC_RESOLVER_PURPOSES = Object.freeze([
	"mcp-toolbox.header",
	"mcp-toolbox.auth-token",
	"mcp-toolbox.bound-param",
] as const);

export type ResolverMode = "disabled" | "static" | "dynamic";
export type DynamicResolverPurpose = typeof DYNAMIC_RESOLVER_PURPOSES[number];

const DYNAMIC_PURPOSE_SET = new Set<string>(DYNAMIC_RESOLVER_PURPOSES);
const REQUEST_KEYS = new Set([
	"protocol",
	"provider",
	"consumer",
	"slot",
	"purpose",
	"requestId",
	"deadlineAt",
	"signal",
	"respond",
]);
const REQUIRED_REQUEST_KEYS = [
	"protocol",
	"provider",
	"consumer",
	"slot",
	"purpose",
	"requestId",
	"deadlineAt",
	"respond",
] as const;
const PROVIDER_REGISTRY_SYMBOL = Symbol.for("pi.onepassword-secret-resolver.provider-registry.v2");

export interface SecretValueSource {
	resolveSecretValue(reference: string, signal?: AbortSignal, deadlineMs?: number): Promise<string>;
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
	mode: ResolverMode;
	bindingCount: number;
	grantCount: number;
	metadataEnabled: boolean;
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
	respond: (response: SecretResolverV2Response) => unknown;
}

interface ActiveInvocation {
	controller: AbortController;
	respond: (response: SecretResolverV2Response) => void;
}

interface DynamicGrantRecord {
	capability: DynamicSecretGrantCapability;
	state: "staged" | "armed";
}

class ResolverFailure {
	readonly code: SecretResolverProviderFailureCode;
	constructor(code: SecretResolverProviderFailureCode) { this.code = code; }
}

export class ResolverProviderRegistrationError extends Error {
	constructor() {
		super("A 1Password secret resolver provider is already registered on this Pi event bus.");
		this.name = "OnePasswordResolverProviderRegistrationError";
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
	if ((typeof value !== "object" && typeof value !== "function") || value === null) return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	} catch {
		return undefined;
	}
}

function extractResponder(value: unknown): ((response: SecretResolverV2Response) => unknown) | undefined {
	const responder = ownDataValue(value, "respond");
	return typeof responder === "function" ? responder as (response: SecretResolverV2Response) => unknown : undefined;
}

function isNativeAbortSignal(value: unknown): value is AbortSignal {
	try {
		return typeof AbortSignal === "function" && value instanceof AbortSignal;
	} catch {
		return false;
	}
}

function nativeSignalIsAborted(signal: AbortSignal): boolean {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted");
		if (!descriptor || typeof descriptor.get !== "function") return true;
		return Reflect.apply(descriptor.get, signal, []) === true;
	} catch {
		return true;
	}
}

function abortController(controller: AbortController, reason: string): void {
	Reflect.apply(AbortController.prototype.abort, controller, [reason]);
}

function parseRequest(value: unknown): ValidRequest {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ResolverFailure("invalid_request");
	let descriptors: Record<PropertyKey, PropertyDescriptor>;
	try {
		if (!Object.isFrozen(value)) throw new ResolverFailure("invalid_request");
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) throw new ResolverFailure("invalid_request");
		descriptors = Object.getOwnPropertyDescriptors(value);
		for (const key of Reflect.ownKeys(descriptors)) {
			if (typeof key !== "string" || !REQUEST_KEYS.has(key)) throw new ResolverFailure("invalid_request");
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new ResolverFailure("invalid_request");
		}
		for (const key of REQUIRED_REQUEST_KEYS) {
			if (!Object.hasOwn(descriptors, key)) throw new ResolverFailure("invalid_request");
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
	const provider = read("provider");
	const consumer = read("consumer");
	const slot = read("slot");
	const purpose = read("purpose");
	const requestId = read("requestId");
	const deadlineAt = read("deadlineAt");
	const signal = read("signal");
	const hasSignal = Object.hasOwn(descriptors, "signal");
	const respond = read("respond");
	const dynamicRequirement = parseDynamicRequirementId(slot);
	const validSlot = typeof slot === "string" && (
		SECRET_RESOLVER_LEGACY_SLOT_PATTERN.test(slot) || dynamicRequirement !== undefined
	);
	if (
		protocol !== SECRET_RESOLVER_V2_PROTOCOL || provider !== ONEPASSWORD_RESOLVER_PROVIDER ||
		typeof provider !== "string" || !SECRET_RESOLVER_PROVIDER_PATTERN.test(provider) ||
		typeof consumer !== "string" || !SECRET_RESOLVER_CONSUMER_PATTERN.test(consumer) ||
		!validSlot ||
		typeof purpose !== "string" || !SECRET_RESOLVER_PURPOSE_PATTERN.test(purpose) ||
		(dynamicRequirement !== undefined && dynamicRequirement.purpose !== purpose) ||
		typeof requestId !== "string" || !SECRET_RESOLVER_REQUEST_ID_PATTERN.test(requestId) ||
		!Number.isSafeInteger(deadlineAt) || (hasSignal ? !isNativeAbortSignal(signal) : signal !== undefined) ||
		typeof respond !== "function"
	) throw new ResolverFailure("invalid_request");
	return {
		consumer,
		slot,
		purpose,
		requestId,
		deadlineAt: deadlineAt as number,
		...(signal === undefined ? {} : { signal: signal as AbortSignal }),
		respond: respond as (response: SecretResolverV2Response) => unknown,
	};
}

function failureResponse(code: SecretResolverProviderFailureCode): SecretResolverV2Response {
	return Object.freeze({ protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: false, code });
}

function successResponse(value: string): SecretResolverV2Response {
	return Object.freeze({ protocol: SECRET_RESOLVER_V2_PROTOCOL, ok: true, value });
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
	callback: ((response: SecretResolverV2Response) => unknown) | undefined,
): (response: SecretResolverV2Response) => void {
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

function fixedFailureCode(error: unknown): SecretResolverProviderFailureCode {
	if (error instanceof ResolverFailure) return error.code;
	if (error instanceof PublicError) {
		switch (error.code) {
			case "aborted": return "aborted";
			case "busy": return "busy";
			case "call_limit": return "call_limit";
			case "configuration":
			case "invalid_input": return "configuration";
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
	#mode: ResolverMode = "disabled";
	#bindings: ReadonlyMap<string, string> | undefined;
	#dynamicGrants = new Map<string, DynamicGrantRecord>();
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
		) throw new Error("Invalid secret resolver provider bounds");
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
			const unsubscribe = bus.on(SECRET_RESOLVER_V2_REQUEST_CHANNEL, (data: unknown) => { this.handleRequest(data); });
			if (typeof unsubscribe !== "function") throw new ResolverProviderRegistrationError();
			this.#unsubscribe = unsubscribe;
		} catch {
			if (registry.get(bus as object) === this.#ownershipToken) registry.delete(bus as object);
			this.#bus = undefined;
			throw new ResolverProviderRegistrationError();
		}
	}

	/** Backward-compatible protected static binding enablement. */
	enable(configuration: ResolverBindings): void {
		if (this.#closed) throw new ResolverFailure("lifecycle");
		if (this.#mode === "dynamic") throw new ResolverFailure("lifecycle");
		this.#epoch += 1;
		this.#revokeActive("resolver-reenabled");
		this.#clearDynamicGrants();
		const bindings = new Map<string, string>();
		for (const binding of configuration.bindings) {
			bindings.set(bindingTupleKey(binding.consumer, binding.slot, binding.purpose), binding.secretReference);
		}
		this.#bindings = bindings;
		this.#mode = "static";
	}

	enableDynamic(): void {
		if (this.#closed || this.#mode !== "disabled") throw new ResolverFailure("lifecycle");
		this.#epoch += 1;
		this.#bindings = undefined;
		this.#clearDynamicGrants();
		this.#revokeActive("resolver-dynamic-enabled");
		this.#mode = "dynamic";
	}

	installDynamicGrant(
		slot: string,
		purpose: DynamicResolverPurpose,
		capability: DynamicSecretGrantCapability,
	): void {
		const requirement = parseDynamicRequirementId(slot);
		if (
			this.#closed || this.#mode !== "dynamic" || requirement?.purpose !== purpose ||
			!DYNAMIC_PURPOSE_SET.has(purpose) || !hasDynamicSecretGrant(capability)
		) {
			revokeDynamicSecretGrant(capability);
			throw new ResolverFailure("lifecycle");
		}
		const key = bindingTupleKey(DYNAMIC_RESOLVER_CONSUMER, slot, purpose);
		const existing = this.#dynamicGrants.get(key);
		if (existing !== undefined) revokeDynamicSecretGrant(existing.capability);
		this.#dynamicGrants.set(key, { capability, state: "staged" });
	}

	revokeDynamicGrant(slot: string, purpose: DynamicResolverPurpose): void {
		if (parseDynamicRequirementId(slot)?.purpose !== purpose || !DYNAMIC_PURPOSE_SET.has(purpose)) return;
		const key = bindingTupleKey(DYNAMIC_RESOLVER_CONSUMER, slot, purpose);
		const existing = this.#dynamicGrants.get(key);
		if (existing === undefined) return;
		this.#dynamicGrants.delete(key);
		revokeDynamicSecretGrant(existing.capability);
	}

	revokeAllDynamicGrants(): void {
		this.#clearDynamicGrants();
	}

	/** Staged grants become usable only after the grant tool's turn has ended. */
	armDynamicGrants(): void {
		if (this.#closed || this.#mode !== "dynamic") return;
		for (const grant of this.#dynamicGrants.values()) grant.state = "armed";
	}

	disable(): Promise<void> {
		if (this.#closed) return this.#shutdownDrain ?? Promise.resolve();
		this.#epoch += 1;
		this.#mode = "disabled";
		this.#bindings = undefined;
		this.#clearDynamicGrants();
		this.#revokeActive("resolver-disabled");
		return boundedDrain([...this.#activeWork], this.#drainMs);
	}

	shutdown(): Promise<void> {
		if (this.#shutdownDrain !== undefined) return this.#shutdownDrain;
		this.#closed = true;
		this.#epoch += 1;
		this.#mode = "disabled";
		this.#bindings = undefined;
		this.#clearDynamicGrants();
		this.#unsubscribeFromBus();
		this.#revokeActive("resolver-shutdown");
		this.#shutdownDrain = boundedDrain([...this.#activeWork], this.#drainMs);
		return this.#shutdownDrain;
	}

	status(): ResolverProviderStatus {
		const mode = this.#closed ? "disabled" : this.#mode;
		return {
			enabled: mode !== "disabled",
			mode,
			bindingCount: mode === "static" ? this.#bindings?.size ?? 0 : 0,
			grantCount: mode === "dynamic" ? this.#dynamicGrants.size : 0,
			metadataEnabled: mode === "dynamic",
			callsUsed: this.#callsUsed,
			callLimit: this.#maxCalls,
			pending: this.#pending,
			pendingLimit: this.#maxPending,
		};
	}

	handleRequest(data: unknown): void {
		if (this.#closed) return;
		if (ownDataValue(data, "provider") !== ONEPASSWORD_RESOLVER_PROVIDER) return;
		const fallbackRespond = oneShotResponder(extractResponder(data));
		try {
			const request = parseRequest(data);
			const respond = oneShotResponder(request.respond);
			void this.#process(request, respond).catch(() => { respond(failureResponse("unexpected")); });
		} catch {
			fallbackRespond(failureResponse("invalid_request"));
		}
	}

	#clearDynamicGrants(): void {
		for (const grant of this.#dynamicGrants.values()) revokeDynamicSecretGrant(grant.capability);
		this.#dynamicGrants.clear();
	}

	#unsubscribeFromBus(): void {
		const unsubscribe = this.#unsubscribe;
		this.#unsubscribe = undefined;
		try { unsubscribe?.(); } catch { /* Closed guard keeps a stale listener inert. */ }
		const bus = this.#bus;
		this.#bus = undefined;
		if (bus !== undefined) {
			try {
				const registry = providerRegistry();
				if (registry.get(bus) === this.#ownershipToken) registry.delete(bus);
			} catch {
				// Closed listeners remain inert if registry inspection fails.
			}
		}
	}

	#revokeActive(reason: string): void {
		const lifecycle = failureResponse("lifecycle");
		for (const invocation of this.#invocations) {
			invocation.respond(lifecycle);
			try { abortController(invocation.controller, reason); } catch { /* Late SDK work is discarded. */ }
		}
	}

	#enqueue<T>(task: () => Promise<T>): Promise<T> {
		const operation = this.#operationTail.then(task, task);
		this.#operationTail = operation.then(() => undefined, () => undefined);
		return operation;
	}

	#trackOperation(operation: Promise<unknown>): void {
		const drain = operation.then(() => undefined, () => undefined);
		this.#activeWork.add(drain);
		void drain.then(() => {
			this.#activeWork.delete(drain);
			this.#pending = Math.max(0, this.#pending - 1);
		});
	}

	async #process(request: ValidRequest, respond: (response: SecretResolverV2Response) => void): Promise<void> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let externalAbort: (() => void) | undefined;
		let invocation: ActiveInvocation | undefined;
		let admitted = false;
		let operationTracked = false;
		let timedOut = false;
		const requestEpoch = this.#epoch;
		try {
			if (this.#closed) throw new ResolverFailure("lifecycle");
			const mode = this.#mode;
			if (mode === "disabled") throw new ResolverFailure("disabled");
			const tuple = bindingTupleKey(request.consumer, request.slot, request.purpose);
			let reference: string | undefined;
			let dynamicGrant: DynamicGrantRecord | undefined;
			if (mode === "static") {
				reference = this.#bindings?.get(tuple);
			} else {
				dynamicGrant = this.#dynamicGrants.get(tuple);
				if (dynamicGrant?.state !== "armed") dynamicGrant = undefined;
			}
			if (reference === undefined && dynamicGrant === undefined) throw new ResolverFailure("binding_denied");
			if (request.signal !== undefined && nativeSignalIsAborted(request.signal)) throw new ResolverFailure("aborted");
			const remaining = request.deadlineAt - this.#now();
			if (remaining <= 0) throw new ResolverFailure("deadline_exceeded");
			if (this.#seenRequestIds.has(request.requestId)) throw new ResolverFailure("duplicate_request");
			if (this.#callsUsed >= this.#maxCalls) throw new ResolverFailure("call_limit");
			if (this.#pending >= this.#maxPending) throw new ResolverFailure("busy");

			if (dynamicGrant !== undefined) {
				if (this.#dynamicGrants.get(tuple) !== dynamicGrant) throw new ResolverFailure("binding_denied");
				reference = consumeDynamicSecretGrant(dynamicGrant.capability);
				this.#dynamicGrants.delete(tuple);
				if (reference === undefined) throw new ResolverFailure("lifecycle");
			}
			if (reference === undefined) throw new ResolverFailure("binding_denied");
			this.#seenRequestIds.add(request.requestId);
			this.#callsUsed += 1;
			this.#pending += 1;
			admitted = true;

			const controller = new AbortController();
			invocation = { controller, respond };
			this.#invocations.add(invocation);
			externalAbort = () => abortController(controller, "consumer-aborted");
			if (request.signal !== undefined) {
				EventTarget.prototype.addEventListener.call(request.signal, "abort", externalAbort, { once: true });
			}
			const timeoutMs = Math.min(remaining, this.#deadlineMs);
			timer = setTimeout(() => {
				timedOut = true;
				try { abortController(controller, "resolver-deadline"); } catch { /* Late work is discarded. */ }
			}, timeoutMs);

			const operation = this.#enqueue(async () => {
				if (nativeSignalIsAborted(controller.signal)) {
					throw new ResolverFailure(
						timedOut ? "deadline_exceeded" : requestEpoch !== this.#epoch || this.#closed ? "lifecycle" : "aborted",
					);
				}
				if (this.#closed || requestEpoch !== this.#epoch) throw new ResolverFailure("lifecycle");
				return this.#source.resolveSecretValue(reference, controller.signal, timeoutMs);
			});
			this.#trackOperation(operation);
			operationTracked = true;

			const value = await new Promise<string>((resolve, reject) => {
				let settled = false;
				const finish = (callback: () => void): void => {
					if (settled) return;
					settled = true;
					EventTarget.prototype.removeEventListener.call(controller.signal, "abort", onAbort);
					callback();
				};
				const onAbort = (): void => finish(() => reject(new ResolverFailure(
					timedOut ? "deadline_exceeded" : requestEpoch !== this.#epoch || this.#closed ? "lifecycle" : "aborted",
				)));
				EventTarget.prototype.addEventListener.call(controller.signal, "abort", onAbort, { once: true });
				if (nativeSignalIsAborted(controller.signal)) { onAbort(); return; }
				operation.then(
					(secret) => finish(() => resolve(secret)),
					(error: unknown) => finish(() => reject(error)),
				);
			});
			if (this.#closed || requestEpoch !== this.#epoch) throw new ResolverFailure("lifecycle");
			if (nativeSignalIsAborted(controller.signal)) throw new ResolverFailure(timedOut ? "deadline_exceeded" : "aborted");
			if (typeof value !== "string") throw new ResolverFailure("response_rejected");
			respond(successResponse(value));
		} catch (error) {
			respond(failureResponse(fixedFailureCode(error)));
		} finally {
			if (timer !== undefined) clearTimeout(timer);
			if (externalAbort !== undefined && request.signal !== undefined) {
				try { EventTarget.prototype.removeEventListener.call(request.signal, "abort", externalAbort); } catch { /* Fixed result. */ }
			}
			if (invocation !== undefined) this.#invocations.delete(invocation);
			if (admitted && !operationTracked) this.#pending = Math.max(0, this.#pending - 1);
		}
	}
}
