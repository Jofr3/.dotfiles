import type {
	ExtensionCommandContext,
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	truncateToWidth,
	type Component,
	type TUI,
} from "@earendil-works/pi-tui";
import type { SubAgentManager } from "../manager.ts";
import {
	executeSubAgentsSend,
	type SubAgentsSendRuntime,
} from "../tools/send.ts";
import type {
	AgentLifecycleState,
	ManagedSubAgentSnapshot,
	SubAgentDashboardRow,
	SubAgentDashboardSnapshot,
	SubAgentId,
	SubAgentManagerSummary,
} from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";

const ANSI_ESCAPE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/gu;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu;
const DASHBOARD_REFRESH_DELAY_MS = 50;
const DASHBOARD_MAX_LINES = 48;

export type SubAgentDashboardAction =
	| { kind: "close" }
	| { kind: "send"; id: SubAgentId }
	| { kind: "release"; id: SubAgentId }
	| { kind: "remove"; id: SubAgentId }
	| { kind: "remove-all" };

export interface SubAgentDashboardManager {
	readonly generation: string;
	getSummary(): SubAgentManagerSummary;
	getDashboardSnapshot(maxRows?: number, includeRemoved?: boolean): SubAgentDashboardSnapshot;
	getAgent(id: SubAgentId): ManagedSubAgentSnapshot;
	listAgentIds(options?: { includeRemoved?: boolean }): SubAgentId[];
	releaseChildLeasesWithResult(
		id: SubAgentId,
		reason?: string,
	): Promise<{ snapshot: ManagedSubAgentSnapshot; released: readonly unknown[] }>;
	removeAgent(id: SubAgentId, reason?: string): Promise<ManagedSubAgentSnapshot>;
	subscribeChanges(listener: () => void): () => void;
}

export interface SubAgentDashboardRuntime {
	readonly manager: SubAgentDashboardManager;
	readonly sendRuntime: SubAgentsSendRuntime;
	readonly closed: boolean;
	registerActiveDialog(close: () => void): () => void;
	shutdown(): void;
}

export interface SubAgentDashboardComponentOptions {
	manager: Pick<
		SubAgentManager,
		"generation" | "getDashboardSnapshot" | "getAgent" | "subscribeChanges"
	>;
	tui: Pick<TUI, "requestRender">;
	theme: Theme;
	keybindings: Pick<KeybindingsManager, "matches">;
	onAction(action: SubAgentDashboardAction): void;
	refreshDelayMs?: number;
}

function cleanLine(value: unknown, maxChars = SUB_AGENT_BOUNDS.dashboardFieldChars): string {
	return String(value ?? "")
		.replace(ANSI_ESCAPE, "")
		.replace(CONTROL_CHARACTERS, " ")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, Math.max(0, maxChars));
}

