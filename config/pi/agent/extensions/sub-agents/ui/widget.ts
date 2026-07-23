import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	truncateToWidth,
	visibleWidth,
	type Component,
	type TUI,
} from "@earendil-works/pi-tui";
import type { SubAgentManager } from "../manager.ts";
import type {
	AgentLifecycleState,
	SubAgentManagerOverview,
	SubAgentManagerOverviewRow,
} from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";

export const SUB_AGENTS_WIDGET_KEY = "sub-agents" as const;
export const SUB_AGENTS_WIDGET_PLACEMENT = "aboveEditor" as const;
export const DEFAULT_STATUS_WIDGET_REFRESH_DELAY_MS = 50;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu;
const FULL_COUNT_WIDTH = 70;
const WIDE_ROW_WIDTH = 60;

const STATE_ABBREVIATIONS: Readonly<Record<AgentLifecycleState, string>> = Object.freeze({
	creating: "C",
	running: "R",
	idle: "I",
	blocked: "B",
	failed: "F",
	stopping: "S",
	removed: "H",
});

const STATE_ORDER: readonly AgentLifecycleState[] = Object.freeze([
	"creating",
	"running",
	"idle",
	"blocked",
	"failed",
	"stopping",
]);

export type SubAgentWidgetFactory = (
	tui: TUI,
	theme: Theme,
) => Component & { dispose?(): void };

export interface SubAgentWidgetHost {
	setWidget(
		key: string,
		content: SubAgentWidgetFactory | undefined,
		options?: { placement?: "aboveEditor" | "belowEditor" },
	): void;
}

export interface SubAgentWidgetManager {
	readonly generation: string;
	getOverview(maxRows?: number): SubAgentManagerOverview;
	subscribeChanges(listener: () => void): () => void;
}

export interface SubAgentStatusWidgetRuntimeOptions {
	manager: Pick<SubAgentManager, "generation" | "getOverview" | "subscribeChanges">;
	host: SubAgentWidgetHost;
	refreshDelayMs?: number;
}

function cleanSingleLine(value: unknown, maxChars = 240): string {
	return String(value ?? "")
		.replace(CONTROL_CHARACTERS, " ")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, maxChars);
}

function cloneOverview(overview: SubAgentManagerOverview): SubAgentManagerOverview {
	return {
		...overview,
		counts: { ...overview.counts },
		usage: { ...overview.usage },
		rows: overview.rows.map((row) => ({ ...row, activeTools: [...row.activeTools] })),
	};
}

function stateColor(state: AgentLifecycleState): "accent" | "success" | "warning" | "error" | "muted" | "dim" {
	switch (state) {
		case "running":
			return "accent";
		case "idle":
			return "success";
		case "blocked":
			return "warning";
		case "failed":
			return "error";
		case "creating":
			return "muted";
		case "stopping":
		case "removed":
			return "dim";
	}
}

