import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { ChildModelRuntimeAdapter } from "./model-runtime.ts";
import {
	WorkspaceLeaseManager,
	type ParentWorkspaceReservation,
} from "./workspace/leases.ts";
import type { CanonicalWorkspacePath } from "./workspace/paths.ts";
import {
	captureParentContextSnapshot,
	type ParentContextFile,
	type ParentContextSnapshotV1,
} from "./resource-loader.ts";
import {
	UsageLedgerError,
	applyUsageDelta,
	beginUsageAssignment,
	cloneAssignmentUsage,
	cloneUsageLedger,
	createAssignmentUsage,
	createUsageLedger,
	drainUsageLedger,
} from "./usage-ledger.ts";
import type {
	AgentLifecycleState,
	AgentReportState,
	AgentReportSubmission,
	AgentRuntimeActivity,
	AgentRuntimePhase,
	AgentStateCounts,
	AssignmentRecord,
	BashPolicy,
	BoundedAgentEvent,
	BoundedAgentReport,
	BoundedAgentResult,
	ChildToolName,
	ComplexityTier,
	DynamicAgentSpec,
	ManagedSubAgentSnapshot,
	ModelPolicy,
	ModelRoute,
	ModelRouteStep,
	NotificationState,
	PendingModelReconfiguration,
	PersistedSubAgentHistoryV1,
	SessionGeneration,
	SubAgentId,
	SubAgentDashboardRow,
	SubAgentDashboardSnapshot,
	SubAgentManagerChange,
	SubAgentManagerChangeListener,
	SubAgentManagerEvent,
	SubAgentManagerEventListener,
	SubAgentManagerOverview,
	SubAgentManagerOverviewRow,
	SubAgentManagerSummary,
	ThinkingLevel,
	UsageCounters,
	UsageDelta,
	WorkspaceIdentity,
	WorkspaceLeaseRecord,
	WorkspaceMode,
} from "./types.ts";
import { SUB_AGENT_BOUNDS } from "./types.ts";

const GENERATION_PREFIX = "sag1-";
const AGENT_ID_PREFIX = "sa1-";
const DEFAULT_CLEANUP_TIMEOUT_MS = 2_000;

const OVERVIEW_STATE_PRIORITY: Readonly<Record<AgentLifecycleState, number>> = Object.freeze({
	blocked: 0,
	failed: 1,
	running: 2,
	creating: 3,
	stopping: 4,
	idle: 5,
	removed: 6,
});

const ALLOWED_TRANSITIONS: Readonly<Record<AgentLifecycleState, ReadonlySet<AgentLifecycleState>>> = Object.freeze({
	creating: new Set(["running", "failed", "stopping"]),
	running: new Set(["idle", "blocked", "failed", "stopping"]),
	idle: new Set(["running", "failed", "stopping"]),
	blocked: new Set(["running", "failed", "stopping"]),
	failed: new Set(["stopping"]),
	stopping: new Set(["removed"]),
	removed: new Set(),
});

const MODEL_POLICIES = new Set(["auto", "inherit", "explicit"]);
const COMPLEXITY_TIERS = new Set(["simple", "moderate", "complex"]);
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const CHILD_TOOL_NAMES = new Set(["read", "grep", "find", "ls", "edit", "write", "bash"]);
const WORKSPACE_MODES = new Set(["shared", "worktree"]);
const BASH_POLICIES = new Set(["disabled", "workspace-exclusive"]);
const NOTIFICATION_STATES = new Set(["idle", "blocked", "failed"]);
const AGENT_REPORT_STATES = new Set(["progress", "blocked", "result"]);
const MODEL_ROUTE_STEP_SOURCES = new Set(["tier", "inherit", "explicit"]);
const MODEL_ROUTE_STEP_OUTCOMES = new Set(["unavailable", "selected"]);
const RUNTIME_PHASES = new Set([
	"initializing",
	"streaming",
	"tools",
	"compacting",
	"retrying",
	"settled",
]);
const HISTORICAL_CHECKPOINT_STATES: ReadonlySet<AgentLifecycleState> = new Set([
	"idle",
	"blocked",
	"failed",
	"removed",
]);

export interface SubAgentManagerOptions {
	cwd: string;
	generation?: SessionGeneration;
	now?: () => number;
	nonce?: () => string;
	cleanupTimeoutMs?: number;
	modelRuntime?: ChildModelRuntimeAdapter;
}

export interface RuntimeCleanupHooks {
	abort?: () => void | Promise<void>;
	waitForIdle?: () => void | Promise<void>;
	dispose?: () => void | Promise<void>;
}

interface ManagedRuntimeResources {
	cleanup?: RuntimeCleanupHooks;
	cleanupPromise?: Promise<string[]>;
	unsubscribers: Set<() => void>;
	timers: Set<ReturnType<typeof setTimeout>>;
	abortControllers: Set<AbortController>;
	background: Set<Promise<void>>;
}

interface ManagedRecord extends ManagedSubAgentSnapshot {
	resources: ManagedRuntimeResources;
	eventSequence: number;
	leaseSnapshot: () => WorkspaceLeaseRecord[];
}

export class SubAgentManagerError extends Error {
	readonly code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = "SubAgentManagerError";
		this.code = code;
	}
}

export class ManagerClosedError extends SubAgentManagerError {
	constructor() {
		super("The sub-agent manager generation is closed", "manager_closed");
		this.name = "ManagerClosedError";
	}
}

export class UnknownAgentIdError extends SubAgentManagerError {
	constructor(id: string) {
		super(`Unknown sub-agent id: ${boundText(id, 160)}`, "unknown_agent");
		this.name = "UnknownAgentIdError";
	}
}

export class StaleAgentIdError extends SubAgentManagerError {
	constructor(id: string) {
		super(`Sub-agent id belongs to another session generation: ${boundText(id, 160)}`, "stale_agent");
		this.name = "StaleAgentIdError";
	}
}

export class HistoricalAgentIdError extends SubAgentManagerError {
	constructor(id: string) {
		super(`Sub-agent id is immutable restored history: ${boundText(id, 160)}`, "historical_agent");
		this.name = "HistoricalAgentIdError";
	}
}

export class InvalidAgentTransitionError extends SubAgentManagerError {
	constructor(from: AgentLifecycleState, to: AgentLifecycleState) {
		super(`Invalid sub-agent state transition: ${from} -> ${to}`, "invalid_transition");
		this.name = "InvalidAgentTransitionError";
	}
}

export function canTransitionAgentState(from: AgentLifecycleState, to: AgentLifecycleState): boolean {
	return ALLOWED_TRANSITIONS[from].has(to);
}

export function createSessionGeneration(nonce = randomUUID()): SessionGeneration {
	return `${GENERATION_PREFIX}${normalizeNonce(nonce)}`;
}

function normalizeNonce(value: string): string {
	const normalized = String(value).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
	if (!normalized) throw new SubAgentManagerError("Could not create an opaque session generation", "invalid_generation");
	return normalized;
}

function boundText(value: unknown, maxChars: number): string {
	return String(value ?? "").slice(0, maxChars);
}

function requireBoundedText(value: unknown, field: string, maxChars: number): string {
	const text = String(value ?? "").trim();
	if (!text) throw new SubAgentManagerError(`${field} is required`, "invalid_spec");
	if (text.length > maxChars) {
		throw new SubAgentManagerError(`${field} exceeds ${maxChars} characters`, "invalid_spec");
	}
	return text;
}

function optionalBoundedText(value: unknown, field: string, maxChars: number): string | undefined {
	if (value === undefined) return undefined;
	return requireBoundedText(value, field, maxChars);
}

function boundedUniqueStrings(values: readonly string[] | undefined, field: string, maxItems: number, maxChars: number) {
	if (values === undefined) return undefined;
	if (!Array.isArray(values)) throw new SubAgentManagerError(`${field} must be an array`, "invalid_spec");
	if (values.length > maxItems) {
		throw new SubAgentManagerError(`${field} exceeds ${maxItems} items`, "invalid_spec");
	}
	return [...new Set(values.map((value, index) => requireBoundedText(value, `${field}[${index}]`, maxChars)))];
}

function mergeBoundedFilePaths(...groups: readonly (readonly string[] | undefined)[]): string[] {
	const merged: string[] = [];
	const seen = new Set<string>();
	for (const group of groups) {
		for (const path of group ?? []) {
			if (seen.has(path)) continue;
			seen.add(path);
			merged.push(path);
			if (merged.length === SUB_AGENT_BOUNDS.reportFiles) return merged;
		}
	}
	return merged;
}

function requireChoice<T extends string>(value: unknown, choices: ReadonlySet<string>, field: string): T {
	if (typeof value !== "string" || !choices.has(value)) {
		throw new SubAgentManagerError(`${field} has an unsupported value`, "invalid_spec");
	}
	return value as T;
}

