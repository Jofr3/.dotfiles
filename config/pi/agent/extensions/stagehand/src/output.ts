import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@earendil-works/pi-coding-agent";

const ERROR_LIMIT = 2_000;
const SECRET_ENV_NAMES = [
	"BROWSERBASE_API_KEY",
	"BROWSERBASE_PROJECT_ID",
	"BB_API_KEY",
	"BB_PROJECT_ID",
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"GEMINI_API_KEY",
	"GOOGLE_GENERATIVE_AI_API_KEY",
	"GOOGLE_API_KEY",
	"GOOGLE_VERTEX_AI_API_KEY",
	"AZURE_API_KEY",
	"CEREBRAS_API_KEY",
	"DEEPSEEK_API_KEY",
	"GROQ_API_KEY",
	"MISTRAL_API_KEY",
	"PERPLEXITY_API_KEY",
	"TOGETHER_AI_API_KEY",
	"XAI_API_KEY",
	"AI_GATEWAY_API_KEY",
	"AWS_ACCESS_KEY_ID",
	"AWS_SECRET_ACCESS_KEY",
	"AWS_SESSION_TOKEN",
	"STAGEHAND_MODEL",
	"STAGEHAND_EXECUTABLE_PATH",
	"STAGEHAND_CDP_URL",
	"STAGEHAND_CDP_DISCOVERY_ORIGIN",
	"STAGEHAND_BROWSERBASE_SESSION_ID",
] as const;

const SENSITIVE_KEY = /(?:api[-_]?key|authorization|cookie|password|secret|token|credential|connect[-_]?url|cdp[-_]?(?:url|origin)|(?:session|target|frame)[-_]?(?:id|url)|debug[-_]?url)/i;
const PUBLIC_PRESENCE_KEY = /(?:configured|available|enabled|present)$/i;

export interface CompactText {
	text: string;
	truncated: boolean;
	totalLines: number;
	totalBytes: number;
	outputLines: number;
	outputBytes: number;
}

function utf8Head(value: string, maxBytes: number): string {
	const bytes = Buffer.from(value, "utf8");
	if (bytes.byteLength <= maxBytes) return value;
	let output = bytes.subarray(0, maxBytes).toString("utf8");
	if (output.endsWith("�")) output = output.slice(0, -1);
	return output;
}

/**
 * Make browser-controlled text safe for terminals. Newlines and tabs remain
 * useful to the model; all other C0/C1 controls, ESC, DEL, and bidirectional
 * formatting controls are replaced with visible placeholders.
 */
export function sanitizeTerminalText(value: string): string {
	return value
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "�")
		.replace(/[\u202A-\u202E\u2066-\u2069]/g, "�");
}

function redactKnownValues(value: string, additionalSecrets: readonly (string | undefined)[] = []): string {
	let redacted = value;
	for (const name of SECRET_ENV_NAMES) {
		const secret = process.env[name];
		if (secret && secret.length >= 8) redacted = redacted.split(secret).join("[redacted]");
	}
	for (const secret of additionalSecrets) {
		if (secret && secret.length >= 6) redacted = redacted.split(secret).join("[redacted]");
	}
	return redacted;
}

function sanitizeBrowserOutput(value: string): string {
	return sanitizeTerminalText(redactKnownValues(value));
}

