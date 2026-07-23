import { Buffer } from "node:buffer";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { Usage } from "@earendil-works/pi-ai";
import {
	renderStatusCall,
	renderStatusResult,
} from "../ui/renderers.ts";
import {
	SubAgentManagerError,
	type SubAgentManager,
} from "../manager.ts";
import type {
	AgentLifecycleState,
	BoundedAgentEvent,
	ManagedSubAgentSnapshot,
	SubAgentId,
	UsageCounters,
	UsageLedger,
} from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";
import {
	subAgentsStatusSchema,
	type SubAgentsStatusInput,
} from "./schemas.ts";

const DEFAULT_EVENT_LIMIT = 20;
const CONTENT_MAX_BYTES = 48 * 1024;
const DETAILS_MAX_BYTES = 48 * 1024;
const DETAILS_RICH_BUDGET_BYTES = 46 * 1024;
const DISPLAY_LINE_BYTES = 420;
const DISPLAY_CODE_BYTES = 64;
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
	"historical_agent",
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

export interface SubAgentsStatusRuntime {
	readonly manager: Pick<
		SubAgentManager,
		"generation" | "listAgents" | "getAgent" | "drainUsage"
	>;
	readonly now?: () => number;
}

export interface StatusUsageView {
	totals: UsageCounters;
	reported: UsageCounters;
	turns: number;
	assignments: number;
	unreported: boolean;
}

export interface StatusEventView {
	sequence: number;
	kind: BoundedAgentEvent["kind"];
	state: AgentLifecycleState;
	summary: string;
	timestamp: number;
}

export interface StatusAgentView {
	ok: true;
	id: SubAgentId;
	name: string;
	state: AgentLifecycleState;
	updatedAt: number;
	truncated?: true;
	truncatedFields?: string[];
	role?: string;
	tags?: string[];
	omittedTagCount?: number;
	createdAt?: number;
	removedAt?: number;
	elapsedMs?: number;
	history?: {
		sourceGeneration: string;
		checkpointState: string;
		statusSummary?: string;
		files: string[];
		omittedFileCount: number;
	};
	assignmentCount?: number;
	assignment?: {
		sequence: number;
		state: string;
		summary: string;
		startedAt: number;
		endedAt?: number;
		blocker?: string;
	};
	requested?: {
		modelPolicy: string;
		complexity: string;
		thinkingLevel?: string;
		effectiveThinkingLevel?: string;
	};
	model?: {
		provider: string;
		id: string;
		tier?: string;
		fallbackUsed: boolean;
		reason: string;
	};
	pendingModel?: {
		provider: string;
		id: string;
		tier?: string;
		afterAssignmentSequence?: number;
		requestedThinkingLevel?: string;
	};
	runtime?: {
		phase: string;
		preview?: string;
		activeToolCount: number;
		activeTools: Array<{
			id: string;
			name: string;
			startedAt: number;
			updatedAt: number;
		}>;
		omittedActiveToolCount: number;
		pendingMessageCount: number;
	};
	leases?: Array<{
		kind: string;
		workspace: string;
		path?: string;
		acquiredAt: number;
	}>;
	omittedLeaseCount?: number;
	report?: {
		state: string;
		summary: string;
		needs?: string;
		files: string[];
		omittedFileCount: number;
		timestamp: number;
	};
	result?: {
		summary: string;
		files: string[];
		omittedFileCount: number;
		completedAt: number;
	};
	lastError?: string;
	usage?: StatusUsageView;
	events?: StatusEventView[];
	omittedEventCount?: number;
}

export interface StatusFailureOutcome {
	ok: false;
	id: string;
	code: string;
	message: string;
}

export type StatusAgentOutcome = StatusAgentView | StatusFailureOutcome;

export interface SubAgentsStatusToolDetails {
	generation: string;
	selection: "all" | "selected";
	includeRemoved: boolean;
	detail: "compact" | "timeline";
	eventLimit: number;
	drainUsage: boolean;
	requested: number;
	returned: number;
	succeeded: number;
	failed: number;
	omitted: number;
	truncatedAgentDetails: number;
	timelineEventsOmittedByTransport: number;
	outputTruncated: boolean;
	usageDrained?: UsageCounters;
	usageAggregateClamped?: true;
	outcomes: StatusAgentOutcome[];
}

export class SubAgentsStatusError extends Error {
	readonly code: "manager_inactive" | "cancelled" | "status_failed";

