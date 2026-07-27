import { Buffer } from "node:buffer";
import { defineTool, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	renderSpawnCall,
	renderSpawnResult,
} from "../ui/renderers.ts";
import {
	SubAgentAssignmentRunnerError,
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
} from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";
import {
	subAgentsSpawnSchema,
	type SubAgentsSpawnInput,
} from "./schemas.ts";

const DISPLAY_NAME_BYTES = 64;
const DISPLAY_PROVIDER_BYTES = 64;
const DISPLAY_MODEL_BYTES = 96;
const DISPLAY_ERROR_BYTES = 192;
const DISPLAY_CODE_BYTES = 64;
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
}

export interface SpawnRouteSummary {
	requestedPolicy: ModelRoute["requestedPolicy"];
	requestedComplexity: ModelRoute["requestedComplexity"];
	selectedModel: ModelRoute["selectedModel"];
	selectedModelTruncated?: true;
	selectedTier?: ModelRoute["selectedTier"];
	fallbackUsed: boolean;
}

export interface SpawnSuccessOutcome {
	index: number;
	ok: true;
	id: SubAgentId;
	state: AgentLifecycleState;
	route?: SpawnRouteSummary;
}

export interface SpawnFailureOutcome {
	index: number;
	ok: false;
	id?: SubAgentId;
	state?: AgentLifecycleState;
	code: string;
	message: string;
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

function knownFailure(error: unknown): {
	code: string;
	message: string;
	id?: SubAgentId;
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

async function spawnOne(
	runtime: SubAgentsSpawnRuntime,
	ctx: ExtensionContext,
	spec: SubAgentsSpawnInput["agents"][number],
	index: number,
	signal: AbortSignal | undefined,
): Promise<SpawnAgentOutcome> {
	try {
		const launch = await runtime.runner.createAndLaunch(spec, ({ spec: normalizedSpec }) =>
			runtime.router.resolve({
				hostRegistry: ctx.modelRegistry,
				parentModel: ctx.model,
				spec: normalizedSpec,
			}), signal);
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
		return `- [failed] ${name}${id}: ${outcome.code}: ${outcome.message}`;
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
	return `- [started] ${name}: ${outcome.id} · ${selected} · ${tier}${fallback}`;
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

	// Mapping first creates every per-child promise. Promise.all preserves request
	// order but does not serialize model routing, runtime initialization, or launch.
	const outcomes = await Promise.all(
		params.agents.map((spec, index) => spawnOne(runtime, ctx, spec, index, signal)),
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
