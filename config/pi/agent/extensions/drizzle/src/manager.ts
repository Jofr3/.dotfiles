import { createHash } from "node:crypto";
import { createClient, type Client as LibSqlClient, type InArgs, type ResultSet as LibSqlResultSet } from "@libsql/client";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { PgDialect } from "drizzle-orm/pg-core";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import mssql from "mssql";
import type {
	config as SqlServerConfig,
	ConnectionPool as SqlServerConnectionPool,
	IColumnMetadata as SqlServerColumnMetadata,
	IResult as SqlServerResult,
	Request as SqlServerRequest,
} from "mssql";
import mysql from "mysql2/promise";
import type { FieldPacket, QueryOptions, ResultSetHeader, RowDataPacket } from "mysql2";
import { Pool as PostgresPool, type QueryConfig, type QueryResult } from "pg";
import type { ConnectionProfile, DatabaseDialect } from "./config.ts";

interface PostgresConnection {
	dialect: "postgresql";
	fingerprint: string;
	client: PostgresPool;
}

interface MySqlConnection {
	dialect: "mysql";
	fingerprint: string;
	client: mysql.Pool;
}

interface SqlServerConnection {
	dialect: "sqlserver";
	fingerprint: string;
	client: SqlServerConnectionPool;
}

interface SqliteConnection {
	dialect: "sqlite" | "libsql";
	fingerprint: string;
	client: LibSqlClient;
}

type ManagedConnection = PostgresConnection | MySqlConnection | SqlServerConnection | SqliteConnection;

export interface ExecuteOptions {
	readOnly: boolean;
	maxRows?: number;
}

export interface DatabaseExecution {
	dialect: DatabaseDialect;
	rows: unknown[];
	rowCount: number;
	affectedRows?: number;
	changedRows?: number;
	lastInsertId?: string | number;
	columns: string[];
	command?: string;
	warningCount?: number;
	durationMs: number;
}

/** Drizzle has no built-in SQL Server dialect; this compiler preserves its SQL chunks and emits T-SQL binds/identifiers. */
export class SqlServerDialect extends PgDialect {
	override escapeName(name: string): string {
		return `[${name.replace(/]/g, "]]")}]`;
	}

	override escapeParam(index: number): string {
		return `@__pi_p${index + 1}`;
	}
}

const pgDialect = new PgDialect();
const mysqlDialect = new MySqlDialect();
const sqlServerDialect = new SqlServerDialect();
const sqliteDialect = new SQLiteAsyncDialect();

function connectionFingerprint(profile: ConnectionProfile): string {
	return createHash("sha256")
		.update(JSON.stringify([profile.dialect, profile.url, profile.authToken, profile.timeoutMs]))
		.digest("hex");
}

function secureMySqlUrl(raw: string, timeoutMs: number): string {
	const url = new URL(raw);
	for (const key of [...url.searchParams.keys()]) {
		const normalized = key.toLowerCase().replace(/[-_]/g, "");
		if (normalized === "multiplestatements" || normalized === "connecttimeout" || normalized === "connectionlimit") {
			url.searchParams.delete(key);
		}
	}
	const flags = url.searchParams.get("flags");
	if (flags) {
		const safeFlags = flags.split(/[ ,]+/).filter((flag) => !/^[+-]?MULTI_STATEMENTS$/i.test(flag));
		if (safeFlags.length) url.searchParams.set("flags", safeFlags.join(","));
		else url.searchParams.delete("flags");
	}
	url.searchParams.set("connectTimeout", String(Math.min(timeoutMs, 10_000)));
	url.searchParams.set("connectionLimit", "4");
	return url.toString();
}

function parseSqlServerEncrypt(value: string): boolean | "strict" {
	if (/^(?:1|true|yes|on|mandatory|required)$/i.test(value)) return true;
	if (/^(?:0|false|no|off|disable|disabled|optional)$/i.test(value)) return false;
	if (/^strict$/i.test(value)) return "strict";
	throw new Error("Invalid SQL Server URL: encrypt must be true, false, disable, optional, mandatory, or strict.");
}

function decodeSqlServerUrlPart(value: string, label: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		throw new Error(`Invalid SQL Server URL: ${label} is not valid percent-encoding.`);
	}
}

