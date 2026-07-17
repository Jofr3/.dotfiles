import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { DatabaseEngine } from "./profile.ts";

export const MAX_QUERY_BYTES = 64 * 1024;
export const MAX_SQL_TOKENS = 20_000;
export const MAX_SQL_STATEMENTS = 8;
export const MAX_SQL_DEPTH = 64;

export type SqlClassification = "read-only" | "mutation" | "ddl" | "administrative" | "unknown" | "multiple";

export interface SqlSafetyDecision {
	readonly requiresConfirmation: boolean;
	readonly classification: SqlClassification;
	readonly statementCount: number;
	readonly queryHash: string;
	readonly preview: string;
}

export class SqlSafetyError extends Error {
	constructor() { super("Database query is invalid or contains an unsupported client command."); }
}

interface Token {
	readonly text: string;
	readonly depth: number;
	readonly kind: "word" | "identifier" | "symbol";
}

const MUTATIONS = new Set(["INSERT", "REPLACE", "UPDATE", "DELETE", "MERGE"]);
const DDL = new Set(["CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME"]);
const ADMINISTRATIVE = new Set([
	"GRANT", "REVOKE", "DENY", "CALL", "EXEC", "EXECUTE", "LOAD", "BULK", "BACKUP",
	"RESTORE", "DBCC", "KILL", "SHUTDOWN", "SET", "USE", "LOCK", "UNLOCK", "ANALYZE",
	"OPTIMIZE", "REPAIR", "INSTALL", "UNINSTALL", "START", "STOP", "BEGIN", "COMMIT",
	"ROLLBACK", "SAVEPOINT", "RELEASE",
]);
const UNSAFE_QUERY_CONTROL = /[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f\p{Cf}\p{Cs}\u2028\u2029]/u;
const CLIENT_COMMAND_LINE = /^[\t ]*(?:(?:source|system|delimiter|tee|pager)\b|\\|!!|:!!|:[A-Za-z])/imu;
const STRUCTURAL_PAREN_PREDECESSORS = new Set([
	"SELECT", "FROM", "JOIN", "WHERE", "HAVING", "ON", "AS", "IN", "EXISTS",
	"NOT", "AND", "OR", "BY", "USING", "WHEN", "THEN", "ELSE",
	"DISTINCT", "ALL", "ANY", "SOME", "OVER", "UNION", "INTERSECT", "EXCEPT", "WITH",
]);
const SQLSERVER_LOCK_HINTS = new Set([
	"UPDLOCK", "XLOCK", "HOLDLOCK", "TABLOCK", "TABLOCKX", "ROWLOCK", "PAGLOCK",
	"READCOMMITTED", "READCOMMITTEDLOCK", "REPEATABLEREAD", "SERIALIZABLE",
]);
const COMPOUND_ASSIGNMENT_PREFIXES = new Set(["+", "-", "*", "/", "%", "&", "^", "|"]);

function fail(): never { throw new SqlSafetyError(); }

