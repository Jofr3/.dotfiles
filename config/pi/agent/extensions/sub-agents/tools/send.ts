import { Buffer } from "node:buffer";
import { defineTool } from "@earendil-works/pi-coding-agent";
import {
	renderSendCall,
	renderSendResult,
} from "../ui/renderers.ts";
import {
	SubAgentAssignmentRunnerError,
	type ActiveAssignmentDelivery,
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
} from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";
import {
	subAgentsSendSchema,
	type SubAgentsSendInput,
} from "./schemas.ts";

const DISPLAY_CODE_BYTES = 40;
const DISPLAY_ERROR_BYTES = 96;
const DISPLAY_LINE_BYTES = 380;
const MAX_BOUNDARY_ATTEMPTS = 3;
const RUNNER_ERROR_CODES = new Set([
	"invalid_assignment",
	"model_resolution_failed",
	"runtime_initialization_failed",
	"runtime_missing",
	"assignment_not_idle",
	"assignment_not_running",
	"assignment_not_settled",
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

export interface SubAgentsSendRuntime {
	readonly manager: Pick<SubAgentManager, "generation" | "getAgent">;
	readonly runner: Pick<
		SubAgentAssignmentRunner,
		"prompt" | "resumeBlocked" | "send" | "waitForAssignment"
	>;
}

export type SendDispatch = "prompt" | "resume" | ActiveAssignmentDelivery;

export interface SendSuccessOutcome {
	index: number;
	ok: true;
	id: SubAgentId;
	state: AgentLifecycleState;
	dispatch: SendDispatch;
	assignmentSequence: number;
	pendingMessageCount?: number;
}

export interface SendFailureOutcome {
	index: number;
	ok: false;
	id: string;
	state?: AgentLifecycleState;
	code: string;
	message: string;
}

export type SendTargetOutcome = SendSuccessOutcome | SendFailureOutcome;

export interface SubAgentsSendToolDetails {
	generation: string;
	requested: number;
	accepted: number;
	failed: number;
	outcomes: SendTargetOutcome[];
}

export class SubAgentsSendError extends Error {
	readonly code: "manager_inactive" | "cancelled";

	constructor(code: "manager_inactive" | "cancelled", message: string) {
		super(message);
		this.name = "SubAgentsSendError";
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
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (bytes + characterBytes > maxBytes) break;
		result += character;
		bytes += characterBytes;
	}
	return result;
}

function errorCode(error: unknown): string | undefined {
	if (!error || typeof error !== "object") return undefined;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

function isRunnerBoundaryError(error: unknown, code: "assignment_not_idle" | "assignment_not_running"): boolean {
	const candidate =
		error && typeof error === "object"
			? (error as { name?: unknown; code?: unknown })
			: undefined;
	return (
		(error instanceof SubAgentAssignmentRunnerError ||
			candidate?.name === "SubAgentAssignmentRunnerError") &&
		candidate?.code === code
	);
}

function safeSnapshot(
	runtime: SubAgentsSendRuntime,
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
	runtime: SubAgentsSendRuntime,
): SendFailureOutcome {
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
	const managerError =
		error instanceof SubAgentManagerError ||
		(typeof candidate?.name === "string" &&
			candidate.name.endsWith("Error") &&
			code !== undefined &&
			MANAGER_ERROR_CODES.has(code));
	const snapshot = safeSnapshot(runtime, id);

	if (runnerError && code) {
		const messages: Record<string, string> = {
			invalid_assignment: "The child message is invalid",
			runtime_missing: "The sub-agent has no active child runtime",
			assignment_not_idle: "The sub-agent is not at an idle assignment boundary",
			assignment_not_running: "The sub-agent has no active streaming or blocked assignment",
			assignment_not_settled: "The blocked child has not reached a resumable idle runtime boundary",
			assignment_rejected: "The new or resumed child assignment was rejected",
			assignment_execution_failed: "The child assignment could not start",
			assignment_changed: "The child assignment changed during delivery",
		};
		return {
			index,
			ok: false,
			id: id.slice(0, SUB_AGENT_BOUNDS.agentIdChars),
			state: snapshot?.state,
			code: boundUtf8Line(code, DISPLAY_CODE_BYTES) || "send_failed",
			message: boundUtf8Line(messages[code] ?? "Could not deliver the child message", DISPLAY_ERROR_BYTES),
		};
	}
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
			code: boundUtf8Line(code, DISPLAY_CODE_BYTES) || "send_failed",
			message: boundUtf8Line(messages[code] ?? "Could not inspect the sub-agent", DISPLAY_ERROR_BYTES),
		};
	}
	return {
		index,
		ok: false,
		id: id.slice(0, SUB_AGENT_BOUNDS.agentIdChars),
		state: snapshot?.state,
		code: "send_failed",
		message: "Could not deliver the child message",
	};
}

function stateFailure(index: number, snapshot: ManagedSubAgentSnapshot): SendFailureOutcome {
	const failures: Record<Exclude<AgentLifecycleState, "idle" | "running" | "blocked">, { code: string; message: string }> = {
		creating: {
			code: "target_not_ready",
			message: "Sub-agent initialization has not reached a messaging boundary",
		},
		failed: {
			code: "target_failed",
			message: "The failed sub-agent cannot accept another message",
		},
		stopping: {
			code: "target_stopping",
			message: "Sub-agent cleanup has started",
		},
		removed: {
			code: "target_removed",
			message: "The removed sub-agent cannot accept another message",
		},
	};
	const failure = failures[snapshot.state as keyof typeof failures];
	return {
		index,
		ok: false,
		id: snapshot.id,
		state: snapshot.state,
		code: failure?.code ?? "target_unavailable",
		message: failure?.message ?? "The sub-agent cannot accept this message",
	};
}

async function synchronizeBoundary(
	runtime: SubAgentsSendRuntime,
	snapshot: ManagedSubAgentSnapshot,
): Promise<void> {
	try {
		await runtime.runner.waitForAssignment(snapshot.id, snapshot.currentAssignment?.id);
	} catch {
		// A concurrent control call may already have created another assignment.
		// The next bounded attempt re-reads authoritative manager state.
	}
}

async function dispatchOne(
	runtime: SubAgentsSendRuntime,
	target: SubAgentsSendInput["messages"][number],
	index: number,
): Promise<SendTargetOutcome> {
	const delivery = target.delivery ?? "followUp";
	try {
		for (let attempt = 0; attempt < MAX_BOUNDARY_ATTEMPTS; attempt += 1) {
			const snapshot = runtime.manager.getAgent(target.id);
			if (snapshot.state === "idle") {
				try {
					const launch = await runtime.runner.prompt(target.id, target.message);
					return {
						index,
						ok: true,
						id: target.id,
						state: launch.snapshot.state,
						dispatch: "prompt",
						assignmentSequence: launch.snapshot.currentAssignment?.sequence ?? snapshot.assignmentCount + 1,
					};
				} catch (error) {
					if (!isRunnerBoundaryError(error, "assignment_not_idle")) throw error;
					await synchronizeBoundary(runtime, snapshot);
					continue;
				}
			}
			if (snapshot.state === "running") {
				try {
					const accepted = await runtime.runner.send(target.id, target.message, delivery);
					return {
						index,
						ok: true,
						id: target.id,
						state: "running",
						dispatch: accepted.delivery,
						assignmentSequence: snapshot.currentAssignment?.sequence ?? snapshot.assignmentCount,
						pendingMessageCount: accepted.pendingMessageCount,
					};
				} catch (error) {
					if (!isRunnerBoundaryError(error, "assignment_not_running")) throw error;
					await synchronizeBoundary(runtime, snapshot);
					continue;
				}
			}
			if (snapshot.state === "blocked") {
				try {
					const launch = await runtime.runner.resumeBlocked(target.id, target.message);
					return {
						index,
						ok: true,
						id: target.id,
						state: launch.snapshot.state,
						dispatch: "resume",
						assignmentSequence: launch.snapshot.currentAssignment?.sequence ?? snapshot.assignmentCount,
					};
				} catch (error) {
					if (!isRunnerBoundaryError(error, "assignment_not_running")) throw error;
					await synchronizeBoundary(runtime, snapshot);
					continue;
				}
			}
			return stateFailure(index, snapshot);
		}
		return {
			index,
			ok: false,
			id: target.id,
			state: safeSnapshot(runtime, target.id)?.state,
			code: "target_state_changed",
			message: "The sub-agent changed assignment state repeatedly during delivery",
		};
	} catch (error) {
		return knownFailure(index, target.id, error, runtime);
	}
}

function duplicateFailure(index: number, id: string): SendFailureOutcome {
	return {
		index,
		ok: false,
		id,
		code: "duplicate_target",
		message: "Duplicate target ID; no message was delivered to this sub-agent",
	};
}

function formatOutcome(outcome: SendTargetOutcome): string {
	if (!outcome.ok) {
		return boundUtf8Line(
			`- [failed] ${outcome.id}: ${outcome.code}: ${outcome.message}`,
			DISPLAY_LINE_BYTES,
		);
	}
	const queued = outcome.pendingMessageCount === undefined
		? ""
		: ` · queued ${outcome.pendingMessageCount}`;
	return boundUtf8Line(
		`- [accepted] ${outcome.id}: ${outcome.dispatch} · assignment ${outcome.assignmentSequence}${queued}`,
		DISPLAY_LINE_BYTES,
	);
}

export function formatSubAgentsSendResult(details: SubAgentsSendToolDetails): string {
	return [
		`sub_agents_send: ${details.accepted} accepted · ${details.failed} failed · generation ${details.generation}`,
		...details.outcomes.map(formatOutcome),
	].join("\n");
}

/** Deliver every unique target independently without persisting message text in results. */
export async function executeSubAgentsSend(
	params: SubAgentsSendInput,
	signal: AbortSignal | undefined,
	runtime: SubAgentsSendRuntime | undefined,
): Promise<{
	content: Array<{ type: "text"; text: string }>;
	details: SubAgentsSendToolDetails;
}> {
	if (!runtime) {
		throw new SubAgentsSendError(
			"manager_inactive",
			"No active sub-agent manager generation is available",
		);
	}
	if (signal?.aborted) {
		throw new SubAgentsSendError(
			"cancelled",
			"sub_agents_send was cancelled before any message was delivered",
		);
	}

	const counts = new Map<string, number>();
	for (const target of params.messages) counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
	const duplicates = new Set(
		[...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
	);

	// Mapping first starts every unique target independently. Duplicate IDs are
	// all rejected before runner dispatch so one call never races two messages
	// against the same child.
	const outcomes = await Promise.all(
		params.messages.map((target, index) =>
			duplicates.has(target.id)
				? Promise.resolve(duplicateFailure(index, target.id))
				: dispatchOne(runtime, target, index),
		),
	);
	const accepted = outcomes.filter((outcome) => outcome.ok).length;
	const details: SubAgentsSendToolDetails = {
		generation: runtime.manager.generation,
		requested: outcomes.length,
		accepted,
		failed: outcomes.length - accepted,
		outcomes,
	};
	return {
		content: [{ type: "text", text: formatSubAgentsSendResult(details) }],
		details,
	};
}

export function createSubAgentsSendTool(
	getRuntime: () => SubAgentsSendRuntime | undefined,
) {
	return defineTool<typeof subAgentsSendSchema, SubAgentsSendToolDetails>({
		name: "sub_agents_send",
		label: "Send to Sub-Agents",
		description:
			"Deliver one bounded message per exact current-generation sub-agent ID. Idle children start a new assignment, running children receive a follow-up or steering message, and settled blocked children resume their current assignment. Outcomes are independent and message text is omitted from results.",
		promptSnippet:
			"Send bounded new assignments, follow-ups, or steering messages to existing sub-agents",
		promptGuidelines: [
			"Use sub_agents_send with exact IDs returned by sub_agents_spawn; an idle child starts a new assignment, a running child receives followUp unless delivery=steer is explicit, and a blocked child resumes its current assignment after the ownership/blocker is resolved.",
			"Use sub_agents_send delivery=steer only to redirect the current running assignment before its next model turn; prefer followUp for work that should run after current tool activity settles.",
			"Never include credentials or secrets in sub_agents_send messages.",
		],
		parameters: subAgentsSendSchema,
		executionMode: "parallel",
		async execute(_toolCallId, params, signal) {
			return executeSubAgentsSend(params, signal, getRuntime());
		},
		renderCall: renderSendCall,
		renderResult: renderSendResult,
	});
}
