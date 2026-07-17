import type { StagehandManager, StagehandInstance } from "./manager.ts";

export const STAGEHAND_LEASE_PROTOCOL = "pi.stagehand.credential-lease/v1" as const;
export const STAGEHAND_LEASE_REQUEST_CHANNEL = "pi:stagehand:credential-lease:v1:request" as const;
export const STAGEHAND_LEASE_CONSUMER = "onepassword-secrets-manager" as const;
export const STAGEHAND_LEASE_PURPOSE = "login-form-fill" as const;
export const STAGEHAND_LEASE_TIMEOUT_MS = 30_000;

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

export interface StagehandLeaseEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
}

interface LeaseRequest {
	readonly protocol: typeof STAGEHAND_LEASE_PROTOCOL;
	readonly consumer: typeof STAGEHAND_LEASE_CONSUMER;
	readonly purpose: typeof STAGEHAND_LEASE_PURPOSE;
	readonly requestId: string;
	readonly respond: (lease: StagehandCredentialLease | undefined) => unknown;
}

const REQUEST_KEYS = new Set(["protocol", "consumer", "purpose", "requestId", "respond"]);
const REQUEST_ID_PATTERN = /^shl1_[A-Za-z0-9_-]{32}$/u;

function parseRequest(value: unknown): LeaseRequest | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.isFrozen(value)) return undefined;
	try {
		if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
		const descriptors = Object.getOwnPropertyDescriptors(value);
		if (Reflect.ownKeys(descriptors).length !== REQUEST_KEYS.size) return undefined;
		for (const key of Reflect.ownKeys(descriptors)) {
			if (typeof key !== "string" || !REQUEST_KEYS.has(key)) return undefined;
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
		}
		const read = (key: string) => descriptors[key] && "value" in descriptors[key]! ? descriptors[key]!.value : undefined;
		if (
			read("protocol") !== STAGEHAND_LEASE_PROTOCOL ||
			read("consumer") !== STAGEHAND_LEASE_CONSUMER ||
			read("purpose") !== STAGEHAND_LEASE_PURPOSE ||
			typeof read("requestId") !== "string" || !REQUEST_ID_PATTERN.test(read("requestId") as string) ||
			typeof read("respond") !== "function"
		) return undefined;
		return value as LeaseRequest;
	} catch { return undefined; }
}

function safelyRespond(callback: (lease: StagehandCredentialLease | undefined) => unknown, lease: StagehandCredentialLease | undefined): void {
	try {
		const returned = Reflect.apply(callback, undefined, [lease]);
		if (returned !== undefined && returned !== null) Promise.resolve(returned).catch(() => undefined);
	} catch { /* A consumer error never enters Stagehand output. */ }
}

function pageFacade(manager: StagehandManager, stagehand: StagehandInstance): StagehandLeasePage {
	const page = manager.authorizedPage(stagehand);
	return Object.freeze({
		url: () => page.url(),
		evaluate: <R = unknown, A = unknown>(fn: (argument: A) => R | Promise<R>, argument?: A) => page.evaluate(fn, argument),
		waitForLoadState: (state: "load" | "domcontentloaded" | "networkidle", timeoutMs?: number) => page.waitForLoadState(state, timeoutMs),
		waitForTimeout: (delayMs: number) => page.waitForTimeout(delayMs),
	});
}

export class StagehandCredentialLeaseBroker {
	readonly #manager: StagehandManager;
	#unsubscribe: (() => void) | undefined;
	#leases = new Set<{ revoked: boolean }>();
	#epoch = 0;
	#closed = false;

	constructor(manager: StagehandManager) { this.#manager = manager; }

	start(bus: StagehandLeaseEventBus): void {
		if (this.#closed || this.#unsubscribe !== undefined) return;
		const unsubscribe = bus.on(STAGEHAND_LEASE_REQUEST_CHANNEL, (data) => {
			const request = parseRequest(data);
			if (request === undefined || this.#closed) return;
			safelyRespond(request.respond, this.#createLease());
		});
		if (typeof unsubscribe !== "function") throw new Error("Stagehand credential lease listener could not be registered.");
		this.#unsubscribe = unsubscribe;
	}

	#createLease(): StagehandCredentialLease {
		const record = { revoked: false };
		const epoch = this.#epoch;
		this.#leases.add(record);
		const assertCurrent = (): void => {
			if (record.revoked || this.#closed || epoch !== this.#epoch) {
				throw new Error("Stagehand credential lease is revoked.");
			}
		};
		return Object.freeze({
			protocol: STAGEHAND_LEASE_PROTOCOL,
			consumer: STAGEHAND_LEASE_CONSUMER,
			purpose: STAGEHAND_LEASE_PURPOSE,
			isRevoked: () => record.revoked || this.#closed || epoch !== this.#epoch,
			run: async <T>(
				operation: "login-form-fill",
				signal: AbortSignal | undefined,
				work: (page: StagehandLeasePage) => Promise<T>,
			): Promise<T> => {
				assertCurrent();
				if (operation !== "login-form-fill" || typeof work !== "function") {
					throw new Error("Stagehand credential lease request is invalid.");
				}
				const config = this.#manager.getLiveConfiguration();
				if (config.sdkLoggingConfigured) {
					throw new Error("Stagehand credential filling is unavailable while SDK flow logging is configured.");
				}
				const value = await this.#manager.run(
					"credential-fill",
					STAGEHAND_LEASE_TIMEOUT_MS,
					signal,
					async (stagehand) => {
						assertCurrent();
						const result = await work(pageFacade(this.#manager, stagehand));
						assertCurrent();
						return result;
					},
				);
				assertCurrent();
				return value;
			},
			release: () => {
				record.revoked = true;
				this.#leases.delete(record);
			},
		});
	}

	revokeAll(): void {
		this.#epoch += 1;
		for (const lease of this.#leases) lease.revoked = true;
		this.#leases.clear();
	}

	shutdown(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.revokeAll();
		const unsubscribe = this.#unsubscribe;
		this.#unsubscribe = undefined;
		try { unsubscribe?.(); } catch { /* Closed guard keeps a stale callback inert. */ }
	}

	status(): Readonly<{ activeLeases: number; closed: boolean }> {
		return Object.freeze({ activeLeases: this.#leases.size, closed: this.#closed });
	}
}

