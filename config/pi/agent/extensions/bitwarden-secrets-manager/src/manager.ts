import { Buffer } from "node:buffer";
import { buildMetadataToolResult, type MetadataKind, type MetadataToolResult } from "./output.ts";
import {
	inspectEnvironment,
	MAX_METADATA_CALLS,
	parseRuntimeConfiguration,
	PublicError,
	REQUEST_DEADLINE_MS,
	type EndpointOverrideState,
} from "./safety.ts";

type Environment = Readonly<Record<string, string | undefined>>;
type ClientSettings = { apiUrl: string; identityUrl: string; userAgent: string } | undefined;

interface AuthenticationClient {
	loginAccessToken(accessToken: string): Promise<void>;
}

interface ListClient {
	list(organizationId: string): Promise<unknown>;
}

interface SecretsClient extends ListClient {
	get(id: string): Promise<unknown>;
}

interface BitwardenClientLike {
	auth(): AuthenticationClient;
	projects(): ListClient;
	secrets(): SecretsClient;
}

interface AuthenticatedClient {
	client: BitwardenClientLike | undefined;
	redactionValue: string;
}

type BitwardenClientConstructor = new (settings?: ClientSettings, loggingLevel?: number) => BitwardenClientLike;

export type ClientPhase = "not_initialized" | "initializing" | "ready" | "shutting_down";

export interface ManagerStatus {
	phase: ClientPhase;
	accessTokenConfigured: boolean;
	endpointOverrides: EndpointOverrideState;
	metadataCallsUsed: number;
	metadataCallLimit: number;
}

export const MANAGER_DRAIN_MS = 1_000;

export interface ManagerOptions {
	loadSdk?: () => Promise<unknown>;
	readEnvironment?: () => Environment;
	deadlineMs?: number;
	maxCalls?: number;
	drainMs?: number;
}

interface CancellationGate {
	error: PublicError | undefined;
	cancel?: (error: PublicError) => void;
}

function defaultSdkLoader(): Promise<unknown> {
	return import("@bitwarden/sdk-napi");
}

function defaultEnvironmentReader(): Environment {
	return process.env;
}

function readExport(record: unknown, key: string): unknown {
	if ((typeof record !== "object" && typeof record !== "function") || record === null) return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(record, key);
		if (!descriptor || !("value" in descriptor)) return undefined;
		return descriptor.value;
	} catch {
		return undefined;
	}
}

function resolveClientConstructor(imported: unknown): BitwardenClientConstructor {
	const defaultExport = readExport(imported, "default");
	const constructor = readExport(defaultExport, "BitwardenClient") ?? readExport(imported, "BitwardenClient");
	if (typeof constructor !== "function") throw new PublicError("sdk");
	return constructor as BitwardenClientConstructor;
}

function findDataMethod(value: unknown, key: string): ((...args: unknown[]) => unknown) | undefined {
	if ((typeof value !== "object" && typeof value !== "function") || value === null) return undefined;
	let current: object | null = value as object;
	for (let depth = 0; current !== null && depth < 8; depth += 1) {
		try {
			const descriptor = Object.getOwnPropertyDescriptor(current, key);
			if (descriptor !== undefined) {
				return "value" in descriptor && typeof descriptor.value === "function" ? descriptor.value : undefined;
			}
			current = Object.getPrototypeOf(current);
		} catch {
			return undefined;
		}
	}
	return undefined;
}

function callDataMethod(value: unknown, key: string, ...args: unknown[]): unknown {
	const method = findDataMethod(value, key);
	if (method === undefined) throw new PublicError("sdk");
	try {
		return Reflect.apply(method, value, args);
	} catch (error) {
		if (error instanceof PublicError) throw error;
		throw new PublicError("sdk");
	}
}

function readOwnDataProperty(value: unknown, key: string): unknown {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	try {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) return undefined;
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	} catch {
		return undefined;
	}
}

function secretValueFromResponse(response: unknown, requestedId: string): string {
	const id = readOwnDataProperty(response, "id");
	const value = readOwnDataProperty(response, "value");
	if (id !== requestedId || typeof value !== "string" || Buffer.byteLength(value, "utf8") > 64 * 1024) {
		throw new PublicError("response");
	}
	return value;
}

function signalIsAborted(signal: AbortSignal | undefined): boolean {
	if (signal === undefined) return false;
	try {
		return signal.aborted;
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
					// A malformed caller signal cannot change the fixed public outcome.
				}
			}
			if (gate.cancel === forceCancel) gate.cancel = undefined;
			callback();
		};
		const forceCancel = (error: PublicError): void => {
			if (gate.error === undefined) gate.error = error;
			finish(() => reject(gate.error));
		};
		const cancel = (code: "aborted" | "timeout"): void => forceCancel(new PublicError(code));
		const onAbort = (): void => cancel("aborted");
		const timer = setTimeout(() => cancel("timeout"), deadlineMs);
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

