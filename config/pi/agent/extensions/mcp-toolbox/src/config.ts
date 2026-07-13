import { constants as fsConstants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

export const SDK_VERSION = "1.0.1";
export const EXTENSION_VERSION = "1.0.0";
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const MAX_CONFIG_BYTES = 256 * 1024;
export const MAX_SERVERS = 16;
export const MAX_TOOLS_PER_SERVER = 128;
export const MAX_TOOLSET_TOOLS = 256;
export const MAX_RESOLVER_REFERENCES_PER_CALL = 20;
export const MAX_CREDENTIAL_REFERENCES_PER_CALL = 32;

const PROTOCOLS = new Set(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"]);
const DEFAULT_PROTOCOL = "2025-11-25";
const SERVER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const RESOLVER_SLOT = /^[a-z][a-z0-9._-]{0,127}$/;
const RESOLVER_PROVIDER = "bitwarden-secrets-manager";
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,64}$/;
const FORBIDDEN_HEADERS = new Set([
	"connection",
	"content-length",
	"cookie",
	"forwarded",
	"host",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"set-cookie",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"x-forwarded-for",
	"x-forwarded-host",
	"x-forwarded-port",
	"x-forwarded-proto",
	"x-real-ip",
]);

export type ToolboxProtocol = "2024-11-05" | "2025-03-26" | "2025-06-18" | "2025-11-25";
export type ConfirmationPolicy = "required" | "not-required";

export interface EnvironmentReference {
	env: string;
}

export interface ResolverReference {
	resolver: {
		provider: "bitwarden-secrets-manager";
		slot: string;
	};
}

export type CredentialReference = EnvironmentReference | ResolverReference;

export function isResolverReference(reference: CredentialReference): reference is ResolverReference {
	return Object.hasOwn(reference, "resolver");
}

export interface ConfiguredTool {
	name: string;
	toolset?: string;
	confirmation: ConfirmationPolicy;
	authTokens: string[];
	boundParams: string[];
}

export interface ServerConfig {
	id: string;
	url: string;
	protocol: ToolboxProtocol;
	tools: ConfiguredTool[];
	denyTools: string[];
	headers: Record<string, CredentialReference>;
	authTokens: Record<string, CredentialReference>;
	boundParams: Record<string, CredentialReference>;
}

export interface ToolboxConfig {
	version: 1;
	requestTimeoutMs: number;
	servers: ServerConfig[];
}

/** Minimal, invocation-only server state cloned from a safely loaded config. */
export interface InvocationServerSnapshot {
	id: string;
	url: string;
	protocol: ToolboxProtocol;
	headers: Record<string, CredentialReference>;
	authTokens: Record<string, CredentialReference>;
	boundParams: Record<string, CredentialReference>;
}

export interface InvocationSnapshot {
	requestTimeoutMs: number;
	server: InvocationServerSnapshot;
	tool: ConfiguredTool;
}

export type ConfigSource = "override" | "package" | "none";

export interface LoadedConfig {
	config?: ToolboxConfig;
	source: ConfigSource;
}

export interface ConfigFileStat {
	dev: bigint;
	ino: bigint;
	mode: bigint;
	nlink: bigint;
	uid: bigint;
	size: bigint;
	mtimeNs: bigint;
	ctimeNs: bigint;
	isFile(): boolean;
	isSymbolicLink(): boolean;
}

export interface ConfigFileHandle {
	stat(): Promise<ConfigFileStat>;
	read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
	close(): Promise<void>;
}

export interface ConfigFileRuntime {
	constants: {
		O_RDONLY?: number;
		O_NOFOLLOW?: number;
		O_NONBLOCK?: number;
	};
	getuid(): number | undefined;
	lstat(path: string): Promise<ConfigFileStat>;
	open(path: string, flags: number): Promise<ConfigFileHandle>;
}

export interface LoadConfigOptions {
	overridePath?: string;
	packagePath?: string;
	/** Injectable only for deterministic offline file-race tests. */
	runtime?: ConfigFileRuntime;
}

export class ConfigError extends Error {
	readonly code: string;

	constructor(message: string, code = "invalid-config") {
		super(message);
		this.name = "McpToolboxConfigError";
		this.code = code;
	}
}

function fail(path: string, message: string): never {
	throw new ConfigError(`${path} ${message}`);
}

function strictObject(value: unknown, path: string, allowedKeys: readonly string[]): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
	let prototype: object | null;
	let descriptors: Record<PropertyKey, PropertyDescriptor>;
	try {
		prototype = Object.getPrototypeOf(value);
		descriptors = Object.getOwnPropertyDescriptors(value);
	} catch {
		fail(path, "must be readable plain JSON data");
	}
	if (prototype !== Object.prototype && prototype !== null) fail(path, "must be a plain object");
	const allowed = new Set(allowedKeys);
	const object: Record<string, unknown> = Object.create(null);
	for (const key of Reflect.ownKeys(descriptors!)) {
		if (typeof key !== "string" || !allowed.has(key)) fail(`${path}.${String(key)}`, "is not supported");
		const descriptor = descriptors![key];
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
			fail(`${path}.${key}`, "must be enumerable JSON data without accessors");
		}
		object[key] = descriptor.value;
	}
	return object;
}

