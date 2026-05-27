/**
 * Split Pi web-fetch extension (local fork of pi-web-access).
 *
 * Registers fetch_content for URL/page/PDF/GitHub/YouTube/local-video extraction.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { fetchAllContent, type ExtractedContent } from "./web-access/extract.js";
import { formatSeconds } from "./web-access/utils.js";
import { generateId, storeResult, type StoredSearchData } from "./web-access/storage.js";

const MAX_INLINE_CONTENT = 30000;

function stripThumbnails(results: ExtractedContent[]): ExtractedContent[] {
	return results.map(({ thumbnail, frames, ...rest }) => rest);
}

export default function webFetchExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "fetch_content",
		label: "Fetch Content",
		description: "Fetch URL(s) and extract readable content as markdown. Supports YouTube video transcripts (with thumbnail), GitHub repository contents, and local video files (with frame thumbnail). Video frames can be extracted via timestamp/range or sampled across the entire video with frames alone. Falls back to Gemini for pages that block bots or fail Readability extraction. For YouTube and video files: ALWAYS pass the user's specific question via the prompt parameter — this directs the AI to focus on that aspect of the video, producing much better results than a generic extraction. Content is always stored and can be retrieved with get_search_content.",
		promptSnippet:
			"Use to extract readable content from URL(s), YouTube, GitHub repos, or local videos. For video questions, pass the user's exact question in prompt.",
		parameters: Type.Object({
			url: Type.Optional(Type.String({ description: "Single URL to fetch" })),
			urls: Type.Optional(Type.Array(Type.String(), { description: "Multiple URLs (parallel)" })),
			forceClone: Type.Optional(Type.Boolean({
				description: "Force cloning large GitHub repositories that exceed the size threshold",
			})),
			prompt: Type.Optional(Type.String({
				description: "Question or instruction for video analysis (YouTube and video files). Pass the user's specific question here — e.g. 'describe the book shown at the advice for beginners section'. Without this, a generic transcript extraction is used which may miss what the user is asking about.",
			})),
			timestamp: Type.Optional(Type.String({
				description: "Extract video frame(s) at a timestamp or time range. Single: '1:23:45', '23:45', or '85' (seconds). Range: '23:41-25:00' extracts evenly-spaced frames across that span (default 6). Use frames with ranges to control density; single+frames uses a fixed 5s interval. YouTube requires yt-dlp + ffmpeg; local videos require ffmpeg. Use a range when you know the approximate area but not the exact moment — you'll get a contact sheet to visually identify the right frame.",
			})),
			frames: Type.Optional(Type.Integer({
				minimum: 1,
				maximum: 12,
				description: "Number of frames to extract. Use with timestamp range for custom density, with single timestamp to get N frames at 5s intervals, or alone to sample across the entire video. Requires yt-dlp + ffmpeg for YouTube, ffmpeg for local video.",
			})),
			model: Type.Optional(Type.String({
				description: "Override the Gemini model for video/YouTube analysis (e.g. 'gemini-2.5-flash', 'gemini-3-flash-preview'). Defaults to config or gemini-3-flash-preview.",
			})),
		}),

		async execute(_toolCallId, params, signal, onUpdate) {
			const urlList = params.urls ?? (params.url ? [params.url] : []);
			if (urlList.length === 0) {
				return {
					content: [{ type: "text", text: "Error: No URL provided." }],
					details: { error: "No URL provided" },
				};
			}

			onUpdate?.({
				content: [{ type: "text", text: `Fetching ${urlList.length} URL(s)...` }],
				details: { phase: "fetch", progress: 0 },
			});

			const fetchResults = await fetchAllContent(urlList, signal, {
				forceClone: params.forceClone,
				prompt: params.prompt,
				timestamp: params.timestamp,
				frames: params.frames,
				model: params.model,
			});
			const successful = fetchResults.filter((r) => !r.error).length;
			const totalChars = fetchResults.reduce((sum, r) => sum + r.content.length, 0);

			// ALWAYS store results (even for single URL)
			const responseId = generateId();
			const data: StoredSearchData = {
				id: responseId,
				type: "fetch",
				timestamp: Date.now(),
				urls: stripThumbnails(fetchResults),
			};
			storeResult(responseId, data);
			pi.appendEntry("web-search-results", data);

			// Single URL: return content directly (possibly truncated) with responseId
			if (urlList.length === 1) {
				const result = fetchResults[0];
				if (result.error) {
					return {
						content: [{ type: "text", text: `Error: ${result.error}` }],
						details: { urls: urlList, urlCount: 1, successful: 0, error: result.error, responseId, prompt: params.prompt, timestamp: params.timestamp, frames: params.frames },
					};
				}

				const fullLength = result.content.length;
				const truncated = fullLength > MAX_INLINE_CONTENT;
				let output = truncated
					? result.content.slice(0, MAX_INLINE_CONTENT) + "\n\n[Content truncated...]"
					: result.content;

				if (truncated) {
					output += `\n\n---\nShowing ${MAX_INLINE_CONTENT} of ${fullLength} chars. ` +
						`Use get_search_content({ responseId: "${responseId}", urlIndex: 0 }) for full content.`;
				}

				const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];
				if (result.frames?.length) {
					for (const frame of result.frames) {
						content.push({ type: "image", data: frame.data, mimeType: frame.mimeType });
						content.push({ type: "text", text: `Frame at ${frame.timestamp}` });
					}
				} else if (result.thumbnail) {
					content.push({ type: "image", data: result.thumbnail.data, mimeType: result.thumbnail.mimeType });
				}
				content.push({ type: "text", text: output });

				const imageCount = (result.frames?.length ?? 0) + (result.thumbnail ? 1 : 0);
				return {
					content,
					details: {
						urls: urlList,
						urlCount: 1,
						successful: 1,
						totalChars: fullLength,
						title: result.title,
						responseId,
						truncated,
						hasImage: imageCount > 0,
						imageCount,
						prompt: params.prompt,
						timestamp: params.timestamp,
						frames: params.frames,
						duration: result.duration,
					},
				};
			}

			// Multi-URL: existing behavior (summary + responseId)
			let output = "## Fetched URLs\n\n";
			for (const { url, title, content, error } of fetchResults) {
				if (error) {
					output += `- ${url}: Error - ${error}\n`;
				} else {
					output += `- ${title || url} (${content.length} chars)\n`;
				}
			}
			output += `\n---\nUse get_search_content({ responseId: "${responseId}", urlIndex: 0 }) to retrieve full content.`;

			return {
				content: [{ type: "text", text: output }],
				details: { urls: urlList, urlCount: urlList.length, successful, totalChars, responseId },
			};
		},

		renderCall(args, theme) {
			const { url, urls, prompt, timestamp, frames, model } = args as { url?: string; urls?: string[]; prompt?: string; timestamp?: string; frames?: number; model?: string };
			const urlList = urls ?? (url ? [url] : []);
			if (urlList.length === 0) {
				return new Text(theme.fg("toolTitle", theme.bold("fetch ")) + theme.fg("error", "(no URL)"), 0, 0);
			}
			const lines: string[] = [];
			if (urlList.length === 1) {
				const display = urlList[0].length > 60 ? urlList[0].slice(0, 57) + "..." : urlList[0];
				lines.push(theme.fg("toolTitle", theme.bold("fetch ")) + theme.fg("accent", display));
			} else {
				lines.push(theme.fg("toolTitle", theme.bold("fetch ")) + theme.fg("accent", `${urlList.length} URLs`));
				for (const u of urlList.slice(0, 5)) {
					const display = u.length > 60 ? u.slice(0, 57) + "..." : u;
					lines.push(theme.fg("muted", "  " + display));
				}
				if (urlList.length > 5) {
					lines.push(theme.fg("muted", `  ... and ${urlList.length - 5} more`));
				}
			}
			if (timestamp) {
				lines.push(theme.fg("dim", "  timestamp: ") + theme.fg("warning", timestamp));
			}
			if (typeof frames === "number") {
				lines.push(theme.fg("dim", "  frames: ") + theme.fg("warning", String(frames)));
			}
			if (prompt) {
				const display = prompt.length > 250 ? prompt.slice(0, 247) + "..." : prompt;
				lines.push(theme.fg("dim", "  prompt: ") + theme.fg("muted", `"${display}"`));
			}
			if (model) {
				lines.push(theme.fg("dim", "  model: ") + theme.fg("warning", model));
			}
			return new Text(lines.join("\n"), 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as {
				urlCount?: number;
				successful?: number;
				totalChars?: number;
				error?: string;
				title?: string;
				truncated?: boolean;
				responseId?: string;
				phase?: string;
				progress?: number;
				hasImage?: boolean;
				imageCount?: number;
				prompt?: string;
				timestamp?: string;
				frames?: number;
				duration?: number;
			};

			if (isPartial) {
				const progress = details?.progress ?? 0;
				const bar = "\u2588".repeat(Math.floor(progress * 10)) + "\u2591".repeat(10 - Math.floor(progress * 10));
				return new Text(theme.fg("accent", `[${bar}] ${details?.phase || "fetching"}`), 0, 0);
			}

			if (details?.error) {
				return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			}

			if (details?.urlCount === 1) {
				const title = details?.title || "Untitled";
				const imgCount = details?.imageCount ?? (details?.hasImage ? 1 : 0);
				const imageBadge = imgCount > 1
					? theme.fg("accent", ` [${imgCount} images]`)
					: imgCount === 1
						? theme.fg("accent", " [image]")
						: "";
				let statusLine = theme.fg("success", title) + theme.fg("muted", ` (${details?.totalChars ?? 0} chars)`) + imageBadge;
				if (details?.truncated) {
					statusLine += theme.fg("warning", " [truncated]");
				}
				if (typeof details?.duration === "number") {
					statusLine += theme.fg("muted", ` | ${formatSeconds(Math.floor(details.duration))} total`);
				}
				const textContent = result.content.find((c) => c.type === "text")?.text || "";
				if (!expanded) {
					const brief = textContent.length > 200 ? textContent.slice(0, 200) + "..." : textContent;
					return new Text(statusLine + "\n" + theme.fg("dim", brief), 0, 0);
				}
				const lines = [statusLine];
				if (details?.prompt) {
					const display = details.prompt.length > 250 ? details.prompt.slice(0, 247) + "..." : details.prompt;
					lines.push(theme.fg("dim", `  prompt: "${display}"`));
				}
				if (details?.timestamp) {
					lines.push(theme.fg("dim", `  timestamp: ${details.timestamp}`));
				}
				if (typeof details?.frames === "number") {
					lines.push(theme.fg("dim", `  frames: ${details.frames}`));
				}
				const preview = textContent.length > 500 ? textContent.slice(0, 500) + "..." : textContent;
				lines.push(theme.fg("dim", preview));
				return new Text(lines.join("\n"), 0, 0);
			}

			const countColor = (details?.successful ?? 0) > 0 ? "success" : "error";
			const statusLine = theme.fg(countColor, `${details?.successful}/${details?.urlCount} URLs`) + theme.fg("muted", " (content stored)");
			if (!expanded) {
				return new Text(statusLine, 0, 0);
			}
			const textContent = result.content.find((c) => c.type === "text")?.text || "";
			const preview = textContent.length > 500 ? textContent.slice(0, 500) + "..." : textContent;
			return new Text(statusLine + "\n" + theme.fg("dim", preview), 0, 0);
		},
	});


}
