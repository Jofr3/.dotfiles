import { Buffer } from "node:buffer";
import { defineTool, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	renderSpawnCall,
	renderSpawnResult,
} from "../ui/renderers.ts";
import {
	SubAgentAssignmentRunnerError,
	createApprovedWorktreeWorkspaceResolver,
	type ChildWorkspaceResolver,
	type SubAgentAssignmentRunner,
} from "../assignment-runner.ts";
import {
	SubAgentManagerError,
	type SubAgentManager,
} from "../manager.ts";
import {
	SUB_AGENT_MODEL_ROUTING_PROMPT_GUIDELINES,
	type SubAgentModelRouter,
} from "../model-router.ts";
import type {
	AgentLifecycleState,
	ManagedSubAgentSnapshot,
	ModelRoute,
	SubAgentId,
	SubAgentWorkspaceDisposition,
} from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";
import type {
	ApprovedWorktreeAdmission,
	WorktreeOutcomeSummary,
	WorktreeWorkspacePlan,
} from "../workspace/worktrees.ts";
import {
	subAgentsSpawnSchema,
	type SubAgentsSpawnInput,
} from "./schemas.ts";

const DISPLAY_NAME_BYTES = 64;
const DISPLAY_PROVIDER_BYTES = 64;
const DISPLAY_MODEL_BYTES = 96;
const DISPLAY_ERROR_BYTES = 192;
const DISPLAY_CODE_BYTES = 64;
const DISPLAY_WORKTREE_ID_BYTES = 200;
const DISPLAY_BRANCH_BYTES = 512;
const DISPLAY_COMMIT_BYTES = 64;
const WORKTREE_DISPOSITIONS = new Set(["active", "ready", "retained", "cleaned", "uncertain"]);
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
	"cancelled",
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

export interface SubAgentsSpawnRuntime {
	readonly manager: Pick<SubAgentManager, "generation" | "getAgent">;
	readonly runner: Pick<
		SubAgentAssignmentRunner,
		"createAndLaunch" | "prompt" | "send" | "waitForAssignment"
	>;
	readonly router: Pick<SubAgentModelRouter, "resolve">;
	/** Optional internal Phase 8 seam. Default runtime may wire it before the public release gate opens. */
	readonly worktrees?: Parameters<typeof createApprovedWorktreeWorkspaceResolver>[0]["worktrees"];
	/** Release gate. Defaults to false, so a wired worktree manager alone cannot enable public worktree mode. */
	readonly worktreeModeEnabled?: boolean;
}

export interface SpawnRouteSummary {
	requestedPolicy: ModelRoute["requestedPolicy"];
	requestedComplexity: ModelRoute["requestedComplexity"];
	selectedModel: ModelRoute["selectedModel"];
	selectedModelTruncated?: true;
	selectedTier?: ModelRoute["selectedTier"];
	fallbackUsed: boolean;
}

export interface SpawnWorktreeOutcomeSummary {
	workspaceId: string;
	branchRef: string;
	baseCommit: string;
	lastObservedCommit?: string;
	disposition: WorktreeOutcomeSummary["disposition"] | SubAgentWorkspaceDisposition;
	truncated?: true;
}

export interface SpawnSuccessOutcome {
	index: number;
	ok: true;
	id: SubAgentId;
	state: AgentLifecycleState;
	route?: SpawnRouteSummary;
	worktree?: SpawnWorktreeOutcomeSummary;
}

export interface SpawnFailureOutcome {
	index: number;
	ok: false;
	id?: SubAgentId;
	state?: AgentLifecycleState;
	code: string;
	message: string;
	worktree?: SpawnWorktreeOutcomeSummary;
}

export type SpawnAgentOutcome = SpawnSuccessOutcome | SpawnFailureOutcome;

export interface SubAgentsSpawnToolDetails {
	generation: string;
	requested: number;
	started: number;
	failed: number;
	outcomes: SpawnAgentOutcome[];
}

export class SubAgentsSpawnError extends Error {
	readonly code: "manager_inactive" | "cancelled" | "bash_not_approved";