function formatTokens(value: number): string {
	if (!Number.isFinite(value) || value >= Number.MAX_SAFE_INTEGER) return "9P+";
	if (value >= 1_000_000_000_000_000) return `${(value / 1_000_000_000_000_000).toFixed(1)}P`;
	if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}T`;
	if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
	return String(Math.max(0, Math.trunc(value)));
}

function formatCost(value: number): string {
	if (!Number.isFinite(value) || value >= Number.MAX_VALUE) return "$max";
	if (value === 0) return "$0";
	if (value < 0.0001) return "<$0.0001";
	if (value >= 1_000) return `$${value.toExponential(2)}`;
	return `$${value.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, "")}`;
}

function shortId(value: string): string {
	const normalized = cleanSingleLine(value, 200).replace(/[^A-Za-z0-9]/gu, "");
	return normalized.slice(-8) || "unknown";
}

function padPlain(value: string, width: number): string {
	const truncated = truncateToWidth(value, width, "…");
	return `${truncated}${" ".repeat(Math.max(0, width - visibleWidth(truncated)))}`;
}

function rowActivity(row: SubAgentManagerOverviewRow): string {
	if (row.state === "blocked") {
		return `needs: ${cleanSingleLine(row.blocker || "orchestration", SUB_AGENT_BOUNDS.statusWidgetBlockerChars)}`;
	}
	if (row.state === "failed") return "attention required";
	if (row.state === "creating") return "initializing";
	if (row.state === "stopping") return "cleaning up";
	if (row.state === "idle") return row.resultReady ? "result ready" : "idle";
	if (row.activeToolCount > 0) {
		const tools = row.activeTools.map((tool) => cleanSingleLine(tool, 80)).filter(Boolean);
		const visible = tools.length > 0 ? tools.join(", ") : "tool activity";
		return `tool ${visible}${row.omittedActiveToolCount > 0 ? ` +${row.omittedActiveToolCount}` : ""}`;
	}
	if (row.pendingMessageCount > 0) return `${row.pendingMessageCount} message(s) queued`;
	return cleanSingleLine(row.phase, 40) || "working";
}

function countText(snapshot: SubAgentManagerOverview, width: number, theme: Theme): string {
	if (width < 20) return `${snapshot.active} live`;
	const counts = STATE_ORDER.filter((state) => snapshot.counts[state] > 0).map((state) => {
		const label = width >= FULL_COUNT_WIDTH ? `${snapshot.counts[state]} ${state}` : `${STATE_ABBREVIATIONS[state]}${snapshot.counts[state]}`;
		return theme.fg(stateColor(state), label);
	});
	return counts.join(theme.fg("dim", " · ")) || "0 live";
}

function renderHeader(snapshot: SubAgentManagerOverview, width: number, theme: Theme): string[] {
	const label = theme.fg("accent", theme.bold("sub-agents: "));
	const counts = countText(snapshot, width, theme);
	const history = snapshot.historical > 0 ? ` · ${snapshot.historical} history` : "";
	const usage = `${formatTokens(snapshot.usage.totalTokens)} tok · ${formatCost(snapshot.usage.cost)}${snapshot.usageClamped ? "+" : ""}`;
	const combined = `${label}${counts}${theme.fg("dim", `${history} · ${usage}`)}`;
	if (visibleWidth(combined) <= width) return [combined];
	return [
		truncateToWidth(`${label}${counts}${theme.fg("dim", history)}`, width),
		truncateToWidth(theme.fg("dim", `  ${usage}`), width),
	];
}

function renderRow(row: SubAgentManagerOverviewRow, width: number, theme: Theme): string {
	const name = cleanSingleLine(row.name, SUB_AGENT_BOUNDS.nameChars) || "unnamed";
	const activity = rowActivity(row);
	const marker = theme.fg(stateColor(row.state), "•");
	if (width < WIDE_ROW_WIDTH) {
		return truncateToWidth(
			`${marker} ${theme.fg("text", name)} ${theme.fg("dim", `· ${row.state} · ${activity}`)}`,
			width,
		);
	}

	const nameWidth = Math.max(12, Math.min(28, width - 43));
	const state = padPlain(row.state, 8);
	return truncateToWidth(
		`${marker} ${theme.fg("dim", shortId(row.id))} ${theme.fg("text", padPlain(name, nameWidth))} ` +
			theme.fg(stateColor(row.state), state) +
			` ${theme.fg(row.state === "blocked" ? "warning" : "dim", activity)}`,
		width,
	);
}

/** Width-safe, theme-invalidatable persistent status component. */
export class SubAgentStatusWidget implements Component {
	#snapshot: SubAgentManagerOverview;
	#theme: Theme;
	#cachedWidth?: number;
	#cachedLines?: string[];
	#disposed = false;

	constructor(snapshot: SubAgentManagerOverview, theme: Theme) {
		this.#snapshot = cloneOverview(snapshot);
		this.#theme = theme;
	}

	setSnapshot(snapshot: SubAgentManagerOverview): void {
		if (this.#disposed) return;
		this.#snapshot = cloneOverview(snapshot);
		this.invalidate();
	}

	render(width: number): string[] {
		if (this.#disposed || width <= 0 || this.#snapshot.active === 0) return [];
		if (this.#cachedLines && this.#cachedWidth === width) return this.#cachedLines;
		const lines = renderHeader(this.#snapshot, width, this.#theme);
		for (const row of this.#snapshot.rows.slice(0, SUB_AGENT_BOUNDS.statusWidgetRows)) {
			lines.push(renderRow(row, width, this.#theme));
		}
		if (this.#snapshot.omittedRowCount > 0) {
			lines.push(
				truncateToWidth(
					this.#theme.fg("dim", `  … +${this.#snapshot.omittedRowCount} more live`),
					width,
				),
			);
		}
		this.#cachedWidth = width;
		this.#cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.#cachedWidth = undefined;
		this.#cachedLines = undefined;
	}

	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		this.invalidate();
	}
}

