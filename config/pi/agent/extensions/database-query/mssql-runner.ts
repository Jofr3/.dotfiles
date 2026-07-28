import { Buffer } from "node:buffer";
import {
	MAX_CELL_BYTES,
	MAX_STDOUT_BYTES,
} from "./output.ts";
import type { DatabaseProfile } from "./profile.ts";
import {
	DATABASE_CONNECT_TIMEOUT_SECONDS,
	DATABASE_EXECUTION_TIMEOUT_MS,
	SpawnDatabaseRunner,
	type DatabaseRunner,
	type DatabaseRunFailureCode,
	type DatabaseRunResult,
} from "./runner.ts";

interface MssqlRequest {
	query(sql: string): Promise<unknown>;
	cancel(): void;
}

interface MssqlPool {
	connect(): Promise<unknown>;
	request(): MssqlRequest;
	close(): Promise<unknown>;
	on(event: "error", listener: (error: unknown) => void): unknown;
}

interface MssqlModule {
	ConnectionPool: new (config: Readonly<Record<string, unknown>>) => MssqlPool;
}

export interface MssqlRunnerDependencies {
	readonly loadMssql?: () => Promise<unknown>;
	readonly now?: () => number;
}

const TLS_ERROR_CODES = new Set([
	"CERT_HAS_EXPIRED",
	"DEPTH_ZERO_SELF_SIGNED_CERT",
	"ERR_TLS_CERT_ALTNAME_INVALID",
	"SELF_SIGNED_CERT_IN_CHAIN",
	"UNABLE_TO_GET_ISSUER_CERT",
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);
const CONNECTION_ERROR_CODES = new Set([
	"ECONNCLOSED", "ECONNREFUSED", "EHOSTUNREACH", "EINSTLOOKUP", "ENETUNREACH",
	"ENOTOPEN", "ESOCKET",
]);
const QUERY_ERROR_CODES = new Set(["ECANCEL", "EARGS", "EINJECT", "EPREPARE", "EREQUEST"]);

function ownValue(value: unknown, key: string): unknown {
	if (typeof value !== "object" || value === null) return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	} catch { return undefined; }
}

function errorFacts(error: unknown): Readonly<{ codes: ReadonlySet<string>; numbers: ReadonlySet<number> }> {
	const codes = new Set<string>();
	const numbers = new Set<number>();
	const queue: unknown[] = [error];
	const seen = new Set<unknown>();
	for (let index = 0; index < queue.length && index < 16; index += 1) {
		const value = queue[index];
		if (typeof value !== "object" || value === null || seen.has(value)) continue;
		seen.add(value);
		const code = ownValue(value, "code");
		if (typeof code === "string" && /^[A-Z0-9_-]{1,64}$/u.test(code)) codes.add(code);
		const number = ownValue(value, "number");
		if (Number.isSafeInteger(number)) numbers.add(number as number);
		for (const key of ["cause", "originalError"]) {
			const nested = ownValue(value, key);
			if (typeof nested === "object" && nested !== null) queue.push(nested);
		}
		const preceding = ownValue(value, "precedingErrors");
		if (Array.isArray(preceding)) queue.push(...preceding.slice(0, 8));
	}
	return Object.freeze({ codes, numbers });
}

export function classifyMssqlFailure(error: unknown, stage: "connect" | "query"): DatabaseRunFailureCode {
	const facts = errorFacts(error);
	if (facts.numbers.has(4060)) return "database_unavailable";
	if (facts.numbers.has(18456) || facts.codes.has("ELOGIN")) return "authentication_failed";
	if ([...facts.codes].some((code) => TLS_ERROR_CODES.has(code))) return "tls_error";
	if (facts.codes.has("ETIMEOUT") || facts.codes.has("ETIMEDOUT")) return "timeout";
	if ([...facts.codes].some((code) => CONNECTION_ERROR_CODES.has(code))) return "connection_failed";
	if ([...facts.codes].some((code) => QUERY_ERROR_CODES.has(code))) return "query_error";
	return stage === "connect" ? "connection_failed" : "query_error";
}