	constructor(
		code: "manager_inactive" | "cancelled" | "status_failed",
		message: string,
	) {
		super(message);
		this.name = "SubAgentsStatusError";
		this.code = code;
	}
}

interface SelectedAgent {
	id: string;
	snapshot?: ManagedSubAgentSnapshot;
	failure?: StatusFailureOutcome;
}

interface DraftSuccess {
	outcomeIndex: number;
	full: StatusAgentView;
	minimal: StatusAgentView;
	timeline: StatusEventView[];
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

function cloneCounters(counters: UsageCounters): UsageCounters {
	return {
		input: safeInteger(counters.input),
		output: safeInteger(counters.output),
		cacheRead: safeInteger(counters.cacheRead),
		cacheWrite: safeInteger(counters.cacheWrite),
		totalTokens: safeInteger(counters.totalTokens),
		cost: safeNumber(counters.cost),
	};
}

function usageView(ledger: UsageLedger): StatusUsageView {
	const totals = cloneCounters(ledger.totals);
	const reported = cloneCounters(ledger.reported);
	const unreported = USAGE_FIELDS.some((field) => reported[field] < totals[field]);
	return {
		totals,
		reported,
		turns: safeInteger(ledger.turns),
		assignments: safeInteger(ledger.assignments),
		unreported,
	};
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

function knownFailure(id: string, error: unknown): StatusFailureOutcome {
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
		const code = boundUtf8Line(candidate.code, DISPLAY_CODE_BYTES) || "status_failed";
		const messages: Record<string, string> = {
			manager_closed: "The sub-agent manager generation is closed",
			unknown_agent: "Unknown sub-agent ID",
			stale_agent: "Sub-agent ID belongs to another session generation",
			historical_agent: "Restored history has no active child runtime",
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
		code: "status_failed",
		message: "Could not inspect the sub-agent",
	};
}

function removedExcluded(id: string): StatusFailureOutcome {
	return {
		ok: false,
		id,
		code: "removed_excluded",
		message: "Removed sub-agent excluded; set includeRemoved=true to inspect it",
	};
}

function selectAgents(
	params: SubAgentsStatusInput,
	runtime: SubAgentsStatusRuntime,
): { selected: SelectedAgent[]; requested: number; omitted: number } {
	const includeRemoved = params.includeRemoved ?? false;
	if (params.ids) {
		const selected = params.ids.map((id): SelectedAgent => {
			try {
				const snapshot = runtime.manager.getAgent(id);
				if (snapshot.state === "removed" && !includeRemoved) {
					return { id, failure: removedExcluded(id) };
				}
				return { id, snapshot };
			} catch (error) {
				return { id, failure: knownFailure(id, error) };
			}
		});
		return { selected, requested: params.ids.length, omitted: 0 };
	}

	let listed: ManagedSubAgentSnapshot[];
	try {
		listed = runtime.manager.listAgents({ includeRemoved });
	} catch {
		throw new SubAgentsStatusError("status_failed", "Could not inspect the sub-agent manager");
	}
	if (includeRemoved) {
		listed = [
			...listed.filter((snapshot) => snapshot.state !== "removed"),
			...listed.filter((snapshot) => snapshot.state === "removed"),
		];
	}
	const requested = listed.length;
	const bounded = listed.slice(0, SUB_AGENT_BOUNDS.controlTargets);
	return {
		selected: bounded.map((snapshot) => ({ id: snapshot.id, snapshot })),
		requested,
		omitted: requested - bounded.length,
	};
}

function eventView(event: BoundedAgentEvent, truncatedFields: string[]): StatusEventView {
	return {
		sequence: safeInteger(event.sequence),
		kind: event.kind,
		state: event.state,
		summary: boundedField(event.summary, 176, "events.summary", truncatedFields),
		timestamp: safeNumber(event.timestamp),
	};
}

function buildStatusView(
	snapshot: ManagedSubAgentSnapshot,
	now: number,
	detail: "compact" | "timeline",
	eventLimit: number,
): { full: StatusAgentView; minimal: StatusAgentView; timeline: StatusEventView[] } {
	const truncatedFields: string[] = [];
	const name = boundedField(snapshot.spec.name, 96, "name", truncatedFields) || "unnamed";
	const role = boundedField(snapshot.spec.role, 160, "role", truncatedFields);
	const tags = (snapshot.spec.tags ?? []).slice(0, 5).map((tag) =>
		boundedField(tag, 56, "tags", truncatedFields),
	);
	const assignment = snapshot.currentAssignment;
	const route = snapshot.modelRoute;
	const activeTools = snapshot.runtime.activeTools.slice(0, 5).map((tool) => ({
		id: boundedField(tool.toolCallId, 56, "runtime.activeTools.id", truncatedFields),
		name: boundedField(tool.toolName, 56, "runtime.activeTools.name", truncatedFields),
		startedAt: safeNumber(tool.startedAt),
		updatedAt: safeNumber(tool.updatedAt),
	}));
	const leases = snapshot.leases.slice(0, 5).map((lease) => ({
		kind: lease.kind,
		workspace: boundedField(lease.workspaceKey, 64, "leases.workspace", truncatedFields),
		path: lease.path
			? boundedField(lease.path, 112, "leases.path", truncatedFields)
			: undefined,
		acquiredAt: safeNumber(lease.acquiredAt),
	}));
	const reportFiles = (snapshot.latestReport?.files ?? []).slice(0, 5).map((file) =>
		boundedField(file, 112, "report.files", truncatedFields),
	);
	const resultFiles = (snapshot.latestResult?.files ?? []).slice(0, 5).map((file) =>
		boundedField(file, 112, "result.files", truncatedFields),
	);
	const endedAt = snapshot.removedAt ?? now;
	const full: StatusAgentView = {
		ok: true,
		id: snapshot.id,
		name,
		state: snapshot.state,
		updatedAt: safeNumber(snapshot.updatedAt),
		role,
		tags,
		omittedTagCount: Math.max(0, (snapshot.spec.tags?.length ?? 0) - tags.length),
		createdAt: safeNumber(snapshot.createdAt),
		removedAt: snapshot.removedAt === undefined ? undefined : safeNumber(snapshot.removedAt),
		elapsedMs: Math.max(0, safeNumber(endedAt) - safeNumber(snapshot.createdAt)),
		history: snapshot.restoredHistory
			? {
					sourceGeneration: boundedField(
						snapshot.restoredHistory.sourceGeneration,
						96,
						"history.sourceGeneration",
						truncatedFields,
					),
					checkpointState: snapshot.restoredHistory.checkpointState,
					statusSummary: snapshot.restoredHistory.statusSummary
						? boundedField(
								snapshot.restoredHistory.statusSummary,
								176,
								"history.statusSummary",
								truncatedFields,
							)
						: undefined,
					files: snapshot.restoredHistory.files.slice(0, 5).map((file) =>
						boundedField(file, 112, "history.files", truncatedFields),
					),
					omittedFileCount:
						snapshot.restoredHistory.omittedFileCount +
						Math.max(0, snapshot.restoredHistory.files.length - 5),
				}
			: undefined,
		assignmentCount: safeInteger(snapshot.assignmentCount),
		assignment: assignment
			? {
					sequence: safeInteger(assignment.sequence),
					state: assignment.state,
					summary: boundedField(assignment.objective, 176, "assignment.summary", truncatedFields),
					startedAt: safeNumber(assignment.startedAt),
					endedAt: assignment.endedAt === undefined ? undefined : safeNumber(assignment.endedAt),
					blocker: assignment.blocker
						? boundedField(assignment.blocker, 144, "assignment.blocker", truncatedFields)
						: undefined,
				}
			: undefined,
		requested: {
			modelPolicy: route?.requestedPolicy ?? snapshot.spec.modelPolicy ?? "auto",
			complexity: route?.requestedComplexity ?? snapshot.spec.complexity ?? "moderate",
			thinkingLevel: snapshot.spec.thinkingLevel,
			effectiveThinkingLevel: snapshot.effectiveThinkingLevel,
		},
		model: route
			? {
					provider: boundedField(route.selectedModel.provider, 64, "model.provider", truncatedFields),
					id: boundedField(route.selectedModel.id, 96, "model.id", truncatedFields),
					tier: route.selectedTier,
					fallbackUsed: route.fallbackUsed,
					reason: boundedField(route.reason, 144, "model.reason", truncatedFields),
				}
			: undefined,
		pendingModel: snapshot.pendingModelReconfiguration
			? {
					provider: boundedField(
						snapshot.pendingModelReconfiguration.route.selectedModel.provider,
						64,
						"pendingModel.provider",
						truncatedFields,
					),
					id: boundedField(
						snapshot.pendingModelReconfiguration.route.selectedModel.id,
						96,
						"pendingModel.id",
						truncatedFields,
					),
					tier: snapshot.pendingModelReconfiguration.route.selectedTier,
					afterAssignmentSequence:
						snapshot.currentAssignment?.id === snapshot.pendingModelReconfiguration.afterAssignmentId
							? snapshot.currentAssignment.sequence
							: undefined,
					requestedThinkingLevel:
						snapshot.pendingModelReconfiguration.requestedThinkingLevel,
				}
			: undefined,
		runtime: {
			phase: snapshot.runtime.phase,
			preview: snapshot.runtime.streamingPreview
				? boundedField(snapshot.runtime.streamingPreview, 176, "runtime.preview", truncatedFields)
				: undefined,
			activeToolCount: safeInteger(snapshot.runtime.activeToolCount),
			activeTools,
			omittedActiveToolCount: Math.max(
				0,
				safeInteger(snapshot.runtime.activeToolCount) - activeTools.length,
			),
			pendingMessageCount: safeInteger(snapshot.runtime.pendingMessageCount),
		},
		leases,
		omittedLeaseCount: Math.max(0, snapshot.leases.length - leases.length),
		report: snapshot.latestReport
			? {
					state: snapshot.latestReport.state,
					summary: boundedField(snapshot.latestReport.summary, 176, "report.summary", truncatedFields),
					needs: snapshot.latestReport.needs
						? boundedField(snapshot.latestReport.needs, 144, "report.needs", truncatedFields)
						: undefined,
					files: reportFiles,
					omittedFileCount: Math.max(0, snapshot.latestReport.files.length - reportFiles.length),
					timestamp: safeNumber(snapshot.latestReport.timestamp),
				}
			: undefined,
		result: snapshot.latestResult
			? {
					summary: boundedField(snapshot.latestResult.summary, 176, "result.summary", truncatedFields),
					files: resultFiles,
					omittedFileCount: Math.max(0, snapshot.latestResult.files.length - resultFiles.length),
					completedAt: safeNumber(snapshot.latestResult.completedAt),
				}
			: undefined,
		lastError: snapshot.lastError
			? boundedField(snapshot.lastError, 160, "lastError", truncatedFields)
			: undefined,
		usage: usageView(snapshot.usage),
	};
	if (truncatedFields.length > 0) full.truncatedFields = [...new Set(truncatedFields)];

	const minimal: StatusAgentView = {
		ok: true,
		id: snapshot.id,
		name: boundUtf8Line(snapshot.spec.name, 56) || "unnamed",
		state: snapshot.state,
		updatedAt: safeNumber(snapshot.updatedAt),
		truncated: true,
	};
	const timeline =
		detail === "timeline"
			? snapshot.events
					.slice(-eventLimit)
					.reverse()
					.map((event) => eventView(event, truncatedFields))
			: [];
	if (detail === "timeline") {
		full.events = [];
		full.omittedEventCount = snapshot.omittedEventCount + snapshot.events.length;
	}
	return { full, minimal, timeline };
}

function jsonBytes(value: unknown): number {
	return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function fitDetails(
	base: Omit<
		SubAgentsStatusToolDetails,
		"outcomes" | "truncatedAgentDetails" | "timelineEventsOmittedByTransport" | "outputTruncated"
	>,
	initial: StatusAgentOutcome[],
	drafts: DraftSuccess[],
): SubAgentsStatusToolDetails {
	const outcomes = [...initial];
	const details: SubAgentsStatusToolDetails = {
		...base,
		truncatedAgentDetails: drafts.length,
		timelineEventsOmittedByTransport: drafts.reduce((sum, draft) => sum + draft.timeline.length, 0),
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

	let madeProgress = true;
	const positions = new Map<number, number>();
	while (madeProgress) {
		madeProgress = false;
		for (const draft of drafts) {
			const current = outcomes[draft.outcomeIndex];
			if (!current.ok || current.truncated || !current.events) continue;
			const position = positions.get(draft.outcomeIndex) ?? 0;
			const event = draft.timeline[position];
			if (!event) continue;
			const previous = current;
			const next: StatusAgentView = {
				...current,
				events: [event, ...current.events],
				omittedEventCount: Math.max(0, (current.omittedEventCount ?? 0) - 1),
			};
			outcomes[draft.outcomeIndex] = next;
			if (jsonBytes(details) <= DETAILS_RICH_BUDGET_BYTES) {
				positions.set(draft.outcomeIndex, position + 1);
				details.timelineEventsOmittedByTransport -= 1;
				madeProgress = true;
			} else {
				outcomes[draft.outcomeIndex] = previous;
			}
		}
	}

	details.outputTruncated =
		details.truncatedAgentDetails > 0 || details.timelineEventsOmittedByTransport > 0;
	if (jsonBytes(details) > DETAILS_MAX_BYTES) {
		for (const draft of drafts) outcomes[draft.outcomeIndex] = draft.minimal;
		details.truncatedAgentDetails = drafts.length;
		details.timelineEventsOmittedByTransport = drafts.reduce(
			(sum, draft) => sum + draft.timeline.length,
			0,
		);
		details.outputTruncated = drafts.length > 0;
	}
	return details;
}

function formatTokens(value: number): string {
	if (value < 1_000) return `${value}`;
	if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
	return `${(value / 1_000_000).toFixed(1)}M`;
}

function formatStatusLine(outcome: StatusAgentOutcome): string {
	if (!outcome.ok) {
		return boundUtf8Line(
			`- [error] ${outcome.id}: ${outcome.code}: ${outcome.message}`,
			DISPLAY_LINE_BYTES,
		);
	}
	const parts = [`- [${outcome.state}] ${outcome.name}: ${outcome.id}`];
	if (outcome.model) parts.push(`${outcome.model.provider}/${outcome.model.id}`);
	if (outcome.pendingModel) {
		parts.push(`queued model ${outcome.pendingModel.provider}/${outcome.pendingModel.id}`);
	}
	if (outcome.history) {
		parts.push(`restored ${outcome.history.checkpointState} history`);
	}
	if (outcome.assignment) {
		parts.push(`assignment ${outcome.assignment.sequence} ${outcome.assignment.state}`);
	}
	if (outcome.runtime?.activeToolCount) {
		const names = outcome.runtime.activeTools.map((tool) => tool.name).filter(Boolean);
		parts.push(`tools ${outcome.runtime.activeToolCount}${names.length ? ` (${names.join(", ")})` : ""}`);
	}
	if (outcome.runtime?.pendingMessageCount) parts.push(`queued ${outcome.runtime.pendingMessageCount}`);
	if (outcome.usage) {
		parts.push(
			`${outcome.usage.turns} turns · ${formatTokens(outcome.usage.totals.totalTokens)} tokens · $${outcome.usage.totals.cost.toFixed(4)}`,
		);
		if (outcome.usage.unreported) parts.push("usage unreported");
	}
	const latest = outcome.lastError ?? outcome.assignment?.blocker ?? outcome.report?.summary ?? outcome.result?.summary ?? outcome.history?.statusSummary;
	if (latest) parts.push(boundUtf8Line(latest, 96));
	if (outcome.truncated) parts.push("detail truncated");
	return boundUtf8Line(parts.join(" · "), DISPLAY_LINE_BYTES);
}

export function formatSubAgentsStatusResult(details: SubAgentsStatusToolDetails): string {
	const lines = [
		`sub_agents_status: ${details.succeeded} agents · ${details.failed} errors · ${details.omitted} omitted · generation ${details.generation}`,
		...details.outcomes.map(formatStatusLine),
	];
	if (details.detail === "timeline") {
		for (const outcome of details.outcomes) {
			if (!outcome.ok || !outcome.events?.length) continue;
			for (const event of outcome.events) {
				lines.push(
					boundUtf8Line(
						`  · ${outcome.id} #${event.sequence} ${event.kind}/${event.state}: ${event.summary}`,
						DISPLAY_LINE_BYTES,
					),
				);
			}
		}
	}
	if (details.outputTruncated) {
		lines.push("[status output was bounded; inspect omitted/truncated counters before relying on missing detail]");
	}

	let text = "";
	let omittedLines = 0;
	for (const line of lines) {
		const candidate = text ? `${text}\n${line}` : line;
		if (Buffer.byteLength(candidate, "utf8") <= CONTENT_MAX_BYTES - 128) text = candidate;
		else omittedLines += 1;
	}
	if (omittedLines > 0) text += `\n[${omittedLines} additional bounded status lines omitted]`;
	return text;
}

/** Observe selected/all children and optionally drain their atomic usage watermarks. */
export async function executeSubAgentsStatus(
	params: SubAgentsStatusInput,
	signal: AbortSignal | undefined,
	_runtime: SubAgentsStatusRuntime | undefined,
): Promise<{
	content: Array<{ type: "text"; text: string }>;
	details: SubAgentsStatusToolDetails;
	usage?: Usage;
}> {
	const runtime = _runtime;
	if (!runtime) {
		throw new SubAgentsStatusError(
			"manager_inactive",
			"No active sub-agent manager generation is available",
		);
	}
	if (signal?.aborted) {
		throw new SubAgentsStatusError(
			"cancelled",
			"sub_agents_status was cancelled before manager state was inspected",
		);
	}

	const includeRemoved = params.includeRemoved ?? false;
	const detail = params.detail ?? "compact";
	const eventLimit = params.eventLimit ?? DEFAULT_EVENT_LIMIT;
	const drainUsage = params.drainUsage ?? false;
	const selection = selectAgents(params, runtime);
	if (signal?.aborted) {
		throw new SubAgentsStatusError(
			"cancelled",
			"sub_agents_status was cancelled before usage was drained",
		);
	}

	const drained = emptyCounters();
	let usageAggregateClamped = false;
	const resolved = await Promise.all(
		selection.selected.map(async (selected): Promise<SelectedAgent> => {
			if (
				!selected.snapshot ||
				selected.failure ||
				!drainUsage ||
				selected.snapshot.restoredHistory
			) return selected;
			try {
				const delta = await runtime.manager.drainUsage(selected.id);
				usageAggregateClamped = addCounters(drained, delta) || usageAggregateClamped;
				return {
					id: selected.id,
					snapshot: runtime.manager.getAgent(selected.id),
				};
			} catch (error) {
				return { id: selected.id, failure: knownFailure(selected.id, error) };
			}
		}),
	);

	const now = safeNumber(runtime.now?.() ?? Date.now());
	const initial: StatusAgentOutcome[] = [];
	const drafts: DraftSuccess[] = [];
	for (const selected of resolved) {
		if (selected.failure || !selected.snapshot) {
			initial.push(
				selected.failure ?? {
					ok: false,
					id: selected.id,
					code: "status_failed",
					message: "Could not inspect the sub-agent",
				},
			);
			continue;
		}
		const view = buildStatusView(selected.snapshot, now, detail, eventLimit);
		const outcomeIndex = initial.length;
		initial.push(view.minimal);
		drafts.push({ outcomeIndex, ...view });
	}

	const failed = initial.filter((outcome) => !outcome.ok).length;
	const base = {
		generation: runtime.manager.generation,
		selection: params.ids ? "selected" as const : "all" as const,
		includeRemoved,
		detail,
		eventLimit,
		drainUsage,
		requested: selection.requested,
		returned: initial.length,
		succeeded: initial.length - failed,
		failed,
		omitted: selection.omitted,
		usageDrained: drainUsage ? drained : undefined,
		usageAggregateClamped: usageAggregateClamped ? true as const : undefined,
	};
	const details = fitDetails(base, initial, drafts);
	const result: {
		content: Array<{ type: "text"; text: string }>;
		details: SubAgentsStatusToolDetails;
		usage?: Usage;
	} = {
		content: [{ type: "text", text: formatSubAgentsStatusResult(details) }],
		details,
	};
	if (drainUsage) result.usage = toPiUsage(drained);
	return result;
}

export function createSubAgentsStatusTool(
	getRuntime: () => SubAgentsStatusRuntime | undefined,
) {
	return defineTool<typeof subAgentsStatusSchema, SubAgentsStatusToolDetails>({
		name: "sub_agents_status",
		label: "Sub-Agent Status",
		description:
			"Return a bounded compact or recent-timeline snapshot for selected or all current-generation sub-agents. Includes lifecycle, assignment, active/pending model route and effective thinking, active tools, leases, latest report/result, queue state, errors, elapsed time, and usage. Usage is observational by default; drainUsage=true atomically attaches only newly accrued usage to this tool result.",
		promptSnippet:
			"Inspect bounded current-generation sub-agent state, activity, results, and usage",
		promptGuidelines: [
			"Use sub_agents_status with exact IDs when inspecting selected children; omit ids only when a bounded all-agent snapshot is intended.",
			"Keep sub_agents_status drainUsage omitted or false for observation; set drainUsage=true only when intentionally advancing child usage accounting.",
		],
		parameters: subAgentsStatusSchema,
		executionMode: "parallel",
		async execute(_toolCallId, params, signal) {
			return executeSubAgentsStatus(params, signal, getRuntime());
		},
		renderCall: renderStatusCall,
		renderResult: renderStatusResult,
	});
}
