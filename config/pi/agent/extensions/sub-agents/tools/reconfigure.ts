import { Buffer } from "node:buffer";
import { defineTool, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	SubAgentAssignmentRunnerError,
	type ModelReconfigurationResult,
	type ReconfigurationRunningBehavior,
	type SubAgentAssignmentRunner,
} from "../assignment-runner.ts";
import {
	SubAgentManagerError,
	type SubAgentManager,
} from "../manager.ts";
import type { SubAgentModelRouter } from "../model-router.ts";
import type {
	AgentLifecycleState,
	ManagedSubAgentSnapshot,
	ModelRoute,
	SubAgentId,
	ThinkingLevel,
} from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";
import {
	subAgentsReconfigureSchema,
	type SubAgentsReconfigureInput,
} from "./schemas.ts";

const CONTENT_MAX_BYTES = 48 * 1024;
const DETAILS_MAX_BYTES = 48 * 1024;
const DETAILS_RICH_BUDGET_BYTES = 46 * 1024;
const DISPLAY_LINE_BYTES = 380;
const DISPLAY_CODE_BYTES = 40;
const DISPLAY_ERROR_BYTES = 96;
const RUNNER_ERROR_CODES = new Set([
	"invalid_assignment",
	"model_resolution_failed",
	"runtime_initialization_failed",
	"runtime_missing",
	"assignment_not_idle",
	"assignment_not_running",
	"assignment_rejected",
	"assignment_execution_failed",
	"assignment_changed",
	"assignment_abort_failed",
	"invalid_reconfiguration",
	"reconfiguration_not_available",
	"reconfiguration_failed",
]);
const MANAGER_ERROR_CODES = new Set([
	"manager_closed",
	"unknown_agent",
	"stale_agent",
	"invalid_transition",
	"invalid_generation",
	"invalid_spec",
	"id_collision",
	"invalid_usage",
	"invalid_runtime_activity",
	"invalid_model_route",
	"model_route_boundary",
	"model_reconfiguration_pending",
	"agent_not_active",
	"duplicate_runtime",
	"agent_stopping",
]);

export interface SubAgentsReconfigureRuntime {
	readonly manager: Pick<SubAgentManager, "generation" | "getAgent">;
	readonly runner: Pick<SubAgentAssignmentRunner, "reconfigure">;
	readonly router: Pick<SubAgentModelRouter, "resolve">;
}

export interface ReconfigureRouteView {
	policy?: ModelRoute["requestedPolicy"];
	complexity?: ModelRoute["requestedComplexity"];
	provider: string;
	model: string;
	tier?: ModelRoute["selectedTier"];
	fallbackUsed?: boolean;
	reason?: string;
	truncated?: true;
}

export interface ReconfigureThinkingView {
	old?: ThinkingLevel;
	requested?: ThinkingLevel;
	effective?: ThinkingLevel;
}

export interface ReconfigureSuccessOutcome {
	index: number;
	ok: true;
	id: SubAgentId;
	state: AgentLifecycleState;
	action: ModelReconfigurationResult["action"];
	oldRoute?: ReconfigureRouteView;
	newRoute: ReconfigureRouteView;
	thinking?: ReconfigureThinkingView;
	afterAssignmentSequence?: number;
	truncated?: true;
}

export interface ReconfigureFailureOutcome {
	index: number;
	ok: false;
	id: string;
	state?: AgentLifecycleState;
	code: string;
	message: string;
}

export type ReconfigureTargetOutcome = ReconfigureSuccessOutcome | ReconfigureFailureOutcome;

export interface SubAgentsReconfigureToolDetails {
	generation: string;
	requested: number;
	succeeded: number;
	failed: number;
	applied: number;
	queued: number;
	abortedAndApplied: number;
	truncatedAgentDetails: number;
	outputTruncated: boolean;
	outcomes: ReconfigureTargetOutcome[];
}

export class SubAgentsReconfigureError extends Error {
	readonly code: "manager_inactive" | "cancelled" | "output_failed";

	constructor(code: "manager_inactive" | "cancelled" | "output_failed", message: string) {
		super(message);
		this.name = "SubAgentsReconfigureError";
		this.code = code;
	}
}

