export const SUB_AGENT_BOUNDS = Object.freeze({
	agentIdChars: 200,
	systemPromptBytes: 128 * 1024,
	nameChars: 120,
	roleChars: 1_000,
	objectiveChars: 12_000,
	instructionsChars: 12_000,
	contextChars: 24_000,
	resultInstructionsChars: 4_000,
	contextFiles: 64,
	contextPathChars: 4_096,
	contextFileBytes: 256 * 1024,
	contextTotalBytes: 1024 * 1024,
	tagChars: 80,
	tags: 20,
	tools: 7,
	writeScopePaths: 100,
	reportSummaryChars: 2_000,
	reportDetailsChars: 8_000,
	reportNeedsChars: 2_000,
	reportFiles: 100,
	eventSummaryChars: 1_000,
	eventTimeline: 100,
	notificationInboxEvents: 20,
	notificationIdBytes: 256,
	notificationAssignmentIdBytes: 320,
	notificationNameBytes: 384,
	notificationSummaryChars: 400,
	notificationSummaryBytes: 768,
	statusWidgetRows: 5,
	statusWidgetTools: 3,
	statusWidgetBlockerChars: 240,
	dashboardAgents: 100,
	dashboardPageRows: 12,
	dashboardEvents: 12,
	dashboardLeases: 12,
	dashboardFieldChars: 600,
	streamingPreviewChars: 2_000,
	activeToolCalls: 32,
	toolCallIdChars: 200,
	toolNameChars: 128,
	errorChars: 2_000,
	resultSummaryChars: 8_000,
	resultDetailsChars: 16_000,
	modelRouteReasonChars: 1_000,
	modelRouteSteps: 4,
	spawnBatchAgents: 64,
	controlTargets: 100,
	waitTimeoutSeconds: 300,
	gracefulStopSeconds: 60,
	historicalAgents: 500,
	persistenceEntryBytes: 48 * 1024,
	persistenceObjectiveChars: 2_000,
	persistenceStatusSummaryChars: 2_000,
	persistenceResultSummaryChars: 4_000,
	persistenceResultDetailsChars: 8_000,
} as const);

export type SessionGeneration = string;
export type SubAgentId = string;
export type AssignmentId = string;

export type AgentLifecycleState =
	| "creating"
	| "running"
	| "idle"
	| "blocked"
	| "failed"
	| "stopping"
	| "removed";

export type AssignmentState = "running" | "idle" | "blocked" | "failed" | "aborted";
export type ComplexityTier = "simple" | "moderate" | "complex";
export type ModelPolicy = "auto" | "inherit" | "explicit";
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ChildToolName = "read" | "grep" | "find" | "ls" | "edit" | "write" | "bash";
export type NotificationState = "idle" | "blocked" | "failed";
export type WorkspaceMode = "shared" | "worktree";
export type BashPolicy = "disabled" | "workspace-exclusive";

export interface ExplicitModelRef {
	provider: string;
	id: string;
}

export type ModelRouteStepSource = "tier" | "inherit" | "explicit";
export type ModelRouteStepOutcome = "unavailable" | "selected";

export interface ModelRouteStep {
	readonly source: ModelRouteStepSource;
	readonly modelId: string;
	readonly complexity?: ComplexityTier;
	readonly outcome: ModelRouteStepOutcome;
}

/** Bounded, nonsecret model-selection metadata for one safe assignment boundary. */
export interface ModelRoute {
	readonly requestedPolicy: ModelPolicy;
	readonly requestedComplexity: ComplexityTier;
	readonly selectedModel: ExplicitModelRef;
	readonly selectedTier?: ComplexityTier;
	readonly fallbackUsed: boolean;
	readonly fallbackPath: readonly ModelRouteStep[];
	readonly reason: string;
}

/** Bounded model change waiting for the end of one exact running assignment. */
export interface PendingModelReconfiguration {
	afterAssignmentId: AssignmentId;
	requestedAt: number;
	route: ModelRoute;
	requestedThinkingLevel?: ThinkingLevel;
}

export interface DynamicWorkspaceSpec {
	mode: WorkspaceMode;
	cwd?: string;
	writeScope?: string[];
	bashPolicy?: BashPolicy;
}