	constructor(code: "manager_inactive" | "cancelled" | "bash_not_approved", message: string) {
		super(message);
		this.name = "SubAgentsSpawnError";
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

function cloneRouteSummary(route: ModelRoute | undefined): SpawnRouteSummary | undefined {
	if (!route) return undefined;
	const provider = boundUtf8Line(route.selectedModel.provider, DISPLAY_PROVIDER_BYTES);
	const id = boundUtf8Line(route.selectedModel.id, DISPLAY_MODEL_BYTES);
	const selectedModelTruncated =
		provider !== route.selectedModel.provider || id !== route.selectedModel.id;
	return {
		requestedPolicy: route.requestedPolicy,
		requestedComplexity: route.requestedComplexity,
		selectedModel: { provider, id },
		selectedModelTruncated: selectedModelTruncated ? true : undefined,
		selectedTier: route.selectedTier,
		fallbackUsed: route.fallbackUsed,
	};
}

function cloneWorktreeSnapshot(
	snapshot: ManagedSubAgentSnapshot,
): SpawnWorktreeOutcomeSummary | undefined {
	const workspace = snapshot.workspace;
	if (!workspace || workspace.mode !== "worktree") return undefined;
	const workspaceId = boundUtf8Line(workspace.workspaceId, DISPLAY_WORKTREE_ID_BYTES);
	const branchRef = boundUtf8Line(workspace.branchRef, DISPLAY_BRANCH_BYTES);
	const baseCommit = boundUtf8Line(workspace.baseCommit, DISPLAY_COMMIT_BYTES);
	if (!workspaceId || !branchRef || !baseCommit) return undefined;
	const truncated = workspaceId !== workspace.workspaceId ||
		branchRef !== workspace.branchRef ||
		baseCommit !== workspace.baseCommit;
	return {
		workspaceId,
		branchRef,
		baseCommit,
		disposition: workspace.disposition,
		truncated: truncated ? true : undefined,
	};
}

function cloneWorktreeOutcome(
	value: unknown,
): SpawnWorktreeOutcomeSummary | undefined {
	if (!value || typeof value !== "object") return undefined;
	const candidate = value as Partial<WorktreeOutcomeSummary>;
	if (typeof candidate.disposition !== "string" || !WORKTREE_DISPOSITIONS.has(candidate.disposition)) {
		return undefined;
	}
	const workspaceId = boundUtf8Line(candidate.workspaceId, DISPLAY_WORKTREE_ID_BYTES);
	const branchRef = boundUtf8Line(candidate.branchRef, DISPLAY_BRANCH_BYTES);
	const baseCommit = boundUtf8Line(candidate.baseCommit, DISPLAY_COMMIT_BYTES);
	const lastObservedCommit = boundUtf8Line(candidate.lastObservedCommit, DISPLAY_COMMIT_BYTES);
	if (!workspaceId || !branchRef || !baseCommit || !lastObservedCommit) return undefined;
	const truncated = workspaceId !== candidate.workspaceId ||
		branchRef !== candidate.branchRef ||
		baseCommit !== candidate.baseCommit ||
		lastObservedCommit !== candidate.lastObservedCommit;
	return {
		workspaceId,
		branchRef,
		baseCommit,
		lastObservedCommit,
		disposition: candidate.disposition,
		truncated: truncated ? true : undefined,
	};
}

function knownFailure(error: unknown): {
	code: string;
	message: string;
	id?: SubAgentId;
	worktree?: SpawnWorktreeOutcomeSummary;
} {
	const candidate =
		error && typeof error === "object"
			? (error as { name?: unknown; code?: unknown; message?: unknown; agentId?: unknown })
			: undefined;
	const runnerError =
		error instanceof SubAgentAssignmentRunnerError ||
		(candidate?.name === "SubAgentAssignmentRunnerError" &&
			typeof candidate.code === "string" &&
			RUNNER_ERROR_CODES.has(candidate.code));
	if (runnerError && candidate) {
		return {
			code: boundUtf8Line(candidate.code, DISPLAY_CODE_BYTES) || "spawn_failed",
			message:
				boundUtf8Line(candidate.message, DISPLAY_ERROR_BYTES) ||
				"Could not initialize the sub-agent",
			id:
				typeof candidate.agentId === "string" && candidate.agentId.startsWith("sa1-")
					? candidate.agentId.slice(0, SUB_AGENT_BOUNDS.agentIdChars)
					: undefined,
			worktree: cloneWorktreeOutcome((candidate as { worktreeOutcome?: unknown }).worktreeOutcome),
		};
	}
	const managerError =
		error instanceof SubAgentManagerError ||
		(typeof candidate?.name === "string" &&
			candidate.name.endsWith("Error") &&
			typeof candidate.code === "string" &&
			MANAGER_ERROR_CODES.has(candidate.code));
	if (managerError && candidate) {
		return {
			code: boundUtf8Line(candidate.code, DISPLAY_CODE_BYTES) || "spawn_failed",
			message:
				boundUtf8Line(candidate.message, DISPLAY_ERROR_BYTES) ||
				"Could not validate the sub-agent specification",
		};
	}
	return {
		code: "spawn_failed",
		message: "Could not initialize the sub-agent",
	};
}

function failureSnapshot(
	runtime: SubAgentsSpawnRuntime,
	id: SubAgentId | undefined,
): ManagedSubAgentSnapshot | undefined {
	if (!id) return undefined;
	try {
		return runtime.manager.getAgent(id);
	} catch {
		return undefined;
	}
}

function shortCommit(value: unknown): string {
	return boundUtf8Line(String(value ?? "").slice(0, 12), DISPLAY_COMMIT_BYTES);
}

interface SpawnWorktreeBatchEntry {
	readonly index: number;
	readonly name: string;
	readonly objective: string;
	readonly relativeCwd?: string;
	readonly bash: boolean;
}

interface SpawnWorktreeBatchPlan {
	readonly version: 1;
	readonly generation: string;
	readonly releaseGateEnabled: boolean;
	readonly requested: number;
	readonly entries: readonly SpawnWorktreeBatchEntry[];
	readonly worktreeCount: number;
	readonly bashWorktreeCount: number;
}

function createSpawnWorktreeBatchPlan(
	runtime: SubAgentsSpawnRuntime,
	params: SubAgentsSpawnInput,
): Readonly<SpawnWorktreeBatchPlan> {
	const entries = params.agents
		.map((agent, index): SpawnWorktreeBatchEntry | undefined => {
			if (agent.workspace?.mode !== "worktree") return undefined;
			const relativeCwd = agent.workspace.cwd?.trim() || undefined;
			return Object.freeze({
				index,
				name: String(agent.name ?? ""),
				objective: String(agent.objective ?? ""),
				...(relativeCwd !== undefined ? { relativeCwd } : {}),
				bash: agent.tools?.includes("bash") === true,
			});
		})
		.filter((entry): entry is SpawnWorktreeBatchEntry => entry !== undefined);
	const bashWorktreeCount = entries.filter((entry) => entry.bash).length;
	return Object.freeze({
		version: 1,
		generation: runtime.manager.generation,
		releaseGateEnabled: runtime.worktreeModeEnabled === true,
		requested: params.agents.length,
		entries: Object.freeze(entries),
		worktreeCount: entries.length,
		bashWorktreeCount,
	});
}

function stableWorktreeRequestSpec(
	request: Parameters<ChildWorkspaceResolver>[0],
	entry: Readonly<SpawnWorktreeBatchEntry>,
): Parameters<ChildWorkspaceResolver>[0] {
	const currentWorkspace = request.spec.workspace ?? { mode: "worktree", bashPolicy: "disabled" };
	const { cwd: _ignoredCwd, ...workspaceRest } = currentWorkspace;
	return Object.freeze({
		...request,
		spec: Object.freeze({
			...request.spec,
			workspace: Object.freeze({
				...workspaceRest,
				mode: "worktree",
				...(entry.relativeCwd !== undefined ? { cwd: entry.relativeCwd } : {}),
			}),
		}),
	});
}

interface PreparedSpawnWorktreePlan {
	readonly entry: Readonly<SpawnWorktreeBatchEntry>;
	readonly plan: Readonly<WorktreeWorkspacePlan>;
	readonly request: ChildWorkspaceResolutionRequestLike;
}

interface ChildWorkspaceResolutionRequestLike {
	readonly id: SubAgentId;
	readonly signal?: AbortSignal;
}

function publicWorktreeBatchApprovalMessage(
	prepared: readonly Readonly<PreparedSpawnWorktreePlan>[],
	batch: Readonly<SpawnWorktreeBatchPlan>,
): string {
	const firstPlan = prepared[0]?.plan;
	const repositoryPath = boundUtf8Line(firstPlan?.repository.topLevel, 240) || "repository path unavailable";
	const base = shortCommit(firstPlan?.repository.headCommit);
	const clean = firstPlan?.repository.clean === true ? "yes" : "no";
	const childLines = prepared
		.slice()
		.sort((a, b) => a.entry.index - b.entry.index)
		.slice(0, 8)
		.map(({ entry, plan }) => {
			const childName = boundUtf8Line(entry.name, DISPLAY_NAME_BYTES) || "unnamed child";
			const objective = boundUtf8Line(entry.objective, 120) || "bounded objective unavailable";
			const workspaceId = boundUtf8Line(plan.identity.workspaceId, DISPLAY_WORKTREE_ID_BYTES) || "workspace unavailable";
			const branchRef = boundUtf8Line(plan.identity.branchRef, DISPLAY_BRANCH_BYTES) || "branch unavailable";
			const bash = entry.bash ? " · bash" : "";
			return `- #${entry.index + 1} ${childName}${bash}: ${objective} · ${workspaceId} · ${branchRef}`;
		});
	const omitted = Math.max(0, prepared.length - childLines.length);
	return [
		"Approve this complete generated Git worktree batch before any child-side provisioning starts.",
		`Repository: ${repositoryPath}`,
		`Base: ${base} · clean: ${clean}`,
		`Worktree requests in this spawn call: ${batch.worktreeCount}`,
		`Worktree children also requesting bash: ${batch.bashWorktreeCount}`,
		"Generated children/workspaces:",
		...childLines,
		...(omitted > 0 ? [`- ${omitted} more worktree request(s) omitted`] : []),
		"The linked worktrees and branches are retained by default. Cleanup, merge, branch deletion, prune, push, and remote access are not implied by this approval.",
		batch.bashWorktreeCount > 0
			? "Approved child bash is same-UID local command execution and can mutate parent/sibling worktrees, Git metadata, network-visible resources, and external paths."
			: "Guarded non-bash tools deny Git administrative .git paths; this approval is still a retained repository side effect.",
	].join("\n");
}

function createWorktreeBatchAdmissionCoordinator(
	ctx: ExtensionContext,
	batch: Readonly<SpawnWorktreeBatchPlan>,
	onAdmitted?: (index: number) => void,
) {
	const prepared = new Map<number, Readonly<PreparedSpawnWorktreePlan>>();
	let allPreparedResolve!: () => void;
	let allPreparedReject!: (error: unknown) => void;
	let allPreparedSettled = false;
	const allPrepared = new Promise<void>((resolve, reject) => {
		allPreparedResolve = () => {
			if (allPreparedSettled) return;
			allPreparedSettled = true;
			resolve();
		};
		allPreparedReject = (error) => {
			if (allPreparedSettled) return;
			allPreparedSettled = true;
			reject(error);
		};
	});
	allPrepared.catch(() => undefined);
	let admissionPromise: Promise<ReadonlyMap<number, Readonly<ApprovedWorktreeAdmission>>> | undefined;
	let admitted = false;

	const toRequestError = (error: unknown, request: ChildWorkspaceResolutionRequestLike) => {
		if (error instanceof SubAgentAssignmentRunnerError) {
			return new SubAgentAssignmentRunnerError(error.code, error.message, request.id, {
				runtimeSettled: error.runtimeSettled,
				worktreeOutcome: error.worktreeOutcome,
			});
		}
		return new SubAgentAssignmentRunnerError(
			"runtime_initialization_failed",
			"The worktree spawn batch was not admitted",
			request.id,
		);
	};

	const admitBatch = async (): Promise<ReadonlyMap<number, Readonly<ApprovedWorktreeAdmission>>> => {
		await allPrepared;
		const preparedPlans = Array.from(prepared.values()).sort((a, b) => a.entry.index - b.entry.index);
		const digests = new Set<string>();
		for (const item of preparedPlans) {
			if (digests.has(item.plan.approvalDigest)) {
				throw new SubAgentAssignmentRunnerError(
					"runtime_initialization_failed",
					"The worktree batch contains a duplicate approval digest",
					item.request.id,
				);
			}
			digests.add(item.plan.approvalDigest);
		}
		const aborted = preparedPlans.find((item) => item.request.signal?.aborted);
		if (aborted) {
			throw new SubAgentAssignmentRunnerError(
				"cancelled",
				"The sub-agent operation was cancelled",
				aborted.request.id,
			);
		}
		if (ctx.hasUI !== true || typeof ctx.ui?.confirm !== "function") {
			throw new SubAgentAssignmentRunnerError(
				"runtime_initialization_failed",
				"Worktree child creation requires approval-capable UI or RPC admission",
				preparedPlans[0]?.request.id,
			);
		}
		const signal = preparedPlans.find((item) => item.request.signal)?.request.signal;
		const approved = await ctx.ui.confirm(
			"Authorize sub-agent Git worktree batch?",
			publicWorktreeBatchApprovalMessage(preparedPlans, batch),
			{ signal },
		);
		if (!approved) {
			throw new SubAgentAssignmentRunnerError(
				"runtime_initialization_failed",
				"Worktree child creation requires explicit operator approval for the exact batch",
				preparedPlans[0]?.request.id,
			);
		}
		const abortedAfterApproval = preparedPlans.find((item) => item.request.signal?.aborted);
		if (abortedAfterApproval) {
			throw new SubAgentAssignmentRunnerError(
				"cancelled",
				"The sub-agent operation was cancelled",
				abortedAfterApproval.request.id,
			);
		}
		const admissions = new Map<number, Readonly<ApprovedWorktreeAdmission>>();
		for (const item of preparedPlans) {
			admissions.set(item.entry.index, Object.freeze({
				approvalDigest: item.plan.approvalDigest,
				correlationToken: item.plan.identity.correlationToken,
			}));
		}
		admitted = true;
		for (const item of preparedPlans) onAdmitted?.(item.entry.index);
		return admissions;
	};

	return {
		async approve(
			entry: Readonly<SpawnWorktreeBatchEntry>,
			plan: Readonly<WorktreeWorkspacePlan>,
			request: ChildWorkspaceResolutionRequestLike,
		): Promise<Readonly<ApprovedWorktreeAdmission>> {
			if (request.signal?.aborted) {
				throw new SubAgentAssignmentRunnerError(
					"cancelled",
					"The sub-agent operation was cancelled",
					request.id,
				);
			}
			if (prepared.has(entry.index)) {
				const error = new SubAgentAssignmentRunnerError(
					"runtime_initialization_failed",
					"The worktree batch contained a duplicate request index",
					request.id,
				);
				allPreparedReject(error);
				throw error;
			}
			prepared.set(entry.index, Object.freeze({ entry, plan, request }));
			if (prepared.size === batch.entries.length) allPreparedResolve();
			admissionPromise ??= admitBatch();
			try {
				const admissions = await admissionPromise;
				const admission = admissions.get(entry.index);
				if (!admission) {
					throw new SubAgentAssignmentRunnerError(
						"runtime_initialization_failed",
						"The worktree batch admission omitted this child plan",
						request.id,
					);
				}
				return admission;
			} catch (error) {
				throw toRequestError(error, request);
			}
		},
		fail(error: unknown) {
			if (admitted) return;
			allPreparedReject(error);
		},
	};
}

function createSpawnWorktreeWorkspaceResolverFactory(
	runtime: SubAgentsSpawnRuntime,
	ctx: ExtensionContext,
	batch: Readonly<SpawnWorktreeBatchPlan>,
	onAdmitted?: (index: number) => void,
): Readonly<{
	resolverForIndex(index: number): ChildWorkspaceResolver | undefined;
	failBeforeAdmission(error: unknown): void;
}> | undefined {
	if (batch.releaseGateEnabled !== true || !runtime.worktrees || batch.entries.length === 0) return undefined;
	const entries = new Map(batch.entries.map((entry) => [entry.index, entry]));
	const coordinator = createWorktreeBatchAdmissionCoordinator(ctx, batch, onAdmitted);
	return Object.freeze({
		resolverForIndex(index) {
			const entry = entries.get(index);
			if (!entry) return undefined;
			const resolver = createApprovedWorktreeWorkspaceResolver({
				worktrees: runtime.worktrees!,
				trusted: () => typeof ctx.isProjectTrusted === "function" && ctx.isProjectTrusted() === true,
				approve: (plan, request) => coordinator.approve(entry, plan, request),
			});
			return async (request) => {
				try {
					return await resolver(stableWorktreeRequestSpec(request, entry));
				} catch (error) {
					coordinator.fail(error);
					throw error;
				}
			};
		},
		failBeforeAdmission(error) {
			coordinator.fail(error);
		},
	});
}

async function spawnOne(
	runtime: SubAgentsSpawnRuntime,
	ctx: ExtensionContext,
	spec: SubAgentsSpawnInput["agents"][number],
	index: number,
	signal: AbortSignal | undefined,
	resolveWorkspace?: ChildWorkspaceResolver,
): Promise<SpawnAgentOutcome> {
	try {
		const launch = await runtime.runner.createAndLaunch(spec, ({ spec: normalizedSpec }) =>
			runtime.router.resolve({
				hostRegistry: ctx.modelRegistry,
				parentModel: ctx.model,
				spec: normalizedSpec,
			}), signal, resolveWorkspace ? { resolveWorkspace } : undefined);
		if (signal?.aborted) {
			return {
				index,
				ok: false,
				id: launch.id,
				state: failureSnapshot(runtime, launch.id)?.state,
				code: "cancelled",
				message: "Child launch was cancelled and cleaned up",
			};
		}
		return {
			index,
			ok: true,
			id: launch.id,
			state: launch.snapshot.state,
			route: cloneRouteSummary(launch.snapshot.modelRoute),
			worktree: cloneWorktreeSnapshot(launch.snapshot),
		};
	} catch (error) {
		const failure = knownFailure(error);
		const snapshot = failureSnapshot(runtime, failure.id);
		return {
			index,
			ok: false,
			id: failure.id,
			state: snapshot?.state,
			code: failure.code,
			message: failure.message,
			worktree: failure.worktree,
		};
	}
}

function formatOutcome(
	outcome: SpawnAgentOutcome,
	agents: SubAgentsSpawnInput["agents"],
): string {
	const name =
		boundUtf8Line(agents[outcome.index]?.name, DISPLAY_NAME_BYTES) ||
		`agent ${outcome.index + 1}`;
	if (!outcome.ok) {
		const id = outcome.id ? ` (${outcome.id})` : "";
		const worktree = outcome.worktree
			? ` · worktree ${outcome.worktree.workspaceId} ${outcome.worktree.disposition}`
			: "";
		return `- [failed] ${name}${id}: ${outcome.code}: ${outcome.message}${worktree}`;
	}
	const route = outcome.route;
	const selected = route
		? `${boundUtf8Line(route.selectedModel.provider, DISPLAY_PROVIDER_BYTES)}/${boundUtf8Line(
				route.selectedModel.id,
				DISPLAY_MODEL_BYTES,
			)}`
		: "model route unavailable";
	const tier = route?.selectedTier ?? route?.requestedComplexity;
	const fallback = route?.fallbackUsed ? " · fallback" : "";
	const worktree = outcome.worktree
		? ` · worktree ${outcome.worktree.workspaceId} ${outcome.worktree.disposition}`
		: "";
	return `- [started] ${name}: ${outcome.id} · ${selected} · ${tier}${fallback}${worktree}`;
}

export function formatSubAgentsSpawnResult(
	details: SubAgentsSpawnToolDetails,
	agents: SubAgentsSpawnInput["agents"],
): string {
	return [
		`sub_agents_spawn: ${details.started} started · ${details.failed} failed · generation ${details.generation}`,
		...details.outcomes.map((outcome) => formatOutcome(outcome, agents)),
	].join("\n");
}

/** Execute one bounded spawn batch without imposing an active-pool count or semaphore. */
export async function executeSubAgentsSpawn(
	params: SubAgentsSpawnInput,
	signal: AbortSignal | undefined,
	ctx: ExtensionContext,
	runtime: SubAgentsSpawnRuntime | undefined,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: SubAgentsSpawnToolDetails }> {
	if (!runtime) {
		throw new SubAgentsSpawnError(
			"manager_inactive",
			"No active sub-agent manager generation is available",
		);
	}
	if (signal?.aborted) {
		throw new SubAgentsSpawnError(
			"cancelled",
			"sub_agents_spawn was cancelled before any child was launched",
		);
	}
	const bashAgents = params.agents.filter((spec) => spec.tools?.includes("bash"));
	if (bashAgents.length > 0) {
		const assignments = bashAgents
			.slice(0, 5)
			.map((spec) =>
				`- ${boundUtf8Line(spec.name, DISPLAY_NAME_BYTES)} — ${boundUtf8Line(spec.objective, 160)}`,
			)
			.join("\n");
		const omitted = Math.max(0, bashAgents.length - 5);
		const approved = ctx.hasUI === true && await ctx.ui.confirm(
			"Authorize sub-agent bash?",
			`${bashAgents.length} child assignment(s) request same-UID local shell execution:\n${assignments}${omitted > 0 ? `\n- ${omitted} more assignment(s) omitted` : ""}\n\nThis is not a filesystem, network, or process sandbox. Approval grants these children local shell capability until they are removed, including later messages. Approve this exact spawn batch?`,
			{ signal },
		);
		if (!approved) {
			throw new SubAgentsSpawnError(
				"bash_not_approved",
				"Child bash requires explicit operator approval for the exact spawn batch",
			);
		}
		if (signal?.aborted) {
			throw new SubAgentsSpawnError(
				"cancelled",
				"sub_agents_spawn was cancelled before any child was launched",
			);
		}
	}

	const worktreeBatchPlan = createSpawnWorktreeBatchPlan(runtime, params);
	const worktreeIndexes = new Set(worktreeBatchPlan.entries.map((entry) => entry.index));
	const hasSharedSibling = params.agents.some((_spec, index) => !worktreeIndexes.has(index));
	const waitForWorktreeAdmission = worktreeIndexes.size > 0 && hasSharedSibling &&
		worktreeBatchPlan.releaseGateEnabled === true && !!runtime.worktrees;
	const admittedWorktreeIndexes = new Set<number>();
	let admissionResolve: (() => void) | undefined;
	let admissionReject: ((error: { code: string; message: string }) => void) | undefined;
	const admissionBarrier = waitForWorktreeAdmission
		? new Promise<void>((resolve, reject) => {
			admissionResolve = resolve;
			admissionReject = reject;
		})
		: undefined;
	admissionBarrier?.catch(() => undefined);
	const failAdmissionBarrier = (message: string) => {
		admissionReject?.({
			code: "worktree_batch_not_admitted",
			message: boundUtf8Line(message, DISPLAY_ERROR_BYTES) ||
				"Shared sibling launch was held because the worktree batch was not admitted",
		});
	};
	const markWorktreeAdmitted = (index: number) => {
		if (!waitForWorktreeAdmission || !worktreeIndexes.has(index)) return;
		admittedWorktreeIndexes.add(index);
		if (admittedWorktreeIndexes.size === worktreeIndexes.size) admissionResolve?.();
	};
	const worktreeResolverFactory = createSpawnWorktreeWorkspaceResolverFactory(
		runtime,
		ctx,
		worktreeBatchPlan,
		markWorktreeAdmitted,
	);
	const resolveWorkspaceForIndex = worktreeResolverFactory?.resolverForIndex;

	// Mapping first creates every eligible per-child promise. Worktree-capable
	// mixed batches hold shared siblings behind a complete admission barrier so
	// a shared child cannot launch ahead of required retained-Git approval.
	const outcomes = await Promise.all(
		params.agents.map((spec, index) => {
			const resolveWorkspace = resolveWorkspaceForIndex?.(index);
			if (admissionBarrier && !worktreeIndexes.has(index)) {
				return admissionBarrier.then(
					() => spawnOne(runtime, ctx, spec, index, signal, resolveWorkspace),
					(error: { code?: unknown; message?: unknown }) => ({
						index,
						ok: false as const,
						code: boundUtf8Line(error?.code, DISPLAY_CODE_BYTES) || "worktree_batch_not_admitted",
						message: boundUtf8Line(error?.message, DISPLAY_ERROR_BYTES) ||
							"Shared sibling was not launched because the worktree batch was not admitted",
					}),
				);
			}
			const launch = spawnOne(runtime, ctx, spec, index, signal, resolveWorkspace);
			if (admissionBarrier && worktreeIndexes.has(index)) {
				launch.then(
					() => {
						if (!admittedWorktreeIndexes.has(index)) {
							const error = new SubAgentAssignmentRunnerError(
								"runtime_initialization_failed",
								"Worktree child ended before the complete batch was admitted",
							);
							worktreeResolverFactory?.failBeforeAdmission(error);
							failAdmissionBarrier(error.message);
						}
					},
					() => {
						const error = new SubAgentAssignmentRunnerError(
							"runtime_initialization_failed",
							"Worktree child failed before the complete batch was admitted",
						);
						worktreeResolverFactory?.failBeforeAdmission(error);
						failAdmissionBarrier(error.message);
					},
				);
			}
			return launch;
		}),
	);
	const started = outcomes.filter((outcome) => outcome.ok).length;
	const details: SubAgentsSpawnToolDetails = {
		generation: runtime.manager.generation,
		requested: outcomes.length,
		started,
		failed: outcomes.length - started,
		outcomes,
	};
	return {
		content: [{ type: "text", text: formatSubAgentsSpawnResult(details, params.agents) }],
		details,
	};
}

export function createSubAgentsSpawnTool(
	getRuntime: () => SubAgentsSpawnRuntime | undefined,
) {
	return defineTool<typeof subAgentsSpawnSchema, SubAgentsSpawnToolDetails>({
		name: "sub_agents_spawn",
		label: "Spawn Sub-Agents",
		description:
			"Create and launch 1-64 independent dynamic in-process sub-agents. Each valid child is routed and initialized independently, starts in the background, and returns an opaque ID without waiting for completion. Shared children support read-only tools and guarded edit/write; workspace-exclusive bash additionally requires explicit operator approval for the exact spawn batch. Worktrees remain unavailable.",
		promptSnippet:
			"Create dynamic background sub-agents with read-only tools, guarded edit/write, or workspace-exclusive bash and return their opaque IDs",
		promptGuidelines: [
			...SUB_AGENT_MODEL_ROUTING_PROMPT_GUIDELINES,
			"Use sub_agents_spawn for genuinely useful independent assignments while the main agent remains responsible for orchestration and final decisions.",
			"Never include credentials or secrets in sub_agents_spawn names, instructions, objectives, context, or result requirements.",
			"Any sub_agents_spawn batch requesting bash requires explicit operator approval and fails closed when review UI is unavailable or approval is denied.",
		],
		parameters: subAgentsSpawnSchema,
		// Bash-capability approval is review-sensitive and must not race another
		// spawn dialog from a sibling tool call.
		executionMode: "sequential",
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return executeSubAgentsSpawn(params, signal, ctx, getRuntime());
		},
		renderCall: renderSpawnCall,
		renderResult: renderSpawnResult,
	});
}
