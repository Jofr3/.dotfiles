import type {
	AgentToolResult,
	Theme,
	ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component } from "@earendil-works/pi-tui";
import { sanitizeTerminalText } from "./output.ts";
import type { StagehandConnectionSource } from "./manager.ts";

export interface StagehandToolDetails {
	operation: string;
	summary?: string;
	durationMs?: number;
	state?: string;
	environment?: "LOCAL" | "BROWSERBASE";
	connectionSource?: StagehandConnectionSource;
	tabRef?: string;
	activeTabRef?: string;
	elapsedMs?: number;
	truncated?: boolean;
	attachedImage?: boolean;
	url?: string;
	status?: number | null;
	count?: number;
	success?: boolean;
	completed?: boolean;
	actionCount?: number;
	totalBytes?: number;
	rawBytes?: number;
	attachedBytes?: number;
	initialized?: boolean;
	hadSession?: boolean;
	keptAlive?: boolean;
	underlyingBrowserPreserved?: boolean;
	sdkCloseSettled?: boolean;
	lateCleanupPending?: number;
	warning?: string;
}

interface RenderContext<TArgs = object> {
	args: TArgs;
	toolCallId: string;
	invalidate: () => void;
	lastComponent: Component | undefined;
	state: unknown;
	cwd: string;
	executionStarted: boolean;
	argsComplete: boolean;
	isPartial: boolean;
	expanded: boolean;
	showImages: boolean;
	isError: boolean;
}

function singleLine(value: unknown, maximum = 100): string {
	const text = typeof value === "string"
		? sanitizeTerminalText(value).replace(/\s+/g, " ").trim()
		: "";
	return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}

export function renderCall<TArgs extends object>(
	name: string,
	summary: (args: TArgs) => unknown,
): (args: TArgs, theme: Theme, context: RenderContext<TArgs>) => Component {
	return (args, theme) => {
		const detail = singleLine(summary(args));
		let text = theme.fg("toolTitle", theme.bold(`${name} `));
		text += theme.fg("accent", detail || "page");
		return new Text(text, 0, 0);
	};
}

export function renderResult(
	successText: string,
): (
	result: AgentToolResult<StagehandToolDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: RenderContext,
) => Component {
	return (result, options, theme, context) => {
		if (options.isPartial) {
			const partial = result.content.find((item) => item.type === "text")?.text;
			return new Text(theme.fg("warning", singleLine(partial, 140) || "Working…"), 0, 0);
		}
		if (context.isError) return new Text(theme.fg("error", "Stagehand operation failed"), 0, 0);

		const details = result.details;
		let text = theme.fg("success", `✓ ${singleLine(details.summary, 160) || successText}`);
		if (details.attachedImage) text += theme.fg("accent", " + image");
		if (details.truncated) text += theme.fg("warning", " (truncated)");
		if (typeof details.durationMs === "number") {
			text += theme.fg("dim", ` ${(details.durationMs / 1_000).toFixed(1)}s`);
		}
		if (options.expanded) {
			const output = result.content.find((item) => item.type === "text")?.text;
			if (output) text += `\n${theme.fg("dim", sanitizeTerminalText(output).slice(0, 3_000))}`;
		}
		return new Text(text, 0, 0);
	};
}
