import { Buffer } from "node:buffer";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { Usage } from "@earendil-works/pi-ai";
import {
	renderRemoveCall,
	renderRemoveResult,
} from "../ui/renderers.ts";
import {
	SubAgentAssignmentRunnerError,
	type SubAgentAssignmentRunner,
} from "../assignment-runner.ts";
import {
	SubAgentManagerError,
	type SubAgentManager,
} from "../manager.ts";
import type {
	AgentLifecycleState,
	ManagedSubAgentSnapshot,
	SubAgentId,
	UsageCounters,
} from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";
import {
	subAgentsRemoveSchema,
	type SubAgentsRemoveInput,
} from "./schemas.ts";

const DEFAULT_GRACE_PERIOD_SECONDS = 10;
const DEFAULT_POLL_INTERVAL_MS = 50;
const CONTENT_MAX_BYTES = 48 * 1024;
const DETAILS_MAX_BYTES = 48 * 1024;
const DETAILS_RICH_BUDGET_BYTES = 46 * 1024;
const DISPLAY_LINE_BYTES = 420;
const DISPLAY_CODE_BYTES = 40;
const DISPLAY_ERROR_BYTES = 96;
const MAX_GRACE_REQUEST_ATTEMPTS = 3;
const GRACEFUL_STOP_MESSAGE =
	"At the next safe boundary, stop further work and return a concise final summary of completed work, unresolved issues, and relevant files. Do not start new work.";
const USAGE_FIELDS = [
	"input",
	"output",
	"cacheRead",
	"cacheWrite",
	"totalTokens",
	"cost",
] as const;
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

export interface SubAgentsRemoveRuntime {
	readonly manager: Pick<
		SubAgentManager,
		"generation" | "listAgents" | "getAgent" | "removeAgent" | "drainUsage"
	>;
	readonly runner: Pick<SubAgentAssignmentRunner, "send">;
	/** Internal test/latency tuning only; the public grace period remains seconds. */
	readonly pollIntervalMs?: number;
}

export interface RemoveOutputView {
	kind: "result" | "report";
	summary: string;
	details?: string;
	files: string[];
	omittedFileCount: number;
	timestamp: number;
}

export interface RemoveGraceView {
	requested: boolean;
	outcome: "not_needed" | "completed" | "timed_out" | "cancelled" | "unavailable";
	escalated: boolean;
	durationMs: number;
	requestError?: {
		code: string;
		message: string;
	};
}

export interface RemoveSuccessOutcome {
	index: number;
	ok: true;
	id: SubAgentId;
	name: string;
	state: "removed";
	mode: "graceful" | "abort";
	initialState?: AgentLifecycleState;
	alreadyRemoved?: boolean;
	forcedAbort?: boolean;
	grace?: RemoveGraceView;
	output?: RemoveOutputView;
	lastError?: string;
	usageDrained?: UsageCounters;
	usageDrainError?: {
		code: string;
		message: string;
	};
	truncated?: true;
	truncatedFields?: string[];
}

export interface RemoveFailureOutcome {
	index: number;
	ok: false;
	id: string;
	state?: AgentLifecycleState;
	code: string;
	message: string;
}

export type RemoveTargetOutcome = RemoveSuccessOutcome | RemoveFailureOutcome;

export interface SubAgentsRemoveToolDetails {
	generation: string;
	scope: "selected" | "all";
	mode: "graceful" | "abort";
	gracePeriodSeconds: number;
	requested: number;
	returned: number;
	succeeded: number;
	failed: number;
	newlyRemoved: number;
	alreadyRemoved: number;
	forcedAborts: number;
	gracefulCompleted: number;
	omitted: number;
	elapsedMs: number;
	usageDrained: UsageCounters;
	usageDrainFailures: number;
	usageAggregateClamped?: true;
	truncatedAgentDetails: number;
	outputTruncated: boolean;
	outcomes: RemoveTargetOutcome[];
}

export class SubAgentsRemoveError extends Error {
	readonly code: "manager_inactive" | "cancelled" | "invalid_request" | "remove_failed";

	constructor(
		code: "manager_inactive" | "cancelled" | "invalid_request" | "remove_failed",
		message: string,
	) {
		super(message);
		this.name = "SubAgentsRemoveError";
		this.code = code;
	}
}

