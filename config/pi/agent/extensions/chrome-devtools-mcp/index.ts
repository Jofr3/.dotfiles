/**
 * chrome-devtools-mcp Extension
 *
 * Bridges the chrome-devtools-mcp MCP server into pi as native tools.
 * Spawns chrome-devtools-mcp as a child process, communicates via MCP stdio
 * transport, and registers each DevTools tool for the LLM to call directly.
 *
 * Provides `/devtools` command for configuration and `/devtools-reconnect`
 * to restart the server connection.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, writeFileSync, statSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── Types ───────────────────────────────────────────────────────────────

interface DevToolsConfig {
	headless: boolean;
	slim: boolean;
	noUsageStatistics: boolean;
	noPerformanceCrux: boolean;
	browserUrl?: string;
	executablePath?: string;
	channel: "stable" | "canary" | "beta" | "dev";
	viewport?: string;
	isolated: boolean;
	npxPath: string;
	extraArgs: string[];
}

interface McpTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

// ── Config ──────────────────────────────────────────────────────────────

const CONFIG_PATH = join(homedir(), ".pi", "agent", "chrome-devtools-mcp.json");

const DEFAULT_CONFIG: DevToolsConfig = {
	headless: false,
	slim: false,
	noUsageStatistics: true,
	noPerformanceCrux: true,
	channel: "stable",
	isolated: false,
	npxPath: "npx",
	extraArgs: [],
};

function loadConfig(): DevToolsConfig {
	try {
		const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
		return { ...DEFAULT_CONFIG, ...raw };
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

function saveConfig(cfg: DevToolsConfig): void {
	const dir = join(homedir(), ".pi", "agent");
	mkdirSync(dir, { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}

function configMtime(): number {
	try {
		return statSync(CONFIG_PATH).mtimeMs;
	} catch {
		return 0;
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────

function buildArgs(cfg: DevToolsConfig): string[] {
	const args = ["-y", "chrome-devtools-mcp@latest"];

	if (cfg.headless) args.push("--headless");
	if (cfg.slim) args.push("--slim");
	if (cfg.noUsageStatistics) args.push("--no-usage-statistics");
	if (cfg.noPerformanceCrux) args.push("--no-performance-crux");
	if (cfg.browserUrl) args.push(`--browser-url=${cfg.browserUrl}`);
	if (cfg.executablePath) args.push(`--executable-path=${cfg.executablePath}`);
	if (cfg.channel !== "stable") args.push(`--channel=${cfg.channel}`);
	if (cfg.viewport) args.push(`--viewport=${cfg.viewport}`);
	if (cfg.isolated) args.push("--isolated");
	if (cfg.extraArgs.length > 0) args.push(...cfg.extraArgs);

	return args;
}

function truncate(text: string, max: number): string {
	return text.length > max ? text.slice(0, max) + "…" : text;
}

// ── Extension ───────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let config = loadConfig();
	let client: InstanceType<typeof Client> | null = null;
	let transport: InstanceType<typeof StdioClientTransport> | null = null;
	let mcpTools: McpTool[] = [];
	let connected = false;
	let connecting = false;
	let lastConfigMtime = configMtime();

	// ── MCP Client lifecycle ─────────────────────────────────────────────

	async function connect(): Promise<void> {
		if (connecting) return;
		connecting = true;

		try {
			// Disconnect existing
			await disconnect();

			config = loadConfig();
			const args = buildArgs(config);

			transport = new StdioClientTransport({
				command: config.npxPath,
				args,
				env: {
					...process.env,
					CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: config.noUsageStatistics ? "1" : "",
					CI: "", // Don't inherit CI flag
				},
			});

			client = new Client(
				{ name: "pi-chrome-devtools", version: "1.0.0" },
				{ capabilities: {} },
			);

			await client.connect(transport);

			// Discover tools
			const { tools } = await client.listTools();
			mcpTools = tools.map((t) => ({
				name: t.name,
				description: t.description,
				inputSchema: t.inputSchema as Record<string, unknown>,
			}));

			connected = true;
		} catch (err) {
			connected = false;
			client = null;
			transport = null;
			mcpTools = [];
			throw err;
		} finally {
			connecting = false;
		}
	}

	async function disconnect(): Promise<void> {
		connected = false;
		if (client) {
			try {
				await client.close();
			} catch {}
			client = null;
		}
		transport = null;
		mcpTools = [];
	}

	async function ensureConnected(): Promise<void> {
		// Auto-reconnect if config file changed on disk
		const mt = configMtime();
		if (connected && mt !== lastConfigMtime) {
			lastConfigMtime = mt;
			await connect();
			return;
		}
		lastConfigMtime = mt;

		if (!connected || !client) {
			await connect();
		}
	}

	async function callMcpTool(
		name: string,
		args: Record<string, unknown>,
	): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean }> {
		await ensureConnected();
		if (!client) throw new Error("chrome-devtools-mcp: not connected");

		const result = await client.callTool({ name, arguments: args });
		return result as any;
	}

	// ── Register the unified devtools tool ───────────────────────────────

	pi.registerTool({
		name: "devtools",
		label: "Chrome DevTools",
		description: `Interact with a live Chrome browser via Chrome DevTools MCP. This tool connects to chrome-devtools-mcp to control and inspect Chrome.

Available actions (pass as "tool" parameter):
- **Navigation**: navigate_page, new_page, close_page, list_pages, select_page, wait_for
- **Input**: click, fill, fill_form, hover, press_key, type_text, drag, handle_dialog, upload_file
- **Inspection**: take_screenshot, take_snapshot, evaluate_script
- **Console**: list_console_messages, get_console_message
- **Network**: list_network_requests, get_network_request
- **Performance**: performance_start_trace, performance_stop_trace, performance_analyze_insight, take_memory_snapshot
- **Emulation**: emulate, resize_page

Pass the tool name and its arguments. Arguments vary per tool - pass them as a JSON object.

Examples:
  devtools({ tool: "navigate_page", args: { url: "https://example.com" } })
  devtools({ tool: "take_screenshot", args: {} })
  devtools({ tool: "click", args: { uid: "abc123" } })
  devtools({ tool: "evaluate_script", args: { script: "document.title" } })
  devtools({ tool: "take_snapshot", args: {} })
  devtools({ tool: "list_console_messages", args: {} })
  devtools({ tool: "fill", args: { uid: "input-uid", value: "hello" } })

Typical workflow:
1. navigate_page to a URL
2. take_snapshot to get the page DOM tree with element UIDs
3. Use UIDs from the snapshot to click, fill, or inspect elements
4. take_screenshot to visually verify the result
5. Check list_console_messages for errors`,

		parameters: Type.Object({
			tool: Type.String({
				description: "The chrome-devtools-mcp tool to invoke (e.g. 'navigate_page', 'take_screenshot', 'click', 'evaluate_script')",
			}),
			args: Type.Optional(
				Type.Record(Type.String(), Type.Unknown(), {
					description: "Arguments for the tool as a JSON object. Each tool has different parameters.",
				}),
			),
		}),

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const toolName = params.tool;
			const toolArgs = (params.args ?? {}) as Record<string, unknown>;

			onUpdate?.({
				content: [{ type: "text", text: `Calling ${toolName}…` }],
				details: { status: "running", tool: toolName },
			});

			try {
				const result = await callMcpTool(toolName, toolArgs);
				const contentParts = result.content ?? [];

				const textParts: string[] = [];
				const imageParts: Array<{ type: "image"; data: string; mimeType: string }> = [];

				for (const part of contentParts) {
					if (part.type === "text" && part.text) {
						textParts.push(part.text);
					} else if (part.type === "image" && part.data && part.mimeType) {
						imageParts.push({
							type: "image",
							mimeType: part.mimeType,
							data: part.data,
						});
					}
				}

				const fullText = textParts.join("\n\n");

				// Truncate text output if needed
				const truncation = truncateHead(fullText, {
					maxLines: DEFAULT_MAX_LINES,
					maxBytes: DEFAULT_MAX_BYTES,
				});

				let outputText = truncation.content;
				if (truncation.truncated) {
					outputText += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
					outputText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
				}

				const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];
				if (outputText) {
					content.push({ type: "text", text: outputText });
				}
				for (const img of imageParts) {
					content.push(img as any);
				}

				if (content.length === 0) {
					content.push({ type: "text", text: `${toolName} completed (no output).` });
				}

				return {
					content: content as any,
					details: {
						tool: toolName,
						success: !result.isError,
						hasImages: imageParts.length > 0,
						imageCount: imageParts.length,
					},
					isError: result.isError ?? false,
				};
			} catch (err: any) {
				const msg = (err.message ?? String(err)).toLowerCase();
				// Mark disconnected on any transport/connection error so next call reconnects
				if (msg.includes("not connected") || msg.includes("closed") || msg.includes("epipe") || msg.includes("transport") || msg.includes("disconnected")) {
					connected = false;
					client = null;
					transport = null;
				}

				return {
					content: [{ type: "text", text: `devtools error (${toolName}): ${err.message ?? err}` }],
					details: { tool: toolName, error: err.message ?? String(err) },
					isError: true,
				};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("devtools "));
			text += theme.fg("accent", args.tool ?? "?");
			if (args.args) {
				const summary = Object.entries(args.args as Record<string, unknown>)
					.filter(([_, v]) => v !== undefined)
					.map(([k, v]) => {
						const val = typeof v === "string" ? `"${truncate(v, 40)}"` : JSON.stringify(v);
						return `${k}=${val}`;
					})
					.join(" ");
				if (summary) {
					text += " " + theme.fg("muted", truncate(summary, 80));
				}
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("warning", "🔧 Calling Chrome DevTools…"), 0, 0);
			}

			const details = result.details as Record<string, unknown> | undefined;

			if (result.isError) {
				return new Text(
					theme.fg("error", `✗ ${details?.tool ?? "devtools"}: ${details?.error ?? "failed"}`),
					0,
					0,
				);
			}

			let text = theme.fg("success", "✓ ");
			text += theme.fg("dim", String(details?.tool ?? "devtools"));

			if (details?.hasImages) {
				text += theme.fg("accent", ` 📷 ${details.imageCount} image(s)`);
			}

			// Show content preview
			const textContent = (result.content as any[])?.find((c: any) => c.type === "text")?.text;
			if (textContent && expanded) {
				text += "\n" + theme.fg("muted", truncate(textContent, 2000));
			} else if (textContent) {
				text += " " + theme.fg("muted", truncate(textContent, 120));
			}

			return new Text(text, 0, 0);
		},
	});

	// ── Status line ──────────────────────────────────────────────────────

	function updateStatus(ctx: ExtensionContext) {
		const theme = ctx.ui.theme;
		const status = connected
			? theme.fg("success", "●") + theme.fg("muted", " devtools")
			: theme.fg("dim", "○") + theme.fg("muted", " devtools");
		ctx.ui.setStatus("chrome-devtools-mcp", status);
	}

	pi.on("session_start", async (_event, ctx) => {
		updateStatus(ctx);
	});

	// ── Command: /devtools ───────────────────────────────────────────────

	pi.registerCommand("devtools", {
		description: "Configure chrome-devtools-mcp (browser, headless, channel, etc.)",

		handler: async (_args, ctx) => {
			config = loadConfig();

			const action = await ctx.ui.select("Chrome DevTools MCP", [
				"Show current config",
				"Toggle headless mode",
				"Toggle slim mode",
				"Set browser URL (connect to running Chrome)",
				"Set Chrome channel",
				"Set viewport size",
				"Toggle isolated mode",
				"Set Chrome executable path",
				"Set npx path",
				"Set extra args",
				connected ? "Disconnect" : "Connect now",
			]);

			if (!action) return;

			switch (action) {
				case "Show current config": {
					const info = {
						...config,
						connected,
						toolCount: mcpTools.length,
						tools: mcpTools.map((t) => t.name),
					};
					ctx.ui.notify(JSON.stringify(info, null, 2), "info");
					break;
				}
				case "Toggle headless mode": {
					config.headless = !config.headless;
					ctx.ui.notify(`Headless: ${config.headless}`, "info");
					break;
				}
				case "Toggle slim mode": {
					config.slim = !config.slim;
					ctx.ui.notify(`Slim: ${config.slim} (reconnect to apply)`, "info");
					break;
				}
				case "Set browser URL (connect to running Chrome)": {
					const val = await ctx.ui.input("Browser URL (empty to auto-launch)", config.browserUrl ?? "");
					config.browserUrl = val || undefined;
					break;
				}
				case "Set Chrome channel": {
					const ch = await ctx.ui.select("Channel", ["stable", "canary", "beta", "dev"]);
					if (ch) config.channel = ch as DevToolsConfig["channel"];
					break;
				}
				case "Set viewport size": {
					const val = await ctx.ui.input("Viewport (e.g. 1280x720, empty for default)", config.viewport ?? "");
					config.viewport = val || undefined;
					break;
				}
				case "Toggle isolated mode": {
					config.isolated = !config.isolated;
					ctx.ui.notify(`Isolated: ${config.isolated}`, "info");
					break;
				}
				case "Set Chrome executable path": {
					const val = await ctx.ui.input("Chrome path (empty for auto)", config.executablePath ?? "");
					config.executablePath = val || undefined;
					break;
				}
				case "Set npx path": {
					const val = await ctx.ui.input("npx binary path", config.npxPath);
					if (val) config.npxPath = val;
					break;
				}
				case "Set extra args": {
					const val = await ctx.ui.input(
						"Extra args (space-separated)",
						config.extraArgs.join(" "),
					);
					config.extraArgs = val ? val.split(/\s+/).filter(Boolean) : [];
					break;
				}
				case "Connect now": {
					try {
						ctx.ui.notify("Connecting to chrome-devtools-mcp…", "info");
						await connect();
						ctx.ui.notify(`Connected! ${mcpTools.length} tools available.`, "info");
					} catch (err: any) {
						ctx.ui.notify(`Connection failed: ${err.message}`, "error");
					}
					break;
				}
				case "Disconnect": {
					await disconnect();
					ctx.ui.notify("Disconnected from chrome-devtools-mcp.", "info");
					break;
				}
			}

			saveConfig(config);
			updateStatus(ctx);
		},
	});

	// ── Command: /devtools-reconnect ─────────────────────────────────────

	pi.registerCommand("devtools-reconnect", {
		description: "Reconnect to chrome-devtools-mcp server",
		handler: async (_args, ctx) => {
			try {
				ctx.ui.notify("Reconnecting to chrome-devtools-mcp…", "info");
				await connect();
				ctx.ui.notify(`Connected! ${mcpTools.length} tools available.`, "info");
			} catch (err: any) {
				ctx.ui.notify(`Connection failed: ${err.message}`, "error");
			}
			updateStatus(ctx);
		},
	});

	// ── Cleanup ──────────────────────────────────────────────────────────

	pi.on("session_shutdown", async () => {
		await disconnect();
	});
}
