import { createHash } from "node:crypto";
import {
	MAX_CATALOG_TOOLS_PER_TOOLSET,
	MAX_DISCOVERED_TOOLS_TOTAL,
	type CatalogParameterSummary,
	type CatalogToolMetadata,
} from "./catalog.ts";
import {
	MAX_TOOLSET_TOOLS,
	type ConfiguredTool,
	ConfigError,
	createDiscoveredInvocationSnapshot,
	createInvocationSnapshot,
	type InvocationServerSnapshot,
	type InvocationSnapshot,
	type ServerConfig,
	type ToolboxConfig,
} from "./config.ts";
import { clearCredentialMaterial, resolveCredentialMaterial, type CredentialMaterial } from "./credentials.ts";
import { formatToolboxOutput, type FormattedOutput } from "./output.ts";
import { CredentialResolverError, SecretResolverConsumer } from "./resolver.ts";
import { prepareToolArguments } from "./safety.ts";
import { ToolboxManagedServerError } from "./sdk.ts";
import type { RemoteTool, ToolboxSdkClient, ToolboxSdkClientFactory } from "./sdk.ts";

const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
export const MANAGER_DRAIN_MS = 1_000;

export interface ToolboxManagerOptions {
	drainMs?: number;
}

export interface CatalogRefreshOptions {
	/** Session-only unverified loopback adoption sets this false. */
	allowInferredAuth?: boolean;
}

export interface ManagerSnapshot {
	generation: number;
	initializedServers: number;
	loadedTools: number;
	activeOperations: number;
}

export interface ManagerGenerationTicket {
	readonly opaque: true;
}

export interface CatalogToolSummary {
	readonly server: string;
	readonly name: string;
	readonly toolset?: string;
	readonly parameters: readonly CatalogParameterSummary[];
	readonly authTokens: readonly string[];
}

interface CatalogToolEntry {
	readonly metadata: CatalogToolMetadata;
}

interface ServerCatalog {
	readonly identity: string;
	readonly tools: ReadonlyMap<string, CatalogToolEntry>;
	readonly unsupportedTools: number;
}

export class OperationStoppedError extends Error {
	constructor(reason: "cancelled" | "timed out" | "reset") {
		const message = reason === "timed out"
			? "MCP Toolbox operation timed out; remote side-effect outcome may be unknown"
			: reason === "reset"
				? "MCP Toolbox operation was interrupted by reload or shutdown; remote side-effect outcome may be unknown"
				: "MCP Toolbox operation was cancelled; remote side-effect outcome may be unknown";
		super(message);
		this.name = "McpToolboxOperationStoppedError";
	}
}

export class ToolboxDownstreamError extends Error {
	constructor() {
		super("MCP Toolbox request failed; no downstream error details were disclosed");
		this.name = "McpToolboxDownstreamError";
	}
}

export class CatalogChangedError extends Error {
	constructor() {
		super("MCP Toolbox catalog changed; rediscover the catalog and prepare fresh credential grants before retrying");
		this.name = "McpToolboxCatalogChangedError";
	}
}

export function configuredToolsForToolset(server: ServerConfig, toolset: string): ConfiguredTool[] {
	const denied = new Set(server.denyTools);
	return server.tools.filter((tool) => tool.toolset === toolset && !denied.has(tool.name));
}

function validateRemoteToolName(tool: RemoteTool): string {
	let name: unknown;
	try {
		name = tool.getName();
	} catch {
		throw new ToolboxDownstreamError();
	}
	if (typeof name !== "string" || !REMOTE_NAME.test(name)) throw new ToolboxDownstreamError();
	return name;
}

function validateCatalogMetadata(tool: RemoteTool, expectedToolset: string | undefined): CatalogToolMetadata {
	const name = validateRemoteToolName(tool);
	const metadata = tool.metadata;
	if (
		!metadata || !Object.isFrozen(metadata) || metadata.name !== name ||
		metadata.toolset !== expectedToolset ||
		!/^[A-Za-z0-9_-]{43}$/u.test(metadata.fingerprint) ||
		!Array.isArray(metadata.parameters) || !Object.isFrozen(metadata.parameters) ||
		!Array.isArray(metadata.authTokens) || !Object.isFrozen(metadata.authTokens) ||
		typeof metadata.usable !== "boolean"
	) throw new ToolboxDownstreamError();
	return metadata;
}

function emptyCredentialMaterial(): CredentialMaterial {
	return {
		headers: Object.create(null) as Record<string, string>,
		authTokens: Object.create(null) as Record<string, string>,
		boundParams: Object.create(null) as Record<string, string>,
		redactionValues: [],
		resolverValuesUsed: false,
	};
}