export function secureSqlServerConfig(raw: string, timeoutMs: number): SqlServerConfig {
	const resourcePolicy = {
		connectionTimeout: Math.min(timeoutMs, 10_000),
		requestTimeout: timeoutMs,
		stream: false,
		arrayRowMode: false,
		parseJSON: false,
		pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
	};
	const value = raw.trim();

	if (/^(?:mssql|sqlserver):\/\//i.test(value)) {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			throw new Error("Invalid SQL Server URL.");
		}
		if (!/^(?:mssql|sqlserver):$/.test(url.protocol.toLowerCase()) || !url.hostname || url.hash) {
			throw new Error("Invalid SQL Server URL: a server is required and fragments are not supported.");
		}

		const queryOptions = new Map<string, string>();
		for (const [key, optionValue] of url.searchParams) {
			const normalized = key.toLowerCase().replace(/[-_]/g, "");
			if (normalized !== "database" && normalized !== "encrypt") {
				throw new Error("Invalid SQL Server URL: unsupported query option.");
			}
			if (queryOptions.has(normalized)) throw new Error("Invalid SQL Server URL: duplicate query option.");
			queryOptions.set(normalized, optionValue);
		}

		const encodedPathDatabase = url.pathname.replace(/^\//, "");
		if (encodedPathDatabase.includes("/")) {
			throw new Error("Invalid SQL Server URL: database path must contain one segment.");
		}
		const pathDatabase = encodedPathDatabase
			? decodeSqlServerUrlPart(encodedPathDatabase, "database")
			: undefined;
		const queryDatabase = queryOptions.get("database");
		if (pathDatabase && queryDatabase) throw new Error("Invalid SQL Server URL: database is configured twice.");
		const server = url.hostname.startsWith("[") && url.hostname.endsWith("]")
			? url.hostname.slice(1, -1)
			: url.hostname;
		const user = url.username ? decodeSqlServerUrlPart(url.username, "username") : undefined;
		if (!user) throw new Error("Invalid SQL Server URL: username is required.");

		return {
			...resourcePolicy,
			server,
			port: url.port ? Number(url.port) : undefined,
			user,
			password: url.password ? decodeSqlServerUrlPart(url.password, "password") : "",
			database: queryDatabase || pathDatabase,
			options: {
				encrypt: queryOptions.has("encrypt")
					? parseSqlServerEncrypt(queryOptions.get("encrypt") ?? "")
					: true,
				trustServerCertificate: false,
				appName: "pi-drizzle",
				enableArithAbort: true,
			},
		};
	}

	if (/(?:^|;)\s*(?:authentication|trusted_connection|integrated\s+security)\s*=/i.test(value)) {
		throw new Error("Unsupported SQL Server connection string authentication; use SQL username/password authentication.");
	}
	let parsed: ReturnType<typeof mssql.ConnectionPool.parseConnectionString>;
	try {
		parsed = mssql.ConnectionPool.parseConnectionString(value);
	} catch {
		throw new Error("Invalid SQL Server connection string.");
	}
	if (!parsed.server?.trim()) throw new Error("Invalid SQL Server connection string: server is required.");
	const parsedAuthentication = parsed as typeof parsed & {
		authentication_type?: unknown;
		clientId?: unknown;
		clientSecret?: unknown;
		tenantId?: unknown;
		token?: unknown;
		msiEndpoint?: unknown;
		msiSecret?: unknown;
	};
	if (
		parsedAuthentication.authentication_type !== undefined
		|| parsedAuthentication.clientId !== undefined
		|| parsedAuthentication.clientSecret !== undefined
		|| parsedAuthentication.tenantId !== undefined
		|| parsedAuthentication.token !== undefined
		|| parsedAuthentication.msiEndpoint !== undefined
		|| parsedAuthentication.msiSecret !== undefined
		|| parsed.options?.trustedConnection === true
	) {
		throw new Error("Invalid SQL Server connection string: this authentication mode is not supported.");
	}
	if (!parsed.user) throw new Error("Invalid SQL Server connection string: username is required.");
	return {
		...resourcePolicy,
		server: parsed.server,
		port: parsed.port,
		user: parsed.user,
		password: parsed.password,
		domain: parsed.domain,
		database: parsed.database,
		options: {
			encrypt: parsed.options?.encrypt !== false,
			trustServerCertificate: false,
			instanceName: parsed.options?.instanceName,
			appName: "pi-drizzle",
			enableArithAbort: true,
		},
	};
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asId(value: unknown): string | number | undefined {
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "number" || typeof value === "string") return value;
	return undefined;
}

function cleanDiagnostic(value: string): string {
	return value
		.replace(/\x1B(?:[@-_][0-?]*[ -/]*)?[0-~]/g, "")
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
		.slice(0, 4_000);
}