interface GraceAttempt {
	requested: boolean;
	outcome: RemoveGraceView["outcome"];
	escalated: boolean;
	durationMs: number;
	requestError?: RemoveGraceView["requestError"];
}

interface RemoveDraft {
	outcomeIndex: number;
	full: RemoveSuccessOutcome;
	minimal: RemoveSuccessOutcome;
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

function boundedField(
	value: unknown,
	maxBytes: number,
	field: string,
	truncatedFields: string[],
): string {
	const normalized = oneLine(value);
	const bounded = boundUtf8Line(normalized, maxBytes);
	if (bounded !== normalized) truncatedFields.push(field);
	return bounded;
}

function safeNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeInteger(value: unknown): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function emptyCounters(): UsageCounters {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: 0,
	};
}

function cloneCounters(counters: UsageCounters | undefined): UsageCounters {
	return {
		input: safeInteger(counters?.input),
		output: safeInteger(counters?.output),
		cacheRead: safeInteger(counters?.cacheRead),
		cacheWrite: safeInteger(counters?.cacheWrite),
		totalTokens: safeInteger(counters?.totalTokens),
		cost: safeNumber(counters?.cost),
	};
}

function addCounters(target: UsageCounters, delta: UsageCounters): boolean {
	let clamped = false;
	for (const field of USAGE_FIELDS) {
		const sum = target[field] + safeNumber(delta[field]);
		if (field === "cost") {
			if (Number.isFinite(sum)) target[field] = sum;
			else {
				target[field] = Number.MAX_VALUE;
				clamped = true;
			}
		} else if (Number.isSafeInteger(sum)) {
			target[field] = sum;
		} else {
			target[field] = Number.MAX_SAFE_INTEGER;
			clamped = true;
		}
	}
	return clamped;
}

function toPiUsage(counters: UsageCounters): Usage {
	return {
		input: counters.input,
		output: counters.output,
		cacheRead: counters.cacheRead,
		cacheWrite: counters.cacheWrite,
		totalTokens: counters.totalTokens,
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			total: counters.cost,
		},
	};
}