function stringValue(value: unknown, path: string, pattern: RegExp, description: string): string {
	if (typeof value !== "string" || !pattern.test(value)) fail(path, description);
	return value;
}

function uniqueStringArray(
	value: unknown,
	path: string,
	pattern: RegExp,
	maximum: number,
	description: string,
): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) fail(path, "must be an array");
	if (value.length > maximum) fail(path, `must contain at most ${maximum} entries`);
	const output: string[] = [];
	const seen = new Set<string>();
	for (let index = 0; index < value.length; index += 1) {
		const item = stringValue(value[index], `${path}[${index}]`, pattern, description);
		if (seen.has(item)) fail(`${path}[${index}]`, "duplicates an earlier entry");
		seen.add(item);
		output.push(item);
	}
	return output;
}

function credentialReference(value: unknown, path: string): CredentialReference {
	const object = strictObject(value, path, ["env", "resolver"]);
	const hasEnvironment = Object.hasOwn(object, "env");
	const hasResolver = Object.hasOwn(object, "resolver");
	if (hasEnvironment === hasResolver) fail(path, "must contain exactly one of env or resolver");
	if (hasEnvironment) {
		return {
			env: stringValue(
				object.env,
				`${path}.env`,
				ENV_NAME,
				"must be a valid environment-variable name without interpolation",
			),
		};
	}
	const resolver = strictObject(object.resolver, `${path}.resolver`, ["provider", "slot"]);
	if (resolver.provider !== RESOLVER_PROVIDER) {
		fail(`${path}.resolver.provider`, `must be ${RESOLVER_PROVIDER}`);
	}
	return {
		resolver: {
			provider: RESOLVER_PROVIDER,
			slot: stringValue(
				resolver.slot,
				`${path}.resolver.slot`,
				RESOLVER_SLOT,
				"must be a safe lowercase resolver slot name without interpolation",
			),
		},
	};
}

function referenceMap(
	value: unknown,
	path: string,
	keyPattern: RegExp,
	keyDescription: string,
	maximum: number,
): Record<string, CredentialReference> {
	if (value === undefined) return Object.create(null) as Record<string, CredentialReference>;
	if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
	let prototype: object | null;
	let descriptors: Record<PropertyKey, PropertyDescriptor>;
	try {
		prototype = Object.getPrototypeOf(value);
		descriptors = Object.getOwnPropertyDescriptors(value);
	} catch {
		fail(path, "must be readable plain JSON data");
	}
	if (prototype !== Object.prototype && prototype !== null) fail(path, "must be a plain object");
	const keys = Reflect.ownKeys(descriptors!);
	if (keys.length > maximum) fail(path, `must contain at most ${maximum} entries`);
	const output: Record<string, CredentialReference> = Object.create(null);
	for (const key of keys) {
		if (typeof key !== "string" || !keyPattern.test(key)) fail(`${path}.${String(key)}`, keyDescription);
		const descriptor = descriptors![key];
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
			fail(`${path}.${key}`, "must be enumerable JSON data without accessors");
		}
		output[key] = credentialReference(descriptor.value, `${path}.${key}`);
	}
	return output;
}

