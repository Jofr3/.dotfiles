import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

export type DatabaseDialect = "postgresql" | "mysql" | "sqlserver" | "sqlite" | "libsql";

export interface ConnectionProfile {
	name: string;
	dialect?: DatabaseDialect;
	available: boolean;
	reason?: string;
	source: string;
	url?: string;
	authToken?: string;
	allowWrites: boolean;
	confirmWrites: boolean;
	maxRows: number;
	timeoutMs: number;
}

export interface DrizzleConfig {
	defaultConnection?: string;
	connections: Map<string, ConnectionProfile>;
	loadedPaths: string[];
	notices: string[];
}

export interface LoadConfigOptions {
	cwd: string;
	projectTrusted: boolean;
	agentDir: string;
	configDirName: string;
	env?: NodeJS.ProcessEnv;
}

interface RawConnection {
	name: string;
	dialect?: DatabaseDialect;
	url?: string;
	urlEnv?: string;
	authTokenEnv?: string;
	allowWrites: boolean;
	confirmWrites: boolean;
	maxRows: number;
	timeoutMs: number;
	source: string;
	baseDir: string;
}

const DEFAULT_MAX_ROWS = 100;
const DEFAULT_TIMEOUT_MS = 30_000;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CONNECTION_NAME = /^[A-Za-z0-9_.-](?:[A-Za-z0-9_. -]{0,62}[A-Za-z0-9_.-])?$/;
const DATABASES_FIELDS = new Set(["name", "type", "url"]);
const MAX_DATABASES_BYTES = 1024 * 1024;
const MAX_DATABASES_CONNECTIONS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined) return fallback;
	if (/^(1|true|yes|on)$/i.test(value.trim())) return true;
	if (/^(0|false|no|off)$/i.test(value.trim())) return false;
	return fallback;
}

function clampRows(value: unknown, fallback = DEFAULT_MAX_ROWS): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(1, Math.min(1_000, Math.floor(value)))
		: fallback;
}

function clampTimeout(value: unknown, fallback = DEFAULT_TIMEOUT_MS): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(1_000, Math.min(300_000, Math.floor(value)))
		: fallback;
}

export function normalizeDialect(value: unknown): DatabaseDialect | undefined {
	if (typeof value !== "string") return undefined;
	switch (value.trim().toLowerCase()) {
		case "postgres":
		case "postgresql":
		case "pg":
			return "postgresql";
		case "mysql":
			return "mysql";
		case "mssql":
		case "sqlserver":
		case "sql-server":
			return "sqlserver";
		case "sqlite":
			return "sqlite";
		case "libsql":
		case "turso":
			return "libsql";
		default:
			return undefined;
	}
}

export function inferDialect(url: string): DatabaseDialect | undefined {
	const value = url.trim().toLowerCase();
	if (/^postgres(?:ql)?:/.test(value)) return "postgresql";
	if (/^mysql:/.test(value)) return "mysql";
	if (/^(?:mssql|sqlserver):/.test(value)) return "sqlserver";
	if (/^libsql:/.test(value)) return "libsql";
	if (/^file:/.test(value) || value === ":memory:" || !/^[a-z][a-z0-9+.-]*:/i.test(value)) return "sqlite";
	return undefined;
}

