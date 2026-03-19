/**
 * agent-browser Extension
 *
 * Provides browser automation tools via the agent-browser CLI.
 * Wraps the core workflow: navigate → snapshot → interact → re-snapshot.
 *
 * Tools:
 *   - browser_open:       Navigate to a URL
 *   - browser_snapshot:   Get accessibility tree with element refs (@e1, @e2…)
 *   - browser_action:     Click, fill, type, select, press, scroll, hover, check
 *   - browser_screenshot: Take a screenshot (optionally annotated)
 *   - browser_get:        Get text, URL, title, HTML, value, or attribute
 *   - browser_wait:       Wait for element, text, URL, network, or JS condition
 *   - browser_eval:       Execute JavaScript in the browser
 *   - browser_exec:       Run any raw agent-browser command
 *   - browser_close:      Close the browser session
 *
 * Commands:
 *   /browser       - Configure agent-browser settings
 *   /browser-close - Close the browser session
 *
 * Requires agent-browser to be installed:
 *   npm i -g agent-browser && agent-browser install
 *
 * Usage:
 *   Place in ~/.pi/agent/extensions/ for auto-discovery.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── Types ────────────────────────────────────────────────────────────────

interface BrowserConfig {
	session?: string;
	sessionName?: string;
	profile?: string;
	headed: boolean;
	colorScheme?: "dark" | "light";
	maxOutput?: number;
	contentBoundaries: boolean;
	allowedDomains?: string;
	engine: "chrome" | "lightpanda";
	extraFlags: string[];
}

// ── Config ───────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), ".pi", "agent");
const CONFIG_PATH = join(CONFIG_DIR, "agent-browser.json");

const DEFAULT_CONFIG: BrowserConfig = {
	headed: false,
	contentBoundaries: false,
	engine: "chrome",
	extraFlags: [],
};

function loadConfig(): BrowserConfig {
	try {
		const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
		return { ...DEFAULT_CONFIG, ...raw };
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

function saveConfig(cfg: BrowserConfig): void {
	mkdirSync(CONFIG_DIR, { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}

// ── Helpers ──────────────────────────────────────────────────────────────

function buildGlobalFlags(cfg: BrowserConfig): string[] {
	const flags: string[] = [];
	if (cfg.session) flags.push("--session", cfg.session);
	if (cfg.sessionName) flags.push("--session-name", cfg.sessionName);
	if (cfg.profile) flags.push("--profile", cfg.profile);
	if (cfg.headed) flags.push("--headed");
	if (cfg.colorScheme) flags.push("--color-scheme", cfg.colorScheme);
	if (cfg.maxOutput) flags.push("--max-output", String(cfg.maxOutput));
	if (cfg.contentBoundaries) flags.push("--content-boundaries");
	if (cfg.allowedDomains) flags.push("--allowed-domains", cfg.allowedDomains);
	if (cfg.engine !== "chrome") flags.push("--engine", cfg.engine);
	if (cfg.extraFlags.length > 0) flags.push(...cfg.extraFlags);
	return flags;
}

async function runBrowser(
	pi: ExtensionAPI,
	config: BrowserConfig,
	args: string[],
	signal?: AbortSignal,
	timeout?: number,
): Promise<{ stdout: string; stderr: string; code: number }> {
	const globalFlags = buildGlobalFlags(config);
	const fullArgs = [...globalFlags, ...args];
	return pi.exec("agent-browser", fullArgs, { signal, timeout: timeout ?? 35000 });
}

function truncateStr(text: string, max: number): string {
	return text.length > max ? text.slice(0, max) + "…" : text;
}

function applyTruncation(text: string): { content: string; wasTruncated: boolean; totalLines: number; outputLines: number } {
	const truncation = truncateHead(text, {
		maxLines: DEFAULT_MAX_LINES,
		maxBytes: DEFAULT_MAX_BYTES,
	});

	let content = truncation.content;
	if (truncation.truncated) {
		content += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
		content += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
	}

	return {
		content,
		wasTruncated: truncation.truncated,
		totalLines: truncation.totalLines,
		outputLines: truncation.outputLines,
	};
}

function makeResult(result: { stdout: string; stderr: string; code: number }, toolName: string) {
	const output = result.stdout.trim();
	const error = result.stderr.trim();

	if (result.code !== 0) {
		const errMsg = error || output || `${toolName} failed with exit code ${result.code}`;
		return {
			content: [{ type: "text" as const, text: errMsg }],
			details: { tool: toolName, success: false, exitCode: result.code },
			isError: true,
		};
	}

	if (!output && !error) {
		return {
			content: [{ type: "text" as const, text: `${toolName} completed.` }],
			details: { tool: toolName, success: true },
		};
	}

	const { content, wasTruncated, totalLines, outputLines } = applyTruncation(output);

	return {
		content: [{ type: "text" as const, text: content }],
		details: {
			tool: toolName,
			success: true,
			truncated: wasTruncated,
			totalLines,
			outputLines,
		},
	};
}

// ── Extension ────────────────────────────────────────────────────────────

export default function agentBrowserExtension(pi: ExtensionAPI) {
	let config = loadConfig();
	let browserOpen = false;

	// ── Tool: browser_open ───────────────────────────────────────────────

	pi.registerTool({
		name: "browser_open",
		label: "Browser Open",
		description: `Navigate the browser to a URL using agent-browser. Opens the page and waits for it to load. The browser persists between commands via a background daemon.

After opening a page, use browser_snapshot to get element refs for interaction.`,
		parameters: Type.Object({
			url: Type.String({ description: "URL to navigate to (auto-prepends https:// if no protocol)" }),
			waitUntil: Type.Optional(Type.String({ description: "Wait condition after navigation: 'networkidle', 'load', 'domcontentloaded'" })),
		}),

		async execute(_id, params, signal) {
			const args = ["open", params.url];

			const result = await runBrowser(pi, config, args, signal, 45000);

			// Chain wait if requested
			if (result.code === 0 && params.waitUntil) {
				const waitResult = await runBrowser(pi, config, ["wait", "--load", params.waitUntil], signal, 45000);
				if (waitResult.code !== 0) {
					return makeResult(waitResult, "browser_open/wait");
				}
			}

			browserOpen = result.code === 0;
			return makeResult(result, "browser_open");
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("browser_open "));
			text += theme.fg("accent", args.url);
			if (args.waitUntil) text += theme.fg("muted", ` (wait: ${args.waitUntil})`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "🌐 Opening page…"), 0, 0);
			if (result.isError) return new Text(theme.fg("error", "✗ " + truncateStr((result.content[0] as any)?.text ?? "failed", 100)), 0, 0);
			return new Text(theme.fg("success", "✓ Page opened"), 0, 0);
		},
	});

	// ── Tool: browser_snapshot ───────────────────────────────────────────

	pi.registerTool({
		name: "browser_snapshot",
		label: "Browser Snapshot",
		description: `Get the accessibility tree of the current page with element refs (@e1, @e2, etc.). Refs are used to interact with elements via browser_action.

IMPORTANT: Refs are invalidated when the page changes. Always re-snapshot after navigation, form submissions, or dynamic content updates.

Options:
- interactive: only show interactive elements (buttons, links, inputs) — recommended
- cursor: include cursor-interactive elements (divs with onclick, cursor:pointer)
- compact: remove empty structural elements
- depth: limit tree depth
- selector: scope to a CSS selector`,
		parameters: Type.Object({
			interactive: Type.Optional(Type.Boolean({ description: "Only show interactive elements (recommended, default: true)" })),
			cursor: Type.Optional(Type.Boolean({ description: "Include cursor-interactive elements (onclick, tabindex)" })),
			compact: Type.Optional(Type.Boolean({ description: "Remove empty structural elements" })),
			depth: Type.Optional(Type.Number({ description: "Limit tree depth" })),
			selector: Type.Optional(Type.String({ description: "Scope snapshot to CSS selector" })),
		}),

		async execute(_id, params, signal) {
			const args = ["snapshot"];

			// Default to interactive if not specified
			if (params.interactive !== false) args.push("-i");
			if (params.cursor) args.push("-C");
			if (params.compact) args.push("-c");
			if (params.depth) args.push("-d", String(params.depth));
			if (params.selector) args.push("-s", params.selector);

			const result = await runBrowser(pi, config, args, signal);
			return makeResult(result, "browser_snapshot");
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("browser_snapshot"));
			const flags: string[] = [];
			if (args.interactive !== false) flags.push("-i");
			if (args.cursor) flags.push("-C");
			if (args.compact) flags.push("-c");
			if (args.depth) flags.push(`-d ${args.depth}`);
			if (args.selector) flags.push(`-s "${args.selector}"`);
			if (flags.length) text += " " + theme.fg("muted", flags.join(" "));
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "📋 Taking snapshot…"), 0, 0);
			if (result.isError) return new Text(theme.fg("error", "✗ " + truncateStr((result.content[0] as any)?.text ?? "failed", 100)), 0, 0);

			const details = result.details as { truncated?: boolean; totalLines?: number; outputLines?: number } | undefined;
			let text = theme.fg("success", "✓ Snapshot captured");
			if (details?.truncated) text += theme.fg("warning", ` (truncated: ${details.outputLines}/${details.totalLines} lines)`);

			if (expanded) {
				const content = (result.content[0] as any)?.text;
				if (content) {
					const lines = content.split("\n").slice(0, 30);
					for (const line of lines) text += `\n${theme.fg("dim", line)}`;
					if (content.split("\n").length > 30) text += `\n${theme.fg("muted", "…")}`;
				}
			}

			return new Text(text, 0, 0);
		},
	});

	// ── Tool: browser_action ─────────────────────────────────────────────

	pi.registerTool({
		name: "browser_action",
		label: "Browser Action",
		description: `Perform an interaction on a browser element using refs from browser_snapshot.

Actions:
- click @ref         — Click element
- fill @ref "text"   — Clear and type text into input
- type @ref "text"   — Type without clearing
- select @ref "val"  — Select dropdown option
- check @ref         — Check checkbox
- uncheck @ref       — Uncheck checkbox
- hover @ref         — Hover element
- focus @ref         — Focus element
- press Key          — Press key (Enter, Tab, Control+a)
- scroll dir [px]    — Scroll (up/down/left/right, default 300px)
- dblclick @ref      — Double-click
- drag @src @tgt     — Drag and drop
- upload @ref files  — Upload files

After actions that change the page (click, submit), re-snapshot to get fresh refs.`,
		parameters: Type.Object({
			action: Type.String({
				description: "Action to perform: click, fill, type, select, check, uncheck, hover, focus, press, scroll, dblclick, drag, upload",
			}),
			ref: Type.Optional(Type.String({ description: "Element ref from snapshot (e.g. '@e1', '@e3')" })),
			value: Type.Optional(Type.String({ description: "Value for fill/type/select actions, key for press, direction for scroll" })),
		}),

		async execute(_id, params, signal) {
			const { action, ref, value } = params;
			const args: string[] = [action];

			if (ref) args.push(ref);
			if (value !== undefined) args.push(value);

			const result = await runBrowser(pi, config, args, signal);
			return makeResult(result, `browser_action/${action}`);
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("browser_action "));
			text += theme.fg("accent", args.action);
			if (args.ref) text += " " + theme.fg("accent", args.ref);
			if (args.value) text += " " + theme.fg("muted", `"${truncateStr(args.value, 40)}"`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "⚡ Executing action…"), 0, 0);
			const details = result.details as { tool?: string } | undefined;
			const action = details?.tool?.replace("browser_action/", "") ?? "action";
			if (result.isError) return new Text(theme.fg("error", `✗ ${action}: ` + truncateStr((result.content[0] as any)?.text ?? "failed", 100)), 0, 0);
			return new Text(theme.fg("success", `✓ ${action} completed`), 0, 0);
		},
	});

	// ── Tool: browser_screenshot ─────────────────────────────────────────

	pi.registerTool({
		name: "browser_screenshot",
		label: "Browser Screenshot",
		description: `Take a screenshot of the current page. Optionally save to a path or annotate with numbered element labels.

Annotated screenshots overlay [N] labels on interactive elements — each maps to @eN refs, so you can interact with elements directly after an annotated screenshot.

Use --full for full-page screenshots. Screenshots are saved to a temp directory if no path is given.`,
		parameters: Type.Object({
			path: Type.Optional(Type.String({ description: "Save path (e.g. 'page.png'). Temp dir if omitted." })),
			full: Type.Optional(Type.Boolean({ description: "Full page screenshot" })),
			annotate: Type.Optional(Type.Boolean({ description: "Annotated screenshot with numbered element labels matching @eN refs" })),
		}),

		async execute(_id, params, signal) {
			const args = ["screenshot"];
			if (params.path) args.push(params.path);
			if (params.full) args.push("--full");
			if (params.annotate) args.push("--annotate");

			const result = await runBrowser(pi, config, args, signal);
			return makeResult(result, "browser_screenshot");
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("browser_screenshot"));
			const flags: string[] = [];
			if (args.path) flags.push(args.path);
			if (args.full) flags.push("--full");
			if (args.annotate) flags.push("--annotate");
			if (flags.length) text += " " + theme.fg("muted", flags.join(" "));
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "📸 Taking screenshot…"), 0, 0);
			if (result.isError) return new Text(theme.fg("error", "✗ " + truncateStr((result.content[0] as any)?.text ?? "failed", 100)), 0, 0);

			let text = theme.fg("success", "✓ Screenshot taken");
			if (expanded) {
				const content = (result.content[0] as any)?.text;
				if (content) text += "\n" + theme.fg("dim", truncateStr(content, 500));
			}
			return new Text(text, 0, 0);
		},
	});

	// ── Tool: browser_get ────────────────────────────────────────────────

	pi.registerTool({
		name: "browser_get",
		label: "Browser Get",
		description: `Get information from the current page.

What you can get:
- text @ref    — Element text content
- html @ref    — Element innerHTML
- value @ref   — Input value
- attr @ref <name> — Element attribute
- title        — Page title
- url          — Current URL
- count <sel>  — Count matching elements
- styles @ref  — Computed styles`,
		parameters: Type.Object({
			what: Type.String({ description: "What to get: text, html, value, attr, title, url, count, styles" }),
			ref: Type.Optional(Type.String({ description: "Element ref (e.g. '@e1') or CSS selector" })),
			attr: Type.Optional(Type.String({ description: "Attribute name (for 'attr' queries)" })),
		}),

		async execute(_id, params, signal) {
			const args = ["get", params.what];
			if (params.ref) args.push(params.ref);
			if (params.attr) args.push(params.attr);

			const result = await runBrowser(pi, config, args, signal);
			return makeResult(result, `browser_get/${params.what}`);
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("browser_get "));
			text += theme.fg("accent", args.what);
			if (args.ref) text += " " + theme.fg("accent", args.ref);
			if (args.attr) text += " " + theme.fg("muted", args.attr);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "🔍 Getting info…"), 0, 0);
			if (result.isError) return new Text(theme.fg("error", "✗ " + truncateStr((result.content[0] as any)?.text ?? "failed", 100)), 0, 0);

			const content = (result.content[0] as any)?.text ?? "";
			let text = theme.fg("success", "✓ ");
			text += theme.fg("dim", truncateStr(content, expanded ? 2000 : 120));
			return new Text(text, 0, 0);
		},
	});

	// ── Tool: browser_wait ───────────────────────────────────────────────

	pi.registerTool({
		name: "browser_wait",
		label: "Browser Wait",
		description: `Wait for a condition in the browser.

Conditions:
- selector: Wait for element to appear (e.g. '@e1', '#content')
- text: Wait for text to appear on page (substring match)
- url: Wait for URL pattern (e.g. '**/dashboard')
- load: Wait for load state ('networkidle', 'load', 'domcontentloaded')
- fn: Wait for JavaScript condition (e.g. 'window.ready === true')
- ms: Wait fixed milliseconds