function normalizeServerUrl(value: unknown, path: string, credentialsConfigured: boolean): string {
	if (typeof value !== "string" || value.length === 0 || value.length > 2_048) {
		fail(path, "must be an absolute HTTP(S) URL no longer than 2048 characters");
	}
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		fail(path, "must be an absolute HTTP(S) URL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") fail(path, "must use https (or http on loopback)");
	if (url.username || url.password) fail(path, "must not contain embedded credentials");
	if (url.search || url.hash) fail(path, "must not contain a query string or fragment");
	if (!url.hostname) fail(path, "must include a host");
	const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";
	if (url.protocol === "http:" && !loopback) fail(path, "may use http only with literal 127.0.0.1 or [::1]");
	if (url.protocol === "http:" && credentialsConfigured && !loopback) {
		fail(path, "must use https when credentials are configured");
	}
	let pathname: string;
	try {
		pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "").toLowerCase();
	} catch {
		fail(path, "contains invalid path encoding");
	}
	if (pathname === "/mcp" || pathname.endsWith("/mcp")) {
		fail(path, "must be the server base URL, not an /mcp endpoint");
	}
	return url.toString().replace(/\/+$/, "");
}

function parseTool(
	value: unknown,
	path: string,
	authDefinitions: Record<string, CredentialReference>,
	boundDefinitions: Record<string, CredentialReference>,
): ConfiguredTool {
	const object = strictObject(value, path, ["name", "toolset", "confirmation", "authTokens", "boundParams"]);
	const name = stringValue(
		object.name,
		`${path}.name`,
		REMOTE_NAME,
		"must contain only letters, numbers, dots, underscores, or hyphens",
	);
	const toolset = object.toolset === undefined
		? undefined
		: stringValue(
			object.toolset,
			`${path}.toolset`,
			REMOTE_NAME,
			"must be one safe Toolbox path segment",
		);
	const confirmation = object.confirmation === undefined ? "required" : object.confirmation;
	if (confirmation !== "required" && confirmation !== "not-required") {
		fail(`${path}.confirmation`, "must be required or not-required");
	}
	const authTokens = uniqueStringArray(
		object.authTokens,
		`${path}.authTokens`,
		REMOTE_NAME,
		32,
		"must name a configured authentication source",
	);
	const boundParams = uniqueStringArray(
		object.boundParams,
		`${path}.boundParams`,
		REMOTE_NAME,
		32,
		"must name a configured bound parameter",
	);
	for (const authName of authTokens) {
		if (!Object.hasOwn(authDefinitions, authName)) fail(`${path}.authTokens`, "references an undefined authentication source");
	}
	for (const boundName of boundParams) {
		if (!Object.hasOwn(boundDefinitions, boundName)) fail(`${path}.boundParams`, "references an undefined bound parameter");
	}
	return { name, toolset, confirmation, authTokens, boundParams };
}