function discoveryServerSnapshot(server: ServerConfig): InvocationServerSnapshot {
	return Object.freeze({
		id: server.id,
		url: server.url,
		protocol: server.protocol,
		headers: Object.freeze(Object.create(null) as Record<string, never>),
		authTokens: Object.freeze(Object.create(null) as Record<string, never>),
		boundParams: Object.freeze(Object.create(null) as Record<string, never>),
	});
}

function serverIdentity(server: ServerConfig): string {
	return createHash("sha256").update(JSON.stringify({
		id: server.id,
		url: server.url,
		protocol: server.protocol,
		toolsets: server.toolsets,
		denyTools: server.denyTools,
	}), "utf8").digest("base64url");
}

function disposeWithoutWaiting(client: ToolboxSdkClient | undefined): void {
	try {
		void Promise.resolve(client?.dispose?.()).catch(() => undefined);
	} catch {
		// Untrusted cleanup errors are intentionally suppressed.
	}
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

function isFrozenInvocation(snapshot: InvocationSnapshot): boolean {
	return Object.isFrozen(snapshot) &&
		Object.isFrozen(snapshot.server) &&
		Object.isFrozen(snapshot.server.headers) &&
		Object.isFrozen(snapshot.server.authTokens) &&
		Object.isFrozen(snapshot.server.boundParams) &&
		Object.isFrozen(snapshot.tool) &&
		Object.isFrozen(snapshot.tool.authTokens) &&
		Object.isFrozen(snapshot.tool.boundParams) &&
		(snapshot.discovery === undefined || Object.isFrozen(snapshot.discovery));
}

function authMetadataMatches(actual: CatalogToolMetadata, snapshot: InvocationSnapshot): boolean {
	return actual.fingerprint === snapshot.discovery?.fingerprint &&
		actual.usable === true &&
		actual.authTokens.length === snapshot.tool.authTokens.length &&
		actual.authTokens.every((name, index) => name === [...snapshot.tool.authTokens].sort()[index]);
}

export class ToolboxManager {
	#generation = 0;
	#closed = false;
	readonly #factory: ToolboxSdkClientFactory;
	readonly #resolver: SecretResolverConsumer;
	readonly #drainMs: number;
	readonly #activeControllers = new Set<AbortController>();
	readonly #activeWork = new Set<Promise<void>>();
	readonly #activeCredentials = new Set<CredentialMaterial>();
	readonly #tickets = new WeakMap<object, number>();
	readonly #catalogs = new Map<string, ServerCatalog>();
	#shutdownDrain: Promise<void> | undefined;

	constructor(
		factory: ToolboxSdkClientFactory,
		resolver: SecretResolverConsumer,
		options: ToolboxManagerOptions = {},
	) {
		this.#factory = factory;
		this.#resolver = resolver;
		this.#drainMs = options.drainMs ?? MANAGER_DRAIN_MS;
		if (!Number.isSafeInteger(this.#drainMs) || this.#drainMs < 1 || this.#drainMs > 30_000) {
			throw new Error("Invalid MCP Toolbox manager drain bound");
		}
	}

	snapshot(): ManagerSnapshot {
		let loadedTools = 0;
		for (const catalog of this.#catalogs.values()) loadedTools += catalog.tools.size;
		return {
			generation: this.#generation,
			initializedServers: this.#catalogs.size,
			loadedTools,
			activeOperations: Math.max(this.#activeControllers.size, this.#activeWork.size),
		};
	}

	captureGeneration(): ManagerGenerationTicket {
		const ticket = Object.freeze({ opaque: true as const });
		this.#tickets.set(ticket, this.#generation);
		return ticket;
	}

	#assertTicket(ticket: ManagerGenerationTicket): number {
		const generation = this.#tickets.get(ticket as object);
		this.#tickets.delete(ticket as object);
		if (this.#closed || generation === undefined || generation !== this.#generation) {
			throw new OperationStoppedError("reset");
		}
		return generation;
	}

	#assertActive(generation: number, signal: AbortSignal): void {
		if (this.#closed || generation !== this.#generation || signal.aborted) {
			throw new OperationStoppedError("reset");
		}
	}

	#advanceGeneration(excludedSignal?: AbortSignal): number {
		this.#generation += 1;
		for (const controller of this.#activeControllers) {
			if (controller.signal !== excludedSignal) controller.abort("manager-generation-advanced");
		}
		for (const credentials of this.#activeCredentials) clearCredentialMaterial(credentials);
		return this.#generation;
	}

	async #loadTool(
		client: ToolboxSdkClient,
		tool: ConfiguredTool,
		signal: AbortSignal,
	): Promise<RemoteTool> {
		if (!tool.toolset) {
			const loaded = await client.loadTool(tool.name, signal);
			if (validateRemoteToolName(loaded) !== tool.name) throw new ToolboxDownstreamError();
			return loaded;
		}
		const loaded = await client.loadToolset(tool.toolset, signal);
		if (!Array.isArray(loaded) || loaded.length > MAX_TOOLSET_TOOLS) throw new ToolboxDownstreamError();
		let selected: RemoteTool | undefined;
		const seen = new Set<string>();
		for (const candidate of loaded) {
			const name = validateRemoteToolName(candidate);
			if (seen.has(name)) throw new ToolboxDownstreamError();
			seen.add(name);
			if (name === tool.name) selected = candidate;
		}
		if (!selected) throw new ToolboxDownstreamError();
		return selected;
	}

	#withinDeadline<T>(
		timeoutMs: number,
		signal: AbortSignal | undefined,
		work: (signal: AbortSignal, deadlineAt: number) => Promise<T>,
	): Promise<T> {
		const controller = new AbortController();
		this.#activeControllers.add(controller);
		let timedOut = false;
		const abort = (): void => controller.abort("pi-cancelled");
		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted) abort();
		const deadlineAt = Date.now() + timeoutMs;
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort("deadline");
		}, timeoutMs);

		const operation = Promise.resolve().then(() => {
			if (controller.signal.aborted) {
				throw new OperationStoppedError(signal?.aborted ? "cancelled" : timedOut ? "timed out" : "reset");
			}
			return work(controller.signal, deadlineAt);
		});
		const tracked = operation.then(() => undefined, () => undefined);
		this.#activeWork.add(tracked);
		void tracked.then(() => this.#activeWork.delete(tracked));

		return new Promise<T>((resolve, reject) => {
			let settled = false;
			const finish = (callback: () => void): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				controller.signal.removeEventListener("abort", onAbort);
				signal?.removeEventListener("abort", abort);
				this.#activeControllers.delete(controller);
				callback();
			};
			const onAbort = (): void => finish(() => reject(new OperationStoppedError(
				signal?.aborted ? "cancelled" : timedOut ? "timed out" : "reset",
			)));
			controller.signal.addEventListener("abort", onAbort, { once: true });
			if (controller.signal.aborted) {
				onAbort();
				return;
			}
			operation.then(
				(value) => finish(() => resolve(value)),
				(error: unknown) => finish(() => reject(error)),
			);
		});
	}

	async refreshCatalogs(
		config: ToolboxConfig,
		ticket: ManagerGenerationTicket,
		signal?: AbortSignal,
		options: CatalogRefreshOptions = {},
	): Promise<readonly CatalogToolSummary[]> {
		this.#assertTicket(ticket);
		const allowInferredAuth = options.allowInferredAuth ?? true;
		const servers = config.servers.filter((server) => server.mode === "discovery");
		if (servers.length === 0) return Object.freeze([]);
		// A refresh is a catalog generation boundary. Abort every older operation
		// before staging replacement catalogs so no discovered call can race a
		// refreshed membership or fingerprint.
		const generation = this.#advanceGeneration();
		for (const server of servers) this.#catalogs.delete(server.id);
		return this.#withinDeadline(config.requestTimeoutMs, signal, async (operationSignal, deadlineAt) => {
			const staged = new Map<string, ServerCatalog>();
			let totalDiscoveredTools = 0;
			try {
				for (const server of servers) {
					this.#assertActive(generation, operationSignal);
					const tools = new Map<string, CatalogToolEntry>();
					const folded = new Set<string>();
					let unsupportedTools = 0;
					const toolsets: Array<string | undefined> = [undefined, ...server.toolsets];
					const material = emptyCredentialMaterial();
					let client: ToolboxSdkClient | undefined;
					try {
						client = await this.#factory(
							discoveryServerSnapshot(server),
							Math.max(1, deadlineAt - Date.now()),
							material,
							operationSignal,
						);
						this.#assertActive(generation, operationSignal);
						for (const toolset of toolsets) {
							this.#assertActive(generation, operationSignal);
							const loaded = await client.loadToolset(toolset, operationSignal);
							this.#assertActive(generation, operationSignal);
							if (!Array.isArray(loaded) || loaded.length > MAX_CATALOG_TOOLS_PER_TOOLSET) {
								throw new ToolboxDownstreamError();
							}
							for (const candidate of loaded) {
								const metadata = validateCatalogMetadata(candidate, toolset);
								const lower = metadata.name.toLowerCase();
								if (tools.has(metadata.name) || folded.has(lower)) throw new ToolboxDownstreamError();
								folded.add(lower);
								if (!metadata.usable || (!allowInferredAuth && metadata.authTokens.length > 0)) {
									unsupportedTools += 1;
									continue;
								}
								if (server.denyTools.includes(metadata.name)) continue;
								tools.set(metadata.name, Object.freeze({ metadata }));
								totalDiscoveredTools += 1;
								if (totalDiscoveredTools > MAX_DISCOVERED_TOOLS_TOTAL) throw new ToolboxDownstreamError();
							}
						}
					} finally {
						try { await client?.dispose?.(); } catch { /* suppress untrusted cleanup errors */ }
						clearCredentialMaterial(material);
					}
					staged.set(server.id, Object.freeze({
						identity: serverIdentity(server),
						tools,
						unsupportedTools,
					}));
				}
				this.#assertActive(generation, operationSignal);
				for (const [serverId, catalog] of staged) this.#catalogs.set(serverId, catalog);
				return this.catalogTools(config);
			} catch (error) {
				// A stale aborted refresh must never erase catalogs committed by a
				// newer generation while the stale client's cleanup was still pending.
				if (generation === this.#generation && !this.#closed) {
					for (const server of servers) this.#catalogs.delete(server.id);
				}
				if (operationSignal.aborted || generation !== this.#generation || this.#closed) {
					throw new OperationStoppedError("reset");
				}
				if (error instanceof OperationStoppedError) throw error;
				throw new ToolboxDownstreamError();
			}
		});
	}

	catalogTools(config: ToolboxConfig): readonly CatalogToolSummary[] {
		const output: CatalogToolSummary[] = [];
		for (const server of config.servers) {
			if (server.mode !== "discovery") continue;
			const catalog = this.#catalogs.get(server.id);
			if (!catalog || catalog.identity !== serverIdentity(server)) continue;
			for (const { metadata } of catalog.tools.values()) {
				output.push(Object.freeze({
					server: server.id,
					name: metadata.name,
					...(metadata.toolset === undefined ? {} : { toolset: metadata.toolset }),
					parameters: Object.freeze(metadata.parameters.map((parameter) => Object.freeze({ ...parameter }))),
					authTokens: Object.freeze([...metadata.authTokens]),
				}));
			}
		}
		return Object.freeze(output);
	}

	unsupportedToolCount(config: ToolboxConfig): number {
		let count = 0;
		for (const server of config.servers) {
			const catalog = this.#catalogs.get(server.id);
			if (server.mode === "discovery" && catalog?.identity === serverIdentity(server)) {
				count += catalog.unsupportedTools;
			}
		}
		return count;
	}

	createInvocationSnapshot(config: ToolboxConfig, serverId: string, toolName: string): InvocationSnapshot {
		const server = config.servers.find((candidate) => candidate.id === serverId);
		if (!server) throw new ConfigError("Requested MCP Toolbox server is not configured", "server-not-allowed");
		if (server.denyTools.includes(toolName)) throw new ConfigError("Requested MCP Toolbox tool is denied", "tool-denied");
		if (server.mode === "allowlist") return createInvocationSnapshot(config, serverId, toolName);
		const catalog = this.#catalogs.get(server.id);
		if (!catalog || catalog.identity !== serverIdentity(server)) {
			throw new ConfigError("MCP Toolbox catalog has not been discovered for this server", "catalog-not-discovered");
		}
		const entry = catalog.tools.get(toolName);
		if (!entry) throw new ConfigError("Requested MCP Toolbox tool is not in the discovered catalog", "tool-not-allowed");
		return createDiscoveredInvocationSnapshot(config, serverId, entry.metadata);
	}

	#catalogChanged(serverId: string, operationSignal: AbortSignal): CatalogChangedError {
		this.#catalogs.delete(serverId);
		// Keep the detecting operation alive just long enough to return the precise
		// mismatch error, while aborting all siblings and invalidating every ticket.
		this.#advanceGeneration(operationSignal);
		return new CatalogChangedError();
	}

	async call(
		snapshot: InvocationSnapshot,
		arguments_: Record<string, unknown>,
		ticket: ManagerGenerationTicket,
		signal?: AbortSignal,
	): Promise<FormattedOutput> {
		const generation = this.#assertTicket(ticket);
		if (!isFrozenInvocation(snapshot)) throw new ToolboxDownstreamError();
		const timeoutMs = snapshot.requestTimeoutMs;
		const server = snapshot.server;
		const tool = snapshot.tool;
		const precheckedArguments = prepareToolArguments(arguments_);

		return this.#withinDeadline(timeoutMs, signal, async (operationSignal, deadlineAt) => {
			if (snapshot.discovery) {
				const empty = emptyCredentialMaterial();
				let verifier: ToolboxSdkClient | undefined;
				let terminalCatalogChange = false;
				try {
					verifier = await this.#factory(server, Math.max(1, deadlineAt - Date.now()), empty, operationSignal);
					this.#assertActive(generation, operationSignal);
					const fresh = await this.#loadTool(verifier, tool, operationSignal);
					this.#assertActive(generation, operationSignal);
					const metadata = validateCatalogMetadata(fresh, tool.toolset);
					if (!authMetadataMatches(metadata, snapshot)) {
						throw this.#catalogChanged(server.id, operationSignal);
					}
				} catch (error) {
					if (error instanceof CatalogChangedError) {
						terminalCatalogChange = true;
						throw error;
					}
					if (operationSignal.aborted || generation !== this.#generation || this.#closed) {
						throw new OperationStoppedError("reset");
					}
					terminalCatalogChange = true;
					throw this.#catalogChanged(server.id, operationSignal);
				} finally {
					if (terminalCatalogChange) disposeWithoutWaiting(verifier);
					else {
						try { await verifier?.dispose?.(); } catch { /* suppress untrusted cleanup errors */ }
					}
					clearCredentialMaterial(empty);
				}
			}

			let credentials: CredentialMaterial;
			try {
				credentials = await resolveCredentialMaterial(
					server,
					tool,
					this.#resolver,
					operationSignal,
					deadlineAt,
				);
			} catch (error) {
				if (operationSignal.aborted) throw new OperationStoppedError("reset");
				if (error instanceof CredentialResolverError) throw error;
				throw error;
			}

			this.#activeCredentials.add(credentials);
			let client: ToolboxSdkClient | undefined;
			let invocationStarted = false;
			let terminalCatalogChange = false;
			try {
				this.#assertActive(generation, operationSignal);
				const checkedArguments = prepareToolArguments(precheckedArguments, credentials.redactionValues);
				const remainingMs = Math.max(1, deadlineAt - Date.now());
				client = await this.#factory(server, remainingMs, credentials, operationSignal);
				this.#assertActive(generation, operationSignal);
				const loaded = await this.#loadTool(client, tool, operationSignal);
				this.#assertActive(generation, operationSignal);
				if (snapshot.discovery) {
					const metadata = validateCatalogMetadata(loaded, tool.toolset);
					if (!authMetadataMatches(metadata, snapshot)) {
						throw this.#catalogChanged(server.id, operationSignal);
					}
				}
				this.#assertActive(generation, operationSignal);
				invocationStarted = true;
				const raw = await client.invoke(loaded, checkedArguments, operationSignal);
				this.#assertActive(generation, operationSignal);
				if (typeof raw !== "string") throw new ToolboxDownstreamError();
				return formatToolboxOutput(raw, credentials.redactionValues);
			} catch (error) {
				if (error instanceof CatalogChangedError) {
					terminalCatalogChange = true;
					throw error;
				}
				if (operationSignal.aborted || generation !== this.#generation || this.#closed) {
					throw new OperationStoppedError("reset");
				}
				if (error instanceof CredentialResolverError || error instanceof ToolboxManagedServerError) throw error;
				if (snapshot.discovery && !invocationStarted) {
					terminalCatalogChange = true;
					throw this.#catalogChanged(server.id, operationSignal);
				}
				throw new ToolboxDownstreamError();
			} finally {
				if (terminalCatalogChange) disposeWithoutWaiting(client);
				else {
					try {
						await client?.dispose?.();
					} catch {
						// Cleanup errors may contain credentials and are intentionally suppressed.
					}
				}
				this.#activeCredentials.delete(credentials);
				clearCredentialMaterial(credentials);
			}
		});
	}

	reset(): Promise<void> {
		if (this.#closed) return this.#shutdownDrain ?? Promise.resolve();
		this.#advanceGeneration();
		this.#catalogs.clear();
		return boundedDrain([...this.#activeWork], this.#drainMs);
	}

	shutdown(): Promise<void> {
		if (this.#shutdownDrain !== undefined) return this.#shutdownDrain;
		this.#closed = true;
		this.#advanceGeneration();
		this.#catalogs.clear();
		this.#shutdownDrain = boundedDrain([...this.#activeWork], this.#drainMs);
		return this.#shutdownDrain;
	}
}
