/**
 * Web Fetch Extension
 *
 * Lightweight, dependency-free web content extraction for Pi.
 * Inspired by nicobailon/pi-web-access: browser-like HTTP fetches,
 * markdown extraction, GitHub API handling, Jina Reader fallback, and strict
 * output truncation for model safety.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_MAX_RESPONSE_BYTES = 50 * 1024 * 1024;
const MIN_USEFUL_MARKDOWN_CHARS = 250;
const CONCURRENT_FETCHES = 3;
const JINA_READER_BASE = "https://r.jina.ai/";

const USER_AGENT =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

type FetchFormat = "markdown" | "text" | "html";

interface FetchResult {
	url: string;
	finalUrl: string;
	title: string;
	content: string;
	contentType?: string;
	status?: number;
	source: "http" | "jina" | "github-api";
	error?: string;
	links?: Array<{ text: string; url: string }>;
}

interface GitHubUrlInfo {
	owner: string;
	repo: string;
	ref?: string;
	path?: string;
	type: "root" | "blob" | "tree";
}

interface TruncatedText {
	text: string;
	truncated: boolean;
	fullOutputPath?: string;
	totalLines: number;
	outputLines: number;
}

function timeoutMs(seconds: unknown): number {
	if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return DEFAULT_TIMEOUT_MS;
	return Math.max(1_000, Math.floor(seconds * 1000));
}

function maxResponseBytes(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEFAULT_MAX_RESPONSE_BYTES;
	return Math.max(64 * 1024, Math.min(MAX_MAX_RESPONSE_BYTES, Math.floor(value)));
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
	const timeout = AbortSignal.timeout(ms);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function truncateForModel(text: string): Promise<TruncatedText> {
	const truncation = truncateHead(text, {
		maxLines: DEFAULT_MAX_LINES,
		maxBytes: DEFAULT_MAX_BYTES,
	});

	let result = truncation.content;
	let fullOutputPath: string | undefined;

	if (truncation.truncated) {
		const dir = await mkdtemp(join(tmpdir(), "pi-web-fetch-"));
		fullOutputPath = join(dir, "output.md");
		await writeFile(fullOutputPath, text, "utf8");
		result += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
		result += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
		result += ` Full output saved to: ${fullOutputPath}]`;
	}

	return {
		text: result,
		truncated: truncation.truncated,
		fullOutputPath,
		totalLines: truncation.totalLines,
		outputLines: truncation.outputLines,
	};
}

function decodeHtmlEntities(input: string): string {
	const named: Record<string, string> = {
		amp: "&",
		lt: "<",
		gt: ">",
		quot: '"',
		apos: "'",
		nbsp: " ",
		mdash: "—",
		ndash: "–",
		hellip: "…",
		lsquo: "‘",
		rsquo: "’",
		ldquo: "“",
		rdquo: "”",
	};
	return input.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (_match, entity: string) => {
		if (entity[0] === "#") {
			const isHex = entity[1]?.toLowerCase() === "x";
			const value = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
			return Number.isFinite(value) ? String.fromCodePoint(value) : _match;
		}
		return named[entity.toLowerCase()] ?? _match;
	});
}

function stripTags(input: string): string {
	return decodeHtmlEntities(input)
		.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
		.replace(/<style\b[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/[ \t\f\v]+/g, " ")
		.replace(/\s+\n/g, "\n")
		.trim();
}

function normalizeWhitespace(input: string): string {
	return input
		.replace(/\r\n?/g, "\n")
		.replace(/[\t\f\v]+/g, " ")
		.replace(/\u00a0/g, " ")
		.replace(/[ ]+\n/g, "\n")
		.replace(/\n[ ]+/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function normalizeMarkdown(input: string): string {
	return normalizeWhitespace(input)
		.replace(/ *\*\* */g, "**")
		.replace(/\n-\s+/g, "\n- ")
		.replace(/^(\s*-\s+)/gm, "- ")
		.trim();
}

function safeAbsoluteUrl(href: string, baseUrl: string): string | null {
	const decoded = decodeHtmlEntities(href).trim();
	if (!decoded || decoded.startsWith("#") || /^javascript:/i.test(decoded) || /^mailto:/i.test(decoded)) return null;
	try {
		const url = new URL(decoded, baseUrl);
		return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
	} catch {
		return null;
	}
}

