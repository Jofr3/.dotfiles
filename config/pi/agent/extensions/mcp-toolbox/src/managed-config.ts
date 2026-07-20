import { createServer } from "node:net";
import {
	parseConfig,
	type InvocationServerSnapshot,
	type ToolboxConfig,
} from "./config.ts";

export const MANAGED_SERVER_ID = "onepassword-db";
export const MANAGED_TOOL_NAME = "execute_sql";
export const MANAGED_PROTOCOL = "2025-11-25" as const;
export const MANAGED_BOUND_PARAMS = Object.freeze([
	"database_type",
	"server",
	"port",
	"database",
	"username",
	"password",
] as const);

const dynamicReference = Object.freeze({
	resolver: Object.freeze({
		provider: "onepassword-secrets-manager" as const,
		dynamic: true as const,
	}),
});

function loopbackUrl(port: number): string {
	if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
		throw new Error("Managed MCP Toolbox loopback port is invalid");
	}
	return `http://127.0.0.1:${port}`;
}

export function managedToolboxConfig(port: number): ToolboxConfig {
	const boundParams: Record<string, typeof dynamicReference> = Object.create(null);
	for (const name of MANAGED_BOUND_PARAMS) boundParams[name] = dynamicReference;
	return parseConfig({
		version: 1,
		requestTimeoutMs: 30_000,
		servers: [{
			id: MANAGED_SERVER_ID,
			url: loopbackUrl(port),
			protocol: MANAGED_PROTOCOL,
			tools: [{
				name: MANAGED_TOOL_NAME,
				confirmation: "required",
				boundParams: [...MANAGED_BOUND_PARAMS],
			}],
			boundParams,
		}],
	});
}

export async function allocateManagedLoopbackPort(signal?: AbortSignal): Promise<number> {
	if (signal?.aborted) throw new Error("Managed MCP Toolbox setup was cancelled");
	return await new Promise<number>((resolve, reject) => {
		const server = createServer();
		let settled = false;
		const finish = (error?: Error, port?: number): void => {
			if (settled) return;
			settled = true;
			signal?.removeEventListener("abort", onAbort);
			server.removeAllListeners();
			try { server.close(); } catch { /* already closed */ }
			if (error) reject(error);
			else resolve(port!);
		};
		const onAbort = (): void => finish(new Error("Managed MCP Toolbox setup was cancelled"));
		signal?.addEventListener("abort", onAbort, { once: true });
		server.once("error", () => finish(new Error("Managed MCP Toolbox could not reserve a loopback port")));
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				finish(new Error("Managed MCP Toolbox could not reserve a loopback port"));
				return;
			}
			finish(undefined, address.port);
		});
	});
}

export class ManagedServerRegistry {
	#identity: Readonly<{ id: string; url: string; protocol: string }> | undefined;

	adopt(config: ToolboxConfig): void {
		const server = config.servers.find((candidate) => candidate.id === MANAGED_SERVER_ID);
		if (!server || server.mode !== "allowlist" || server.tools.length !== 1 || server.tools[0]?.name !== MANAGED_TOOL_NAME) {
			throw new Error("Managed MCP Toolbox configuration is invalid");
		}
		this.#identity = Object.freeze({ id: server.id, url: server.url, protocol: server.protocol });
	}

	matches(server: InvocationServerSnapshot): boolean {
		const identity = this.#identity;
		return identity !== undefined && server.id === identity.id && server.url === identity.url && server.protocol === identity.protocol;
	}

	clear(): void {
		this.#identity = undefined;
	}
}