To wait for text/element to disappear:
- fn: "!document.body.innerText.includes('Loading...')"
- selector with state hidden: wait for element to hide`,
		parameters: Type.Object({
			condition: Type.String({ description: "Wait type: selector, text, url, load, fn, ms" }),
			value: Type.String({ description: "Value: selector string, text to find, URL pattern, load state, JS expression, or milliseconds" }),
			state: Type.Optional(Type.String({ description: "Element state to wait for: 'visible' (default), 'hidden'" })),
		}),

		async execute(_id, params, signal) {
			const { condition, value, state } = params;
			const args: string[] = ["wait"];

			switch (condition) {
				case "selector":
					args.push(value);
					if (state) args.push("--state", state);
					break;
				case "text":
					args.push("--text", value);
					break;
				case "url":
					args.push("--url", value);
					break;
				case "load":
					args.push("--load", value);
					break;
				case "fn":
					args.push("--fn", value);
					break;
				case "ms":
					args.push(value);
					break;
				default:
					args.push(value);
			}

			const result = await runBrowser(pi, config, args, signal, 45000);
			return makeResult(result, `browser_wait/${condition}`);
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("browser_wait "));
			text += theme.fg("accent", args.condition);
			text += " " + theme.fg("muted", `"${truncateStr(args.value, 60)}"`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "⏳ Waiting…"), 0, 0);
			if (result.isError) return new Text(theme.fg("error", "✗ " + truncateStr((result.content[0] as any)?.text ?? "timeout", 100)), 0, 0);
			return new Text(theme.fg("success", "✓ Wait completed"), 0, 0);
		},
	});

	// ── Tool: browser_eval ───────────────────────────────────────────────

	pi.registerTool({
		name: "browser_eval",
		label: "Browser Eval",
		description: `Execute JavaScript in the browser context. Returns the result.