function parseServer(value: unknown, path: string): ServerConfig {
	const object = strictObject(value, path, [
		"id",
		"url",
		"protocol",
		"tools",
		"denyTools",
		"headers",
		"authTokens",
		"boundParams",
	]);
	const id = stringValue(
		object.id,
		`${path}.id`,
		SERVER_ID,
		"must start with a lowercase letter and contain only lowercase letters, numbers, or hyphens",
	);
	const headers = referenceMap(
		object.headers,
		`${path}.headers`,
		HEADER_NAME,
		"is not a valid HTTP header name",
		32,
	);
	const headerNames = new Set<string>();
	for (const header of Object.keys(headers)) {
		const lower = header.toLowerCase();
		if (headerNames.has(lower)) fail(`${path}.headers`, "contains case-insensitive duplicate header names");
		if (FORBIDDEN_HEADERS.has(lower) || lower.startsWith("proxy-") || lower.startsWith("sec-")) {
			fail(`${path}.headers.${header}`, "is security-sensitive or transport-controlled");
		}
		headerNames.add(lower);
	}
	const authTokens = referenceMap(
		object.authTokens,
		`${path}.authTokens`,
		REMOTE_NAME,
		"is not a valid Toolbox authentication-source name",
		32,
	);
	const boundParams = referenceMap(
		object.boundParams,
		`${path}.boundParams`,
		REMOTE_NAME,
		"is not a valid Toolbox parameter name",
		32,
	);
	for (const authSource of Object.keys(authTokens)) {
		if (headerNames.has(`${authSource}_token`.toLowerCase())) {
			fail(`${path}.headers`, "collides with an SDK-generated authentication header");
		}
	}
	const url = normalizeServerUrl(
		object.url,
		`${path}.url`,
		Object.keys(headers).length > 0 || Object.keys(authTokens).length > 0,
	);
	const protocol = object.protocol === undefined ? DEFAULT_PROTOCOL : object.protocol;
	if (typeof protocol !== "string" || !PROTOCOLS.has(protocol)) {
		fail(`${path}.protocol`, "is not supported by @toolbox-sdk/core@1.0.1");
	}
	if (!Array.isArray(object.tools) || object.tools.length === 0) fail(`${path}.tools`, "must be a non-empty array");
	if (object.tools.length > MAX_TOOLS_PER_SERVER) {
		fail(`${path}.tools`, `must contain at most ${MAX_TOOLS_PER_SERVER} entries`);
	}
	const tools = object.tools.map((tool, index) => parseTool(
		tool,
		`${path}.tools[${index}]`,
		authTokens,
		boundParams,
	));
	const toolNames = new Set<string>();
	for (let index = 0; index < tools.length; index += 1) {
		const tool = tools[index]!;
		if (toolNames.has(tool.name)) fail(`${path}.tools[${index}].name`, "creates an ambiguous canonical tool name");
		toolNames.add(tool.name);
		const selectedReferenceCount = Object.keys(headers).length + tool.authTokens.length + tool.boundParams.length;
		if (selectedReferenceCount > MAX_CREDENTIAL_REFERENCES_PER_CALL) {
			fail(
				`${path}.tools[${index}]`,
				`selects more than ${MAX_CREDENTIAL_REFERENCES_PER_CALL} credential references`,
			);
		}
		const resolverTuples = new Set<string>();
		for (const reference of Object.values(headers)) {
			if (isResolverReference(reference)) resolverTuples.add(`mcp-toolbox.header\u0000${reference.resolver.slot}`);
		}
		for (const authName of tool.authTokens) {
			const reference = authTokens[authName]!;
			if (isResolverReference(reference)) resolverTuples.add(`mcp-toolbox.auth-token\u0000${reference.resolver.slot}`);
		}
		for (const boundName of tool.boundParams) {
			const reference = boundParams[boundName]!;
			if (isResolverReference(reference)) resolverTuples.add(`mcp-toolbox.bound-param\u0000${reference.resolver.slot}`);
		}
		if (resolverTuples.size > MAX_RESOLVER_REFERENCES_PER_CALL) {
			fail(
				`${path}.tools[${index}]`,
				`requires more than ${MAX_RESOLVER_REFERENCES_PER_CALL} resolver references`,
			);
		}
	}
	const denyTools = uniqueStringArray(
		object.denyTools,
		`${path}.denyTools`,
		REMOTE_NAME,
		MAX_TOOLS_PER_SERVER,
		"must be an exact remote tool name",
	);
	return {
		id,
		url,
		protocol: protocol as ToolboxProtocol,
		tools,
		denyTools,
		headers,
		authTokens,
		boundParams,
	};
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
	if ((typeof value !== "object" && typeof value !== "function") || value === null) return value;
	const object = value as object;
	if (seen.has(object)) return value;
	seen.add(object);
	for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(object))) {
		if ("value" in descriptor) deepFreeze(descriptor.value, seen);
	}
	return Object.freeze(value);
}

