import { Buffer } from "node:buffer";
import {
	type FieldMetadata,
	type FullItemMetadata,
	type ItemMetadata,
	mapFullItemMetadata,
	mapItemMetadataList,
	mapVaultMetadataList,
	safeMetadataId,
	type VaultMetadata,
} from "./metadata.ts";
import {
	type AuthenticationMode,
	type AuthenticationSelection,
	inspectAuthenticationConfiguration,
	MAX_SECRET_VALUE_BYTES,
	PublicError,
	REQUEST_DEADLINE_MS,
	selectAuthentication,
} from "./safety.ts";

interface CreateClientConfiguration {
	auth: unknown;
	integrationName: string;
	integrationVersion: string;
}

interface LocalItemListFilter {
	readonly type: "ByState";
	readonly content: Readonly<{
		active: boolean;
		archived: boolean;
	}>;
}

export interface OnePasswordSdkSurface {
	createClient(configuration: CreateClientConfiguration): Promise<unknown>;
	createDesktopAuth(accountName: string): object;
	validateSecretReference(reference: string): void;
}

interface CachedSdkSurface {
	createClient: OnePasswordSdkSurface["createClient"] | undefined;
	createDesktopAuth: OnePasswordSdkSurface["createDesktopAuth"] | undefined;
	validateSecretReference: OnePasswordSdkSurface["validateSecretReference"] | undefined;
}

interface CachedClient {
	client: object | undefined;
	secrets: object | undefined;
	resolve: ((reference: string) => unknown) | undefined;
	vaults: object | undefined;
	listVaults: (() => unknown) | undefined;
	items: object | undefined;
	listItems: ((vaultId: string, ...filters: LocalItemListFilter[]) => unknown) | undefined;
	getItem: ((vaultId: string, itemId: string) => unknown) | undefined;
}

interface CancellationGate {
	error: PublicError | undefined;
	cancel?: (error: PublicError) => void;
}

interface VerifiedSelectionRecord {
	owner: object;
	epoch: number;
	vaultId: string;
	itemId: string;
	fieldId: string;
	sectionId?: string;
}

interface GrantReferenceRecord {
	reference: string;
	release: () => void;
}

const verifiedSelections = new WeakMap<object, VerifiedSelectionRecord>();
const grantReferences = new WeakMap<object, GrantReferenceRecord>();

export interface VerifiedDynamicSelection {
	readonly item: Readonly<{
		id: string;
		vaultId: string;
		title: string;
		category: string;
	}>;
	readonly field: FieldMetadata;
}

/** Opaque process-local capability. It has no enumerable data and no public reference field. */
export type DynamicSecretGrantCapability = object;

export function hasDynamicSecretGrant(capability: unknown): capability is DynamicSecretGrantCapability {
	return typeof capability === "object" && capability !== null && grantReferences.has(capability);
}

export function consumeDynamicSecretGrant(capability: unknown): string | undefined {
	if (typeof capability !== "object" || capability === null) return undefined;
	const record = grantReferences.get(capability);
	if (record === undefined) return undefined;
	grantReferences.delete(capability);
	record.release();
	const reference = record.reference;
	record.reference = "";
	return reference;
}

export function revokeDynamicSecretGrant(capability: unknown): void {
	if (typeof capability !== "object" || capability === null) return;
	const record = grantReferences.get(capability);
	if (record === undefined) return;
	grantReferences.delete(capability);
	record.reference = "";
	record.release();
}

export type ClientPhase = "not_initialized" | "initializing" | "ready" | "shutting_down";
export type ItemMetadataStateFilter = "active" | "archived" | "all";

export interface ManagerStatus {
	phase: ClientPhase;
	serviceAccountTokenConfigured: boolean;
	desktopAccountConfigured: boolean;
	authenticationMode: AuthenticationMode;
	callsUsed: number;
	callLimit: number;
	pending: number;
	pendingLimit: number;
	metadataCallsUsed: number;
	metadataCallLimit: number;
	metadataPending: number;
	metadataPendingLimit: number;
}

