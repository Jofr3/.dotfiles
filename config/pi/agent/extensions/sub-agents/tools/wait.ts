import { Buffer } from "node:buffer";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { Usage } from "@earendil-works/pi-ai";
import {
	renderWaitCall,
	renderWaitResult,
} from "../ui/renderers.ts";
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
	subAgentsWaitSchema,
	type SubAgentsWaitInput,
} from "./schemas.ts";

const DEFAULT_TIMEOUT_SECONDS = 120;
const DEFAULT_POLL_INTERVAL_MS = 100;
const CONTENT_MAX_BYTES = 48 * 1024;
const DETAILS_MAX_BYTES = 48 * 1024;
const DETAILS_RICH_BUDGET_BYTES = 46 * 1024;
const DISPLAY_LINE_BYTES = 420;
const DISPLAY_CODE_BYTES = 40;
const DISPLAY_ERROR_BYTES = 96;
const WAIT_STATES = new Set<AgentLifecycleState>(["idle", "blocked", "failed", "removed"]);
const USAGE_FIELDS = [
	"input",
	"output",
	"cacheRead",
	"cacheWrite",
	"totalTokens",
	"cost",
] as const;
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

export interface SubAgentsWaitRuntime {
	readonly manager: Pick<
		SubAgentManager,
		"generation" | "listAgents" | "getAgent" | "drainUsage"
	>;
	/** Internal test/latency tuning only; the public timeout remains seconds. */
	readonly pollIntervalMs?: number;
}

export interface WaitOutputView {
	kind: "result" | "report";
	summary: string;
	details?: string;
	files: string[];
	omittedFileCount: number;
	timestamp: number;
}

export interface WaitSuccessOutcome {
	ok: true;
	id: SubAgentId;
	name: string;
	state: AgentLifecycleState;
	matched: boolean;
	updatedAt: number;
	truncated?: true;
	truncatedFields?: string[];
	assignment?: {
		sequence: number;
		state: string;
		startedAt: number;
		endedAt?: number;
	};
	output?: WaitOutputView;
	blocker?: string;
	lastError?: string;
	usageDrained?: UsageCounters;
	usageDrainError?: {
		code: string;
		message: string;
	};
}

export interface WaitFailureOutcome {
	ok: false;
	id: string;
	code: string;
	message: string;
}

export type WaitTargetOutcome = WaitSuccessOutcome | WaitFailureOutcome;

export interface WaitProgressOutcome {
	ok: boolean;
	id: string;
	state?: AgentLifecycleState;
	matched?: boolean;
	assignmentSequence?: number;
	activeToolCount?: number;
	pendingMessageCount?: number;
	code?: string;
}

export interface SubAgentsWaitProgressDetails {
	phase: "waiting";
	generation: string;
	selection: "all" | "selected";
	condition: "any" | "all";
	states: AgentLifecycleState[];
	requested: number;
	returned: number;
	matched: number;
	failed: number;
	omitted: number;
	elapsedMs: number;
	outcomes: WaitProgressOutcome[];
}

export interface SubAgentsWaitFinalDetails {
	phase: "complete";
	generation: string;
	selection: "all" | "selected";
	condition: "any" | "all";
	states: AgentLifecycleState[];
	timeoutSeconds: number;
	completion: "satisfied" | "timed_out" | "no_targets";
	satisfied: boolean;
	timedOut: boolean;
	requested: number;
	returned: number;
	succeeded: number;
	failed: number;
	matched: number;
	omitted: number;
	elapsedMs: number;
	usageDrained: UsageCounters;
	usageDrainFailures: number;
	usageAggregateClamped?: true;
	truncatedAgentDetails: number;
	outputTruncated: boolean;
	outcomes: WaitTargetOutcome[];
}

export type SubAgentsWaitToolDetails = SubAgentsWaitProgressDetails | SubAgentsWaitFinalDetails;

export type SubAgentsWaitUpdate = (partial: {
	content: Array<{ type: "text"; text: string }>;
	details: SubAgentsWaitProgressDetails;
}) => void;

export class SubAgentsWaitError extends Error {
	readonly code: "manager_inactive" | "cancelled" | "wait_failed";

	constructor(
		code: "manager_inactive" | "cancelled" | "wait_failed",
		message: string,
	) {
		super(message);
		this.name = "SubAgentsWaitError";
		this.code = code;
	}
}

interface InspectedTarget {
	id: string;
	snapshot?: ManagedSubAgentSnapshot;
	failure?: WaitFailureOutcome;
	usageDrained?: UsageCounters;
	usageDrainError?: WaitFailureOutcome;
}