export class BitwardenManager {
	private readonly loadSdk: () => Promise<unknown>;
	private readonly readEnvironment: () => Environment;
	private readonly deadlineMs: number;
	private readonly maxCalls: number;
	private readonly drainMs: number;
	private phase: ClientPhase = "not_initialized";
	private authenticatedClient: AuthenticatedClient | undefined;
	private initialization: Promise<AuthenticatedClient> | undefined;
	private operationTail: Promise<void> = Promise.resolve();
	private readonly activeGates = new Set<CancellationGate>();
	private readonly activeWork = new Set<Promise<void>>();
	private epoch = 0;
	private stopped = false;
	private callsUsed = 0;
	private shutdownDrain: Promise<void> | undefined;

	constructor(options: ManagerOptions = {}) {
		this.loadSdk = options.loadSdk ?? defaultSdkLoader;
		this.readEnvironment = options.readEnvironment ?? defaultEnvironmentReader;
		this.deadlineMs = options.deadlineMs ?? REQUEST_DEADLINE_MS;
		this.maxCalls = options.maxCalls ?? MAX_METADATA_CALLS;
		this.drainMs = options.drainMs ?? MANAGER_DRAIN_MS;
		if (
			!Number.isSafeInteger(this.deadlineMs) || this.deadlineMs < 1 || this.deadlineMs > REQUEST_DEADLINE_MS ||
			!Number.isSafeInteger(this.maxCalls) || this.maxCalls < 1 ||
			!Number.isSafeInteger(this.drainMs) || this.drainMs < 1 || this.drainMs > REQUEST_DEADLINE_MS
		) {
			throw new Error("Invalid Bitwarden manager bounds");
		}
	}

	status(): ManagerStatus {
		let environmentStatus: ReturnType<typeof inspectEnvironment>;
		try {
			environmentStatus = inspectEnvironment(this.readEnvironment());
		} catch {
			environmentStatus = { accessTokenConfigured: false, endpointOverrides: "invalid" };
		}
		return {
			phase: this.phase,
			accessTokenConfigured: environmentStatus.accessTokenConfigured,
			endpointOverrides: environmentStatus.endpointOverrides,
			metadataCallsUsed: this.callsUsed,
			metadataCallLimit: this.maxCalls,
		};
	}

	async listMetadata(
		kind: MetadataKind,
		organizationId: string,
		limit: number,
		signal?: AbortSignal,
	): Promise<MetadataToolResult> {
		if (this.stopped) throw new PublicError("lifecycle");
		if (signalIsAborted(signal)) throw new PublicError("aborted");
		if (this.callsUsed >= this.maxCalls) throw new PublicError("call_limit");
		this.callsUsed += 1;

		const requestEpoch = this.epoch;
		const gate: CancellationGate = { error: undefined };
		this.activeGates.add(gate);
		const operation = this.enqueue(async () => {
			this.assertOperationActive(requestEpoch, gate);
			const authenticated = await this.getClient(requestEpoch, gate);
			this.assertOperationActive(requestEpoch, gate);

			const client = authenticated.client;
			if (client === undefined) throw new PublicError("lifecycle");
			let response: unknown;
			try {
				if (kind === "projects") {
					const projects = callDataMethod(client, "projects");
					response = await callDataMethod(projects, "list", organizationId);
				} else {
					const secrets = callDataMethod(client, "secrets");
					response = await callDataMethod(secrets, "list", organizationId);
				}
			} catch (error) {
				if (error instanceof PublicError) throw error;
				throw new PublicError("request");
			}

			this.assertOperationActive(requestEpoch, gate);
			return buildMetadataToolResult(kind, response, limit, authenticated.redactionValue);
		});
		this.trackOperation(operation, gate);

		return waitWithBoundary(operation, gate, signal, this.deadlineMs);
	}

	async resolveSecretValue(
		secretId: string,
		signal?: AbortSignal,
		deadlineMs = this.deadlineMs,
	): Promise<string> {
		if (this.stopped) throw new PublicError("lifecycle");
		if (signalIsAborted(signal)) throw new PublicError("aborted");
		if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > REQUEST_DEADLINE_MS) {
			throw new PublicError("invalid_input");
		}