export const MANAGER_MAX_CALLS = 20;
export const MANAGER_MAX_PENDING = 4;
export const MANAGER_MAX_METADATA_CALLS = 20;
export const MANAGER_MAX_METADATA_PENDING = 4;
export const MANAGER_DRAIN_MS = 1_000;
export const INTEGRATION_NAME = "Pi 1Password Secrets Manager";
export const INTEGRATION_VERSION = "v1.0.0";

export interface ManagerOptions {
	loadSdk?: () => Promise<unknown>;
	readEnvironment?: () => unknown;
	deadlineMs?: number;
	maxCalls?: number;
	maxPending?: number;
	maxMetadataCalls?: number;
	maxMetadataPending?: number;
	drainMs?: number;
}

function defaultSdkLoader(): Promise<unknown> {
	return import("@1password/sdk");
}

function defaultEnvironmentReader(): unknown {
	return process.env;
}

function ownDataValue(record: unknown, key: string): unknown {
	if ((typeof record !== "object" && typeof record !== "function") || record === null) return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(record, key);
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	} catch {
		return undefined;
	}
}

function ownFunctionOwner(
	primary: unknown,
	secondary: unknown,
	key: string,
): { owner: object | Function; method: Function } | undefined {
	for (const candidate of [primary, secondary]) {
		if ((typeof candidate !== "object" && typeof candidate !== "function") || candidate === null) continue;
		const value = ownDataValue(candidate, key);
		if (typeof value === "function") return { owner: candidate, method: value };
	}
	return undefined;
}

interface ConstructorSurface {
	constructor: Function;
	prototype: object;
}

function ownConstructor(primary: unknown, secondary: unknown, key: string): ConstructorSurface | undefined {
	for (const candidate of [primary, secondary]) {
		if ((typeof candidate !== "object" && typeof candidate !== "function") || candidate === null) continue;
		const constructor = ownDataValue(candidate, key);
		if (typeof constructor !== "function") continue;
		try {
			const prototypeDescriptor = Object.getOwnPropertyDescriptor(constructor, "prototype");
			if (
				prototypeDescriptor === undefined || !("value" in prototypeDescriptor) ||
				typeof prototypeDescriptor.value !== "object" || prototypeDescriptor.value === null
			) continue;
			const ownConstructorDescriptor = Object.getOwnPropertyDescriptor(prototypeDescriptor.value, "constructor");
			if (
				ownConstructorDescriptor === undefined || !("value" in ownConstructorDescriptor) ||
				ownConstructorDescriptor.value !== constructor
			) continue;
			return { constructor, prototype: prototypeDescriptor.value };
		} catch {
			continue;
		}
	}
	return undefined;
}

/** Resolve only the documented root SDK surface without creating a client or desktop auth object. */
export function resolveSdkSurface(imported: unknown): OnePasswordSdkSurface {
	const defaultExport = ownDataValue(imported, "default");
	const createClient = ownFunctionOwner(defaultExport, imported, "createClient");
	const secretsClass = ownDataValue(defaultExport, "Secrets") ?? ownDataValue(imported, "Secrets");
	const validator = ownFunctionOwner(secretsClass, undefined, "validateSecretReference");
	const desktopAuth = ownConstructor(defaultExport, imported, "DesktopAuth");
	if (createClient === undefined || validator === undefined || desktopAuth === undefined) {
		throw new PublicError("sdk");
	}
	return Object.freeze({
		async createClient(configuration: CreateClientConfiguration): Promise<unknown> {
			try {
				return await Reflect.apply(createClient.method, createClient.owner, [configuration]);
			} catch {
				throw new PublicError("sdk");
			}
		},
		createDesktopAuth(accountName: string): object {
			try {
				const result = Reflect.construct(desktopAuth.constructor, [accountName]);
				if (typeof result !== "object" || result === null || Array.isArray(result)) throw new PublicError("sdk");
				if (Object.getPrototypeOf(result) !== desktopAuth.prototype) throw new PublicError("sdk");
				return result;
			} catch {
				throw new PublicError("sdk");
			}
		},
		validateSecretReference(reference: string): void {
			try {
				const result = Reflect.apply(validator.method, validator.owner, [reference]);
				if (result !== undefined) throw new PublicError("configuration");
			} catch {
				throw new PublicError("configuration");
			}
		},
	});
}