/** Session-generation widget bridge. It exists only in interactive TUI mode. */
export class SubAgentStatusWidgetRuntime {
	#manager: SubAgentWidgetManager;
	#host: SubAgentWidgetHost;
	#unsubscribe?: () => void;
	#component?: SubAgentStatusWidget;
	#tui?: TUI;
	#latestOverview?: SubAgentManagerOverview;
	#refreshDelayMs: number;
	#refreshTimer?: ReturnType<typeof setTimeout>;
	#visible = false;
	#closed = false;
	#updateFailures = 0;

	constructor(options: SubAgentStatusWidgetRuntimeOptions) {
		this.#manager = options.manager;
		this.#host = options.host;
		this.#refreshDelayMs = options.refreshDelayMs ?? DEFAULT_STATUS_WIDGET_REFRESH_DELAY_MS;
		if (!Number.isSafeInteger(this.#refreshDelayMs) || this.#refreshDelayMs < 1 || this.#refreshDelayMs > 60_000) {
			throw new Error("Widget refresh delay must be between 1 and 60000 milliseconds");
		}
		try {
			this.#unsubscribe = this.#manager.subscribeChanges(() => this.#scheduleRefresh());
			this.#refresh();
		} catch (error) {
			try {
				this.#unsubscribe?.();
			} finally {
				this.#unsubscribe = undefined;
				if (this.#visible) {
					try {
						this.#host.setWidget(SUB_AGENTS_WIDGET_KEY, undefined);
					} catch {
						// Preserve the initialization failure.
					}
				}
			}
			throw error;
		}
	}

	get closed(): boolean {
		return this.#closed;
	}

	get visible(): boolean {
		return this.#visible;
	}

	get updateFailures(): number {
		return this.#updateFailures;
	}

	get hasScheduledRefresh(): boolean {
		return this.#refreshTimer !== undefined;
	}

	flushNow(): boolean {
		if (this.#closed || this.#refreshTimer === undefined) return false;
		clearTimeout(this.#refreshTimer);
		this.#refreshTimer = undefined;
		this.#refresh();
		return true;
	}

	shutdown(): void {
		if (this.#closed) return;
		this.#closed = true;
		try {
			this.#unsubscribe?.();
		} finally {
			this.#unsubscribe = undefined;
			if (this.#refreshTimer !== undefined) clearTimeout(this.#refreshTimer);
			this.#refreshTimer = undefined;
			const wasVisible = this.#visible;
			this.#visible = false;
			this.#component = undefined;
			this.#tui = undefined;
			this.#latestOverview = undefined;
			if (wasVisible) this.#host.setWidget(SUB_AGENTS_WIDGET_KEY, undefined);
		}
	}

	#scheduleRefresh(): void {
		if (this.#closed || this.#refreshTimer !== undefined) return;
		this.#refreshTimer = setTimeout(() => {
			this.#refreshTimer = undefined;
			try {
				this.#refresh();
			} catch {
				this.#updateFailures += 1;
			}
		}, this.#refreshDelayMs);
		this.#refreshTimer.unref?.();
	}

	#refresh(): void {
		if (this.#closed) return;
		const snapshot = this.#manager.getOverview(SUB_AGENT_BOUNDS.statusWidgetRows);
		this.#latestOverview = cloneOverview(snapshot);
		if (snapshot.generation !== this.#manager.generation) return;
		if (snapshot.active === 0) {
			if (!this.#visible) return;
			this.#visible = false;
			this.#component = undefined;
			this.#tui = undefined;
			this.#host.setWidget(SUB_AGENTS_WIDGET_KEY, undefined);
			return;
		}

		if (this.#visible) {
			this.#component?.setSnapshot(snapshot);
			this.#tui?.requestRender();
			return;
		}

		this.#visible = true;
		try {
			this.#host.setWidget(
				SUB_AGENTS_WIDGET_KEY,
				(tui, theme) => {
					const current = this.#latestOverview ?? snapshot;
					const component = new SubAgentStatusWidget(current, theme);
					if (this.#closed || !this.#visible || current.active === 0) {
						component.dispose();
						return component;
					}
					this.#tui = tui;
					this.#component = component;
					return component;
				},
				{ placement: SUB_AGENTS_WIDGET_PLACEMENT },
			);
		} catch (error) {
			this.#visible = false;
			this.#component = undefined;
			this.#tui = undefined;
			throw error;
		}
	}
}

export function createSubAgentStatusWidgetRuntime(
	options: SubAgentStatusWidgetRuntimeOptions,
): SubAgentStatusWidgetRuntime {
	return new SubAgentStatusWidgetRuntime(options);
}