		const requestEpoch = this.epoch;
		const gate: CancellationGate = { error: undefined };
		this.activeGates.add(gate);
		const operation = this.enqueue(async () => {
			this.assertOperationActive(requestEpoch, gate);
			const authenticated = await this.getClient(requestEpoch, gate);
			this.assertOperationActive(requestEpoch, gate);

			const client = authenticated.client;
			if (client === undefined) throw new PublicError("lifecycle");
			let response: unknown;
			try {
				const secrets = callDataMethod(client, "secrets");
				response = await callDataMethod(secrets, "get", secretId);
			} catch (error) {
				if (error instanceof PublicError) throw error;
				throw new PublicError("request");
			}
			this.assertOperationActive(requestEpoch, gate);
			return secretValueFromResponse(response, secretId);
		});
		this.trackOperation(operation, gate);

		return waitWithBoundary(operation, gate, signal, deadlineMs);
	}

	reset(): Promise<void> {
		if (this.stopped) return this.shutdownDrain ?? Promise.resolve();
		this.invalidateActiveWork(false);
		return boundedDrain([...this.activeWork], this.drainMs);
	}

	shutdown(): Promise<void> {
		if (this.shutdownDrain !== undefined) return this.shutdownDrain;
		this.stopped = true;
		this.invalidateActiveWork(true);
		this.shutdownDrain = boundedDrain([...this.activeWork], this.drainMs);
		return this.shutdownDrain;
	}

	private invalidateActiveWork(shuttingDown: boolean): void {
		this.epoch += 1;
		const authenticated = this.authenticatedClient;
		if (authenticated !== undefined) this.releaseAuthenticatedClient(authenticated);
		this.authenticatedClient = undefined;
		this.initialization = undefined;
		this.phase = shuttingDown ? "shutting_down" : "not_initialized";
		for (const gate of this.activeGates) {
			const lifecycleError = new PublicError("lifecycle");
			gate.error = lifecycleError;
			gate.cancel?.(lifecycleError);
		}
	}

	private trackOperation(operation: Promise<unknown>, gate: CancellationGate): void {
		const drain = operation.then(
			() => undefined,
			() => undefined,
		);
		this.activeWork.add(drain);
		void drain.then(() => {
			this.activeWork.delete(drain);
			this.activeGates.delete(gate);
		});
	}

	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		const operation = this.operationTail.then(task, task);
		this.operationTail = operation.then(
			() => undefined,
			() => undefined,
		);
		return operation;
	}

	private assertOperationActive(requestEpoch: number, gate: CancellationGate): void {
		if (gate.error !== undefined) throw gate.error;
		if (this.stopped || requestEpoch !== this.epoch) throw new PublicError("lifecycle");
	}

	private async getClient(requestEpoch: number, gate: CancellationGate): Promise<AuthenticatedClient> {
		if (this.authenticatedClient !== undefined) return this.authenticatedClient;
		if (this.stopped || requestEpoch !== this.epoch) throw new PublicError("lifecycle");

		let initialization = this.initialization;
		if (initialization === undefined) {
			this.phase = "initializing";
			initialization = this.createAuthenticatedClient(requestEpoch);
			this.initialization = initialization;
		}

		let authenticated: AuthenticatedClient | undefined;
		try {
			authenticated = await initialization;
			if (gate.error !== undefined) throw gate.error;
			if (this.stopped || requestEpoch !== this.epoch) throw new PublicError("lifecycle");
			this.authenticatedClient = authenticated;
			this.phase = "ready";
			return authenticated;
		} catch (error) {
			if (authenticated !== undefined && authenticated !== this.authenticatedClient) {
				this.releaseAuthenticatedClient(authenticated);
			}
			if (!this.stopped && requestEpoch === this.epoch) {
				this.authenticatedClient = undefined;
				this.phase = "not_initialized";
			}
			throw error instanceof PublicError ? error : new PublicError("sdk");
		} finally {
			if (this.initialization === initialization) this.initialization = undefined;
		}
	}

	private releaseAuthenticatedClient(authenticated: AuthenticatedClient): void {
		authenticated.redactionValue = "";
		authenticated.client = undefined;
	}

	private async createAuthenticatedClient(requestEpoch: number): Promise<AuthenticatedClient> {
		try {
			const configuration = parseRuntimeConfiguration(this.readEnvironment());
			const imported = await this.loadSdk();
			if (this.stopped || requestEpoch !== this.epoch) throw new PublicError("lifecycle");
			const Client = resolveClientConstructor(imported);
			const client = new Client(configuration.settings, 4);
			const authentication = callDataMethod(client, "auth");
			await callDataMethod(authentication, "loginAccessToken", configuration.accessToken);
			if (this.stopped || requestEpoch !== this.epoch) throw new PublicError("lifecycle");
			return { client, redactionValue: configuration.accessToken };
		} catch (error) {
			throw error instanceof PublicError ? error : new PublicError("sdk");
		}
	}
}
