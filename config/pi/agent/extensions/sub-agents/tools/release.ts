import { Buffer } from "node:buffer";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { SubAgentManagerError, type SubAgentManager } from "../manager.ts";
import {
	renderReleaseCall,
	renderReleaseResult,
} from "../ui/renderers.ts";
import type {
	AgentLifecycleState,
	ManagedSubAgentSnapshot,
	SubAgentId,
	WorkspaceLeaseKind,
} from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";
import {
	subAgentsReleaseSchema,
	type SubAgentsReleaseInput,
} from "./schemas.ts";

const DISPLAY_CODE_BYTES = 40;
const DISPLAY_ERROR_BYTES = 120;
const DISPLAY_LINE_BYTES = 380;
const MANAGER_ERROR_CODES = new Set([
	"manager_closed",
	"unknown_agent",
	"stale_agent",
	"lease_release_boundary",
	"agent_stopping",
]);

export interface SubAgentsReleaseRuntime {
	readonly manager: Pick<
		SubAgentManager,
		"generation" | "getAgent" | "releaseChildLeasesWithResult"
	>;
}

export interface ReleaseSuccessOutcome {
	index: number;
	ok: true;
	id: SubAgentId;
	state: "idle" | "blocked";
	action: "released" | "no-op";
	releasedLeases: number;
	remainingLeases: number;
	releasedKinds: WorkspaceLeaseKind[];
}

export interface ReleaseFailureOutcome {
	index: number;
	ok: false;
	id: string;
	state?: AgentLifecycleState;
	code: string;
	message: string;
}

export type ReleaseTargetOutcome = ReleaseSuccessOutcome | ReleaseFailureOutcome;

export interface SubAgentsReleaseToolDetails {
	generation: string;
	requested: number;
	succeeded: number;
	failed: number;
	releasedTargets: number;
	noOpTargets: number;
	releasedLeases: number;
	outcomes: ReleaseTargetOutcome[];
}

export class SubAgentsReleaseError extends Error {
	readonly code: "manager_inactive" | "cancelled";

	constructor(code: "manager_inactive" | "cancelled", message: string) {
		super(message);
		this.name = "SubAgentsReleaseError";
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
		const size = Buffer.byteLength(character, "utf8");
		if (bytes + size > maxBytes) break;
		result += character;
		bytes += size;
	}
	return result;
}

function safeSnapshot(
	runtime: SubAgentsReleaseRuntime,
	id: SubAgentId,
): ManagedSubAgentSnapshot | undefined {
	try {
		return runtime.manager.getAgent(id);
	} catch {
		return undefined;
	}
}

function managerCode(error: unknown): string | undefined {
	if (!error || typeof error !== "object") return undefined;
	const candidate = error as { name?: unknown; code?: unknown };
	if (
		!(error instanceof SubAgentManagerError) &&
		!(typeof candidate.name === "string" && candidate.name.endsWith("Error"))
	) {
		return undefined;
	}
	return typeof candidate.code === "string" && MANAGER_ERROR_CODES.has(candidate.code)
		? candidate.code
		: undefined;
}

function failure(
	index: number,
	id: string,
	error: unknown,
	runtime: SubAgentsReleaseRuntime,
): ReleaseFailureOutcome {
	const code = managerCode(error);
	const messages: Record<string, string> = {
		manager_closed: "The sub-agent manager generation is closed",
		unknown_agent: "Unknown sub-agent ID",
		stale_agent: "Sub-agent ID belongs to another session generation",
		lease_release_boundary: "Retained leases can be released only while the child is idle or blocked",
		agent_stopping: "Sub-agent cleanup has started",
	};
	return {
		index,
		ok: false,
		id: id.slice(0, SUB_AGENT_BOUNDS.agentIdChars),
		state: safeSnapshot(runtime, id)?.state,
		code: boundUtf8Line(code ?? "release_failed", DISPLAY_CODE_BYTES) || "release_failed",
		message: boundUtf8Line(
			code ? messages[code] ?? "Could not release retained workspace ownership" : "Could not release retained workspace ownership",
			DISPLAY_ERROR_BYTES,
		),
	};
}