function boundedCell(value: unknown): string {
	let text: string;
	if (value === null || value === undefined) text = "NULL";
	else if (typeof value === "string") text = value;
	else if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") text = String(value);
	else if (value instanceof Date) text = Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
	else if (Buffer.isBuffer(value)) text = value.toString("hex");
	else text = "[unsupported value]";
	text = text
		.replaceAll("\\", "\\\\")
		.replaceAll("\t", "\\t")
		.replaceAll("\r", "\\r")
		.replaceAll("\n", "\\n")
		.replace(/[\u0000-\u001f\u007f\p{Cf}\p{Cs}\u2028\u2029]/gu, "?");
	if (Buffer.byteLength(text, "utf8") <= MAX_CELL_BYTES) return text;
	let end = Math.min(text.length, MAX_CELL_BYTES);
	while (end > 0 && Buffer.byteLength(text.slice(0, end), "utf8") > MAX_CELL_BYTES - 3) end -= 1;
	return `${text.slice(0, end)}...`;
}

function ownEnumerableKeys(value: unknown): string[] {
	if (typeof value !== "object" || value === null) return [];
	try {
		return Object.keys(value).filter((key) => typeof key === "string").slice(0, 100);
	} catch { return [];
	}
}

function recordsetColumns(recordset: unknown[], firstRow: unknown): string[] {
	const fromRow = ownEnumerableKeys(firstRow);
	if (fromRow.length > 0) return fromRow;
	const metadata = ownValue(recordset, "columns");
	return ownEnumerableKeys(metadata);
}

export function serializeMssqlResult(result: unknown): Buffer | undefined {
	const recordsetsValue = ownValue(result, "recordsets");
	const recordsets = Array.isArray(recordsetsValue) ? recordsetsValue.slice(0, 8) : [];
	const rowsAffectedValue = ownValue(result, "rowsAffected");
	const rowsAffected = Array.isArray(rowsAffectedValue) ? rowsAffectedValue.slice(0, 8) : [];
	const lines: string[] = [];
	let bytes = 0;
	const push = (line: string): boolean => {
		const size = Buffer.byteLength(line, "utf8") + 1;
		if (bytes + size > MAX_STDOUT_BYTES) return false;
		lines.push(line);
		bytes += size;
		return true;
	};
	for (let index = 0; index < recordsets.length; index += 1) {
		const recordset = recordsets[index];
		if (!Array.isArray(recordset)) continue;
		if (recordsets.length > 1 && !push(`[recordset ${index + 1}]`)) return undefined;
		const columns = recordsetColumns(recordset, recordset[0]);
		if (columns.length > 0 && !push(columns.map(boundedCell).join("\t"))) return undefined;
		for (const row of recordset.slice(0, 201)) {
			const cells = columns.map((column) => boundedCell(ownValue(row, column)));
			if (!push(cells.join("\t"))) return undefined;
		}
		if (recordset.length > 201 && !push("[rows truncated by SQL Server runner]")) return undefined;
	}
	if (recordsets.length === 0) {
		for (let index = 0; index < rowsAffected.length; index += 1) {
			const count = rowsAffected[index];
			if (!Number.isSafeInteger(count) || !push(`rows_affected_${index + 1}\t${count}`)) return undefined;
		}
	}
	return Buffer.from(lines.length === 0 ? "" : `${lines.join("\n")}\n`, "utf8");
}

async function defaultMssqlLoader(): Promise<unknown> {
	return import("mssql");
}

function admittedMssqlModule(value: unknown): MssqlModule {
	const direct = ownValue(value, "ConnectionPool");
	const fallback = ownValue(ownValue(value, "default"), "ConnectionPool");
	const ConnectionPool = typeof direct === "function" ? direct : fallback;
	if (typeof ConnectionPool !== "function") throw new Error("mssql module unavailable");
	return { ConnectionPool: ConnectionPool as MssqlModule["ConnectionPool"] };
}

export class MssqlDatabaseRunner implements DatabaseRunner {
	readonly #loadMssql: NonNullable<MssqlRunnerDependencies["loadMssql"]>;
	readonly #now: () => number;

	constructor(dependencies: MssqlRunnerDependencies = {}) {
		this.#loadMssql = dependencies.loadMssql ?? defaultMssqlLoader;
		this.#now = dependencies.now ?? Date.now;
	}

