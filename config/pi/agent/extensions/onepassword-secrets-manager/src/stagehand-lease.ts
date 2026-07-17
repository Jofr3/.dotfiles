import { randomBytes } from "node:crypto";

export const STAGEHAND_LEASE_PROTOCOL = "pi.stagehand.credential-lease/v1" as const;
export const STAGEHAND_LEASE_REQUEST_CHANNEL = "pi:stagehand:credential-lease:v1:request" as const;
export const STAGEHAND_LEASE_CONSUMER = "onepassword-secrets-manager" as const;
export const STAGEHAND_LEASE_PURPOSE = "login-form-fill" as const;
export const STAGEHAND_LEASE_ACQUIRE_TIMEOUT_MS = 5_000;

export interface StagehandLeasePage {
	url(): string;
	evaluate<R = unknown, A = unknown>(fn: (argument: A) => R | Promise<R>, argument?: A): Promise<R>;
	waitForLoadState(state: "load" | "domcontentloaded" | "networkidle", timeoutMs?: number): Promise<void>;
	waitForTimeout(delayMs: number): Promise<void>;
}

export interface StagehandCredentialLease {
	readonly protocol: typeof STAGEHAND_LEASE_PROTOCOL;
	readonly consumer: typeof STAGEHAND_LEASE_CONSUMER;
	readonly purpose: typeof STAGEHAND_LEASE_PURPOSE;
	isRevoked(): boolean;
	run<T>(
		operation: "login-form-fill",
		signal: AbortSignal | undefined,
		work: (page: StagehandLeasePage) => Promise<T>,
	): Promise<T>;
	release(): void;
}

export interface StagehandLeaseBus {
	emit(channel: string, data: unknown): void;
}

export interface StagehandLeaseSource {
	acquire(signal?: AbortSignal): Promise<StagehandCredentialLease>;
	reset(): void;
	shutdown(): void;
	status(): Readonly<{ cached: boolean; acquiring: boolean; closed: boolean }>;
}

function dataMethod(value: unknown, key: string): Function | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		return descriptor && "value" in descriptor && typeof descriptor.value === "function"
			? descriptor.value
			: undefined;
	} catch { return undefined; }
}

function dataValue(value: unknown, key: string): unknown {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	} catch { return undefined; }
}

function validateLease(value: unknown): StagehandCredentialLease {
	if (
		typeof value !== "object" || value === null || Array.isArray(value) || !Object.isFrozen(value) ||
		dataValue(value, "protocol") !== STAGEHAND_LEASE_PROTOCOL ||
		dataValue(value, "consumer") !== STAGEHAND_LEASE_CONSUMER ||
		dataValue(value, "purpose") !== STAGEHAND_LEASE_PURPOSE ||
		dataMethod(value, "isRevoked") === undefined ||
		dataMethod(value, "run") === undefined ||
		dataMethod(value, "release") === undefined
	) throw new Error("Stagehand credential lease is unavailable.");
	return value as StagehandCredentialLease;
}

function signalAborted(signal: AbortSignal | undefined): boolean {
	try { return signal?.aborted === true; } catch { return true; }
}

export class EventStagehandLeaseClient implements StagehandLeaseSource {
	readonly #bus: StagehandLeaseBus;
	readonly #timeoutMs: number;
	#lease: StagehandCredentialLease | undefined;
	#acquiring: Promise<StagehandCredentialLease> | undefined;
	#cancelAcquire: (() => void) | undefined;
	#closed = false;

	constructor(bus: StagehandLeaseBus, timeoutMs = STAGEHAND_LEASE_ACQUIRE_TIMEOUT_MS) {
		if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > STAGEHAND_LEASE_ACQUIRE_TIMEOUT_MS) {
			throw new Error("Invalid Stagehand lease acquisition bound.");
		}
		this.#bus = bus;
		this.#timeoutMs = timeoutMs;
	}

	async acquire(signal?: AbortSignal): Promise<StagehandCredentialLease> {
		if (this.#closed || signalAborted(signal)) throw new Error("Stagehand credential lease is unavailable.");
		if (this.#lease !== undefined) {
			let revoked = true;
			try { revoked = this.#lease.isRevoked(); } catch { revoked = true; }
			if (!revoked) return this.#lease;
			try { this.#lease.release(); } catch { /* Drop it below. */ }
			this.#lease = undefined;
		}
		if (this.#acquiring !== undefined) return this.#acquiring;
		const acquiring = this.#request(signal);
		this.#acquiring = acquiring;
		try {
			const lease = await acquiring;
			if (this.#closed || signalAborted(signal) || lease.isRevoked()) {
				try { lease.release(); } catch { /* Fixed unavailable result. */ }
				throw new Error("Stagehand credential lease is unavailable.");
			}
			this.#lease = lease;
			return lease;
		} finally {
			if (this.#acquiring === acquiring) this.#acquiring = undefined;
		}
	}

	#request(signal?: AbortSignal): Promise<StagehandCredentialLease> {
		return new Promise((resolve, reject) => {
			let settled = false;
			let cancel!: () => void;
			const finish = (callback: () => void): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				if (signal !== undefined) {
					try { signal.removeEventListener("abort", onAbort); } catch { /* Fixed result. */ }
				}
				if (this.#cancelAcquire === cancel) this.#cancelAcquire = undefined;
				callback();
			};
			const fail = () => finish(() => reject(new Error("Stagehand credential lease is unavailable.")));
			cancel = fail;
			this.#cancelAcquire = cancel;
			const onAbort = () => fail();
			const timer = setTimeout(fail, this.#timeoutMs);
			if (signal !== undefined) {
				try { signal.addEventListener("abort", onAbort, { once: true }); } catch { fail(); return; }
			}
			const respond = (candidate: StagehandCredentialLease | undefined): void => {
				if (settled) return;
				try {
					const lease = validateLease(candidate);
					finish(() => resolve(lease));
				} catch { fail(); }
			};
			let requestId: string;
			try { requestId = `shl1_${randomBytes(24).toString("base64url")}`; }
			catch { fail(); return; }
			const request = Object.freeze({
				protocol: STAGEHAND_LEASE_PROTOCOL,
				consumer: STAGEHAND_LEASE_CONSUMER,
				purpose: STAGEHAND_LEASE_PURPOSE,
				requestId,
				respond,
			});
			try { this.#bus.emit(STAGEHAND_LEASE_REQUEST_CHANNEL, request); }
			catch { fail(); }
		});
	}

	reset(): void {
		const cancel = this.#cancelAcquire;
		this.#cancelAcquire = undefined;
		try { cancel?.(); } catch { /* Reset state is authoritative. */ }
		const lease = this.#lease;
		this.#lease = undefined;
		try { lease?.release(); } catch { /* Reset state is authoritative. */ }
	}

	shutdown(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.reset();
	}

	status(): Readonly<{ cached: boolean; acquiring: boolean; closed: boolean }> {
		return Object.freeze({ cached: this.#lease !== undefined, acquiring: this.#acquiring !== undefined, closed: this.#closed });
	}
}
