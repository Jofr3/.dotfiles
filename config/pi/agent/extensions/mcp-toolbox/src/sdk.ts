import { AsyncLocalStorage } from "node:async_hooks";
import type { ToolboxTool } from "@toolbox-sdk/core";
import type { AuthTokenGetters, BoundParams } from "@toolbox-sdk/core";
import type { InvocationServerSnapshot } from "./config.ts";
import { EXTENSION_VERSION } from "./config.ts";
import type { CredentialMaterial } from "./credentials.ts";
import { sanitizeRpcErrorPayload } from "./output.ts";

export interface RemoteTool {
	readonly raw: unknown;
	getName(): string;
}

export interface ToolboxSdkClient {
	loadTool(name: string, signal: AbortSignal): Promise<RemoteTool>;
	loadToolset(name: string, signal: AbortSignal): Promise<RemoteTool[]>;
	invoke(tool: RemoteTool, arguments_: Record<string, unknown>, signal: AbortSignal): Promise<string>;
	dispose?(): void | Promise<void>;
}

export type ToolboxSdkClientFactory = (
	server: InvocationServerSnapshot,
	requestTimeoutMs: number,
	credentials: CredentialMaterial,
) => Promise<ToolboxSdkClient>;

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
 * Axios interceptors add Pi cancellation, disable redirects, and ensure the
 * the SDK's own error logger never receives an Axios response body.
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
	const session = axios.create({
		timeout: timeoutMs,
		maxRedirects: 0,
		maxContentLength: 2 * 1024 * 1024,
		maxBodyLength: 1024 * 1024,
	});

	const requestInterceptor = session.interceptors.request.use((request) => {
		const signal = signalContext.getStore();
		if (signal) request.signal = signal;
		return request;
	});
	const responseInterceptor = session.interceptors.response.use(
		(response) => {
			const responseSignal = response.config?.signal;
			const cancelled = responseSignal?.aborted === true || signalContext.getStore()?.aborted === true;
			const successfulStatus = !cancelled &&
				(response.status === 200 || response.status === 202 || response.status === 204);
			if (!successfulStatus) response.statusText = "Error";
			response.data = sanitizeRpcErrorPayload(
				successfulStatus ? response.data : { error: null },
				[...credentials.redactionValues, serverUrl],
			);
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
		serverUrl,
		session,
		headers,
		protocol,
		"pi-mcp-toolbox",
		EXTENSION_VERSION,
	);

	const run = <T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> => signalContext.run(signal, work);
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
			return { raw: tool, getName: () => tool.getName() };
		},
		async loadToolset(name, signal) {
			assertOpen();
			const tools = await run(signal, () => client.loadToolset(
				name,
				authTokenGetters as AuthTokenGetters,
				boundParams as BoundParams,
				false,
			));
			return tools.map((tool) => ({ raw: tool, getName: () => tool.getName() }));
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
			signalContext.disable();
		},
	};
};