export function compactText(
	raw: string,
	options: { maxLines?: number; maxBytes?: number } = {},
): CompactText {
	const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const sanitized = sanitizeBrowserOutput(raw);
	// Reserve room for the explicit truncation notice so the final text—not just
	// the retained payload—stays within Pi's tool-output limits.
	const payloadMaxLines = Math.max(1, maxLines - 2);
	const payloadMaxBytes = Math.max(1, maxBytes - 512);
	const result = truncateHead(sanitized, { maxLines: payloadMaxLines, maxBytes: payloadMaxBytes });
	let content = result.content;

	// truncateHead intentionally returns no content for one oversized first line.
	// A partial prefix is more useful for model-facing browser output.
	if (result.truncated && result.firstLineExceedsLimit) {
		content = utf8Head(sanitized, Math.max(1, payloadMaxBytes - 64));
	}

	const retainedLines = content.length === 0 ? 0 : content.split("\n").length;
	const retainedBytes = Buffer.byteLength(content, "utf8");
	if (result.truncated) {
		content +=
			`\n\n[Stagehand output truncated: showing ${retainedLines} of ${result.totalLines} lines ` +
			`(${formatSize(retainedBytes)} of ${formatSize(result.totalBytes)}). Full browser output was not persisted.]`;
	}

	// Defensive final bounds in case a future truncation notice grows.
	const final = Buffer.byteLength(content, "utf8") > maxBytes ? utf8Head(content, maxBytes) : content;
	const finalLines = final.length === 0 ? 0 : final.split("\n").slice(0, maxLines).join("\n");
	const bounded = typeof finalLines === "string" ? finalLines : final;

	return {
		text: bounded,
		truncated: result.truncated,
		totalLines: result.totalLines,
		totalBytes: result.totalBytes,
		outputLines: bounded.length === 0 ? 0 : bounded.split("\n").length,
		outputBytes: Buffer.byteLength(bounded, "utf8"),
	};
}

function isSensitiveJsonKey(key: string): boolean {
	return !PUBLIC_PRESENCE_KEY.test(key) && SENSITIVE_KEY.test(key);
}

function jsonReplacer() {
	const seen = new WeakSet<object>();
	return (key: string, value: unknown): unknown => {
		if (isSensitiveJsonKey(key)) return "[redacted]";
		if (typeof value === "bigint") return value.toString();
		if (typeof value === "string" && value.length > 20_000) {
			return `${value.slice(0, 20_000)}…[field truncated]`;
		}
		if (value && typeof value === "object") {
			if (seen.has(value)) return "[circular]";
			seen.add(value);
		}
		return value;
	};
}

export function compactJson(value: unknown): CompactText {
	let serialized: string;
	try {
		serialized = JSON.stringify(value, jsonReplacer(), 2) ?? "null";
	} catch {
		serialized = "[unserializable Stagehand result]";
	}
	return compactText(serialized);
}

export function sanitizePublicUrl(value: string | undefined): string | undefined {
	if (!value) return undefined;
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return `[${url.protocol.replace(":", "")} URL]`;
		}
		const path = url.pathname && url.pathname !== "/" ? "/[path redacted]" : "/";
		return `${url.origin}${path}`;
	} catch {
		return "[invalid or non-public URL]";
	}
}

export function redactText(value: string, additionalSecrets: readonly (string | undefined)[] = []): string {
	let redacted = redactKnownValues(value, additionalSecrets);
	redacted = redacted.replace(
		/\b(api[-_ ]?key|authorization|password|secret|token|cookie|credential|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|session[-_ ]?id|target[-_ ]?id|frame[-_ ]?id)\s*[:=]\s*([^\s,;]+)/gi,
		"$1=[redacted]",
	);
	redacted = redacted.replace(
		/(\b(?:target|session|frame)(?:\s+(?:id|not attached))?\s*[:=(]\s*)[A-Za-z0-9_-]{6,}/gi,
		"$1[redacted]",
	);
	redacted = redacted.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
	redacted = redacted.replace(/\b(?:sk|bb|pk)-[A-Za-z0-9_-]{12,}\b/g, "[redacted-key]");
	redacted = redacted.replace(/\bwss?:\/\/[^\s)\]}]+/gi, "[redacted-websocket-url]");
	redacted = redacted.replace(/https?:\/\/[^\s)\]}]+/gi, (candidate) => sanitizePublicUrl(candidate) ?? "[redacted-url]");
	return sanitizeTerminalText(redacted);
}

export function safeErrorMessage(
	error: unknown,
	prefix?: string,
	additionalSecrets: readonly (string | undefined)[] = [],
): string {
	const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown Stagehand error";
	const normalized = redactText(raw, additionalSecrets).replace(/\s+/g, " ").trim();
	const message = normalized.length > ERROR_LIMIT ? `${normalized.slice(0, ERROR_LIMIT)}…` : normalized;
	return prefix ? `${prefix}: ${message}` : message;
}

export function boundedString(value: unknown, maximum = 4_000): string | undefined {
	if (typeof value !== "string") return undefined;
	const safe = sanitizeBrowserOutput(value);
	return safe.length > maximum ? `${safe.slice(0, maximum)}…` : safe;
}
