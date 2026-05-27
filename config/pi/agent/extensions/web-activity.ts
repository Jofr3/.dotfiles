/**
 * Split Pi web activity extension (local fork of pi-web-access).
 *
 * Registers the live Web Search Activity widget shortcut.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { activityMonitor, type ActivityEntry } from "./web-access/activity.js";

const WEB_SEARCH_CONFIG_PATH = join(homedir(), ".pi", "web-search.json");
const DEFAULT_ACTIVITY_SHORTCUT = "ctrl+shift+w";

interface WebActivityConfig {
	shortcuts?: { activity?: string };
}

function loadActivityShortcut(): string {
	if (!existsSync(WEB_SEARCH_CONFIG_PATH)) return DEFAULT_ACTIVITY_SHORTCUT;
	try {
		const config = JSON.parse(readFileSync(WEB_SEARCH_CONFIG_PATH, "utf-8")) as WebActivityConfig;
		const configured = config.shortcuts?.activity;
		return typeof configured === "string" && configured.trim().length > 0
			? configured.trim()
			: DEFAULT_ACTIVITY_SHORTCUT;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[web-activity] Failed to parse ${WEB_SEARCH_CONFIG_PATH}: ${message}`);
		return DEFAULT_ACTIVITY_SHORTCUT;
	}
}

function updateWidget(ctx: ExtensionContext): void {
	const theme = ctx.ui.theme;
	const entries = activityMonitor.getEntries();
	const lines: string[] = [];

	lines.push(theme.fg("accent", "─── Web Search Activity " + "─".repeat(36)));

	if (entries.length === 0) {
		lines.push(theme.fg("muted", "  No activity yet"));
	} else {
		for (const entry of entries) {
			lines.push("  " + formatEntryLine(entry, theme));
		}
	}

	lines.push(theme.fg("accent", "─".repeat(60)));

	const rateInfo = activityMonitor.getRateLimitInfo();
	const resetMs = rateInfo.oldestTimestamp ? Math.max(0, rateInfo.oldestTimestamp + rateInfo.windowMs - Date.now()) : 0;
	const resetSec = Math.ceil(resetMs / 1000);
	lines.push(
		theme.fg("muted", `Rate: ${rateInfo.used}/${rateInfo.max}`) +
			(resetMs > 0 ? theme.fg("dim", ` (resets in ${resetSec}s)`) : ""),
	);

	ctx.ui.setWidget("web-activity", new Text(lines.join("\n"), 0, 0));
}

function formatEntryLine(
	entry: ActivityEntry,
	theme: { fg: (color: string, text: string) => string },
): string {
	const typeStr = entry.type === "api" ? "API" : "GET";
	const target =
		entry.type === "api"
			? `"${truncateToWidth(entry.query || "", 28, "")}"`
			: truncateToWidth(entry.url?.replace(/^https?:\/\//, "") || "", 30, "");

	const duration = entry.endTime
		? `${((entry.endTime - entry.startTime) / 1000).toFixed(1)}s`
		: `${((Date.now() - entry.startTime) / 1000).toFixed(1)}s`;

	let statusStr: string;
	let indicator: string;
	if (entry.error) {
		statusStr = "err";
		indicator = theme.fg("error", "✗");
	} else if (entry.status === null) {
		statusStr = "...";
		indicator = theme.fg("warning", "⋯");
	} else if (entry.status === 0) {
		statusStr = "abort";
		indicator = theme.fg("muted", "○");
	} else {
		statusStr = String(entry.status);
		indicator = entry.status >= 200 && entry.status < 300 ? theme.fg("success", "✓") : theme.fg("error", "✗");
	}

	return `${typeStr.padEnd(4)} ${target.padEnd(32)} ${statusStr.padStart(5)} ${duration.padStart(5)} ${indicator}`;
}

export default function webActivityExtension(pi: ExtensionAPI) {
	const activityKey = loadActivityShortcut();
	let widgetVisible = false;
	let unsubscribe: (() => void) | null = null;

	function subscribe(ctx: ExtensionContext): void {
		unsubscribe?.();
		unsubscribe = activityMonitor.onUpdate(() => updateWidget(ctx));
		updateWidget(ctx);
	}

	function hide(ctx?: ExtensionContext): void {
		unsubscribe?.();
		unsubscribe = null;
		ctx?.ui.setWidget("web-activity", undefined);
	}

	pi.registerShortcut(activityKey, {
		description: "Toggle web search activity",
		handler: async (ctx) => {
			widgetVisible = !widgetVisible;
			if (widgetVisible) subscribe(ctx);
			else hide(ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		if (widgetVisible) subscribe(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		hide(ctx);
		activityMonitor.clear();
		widgetVisible = false;
	});
}
