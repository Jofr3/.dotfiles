import type {
	Theme,
	ToolRenderContext,
	ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component } from "@earendil-works/pi-tui";
import type {
	SpawnAgentOutcome,
	SubAgentsSpawnToolDetails,
} from "../tools/spawn.ts";
import type {
	StatusAgentOutcome,
	SubAgentsStatusToolDetails,
} from "../tools/status.ts";
import type {
	SendTargetOutcome,
	SubAgentsSendToolDetails,
} from "../tools/send.ts";
import type {
	ReleaseTargetOutcome,
	SubAgentsReleaseToolDetails,
} from "../tools/release.ts";
import type {
	ReconfigureRouteView,
	ReconfigureTargetOutcome,
	SubAgentsReconfigureToolDetails,
} from "../tools/reconfigure.ts";
import type {
	SubAgentsWaitToolDetails,
	WaitProgressOutcome,
	WaitTargetOutcome,
} from "../tools/wait.ts";
import type {
	RemoveTargetOutcome,
	SubAgentsRemoveToolDetails,
} from "../tools/remove.ts";
import type {
	SubAgentsRemoveInput,
	SubAgentsReconfigureInput,
	SubAgentsReleaseInput,
	SubAgentsSendInput,
	SubAgentsSpawnInput,
	SubAgentsStatusInput,
	SubAgentsWaitInput,
} from "../tools/schemas.ts";
import type { AgentLifecycleState, UsageCounters } from "../types.ts";

const CONTROL_CHARACTERS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]+/gu;
const ANSI_ESCAPE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/gu;
const DEFAULT_WAIT_TIMEOUT_SECONDS = 120;
const DEFAULT_REMOVE_GRACE_SECONDS = 10;
const FALLBACK_LINES = 40;
const FALLBACK_LINE_CHARS = 512;

type ForegroundColor =
	| "accent"
	| "success"
	| "warning"
	| "error"
	| "muted"
	| "dim"
	| "toolOutput";

type RenderResult<TDetails> = {
	content: Array<{ type: string; text?: string }>;
	details?: TDetails;
};

/** Strip terminal controls and collapse one renderer value to bounded display text. */
export function cleanRendererLine(value: unknown, maxChars = 512): string {
	return String(value ?? "")
		.replace(ANSI_ESCAPE, "")
		.replace(CONTROL_CHARACTERS, " ")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, Math.max(0, maxChars));
}

function cleanFallback(result: RenderResult<unknown>): string {
	const text = result.content.find((item) => item.type === "text")?.text ?? "";
	return text
		.replace(ANSI_ESCAPE, "")
		.replace(/\r/gu, "")
		.split("\n")
		.slice(0, FALLBACK_LINES)
		.map((line) => cleanRendererLine(line, FALLBACK_LINE_CHARS))
		.join("\n");
}

/** Reuse the row-local Text component while replacing its width-safe content. */
export function updateRendererText(
	context: Pick<ToolRenderContext, "lastComponent">,
	text: string,
): Text {
	const component = context.lastComponent instanceof Text
		? context.lastComponent
		: new Text("", 0, 0);
	component.setText(text);
	return component;
}

function renderFallback(
	result: RenderResult<unknown>,
	theme: Theme,
	context: Pick<ToolRenderContext, "lastComponent">,
): Text {
	return updateRendererText(context, theme.fg("toolOutput", cleanFallback(result)));
}

function title(theme: Theme, name: string): string {
	return theme.fg("toolTitle", theme.bold(`${name} `));
}

