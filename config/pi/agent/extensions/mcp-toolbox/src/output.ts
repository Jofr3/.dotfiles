import { normalizeToolCatalogRpcPayload } from "./catalog.ts";

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

/** Preserve useful newlines while neutralizing unstable terminal text. */
export function sanitizeTerminalText(value: string): string {
	// A UTF-8 round trip converts lone UTF-16 surrogates before redaction; Pi's
	// terminal/session encoders must not be the first layer to perform it.
	return Buffer.from(value, "utf8").toString("utf8")
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "�")
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
	// The supplementary scalar range contains far more stable code points than
	// all bounded credentials can collectively contain. Scan it as a proof-safe
	// fallback instead of ever using deletion as a replacement.
	for (let codePoint = 0x10000; codePoint <= 0x10fffd; codePoint += 1) {
		if ((codePoint & 0xffff) >= 0xfffe) continue;
		const candidate = String.fromCodePoint(codePoint);
		if (!used.has(candidate)) return candidate;
	}
	// Unreachable under production credential count/byte bounds. Fail closed;
	// deletion or a reused character could reconstruct another credential.
	throw new Error("Credential redaction capacity exceeded");
}

function redactKnownValues(value: string, knownSecrets: readonly string[]): string {
	const secrets = [...new Set(knownSecrets.filter((secret) => secret.length > 0))]
		.sort((left, right) => right.length - left.length);
	if (secrets.length === 0) return value;
	const sentinel = redactionSentinel(secrets);
	let output = value;
	// The sentinel cannot occur in any configured value, so replacement cannot
	// join surrounding text into another credential.
	for (const secret of secrets) output = output.split(secret).join(sentinel);
	return output;
}

function finalizePublicText(value: string, knownSecrets: readonly string[]): string {
	let output = sanitizeTerminalText(value);
	output = redactKnownValues(output, knownSecrets);
	// Session persistence JSON-escapes returned text. If that transform would
	// reconstruct a multi-character credential, return an absent sentinel only.
	const serialized = JSON.stringify(output);
	const collision = knownSecrets.some((secret) => secret.length > 1 && serialized.includes(secret));
	return collision ? redactionSentinel(knownSecrets) : output;
}

function framePublicText(
	value: string,
	knownSecrets: readonly string[],
	maximumCodeUnits?: number,
): string {
	let output = finalizePublicText(value, knownSecrets);
	if (!knownSecrets.some((secret) => secret.length > 0)) return output;
	const sentinel = redactionSentinel(knownSecrets);
	if (maximumCodeUnits !== undefined) {
		output = output.slice(0, Math.max(0, maximumCodeUnits - (2 * sentinel.length)));
		output = finalizePublicText(output, knownSecrets);
	}
	// Pi adds a tool-result/session JSON envelope after this extension returns.
	// An absent scalar on both boundaries prevents fixed envelope text from
	// joining secret-derived output into a complete credential.
	return `${sentinel}${output}${sentinel}`;
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
	// Every transform can create text equal to a configured value. Terminal
	// normalization runs before the final exact-value pass so replacing a
	// control with U+FFFD cannot reconstruct a credential at a public sink.
	return finalizePublicText(output, knownSecrets);
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
		const serialized = JSON.stringify(sanitizeJson(parsed, knownSecrets, new WeakSet<object>()), null, 2) ?? "null";
		// JSON escaping is itself a transform and can turn a near-match into a
		// credential value (for example a tab into the two characters "\\t").
		return redactText(serialized, knownSecrets);
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
	// Truncation plus the generated notice can create a value across their
	// boundary, and session persistence adds a JSON envelope around final text.
	if (knownSecrets.some((secret) => secret.length > 0)) {
		const sentinel = redactionSentinel(knownSecrets);
		const payloadBudget = Math.max(0, maxBytes - (2 * Buffer.byteLength(sentinel, "utf8")));
		text = lineAndByteHead(finalizePublicText(text, knownSecrets), maxLines, payloadBudget);
		text = `${sentinel}${finalizePublicText(text, knownSecrets)}${sentinel}`;
	} else {
		text = finalizePublicText(text, knownSecrets);
	}
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
	const prefixed = options.prefix ? `${options.prefix}: ${message}` : message;
	// Whitespace folding, truncation, and prefixing occur after redactText and
	// can reconstruct a credential across transformed boundaries.
	return framePublicText(prefixed, options.knownSecrets ?? [], ERROR_LIMIT + 1);
}