function immediateDataMethod(value: unknown, key: string): ((...args: never[]) => unknown) | undefined {
	if ((typeof value !== "object" && typeof value !== "function") || value === null) return undefined;
	try {
		const ownDescriptor = Object.getOwnPropertyDescriptor(value, key);
		if (ownDescriptor !== undefined) {
			return "value" in ownDescriptor && typeof ownDescriptor.value === "function"
				? ownDescriptor.value as (...args: never[]) => unknown
				: undefined;
		}
		const prototype = Object.getPrototypeOf(value);
		if (prototype === null) return undefined;
		const prototypeDescriptor = Object.getOwnPropertyDescriptor(prototype, key);
		return prototypeDescriptor && "value" in prototypeDescriptor && typeof prototypeDescriptor.value === "function"
			? prototypeDescriptor.value as (...args: never[]) => unknown
			: undefined;
	} catch {
		return undefined;
	}
}

function validateClient(client: unknown): CachedClient {
	if (typeof client !== "object" || client === null || Array.isArray(client)) throw new PublicError("sdk");
	const secrets = ownDataValue(client, "secrets");
	if (typeof secrets !== "object" || secrets === null || Array.isArray(secrets)) throw new PublicError("sdk");
	const resolve = immediateDataMethod(secrets, "resolve");
	if (resolve === undefined) throw new PublicError("sdk");
	return {
		client,
		secrets: secrets as object,
		resolve: resolve as (reference: string) => unknown,
		vaults: undefined,
		listVaults: undefined,
		items: undefined,
		listItems: undefined,
		getItem: undefined,
	};
}

function signalIsAborted(signal: AbortSignal | undefined): boolean {
	if (signal === undefined) return false;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted");
		if (!descriptor || typeof descriptor.get !== "function") return true;
		return Reflect.apply(descriptor.get, signal, []) === true;
	} catch {
		return true;
	}
}

function waitWithBoundary<T>(
	operation: Promise<T>,
	gate: CancellationGate,
	signal: AbortSignal | undefined,
	deadlineMs: number,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		const finish = (callback: () => void): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (signal !== undefined) {
				try {
					EventTarget.prototype.removeEventListener.call(signal, "abort", onAbort);
				} catch {
					// A malformed caller signal cannot alter the fixed public result.
				}
			}
			if (gate.cancel === forceCancel) gate.cancel = undefined;
			callback();
		};
		const forceCancel = (error: PublicError): void => {
			if (gate.error === undefined) gate.error = error;
			finish(() => reject(gate.error));
		};
		const onAbort = (): void => forceCancel(new PublicError("aborted"));
		const timer = setTimeout(() => forceCancel(new PublicError("timeout")), deadlineMs);
		gate.cancel = forceCancel;

		if (signalIsAborted(signal)) {
			onAbort();
			return;
		}
		if (signal !== undefined) {
			try {
				EventTarget.prototype.addEventListener.call(signal, "abort", onAbort, { once: true });
			} catch {
				onAbort();
				return;
			}
		}
		operation.then(
			(value) => finish(() => resolve(value)),
			(error: unknown) => finish(() => reject(error)),
		);
	});
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

export class OnePasswordManager {
	readonly #loadSdk: () => Promise<unknown>;
	readonly #readEnvironment: () => unknown;
	readonly #deadlineMs: number;
	readonly #maxCalls: number;
	readonly #maxPending: number;
	readonly #maxMetadataCalls: number;
	readonly #maxMetadataPending: number;
	readonly #drainMs: number;
	readonly #ownerToken = Object.freeze({});
	#phase: ClientPhase = "not_initialized";
	#sdkSurface: CachedSdkSurface | undefined;
	#sdkLoading: Promise<OnePasswordSdkSurface> | undefined;
	#cachedClient: CachedClient | undefined;
	#clientInitialization: Promise<CachedClient> | undefined;
	#operationTail: Promise<void> = Promise.resolve();
	#activeGates = new Set<CancellationGate>();
	#activeWork = new Set<Promise<void>>();
	#issuedGrants = new Set<object>();
	#epoch = 0;
	#stopped = false;
	#callsUsed = 0;
	#pending = 0;
	#metadataCallsUsed = 0;
	#metadataPending = 0;
	#shutdownDrain: Promise<void> | undefined;