function count(value: unknown): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function elapsed(value: unknown): string {
	const milliseconds = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
	if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
	if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`;
	return `${(milliseconds / 60_000).toFixed(milliseconds < 600_000 ? 1 : 0)}m`;
}

function formatTokens(value: unknown): string {
	const tokens = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
	if (tokens < 1_000) return `${Math.trunc(tokens)}`;
	if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(tokens < 10_000 ? 1 : 0)}k`;
	if (tokens < 1_000_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	return `${(tokens / 1_000_000_000).toFixed(1)}B`;
}

function formatCost(value: unknown): string {
	const cost = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
	if (cost === 0) return "$0";
	if (cost < 0.0001) return "<$0.0001";
	if (cost >= 1_000) return `$${cost.toExponential(2)}`;
	return `$${cost.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, "")}`;
}

function stateColor(state: AgentLifecycleState): ForegroundColor {
	switch (state) {
		case "idle":
			return "success";
		case "running":
			return "accent";
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

function idText(theme: Theme, value: unknown): string {
	return theme.fg("accent", cleanRendererLine(value, 200) || "unknown");
}

function errorText(theme: Theme, code: unknown, message?: unknown): string {
	const safeCode = cleanRendererLine(code, 64) || "failed";
	const safeMessage = cleanRendererLine(message, 512);
	return theme.fg("error", safeMessage ? `${safeCode}: ${safeMessage}` : safeCode);
}

function routeText(route: ReconfigureRouteView | undefined): string {
	if (!route) return "none";
	return `${cleanRendererLine(route.provider, 64)}/${cleanRendererLine(route.model, 112)}`;
}

function usageText(usage: UsageCounters | undefined): string | undefined {
	if (!usage) return undefined;
	return `${formatTokens(usage.totalTokens)} tok · ${formatCost(usage.cost)}`;
}

function appendFiles(lines: string[], theme: Theme, files: readonly string[] | undefined, omitted = 0): void {
	if (!files?.length && omitted <= 0) return;
	const safeFiles = (files ?? []).map((file) => cleanRendererLine(file, 256)).filter(Boolean);
	const suffix = omitted > 0 ? ` +${omitted}` : "";
	lines.push(`  ${theme.fg("dim", `files: ${safeFiles.join(", ")}${suffix}`)}`);
}

function spawnName(args: SubAgentsSpawnInput, outcome: SpawnAgentOutcome): string {
	return cleanRendererLine(args.agents[outcome.index]?.name, 120) || `agent ${outcome.index + 1}`;
}

export function renderSpawnCall(
	args: SubAgentsSpawnInput,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsSpawnInput>,
): Component {
	const agents = Array.isArray(args.agents) ? args.agents : [];
	const names = agents.slice(0, 3).map((agent) => cleanRendererLine(agent?.name, 64)).filter(Boolean);
	const overflow = agents.length > names.length ? ` +${agents.length - names.length}` : "";
	return updateRendererText(
		context,
		title(theme, "sub_agents_spawn") +
			theme.fg("muted", `${agents.length} agent${agents.length === 1 ? "" : "s"}`) +
			(names.length ? theme.fg("dim", ` · ${names.join(", ")}${overflow}`) : ""),
	);
}

export function renderSpawnResult(
	result: RenderResult<SubAgentsSpawnToolDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsSpawnInput>,
): Component {
	if (options.isPartial) return updateRendererText(context, theme.fg("warning", "Launching sub-agents…"));
	const details = result.details;
	if (!details || !Array.isArray(details.outcomes)) return renderFallback(result, theme, context);
	const lines = [
		theme.fg("success", `${count(details.started)} started`) +
			theme.fg("dim", " · ") +
			(details.failed > 0
				? theme.fg("error", `${count(details.failed)} failed`)
				: theme.fg("muted", "0 failed")),
	];
	if (options.expanded) {
		for (const outcome of details.outcomes) {
			const name = spawnName(context.args, outcome);
			if (!outcome.ok) {
				lines.push(`${theme.fg("error", "✗")} ${theme.fg("muted", name)}${outcome.id ? ` ${idText(theme, outcome.id)}` : ""} ${errorText(theme, outcome.code, outcome.message)}`);
				continue;
			}
			lines.push(`${theme.fg("success", "✓")} ${theme.fg("muted", name)} ${idText(theme, outcome.id)} ${theme.fg(stateColor(outcome.state), `· ${cleanRendererLine(outcome.state, 24)}`)}`);
			if (outcome.route) {
				const selected = `${cleanRendererLine(outcome.route.selectedModel.provider, 64)}/${cleanRendererLine(outcome.route.selectedModel.id, 112)}`;
				const tier = outcome.route.selectedTier ?? outcome.route.requestedComplexity;
				lines.push(`  ${theme.fg("dim", `model: ${selected} · ${tier}${outcome.route.fallbackUsed ? " · fallback" : ""}`)}`);
			}
		}
	}
	return updateRendererText(context, lines.join("\n"));
}

export function renderStatusCall(
	args: SubAgentsStatusInput,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsStatusInput>,
): Component {
	const target = args.ids?.length
		? `${args.ids.length} selected`
		: args.includeRemoved
			? "all + removed"
			: "all live";
	return updateRendererText(
		context,
		title(theme, "sub_agents_status") +
			theme.fg("muted", `${target} · ${args.detail ?? "compact"}`) +
			(args.drainUsage ? theme.fg("dim", " · drain usage") : ""),
	);
}

function appendStatusOutcome(lines: string[], theme: Theme, outcome: StatusAgentOutcome): void {
	if (!outcome.ok) {
		lines.push(`${theme.fg("error", "✗")} ${idText(theme, outcome.id)} ${errorText(theme, outcome.code, outcome.message)}`);
		return;
	}
	lines.push(
		`${theme.fg(stateColor(outcome.state), "•")} ${theme.fg("muted", cleanRendererLine(outcome.name, 120) || "unnamed")} ${idText(theme, outcome.id)} ` +
			theme.fg(stateColor(outcome.state), `· ${cleanRendererLine(outcome.state, 24)}`),
	);
	if (outcome.model) {
		lines.push(`  ${theme.fg("dim", `model: ${cleanRendererLine(outcome.model.provider, 64)}/${cleanRendererLine(outcome.model.id, 112)}${outcome.model.tier ? ` · ${cleanRendererLine(outcome.model.tier, 24)}` : ""}${outcome.model.fallbackUsed ? " · fallback" : ""}`)}`);
	}
	if (outcome.pendingModel) {
		lines.push(`  ${theme.fg("warning", `queued model: ${cleanRendererLine(outcome.pendingModel.provider, 64)}/${cleanRendererLine(outcome.pendingModel.id, 112)}${outcome.pendingModel.afterAssignmentSequence ? ` · after #${outcome.pendingModel.afterAssignmentSequence}` : ""}`)}`);
	}
	if (outcome.assignment) {
		// The assignment summary is the original child objective. Keep raw prompts
		// out of the TUI renderer even though status details remain model-visible.
		lines.push(`  ${theme.fg("dim", `assignment #${outcome.assignment.sequence}: ${cleanRendererLine(outcome.assignment.state, 32)}`)}`);
		if (outcome.assignment.blocker) lines.push(`  ${theme.fg("warning", `blocker: ${cleanRendererLine(outcome.assignment.blocker, 256)}`)}`);
	}
	if (outcome.runtime) {
		const tools = outcome.runtime.activeTools.map((tool) => cleanRendererLine(tool.name, 80)).filter(Boolean);
		const toolText = outcome.runtime.activeToolCount
			? ` · tools ${outcome.runtime.activeToolCount}${tools.length ? ` (${tools.join(", ")}${outcome.runtime.omittedActiveToolCount ? ` +${outcome.runtime.omittedActiveToolCount}` : ""})` : ""}`
			: "";
		const queueText = outcome.runtime.pendingMessageCount ? ` · queued ${outcome.runtime.pendingMessageCount}` : "";
		lines.push(`  ${theme.fg("dim", `runtime: ${cleanRendererLine(outcome.runtime.phase, 40)}${toolText}${queueText}`)}`);
	}
	if (outcome.report) {
		lines.push(`  ${theme.fg(outcome.report.state === "blocked" ? "warning" : "dim", `report/${cleanRendererLine(outcome.report.state, 24)}: ${cleanRendererLine(outcome.report.summary, 256)}`)}`);
		if (outcome.report.needs) lines.push(`  ${theme.fg("warning", `needs: ${cleanRendererLine(outcome.report.needs, 256)}`)}`);
		appendFiles(lines, theme, outcome.report.files, outcome.report.omittedFileCount);
	}
	if (outcome.result) {
		lines.push(`  ${theme.fg("success", `result: ${cleanRendererLine(outcome.result.summary, 256)}`)}`);
		appendFiles(lines, theme, outcome.result.files, outcome.result.omittedFileCount);
	}
	if (outcome.lastError) lines.push(`  ${theme.fg("error", `error: ${cleanRendererLine(outcome.lastError, 256)}`)}`);
	if (outcome.usage) {
		lines.push(`  ${theme.fg("dim", `usage: ${outcome.usage.turns} turns · ${formatTokens(outcome.usage.totals.totalTokens)} tok · ${formatCost(outcome.usage.totals.cost)}${outcome.usage.unreported ? " · unreported" : ""}`)}`);
	}
	for (const event of outcome.events ?? []) {
		lines.push(`  ${theme.fg("dim", `#${event.sequence} ${cleanRendererLine(event.kind, 32)}/${cleanRendererLine(event.state, 24)}: ${cleanRendererLine(event.summary, 256)}`)}`);
	}
	if ((outcome.omittedEventCount ?? 0) > 0) lines.push(`  ${theme.fg("dim", `… ${outcome.omittedEventCount} earlier event(s) omitted`)}`);
	if (outcome.truncated) lines.push(`  ${theme.fg("warning", "detail truncated")}`);
}

export function renderStatusResult(
	result: RenderResult<SubAgentsStatusToolDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsStatusInput>,
): Component {
	if (options.isPartial) return updateRendererText(context, theme.fg("warning", "Reading sub-agent status…"));
	const details = result.details;
	if (!details || !Array.isArray(details.outcomes)) return renderFallback(result, theme, context);
	const counts = new Map<string, number>();
	for (const outcome of details.outcomes) {
		if (outcome.ok) counts.set(outcome.state, (counts.get(outcome.state) ?? 0) + 1);
	}
	let summary = theme.fg("success", `${count(details.succeeded)} agents`) + theme.fg("dim", " · ") +
		(details.failed ? theme.fg("error", `${count(details.failed)} errors`) : theme.fg("muted", "0 errors"));
	if (counts.size) summary += theme.fg("dim", ` · ${[...counts.entries()].map(([state, total]) => `${cleanRendererLine(state, 24)} ${total}`).join(" · ")}`);
	if (details.omitted) summary += theme.fg("warning", ` · ${details.omitted} omitted`);
	if (details.outputTruncated) summary += theme.fg("warning", " · bounded");
	const lines = [summary];
	if (options.expanded) for (const outcome of details.outcomes) appendStatusOutcome(lines, theme, outcome);
	return updateRendererText(context, lines.join("\n"));
}

export function renderSendCall(
	args: SubAgentsSendInput,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsSendInput>,
): Component {
	const total = args.messages?.length ?? 0;
	const steering = args.messages?.filter((target) => target.delivery === "steer").length ?? 0;
	return updateRendererText(
		context,
		title(theme, "sub_agents_send") +
			theme.fg("muted", `${total} target${total === 1 ? "" : "s"}`) +
			(steering ? theme.fg("dim", ` · ${steering} steer`) : ""),
	);
}

function appendSendOutcome(lines: string[], theme: Theme, outcome: SendTargetOutcome): void {
	if (!outcome.ok) {
		lines.push(`${theme.fg("error", "✗")} ${idText(theme, outcome.id)} ${errorText(theme, outcome.code, outcome.message)}${outcome.state ? theme.fg("dim", ` · ${cleanRendererLine(outcome.state, 24)}`) : ""}`);
		return;
	}
	lines.push(
		`${theme.fg("success", "✓")} ${idText(theme, outcome.id)} ` +
			theme.fg("dim", `${cleanRendererLine(outcome.dispatch, 24)} · assignment ${outcome.assignmentSequence} · ${cleanRendererLine(outcome.state, 24)}${outcome.pendingMessageCount === undefined ? "" : ` · queued ${outcome.pendingMessageCount}`}`),
	);
}

export function renderSendResult(
	result: RenderResult<SubAgentsSendToolDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsSendInput>,
): Component {
	if (options.isPartial) return updateRendererText(context, theme.fg("warning", "Delivering sub-agent messages…"));
	const details = result.details;
	if (!details || !Array.isArray(details.outcomes)) return renderFallback(result, theme, context);
	const lines = [
		theme.fg("success", `${count(details.accepted)} accepted`) + theme.fg("dim", " · ") +
			(details.failed ? theme.fg("error", `${count(details.failed)} failed`) : theme.fg("muted", "0 failed")),
	];
	if (options.expanded) for (const outcome of details.outcomes) appendSendOutcome(lines, theme, outcome);
	return updateRendererText(context, lines.join("\n"));
}

export function renderReleaseCall(
	args: SubAgentsReleaseInput,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsReleaseInput>,
): Component {
	const total = args.ids?.length ?? 0;
	return updateRendererText(
		context,
		title(theme, "sub_agents_release") +
			theme.fg("muted", `${total} selected target${total === 1 ? "" : "s"}`),
	);
}

function appendReleaseOutcome(lines: string[], theme: Theme, outcome: ReleaseTargetOutcome): void {
	if (!outcome.ok) {
		lines.push(`${theme.fg("error", "✗")} ${idText(theme, outcome.id)} ${errorText(theme, outcome.code, outcome.message)}${outcome.state ? theme.fg("dim", ` · ${cleanRendererLine(outcome.state, 24)}`) : ""}`);
		return;
	}
	const kinds = outcome.releasedKinds.map((kind) => cleanRendererLine(kind, 32)).filter(Boolean);
	lines.push(
		`${theme.fg(outcome.action === "released" ? "success" : "muted", outcome.action === "released" ? "✓" : "•")} ` +
			`${idText(theme, outcome.id)} ${theme.fg("dim", `${cleanRendererLine(outcome.action, 24)} · ${outcome.releasedLeases} released · ${outcome.remainingLeases} remaining · ${cleanRendererLine(outcome.state, 24)}`)}`,
	);
	if (kinds.length) lines.push(`  ${theme.fg("dim", `kinds: ${kinds.join(", ")}`)}`);
}

export function renderReleaseResult(
	result: RenderResult<SubAgentsReleaseToolDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsReleaseInput>,
): Component {
	if (options.isPartial) return updateRendererText(context, theme.fg("warning", "Releasing retained sub-agent leases…"));
	const details = result.details;
	if (!details || !Array.isArray(details.outcomes)) return renderFallback(result, theme, context);
	let summary = theme.fg("success", `${count(details.releasedTargets)} released`) +
		theme.fg("dim", " · ") +
		theme.fg("muted", `${count(details.noOpTargets)} no-op · ${count(details.releasedLeases)} leases`);
	if (details.failed) summary += theme.fg("error", ` · ${details.failed} failed`);
	const lines = [summary];
	if (options.expanded) for (const outcome of details.outcomes) appendReleaseOutcome(lines, theme, outcome);
	return updateRendererText(context, lines.join("\n"));
}

export function renderReconfigureCall(
	args: SubAgentsReconfigureInput,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsReconfigureInput>,
): Component {
	const total = args.changes?.length ?? 0;
	const aborting = args.changes?.filter((change) => change.runningBehavior === "abort-and-switch").length ?? 0;
	return updateRendererText(
		context,
		title(theme, "sub_agents_reconfigure") +
			theme.fg("muted", `${total} target${total === 1 ? "" : "s"}`) +
			(aborting ? theme.fg("warning", ` · ${aborting} abort-and-switch`) : ""),
	);
}

function appendReconfigureOutcome(lines: string[], theme: Theme, outcome: ReconfigureTargetOutcome): void {
	if (!outcome.ok) {
		lines.push(`${theme.fg("error", "✗")} ${idText(theme, outcome.id)} ${errorText(theme, outcome.code, outcome.message)}${outcome.state ? theme.fg("dim", ` · ${cleanRendererLine(outcome.state, 24)}`) : ""}`);
		return;
	}
	lines.push(`${theme.fg("success", "✓")} ${idText(theme, outcome.id)} ${theme.fg("dim", `${cleanRendererLine(outcome.action, 40)} · ${cleanRendererLine(outcome.state, 24)}`)}`);
	lines.push(`  ${theme.fg("dim", `route: ${routeText(outcome.oldRoute)} -> ${routeText(outcome.newRoute)}${outcome.newRoute.tier ? ` · ${cleanRendererLine(outcome.newRoute.tier, 24)}` : ""}${outcome.newRoute.fallbackUsed ? " · fallback" : ""}`)}`);
	if (outcome.thinking) {
		const from = outcome.thinking.old ?? "unchanged";
		const to = outcome.thinking.effective ?? outcome.thinking.requested ?? "unchanged";
		lines.push(`  ${theme.fg("dim", `thinking: ${cleanRendererLine(from, 24)} -> ${cleanRendererLine(to, 24)}`)}`);
	}
	if (outcome.afterAssignmentSequence !== undefined) lines.push(`  ${theme.fg("warning", `safe boundary: assignment ${outcome.afterAssignmentSequence}`)}`);
	if (outcome.truncated) lines.push(`  ${theme.fg("warning", "detail truncated")}`);
}

export function renderReconfigureResult(
	result: RenderResult<SubAgentsReconfigureToolDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsReconfigureInput>,
): Component {
	if (options.isPartial) return updateRendererText(context, theme.fg("warning", "Reconfiguring sub-agents…"));
	const details = result.details;
	if (!details || !Array.isArray(details.outcomes)) return renderFallback(result, theme, context);
	let summary = theme.fg("success", `${count(details.applied)} applied`) + theme.fg("dim", " · ") + theme.fg("muted", `${count(details.queued)} queued`);
	if (details.abortedAndApplied) summary += theme.fg("warning", ` · ${details.abortedAndApplied} abort-and-switch`);
	if (details.failed) summary += theme.fg("error", ` · ${details.failed} failed`);
	if (details.outputTruncated) summary += theme.fg("warning", " · bounded");
	const lines = [summary];
	if (options.expanded) for (const outcome of details.outcomes) appendReconfigureOutcome(lines, theme, outcome);
	return updateRendererText(context, lines.join("\n"));
}

export function renderWaitCall(
	args: SubAgentsWaitInput,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsWaitInput>,
): Component {
	const target = args.ids?.length ? `${args.ids.length} selected` : "current live set";
	const states = args.states ?? ["idle", "blocked", "failed", "removed"];
	return updateRendererText(
		context,
		title(theme, "sub_agents_wait") +
			theme.fg("muted", `${args.condition ?? "all"} of ${target}`) +
			theme.fg("dim", ` · ${states.map((state) => cleanRendererLine(state, 24)).join("|")} · ${args.timeoutSeconds ?? DEFAULT_WAIT_TIMEOUT_SECONDS}s`),
	);
}

function appendWaitProgress(lines: string[], theme: Theme, outcome: WaitProgressOutcome): void {
	if (!outcome.ok) {
		lines.push(`${theme.fg("error", "✗")} ${idText(theme, outcome.id)} ${errorText(theme, outcome.code)}`);
		return;
	}
	const matched = outcome.matched ? theme.fg("success", "✓") : theme.fg("warning", "•");
	const state = cleanRendererLine(outcome.state, 24) || "unknown";
	const assignment = outcome.assignmentSequence === undefined ? "" : ` · assignment ${outcome.assignmentSequence}`;
	const tools = outcome.activeToolCount ? ` · tools ${outcome.activeToolCount}` : "";
	const queued = outcome.pendingMessageCount ? ` · queued ${outcome.pendingMessageCount}` : "";
	lines.push(`${matched} ${idText(theme, outcome.id)} ${theme.fg("dim", `${state}${assignment}${tools}${queued}`)}`);
}

function appendWaitOutcome(lines: string[], theme: Theme, outcome: WaitTargetOutcome): void {
	if (!outcome.ok) {
		lines.push(`${theme.fg("error", "✗")} ${idText(theme, outcome.id)} ${errorText(theme, outcome.code, outcome.message)}`);
		return;
	}
	lines.push(
		`${theme.fg(outcome.matched ? "success" : "warning", outcome.matched ? "✓" : "•")} ` +
			theme.fg("muted", cleanRendererLine(outcome.name, 120) || "unnamed") +
			` ${idText(theme, outcome.id)} ${theme.fg(stateColor(outcome.state), `· ${cleanRendererLine(outcome.state, 24)}`)}`,
	);
	if (outcome.assignment) lines.push(`  ${theme.fg("dim", `assignment #${outcome.assignment.sequence}: ${cleanRendererLine(outcome.assignment.state, 32)}`)}`);
	if (outcome.output) {
		lines.push(`  ${theme.fg(outcome.output.kind === "result" ? "success" : "dim", `${outcome.output.kind}: ${cleanRendererLine(outcome.output.summary, 512)}`)}`);
		if (outcome.output.details) lines.push(`  ${theme.fg("dim", cleanRendererLine(outcome.output.details, 768))}`);
		appendFiles(lines, theme, outcome.output.files, outcome.output.omittedFileCount);
	}
	if (outcome.blocker) lines.push(`  ${theme.fg("warning", `blocker: ${cleanRendererLine(outcome.blocker, 384)}`)}`);
	if (outcome.lastError) lines.push(`  ${theme.fg("error", `error: ${cleanRendererLine(outcome.lastError, 384)}`)}`);
	const usage = usageText(outcome.usageDrained);
	if (usage) lines.push(`  ${theme.fg("dim", `usage drained: ${usage}`)}`);
	if (outcome.usageDrainError) lines.push(`  ${errorText(theme, `usage/${outcome.usageDrainError.code}`, outcome.usageDrainError.message)}`);
	if (outcome.truncated) lines.push(`  ${theme.fg("warning", "detail truncated")}`);
}

export function renderWaitResult(
	result: RenderResult<SubAgentsWaitToolDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsWaitInput>,
): Component {
	const details = result.details;
	if (options.isPartial || details?.phase === "waiting") {
		const progress = details?.phase === "waiting" ? details : undefined;
		let summary = theme.fg("warning", "Waiting for sub-agents…");
		if (progress) {
			summary += theme.fg("dim", ` ${progress.matched}/${Math.max(0, progress.returned - progress.failed)} matched · ${progress.failed} errors · ${elapsed(progress.elapsedMs)}`);
			if (progress.omitted) summary += theme.fg("warning", ` · ${progress.omitted} omitted`);
		}
		const lines = [summary];
		if (options.expanded && progress) for (const outcome of progress.outcomes) appendWaitProgress(lines, theme, outcome);
		return updateRendererText(context, lines.join("\n"));
	}
	if (!details || details.phase !== "complete") return renderFallback(result, theme, context);
	const color: ForegroundColor = details.timedOut ? "warning" : details.completion === "satisfied" ? "success" : "muted";
	let summary = theme.fg(color, cleanRendererLine(details.completion, 32)) + theme.fg("dim", " · ") + theme.fg("muted", `${details.matched}/${details.succeeded} matched · ${elapsed(details.elapsedMs)}`);
	if (details.failed) summary += theme.fg("error", ` · ${details.failed} errors`);
	if (details.omitted) summary += theme.fg("warning", ` · ${details.omitted} omitted`);
	if (details.usageDrainFailures) summary += theme.fg("warning", ` · ${details.usageDrainFailures} usage errors`);
	if (details.outputTruncated) summary += theme.fg("warning", " · bounded");
	const lines = [summary];
	if (options.expanded) for (const outcome of details.outcomes) appendWaitOutcome(lines, theme, outcome);
	return updateRendererText(context, lines.join("\n"));
}

export function renderRemoveCall(
	args: SubAgentsRemoveInput,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsRemoveInput>,
): Component {
	const target = args.scope === "selected" ? `${args.ids?.length ?? 0} selected` : "all live";
	const mode = args.mode ?? "graceful";
	return updateRendererText(
		context,
		title(theme, "sub_agents_remove") +
			theme.fg(mode === "abort" ? "warning" : "muted", `${mode} · ${target}`) +
			(mode === "graceful" ? theme.fg("dim", ` · ${args.gracePeriodSeconds ?? DEFAULT_REMOVE_GRACE_SECONDS}s grace`) : ""),
	);
}

function appendRemoveOutcome(lines: string[], theme: Theme, outcome: RemoveTargetOutcome): void {
	if (!outcome.ok) {
		lines.push(`${theme.fg("error", "✗")} ${idText(theme, outcome.id)} ${errorText(theme, outcome.code, outcome.message)}${outcome.state ? theme.fg("dim", ` · ${cleanRendererLine(outcome.state, 24)}`) : ""}`);
		return;
	}
	const disposition = outcome.alreadyRemoved ? "already removed" : outcome.forcedAbort ? "forced abort" : "removed";
	lines.push(`${theme.fg("success", "✓")} ${theme.fg("muted", cleanRendererLine(outcome.name, 120) || "unnamed")} ${idText(theme, outcome.id)} ${theme.fg(outcome.forcedAbort ? "warning" : "dim", `· ${disposition}`)}`);
	if (outcome.grace) {
		lines.push(`  ${theme.fg(outcome.grace.escalated ? "warning" : "dim", `grace: ${cleanRendererLine(outcome.grace.outcome, 32)} · ${elapsed(outcome.grace.durationMs)}${outcome.grace.requested ? " · requested" : ""}${outcome.grace.escalated ? " · escalated" : ""}`)}`);
		if (outcome.grace.requestError) lines.push(`  ${errorText(theme, outcome.grace.requestError.code, outcome.grace.requestError.message)}`);
	}
	if (outcome.output) {
		lines.push(`  ${theme.fg(outcome.output.kind === "result" ? "success" : "dim", `${outcome.output.kind}: ${cleanRendererLine(outcome.output.summary, 512)}`)}`);
		if (outcome.output.details) lines.push(`  ${theme.fg("dim", cleanRendererLine(outcome.output.details, 768))}`);
		appendFiles(lines, theme, outcome.output.files, outcome.output.omittedFileCount);
	}
	if (outcome.lastError) lines.push(`  ${theme.fg("error", `error: ${cleanRendererLine(outcome.lastError, 384)}`)}`);
	const usage = usageText(outcome.usageDrained);
	if (usage) lines.push(`  ${theme.fg("dim", `usage drained: ${usage}`)}`);
	if (outcome.usageDrainError) lines.push(`  ${errorText(theme, `usage/${outcome.usageDrainError.code}`, outcome.usageDrainError.message)}`);
	if (outcome.truncated) lines.push(`  ${theme.fg("warning", "detail truncated")}`);
}

export function renderRemoveResult(
	result: RenderResult<SubAgentsRemoveToolDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: ToolRenderContext<unknown, SubAgentsRemoveInput>,
): Component {
	if (options.isPartial) return updateRendererText(context, theme.fg("warning", "Removing sub-agents…"));
	const details = result.details;
	if (!details || !Array.isArray(details.outcomes)) return renderFallback(result, theme, context);
	let summary = theme.fg("success", `${count(details.newlyRemoved)} removed`) + theme.fg("dim", " · ") + theme.fg("muted", `${count(details.alreadyRemoved)} already removed`);
	if (details.failed) summary += theme.fg("error", ` · ${details.failed} failed`);
	if (details.forcedAborts) summary += theme.fg("warning", ` · ${details.forcedAborts} forced`);
	if (details.omitted) summary += theme.fg("warning", ` · ${details.omitted} omitted`);
	if (details.outputTruncated) summary += theme.fg("warning", " · bounded");
	const lines = [summary];
	if (options.expanded) for (const outcome of details.outcomes) appendRemoveOutcome(lines, theme, outcome);
	return updateRendererText(context, lines.join("\n"));
}
