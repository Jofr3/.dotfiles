import { sql, type SQL, type SQLChunk } from "drizzle-orm";
import type { DatabaseDialect } from "./config.ts";

export type SqlParameter = string | number | boolean | null;

export interface SqlAnalysis {
	operation: string;
	readOnly: boolean;
	masked: string;
	tokens: string[];
}

const READ_OPERATIONS = new Set(["select", "with", "values", "show", "describe", "desc", "explain", "table"]);
const WRAPPABLE_READ_OPERATIONS = new Set(["select", "with", "values"]);
const MUTATING_TOKENS = new Set([
	"insert",
	"update",
	"delete",
	"merge",
	"replace",
	"upsert",
	"create",
	"alter",
	"drop",
	"truncate",
	"rename",
	"grant",
	"revoke",
	"call",
	"do",
	"copy",
	"vacuum",
	"reindex",
	"cluster",
	"refresh",
	"attach",
	"detach",
	"load",
	"install",
	"set",
	"reset",
	"begin",
	"start",
	"commit",
	"rollback",
	"savepoint",
	"release",
	"lock",
	"unlock",
	"analyze",
	"into",
	"outfile",
	"dumpfile",
	"procedure",
	"exec",
	"execute",
	"waitfor",
	"dbcc",
	"backup",
	"restore",
	"kill",
	"shutdown",
	"use",
	"deny",
	"openrowset",
	"opendatasource",
	"openquery",
]);
const SIDE_EFFECT_FUNCTIONS = new Set([
	"setval",
	"nextval",
	"set_config",
	"pg_sleep",
	"pg_sleep_for",
	"pg_sleep_until",
	"pg_advisory_lock",
	"pg_advisory_lock_shared",
	"pg_try_advisory_lock",
	"pg_try_advisory_lock_shared",
	"pg_advisory_unlock",
	"pg_advisory_unlock_shared",
	"pg_advisory_unlock_all",
	"pg_terminate_backend",
	"pg_cancel_backend",
	"pg_reload_conf",
	"pg_rotate_logfile",
	"pg_switch_wal",
	"pg_create_restore_point",
	"pg_backup_start",
	"pg_backup_stop",
	"pg_start_backup",
	"pg_stop_backup",
	"pg_promote",
	"pg_notify",
	"pg_export_snapshot",
	"dblink_connect",
	"dblink_disconnect",
	"dblink_exec",
	"lo_create",
	"lo_unlink",
	"lo_put",
	"lo_import",
	"lo_export",
	"pg_read_file",
	"pg_read_binary_file",
	"pg_ls_dir",
	"pg_stat_file",
	"get_lock",
	"release_lock",
	"sleep",
	"benchmark",
	"load_file",
	"sys_exec",
	"sys_eval",
	"load_extension",
	"writefile",
	"readfile",
	"edit",
	"openrowset",
	"opendatasource",
	"openquery",
	"xp_cmdshell",
	"sp_configure",
	"sp_oacreate",
	"sp_oamethod",
	"sp_oadestroy",
	"sp_send_dbmail",
]);

function blankRange(characters: string[], start: number, end: number): void {
	for (let index = start; index < end; index++) {
		if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
	}
}

/** Masks quoted strings, quoted identifiers, and comments while preserving UTF-16 offsets. */
export function maskSql(sqlText: string): string {
	const output = sqlText.split("");
	let index = 0;
	while (index < sqlText.length) {
		const current = sqlText[index];
		const next = sqlText[index + 1];

		if (current === "-" && next === "-" && (index + 2 >= sqlText.length || /\s/.test(sqlText[index + 2]))) {
			const start = index;
			index += 2;
			while (index < sqlText.length && sqlText[index] !== "\n" && sqlText[index] !== "\r") index++;
			blankRange(output, start, index);
			continue;
		}
		if (current === "/" && next === "*") {
			const start = index;
			let depth = 1;
			index += 2;
			while (index < sqlText.length && depth > 0) {
				if (sqlText[index] === "/" && sqlText[index + 1] === "*") {
					depth++;
					index += 2;
				} else if (sqlText[index] === "*" && sqlText[index + 1] === "/") {
					depth--;
					index += 2;
				} else {
					index++;
				}
			}
			blankRange(output, start, index);
			continue;
		}
		if (current === "'") {
			const start = index++;
			while (index < sqlText.length) {
				if (sqlText[index] === "'" && sqlText[index + 1] === "'") {
					index += 2;
					continue;
				}
				if (sqlText[index++] === "'") break;
			}
			blankRange(output, start, Math.min(index, sqlText.length));
			continue;
		}
		if (current === '"' || current === "`") {
			const quote = current;
			const start = index++;
			while (index < sqlText.length) {
				if (sqlText[index] === quote && sqlText[index + 1] === quote) {
					index += 2;
					continue;
				}
				if (sqlText[index++] === quote) break;
			}
			blankRange(output, start, Math.min(index, sqlText.length));
			continue;
		}
		if (current === "[") {
			const start = index++;
			while (index < sqlText.length) {
				if (sqlText[index] === "]" && sqlText[index + 1] === "]") {
					index += 2;
					continue;
				}
				if (sqlText[index++] === "]") break;
			}
			blankRange(output, start, Math.min(index, sqlText.length));
			continue;
		}
		if (current === "$" && !/[A-Za-z0-9_$]/.test(sqlText[index - 1] ?? "")) {
			const delimiter = sqlText.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
			if (delimiter) {
				const start = index;
				index += delimiter.length;
				const close = sqlText.indexOf(delimiter, index);
				index = close === -1 ? sqlText.length : close + delimiter.length;
				blankRange(output, start, index);
				continue;
			}
		}
		index++;
	}
	return output.join("");
}