function extractTitleFromHtml(html: string, fallbackUrl: string): string {
	const candidates = [
		html.match(/<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1],
		html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["'][^>]*>/i)?.[1],
		html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1],
		html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1],
	];
	for (const candidate of candidates) {
		const title = stripTags(candidate ?? "");
		if (title) return title.replace(/\s+/g, " ").trim();
	}
	return titleFromUrl(fallbackUrl);
}

function titleFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const file = basename(parsed.pathname.replace(/\/$/, ""));
		return decodeURIComponent(file || parsed.hostname) || url;
	} catch {
		return url;
	}
}

function selectMainHtml(html: string): string {
	const candidates = [
		html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1],
		html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1],
		html.match(/<div\b[^>]*(?:id|class)=["'][^"']*(?:content|article|post|entry|markdown)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
		html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1],
	];
	return candidates.find((candidate) => candidate && stripTags(candidate).length > 100) ?? html;
}

function htmlToMarkdown(html: string, baseUrl: string): string {
	let content = selectMainHtml(html)
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
		.replace(/<style\b[\s\S]*?<\/style>/gi, " ")
		.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
		.replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
		.replace(/<canvas\b[\s\S]*?<\/canvas>/gi, " ")
		.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, " ");

	content = content.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_match, inner: string) => {
		const code = stripTags(inner).replace(/^\s+|\s+$/g, "");
		return code ? `\n\n\`\`\`\n${code}\n\`\`\`\n\n` : "\n\n";
	});

	content = content.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, inner: string) => {
		const text = stripTags(inner).replace(/\s+/g, " ").trim();
		const url = safeAbsoluteUrl(href, baseUrl);
		if (!text && !url) return "";
		if (!url) return text;
		return `[${text || url}](${url})`;
	});

	content = content.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_match, inner: string) => {
		const code = stripTags(inner).replace(/`/g, "\\`");
		return code ? `\`${code}\`` : "";
	});

	for (let level = 6; level >= 1; level--) {
		const re = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi");
		content = content.replace(re, (_match, inner: string) => {
			const text = stripTags(inner).replace(/\s+/g, " ").trim();
			return text ? `\n\n${"#".repeat(level)} ${text}\n\n` : "\n\n";
		});
	}

	content = content
		.replace(/<br\s*\/?\s*>/gi, "\n")
		.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match, inner: string) => {
			const text = stripTags(inner).replace(/\s+/g, " ").trim();
			return text ? `\n- ${text}` : "";
		})
		.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_match, inner: string) => {
			const text = stripTags(inner).replace(/\n+/g, "\n").trim();
			return text ? "\n\n" + text.split("\n").map((line) => `> ${line.trim()}`).join("\n") + "\n\n" : "\n\n";
		})
		.replace(/<\/(p|div|section|article|main|header|footer|tr|table|ul|ol)>/gi, "\n\n")
		.replace(/<\/(td|th)>/gi, " | ")
		.replace(/<[^>]+>/g, " ");

	return normalizeMarkdown(decodeHtmlEntities(content));
}

function htmlToText(html: string): string {
	return normalizeWhitespace(stripTags(selectMainHtml(html)));
}

function extractLinks(html: string, baseUrl: string, maxLinks = 50): Array<{ text: string; url: string }> {
	const links: Array<{ text: string; url: string }> = [];
	const seen = new Set<string>();
	const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
	for (const match of html.matchAll(re)) {
		const url = safeAbsoluteUrl(match[1], baseUrl);
		if (!url || seen.has(url)) continue;
		seen.add(url);
		const text = stripTags(match[2]).replace(/\s+/g, " ").trim();
		links.push({ text: text || url, url });
		if (links.length >= maxLinks) break;
	}
	return links;
}

function appendLinks(content: string, links: Array<{ text: string; url: string }> | undefined): string {
	if (!links?.length) return content;
	const lines = [content.trim(), "", "## Links"];
	for (const link of links) lines.push(`- [${link.text.replace(/[\[\]]/g, "")}](${link.url})`);
	return lines.join("\n");
}

function normalizeInputUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const parsed = new URL(withProtocol);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
		return parsed.toString();
	} catch {
		return null;
	}
}

