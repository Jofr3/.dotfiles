import type {
	ParentWorkspaceReservation,
	WorkspaceLeaseConflict,
} from "./leases.ts";
import {
	WorkspaceLeaseConflictError,
	WorkspaceLeaseManagerError,
} from "./leases.ts";
import {
	resolveCanonicalWorkspacePath,
	resolveSharedWorkspace,
	WorkspacePathError,
	type CanonicalWorkspacePath,
} from "./paths.ts";
import type { WorkspaceIdentity } from "../types.ts";

export type ParentMutationToolName = "edit" | "write" | "bash";

export interface ParentMutationToolCallEvent {
	readonly toolName: string;
	readonly toolCallId: string;
	readonly input: unknown;
}

export interface ParentMutationCompletionEvent {
	readonly toolName: string;
	readonly toolCallId: string;
}

export interface ParentMutationBlock {
	readonly block: true;
	readonly reason: string;
}

export interface ParentMutationManager {
	readonly generation: string;
	readonly cwd: string;
	reserveParentFiles(
		reservationId: string,
		workspace: Readonly<WorkspaceIdentity>,
		targets: readonly Readonly<CanonicalWorkspacePath>[],
	): Readonly<ParentWorkspaceReservation>;
	reserveParentWorkspace(
		reservationId: string,
		workspace: Readonly<WorkspaceIdentity>,
	): Readonly<ParentWorkspaceReservation>;
	releaseParentReservation(token: string): unknown;
}

interface ActiveParentReservation {
	readonly toolName: ParentMutationToolName;
	readonly token: string;
}