function assertSupportedLexicalForm(statement: string): void {
	if (/\/\*!/.test(statement)) {
		throw new Error("MySQL executable comments (/*! ... */) are not supported by Drizzle database tools.");
	}
	if (statement.includes("\\")) {
		throw new Error("Backslash SQL escapes are not supported by Drizzle database tools; bind the value with :p1 instead.");
	}
}

function assertSingleStatement(masked: string): void {
	const semicolons: number[] = [];
	for (let index = 0; index < masked.length; index++) {
		if (masked[index] === ";") semicolons.push(index);
	}
	if (semicolons.length > 1) throw new Error("Drizzle tools accept exactly one SQL statement per call.");
	if (semicolons.length === 1 && masked.slice(semicolons[0] + 1).trim()) {
		throw new Error("Drizzle tools do not allow multiple SQL statements in one call.");
	}
}

export function analyzeSql(statement: string): SqlAnalysis {
	assertSupportedLexicalForm(statement);
	const masked = maskSql(statement);
	assertSingleStatement(masked);
	const tokens = [...masked.matchAll(/[A-Za-z_][A-Za-z0-9_$]*/g)].map((match) => match[0].toLowerCase());
	if (tokens.length === 0) throw new Error("SQL statement is empty.");
	const operation = tokens[0];
	const quotedSideEffect = [...SIDE_EFFECT_FUNCTIONS].some((name) => {
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`(?:"${escaped}"|\\\`${escaped}\\\`|\\[${escaped}\\])\\s*\\(`, "i").test(statement);
	});
	const sequenceSideEffect = /\bnext\s+value\s+for\b/i.test(masked);
	const readOnly = READ_OPERATIONS.has(operation)
		&& !quotedSideEffect
		&& !sequenceSideEffect
		&& !tokens.some((token) => MUTATING_TOKENS.has(token) || SIDE_EFFECT_FUNCTIONS.has(token));
	return { operation, readOnly, masked, tokens };
}

export function assertReadOnlySql(statement: string): SqlAnalysis {
	const analysis = analyzeSql(statement);
	if (!analysis.readOnly) {
		throw new Error(
			`drizzle_query only accepts a conservatively checked read statement; detected ${analysis.operation.toUpperCase()}. ` +
				"Use drizzle_execute for writes, DDL, SELECT INTO, or potentially side-effecting functions.",
		);
	}
	return analysis;
}

export function assertMutationSql(statement: string): SqlAnalysis {
	const analysis = analyzeSql(statement);
	if (analysis.readOnly) throw new Error("drizzle_execute is for writes, DDL, or side-effecting SQL; use drizzle_query for read-only SQL.");
	return analysis;
}

export function stripTrailingTerminator(statement: string, masked = maskSql(statement)): string {
	let index = masked.length - 1;
	while (index >= 0 && /\s/.test(masked[index])) index--;
	return masked[index] === ";" ? statement.slice(0, index) : statement;
}

export function bindSql(statement: string, parameters: SqlParameter[] = []): SQL {
	assertSupportedLexicalForm(statement);
	const masked = maskSql(statement);
	const normalizedStatement = stripTrailingTerminator(statement, masked);
	const normalizedMasked = masked.slice(0, normalizedStatement.length);
	const placeholderPattern = /:p([1-9][0-9]*)\b/g;
	const matches: Array<{ start: number; end: number; parameterIndex: number }> = [];
	for (const match of normalizedMasked.matchAll(placeholderPattern)) {
		if (match.index === undefined || normalizedMasked[match.index - 1] === ":") continue;
		matches.push({ start: match.index, end: match.index + match[0].length, parameterIndex: Number(match[1]) - 1 });
	}
	if (matches.length === 0) {
		if (parameters.length > 0) throw new Error("SQL parameters were supplied but the statement has no :p1 placeholders.");
		return sql.raw(normalizedStatement);
	}
	const used = new Set(matches.map((match) => match.parameterIndex));
	for (const match of matches) {
		if (match.parameterIndex >= parameters.length) {
			throw new Error(`SQL placeholder :p${match.parameterIndex + 1} has no matching parameter.`);
		}
	}
	for (let index = 0; index < parameters.length; index++) {
		if (!used.has(index)) throw new Error(`SQL parameter ${index + 1} is not referenced by a :p${index + 1} placeholder.`);
	}

	const chunks: SQLChunk[] = [];
	let cursor = 0;
	for (const match of matches) {
		if (match.start > cursor) chunks.push(sql.raw(normalizedStatement.slice(cursor, match.start)));
		chunks.push(sql`${parameters[match.parameterIndex]}`);
		cursor = match.end;
	}
	if (cursor < normalizedStatement.length) chunks.push(sql.raw(normalizedStatement.slice(cursor)));
	return sql.join(chunks, sql.empty());
}

export function limitReadQuery(query: SQL, operation: string, maxRows: number, dialect?: DatabaseDialect): SQL {
	if (!WRAPPABLE_READ_OPERATIONS.has(operation) || dialect === "sqlserver") return query;
	return sql`SELECT * FROM (${query}) AS ${sql.identifier("__pi_drizzle_limited")} LIMIT ${maxRows + 1}`;
}

export function sqlPreview(statement: string, maxLength = 300): string {
	const masked = maskSql(statement).replace(/\s+/g, " ").trim().replace(/;$/, "");
	return masked.length > maxLength ? `${masked.slice(0, maxLength - 1)}…` : masked;
}
