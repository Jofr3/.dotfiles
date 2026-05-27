/**
 * Web Search Extension
 *
 * Dependency-free web search for Pi. Inspired by nicobailon/pi-web-access:
 * multi-provider fallback, batch queries, domain/recency hints, compact TUI
 * rendering, and strict truncation with full output saved to temp files.
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
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

type SearchProvider = "auto" | "brave" | "exa" | "duckduckgo";
type ResolvedProvider = Exclude<SearchProvider, "auto">;
type RecencyFilter = "day" | "week" | "month" | "year";

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

interface QuerySearchResult {
	query: string;
	provider?: ResolvedProvider;
	results: SearchResult[];
	error?: string;
}

interface WebSearchConfig {
	braveApiKey?: unknown;
	provider?: unknown;
}

interface TruncatedText {
	text: string;
	truncated: boolean;
	fullOutputPath?: string;
	totalLines: number;
	outputLines: number;
}

const CONFIG_PATH = join(homedir(), ".pi", "web-search.json");
const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/";
const DEFAULT_TIMEOUT_MS = 45_000;
const USER_AGENT =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

let cachedConfig: WebSearchConfig | null = null;

function loadConfig(): WebSearchConfig {
	if (cachedConfig) return cachedConfig;
	if (!existsSync(CONFIG_PATH)) {
		cachedConfig = {};
		return cachedConfig;
	}
	try {
		cachedConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as WebSearchConfig;
		return cachedConfig;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to parse ${CONFIG_PATH}: ${message}`);
	}
}

function normalizeApiKey(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const key = value.trim();
	return key.length > 0 ? key : null;
}

function getBraveApiKey(): string | null {
	return normalizeApiKey(process.env.BRAVE_SEARCH_API_KEY) ?? normalizeApiKey(loadConfig().braveApiKey);
}

function normalizeProvider(value: unknown): SearchProvider {
	const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
	if (normalized === "auto" || normalized === "brave" || normalized === "exa" || normalized === "duckduckgo") {
		return normalized;
	}
	return "auto";
}

function normalizeQueryList(query: unknown, queries: unknown): string[] {
	const raw = Array.isArray(queries) ? queries : (query !== undefined ? [query] : []);
	const out: string[] = [];
	for (const item of raw) {
		if (typeof item !== "string") continue;
		const trimmed = item.trim();
		if (trimmed && !out.includes(trimmed)) out.push(trimmed);
	}
	return out;
}

function resultCount(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 5;
	return Math.max(1, Math.min(20, Math.floor(value)));
}

function timeoutSignal(signal: AbortSignal | undefined, ms = DEFAULT_TIMEOUT_MS): AbortSignal {
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
		const dir = await mkdtemp(join(tmpdir(), "pi-web-search-"));
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
	};
	return input.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (match, entity: string) => {
		if (entity[0] === "#") {
			const isHex = entity[1]?.toLowerCase() === "x";
			const value = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
			return Number.isFinite(value) ? String.fromCodePoint(value) : match;
		}
		return named[entity.toLowerCase()] ?? match;
	});
}

function stripHtml(input: string): string {
	return decodeHtmlEntities(input)
		.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
		.replace(/<style\b[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function buildDomainQuery(query: string, domainFilter?: string[]): string {
	if (!domainFilter?.length) return query;
	const terms = domainFilter
		.map((domain) => domain.trim())
		.filter(Boolean)
		.map((domain) => domain.startsWith("-") ? `-site:${domain.slice(1)}` : `site:${domain}`);
	return terms.length ? `${query} ${terms.join(" ")}` : query;
}

function recencyPhrase(filter?: RecencyFilter): string | undefined {
	if (!filter) return undefined;
	return ({ day: "past 24 hours", week: "past week", month: "past month", year: "past year" } as const)[filter];
}

function enrichQuery(query: string, options: { domainFilter?: string[]; recencyFilter?: RecencyFilter }): string {
	let enriched = buildDomainQuery(query, options.domainFilter);
	const recency = recencyPhrase(options.recencyFilter);
	if (recency) enriched += ` ${recency}`;
	return enriched;
}

function normalizeUrl(raw: string): string | null {
	const decoded = decodeHtmlEntities(raw).trim();
	if (!decoded) return null;
	try {
		const url = new URL(decoded, "https://duckduckgo.com");
		if (url.hostname.endsWith("duckduckgo.com")) {
			if (url.pathname === "/l/") {
				const uddg = url.searchParams.get("uddg");
				if (uddg) return normalizeUrl(uddg);
			}
			// DuckDuckGo ad/click-tracking URLs are not useful search results.
			if (url.pathname === "/y.js" || url.searchParams.has("ad_domain")) return null;
		}
		return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
	} catch {
		return null;
	}
}

function dedupeResults(results: SearchResult[], maxResults: number): SearchResult[] {
	const seen = new Set<string>();
	const out: SearchResult[] = [];
	for (const result of results) {
		const url = normalizeUrl(result.url);
		if (!url || seen.has(url)) continue;
		seen.add(url);
		out.push({
			title: result.title.trim() || url,
			url,
			snippet: result.snippet.trim(),
		});
		if (out.length >= maxResults) break;
	}
	return out;
}

async function searchWithBrave(
	query: string,
	options: { numResults: number; recencyFilter?: RecencyFilter; domainFilter?: string[]; signal?: AbortSignal },
): Promise<SearchResult[]> {
	const apiKey = getBraveApiKey();
	if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY or braveApiKey in ~/.pi/web-search.json is not configured.");

	const params = new URLSearchParams();
	params.set("q", buildDomainQuery(query, options.domainFilter));
	params.set("count", String(options.numResults));
	params.set("text_decorations", "false");
	params.set("safesearch", "moderate");
	const freshness = options.recencyFilter ? ({ day: "pd", week: "pw", month: "pm", year: "py" } as const)[options.recencyFilter] : undefined;
	if (freshness) params.set("freshness", freshness);

	const response = await fetch(`${BRAVE_SEARCH_URL}?${params.toString()}`, {
		headers: {
			"Accept": "application/json",
			"User-Agent": "pi-web-search",
			"X-Subscription-Token": apiKey,
		},
		signal: timeoutSignal(options.signal),
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Brave Search error ${response.status}: ${text.slice(0, 300)}`);
	}
	const data = await response.json() as {
		web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
	};
	const results = (data.web?.results ?? []).map((item) => ({
		title: item.title ?? "Untitled",
		url: item.url ?? "",
		snippet: item.description ?? "",
	}));
	return dedupeResults(results, options.numResults);
}

interface ExaMcpRpcResponse {
	result?: {
		content?: Array<{ type?: string; text?: string }>;
		isError?: boolean;
	};
	error?: { code?: number; message?: string };
}

async function callExaMcp(args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
	const response = await fetch(EXA_MCP_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json, text/event-stream",
			"User-Agent": "pi-web-search",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: "web_search_exa", arguments: args },
		}),
		signal: timeoutSignal(signal),
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Exa MCP error ${response.status}: ${text.slice(0, 300)}`);
	}

	const body = await response.text();
	let parsed: ExaMcpRpcResponse | null = null;
	for (const line of body.split("\n")) {
		if (!line.startsWith("data:")) continue;
		const payload = line.slice(5).trim();
		if (!payload) continue;
		try {
			const candidate = JSON.parse(payload) as ExaMcpRpcResponse;
			if (candidate.result || candidate.error) {
				parsed = candidate;
				break;
			}
		} catch {
			// Ignore keepalive/malformed lines.
		}
	}
	if (!parsed) {
		try { parsed = JSON.parse(body) as ExaMcpRpcResponse; } catch {}
	}
	if (!parsed) throw new Error("Exa MCP returned an empty response.");
	if (parsed.error) throw new Error(`Exa MCP error${parsed.error.code ? ` ${parsed.error.code}` : ""}: ${parsed.error.message ?? "unknown"}`);
	if (parsed.result?.isError) {
		const message = parsed.result.content?.find((item) => item.type === "text" && item.text)?.text;
		throw new Error(message ?? "Exa MCP returned an error.");
	}
	const text = parsed.result?.content?.find((item) => item.type === "text" && item.text?.trim())?.text;
	if (!text) throw new Error("Exa MCP returned empty content.");
	return text;
}

function parseExaMcpResults(text: string, maxResults: number): SearchResult[] {
	const blocks = text.split(/(?=^Title:\s+)/m).filter((block) => block.trim().length > 0);
	const parsed: SearchResult[] = [];
	for (const block of blocks) {
		const title = block.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? "";
		const url = block.match(/^URL:\s*(.+)$/m)?.[1]?.trim() ?? "";
		const textStart = block.search(/\n(?:Text|Highlights|Summary):\s*\n?/i);
		let snippet = "";
		if (textStart >= 0) {
			snippet = block.slice(textStart).replace(/^\n?(?:Text|Highlights|Summary):\s*/i, "").trim();
		} else {
			snippet = block.replace(/^Title:.*$/m, "").replace(/^URL:.*$/m, "").trim();
		}
		snippet = snippet.replace(/\n---\s*$/g, "").replace(/\s+/g, " ").slice(0, 800);
		if (url) parsed.push({ title, url, snippet });
	}
	return dedupeResults(parsed, maxResults);
}