Uses --stdin to pipe the script, avoiding shell quoting issues. Safe for complex expressions with nested quotes, template literals, etc.`,
		parameters: Type.Object({
			script: Type.String({ description: "JavaScript code to execute in the browser" }),
		}),

		async execute(_id, params, signal) {
			// Use base64 encoding to avoid any shell quoting issues
			const b64 = Buffer.from(params.script).toString("base64");
			const result = await runBrowser(pi, config, ["eval", "-b", b64], signal);
			return makeResult(result, "browser_eval");
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("browser_eval "));
			text += theme.fg("muted", truncateStr(args.script, 80));
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "⚙️ Evaluating JS…"), 0, 0);
			if (result.isError) return new Text(theme.fg("error", "✗ " + truncateStr((result.content[0] as any)?.text ?? "failed", 100)), 0, 0);

			const content = (result.content[0] as any)?.text ?? "";
			let text = theme.fg("success", "✓ ");
			text += theme.fg("dim", truncateStr(content, expanded ? 2000 : 120));
			return new Text(text, 0, 0);
		},
	});

	// ── Tool: browser_exec ───────────────────────────────────────────────

	pi.registerTool({
		name: "browser_exec",
		label: "Browser Exec",
		description: `Run any agent-browser command directly. Use for advanced operations not covered by other browser_* tools.

