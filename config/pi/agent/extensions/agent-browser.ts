/**
 * agent-browser Extension
 *
 * Adds pi tools and slash commands for the agent-browser CLI:
 * - agent_browser_open
 * - agent_browser_snapshot
 * - agent_browser_run
 * - agent_browser_screenshot
 * - agent_browser_eval
 * - agent_browser_batch
 *
 * Docs: https://agent-browser.dev
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
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const DEFAULT_TIMEOUT_MS = 60_000;
const LONG_TIMEOUT_MS = 120_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const NOTIFY_MAX_CHARS = 4_000;

const COMMAND_COMPLETIONS = [
	"open",
	"snapshot",
	"click",
	"dblclick",
	"fill",
	"type",
	"press",
	"keyboard",
	"hover",
	"focus",
	"check",
	"uncheck",
	"select",
	"drag",
	"upload",
	"download",
	"scroll",
	"scrollintoview",
	"wait",
	"screenshot",
	"pdf",
	"eval",
	"get",
	"is",
	"find",
	"set",
	"cookies",
	"storage",
	"network",
	"tab",
	"frame",
	"dialog",
	"console",
	"errors",
	"highlight",
	"inspect",
	"record",
	"trace",
	"profiler",
	"stream",
	"batch",
	"auth",
	"state",
	"profiles",
	"session",
	"doctor",
	"close",
	"--help",
	"--version",
];

interface RunOptions {
	cwd: string;
	signal?: AbortSignal;
	timeoutMs?: number;
}

interface FormattedRunResult {
	code: number;
	stdout: string;
	stderr: string;
	output: string;
	truncated: boolean;
	fullOutputPath?: string;
}

function timeoutMs(value: unknown, fallback = DEFAULT_TIMEOUT_MS): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
	return Math.max(1_000, Math.floor(value * 1000));
}

function hasFlag(args: string[], flag: string): boolean {
	return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

function normalizeArgs(args: unknown): string[] {
	if (!Array.isArray(args)) return [];
	let normalized = args.map((arg) => String(arg)).filter((arg) => arg.length > 0);
	if (normalized[0] === "agent-browser") normalized = normalized.slice(1);
	if (normalized[0] === "npx" && normalized[1] === "agent-browser") normalized = normalized.slice(2);
	return normalized;
}

function withGlobalArgs(
	args: string[],
	options: { session?: string; json?: boolean } = {},
): string[] {
	const globals: string[] = [];
	const session = options.session?.trim();
	if (session && !hasFlag(args, "--session")) globals.push("--session", session);
	if (options.json && !hasFlag(args, "--json")) globals.push("--json");
	return [...globals, ...args];
}

function shellQuote(arg: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg;
	return "'" + arg.replace(/'/g, "'\\''") + "'";
}

function redactArgv(args: string[]): string[] {
	const sensitiveValueFlags = new Set(["--password", "--headers", "--proxy"]);
	const out: string[] = [];
	let redactNext = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (redactNext) {
			out.push("***");
			redactNext = false;
			continue;
		}

		const eqFlag = [...sensitiveValueFlags].find((flag) => arg.startsWith(`${flag}=`));
		if (eqFlag) {
			out.push(`${eqFlag}=***`);
			continue;
		}

		if (sensitiveValueFlags.has(arg)) {
			out.push(arg);
			redactNext = true;
			continue;
		}

		// agent-browser set credentials <user> <pass>
		if (args[0] === "set" && (args[1] === "credentials" || args[1] === "auth") && i >= 3) {
			out.push("***");
			continue;
		}

		out.push(arg);
	}

	return out;
}

function commandText(args: string[]): string {
	return ["agent-browser", ...redactArgv(args)].map(shellQuote).join(" ");
}

function joinOutput(stdout: string, stderr: string, code: number): string {
	const out = stdout.trimEnd();
	const err = stderr.trimEnd();
	if (out && err) return `${out}\n\n[stderr]\n${err}`;
	if (out) return out;
	if (err) return err;
	return code === 0 ? "(agent-browser produced no output)" : `agent-browser exited with code ${code} and no output.`;
}

async function truncateOutput(raw: string): Promise<{
	output: string;
	truncated: boolean;
	fullOutputPath?: string;
}> {
	const truncation = truncateHead(raw, {
		maxLines: DEFAULT_MAX_LINES,
		maxBytes: DEFAULT_MAX_BYTES,
	});

	let output = truncation.content;
	let fullOutputPath: string | undefined;

	if (truncation.truncated) {
		const dir = await mkdtemp(join(tmpdir(), "agent-browser-"));
		fullOutputPath = join(dir, "output.txt");
		await writeFile(fullOutputPath, raw, "utf8");
		output += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
		output += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
		output += ` Full output saved to: ${fullOutputPath}]`;
	}

	return { output, truncated: truncation.truncated, fullOutputPath };
}

async function runAgentBrowser(
	pi: ExtensionAPI,
	args: string[],
	options: RunOptions,
): Promise<FormattedRunResult> {
	try {
		const result = await pi.exec("agent-browser", args, {
			cwd: options.cwd,
			timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			signal: options.signal,
		});
		const raw = joinOutput(result.stdout, result.stderr, result.code);
		const formatted = await truncateOutput(raw);
		return {
			code: result.code,
			stdout: result.stdout,
			stderr: result.stderr,
			output: formatted.output,
			truncated: formatted.truncated,
			fullOutputPath: formatted.fullOutputPath,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const raw = `Failed to execute agent-browser: ${message}`;
		const formatted = await truncateOutput(raw);
		return {
			code: 127,
			stdout: "",
			stderr: raw,
			output: formatted.output,
			truncated: formatted.truncated,
			fullOutputPath: formatted.fullOutputPath,
		};
	}
}

function toolResultForRun(args: string[], result: FormattedRunResult) {
	const prefix = result.code === 0 ? "" : `agent-browser failed (exit ${result.code})\n\n`;
	return {
		content: [{ type: "text" as const, text: prefix + result.output }],
		details: {
			command: commandText(args),
			exitCode: result.code,
			truncated: result.truncated,
			fullOutputPath: result.fullOutputPath,
		},
		isError: result.code !== 0,
	};
}

function parseMaybeJson(text: string): unknown | undefined {
	const trimmed = text.trim();
	if (!trimmed) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
}

function getNestedPath(data: unknown): string | undefined {
	if (!data || typeof data !== "object") return undefined;
	const obj = data as Record<string, any>;
	return obj.data?.path ?? obj.data?.file ?? obj.path ?? obj.file ?? obj.screenshotPath;
}

function mimeFor(path: string, format?: string): string {
	const normalizedFormat = format?.toLowerCase();
	if (normalizedFormat === "jpeg" || normalizedFormat === "jpg") return "image/jpeg";
	if (normalizedFormat === "webp") return "image/webp";
	const ext = extname(path).toLowerCase();
	if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
	if (ext === ".webp") return "image/webp";
	return "image/png";
}

function parseCommandLine(input: string): string[] {
	const args: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaping = false;

	for (const char of input) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}

		if (char === "\\" && quote !== "'") {
			escaping = true;
			continue;
		}

		if ((char === "'" || char === '"') && !quote) {
			quote = char;
			continue;
		}

		if (char === quote) {
			quote = undefined;
			continue;
		}

		if (!quote && /\s/.test(char)) {
			if (current.length > 0) {
				args.push(current);
				current = "";
			}
			continue;
		}

		current += char;
	}

	if (escaping) current += "\\";
	if (quote) throw new Error(`Unclosed ${quote} quote`);
	if (current.length > 0) args.push(current);
	return args;
}

function notifyText(text: string): string {
	if (text.length <= NOTIFY_MAX_CHARS) return text;
	return `${text.slice(0, NOTIFY_MAX_CHARS)}\n\n[truncated notification; use the tool for full output]`;
}

function commandCompletions(prefix: string) {
	const trimmed = prefix.trimStart();
	if (trimmed.includes(" ")) return null;
	return COMMAND_COMPLETIONS
		.filter((command) => command.startsWith(trimmed))
		.map((command) => ({ value: command, label: command }));
}

export default function agentBrowserExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		try {
			const result = await pi.exec("agent-browser", ["--version"], { timeout: 3000, cwd: ctx.cwd });
			if (result.code === 0) {
				ctx.ui.setStatus("agent-browser", ctx.ui.theme.fg("accent", `🌐 ${result.stdout.trim()}`));
			} else {
				ctx.ui.setStatus("agent-browser", ctx.ui.theme.fg("warning", "🌐 agent-browser?"));
			}
		} catch {
			ctx.ui.setStatus("agent-browser", ctx.ui.theme.fg("error", "🌐 agent-browser missing"));
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus("agent-browser", undefined);
	});

	pi.registerTool({
		name: "agent_browser_open",
		label: "Browser Open",
		description:
			"Open/navigate a URL with the agent-browser CLI. The browser session persists across later agent_browser_* tool calls.",
		promptSnippet: "Open web pages with agent-browser and keep a persistent browser session across commands",
		promptGuidelines: [
			"Use agent_browser_open to navigate to a URL before taking an agent_browser_snapshot.",
			"After agent_browser_open or any page-changing action, use agent_browser_snapshot to get fresh @eN refs before interacting.",
		],
		parameters: Type.Object({
			url: Type.String({ description: "URL to open. agent-browser auto-prepends https:// if no protocol is provided." }),
			session: Type.Optional(Type.String({ description: "Optional isolated agent-browser session name." })),
			timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 60)." })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const args = withGlobalArgs(["open", params.url], { session: params.session });
			onUpdate?.({ content: [{ type: "text", text: `Running ${commandText(args)}` }] });
			const result = await runAgentBrowser(pi, args, {
				cwd: ctx.cwd,
				signal,
				timeoutMs: timeoutMs(params.timeoutSeconds),
			});
			return toolResultForRun(args, result);
		},
		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("agent_browser_open "));
			text += theme.fg("accent", args.url ?? "");
			if (args.session) text += theme.fg("muted", ` [${args.session}]`);
			return new Text(text, 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as { exitCode?: number } | undefined;
			if (details?.exitCode) return new Text(theme.fg("error", `Open failed (exit ${details.exitCode})`), 0, 0);
			return new Text(theme.fg("success", "✓ Page opened"), 0, 0);
		},
	});

	pi.registerTool({
		name: "agent_browser_snapshot",
		label: "Browser Snapshot",
		description:
			`Take an agent-browser accessibility snapshot and return compact @eN refs. Defaults to interactive + compact output. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		promptSnippet: "Take accessibility snapshots with stable-for-the-current-page @eN refs for browser interaction",
		promptGuidelines: [
			"Use agent_browser_snapshot before clicking, filling, or otherwise using @eN refs.",
			"Do not reuse @eN refs after navigation, form submit, modal open/close, or dynamic page changes; call agent_browser_snapshot again.",
		],
		parameters: Type.Object({
			interactive: Type.Optional(Type.Boolean({ description: "Only include interactive elements (-i). Defaults to true." })),
			compact: Type.Optional(Type.Boolean({ description: "Remove empty structural elements (-c). Defaults to true." })),
			urls: Type.Optional(Type.Boolean({ description: "Include href URLs for links (-u/--urls)." })),
			depth: Type.Optional(Type.Number({ description: "Limit tree depth (-d)." })),
			selector: Type.Optional(Type.String({ description: "CSS selector to scope the snapshot (-s)." })),
			json: Type.Optional(Type.Boolean({ description: "Return agent-browser JSON output." })),
			session: Type.Optional(Type.String({ description: "Optional isolated agent-browser session name." })),
			timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 60)." })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const snapshotArgs = ["snapshot"];
			if (params.interactive !== false) snapshotArgs.push("-i");
			if (params.compact !== false) snapshotArgs.push("-c");
			if (params.urls) snapshotArgs.push("-u");
			if (typeof params.depth === "number" && Number.isFinite(params.depth) && params.depth > 0) {
				snapshotArgs.push("-d", String(Math.floor(params.depth)));
			}
			if (params.selector) snapshotArgs.push("-s", params.selector);

			const args = withGlobalArgs(snapshotArgs, { session: params.session, json: params.json === true });
			onUpdate?.({ content: [{ type: "text", text: `Running ${commandText(args)}` }] });
			const result = await runAgentBrowser(pi, args, {
				cwd: ctx.cwd,
				signal,
				timeoutMs: timeoutMs(params.timeoutSeconds),
			});
			return toolResultForRun(args, result);
		},
		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("agent_browser_snapshot "));
			text += theme.fg("accent", args.selector ?? "page");
			if (args.session) text += theme.fg("muted", ` [${args.session}]`);
			return new Text(text, 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Snapshotting..."), 0, 0);
			const details = result.details as { exitCode?: number; truncated?: boolean } | undefined;
			if (details?.exitCode) return new Text(theme.fg("error", `Snapshot failed (exit ${details.exitCode})`), 0, 0);
			let text = theme.fg("success", "✓ Snapshot captured");
			if (details?.truncated) text += theme.fg("warning", " (truncated)");
			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					for (const line of content.text.split("\n").slice(0, 30)) text += `\n${theme.fg("dim", line)}`;
				}
			}
			return new Text(text, 0, 0);
		},
	});

	pi.registerTool({
		name: "agent_browser_run",
		label: "Browser CLI",
		description:
			`Execute an arbitrary agent-browser CLI command. Pass argv as an array without the leading \"agent-browser\" (example: [\"click\", \"@e3\"]). Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		promptSnippet: "Run any agent-browser CLI command using an argv array",
		promptGuidelines: [
			"Use agent_browser_run for agent-browser commands that do not have a specialized agent_browser_* tool.",
			"Prefer agent_browser_snapshot for reading pages, agent_browser_screenshot for visual inspection, and agent_browser_eval for complex JavaScript.",
			"For secrets, prefer the agent-browser auth vault and password stdin workflows; do not put passwords directly in command args.",
		],
		parameters: Type.Object({
			args: Type.Array(Type.String(), {
				description: "Arguments after agent-browser, e.g. [\"click\", \"@e3\"] or [\"get\", \"text\", \"@e1\"].",
			}),
			session: Type.Optional(Type.String({ description: "Optional isolated agent-browser session name." })),
			json: Type.Optional(Type.Boolean({ description: "Add global --json unless already present." })),
			timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 60)." })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const baseArgs = normalizeArgs(params.args);
			if (baseArgs.length === 0) {
				return {
					content: [{ type: "text" as const, text: "Error: provide args, e.g. [\"snapshot\", \"-i\"]." }],
					details: { error: true },
					isError: true,
				};
			}

			const args = withGlobalArgs(baseArgs, { session: params.session, json: params.json === true });
			onUpdate?.({ content: [{ type: "text", text: `Running ${commandText(args)}` }] });
			const result = await runAgentBrowser(pi, args, {
				cwd: ctx.cwd,
				signal,
				timeoutMs: timeoutMs(params.timeoutSeconds),
			});
			return toolResultForRun(args, result);
		},
		renderCall(args, theme) {
			const argv = Array.isArray(args.args) ? normalizeArgs(args.args) : [];
			let text = theme.fg("toolTitle", theme.bold("agent_browser_run "));
			text += theme.fg("accent", argv.map(shellQuote).join(" ") || "(no args)");
			if (args.session) text += theme.fg("muted", ` [${args.session}]`);
			return new Text(text, 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Running..."), 0, 0);
			const details = result.details as { exitCode?: number; truncated?: boolean } | undefined;
			let text = details?.exitCode
				? theme.fg("error", `agent-browser failed (exit ${details.exitCode})`)
				: theme.fg("success", "✓ agent-browser completed");
			if (details?.truncated) text += theme.fg("warning", " (truncated)");
			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					for (const line of content.text.split("\n").slice(0, 40)) text += `\n${theme.fg("dim", line)}`;
				}
			}
			return new Text(text, 0, 0);
		},
	});

	pi.registerTool({
		name: "agent_browser_screenshot",
		label: "Browser Screenshot",
		description:
			"Take an agent-browser screenshot. By default returns the saved path and attaches the image when it is not too large.",
		promptSnippet: "Take screenshots through agent-browser and attach the image for visual inspection",
		promptGuidelines: [
			"Use agent_browser_screenshot when visual layout, canvas content, or rendered styling matters more than text snapshots.",
			"Use annotate=true to overlay numbered labels that correspond to @eN refs from agent-browser snapshots.",
		],
		parameters: Type.Object({
			selector: Type.Optional(Type.String({ description: "Optional selector/ref to screenshot instead of the whole viewport." })),
			path: Type.Optional(Type.String({ description: "Optional output file path. If omitted, agent-browser chooses a temp path." })),
			full: Type.Optional(Type.Boolean({ description: "Capture full scroll height (--full)." })),
			annotate: Type.Optional(Type.Boolean({ description: "Overlay numbered labels and legend (--annotate)." })),
			format: Type.Optional(Type.String({ description: "Image format: png or jpeg." })),
			quality: Type.Optional(Type.Number({ description: "JPEG quality 0-100." })),
			screenshotDir: Type.Optional(Type.String({ description: "Default screenshot output directory." })),
			attachImage: Type.Optional(Type.Boolean({ description: "Attach the screenshot image to the tool result. Defaults to true." })),
			session: Type.Optional(Type.String({ description: "Optional isolated agent-browser session name." })),
			timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 60)." })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const format = params.format?.toLowerCase();
			if (format && format !== "png" && format !== "jpeg" && format !== "jpg") {
				return {
					content: [{ type: "text" as const, text: "Error: format must be png or jpeg." }],
					details: { error: true },
					isError: true,
				};
			}

			const screenshotArgs = ["screenshot"];
			if (params.full) screenshotArgs.push("--full");
			if (params.annotate) screenshotArgs.push("--annotate");
			if (params.screenshotDir) screenshotArgs.push("--screenshot-dir", params.screenshotDir);
			if (format) screenshotArgs.push("--screenshot-format", format === "jpg" ? "jpeg" : format);
			if (typeof params.quality === "number" && Number.isFinite(params.quality)) {
				screenshotArgs.push("--screenshot-quality", String(Math.max(0, Math.min(100, Math.floor(params.quality)))));
			}
			if (params.selector) screenshotArgs.push(params.selector);
			if (params.path) screenshotArgs.push(params.path);

			const args = withGlobalArgs(screenshotArgs, { session: params.session, json: true });
			onUpdate?.({ content: [{ type: "text", text: `Running ${commandText(args)}` }] });
			const result = await runAgentBrowser(pi, args, {
				cwd: ctx.cwd,
				signal,
				timeoutMs: timeoutMs(params.timeoutSeconds),
			});

			if (result.code !== 0) return toolResultForRun(args, result);

			const parsed = parseMaybeJson(result.stdout);
			const pathFromJson = getNestedPath(parsed);
			const rawPath = pathFromJson ?? params.path;
			const absolutePath = rawPath ? (isAbsolute(rawPath) ? rawPath : resolve(ctx.cwd, rawPath)) : undefined;
			const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
			let text = absolutePath ? `Screenshot saved to ${absolutePath}.` : result.output;
			if (parsed && result.output.length < 8_000) text += `\n\n${result.output}`;

			if (absolutePath && params.attachImage !== false) {
				try {
					const info = await stat(absolutePath);
					if (info.size <= MAX_IMAGE_BYTES) {
						const image = await readFile(absolutePath);
						content.push({ type: "image", data: image.toString("base64"), mimeType: mimeFor(absolutePath, format) });
					} else {
						text += `\n\n[Image not attached because it is ${formatSize(info.size)}; limit is ${formatSize(MAX_IMAGE_BYTES)}.]`;
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					text += `\n\n[Could not attach screenshot image: ${message}]`;
				}
			}

			content.unshift({ type: "text", text });
			return {
				content,
				details: {
					command: commandText(args),
					exitCode: result.code,
					path: absolutePath,
					attachedImage: content.some((item) => item.type === "image"),
				},
			};
		},
		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("agent_browser_screenshot "));
			text += theme.fg("accent", args.path ?? args.selector ?? "viewport");
			if (args.full) text += theme.fg("muted", " --full");
			if (args.annotate) text += theme.fg("muted", " --annotate");
			return new Text(text, 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as { path?: string; attachedImage?: boolean } | undefined;
			let text = theme.fg("success", "✓ Screenshot captured");
			if (details?.attachedImage) text += theme.fg("accent", " + image");
			if (details?.path) text += theme.fg("dim", ` ${details.path}`);
			return new Text(text, 0, 0);
		},
	});

	pi.registerTool({
		name: "agent_browser_eval",
		label: "Browser Eval",
		description:
			"Run JavaScript in the current agent-browser page. The script is passed with base64 encoding to avoid shell quoting issues.",
		promptSnippet: "Evaluate JavaScript in the current agent-browser page without shell quoting problems",
		promptGuidelines: [
			"Use agent_browser_eval for structured extraction or page checks that are awkward with snapshots/get text.",
			"Do not use agent_browser_eval for destructive page actions unless the user asked for them or simpler click/fill commands are insufficient.",
		],
		parameters: Type.Object({
			script: Type.String({ description: "JavaScript expression or script to evaluate in the page." }),
			json: Type.Optional(Type.Boolean({ description: "Add global --json unless already present." })),
			session: Type.Optional(Type.String({ description: "Optional isolated agent-browser session name." })),
			timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 60)." })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const encoded = Buffer.from(params.script, "utf8").toString("base64");
			const args = withGlobalArgs(["eval", "-b", encoded], { session: params.session, json: params.json === true });
			onUpdate?.({ content: [{ type: "text", text: "Running agent-browser eval -b <base64>" }] });
			const result = await runAgentBrowser(pi, args, {
				cwd: ctx.cwd,
				signal,
				timeoutMs: timeoutMs(params.timeoutSeconds),
			});
			return toolResultForRun([...(params.session ? ["--session", params.session] : []), "eval", "-b", "<base64>"], result);
		},
		renderCall(args, theme) {
			const preview = String(args.script ?? "").replace(/\s+/g, " ").slice(0, 80);
			let text = theme.fg("toolTitle", theme.bold("agent_browser_eval "));
			text += theme.fg("accent", preview || "script");
			return new Text(text, 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as { exitCode?: number } | undefined;
			let text = details?.exitCode
				? theme.fg("error", `Eval failed (exit ${details.exitCode})`)
				: theme.fg("success", "✓ Eval completed");
			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") text += `\n${theme.fg("dim", content.text.slice(0, 2000))}`;
			}
			return new Text(text, 0, 0);
		},
	});

	pi.registerTool({
		name: "agent_browser_batch",
		label: "Browser Batch",
		description:
			"Execute multiple agent-browser commands sequentially with the agent-browser batch command. Each command string excludes the leading agent-browser.",
		promptSnippet: "Run multiple agent-browser commands sequentially in one tool call",
		promptGuidelines: [
			"Use agent_browser_batch for scripted multi-step workflows, but re-snapshot between page-changing actions when you need new @eN refs.",
			"Do not guess @eN refs inside a batch unless they came from the latest snapshot and no intervening command changes the page before use.",
		],
		parameters: Type.Object({
			commands: Type.Array(Type.String(), {
				description: "Command strings after agent-browser, e.g. [\"open example.com\", \"snapshot -i -c\"].",
			}),
			bail: Type.Optional(Type.Boolean({ description: "Stop on first failed command (--bail)." })),
			json: Type.Optional(Type.Boolean({ description: "Add global --json unless already present." })),
			session: Type.Optional(Type.String({ description: "Optional isolated agent-browser session name." })),
			timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 120)." })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const commands = Array.isArray(params.commands)
				? params.commands.map((command: unknown) => String(command)).filter(Boolean)
				: [];
			if (commands.length === 0) {
				return {
					content: [{ type: "text" as const, text: "Error: provide at least one command string." }],
					details: { error: true },
					isError: true,
				};
			}
			const batchArgs = ["batch"];
			if (params.bail) batchArgs.push("--bail");
			batchArgs.push(...commands);
			const args = withGlobalArgs(batchArgs, { session: params.session, json: params.json === true });
			onUpdate?.({ content: [{ type: "text", text: `Running ${commands.length} agent-browser command(s)` }] });
			const result = await runAgentBrowser(pi, args, {
				cwd: ctx.cwd,
				signal,
				timeoutMs: timeoutMs(params.timeoutSeconds, LONG_TIMEOUT_MS),
			});
			return toolResultForRun(args, result);
		},
		renderCall(args, theme) {
			const count = Array.isArray(args.commands) ? args.commands.length : 0;
			let text = theme.fg("toolTitle", theme.bold("agent_browser_batch "));
			text += theme.fg("accent", `${count} command(s)`);
			if (args.bail) text += theme.fg("muted", " --bail");
			return new Text(text, 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as { exitCode?: number } | undefined;
			if (details?.exitCode) return new Text(theme.fg("error", `Batch failed (exit ${details.exitCode})`), 0, 0);
			return new Text(theme.fg("success", "✓ Batch completed"), 0, 0);
		},
	});

	pi.registerCommand("browser", {
		description: "Run an agent-browser command (e.g. /browser snapshot -i -c)",
		getArgumentCompletions: commandCompletions,
		handler: async (rawArgs, ctx) => {
			const raw = rawArgs.trim();
			if (!raw) {
				ctx.ui.notify("Usage: /browser <agent-browser args> (example: /browser snapshot -i -c)", "warning");
				return;
			}

			let args: string[];
			try {
				args = normalizeArgs(parseCommandLine(raw));
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Could not parse args: ${message}`, "error");
				return;
			}

			const result = await runAgentBrowser(pi, args, { cwd: ctx.cwd, timeoutMs: LONG_TIMEOUT_MS });
			const text = `${commandText(args)}\n\n${result.output}`;
			ctx.ui.notify(notifyText(text), result.code === 0 ? "info" : "error");
		},
	});

	pi.registerCommand("browser-close", {
		description: "Close the current agent-browser session (/browser-close --all closes all sessions)",
		handler: async (rawArgs, ctx) => {
			let extra: string[] = [];
			try {
				extra = parseCommandLine(rawArgs.trim());
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Could not parse args: ${message}`, "error");
				return;
			}
			const args = ["close", ...extra];
			const result = await runAgentBrowser(pi, args, { cwd: ctx.cwd, timeoutMs: DEFAULT_TIMEOUT_MS });
			ctx.ui.notify(notifyText(result.output), result.code === 0 ? "info" : "error");
		},
	});

	pi.registerCommand("browser-doctor", {
		description: "Run agent-browser doctor diagnostics (agent-browser 0.26+)",
		handler: async (rawArgs, ctx) => {
			let extra: string[] = [];
			try {
				extra = parseCommandLine(rawArgs.trim());
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Could not parse args: ${message}`, "error");
				return;
			}
			const args = ["doctor", ...extra];
			const result = await runAgentBrowser(pi, args, { cwd: ctx.cwd, timeoutMs: LONG_TIMEOUT_MS });
			let output = result.output;
			if (result.code !== 0 && /unknown command|unrecognized/i.test(output)) {
				output += "\n\nYour installed agent-browser may be older than the docs. Try: agent-browser upgrade";
			}
			ctx.ui.notify(notifyText(output), result.code === 0 ? "info" : "error");
		},
	});
}