export function parseConfig(value: unknown): ToolboxConfig {
	const object = strictObject(value, "config", ["version", "requestTimeoutMs", "servers"]);
	if (object.version !== 1) fail("config.version", "must be 1");
	const requestTimeoutMs = object.requestTimeoutMs === undefined
		? DEFAULT_REQUEST_TIMEOUT_MS
		: object.requestTimeoutMs;
	if (!Number.isInteger(requestTimeoutMs) || (requestTimeoutMs as number) < 1_000 || (requestTimeoutMs as number) > 300_000) {
		fail("config.requestTimeoutMs", "must be an integer between 1000 and 300000");
	}
	if (!Array.isArray(object.servers) || object.servers.length === 0) fail("config.servers", "must be a non-empty array");
	if (object.servers.length > MAX_SERVERS) fail("config.servers", `must contain at most ${MAX_SERVERS} entries`);
	const servers = object.servers.map((server, index) => parseServer(server, `config.servers[${index}]`));
	const ids = new Set<string>();
	let configuredTools = 0;
	for (let index = 0; index < servers.length; index += 1) {
		const server = servers[index]!;
		if (ids.has(server.id)) fail(`config.servers[${index}].id`, "duplicates an earlier server id");
		ids.add(server.id);
		configuredTools += server.tools.length;
	}
	if (configuredTools > 256) fail("config.servers", "configures more than 256 tools in total");
	return deepFreeze({
		version: 1,
		requestTimeoutMs: requestTimeoutMs as number,
		servers,
	});
}

export const DEFAULT_CONFIG_PATH = fileURLToPath(new URL("../config.json", import.meta.url));

const NODE_CONFIG_RUNTIME: ConfigFileRuntime = Object.freeze({
	constants: Object.freeze({
		O_RDONLY: fsConstants.O_RDONLY,
		O_NOFOLLOW: fsConstants.O_NOFOLLOW,
		O_NONBLOCK: fsConstants.O_NONBLOCK,
	}),
	getuid: () => typeof process.getuid === "function" ? process.getuid() : undefined,
	lstat: async (path: string) => await lstat(path, { bigint: true }) as unknown as ConfigFileStat,
	open: async (path: string, flags: number) => {
		const handle = await open(path, flags);
		return {
			stat: async () => await handle.stat({ bigint: true }) as unknown as ConfigFileStat,
			read: async (buffer, offset, length, position) => await handle.read(buffer, offset, length, position),
			close: async () => await handle.close(),
		};
	},
});

function errorCode(error: unknown): string {
	if (!error || typeof error !== "object") return "";
	try {
		const descriptor = Object.getOwnPropertyDescriptor(error, "code");
		return descriptor && "value" in descriptor ? String(descriptor.value) : "";
	} catch {
		return "";
	}
}

function validateRuntime(runtime: ConfigFileRuntime): { uid: bigint; flags: number } {
	let uid: number | undefined;
	let readOnly: number | undefined;
	let noFollow: number | undefined;
	let nonBlock: number | undefined;
	try {
		uid = runtime.getuid();
		readOnly = runtime.constants.O_RDONLY;
		noFollow = runtime.constants.O_NOFOLLOW;
		nonBlock = runtime.constants.O_NONBLOCK;
	} catch {
		throw new ConfigError("Secure MCP Toolbox configuration file checks are unavailable", "unsafe-config-platform");
	}
	if (
		!Number.isSafeInteger(uid) || (uid as number) < 0 ||
		!Number.isInteger(readOnly) ||
		!Number.isInteger(noFollow) || noFollow === 0 ||
		!Number.isInteger(nonBlock) || nonBlock === 0
	) {
		throw new ConfigError("Secure MCP Toolbox configuration file checks are unavailable", "unsafe-config-platform");
	}
	return { uid: BigInt(uid as number), flags: (readOnly as number) | (noFollow as number) | (nonBlock as number) };
}