function scan(query: string, engine: DatabaseEngine): readonly (readonly Token[])[] {
	if (CLIENT_COMMAND_LINE.test(query) || query.includes("$(")) fail();
	if (engine === "sqlserver" && /^[\t ]*GO(?:[\t ]+[0-9]+)?[\t ]*$/imu.test(query)) fail();
	const statements: Token[][] = [[]];
	let index = 0;
	let depth = 0;
	let tokens = 0;
	const push = (text: string, kind: Token["kind"] = "symbol"): void => {
		statements[statements.length - 1]!.push(Object.freeze({ text, depth, kind }));
		tokens += 1;
		if (tokens > MAX_SQL_TOKENS) fail();
	};
	while (index < query.length) {
		const character = query[index]!;
		if (/\s/u.test(character)) { index += 1; continue; }
		const dashComment = query.startsWith("--", index) && (
			engine === "sqlserver" ||
			(engine === "mysql" && index + 2 < query.length && (() => {
				const code = query.charCodeAt(index + 2);
				return code <= 0x20 || code === 0x7f;
			})())
		);
		if (dashComment || (engine === "mysql" && character === "#")) {
			const newline = query.indexOf("\n", index + 1);
			index = newline < 0 ? query.length : newline + 1;
			continue;
		}
		if (query.startsWith("/*", index)) {
			// MySQL version comments, MariaDB executable comments, and optimizer
			// hints can contain server-executed SQL despite comment syntax.
			const commentPrefix = query.slice(index, index + 4).toUpperCase();
			if (query.startsWith("/*!", index) || query.startsWith("/*+", index) || commentPrefix === "/*M!") fail();
			let commentDepth = 1;
			index += 2;
			while (index < query.length && commentDepth > 0) {
				if (query.startsWith("/*", index)) {
					// SQL Server supports nested block comments; MySQL does not. Reject
					// ambiguous MySQL nesting rather than hiding executable text.
					if (engine === "mysql") fail();
					commentDepth += 1;
					if (commentDepth > 16) fail();
					index += 2;
				}
				else if (query.startsWith("*/", index)) { commentDepth -= 1; index += 2; }
				else index += 1;
			}
			if (commentDepth !== 0) fail();
			continue;
		}
		if (character === "'") {
			index += 1;
			let closed = false;
			while (index < query.length) {
				if (query[index] === "'" && query[index + 1] === "'") { index += 2; continue; }
				// MySQL backslash quote semantics depend on sql_mode. Without a
				// negotiated mode, no lexical interpretation is safe enough to skip
				// confirmation, so reject the ambiguous construct.
				if (engine === "mysql" && query[index] === "\\") fail();
				if (query[index] === "'") { index += 1; closed = true; break; }
				index += 1;
			}
			if (!closed) fail();
			push("<STRING>");
			continue;
		}
		if (character === '"' || character === "`") {
			const quote = character;
			index += 1;
			let closed = false;
			while (index < query.length) {
				if (query[index] === quote && query[index + 1] === quote) { index += 2; continue; }
				if (engine === "mysql" && query[index] === "\\") fail();
				if (query[index] === quote) { index += 1; closed = true; break; }
				index += 1;
			}
			if (!closed) fail();
			push("<IDENT>", "identifier");
			continue;
		}
		if (engine === "sqlserver" && character === "[") {
			index += 1;
			let closed = false;
			while (index < query.length) {
				if (query[index] === "]" && query[index + 1] === "]") { index += 2; continue; }
				if (query[index] === "]") { index += 1; closed = true; break; }
				index += 1;
			}
			if (!closed) fail();
			push("<IDENT>", "identifier");
			continue;
		}
		if (character === "(") {
			push("(");
			depth += 1;
			if (depth > MAX_SQL_DEPTH) fail();
			index += 1;
			continue;
		}
		if (character === ")") {
			depth -= 1;
			if (depth < 0) fail();
			push(")");
			index += 1;
			continue;
		}
		if (character === ";" && depth === 0) {
			if (statements[statements.length - 1]!.length > 0) {
				if (statements.length >= MAX_SQL_STATEMENTS) fail();
				statements.push([]);
			}
			index += 1;
			continue;
		}
		const word = /^[A-Za-z_\p{L}][A-Za-z0-9_$\p{L}\p{M}\p{N}]*/u.exec(query.slice(index));
		if (word) {
			push(word[0]!.toUpperCase(), "word");
			index += word[0]!.length;
			continue;
		}
		// Both supported engines admit identifier characters beyond the ASCII
		// subset above. Treat every remaining non-ASCII token as name-like so an
		// unfamiliar routine name before `(` can never inherit read-only status.
		push(character, character === "#" || character === "$" || character.charCodeAt(0) >= 0x80 ? "word" : "symbol");
		index += 1;
	}
	if (depth !== 0) fail();
	const nonEmpty = statements.filter((statement) => statement.length > 0);
	if (nonEmpty.length === 0 || nonEmpty.length > MAX_SQL_STATEMENTS) fail();
	return Object.freeze(nonEmpty.map((statement) => Object.freeze(statement)));
}

function mainKeyword(tokens: readonly Token[]): string {
	const first = tokens.find((token) => token.depth === 0)?.text ?? "";
	if (first !== "WITH") return first;
	let passedWith = false;
	for (const token of tokens) {
		if (token.depth !== 0) continue;
		if (!passedWith) { if (token.text === "WITH") passedWith = true; continue; }
		if (["SELECT", "INSERT", "UPDATE", "DELETE", "MERGE"].includes(token.text)) return token.text;
	}
	return "";
}

function hasPattern(tokens: readonly Token[], pattern: readonly string[]): boolean {
	if (pattern.length === 0 || tokens.length < pattern.length) return false;
	for (let index = 0; index <= tokens.length - pattern.length; index += 1) {
		if (pattern.every((text, offset) => tokens[index + offset]!.text === text)) return true;
	}
	return false;
}

function isNameToken(token: Token | undefined): boolean {
	return token?.kind === "word" || token?.kind === "identifier";
}

function isCteColumnList(tokens: readonly Token[], openIndex: number): boolean {
	const open = tokens[openIndex];
	if (open?.text !== "(" || open.depth !== 0 || tokens[0]?.text !== "WITH") return false;
	for (let index = openIndex + 1; index < tokens.length; index += 1) {
		const token = tokens[index]!;
		if (token.text === ")" && token.depth === open.depth) return tokens[index + 1]?.text === "AS";
	}
	return false;
}