async function searchWithExa(
	query: string,
	options: { numResults: number; recencyFilter?: RecencyFilter; domainFilter?: string[]; signal?: AbortSignal },
): Promise<SearchResult[]> {
	const enrichedQuery = enrichQuery(query, options);
	const text = await callExaMcp({
		query: enrichedQuery,
		numResults: options.numResults,
		livecrawl: "fallback",
		type: "auto",
		contextMaxCharacters: 3000,
	}, options.signal);
	const results = parseExaMcpResults(text, options.numResults);
	if (results.length === 0) throw new Error("Exa MCP returned no parseable results.");
	return results;
}

function duckDuckGoDf(filter?: RecencyFilter): string | undefined {
	return filter ? ({ day: "d", week: "w", month: "m", year: "y" } as const)[filter] : undefined;
}

async function searchWithDuckDuckGo(
	query: string,
	options: { numResults: number; recencyFilter?: RecencyFilter; domainFilter?: string[]; signal?: AbortSignal },
): Promise<SearchResult[]> {
	const params = new URLSearchParams();
	params.set("q", buildDomainQuery(query, options.domainFilter));
	const df = duckDuckGoDf(options.recencyFilter);
	if (df) params.set("df", df);

	const response = await fetch(`${DUCKDUCKGO_HTML_URL}?${params.toString()}`, {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept": "text/html,application/xhtml+xml",
			"Accept-Language": "en-US,en;q=0.9",
		},
		signal: timeoutSignal(options.signal),
	});
	if (!response.ok) throw new Error(`DuckDuckGo error ${response.status}: ${response.statusText}`);
	const html = await response.text();
	const results: SearchResult[] = [];
	const linkRe = /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
	const matches = [...html.matchAll(linkRe)];
	for (let i = 0; i < matches.length; i++) {
		const match = matches[i];
		const url = normalizeUrl(match[1]) ?? "";
		const title = stripHtml(match[2]);
		const blockEnd = matches[i + 1]?.index ?? html.length;
		const block = html.slice(match.index ?? 0, blockEnd);
		const snippetRaw = block.match(/<a\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1]
			?? block.match(/<div\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
			?? "";
		const snippet = stripHtml(snippetRaw);
		if (url) results.push({ title, url, snippet });
	}
	const deduped = dedupeResults(results, options.numResults);
	if (deduped.length === 0) throw new Error("DuckDuckGo returned no parseable results.");
	return deduped;
}

