import { publicConnectionIdentity, type ConnectionProfile, type DatabaseDialect } from "./config.ts";
import type { DatabaseExecution } from "./manager.ts";

export interface DrizzleToolDetails {
	connection: string;
	dialect?: DatabaseDialect;
	operation: string;
	rowCount?: number;
	rowsReturned?: number;
	rowsDisplayed?: number;
	affectedRows?: number;
	changedRows?: number;
	lastInsertId?: string | number;
	columns?: string[];
	warningCount?: number;
	durationMs?: number;
	rowsTruncated?: boolean;
	cellsTruncated?: number;
	outputTruncated?: boolean;
	configured?: boolean;
	available?: boolean;
	allowWrites?: boolean;
	confirmWrites?: boolean;
	source?: string;
	target?: string;
	fingerprint?: string;
	timeoutMs?: number;
	notices?: string[];
}

const MAX_CELL_BYTES = 8 * 1024;
const MAX_NESTED_ITEMS = 100;

function truncateUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
	if (Buffer.byteLength(value, "utf8") <= maxBytes) return { text: value, truncated: false };
	let end = Math.min(value.length, maxBytes);
	let text = value.slice(0, end);
	while (text && (Buffer.byteLength(text, "utf8") > maxBytes || /[\uD800-\uDBFF]$/.test(text))) text = text.slice(0, -1);
	return { text: `${text}…`, truncated: true };
}

function normalizeValue(value: unknown, state: { truncated: number; seen: WeakSet<object> }, depth = 0): unknown {
	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "string") {
		const result = truncateUtf8(value, MAX_CELL_BYTES);
		if (result.truncated) state.truncated++;
		return result.text;
	}
	if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "undefined") return null;
	if (value instanceof Date) return value.toISOString();
	if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
		const bytes = Buffer.from(value);
		if (bytes.byteLength > MAX_CELL_BYTES) {
			state.truncated++;
			return `<binary ${bytes.byteLength} bytes>`;
		}
		return `base64:${bytes.toString("base64")}`;
	}
	if (typeof value !== "object") return String(value);
	if (state.seen.has(value)) return "[circular]";
	if (depth >= 6) {
		state.truncated++;
		return "[nested value truncated]";
	}
	state.seen.add(value);
	if (Array.isArray(value)) {
		const items = value.slice(0, MAX_NESTED_ITEMS).map((item) => normalizeValue(item, state, depth + 1));
		if (value.length > items.length) {
			state.truncated++;
			items.push(`[${value.length - items.length} more items]`);
		}
		return items;
	}
	const result: Record<string, unknown> = Object.create(null);
	const entries = Object.entries(value).slice(0, MAX_NESTED_ITEMS);
	for (const [key, item] of entries) {
		const normalizedKey = truncateUtf8(key, 512);
		if (normalizedKey.truncated) state.truncated++;
		let uniqueKey = normalizedKey.text;
		let suffix = 2;
		while (Object.prototype.hasOwnProperty.call(result, uniqueKey)) uniqueKey = `${normalizedKey.text} (${suffix++})`;
		result[uniqueKey] = normalizeValue(item, state, depth + 1);
	}
	if (Object.keys(value).length > entries.length) {
		state.truncated++;
		result["…"] = `${Object.keys(value).length - entries.length} more fields`;
	}
	return result;
}

export function formatExecution(
	profile: ConnectionProfile,
	operation: string,
	execution: DatabaseExecution,
	maxRows: number,
): { text: string; details: DrizzleToolDetails } {
	const rowsReturned = execution.rows.length;
	const shownRows = execution.rows.slice(0, maxRows);
	const state = { truncated: 0, seen: new WeakSet<object>() };
	const normalizedRows = shownRows.map((row) => normalizeValue(row, state));
	const rowsTruncated = rowsReturned > shownRows.length;
	const identity = publicConnectionIdentity(profile);
	const safeColumns = execution.columns.slice(0, 200).map((column) => truncateUtf8(column.replace(/[\u0000-\u001F\u007F]/g, " "), 512).text);
	const safeCommand = execution.command?.replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 100);
	const details: DrizzleToolDetails = {
		connection: profile.name,
		dialect: execution.dialect,
		operation: safeCommand || operation.toUpperCase(),
		target: identity.target,
		fingerprint: identity.fingerprint,
		rowCount: execution.rowCount,
		rowsReturned,
		rowsDisplayed: shownRows.length,
		affectedRows: execution.affectedRows,
		changedRows: execution.changedRows,
		lastInsertId: execution.lastInsertId,
		columns: safeColumns,
		warningCount: execution.warningCount,
		durationMs: execution.durationMs,
		rowsTruncated,
		cellsTruncated: state.truncated,
	};
	const lines = [
		`Connection: ${profile.name} (${execution.dialect})`,
		`Operation: ${details.operation}`,
	];
	if (rowsReturned > 0) {
		lines.push(`Rows returned: ${rowsReturned}${rowsTruncated ? ` (showing first ${shownRows.length})` : ""}`);
		if (safeColumns.length > 0) lines.push(`Columns: ${safeColumns.map((column) => JSON.stringify(column)).join(", ")}`);
		lines.push("", JSON.stringify(normalizedRows, null, 2));
	} else {
		lines.push("Rows returned: 0");
	}
	if (execution.affectedRows !== undefined) lines.push(`Affected rows: ${execution.affectedRows}`);
	if (execution.changedRows !== undefined) lines.push(`Changed rows: ${execution.changedRows}`);
	if (execution.lastInsertId !== undefined) lines.push(`Last insert id: ${execution.lastInsertId}`);
	if (execution.warningCount) lines.push(`Warnings: ${execution.warningCount}`);
	if (state.truncated > 0) lines.push(`Cell values truncated: ${state.truncated}`);
	if (rowsTruncated) lines.push("Result rows were truncated; refine the query or increase maxRows (maximum 1000).");
	lines.push(`Duration: ${execution.durationMs}ms`);
	return { text: lines.join("\n"), details };
}

export function publicConnectionDetails(profile: ConnectionProfile): DrizzleToolDetails {
	const identity = publicConnectionIdentity(profile);
	return {
		connection: profile.name,
		dialect: profile.dialect,
		target: identity.target,
		fingerprint: identity.fingerprint,
		operation: "connection",
		configured: true,
		available: profile.available,
		allowWrites: profile.allowWrites,
		confirmWrites: profile.confirmWrites,
		timeoutMs: profile.timeoutMs,
		source: profile.source,
	};
}