function fixedRpcErrorPayload(knownSecrets: readonly string[]): object {
	return Object.freeze({
		jsonrpc: "2.0",
		id: 0,
		error: Object.freeze({
			code: -32_000,
			message: redactionSentinel(knownSecrets),
		}),
	});
}
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
export interface RpcSanitizeOptions {
	expectedProtocolVersion?: string;
	requestMethod?: "initialize" | "notifications/initialized" | "tools/list" | "tools/call";
}

function rpcRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validImplementation(value: unknown): boolean {
	return rpcRecord(value) && typeof value.name === "string" && typeof value.version === "string";
}

function validSuccessfulRpcPayload(value: unknown, options: RpcSanitizeOptions): boolean {
	if (!rpcRecord(value)) return false;
	if (Object.hasOwn(value, "error")) return true;
	if (value.jsonrpc !== "2.0" || (typeof value.id !== "string" && typeof value.id !== "number")) return false;
	if (!rpcRecord(value.result)) return false;
	const result = value.result;
	switch (options.requestMethod) {
		case "initialize": {
			if (
				typeof result.protocolVersion !== "string" ||
				(options.expectedProtocolVersion !== undefined && result.protocolVersion !== options.expectedProtocolVersion) ||
				!rpcRecord(result.capabilities) || !rpcRecord(result.capabilities.tools) ||
				!validImplementation(result.serverInfo)
			) return false;
			return result.instructions === undefined || result.instructions === null || typeof result.instructions === "string";
		}
		case "tools/list": {
			if (!Array.isArray(result.tools)) return false;
			return result.tools.every((tool) => rpcRecord(tool) && typeof tool.name === "string" &&
				(tool.description === undefined || tool.description === null || typeof tool.description === "string") &&
				rpcRecord(tool.inputSchema));
		}
		case "tools/call": {
			if (!Array.isArray(result.content)) return false;
			if (result.isError !== undefined && typeof result.isError !== "boolean") return false;
			return result.content.every((content) => rpcRecord(content) && content.type === "text" && typeof content.text === "string");
		}
		case "notifications/initialized":
			return true;
		default:
			return false;
	}
}

export function sanitizeRpcErrorPayload(
	data: unknown,
	knownSecrets: readonly string[],
	options: RpcSanitizeOptions = {},
): unknown {
	const fixed = (): object => fixedRpcErrorPayload(knownSecrets);
	try {
		const candidate = options.requestMethod === "tools/list"
			? normalizeToolCatalogRpcPayload(data)
			: data;
		if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return fixed();
		const prototype = Object.getPrototypeOf(candidate);
		if (prototype !== Object.prototype && prototype !== null) return fixed();
		const descriptors = Object.getOwnPropertyDescriptors(candidate);
		const errorDescriptor = descriptors.error;
		if (errorDescriptor !== undefined) return fixed();
		const orderedSecrets = [...knownSecrets].sort((left, right) => right.length - left.length);
		const sanitized = sanitizeRpcValue(candidate, {
			knownSecrets: orderedSecrets,
			seen: new WeakSet<object>(),
			nodes: 0,
		}, 0);
		// The locked SDK may stringify validation failures. Reject the entire
		// payload if JSON escaping could reconstruct any credential value.
		const serialized = JSON.stringify(sanitized);
		if (orderedSecrets.some((secret) => secret.length > 0 && serialized.includes(secret))) {
			throw new UnsafeRpcPayload();
		}
		if (
			options.expectedProtocolVersion !== undefined &&
			(options.requestMethod === undefined || !validSuccessfulRpcPayload(sanitized, options))
		) throw new UnsafeRpcPayload();
		return sanitized;
	} catch {
		return fixed();
	}
}