async function releaseOne(
	runtime: SubAgentsReleaseRuntime,
	id: SubAgentId,
	index: number,
): Promise<ReleaseTargetOutcome> {
	try {
		const result = await runtime.manager.releaseChildLeasesWithResult(
			id,
			"Released by sub_agents_release",
		);
		const releasedKinds = [...new Set(result.released.map((lease) => lease.kind))];
		return {
			index,
			ok: true,
			id,
			state: result.snapshot.state as "idle" | "blocked",
			action: result.released.length > 0 ? "released" : "no-op",
			releasedLeases: result.released.length,
			remainingLeases: result.snapshot.leases.length,
			releasedKinds,
		};
	} catch (error) {
		return failure(index, id, error, runtime);
	}
}

function formatOutcome(outcome: ReleaseTargetOutcome): string {
	if (!outcome.ok) {
		return boundUtf8Line(
			`- [failed] ${outcome.id}: ${outcome.code}: ${outcome.message}`,
			DISPLAY_LINE_BYTES,
		);
	}
	return boundUtf8Line(
		`- [${outcome.action}] ${outcome.id}: ${outcome.releasedLeases} released · ${outcome.remainingLeases} remaining · ${outcome.state}`,
		DISPLAY_LINE_BYTES,
	);
}

export function formatSubAgentsReleaseResult(details: SubAgentsReleaseToolDetails): string {
	return [
		`sub_agents_release: ${details.releasedTargets} released · ${details.noOpTargets} no-op · ${details.failed} failed · ${details.releasedLeases} leases · generation ${details.generation}`,
		...details.outcomes.map(formatOutcome),
	].join("\n");
}

/** Release every selected child's retained ownership at an idle/blocked boundary. */
export async function executeSubAgentsRelease(
	params: SubAgentsReleaseInput,
	signal: AbortSignal | undefined,
	runtime: SubAgentsReleaseRuntime | undefined,
): Promise<{
	content: Array<{ type: "text"; text: string }>;
	details: SubAgentsReleaseToolDetails;
}> {
	if (!runtime) {
		throw new SubAgentsReleaseError(
			"manager_inactive",
			"No active sub-agent manager generation is available",
		);
	}
	if (signal?.aborted) {
		throw new SubAgentsReleaseError(
			"cancelled",
			"sub_agents_release was cancelled before any retained ownership was released",
		);
	}

	// Mapping first starts independent exact targets without a global scheduler.
	// Once these side effects begin, complete every result so release outcomes are visible.
	const outcomes = await Promise.all(
		params.ids.map((id, index) => releaseOne(runtime, id, index)),
	);
	const successes = outcomes.filter((outcome): outcome is ReleaseSuccessOutcome => outcome.ok);
	const details: SubAgentsReleaseToolDetails = {
		generation: runtime.manager.generation,
		requested: outcomes.length,
		succeeded: successes.length,
		failed: outcomes.length - successes.length,
		releasedTargets: successes.filter((outcome) => outcome.action === "released").length,
		noOpTargets: successes.filter((outcome) => outcome.action === "no-op").length,
		releasedLeases: successes.reduce((total, outcome) => total + outcome.releasedLeases, 0),
		outcomes,
	};
	return {
		content: [{ type: "text", text: formatSubAgentsReleaseResult(details) }],
		details,
	};
}

export function createSubAgentsReleaseTool(
	getRuntime: () => SubAgentsReleaseRuntime | undefined,
) {
	return defineTool<typeof subAgentsReleaseSchema, SubAgentsReleaseToolDetails>({
		name: "sub_agents_release",
		label: "Release Sub-Agent Leases",
		description:
			"Release all retained shared-workspace file/workspace leases for exact idle or blocked sub-agents. This keeps each child and transcript alive, does not resume blocked work, and returns bounded independent outcomes.",
		promptSnippet:
			"Release retained shared-workspace ownership from selected idle or blocked sub-agents",
		promptGuidelines: [
			"Use sub_agents_status before sub_agents_release to identify the exact retained-lease owner; release only children whose ownership is no longer needed.",
			"sub_agents_release keeps child context alive and does not resume blocked work; after resolving ownership, use sub_agents_send on the blocked child to resume its current assignment.",
			"Do not use sub_agents_release for a running child or as a substitute for sub_agents_remove when the child is no longer needed.",
		],
		parameters: subAgentsReleaseSchema,
		executionMode: "parallel",
		async execute(_toolCallId, params, signal) {
			return executeSubAgentsRelease(params, signal, getRuntime());
		},
		renderCall: renderReleaseCall,
		renderResult: renderReleaseResult,
	});
}
