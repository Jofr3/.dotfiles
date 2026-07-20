import { constants as fsConstants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import { MAX_DISCOVERY_TOOLSETS } from "./catalog.ts";
import { ONEPASSWORD_RESOLVER_PROVIDER } from "./resolver.ts";
import {
	MAX_SELECTED_CREDENTIAL_REFERENCES,
	MAX_UNIQUE_RESOLVER_TUPLES,
	planSelectedCredentials,
	RequirementPlanningError,
} from "./requirements.ts";

export const SDK_VERSION = "1.0.1";
export const EXTENSION_VERSION = "2.2.0";
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const MAX_CONFIG_BYTES = 256 * 1024;
export const MAX_SERVERS = 16;
export const MAX_TOOLS_PER_SERVER = 128;
export const MAX_TOOLSET_TOOLS = 256;
export const MAX_RESOLVER_REFERENCES_PER_CALL = MAX_UNIQUE_RESOLVER_TUPLES;
export const MAX_CREDENTIAL_REFERENCES_PER_CALL = MAX_SELECTED_CREDENTIAL_REFERENCES;

const PROTOCOLS = new Set(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"]);
const DEFAULT_PROTOCOL = "2025-11-25";
const SERVER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
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

export interface DynamicResolverReference {
	resolver: {
		provider: typeof ONEPASSWORD_RESOLVER_PROVIDER;
		dynamic: true;
	};
}

export type CredentialReference = DynamicResolverReference;

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
	mode: "allowlist" | "discovery";
	/** Named toolsets discovered in addition to the default toolset. */
	toolsets: string[];
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
	discovery?: Readonly<{ fingerprint: string }>;
}

export type ConfigSource = "override" | "package" | "session-loopback" | "session-managed" | "disabled" | "none";

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
	caseInsensitive = false,
): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) fail(path, "must be an array");
	if (value.length > maximum) fail(path, `must contain at most ${maximum} entries`);
	const output: string[] = [];
	const seen = new Set<string>();
	for (let index = 0; index < value.length; index += 1) {
		const item = stringValue(value[index], `${path}[${index}]`, pattern, description);
		const identity = caseInsensitive ? item.toLowerCase() : item;
		if (seen.has(identity)) fail(`${path}[${index}]`, "duplicates an earlier entry");
		seen.add(identity);
		output.push(item);
	}
	return output;
}