	constructor(options: ManagerOptions = {}) {
		this.#loadSdk = options.loadSdk ?? defaultSdkLoader;
		this.#readEnvironment = options.readEnvironment ?? defaultEnvironmentReader;
		this.#deadlineMs = options.deadlineMs ?? REQUEST_DEADLINE_MS;
		this.#maxCalls = options.maxCalls ?? MANAGER_MAX_CALLS;
		this.#maxPending = options.maxPending ?? MANAGER_MAX_PENDING;
		this.#maxMetadataCalls = options.maxMetadataCalls ?? MANAGER_MAX_METADATA_CALLS;
		this.#maxMetadataPending = options.maxMetadataPending ?? MANAGER_MAX_METADATA_PENDING;
		this.#drainMs = options.drainMs ?? MANAGER_DRAIN_MS;
		if (
			!Number.isSafeInteger(this.#deadlineMs) || this.#deadlineMs < 1 || this.#deadlineMs > REQUEST_DEADLINE_MS ||
			!Number.isSafeInteger(this.#maxCalls) || this.#maxCalls < 1 ||
			!Number.isSafeInteger(this.#maxPending) || this.#maxPending < 1 ||
			!Number.isSafeInteger(this.#maxMetadataCalls) || this.#maxMetadataCalls < 1 ||
			!Number.isSafeInteger(this.#maxMetadataPending) || this.#maxMetadataPending < 1 ||
			!Number.isSafeInteger(this.#drainMs) || this.#drainMs < 1 || this.#drainMs > REQUEST_DEADLINE_MS
		) throw new Error("Invalid 1Password manager bounds");
	}

	status(): ManagerStatus {
		let authentication = inspectAuthenticationConfiguration(undefined);
		try {
			authentication = inspectAuthenticationConfiguration(this.#readEnvironment());
		} catch {
			// Status is presence-only and remains offline if the environment reader fails.
		}
		return {
			phase: this.#phase,
			serviceAccountTokenConfigured: authentication.serviceAccountTokenConfigured,
			desktopAccountConfigured: authentication.desktopAccountConfigured,
			authenticationMode: authentication.authenticationMode,
			callsUsed: this.#callsUsed,
			callLimit: this.#maxCalls,
			pending: this.#pending,
			pendingLimit: this.#maxPending,
			metadataCallsUsed: this.#metadataCallsUsed,
			metadataCallLimit: this.#maxMetadataCalls,
			metadataPending: this.#metadataPending,
			metadataPendingLimit: this.#maxMetadataPending,
		};
	}

	async resolveSecretValue(reference: string, signal?: AbortSignal, deadlineMs = this.#deadlineMs): Promise<string> {
		this.#assertInitialRequest(signal, deadlineMs);
		if (typeof reference !== "string" || reference.length === 0) throw new PublicError("invalid_input");
		if (this.#callsUsed >= this.#maxCalls) throw new PublicError("call_limit");
		if (this.#pending >= this.#maxPending) throw new PublicError("busy");
		this.#callsUsed += 1;
		this.#pending += 1;

		const requestEpoch = this.#epoch;
		const gate: CancellationGate = { error: undefined };
		this.#activeGates.add(gate);
		const operation = this.#enqueue(async () => {
			this.#assertOperationActive(requestEpoch, gate);
			let authentication: AuthenticationSelection | undefined;
			if (this.#cachedClient === undefined) authentication = this.#selectAuthentication();
			const surface = await this.#getSdkSurface(requestEpoch, gate);
			this.#assertOperationActive(requestEpoch, gate);
			const validate = surface.validateSecretReference;
			if (validate === undefined) throw new PublicError("sdk");
			try {
				validate(reference);
			} catch {
				throw new PublicError("configuration");
			}
			this.#assertOperationActive(requestEpoch, gate);
			const cached = await this.#getClient(surface, authentication, requestEpoch, gate);
			authentication = undefined;
			this.#assertOperationActive(requestEpoch, gate);
			if (cached.secrets === undefined || cached.resolve === undefined) throw new PublicError("lifecycle");
			let response: unknown;
			try {
				response = await Reflect.apply(cached.resolve, cached.secrets, [reference]);
			} catch {
				throw new PublicError("request");
			}
			this.#assertOperationActive(requestEpoch, gate);
			if (
				typeof response !== "string" || response.length === 0 ||
				Buffer.byteLength(response, "utf8") > MAX_SECRET_VALUE_BYTES
			) throw new PublicError("response");
			return response;
		});
		this.#trackOperation(operation, gate, "secret");
		return waitWithBoundary(operation, gate, signal, deadlineMs);
	}

	listVaultMetadata(signal?: AbortSignal, deadlineMs = this.#deadlineMs): Promise<readonly VaultMetadata[]> {
		return this.#runMetadata(async (cached, requestEpoch, gate) => {
			const { owner, method } = this.#vaultListMethod(cached);
			let response: unknown;
			try {
				response = await Reflect.apply(method, owner, []);
			} catch {
				throw new PublicError("request");
			}
			this.#assertOperationActive(requestEpoch, gate);
			return mapVaultMetadataList(response);
		}, signal, deadlineMs);
	}

	listItemMetadata(
		vaultId: string,
		state: ItemMetadataStateFilter,
		signal?: AbortSignal,
		deadlineMs = this.#deadlineMs,
	): Promise<readonly ItemMetadata[]> {
		const safeVaultId = safeMetadataId(vaultId);
		if (state !== "active" && state !== "archived" && state !== "all") throw new PublicError("invalid_input");
		return this.#runMetadata(async (cached, requestEpoch, gate) => {
			const { owner, method } = this.#itemListMethod(cached);
			const filter: LocalItemListFilter = Object.freeze({
				type: "ByState",
				content: Object.freeze({ active: state !== "archived", archived: state !== "active" }),
			});
			let response: unknown;
			try {
				response = await Reflect.apply(method, owner, [safeVaultId, filter]);
			} catch {
				throw new PublicError("request");
			}
			this.#assertOperationActive(requestEpoch, gate);
			return mapItemMetadataList(response, safeVaultId);
		}, signal, deadlineMs);
	}

	getItemFieldMetadata(
		vaultId: string,
		itemId: string,
		signal?: AbortSignal,
		deadlineMs = this.#deadlineMs,
	): Promise<FullItemMetadata> {
		const safeVaultId = safeMetadataId(vaultId);
		const safeItemId = safeMetadataId(itemId);
		return this.#runMetadata(
			(cached, requestEpoch, gate) => this.#fetchItemMetadata(cached, safeVaultId, safeItemId, requestEpoch, gate),
			signal,
			deadlineMs,
		);
	}

	async verifyDynamicFieldSelection(
		vaultId: string,
		itemId: string,
		fieldId: string,
		signal?: AbortSignal,
		deadlineMs = this.#deadlineMs,
	): Promise<VerifiedDynamicSelection> {
		const safeVaultId = safeMetadataId(vaultId);
		const safeItemId = safeMetadataId(itemId);
		const safeFieldId = safeMetadataId(fieldId);
		const requestEpoch = this.#epoch;
		const item = await this.#runMetadata(
			(cached, epoch, gate) => this.#fetchItemMetadata(cached, safeVaultId, safeItemId, epoch, gate),
			signal,
			deadlineMs,
		);
		if (requestEpoch !== this.#epoch || this.#stopped) throw new PublicError("lifecycle");
		let selected: FieldMetadata | undefined;
		for (const field of item.fields) {
			if (field.id === safeFieldId) selected = field;
		}
		if (selected === undefined) throw new PublicError("response");
		const candidate: VerifiedDynamicSelection = Object.freeze({
			item: Object.freeze({ id: item.id, vaultId: item.vaultId, title: item.title, category: item.category }),
			field: selected,
		});
		verifiedSelections.set(candidate, {
			owner: this.#ownerToken,
			epoch: requestEpoch,
			vaultId: item.vaultId,
			itemId: item.id,
			fieldId: selected.id,
			...(selected.section === undefined ? {} : { sectionId: selected.section.id }),
		});
		return candidate;
	}

	createDynamicSecretGrant(
		candidate: VerifiedDynamicSelection,
		signal?: AbortSignal,
		deadlineMs = this.#deadlineMs,
	): Promise<DynamicSecretGrantCapability> {
		this.#assertInitialRequest(signal, deadlineMs);
		const verified = typeof candidate === "object" && candidate !== null ? verifiedSelections.get(candidate) : undefined;
		if (verified === undefined || verified.owner !== this.#ownerToken) throw new PublicError("invalid_input");
		const requestEpoch = this.#epoch;
		const gate: CancellationGate = { error: undefined };
		this.#activeGates.add(gate);
		const operation = this.#enqueue(async () => {
			this.#assertOperationActive(requestEpoch, gate);
			if (verified.epoch !== requestEpoch) throw new PublicError("lifecycle");
			const validate = this.#sdkSurface?.validateSecretReference;
			if (validate === undefined) throw new PublicError("lifecycle");
			const vaultSegment = encodeURIComponent(verified.vaultId);
			const itemSegment = encodeURIComponent(verified.itemId);
			const fieldSegment = encodeURIComponent(verified.fieldId);
			const reference = verified.sectionId === undefined
				? `op://${vaultSegment}/${itemSegment}/${fieldSegment}`
				: `op://${vaultSegment}/${itemSegment}/${encodeURIComponent(verified.sectionId)}/${fieldSegment}`;
			try {
				validate(reference);
			} catch {
				throw new PublicError("response");
			}
			this.#assertOperationActive(requestEpoch, gate);
			const capability = Object.freeze(Object.create(null)) as DynamicSecretGrantCapability;
			this.#issuedGrants.add(capability);
			grantReferences.set(capability, {
				reference,
				release: () => { this.#issuedGrants.delete(capability); },
			});
			return capability;
		});
		this.#trackOperation(operation, gate, "auxiliary");
		return waitWithBoundary(operation, gate, signal, deadlineMs);
	}

	reset(): Promise<void> {
		if (this.#stopped) return this.#shutdownDrain ?? Promise.resolve();
		this.#invalidateActiveWork(false);
		return boundedDrain([...this.#activeWork], this.#drainMs);
	}

	shutdown(): Promise<void> {
		if (this.#shutdownDrain !== undefined) return this.#shutdownDrain;
		this.#stopped = true;
		this.#invalidateActiveWork(true);
		this.#shutdownDrain = boundedDrain([...this.#activeWork], this.#drainMs);
		return this.#shutdownDrain;
	}

	#assertInitialRequest(signal: AbortSignal | undefined, deadlineMs: number): void {
		if (this.#stopped) throw new PublicError("lifecycle");
		if (signalIsAborted(signal)) throw new PublicError("aborted");
		if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > REQUEST_DEADLINE_MS) {
			throw new PublicError("invalid_input");
		}
	}

	#runMetadata<T>(
		task: (cached: CachedClient, requestEpoch: number, gate: CancellationGate) => Promise<T>,
		signal: AbortSignal | undefined,
		deadlineMs: number,
	): Promise<T> {
		this.#assertInitialRequest(signal, deadlineMs);
		if (this.#metadataCallsUsed >= this.#maxMetadataCalls) throw new PublicError("call_limit");
		if (this.#metadataPending >= this.#maxMetadataPending) throw new PublicError("busy");
		this.#metadataCallsUsed += 1;
		this.#metadataPending += 1;
		const requestEpoch = this.#epoch;
		const gate: CancellationGate = { error: undefined };
		this.#activeGates.add(gate);
		const operation = this.#enqueue(async () => {
			this.#assertOperationActive(requestEpoch, gate);
			let authentication: AuthenticationSelection | undefined;
			if (this.#cachedClient === undefined) authentication = this.#selectAuthentication();
			const surface = await this.#getSdkSurface(requestEpoch, gate);
			this.#assertOperationActive(requestEpoch, gate);
			const cached = await this.#getClient(surface, authentication, requestEpoch, gate);
			authentication = undefined;
			this.#assertOperationActive(requestEpoch, gate);
			return task(cached, requestEpoch, gate);
		});
		this.#trackOperation(operation, gate, "metadata");
		return waitWithBoundary(operation, gate, signal, deadlineMs);
	}

	async #fetchItemMetadata(
		cached: CachedClient,
		vaultId: string,
		itemId: string,
		requestEpoch: number,
		gate: CancellationGate,
	): Promise<FullItemMetadata> {
		const { owner, method } = this.#itemGetMethod(cached);
		let response: unknown;
		try {
			try {
				response = await Reflect.apply(method, owner, [vaultId, itemId]);
			} catch {
				throw new PublicError("request");
			}
			this.#assertOperationActive(requestEpoch, gate);
			return mapFullItemMetadata(response, vaultId, itemId);
		} finally {
			// items.get returns a fully decrypted item. Retain only the detached safe DTO.
			response = undefined;
		}
	}

	#vaultListMethod(cached: CachedClient): { owner: object; method: Function } {
		if (cached.vaults !== undefined && cached.listVaults !== undefined) {
			return { owner: cached.vaults, method: cached.listVaults };
		}
		const vaults = ownDataValue(cached.client, "vaults");
		if (typeof vaults !== "object" || vaults === null || Array.isArray(vaults)) throw new PublicError("sdk");
		const method = immediateDataMethod(vaults, "list");
		if (method === undefined) throw new PublicError("sdk");
		cached.vaults = vaults as object;
		cached.listVaults = method as () => unknown;
		return { owner: cached.vaults, method };
	}

	#itemListMethod(cached: CachedClient): { owner: object; method: Function } {
		const items = this.#itemsApi(cached);
		if (cached.listItems === undefined) {
			const method = immediateDataMethod(items, "list");
			if (method === undefined) throw new PublicError("sdk");
			cached.listItems = method as (vaultId: string, ...filters: LocalItemListFilter[]) => unknown;
		}
		return { owner: items, method: cached.listItems };
	}

	#itemGetMethod(cached: CachedClient): { owner: object; method: Function } {
		const items = this.#itemsApi(cached);
		if (cached.getItem === undefined) {
			const method = immediateDataMethod(items, "get");
			if (method === undefined) throw new PublicError("sdk");
			cached.getItem = method as (vaultId: string, itemId: string) => unknown;
		}
		return { owner: items, method: cached.getItem };
	}

	#itemsApi(cached: CachedClient): object {
		if (cached.items !== undefined) return cached.items;
		const items = ownDataValue(cached.client, "items");
		if (typeof items !== "object" || items === null || Array.isArray(items)) throw new PublicError("sdk");
		cached.items = items as object;
		return cached.items;
	}

	#invalidateActiveWork(shuttingDown: boolean): void {
		this.#epoch += 1;
		for (const capability of this.#issuedGrants) revokeDynamicSecretGrant(capability);
		this.#issuedGrants.clear();
		this.#releaseClient(this.#cachedClient);
		this.#releaseSurface(this.#sdkSurface);
		this.#cachedClient = undefined;
		this.#clientInitialization = undefined;
		this.#sdkSurface = undefined;
		this.#sdkLoading = undefined;
		this.#phase = shuttingDown ? "shutting_down" : "not_initialized";
		for (const gate of this.#activeGates) {
			const lifecycleError = new PublicError("lifecycle");
			if (gate.error === undefined) gate.error = lifecycleError;
			gate.cancel?.(gate.error);
		}
	}

	#releaseSurface(surface: CachedSdkSurface | undefined): void {
		if (surface === undefined) return;
		surface.createClient = undefined;
		surface.createDesktopAuth = undefined;
		surface.validateSecretReference = undefined;
	}

