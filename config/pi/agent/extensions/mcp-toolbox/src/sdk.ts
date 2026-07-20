import { AsyncLocalStorage } from "node:async_hooks";
import type { ToolboxTool } from "@toolbox-sdk/core";
import type { AuthTokenGetters, BoundParams } from "@toolbox-sdk/core";
import { catalogMetadataFromSanitizedRpcPayload, type CatalogToolMetadata } from "./catalog.ts";
import type { InvocationServerSnapshot } from "./config.ts";
import { EXTENSION_VERSION } from "./config.ts";
import type { CredentialMaterial } from "./credentials.ts";
import { sanitizeRpcErrorPayload } from "./output.ts";

export interface RemoteTool {
	readonly raw: unknown;
	readonly metadata: CatalogToolMetadata;
	getName(): string;
}

export interface ToolboxSdkClient {
	loadTool(name: string, signal: AbortSignal): Promise<RemoteTool>;
	loadToolset(name: string | undefined, signal: AbortSignal): Promise<RemoteTool[]>;
	invoke(tool: RemoteTool, arguments_: Record<string, unknown>, signal: AbortSignal): Promise<string>;
	dispose?(): void | Promise<void>;
}

export type ToolboxSdkClientFactory = (
	server: InvocationServerSnapshot,
	requestTimeoutMs: number,
	credentials: CredentialMaterial,
	signal?: AbortSignal,
) => Promise<ToolboxSdkClient>;

/** Fixed safe managed-runtime failure preserved by the manager. */
export class ToolboxManagedServerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "McpToolboxManagedServerError";
	}
}

type RpcRequestMethod = "initialize" | "notifications/initialized" | "tools/list" | "tools/call";

// The pinned SDK includes its transport URL in internal error-log messages. Give the
// SDK a fixed non-sensitive origin and rewrite only its exact bounded MCP paths
// inside our private Axios instance before transport.
const SDK_LOG_SAFE_BASE_URL = "https://mcp-toolbox.invalid";
const SDK_REQUEST_PATH = /^\/mcp\/(?:[A-Za-z0-9][A-Za-z0-9_.-]{0,127})?$/u;

function transportUrl(value: unknown, serverUrl: string): string {
	if (typeof value !== "string") throw new Error("MCP Toolbox SDK produced an invalid request target");
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error("MCP Toolbox SDK produced an invalid request target");
	}
	if (
		parsed.origin !== SDK_LOG_SAFE_BASE_URL || parsed.username || parsed.password ||
		parsed.search || parsed.hash || !SDK_REQUEST_PATH.test(parsed.pathname)
	) {
		throw new Error("MCP Toolbox SDK produced an invalid request target");
	}
	return `${serverUrl}${parsed.pathname}`;
}

function requestMethod(value: unknown): RpcRequestMethod | undefined {
	try {
		const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
		const descriptor = Object.getOwnPropertyDescriptor(parsed, "method");
		if (!descriptor || !("value" in descriptor)) return undefined;
		const method = descriptor.value;
		return method === "initialize" || method === "notifications/initialized" ||
			method === "tools/list" || method === "tools/call" ? method : undefined;
	} catch {
		return undefined;
	}
}

function transportError(error: unknown, signal: AbortSignal, isAxiosError: (value: unknown) => boolean): Error {
	if (signal.aborted) return new Error("MCP Toolbox HTTP request was cancelled; remote outcome may be unknown");
	if (isAxiosError(error)) {
		const axiosError = error as {
			code?: unknown;
			response?: { status?: unknown };
		};
		if (axiosError.code === "ECONNABORTED" || axiosError.code === "ETIMEDOUT") {
			return new Error("MCP Toolbox HTTP request timed out; remote outcome may be unknown");
		}
		if (typeof axiosError.response?.status === "number") {
			return new Error(`MCP Toolbox server returned HTTP ${axiosError.response.status}`);
		}
		return new Error("MCP Toolbox transport request failed");
	}
	return new Error("MCP Toolbox transport request failed");
}

/**
 * Lazy production adapter around the exact @toolbox-sdk/core@1.0.1 API.
 * Axios interceptors add Pi cancellation, disable redirects, replace the
 * SDK-visible endpoint with a fixed non-sensitive origin, and ensure the SDK's
 * own error logger never receives an Axios response body.
 */
