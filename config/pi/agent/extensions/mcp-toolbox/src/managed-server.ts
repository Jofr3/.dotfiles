import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { request } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { CredentialMaterial } from "./credentials.ts";
import { MANAGED_BOUND_PARAMS, ManagedServerRegistry } from "./managed-config.ts";
import {
	createToolboxSdkClient,
	ToolboxManagedServerError,
	type ToolboxSdkClient,
	type ToolboxSdkClientFactory,
} from "./sdk.ts";

const TOOLBOX_VERSION = "1.5.0";
const TOOLBOX_BINARY = fileURLToPath(new URL("../runtime/linux-amd64/toolbox", import.meta.url));
const MYSQL_CONFIG = fileURLToPath(new URL("../managed/mysql.yaml", import.meta.url));
const MSSQL_CONFIG = fileURLToPath(new URL("../managed/mssql.yaml", import.meta.url));
const TOOLBOX_BINARY_BYTES = 304_021_960;
const TOOLBOX_BINARY_SHA256 = "7df2d9941ce34e53af0eacc74e09b29f6ac38543b010b637a0938f2dd2d75609";
const STARTUP_LIMIT_MS = 10_000;
const STOP_LIMIT_MS = 1_000;
const CONTROL_TEXT = /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u;

export interface ManagedConnection {
	readonly engine: "mysql" | "mssql";
	readonly host: string;
	readonly port: string;
	readonly database: string;
	readonly user: string;
	readonly password: string;
}

function managedFailure(message: string): ToolboxManagedServerError {
	return new ToolboxManagedServerError(message);
}

function exactValue(
	values: Readonly<Record<string, string>>,
	name: typeof MANAGED_BOUND_PARAMS[number],
	maximumBytes: number,
	allowControls = false,
): string {
	const value = values[name];
	if (
		typeof value !== "string" || value.length === 0 ||
		Buffer.byteLength(value, "utf8") > maximumBytes || value.includes("\u0000") ||
		(!allowControls && (value.trim() !== value || CONTROL_TEXT.test(value)))
	) throw managedFailure("The approved 1Password database fields are invalid for managed MCP Toolbox.");
	return value;
}

export function parseManagedDatabaseFields(credentials: CredentialMaterial): ManagedConnection {
	if (Object.keys(credentials.headers).length !== 0 || Object.keys(credentials.authTokens).length !== 0) {
		throw managedFailure("Managed MCP Toolbox received an invalid credential plan.");
	}
	const keys = Object.keys(credentials.boundParams).sort();
	const expected = [...MANAGED_BOUND_PARAMS].sort();
	if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
		throw managedFailure("Managed MCP Toolbox received an incomplete 1Password database field mapping.");
	}
	const rawType = exactValue(credentials.boundParams, "database_type", 128)
		.toLowerCase()
		.replace(/[\s_-]+/gu, "");
	let engine: "mysql" | "mssql";
	if (rawType === "mysql" || rawType === "mariadb" || rawType === "maria") engine = "mysql";
	else if (rawType === "mssql" || rawType === "sqlserver" || rawType === "microsoftsqlserver") engine = "mssql";
	else throw managedFailure("The approved 1Password database type is not supported by managed MCP Toolbox.");
	const host = exactValue(credentials.boundParams, "server", 255);
	if (/^-/u.test(host) || host.includes("/") || host.includes("@")) {
		throw managedFailure("The approved 1Password database server is invalid for managed MCP Toolbox.");
	}
	const port = exactValue(credentials.boundParams, "port", 5);
	if (!/^[0-9]{1,5}$/u.test(port) || Number(port) < 1 || Number(port) > 65_535) {
		throw managedFailure("The approved 1Password database port is invalid for managed MCP Toolbox.");
	}
	return Object.freeze({
		engine,
		host,
		port,
		database: exactValue(credentials.boundParams, "database", 256),
		user: exactValue(credentials.boundParams, "username", 256),
		password: exactValue(credentials.boundParams, "password", 8 * 1024, true),
	});
}

async function fileSha256(path: string): Promise<string> {
	const hash = createHash("sha256");
	try {
		for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
		return hash.digest("hex");
	} catch {
		throw managedFailure("The pinned Google Toolbox runtime could not be verified.");
	}
}