Examples:
- ["tab", "new", "https://example.com"]  — Open new tab
- ["tab"]                                 — List tabs
- ["cookies"]                             — Get all cookies
- ["network", "requests"]                 — View network requests
- ["diff", "snapshot"]                    — Compare vs last snapshot
- ["console"]                             — View console messages
- ["errors"]                              — View page errors
- ["state", "save", "auth.json"]          — Save auth state
- ["back"]                                — Go back
- ["forward"]                             — Go forward
- ["reload"]                              — Reload page
- ["set", "viewport", "1920", "1080"]     — Set viewport size
- ["find", "role", "button", "click", "--name", "Submit"]  — Semantic locator`,
		parameters: Type.Object({
			args: Type.Array(Type.String(), { description: "Command arguments as array (e.g. ['tab', 'new', 'https://example.com'])" }),
		}),

		async execute(_id, params, signal) {
			const result = await runBrowser(pi, config, params.args, signal, 45000);
			return makeResult(result, `browser_exec/${params.args[0] ?? "unknown"}`);
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("browser_exec "));
			const cmdStr = (args.args as string[]).join(" ");
			text += theme.fg("accent", truncateStr(cmdStr, 80));
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "🔧 Running command…"), 0, 0);
			if (result.isError) return new Text(theme.fg("error", "✗ " + truncateStr((result.content[0] as any)?.text ?? "failed", 100)), 0, 0);

			const content = (result.content[0] as any)?.text ?? "";
			let text = theme.fg("success", "✓ ");
			text += theme.fg("dim", truncateStr(content, expanded ? 2000 : 120));
			return new Text(text, 0, 0);
		},
	});

	// ── Tool: browser_close ──────────────────────────────────────────────

	pi.registerTool({
		name: "browser_close",
		label: "Browser Close",
		description: `Close the browser session. Always close when done to avoid leaked daemon processes.`,
		parameters: Type.Object({}),

		async execute(_id, _params, signal) {
			const result = await runBrowser(pi, config, ["close"], signal, 10000);
			browserOpen = false;
			return makeResult(result, "browser_close");
		},

		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("browser_close")), 0, 0);
		},

		renderResult(result, { isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Closing browser…"), 0, 0);
			return new Text(theme.fg("success", "✓ Browser closed"), 0, 0);
		},
	});

	// ── Status line ──────────────────────────────────────────────────────

	function updateStatus(ctx: ExtensionContext) {
		const theme = ctx.ui.theme;
		const icon = browserOpen
			? theme.fg("success", "●")
			: theme.fg("dim", "○");
		ctx.ui.setStatus("agent-browser", icon + theme.fg("muted", " browser"));
	}

	pi.on("session_start", async (_event, ctx) => {
		updateStatus(ctx);
	});

	pi.on("tool_execution_end", async (_event, ctx) => {
		updateStatus(ctx);
	});

	// ── Command: /browser ────────────────────────────────────────────────

	pi.registerCommand("browser", {
		description: "Configure agent-browser settings (session, headed, profile, etc.)",

		handler: async (_args, ctx) => {
			config = loadConfig();

			const action = await ctx.ui.select("Agent Browser Configuration", [
				"Show current config",
				`Toggle headed mode (${config.headed ? "ON" : "OFF"})`,
				"Set session name",
				"Set persistent profile path",
				`Set color scheme (${config.colorScheme ?? "default"})`,
				`Toggle content boundaries (${config.contentBoundaries ? "ON" : "OFF"})`,
				"Set allowed domains",
				"Set max output",
				`Set engine (${config.engine})`,
				"Set extra flags",
				"Close browser",
			]);

			if (!action) return;

			if (action.startsWith("Show")) {
				ctx.ui.notify(JSON.stringify(config, null, 2), "info");
			} else if (action.startsWith("Toggle headed")) {
				config.headed = !config.headed;
				ctx.ui.notify(`Headed: ${config.headed}`, "info");
			} else if (action.startsWith("Set session")) {
				const val = await ctx.ui.input("Session name (empty to clear)", config.sessionName ?? "");
				config.sessionName = val || undefined;
				ctx.ui.notify(`Session name: ${config.sessionName ?? "(none)"}`, "info");
			} else if (action.startsWith("Set persistent")) {
				const val = await ctx.ui.input("Profile path (empty to clear)", config.profile ?? "");
				config.profile = val || undefined;
				ctx.ui.notify(`Profile: ${config.profile ?? "(none)"}`, "info");
			} else if (action.startsWith("Set color")) {
				const scheme = await ctx.ui.select("Color scheme", ["dark", "light", "default"]);
				config.colorScheme = scheme === "default" ? undefined : scheme as "dark" | "light";
				ctx.ui.notify(`Color scheme: ${config.colorScheme ?? "default"}`, "info");
			} else if (action.startsWith("Toggle content")) {
				config.contentBoundaries = !config.contentBoundaries;
				ctx.ui.notify(`Content boundaries: ${config.contentBoundaries}`, "info");
			} else if (action.startsWith("Set allowed")) {
				const val = await ctx.ui.input("Allowed domains (comma-separated, empty to clear)", config.allowedDomains ?? "");
				config.allowedDomains = val || undefined;
				ctx.ui.notify(`Allowed domains: ${config.allowedDomains ?? "(none)"}`, "info");
			} else if (action.startsWith("Set max")) {
				const val = await ctx.ui.input("Max output chars (empty for default)", config.maxOutput ? String(config.maxOutput) : "");
				config.maxOutput = val ? parseInt(val, 10) : undefined;
				ctx.ui.notify(`Max output: ${config.maxOutput ?? "default"}`, "info");
			} else if (action.startsWith("Set engine")) {
				const engine = await ctx.ui.select("Browser engine", ["chrome", "lightpanda"]);
				if (engine) config.engine = engine as "chrome" | "lightpanda";
				ctx.ui.notify(`Engine: ${config.engine}`, "info");
			} else if (action.startsWith("Set extra")) {
				const val = await ctx.ui.input("Extra flags (space-separated)", config.extraFlags.join(" "));
				config.extraFlags = val ? val.split(/\s+/).filter(Boolean) : [];
				ctx.ui.notify(`Extra flags: ${config.extraFlags.length ? config.extraFlags.join(" ") : "(none)"}`, "info");
			} else if (action.startsWith("Close")) {
				try {
					await runBrowser(pi, config, ["close"], undefined, 10000);
					browserOpen = false;
					ctx.ui.notify("Browser closed.", "info");
				} catch (err: any) {
					ctx.ui.notify(`Failed to close: ${err.message}`, "error");
				}
			}

			saveConfig(config);
			updateStatus(ctx);
		},
	});

	// ── Command: /browser-close ──────────────────────────────────────────

	pi.registerCommand("browser-close", {
		description: "Close the agent-browser session",
		handler: async (_args, ctx) => {
			try {
				await runBrowser(pi, config, ["close"], undefined, 10000);
				browserOpen = false;
				ctx.ui.notify("Browser closed.", "info");
			} catch (err: any) {
				ctx.ui.notify(`Failed to close: ${err.message}`, "error");
			}
			updateStatus(ctx);
		},
	});

	// ── Cleanup on shutdown ──────────────────────────────────────────────

	pi.on("session_shutdown", async () => {
		if (browserOpen) {
			try {
				await runBrowser(pi, config, ["close"], undefined, 5000);
			} catch {}
		}
	});
}
