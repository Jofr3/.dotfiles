import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { DATABASE_PROFILE_MAX_BYTES } from "./profile.ts";
import {
	DATABASE_PROFILE_CONSUMER,
	DATABASE_PROFILE_CONTRACT,
	DATABASE_PROFILE_PROTOCOL,
	DATABASE_PROFILE_PURPOSE,
	DATABASE_PROFILE_REQUEST_CHANNEL,
	DATABASE_PROFILE_ROLE,
	DATABASE_QUERY_TOOL,
	DATABASE_REQUEST_ID_PATTERN,
	type DatabaseEventBus,
	type DatabaseProfileFailureCode,
	type DatabaseProfileRequirement,
	type DatabaseProfileResponse,
} from "./protocol.ts";

export const DATABASE_PROFILE_RESOLUTION_TIMEOUT_MS = 30_000;

export class DatabaseProfileResolutionError extends Error {
	readonly code: DatabaseProfileFailureCode;
	constructor(code: DatabaseProfileFailureCode) {
		super(`Database profile resolution failed (${code}).`);
		this.code = code;
	}
}

const PROVIDER_FAILURES = new Set<DatabaseProfileFailureCode>([
	"aborted", "binding_denied", "busy", "call_limit", "configuration", "deadline_exceeded",
	"disabled", "duplicate_request", "invalid_request", "lifecycle", "request_failed",
	"response_rejected", "sdk_unavailable", "unexpected",
]);

function exactFrozenData(value: unknown, keys: readonly string[]): Record<string, PropertyDescriptor> {
	if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.isFrozen(value)) {
		throw new DatabaseProfileResolutionError("response_rejected");
	}
	let descriptors: Record<string, PropertyDescriptor>;
	try {
		if (Object.getPrototypeOf(value) !== Object.prototype) throw new DatabaseProfileResolutionError("response_rejected");
		descriptors = Object.getOwnPropertyDescriptors(value);
		if (Reflect.ownKeys(descriptors).length !== keys.length) throw new DatabaseProfileResolutionError("response_rejected");
		for (const key of keys) {
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
				throw new DatabaseProfileResolutionError("response_rejected");
			}
		}
	} catch (error) {
		if (error instanceof DatabaseProfileResolutionError) throw error;
		throw new DatabaseProfileResolutionError("response_rejected");
	}
	return descriptors;
}

function valueOf(descriptors: Record<string, PropertyDescriptor>, key: string): unknown {
	const descriptor = descriptors[key];
	return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function parseResponse(response: unknown): string {
	if (typeof response !== "object" || response === null) throw new DatabaseProfileResolutionError("response_rejected");
	let ok: unknown;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(response, "ok");
		ok = descriptor && "value" in descriptor ? descriptor.value : undefined;
	} catch { throw new DatabaseProfileResolutionError("response_rejected"); }
	if (ok === true) {
		const fields = exactFrozenData(response, ["protocol", "ok", "value"]);
		const profile = valueOf(fields, "value");
		if (
			valueOf(fields, "protocol") !== DATABASE_PROFILE_PROTOCOL ||
			typeof profile !== "string" || profile.length === 0 ||
			Buffer.byteLength(profile, "utf8") > DATABASE_PROFILE_MAX_BYTES
		) throw new DatabaseProfileResolutionError("response_rejected");
		return profile;
	}
	if (ok === false) {
		const fields = exactFrozenData(response, ["protocol", "ok", "code"]);
		const code = valueOf(fields, "code");
		if (
			valueOf(fields, "protocol") !== DATABASE_PROFILE_PROTOCOL ||
			typeof code !== "string" || !PROVIDER_FAILURES.has(code as DatabaseProfileFailureCode)
		) throw new DatabaseProfileResolutionError("response_rejected");
		throw new DatabaseProfileResolutionError(code as DatabaseProfileFailureCode);
	}
	throw new DatabaseProfileResolutionError("response_rejected");
}

function aborted(signal: AbortSignal | undefined): boolean {
	if (signal === undefined) return false;
	try { return signal.aborted === true; } catch { return true; }
}

export interface ProfileResolverDependencies {
	readonly now?: () => number;
	readonly random?: (size: number) => Buffer;
	readonly timeoutMs?: number;
}

