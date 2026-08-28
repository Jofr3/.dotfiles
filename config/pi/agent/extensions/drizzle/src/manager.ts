import { createHash } from "node:crypto";
import { createClient, type Client as LibSqlClient, type InArgs, type ResultSet as LibSqlResultSet } from "@libsql/client";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { PgDialect } from "drizzle-orm/pg-core";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
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

interface SqliteConnection {
	dialect: "sqlite" | "libsql";
	fingerprint: string;
	client: LibSqlClient;
}

type ManagedConnection = PostgresConnection | MySqlConnection | SqliteConnection;

export interface ExecuteOptions {
	readOnly: boolean;
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

const pgDialect = new PgDialect();
const mysqlDialect = new MySqlDialect();
const sqliteDialect = new SQLiteAsyncDialect();

function connectionFingerprint(profile: ConnectionProfile): string {
	return createHash("sha256").update(JSON.stringify([profile.dialect, profile.url, profile.authToken])).digest("hex");
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

function sanitizeDatabaseError(error: unknown, profile: ConnectionProfile, options: ExecuteOptions): Error {
	const source = error instanceof Error ? error.message : String(error);
	let message = source.replace(/\n?params?:[\s\S]*/i, "\nparams: [redacted]");
	for (const secret of [profile.authToken, profile.url]) {
		if (secret) message = message.split(secret).join("[redacted]");
	}
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
