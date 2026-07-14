import {
	MAX_TOOLSET_TOOLS,
	type ConfiguredTool,
	type InvocationSnapshot,
	type ServerConfig,
} from "./config.ts";
import { clearCredentialMaterial, resolveCredentialMaterial, type CredentialMaterial } from "./credentials.ts";
import { formatToolboxOutput, type FormattedOutput } from "./output.ts";
import { CredentialResolverError, SecretResolverConsumer } from "./resolver.ts";
import { prepareToolArguments } from "./safety.ts";
import type { RemoteTool, ToolboxSdkClient, ToolboxSdkClientFactory } from "./sdk.ts";

const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
export const MANAGER_DRAIN_MS = 1_000;

export interface ToolboxManagerOptions {
	drainMs?: number;
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
		super("MCP Toolbox request failed after credential preparation; no downstream error details were disclosed");
		this.name = "McpToolboxDownstreamError";
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
		Object.isFrozen(snapshot.tool.boundParams);
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
		return {
			generation: this.#generation,
			initializedServers: 0,
			loadedTools: 0,
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
		// Reject model-controlled routing and generic credential shapes before
		// resolver work so invalid input cannot consume a one-shot grant.
		const precheckedArguments = prepareToolArguments(arguments_);

		return this.#withinDeadline(timeoutMs, signal, async (operationSignal, deadlineAt) => {
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
			try {
				this.#assertActive(generation, operationSignal);
				const checkedArguments = prepareToolArguments(precheckedArguments, credentials.redactionValues);
				const remainingMs = Math.max(1, deadlineAt - Date.now());
				client = await this.#factory(server, remainingMs, credentials);
				this.#assertActive(generation, operationSignal);
				const loaded = await this.#loadTool(client, tool, operationSignal);
				this.#assertActive(generation, operationSignal);
				const raw = await client.invoke(loaded, checkedArguments, operationSignal);
				this.#assertActive(generation, operationSignal);
				if (typeof raw !== "string") throw new ToolboxDownstreamError();
				return formatToolboxOutput(raw, credentials.redactionValues);
			} catch (error) {
				if (operationSignal.aborted || generation !== this.#generation || this.#closed) {
					throw new OperationStoppedError("reset");
				}
				if (error instanceof CredentialResolverError) throw error;
				throw new ToolboxDownstreamError();
			} finally {
				try {
					await client?.dispose?.();
				} catch {
					// Cleanup errors may contain credentials and are intentionally suppressed.
				}
				this.#activeCredentials.delete(credentials);
				clearCredentialMaterial(credentials);
			}
		});
	}

	reset(): Promise<void> {
		if (this.#closed) return this.#shutdownDrain ?? Promise.resolve();
		this.#generation += 1;
		for (const controller of this.#activeControllers) controller.abort("manager-reset");
		for (const credentials of this.#activeCredentials) clearCredentialMaterial(credentials);
		return boundedDrain([...this.#activeWork], this.#drainMs);
	}

	shutdown(): Promise<void> {
		if (this.#shutdownDrain !== undefined) return this.#shutdownDrain;
		this.#closed = true;
		this.#generation += 1;
		for (const controller of this.#activeControllers) controller.abort("manager-shutdown");
		for (const credentials of this.#activeCredentials) clearCredentialMaterial(credentials);
		this.#shutdownDrain = boundedDrain([...this.#activeWork], this.#drainMs);
		return this.#shutdownDrain;
	}
}