function oneLine(value: unknown): string {
	return String(value ?? "")
		.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
		.replace(/\s+/gu, " ")
		.trim();
}

function boundUtf8Line(value: unknown, maxBytes: number): string {
	const normalized = oneLine(value);
	let result = "";
	let bytes = 0;
	for (const character of normalized) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (bytes + characterBytes > maxBytes) break;
		result += character;
		bytes += characterBytes;
	}
	return result;
}

function routeView(route: ModelRoute | undefined, compact = false): ReconfigureRouteView | undefined {
	if (!route) return undefined;
	const providerBytes = compact ? 24 : 48;
	const modelBytes = compact ? 40 : 72;
	const provider = boundUtf8Line(route.selectedModel.provider, providerBytes);
	const model = boundUtf8Line(route.selectedModel.id, modelBytes);
	const reason = compact ? undefined : boundUtf8Line(route.reason, 96);
	const truncated =
		provider !== route.selectedModel.provider ||
		model !== route.selectedModel.id ||
		(reason !== undefined && reason !== oneLine(route.reason));
	return {
		policy: route.requestedPolicy,
		complexity: route.requestedComplexity,
		provider,
		model,
		tier: route.selectedTier,
		fallbackUsed: route.fallbackUsed,
		reason,
		truncated: truncated ? true : undefined,
	};
}

function safeSnapshot(
	runtime: SubAgentsReconfigureRuntime,
	id: SubAgentId,
): ManagedSubAgentSnapshot | undefined {
	try {
		return runtime.manager.getAgent(id);
	} catch {
		return undefined;
	}
}