interface WaitSelection {
	ids: string[];
	requested: number;
	omitted: number;
}

interface WaitDraft {
	outcomeIndex: number;
	full: WaitSuccessOutcome;
	minimal: WaitSuccessOutcome;
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

function knownFailure(id: string, error: unknown): WaitFailureOutcome {
	const candidate =
		error && typeof error === "object"
			? (error as { name?: unknown; code?: unknown })
			: undefined;
	const managerError =
		error instanceof SubAgentManagerError ||
		(typeof candidate?.name === "string" &&
			candidate.name.endsWith("Error") &&
			typeof candidate.code === "string" &&
			MANAGER_ERROR_CODES.has(candidate.code));
	if (managerError && typeof candidate?.code === "string") {
		const code = boundUtf8Line(candidate.code, DISPLAY_CODE_BYTES) || "wait_failed";
		const messages: Record<string, string> = {
			manager_closed: "The sub-agent manager generation is closed",
			unknown_agent: "Unknown sub-agent ID",
			stale_agent: "Sub-agent ID belongs to another session generation",
			agent_stopping: "Sub-agent cleanup has started",
		};
		return {
			ok: false,
			id: id.slice(0, SUB_AGENT_BOUNDS.agentIdChars),
			code,
			message: messages[code] ?? "Could not inspect the sub-agent",
		};
	}
	return {
		ok: false,
		id: id.slice(0, SUB_AGENT_BOUNDS.agentIdChars),
		code: "wait_failed",
		message: "Could not inspect the sub-agent",
	};
}

function selectTargets(
	params: SubAgentsWaitInput,
	runtime: SubAgentsWaitRuntime,
): WaitSelection {
	if (params.ids) {
		return { ids: [...params.ids], requested: params.ids.length, omitted: 0 };
	}
	let snapshots: ManagedSubAgentSnapshot[];
	try {
		snapshots = runtime.manager.listAgents({ includeRemoved: false });
	} catch {
		throw new SubAgentsWaitError("wait_failed", "Could not inspect the sub-agent manager");
	}
	const requested = snapshots.length;
	return {
		ids: snapshots.slice(0, SUB_AGENT_BOUNDS.controlTargets).map((snapshot) => snapshot.id),
		requested,
		omitted: Math.max(0, requested - SUB_AGENT_BOUNDS.controlTargets),
	};
}

function inspectTargets(
	ids: readonly string[],
	runtime: SubAgentsWaitRuntime,
): InspectedTarget[] {
	return ids.map((id) => {
		try {
			return { id, snapshot: runtime.manager.getAgent(id) };
		} catch (error) {
			return { id, failure: knownFailure(id, error) };
		}
	});
}

function matchesState(snapshot: ManagedSubAgentSnapshot, states: ReadonlySet<string>): boolean {
	return states.has(snapshot.state);
}

function barrierSatisfied(
	inspected: readonly InspectedTarget[],
	condition: "any" | "all",
	states: ReadonlySet<string>,
): boolean {
	const snapshots = inspected.flatMap((target) => target.snapshot ? [target.snapshot] : []);
	if (snapshots.length === 0) return false;
	const matched = snapshots.filter((snapshot) => matchesState(snapshot, states)).length;
	return condition === "any" ? matched > 0 : matched === snapshots.length;
}

function progressSignature(inspected: readonly InspectedTarget[], states: ReadonlySet<string>): string {
	return inspected.map((target) => {
		if (!target.snapshot) return `${target.id}:error:${target.failure?.code ?? "wait_failed"}`;
		const snapshot = target.snapshot;
		return [
			snapshot.id,
			snapshot.state,
			matchesState(snapshot, states) ? "1" : "0",
			snapshot.currentAssignment?.sequence ?? 0,
			snapshot.runtime.activeToolCount,
			snapshot.runtime.pendingMessageCount,
		].join(":");
	}).join("|");
}

function progressDetails(
	params: {
		selection: "all" | "selected";
		condition: "any" | "all";
		states: AgentLifecycleState[];
		requested: number;
		omitted: number;
		startedAt: number;
	},
	runtime: SubAgentsWaitRuntime,
	inspected: readonly InspectedTarget[],
): SubAgentsWaitProgressDetails {
	const outcomes: WaitProgressOutcome[] = inspected.map((target) => {
		if (!target.snapshot) {
			return {
				ok: false,
				id: target.id,
				code: target.failure?.code ?? "wait_failed",
			};
		}
		const snapshot = target.snapshot;
		return {
			ok: true,
			id: snapshot.id,
			state: snapshot.state,
			matched: params.states.includes(snapshot.state),
			assignmentSequence: snapshot.currentAssignment?.sequence,
			activeToolCount: safeInteger(snapshot.runtime.activeToolCount),
			pendingMessageCount: safeInteger(snapshot.runtime.pendingMessageCount),
		};
	});
	return {
		phase: "waiting",
		generation: runtime.manager.generation,
		selection: params.selection,
		condition: params.condition,
		states: [...params.states],
		requested: params.requested,
		returned: outcomes.length,
		matched: outcomes.filter((outcome) => outcome.ok && outcome.matched).length,
		failed: outcomes.filter((outcome) => !outcome.ok).length,
		omitted: params.omitted,
		elapsedMs: Math.max(0, Date.now() - params.startedAt),
		outcomes,
	};
}

function emitProgress(
	onUpdate: SubAgentsWaitUpdate | undefined,
	details: SubAgentsWaitProgressDetails,
): void {
	if (!onUpdate) return;
	onUpdate({
		content: [{
			type: "text",
			text: `Waiting for sub-agents: ${details.matched}/${details.returned - details.failed} matched · ${details.failed} errors`,
		}],
		details,
	});
}

function abortableDelay(ms: number, signal: AbortSignal | undefined): Promise<void> {
	if (signal?.aborted) {
		return Promise.reject(new SubAgentsWaitError("cancelled", "sub_agents_wait was cancelled"));
	}
	return new Promise<void>((resolvePromise, rejectPromise) => {
		let settled = false;
		const finish = (error?: SubAgentsWaitError) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			if (error) rejectPromise(error);
			else resolvePromise();
		};
		const onAbort = () => finish(new SubAgentsWaitError("cancelled", "sub_agents_wait was cancelled"));
		const timer = setTimeout(() => finish(), Math.max(1, ms));
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

async function drainSelectedUsage(
	inspected: readonly InspectedTarget[],
	runtime: SubAgentsWaitRuntime,
): Promise<{ targets: InspectedTarget[]; aggregate: UsageCounters; clamped: boolean; failures: number }> {
	const aggregate = emptyCounters();
	let clamped = false;
	let failures = 0;
	const targets = await Promise.all(inspected.map(async (target): Promise<InspectedTarget> => {
		if (!target.snapshot || target.snapshot.restoredHistory) return target;
		try {
			const usageDrained = cloneCounters(await runtime.manager.drainUsage(target.id));
			clamped = addCounters(aggregate, usageDrained) || clamped;
			let snapshot = target.snapshot;
			try {
				snapshot = runtime.manager.getAgent(target.id);
			} catch {
				// The pre-drain bounded snapshot remains authoritative for this result.
			}
			return { ...target, snapshot, usageDrained };
		} catch (error) {
			failures += 1;
			return { ...target, usageDrainError: knownFailure(target.id, error) };
		}
	}));
	return { targets, aggregate, clamped, failures };
}

function outputView(
	snapshot: ManagedSubAgentSnapshot,
	truncatedFields: string[],
): WaitOutputView | undefined {
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
			timestamp: safeNumber(snapshot.latestResult.completedAt),
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
			timestamp: safeNumber(snapshot.latestReport.timestamp),
		};
	}
	return undefined;
}

function buildWaitView(
	target: InspectedTarget,
	states: ReadonlySet<string>,
): { full: WaitSuccessOutcome; minimal: WaitSuccessOutcome } {
	const snapshot = target.snapshot!;
	const truncatedFields: string[] = [];
	const full: WaitSuccessOutcome = {
		ok: true,
		id: snapshot.id,
		name: boundedField(snapshot.spec.name, 96, "name", truncatedFields) || "unnamed",
		state: snapshot.state,
		matched: matchesState(snapshot, states),
		updatedAt: safeNumber(snapshot.updatedAt),
		assignment: snapshot.currentAssignment
			? {
					sequence: safeInteger(snapshot.currentAssignment.sequence),
					state: snapshot.currentAssignment.state,
					startedAt: safeNumber(snapshot.currentAssignment.startedAt),
					endedAt: snapshot.currentAssignment.endedAt === undefined
						? undefined
						: safeNumber(snapshot.currentAssignment.endedAt),
				}
			: undefined,
		output: outputView(snapshot, truncatedFields),
		blocker: snapshot.currentAssignment?.blocker
			? boundedField(snapshot.currentAssignment.blocker, 256, "blocker", truncatedFields)
			: undefined,
		lastError: snapshot.lastError
			? boundedField(snapshot.lastError, 256, "lastError", truncatedFields)
			: undefined,
		usageDrained: target.usageDrained ? cloneCounters(target.usageDrained) : undefined,
		usageDrainError: target.usageDrainError
			? { code: target.usageDrainError.code, message: target.usageDrainError.message }
			: undefined,
	};
	if (truncatedFields.length > 0) full.truncatedFields = [...new Set(truncatedFields)];
	const minimal: WaitSuccessOutcome = {
		ok: true,
		id: snapshot.id,
		name: boundUtf8Line(snapshot.spec.name, 56) || "unnamed",
		state: snapshot.state,
		matched: matchesState(snapshot, states),
		updatedAt: safeNumber(snapshot.updatedAt),
		truncated: true,
	};
	return { full, minimal };
}

function jsonBytes(value: unknown): number {
	return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function fitFinalDetails(
	base: Omit<
		SubAgentsWaitFinalDetails,
		"outcomes" | "truncatedAgentDetails" | "outputTruncated"
	>,
	initial: WaitTargetOutcome[],
	drafts: WaitDraft[],
): SubAgentsWaitFinalDetails {
	const outcomes = [...initial];
	const details: SubAgentsWaitFinalDetails = {
		...base,
		truncatedAgentDetails: drafts.length,
		outputTruncated: drafts.length > 0,
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
	details.outputTruncated = details.truncatedAgentDetails > 0;
	if (jsonBytes(details) > DETAILS_MAX_BYTES) {
		for (const draft of drafts) outcomes[draft.outcomeIndex] = draft.minimal;
		details.truncatedAgentDetails = drafts.length;
		details.outputTruncated = drafts.length > 0;
	}
	return details;
}

function formatOutcome(outcome: WaitTargetOutcome): string {
	if (!outcome.ok) {
		return boundUtf8Line(
			`- [error] ${outcome.id}: ${outcome.code}: ${outcome.message}`,
			DISPLAY_LINE_BYTES,
		);
	}
	const parts = [
		`- [${outcome.matched ? "matched" : "pending"}] ${outcome.name}: ${outcome.id}`,
		outcome.state,
	];
	if (outcome.assignment) parts.push(`assignment ${outcome.assignment.sequence} ${outcome.assignment.state}`);
	const summary = outcome.output?.summary ?? outcome.blocker ?? outcome.lastError;
	if (summary) parts.push(boundUtf8Line(summary, 120));
	if (outcome.usageDrainError) parts.push(`usage: ${outcome.usageDrainError.code}`);
	if (outcome.truncated) parts.push("detail truncated");
	return boundUtf8Line(parts.join(" · "), DISPLAY_LINE_BYTES);
}

export function formatSubAgentsWaitResult(details: SubAgentsWaitFinalDetails): string {
	const lines = [
		`sub_agents_wait: ${details.completion} · ${details.matched}/${details.succeeded} matched · ${details.failed} errors · ${details.omitted} omitted · generation ${details.generation}`,
		...details.outcomes.map(formatOutcome),
	];
	if (details.outputTruncated) {
		lines.push("[wait output was bounded; inspect truncation counters before relying on missing detail]");
	}
	let text = "";
	let omittedLines = 0;
	for (const line of lines) {
		const candidate = text ? `${text}\n${line}` : line;
		if (Buffer.byteLength(candidate, "utf8") <= CONTENT_MAX_BYTES - 128) text = candidate;
		else omittedLines += 1;
	}
	if (omittedLines > 0) text += `\n[${omittedLines} additional bounded wait lines omitted]`;
	return text;
}

/** Wait for a fixed selected/current-live barrier, then atomically drain selected child usage. */
export async function executeSubAgentsWait(
	params: SubAgentsWaitInput,
	signal: AbortSignal | undefined,
	onUpdate: SubAgentsWaitUpdate | undefined,
	runtime: SubAgentsWaitRuntime | undefined,
): Promise<{
	content: Array<{ type: "text"; text: string }>;
	details: SubAgentsWaitFinalDetails;
	usage: Usage;
}> {
	if (!runtime) {
		throw new SubAgentsWaitError(
			"manager_inactive",
			"No active sub-agent manager generation is available",
		);
	}
	if (signal?.aborted) {
		throw new SubAgentsWaitError(
			"cancelled",
			"sub_agents_wait was cancelled before manager state was inspected",
		);
	}

	const selection = selectTargets(params, runtime);
	const selectionKind = params.ids ? "selected" as const : "all" as const;
	const condition = params.condition ?? "all";
	const states = (params.states ?? [...WAIT_STATES]) as AgentLifecycleState[];
	const stateSet = new Set(states);
	const timeoutSeconds = params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
	const timeoutMs = Math.max(0, timeoutSeconds * 1_000);
	const pollIntervalMs = Math.max(1, runtime.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
	const startedAt = Date.now();
	const deadline = startedAt + timeoutMs;
	let inspected = inspectTargets(selection.ids, runtime);
	let lastSignature = "";
	let completion: SubAgentsWaitFinalDetails["completion"] = "no_targets";

	while (true) {
		if (signal?.aborted) throw new SubAgentsWaitError("cancelled", "sub_agents_wait was cancelled");
		const signature = progressSignature(inspected, stateSet);
		if (signature !== lastSignature) {
			lastSignature = signature;
			emitProgress(onUpdate, progressDetails({
				selection: selectionKind,
				condition,
				states,
				requested: selection.requested,
				omitted: selection.omitted,
				startedAt,
			}, runtime, inspected));
		}
		const waitable = inspected.filter((target) => target.snapshot).length;
		if (waitable === 0) {
			completion = "no_targets";
			break;
		}
		if (barrierSatisfied(inspected, condition, stateSet)) {
			completion = "satisfied";
			break;
		}
		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			completion = "timed_out";
			break;
		}
		await abortableDelay(Math.min(pollIntervalMs, remaining), signal);
		inspected = inspectTargets(selection.ids, runtime);
	}

	if (signal?.aborted) throw new SubAgentsWaitError("cancelled", "sub_agents_wait was cancelled");
	// Once drains begin, complete the result even if cancellation arrives: throwing
	// would hide already-advanced per-child usage watermarks from Pi accounting.
	const drained = await drainSelectedUsage(inspected, runtime);
	inspected = drained.targets;
	const successful = inspected.filter((target) => target.snapshot);
	const matched = successful.filter((target) => matchesState(target.snapshot!, stateSet)).length;
	const initial: WaitTargetOutcome[] = [];
	const drafts: WaitDraft[] = [];
	for (const target of inspected) {
		if (!target.snapshot) {
			initial.push(target.failure ?? knownFailure(target.id, undefined));
			continue;
		}
		const view = buildWaitView(target, stateSet);
		const outcomeIndex = initial.length;
		initial.push(view.minimal);
		drafts.push({ outcomeIndex, ...view });
	}
	const failed = initial.filter((outcome) => !outcome.ok).length;
	const details = fitFinalDetails({
		phase: "complete",
		generation: runtime.manager.generation,
		selection: selectionKind,
		condition,
		states,
		timeoutSeconds,
		completion,
		satisfied: completion === "satisfied",
		timedOut: completion === "timed_out",
		requested: selection.requested,
		returned: initial.length,
		succeeded: initial.length - failed,
		failed,
		matched,
		omitted: selection.omitted,
		elapsedMs: Math.max(0, Date.now() - startedAt),
		usageDrained: drained.aggregate,
		usageDrainFailures: drained.failures,
		usageAggregateClamped: drained.clamped ? true : undefined,
	}, initial, drafts);
	return {
		content: [{ type: "text", text: formatSubAgentsWaitResult(details) }],
		details,
		usage: toPiUsage(drained.aggregate),
	};
}

export function createSubAgentsWaitTool(
	getRuntime: () => SubAgentsWaitRuntime | undefined,
) {
	return defineTool<typeof subAgentsWaitSchema, SubAgentsWaitToolDetails>({
		name: "sub_agents_wait",
		label: "Wait for Sub-Agents",
		description:
			"Wait at a bounded any/all barrier for selected exact IDs or the fixed set of live children present when the call starts. Streams compact state changes, returns bounded final outputs on satisfaction or timeout, atomically drains newly accrued selected-child usage, and never removes children.",
		promptSnippet:
			"Wait at a bounded sub-agent state barrier, stream status, and collect final outputs and usage",
		promptGuidelines: [
			"Use sub_agents_wait when synchronization is required; use exact IDs when the barrier must target specific children, because omitted ids capture only the bounded live set present when the call starts.",
			"sub_agents_wait drains newly accrued usage for every valid selected child when it returns, including on timeout, and never removes children.",
			"Use sub_agents_status instead of repeated short sub_agents_wait calls when only observation is needed.",
		],
		parameters: subAgentsWaitSchema,
		executionMode: "parallel",
		async execute(_toolCallId, params, signal, onUpdate) {
			return executeSubAgentsWait(params, signal, onUpdate, getRuntime());
		},
		renderCall: renderWaitCall,
		renderResult: renderWaitResult,
	});
}