async function verifyRegularOwnerFile(path: string, executable: boolean): Promise<Awaited<ReturnType<typeof lstat>>> {
	let stat: Awaited<ReturnType<typeof lstat>>;
	try { stat = await lstat(path); }
	catch { throw managedFailure("The managed Google Toolbox runtime is not installed. Run npm run install-managed-runtime in the MCP Toolbox extension directory."); }
	const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
	if (
		!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || uid === undefined || stat.uid !== uid ||
		(stat.mode & 0o022) !== 0 || (executable && (stat.mode & 0o7777) !== 0o700)
	) throw managedFailure("The managed Google Toolbox runtime failed local ownership or permission checks.");
	return stat;
}

let verifiedBinary: Promise<void> | undefined;
function verifyManagedRuntime(): Promise<void> {
	verifiedBinary ??= (async () => {
		if (process.platform !== "linux" || process.arch !== "x64") {
			throw managedFailure(`The pinned Google Toolbox ${TOOLBOX_VERSION} managed runtime supports only Linux x64.`);
		}
		const before = await verifyRegularOwnerFile(TOOLBOX_BINARY, true);
		if (before.size !== TOOLBOX_BINARY_BYTES || await fileSha256(TOOLBOX_BINARY) !== TOOLBOX_BINARY_SHA256) {
			throw managedFailure("The pinned Google Toolbox runtime checksum is invalid.");
		}
		const after = await verifyRegularOwnerFile(TOOLBOX_BINARY, true);
		if (
			before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
			before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
		) throw managedFailure("The pinned Google Toolbox runtime changed while it was being verified.");
		await Promise.all([
			verifyRegularOwnerFile(MYSQL_CONFIG, false),
			verifyRegularOwnerFile(MSSQL_CONFIG, false),
		]);
	})().catch((error) => {
		verifiedBinary = undefined;
		throw error;
	});
	return verifiedBinary;
}

function managedPort(serverUrl: string): number {
	let url: URL;
	try { url = new URL(serverUrl); }
	catch { throw managedFailure("Managed MCP Toolbox received an invalid loopback endpoint."); }
	const port = Number(url.port);
	if (
		url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/" ||
		url.username || url.password || url.search || url.hash || !Number.isInteger(port) || port < 1 || port > 65_535
	) throw managedFailure("Managed MCP Toolbox received an invalid loopback endpoint.");
	return port;
}

function probeReady(port: number, signal?: AbortSignal): Promise<boolean> {
	if (signal?.aborted) return Promise.resolve(false);
	return new Promise((resolve) => {
		let settled = false;
		const finish = (ready: boolean): void => {
			if (settled) return;
			settled = true;
			signal?.removeEventListener("abort", onAbort);
			resolve(ready);
		};
		const onAbort = (): void => {
			request_.destroy();
			finish(false);
		};
		const request_ = request({
			host: "127.0.0.1",
			port,
			path: "/",
			method: "GET",
			headers: { Host: "127.0.0.1" },
			timeout: 250,
		}, (response) => {
			response.resume();
			finish(true);
		});
		signal?.addEventListener("abort", onAbort, { once: true });
		request_.once("timeout", () => request_.destroy());
		request_.once("error", () => finish(false));
		request_.end();
	});
}

async function stopChild(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
	const exited = once(child, "exit").then(() => undefined, () => undefined);
	try { process.kill(-child.pid, "SIGTERM"); }
	catch { try { child.kill("SIGTERM"); } catch { return; } }
	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([
		exited,
		new Promise<void>((resolve) => { timer = setTimeout(resolve, STOP_LIMIT_MS); }),
	]);
	if (timer) clearTimeout(timer);
	if (child.exitCode === null && child.signalCode === null) {
		try { process.kill(-child.pid, "SIGKILL"); }
		catch { try { child.kill("SIGKILL"); } catch { /* already gone */ } }
		await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, STOP_LIMIT_MS))]);
	}
}