function parseGitHubUrl(url: string): GitHubUrlInfo | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") return null;
	const segments = parsed.pathname.split("/").filter(Boolean).map((segment) => {
		try { return decodeURIComponent(segment); } catch { return segment; }
	});
	if (segments.length < 2) return null;
	const owner = segments[0];
	const repo = segments[1].replace(/\.git$/, "");
	const action = segments[2];
	const nonCode = new Set(["issues", "pull", "pulls", "discussions", "releases", "wiki", "actions", "settings", "security", "projects"]);
	if (nonCode.has(action?.toLowerCase())) return null;
	if (!action) return { owner, repo, type: "root" };
	if (action !== "blob" && action !== "tree") return null;
	if (!segments[3]) return null;
	return {
		owner,
		repo,
		type: action,
		ref: segments[3],
		path: segments.slice(4).join("/"),
	};
}

function githubHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		"Accept": "application/vnd.github+json",
		"User-Agent": "pi-web-fetch",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

function encodePath(path: string): string {
	return path.split("/").map(encodeURIComponent).join("/");
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
	try {
		const response = await fetch(url, { headers: githubHeaders(), signal });
		if (!response.ok) return null;
		return await response.json() as T;
	} catch {
		return null;
	}
}

function decodeBase64Content(value: string): string {
	return Buffer.from(value.replace(/\s+/g, ""), "base64").toString("utf8");
}

async function fetchGitHubContent(url: string, signal?: AbortSignal): Promise<FetchResult | null> {
	const info = parseGitHubUrl(url);
	if (!info) return null;

	const repoApi = `https://api.github.com/repos/${encodeURIComponent(info.owner)}/${encodeURIComponent(info.repo)}`;
	const ref = info.ref ?? (await fetchJson<{ default_branch?: string }>(repoApi, signal))?.default_branch ?? "main";
	const titlePrefix = `${info.owner}/${info.repo}`;

	if (info.type === "blob" && info.path) {
		const fileApi = `${repoApi}/contents/${encodePath(info.path)}?ref=${encodeURIComponent(ref)}`;
		const file = await fetchJson<{ content?: string; encoding?: string; name?: string; size?: number; html_url?: string }>(fileApi, signal);
		if (!file?.content || file.encoding !== "base64") return null;
		const content = decodeBase64Content(file.content);
		return {
			url,
			finalUrl: file.html_url ?? url,
			title: `${titlePrefix} — ${info.path}`,
			content,
			contentType: "text/plain",
			status: 200,
			source: "github-api",
		};
	}

	const treeApi = `${repoApi}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
	const tree = await fetchJson<{ tree?: Array<{ path?: string; type?: string; size?: number }> }>(treeApi, signal);
	if (!tree?.tree?.length) return null;

	const prefix = info.type === "tree" && info.path ? info.path.replace(/\/+$/, "") : "";
	const entries = tree.tree
		.filter((entry) => entry.path && (!prefix || entry.path === prefix || entry.path.startsWith(`${prefix}/`)))
		.slice(0, 200);

	const lines: string[] = [];
	lines.push(`# ${titlePrefix}${prefix ? ` — ${prefix}` : ""}`);
	lines.push("");
	lines.push(`Source: ${url}`);
	lines.push(`Ref: ${ref}`);
	lines.push("");
	lines.push("## Repository structure");
	if (entries.length === 0) {
		lines.push("No entries found for this path.");
	} else {
		for (const entry of entries) {
			const suffix = entry.type === "tree" ? "/" : entry.size ? ` (${formatSize(entry.size)})` : "";
			lines.push(`- ${entry.path}${suffix}`);
		}
		const totalMatching = tree.tree.filter((entry) => entry.path && (!prefix || entry.path === prefix || entry.path.startsWith(`${prefix}/`))).length;
		if (totalMatching > entries.length) lines.push(`- ... (${totalMatching - entries.length} more entries omitted)`);
	}

	if (info.type === "root") {
		const readme = await fetchJson<{ content?: string; encoding?: string; name?: string; html_url?: string }>(`${repoApi}/readme?ref=${encodeURIComponent(ref)}`, signal);
		if (readme?.content && readme.encoding === "base64") {
			const readmeText = decodeBase64Content(readme.content);
			lines.push("");
			lines.push(`## ${readme.name ?? "README"}`);
			lines.push(readmeText.length > 20_000 ? `${readmeText.slice(0, 20_000)}\n\n[README truncated at 20K chars]` : readmeText);
		}
	}

	return {
		url,
		finalUrl: url,
		title: `${titlePrefix}${prefix ? ` — ${prefix}` : ""}`,
		content: lines.join("\n"),
		contentType: "text/markdown",
		status: 200,
		source: "github-api",
	};
}