function normalizeSpec(spec: DynamicAgentSpec): Readonly<DynamicAgentSpec> {
	if (!spec || typeof spec !== "object") throw new SubAgentManagerError("Agent specification is required", "invalid_spec");
	const modelPolicy = requireChoice<ModelPolicy>(
		spec.modelPolicy ?? "auto",
		MODEL_POLICIES,
		"modelPolicy",
	);
	if (modelPolicy === "explicit" && !spec.model) {
		throw new SubAgentManagerError("An explicit model policy requires provider and model id", "invalid_spec");
	}
	if (modelPolicy !== "explicit" && spec.model) {
		throw new SubAgentManagerError("A model reference requires modelPolicy=explicit", "invalid_spec");
	}

	const model = spec.model
		? Object.freeze({
				provider: requireBoundedText(spec.model.provider, "model.provider", 128),
				id: requireBoundedText(spec.model.id, "model.id", 256),
			})
		: undefined;
	const workspace = spec.workspace
		? Object.freeze({
				mode: requireChoice<WorkspaceMode>(spec.workspace.mode, WORKSPACE_MODES, "workspace.mode"),
				cwd: optionalBoundedText(spec.workspace.cwd, "workspace.cwd", 4_096),
				writeScope: boundedUniqueStrings(
					spec.workspace.writeScope,
					"workspace.writeScope",
					SUB_AGENT_BOUNDS.writeScopePaths,
					4_096,
				),
				bashPolicy: requireChoice<BashPolicy>(
					spec.workspace.bashPolicy ?? "disabled",
					BASH_POLICIES,
					"workspace.bashPolicy",
				),
			})
		: Object.freeze({ mode: "shared" as const, bashPolicy: "disabled" as const });
	const tools = boundedUniqueStrings(spec.tools, "tools", SUB_AGENT_BOUNDS.tools, 20);
	for (const tool of tools ?? []) requireChoice<ChildToolName>(tool, CHILD_TOOL_NAMES, "tools");
	const notifyOn = boundedUniqueStrings(spec.notifyOn, "notifyOn", NOTIFICATION_STATES.size, 20);
	for (const state of notifyOn ?? []) requireChoice<NotificationState>(state, NOTIFICATION_STATES, "notifyOn");

	return Object.freeze({
		name: requireBoundedText(spec.name, "name", SUB_AGENT_BOUNDS.nameChars),
		role: requireBoundedText(spec.role, "role", SUB_AGENT_BOUNDS.roleChars),
		objective: requireBoundedText(spec.objective, "objective", SUB_AGENT_BOUNDS.objectiveChars),
		instructions: optionalBoundedText(spec.instructions, "instructions", SUB_AGENT_BOUNDS.instructionsChars),
		context: optionalBoundedText(spec.context, "context", SUB_AGENT_BOUNDS.contextChars),
		modelPolicy,
		model,
		complexity: requireChoice<ComplexityTier>(spec.complexity ?? "moderate", COMPLEXITY_TIERS, "complexity"),
		thinkingLevel:
			spec.thinkingLevel === undefined
				? undefined
				: requireChoice<ThinkingLevel>(spec.thinkingLevel, THINKING_LEVELS, "thinkingLevel"),
		tools: tools as DynamicAgentSpec["tools"],
		workspace,
		resultInstructions: optionalBoundedText(
			spec.resultInstructions,
			"resultInstructions",
			SUB_AGENT_BOUNDS.resultInstructionsChars,
		),
		tags: boundedUniqueStrings(spec.tags, "tags", SUB_AGENT_BOUNDS.tags, SUB_AGENT_BOUNDS.tagChars),
		notifyOn: notifyOn as DynamicAgentSpec["notifyOn"],
	});
}

function cloneResult(result: BoundedAgentResult | undefined): BoundedAgentResult | undefined {
	return result ? { ...result, files: [...result.files] } : undefined;
}

function cloneReport(report: BoundedAgentReport | undefined): BoundedAgentReport | undefined {
	return report ? { ...report, files: [...report.files] } : undefined;
}

function cloneModelRoute(route: ModelRoute | undefined): ModelRoute | undefined {
	return route
		? {
				...route,
				selectedModel: { ...route.selectedModel },
				fallbackPath: route.fallbackPath.map((step) => ({ ...step })),
			}
		: undefined;
}

function cloneAssignment(assignment: AssignmentRecord | undefined): AssignmentRecord | undefined {
	return assignment
		? {
				...assignment,
				result: cloneResult(assignment.result),
				modelRoute: cloneModelRoute(assignment.modelRoute),
				modifiedFiles: assignment.modifiedFiles ? [...assignment.modifiedFiles] : undefined,
				usage: cloneAssignmentUsage(assignment.usage),
			}
		: undefined;
}

function clonePendingModelReconfiguration(
	pending: PendingModelReconfiguration | undefined,
): PendingModelReconfiguration | undefined {
	return pending
		? {
				...pending,
				route: cloneModelRoute(pending.route)!,
			}
		: undefined;
}

function cloneRuntimeActivity(runtime: AgentRuntimeActivity): AgentRuntimeActivity {
	return {
		phase: runtime.phase,
		streamingPreview: runtime.streamingPreview,
		activeToolCount: runtime.activeToolCount,
		activeTools: runtime.activeTools.map((tool) => ({ ...tool })),
		pendingMessageCount: runtime.pendingMessageCount,
	};
}

function cloneSpec(spec: Readonly<DynamicAgentSpec>): Readonly<DynamicAgentSpec> {
	return {
		...spec,
		model: spec.model ? { ...spec.model } : undefined,
		tools: spec.tools ? [...spec.tools] : undefined,
		tags: spec.tags ? [...spec.tags] : undefined,
		notifyOn: spec.notifyOn ? [...spec.notifyOn] : undefined,
		workspace: spec.workspace
			? { ...spec.workspace, writeScope: spec.workspace.writeScope ? [...spec.workspace.writeScope] : undefined }
			: undefined,
	};
}

function snapshotRecord(record: ManagedRecord): ManagedSubAgentSnapshot {
	return {
		id: record.id,
		generation: record.generation,
		spec: cloneSpec(record.spec),
		state: record.state,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		removedAt: record.removedAt,
		removalReason: record.removalReason,
		assignmentCount: record.assignmentCount,
		currentAssignment: cloneAssignment(record.currentAssignment),
		latestReport: cloneReport(record.latestReport),
		latestResult: cloneResult(record.latestResult),
		modelRoute: cloneModelRoute(record.modelRoute),
		effectiveThinkingLevel: record.effectiveThinkingLevel,
		pendingModelReconfiguration: clonePendingModelReconfiguration(
			record.pendingModelReconfiguration,
		),
		lastError: record.lastError,
		events: record.events.map((event) => ({ ...event })),
		omittedEventCount: record.omittedEventCount,
		runtime: cloneRuntimeActivity(record.runtime),
		usage: cloneUsageLedger(record.usage),
		leases: record.leaseSnapshot(),
	};
}

function createRuntimeActivity(phase: AgentRuntimePhase): AgentRuntimeActivity {
	return {
		phase,
		activeToolCount: 0,
		activeTools: [],
		pendingMessageCount: 0,
	};
}

function clonePersistedHistory(history: Readonly<PersistedSubAgentHistoryV1>): PersistedSubAgentHistoryV1 {
	return {
		...history,
		result: history.result ? { ...history.result } : undefined,
		modelRoute: cloneModelRoute(history.modelRoute),
		usage: {
			totals: { ...history.usage.totals },
			reported: { ...history.usage.reported },
			unreported: { ...history.usage.unreported },
			turns: history.usage.turns,
			assignments: history.usage.assignments,
		},
		files: [...history.files],
	};
}

function restoredHistorySnapshot(
	history: Readonly<PersistedSubAgentHistoryV1>,
): ManagedSubAgentSnapshot {
	const result: BoundedAgentResult | undefined = history.result
		? {
				summary: history.result.summary,
				details: history.result.details,
				files: [...history.files],
				completedAt: history.result.completedAt,
			}
		: undefined;
	const assignmentSequence = history.usage.assignments;
	const assignmentState =
		history.state === "blocked"
			? "blocked"
			: history.state === "failed"
				? "failed"
				: result
					? "idle"
					: "aborted";
	const currentAssignment: AssignmentRecord | undefined = assignmentSequence > 0
		? {
				id: `${history.id}:history:${assignmentSequence.toString(36)}`,
				sequence: assignmentSequence,
				objective: history.objectiveSummary,
				state: assignmentState,
				startedAt: history.createdAt,
				endedAt: history.result?.completedAt ?? history.updatedAt,
				result,
				blocker: history.state === "blocked" ? history.statusSummary : undefined,
				error: history.state === "failed" ? history.statusSummary : undefined,
				modelRoute: cloneModelRoute(history.modelRoute),
				usage: createAssignmentUsage(),
			}
		: undefined;
	const latestReport: BoundedAgentReport | undefined = history.state === "blocked"
		? {
				state: "blocked",
				summary: history.statusSummary ?? "The restored checkpoint was blocked.",
				files: [...history.files],
				needs: history.statusSummary,
				timestamp: history.updatedAt,
			}
		: undefined;
	const restoredReason = history.removalReason ??
		`Restored ${history.state} checkpoint as terminated history; no live child runtime survived.`;
	return {
		id: history.id,
		generation: history.generation,
		spec: {
			name: history.name,
			role: history.role,
			objective: history.objectiveSummary,
			modelPolicy: history.modelRoute?.requestedPolicy ?? "auto",
			complexity: history.modelRoute?.requestedComplexity ?? "moderate",
			workspace: { mode: "shared", bashPolicy: "disabled" },
		},
		restoredHistory: {
			sourceGeneration: history.generation,
			checkpointState: history.state,
			statusSummary: history.statusSummary,
			files: [...history.files],
			omittedFileCount: history.omittedFileCount,
		},
		state: "removed",
		createdAt: history.createdAt,
		updatedAt: history.updatedAt,
		removedAt: history.removedAt ?? history.updatedAt,
		removalReason: restoredReason,
		assignmentCount: history.usage.assignments,
		currentAssignment,
		latestReport,
		latestResult: result,
		modelRoute: cloneModelRoute(history.modelRoute),
		lastError: history.state === "failed" ? history.statusSummary : undefined,
		events: [{
			sequence: 1,
			kind: "cleanup",
			state: "removed",
			summary: `Restored ${history.state} checkpoint as immutable history`,
			timestamp: history.updatedAt,
		}],
		omittedEventCount: 0,
		runtime: createRuntimeActivity("settled"),
		usage: {
			totals: { ...history.usage.totals },
			reported: { ...history.usage.reported },
			turns: history.usage.turns,
			assignments: history.usage.assignments,
		},
		leases: [],
	};
}