async function runProvider(
	provider: ResolvedProvider,
	query: string,
	options: { numResults: number; recencyFilter?: RecencyFilter; domainFilter?: string[]; signal?: AbortSignal },
): Promise<SearchResult[]> {
	if (provider === "brave") return searchWithBrave(query, options);
	if (provider === "exa") return searchWithExa(query, options);
	return searchWithDuckDuckGo(query, options);
}

async function searchOne(
	query: string,
	provider: SearchProvider,
	options: { numResults: number; recencyFilter?: RecencyFilter; domainFilter?: string[]; signal?: AbortSignal },
): Promise<QuerySearchResult> {
	const providers: ResolvedProvider[] = provider === "auto"
		? [getBraveApiKey() ? "brave" : undefined, "exa", "duckduckgo"].filter(Boolean) as ResolvedProvider[]
		: [provider];

	const errors: string[] = [];
	for (const candidate of providers) {
		try {
			const results = await runProvider(candidate, query, options);
			return { query, provider: candidate, results };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.toLowerCase().includes("abort")) throw err;
			errors.push(`${candidate}: ${message}`);
			if (provider !== "auto") break;
		}
	}

	return { query, results: [], error: errors.join("\n") || "No provider returned results." };
}

function formatSearchOutput(results: QuerySearchResult[]): string {
	const lines: string[] = [];
	for (const queryResult of results) {
		lines.push(`## Query: ${queryResult.query}`);
		if (queryResult.provider) lines.push(`Provider: ${queryResult.provider}`);
		lines.push("");
		if (queryResult.error) {
			lines.push(`Error: ${queryResult.error}`);
			lines.push("");
			continue;
		}
		if (queryResult.results.length === 0) {
			lines.push("No results found.");
			lines.push("");
			continue;
		}
		for (let i = 0; i < queryResult.results.length; i++) {
			const result = queryResult.results[i];
			lines.push(`${i + 1}. ${result.title}`);
			lines.push(`   ${result.url}`);
			if (result.snippet) lines.push(`   ${result.snippet}`);
			lines.push("");
		}
	}
	lines.push("---");
	lines.push("Use web_fetch on promising result URLs when source content or exact details are needed.");
	return lines.join("\n").trim();
}

