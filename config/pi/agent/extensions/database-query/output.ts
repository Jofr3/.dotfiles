import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";
import type { DatabaseProfile } from "./profile.ts";

export const MAX_STDOUT_BYTES = 256 * 1024;
export const MAX_STDERR_BYTES = 64 * 1024;
export const MAX_DISPLAY_ROWS = 200;
export const MAX_DISPLAY_COLUMNS = 100;
export const MAX_CELL_BYTES = 4 * 1024;
export const MAX_MODEL_OUTPUT_BYTES = 32 * 1024;
export const MAX_MODEL_OUTPUT_LINES = 500;

export class DatabaseOutputError extends Error {
	constructor() { super("Database client output was rejected."); }
}

export interface FormattedDatabaseOutput {
	readonly text: string;
	readonly displayedRows: number;
	readonly truncated: boolean;
}

function truncateUtf8(value: string, maximum: number): string {
	if (Buffer.byteLength(value, "utf8") <= maximum) return value;
	let end = Math.min(value.length, maximum);
	while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maximum - 3) end -= 1;
	return `${value.slice(0, end)}...`;
}

function terminalNormalized(value: string): string {
	return value.replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu, "?");
}

function mysqlEscaped(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll("\u0000", "\\0")
		.replaceAll("\n", "\\n")
		.replaceAll("\r", "\\r")
		.replaceAll("\t", "\\t");
}

function redactionVariants(profileText: string | undefined, profile: DatabaseProfile): readonly string[] {
	const candidates = new Set<string>();
	const profileScalars = [
		profileText,
		profile.engine,
		profile.host,
		profile.socket,
		String(profile.port),
		profile.user,
		profile.password,
		profile.database,
		profile.schema,
		profile.encrypt === undefined ? undefined : String(profile.encrypt),
		profile.trustServerCertificate === undefined ? undefined : String(profile.trustServerCertificate),
	];
	for (const value of profileScalars) {
		if (value === undefined || value.length === 0) continue;
		candidates.add(value);
		candidates.add(terminalNormalized(value));
		candidates.add(mysqlEscaped(value));
		try {
			const quoted = JSON.stringify(value);
			candidates.add(quoted);
			if (quoted.length >= 2) candidates.add(quoted.slice(1, -1));
		} catch {
			// The profile parser already rejects malformed strings.
		}
	}
	return Object.freeze([...candidates].filter((value) => value.length > 0).sort((a, b) => b.length - a.length));
}

function redactionSentinel(known: readonly string[]): string {
	for (const candidate of ["[REDACTED]", "�", "█", "◆"]) {
		if (known.every((value) => !value.includes(candidate) && !candidate.includes(value))) return candidate;
	}
	const used = new Set<string>();
	for (const value of known) for (const character of value) used.add(character);
	for (let code = 0xe000; code <= 0xf8ff; code += 1) {
		const candidate = String.fromCodePoint(code);
		if (!used.has(candidate)) return candidate;
	}
	throw new DatabaseOutputError();
}

export function redactProfileSecrets(output: string, profile: DatabaseProfile, profileText?: string): string {
	const known = redactionVariants(profileText, profile);
	if (known.length === 0) return output;
	const sentinel = redactionSentinel(known);
	let redacted = output;
	for (const value of known) redacted = redacted.split(value).join(sentinel);
	// Pi JSON-serializes the returned text. Fail closed if that transform would
	// reconstruct any multi-character profile-derived value.
	const serialized = JSON.stringify(redacted);
	if (known.some((value) => value.length > 1 && serialized.includes(value))) return sentinel;
	return redacted;
}

function decodeOutput(bytes: Buffer): string {
	try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
	catch { throw new DatabaseOutputError(); }
}

export function formatDatabaseOutput(
	bytes: Buffer,
	profile: DatabaseProfile,
	profileText?: string,
): FormattedDatabaseOutput {
	if (bytes.byteLength > MAX_STDOUT_BYTES) throw new DatabaseOutputError();
	let text = redactProfileSecrets(decodeOutput(bytes), profile, profileText);
	text = text
		.replaceAll("\r\n", "\n")
		.replaceAll("\r", "\n")
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\p{Cf}\p{Cs}\u2028\u2029]/gu, "?");
	const physical = text.split("\n");
	if (physical.length > 0 && physical[physical.length - 1] === "") physical.pop();
	if (physical.length === 0) {
		return Object.freeze({ text: "Query executed successfully. No rows returned.", displayedRows: 0, truncated: false });
	}
	let truncated = physical.length > MAX_DISPLAY_ROWS;
	const displayed: string[] = [];
	for (const line of physical.slice(0, MAX_DISPLAY_ROWS)) {
		let cells = line.split("\t");
		if (cells.length > MAX_DISPLAY_COLUMNS) {
			cells = cells.slice(0, MAX_DISPLAY_COLUMNS);
			cells.push("[columns truncated]");
			truncated = true;
		}
		displayed.push(cells.map((cell) => {
			const bounded = truncateUtf8(cell, MAX_CELL_BYTES);
			if (bounded !== cell) truncated = true;
			return bounded;
		}).join("\t"));
	}
	if (truncated) displayed.push("[bounded database output truncated; full output was not persisted]");
	let result = displayed.join("\n");
	if (displayed.length > MAX_MODEL_OUTPUT_LINES) {
		result = displayed.slice(0, MAX_MODEL_OUTPUT_LINES - 1).join("\n") +
			"\n[bounded database output truncated; full output was not persisted]";
		truncated = true;
	}
	if (Buffer.byteLength(result, "utf8") > MAX_MODEL_OUTPUT_BYTES) {
		result = truncateUtf8(result, MAX_MODEL_OUTPUT_BYTES - 80) +
			"\n[bounded database output truncated; full output was not persisted]";
		truncated = true;
	}
	const known = redactionVariants(profileText, profile);
	if (known.length > 0) {
		const sentinel = redactionSentinel(known);
		const framingBytes = (2 * Buffer.byteLength(sentinel, "utf8")) + 2;
		const budget = Math.max(1, MAX_MODEL_OUTPUT_BYTES - framingBytes);
		result = redactProfileSecrets(result, profile, profileText);
		if (Buffer.byteLength(result, "utf8") > budget) {
			result = truncateUtf8(result, budget);
			truncated = true;
		}
		result = `${sentinel}\n${redactProfileSecrets(result, profile, profileText)}\n${sentinel}`;
	}
	return Object.freeze({ text: result, displayedRows: Math.min(physical.length, MAX_DISPLAY_ROWS), truncated });
}