function errorCode(error: unknown): string | undefined {
	if (!error || typeof error !== "object") return undefined;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

function safeSnapshot(
	runtime: SubAgentsRemoveRuntime,
	id: SubAgentId,
): ManagedSubAgentSnapshot | undefined {
	try {
		return runtime.manager.getAgent(id);
	} catch {
		return undefined;
	}
}

function knownFailure(
	index: number,
	id: string,
	error: unknown,
	runtime: SubAgentsRemoveRuntime,
): RemoveFailureOutcome {
	const candidate =
		error && typeof error === "object"
			? (error as { name?: unknown; code?: unknown })
			: undefined;
	const code = errorCode(error);
	const managerError =
		error instanceof SubAgentManagerError ||
		(typeof candidate?.name === "string" &&
			candidate.name.endsWith("Error") &&
			code !== undefined &&
			MANAGER_ERROR_CODES.has(code));
	const snapshot = safeSnapshot(runtime, id);
	if (managerError && code) {
		const messages: Record<string, string> = {
			manager_closed: "The sub-agent manager generation is closed",
			unknown_agent: "Unknown sub-agent ID",
			stale_agent: "Sub-agent ID belongs to another session generation",
			agent_stopping: "Sub-agent cleanup has started",
		};
		return {
			index,
			ok: false,
			id: id.slice(0, SUB_AGENT_BOUNDS.agentIdChars),
			state: snapshot?.state,
			code: boundUtf8Line(code, DISPLAY_CODE_BYTES) || "remove_failed",
			message: boundUtf8Line(messages[code] ?? "Could not remove the sub-agent", DISPLAY_ERROR_BYTES),
		};
	}
	return {
		index,
		ok: false,
		id: id.slice(0, SUB_AGENT_BOUNDS.agentIdChars),
		state: snapshot?.state,
		code: "remove_failed",
		message: "Could not remove the sub-agent",
	};
}

function knownGraceRequestError(error: unknown): RemoveGraceView["requestError"] {
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
	const messages: Record<string, string> = {
		assignment_not_running: "The child assignment changed before the graceful stop request",
		runtime_missing: "The sub-agent has no active child runtime",
		manager_closed: "The sub-agent manager generation is closed",
	};
	return {
		code: runnerError && code
			? boundUtf8Line(code, DISPLAY_CODE_BYTES) || "grace_request_failed"
			: "grace_request_failed",
		message: runnerError && code
			? boundUtf8Line(messages[code] ?? "Could not request a graceful child stop", DISPLAY_ERROR_BYTES)
			: "Could not request a graceful child stop",
	};
}

function isAssignmentBoundaryError(error: unknown): boolean {
	const candidate =
		error && typeof error === "object"
			? (error as { name?: unknown; code?: unknown })
			: undefined;
	return (
		(error instanceof SubAgentAssignmentRunnerError ||
			candidate?.name === "SubAgentAssignmentRunnerError") &&
		candidate?.code === "assignment_not_running"
	);
}

function graceDelay(ms: number, signal: AbortSignal | undefined): Promise<"elapsed" | "cancelled"> {
	if (signal?.aborted) return Promise.resolve("cancelled");
	return new Promise((resolvePromise) => {
		let settled = false;
		const finish = (result: "elapsed" | "cancelled") => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			resolvePromise(result);
		};
		const onAbort = () => finish("cancelled");
		const timer = setTimeout(() => finish("elapsed"), Math.max(1, ms));
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function isActiveState(state: AgentLifecycleState): boolean {
	return state === "creating" || state === "running";
}

async function requestGracefulStop(
	id: SubAgentId,
	deadline: number,
	signal: AbortSignal | undefined,
	runtime: SubAgentsRemoveRuntime,
): Promise<GraceAttempt> {
	const startedAt = Date.now();
	let requested = false;
	let requestError: RemoveGraceView["requestError"] | undefined;
	const pollIntervalMs = Math.max(1, runtime.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);

	for (let attempt = 0; attempt < MAX_GRACE_REQUEST_ATTEMPTS; attempt += 1) {
		if (signal?.aborted) {
			return {
				requested,
				outcome: "cancelled",
				escalated: true,
				durationMs: Math.max(0, Date.now() - startedAt),
				requestError,
			};
		}
		const snapshot = runtime.manager.getAgent(id);
		if (snapshot.state !== "running") {
			return {
				requested,
				outcome: "completed",
				escalated: isActiveState(snapshot.state),
				durationMs: Math.max(0, Date.now() - startedAt),
				requestError,
			};
		}
		try {
			await runtime.runner.send(id, GRACEFUL_STOP_MESSAGE, "steer");
			requested = true;
			break;
		} catch (error) {
			if (!isAssignmentBoundaryError(error)) {
				requestError = knownGraceRequestError(error);
				break;
			}
			if (Date.now() >= deadline) break;
			const delayed = await graceDelay(Math.min(pollIntervalMs, deadline - Date.now()), signal);
			if (delayed === "cancelled") {
				return {
					requested,
					outcome: "cancelled",
					escalated: true,
					durationMs: Math.max(0, Date.now() - startedAt),
					requestError,
				};
			}
		}
	}

	while (true) {
		const snapshot = runtime.manager.getAgent(id);
		if (!isActiveState(snapshot.state)) {
			return {
				requested,
				outcome: "completed",
				escalated: false,
				durationMs: Math.max(0, Date.now() - startedAt),
				requestError,
			};
		}
		if (signal?.aborted) {
			return {
				requested,
				outcome: "cancelled",
				escalated: true,
				durationMs: Math.max(0, Date.now() - startedAt),
				requestError,
			};
		}
		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			return {
				requested,
				outcome: "timed_out",
				escalated: true,
				durationMs: Math.max(0, Date.now() - startedAt),
				requestError,
			};
		}
		const delayed = await graceDelay(Math.min(pollIntervalMs, remaining), signal);
		if (delayed === "cancelled") {
			return {
				requested,
				outcome: "cancelled",
				escalated: true,
				durationMs: Math.max(0, Date.now() - startedAt),
				requestError,
			};
		}
	}
}

function outputView(
	snapshot: ManagedSubAgentSnapshot,
	truncatedFields: string[],
): RemoveOutputView | undefined {
	const resultTimestamp = safeNumber(snapshot.latestResult?.completedAt);
	const reportTimestamp = safeNumber(snapshot.latestReport?.timestamp);
	if (snapshot.latestReport && reportTimestamp > resultTimestamp) {
		const files = snapshot.latestReport.files.slice(0, 3).map((file) =>
			boundedField(file, 112, "report.files", truncatedFields),
		);
		return {
			kind: "report",
			summary: boundedField(snapshot.latestReport.summary, 512, "report.summary", truncatedFields),
			details: snapshot.latestReport.details
				? boundedField(snapshot.latestReport.details, 1_024, "report.details", truncatedFields)
				: undefined,
			files,
			omittedFileCount: Math.max(0, snapshot.latestReport.files.length - files.length),
			timestamp: reportTimestamp,
		};
	}
	if (snapshot.latestResult) {
		const files = snapshot.latestResult.files.slice(0, 3).map((file) =>
			boundedField(file, 112, "result.files", truncatedFields),
		);
		return {
			kind: "result",
			summary: boundedField(snapshot.latestResult.summary, 512, "result.summary", truncatedFields),
			details: snapshot.latestResult.details
				? boundedField(snapshot.latestResult.details, 1_024, "result.details", truncatedFields)
				: undefined,
			files,
			omittedFileCount: Math.max(0, snapshot.latestResult.files.length - files.length),
			timestamp: resultTimestamp,
		};
	}
	if (snapshot.latestReport) {
		const files = snapshot.latestReport.files.slice(0, 3).map((file) =>
			boundedField(file, 112, "report.files", truncatedFields),
		);
		return {
			kind: "report",
			summary: boundedField(snapshot.latestReport.summary, 512, "report.summary", truncatedFields),
			details: snapshot.latestReport.details
				? boundedField(snapshot.latestReport.details, 1_024, "report.details", truncatedFields)
				: undefined,
			files,
			omittedFileCount: Math.max(0, snapshot.latestReport.files.length - files.length),
			timestamp: reportTimestamp,
		};
	}
	return undefined;
}

function buildSuccessView(
	index: number,
	initial: ManagedSubAgentSnapshot,
	removed: ManagedSubAgentSnapshot,
	mode: "graceful" | "abort",
	grace: GraceAttempt | undefined,
	usageDrained: UsageCounters | undefined,
	usageDrainError: RemoveFailureOutcome | undefined,
): { full: RemoveSuccessOutcome; minimal: RemoveSuccessOutcome } {
	const truncatedFields: string[] = [];
	const alreadyRemoved = initial.state === "removed";
	const forcedAbort = !alreadyRemoved && (mode === "abort" || Boolean(grace?.escalated));
	const full: RemoveSuccessOutcome = {
		index,
		ok: true,
		id: removed.id,
		name: boundedField(removed.spec.name, 96, "name", truncatedFields) || "unnamed",
		state: "removed",
		mode,
		initialState: initial.state,
		alreadyRemoved: alreadyRemoved ? true : undefined,
		forcedAbort: forcedAbort ? true : undefined,
		grace: grace
			? {
					requested: grace.requested,
					outcome: grace.outcome,
					escalated: grace.escalated,
					durationMs: safeNumber(grace.durationMs),
					requestError: grace.requestError,
				}
			: undefined,
		output: outputView(removed, truncatedFields),
		lastError: removed.lastError
			? boundedField(removed.lastError, 256, "lastError", truncatedFields)
			: undefined,
		usageDrained: usageDrained ? cloneCounters(usageDrained) : undefined,
		usageDrainError: usageDrainError
			? { code: usageDrainError.code, message: usageDrainError.message }
			: undefined,
	};
	if (truncatedFields.length > 0) full.truncatedFields = [...new Set(truncatedFields)];
	const minimal: RemoveSuccessOutcome = {
		index,
		ok: true,
		id: removed.id,
		name: boundUtf8Line(removed.spec.name, 56) || "unnamed",
		state: "removed",
		mode,
		truncated: true,
	};
	return { full, minimal };
}

async function removeOne(
	id: SubAgentId,
	index: number,
	mode: "graceful" | "abort",
	graceDeadline: number,
	signal: AbortSignal | undefined,
	runtime: SubAgentsRemoveRuntime,
): Promise<RemoveTargetOutcome> {
	let initial: ManagedSubAgentSnapshot;
	try {
		initial = runtime.manager.getAgent(id);
	} catch (error) {
		return knownFailure(index, id, error, runtime);
	}

	if (initial.restoredHistory) {
		return buildSuccessView(
			index,
			initial,
			initial,
			mode,
			undefined,
			undefined,
			undefined,
		).full;
	}

	let grace: GraceAttempt | undefined;
	if (mode === "graceful") {
		if (initial.state === "running") {
			try {
				grace = await requestGracefulStop(id, graceDeadline, signal, runtime);
			} catch (error) {
				grace = {
					requested: false,
					outcome: "unavailable",
					escalated: true,
					durationMs: 0,
					requestError: knownGraceRequestError(error),
				};
			}
		} else if (initial.state === "creating") {
			grace = {
				requested: false,
				outcome: "unavailable",
				escalated: true,
				durationMs: 0,
			};
		} else {
			grace = {
				requested: false,
				outcome: "not_needed",
				escalated: false,
				durationMs: 0,
			};
		}
	}

	let removed: ManagedSubAgentSnapshot;
	try {
		removed = await runtime.manager.removeAgent(id, `sub_agents_remove ${mode}`);
	} catch (error) {
		const current = safeSnapshot(runtime, id);
		if (!current || current.state !== "removed") {
			return knownFailure(index, id, error, runtime);
		}
		removed = current;
	}

	let usageDrained: UsageCounters | undefined;
	let usageDrainError: RemoveFailureOutcome | undefined;
	try {
		usageDrained = cloneCounters(await runtime.manager.drainUsage(id));
		try {
			removed = runtime.manager.getAgent(id);
		} catch {
			// The removed snapshot remains authoritative for this result.
		}
	} catch (error) {
		usageDrainError = knownFailure(index, id, error, runtime);
	}
	return buildSuccessView(index, initial, removed, mode, grace, usageDrained, usageDrainError).full;
}

function selectTargets(
	params: SubAgentsRemoveInput,
	runtime: SubAgentsRemoveRuntime,
): SubAgentId[] {
	if (params.scope === "selected") {
		if (!params.ids || params.ids.length === 0) {
			throw new SubAgentsRemoveError(
				"invalid_request",
				"scope=selected requires at least one exact sub-agent ID",
			);
		}
		if (params.ids.length > SUB_AGENT_BOUNDS.controlTargets || new Set(params.ids).size !== params.ids.length) {
			throw new SubAgentsRemoveError(
				"invalid_request",
				`Selected removal requires at most ${SUB_AGENT_BOUNDS.controlTargets} unique IDs`,
			);
		}
		return [...params.ids];
	}
	if (params.scope === "all") {
		if (params.ids !== undefined) {
			throw new SubAgentsRemoveError(
				"invalid_request",
				"scope=all does not accept selected IDs",
			);
		}
		try {
			return runtime.manager
				.listAgents({ includeRemoved: false })
				.map((snapshot) => snapshot.id);
		} catch {
			throw new SubAgentsRemoveError("remove_failed", "Could not inspect the sub-agent manager");
		}
	}
	throw new SubAgentsRemoveError("invalid_request", "A valid removal scope is required");
}

function selectVisibleOutcomes(outcomes: RemoveTargetOutcome[]): RemoveTargetOutcome[] {
	if (outcomes.length <= SUB_AGENT_BOUNDS.controlTargets) return outcomes;
	const failures = outcomes.filter((outcome) => !outcome.ok);
	const successes = outcomes.filter((outcome) => outcome.ok);
	return [...failures, ...successes]
		.slice(0, SUB_AGENT_BOUNDS.controlTargets)
		.sort((left, right) => left.index - right.index);
}

function jsonBytes(value: unknown): number {
	return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function fitFinalDetails(
	base: Omit<
		SubAgentsRemoveToolDetails,
		"outcomes" | "truncatedAgentDetails" | "outputTruncated"
	>,
	visible: RemoveTargetOutcome[],
): SubAgentsRemoveToolDetails {
	const outcomes: RemoveTargetOutcome[] = [];
	const drafts: RemoveDraft[] = [];
	for (const outcome of visible) {
		if (!outcome.ok) {
			outcomes.push(outcome);
			continue;
		}
		const minimal: RemoveSuccessOutcome = {
			index: outcome.index,
			ok: true,
			id: outcome.id,
			name: boundUtf8Line(outcome.name, 56) || "unnamed",
			state: "removed",
			mode: outcome.mode,
			truncated: true,
		};
		const outcomeIndex = outcomes.length;
		outcomes.push(minimal);
		drafts.push({ outcomeIndex, full: outcome, minimal });
	}
	const details: SubAgentsRemoveToolDetails = {
		...base,
		truncatedAgentDetails: drafts.length,
		outputTruncated: base.omitted > 0 || drafts.length > 0,
		outcomes,
	};
	for (const draft of drafts) {
		const previous = outcomes[draft.outcomeIndex];
		outcomes[draft.outcomeIndex] = draft.full;
		if (jsonBytes(details) <= DETAILS_RICH_BUDGET_BYTES) {
			details.truncatedAgentDetails -= 1;
		} else {
			outcomes[draft.outcomeIndex] = previous;
		}
	}
	details.outputTruncated = base.omitted > 0 || details.truncatedAgentDetails > 0;
	if (jsonBytes(details) > DETAILS_MAX_BYTES) {
		for (const draft of drafts) outcomes[draft.outcomeIndex] = draft.minimal;
		details.truncatedAgentDetails = drafts.length;
		details.outputTruncated = base.omitted > 0 || drafts.length > 0;
	}
	return details;
}

function formatOutcome(outcome: RemoveTargetOutcome): string {
	if (!outcome.ok) {
		return boundUtf8Line(
			`- [failed] ${outcome.id}: ${outcome.code}: ${outcome.message}`,
			DISPLAY_LINE_BYTES,
		);
	}
	const parts = [
		`- [removed] ${outcome.name}: ${outcome.id}`,
		outcome.alreadyRemoved ? "already removed" : outcome.mode,
	];
	if (outcome.forcedAbort) parts.push("forced abort");
	if (outcome.grace) parts.push(`grace ${outcome.grace.outcome}`);
	if (outcome.output?.summary) parts.push(boundUtf8Line(outcome.output.summary, 120));
	if (outcome.usageDrainError) parts.push(`usage: ${outcome.usageDrainError.code}`);
	if (outcome.truncated) parts.push("detail truncated");
	return boundUtf8Line(parts.join(" · "), DISPLAY_LINE_BYTES);
}

export function formatSubAgentsRemoveResult(details: SubAgentsRemoveToolDetails): string {
	const lines = [
		`sub_agents_remove: ${details.newlyRemoved} removed · ${details.alreadyRemoved} already removed · ${details.failed} failed · ${details.forcedAborts} forced aborts · ${details.omitted} outcomes omitted · generation ${details.generation}`,
		...details.outcomes.map(formatOutcome),
	];
	if (details.outputTruncated) {
		lines.push("[remove output was bounded; inspect counters before relying on missing per-agent detail]");
	}
	let text = "";
	let omittedLines = 0;
	for (const line of lines) {
		const candidate = text ? `${text}\n${line}` : line;
		if (Buffer.byteLength(candidate, "utf8") <= CONTENT_MAX_BYTES - 128) text = candidate;
		else omittedLines += 1;
	}
	if (omittedLines > 0) text += `\n[${omittedLines} additional bounded remove lines omitted]`;
	return text;
}

/** Gracefully settle or forcibly abort selected live children, dispose them, and drain usage once. */
export async function executeSubAgentsRemove(
	params: SubAgentsRemoveInput,
	signal: AbortSignal | undefined,
	runtime: SubAgentsRemoveRuntime | undefined,
): Promise<{
	content: Array<{ type: "text"; text: string }>;
	details: SubAgentsRemoveToolDetails;
	usage: Usage;
}> {
	if (!runtime) {
		throw new SubAgentsRemoveError(
			"manager_inactive",
			"No active sub-agent manager generation is available",
		);
	}
	if (signal?.aborted) {
		throw new SubAgentsRemoveError(
			"cancelled",
			"sub_agents_remove was cancelled before any child cleanup started",
		);
	}
	const mode = params.mode ?? "graceful";
	if (mode !== "graceful" && mode !== "abort") {
		throw new SubAgentsRemoveError("invalid_request", "A valid removal mode is required");
	}
	const gracePeriodSeconds = params.gracePeriodSeconds ?? DEFAULT_GRACE_PERIOD_SECONDS;
	if (
		typeof gracePeriodSeconds !== "number" ||
		!Number.isFinite(gracePeriodSeconds) ||
		gracePeriodSeconds <= 0 ||
		gracePeriodSeconds > SUB_AGENT_BOUNDS.gracefulStopSeconds
	) {
		throw new SubAgentsRemoveError(
			"invalid_request",
			`Grace period must be greater than zero and at most ${SUB_AGENT_BOUNDS.gracefulStopSeconds} seconds`,
		);
	}

	const ids = selectTargets(params, runtime);
	if (signal?.aborted) {
		throw new SubAgentsRemoveError(
			"cancelled",
			"sub_agents_remove was cancelled before any child cleanup started",
		);
	}
	const startedAt = Date.now();
	const graceDeadline = startedAt + gracePeriodSeconds * 1_000;
	// Every selected child starts independently. Once this point is crossed, the
	// tool completes even if its caller aborts so cleanup and usage drains are not hidden.
	const allOutcomes = await Promise.all(
		ids.map((id, index) => removeOne(id, index, mode, graceDeadline, signal, runtime)),
	);
	const aggregate = emptyCounters();
	let aggregateClamped = false;
	for (const outcome of allOutcomes) {
		if (outcome.ok && outcome.usageDrained) {
			aggregateClamped = addCounters(aggregate, outcome.usageDrained) || aggregateClamped;
		}
	}
	const succeeded = allOutcomes.filter((outcome) => outcome.ok).length;
	const alreadyRemoved = allOutcomes.filter((outcome) => outcome.ok && outcome.alreadyRemoved).length;
	const visible = selectVisibleOutcomes(allOutcomes);
	const details = fitFinalDetails({
		generation: runtime.manager.generation,
		scope: params.scope,
		mode,
		gracePeriodSeconds,
		requested: ids.length,
		returned: visible.length,
		succeeded,
		failed: allOutcomes.length - succeeded,
		newlyRemoved: succeeded - alreadyRemoved,
		alreadyRemoved,
		forcedAborts: allOutcomes.filter((outcome) => outcome.ok && outcome.forcedAbort).length,
		gracefulCompleted: allOutcomes.filter(
			(outcome) => outcome.ok && outcome.grace?.outcome === "completed" && !outcome.grace.escalated,
		).length,
		omitted: allOutcomes.length - visible.length,
		elapsedMs: Math.max(0, Date.now() - startedAt),
		usageDrained: aggregate,
		usageDrainFailures: allOutcomes.filter((outcome) => outcome.ok && outcome.usageDrainError).length,
		usageAggregateClamped: aggregateClamped ? true : undefined,
	}, visible);
	return {
		content: [{ type: "text", text: formatSubAgentsRemoveResult(details) }],
		details,
		usage: toPiUsage(aggregate),
	};
}

export function createSubAgentsRemoveTool(
	getRuntime: () => SubAgentsRemoveRuntime | undefined,
) {
	return defineTool<typeof subAgentsRemoveSchema, SubAgentsRemoveToolDetails>({
		name: "sub_agents_remove",
		label: "Remove Sub-Agents",
		description:
			"Permanently dispose selected exact IDs or every currently live child. Graceful mode requests a concise final boundary and waits only for the bounded grace period before forced abort; abort mode stops immediately. Returns bounded final output, atomically drains newly accrued usage, preserves historical manager records, and is idempotent for already removed exact IDs.",
		promptSnippet:
			"Gracefully finalize or immediately abort and permanently dispose selected/all live sub-agents",
		promptGuidelines: [
			"Use sub_agents_remove only when a child is no longer needed; graceful mode requests a final summary and escalates after its bounded deadline, while mode=abort stops immediately.",
			"sub_agents_remove scope=selected requires exact current-generation IDs; scope=all permanently disposes every child that is live when the call starts.",
			"After sub_agents_remove starts cleanup it completes despite caller cancellation so final disposal and one-time usage drains remain visible; repeated selected removal is idempotent.",
		],
		parameters: subAgentsRemoveSchema,
		executionMode: "parallel",
		async execute(_toolCallId, params, signal) {
			return executeSubAgentsRemove(params, signal, getRuntime());
		},
		renderCall: renderRemoveCall,
		renderResult: renderRemoveResult,
	});
}