function compareOverviewRows(
	left: Pick<SubAgentManagerOverviewRow, "state" | "updatedAt" | "id">,
	right: Pick<SubAgentManagerOverviewRow, "state" | "updatedAt" | "id">,
): number {
	const stateOrder = OVERVIEW_STATE_PRIORITY[left.state] - OVERVIEW_STATE_PRIORITY[right.state];
	if (stateOrder !== 0) return stateOrder;
	if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
	return left.id.localeCompare(right.id);
}

function insertOverviewRow(
	rows: SubAgentManagerOverviewRow[],
	row: SubAgentManagerOverviewRow,
	maxRows: number,
): void {
	const index = rows.findIndex((candidate) => compareOverviewRows(row, candidate) < 0);
	if (index < 0) rows.push(row);
	else rows.splice(index, 0, row);
	if (rows.length > maxRows) rows.pop();
}

function insertDashboardRow(
	rows: SubAgentDashboardRow[],
	row: SubAgentDashboardRow,
	maxRows: number,
): void {
	const index = rows.findIndex((candidate) => compareOverviewRows(row, candidate) < 0);
	if (index < 0) rows.push(row);
	else rows.splice(index, 0, row);
	if (rows.length > maxRows) rows.pop();
}

function runtimeOverviewChanged(previous: AgentRuntimeActivity, next: AgentRuntimeActivity): boolean {
	if (
		previous.phase !== next.phase ||
		previous.activeToolCount !== next.activeToolCount ||
		previous.pendingMessageCount !== next.pendingMessageCount ||
		previous.activeTools.length !== next.activeTools.length
	) {
		return true;
	}
	return previous.activeTools.some(
		(tool, index) =>
			tool.toolCallId !== next.activeTools[index]?.toolCallId ||
			tool.toolName !== next.activeTools[index]?.toolName,
	);
}

function safeErrorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return boundText(message || "Unknown runtime error", SUB_AGENT_BOUNDS.errorChars);
}

function nonNegativeNumber(value: number, field: string): number {
	if (!Number.isFinite(value) || value < 0) {
		throw new SubAgentManagerError(`${field} must be a finite non-negative number`, "invalid_usage");
	}
	return value;
}

function withUsageErrorBoundary<T>(operation: () => T): T {
	try {
		return operation();
	} catch (error) {
		if (error instanceof UsageLedgerError) {
			throw new SubAgentManagerError(error.message, "invalid_usage");
		}
		throw error;
	}
}

function nonNegativeInteger(value: number, field: string): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new SubAgentManagerError(`${field} must be a non-negative integer`, "invalid_runtime_activity");
	}
	return value;
}

function normalizeModelRoute(route: ModelRoute): ModelRoute {
	if (!route || typeof route !== "object" || Array.isArray(route)) {
		throw new SubAgentManagerError("Model route is required", "invalid_model_route");
	}
	const requestedPolicy = requireChoice<ModelPolicy>(
		route.requestedPolicy,
		MODEL_POLICIES,
		"modelRoute.requestedPolicy",
	);
	const requestedComplexity = requireChoice<ComplexityTier>(
		route.requestedComplexity,
		COMPLEXITY_TIERS,
		"modelRoute.requestedComplexity",
	);
	const selectedModel = {
		provider: requireBoundedText(route.selectedModel?.provider, "modelRoute.selectedModel.provider", 128),
		id: requireBoundedText(route.selectedModel?.id, "modelRoute.selectedModel.id", 256),
	};
	const selectedTier =
		route.selectedTier === undefined
			? undefined
			: requireChoice<ComplexityTier>(
					route.selectedTier,
					COMPLEXITY_TIERS,
					"modelRoute.selectedTier",
				);
	if (typeof route.fallbackUsed !== "boolean") {
		throw new SubAgentManagerError("modelRoute.fallbackUsed must be a boolean", "invalid_model_route");
	}
	if (
		!Array.isArray(route.fallbackPath) ||
		route.fallbackPath.length === 0 ||
		route.fallbackPath.length > SUB_AGENT_BOUNDS.modelRouteSteps
	) {
		throw new SubAgentManagerError(
			`modelRoute.fallbackPath must contain between 1 and ${SUB_AGENT_BOUNDS.modelRouteSteps} steps`,
			"invalid_model_route",
		);
	}
	const fallbackPath: ModelRouteStep[] = route.fallbackPath.map((step, index) => {
		if (!step || typeof step !== "object" || Array.isArray(step)) {
			throw new SubAgentManagerError(`modelRoute.fallbackPath[${index}] is invalid`, "invalid_model_route");
		}
		const source = requireChoice<ModelRouteStep["source"]>(
			step.source,
			MODEL_ROUTE_STEP_SOURCES,
			`modelRoute.fallbackPath[${index}].source`,
		);
		const complexity =
			step.complexity === undefined
				? undefined
				: requireChoice<ComplexityTier>(
						step.complexity,
						COMPLEXITY_TIERS,
						`modelRoute.fallbackPath[${index}].complexity`,
					);
		if ((source === "tier") !== (complexity !== undefined)) {
			throw new SubAgentManagerError(
				`modelRoute.fallbackPath[${index}] has inconsistent tier metadata`,
				"invalid_model_route",
			);
		}
		return {
			source,
			modelId: requireBoundedText(
				step.modelId,
				`modelRoute.fallbackPath[${index}].modelId`,
				256,
			),
			complexity,
			outcome: requireChoice<ModelRouteStep["outcome"]>(
				step.outcome,
				MODEL_ROUTE_STEP_OUTCOMES,
				`modelRoute.fallbackPath[${index}].outcome`,
			),
		};
	});
	const selectedSteps = fallbackPath.filter((step) => step.outcome === "selected");
	const finalStep = fallbackPath.at(-1)!;
	if (
		selectedSteps.length !== 1 ||
		finalStep.outcome !== "selected" ||
		finalStep.modelId !== selectedModel.id ||
		fallbackPath.slice(0, -1).some((step) => step.outcome !== "unavailable")
	) {
		throw new SubAgentManagerError("Model route must end in exactly one selected model", "invalid_model_route");
	}
	if ((selectedTier !== undefined) !== (finalStep.source === "tier") || selectedTier !== finalStep.complexity) {
		throw new SubAgentManagerError("Model route selected tier is inconsistent", "invalid_model_route");
	}
	const expectedFallback = requestedPolicy === "auto" && fallbackPath.length > 1;
	if (route.fallbackUsed !== expectedFallback) {
		throw new SubAgentManagerError("Model route fallback flag is inconsistent", "invalid_model_route");
	}
	if (
		(requestedPolicy === "explicit" && (fallbackPath.length !== 1 || finalStep.source !== "explicit")) ||
		(requestedPolicy === "inherit" && (fallbackPath.length !== 1 || finalStep.source !== "inherit")) ||
		(requestedPolicy === "auto" && finalStep.source === "explicit")
	) {
		throw new SubAgentManagerError("Model route policy and path are inconsistent", "invalid_model_route");
	}
	return {
		requestedPolicy,
		requestedComplexity,
		selectedModel,
		selectedTier,
		fallbackUsed: route.fallbackUsed,
		fallbackPath,
		reason: requireBoundedText(
			route.reason,
			"modelRoute.reason",
			SUB_AGENT_BOUNDS.modelRouteReasonChars,
		),
	};
}

function normalizeRuntimeActivity(activity: AgentRuntimeActivity): AgentRuntimeActivity {
	if (!activity || typeof activity !== "object" || Array.isArray(activity)) {
		throw new SubAgentManagerError("Runtime activity is required", "invalid_runtime_activity");
	}
	if (!Array.isArray(activity.activeTools) || activity.activeTools.length > SUB_AGENT_BOUNDS.activeToolCalls) {
		throw new SubAgentManagerError(
			`Runtime activity exceeds ${SUB_AGENT_BOUNDS.activeToolCalls} active tool summaries`,
			"invalid_runtime_activity",
		);
	}
	const activeTools = activity.activeTools.map((tool, index) => {
		if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
			throw new SubAgentManagerError(`runtime.activeTools[${index}] is invalid`, "invalid_runtime_activity");
		}
		return {
			toolCallId: requireBoundedText(
				tool.toolCallId,
				`runtime.activeTools[${index}].toolCallId`,
				SUB_AGENT_BOUNDS.toolCallIdChars,
			),
			toolName: requireBoundedText(
				tool.toolName,
				`runtime.activeTools[${index}].toolName`,
				SUB_AGENT_BOUNDS.toolNameChars,
			),
			startedAt: nonNegativeNumber(tool.startedAt, `runtime.activeTools[${index}].startedAt`),
			updatedAt: nonNegativeNumber(tool.updatedAt, `runtime.activeTools[${index}].updatedAt`),
		};
	});
	const streamingPreview =
		activity.streamingPreview === undefined
			? undefined
			: boundText(activity.streamingPreview, SUB_AGENT_BOUNDS.streamingPreviewChars);
	const activeToolCount = nonNegativeInteger(activity.activeToolCount, "runtime.activeToolCount");
	if (activeToolCount < activeTools.length) {
		throw new SubAgentManagerError(
			"Runtime active tool count cannot be smaller than its bounded summaries",
			"invalid_runtime_activity",
		);
	}
	return {
		phase: requireChoice<AgentRuntimePhase>(activity.phase, RUNTIME_PHASES, "runtime.phase"),
		streamingPreview: streamingPreview || undefined,
		activeToolCount,
		activeTools,
		pendingMessageCount: nonNegativeInteger(
			activity.pendingMessageCount,
			"runtime.pendingMessageCount",
		),
	};
}

