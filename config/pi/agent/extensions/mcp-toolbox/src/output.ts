export const MAX_OUTPUT_BYTES = 50 * 1024;
export const MAX_OUTPUT_LINES = 2_000;
const ERROR_LIMIT = 2_000;
const NOTICE_RESERVE_BYTES = 640;
const SENSITIVE_KEY = /(?:api[-_ ]?key|authorization|cookie|credential|password|secret|token)/i;

export interface FormattedOutput {
	text: string;
	truncated: boolean;
	totalLines: number;
	totalBytes: number;
	outputLines: number;
	outputBytes: number;
}

/** Preserve useful newlines/tabs while neutralizing terminal and bidi controls. */
export function sanitizeTerminalText(value: string): string {
	return value
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "�")
		.replace(/[\u202A-\u202E\u2066-\u2069]/g, "�");
}

function utf8Head(value: string, maximumBytes: number): string {
	const bytes = Buffer.from(value, "utf8");
	if (bytes.byteLength <= maximumBytes) return value;
	let output = bytes.subarray(0, maximumBytes).toString("utf8");
	if (output.endsWith("�")) output = output.slice(0, -1);
	return output;
}

function sanitizeUrlCandidate(candidate: string): string {
	const suffix = candidate.match(/[),.;\]}]+$/)?.[0] ?? "";
	const raw = suffix ? candidate.slice(0, -suffix.length) : candidate;
	try {
		const url = new URL(raw);
		url.username = "";
		url.password = "";
		for (const key of [...url.searchParams.keys()]) {
			if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, "[redacted]");
		}
		return url.toString() + suffix;
	} catch {
		return candidate;
	}
}

function redactionSentinel(secrets: readonly string[]): string {
	for (const candidate of ["�", "█", "◆", "*"]) {
		if (secrets.every((secret) => !secret.includes(candidate))) return candidate;
	}
	const used = new Set<string>();
	for (const secret of secrets) {
		for (const character of secret) used.add(character);
	}
	for (const [start, end] of [[0xe000, 0xf8ff], [0xf0000, 0xffffd], [0x100000, 0x10fffd]]) {
		for (let codePoint = start; codePoint <= end; codePoint += 1) {
			const candidate = String.fromCodePoint(codePoint);
			if (!used.has(candidate)) return candidate;
		}
	}
	// Production credential bounds make this unreachable: covering every
	// candidate requires more UTF-8 bytes than one invocation can retain.
	return "";
}

function redactKnownValues(value: string, knownSecrets: readonly string[]): string {
	const secrets = [...new Set(knownSecrets.filter((secret) => secret.length > 0))]
		.sort((left, right) => right.length - left.length);
	if (secrets.length === 0) return value;
	const sentinel = redactionSentinel(secrets);
	let output = value;
	// A one-code-point sentinel cannot occur in any configured value, so it
	// prevents removal boundaries from reconstructing a secret without growth.
	for (const secret of secrets) output = output.split(secret).join(sentinel);
	return output;
}