export const createToolboxSdkClient: ToolboxSdkClientFactory = async (server, requestTimeoutMs, credentials) => {
	// Capture immutable config primitives and selected names before the first
	// asynchronous import so later reload/path replacement cannot redirect this client.
	const serverUrl = server.url;
	const serverProtocol = server.protocol;
	const timeoutMs = requestTimeoutMs;
	const headerNames = Object.keys(credentials.headers);
	const authTokenNames = Object.keys(credentials.authTokens);
	const boundParamNames = Object.keys(credentials.boundParams);
	const [{ ToolboxClient, Protocol }, axiosModule] = await Promise.all([
		import("@toolbox-sdk/core"),
		import("axios"),
	]);
	const axios = axiosModule.default;
	const signalContext = new AsyncLocalStorage<AbortSignal>();
	let latestCatalogPayload: unknown;
	const session = axios.create({
		timeout: timeoutMs,
		maxRedirects: 0,
		maxContentLength: 2 * 1024 * 1024,
		maxBodyLength: 1024 * 1024,
		proxy: false,
	});

	const requestInterceptor = session.interceptors.request.use((request) => {
		const signal = signalContext.getStore();
		if (signal) request.signal = signal;
		request.url = transportUrl(request.url, serverUrl);
		request.baseURL = undefined;
		return request;
	});
	const responseInterceptor = session.interceptors.response.use(
		(response) => {
			const originalConfig = response.config;
			const responseSignal = originalConfig?.signal;
			const cancelled = responseSignal?.aborted === true || signalContext.getStore()?.aborted === true;
			const successfulStatus = !cancelled &&
				(response.status === 200 || response.status === 202 || response.status === 204);
			response.statusText = successfulStatus ? "OK" : "Error";
			const method = requestMethod(originalConfig?.data);
			response.data = sanitizeRpcErrorPayload(
				successfulStatus ? response.data : { error: null },
				[...credentials.redactionValues, serverUrl],
				{
					expectedProtocolVersion: serverProtocol,
					requestMethod: method,
				},
			);
			// Detach transport-only endpoint, credential headers, adapter state, and
			// request objects before the response returns to SDK code. The SDK may
			// retain response.config/request inside an AxiosError on RPC failures.
			response.config = {
				url: `${SDK_LOG_SAFE_BASE_URL}/mcp/`,
				method: "post",
				headers: Object.create(null),
			} as typeof response.config;
			response.headers = Object.create(null);
			response.request = undefined;
			if (successfulStatus && method === "tools/list") latestCatalogPayload = response.data;
			return response;
		},
		(error: unknown) => Promise.reject(transportError(
			error,
			signalContext.getStore() ?? new AbortController().signal,
			axios.isAxiosError,
		)),
	);

	const headers: Record<string, () => string> = Object.create(null);
	for (const headerName of headerNames) {
		headers[headerName] = () => credentials.headers[headerName]!;
	}
	const authTokenGetters: Record<string, () => string> = Object.create(null);
	for (const name of authTokenNames) {
		authTokenGetters[name] = () => credentials.authTokens[name]!;
	}
	const boundParams: Record<string, () => string> = Object.create(null);
	for (const name of boundParamNames) {
		boundParams[name] = () => credentials.boundParams[name]!;
	}
	const protocol = Object.values(Protocol).find((candidate) => candidate === serverProtocol);
	if (!protocol) throw new Error("Configured MCP protocol is unavailable in @toolbox-sdk/core@1.0.1");
	const client = new ToolboxClient(
		SDK_LOG_SAFE_BASE_URL,
		session,
		headers,
		protocol,
		"pi-mcp-toolbox",
		EXTENSION_VERSION,
	);

	const run = <T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> => signalContext.run(signal, work);
	const wrapTools = (
		tools: ToolboxTool[],
		toolset: string | undefined,
		selectedName?: string,
	): RemoteTool[] => {
		const catalog = catalogMetadataFromSanitizedRpcPayload(latestCatalogPayload, toolset);
		latestCatalogPayload = undefined;
		const metadata = selectedName === undefined
			? catalog
			: catalog.filter((entry) => entry.name === selectedName);
		if (metadata.length !== tools.length) throw new Error("MCP Toolbox catalog/tool mismatch");
		const byName = new Map(metadata.map((entry) => [entry.name, entry]));
		return tools.map((tool) => {
			const entry = byName.get(tool.getName());
			if (!entry) throw new Error("MCP Toolbox catalog/tool mismatch");
			return { raw: tool, metadata: entry, getName: () => tool.getName() };
		});
	};
	let disposed = false;
	const assertOpen = (): void => {
		if (disposed) throw new Error("MCP Toolbox SDK adapter is closed");
	};
	return {
		async loadTool(name, signal) {
			assertOpen();
			const tool = await run(signal, () => client.loadTool(
				name,
				authTokenGetters as AuthTokenGetters,
				boundParams as BoundParams,
			));
			const wrapped = wrapTools([tool], undefined, name);
			return wrapped[0]!;
		},
		async loadToolset(name, signal) {
			assertOpen();
			const tools = await run(signal, () => client.loadToolset(
				name,
				authTokenGetters as AuthTokenGetters,
				boundParams as BoundParams,
				false,
			));
			return wrapTools(tools, name);
		},
		async invoke(tool, arguments_, signal) {
			assertOpen();
			const callable = tool.raw as ToolboxTool;
			return run(signal, () => callable(arguments_));
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			session.interceptors.request.eject(requestInterceptor);
			session.interceptors.response.eject(responseInterceptor);
			latestCatalogPayload = undefined;
			signalContext.disable();
		},
	};
};
