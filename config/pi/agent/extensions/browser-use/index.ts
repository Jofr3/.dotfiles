/**
 * browser-use Extension
 *
 * Registers a `browser_use` tool that lets the LLM drive a browser via the
 * browser-use Python library.  Also provides a `/browser-use` command for
 * configuring defaults (LLM provider, headless mode, vision, etc.).
 *
 * Configuration is persisted to ~/.pi/agent/browser-use.json and hot-reloaded.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { readFileSync, writeFileSync, statSync, mkdtempSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { homedir, tmpdir } from "os";
import { Text } from "@mariozechner/pi-tui";

// ── Config ──────────────────────────────────────────────────────────────

interface BrowserUseConfig {
	llmProvider: string;
	llmModel: string;
	headless: boolean;
	useVision: boolean;
	maxSteps: number;
	useCloud: boolean;
	cdpUrl?: string;
	allowedDomains?: string[];
	pythonPath: string;
}

const CONFIG_PATH = join(homedir(), ".pi", "agent", "browser-use.json");
const RUNNER_PATH = join(dirname(new URL(import.meta.url).pathname), "run.py");

const DEFAULT_CONFIG: BrowserUseConfig = {
	llmProvider: "openai",
	llmModel: "gpt-4o",
	headless: true,
	useVision: true,
	maxSteps: 25,
	useCloud: false,
	pythonPath: "python3",
};

function loadConfig(): BrowserUseConfig {
	try {
		const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
		return { ...DEFAULT_CONFIG, ...raw };
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

function saveConfig(cfg: BrowserUseConfig): void {
	writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}

function configMtime(): number {
	try {
		return statSync(CONFIG_PATH).mtimeMs;
	} catch {
		return 0;
	}
}

// ── Tool parameter schema ───────────────────────────────────────────────

const BrowserUseParams = Type.Object({
	task: Type.String({
		description:
			"Natural language description of the browser task to perform. Be specific: include URLs, form fields, expected data, etc.",
	}),
	llm_provider: Type.Optional(
		StringEnum(["openai", "anthropic", "google", "browseruse"] as const, {
			description: "LLM provider for the browser agent (overrides default config).",
		}),
	),
	llm_model: Type.Optional(
		Type.String({
			description: "Model name for the browser agent LLM (overrides default config).",
		}),
	),
	headless: Type.Optional(
		Type.Boolean({
			description: "Run browser without visible window. Default from config (~true).",
		}),
	),
	use_vision: Type.Optional(
		Type.Boolean({
			description: "Enable screenshot-based vision for the browser agent.",
		}),
	),
	max_steps: Type.Optional(
		Type.Number({
			description: "Maximum number of agent steps before stopping.",
		}),
	),
	allowed_domains: Type.Optional(
		Type.Array(Type.String(), {
			description: "Restrict navigation to these domain patterns (e.g. ['*.github.com']).",
		}),
	),
	sensitive_data: Type.Optional(
		Type.Record(Type.String(), Type.String(), {
			description:
				"Key-value pairs of sensitive data (credentials, tokens). Keys are placeholders used in the task description; values are the real secrets. Never logged or sent to the LLM.",
		}),
	),
});

type BrowserUseInput = Static<typeof BrowserUseParams>;

// ── Helpers ─────────────────────────────────────────────────────────────

function buildRunnerInput(params: BrowserUseInput, cfg: BrowserUseConfig): Record<string, unknown> {
	return {
		task: params.task,
		llm_provider: params.llm_provider ?? cfg.llmProvider,
		llm_model: params.llm_model ?? cfg.llmModel,
		headless: params.headless ?? cfg.headless,
		use_vision: params.use_vision ?? cfg.useVision,
		max_steps: params.max_steps ?? cfg.maxSteps,
		allowed_domains: params.allowed_domains ?? cfg.allowedDomains ?? null,
		sensitive_data: params.sensitive_data ?? null,
		use_cloud: cfg.useCloud,
		cdp_url: cfg.cdpUrl ?? null,
	};
}

function truncate(text: string, max: number): string {
	return text.length > max ? text.slice(0, max) + "…" : text;
}

// ── Extension ───────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let config = loadConfig();
	let lastMtime = configMtime();

	function reloadIfChanged(): void {
		const mt = configMtime();
		if (mt !== lastMtime) {
			config = loadConfig();
			lastMtime = mt;
		}
	}

	// ── Status line ──────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		const theme = ctx.ui.theme;
		ctx.ui.setStatus(
			"browser-use",
			theme.fg("dim", "🌐 ") + theme.fg("muted", `browser-use (${config.llmProvider}/${config.llmModel})`),
		);
	});

	// ── Tool ─────────────────────────────────────────────────────────────

	pi.registerTool({
		name: "browser_use",
		label: "Browser Use",
		description: `Run a browser automation task using the browser-use library. An AI agent will control a real browser to navigate pages, fill forms, click buttons, extract data, and more.

Provide a detailed natural language task description. The agent will figure out the browser actions.

Examples:
- "Go to github.com/browser-use/browser-use and extract the star count"
- "Search Google for 'best pizza in NYC' and extract the top 5 results with links"
- "Log into example.com with username x_user and password x_pass, then navigate to settings"

For sensitive data (passwords, API keys), use the sensitive_data parameter with placeholder keys referenced in the task.`,

		parameters: BrowserUseParams,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			reloadIfChanged();

			const runnerInput = buildRunnerInput(params, config);
			const inputJson = JSON.stringify(runnerInput);

			// Write config to a temp file to avoid shell escaping issues
			const tmpFile = join(tmpdir(), `browser-use-${toolCallId}.json`);
			writeFileSync(tmpFile, inputJson, "utf-8");

			// Progress update
			onUpdate?.({
				content: [{ type: "text", text: `Running browser task: ${truncate(params.task, 200)}` }],
				details: { status: "running" },
			});

			let result;
			try {
				// Spawn python runner with @filepath argument
				result = await pi.exec(
					config.pythonPath,
					[RUNNER_PATH, `@${tmpFile}`],
					{
						signal,
						timeout: (params.max_steps ?? config.maxSteps) * 15, // ~15s per step budget
					},
				);
			} finally {
				try { unlinkSync(tmpFile); } catch {}
			}

			// Parse result
			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(result.stdout);
			} catch {
				const errMsg = result.stderr
					? `Python stderr:\n${result.stderr.slice(-2000)}`
					: `Exit code ${result.code}, no JSON output.`;
				return {
					content: [{ type: "text", text: `browser-use execution failed.\n\n${errMsg}` }],
					details: { error: errMsg, exitCode: result.code },
					isError: true,
				};
			}

			if (!parsed.success) {
				return {
					content: [
						{
							type: "text",
							text: `browser-use task failed: ${parsed.error ?? "unknown error"}`,
						},
					],
					details: parsed,
					isError: true,
				};
			}

			// Build output text
			const lines: string[] = [];
			if (parsed.final_result) {
				lines.push(`## Result\n\n${parsed.final_result}`);
			}
			if (Array.isArray(parsed.extracted_content) && (parsed.extracted_content as string[]).length > 0) {
				lines.push(`## Extracted Content\n\n${(parsed.extracted_content as string[]).join("\n")}`);
			}
			if (Array.isArray(parsed.urls) && (parsed.urls as string[]).length > 0) {
				lines.push(`## Visited URLs\n\n${(parsed.urls as string[]).map((u) => `- ${u}`).join("\n")}`);
			}
			if (Array.isArray(parsed.errors) && (parsed.errors as string[]).length > 0) {
				lines.push(`## Errors\n\n${(parsed.errors as string[]).join("\n")}`);
			}
			lines.push(
				`\n---\nCompleted in ${parsed.steps} steps (${parsed.duration_seconds}s)`,
			);

			const output = lines.join("\n\n");

			// Truncate if needed (50KB safety)
			const truncatedOutput = output.length > 48000 ? output.slice(0, 48000) + "\n\n[Output truncated]" : output;

			return {
				content: [{ type: "text", text: truncatedOutput }],
				details: parsed,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("browser_use "));
			text += theme.fg("muted", truncate(args.task ?? "", 80));
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("warning", "🌐 Running browser task…"), 0, 0);
			}

			const details = result.details as Record<string, unknown> | undefined;
			if (details?.error || result.isError) {
				return new Text(
					theme.fg("error", `✗ ${details?.error ?? "Browser task failed"}`),
					0,
					0,
				);
			}

			let text = theme.fg("success", "✓ ");
			text += theme.fg("dim", `${details?.steps ?? "?"} steps · ${details?.duration_seconds ?? "?"}s`);

			const finalResult = details?.final_result as string | undefined;
			if (finalResult) {
				text += "\n" + theme.fg("muted", truncate(finalResult, expanded ? 2000 : 200));
			}

			if (expanded) {
				const urls = details?.urls as string[] | undefined;
				if (urls?.length) {
					text += "\n\n" + theme.fg("dim", "URLs:");
					for (const u of urls.slice(0, 20)) {
						text += "\n  " + theme.fg("muted", u);
					}
				}
			}

			return new Text(text, 0, 0);
		},
	});

	// ── Command: /browser-use ────────────────────────────────────────────

	pi.registerCommand("browser-use", {
		description: "Configure browser-use defaults (LLM, headless, vision, etc.)",

		handler: async (_args, ctx) => {
			reloadIfChanged();

			const action = await ctx.ui.select("browser-use Configuration", [
				"Show current config",
				"Set LLM provider & model",
				"Toggle headless mode",
				"Toggle vision",
				"Set max steps",
				"Set Python path",
				"Toggle cloud browser",
				"Set CDP URL",
				"Set allowed domains",
			]);

			if (!action) return;

			switch (action) {
				case "Show current config": {
					ctx.ui.notify(JSON.stringify(config, null, 2), "info");
					break;
				}
				case "Set LLM provider & model": {
					const provider = await ctx.ui.select("LLM Provider", [
						"openai",
						"anthropic",
						"google",
						"browseruse",
					]);
					if (!provider) return;
					config.llmProvider = provider;

					if (provider !== "browseruse") {
						const model = await ctx.ui.input("Model name", config.llmModel);
						if (model) config.llmModel = model;
					} else {
						config.llmModel = "default";
					}
					break;
				}
				case "Toggle headless mode": {
					config.headless = !config.headless;
					ctx.ui.notify(`Headless: ${config.headless}`, "info");
					break;
				}
				case "Toggle vision": {
					config.useVision = !config.useVision;
					ctx.ui.notify(`Vision: ${config.useVision}`, "info");
					break;
				}
				case "Set max steps": {
					const val = await ctx.ui.input("Max steps", String(config.maxSteps));
					if (val) config.maxSteps = Math.max(1, parseInt(val, 10) || 25);
					break;
				}
				case "Set Python path": {
					const val = await ctx.ui.input("Python binary path", config.pythonPath);
					if (val) config.pythonPath = val;
					break;
				}
				case "Toggle cloud browser": {
					config.useCloud = !config.useCloud;
					ctx.ui.notify(`Cloud browser: ${config.useCloud}`, "info");
					break;
				}
				case "Set CDP URL": {
					const val = await ctx.ui.input("CDP URL (empty to clear)", config.cdpUrl ?? "");
					config.cdpUrl = val || undefined;
					break;
				}
				case "Set allowed domains": {
					const val = await ctx.ui.input(
						"Allowed domains (comma-separated, empty to clear)",
						(config.allowedDomains ?? []).join(", "),
					);
					config.allowedDomains = val
						? val.split(",").map((s) => s.trim()).filter(Boolean)
						: undefined;
					break;
				}
			}

			saveConfig(config);
			lastMtime = configMtime();

			// Update status line
			const theme = ctx.ui.theme;
			ctx.ui.setStatus(
				"browser-use",
				theme.fg("dim", "🌐 ") + theme.fg("muted", `browser-use (${config.llmProvider}/${config.llmModel})`),
			);

			ctx.ui.notify("browser-use config saved", "info");
		},
	});
}