function normalizeUrl(url: string, dialect: DatabaseDialect, baseDir: string): string {
	const value = url.trim();
	if (!value || (dialect !== "sqlite" && dialect !== "libsql")) return value;
	if (value === ":memory:" || value === "file::memory:") return "file::memory:";
	if (value.startsWith("file::memory:")) return value;
	if (value.startsWith("file:")) {
		const match = value.match(/^file:([^?#]*)([?#].*)?$/);
		if (!match) return value;
		const [, filePath, suffix = ""] = match;
		if (!filePath || filePath.startsWith("/") || filePath.startsWith("//")) return value;
		return pathToFileURL(path.resolve(baseDir, filePath)).href + suffix;
	}
	if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return pathToFileURL(path.resolve(baseDir, value)).href;
	return value;
}

function findNearestProjectConfig(cwd: string, configDirName: string): string | undefined {
	let current: string;
	try {
		current = fs.realpathSync(cwd);
	} catch {
		current = path.resolve(cwd);
	}
	while (true) {
		const candidate = path.join(current, configDirName, "drizzle.json");
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function readConfigFile(
	filePath: string,
	rawConnections: Map<string, RawConnection>,
	config: Pick<DrizzleConfig, "loadedPaths" | "notices">,
): string | undefined {
	let root: unknown;
	try {
		root = JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch (error) {
		config.notices.push(`Could not load ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
	if (!isRecord(root)) {
		config.notices.push(`Ignored ${filePath}: root must be an object.`);
		return undefined;
	}
	if (!isRecord(root.connections)) {
		config.notices.push(`Ignored connections in ${filePath}: connections must be an object.`);
	} else {
		for (const [name, value] of Object.entries(root.connections)) {
			if (!CONNECTION_NAME.test(name)) {
				config.notices.push(`Ignored connection ${JSON.stringify(name)} in ${filePath}: invalid name.`);
				continue;
			}
			if (!isRecord(value)) {
				config.notices.push(`Ignored connection ${name} in ${filePath}: configuration must be an object.`);
				continue;
			}
			const dialect = value.dialect === undefined ? undefined : normalizeDialect(value.dialect);
			if (value.dialect !== undefined && !dialect) {
				config.notices.push(`Connection ${name} in ${filePath} has an unsupported dialect.`);
			}
			const urlEnv = typeof value.urlEnv === "string" && ENV_NAME.test(value.urlEnv) ? value.urlEnv : undefined;
			if (value.urlEnv !== undefined && !urlEnv) config.notices.push(`Connection ${name} in ${filePath} has an invalid urlEnv.`);
			if (urlEnv && typeof value.url === "string") {
				config.notices.push(`Connection ${name} in ${filePath} sets both urlEnv and url; urlEnv takes precedence.`);
			}
			const authTokenEnv = typeof value.authTokenEnv === "string" && ENV_NAME.test(value.authTokenEnv)
				? value.authTokenEnv
				: undefined;
			if (value.authTokenEnv !== undefined && !authTokenEnv) {
				config.notices.push(`Connection ${name} in ${filePath} has an invalid authTokenEnv.`);
			}
			rawConnections.set(name, {
				name,
				dialect,
				url: typeof value.url === "string" ? value.url : undefined,
				urlEnv,
				authTokenEnv,
				allowWrites: value.allowWrites === true,
				confirmWrites: value.confirmWrites !== false,
				maxRows: clampRows(value.maxRows),
				timeoutMs: clampTimeout(value.timeoutMs),
				source: filePath,
				baseDir: path.dirname(filePath),
			});
		}
	}
	config.loadedPaths.push(filePath);
	return typeof root.default === "string" && CONNECTION_NAME.test(root.default) ? root.default : undefined;
}

function readDatabasesEnvironment(
	value: string,
	rawConnections: Map<string, RawConnection>,
	config: Pick<DrizzleConfig, "notices">,
	baseDir: string,
): string | undefined {
	if (Buffer.byteLength(value, "utf8") > MAX_DATABASES_BYTES) {
		config.notices.push("Ignored DATABASES: value exceeds the 1 MiB configuration limit.");
		return undefined;
	}
	let entries: unknown;
	try {
		entries = JSON.parse(value);
	} catch {
		config.notices.push("Ignored DATABASES: invalid JSON.");
		return undefined;
	}
	if (!Array.isArray(entries)) {
		config.notices.push("Ignored DATABASES: root must be an array.");
		return undefined;
	}

	const seenNames = new Set<string>();
	let firstAccepted: string | undefined;
	let accepted = 0;
	for (let index = 0; index < entries.length; index++) {
		if (accepted >= MAX_DATABASES_CONNECTIONS) {
			config.notices.push(`Ignored DATABASES entries after index ${index - 1}: at most ${MAX_DATABASES_CONNECTIONS} connections are supported.`);
			break;
		}
		const entry = entries[index];
		if (!isRecord(entry)) {
			config.notices.push(`Ignored DATABASES entry ${index}: entry must be an object.`);
			continue;
		}
		if (Object.keys(entry).some((key) => !DATABASES_FIELDS.has(key))) {
			config.notices.push(`Ignored DATABASES entry ${index}: only name, type, and url fields are supported.`);
			continue;
		}
		if (typeof entry.name !== "string" || !CONNECTION_NAME.test(entry.name)) {
			config.notices.push(`Ignored DATABASES entry ${index}: name is invalid.`);
			continue;
		}
		const dialect = normalizeDialect(entry.type);
		if (!dialect) {
			config.notices.push(`Ignored DATABASES entry ${index}: type is missing or unsupported.`);
			continue;
		}
		if (typeof entry.url !== "string" || !entry.url.trim()) {
			config.notices.push(`Ignored DATABASES entry ${index}: url is missing or empty.`);
			continue;
		}
		if (seenNames.has(entry.name)) {
			config.notices.push(`Ignored DATABASES entry ${index}: a previous valid entry has the same name.`);
			continue;
		}
		seenNames.add(entry.name);
		rawConnections.set(entry.name, {
			name: entry.name,
			dialect,
			url: entry.url,
			allowWrites: false,
			confirmWrites: true,
			maxRows: DEFAULT_MAX_ROWS,
			timeoutMs: DEFAULT_TIMEOUT_MS,
			source: `env:DATABASES[${index}]`,
			baseDir,
		});
		firstAccepted ??= entry.name;
		accepted++;
	}
	return firstAccepted;
}

function unavailableProfile(raw: RawConnection, source: string, reason: string, dialect = raw.dialect): ConnectionProfile {
	return {
		name: raw.name,
		dialect,
		available: false,
		reason,
		source,
		allowWrites: raw.allowWrites,
		confirmWrites: raw.confirmWrites,
		maxRows: raw.maxRows,
		timeoutMs: raw.timeoutMs,
	};
}

function resolveRawConnection(raw: RawConnection, env: NodeJS.ProcessEnv): ConnectionProfile {
	const configuredUrl = raw.urlEnv ? env[raw.urlEnv] : raw.url;
	const source = raw.urlEnv
		? raw.source === `env:${raw.urlEnv}`
			? raw.source
			: `env:${raw.urlEnv} (${raw.source})`
		: raw.source;
	if (!configuredUrl?.trim()) {
		return unavailableProfile(
			raw,
			source,
			raw.urlEnv ? `Environment variable ${raw.urlEnv} is not set.` : "No database URL is configured.",
		);
	}
	const dialect = raw.dialect ?? inferDialect(configuredUrl);
	if (!dialect) return unavailableProfile(raw, source, "Could not infer the database dialect; set dialect explicitly.");
	const authToken = raw.authTokenEnv ? env[raw.authTokenEnv] : undefined;
	if (raw.authTokenEnv && !authToken) {
		return unavailableProfile(raw, source, `Environment variable ${raw.authTokenEnv} is not set.`, dialect);
	}
	return {
		name: raw.name,
		dialect,
		available: true,
		source,
		url: normalizeUrl(configuredUrl, dialect, raw.baseDir),
		authToken,
		allowWrites: raw.allowWrites,
		confirmWrites: raw.confirmWrites,
		maxRows: raw.maxRows,
		timeoutMs: raw.timeoutMs,
	};
}

export function loadDrizzleConfig(options: LoadConfigOptions): DrizzleConfig {
	const env = options.env ?? process.env;
	const config: DrizzleConfig = { connections: new Map(), loadedPaths: [], notices: [] };
	const rawConnections = new Map<string, RawConnection>();
	let defaultConnection: string | undefined;

	const globalPath = path.join(options.agentDir, "drizzle.json");
	if (fs.existsSync(globalPath)) defaultConnection = readConfigFile(globalPath, rawConnections, config) ?? defaultConnection;

	const projectPath = findNearestProjectConfig(options.cwd, options.configDirName);
	if (projectPath && options.projectTrusted) {
		defaultConnection = readConfigFile(projectPath, rawConnections, config) ?? defaultConnection;
	} else if (projectPath) {
		config.notices.push(`Skipped untrusted project config: ${projectPath}`);
	}

	if (env.DRIZZLE_DATABASE_URL && !rawConnections.has("env")) {
		rawConnections.set("env", {
			name: "env",
			dialect: normalizeDialect(env.DRIZZLE_DIALECT),
			urlEnv: "DRIZZLE_DATABASE_URL",
			authTokenEnv: env.DRIZZLE_AUTH_TOKEN
				? "DRIZZLE_AUTH_TOKEN"
				: env.TURSO_AUTH_TOKEN
					? "TURSO_AUTH_TOKEN"
					: undefined,
			allowWrites: parseBoolean(env.DRIZZLE_ALLOW_WRITES, false),
			confirmWrites: parseBoolean(env.DRIZZLE_CONFIRM_WRITES, true),
			maxRows: clampRows(Number(env.DRIZZLE_MAX_ROWS) || undefined),
			timeoutMs: clampTimeout(Number(env.DRIZZLE_TIMEOUT_MS) || undefined),
			source: "env:DRIZZLE_DATABASE_URL",
			baseDir: options.cwd,
		});
		defaultConnection ??= "env";
	}

	const databasesDefault = env.DATABASES === undefined
		? undefined
		: readDatabasesEnvironment(env.DATABASES, rawConnections, config, options.cwd);
	if (databasesDefault) defaultConnection = databasesDefault;

	for (const [name, raw] of rawConnections) config.connections.set(name, resolveRawConnection(raw, env));
	if (defaultConnection && config.connections.has(defaultConnection)) config.defaultConnection = defaultConnection;
	else if (defaultConnection) config.notices.push(`Configured default connection ${defaultConnection} does not exist.`);
	if (!config.defaultConnection && config.connections.size === 1) config.defaultConnection = config.connections.keys().next().value;
	return config;
}

export function publicConnectionIdentity(profile: ConnectionProfile): { target: string; fingerprint: string } {
	let target = `${profile.dialect ?? "unknown"}:unavailable`;
	if (profile.url) {
		try {
			const url = new URL(profile.url);
			if (url.protocol === "file:") target = url.href.replace(/[?#].*$/, "");
			else target = `${url.protocol}//${url.host}${url.pathname}`;
		} catch {
			target = profile.dialect === "sqlite" ? "sqlite:local-path" : `${profile.dialect ?? "unknown"}:configured`;
		}
	}
	const fingerprint = createHash("sha256")
		.update(`${profile.dialect ?? "unknown"}\0${profile.url ?? profile.source}`)
		.digest("hex")
		.slice(0, 12);
	return { target, fingerprint };
}

export function getConnection(config: DrizzleConfig, requested?: string): ConnectionProfile {
	const name = requested?.trim() || config.defaultConnection;
	if (!name) {
		throw new Error("No Drizzle connection was selected and no default is configured. Use drizzle_connections to inspect setup.");
	}
	const profile = config.connections.get(name);
	if (!profile) throw new Error(`Unknown Drizzle connection ${JSON.stringify(name)}. Use drizzle_connections to list profiles.`);
	if (!profile.available || !profile.url || !profile.dialect) {
		throw new Error(`Drizzle connection ${JSON.stringify(name)} is unavailable: ${profile.reason ?? "invalid configuration"}`);
	}
	return profile;
}