async function settleWithTimeout(
	promises: readonly Promise<unknown>[],
	timeoutMs: number,
): Promise<readonly PromiseSettledResult<unknown>[] | undefined> {
	if (promises.length === 0) return Object.freeze([]);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			Promise.allSettled(promises),
			new Promise<undefined>((resolvePromise) => {
				timer = setTimeout(() => resolvePromise(undefined), timeoutMs);
				timer.unref?.();
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

async function fulfillWithTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise.then(
				() => true,
				() => false,
			),
			new Promise<boolean>((resolvePromise) => {
				timer = setTimeout(() => resolvePromise(false), timeoutMs);
				timer.unref?.();
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

export class SubAgentManager {
	readonly generation: SessionGeneration;
	readonly cwd: string;
	readonly modelRuntime: ChildModelRuntimeAdapter;

	#now: () => number;
	#nonce: () => string;
	#cleanupTimeoutMs: number;
	#agentPrefix: string;
	#sequence = 0;
	#records = new Map<SubAgentId, ManagedRecord>();
	#restoredHistory = new Map<SubAgentId, PersistedSubAgentHistoryV1>();
	#operationTails = new Map<SubAgentId, Promise<void>>();
	#changeListeners = new Set<SubAgentManagerChangeListener>();
	#eventListeners = new Set<SubAgentManagerEventListener>();
	#workspaceLeases: WorkspaceLeaseManager;
	#parentContext?: ParentContextSnapshotV1;
	#closed = false;
	#disposePromise?: Promise<void>;

	constructor(options: SubAgentManagerOptions) {
		this.cwd = resolve(options.cwd);
		this.#now = options.now ?? Date.now;
		this.#nonce = options.nonce ?? randomUUID;
		this.generation = options.generation ?? createSessionGeneration(this.#nonce());
		if (!this.generation.startsWith(GENERATION_PREFIX)) {
			throw new SubAgentManagerError("Invalid session generation", "invalid_generation");
		}
		this.#agentPrefix = `${AGENT_ID_PREFIX}${this.generation.slice(GENERATION_PREFIX.length)}-`;
		this.#cleanupTimeoutMs = Math.max(1, options.cleanupTimeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS);
		this.modelRuntime = options.modelRuntime ?? new ChildModelRuntimeAdapter();
		this.#workspaceLeases = new WorkspaceLeaseManager({
			generation: this.generation,
			workspaceRoot: this.cwd,
			now: this.#now,
		});
	}

	get closed(): boolean {
		return this.#closed;
	}

	captureParentContext(
		contextFiles: readonly ParentContextFile[] | undefined,
		trusted: boolean,
	): ParentContextSnapshotV1 {
		this.#assertOpen();
		this.#parentContext = undefined;
		const snapshot = captureParentContextSnapshot({
			generation: this.generation,
			trusted,
			contextFiles,
			capturedAt: this.#now(),
		});
		this.#parentContext = snapshot;
		return snapshot;
	}

	getParentContextSnapshot(): ParentContextSnapshotV1 | undefined {
		return this.#parentContext;
	}

	/** Subscribe to minimal mutation markers used by session-scoped TUI observability. */
	subscribeChanges(listener: SubAgentManagerChangeListener): () => void {
		this.#assertOpen();
		if (typeof listener !== "function") {
			throw new SubAgentManagerError("A sub-agent change listener is required", "invalid_listener");
		}
		this.#changeListeners.add(listener);
		let subscribed = true;
		return () => {
			if (!subscribed) return;
			subscribed = false;
			this.#changeListeners.delete(listener);
		};
	}

	/** Subscribe to defensive bounded manager events for this exact generation. */
	subscribeEvents(listener: SubAgentManagerEventListener): () => void {
		this.#assertOpen();
		if (typeof listener !== "function") {
			throw new SubAgentManagerError("A sub-agent event listener is required", "invalid_listener");
		}
		this.#eventListeners.add(listener);
		let subscribed = true;
		return () => {
			if (!subscribed) return;
			subscribed = false;
			this.#eventListeners.delete(listener);
		};
	}

	/**
	 * Install bounded active-branch history before session-scoped runtimes subscribe.
	 * Restored IDs remain inspectable but are never inserted into the live registry.
	 */
	restoreHistoricalRecords(histories: readonly PersistedSubAgentHistoryV1[]): {
		restored: number;
		duplicates: number;
		rejected: number;
		omitted: number;
	} {
		this.#assertOpen();
		if (!Array.isArray(histories)) {
			throw new SubAgentManagerError("Historical records must be an array", "invalid_history");
		}
		let restored = 0;
		let duplicates = 0;
		let rejected = 0;
		let omitted = 0;
		for (const history of histories) {
			if (this.#restoredHistory.size >= SUB_AGENT_BOUNDS.historicalAgents) {
				omitted += 1;
				continue;
			}
			if (
				!history ||
				typeof history !== "object" ||
				typeof history.generation !== "string" ||
				typeof history.id !== "string" ||
				history.generation === this.generation ||
				history.id.startsWith(this.#agentPrefix) ||
				!history.id.startsWith(`sa1-${history.generation.slice("sag1-".length)}-`)
			) {
				rejected += 1;
				continue;
			}
			if (this.#records.has(history.id) || this.#restoredHistory.has(history.id)) {
				duplicates += 1;
				continue;
			}
			this.#restoredHistory.set(history.id, clonePersistedHistory(history));
			restored += 1;
		}
		return { restored, duplicates, rejected, omitted };
	}

	createAgent(spec: DynamicAgentSpec): ManagedSubAgentSnapshot {
		this.#assertOpen();
		const normalized = normalizeSpec(spec);
		const now = this.#now();
		this.#sequence += 1;
		const id = `${this.#agentPrefix}${this.#sequence.toString(36)}-${normalizeNonce(this.#nonce())}`;
		if (this.#records.has(id)) throw new SubAgentManagerError("Opaque sub-agent id collision", "id_collision");

		const record: ManagedRecord = {
			id,
			generation: this.generation,
			spec: normalized,
			state: "creating",
			createdAt: now,
			updatedAt: now,
			assignmentCount: 0,
			events: [],
			omittedEventCount: 0,
			runtime: createRuntimeActivity("initializing"),
			usage: createUsageLedger(),
			leases: [],
			eventSequence: 0,
			leaseSnapshot: () =>
				this.#workspaceLeases
					.listChildLeases(id)
					.map((lease) => ({ ...lease })),
			resources: {
				unsubscribers: new Set(),
				timers: new Set(),
				abortControllers: new Set(),
				background: new Set(),
			},
		};
		this.#records.set(id, record);
		this.#appendEvent(record, "created", `Created ${normalized.name}`);
		return snapshotRecord(record);
	}

	getAgent(id: SubAgentId): ManagedSubAgentSnapshot {
		const record = this.#records.get(id);
		if (record) return snapshotRecord(record);
		const history = this.#restoredHistory.get(id);
		if (history) return restoredHistorySnapshot(history);
		this.#requireRecord(id);
		throw new UnknownAgentIdError(id);
	}

	listAgents(options: { includeRemoved?: boolean } = {}): ManagedSubAgentSnapshot[] {
		const includeRemoved = options.includeRemoved ?? true;
		const live = [...this.#records.values()]
			.filter((record) => includeRemoved || record.state !== "removed")
			.map(snapshotRecord);
		if (!includeRemoved) return live;
		return [
			...live,
			...[...this.#restoredHistory.values()].map(restoredHistorySnapshot),
		];
	}

	/** Return exact IDs without cloning full records; used by captured all-agent controls. */
	listAgentIds(options: { includeRemoved?: boolean } = {}): SubAgentId[] {
		const includeRemoved = options.includeRemoved ?? true;
		const ids = [...this.#records.values()]
			.filter((record) => includeRemoved || record.state !== "removed")
			.map((record) => record.id);
		if (includeRemoved) ids.push(...this.#restoredHistory.keys());
		return ids;
	}

	getSummary(): SubAgentManagerSummary {
		const counts: AgentStateCounts = {
			creating: 0,
			running: 0,
			idle: 0,
			blocked: 0,
			failed: 0,
			stopping: 0,
			removed: 0,
		};
		for (const record of this.#records.values()) counts[record.state] += 1;
		counts.removed += this.#restoredHistory.size;
		return {
			generation: this.generation,
			closed: this.#closed,
			total: this.#records.size + this.#restoredHistory.size,
			active: this.#records.size - (counts.removed - this.#restoredHistory.size),
			historical: counts.removed,
			counts,
		};
	}

	/** Atomically claim canonical file identities for one current-generation child. */
	claimChildFileLeases(
		id: SubAgentId,
		workspace: Readonly<WorkspaceIdentity>,
		targets: readonly Readonly<CanonicalWorkspacePath>[],
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (record.state !== "creating" && record.state !== "running") {
				throw new SubAgentManagerError(
					"The sub-agent cannot acquire workspace ownership in its current state",
					"agent_unavailable",
				);
			}
			const previousCount = record.leases.length;
			this.#workspaceLeases.claimChildFiles({
				agentId: record.id,
				agentName: record.spec.name,
				workspace,
				targets,
			});
			record.leases = record.leaseSnapshot();
			if (record.leases.length !== previousCount) {
				this.#appendEvent(record, "lease", `Claimed ${record.leases.length - previousCount} file lease(s)`);
			}
			return snapshotRecord(record);
		});
	}

	/** Narrow one exact provisional child lease after guarded creation verifies the existing identity. */
	reconcileChildFileLease(
		id: SubAgentId,
		workspace: Readonly<WorkspaceIdentity>,
		target: Readonly<CanonicalWorkspacePath>,
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (record.state === "stopping" || record.state === "removed" || record.state === "failed") {
				throw new SubAgentManagerError(
					"The sub-agent cannot reconcile workspace ownership in its current state",
					"agent_unavailable",
				);
			}
			this.#workspaceLeases.reconcileChildFile({
				agentId: record.id,
				agentName: record.spec.name,
				workspace,
				target,
			});
			record.leases = record.leaseSnapshot();
			return snapshotRecord(record);
		});
	}

	/** Atomically claim the complete shared workspace for one child. */
	claimChildWorkspaceLease(
		id: SubAgentId,
		workspace: Readonly<WorkspaceIdentity>,
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (record.state !== "creating" && record.state !== "running") {
				throw new SubAgentManagerError(
					"The sub-agent cannot acquire workspace ownership in its current state",
					"agent_unavailable",
				);
			}
			const previousCount = record.leases.length;
			this.#workspaceLeases.claimChildWorkspace({
				agentId: record.id,
				agentName: record.spec.name,
				workspace,
			});
			record.leases = record.leaseSnapshot();
			if (record.leases.length !== previousCount) {
				this.#appendEvent(record, "lease", "Claimed the shared workspace lease");
			}
			return snapshotRecord(record);
		});
	}

	/** Record one successful guarded file mutation only while its child lease remains authoritative. */
	recordChildFileMutation(
		id: SubAgentId,
		target: Readonly<CanonicalWorkspacePath>,
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (!record.currentAssignment) {
				throw new SubAgentManagerError(
					"A guarded file mutation requires an active assignment boundary",
					"assignment_missing",
				);
			}
			const relativePath = requireBoundedText(
				target?.relativePath,
				"workspace mutation path",
				SUB_AGENT_BOUNDS.contextPathChars,
			);
			const owned = this.#workspaceLeases
				.listChildLeases(record.id)
				.some((lease) => lease.kind === "file" && lease.path === relativePath);
			if (!owned) {
				throw new SubAgentManagerError(
					"A guarded file mutation cannot be recorded without its exact child lease",
					"lease_missing",
				);
			}
			const previousFiles = record.currentAssignment.modifiedFiles ?? [];
			const modifiedFiles = mergeBoundedFilePaths(previousFiles, [relativePath]);
			const added = modifiedFiles.length > previousFiles.length;
			record.currentAssignment.modifiedFiles = modifiedFiles;
			if (record.latestReport) {
				record.latestReport = {
					...record.latestReport,
					files: mergeBoundedFilePaths(modifiedFiles, record.latestReport.files),
				};
			}
			if (added) this.#appendEvent(record, "lease", `Modified ${relativePath}`);
			return snapshotRecord(record);
		});
	}

	/** Explicitly release every retained lease for one child; repeated calls are no-ops. */
	releaseChildLeases(id: SubAgentId, reason = "Released retained workspace ownership"): Promise<ManagedSubAgentSnapshot> {
		return this.releaseChildLeasesWithResult(id, reason).then((result) => result.snapshot);
	}

	/** Atomic release outcome used by exact model/human controls. */
	releaseChildLeasesWithResult(
		id: SubAgentId,
		reason = "Released retained workspace ownership",
	): Promise<{
		snapshot: ManagedSubAgentSnapshot;
		released: readonly Readonly<WorkspaceLeaseRecord>[];
	}> {
		this.#assertOpen();
		const summary = boundText(reason, SUB_AGENT_BOUNDS.eventSummaryChars) || "Released retained workspace ownership";
		return this.#enqueue(id, (record) => {
			if (
				(record.state !== "idle" && record.state !== "blocked") ||
				(record.state === "blocked" && record.runtime.phase !== "settled")
			) {
				throw new SubAgentManagerError(
					"Retained workspace ownership can be released only at a settled idle or blocked boundary",
					"lease_release_boundary",
				);
			}
			const released = this.#workspaceLeases.releaseChildLeases(record.id);
			record.leases = record.leaseSnapshot();
			if (released.length > 0) {
				this.#appendEvent(record, "lease", summary, undefined, true);
			}
			return {
				snapshot: snapshotRecord(record),
				released: Object.freeze(released.map((lease) => Object.freeze({ ...lease }))),
			};
		});
	}

	/** Reserve canonical targets for one exact parent tool call. */
	reserveParentFiles(
		reservationId: string,
		workspace: Readonly<WorkspaceIdentity>,
		targets: readonly Readonly<CanonicalWorkspacePath>[],
	): Readonly<ParentWorkspaceReservation> {
		this.#assertOpen();
		return this.#workspaceLeases.reserveParentFiles({ reservationId, workspace, targets });
	}

	/** Reserve the complete shared workspace for one exact parent tool call. */
	reserveParentWorkspace(
		reservationId: string,
		workspace: Readonly<WorkspaceIdentity>,
	): Readonly<ParentWorkspaceReservation> {
		this.#assertOpen();
		return this.#workspaceLeases.reserveParentWorkspace({ reservationId, workspace });
	}

	/** Release one exact opaque parent reservation handle. */
	releaseParentReservation(token: string): readonly Readonly<WorkspaceLeaseRecord>[] {
		return this.#workspaceLeases.releaseParentReservation(token);
	}

	/** Build one bounded TUI overview without cloning child timelines or conversations. */
	getOverview(maxRows = SUB_AGENT_BOUNDS.statusWidgetRows): SubAgentManagerOverview {
		const rowLimit =
			Number.isSafeInteger(maxRows) && maxRows > 0
				? Math.min(maxRows, SUB_AGENT_BOUNDS.statusWidgetRows)
				: SUB_AGENT_BOUNDS.statusWidgetRows;
		const counts: AgentStateCounts = {
			creating: 0,
			running: 0,
			idle: 0,
			blocked: 0,
			failed: 0,
			stopping: 0,
			removed: 0,
		};
		const usage: UsageCounters = {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: 0,
		};
		let usageClamped = false;
		const rows: SubAgentManagerOverviewRow[] = [];
		for (const record of this.#records.values()) {
			counts[record.state] += 1;
			for (const field of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) {
				const total = usage[field] + record.usage.totals[field];
				if (!Number.isSafeInteger(total)) {
					usage[field] = Number.MAX_SAFE_INTEGER;
					usageClamped = true;
				} else {
					usage[field] = total;
				}
			}
			const cost = usage.cost + record.usage.totals.cost;
			if (!Number.isFinite(cost)) {
				usage.cost = Number.MAX_VALUE;
				usageClamped = true;
			} else {
				usage.cost = cost;
			}
			if (record.state === "removed") continue;

			const activeTools = record.runtime.activeTools
				.slice(0, SUB_AGENT_BOUNDS.statusWidgetTools)
				.map((tool) => tool.toolName);
			const blocker =
				record.state === "blocked"
					? record.currentAssignment?.blocker ?? record.latestReport?.needs ?? record.latestReport?.summary
					: undefined;
			insertOverviewRow(
				rows,
				{
					id: record.id,
					name: record.spec.name,
					state: record.state,
					updatedAt: record.updatedAt,
					phase: record.runtime.phase,
					activeToolCount: record.runtime.activeToolCount,
					activeTools,
					omittedActiveToolCount: Math.max(0, record.runtime.activeToolCount - activeTools.length),
					pendingMessageCount: record.runtime.pendingMessageCount,
					blocker: blocker
						? boundText(blocker, SUB_AGENT_BOUNDS.statusWidgetBlockerChars)
						: undefined,
					resultReady: record.state === "idle" && record.latestResult !== undefined,
				},
				rowLimit,
			);
		}
		const currentRemoved = counts.removed;
		for (const history of this.#restoredHistory.values()) {
			counts.removed += 1;
			for (const field of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) {
				const total = usage[field] + history.usage.totals[field];
				if (!Number.isSafeInteger(total)) {
					usage[field] = Number.MAX_SAFE_INTEGER;
					usageClamped = true;
				} else {
					usage[field] = total;
				}
			}
			const cost = usage.cost + history.usage.totals.cost;
			if (!Number.isFinite(cost)) {
				usage.cost = Number.MAX_VALUE;
				usageClamped = true;
			} else {
				usage.cost = cost;
			}
		}
		const active = this.#records.size - currentRemoved;
		return {
			generation: this.generation,
			closed: this.#closed,
			active,
			historical: counts.removed,
			counts,
			usage,
			usageClamped,
			rows,
			omittedRowCount: Math.max(0, active - rows.length),
		};
	}

	/** Build a bounded list snapshot without cloning per-child timelines or reports. */
	getDashboardSnapshot(
		maxRows = SUB_AGENT_BOUNDS.dashboardAgents,
		includeRemoved = true,
	): SubAgentDashboardSnapshot {
		const rowLimit =
			Number.isSafeInteger(maxRows) && maxRows > 0
				? Math.min(maxRows, SUB_AGENT_BOUNDS.dashboardAgents)
				: SUB_AGENT_BOUNDS.dashboardAgents;
		const counts: AgentStateCounts = {
			creating: 0,
			running: 0,
			idle: 0,
			blocked: 0,
			failed: 0,
			stopping: 0,
			removed: 0,
		};
		const usage: UsageCounters = {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: 0,
		};
		let usageClamped = false;
		let eligible = 0;
		const rows: SubAgentDashboardRow[] = [];
		for (const record of this.#records.values()) {
			counts[record.state] += 1;
			for (const field of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) {
				const total = usage[field] + record.usage.totals[field];
				if (!Number.isSafeInteger(total)) {
					usage[field] = Number.MAX_SAFE_INTEGER;
					usageClamped = true;
				} else {
					usage[field] = total;
				}
			}
			const cost = usage.cost + record.usage.totals.cost;
			if (!Number.isFinite(cost)) {
				usage.cost = Number.MAX_VALUE;
				usageClamped = true;
			} else {
				usage.cost = cost;
			}
			if (!includeRemoved && record.state === "removed") continue;
			eligible += 1;
			insertDashboardRow(
				rows,
				{
					id: record.id,
					name: record.spec.name,
					state: record.state,
					updatedAt: record.updatedAt,
					assignmentCount: record.assignmentCount,
					phase: record.runtime.phase,
					pendingMessageCount: record.runtime.pendingMessageCount,
					resultReady: record.latestResult !== undefined,
					tags: [...(record.spec.tags ?? [])],
				},
				rowLimit,
			);
		}
		const currentRemoved = counts.removed;
		for (const history of this.#restoredHistory.values()) {
			counts.removed += 1;
			for (const field of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) {
				const total = usage[field] + history.usage.totals[field];
				if (!Number.isSafeInteger(total)) {
					usage[field] = Number.MAX_SAFE_INTEGER;
					usageClamped = true;
				} else {
					usage[field] = total;
				}
			}
			const cost = usage.cost + history.usage.totals.cost;
			if (!Number.isFinite(cost)) {
				usage.cost = Number.MAX_VALUE;
				usageClamped = true;
			} else {
				usage.cost = cost;
			}
			if (!includeRemoved) continue;
			eligible += 1;
			const restored = restoredHistorySnapshot(history);
			insertDashboardRow(
				rows,
				{
					id: restored.id,
					name: restored.spec.name,
					state: "removed",
					updatedAt: restored.updatedAt,
					assignmentCount: restored.assignmentCount,
					phase: "settled",
					pendingMessageCount: 0,
					resultReady: restored.latestResult !== undefined,
					tags: [],
				},
				rowLimit,
			);
		}
		return {
			generation: this.generation,
			closed: this.#closed,
			active: this.#records.size - currentRemoved,
			historical: counts.removed,
			counts,
			usage,
			usageClamped,
			includeRemoved,
			rows,
			omittedRowCount: Math.max(0, eligible - rows.length),
		};
	}

	startAssignment(id: SubAgentId, objective?: string): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (record.state !== "creating" && record.state !== "idle") {
				throw new InvalidAgentTransitionError(record.state, "running");
			}
			if (record.pendingModelReconfiguration) {
				throw new SubAgentManagerError(
					"A queued model reconfiguration must finish before another assignment starts",
					"model_reconfiguration_pending",
				);
			}
			const assignmentCount = record.assignmentCount + 1;
			if (!Number.isSafeInteger(assignmentCount)) {
				throw new SubAgentManagerError("Assignment count exceeds its supported range", "invalid_usage");
			}
			const assignmentObjective = requireBoundedText(
				objective ?? record.spec.objective,
				"assignment objective",
				SUB_AGENT_BOUNDS.objectiveChars,
			);
			const usage = withUsageErrorBoundary(() => beginUsageAssignment(record.usage));

			this.#transition(record, "running");
			record.runtime = createRuntimeActivity("streaming");
			record.assignmentCount = assignmentCount;
			record.usage = usage;
			record.latestReport = undefined;
			record.currentAssignment = {
				id: `${record.id}:assignment:${assignmentCount.toString(36)}`,
				sequence: assignmentCount,
				objective: assignmentObjective,
				state: "running",
				startedAt: this.#now(),
				modelRoute: cloneModelRoute(record.modelRoute),
				usage: createAssignmentUsage(),
			};
			this.#appendEvent(record, "assignment", `Started assignment ${record.assignmentCount}`);
			return snapshotRecord(record);
		});
	}

	resumeBlockedAssignment(id: SubAgentId): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (
				record.state !== "blocked" ||
				!record.currentAssignment ||
				record.runtime.phase !== "settled"
			) {
				throw new InvalidAgentTransitionError(record.state, "running");
			}
			this.#transition(record, "running");
			record.runtime = createRuntimeActivity("streaming");
			record.currentAssignment.state = "running";
			record.currentAssignment.blocker = undefined;
			record.latestReport = undefined;
			this.#appendEvent(record, "assignment", `Resumed assignment ${record.currentAssignment.sequence}`);
			return snapshotRecord(record);
		});
	}

	completeAssignment(
		id: SubAgentId,
		outcome: { state: "idle" | "blocked"; summary: string; details?: string; files?: string[]; needs?: string },
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (record.state !== "running" || !record.currentAssignment) {
				throw new InvalidAgentTransitionError(record.state, outcome.state);
			}
			const now = this.#now();
			const result = this.#boundedResult(
				{
					...outcome,
					files: mergeBoundedFilePaths(
						record.currentAssignment.modifiedFiles,
						outcome.files,
					),
				},
				now,
			);
			this.#transition(record, outcome.state);
			if (outcome.state === "idle") record.runtime = createRuntimeActivity("settled");
			record.currentAssignment.state = outcome.state;
			if (outcome.state === "blocked") {
				record.currentAssignment.blocker = boundText(outcome.needs ?? outcome.summary, SUB_AGENT_BOUNDS.reportNeedsChars);
			} else {
				record.currentAssignment.endedAt = now;
				record.currentAssignment.result = result;
				record.latestResult = result;
			}
			this.#appendEvent(
				record,
				"assignment",
				`${outcome.state}: ${outcome.summary}`,
				outcome.state,
				true,
			);
			return snapshotRecord(record);
		});
	}

	failAgent(
		id: SubAgentId,
		error: unknown,
		options: { runtimeSettled?: boolean } = {},
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (record.state === "failed") return snapshotRecord(record);
			if (!canTransitionAgentState(record.state, "failed")) {
				throw new InvalidAgentTransitionError(record.state, "failed");
			}
			const message = safeErrorMessage(error);
			this.#transition(record, "failed");
			record.runtime = createRuntimeActivity("settled");
			if (options.runtimeSettled === true) {
				this.#workspaceLeases.releaseChildLeases(record.id);
				record.leases = record.leaseSnapshot();
			}
			record.pendingModelReconfiguration = undefined;
			record.lastError = message;
			if (record.currentAssignment?.state === "running" || record.currentAssignment?.state === "blocked") {
				record.currentAssignment.state = "failed";
				record.currentAssignment.error = message;
				record.currentAssignment.endedAt = this.#now();
			}
			this.#appendEvent(record, "runtime", `Failed: ${message}`, "failed", true);
			return snapshotRecord(record);
		});
	}

	recordReport(
		id: SubAgentId,
		report: AgentReportSubmission & { timestamp?: number },
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (record.state !== "running" && record.state !== "blocked") {
				throw new SubAgentManagerError("A sub-agent can report only during an active assignment", "agent_not_active");
			}
			const reportFiles =
				boundedUniqueStrings(report.files, "report.files", SUB_AGENT_BOUNDS.reportFiles, 4_096) ?? [];
			const bounded: BoundedAgentReport = {
				state: requireChoice<AgentReportState>(
					report.state,
					AGENT_REPORT_STATES,
					"report.state",
				),
				summary: requireBoundedText(report.summary, "report.summary", SUB_AGENT_BOUNDS.reportSummaryChars),
				details: optionalBoundedText(report.details, "report.details", SUB_AGENT_BOUNDS.reportDetailsChars),
				files: mergeBoundedFilePaths(record.currentAssignment?.modifiedFiles, reportFiles),
				needs: optionalBoundedText(report.needs, "report.needs", SUB_AGENT_BOUNDS.reportNeedsChars),
				timestamp: nonNegativeNumber(
					report.timestamp ?? this.#now(),
					"report.timestamp",
				),
			};
			record.latestReport = bounded;
			this.#appendEvent(
				record,
				"report",
				`${bounded.state}: ${bounded.summary}`,
				undefined,
				record.state === "blocked",
			);
			return snapshotRecord(record);
		});
	}

	addUsage(id: SubAgentId, delta: UsageDelta): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (!record.currentAssignment) {
				throw new SubAgentManagerError(
					"Usage cannot be recorded without a current assignment",
					"invalid_usage",
				);
			}
			const update = withUsageErrorBoundary(() =>
				applyUsageDelta(record.usage, record.currentAssignment!.usage, delta),
			);
			record.usage = update.ledger;
			record.currentAssignment.usage = update.assignment;
			record.updatedAt = this.#now();
			this.#publishChange(record);
			return snapshotRecord(record);
		});
	}

	/** Atomically marks all currently accrued child usage as reported. */
	drainUsage(id: SubAgentId): Promise<UsageCounters> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			const drained = withUsageErrorBoundary(() => drainUsageLedger(record.usage));
			record.usage = drained.ledger;
			record.updatedAt = this.#now();
			const hasDelta =
				drained.delta.input > 0 ||
				drained.delta.output > 0 ||
				drained.delta.cacheRead > 0 ||
				drained.delta.cacheWrite > 0 ||
				drained.delta.totalTokens > 0 ||
				drained.delta.cost > 0;
			if (hasDelta && HISTORICAL_CHECKPOINT_STATES.has(record.state)) {
				this.#appendEvent(
					record,
					"runtime",
					"Updated the parent usage reporting checkpoint",
					undefined,
					true,
				);
			}
			return { ...drained.delta };
		});
	}

	updateRuntimeActivity(
		id: SubAgentId,
		activity: AgentRuntimeActivity,
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		const normalized = normalizeRuntimeActivity(activity);
		return this.#enqueue(id, (record) => {
			if (record.state === "stopping" || record.state === "removed") return snapshotRecord(record);
			const previous = record.runtime;
			record.runtime = normalized;
			record.updatedAt = this.#now();
			if (runtimeOverviewChanged(previous, normalized)) this.#publishChange(record);
			return snapshotRecord(record);
		});
	}

	recordModelRoute(id: SubAgentId, route: ModelRoute): Promise<ManagedSubAgentSnapshot> {
		return this.recordModelConfiguration(id, route);
	}

	recordModelConfiguration(
		id: SubAgentId,
		route: ModelRoute,
		effectiveThinkingLevel?: ThinkingLevel,
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		const normalized = normalizeModelRoute(route);
		const thinkingLevel =
			effectiveThinkingLevel === undefined
				? undefined
				: requireChoice<ThinkingLevel>(
						effectiveThinkingLevel,
						THINKING_LEVELS,
						"effectiveThinkingLevel",
					);
		return this.#enqueue(id, (record) => {
			if (record.state !== "creating" && record.state !== "idle") {
				throw new SubAgentManagerError(
					`A model route can be changed only at a safe assignment boundary: ${record.state}`,
					"model_route_boundary",
				);
			}
			record.modelRoute = normalized;
			if (thinkingLevel !== undefined) record.effectiveThinkingLevel = thinkingLevel;
			record.pendingModelReconfiguration = undefined;
			record.lastError = undefined;
			this.#appendEvent(
				record,
				"model",
				`Selected model ${normalized.selectedModel.provider}/${normalized.selectedModel.id}` +
					(thinkingLevel === undefined ? "" : ` with thinking ${thinkingLevel}`),
				undefined,
				record.state === "idle",
			);
			return snapshotRecord(record);
		});
	}

	recordEffectiveThinkingLevel(
		id: SubAgentId,
		effectiveThinkingLevel: ThinkingLevel,
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		const thinkingLevel = requireChoice<ThinkingLevel>(
			effectiveThinkingLevel,
			THINKING_LEVELS,
			"effectiveThinkingLevel",
		);
		return this.#enqueue(id, (record) => {
			if (record.state !== "creating" && record.state !== "idle") {
				throw new SubAgentManagerError(
					`Thinking level can be recorded only at a safe assignment boundary: ${record.state}`,
					"model_route_boundary",
				);
			}
			record.effectiveThinkingLevel = thinkingLevel;
			record.updatedAt = this.#now();
			return snapshotRecord(record);
		});
	}

	queueModelReconfiguration(
		id: SubAgentId,
		request: {
			afterAssignmentId: string;
			route: ModelRoute;
			requestedThinkingLevel?: ThinkingLevel;
		},
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		const route = normalizeModelRoute(request.route);
		const afterAssignmentId = requireBoundedText(
			request.afterAssignmentId,
			"afterAssignmentId",
			SUB_AGENT_BOUNDS.agentIdChars + 40,
		);
		const requestedThinkingLevel =
			request.requestedThinkingLevel === undefined
				? undefined
				: requireChoice<ThinkingLevel>(
						request.requestedThinkingLevel,
						THINKING_LEVELS,
						"requestedThinkingLevel",
					);
		return this.#enqueue(id, (record) => {
			if (
				record.state !== "running" ||
				!record.currentAssignment ||
				record.currentAssignment.id !== afterAssignmentId
			) {
				throw new SubAgentManagerError(
					"A model reconfiguration can be queued only for the exact running assignment",
					"model_route_boundary",
				);
			}
			record.pendingModelReconfiguration = {
				afterAssignmentId,
				requestedAt: this.#now(),
				route,
				requestedThinkingLevel,
			};
			this.#appendEvent(
				record,
				"model",
				`Queued model ${route.selectedModel.provider}/${route.selectedModel.id} after assignment ${record.currentAssignment.sequence}`,
			);
			return snapshotRecord(record);
		});
	}

	cancelModelReconfiguration(
		id: SubAgentId,
		reason = "Queued model reconfiguration was not applied",
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		const message = boundText(reason, SUB_AGENT_BOUNDS.errorChars) || "Queued model reconfiguration was not applied";
		return this.#enqueue(id, (record) => {
			if (!record.pendingModelReconfiguration) return snapshotRecord(record);
			record.pendingModelReconfiguration = undefined;
			record.lastError = message;
			this.#appendEvent(record, "model", message);
			return snapshotRecord(record);
		});
	}

	interruptAssignmentForReconfiguration(
		id: SubAgentId,
		reason = "Assignment aborted for model reconfiguration",
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		const message = boundText(reason, SUB_AGENT_BOUNDS.eventSummaryChars) || "Assignment aborted for model reconfiguration";
		return this.#enqueue(id, (record) => {
			if (record.state === "stopping" || record.state === "removed") return snapshotRecord(record);
			if (record.state === "idle") return snapshotRecord(record);
			if (record.state !== "running" || !record.currentAssignment) {
				throw new SubAgentManagerError(
					"The child assignment is not running at the intentional abort boundary",
					"model_route_boundary",
				);
			}
			this.#transition(record, "idle");
			record.runtime = createRuntimeActivity("settled");
			record.currentAssignment.state = "aborted";
			record.currentAssignment.endedAt = this.#now();
			record.currentAssignment.result = undefined;
			record.currentAssignment.error = undefined;
			this.#appendEvent(record, "assignment", message, undefined, true);
			return snapshotRecord(record);
		});
	}

	recordRuntimeEvent(id: SubAgentId, summary: string): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		const bounded = requireBoundedText(summary, "runtime event", SUB_AGENT_BOUNDS.eventSummaryChars);
		return this.#enqueue(id, (record) => {
			if (record.state === "stopping" || record.state === "removed") return snapshotRecord(record);
			this.#appendEvent(record, "runtime", bounded);
			return snapshotRecord(record);
		});
	}

	registerRuntimeCleanup(id: SubAgentId, hooks: RuntimeCleanupHooks): void {
		this.#assertOpen();
		const record = this.#requireMutableRecord(id);
		if (record.resources.cleanup) {
			throw new SubAgentManagerError("Runtime cleanup hooks are already registered", "duplicate_runtime");
		}
		record.resources.cleanup = hooks;
	}

	trackSubscription(id: SubAgentId, unsubscribe: () => void): () => void {
		this.#assertOpen();
		const record = this.#requireMutableRecord(id);
		record.resources.unsubscribers.add(unsubscribe);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			record.resources.unsubscribers.delete(unsubscribe);
			unsubscribe();
		};
	}

	trackTimer(id: SubAgentId, timer: ReturnType<typeof setTimeout>): () => void {
		this.#assertOpen();
		const record = this.#requireMutableRecord(id);
		record.resources.timers.add(timer);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			record.resources.timers.delete(timer);
			clearTimeout(timer);
		};
	}

	trackAbortController(id: SubAgentId, controller: AbortController): () => void {
		this.#assertOpen();
		const record = this.#requireMutableRecord(id);
		record.resources.abortControllers.add(controller);
		return () => record.resources.abortControllers.delete(controller);
	}

	trackBackground(id: SubAgentId, promise: Promise<unknown>): Promise<void> {
		this.#assertOpen();
		const record = this.#requireMutableRecord(id);
		let handled: Promise<void>;
		handled = Promise.resolve(promise)
			.then(
				() => undefined,
				async (error) => {
					try {
						let becameFailed = false;
						await this.#enqueue(id, (current) => {
							if (current.state === "stopping" || current.state === "removed" || this.#closed) return;
							const message = safeErrorMessage(error);
							current.lastError = message;
							becameFailed = canTransitionAgentState(current.state, "failed");
							if (becameFailed) this.#transition(current, "failed");
							if (current.currentAssignment?.state === "running") {
								current.currentAssignment.state = "failed";
								current.currentAssignment.error = message;
								current.currentAssignment.endedAt = this.#now();
							}
							this.#appendEvent(
								current,
								"runtime",
								`Background failure: ${message}`,
								becameFailed ? "failed" : undefined,
								becameFailed,
							);
						});
						if (!becameFailed || this.#closed) return;

						const cleanup = record.resources.cleanup;
						const settled = cleanup
							? cleanup.waitForIdle
								? await fulfillWithTimeout(
									(async () => {
										try {
											await cleanup.abort?.();
										} catch {
											// A fulfilled idle wait below remains authoritative.
										}
										await cleanup.waitForIdle?.();
									})(),
									this.#cleanupTimeoutMs,
								)
								: false
							: true;
						if (!settled || this.#closed) return;
						await this.#enqueue(id, (current) => {
							if (current.state !== "failed") return;
							const released = this.#workspaceLeases.releaseChildLeases(current.id);
							current.leases = current.leaseSnapshot();
							if (released.length > 0) {
								this.#appendEvent(
									current,
									"lease",
									"Released workspace ownership after settled failure cleanup",
									undefined,
									true,
								);
							}
						});
					} catch {
						// The promise is observed even if its generation is already gone.
					}
				},
			)
			.catch(() => undefined)
			.finally(() => {
				record.resources.background.delete(handled);
			});
		record.resources.background.add(handled);
		return handled;
	}

	async removeAgent(id: SubAgentId, reason = "removed"): Promise<ManagedSubAgentSnapshot> {
		const boundedReason = boundText(reason, SUB_AGENT_BOUNDS.errorChars) || "removed";
		const cleanupHolder = await this.#enqueue(id, (record) => {
			if (record.state !== "removed" && record.state !== "stopping") {
				this.#transition(record, "stopping");
				record.removalReason = boundedReason;
			}
			record.pendingModelReconfiguration = undefined;
			record.resources.cleanupPromise ??= this.#cleanupRecord(record);
			// Wrap the promise so the per-agent queue does not await cleanup while
			// background rejection handlers still need that same queue to settle.
			return { promise: record.resources.cleanupPromise };
		});
		const cleanupErrors = await cleanupHolder.promise;
		return this.#enqueue(id, (record) => {
			if (record.state !== "removed") {
				this.#transition(record, "removed");
				record.runtime = createRuntimeActivity("settled");
				record.removedAt = this.#now();
				record.currentAssignment = record.currentAssignment
					? {
							...record.currentAssignment,
							state:
								record.currentAssignment.state === "running" || record.currentAssignment.state === "blocked"
									? "aborted"
									: record.currentAssignment.state,
							endedAt: record.currentAssignment.endedAt ?? this.#now(),
						}
					: undefined;
				if (cleanupErrors.length > 0) {
					record.lastError = boundText(cleanupErrors.join("; "), SUB_AGENT_BOUNDS.errorChars);
				}
				this.#appendEvent(
					record,
					"cleanup",
					`Removed: ${boundedReason}`,
					undefined,
					true,
				);
			}
			return snapshotRecord(record);
		});
	}

	disposeAll(reason = "manager disposed"): Promise<void> {
		if (this.#disposePromise) return this.#disposePromise;
		this.#closed = true;
		this.#parentContext = undefined;
		this.#changeListeners.clear();
		this.#eventListeners.clear();
		const ids = [...this.#records.keys()];
		this.#disposePromise = Promise.allSettled(ids.map((id) => this.removeAgent(id, reason)))
			.then(() => {
				this.#workspaceLeases.close();
				return Promise.allSettled([this.modelRuntime.dispose()]);
			})
			.then(() => undefined);
		return this.#disposePromise;
	}

	#assertOpen(): void {
		if (this.#closed) throw new ManagerClosedError();
	}

	#requireRecord(id: SubAgentId): ManagedRecord {
		const record = this.#records.get(id);
		if (record) return record;
		if (this.#restoredHistory.has(id)) throw new HistoricalAgentIdError(id);
		if (id.startsWith(AGENT_ID_PREFIX) && !id.startsWith(this.#agentPrefix)) throw new StaleAgentIdError(id);
		throw new UnknownAgentIdError(id);
	}

	#requireMutableRecord(id: SubAgentId): ManagedRecord {
		const record = this.#requireRecord(id);
		if (record.state === "stopping" || record.state === "removed") {
			throw new SubAgentManagerError("Sub-agent cleanup has started", "agent_stopping");
		}
		return record;
	}

	#enqueue<T>(id: SubAgentId, operation: (record: ManagedRecord) => T | Promise<T>): Promise<T> {
		this.#requireRecord(id);
		const previous = this.#operationTails.get(id) ?? Promise.resolve();
		const run = previous.then(() => operation(this.#requireRecord(id)));
		const tail = run.then(
			() => undefined,
			() => undefined,
		);
		this.#operationTails.set(id, tail);
		tail.then(() => {
			if (this.#operationTails.get(id) === tail) this.#operationTails.delete(id);
		});
		return run;
	}

	#transition(record: ManagedRecord, next: AgentLifecycleState): void {
		if (record.state === next) return;
		if (!canTransitionAgentState(record.state, next)) {
			throw new InvalidAgentTransitionError(record.state, next);
		}
		const previous = record.state;
		record.state = next;
		record.updatedAt = this.#now();
		this.#appendEvent(record, "state", `${previous} -> ${next}`);
	}

	#appendEvent(
		record: ManagedRecord,
		kind: BoundedAgentEvent["kind"],
		summary: string,
		notificationState?: NotificationState,
		historicalCheckpoint = false,
	): void {
		record.eventSequence += 1;
		const event: BoundedAgentEvent = {
			sequence: record.eventSequence,
			kind,
			state: record.state,
			summary: boundText(summary, SUB_AGENT_BOUNDS.eventSummaryChars),
			timestamp: this.#now(),
		};
		if (record.events.length === SUB_AGENT_BOUNDS.eventTimeline) {
			record.events.shift();
			record.omittedEventCount += 1;
		}
		record.events.push(event);
		record.updatedAt = event.timestamp;
		this.#publishChange(record);
		if (this.#eventListeners.size === 0) return;

		const notificationSummary =
			notificationState === "idle"
				? record.currentAssignment?.result?.summary
				: notificationState === "blocked"
					? record.latestReport?.summary ?? event.summary.replace(/^blocked:\s*/, "")
					: notificationState === "failed"
						? record.lastError
						: undefined;
		const observed: SubAgentManagerEvent = Object.freeze({
			generation: this.generation,
			id: record.id,
			name: record.spec.name,
			state: record.state,
			assignmentId: record.currentAssignment?.id,
			notifyOn: Object.freeze([...(record.spec.notifyOn ?? [])]),
			notificationState,
			notificationSummary,
			historicalCheckpoint: historicalCheckpoint ? true : undefined,
			event: Object.freeze({ ...event }),
		});
		for (const listener of [...this.#eventListeners]) {
			try {
				listener(observed);
			} catch {
				// Observability must never alter authoritative child state.
			}
		}
	}

	#publishChange(record: ManagedRecord): void {
		if (this.#changeListeners.size === 0) return;
		const change: SubAgentManagerChange = Object.freeze({
			generation: this.generation,
			id: record.id,
			state: record.state,
			updatedAt: record.updatedAt,
		});
		for (const listener of [...this.#changeListeners]) {
			try {
				listener(change);
			} catch {
				// TUI observability must never alter authoritative child state.
			}
		}
	}

	#boundedResult(
		result: { summary: string; details?: string; files?: string[] },
		completedAt: number,
	): BoundedAgentResult {
		return {
			summary: requireBoundedText(result.summary, "result.summary", SUB_AGENT_BOUNDS.resultSummaryChars),
			details: optionalBoundedText(result.details, "result.details", SUB_AGENT_BOUNDS.resultDetailsChars),
			files: boundedUniqueStrings(result.files, "result.files", SUB_AGENT_BOUNDS.reportFiles, 4_096) ?? [],
			completedAt,
		};
	}

	async #cleanupRecord(record: ManagedRecord): Promise<string[]> {
		const errors: string[] = [];
		const capture = async (label: string, operation: (() => void | Promise<void>) | undefined) => {
			if (!operation) return;
			try {
				await operation();
			} catch (error) {
				errors.push(`${label}: ${safeErrorMessage(error)}`);
			}
		};

		for (const timer of record.resources.timers) clearTimeout(timer);
		record.resources.timers.clear();
		for (const controller of record.resources.abortControllers) controller.abort();
		record.resources.abortControllers.clear();
		for (const unsubscribe of record.resources.unsubscribers) await capture("unsubscribe", unsubscribe);
		record.resources.unsubscribers.clear();
		record.runtime = createRuntimeActivity("settled");

		await capture("abort", record.resources.cleanup?.abort);
		const settling: Promise<unknown>[] = [...record.resources.background];
		const idleSettlementIndex = record.resources.cleanup?.waitForIdle
			? settling.push(Promise.resolve().then(() => record.resources.cleanup?.waitForIdle?.())) - 1
			: undefined;
		const settlement = await settleWithTimeout(settling, this.#cleanupTimeoutMs);
		if (!settlement) {
			errors.push(`settlement timed out after ${this.#cleanupTimeoutMs}ms`);
		} else if (settlement.some((result) => result.status === "rejected")) {
			errors.push("settlement did not reach a fulfilled idle boundary");
		}
		const ownershipSettled = settlement !== undefined && (
			idleSettlementIndex !== undefined
				? settlement[idleSettlementIndex]?.status === "fulfilled"
				: settlement.every((result) => result.status === "fulfilled")
		);
		await capture("dispose", record.resources.cleanup?.dispose);
		if (ownershipSettled) {
			await capture("release leases", () => {
				this.#workspaceLeases.releaseChildLeases(record.id);
				record.leases = record.leaseSnapshot();
			});
		} else if (record.leaseSnapshot().length > 0) {
			errors.push("retained workspace ownership because idle settlement was not proven");
			record.leases = record.leaseSnapshot();
		}
		return errors;
	}
}