export interface DynamicAgentSpec {
	name: string;
	role: string;
	objective: string;
	instructions?: string;
	context?: string;
	modelPolicy?: ModelPolicy;
	model?: ExplicitModelRef;
	complexity?: ComplexityTier;
	thinkingLevel?: ThinkingLevel;
	tools?: ChildToolName[];
	workspace?: DynamicWorkspaceSpec;
	resultInstructions?: string;
	tags?: string[];
	notifyOn?: NotificationState[];
}

export interface AssignmentRecord {
	id: AssignmentId;
	sequence: number;
	objective: string;
	state: AssignmentState;
	startedAt: number;
	endedAt?: number;
	result?: BoundedAgentResult;
	/** Bounded canonical workspace-relative files changed by guarded child mutators. */
	modifiedFiles?: string[];
	blocker?: string;
	error?: string;
	modelRoute?: ModelRoute;
	usage: AssignmentUsage;
}

export type AgentReportState = "progress" | "blocked" | "result";

/** Assignment-scoped child report before manager-owned timestamping and cloning. */
export interface AgentReportSubmission {
	state: AgentReportState;
	summary: string;
	details?: string;
	files?: string[];
	needs?: string;
}

export interface BoundedAgentReport {
	state: AgentReportState;
	summary: string;
	details?: string;
	files: string[];
	needs?: string;
	timestamp: number;
}

export interface BoundedAgentResult {
	summary: string;
	details?: string;
	files: string[];
	completedAt: number;
}

export type AgentEventKind =
	| "created"
	| "state"
	| "assignment"
	| "report"
	| "model"
	| "runtime"
	| "cleanup"
	| "lease";

export interface BoundedAgentEvent {
	sequence: number;
	kind: AgentEventKind;
	state: AgentLifecycleState;
	summary: string;
	timestamp: number;
}

/** One defensive, bounded manager event exposed to session-scoped observers. */
export interface SubAgentManagerEvent {
	readonly generation: SessionGeneration;
	readonly id: SubAgentId;
	readonly name: string;
	readonly state: AgentLifecycleState;
	readonly assignmentId?: AssignmentId;
	readonly notifyOn: readonly NotificationState[];
	readonly notificationState?: NotificationState;
	readonly notificationSummary?: string;
	/** True only after a complete terminal/history state is ready for durable reduction. */
	readonly historicalCheckpoint?: true;
	readonly event: Readonly<BoundedAgentEvent>;
}

export type SubAgentManagerEventListener = (event: SubAgentManagerEvent) => void;

/** A minimal manager mutation marker for TUI-only observability refreshes. */
export interface SubAgentManagerChange {
	readonly generation: SessionGeneration;
	readonly id: SubAgentId;
	readonly state: AgentLifecycleState;
	readonly updatedAt: number;
}

export type SubAgentManagerChangeListener = (change: SubAgentManagerChange) => void;

export type AgentRuntimePhase =
	| "initializing"
	| "streaming"
	| "tools"
	| "compacting"
	| "retrying"
	| "settled";

export interface ActiveToolCallSummary {
	toolCallId: string;
	toolName: string;
	startedAt: number;
	updatedAt: number;
}

/**
 * Bounded, in-memory observability for one live child. This is deliberately
 * absent from PersistedSubAgentHistoryV1 so streaming previews and tool-call
 * activity never become durable history.
 */
export interface AgentRuntimeActivity {
	phase: AgentRuntimePhase;
	streamingPreview?: string;
	activeToolCount: number;
	activeTools: ActiveToolCallSummary[];
	pendingMessageCount: number;
}

export interface UsageCounters {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: number;
}

export type UsageDelta = Partial<UsageCounters> & {
	turns?: number;
};

export interface AssignmentUsage {
	totals: UsageCounters;
	turns: number;
}

export interface UsageLedger {
	totals: UsageCounters;
	reported: UsageCounters;
	turns: number;
	assignments: number;
}

export interface WorkspaceIdentity {
	readonly mode: WorkspaceMode;
	readonly root: string;
	readonly key: string;
	readonly branch?: string;
}

export type WorkspaceLeaseKind = "file" | "workspace" | "parent-file" | "parent-workspace";

export interface WorkspaceLeaseRecord {
	kind: WorkspaceLeaseKind;
	/** Non-path workspace display label; canonical identity remains coordinator-private. */
	workspaceKey: string;
	ownerAgentId?: SubAgentId;
	/** Canonical workspace-root-relative display path; internal claim keys stay private. */
	path?: string;
	acquiredAt: number;
}