function metadataFieldsAreBigInts(stat: ConfigFileStat): boolean {
	return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.uid, stat.size, stat.mtimeNs, stat.ctimeNs]
		.every((field) => typeof field === "bigint");
}

function validateFileStat(stat: ConfigFileStat, uid: bigint, initial: boolean): void {
	let regular = false;
	let symbolic = false;
	try {
		if (!metadataFieldsAreBigInts(stat)) throw new Error("invalid stat");
		regular = stat.isFile();
		symbolic = stat.isSymbolicLink();
	} catch {
		throw new ConfigError("MCP Toolbox configuration metadata was unsafe", "unsafe-config-file");
	}
	if (symbolic) throw new ConfigError("MCP Toolbox configuration must not be a symbolic link", "unsafe-config-file");
	if (!regular) throw new ConfigError("MCP Toolbox configuration must be a regular file", "unsafe-config-file");
	if (stat.uid !== uid) throw new ConfigError("MCP Toolbox configuration must be owned by the current user", "unsafe-config-file");
	if (stat.nlink !== 1n) throw new ConfigError("MCP Toolbox configuration must have exactly one link", "unsafe-config-file");
	if ((stat.mode & 0o7777n) !== 0o600n) {
		throw new ConfigError("MCP Toolbox configuration permissions must be exactly 0600", "unsafe-config-file");
	}
	if (stat.size < 0n || stat.size > BigInt(MAX_CONFIG_BYTES)) {
		throw new ConfigError("MCP Toolbox configuration exceeds 256KB", "config-too-large");
	}
	if (initial && (stat.dev < 0n || stat.ino < 0n)) {
		throw new ConfigError("MCP Toolbox configuration metadata was unsafe", "unsafe-config-file");
	}
}

function sameMetadata(left: ConfigFileStat, right: ConfigFileStat): boolean {
	return left.dev === right.dev &&
		left.ino === right.ino &&
		left.mode === right.mode &&
		left.nlink === right.nlink &&
		left.uid === right.uid &&
		left.size === right.size &&
		left.mtimeNs === right.mtimeNs &&
		left.ctimeNs === right.ctimeNs;
}

async function inspectPath(runtime: ConfigFileRuntime, path: string): Promise<ConfigFileStat> {
	try {
		return await runtime.lstat(path);
	} catch {
		throw new ConfigError("MCP Toolbox configuration path changed while it was being read", "unsafe-config-file");
	}
}