export default function webSearchExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			`Search the web using provider fallback: Brave Search when BRAVE_SEARCH_API_KEY/braveApiKey is configured, then zero-config Exa MCP, then DuckDuckGo HTML. Supports one query or multiple varied queries, recency hints, and site include/exclude filters. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}; if truncated, full output is saved to a temp file.`,
		promptSnippet:
			"Search the web for current information. For research, use 2-4 varied queries and then web_fetch important sources.",
		promptGuidelines: [
			"Use web_search when the user asks for current information, web research, recent changes, or sources outside the local files.",
			"For broad research, call web_search with queries containing 2-4 meaningfully different angles rather than repeating the same query.",
			"After web_search, use web_fetch on authoritative or relevant result URLs before making source-specific claims.",
		],
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "Single search query. For broad research, prefer queries with 2-4 varied angles." })),
			queries: Type.Optional(Type.Array(Type.String(), { description: "Multiple distinct search queries to run sequentially. Vary wording, scope, and sources." })),
			numResults: Type.Optional(Type.Number({ description: "Results per query (default: 5, max: 20)." })),
			recencyFilter: Type.Optional(StringEnum(["day", "week", "month", "year"] as const, { description: "Prefer recent results from the past day/week/month/year." })),
			domainFilter: Type.Optional(Type.Array(Type.String(), { description: "Include domains with 'example.com' or exclude with '-example.com'. Converted to site: filters where needed." })),
			provider: Type.Optional(StringEnum(["auto", "brave", "exa", "duckduckgo"] as const, { description: "Search provider (default: auto)." })),
		}),

		async execute(_toolCallId, params, signal, onUpdate) {
			const queryList = normalizeQueryList(params.query, params.queries);
			if (queryList.length === 0) {
				return {
					content: [{ type: "text", text: "Error: provide query or queries." }],
					details: { error: "No query provided" },
					isError: true,
				};
			}

			let configuredProvider: SearchProvider;
			try {
				configuredProvider = normalizeProvider(params.provider ?? loadConfig().provider);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Error: ${message}` }],
					details: { error: message },
					isError: true,
				};
			}

			const startedAt = Date.now();
			const searchResults: QuerySearchResult[] = [];
			for (let i = 0; i < queryList.length; i++) {
				const query = queryList[i];
				onUpdate?.({
					content: [{ type: "text", text: `Searching ${i + 1}/${queryList.length}: ${query}` }],
					details: { phase: "searching", progress: i / queryList.length, currentQuery: query },
				});
				const result = await searchOne(query, configuredProvider, {
					numResults: resultCount(params.numResults),
					recencyFilter: params.recencyFilter as RecencyFilter | undefined,
					domainFilter: params.domainFilter,
					signal,
				});
				searchResults.push(result);
			}

			const output = formatSearchOutput(searchResults);
			const truncated = await truncateForModel(output);
			const successfulQueries = searchResults.filter((result) => !result.error).length;
			const totalResults = searchResults.reduce((sum, result) => sum + result.results.length, 0);

			return {
				content: [{ type: "text", text: truncated.text }],
				details: {
					queries: queryList,
					queryCount: queryList.length,
					successfulQueries,
					totalResults,
					providers: searchResults.map((result) => result.provider ?? null),
					requestedProvider: configuredProvider,
					elapsedMs: Date.now() - startedAt,
					truncated: truncated.truncated,
					fullOutputPath: truncated.fullOutputPath,
					results: searchResults.map((result) => ({
						query: result.query,
						provider: result.provider,
						resultCount: result.results.length,
						error: result.error,
					})),
				},
				isError: successfulQueries === 0,
			};
		},

		renderCall(args, theme) {
			const queryList = normalizeQueryList(args.query, args.queries);
			let text = theme.fg("toolTitle", theme.bold("web_search "));
			if (queryList.length === 0) return new Text(text + theme.fg("error", "(no query)"), 0, 0);
			if (queryList.length === 1) {
				const display = queryList[0].length > 72 ? `${queryList[0].slice(0, 69)}...` : queryList[0];
				text += theme.fg("accent", `"${display}"`);
			} else {
				text += theme.fg("accent", `${queryList.length} queries`);
			}
			if (args.provider) text += theme.fg("muted", ` via ${args.provider}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as {
				queryCount?: number;
				successfulQueries?: number;
				totalResults?: number;
				truncated?: boolean;
				phase?: string;
				progress?: number;
				currentQuery?: string;
				results?: Array<{ query?: string; provider?: string; resultCount?: number; error?: string }>;
			} | undefined;

			if (isPartial) {
				const progress = Math.max(0, Math.min(1, details?.progress ?? 0));
				const bar = "█".repeat(Math.floor(progress * 10)) + "░".repeat(10 - Math.floor(progress * 10));
				const current = details?.currentQuery ? ` ${details.currentQuery}` : "";
				return new Text(theme.fg("accent", `[${bar}] ${details?.phase ?? "searching"}${current}`), 0, 0);
			}

			if (!details) return new Text(theme.fg("dim", "No details"), 0, 0);
			const ok = details.successfulQueries ?? 0;
			const count = details.queryCount ?? 0;
			const color = ok > 0 ? "success" : "error";
			let text = theme.fg(color, `${ok}/${count} queries, ${details.totalResults ?? 0} results`);
			if (details.truncated) text += theme.fg("warning", " [truncated]");

			if (expanded && details.results?.length) {
				for (const query of details.results.slice(0, 10)) {
					const label = query.query ?? "query";
					if (query.error) text += `\n${theme.fg("error", `✗ ${label}: ${query.error}`)}`;
					else text += `\n${theme.fg("dim", `✓ ${label} · ${query.provider} · ${query.resultCount ?? 0} results`)}`;
				}
			}
			return new Text(text, 0, 0);
		},
	});

}