function profileSecrets(profile: ConnectionProfile): string[] {
	const secrets = new Set<string>();
	for (const secret of [profile.authToken, profile.url]) {
		if (secret) secrets.add(secret);
	}
	if (!profile.url) return [...secrets];
	try {
		const url = new URL(profile.url);
		for (const encoded of [url.username, url.password]) {
			if (!encoded) continue;
			secrets.add(encoded);
			try {
				secrets.add(decodeURIComponent(encoded));
			} catch {
				// The complete URL is already redacted when malformed percent encoding is present.
			}
		}
	} catch {
		if (profile.dialect === "sqlserver") {
			try {
				const parsed = mssql.ConnectionPool.parseConnectionString(profile.url);
				if (parsed.user) secrets.add(parsed.user);
				if (parsed.password) secrets.add(parsed.password);
			} catch {
				// The complete connection string remains in the redaction set.
			}
		}
	}
	return [...secrets].filter(Boolean).sort((left, right) => right.length - left.length);
}

export function sanitizeDatabaseError(error: unknown, profile: ConnectionProfile, options: ExecuteOptions): Error {
	const source = error instanceof Error ? error.message : String(error);
	let message = source.replace(/\n?params?:[\s\S]*/i, "\nparams: [redacted]");
	for (const secret of profileSecrets(profile)) message = message.split(secret).join("[redacted]");
	message = message.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted]@");
	const unknownOutcome = !options.readOnly && /timeout|timed out|cancel|abort|closed|connection lost/i.test(message)
		? " The write outcome may be unknown; verify database state before retrying."
		: "";
	return new Error(`Database operation failed on connection ${JSON.stringify(profile.name)}: ${cleanDiagnostic(message)}${unknownOutcome}`);
}

async function closeConnection(connection: ManagedConnection): Promise<void> {
	if (connection.dialect === "postgresql" || connection.dialect === "mysql") {
		await connection.client.end();
		return;
	}
	if (connection.dialect === "sqlserver") {
		await connection.client.close();
		return;
	}
	connection.client.close();
}

function normalizePostgres(result: QueryResult, readOnly: boolean, durationMs: number): DatabaseExecution {
	const rows = Array.isArray(result.rows) ? result.rows : [];
	const command = typeof result.command === "string" ? result.command : undefined;
	const mutation = !readOnly && command !== "SELECT" && command !== "SHOW";
	return {
		dialect: "postgresql",
		rows,
		rowCount: typeof result.rowCount === "number" ? result.rowCount : rows.length,
		affectedRows: mutation && typeof result.rowCount === "number" ? result.rowCount : undefined,
		columns: Array.isArray(result.fields) ? result.fields.map((field) => field.name) : [],
		command,
		durationMs,
	};
}

function normalizeMySql(
	payload: RowDataPacket[] | RowDataPacket[][] | ResultSetHeader,
	fields: FieldPacket[],
	readOnly: boolean,
	durationMs: number,
): DatabaseExecution {
	const rows = Array.isArray(payload) ? payload : [];
	const header = !Array.isArray(payload) ? payload : undefined;
	const affectedRows = !readOnly ? asNumber(header?.affectedRows) : undefined;
	return {
		dialect: "mysql",
		rows,
		rowCount: rows.length || affectedRows || 0,
		affectedRows,
		changedRows: !readOnly ? asNumber(header?.changedRows) : undefined,
		lastInsertId: !readOnly ? asId(header?.insertId) : undefined,
		columns: fields.map((field) => field.name),
		warningCount: asNumber(header?.warningStatus),
		durationMs,
	};
}

function normalizeSqlServer(
	result: SqlServerResult<Record<string, unknown>>,
	readOnly: boolean,
	durationMs: number,
): DatabaseExecution {
	const rows = Array.isArray(result.recordset) ? [...result.recordset] : [];
	const affectedRows = !readOnly && Array.isArray(result.rowsAffected)
		? result.rowsAffected.reduce((total, count) => total + (Number.isFinite(count) ? count : 0), 0)
		: undefined;
	return {
		dialect: "sqlserver",
		rows,
		rowCount: rows.length || affectedRows || 0,
		affectedRows,
		columns: result.recordset?.columns ? Object.keys(result.recordset.columns) : [],
		durationMs,
	};
}

interface SqlServerReadResult {
	rows: unknown[];
	columns: string[];
}

function isSqlServerCancellation(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ECANCEL";
}