function stateColor(
	state: AgentLifecycleState,
): "accent" | "success" | "warning" | "error" | "muted" | "dim" {
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

function shortId(id: string): string {
	const normalized = cleanLine(id, SUB_AGENT_BOUNDS.agentIdChars).replace(/[^A-Za-z0-9]/gu, "");
	return normalized.slice(-8) || "unknown";
}

function cloneDashboardSnapshot(snapshot: SubAgentDashboardSnapshot): SubAgentDashboardSnapshot {
	return {
		...snapshot,
		counts: { ...snapshot.counts },
		usage: { ...snapshot.usage },
		rows: snapshot.rows.map((row) => ({ ...row, tags: [...row.tags] })),
	};
}

function selectedActivity(row: SubAgentDashboardRow): string {
	if (row.state === "removed") return "history";
	if (row.pendingMessageCount > 0) return `${row.pendingMessageCount} queued`;
	if (row.state === "idle" && row.resultReady) return "result ready";
	if (row.state === "running") return cleanLine(row.phase, 32) || "working";
	return row.assignmentCount > 0 ? `${row.assignmentCount} assignment(s)` : cleanLine(row.phase, 32);
}

function appendLine(lines: string[], width: number, value: string): void {
	lines.push(truncateToWidth(value, Math.max(1, width), "…"));
}

/** Interactive, bounded list/detail component for the human operator. */
export class SubAgentDashboardComponent implements Component {
	#manager: SubAgentDashboardComponentOptions["manager"];
	#tui: Pick<TUI, "requestRender">;
	#theme: Theme;
	#keybindings: Pick<KeybindingsManager, "matches">;
	#onAction: (action: SubAgentDashboardAction) => void;
	#snapshot: SubAgentDashboardSnapshot;
	#detail?: ManagedSubAgentSnapshot;
	#selectedIndex = 0;
	#scrollOffset = 0;
	#view: "list" | "detail" = "list";
	#includeRemoved = true;
	#unsubscribe?: () => void;
	#refreshTimer?: ReturnType<typeof setTimeout>;
	#refreshDelayMs: number;
	#cachedWidth?: number;
	#cachedLines?: string[];
	#disposed = false;

	constructor(options: SubAgentDashboardComponentOptions) {
		this.#manager = options.manager;
		this.#tui = options.tui;
		this.#theme = options.theme;
		this.#keybindings = options.keybindings;
		this.#onAction = options.onAction;
		this.#refreshDelayMs = options.refreshDelayMs ?? DASHBOARD_REFRESH_DELAY_MS;
		if (!Number.isSafeInteger(this.#refreshDelayMs) || this.#refreshDelayMs < 1 || this.#refreshDelayMs > 60_000) {
			throw new Error("Dashboard refresh delay must be between 1 and 60000 milliseconds");
		}
		this.#snapshot = cloneDashboardSnapshot(
			this.#manager.getDashboardSnapshot(SUB_AGENT_BOUNDS.dashboardAgents, this.#includeRemoved),
		);
		this.#updateDetail();
		try {
			this.#unsubscribe = this.#manager.subscribeChanges(() => this.#scheduleRefresh());
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	get view(): "list" | "detail" {
		return this.#view;
	}

	get selectedId(): SubAgentId | undefined {
		return this.#snapshot.rows[this.#selectedIndex]?.id;
	}

	get hasScheduledRefresh(): boolean {
		return this.#refreshTimer !== undefined;
	}

	flushNow(): boolean {
		if (this.#disposed || this.#refreshTimer === undefined) return false;
		clearTimeout(this.#refreshTimer);
		this.#refreshTimer = undefined;
		this.#refresh();
		return true;
	}

	handleInput(data: string): void {
		if (this.#disposed) return;
		if (data === "q") {
			this.#onAction({ kind: "close" });
			return;
		}
		if (this.#keybindings.matches(data, "tui.select.cancel")) {
			if (this.#view === "detail") {
				this.#view = "list";
				this.invalidate();
				this.#tui.requestRender();
			} else {
				this.#onAction({ kind: "close" });
			}
			return;
		}
		if (data === "r") {
			this.#refresh();
			this.#tui.requestRender();
			return;
		}
		if (data === "h") {
			this.#includeRemoved = !this.#includeRemoved;
			this.#refresh();
			this.#tui.requestRender();
			return;
		}
		const selected = this.#snapshot.rows[this.#selectedIndex];
		if (data === "m" && selected && (selected.state === "idle" || selected.state === "running" || selected.state === "blocked")) {
			this.#onAction({ kind: "send", id: selected.id });
			return;
		}
		if (data === "l" && selected && (selected.state === "idle" || selected.state === "blocked")) {
			this.#onAction({ kind: "release", id: selected.id });
			return;
		}
		if (data === "x" && selected && selected.state !== "removed") {
			this.#onAction({ kind: "remove", id: selected.id });
			return;
		}
		if (data === "X" && this.#snapshot.active > 0) {
			this.#onAction({ kind: "remove-all" });
			return;
		}
		if (this.#view === "detail") {
			if (this.#keybindings.matches(data, "tui.editor.cursorLeft")) {
				this.#view = "list";
				this.invalidate();
				this.#tui.requestRender();
			}
			return;
		}
		if (this.#keybindings.matches(data, "tui.select.up")) {
			this.#moveSelection(-1);
			return;
		}
		if (this.#keybindings.matches(data, "tui.select.down")) {
			this.#moveSelection(1);
			return;
		}
		if (this.#keybindings.matches(data, "tui.select.pageUp")) {
			this.#moveSelection(-SUB_AGENT_BOUNDS.dashboardPageRows);
			return;
		}
		if (this.#keybindings.matches(data, "tui.select.pageDown")) {
			this.#moveSelection(SUB_AGENT_BOUNDS.dashboardPageRows);
			return;
		}
		if (this.#keybindings.matches(data, "tui.select.confirm") && selected) {
			this.#view = "detail";
			this.#updateDetail();
			this.invalidate();
			this.#tui.requestRender();
		}
	}

	render(width: number): string[] {
		if (this.#disposed || width <= 0) return [];
		if (this.#cachedLines && this.#cachedWidth === width) return this.#cachedLines;
		const lines = this.#view === "list" ? this.#renderList(width) : this.#renderDetail(width);
		this.#cachedWidth = width;
		if (lines.length <= DASHBOARD_MAX_LINES) {
			this.#cachedLines = lines;
		} else {
			const footer = lines.slice(-3);
			this.#cachedLines = [
				...lines.slice(0, DASHBOARD_MAX_LINES - footer.length - 1),
				truncateToWidth(this.#theme.fg("warning", "… additional detail omitted"), Math.max(1, width), "…"),
				...footer,
			];
		}
		return this.#cachedLines;
	}

	invalidate(): void {
		this.#cachedWidth = undefined;
		this.#cachedLines = undefined;
	}

	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		try {
			this.#unsubscribe?.();
		} finally {
			this.#unsubscribe = undefined;
			if (this.#refreshTimer !== undefined) clearTimeout(this.#refreshTimer);
			this.#refreshTimer = undefined;
			this.#detail = undefined;
			this.invalidate();
		}
	}

	#moveSelection(delta: number): void {
		if (this.#snapshot.rows.length === 0) return;
		this.#selectedIndex = Math.max(
			0,
			Math.min(this.#snapshot.rows.length - 1, this.#selectedIndex + delta),
		);
		this.#ensureSelectionVisible();
		this.#updateDetail();
		this.invalidate();
		this.#tui.requestRender();
	}

	#ensureSelectionVisible(): void {
		const pageSize = SUB_AGENT_BOUNDS.dashboardPageRows;
		if (this.#selectedIndex < this.#scrollOffset) this.#scrollOffset = this.#selectedIndex;
		if (this.#selectedIndex >= this.#scrollOffset + pageSize) {
			this.#scrollOffset = this.#selectedIndex - pageSize + 1;
		}
		this.#scrollOffset = Math.max(
			0,
			Math.min(this.#scrollOffset, Math.max(0, this.#snapshot.rows.length - pageSize)),
		);
	}

	#scheduleRefresh(): void {
		if (this.#disposed || this.#refreshTimer !== undefined) return;
		this.#refreshTimer = setTimeout(() => {
			this.#refreshTimer = undefined;
			try {
				this.#refresh();
				this.#tui.requestRender();
			} catch {
				// The command will close or explicitly refresh after a lifecycle replacement.
			}
		}, this.#refreshDelayMs);
		this.#refreshTimer.unref?.();
	}

	#refresh(): void {
		if (this.#disposed) return;
		const previousId = this.selectedId;
		const snapshot = this.#manager.getDashboardSnapshot(
			SUB_AGENT_BOUNDS.dashboardAgents,
			this.#includeRemoved,
		);
		if (snapshot.generation !== this.#manager.generation) return;
		this.#snapshot = cloneDashboardSnapshot(snapshot);
		const retainedIndex = previousId
			? this.#snapshot.rows.findIndex((row) => row.id === previousId)
			: -1;
		this.#selectedIndex = retainedIndex >= 0
			? retainedIndex
			: Math.min(this.#selectedIndex, Math.max(0, this.#snapshot.rows.length - 1));
		this.#ensureSelectionVisible();
		this.#updateDetail();
		this.invalidate();
	}

	#updateDetail(): void {
		const id = this.selectedId;
		if (!id) {
			this.#detail = undefined;
			return;
		}
		try {
			this.#detail = this.#manager.getAgent(id);
		} catch {
			this.#detail = undefined;
		}
	}

	#renderHeader(lines: string[], width: number, label: string): void {
		appendLine(lines, width, this.#theme.fg("accent", "─".repeat(Math.max(1, width))));
		appendLine(lines, width, this.#theme.fg("accent", this.#theme.bold(label)));
		const counts = Object.entries(this.#snapshot.counts)
			.filter(([, count]) => count > 0)
			.map(([state, count]) => `${state} ${count}`)
			.join(" · ") || "empty";
		appendLine(
			lines,
			width,
			this.#theme.fg("dim", `${counts} · ${formatTokens(this.#snapshot.usage.totalTokens)} tok · ${formatCost(this.#snapshot.usage.cost)}${this.#snapshot.usageClamped ? "+" : ""}`),
		);
	}

	#renderList(width: number): string[] {
		const lines: string[] = [];
		this.#renderHeader(lines, width, "Sub-Agents");
		if (this.#snapshot.rows.length === 0) {
			appendLine(lines, width, this.#theme.fg("muted", "No sub-agents in this session generation."));
		} else {
			const end = Math.min(
				this.#snapshot.rows.length,
				this.#scrollOffset + SUB_AGENT_BOUNDS.dashboardPageRows,
			);
			for (let index = this.#scrollOffset; index < end; index += 1) {
				const row = this.#snapshot.rows[index];
				const selected = index === this.#selectedIndex;
				const prefix = selected ? this.#theme.fg("accent", ">") : " ";
				const tags = row.tags.length ? ` · ${row.tags.slice(0, 2).map((tag) => cleanLine(tag, 40)).join(",")}` : "";
				appendLine(
					lines,
					width,
					`${prefix} ${this.#theme.fg(stateColor(row.state), "●")} ${this.#theme.fg("dim", shortId(row.id))} ${this.#theme.fg(selected ? "accent" : "text", cleanLine(row.name, SUB_AGENT_BOUNDS.nameChars) || "unnamed")} ${this.#theme.fg(stateColor(row.state), `· ${row.state}`)} ${this.#theme.fg("dim", `· ${selectedActivity(row)}${tags}`)}`,
				);
			}
			const page = `${this.#scrollOffset + 1}-${end}/${this.#snapshot.rows.length}`;
			const omitted = this.#snapshot.omittedRowCount > 0 ? ` · ${this.#snapshot.omittedRowCount} omitted` : "";
			appendLine(lines, width, this.#theme.fg("dim", `  ${page}${omitted}`));
		}
		appendLine(lines, width, "");
		appendLine(lines, width, this.#theme.fg("dim", `↑↓/Pg navigate · Enter detail · h ${this.#includeRemoved ? "hide" : "show"} history · r refresh`));
		appendLine(lines, width, this.#theme.fg("dim", "m message/resume · l release leases · x remove · X remove all · Esc/q close"));
		appendLine(lines, width, this.#theme.fg("accent", "─".repeat(Math.max(1, width))));
		return lines;
	}

	#renderDetail(width: number): string[] {
		const lines: string[] = [];
		const detail = this.#detail;
		this.#renderHeader(lines, width, detail ? `Sub-Agent: ${cleanLine(detail.spec.name, SUB_AGENT_BOUNDS.nameChars)}` : "Sub-Agent Detail");
		if (!detail) {
			appendLine(lines, width, this.#theme.fg("warning", "The selected sub-agent is no longer available."));
		} else {
			appendLine(lines, width, `${this.#theme.fg("muted", "id: ")}${this.#theme.fg("accent", cleanLine(detail.id, SUB_AGENT_BOUNDS.agentIdChars))}`);
			appendLine(lines, width, `${this.#theme.fg("muted", "state: ")}${this.#theme.fg(stateColor(detail.state), detail.state)} ${this.#theme.fg("dim", `· assignments ${detail.assignmentCount}`)}`);
			if (detail.restoredHistory) {
				appendLine(
					lines,
					width,
					this.#theme.fg(
						"dim",
						`history: restored ${detail.restoredHistory.checkpointState} checkpoint · no live runtime`,
					),
				);
				if (detail.restoredHistory.statusSummary) {
					appendLine(lines, width, this.#theme.fg("dim", `history status: ${cleanLine(detail.restoredHistory.statusSummary)}`));
				}
			}
			appendLine(lines, width, `${this.#theme.fg("muted", "role: ")}${this.#theme.fg("text", cleanLine(detail.spec.role))}`);
			if (detail.spec.tags?.length) appendLine(lines, width, this.#theme.fg("dim", `tags: ${detail.spec.tags.map((tag) => cleanLine(tag, 80)).join(", ")}`));
			if (detail.currentAssignment) {
				appendLine(lines, width, this.#theme.fg("dim", `assignment #${detail.currentAssignment.sequence}: ${detail.currentAssignment.state}`));
				if (detail.currentAssignment.blocker) appendLine(lines, width, this.#theme.fg("warning", `blocker: ${cleanLine(detail.currentAssignment.blocker)}`));
			}
			if (detail.modelRoute) {
				appendLine(lines, width, this.#theme.fg("dim", `model: ${cleanLine(detail.modelRoute.selectedModel.provider, 128)}/${cleanLine(detail.modelRoute.selectedModel.id, 256)}${detail.modelRoute.selectedTier ? ` · ${detail.modelRoute.selectedTier}` : ""}${detail.modelRoute.fallbackUsed ? " · fallback" : ""}`));
			}
			if (detail.effectiveThinkingLevel) appendLine(lines, width, this.#theme.fg("dim", `thinking: ${detail.effectiveThinkingLevel}`));
			if (detail.pendingModelReconfiguration) {
				appendLine(lines, width, this.#theme.fg("warning", `queued model: ${cleanLine(detail.pendingModelReconfiguration.route.selectedModel.provider, 128)}/${cleanLine(detail.pendingModelReconfiguration.route.selectedModel.id, 256)} · after assignment`));
			}
			const toolNames = detail.runtime.activeTools
				.slice(0, SUB_AGENT_BOUNDS.statusWidgetTools)
				.map((tool) => cleanLine(tool.toolName, 128))
				.filter(Boolean);
			appendLine(lines, width, this.#theme.fg("dim", `runtime: ${detail.runtime.phase} · tools ${detail.runtime.activeToolCount}${toolNames.length ? ` (${toolNames.join(", ")})` : ""} · queued ${detail.runtime.pendingMessageCount}`));
			if (detail.latestReport) {
				appendLine(lines, width, this.#theme.fg(detail.latestReport.state === "blocked" ? "warning" : "muted", `report/${detail.latestReport.state}: ${cleanLine(detail.latestReport.summary)}`));
				if (detail.latestReport.details) appendLine(lines, width, this.#theme.fg("dim", `report detail: ${cleanLine(detail.latestReport.details)}`));
				if (detail.latestReport.needs) appendLine(lines, width, this.#theme.fg("warning", `needs: ${cleanLine(detail.latestReport.needs)}`));
			}
			if (detail.latestResult) {
				appendLine(lines, width, this.#theme.fg("success", `result: ${cleanLine(detail.latestResult.summary)}`));
				if (detail.latestResult.details) appendLine(lines, width, this.#theme.fg("dim", `result detail: ${cleanLine(detail.latestResult.details)}`));
			}
			if (detail.lastError) appendLine(lines, width, this.#theme.fg("error", `error: ${cleanLine(detail.lastError)}`));
			appendLine(lines, width, this.#theme.fg("dim", `usage: ${detail.usage.turns} turns · ${formatTokens(detail.usage.totals.totalTokens)} tok · ${formatCost(detail.usage.totals.cost)} · reported ${formatTokens(detail.usage.reported.totalTokens)} tok`));
			appendLine(lines, width, this.#theme.fg("dim", `workspace: ${cleanLine(detail.spec.workspace?.mode ?? "shared", 32)}${detail.spec.workspace?.cwd ? ` · ${cleanLine(detail.spec.workspace.cwd, 300)}` : ""}`));
			if (detail.restoredHistory?.files.length) {
				appendLine(lines, width, this.#theme.fg("accent", "historical files"));
				for (const file of detail.restoredHistory.files.slice(0, SUB_AGENT_BOUNDS.dashboardLeases)) {
					appendLine(lines, width, this.#theme.fg("dim", `  ${cleanLine(file, 420)}`));
				}
				const omitted = detail.restoredHistory.omittedFileCount +
					Math.max(0, detail.restoredHistory.files.length - SUB_AGENT_BOUNDS.dashboardLeases);
				if (omitted > 0) appendLine(lines, width, this.#theme.fg("dim", `  … ${omitted} historical file(s) omitted`));
			}
			if (detail.leases.length > 0) {
				appendLine(lines, width, this.#theme.fg("accent", "leases"));
				for (const lease of detail.leases.slice(0, SUB_AGENT_BOUNDS.dashboardLeases)) {
					appendLine(lines, width, this.#theme.fg("dim", `  ${lease.kind}: ${cleanLine(lease.path ?? lease.workspaceKey, 420)}`));
				}
				if (detail.leases.length > SUB_AGENT_BOUNDS.dashboardLeases) appendLine(lines, width, this.#theme.fg("dim", `  … ${detail.leases.length - SUB_AGENT_BOUNDS.dashboardLeases} more lease(s)`));
			}
			const events = detail.events.slice(-SUB_AGENT_BOUNDS.dashboardEvents);
			if (events.length > 0) {
				appendLine(lines, width, this.#theme.fg("accent", "recent events"));
				for (const event of events) {
					appendLine(lines, width, this.#theme.fg("dim", `  #${event.sequence} ${event.kind}/${event.state}: ${cleanLine(event.summary)}`));
				}
				const omitted = detail.omittedEventCount + Math.max(0, detail.events.length - events.length);
				if (omitted > 0) appendLine(lines, width, this.#theme.fg("dim", `  … ${omitted} earlier event(s) omitted`));
			}
			if (detail.state === "removed" && detail.removalReason) appendLine(lines, width, this.#theme.fg("dim", `removed: ${cleanLine(detail.removalReason)}`));
		}
		appendLine(lines, width, "");
		appendLine(lines, width, this.#theme.fg("dim", "←/Esc back · m message/resume · l release leases · x remove · X remove all · h history · r refresh · q close"));
		appendLine(lines, width, this.#theme.fg("accent", "─".repeat(Math.max(1, width))));
		return lines;
	}
}

export class SubAgentDashboardRuntimeState implements SubAgentDashboardRuntime {
	readonly manager: SubAgentDashboardManager;
	readonly sendRuntime: SubAgentsSendRuntime;
	#activeClosers = new Set<() => void>();
	#closed = false;

	constructor(options: {
		manager: SubAgentDashboardManager;
		sendRuntime: SubAgentsSendRuntime;
	}) {
		this.manager = options.manager;
		this.sendRuntime = options.sendRuntime;
	}

	get closed(): boolean {
		return this.#closed;
	}

	registerActiveDialog(close: () => void): () => void {
		if (typeof close !== "function") throw new Error("Dashboard close callback is required");
		if (this.#closed) {
			close();
			return () => undefined;
		}
		this.#activeClosers.add(close);
		let registered = true;
		return () => {
			if (!registered) return;
			registered = false;
			this.#activeClosers.delete(close);
		};
	}

	shutdown(): void {
		if (this.#closed) return;
		this.#closed = true;
		const closers = [...this.#activeClosers];
		this.#activeClosers.clear();
		for (const close of closers) {
			try {
				close();
			} catch {
				// Lifecycle cleanup must continue to manager disposal.
			}
		}
	}
}

export function createSubAgentDashboardRuntime(options: {
	manager: SubAgentDashboardManager;
	sendRuntime: SubAgentsSendRuntime;
}): SubAgentDashboardRuntime {
	return new SubAgentDashboardRuntimeState(options);
}

function dashboardFallback(summary: SubAgentManagerSummary): string {
	return `sub-agents ${summary.generation}: ${summary.active} active · ${summary.historical} historical`;
}

async function sendManualMessage(
	ctx: ExtensionCommandContext,
	runtime: SubAgentDashboardRuntime,
	id: SubAgentId,
): Promise<void> {
	let snapshot: ManagedSubAgentSnapshot;
	try {
		snapshot = runtime.manager.getAgent(id);
	} catch {
		ctx.ui.notify("sub-agents: the selected child is no longer available", "warning");
		return;
	}
	const safeName = cleanLine(snapshot.spec.name, SUB_AGENT_BOUNDS.nameChars) || "unnamed";
	if (snapshot.state !== "idle" && snapshot.state !== "running" && snapshot.state !== "blocked") {
		ctx.ui.notify(`sub-agents: ${safeName} cannot accept a message while ${snapshot.state}`, "warning");
		return;
	}
	const message = await ctx.ui.editor(
		`Message ${safeName} (do not include credentials or secrets)`,
	);
	if (message === undefined) return;
	const trimmed = message.trim();
	if (!trimmed) {
		ctx.ui.notify("sub-agents: message was empty", "warning");
		return;
	}
	if (trimmed.length > SUB_AGENT_BOUNDS.objectiveChars) {
		ctx.ui.notify(`sub-agents: message exceeds ${SUB_AGENT_BOUNDS.objectiveChars} characters`, "error");
		return;
	}
	let delivery: "followUp" | "steer" = "followUp";
	if (snapshot.state === "running") {
		const selected = await ctx.ui.select("Message delivery", [
			"Follow up after current work",
			"Steer the current assignment",
		]);
		if (!selected) return;
		delivery = selected.startsWith("Steer") ? "steer" : "followUp";
	}
	try {
		const result = await executeSubAgentsSend(
			{ messages: [{ id, message: trimmed, delivery }] },
			undefined,
			runtime.sendRuntime,
		);
		const outcome = result.details.outcomes[0];
		if (outcome?.ok) {
			ctx.ui.notify(`sub-agents: message accepted for ${safeName}`, "info");
		} else {
			ctx.ui.notify(`sub-agents: ${outcome?.message ?? "message delivery failed"}`, "error");
		}
	} catch {
		ctx.ui.notify("sub-agents: message delivery failed", "error");
	}
}

async function releaseSelected(
	ctx: ExtensionCommandContext,
	runtime: SubAgentDashboardRuntime,
	id: SubAgentId,
): Promise<void> {
	let snapshot: ManagedSubAgentSnapshot;
	try {
		snapshot = runtime.manager.getAgent(id);
	} catch {
		ctx.ui.notify("sub-agents: the selected child is no longer available", "warning");
		return;
	}
	const safeName = cleanLine(snapshot.spec.name, SUB_AGENT_BOUNDS.nameChars) || "unnamed";
	if (snapshot.state !== "idle" && snapshot.state !== "blocked") {
		ctx.ui.notify(`sub-agents: ${safeName} can release leases only while idle or blocked`, "warning");
		return;
	}
	if (snapshot.leases.length === 0) {
		ctx.ui.notify(`sub-agents: ${safeName} has no retained leases`, "info");
		return;
	}
	const confirmed = await ctx.ui.confirm(
		`Release ${snapshot.leases.length} lease${snapshot.leases.length === 1 ? "" : "s"} from ${safeName}?`,
		"This keeps the child and transcript alive but permits other cooperating parent/child mutations. Future guarded work must reacquire ownership.",
	);
	if (!confirmed) return;
	try {
		const result = await runtime.manager.releaseChildLeasesWithResult(
			id,
			"released from /sub-agents dashboard",
		);
		ctx.ui.notify(
			`sub-agents: released ${result.released.length} lease${result.released.length === 1 ? "" : "s"} from ${safeName}`,
			"info",
		);
	} catch {
		ctx.ui.notify(`sub-agents: could not release leases from ${safeName}`, "error");
	}
}

async function removeSelected(
	ctx: ExtensionCommandContext,
	runtime: SubAgentDashboardRuntime,
	id: SubAgentId,
): Promise<void> {
	let snapshot: ManagedSubAgentSnapshot;
	try {
		snapshot = runtime.manager.getAgent(id);
	} catch {
		ctx.ui.notify("sub-agents: the selected child is no longer available", "warning");
		return;
	}
	const safeName = cleanLine(snapshot.spec.name, SUB_AGENT_BOUNDS.nameChars) || "unnamed";
	if (snapshot.state === "removed") {
		ctx.ui.notify(`sub-agents: ${safeName} is already removed`, "info");
		return;
	}
	const confirmed = await ctx.ui.confirm(
		`Remove ${safeName}?`,
		"This immediately stops the child, permanently disposes its retained runtime context, and keeps only bounded history.",
	);
	if (!confirmed) return;
	try {
		await runtime.manager.removeAgent(id, "removed from /sub-agents dashboard");
		ctx.ui.notify(`sub-agents: removed ${safeName}`, "info");
	} catch {
		ctx.ui.notify(`sub-agents: could not remove ${safeName}`, "error");
	}
}

async function removeAll(
	ctx: ExtensionCommandContext,
	runtime: SubAgentDashboardRuntime,
): Promise<void> {
	let ids: SubAgentId[];
	try {
		ids = runtime.manager.listAgentIds({ includeRemoved: false });
	} catch {
		ctx.ui.notify("sub-agents: could not inspect live children", "error");
		return;
	}
	if (ids.length === 0) {
		ctx.ui.notify("sub-agents: there are no live children to remove", "info");
		return;
	}
	const confirmed = await ctx.ui.confirm(
		`Remove ${ids.length} live sub-agent${ids.length === 1 ? "" : "s"}?`,
		"This immediately stops every child in the captured set and permanently disposes retained runtime context.",
	);
	if (!confirmed) return;
	const outcomes = await Promise.allSettled(
		ids.map((id) => runtime.manager.removeAgent(id, "removed all from /sub-agents dashboard")),
	);
	const removed = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
	const failed = outcomes.length - removed;
	ctx.ui.notify(
		`sub-agents: ${removed} removed${failed ? ` · ${failed} failed` : ""}`,
		failed ? "warning" : "info",
	);
}

/** Open/reopen the dashboard around review-sensitive editor and confirmation dialogs. */
export async function runSubAgentsDashboardCommand(
	ctx: ExtensionCommandContext,
	runtime: SubAgentDashboardRuntime | undefined,
): Promise<void> {
	if (!runtime) {
		ctx.ui.notify("sub-agents: inactive (no parent session generation)", "warning");
		return;
	}
	if (ctx.mode !== "tui") {
		if (ctx.hasUI) ctx.ui.notify(dashboardFallback(runtime.manager.getSummary()), "info");
		return;
	}
	if (runtime.closed) {
		ctx.ui.notify("sub-agents: this dashboard generation is no longer active", "warning");
		return;
	}

	while (!runtime.closed) {
		let unregister = () => undefined;
		let action: SubAgentDashboardAction | undefined;
		try {
			action = await ctx.ui.custom<SubAgentDashboardAction>((tui, theme, keybindings, done) => {
				let finished = false;
				const finish = (next: SubAgentDashboardAction) => {
					if (finished) return;
					finished = true;
					unregister();
					done(next);
				};
				unregister = runtime.registerActiveDialog(() => finish({ kind: "close" }));
				return new SubAgentDashboardComponent({
					manager: runtime.manager,
					tui,
					theme,
					keybindings,
					onAction: finish,
				});
			});
		} finally {
			unregister();
		}
		if (!action || action.kind === "close" || runtime.closed) return;
		if (action.kind === "send") await sendManualMessage(ctx, runtime, action.id);
		else if (action.kind === "release") await releaseSelected(ctx, runtime, action.id);
		else if (action.kind === "remove") await removeSelected(ctx, runtime, action.id);
		else await removeAll(ctx, runtime);
	}
}
