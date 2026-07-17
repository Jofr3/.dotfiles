import { Buffer } from "node:buffer";
import { isAbsolute, normalize } from "node:path";

export const DATABASE_PROFILE_MAX_BYTES = 32 * 1024;
export const DATABASE_PASSWORD_MAX_BYTES = 8 * 1024;

export type DatabaseEngine = "mysql" | "sqlserver";

export interface DatabaseProfile {
	readonly version: 1;
	readonly engine: DatabaseEngine;
	readonly host?: string;
	readonly socket?: string;
	readonly port: number;
	readonly user: string;
	readonly password: string;
	readonly database: string;
	readonly schema?: string;
	readonly encrypt?: boolean;
	readonly trustServerCertificate?: boolean;
}

export class DatabaseProfileError extends Error {
	constructor() { super("Database connection profile is invalid."); }
}

const DYNAMIC_KEYS = new Set([
	"version", "engine", "host", "socket", "port", "user", "password", "database",
	"schema", "encrypt", "trustServerCertificate",
]);
const LEGACY_KEYS = new Set([
	"type", "host", "socket", "port", "user", "password", "database", "schema",
	"encrypt", "trustServerCertificate",
]);
const UNSAFE_ROUTING_TEXT = /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u;
const SECRET_REFERENCE_PREFIX = /^op:\/\//iu;
const OPTION_SHAPED_ROUTING_TEXT = /^-/u;
const UNPAIRED_SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF])/u;

type FlatValue = string | number | boolean;