async function readConfigFile(
	path: string,
	optional: boolean,
	runtime: ConfigFileRuntime,
): Promise<ToolboxConfig | undefined> {
	const { uid, flags } = validateRuntime(runtime);
	let initialStat: ConfigFileStat;
	try {
		initialStat = await runtime.lstat(path);
	} catch (error) {
		if (optional && errorCode(error) === "ENOENT") return undefined;
		throw new ConfigError("MCP Toolbox configuration could not be inspected", "config-read-failed");
	}
	validateFileStat(initialStat, uid, true);

	let handle: ConfigFileHandle;
	try {
		handle = await runtime.open(path, flags);
	} catch (error) {
		const code = errorCode(error);
		if (code === "ELOOP") {
			throw new ConfigError("MCP Toolbox configuration must not be a symbolic link", "unsafe-config-file");
		}
		if (code === "ENOENT") {
			throw new ConfigError("MCP Toolbox configuration changed while it was being opened", "unsafe-config-file");
		}
		throw new ConfigError("MCP Toolbox configuration could not be opened", "config-read-failed");
	}

	try {
		let openedStat: ConfigFileStat;
		try {
			openedStat = await handle.stat();
		} catch {
			throw new ConfigError("MCP Toolbox configuration could not be inspected after opening", "config-read-failed");
		}
		validateFileStat(openedStat, uid, false);
		if (!sameMetadata(initialStat, openedStat)) {
			throw new ConfigError("MCP Toolbox configuration changed while it was being opened", "unsafe-config-file");
		}

		const expectedSize = Number(openedStat.size);
		const buffer = Buffer.alloc(expectedSize);
		let offset = 0;
		while (offset < expectedSize) {
			let bytesRead: number;
			try {
				({ bytesRead } = await handle.read(buffer, offset, expectedSize - offset, offset));
			} catch {
				throw new ConfigError("MCP Toolbox configuration could not be read", "config-read-failed");
			}
			if (!Number.isSafeInteger(bytesRead) || bytesRead <= 0 || bytesRead > expectedSize - offset) {
				throw new ConfigError("MCP Toolbox configuration changed while it was being read", "unsafe-config-file");
			}
			offset += bytesRead;
		}

		const probe = Buffer.alloc(1);
		let probeBytes: number;
		try {
			({ bytesRead: probeBytes } = await handle.read(probe, 0, 1, expectedSize));
		} catch {
			throw new ConfigError("MCP Toolbox configuration could not be read", "config-read-failed");
		}
		if (probeBytes !== 0) {
			throw new ConfigError("MCP Toolbox configuration grew while it was being read", "unsafe-config-file");
		}

		let finalDescriptorStat: ConfigFileStat;
		try {
			finalDescriptorStat = await handle.stat();
		} catch {
			throw new ConfigError("MCP Toolbox configuration could not be inspected after reading", "config-read-failed");
		}
		validateFileStat(finalDescriptorStat, uid, false);
		if (!sameMetadata(openedStat, finalDescriptorStat)) {
			throw new ConfigError("MCP Toolbox configuration changed while it was being read", "unsafe-config-file");
		}
		const finalPathStat = await inspectPath(runtime, path);
		validateFileStat(finalPathStat, uid, false);
		if (!sameMetadata(finalDescriptorStat, finalPathStat)) {
			throw new ConfigError("MCP Toolbox configuration path changed while it was being read", "unsafe-config-file");
		}

		let text: string;
		try {
			text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
		} catch {
			throw new ConfigError("MCP Toolbox configuration is not valid UTF-8", "invalid-utf8");
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			throw new ConfigError("MCP Toolbox configuration is not valid JSON", "invalid-json");
		}
		return parseConfig(parsed);
	} finally {
		try {
			await handle.close();
		} catch {
			throw new ConfigError("MCP Toolbox configuration descriptor could not be closed", "config-read-failed");
		}
	}
}

function validateConfigPath(value: unknown, label: string): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > 4_096 ||
		value !== value.trim() ||
		/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u.test(value) ||
		!isAbsolute(value)
	) {
		throw new ConfigError(`${label} must be an absolute path without whitespace or controls`, "invalid-override-path");
	}
	return value;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
	const runtime = options.runtime ?? NODE_CONFIG_RUNTIME;
	const environmentOverride = process.env.PI_MCP_TOOLBOX_CONFIG;
	const override = options.overridePath !== undefined ? options.overridePath : environmentOverride;
	if (override !== undefined) {
		const overridePath = validateConfigPath(override, "PI_MCP_TOOLBOX_CONFIG");
		const config = await readConfigFile(overridePath, false, runtime);
		return deepFreeze({ config: config!, source: "override" });
	}
	const packagePath = validateConfigPath(options.packagePath ?? DEFAULT_CONFIG_PATH, "MCP Toolbox package config path");
	const config = await readConfigFile(packagePath, true, runtime);
	return config
		? deepFreeze({ config, source: "package" })
		: deepFreeze({ source: "none" });
}