export async function executeLimitedSqlServerRead(
	request: SqlServerRequest,
	statement: string,
	maxRows: number,
): Promise<SqlServerReadResult> {
	const rows: unknown[] = [];
	let columns: string[] = [];
	let firstRecordset = true;
	let limitCancellation = false;
	let eventError: unknown;
	request.stream = true;
	request.on("recordset", (metadata: SqlServerColumnMetadata) => {
		if (firstRecordset) columns = Object.keys(metadata);
		firstRecordset = false;
	});
	request.on("row", (row: unknown) => {
		if (rows.length >= maxRows + 1) return;
		rows.push(row);
		if (rows.length === maxRows + 1) {
			limitCancellation = true;
			request.pause();
			request.cancel();
		}
	});
	request.on("error", (error: unknown) => {
		eventError ??= error;
	});
	try {
		await request.query(statement);
	} catch (error) {
		if (!(limitCancellation && isSqlServerCancellation(error))) throw error;
	}
	if (eventError && !(limitCancellation && isSqlServerCancellation(eventError))) throw eventError;
	return { rows, columns };
}

function normalizeSqlServerRead(result: SqlServerReadResult, durationMs: number): DatabaseExecution {
	return {
		dialect: "sqlserver",
		rows: result.rows,
		rowCount: result.rows.length,
		columns: result.columns,
		durationMs,
	};
}

function normalizeLibSql(
	result: LibSqlResultSet,
	dialect: "sqlite" | "libsql",
	readOnly: boolean,
	durationMs: number,
): DatabaseExecution {
	const rows = Array.isArray(result.rows) ? result.rows : [];
	return {
		dialect,
		rows,
		rowCount: rows.length || (!readOnly ? result.rowsAffected : 0),
		affectedRows: !readOnly ? result.rowsAffected : undefined,
		lastInsertId: !readOnly ? asId(result.lastInsertRowid) : undefined,
		columns: Array.isArray(result.columns) ? [...result.columns] : [],
		durationMs,
	};
}

export class DrizzleManager {
	private readonly connections = new Map<string, ManagedConnection>();

	private async connect(profile: ConnectionProfile): Promise<ManagedConnection> {
		if (!profile.available || !profile.url || !profile.dialect) {
			throw new Error(`Drizzle connection ${JSON.stringify(profile.name)} is unavailable.`);
		}
		const fingerprint = connectionFingerprint(profile);
		const current = this.connections.get(profile.name);
		if (current?.fingerprint === fingerprint) return current;
		if (current) {
			this.connections.delete(profile.name);
			await closeConnection(current).catch(() => undefined);
		}

		let connection: ManagedConnection;
		if (profile.dialect === "postgresql") {
			connection = {
				dialect: "postgresql",
				fingerprint,
				client: new PostgresPool({
					connectionString: profile.url,
					max: 4,
					idleTimeoutMillis: 30_000,
					connectionTimeoutMillis: Math.min(profile.timeoutMs, 10_000),
				}),
			};
		} else if (profile.dialect === "mysql") {
			connection = {
				dialect: "mysql",
				fingerprint,
				client: mysql.createPool(secureMySqlUrl(profile.url, profile.timeoutMs)),
			};
		} else if (profile.dialect === "sqlserver") {
			const client = new mssql.ConnectionPool(secureSqlServerConfig(profile.url, profile.timeoutMs));
			try {
				await client.connect();
			} catch (error) {
				await client.close().catch(() => undefined);
				throw error;
			}
			connection = { dialect: "sqlserver", fingerprint, client };
		} else {
			connection = {
				dialect: profile.dialect,
				fingerprint,
				client: createClient({ url: profile.url, authToken: profile.authToken }),
			};
		}
		this.connections.set(profile.name, connection);
		return connection;
	}

