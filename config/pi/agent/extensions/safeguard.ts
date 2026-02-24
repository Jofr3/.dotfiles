/**
 * Safeguard Extension
 *
 * Intercepts tool calls and evaluates them against rules in ~/.pi/agent/safeguard.json.
 * Rules can allow, block, or prompt for confirmation. Config is hot-reloaded via mtime check.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface SafeguardRule {
	tool: string;
	match: string;
	field?: string;
	action: "allow" | "block" | "confirm";
	label: string;
}

interface SafeguardConfig {
	defaultAction: "allow" | "block" | "confirm";
	rules: SafeguardRule[];
}

const CONFIG_PATH = join(homedir(), ".pi", "agent", "safeguard.json");

const DEFAULT_FIELDS: Record<string, string> = {
	bash: "command",
	read: "path",
	write: "path",
	edit: "path",
	grep: "pattern",
	find: "pattern",
	ls: "path",
};

function loadConfig(): SafeguardConfig {
	try {
		return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as SafeguardConfig;
	} catch {
		return { defaultAction: "allow", rules: [] };
	}
}

function getConfigMtime(): number {
	try {
		return statSync(CONFIG_PATH).mtimeMs;
	} catch {
		return 0;
	}
}

function extractField(toolName: string, input: Record<string, unknown>, field?: string): string {
	const key = field === "*" ? undefined : field || DEFAULT_FIELDS[toolName];
	if (key && key in input) return String(input[key]);
	return JSON.stringify(input);
}

function truncate(text: string, max: number): string {
	return text.length > max ? text.slice(0, max) + "..." : text;
}

export default function (pi: ExtensionAPI) {
	let config = loadConfig();
	let lastMtime = getConfigMtime();

	function reloadIfChanged(): void {
		const mtime = getConfigMtime();
		if (mtime !== lastMtime) {
			config = loadConfig();
			lastMtime = mtime;
		}
	}

	pi.on("tool_call", async (event, ctx) => {
		reloadIfChanged();

		const toolName = event.toolName;
		const input = event.input as Record<string, unknown>;

		for (const rule of config.rules) {
			if (rule.tool !== "*" && rule.tool !== toolName) continue;

			const value = extractField(toolName, input, rule.field);
			let matches: boolean;
			try {
				matches = new RegExp(rule.match, "i").test(value);
			} catch {
				continue;
			}
			if (!matches) continue;

			if (rule.action === "allow") return undefined;

			if (rule.action === "block") {
				if (ctx.hasUI) ctx.ui.notify(`Blocked: ${rule.label}`, "warning");
				return { block: true, reason: `Safeguard: ${rule.label}` };
			}

			if (rule.action === "confirm") {
				if (!ctx.hasUI) {
					return { block: true, reason: `Safeguard: ${rule.label} (no UI for confirmation)` };
				}

				const display = truncate(value, 120);
				const choice = await ctx.ui.select(
					`\u26A0\uFE0F Safeguard: ${rule.label}\n\nTool: ${toolName}\nInput: ${display}\n\nAllow this action?`,
					["Yes", "No", "Yes, and disable this rule"],
				);

				if (choice === "Yes") return undefined;

				if (choice === "Yes, and disable this rule") {
					config.rules = config.rules.filter((r) => r !== rule);
					writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
					lastMtime = getConfigMtime();
					ctx.ui.notify(`Rule "${rule.label}" removed`, "info");
					return undefined;
				}

				return { block: true, reason: `Safeguard: ${rule.label} (denied by user)` };
			}
		}

		// No rule matched — apply default
		if (config.defaultAction === "block") {
			return { block: true, reason: "Safeguard: blocked by default policy" };
		}
		if (config.defaultAction === "confirm") {
			if (!ctx.hasUI) {
				return { block: true, reason: "Safeguard: default confirm requires UI" };
			}
			const display = truncate(JSON.stringify(input), 120);
			const confirmed = await ctx.ui.confirm(
				"Safeguard",
				`No rule matched. Default action is confirm.\n\nTool: ${toolName}\nInput: ${display}`,
			);
			if (!confirmed) {
				return { block: true, reason: "Safeguard: denied by user (default policy)" };
			}
		}

		return undefined;
	});
}