export interface RestoredSubAgentHistoryMetadata {
	/** Original session generation that owned the now-terminated child runtime. */
	sourceGeneration: SessionGeneration;
	/** Last durable state recorded before restoration converted the child to history. */
	checkpointState: PersistedSubAgentStateV1;
	statusSummary?: string;
	files: string[];
	omittedFileCount: number;
}

export interface ManagedSubAgentSnapshot {
	id: SubAgentId;
	generation: SessionGeneration;
	spec: Readonly<DynamicAgentSpec>;
	/** Present only for immutable active-branch history; no child runtime or lease survived. */
	restoredHistory?: RestoredSubAgentHistoryMetadata;
	state: AgentLifecycleState;
	createdAt: number;
	updatedAt: number;
	removedAt?: number;
	removalReason?: string;
	assignmentCount: number;
	currentAssignment?: AssignmentRecord;
	latestReport?: BoundedAgentReport;
	latestResult?: BoundedAgentResult;
	modelRoute?: ModelRoute;
	effectiveThinkingLevel?: ThinkingLevel;
	pendingModelReconfiguration?: PendingModelReconfiguration;
	lastError?: string;
	events: BoundedAgentEvent[];
	omittedEventCount: number;
	runtime: AgentRuntimeActivity;
	usage: UsageLedger;
	leases: WorkspaceLeaseRecord[];
}

export type AgentStateCounts = Record<AgentLifecycleState, number>;

export interface SubAgentManagerSummary {
	generation: SessionGeneration;
	closed: boolean;
	total: number;
	active: number;
	historical: number;
	counts: AgentStateCounts;
}

/** One bounded live-child row prepared without cloning child conversations or timelines. */
export interface SubAgentManagerOverviewRow {
	id: SubAgentId;
	name: string;
	state: AgentLifecycleState;
	updatedAt: number;
	phase: AgentRuntimePhase;
	activeToolCount: number;
	activeTools: string[];
	omittedActiveToolCount: number;
	pendingMessageCount: number;
	blocker?: string;
	resultReady: boolean;
}

/** TUI-only aggregate view with a bounded prioritized live-child row set. */
export interface SubAgentManagerOverview {
	generation: SessionGeneration;
	closed: boolean;
	active: number;
	historical: number;
	counts: AgentStateCounts;
	usage: UsageCounters;
	usageClamped: boolean;
	rows: SubAgentManagerOverviewRow[];
	omittedRowCount: number;
}

/** One lightweight row for the bounded human-operator dashboard. */
export interface SubAgentDashboardRow {
	id: SubAgentId;
	name: string;
	state: AgentLifecycleState;
	updatedAt: number;
	assignmentCount: number;
	phase: AgentRuntimePhase;
	pendingMessageCount: number;
	resultReady: boolean;
	tags: string[];
}

/** Bounded list snapshot; exact detail is fetched only for the selected row. */
export interface SubAgentDashboardSnapshot {
	generation: SessionGeneration;
	closed: boolean;
	active: number;
	historical: number;
	counts: AgentStateCounts;
	usage: UsageCounters;
	usageClamped: boolean;
	includeRemoved: boolean;
	rows: SubAgentDashboardRow[];
	omittedRowCount: number;
}

export type PersistedSubAgentStateV1 = "idle" | "blocked" | "failed" | "removed";

export interface PersistedSubAgentResultV1 {
	summary: string;
	details?: string;
	completedAt: number;
}

/** Usage checkpoint with an explicit delta that remains unreported to the parent session. */
export interface PersistedUsageLedgerV1 extends UsageLedger {
	unreported: UsageCounters;
}

/**
 * One strict `sub-agents-state-v1` custom-entry payload. Each entry checkpoints
 * one child so active-branch replay can select the latest record per opaque ID.
 */
export interface PersistedSubAgentHistoryV1 {
	version: 1;
	generation: SessionGeneration;
	id: SubAgentId;
	name: string;
	role: string;
	objectiveSummary: string;
	state: PersistedSubAgentStateV1;
	statusSummary?: string;
	result?: PersistedSubAgentResultV1;
	modelRoute?: ModelRoute;
	usage: PersistedUsageLedgerV1;
	files: string[];
	omittedFileCount: number;
	createdAt: number;
	updatedAt: number;
	removedAt?: number;
	removalReason?: string;
}