	async execute(
		profile: ConnectionProfile,
		query: SQL,
		options: ExecuteOptions,
		signal?: AbortSignal,
	): Promise<DatabaseExecution> {
		if (signal?.aborted) throw new Error("Database operation cancelled before execution.");
		const startedAt = Date.now();
		try {
			const connection = await this.connect(profile);
			if (signal?.aborted) throw new Error("Database operation cancelled before execution.");

			if (connection.dialect === "postgresql") {
				const compiled = pgDialect.sqlToQuery(query);
				const client = await connection.client.connect();
				let transactionStarted = false;
				try {
					await client.query(options.readOnly ? "BEGIN READ ONLY" : "BEGIN");
					transactionStarted = true;
					await client.query({
						text: "SELECT set_config('statement_timeout', $1, true)",
						values: [`${profile.timeoutMs}ms`],
						queryMode: "extended",
					} as QueryConfig & { queryMode: "extended" });
					const result = await client.query({
						text: compiled.sql,
						values: compiled.params,
						queryMode: "extended",
					} as QueryConfig & { queryMode: "extended" });
					await client.query("COMMIT");
					return normalizePostgres(result, options.readOnly, Date.now() - startedAt);
				} catch (error) {
					if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
					throw error;
				} finally {
					client.release();
				}
			}

			if (connection.dialect === "mysql") {
				const compiled = mysqlDialect.sqlToQuery(query);
				const client = await connection.client.getConnection();
				let transactionStarted = false;
				try {
					await client.query(options.readOnly ? "START TRANSACTION READ ONLY" : "START TRANSACTION");
					transactionStarted = true;
					const queryOptions: QueryOptions = { sql: compiled.sql, timeout: profile.timeoutMs };
					const [payload, fields] = await client.execute<RowDataPacket[] | RowDataPacket[][] | ResultSetHeader>(
						queryOptions,
						compiled.params as Array<string | number | boolean | null>,
					);
					await client.commit();
					return normalizeMySql(payload, fields, options.readOnly, Date.now() - startedAt);
				} catch (error) {
					if (transactionStarted) await client.rollback().catch(() => undefined);
					throw error;
				} finally {
					client.release();
				}
			}

			if (connection.dialect === "sqlserver") {
				const compiled = sqlServerDialect.sqlToQuery(query);
				const transaction = new mssql.Transaction(connection.client);
				let transactionStarted = false;
				let request: mssql.Request | undefined;
				let abortListenerAttached = false;
				const cancelRequest = () => request?.cancel();
				try {
					await transaction.begin(mssql.ISOLATION_LEVEL.READ_COMMITTED);
					transactionStarted = true;
					request = new mssql.Request(transaction);
					for (let index = 0; index < compiled.params.length; index++) {
						request.input(`__pi_p${index + 1}`, compiled.params[index]);
					}
					if (signal?.aborted) throw new Error("Database operation cancelled before execution.");
					signal?.addEventListener("abort", cancelRequest, { once: true });
					abortListenerAttached = Boolean(signal);
					if (options.readOnly) {
						const result = await executeLimitedSqlServerRead(request, compiled.sql, options.maxRows ?? profile.maxRows);
						signal?.removeEventListener("abort", cancelRequest);
						abortListenerAttached = false;
						if (signal?.aborted) throw new Error("Database operation cancelled before transaction completion.");
						await transaction.rollback();
						transactionStarted = false;
						return normalizeSqlServerRead(result, Date.now() - startedAt);
					}
					const result = await request.query<Record<string, unknown>>(compiled.sql);
					signal?.removeEventListener("abort", cancelRequest);
					abortListenerAttached = false;
					if (signal?.aborted) throw new Error("Database operation cancelled before commit.");
					await transaction.commit();
					transactionStarted = false;
					return normalizeSqlServer(result, false, Date.now() - startedAt);
				} catch (error) {
					let rollbackFailed = false;
					if (transactionStarted) {
						try {
							await transaction.rollback();
						} catch {
							rollbackFailed = true;
						}
					}
					if (signal?.aborted && !rollbackFailed) {
						throw new Error("Database operation cancelled during execution; the transaction was rolled back.");
					}
					throw error;
				} finally {
					if (abortListenerAttached) signal?.removeEventListener("abort", cancelRequest);
				}
			}

			const compiled = sqliteDialect.sqlToQuery(query);
			const statement = { sql: compiled.sql, args: compiled.params as InArgs };
			if (options.readOnly) {
				try {
					const results = await connection.client.batch(
						[{ sql: "PRAGMA query_only = ON", args: [] }, statement, { sql: "PRAGMA query_only = OFF", args: [] }],
						"read",
					);
					return normalizeLibSql(results[1], connection.dialect, true, Date.now() - startedAt);
				} finally {
					await connection.client.execute("PRAGMA query_only = OFF").catch(() => undefined);
				}
			}
			await connection.client.execute("PRAGMA query_only = OFF").catch(() => undefined);
			const [result] = await connection.client.batch([statement], "write");
			return normalizeLibSql(result, connection.dialect, false, Date.now() - startedAt);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Database operation cancelled")) throw error;
			throw sanitizeDatabaseError(error, profile, options);
		}
	}

	async closeAll(): Promise<void> {
		const connections = [...this.connections.values()];
		this.connections.clear();
		const closing = Promise.allSettled(connections.map((connection) => closeConnection(connection)));
		let timer: NodeJS.Timeout | undefined;
		try {
			await Promise.race([
				closing,
				new Promise<void>((resolve) => {
					timer = setTimeout(resolve, 5_000);
					timer.unref();
				}),
			]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
}