	#releaseClient(cached: CachedClient | undefined): void {
		if (cached === undefined) return;
		cached.resolve = undefined;
		cached.secrets = undefined;
		cached.listVaults = undefined;
		cached.vaults = undefined;
		cached.listItems = undefined;
		cached.getItem = undefined;
		cached.items = undefined;
		cached.client = undefined;
	}

	#trackOperation(
		operation: Promise<unknown>,
		gate: CancellationGate,
		kind: "secret" | "metadata" | "auxiliary",
	): void {
		const drain = operation.then(() => undefined, () => undefined);
		this.#activeWork.add(drain);
		void drain.then(() => {
			this.#activeWork.delete(drain);
			this.#activeGates.delete(gate);
			if (kind === "secret") this.#pending = Math.max(0, this.#pending - 1);
			if (kind === "metadata") this.#metadataPending = Math.max(0, this.#metadataPending - 1);
		});
	}

	#enqueue<T>(task: () => Promise<T>): Promise<T> {
		const operation = this.#operationTail.then(task, task);
		this.#operationTail = operation.then(() => undefined, () => undefined);
		return operation;
	}

	#assertOperationActive(requestEpoch: number, gate: CancellationGate): void {
		if (gate.error !== undefined) throw gate.error;
		if (this.#stopped || requestEpoch !== this.#epoch) throw new PublicError("lifecycle");
	}

	#selectAuthentication(): AuthenticationSelection {
		try {
			return selectAuthentication(this.#readEnvironment());
		} catch {
			throw new PublicError("configuration");
		}
	}

	async #getSdkSurface(requestEpoch: number, gate: CancellationGate): Promise<CachedSdkSurface> {
		if (this.#sdkSurface !== undefined) return this.#sdkSurface;
		this.#assertOperationActive(requestEpoch, gate);
		let loading = this.#sdkLoading;
		if (loading === undefined) {
			loading = (async () => resolveSdkSurface(await this.#loadSdk()))();
			this.#sdkLoading = loading;
		}
		try {
			let loaded: OnePasswordSdkSurface;
			try {
				loaded = await loading;
			} catch {
				throw new PublicError("sdk");
			}
			this.#assertOperationActive(requestEpoch, gate);
			const cached: CachedSdkSurface = {
				createClient: loaded.createClient,
				createDesktopAuth: loaded.createDesktopAuth,
				validateSecretReference: loaded.validateSecretReference,
			};
			this.#sdkSurface = cached;
			return cached;
		} finally {
			if (this.#sdkLoading === loading) this.#sdkLoading = undefined;
		}
	}

	async #getClient(
		surface: CachedSdkSurface,
		authentication: AuthenticationSelection | undefined,
		requestEpoch: number,
		gate: CancellationGate,
	): Promise<CachedClient> {
		if (this.#cachedClient !== undefined) return this.#cachedClient;
		this.#assertOperationActive(requestEpoch, gate);
		let initialization = this.#clientInitialization;
		if (initialization === undefined) {
			if (authentication === undefined) throw new PublicError("configuration");
			this.#phase = "initializing";
			initialization = this.#createClient(surface, authentication, requestEpoch);
			this.#clientInitialization = initialization;
		}
		let cached: CachedClient | undefined;
		try {
			cached = await initialization;
			this.#assertOperationActive(requestEpoch, gate);
			this.#cachedClient = cached;
			this.#phase = "ready";
			return cached;
		} catch (error) {
			if (cached !== undefined && cached !== this.#cachedClient) this.#releaseClient(cached);
			if (!this.#stopped && requestEpoch === this.#epoch) {
				this.#cachedClient = undefined;
				this.#phase = "not_initialized";
			}
			throw error instanceof PublicError ? error : new PublicError("sdk");
		} finally {
			if (this.#clientInitialization === initialization) this.#clientInitialization = undefined;
		}
	}

	async #createClient(
		surface: CachedSdkSurface,
		authentication: AuthenticationSelection,
		requestEpoch: number,
	): Promise<CachedClient> {
		const createClient = surface.createClient;
		if (createClient === undefined) throw new PublicError("lifecycle");
		let auth: unknown = authentication.value;
		if (authentication.mode === "desktop") {
			const createDesktopAuth = surface.createDesktopAuth;
			if (createDesktopAuth === undefined) throw new PublicError("lifecycle");
			auth = createDesktopAuth(authentication.value);
			if (this.#stopped || requestEpoch !== this.#epoch) throw new PublicError("lifecycle");
		}
		const configuration: CreateClientConfiguration = {
			auth,
			integrationName: INTEGRATION_NAME,
			integrationVersion: INTEGRATION_VERSION,
		};
		auth = undefined;
		try {
			const client = await createClient(configuration);
			if (this.#stopped || requestEpoch !== this.#epoch) throw new PublicError("lifecycle");
			return validateClient(client);
		} catch (error) {
			if (error instanceof PublicError) throw error;
			throw new PublicError("sdk");
		} finally {
			configuration.auth = "";
		}
	}
}
