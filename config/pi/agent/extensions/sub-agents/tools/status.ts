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
import type { WorktreeCatalogChangeCollection, WorktreeOwnedChangeCollection } from "../workspace/worktrees.ts";
import type {
	AgentLifecycleState,
	BoundedAgentEvent,
	ManagedSubAgentSnapshot,
	SubAgentId,
	SubAgentWorkspaceDisposition,
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
const WORKTREE_WORKSPACE_ID = /^saw1-[A-Za-z0-9_-]+$/u;
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
	> & {
		readonly collectWorkspaceChanges?: (id: SubAgentId) => Promise<Readonly<WorktreeOwnedChangeCollection> | undefined>;
	};
	readonly collectWorktreeCatalogChanges?: (request: Readonly<{
		workspaceId: string;
		expectedRevision?: number;
		signal?: AbortSignal;
	}>) => Promise<Readonly<WorktreeCatalogChangeCollection>>;
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

export interface StatusWorktreeChangesView {
	ok: boolean;
	code?: string;
	message?: string;
	registered?: boolean;
	exactOwnership?: boolean;
	clean?: boolean;
	conflicted?: boolean;
	incomplete?: boolean;
	changedFileCount?: number;
	changedFiles?: Array<{
		path: string;
		status: string;
		kind: string;
		oldPath?: string;
	}>;
	omittedChangedFileCount?: number;
	diffStat?: {
		filesChanged: number;
		insertions: number;
		deletions: number;
		binaryFiles: number;
		truncated: boolean;
		files: Array<{
			path: string;
			insertions: number | null;
			deletions: number | null;
			binary: boolean;
		}>;
		omittedFileCount: number;
	};
	commitRange?: {
		baseCommit: string;
		currentCommit: string | null;
		aheadCount: number | null;
	};
	patchPreview?: {
		lineCount: number;
		lines: string[];
		truncated: boolean;
		omittedLineCount: number;
		omittedByteCount: number;
	};
}

export interface StatusWorktreeCatalogFailureOutcome {
	ok: false;
	workspaceId: string;
	expectedRevision?: number;
	code: string;
	message: string;
}

export interface StatusWorktreeCatalogSuccessOutcome {
	ok: true;
	workspaceId: string;
	expectedRevision?: number;
	revision: number;
	workspace: {
		mode: "worktree";
		workspaceId: string;
		branchRef: string;
		baseCommit: string;
		disposition: SubAgentWorkspaceDisposition;
	};
	changes: StatusWorktreeChangesView;
	truncated?: true;
}

export type StatusWorktreeCatalogOutcome = StatusWorktreeCatalogSuccessOutcome | StatusWorktreeCatalogFailureOutcome;

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
	workspace?:
		| { mode: "shared" }
		| {
				mode: "worktree";
				workspaceId: string;
				branchRef: string;
				baseCommit: string;
				disposition: SubAgentWorkspaceDisposition;
			};
	worktreeChanges?: StatusWorktreeChangesView;
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
	includeWorktreeChanges: boolean;
	requested: number;
	returned: number;
	succeeded: number;
	failed: number;
	omitted: number;
	truncatedAgentDetails: number;
	timelineEventsOmittedByTransport: number;
	worktreeCollectionsFailed: number;
	worktreeCatalogRequested: number;
	worktreeCatalogFailed: number;
	worktreeCatalogTruncated: number;
	worktreeCatalog?: StatusWorktreeCatalogOutcome[];
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

interface CatalogDraftSuccess {
	outcomeIndex: number;
	full: StatusWorktreeCatalogSuccessOutcome;
	minimal: StatusWorktreeCatalogSuccessOutcome;
}

function oneLine(value: unknown): string {
	return String(value ?? "")
		.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
		.replace(/\s+/gu, " ")
		.trim();
}

function boundUtf8Line(value: unknown, maxBytes: number): string {
	const normalized = oneLine(value);
	const cap = Math.max(0, Math.floor(maxBytes));
	if (Buffer.byteLength(normalized, "utf8") <= cap) return normalized;

	const ellipsis = "…";
	const ellipsisBytes = Buffer.byteLength(ellipsis, "utf8");
	if (cap < ellipsisBytes) return ".".repeat(cap);

	let result = "";
	let bytes = 0;
	for (const character of normalized) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (bytes + characterBytes + ellipsisBytes > cap) break;
		result += character;
		bytes += characterBytes;
	}
	return result + ellipsis;
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

function workspaceView(
	workspace: ManagedSubAgentSnapshot["workspace"],
	truncatedFields: string[],
): StatusAgentView["workspace"] {
	if (!workspace) return undefined;
	if (workspace.mode === "shared") return { mode: "shared" };
	return {
		mode: "worktree",
		workspaceId: boundedField(workspace.workspaceId, 200, "workspace.workspaceId", truncatedFields),
		branchRef: boundedField(workspace.branchRef, 512, "workspace.branchRef", truncatedFields),
		baseCommit: boundedField(workspace.baseCommit, 64, "workspace.baseCommit", truncatedFields),
		disposition: workspace.disposition,
	};
}

function worktreeChangesView(
	collection: Readonly<WorktreeOwnedChangeCollection> | undefined,
	truncatedFields: string[],
	options: Readonly<{ omitPatchLines?: boolean; minimal?: boolean }> = {},
): StatusWorktreeChangesView | undefined {
	if (!collection) return undefined;
	const changedFileLimit = options.minimal ? 0 : 20;
	const diffFileLimit = options.minimal ? 0 : 20;
	const patchLineLimit = options.minimal || options.omitPatchLines ? 0 : 80;
	const changedFiles = collection.collection.changedFiles.slice(0, changedFileLimit).map((file) => ({
		path: boundedField(file.path, 160, "worktreeChanges.changedFiles.path", truncatedFields),
		status: boundedField(file.status, 16, "worktreeChanges.changedFiles.status", truncatedFields),
		kind: boundedField(file.kind, 32, "worktreeChanges.changedFiles.kind", truncatedFields),
		oldPath: file.oldPath
			? boundedField(file.oldPath, 160, "worktreeChanges.changedFiles.oldPath", truncatedFields)
			: undefined,
	}));
	const diffFiles = collection.collection.diffStat.files.slice(0, diffFileLimit).map((file) => ({
		path: boundedField(file.path, 160, "worktreeChanges.diffStat.files.path", truncatedFields),
		insertions: file.insertions === null ? null : safeInteger(file.insertions),
		deletions: file.deletions === null ? null : safeInteger(file.deletions),
		binary: file.binary === true,
	}));
	const patchLines = collection.collection.patchPreview.lines.slice(0, patchLineLimit).map((line) =>
		boundedField(line, 260, "worktreeChanges.patchPreview.lines", truncatedFields),
	);
	return {
		ok: true,
		registered: collection.registered === true,
		exactOwnership: collection.exactOwnership === true,
		clean: collection.clean === true,
		conflicted: collection.conflicted === true,
		incomplete: collection.incomplete === true,
		changedFileCount: safeInteger(collection.collection.changedFileCount),
		changedFiles,
		omittedChangedFileCount:
			Math.max(0, safeInteger(collection.collection.changedFileCount) - changedFiles.length) +
			(collection.collection.changedFilesTruncated ? 1 : 0),
		diffStat: {
			filesChanged: safeInteger(collection.collection.diffStat.filesChanged),
			insertions: safeInteger(collection.collection.diffStat.insertions),
			deletions: safeInteger(collection.collection.diffStat.deletions),
			binaryFiles: safeInteger(collection.collection.diffStat.binaryFiles),
			truncated: collection.collection.diffStat.truncated === true,
			files: diffFiles,
			omittedFileCount: Math.max(0, safeInteger(collection.collection.diffStat.filesChanged) - diffFiles.length),
		},
		commitRange: {
			baseCommit: boundedField(collection.collection.commitRange.baseCommit, 64, "worktreeChanges.commitRange.baseCommit", truncatedFields),
			currentCommit: collection.collection.commitRange.currentCommit
				? boundedField(collection.collection.commitRange.currentCommit, 64, "worktreeChanges.commitRange.currentCommit", truncatedFields)
				: null,
			aheadCount: collection.collection.commitRange.aheadCount === null
				? null
				: safeInteger(collection.collection.commitRange.aheadCount),
		},
		patchPreview: {
			lineCount: safeInteger(collection.collection.patchPreview.lineCount),
			lines: patchLines,
			truncated: collection.collection.patchPreview.truncated === true,
			omittedLineCount: Math.max(0, collection.collection.patchPreview.lines.length - patchLines.length) + safeInteger(collection.collection.patchPreview.omittedLineCount),
			omittedByteCount: safeInteger(collection.collection.patchPreview.omittedByteCount),
		},
	};
}

function minimalWorktreeChangesView(collection: Readonly<WorktreeOwnedChangeCollection>): StatusWorktreeChangesView {
	return {
		ok: true,
		registered: collection.registered === true,
		exactOwnership: collection.exactOwnership === true,
		clean: collection.clean === true,
		conflicted: collection.conflicted === true,
		incomplete: collection.incomplete === true,
		changedFileCount: safeInteger(collection.collection.changedFileCount),
		omittedChangedFileCount:
			collection.collection.changedFiles.length +
			(collection.collection.changedFilesTruncated ? 1 : 0),
		patchPreview: {
			lineCount: safeInteger(collection.collection.patchPreview.lineCount),
			lines: [],
			truncated: collection.collection.patchPreview.truncated === true || collection.collection.patchPreview.lines.length > 0,
			omittedLineCount:
				collection.collection.patchPreview.lines.length +
				safeInteger(collection.collection.patchPreview.omittedLineCount),
			omittedByteCount: safeInteger(collection.collection.patchPreview.omittedByteCount),
		},
	};
}

function sanitizeWorkspaceId(value: unknown): string {
	const bounded = boundUtf8Line(value, SUB_AGENT_BOUNDS.agentIdChars);
	return bounded || "unknown-worktree";
}

function catalogFailure(
	workspaceId: unknown,
	expectedRevision: unknown,
	code: string,
	message: string,
): StatusWorktreeCatalogFailureOutcome {
	return {
		ok: false,
		workspaceId: sanitizeWorkspaceId(workspaceId),
		expectedRevision: typeof expectedRevision === "number" && Number.isSafeInteger(expectedRevision) && expectedRevision > 0
			? expectedRevision
			: undefined,
		code: boundUtf8Line(code, DISPLAY_CODE_BYTES) || "catalog_collection_failed",
		message: boundUtf8Line(message, DISPLAY_LINE_BYTES) || "Could not collect retained worktree changes",
	};
}

function buildCatalogOutcome(
	collection: Readonly<WorktreeCatalogChangeCollection>,
	expectedRevision: number | undefined,
): { full: StatusWorktreeCatalogSuccessOutcome; minimal: StatusWorktreeCatalogSuccessOutcome } {
	const truncatedFields: string[] = [];
	const workspaceId = boundedField(collection.summary.workspaceId, SUB_AGENT_BOUNDS.agentIdChars, "worktreeCatalog.workspaceId", truncatedFields);
	const branchRef = boundedField(collection.summary.branchRef, 512, "worktreeCatalog.branchRef", truncatedFields);
	const baseCommit = boundedField(collection.summary.baseCommit, 64, "worktreeCatalog.baseCommit", truncatedFields);
	const workspace = {
		mode: "worktree" as const,
		workspaceId,
		branchRef,
		baseCommit,
		disposition: collection.summary.disposition === "ready" ? "active" as const : collection.summary.disposition,
	};
	const fullChanges = worktreeChangesView(collection, truncatedFields) ?? { ok: false, code: "collection_failed", message: "Could not collect retained worktree changes" };
	const minimalChanges = minimalWorktreeChangesView(collection);
	const common = {
		ok: true as const,
		workspaceId,
		expectedRevision,
		revision: safeInteger(collection.revision),
		workspace,
	};
	return {
		full: Object.freeze({ ...common, changes: fullChanges, ...(truncatedFields.length > 0 ? { truncated: true as const } : {}) }),
		minimal: Object.freeze({ ...common, changes: minimalChanges, truncated: true as const }),
	};
}

function compactCatalogOutcome(outcome: StatusWorktreeCatalogSuccessOutcome): StatusWorktreeCatalogSuccessOutcome {
	return Object.freeze({
		ok: true,
		workspaceId: outcome.workspaceId,
		...(outcome.expectedRevision !== undefined ? { expectedRevision: outcome.expectedRevision } : {}),
		revision: outcome.revision,
		workspace: {
			mode: "worktree" as const,
			workspaceId: outcome.workspace.workspaceId,
			branchRef: "",
			baseCommit: "",
			disposition: outcome.workspace.disposition,
		},
		changes: {
			ok: true,
			changedFileCount: outcome.changes.changedFileCount,
			conflicted: outcome.changes.conflicted,
			incomplete: outcome.changes.incomplete,
		},
		truncated: true as const,
	});
}

function formatCatalogLine(outcome: StatusWorktreeCatalogOutcome): string {
	if (!outcome.ok) {
		return boundUtf8Line(
			`- [catalog error] ${outcome.workspaceId}: ${outcome.code}: ${outcome.message}`,
			DISPLAY_LINE_BYTES,
		);
	}
	const ahead = outcome.changes.commitRange?.aheadCount;
	const patchLines = outcome.changes.patchPreview?.lineCount;
	return boundUtf8Line(
		`- [worktree catalog] ${outcome.workspaceId} rev ${outcome.revision} ${outcome.workspace.disposition}: changes ${outcome.changes.changedFileCount ?? 0} files${ahead === null || ahead === undefined ? "" : ` · ahead ${ahead}`}${patchLines === undefined ? "" : ` · patch ${patchLines} lines`}${outcome.changes.conflicted ? " · conflicted" : ""}${outcome.changes.incomplete ? " · incomplete" : ""}${outcome.truncated ? " · detail truncated" : ""}`,
		DISPLAY_LINE_BYTES,
	);
}

function buildStatusView(
	snapshot: ManagedSubAgentSnapshot,
	now: number,
	detail: "compact" | "timeline",
	eventLimit: number,
	worktreeChanges?: StatusWorktreeChangesView,
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
		workspace: workspaceView(snapshot.workspace, truncatedFields),
		worktreeChanges,
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
	if (worktreeChanges) {
		if (!full.worktreeChanges) full.worktreeChanges = worktreeChanges;
		else if (full.truncatedFields) full.truncatedFields = [...new Set([...full.truncatedFields, ...truncatedFields])];
	}
	if (truncatedFields.length > 0) full.truncatedFields = [...new Set(truncatedFields)];
	return { full, minimal, timeline };
}

function jsonBytes(value: unknown): number {
	return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function fitDetails(
	base: Omit<
		SubAgentsStatusToolDetails,
		"outcomes" | "truncatedAgentDetails" | "timelineEventsOmittedByTransport" | "outputTruncated" | "worktreeCatalogTruncated"
	>,
	initial: StatusAgentOutcome[],
	drafts: DraftSuccess[],
	catalogInitial: StatusWorktreeCatalogOutcome[] = [],
	catalogDrafts: CatalogDraftSuccess[] = [],
): SubAgentsStatusToolDetails {
	const outcomes = [...initial];
	const worktreeCatalog = [...catalogInitial];
	const details: SubAgentsStatusToolDetails = {
		...base,
		truncatedAgentDetails: drafts.length,
		timelineEventsOmittedByTransport: drafts.reduce((sum, draft) => sum + draft.timeline.length, 0),
		worktreeCollectionsFailed: base.worktreeCollectionsFailed,
		worktreeCatalogTruncated: catalogDrafts.length,
		...(worktreeCatalog.length > 0 ? { worktreeCatalog } : {}),
		outputTruncated: drafts.length > 0 || catalogDrafts.length > 0,
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

	for (const draft of catalogDrafts) {
		const previous = worktreeCatalog[draft.outcomeIndex];
		worktreeCatalog[draft.outcomeIndex] = draft.full;
		if (jsonBytes(details) <= DETAILS_RICH_BUDGET_BYTES) {
			details.worktreeCatalogTruncated -= 1;
		} else {
			worktreeCatalog[draft.outcomeIndex] = previous;
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
		details.truncatedAgentDetails > 0 || details.timelineEventsOmittedByTransport > 0 || details.worktreeCatalogTruncated > 0;
	if (jsonBytes(details) > DETAILS_MAX_BYTES) {
		for (const draft of drafts) outcomes[draft.outcomeIndex] = draft.minimal;
		for (const draft of catalogDrafts) worktreeCatalog[draft.outcomeIndex] = draft.minimal;
		details.truncatedAgentDetails = drafts.length;
		details.timelineEventsOmittedByTransport = drafts.reduce(
			(sum, draft) => sum + draft.timeline.length,
			0,
		);
		details.worktreeCatalogTruncated = catalogDrafts.length;
		details.outputTruncated = drafts.length > 0 || catalogDrafts.length > 0;
	}
	if (jsonBytes(details) > DETAILS_MAX_BYTES) {
		for (const draft of catalogDrafts) worktreeCatalog[draft.outcomeIndex] = compactCatalogOutcome(draft.minimal);
		details.worktreeCatalogTruncated = catalogDrafts.length;
		details.outputTruncated = true;
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
	if (outcome.workspace?.mode === "worktree") {
		parts.push(`worktree ${outcome.workspace.workspaceId} ${outcome.workspace.disposition}`);
	}
	if (outcome.worktreeChanges) {
		if (outcome.worktreeChanges.ok) {
			const ahead = outcome.worktreeChanges.commitRange?.aheadCount;
			const patchLines = outcome.worktreeChanges.patchPreview?.lineCount;
			parts.push(`changes ${outcome.worktreeChanges.changedFileCount ?? 0} files${ahead === null || ahead === undefined ? "" : ` · ahead ${ahead}`}${patchLines === undefined ? "" : ` · patch ${patchLines} lines`}${outcome.worktreeChanges.conflicted ? " · conflicted" : ""}${outcome.worktreeChanges.incomplete ? " · incomplete" : ""}`);
		} else {
			parts.push(`worktree changes unavailable: ${outcome.worktreeChanges.code ?? "collection_failed"}`);
		}
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
		`sub_agents_status: ${details.succeeded} agents · ${details.failed} errors · ${details.omitted} omitted${details.includeWorktreeChanges ? ` · ${details.worktreeCollectionsFailed} worktree collection errors` : ""}${details.worktreeCatalogRequested ? ` · ${details.worktreeCatalogFailed} catalog errors` : ""} · generation ${details.generation}`,
		...details.outcomes.map(formatStatusLine),
		...(details.worktreeCatalog ?? []).map(formatCatalogLine),
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
	const includeWorktreeChanges = params.includeWorktreeChanges ?? false;
	const worktreeCatalogRequests = params.worktreeCatalogChanges ?? [];
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
	let worktreeCollectionsFailed = 0;
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
		let worktreeChanges: StatusWorktreeChangesView | undefined;
		if (
			includeWorktreeChanges &&
			selected.snapshot.workspace?.mode === "worktree" &&
			!selected.snapshot.restoredHistory
		) {
			if (typeof runtime.manager.collectWorkspaceChanges === "function") {
				try {
					worktreeChanges = worktreeChangesView(
						await runtime.manager.collectWorkspaceChanges(selected.id),
						[],
					);
					if (!worktreeChanges) {
						worktreeChanges = {
							ok: false,
							code: "collection_unavailable",
							message: "No exact owned worktree collection is available for this child",
						};
						worktreeCollectionsFailed += 1;
					}
				} catch {
					worktreeChanges = {
						ok: false,
						code: "collection_failed",
						message: "Could not collect exact owned worktree changes",
					};
					worktreeCollectionsFailed += 1;
				}
			} else {
				worktreeChanges = {
					ok: false,
					code: "collection_unavailable",
					message: "No exact owned worktree collection is available for this child",
				};
				worktreeCollectionsFailed += 1;
			}
		}
		const view = buildStatusView(selected.snapshot, now, detail, eventLimit, worktreeChanges);
		const outcomeIndex = initial.length;
		initial.push(view.minimal);
		drafts.push({ outcomeIndex, ...view });
	}

	const catalogInitial: StatusWorktreeCatalogOutcome[] = [];
	const catalogDrafts: CatalogDraftSuccess[] = [];
	let worktreeCatalogFailed = 0;
	for (const request of worktreeCatalogRequests) {
		const workspaceId = request?.workspaceId;
		const expectedRevision = request?.expectedRevision;
		if (typeof workspaceId !== "string" || !WORKTREE_WORKSPACE_ID.test(workspaceId) || workspaceId.length > SUB_AGENT_BOUNDS.agentIdChars) {
			catalogInitial.push(catalogFailure(workspaceId, expectedRevision, "invalid_catalog_target", "Catalog workspace ID is invalid"));
			worktreeCatalogFailed += 1;
			continue;
		}
		if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
			catalogInitial.push(catalogFailure(workspaceId, expectedRevision, "invalid_catalog_target", "Catalog expected revision is invalid"));
			worktreeCatalogFailed += 1;
			continue;
		}
		if (signal?.aborted) {
			throw new SubAgentsStatusError("cancelled", "sub_agents_status was cancelled before retained worktree collection");
		}
		if (typeof runtime.collectWorktreeCatalogChanges !== "function") {
			catalogInitial.push(catalogFailure(workspaceId, expectedRevision, "catalog_unavailable", "No retained worktree catalog collection is available"));
			worktreeCatalogFailed += 1;
			continue;
		}
		try {
			const collection = await runtime.collectWorktreeCatalogChanges({
				workspaceId,
				...(expectedRevision !== undefined ? { expectedRevision } : {}),
				signal,
			});
			const view = buildCatalogOutcome(collection, expectedRevision);
			const outcomeIndex = catalogInitial.length;
			catalogInitial.push(view.minimal);
			catalogDrafts.push({ outcomeIndex, ...view });
		} catch {
			catalogInitial.push(catalogFailure(workspaceId, expectedRevision, "catalog_collection_failed", "Could not collect retained worktree changes"));
			worktreeCatalogFailed += 1;
		}
	}

	const failed = initial.filter((outcome) => !outcome.ok).length;
	const base = {
		generation: runtime.manager.generation,
		selection: params.ids ? "selected" as const : "all" as const,
		includeRemoved,
		detail,
		eventLimit,
		drainUsage,
		includeWorktreeChanges,
		requested: selection.requested,
		returned: initial.length,
		succeeded: initial.length - failed,
		failed,
		omitted: selection.omitted,
		usageDrained: drainUsage ? drained : undefined,
		usageAggregateClamped: usageAggregateClamped ? true as const : undefined,
		worktreeCollectionsFailed,
		worktreeCatalogRequested: worktreeCatalogRequests.length,
		worktreeCatalogFailed,
	};
	const details = fitDetails(base, initial, drafts, catalogInitial, catalogDrafts);
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
			"Return a bounded compact or recent-timeline snapshot for selected or all current-generation sub-agents. Includes lifecycle, assignment, active/pending model route and effective thinking, active tools, leases, latest report/result, queue state, errors, elapsed time, and usage. Usage is observational by default; drainUsage=true atomically attaches only newly accrued usage to this tool result. Optional worktree collection fields are read-only and do not create, clean up, merge, delete, push, or contact remotes.",
		promptSnippet:
			"Inspect bounded current-generation sub-agent state, activity, results, usage, and optional read-only worktree changes",
		promptGuidelines: [
			"Use sub_agents_status with exact IDs when inspecting selected children; omit ids only when a bounded all-agent snapshot is intended.",
			"Keep sub_agents_status drainUsage omitted or false for observation; set drainUsage=true only when intentionally advancing child usage accounting.",
			"Use worktreeCatalogChanges only for read-only retained/uncertain worktree catalog collection by exact workspaceId/revision; it is not cleanup, merge, branch deletion, push, or worktree enablement.",
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