function snapshotLoadedConfig(value: unknown): LoadedConfig {
	const object = strictObject(value, "loaded configuration", ["config", "source"]);
	const source = object.source;
	if (source !== "override" && source !== "package" && source !== "none") {
		fail("loaded configuration.source", "must be override, package, or none");
	}
	if (source === "none") {
		if (object.config !== undefined) fail("loaded configuration.config", "must be absent when source is none");
		return deepFreeze({ source: "none" });
	}
	if (object.config === undefined) fail("loaded configuration.config", `is required when source is ${source}`);
	return deepFreeze({ source, config: parseConfig(object.config) });
}

export class ConfigStore {
	#promise: Promise<LoadedConfig> | undefined;
	readonly #loader: () => LoadedConfig | Promise<LoadedConfig>;

	constructor(loader: () => LoadedConfig | Promise<LoadedConfig> = () => loadConfig()) {
		this.#loader = loader;
	}

	#load(): Promise<LoadedConfig> {
		return Promise.resolve().then(() => this.#loader()).then(snapshotLoadedConfig);
	}

	get(): Promise<LoadedConfig> {
		this.#promise ??= this.#load();
		return this.#promise;
	}

	reload(): Promise<LoadedConfig> {
		// Replace the old promise before validation. A synchronous throw or failed
		// validation remains cached and therefore cannot fall back to stale state.
		this.#promise = this.#load();
		return this.#promise;
	}
}

export function configuredToolCount(config: ToolboxConfig): number {
	return config.servers.reduce((count, server) => {
		const denied = new Set(server.denyTools);
		return count + server.tools.filter((tool) => !denied.has(tool.name)).length;
	}, 0);
}

export function canonicalToolName(serverId: string, toolName: string): string {
	return `${serverId}/${toolName}`;
}

export function findConfiguredTool(
	config: ToolboxConfig,
	serverId: string,
	toolName: string,
): { server: ServerConfig; tool: ConfiguredTool } {
	const server = config.servers.find((candidate) => candidate.id === serverId);
	if (!server) throw new ConfigError("Requested MCP Toolbox server is not configured", "server-not-allowed");
	if (server.denyTools.includes(toolName)) throw new ConfigError("Requested MCP Toolbox tool is denied", "tool-denied");
	const tool = server.tools.find((candidate) => candidate.name === toolName);
	if (!tool) throw new ConfigError("Requested MCP Toolbox tool is not allowlisted", "tool-not-allowed");
	return { server, tool };
}

function cloneReference(reference: CredentialReference): CredentialReference {
	return isResolverReference(reference)
		? { resolver: { provider: RESOLVER_PROVIDER, slot: reference.resolver.slot } }
		: { env: reference.env };
}

function cloneReferenceEntries(
	entries: Iterable<readonly [string, CredentialReference]>,
): Record<string, CredentialReference> {
	const output: Record<string, CredentialReference> = Object.create(null);
	for (const [name, reference] of entries) output[name] = cloneReference(reference);
	return output;
}

/** Bind approval, credentials, endpoint, protocol, and invocation to one clone. */
export function createInvocationSnapshot(
	config: ToolboxConfig,
	serverId: string,
	toolName: string,
): InvocationSnapshot {
	const { server, tool } = findConfiguredTool(config, serverId, toolName);
	const authEntries = tool.authTokens.map((name) => [name, server.authTokens[name]!] as const);
	const boundEntries = tool.boundParams.map((name) => [name, server.boundParams[name]!] as const);
	return deepFreeze({
		requestTimeoutMs: config.requestTimeoutMs,
		server: {
			id: server.id,
			url: server.url,
			protocol: server.protocol,
			headers: cloneReferenceEntries(Object.entries(server.headers)),
			authTokens: cloneReferenceEntries(authEntries),
			boundParams: cloneReferenceEntries(boundEntries),
		},
		tool: {
			name: tool.name,
			...(tool.toolset === undefined ? {} : { toolset: tool.toolset }),
			confirmation: tool.confirmation,
			authTokens: [...tool.authTokens],
			boundParams: [...tool.boundParams],
		},
	});
}