export function redactText(value: string, knownSecrets: readonly string[] = []): string {
	let output = redactKnownValues(value, knownSecrets);
	output = output.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
	output = output.replace(/\b(?:sk|pk|ya29|ghp|github_pat)-?[A-Za-z0-9._-]{12,}\b/g, "[redacted-key]");
	output = output.replace(
		/(\b(?:api[-_ ]?key|authorization|password|secret|token|cookie|credential)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gi,
		"$1[redacted]",
	);
	output = output.replace(/https?:\/\/[^\s<>"']+/gi, sanitizeUrlCandidate);
	// Generic replacements and URL normalization can introduce text equal to a
	// configured value; remove exact values again before any public sink.
	return sanitizeTerminalText(redactKnownValues(output, knownSecrets));
}

function sanitizeJson(value: unknown, knownSecrets: readonly string[], seen: WeakSet<object>, key = ""): unknown {
	if (key && SENSITIVE_KEY.test(key)) return redactText("[redacted]", knownSecrets);
	if (typeof value === "string") return redactText(value, knownSecrets);
	if (typeof value === "bigint") return value.toString();
	if (!value || typeof value !== "object") return value;
	if (seen.has(value)) return "[circular]";
	seen.add(value);
	if (Array.isArray(value)) return value.map((item) => sanitizeJson(item, knownSecrets, seen));
	const output: Record<string, unknown> = Object.create(null);
	let collision = 0;
	for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
		let safeKey = redactText(childKey, knownSecrets);
		while (!safeKey || Object.hasOwn(output, safeKey)) {
			collision += 1;
			safeKey = `[redacted-key-${collision}]`;
		}
		output[safeKey] = sanitizeJson(childValue, knownSecrets, seen, childKey);
	}
	return output;
}

function publicToolText(raw: string, knownSecrets: readonly string[]): string {
	try {
		const parsed = JSON.parse(raw) as unknown;
		return JSON.stringify(sanitizeJson(parsed, knownSecrets, new WeakSet<object>()), null, 2) ?? "null";
	} catch {
		return redactText(raw, knownSecrets);
	}
}

function lineAndByteHead(value: string, maxLines: number, maxBytes: number): string {
	const lineBounded = value.split("\n").slice(0, maxLines).join("\n");
	return utf8Head(lineBounded, maxBytes);
}

export function formatToolboxOutput(
	raw: string,
	knownSecrets: readonly string[] = [],
	limits: { maxLines?: number; maxBytes?: number } = {},
): FormattedOutput {
	const maxLines = limits.maxLines ?? MAX_OUTPUT_LINES;
	const maxBytes = limits.maxBytes ?? MAX_OUTPUT_BYTES;
	const safe = publicToolText(typeof raw === "string" ? raw : String(raw), knownSecrets);
	const totalLines = safe.length === 0 ? 0 : safe.split("\n").length;
	const totalBytes = Buffer.byteLength(safe, "utf8");
	const payloadLines = Math.max(1, maxLines - 2);
	const payloadBytes = Math.max(1, maxBytes - NOTICE_RESERVE_BYTES);
	const truncated = totalLines > payloadLines || totalBytes > payloadBytes;
	let text = truncated ? lineAndByteHead(safe, payloadLines, payloadBytes) : safe;

	if (truncated) {
		const retainedLines = text.length === 0 ? 0 : text.split("\n").length;
		const retainedBytes = Buffer.byteLength(text, "utf8");
		text +=
			`\n\n[MCP Toolbox output truncated: showing ${retainedLines} of ${totalLines} lines ` +
			`(${retainedBytes} of ${totalBytes} bytes). Full output was not persisted.]`;
	}
	text = lineAndByteHead(text, maxLines, maxBytes);
	return {
		text,
		truncated,
		totalLines,
		totalBytes,
		outputLines: text.length === 0 ? 0 : text.split("\n").length,
		outputBytes: Buffer.byteLength(text, "utf8"),
	};
}

export function safeErrorMessage(
	error: unknown,
	options: { prefix?: string; knownSecrets?: readonly string[] } = {},
): string {
	const raw = error instanceof Error
		? error.message
		: typeof error === "string"
			? error
			: "Unknown MCP Toolbox error";
	let message = redactText(raw, options.knownSecrets ?? []).replace(/\s+/g, " ").trim();
	if (!message) message = "MCP Toolbox request failed";
	if (message.length > ERROR_LIMIT) message = `${message.slice(0, ERROR_LIMIT)}…`;
	return options.prefix ? `${options.prefix}: ${message}` : message;
}

const FIXED_RPC_ERROR_PAYLOAD = Object.freeze({
	jsonrpc: "2.0",
	id: 0,
	error: Object.freeze({
		code: -32_000,
		message: "Remote error details were removed",
	}),
});
const MAX_RPC_SANITIZE_DEPTH = 32;
const MAX_RPC_SANITIZE_NODES = 20_000;

class UnsafeRpcPayload extends Error {}

interface RpcSanitizeState {
	knownSecrets: readonly string[];
	seen: WeakSet<object>;
	nodes: number;
}

function sanitizeRpcValue(value: unknown, state: RpcSanitizeState, depth: number, key = ""): unknown {
	state.nodes += 1;
	if (state.nodes > MAX_RPC_SANITIZE_NODES || depth > MAX_RPC_SANITIZE_DEPTH) throw new UnsafeRpcPayload();
	if (key && SENSITIVE_KEY.test(key)) return redactText("[redacted]", state.knownSecrets);
	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "string") return redactText(value, state.knownSecrets);
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new UnsafeRpcPayload();
		return value;
	}
	if (typeof value !== "object" || value === null) throw new UnsafeRpcPayload();
	if (state.seen.has(value)) throw new UnsafeRpcPayload();
	state.seen.add(value);

	let prototype: object | null;
	let descriptors: Record<PropertyKey, PropertyDescriptor>;
	try {
		prototype = Object.getPrototypeOf(value);
		descriptors = Object.getOwnPropertyDescriptors(value);
	} catch {
		throw new UnsafeRpcPayload();
	}

	if (Array.isArray(value)) {
		if (prototype !== Array.prototype) throw new UnsafeRpcPayload();
		const output: unknown[] = [];
		for (let index = 0; index < value.length; index += 1) {
			const descriptor = descriptors[String(index)];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new UnsafeRpcPayload();
			output.push(sanitizeRpcValue(descriptor.value, state, depth + 1));
		}
		for (const property of Reflect.ownKeys(descriptors)) {
			if (property === "length") continue;
			if (typeof property !== "string" || !/^(0|[1-9][0-9]*)$/u.test(property)) throw new UnsafeRpcPayload();
		}
		return Object.freeze(output);
	}
	if (prototype !== Object.prototype && prototype !== null) throw new UnsafeRpcPayload();

	const output: Record<string, unknown> = Object.create(null);
	for (const property of Reflect.ownKeys(descriptors)) {
		if (typeof property !== "string") throw new UnsafeRpcPayload();
		const descriptor = descriptors[property];
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new UnsafeRpcPayload();
		const safeKey = redactText(property, state.knownSecrets);
		if (!safeKey || Object.hasOwn(output, safeKey)) throw new UnsafeRpcPayload();
		output[safeKey] = sanitizeRpcValue(descriptor.value, state, depth + 1, property);
	}
	return Object.freeze(output);
}

/**
 * Clone every successful JSON-RPC payload into bounded data-only structures.
 * If a top-level error or any malformed/cyclic/accessor-backed shape is seen,
 * replace the entire payload so the locked SDK cannot stringify or log it.
 */
export function sanitizeRpcErrorPayload(data: unknown, knownSecrets: readonly string[]): unknown {
	try {
		if (!data || typeof data !== "object" || Array.isArray(data)) return FIXED_RPC_ERROR_PAYLOAD;
		const prototype = Object.getPrototypeOf(data);
		if (prototype !== Object.prototype && prototype !== null) return FIXED_RPC_ERROR_PAYLOAD;
		const descriptors = Object.getOwnPropertyDescriptors(data);
		const errorDescriptor = descriptors.error;
		if (errorDescriptor !== undefined) return FIXED_RPC_ERROR_PAYLOAD;
		return sanitizeRpcValue(data, {
			knownSecrets: [...knownSecrets].sort((left, right) => right.length - left.length),
			seen: new WeakSet<object>(),
			nodes: 0,
		}, 0);
	} catch {
		return FIXED_RPC_ERROR_PAYLOAD;
	}
}