class FlatJsonParser {
	readonly #text: string;
	#index = 0;
	constructor(text: string) { this.#text = text; }

	parse(): Map<string, FlatValue> {
		this.#space();
		this.#take("{");
		this.#space();
		const result = new Map<string, FlatValue>();
		if (this.#peek() === "}") {
			this.#index += 1;
			this.#finish();
			return result;
		}
		while (true) {
			const key = this.#string();
			if (result.has(key)) throw new DatabaseProfileError();
			this.#space();
			this.#take(":");
			this.#space();
			result.set(key, this.#value());
			this.#space();
			const next = this.#peek();
			if (next === "}") { this.#index += 1; break; }
			this.#take(",");
			this.#space();
		}
		this.#finish();
		return result;
	}

	#finish(): void {
		this.#space();
		if (this.#index !== this.#text.length) throw new DatabaseProfileError();
	}
	#peek(): string | undefined { return this.#text[this.#index]; }
	#take(expected: string): void {
		if (this.#text[this.#index] !== expected) throw new DatabaseProfileError();
		this.#index += 1;
	}
	#space(): void {
		while (this.#index < this.#text.length && /[\u0009\u000a\u000d\u0020]/u.test(this.#text[this.#index]!)) {
			this.#index += 1;
		}
	}
	#string(): string {
		if (this.#peek() !== '"') throw new DatabaseProfileError();
		const start = this.#index;
		this.#index += 1;
		let escaped = false;
		while (this.#index < this.#text.length) {
			const character = this.#text[this.#index]!;
			const code = character.charCodeAt(0);
			if (!escaped && character === '"') {
				this.#index += 1;
				const raw = this.#text.slice(start, this.#index);
				let decoded: unknown;
				try { decoded = JSON.parse(raw); } catch { throw new DatabaseProfileError(); }
				if (typeof decoded !== "string" || UNPAIRED_SURROGATE.test(decoded)) throw new DatabaseProfileError();
				return decoded;
			}
			if (!escaped && code < 0x20) throw new DatabaseProfileError();
			if (!escaped && character === "\\") escaped = true;
			else escaped = false;
			this.#index += 1;
		}
		throw new DatabaseProfileError();
	}
	#value(): FlatValue {
		if (this.#peek() === '"') return this.#string();
		if (this.#text.startsWith("true", this.#index)) { this.#index += 4; return true; }
		if (this.#text.startsWith("false", this.#index)) { this.#index += 5; return false; }
		const match = /-?(?:0|[1-9][0-9]*)/uy;
		match.lastIndex = this.#index;
		const found = match.exec(this.#text);
		if (!found) throw new DatabaseProfileError();
		this.#index = match.lastIndex;
		const value = Number(found[0]);
		if (!Number.isSafeInteger(value)) throw new DatabaseProfileError();
		return value;
	}
}

function exactText(value: FlatValue | undefined, maximum: number): string {
	if (
		typeof value !== "string" || value.length === 0 || value.trim() !== value ||
		Buffer.byteLength(value, "utf8") > maximum || UNSAFE_ROUTING_TEXT.test(value) ||
		SECRET_REFERENCE_PREFIX.test(value) || OPTION_SHAPED_ROUTING_TEXT.test(value)
	) throw new DatabaseProfileError();
	return value;
}

function passwordText(value: FlatValue | undefined): string {
	if (
		typeof value !== "string" || value.length === 0 ||
		Buffer.byteLength(value, "utf8") > DATABASE_PASSWORD_MAX_BYTES ||
		value.includes("\u0000") || UNPAIRED_SURROGATE.test(value) || SECRET_REFERENCE_PREFIX.test(value)
	) throw new DatabaseProfileError();
	return value;
}

function portNumber(value: FlatValue | undefined, fallback: number | undefined): number {
	const selected = value === undefined ? fallback : value;
	if (!Number.isSafeInteger(selected) || (selected as number) < 1 || (selected as number) > 65535) {
		throw new DatabaseProfileError();
	}
	return selected as number;
}

function booleanValue(value: FlatValue | undefined, fallback: boolean | undefined): boolean | undefined {
	if (value === undefined) return fallback;
	if (typeof value !== "boolean") throw new DatabaseProfileError();
	return value;
}

function normalizedEngine(value: FlatValue | undefined, legacy: boolean): DatabaseEngine {
	if (typeof value !== "string") throw new DatabaseProfileError();
	if (value === "mysql" || (legacy && (value === "mariadb" || value === "maria"))) return "mysql";
	if (value === "sqlserver" || (legacy && ["sql-server", "mssql", "ms-sql"].includes(value))) return "sqlserver";
	throw new DatabaseProfileError();
}

function buildProfile(values: Map<string, FlatValue>, legacy: boolean): DatabaseProfile {
	const allowed = legacy ? LEGACY_KEYS : DYNAMIC_KEYS;
	if (values.size === 0 || values.size > allowed.size) throw new DatabaseProfileError();
	for (const key of values.keys()) if (!allowed.has(key)) throw new DatabaseProfileError();
	if (!legacy && values.get("version") !== 1) throw new DatabaseProfileError();
	const engine = normalizedEngine(values.get(legacy ? "type" : "engine"), legacy);
	const host = values.has("host") ? exactText(values.get("host"), 255) : undefined;
	let socket = values.has("socket") ? exactText(values.get("socket"), 1024) : undefined;
	if (socket !== undefined) {
		if (!isAbsolute(socket) || normalize(socket) !== socket) throw new DatabaseProfileError();
	}
	const user = exactText(values.get("user"), 256);
	const database = exactText(values.get("database"), 256);
	const password = passwordText(values.get("password"));
	const schema = values.has("schema") ? exactText(values.get("schema"), 256) : undefined;
	let port: number;
	let encrypt: boolean | undefined;
	let trustServerCertificate: boolean | undefined;
	if (engine === "mysql") {
		if ((host === undefined) === (socket === undefined) || schema !== undefined) throw new DatabaseProfileError();
		if (values.has("encrypt") || values.has("trustServerCertificate")) throw new DatabaseProfileError();
		port = portNumber(values.get("port"), 3306);
	} else {
		if (host === undefined || socket !== undefined) throw new DatabaseProfileError();
		port = portNumber(values.get("port"), legacy ? 1433 : undefined);
		encrypt = booleanValue(values.get("encrypt"), legacy ? true : undefined);
		trustServerCertificate = booleanValue(values.get("trustServerCertificate"), legacy ? false : undefined);
		if (encrypt === undefined || trustServerCertificate === undefined) throw new DatabaseProfileError();
	}
	return Object.freeze({
		version: 1 as const,
		engine,
		...(host === undefined ? {} : { host }),
		...(socket === undefined ? {} : { socket }),
		port,
		user,
		password,
		database,
		...(schema === undefined ? {} : { schema }),
		...(encrypt === undefined ? {} : { encrypt }),
		...(trustServerCertificate === undefined ? {} : { trustServerCertificate }),
	});
}

function parseText(text: unknown): Map<string, FlatValue> {
	if (
		typeof text !== "string" || text.length === 0 ||
		Buffer.byteLength(text, "utf8") > DATABASE_PROFILE_MAX_BYTES || UNPAIRED_SURROGATE.test(text)
	) throw new DatabaseProfileError();
	try { return new FlatJsonParser(text).parse(); } catch { throw new DatabaseProfileError(); }
}

/** Parse one resolved atomic pi.database.connection-profile/v1 field. */
export function parseDatabaseProfile(text: unknown): DatabaseProfile {
	return buildProfile(parseText(text), false);
}

/** Parse the legacy plaintext project file without retaining or caching its source text. */
export function parseLegacyDatabaseProfile(text: unknown): DatabaseProfile {
	return buildProfile(parseText(text), true);
}