function errorCode(error: unknown): string | undefined {
	if (!error || typeof error !== "object") return undefined;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

function knownFailure(
	index: number,
	id: string,
	error: unknown,
	runtime: SubAgentsReconfigureRuntime,
): ReconfigureFailureOutcome {
	const candidate =
		error && typeof error === "object"
			? (error as { name?: unknown; code?: unknown })
			: undefined;
	const code = errorCode(error);
	const runnerError =
		error instanceof SubAgentAssignmentRunnerError ||
		(candidate?.name === "SubAgentAssignmentRunnerError" &&
			code !== undefined &&
			RUNNER_ERROR_CODES.has(code));
	const managerError =
		error instanceof SubAgentManagerError ||
		(typeof candidate?.name === "string" &&
			candidate.name.endsWith("Error") &&
			code !== undefined &&
			MANAGER_ERROR_CODES.has(code));
	const snapshot = safeSnapshot(runtime, id);
	if (runnerError && code) {
		const messages: Record<string, string> = {
			invalid_reconfiguration: "The replacement child model configuration is invalid",
			reconfiguration_not_available: "The sub-agent is not at a supported model-change boundary",
			reconfiguration_failed: "The child model configuration could not be changed",
			runtime_missing: "The sub-agent has no active child runtime",
		};
		return {
			index,
			ok: false,
			id: id.slice(0, SUB_AGENT_BOUNDS.agentIdChars),
			state: snapshot?.state,
			code: boundUtf8Line(code, DISPLAY_CODE_BYTES) || "reconfigure_failed",
			message: boundUtf8Line(messages[code] ?? "Could not reconfigure the sub-agent", DISPLAY_ERROR_BYTES),
		};
	}
	if (managerError && code) {
		const messages: Record<string, string> = {
			manager_closed: "The sub-agent manager generation is closed",
			unknown_agent: "Unknown sub-agent ID",
			stale_agent: "Sub-agent ID belongs to another session generation",
			agent_stopping: "Sub-agent cleanup has started",
			model_route_boundary: "The sub-agent changed state before reconfiguration",
		};
		return {
			index,
			ok: false,
			id: id.slice(0, SUB_AGENT_BOUNDS.agentIdChars),
			state: snapshot?.state,
			code: boundUtf8Line(code, DISPLAY_CODE_BYTES) || "reconfigure_failed",
			message: boundUtf8Line(messages[code] ?? "Could not inspect the sub-agent", DISPLAY_ERROR_BYTES),
		};
	}
	return {
		index,
		ok: false,
		id: id.slice(0, SUB_AGENT_BOUNDS.agentIdChars),
		state: snapshot?.state,
		code: "reconfigure_failed",
		message: "Could not reconfigure the sub-agent",
	};
}

function routeFailure(
	index: number,
	id: string,
	runtime: SubAgentsReconfigureRuntime,
): ReconfigureFailureOutcome {
	return {
		index,
		ok: false,
		id: id.slice(0, SUB_AGENT_BOUNDS.agentIdChars),
		state: safeSnapshot(runtime, id)?.state,
		code: "model_resolution_failed",
		message: "Could not resolve the replacement child model",
	};
}

function unavailableState(
	index: number,
	snapshot: ManagedSubAgentSnapshot,
): ReconfigureFailureOutcome {
	return {
		index,
		ok: false,
		id: snapshot.id,
		state: snapshot.state,
		code: `target_${snapshot.state}`,
		message: `The ${snapshot.state} sub-agent cannot change model configuration`,
	};
}

function successOutcome(
	index: number,
	result: ModelReconfigurationResult,
	compact = false,
): ReconfigureSuccessOutcome {
	return {
		index,
		ok: true,
		id: result.id,
		state: result.snapshot.state,
		action: result.action,
		oldRoute: routeView(result.oldRoute, compact),
		newRoute: routeView(result.newRoute, compact)!,
		thinking:
			result.oldThinkingLevel !== undefined ||
			result.requestedThinkingLevel !== undefined ||
			result.effectiveThinkingLevel !== undefined
				? {
						old: result.oldThinkingLevel,
						requested: result.requestedThinkingLevel,
						effective: result.effectiveThinkingLevel,
					}
				: undefined,
		afterAssignmentSequence: result.afterAssignmentSequence,
		truncated: compact ? true : undefined,
	};
}

async function reconfigureOne(
	change: SubAgentsReconfigureInput["changes"][number],
	index: number,
	signal: AbortSignal | undefined,
	ctx: ExtensionContext,
	runtime: SubAgentsReconfigureRuntime,
): Promise<ReconfigureTargetOutcome> {
	let snapshot: ManagedSubAgentSnapshot;
	try {
		snapshot = runtime.manager.getAgent(change.id);
	} catch (error) {
		return knownFailure(index, change.id, error, runtime);
	}
	if (snapshot.state !== "idle" && snapshot.state !== "running") {
		return unavailableState(index, snapshot);
	}
	if (signal?.aborted) {
		return {
			index,
			ok: false,
			id: change.id,
			state: snapshot.state,
			code: "cancelled",
			message: "Reconfiguration was cancelled before the child model changed",
		};
	}

	let routed;
	try {
		routed = await runtime.router.resolve({
			hostRegistry: ctx.modelRegistry,
			parentModel: ctx.model,
			spec: {
				modelPolicy: change.modelPolicy,
				model: change.model,
				complexity: change.complexity,
			},
		});
	} catch {
		return routeFailure(index, change.id, runtime);
	}
	if (signal?.aborted) {
		return {
			index,
			ok: false,
			id: change.id,
			state: safeSnapshot(runtime, change.id)?.state,
			code: "cancelled",
			message: "Reconfiguration was cancelled before the child model changed",
		};
	}
	try {
		const result = await runtime.runner.reconfigure(
			change.id,
			routed,
			change.thinkingLevel,
			(change.runningBehavior ?? "queue") as ReconfigurationRunningBehavior,
		);
		return successOutcome(index, result);
	} catch (error) {
		return knownFailure(index, change.id, error, runtime);
	}
}

function duplicateFailure(index: number, id: string): ReconfigureFailureOutcome {
	return {
		index,
		ok: false,
		id,
		code: "duplicate_target",
		message: "Duplicate target ID; no model configuration was changed for this sub-agent",
	};
}

function jsonBytes(value: unknown): number {
	return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function compactRouteView(route: ReconfigureRouteView | undefined): ReconfigureRouteView | undefined {
	if (!route) return undefined;
	return {
		provider: boundUtf8Line(route.provider, 16),
		model: boundUtf8Line(route.model, 24),
		truncated: true,
	};
}

function compactSuccessOutcome(outcome: ReconfigureSuccessOutcome): ReconfigureSuccessOutcome {
	return {
		index: outcome.index,
		ok: true,
		id: outcome.id,
		state: outcome.state,
		action: outcome.action,
		oldRoute: compactRouteView(outcome.oldRoute),
		newRoute: compactRouteView(outcome.newRoute)!,
		truncated: true,
	};
}

function fitDetails(
	base: Omit<SubAgentsReconfigureToolDetails, "outcomes" | "truncatedAgentDetails" | "outputTruncated">,
	fullOutcomes: ReconfigureTargetOutcome[],
): SubAgentsReconfigureToolDetails {
	const outcomes = fullOutcomes.map((outcome) =>
		outcome.ok ? compactSuccessOutcome(outcome) : outcome,
	);
	const details: SubAgentsReconfigureToolDetails = {
		...base,
		truncatedAgentDetails: fullOutcomes.filter((outcome) => outcome.ok).length,
		outputTruncated: fullOutcomes.some((outcome) => outcome.ok),
		outcomes,
	};
	for (let index = 0; index < fullOutcomes.length; index += 1) {
		const full = fullOutcomes[index];
		if (!full.ok) continue;
		const previous = outcomes[index];
		outcomes[index] = full;
		if (jsonBytes(details) <= DETAILS_RICH_BUDGET_BYTES) {
			details.truncatedAgentDetails -= 1;
		} else {
			outcomes[index] = previous;
		}
	}
	details.outputTruncated = details.truncatedAgentDetails > 0;
	if (jsonBytes(details) > DETAILS_MAX_BYTES) {
		throw new SubAgentsReconfigureError("output_failed", "Bounded reconfiguration details could not be produced");
	}
	return details;
}

function formatRoute(route: ReconfigureRouteView | undefined): string {
	return route ? `${route.provider}/${route.model}` : "none";
}

function formatOutcome(outcome: ReconfigureTargetOutcome): string {
	if (!outcome.ok) {
		return boundUtf8Line(
			`- [failed] ${outcome.id}: ${outcome.code}: ${outcome.message}`,
			DISPLAY_LINE_BYTES,
		);
	}
	const boundary = outcome.afterAssignmentSequence === undefined
		? ""
		: ` · boundary ${outcome.afterAssignmentSequence}`;
	const thinking = outcome.thinking?.effective ?? outcome.thinking?.requested;
	return boundUtf8Line(
		`- [${outcome.action}] ${outcome.id}: ${formatRoute(outcome.oldRoute)} -> ${formatRoute(outcome.newRoute)}${thinking ? ` · thinking ${thinking}` : ""}${boundary}`,
		DISPLAY_LINE_BYTES,
	);
}

export function formatSubAgentsReconfigureResult(
	details: SubAgentsReconfigureToolDetails,
): string {
	const lines = [
		`sub_agents_reconfigure: ${details.applied} applied · ${details.queued} queued · ${details.abortedAndApplied} abort-and-switch · ${details.failed} failed · generation ${details.generation}`,
		...details.outcomes.map(formatOutcome),
	];
	if (details.outputTruncated) {
		lines.push("[reconfiguration detail was bounded; use sub_agents_status for current applied routes]");
	}
	let text = "";
	let omitted = 0;
	for (const line of lines) {
		const candidate = text ? `${text}\n${line}` : line;
		if (Buffer.byteLength(candidate, "utf8") <= CONTENT_MAX_BYTES - 128) text = candidate;
		else omitted += 1;
	}
	if (omitted > 0) text += `\n[${omitted} additional bounded reconfiguration lines omitted]`;
	return text;
}

/** Resolve and apply/queue each unique target independently. */
export async function executeSubAgentsReconfigure(
	params: SubAgentsReconfigureInput,
	signal: AbortSignal | undefined,
	ctx: ExtensionContext,
	runtime: SubAgentsReconfigureRuntime | undefined,
): Promise<{
	content: Array<{ type: "text"; text: string }>;
	details: SubAgentsReconfigureToolDetails;
}> {
	if (!runtime) {
		throw new SubAgentsReconfigureError(
			"manager_inactive",
			"No active sub-agent manager generation is available",
		);
	}
	if (signal?.aborted) {
		throw new SubAgentsReconfigureError(
			"cancelled",
			"sub_agents_reconfigure was cancelled before any child model changed",
		);
	}
	const counts = new Map<string, number>();
	for (const change of params.changes) counts.set(change.id, (counts.get(change.id) ?? 0) + 1);
	const duplicates = new Set(
		[...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
	);
	const outcomes = await Promise.all(
		params.changes.map((change, index) =>
			duplicates.has(change.id)
				? Promise.resolve(duplicateFailure(index, change.id))
				: reconfigureOne(change, index, signal, ctx, runtime),
		),
	);
	const succeeded = outcomes.filter((outcome) => outcome.ok).length;
	const base = {
		generation: runtime.manager.generation,
		requested: outcomes.length,
		succeeded,
		failed: outcomes.length - succeeded,
		applied: outcomes.filter((outcome) => outcome.ok && outcome.action === "applied").length,
		queued: outcomes.filter((outcome) => outcome.ok && outcome.action === "queued").length,
		abortedAndApplied: outcomes.filter(
			(outcome) => outcome.ok && outcome.action === "aborted-and-applied",
		).length,
	};
	const details = fitDetails(base, outcomes);
	return {
		content: [{ type: "text", text: formatSubAgentsReconfigureResult(details) }],
		details,
	};
}

export function createSubAgentsReconfigureTool(
	getRuntime: () => SubAgentsReconfigureRuntime | undefined,
) {
	return defineTool<typeof subAgentsReconfigureSchema, SubAgentsReconfigureToolDetails>({
		name: "sub_agents_reconfigure",
		label: "Reconfigure Sub-Agents",
		description:
			"Change model policy, complexity route, exact model, and optional thinking level for existing children without discarding their transcript. Idle children change immediately; running children queue for the next safe assignment boundary by default or explicitly abort the current assignment before switching. Outcomes are independent and bounded.",
		promptSnippet:
			"Change selected sub-agent model routes/thinking at safe assignment boundaries",
		promptGuidelines: [
			"Use sub_agents_reconfigure with exact current-generation IDs to escalate or de-escalate model capacity while retaining each child transcript.",
			"For a running child, sub_agents_reconfigure defaults to runningBehavior=queue and applies after the exact current assignment settles; use abort-and-switch only when interruption is explicitly worth discarding that assignment's unfinished result.",
			"Use sub_agents_reconfigure modelPolicy=explicit only for an exact provider/model override; otherwise classify the replacement route as simple, moderate, or complex.",
		],
		parameters: subAgentsReconfigureSchema,
		executionMode: "parallel",
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return executeSubAgentsReconfigure(params, signal, ctx, getRuntime());
		},
		renderCall(args, theme, context) {
			const component = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			const aborting = args.changes?.filter(
				(change) => change.runningBehavior === "abort-and-switch",
			).length ?? 0;
			const total = args.changes?.length ?? 0;
			component.setText(
				theme.fg("toolTitle", theme.bold("sub_agents_reconfigure ")) +
					theme.fg("muted", `${total} target${total === 1 ? "" : "s"}`) +
					(aborting ? theme.fg("warning", ` · ${aborting} abort-and-switch`) : ""),
			);
			return component;
		},
		renderResult(result, { expanded, isPartial }, theme, context) {
			const component = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			if (isPartial) {
				component.setText(theme.fg("warning", "Reconfiguring sub-agents…"));
				return component;
			}
			const details = result.details;
			if (!details || !Array.isArray(details.outcomes)) {
				const first = result.content[0];
				component.setText(first?.type === "text" ? first.text : "");
				return component;
			}
			let text =
				theme.fg("success", `${details.applied} applied`) +
				" · " +
				theme.fg("muted", `${details.queued} queued`) +
				(details.abortedAndApplied
					? theme.fg("warning", ` · ${details.abortedAndApplied} abort-and-switch`)
					: "") +
				(details.failed ? theme.fg("error", ` · ${details.failed} failed`) : "");
			if (expanded) {
				for (const outcome of details.outcomes) {
					if (!outcome.ok) {
						text += `\n${theme.fg("error", "✗")} ${theme.fg("accent", outcome.id)} ${theme.fg("error", outcome.code)}`;
						continue;
					}
					text +=
						`\n${theme.fg("success", "✓")} ${theme.fg("accent", outcome.id)} ` +
						theme.fg("dim", `${outcome.action} · ${formatRoute(outcome.newRoute)}`);
				}
			}
			component.setText(text);
			return component;
		},
	});
}