function isHtml(contentType: string, text: string): boolean {
	return contentType.includes("text/html") || contentType.includes("application/xhtml+xml") || /<html[\s>]|<article[\s>]|<main[\s>]/i.test(text.slice(0, 5000));
}

function isLikelyPdf(url: string, contentType: string): boolean {
	return contentType.includes("application/pdf") || url.toLowerCase().split(/[?#]/)[0].endsWith(".pdf");
}

async function fetchWithJina(url: string, signal: AbortSignal | undefined, timeout: number): Promise<FetchResult | null> {
	try {
		const response = await fetch(JINA_READER_BASE + url, {
			headers: {
				"Accept": "text/markdown",
				"User-Agent": USER_AGENT,
				"X-No-Cache": "true",
			},
			signal: withTimeout(signal, timeout),
		});
		if (!response.ok) return null;
		const text = await response.text();
		const markdownStart = text.indexOf("Markdown Content:");
		const content = markdownStart >= 0 ? text.slice(markdownStart + "Markdown Content:".length).trim() : text.trim();
		if (content.length < 80) return null;
		const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || content.match(/^#\s+(.+)$/m)?.[1]?.trim() || titleFromUrl(url);
		return {
			url,
			finalUrl: url,
			title,
			content,
			contentType: "text/markdown",
			status: response.status,
			source: "jina",
		};
	} catch {
		return null;
	}
}

async function readResponseText(response: Response, limitBytes: number): Promise<string> {
	const contentLength = response.headers.get("content-length");
	if (contentLength && Number.parseInt(contentLength, 10) > limitBytes) {
		throw new Error(`Response too large (${formatSize(Number.parseInt(contentLength, 10))}; limit ${formatSize(limitBytes)})`);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	if (buffer.byteLength > limitBytes) {
		throw new Error(`Response too large (${formatSize(buffer.byteLength)}; limit ${formatSize(limitBytes)})`);
	}
	return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

async function fetchHttpContent(
	url: string,
	options: { format: FetchFormat; includeLinks: boolean; jinaFallback: boolean; timeoutMs: number; maxBytes: number },
	signal?: AbortSignal,
): Promise<FetchResult> {
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent": USER_AGENT,
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/markdown,text/plain,application/json;q=0.8,*/*;q=0.7",
				"Accept-Language": "en-US,en;q=0.9",
				"Cache-Control": "no-cache",
			},
			redirect: "follow",
			signal: withTimeout(signal, options.timeoutMs),
		});

		const finalUrl = response.url || url;
		const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

		if (!response.ok) {
			const jina = options.jinaFallback ? await fetchWithJina(url, signal, options.timeoutMs) : null;
			if (jina) return jina;
			return { url, finalUrl, title: titleFromUrl(url), content: "", contentType, status: response.status, source: "http", error: `HTTP ${response.status}: ${response.statusText}` };
		}

		if (isLikelyPdf(finalUrl, contentType)) {
			const jina = options.jinaFallback ? await fetchWithJina(finalUrl, signal, options.timeoutMs) : null;
			if (jina) return jina;
			return { url, finalUrl, title: titleFromUrl(finalUrl), content: "", contentType, status: response.status, source: "http", error: "PDF extraction requires a readable text fallback; Jina Reader did not return content." };
		}

		if (/^(image|audio|video)\//.test(contentType) || /application\/(zip|octet-stream|x-tar|gzip)/.test(contentType)) {
			return { url, finalUrl, title: titleFromUrl(finalUrl), content: "", contentType, status: response.status, source: "http", error: `Unsupported content type: ${contentType || "unknown"}` };
		}

		const text = await readResponseText(response, options.maxBytes);
		const html = isHtml(contentType, text);
		let content: string;
		let title: string;
		let links: Array<{ text: string; url: string }> | undefined;

		if (html && options.format !== "html") {
			title = extractTitleFromHtml(text, finalUrl);
			content = options.format === "text" ? htmlToText(text) : htmlToMarkdown(text, finalUrl);
			links = options.includeLinks ? extractLinks(text, finalUrl) : undefined;
			if (options.format === "markdown") content = appendLinks(content, links);

			if (options.jinaFallback && content.length < MIN_USEFUL_MARKDOWN_CHARS) {
				const jina = await fetchWithJina(finalUrl, signal, options.timeoutMs);
				if (jina && jina.content.length > content.length) return jina;
			}
		} else {
			title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || titleFromUrl(finalUrl);
			content = options.format === "html" ? text : normalizeWhitespace(text);
		}

		return { url, finalUrl, title, content, contentType, status: response.status, source: "http", links };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const jina = options.jinaFallback ? await fetchWithJina(url, signal, options.timeoutMs) : null;
		if (jina) return jina;
		return { url, finalUrl: url, title: titleFromUrl(url), content: "", source: "http", error: message };
	}
}

async function fetchOne(
	input: string,
	options: { format: FetchFormat; includeLinks: boolean; jinaFallback: boolean; timeoutMs: number; maxBytes: number },
	signal?: AbortSignal,
): Promise<FetchResult> {
	const url = normalizeInputUrl(input);
	if (!url) {
		return { url: input, finalUrl: input, title: input, content: "", source: "http", error: "Invalid URL. Only http(s) URLs are supported." };
	}

	const github = await fetchGitHubContent(url, signal);
	if (github) return github;

	return fetchHttpContent(url, options, signal);
}

async function mapLimit<T, U>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<U>): Promise<U[]> {
	const results = new Array<U>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await mapper(items[index], index);
		}
	});
	await Promise.all(workers);
	return results;
}

function buildCombinedOutput(results: FetchResult[]): string {
	if (results.length === 1) {
		const result = results[0];
		if (result.error) return `Error fetching ${result.url}: ${result.error}`;
		return `# ${result.title || result.url}\n\nSource: ${result.finalUrl}\nFetched via: ${result.source}\n\n${result.content}`.trim();
	}

	const sections: string[] = ["# Web fetch results", ""];
	for (const result of results) {
		sections.push(`## ${result.title || result.url}`);
		sections.push(`Source: ${result.finalUrl}`);
		sections.push(`Fetched via: ${result.source}`);
		sections.push("");
		if (result.error) {
			sections.push(`Error: ${result.error}`);
		} else {
			sections.push(result.content);
		}
		sections.push("", "---", "");
	}
	return sections.join("\n").replace(/\n---\n\s*$/, "").trim();
}

export default function webFetchExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description:
			`Fetch URL(s) and extract readable content. HTML is converted to markdown/text, GitHub code URLs use the GitHub API, and difficult pages/PDFs can fall back to Jina Reader. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}; if truncated, the full output is saved to a temp file.`,
		promptSnippet:
			"Fetch and extract readable web page content as markdown/text, with GitHub API and Jina Reader fallbacks",
		promptGuidelines: [
			"Use web_fetch after web_search when source-page details, documentation, or article content are needed.",
			"Use web_fetch on GitHub blob/tree/repo URLs to inspect source files or repository structure without scraping rendered HTML.",
		],
		parameters: Type.Object({
			url: Type.Optional(Type.String({ description: "Single http(s) URL to fetch. URLs without a protocol are treated as https://." })),
			urls: Type.Optional(Type.Array(Type.String(), { description: "Multiple URLs to fetch concurrently (max 3 at a time)." })),
			format: Type.Optional(StringEnum(["markdown", "text", "html"] as const, { description: "Output format for HTTP HTML pages (default: markdown)." })),
			includeLinks: Type.Optional(Type.Boolean({ description: "Append up to 50 extracted page links when format is markdown (default: false)." })),
			jinaFallback: Type.Optional(Type.Boolean({ description: "Use https://r.jina.ai/ fallback for blocked, JS-heavy, short, or PDF pages (default: true)." })),
			timeoutSeconds: Type.Optional(Type.Number({ description: "Per-request timeout in seconds (default: 30)." })),
			maxResponseBytes: Type.Optional(Type.Number({ description: `Maximum raw response size to read per URL (default: ${formatSize(DEFAULT_MAX_RESPONSE_BYTES)}, max ${formatSize(MAX_MAX_RESPONSE_BYTES)}).` })),
		}),

		async execute(_toolCallId, params, signal, onUpdate) {
			const urlList = Array.isArray(params.urls) ? params.urls : (params.url ? [params.url] : []);
			const normalizedInputs = urlList.map((url) => typeof url === "string" ? url.trim() : "").filter(Boolean);
			if (normalizedInputs.length === 0) {
				return {
					content: [{ type: "text", text: "Error: provide url or urls." }],
					details: { error: "No URL provided" },
					isError: true,
				};
			}

			const startedAt = Date.now();
			let completed = 0;
			const options = {
				format: (params.format ?? "markdown") as FetchFormat,
				includeLinks: params.includeLinks === true,
				jinaFallback: params.jinaFallback !== false,
				timeoutMs: timeoutMs(params.timeoutSeconds),
				maxBytes: maxResponseBytes(params.maxResponseBytes),
			};

			const results = await mapLimit(normalizedInputs, CONCURRENT_FETCHES, async (input, index) => {
				onUpdate?.({
					content: [{ type: "text", text: `Fetching ${index + 1}/${normalizedInputs.length}: ${input}` }],
					details: { phase: "fetching", progress: completed / normalizedInputs.length, currentUrl: input },
				});
				const result = await fetchOne(input, options, signal);
				completed += 1;
				onUpdate?.({
					content: [{ type: "text", text: `Fetched ${completed}/${normalizedInputs.length}` }],
					details: { phase: "fetching", progress: completed / normalizedInputs.length, currentUrl: input },
				});
				return result;
			});

			const combined = buildCombinedOutput(results);
			const truncated = await truncateForModel(combined);
			const successful = results.filter((result) => !result.error).length;
			const failed = results.length - successful;

			return {
				content: [{ type: "text", text: truncated.text }],
				details: {
					urlCount: results.length,
					successful,
					failed,
					elapsedMs: Date.now() - startedAt,
					format: options.format,
					truncated: truncated.truncated,
					fullOutputPath: truncated.fullOutputPath,
					results: results.map((result) => ({
						url: result.url,
						finalUrl: result.finalUrl,
						title: result.title,
						status: result.status,
						source: result.source,
						contentLength: result.content.length,
						error: result.error,
					})),
				},
				isError: successful === 0,
			};
		},

		renderCall(args, theme) {
			const raw = Array.isArray(args.urls) ? args.urls : (args.url ? [args.url] : []);
			let text = theme.fg("toolTitle", theme.bold("web_fetch "));
			if (raw.length === 0) return new Text(text + theme.fg("error", "(no URL)"), 0, 0);
			if (raw.length === 1) {
				const display = String(raw[0]).length > 72 ? `${String(raw[0]).slice(0, 69)}...` : String(raw[0]);
				text += theme.fg("accent", display);
			} else {
				text += theme.fg("accent", `${raw.length} URLs`);
			}
			if (args.format) text += theme.fg("muted", ` as ${args.format}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as {
				urlCount?: number;
				successful?: number;
				failed?: number;
				truncated?: boolean;
				phase?: string;
				progress?: number;
				currentUrl?: string;
				results?: Array<{ title?: string; finalUrl?: string; source?: string; error?: string; contentLength?: number }>;
			} | undefined;

			if (isPartial) {
				const progress = Math.max(0, Math.min(1, details?.progress ?? 0));
				const bar = "█".repeat(Math.floor(progress * 10)) + "░".repeat(10 - Math.floor(progress * 10));
				const current = details?.currentUrl ? ` ${details.currentUrl}` : "";
				return new Text(theme.fg("accent", `[${bar}] ${details?.phase ?? "fetching"}${current}`), 0, 0);
			}

			if (!details) return new Text(theme.fg("dim", "No details"), 0, 0);
			const color = (details.successful ?? 0) > 0 ? "success" : "error";
			let text = theme.fg(color, `${details.successful ?? 0}/${details.urlCount ?? 0} fetched`);
			if (details.failed) text += theme.fg("warning", ` (${details.failed} failed)`);
			if (details.truncated) text += theme.fg("warning", " [truncated]");

			if (expanded && details.results?.length) {
				for (const item of details.results.slice(0, 12)) {
					const title = item.title || item.finalUrl || "Untitled";
					if (item.error) text += `\n${theme.fg("error", `✗ ${title}: ${item.error}`)}`;
					else text += `\n${theme.fg("dim", `✓ ${title} · ${item.source} · ${item.contentLength ?? 0} chars`)}`;
				}
			}
			return new Text(text, 0, 0);
		},
	});

}
