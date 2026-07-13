import { Buffer } from "node:buffer";
import { PublicError, sanitizeMetadataId, sanitizeMetadataString } from "./safety.ts";

export type MetadataKind = "projects" | "secrets";

interface ProjectMetadata {
	id: string;
	name: string;
}

interface SecretMetadata {
	id: string;
	key: string;
}

export interface MetadataListResult {
	operation: "list_project_metadata" | "list_secret_metadata";
	items: Array<ProjectMetadata | SecretMetadata>;
	returned: number;
	truncated: boolean;
	notice: string;
}

export interface MetadataToolDetails {
	operation: MetadataListResult["operation"];
	returned: number;
	truncated: boolean;
}

export interface MetadataToolResult {
	content: Array<{ type: "text"; text: string }>;
	details: MetadataToolDetails;
}

const MAX_RESPONSE_ITEMS_SCANNED = 200;
const MAX_OUTPUT_BYTES = 32 * 1024;
const MAX_OUTPUT_LINES = 500;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	try {
		const prototype = Object.getPrototypeOf(value);
		return prototype === Object.prototype || prototype === null;
	} catch {
		return false;
	}
}

function readOwnDataProperty(value: unknown, key: string): unknown {
	if (!isPlainRecord(value)) return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !("value" in descriptor)) return undefined;
		return descriptor.value;
	} catch {
		return undefined;
	}
}

function readArrayItem(value: unknown[], index: number): unknown {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		if (!descriptor || !("value" in descriptor)) return undefined;
		return descriptor.value;
	} catch {
		return undefined;
	}
}

function containsRedactionValue(value: unknown, redactionValue: string): boolean {
	return typeof value === "string" && value.includes(redactionValue);
}

function mapItem(
	kind: MetadataKind,
	value: unknown,
	redactionValue: string,
): ProjectMetadata | SecretMetadata | undefined {
	const rawId = readOwnDataProperty(value, "id");
	const id = sanitizeMetadataId(rawId);
	if (id === undefined || containsRedactionValue(rawId, redactionValue)) return undefined;

	if (kind === "projects") {
		const rawName = readOwnDataProperty(value, "name");
		const name = sanitizeMetadataString(rawName);
		if (
			name === undefined ||
			containsRedactionValue(rawName, redactionValue) ||
			containsRedactionValue(name, redactionValue)
		) {
			return undefined;
		}
		return { id, name };
	}

	const rawKey = readOwnDataProperty(value, "key");
	const key = sanitizeMetadataString(rawKey);
	if (
		key === undefined ||
		containsRedactionValue(rawKey, redactionValue) ||
		containsRedactionValue(key, redactionValue)
	) {
		return undefined;
	}
	return { id, key };
}

export function formatMetadataList(
	kind: MetadataKind,
	response: unknown,
	limit: number,
	redactionValue: string,
): MetadataListResult {
	if (typeof redactionValue !== "string" || redactionValue.length === 0) throw new PublicError("response");
	const data = readOwnDataProperty(response, "data");
	if (!Array.isArray(data)) throw new PublicError("response");

	const items: Array<ProjectMetadata | SecretMetadata> = [];
	const scanLimit = Math.min(data.length, MAX_RESPONSE_ITEMS_SCANNED);
	let omitted = false;

	for (let index = 0; index < scanLimit && items.length < limit; index += 1) {
		const item = mapItem(kind, readArrayItem(data, index), redactionValue);
		if (item === undefined) {
			omitted = true;
			continue;
		}
		items.push(item);
	}

	const operation = kind === "projects" ? "list_project_metadata" : "list_secret_metadata";
	const result: MetadataListResult = {
		operation,
		items,
		returned: items.length,
		truncated: omitted || data.length > items.length,
		notice:
			kind === "projects"
				? "Project metadata was disclosed; no secret-value API was used."
				: "Secret identifier metadata was disclosed; no secret-value field was requested or emitted.",
	};

	const serialized = JSON.stringify(result);
	if (Buffer.byteLength(serialized, "utf8") > MAX_OUTPUT_BYTES || serialized.split("\n").length > MAX_OUTPUT_LINES) {
		throw new PublicError("response");
	}
	return result;
}

export function buildMetadataToolResult(
	kind: MetadataKind,
	response: unknown,
	limit: number,
	redactionValue: string,
): MetadataToolResult {
	const result = formatMetadataList(kind, response, limit, redactionValue);
	return {
		content: [{ type: "text", text: JSON.stringify(result) }],
		details: {
			operation: result.operation,
			returned: result.returned,
			truncated: result.truncated,
		},
	};
}
