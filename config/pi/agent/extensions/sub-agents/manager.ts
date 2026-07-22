import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { ChildModelRuntimeAdapter } from "./model-runtime.ts";
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
	SessionGeneration,
	SubAgentId,
	SubAgentManagerSummary,
	ThinkingLevel,
	UsageCounters,
	UsageDelta,
	WorkspaceLeaseRecord,
	WorkspaceMode,
} from "./types.ts";
import { SUB_AGENT_BOUNDS } from "./types.ts";

const GENERATION_PREFIX = "sag1-";
const AGENT_ID_PREFIX = "sa1-";
const DEFAULT_CLEANUP_TIMEOUT_MS = 2_000;

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
				usage: cloneAssignmentUsage(assignment.usage),
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
		lastError: record.lastError,
		events: record.events.map((event) => ({ ...event })),
		omittedEventCount: record.omittedEventCount,
		runtime: cloneRuntimeActivity(record.runtime),
		usage: cloneUsageLedger(record.usage),
		leases: record.leases.map((lease) => ({ ...lease })),
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

async function settleWithTimeout(promises: readonly Promise<unknown>[], timeoutMs: number): Promise<boolean> {
	if (promises.length === 0) return true;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			Promise.allSettled(promises).then(() => true),
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
	#operationTails = new Map<SubAgentId, Promise<void>>();
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
		return snapshotRecord(this.#requireRecord(id));
	}

	listAgents(options: { includeRemoved?: boolean } = {}): ManagedSubAgentSnapshot[] {
		const includeRemoved = options.includeRemoved ?? true;
		return [...this.#records.values()]
			.filter((record) => includeRemoved || record.state !== "removed")
			.map(snapshotRecord);
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
		return {
			generation: this.generation,
			closed: this.#closed,
			total: this.#records.size,
			active: this.#records.size - counts.removed,
			historical: counts.removed,
			counts,
		};
	}

	startAssignment(id: SubAgentId, objective?: string): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (record.state !== "creating" && record.state !== "idle") {
				throw new InvalidAgentTransitionError(record.state, "running");
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
			if (record.state !== "blocked" || !record.currentAssignment) {
				throw new InvalidAgentTransitionError(record.state, "running");
			}
			this.#transition(record, "running");
			record.runtime = createRuntimeActivity("streaming");
			record.currentAssignment.state = "running";
			record.currentAssignment.blocker = undefined;
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
			const result = this.#boundedResult(outcome, now);
			this.#transition(record, outcome.state);
			record.runtime = createRuntimeActivity("settled");
			record.currentAssignment.state = outcome.state;
			if (outcome.state === "blocked") {
				record.currentAssignment.blocker = boundText(outcome.needs ?? outcome.summary, SUB_AGENT_BOUNDS.reportNeedsChars);
			} else {
				record.currentAssignment.endedAt = now;
				record.currentAssignment.result = result;
				record.latestResult = result;
			}
			this.#appendEvent(record, "assignment", `${outcome.state}: ${outcome.summary}`);
			return snapshotRecord(record);
		});
	}

	failAgent(id: SubAgentId, error: unknown): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (record.state === "failed") return snapshotRecord(record);
			if (!canTransitionAgentState(record.state, "failed")) {
				throw new InvalidAgentTransitionError(record.state, "failed");
			}
			const message = safeErrorMessage(error);
			this.#transition(record, "failed");
			record.runtime = createRuntimeActivity("settled");
			record.lastError = message;
			if (record.currentAssignment?.state === "running" || record.currentAssignment?.state === "blocked") {
				record.currentAssignment.state = "failed";
				record.currentAssignment.error = message;
				record.currentAssignment.endedAt = this.#now();
			}
			this.#appendEvent(record, "runtime", `Failed: ${message}`);
			return snapshotRecord(record);
		});
	}

	recordReport(
		id: SubAgentId,
		report: Omit<BoundedAgentReport, "timestamp" | "files"> & { files?: string[]; timestamp?: number },
	): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		return this.#enqueue(id, (record) => {
			if (record.state !== "running" && record.state !== "blocked") {
				throw new SubAgentManagerError("A sub-agent can report only during an active assignment", "agent_not_active");
			}
			const bounded: BoundedAgentReport = {
				state: report.state,
				summary: requireBoundedText(report.summary, "report.summary", SUB_AGENT_BOUNDS.reportSummaryChars),
				details: optionalBoundedText(report.details, "report.details", SUB_AGENT_BOUNDS.reportDetailsChars),
				files:
					boundedUniqueStrings(report.files, "report.files", SUB_AGENT_BOUNDS.reportFiles, 4_096) ?? [],
				needs: optionalBoundedText(report.needs, "report.needs", SUB_AGENT_BOUNDS.reportNeedsChars),
				timestamp: report.timestamp ?? this.#now(),
			};
			record.latestReport = bounded;
			this.#appendEvent(record, "report", `${bounded.state}: ${bounded.summary}`);
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
			record.runtime = normalized;
			record.updatedAt = this.#now();
			return snapshotRecord(record);
		});
	}

	recordModelRoute(id: SubAgentId, route: ModelRoute): Promise<ManagedSubAgentSnapshot> {
		this.#assertOpen();
		const normalized = normalizeModelRoute(route);
		return this.#enqueue(id, (record) => {
			if (record.state !== "creating" && record.state !== "idle") {
				throw new SubAgentManagerError(
					`A model route can be changed only at a safe assignment boundary: ${record.state}`,
					"model_route_boundary",
				);
			}
			record.modelRoute = normalized;
			this.#appendEvent(
				record,
				"model",
				`Selected model ${normalized.selectedModel.provider}/${normalized.selectedModel.id}`,
			);
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
						await this.#enqueue(id, (current) => {
							if (current.state === "stopping" || current.state === "removed" || this.#closed) return;
							const message = safeErrorMessage(error);
							current.lastError = message;
							if (canTransitionAgentState(current.state, "failed")) this.#transition(current, "failed");
							if (current.currentAssignment?.state === "running") {
								current.currentAssignment.state = "failed";
								current.currentAssignment.error = message;
								current.currentAssignment.endedAt = this.#now();
							}
							this.#appendEvent(current, "runtime", `Background failure: ${message}`);
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
				this.#appendEvent(record, "cleanup", `Removed: ${boundedReason}`);
			}
			return snapshotRecord(record);
		});
	}

	disposeAll(reason = "manager disposed"): Promise<void> {
		if (this.#disposePromise) return this.#disposePromise;
		this.#closed = true;
		this.#parentContext = undefined;
		const ids = [...this.#records.keys()];
		this.#disposePromise = Promise.allSettled(ids.map((id) => this.removeAgent(id, reason)))
			.then(() => Promise.allSettled([this.modelRuntime.dispose()]))
			.then(() => undefined);
		return this.#disposePromise;
	}

	#assertOpen(): void {
		if (this.#closed) throw new ManagerClosedError();
	}

	#requireRecord(id: SubAgentId): ManagedRecord {
		const record = this.#records.get(id);
		if (record) return record;
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

	#appendEvent(record: ManagedRecord, kind: BoundedAgentEvent["kind"], summary: string): void {
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
		record.leases = [];

		await capture("abort", record.resources.cleanup?.abort);
		const settling: Promise<unknown>[] = [...record.resources.background];
		if (record.resources.cleanup?.waitForIdle) {
			settling.push(Promise.resolve().then(() => record.resources.cleanup?.waitForIdle?.()));
		}
		if (!(await settleWithTimeout(settling, this.#cleanupTimeoutMs))) {
			errors.push(`settlement timed out after ${this.#cleanupTimeoutMs}ms`);
		}
		await capture("dispose", record.resources.cleanup?.dispose);
		return errors;
	}
}