async function startManagedServer(
	serverUrl: string,
	connection: ManagedConnection,
	requestTimeoutMs: number,
	signal?: AbortSignal,
): Promise<ChildProcess> {
	await verifyManagedRuntime();
	if (signal?.aborted) throw managedFailure("Managed MCP Toolbox startup was cancelled.");
	const port = managedPort(serverUrl);
	const config = connection.engine === "mysql" ? MYSQL_CONFIG : MSSQL_CONFIG;
	const childEnvironment: Record<string, string> = Object.create(null);
	childEnvironment.PI_MCP_DB_HOST = connection.host;
	childEnvironment.PI_MCP_DB_PORT = connection.port;
	childEnvironment.PI_MCP_DB_DATABASE = connection.database;
	childEnvironment.PI_MCP_DB_USER = connection.user;
	childEnvironment.PI_MCP_DB_PASSWORD = connection.password;
	let child: ChildProcess;
	try {
		child = spawn(TOOLBOX_BINARY, [
			"--config", config,
			"--disable-reload",
			"--address=127.0.0.1",
			`--port=${port}`,
			"--allowed-hosts=127.0.0.1",
		], {
			detached: true,
			env: childEnvironment,
			stdio: "ignore",
			windowsHide: true,
		});
	} catch {
		throw managedFailure("The managed Google Toolbox server could not be started.");
	} finally {
		for (const key of Object.keys(childEnvironment)) childEnvironment[key] = "";
	}
	let spawnFailed = false;
	child.once("error", () => { spawnFailed = true; });
	const deadline = Date.now() + Math.min(STARTUP_LIMIT_MS, Math.max(1_000, requestTimeoutMs));
	try {
		while (Date.now() < deadline) {
			if (signal?.aborted) throw managedFailure("Managed MCP Toolbox startup was cancelled.");
			if (spawnFailed || child.exitCode !== null || child.signalCode !== null) {
				throw managedFailure("The managed Google Toolbox server could not connect to the approved database fields.");
			}
			if (await probeReady(port, signal)) {
				// A competing loopback listener could win the allocate/launch race. Require
				// the spawned Toolbox process to remain alive across a second probe.
				await new Promise<void>((resolve) => setTimeout(resolve, 100));
				if (
					!spawnFailed && child.exitCode === null && child.signalCode === null &&
					await probeReady(port, signal)
				) return child;
			}
			await new Promise<void>((resolve) => setTimeout(resolve, 100));
		}
		throw managedFailure("The managed Google Toolbox server did not become ready before the deadline.");
	} catch (error) {
		await stopChild(child);
		throw error;
	}
}

function emptySdkCredentials(redactionValues: readonly string[]): CredentialMaterial {
	return {
		headers: Object.create(null) as Record<string, string>,
		authTokens: Object.create(null) as Record<string, string>,
		boundParams: Object.create(null) as Record<string, string>,
		redactionValues: [...redactionValues],
		resolverValuesUsed: false,
	};
}

export function createManagedAwareSdkFactory(
	registry: ManagedServerRegistry,
	baseFactory: ToolboxSdkClientFactory = createToolboxSdkClient,
): ToolboxSdkClientFactory {
	return async (server, requestTimeoutMs, credentials, signal) => {
		if (!registry.matches(server)) return await baseFactory(server, requestTimeoutMs, credentials, signal);
		const connection = parseManagedDatabaseFields(credentials);
		const child = await startManagedServer(server.url, connection, requestTimeoutMs, signal);
		const sdkCredentials = emptySdkCredentials(credentials.redactionValues);
		let client: ToolboxSdkClient;
		try {
			client = await baseFactory(server, requestTimeoutMs, sdkCredentials, signal);
		} catch {
			await stopChild(child);
			for (let index = 0; index < sdkCredentials.redactionValues.length; index += 1) sdkCredentials.redactionValues[index] = "";
			throw managedFailure("The managed Google Toolbox SDK client could not be initialized.");
		}
		let disposed = false;
		return {
			loadTool: (name, operationSignal) => client.loadTool(name, operationSignal),
			loadToolset: (name, operationSignal) => client.loadToolset(name, operationSignal),
			invoke: (tool, arguments_, operationSignal) => client.invoke(tool, arguments_, operationSignal),
			async dispose() {
				if (disposed) return;
				disposed = true;
				try { await client.dispose?.(); }
				finally {
					await stopChild(child);
					for (let index = 0; index < sdkCredentials.redactionValues.length; index += 1) sdkCredentials.redactionValues[index] = "";
					sdkCredentials.redactionValues.length = 0;
				}
			},
		};
	};
}