	async run(profile: DatabaseProfile, query: string, _cwd: string, signal?: AbortSignal): Promise<DatabaseRunResult> {
		const startedAt = this.#now();
		const elapsed = (): number => Math.max(0, this.#now() - startedAt);
		if (profile.engine !== "sqlserver") {
			return Object.freeze({ ok: false, code: "client_unavailable", elapsedMs: elapsed() });
		}
		if (signal?.aborted === true) return Object.freeze({ ok: false, code: "aborted", elapsedMs: elapsed() });
		let sql: MssqlModule;
		try { sql = admittedMssqlModule(await this.#loadMssql()); }
		catch { return Object.freeze({ ok: false, code: "client_unavailable", elapsedMs: elapsed() }); }
		let pool: MssqlPool;
		try {
			pool = new sql.ConnectionPool(Object.freeze({
				server: profile.host,
				port: profile.port,
				user: profile.user,
				password: profile.password,
				database: profile.database,
				connectionTimeout: DATABASE_CONNECT_TIMEOUT_SECONDS * 1000,
				requestTimeout: DATABASE_EXECUTION_TIMEOUT_MS - 1000,
				pool: Object.freeze({ max: 1, min: 0, idleTimeoutMillis: 1000 }),
				options: Object.freeze({
					encrypt: profile.encrypt === true,
					trustServerCertificate: profile.trustServerCertificate === true,
					enableArithAbort: true,
				}),
			}));
			pool.on("error", () => { /* Errors are observed by connect/query promises. */ });
		} catch {
			return Object.freeze({ ok: false, code: "client_error", elapsedMs: elapsed() });
		}
		return new Promise<DatabaseRunResult>((resolve) => {
			let settled = false;
			let stage: "connect" | "query" = "connect";
			let request: MssqlRequest | undefined;
			const close = (): void => {
				try { void Promise.resolve(pool.close()).catch(() => {}); } catch { /* Best effort. */ }
			};
			const finish = (result: DatabaseRunResult): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				try { signal?.removeEventListener("abort", onAbort); } catch { /* Fixed result remains authoritative. */ }
				close();
				resolve(result);
			};
			const cancel = (): void => {
				try { request?.cancel(); } catch { /* Close the pool below. */ }
			};
			const onAbort = (): void => {
				cancel();
				finish(Object.freeze({ ok: false, code: "aborted", elapsedMs: elapsed() }));
			};
			const timeout = setTimeout(() => {
				cancel();
				finish(Object.freeze({ ok: false, code: "timeout", elapsedMs: elapsed() }));
			}, DATABASE_EXECUTION_TIMEOUT_MS);
			try { signal?.addEventListener("abort", onAbort, { once: true }); }
			catch { onAbort(); return; }
			void (async () => {
				try {
					await pool.connect();
					if (settled) return;
					stage = "query";
					request = pool.request();
					const result = await request.query(query);
					if (settled) return;
					const stdout = serializeMssqlResult(result);
					if (stdout === undefined) {
						finish(Object.freeze({ ok: false, code: "output_limit", elapsedMs: elapsed() }));
						return;
					}
					finish(Object.freeze({ ok: true, stdout, elapsedMs: elapsed() }));
				} catch (error) {
					if (settled) return;
					finish(Object.freeze({ ok: false, code: classifyMssqlFailure(error, stage), elapsedMs: elapsed() }));
				}
			})();
		});
	}
}

export class DefaultDatabaseRunner implements DatabaseRunner {
	readonly #sqlserver: DatabaseRunner;
	readonly #cli: DatabaseRunner;

	constructor(sqlserver: DatabaseRunner = new MssqlDatabaseRunner(), cli: DatabaseRunner = new SpawnDatabaseRunner()) {
		this.#sqlserver = sqlserver;
		this.#cli = cli;
	}

	run(profile: DatabaseProfile, query: string, cwd: string, signal?: AbortSignal): Promise<DatabaseRunResult> {
		return profile.engine === "sqlserver"
			? this.#sqlserver.run(profile, query, cwd, signal)
			: this.#cli.run(profile, query, cwd, signal);
	}
}