const PARENT_MUTATION_TOOLS = new Set<ParentMutationToolName>(["edit", "write", "bash"]);
const BLOCK_REASON_CHARS = 1_200;
const DISPLAY_FIELD_CHARS = 300;
const ANSI_ESCAPE = /\u001b(?:\[[0-?]*[ -\/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)?|[@-_])/g;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/g;

export function isParentMutationToolName(value: string): value is ParentMutationToolName {
	return PARENT_MUTATION_TOOLS.has(value as ParentMutationToolName);
}

function safeDisplay(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	const sanitized = value
		.replace(ANSI_ESCAPE, "")
		.replace(CONTROL_CHARACTER, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, DISPLAY_FIELD_CHARS);
	return sanitized || fallback;
}

function boundedReason(reason: string): string {
	return reason.slice(0, BLOCK_REASON_CHARS);
}

function errorCode(error: unknown): string | undefined {
	return error && typeof error === "object" && "code" in error
		? String((error as { code?: unknown }).code ?? "")
		: undefined;
}

function conflictFromError(error: unknown): Readonly<WorkspaceLeaseConflict> | undefined {
	if (!error || typeof error !== "object" || !("conflict" in error)) return undefined;
	const conflict = (error as { conflict?: unknown }).conflict;
	if (!conflict || typeof conflict !== "object" || Array.isArray(conflict)) return undefined;
	const candidate = conflict as Partial<WorkspaceLeaseConflict>;
	if (
		(candidate.ownerKind !== "child" && candidate.ownerKind !== "parent") ||
		typeof candidate.heldKind !== "string"
	) {
		return undefined;
	}
	return candidate as Readonly<WorkspaceLeaseConflict>;
}

function conflictReason(conflict: Readonly<WorkspaceLeaseConflict>): string {
	const path = conflict.path ?? conflict.heldPath;
	const target = path ? ` for ${safeDisplay(path, "the requested path")}` : "";
	if (conflict.ownerKind === "child") {
		const id = safeDisplay(conflict.ownerAgentId, "unknown child");
		const name = safeDisplay(conflict.ownerAgentName, "unnamed child");
		return boundedReason(
			`Blocked by sub-agent workspace coordination: ${id} (${name}) holds a conflicting ${conflict.heldKind} lease${target}. Wait for it to settle, redirect it, or remove it before retrying.`,
		);
	}
	return boundedReason(
		`Blocked by sub-agent workspace coordination: another parent mutation holds a conflicting ${conflict.heldKind} reservation${target}. Wait for that tool call to finish before retrying.`,
	);
}

function reservationFailureReason(error: unknown): string {
	const code = errorCode(error);
	const conflict = conflictFromError(error);
	if ((error instanceof WorkspaceLeaseConflictError || code === "lease_conflict") && conflict) {
		return conflictReason(conflict);
	}
	if (
		error instanceof WorkspacePathError ||
		code === "invalid_path" ||
		code === "workspace_unavailable" ||
		code === "workspace_outside_root" ||
		code === "path_unavailable" ||
		code === "path_outside_root" ||
		code === "path_outside_scope"
	) {
		return boundedReason(
			`Blocked by sub-agent workspace coordination: the mutation target could not be reserved safely (${code ?? "invalid_path"}).`,
		);
	}
	if (
		error instanceof WorkspaceLeaseManagerError ||
		code === "invalid_lease_request" ||
		code === "duplicate_parent_reservation" ||
		code === "lease_manager_closed" ||
		code === "stale_agent"
	) {
		return boundedReason(
			`Blocked by sub-agent workspace coordination: the parent mutation reservation was rejected (${code ?? "invalid_lease_request"}).`,
		);
	}
	return "Blocked by sub-agent workspace coordination: the parent mutation could not be reserved safely.";
}

function pathInput(event: ParentMutationToolCallEvent): string {
	if (!event.input || typeof event.input !== "object" || Array.isArray(event.input)) {
		throw new WorkspacePathError("invalid_path", "The parent mutation input is invalid");
	}
	const path = (event.input as { path?: unknown }).path;
	if (typeof path !== "string") {
		throw new WorkspacePathError("invalid_path", "The parent mutation path is invalid");
	}
	return path;
}

/** Prevent a later cooperative tool_call handler from retargeting a reserved file mutation. */
function lockReservedFileTarget(event: ParentMutationToolCallEvent, path: string): void {
	if (!event.input || typeof event.input !== "object" || Array.isArray(event.input)) {
		throw new WorkspacePathError("invalid_path", "The parent mutation input is invalid");
	}
	Object.defineProperty(event.input, "path", {
		value: path,
		enumerable: true,
		configurable: false,
		writable: false,
	});
	Object.defineProperty(event, "input", {
		value: event.input,
		enumerable: true,
		configurable: false,
		writable: false,
	});
}

/**
 * One parent-session-generation interceptor for built-in edit/write/bash.
 * Reservations are acquired during tool_call preflight and released after the
 * actual tool returns through tool_result, with tool_execution_end as the
 * mandatory fallback for blocked, aborted, or otherwise immediate outcomes.
 */
export class ParentMutationInterceptor {
	readonly generation: string;

	#manager: ParentMutationManager;
	#active = new Map<string, ActiveParentReservation>();
	#idleWaiters = new Set<() => void>();
	#closed = false;

	constructor(manager: ParentMutationManager) {
		this.#manager = manager;
		this.generation = manager.generation;
	}

	get closed(): boolean {
		return this.#closed;
	}

	get activeReservationCount(): number {
		return this.#active.size;
	}

	ownsToolCall(event: ParentMutationCompletionEvent): boolean {
		return this.#active.get(event.toolCallId)?.toolName === event.toolName;
	}

	async handleToolCall(
		event: ParentMutationToolCallEvent,
		toolCwd: string,
	): Promise<ParentMutationBlock | undefined> {
		if (!isParentMutationToolName(event.toolName)) return undefined;
		if (this.#closed) {
			return {
				block: true,
				reason: "Blocked by sub-agent workspace coordination: the parent session generation is inactive.",
			};
		}
		if (this.#active.has(event.toolCallId)) {
			return {
				block: true,
				reason: "Blocked by sub-agent workspace coordination: this tool-call ID already owns an active reservation.",
			};
		}

		try {
			const sharedWorkspace = await resolveSharedWorkspace(this.#manager.cwd, toolCwd);
			if (this.#closed) {
				return {
					block: true,
					reason: "Blocked by sub-agent workspace coordination: the parent session generation is inactive.",
				};
			}

			const requestedPath = event.toolName === "bash" ? undefined : pathInput(event);
			const target = requestedPath === undefined
				? undefined
				: await resolveCanonicalWorkspacePath({
					workspace: sharedWorkspace.identity,
					cwd: sharedWorkspace.cwd,
					path: requestedPath,
					allowMissing: event.toolName === "write",
				});
			if (this.#closed) {
				return {
					block: true,
					reason: "Blocked by sub-agent workspace coordination: the parent session generation is inactive.",
				};
			}
			const reservation = target === undefined
				? this.#manager.reserveParentWorkspace(event.toolCallId, sharedWorkspace.identity)
				: this.#manager.reserveParentFiles(
					event.toolCallId,
					sharedWorkspace.identity,
					[target],
				);
			if (this.#closed) {
				this.#manager.releaseParentReservation(reservation.token);
				return {
					block: true,
					reason: "Blocked by sub-agent workspace coordination: the parent session generation is inactive.",
				};
			}
			this.#active.set(event.toolCallId, {
				toolName: event.toolName,
				token: reservation.token,
			});
			if (requestedPath !== undefined) {
				try {
					lockReservedFileTarget(event, requestedPath);
				} catch (error) {
					this.#release(event);
					return { block: true, reason: reservationFailureReason(error) };
				}
			}
			return undefined;
		} catch (error) {
			return { block: true, reason: reservationFailureReason(error) };
		}
	}

	handleToolResult(event: ParentMutationCompletionEvent): void {
		this.#release(event);
	}

	handleToolExecutionEnd(event: ParentMutationCompletionEvent): void {
		this.#release(event);
	}

	/** Stop new reservations without releasing ownership for a still-running parent tool. */
	shutdown(): void {
		this.#closed = true;
		this.#resolveIdleWaiters();
	}

	/** Wait until every accepted parent mutation has returned or been blocked before generation disposal. */
	waitForIdle(): Promise<void> {
		if (this.#active.size === 0) return Promise.resolve();
		return new Promise<void>((resolvePromise) => {
			this.#idleWaiters.add(resolvePromise);
		});
	}

	#release(event: ParentMutationCompletionEvent): void {
		const reservation = this.#active.get(event.toolCallId);
		if (!reservation || reservation.toolName !== event.toolName) return;
		try {
			this.#manager.releaseParentReservation(reservation.token);
			this.#active.delete(event.toolCallId);
			this.#resolveIdleWaiters();
		} catch {
			// Keep the token for tool_execution_end or generation shutdown retry.
		}
	}

	#resolveIdleWaiters(): void {
		if (this.#active.size !== 0 || this.#idleWaiters.size === 0) return;
		for (const resolvePromise of [...this.#idleWaiters]) resolvePromise();
		this.#idleWaiters.clear();
	}
}