function hasFunctionInvocation(tokens: readonly Token[], engine: DatabaseEngine): boolean {
	for (let index = 1; index < tokens.length; index += 1) {
		if (tokens[index]!.text !== "(") continue;
		const previous = tokens[index - 1];
		const beforePrevious = tokens[index - 2];
		// Reserved/structural words are permitted as qualified identifiers by
		// MySQL/MariaDB. `schema.VALUES()` is therefore a call, not a VALUES
		// grouping construct. Structural exemptions apply only when unqualified.
		const qualified = beforePrevious?.text === "." && beforePrevious.depth === previous?.depth;
		const sqlServerTop = engine === "sqlserver" && previous?.text === "TOP" &&
			beforePrevious?.depth === previous.depth && ["SELECT", "ALL", "DISTINCT"].includes(beforePrevious.text);
		const derivedApply = previous?.text === "APPLY" &&
			beforePrevious?.depth === previous.depth && ["CROSS", "OUTER"].includes(beforePrevious.text);
		if (
			!isNameToken(previous) ||
			(!qualified && STRUCTURAL_PAREN_PREDECESSORS.has(previous!.text)) ||
			(!qualified && (sqlServerTop || derivedApply || isCteColumnList(tokens, index)))
		) continue;
		return true;
	}
	return false;
}

function hasVariableSyntax(tokens: readonly Token[]): boolean {
	return tokens.some((token) => token.text === "@");
}

function hasVariableAssignment(tokens: readonly Token[], engine: DatabaseEngine): boolean {
	if (hasPattern(tokens, [":", "="]) && hasVariableSyntax(tokens)) return true;
	if (engine !== "sqlserver") return false;
	for (let index = 0; index < tokens.length - 2; index += 1) {
		if (tokens[index]!.text !== "@" || tokens[index + 1]!.text === "@" || !isNameToken(tokens[index + 1])) continue;
		const operator = tokens[index + 2]!.text;
		if (operator === "=" || (COMPOUND_ASSIGNMENT_PREFIXES.has(operator) && tokens[index + 3]?.text === "=")) {
			return true;
		}
	}
	return false;
}

function selectLikeRisk(tokens: readonly Token[], engine: DatabaseEngine): SqlClassification | undefined {
	const texts = tokens.map((token) => token.text);
	const advancesSequence = hasPattern(tokens, ["NEXT", "VALUE", "FOR"]);
	const accessesSequence = advancesSequence ||
		hasPattern(tokens, ["PREVIOUS", "VALUE", "FOR"]) ||
		hasPattern(tokens, ["CURRENT", "VALUE", "FOR"]);
	const writesOutput = texts.includes("INTO") || texts.includes("OUTFILE") || texts.includes("DUMPFILE");
	const locksRows = hasPattern(tokens, ["FOR", "UPDATE"]) ||
		hasPattern(tokens, ["FOR", "SHARE"]) ||
		hasPattern(tokens, ["LOCK", "IN", "SHARE", "MODE"]) ||
		texts.some((text) => SQLSERVER_LOCK_HINTS.has(text));
	const nestedMutation = texts.some((text) => MUTATIONS.has(text));
	if (
		advancesSequence || hasVariableAssignment(tokens, engine) || writesOutput || locksRows || nestedMutation
	) return "mutation";
	if (texts.some((text) => DDL.has(text))) return "ddl";
	if (texts.some((text) => ADMINISTRATIVE.has(text))) return "administrative";
	const tableHint = hasPattern(tokens, ["WITH", "("]);
	if (accessesSequence || hasVariableSyntax(tokens) || tableHint || hasFunctionInvocation(tokens, engine)) return "unknown";
	return undefined;
}

function classifyOne(tokens: readonly Token[], engine: DatabaseEngine): SqlClassification {
	const keyword = mainKeyword(tokens);
	const top = tokens.filter((token) => token.depth === 0).map((token) => token.text);
	if (keyword === "SELECT") return selectLikeRisk(tokens, engine) ?? "read-only";
	if (engine === "mysql" && ["SHOW", "DESCRIBE", "DESC"].includes(keyword)) {
		return selectLikeRisk(tokens, engine) ?? "read-only";
	}
	if (keyword === "EXPLAIN") {
		if (top.includes("ANALYZE")) return "administrative";
		const explained = top.find((token) => ["SELECT", "SHOW", "DESCRIBE", "DESC"].includes(token));
		return explained ? selectLikeRisk(tokens, engine) ?? "read-only" : "unknown";
	}
	if (MUTATIONS.has(keyword)) return "mutation";
	if (DDL.has(keyword)) return "ddl";
	if (ADMINISTRATIVE.has(keyword)) return "administrative";
	return "unknown";
}

function safePreview(query: string): string {
	const normalized = query.replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu, " ").replace(/\s+/gu, " ").trim();
	return normalized.length <= 1000 ? normalized : `${normalized.slice(0, 997)}...`;
}

export function classifySql(query: unknown, engine: DatabaseEngine): SqlSafetyDecision {
	if (
		typeof query !== "string" || query.trim().length === 0 ||
		Buffer.byteLength(query, "utf8") > MAX_QUERY_BYTES || UNSAFE_QUERY_CONTROL.test(query)
	) fail();
	const statements = scan(query, engine);
	const classifications = statements.map((statement) => classifyOne(statement, engine));
	const classification: SqlClassification = statements.length > 1 ? "multiple" : classifications[0]!;
	return Object.freeze({
		requiresConfirmation: statements.length > 1 || classification !== "read-only",
		classification,
		statementCount: statements.length,
		queryHash: createHash("sha256").update(query, "utf8").digest("hex"),
		preview: safePreview(query),
	});
}