export class DatabaseProfileResolverConsumer {
	readonly #bus: Pick<DatabaseEventBus, "emit">;
	readonly #now: () => number;
	readonly #random: (size: number) => Buffer;
	readonly #timeoutMs: number;
	#closed = false;
	#active = new Set<Readonly<{ controller: AbortController; fail: () => void }>>();

	constructor(bus: Pick<DatabaseEventBus, "emit">, dependencies: ProfileResolverDependencies = {}) {
		this.#bus = bus;
		this.#now = dependencies.now ?? Date.now;
		this.#random = dependencies.random ?? randomBytes;
		this.#timeoutMs = dependencies.timeoutMs ?? DATABASE_PROFILE_RESOLUTION_TIMEOUT_MS;
		if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 1 || this.#timeoutMs > DATABASE_PROFILE_RESOLUTION_TIMEOUT_MS) {
			throw new Error("Invalid database profile resolver bounds");
		}
	}

	resolve(requirement: DatabaseProfileRequirement, signal?: AbortSignal): Promise<string> {
		if (this.#closed) return Promise.reject(new DatabaseProfileResolutionError("lifecycle"));
		if (aborted(signal)) return Promise.reject(new DatabaseProfileResolutionError("aborted"));
		let requestId: string;
		try { requestId = `dbr1_${this.#random(24).toString("base64url")}`; }
		catch { return Promise.reject(new DatabaseProfileResolutionError("unexpected")); }
		if (!DATABASE_REQUEST_ID_PATTERN.test(requestId)) {
			return Promise.reject(new DatabaseProfileResolutionError("unexpected"));
		}
		const controller = new AbortController();
		return new Promise<string>((resolve, reject) => {
			let settled = false;
			let active: Readonly<{ controller: AbortController; fail: () => void }>;
			const finish = (callback: () => void): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				this.#active.delete(active);
				if (signal !== undefined) {
					try { signal.removeEventListener("abort", onAbort); } catch { /* Fixed result. */ }
				}
				callback();
			};
			const onAbort = (): void => {
				try { controller.abort("database-profile-consumer-aborted"); } catch { /* Fixed result. */ }
				finish(() => reject(new DatabaseProfileResolutionError("aborted")));
			};
			const timer = setTimeout(() => {
				try { controller.abort("database-profile-consumer-timeout"); } catch { /* Fixed result. */ }
				finish(() => reject(new DatabaseProfileResolutionError("deadline_exceeded")));
			}, this.#timeoutMs);
			active = Object.freeze({
				controller,
				fail: () => {
					try { controller.abort("database-profile-consumer-invalidated"); } catch { /* Fixed result. */ }
					finish(() => reject(new DatabaseProfileResolutionError("lifecycle")));
				},
			});
			this.#active.add(active);
			if (signal !== undefined) {
				try { signal.addEventListener("abort", onAbort, { once: true }); }
				catch { onAbort(); return; }
			}
			const respond = (response: DatabaseProfileResponse): void => {
				if (settled) return;
				try {
					const profile = parseResponse(response);
					finish(() => resolve(profile));
				} catch (error) {
					const fixed = error instanceof DatabaseProfileResolutionError
						? error
						: new DatabaseProfileResolutionError("response_rejected");
					finish(() => reject(fixed));
				}
			};
			const request = Object.freeze({
				protocol: DATABASE_PROFILE_PROTOCOL,
				consumer: DATABASE_PROFILE_CONSUMER,
				tool: DATABASE_QUERY_TOOL,
				purpose: DATABASE_PROFILE_PURPOSE,
				profileRole: DATABASE_PROFILE_ROLE,
				contract: DATABASE_PROFILE_CONTRACT,
				requirementId: requirement.requirementId,
				projectScopeId: requirement.projectScopeId,
				profileName: requirement.profileName,
				requestId,
				deadlineAt: this.#now() + this.#timeoutMs,
				signal: controller.signal,
				respond,
			});
			try { this.#bus.emit(DATABASE_PROFILE_REQUEST_CHANNEL, request); }
			catch { finish(() => reject(new DatabaseProfileResolutionError("unavailable"))); }
		});
	}

	invalidate(): void {
		for (const request of [...this.#active]) request.fail();
	}

	shutdown(): void {
		this.#closed = true;
		this.invalidate();
	}
}
