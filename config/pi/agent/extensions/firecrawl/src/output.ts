import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@earendil-works/pi-coding-agent";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ERROR_LIMIT = 2_000;
const NOTICE_RESERVE_BYTES = 768;
const SENSITIVE_KEY = /(?:api[-_]?key|authorization|cookie|credential|password|secret|token)/i;

export interface FirecrawlOutput {
	text: string;
	truncated: boolean;
	fullOutputPath?: string;
	totalLines: number;
	totalBytes: number;
	outputLines: number;
	outputBytes: number;
}

function sanitizeTerminalText(value: string): string {
	return value
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "�")
		.replace(/[\u202A-\u202E\u2066-\u2069]/g, "�");
}

function sanitizedApiUrl(): string | undefined {
	const raw = process.env.FIRECRAWL_API_URL?.trim();
	if (!raw) return undefined;
	try {
		const url = new URL(raw);
		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
		return url.toString().replace(/\/$/, "");
	} catch {
		return "[configured Firecrawl endpoint]";
	}
}

function sanitizeUrlInError(candidate: string): string {
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

function redactKnownValues(value: string): string {
	let output = value;
	const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
	if (apiKey) output = output.split(apiKey).join("[redacted]");
	const rawApiUrl = process.env.FIRECRAWL_API_URL?.trim();
	if (rawApiUrl) output = output.split(rawApiUrl).join(sanitizedApiUrl() ?? "[configured Firecrawl endpoint]");
	return output
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
		.replace(
			/\b(api[-_ ]?key|authorization|password|secret|token|cookie|credential)\s*[:=]\s*([^\s,;]+)/gi,
			"$1=[redacted]",
		);
}

function publicString(value: string): string {
	return sanitizeTerminalText(redactKnownValues(value));
}

function utf8Head(value: string, maxBytes: number): string {
	const bytes = Buffer.from(value, "utf8");
	if (bytes.byteLength <= maxBytes) return value;
	return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, maxBytes)).replace(/�$/, "");
}

function jsonReplacer() {
	const seen = new WeakSet<object>();
	return (key: string, value: unknown): unknown => {
		if (key && SENSITIVE_KEY.test(key)) return "[redacted]";
		if (typeof value === "bigint") return value.toString();
		if (typeof value === "string") return publicString(value);
		if (value && typeof value === "object") {
			if (seen.has(value)) return "[circular]";
			seen.add(value);
		}
		return value;
	};
}

export function serializeFirecrawlResult(value: unknown): string {
	try {
		return JSON.stringify(value, jsonReplacer(), 2) ?? "null";
	} catch {
		return "[unserializable Firecrawl result]";
	}
}

async function saveSecureOutput(text: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "pi-firecrawl-"));
	await chmod(directory, 0o700);
	const path = join(directory, "output.json");
	await writeFile(path, text, { encoding: "utf8", flag: "wx", mode: 0o600 });
	return path;
}

export async function formatFirecrawlOutput(value: unknown): Promise<FirecrawlOutput> {
	const serialized = serializeFirecrawlResult(value);
	const truncation = truncateHead(serialized, {
		maxLines: Math.max(1, DEFAULT_MAX_LINES - 2),
		maxBytes: Math.max(1, DEFAULT_MAX_BYTES - NOTICE_RESERVE_BYTES),
	});
	let content = truncation.content;
	let fullOutputPath: string | undefined;

	if (truncation.truncated) {
		// Pretty-printed JSON can contain one enormous escaped markdown/HTML line.
		// Keep a byte-safe prefix when line-based truncation retained almost nothing.
		if (Buffer.byteLength(content, "utf8") < 1_024) {
			content = utf8Head(serialized, Math.max(1, DEFAULT_MAX_BYTES - NOTICE_RESERVE_BYTES))
				.split("\n")
				.slice(0, Math.max(1, DEFAULT_MAX_LINES - 2))
				.join("\n");
		}
		const retainedLines = content.length === 0 ? 0 : content.split("\n").length;
		const retainedBytes = Buffer.byteLength(content, "utf8");
		fullOutputPath = await saveSecureOutput(serialized);
		content +=
			`\n\n[Firecrawl output truncated: showing ${retainedLines} of ${truncation.totalLines} lines ` +
			`(${formatSize(retainedBytes)} of ${formatSize(truncation.totalBytes)}). ` +
			`Full redacted output saved to: ${fullOutputPath}]`;
	}

	return {
		text: content,
		truncated: truncation.truncated,
		fullOutputPath,
		totalLines: truncation.totalLines,
		totalBytes: truncation.totalBytes,
		outputLines: content.length === 0 ? 0 : content.split("\n").length,
		outputBytes: Buffer.byteLength(content, "utf8"),
	};
}

export function safeErrorMessage(error: unknown, prefix?: string): string {
	const raw = error instanceof Error
		? error.message
		: typeof error === "string"
			? error
			: "Unknown Firecrawl error";
	let message = redactKnownValues(raw).replace(/https?:\/\/[^\s]+/gi, sanitizeUrlInError);
	message = sanitizeTerminalText(message).replace(/\s+/g, " ").trim();
	if (message.length > ERROR_LIMIT) message = `${message.slice(0, ERROR_LIMIT)}…`;
	return prefix ? `${prefix}: ${message}` : message;
}