function credentialReference(value: unknown, path: string): CredentialReference {
	const object = strictObject(value, path, ["resolver"]);
	const resolver = strictObject(object.resolver, `${path}.resolver`, ["provider", "dynamic"]);
	if (resolver.provider !== ONEPASSWORD_RESOLVER_PROVIDER) {
		fail(`${path}.resolver.provider`, `must be ${ONEPASSWORD_RESOLVER_PROVIDER}`);
	}
	if (resolver.dynamic !== true) fail(`${path}.resolver.dynamic`, "must be true");
	return {
		resolver: {
			provider: ONEPASSWORD_RESOLVER_PROVIDER,
			dynamic: true,
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
		true,
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
		"mode",
		"tools",
		"toolsets",
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
	const authNamesFolded = new Set<string>();
	for (const authSource of Object.keys(authTokens)) {
		const folded = authSource.toLowerCase();
		if (authNamesFolded.has(folded)) {
			fail(`${path}.authTokens`, "contains case-insensitive duplicate authentication sources");
		}
		authNamesFolded.add(folded);
	}
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
	const inferredMode = object.tools === undefined ? "discovery" : "allowlist";
	const mode = object.mode === undefined ? inferredMode : object.mode;
	if (mode !== "allowlist" && mode !== "discovery") fail(`${path}.mode`, "must be allowlist or discovery");
	if (mode === "allowlist" && (!Array.isArray(object.tools) || object.tools.length === 0)) {
		fail(`${path}.tools`, "must be a non-empty array when present");
	}
	if (mode === "discovery" && object.tools !== undefined && (!Array.isArray(object.tools) || object.tools.length !== 0)) {
		fail(`${path}.tools`, "must be absent for discovery mode");
	}
	if (Array.isArray(object.tools) && object.tools.length > MAX_TOOLS_PER_SERVER) {
		fail(`${path}.tools`, `must contain at most ${MAX_TOOLS_PER_SERVER} entries`);
	}
	const toolsets = uniqueStringArray(
		object.toolsets,
		`${path}.toolsets`,
		REMOTE_NAME,
		MAX_DISCOVERY_TOOLSETS,
		"must be one safe named Toolbox toolset",
	);
	if (mode === "allowlist" && toolsets.length > 0) {
		fail(`${path}.toolsets`, "is supported only when tools is omitted for discovery mode");
	}
	if (
		mode === "discovery" &&
		(Object.keys(headers).length > 0 || Object.keys(authTokens).length > 0 || Object.keys(boundParams).length > 0)
	) {
		fail(path, "discovery mode must list catalogs without configured headers, auth tokens, or bound parameters");
	}
	const tools = mode === "allowlist"
		? (object.tools as unknown[]).map((tool, index) => parseTool(
			tool,
			`${path}.tools[${index}]`,
			authTokens,
			boundParams,
		))
		: [];
	const toolNames = new Set<string>();
	for (let index = 0; index < tools.length; index += 1) {
		const tool = tools[index]!;
		if (toolNames.has(tool.name)) fail(`${path}.tools[${index}].name`, "creates an ambiguous canonical tool name");
		toolNames.add(tool.name);
		try {
			planSelectedCredentials({ id, headers, authTokens, boundParams }, tool);
		} catch (error) {
			if (error instanceof RequirementPlanningError) fail(`${path}.tools[${index}]`, error.message);
			throw error;
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
		mode,
		toolsets,
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
	const requirementIds = new Map<string, string>();
	for (let serverIndex = 0; serverIndex < servers.length; serverIndex += 1) {
		const server = servers[serverIndex]!;
		for (let toolIndex = 0; toolIndex < server.tools.length; toolIndex += 1) {
			const tool = server.tools[toolIndex]!;
			const plan = planSelectedCredentials(server, tool);
			for (const item of plan) {
				if (!item.requirement) continue;
				const identity = JSON.stringify([server.id, tool.name, item.targetKind, item.targetName]);
				const previous = requirementIds.get(item.requirement.requirementId);
				if (previous !== undefined && previous !== identity) {
					fail(
						`config.servers[${serverIndex}].tools[${toolIndex}]`,
						"creates a derived requirement identifier collision",
					);
				}
				requirementIds.set(item.requirement.requirementId, identity);
			}
		}
	}
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
	if (
		source !== "override" && source !== "package" && source !== "session-loopback" &&
		source !== "session-managed" && source !== "disabled" && source !== "none"
	) {
		fail("loaded configuration.source", "must be override, package, session-loopback, session-managed, disabled, or none");
	}
	if (source === "none" || source === "disabled") {
		if (object.config !== undefined) fail("loaded configuration.config", `must be absent when source is ${source}`);
		return deepFreeze({ source });
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

	disable(): Promise<LoadedConfig> {
		this.#promise = Promise.resolve(snapshotLoadedConfig({ source: "disabled" }));
		return this.#promise;
	}

	async #adoptSessionConfig(
		config: ToolboxConfig,
		expected: LoadedConfig,
		source: "session-loopback" | "session-managed",
	): Promise<LoadedConfig> {
		const observedPromise = this.get();
		const observed = await observedPromise;
		if (this.#promise !== observedPromise || observed !== expected || observed.source === "disabled") {
			throw new ConfigError(
				"MCP Toolbox configuration changed while session bootstrap was running",
				"configuration-changed",
			);
		}
		const adopted = Promise.resolve(snapshotLoadedConfig({ config, source }));
		this.#promise = adopted;
		return adopted;
	}

	adoptSessionLoopback(config: ToolboxConfig, expected: LoadedConfig): Promise<LoadedConfig> {
		return this.#adoptSessionConfig(config, expected, "session-loopback");
	}

	adoptSessionManaged(config: ToolboxConfig, expected: LoadedConfig): Promise<LoadedConfig> {
		return this.#adoptSessionConfig(config, expected, "session-managed");
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

function cloneReference(_reference: CredentialReference): CredentialReference {
	return { resolver: { provider: ONEPASSWORD_RESOLVER_PROVIDER, dynamic: true } };
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

export interface DiscoveredToolSelection {
	readonly name: string;
	readonly toolset?: string;
	readonly authTokens: readonly string[];
	readonly fingerprint: string;
}

/** Bind one validated generation-scoped catalog entry to an invocation clone. */
export function createDiscoveredInvocationSnapshot(
	config: ToolboxConfig,
	serverId: string,
	selection: DiscoveredToolSelection,
): InvocationSnapshot {
	const server = config.servers.find((candidate) => candidate.id === serverId);
	if (!server) throw new ConfigError("Requested MCP Toolbox server is not configured", "server-not-allowed");
	if (server.mode !== "discovery") {
		throw new ConfigError("Requested MCP Toolbox server does not use catalog discovery", "tool-not-allowed");
	}
	if (!REMOTE_NAME.test(selection.name) || server.denyTools.includes(selection.name)) {
		throw new ConfigError("Requested MCP Toolbox tool is denied or unavailable", "tool-denied");
	}
	if (
		selection.toolset !== undefined &&
		(!REMOTE_NAME.test(selection.toolset) || !server.toolsets.includes(selection.toolset))
	) {
		throw new ConfigError("Requested MCP Toolbox toolset is not configured for discovery", "tool-not-allowed");
	}
	if (!/^[A-Za-z0-9_-]{43}$/u.test(selection.fingerprint)) {
		throw new ConfigError("Discovered MCP Toolbox catalog fingerprint is invalid", "tool-not-allowed");
	}
	const authNames = new Set<string>();
	const authNamesFolded = new Set<string>();
	for (const name of selection.authTokens) {
		const folded = name.toLowerCase();
		if (!REMOTE_NAME.test(name) || authNames.has(name) || authNamesFolded.has(folded)) {
			throw new ConfigError("Discovered MCP Toolbox authentication metadata is invalid", "tool-not-allowed");
		}
		authNames.add(name);
		authNamesFolded.add(folded);
	}
	const authTokens = cloneReferenceEntries([...authNames].map((name) => [
		name,
		{ resolver: { provider: ONEPASSWORD_RESOLVER_PROVIDER, dynamic: true } } as CredentialReference,
	] as const));
	const tool: ConfiguredTool = {
		name: selection.name,
		...(selection.toolset === undefined ? {} : { toolset: selection.toolset }),
		confirmation: "required",
		authTokens: [...authNames],
		boundParams: [],
	};
	try {
		planSelectedCredentials(
			{
				id: server.id,
				headers: Object.create(null) as Record<string, CredentialReference>,
				authTokens,
				boundParams: Object.create(null) as Record<string, CredentialReference>,
			},
			tool,
		);
	} catch (error) {
		if (error instanceof RequirementPlanningError) {
			throw new ConfigError("Discovered MCP Toolbox credential metadata exceeds a safety bound", "tool-not-allowed");
		}
		throw error;
	}
	return deepFreeze({
		requestTimeoutMs: config.requestTimeoutMs,
		server: {
			id: server.id,
			url: server.url,
			protocol: server.protocol,
			headers: Object.create(null) as Record<string, CredentialReference>,
			authTokens,
			boundParams: Object.create(null) as Record<string, CredentialReference>,
		},
		tool,
		discovery: { fingerprint: selection.fingerprint },
	});
}
