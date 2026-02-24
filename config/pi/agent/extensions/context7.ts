/**
 * Context7 Extension
 *
 * Provides two tools for querying the Context7 API to retrieve up-to-date
 * library documentation and code examples:
 *
 * - context7_search: Search for libraries by name
 * - context7_docs: Fetch documentation/code snippets for a specific library
 *
 * Requires CONTEXT7_API_KEY environment variable for authenticated access
 * (higher rate limits). Works without it at lower rate limits.
 *
 * Usage:
 *   Place in ~/.pi/agent/extensions/ for auto-discovery.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

const CONTEXT7_API_BASE = "https://context7.com/api";

interface SearchResult {
	id: string;
	title: string;
	description: string;
	totalTokens: number;
	totalSnippets: number;
	stars?: number;
	trustScore?: number;
	benchmarkScore?: number;
	versions?: string[];
}

interface SearchResponse {
	results: SearchResult[];
	error?: string;
}

function getApiKey(): string | undefined {
	return process.env.CONTEXT7_API_KEY;
}

function buildHeaders(): string[] {
	const headers: string[] = [
		"-H", "X-Context7-Source: pi-extension",
	];
	const apiKey = getApiKey();
	if (apiKey) {
		headers.push("-H", `Authorization: Bearer ${apiKey}`);
	}
	return headers;
}

function formatTrustScore(score?: number): string {
	if (score === undefined || score === null) return "Unknown";
	if (score >= 8) return "High";
	if (score >= 5) return "Medium";
	return "Low";
}

export default function context7Extension(pi: ExtensionAPI) {
	// Tool 1: Search for libraries
	pi.registerTool({
		name: "context7_search",
		label: "Context7 Search",
		description: `Search for libraries on Context7 to find their Context7-compatible library IDs. Returns matching libraries with metadata. You MUST call this before context7_docs to get a valid library ID, unless the user provides one directly (format: /org/project).`,
		parameters: Type.Object({
			libraryName: Type.String({ description: "Library or package name to search for (e.g., 'react', 'nextjs', 'express')" }),
			query: Type.String({ description: "The question or task context — used to rank results by relevance" }),
		}),

		async execute(_toolCallId, params, signal) {
			const { libraryName, query } = params;

			const args = [
				"curl", "-sL", "--max-time", "30",
				`${CONTEXT7_API_BASE}/v2/libs/search?query=${encodeURIComponent(query)}&libraryName=${encodeURIComponent(libraryName)}`,
				...buildHeaders(),
			];

			const result = await pi.exec(args[0], args.slice(1), { signal, timeout: 35000 });

			if (result.code !== 0) {
				return {
					content: [{ type: "text", text: `Error searching Context7: ${result.stderr || "curl failed"}` }],
					isError: true,
				};
			}

			let data: SearchResponse;
			try {
				data = JSON.parse(result.stdout);
			} catch {
				return {
					content: [{ type: "text", text: `Failed to parse Context7 response: ${result.stdout.slice(0, 500)}` }],
					isError: true,
				};
			}

			if (data.error) {
				return {
					content: [{ type: "text", text: `Context7 error: ${data.error}` }],
					isError: true,
				};
			}

			if (!data.results || data.results.length === 0) {
				return {
					content: [{ type: "text", text: "No libraries found matching the provided name." }],
					details: { libraryName, query, resultCount: 0 },
				};
			}

			const lines = data.results.map((r, i) => {
				let line = `${i + 1}. ${r.title}\n`;
				line += `   Library ID: ${r.id}\n`;
				line += `   ${r.description}\n`;
				line += `   Snippets: ${r.totalSnippets} | Tokens: ${r.totalTokens}`;
				line += ` | Reputation: ${formatTrustScore(r.trustScore)}`;
				if (r.benchmarkScore !== undefined) line += ` | Benchmark: ${r.benchmarkScore}`;
				if (r.versions && r.versions.length > 0) line += `\n   Versions: ${r.versions.join(", ")}`;
				return line;
			});

			const text = `Found ${data.results.length} libraries:\n\n${lines.join("\n\n")}`;

			return {
				content: [{ type: "text", text }],
				details: { libraryName, query, resultCount: data.results.length },
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("context7_search "));
			text += theme.fg("accent", `"${args.libraryName}"`);
			if (args.query) {
				text += theme.fg("muted", ` — ${args.query}`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);

			const details = result.details as { resultCount?: number } | undefined;
			if (!details || details.resultCount === 0) {
				return new Text(theme.fg("dim", "No libraries found"), 0, 0);
			}

			let text = theme.fg("success", `${details.resultCount} libraries found`);

			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					const lines = content.text.split("\n").slice(0, 30);
					for (const line of lines) {
						text += `\n${theme.fg("dim", line)}`;
					}
				}
			}

			return new Text(text, 0, 0);
		},
	});

	// Tool 2: Fetch documentation context
	pi.registerTool({
		name: "context7_docs",
		label: "Context7 Docs",
		description: `Fetch up-to-date documentation and code examples from Context7 for a specific library. You must call context7_search first to obtain a valid library ID, unless the user provides one directly (format: /org/project). Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		parameters: Type.Object({
			libraryId: Type.String({ description: "Context7-compatible library ID (e.g., '/mongodb/docs', '/vercel/next.js') from context7_search" }),
			query: Type.String({ description: "Specific question or topic to search within the library docs. Be specific." }),
		}),

		async execute(_toolCallId, params, signal) {
			const { libraryId, query } = params;

			const args = [
				"curl", "-sL", "--max-time", "60",
				`${CONTEXT7_API_BASE}/v2/context?query=${encodeURIComponent(query)}&libraryId=${encodeURIComponent(libraryId)}`,
				...buildHeaders(),
			];

			const result = await pi.exec(args[0], args.slice(1), { signal, timeout: 65000 });

			if (result.code !== 0) {
				return {
					content: [{ type: "text", text: `Error fetching Context7 docs: ${result.stderr || "curl failed"}` }],
					isError: true,
				};
			}

			const output = result.stdout;

			if (!output || output.trim().length === 0) {
				return {
					content: [{
						type: "text",
						text: "Documentation not found or not finalized for this library. This might have happened because you used an invalid library ID. Use context7_search to get a valid ID.",
					}],
					details: { libraryId, query, truncated: false },
				};
			}

			// Check if the response is a JSON error
			try {
				const json = JSON.parse(output);
				if (json.error) {
					return {
						content: [{ type: "text", text: `Context7 error: ${json.error}` }],
						isError: true,
					};
				}
			} catch {
				// Not JSON — it's the docs text, which is expected
			}

			// Apply truncation
			const truncation = truncateHead(output, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let resultText = truncation.content;

			if (truncation.truncated) {
				resultText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
				resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
				resultText += ` Request a more specific query to get targeted results.]`;
			}

			return {
				content: [{ type: "text", text: resultText }],
				details: {
					libraryId,
					query,
					truncated: truncation.truncated,
					totalLines: truncation.totalLines,
					outputLines: truncation.outputLines,
				},
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("context7_docs "));
			text += theme.fg("accent", args.libraryId);
			if (args.query) {
				text += theme.fg("muted", ` — "${args.query}"`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Fetching docs..."), 0, 0);

			const details = result.details as {
				truncated?: boolean;
				totalLines?: number;
				outputLines?: number;
			} | undefined;

			if (result.isError) {
				const content = result.content[0];
				return new Text(theme.fg("error", content?.type === "text" ? content.text : "Error"), 0, 0);
			}

			let text = theme.fg("success", "✓ Documentation retrieved");
			if (details?.truncated) {
				text += theme.fg("warning", ` (truncated: ${details.outputLines}/${details.totalLines} lines)`);
			}

			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					const lines = content.text.split("\n").slice(0, 40);
					for (const line of lines) {
						text += `\n${theme.fg("dim", line)}`;
					}
					if (content.text.split("\n").length > 40) {
						text += `\n${theme.fg("muted", "... (expand tool result to see more)")}`;
					}
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
