import { constants } from "node:fs";
import {
	lstat,
	mkdir,
	open,
	type FileHandle,
} from "node:fs/promises";
import { dirname } from "node:path";
import {
	createBashToolDefinition,
	createEditToolDefinition,
	createWriteToolDefinition,
	type BashOperations,
	type BashToolInput,
	type EditOperations,
	type EditToolInput,
	type WriteOperations,
	type WriteToolInput,
} from "@earendil-works/pi-coding-agent";
import type { WorkspaceIdentity } from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";
import {
	WorkspaceLeaseConflictError,
} from "./leases.ts";
import {
	WorkspacePathError,
	assertCanonicalPathInWriteScope,
	resolveCanonicalWorkspacePath,
	type CanonicalWorkspacePath,
	type CanonicalWriteScope,
} from "./paths.ts";

export type GuardedChildEditErrorCode =
	| "invalid_edit_path"
	| "path_outside_scope"
	| "lease_conflict"
	| "lease_claim_failed"
	| "path_identity_changed"
	| "mutation_outcome_uncertain"
	| "mutation_recording_failed";

export class GuardedChildEditError extends Error {
	readonly code: GuardedChildEditErrorCode;

	constructor(code: GuardedChildEditErrorCode, message: string) {
		super(message);
		this.name = "GuardedChildEditError";
		this.code = code;
	}
}

export interface GuardedChildEditToolDependencies {
	openFile?: typeof open;
	lstatFile?: typeof lstat;
	/** Deterministic offline-test seam invoked after the bound inode write. */
	afterWrite?: () => void | Promise<void>;
}

export interface CreateGuardedChildEditToolOptions {
	cwd: string;
	workspace: Readonly<WorkspaceIdentity>;
	writeScope?: Readonly<CanonicalWriteScope>;
	claimFiles: (
		targets: readonly Readonly<CanonicalWorkspacePath>[],
	) => void | Promise<void>;
	recordMutation: (
		target: Readonly<CanonicalWorkspacePath>,
	) => void | Promise<void>;
	dependencies?: GuardedChildEditToolDependencies;
}

interface FileIdentity {
	dev: number;
	ino: number;
}

function boundedOneLine(value: unknown, maxChars: number): string {
	return String(value ?? "")
		.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, maxChars);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw new Error("Operation aborted");
}

function structuralLeaseConflict(error: unknown): error is WorkspaceLeaseConflictError {
	return (
		error instanceof WorkspaceLeaseConflictError ||
		(Boolean(error) &&
			typeof error === "object" &&
			(error as { code?: unknown }).code === "lease_conflict" &&
			Boolean((error as { conflict?: unknown }).conflict))
	);
}

function conflictMessage(
	error: WorkspaceLeaseConflictError,
	target: Readonly<CanonicalWorkspacePath>,
): string {
	const conflict = error.conflict;
	const owner = conflict.ownerKind === "child"
		? `sub-agent ${boundedOneLine(conflict.ownerAgentId, SUB_AGENT_BOUNDS.agentIdChars) || "unknown"}` +
			(conflict.ownerAgentName
				? ` (${boundedOneLine(conflict.ownerAgentName, SUB_AGENT_BOUNDS.nameChars)})`
				: "")
		: "a parent mutation";
	return `Cannot edit ${target.relativePath}: the shared workspace target is owned by ${owner}. Report this lease conflict to the parent; do not retry or bypass it.`;
}

async function resolveExistingEditTarget(
	options: CreateGuardedChildEditToolOptions,
	path: string,
): Promise<CanonicalWorkspacePath> {
	try {
		return await resolveCanonicalWorkspacePath({
			workspace: options.workspace,
			cwd: options.cwd,
			path,
			allowMissing: false,
		});
	} catch (error) {
		if (error instanceof WorkspacePathError) {
			throw new GuardedChildEditError(
				"invalid_edit_path",
				"The edit target is unavailable or outside the approved shared workspace",
			);
		}
		throw new GuardedChildEditError(
			"invalid_edit_path",
			"Could not validate the edit target inside the approved shared workspace",
		);
	}
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
	return left.dev === right.dev && left.ino === right.ino;
}

async function captureRegularFileIdentity(
	path: string,
	lstatFile: typeof lstat,
): Promise<FileIdentity> {
	try {
		const stats = await lstatFile(path);
		if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("not a regular file");
		return { dev: stats.dev, ino: stats.ino };
	} catch {
		throw new GuardedChildEditError(
			"path_identity_changed",
			"The claimed edit target changed before the guarded mutation boundary",
		);
	}
}

async function writeWholeFile(handle: FileHandle, content: string): Promise<void> {
	const buffer = Buffer.from(content, "utf8");
	await handle.truncate(0);
	let offset = 0;
	while (offset < buffer.length) {
		const { bytesWritten } = await handle.write(
			buffer,
			offset,
			buffer.length - offset,
			offset,
		);
		if (bytesWritten <= 0) throw new Error("Could not complete the guarded file write");
		offset += bytesWritten;
	}
	await handle.truncate(buffer.length);
}

function rewriteSuccessfulEditResultPath<T extends {
	content: readonly { type: string; text?: string }[];
	details?: { patch?: string };
}>(
	result: T,
	canonicalPath: string,
	requestedPath: string,
	edits: number,
): T {
	const canonicalSuccess = `Successfully replaced ${edits} block(s) in ${canonicalPath}.`;
	const requestedSuccess = `Successfully replaced ${edits} block(s) in ${requestedPath}.`;
	const content = result.content.map((entry) =>
		entry.type === "text" && entry.text === canonicalSuccess
			? { ...entry, text: requestedSuccess }
			: entry,
	);
	const patch = result.details?.patch;
	const rewrittenPatch = typeof patch === "string"
		? patch
			.split("\n")
			.map((line, index) => {
				if (index === 0 && line === `--- ${canonicalPath}`) return `--- ${requestedPath}`;
				if (index === 1 && line === `+++ ${canonicalPath}`) return `+++ ${requestedPath}`;
				return line;
			})
			.join("\n")
		: patch;
	return {
		...result,
		content,
		details: result.details
			? { ...result.details, patch: rewrittenPatch }
			: result.details,
	};
}

function rewriteEditErrorPath(
	error: unknown,
	canonicalPath: string,
	requestedPath: string,
): unknown {
	if (!(error instanceof Error) || !error.message.includes(canonicalPath)) return error;
	return new Error(error.message.split(canonicalPath).join(requestedPath));
}

/**
 * Create one child-only edit definition that preserves Pi's built-in schema,
 * prompt metadata, renderers, mutation queue, and result contract while adding
 * canonical scope and lease enforcement before delegation.
 */
export function createGuardedChildEditTool(
	options: CreateGuardedChildEditToolOptions,
): ReturnType<typeof createEditToolDefinition> {
	if (!options || typeof options !== "object" || Array.isArray(options)) {
		throw new GuardedChildEditError("invalid_edit_path", "Guarded edit options are required");
	}
	if (typeof options.claimFiles !== "function" || typeof options.recordMutation !== "function") {
		throw new GuardedChildEditError(
			"lease_claim_failed",
			"Guarded edit workspace callbacks are required",
		);
	}

	const metadataDefinition = createEditToolDefinition(options.cwd);
	return {
		...metadataDefinition,
		async execute(toolCallId, params: EditToolInput, signal, onUpdate, ctx) {
			throwIfAborted(signal);
			const requestedPath = params.path;
			const target = await resolveExistingEditTarget(options, requestedPath);
			try {
				assertCanonicalPathInWriteScope(target, options.writeScope);
			} catch (error) {
				if (error instanceof WorkspacePathError && error.code === "path_outside_scope") {
					throw new GuardedChildEditError(
						"path_outside_scope",
						`Cannot edit ${target.relativePath}: the target is outside the declared write scope`,
					);
				}
				throw error;
			}
			throwIfAborted(signal);

			try {
				await options.claimFiles([target]);
			} catch (error) {
				if (structuralLeaseConflict(error)) {
					throw new GuardedChildEditError(
						"lease_conflict",
						conflictMessage(error, target),
					);
				}
				throw new GuardedChildEditError(
					"lease_claim_failed",
					`Could not acquire the shared workspace lease for ${target.relativePath}`,
				);
			}
			throwIfAborted(signal);

			let rebound: CanonicalWorkspacePath;
			try {
				rebound = await resolveCanonicalWorkspacePath({
					workspace: options.workspace,
					cwd: options.cwd,
					path: requestedPath,
					allowMissing: false,
				});
			} catch {
				throw new GuardedChildEditError(
					"path_identity_changed",
					`Cannot edit ${target.relativePath}: the target identity changed after its lease was acquired`,
				);
			}
			if (
				rebound.workspaceKey !== target.workspaceKey ||
				rebound.path !== target.path ||
				!rebound.exists
			) {
				throw new GuardedChildEditError(
					"path_identity_changed",
					`Cannot edit ${target.relativePath}: the target identity changed after its lease was acquired`,
				);
			}
			throwIfAborted(signal);

			const dependencies = options.dependencies ?? {};
			const openFile = dependencies.openFile ?? open;
			const lstatFile = dependencies.lstatFile ?? lstat;
			const expectedIdentity = await captureRegularFileIdentity(rebound.path, lstatFile);
			let handle: FileHandle | undefined;
			let mutationStarted = false;
			const operations: EditOperations = {
				async access() {
					if (typeof constants.O_NOFOLLOW !== "number") {
						throw new GuardedChildEditError(
							"path_identity_changed",
							"The local platform cannot bind the guarded edit target without following links",
						);
					}
					handle = await openFile(
						rebound.path,
						constants.O_RDWR | constants.O_NOFOLLOW,
					);
					const openedStats = await handle.stat();
					if (!openedStats.isFile() || !sameIdentity(expectedIdentity, openedStats)) {
						throw new GuardedChildEditError(
							"path_identity_changed",
							"The claimed edit target changed at the guarded mutation boundary",
						);
					}
				},
				async readFile() {
					if (!handle) throw new Error("The guarded edit target is not open");
					return handle.readFile();
				},
				async writeFile(_path, content) {
					if (!handle) throw new Error("The guarded edit target is not open");
					mutationStarted = true;
					await writeWholeFile(handle, content);
					const currentIdentity = await captureRegularFileIdentity(rebound.path, lstatFile);
					if (!sameIdentity(expectedIdentity, currentIdentity)) {
						throw new GuardedChildEditError(
							"path_identity_changed",
							"The claimed edit target changed during the guarded mutation",
						);
					}
					await dependencies.afterWrite?.();
				},
			};

			// The public built-in remains the sole withFileMutationQueue() owner.
			// Its path is the claimed canonical target, while descriptor-bound local
			// operations prevent a post-claim symlink/replacement race from changing
			// the inode that is read and written.
			const delegatedDefinition = createEditToolDefinition(options.cwd, { operations });
			let result: Awaited<ReturnType<typeof delegatedDefinition.execute>> | undefined;
			let executionError: unknown;
			try {
				result = await delegatedDefinition.execute(
					toolCallId,
					{ ...params, path: rebound.path },
					signal,
					onUpdate,
					ctx,
				);
			} catch (error) {
				executionError = rewriteEditErrorPath(error, rebound.path, requestedPath);
			}
			try {
				await handle?.close();
			} catch {
				executionError ??= new GuardedChildEditError(
					"path_identity_changed",
					"The guarded edit target could not be closed cleanly",
				);
			}

			if (mutationStarted) {
				try {
					await options.recordMutation(rebound);
				} catch {
					throw new GuardedChildEditError(
						"mutation_recording_failed",
						"The file edit changed or may have changed the target, but its bounded workspace metadata could not be recorded. Do not retry the edit blindly.",
					);
				}
			}
			if (executionError) {
				if (mutationStarted) {
					throw new GuardedChildEditError(
						"mutation_outcome_uncertain",
						`The guarded edit changed or may have changed ${rebound.relativePath}, but did not reach a clean success boundary. Do not retry it blindly; inspect the file and report the outcome to the parent.`,
					);
				}
				throw executionError;
			}
			return rewriteSuccessfulEditResultPath(
				result!,
				rebound.path,
				requestedPath,
				params.edits.length,
			);
		},
	};
}

export type GuardedChildWriteErrorCode =
	| "invalid_write_path"
	| "path_outside_scope"
	| "lease_conflict"
	| "lease_claim_failed"
	| "path_identity_changed"
	| "lease_reconciliation_failed"
	| "mutation_outcome_uncertain"
	| "mutation_recording_failed";

export class GuardedChildWriteError extends Error {
	readonly code: GuardedChildWriteErrorCode;

	constructor(code: GuardedChildWriteErrorCode, message: string) {
		super(message);
		this.name = "GuardedChildWriteError";
		this.code = code;
	}
}

export interface GuardedChildWriteToolDependencies {
	openFile?: typeof open;
	lstatFile?: typeof lstat;
	mkdirPath?: typeof mkdir;
	/** Deterministic offline-test seam invoked after parent-directory preparation. */
	afterMkdir?: () => void | Promise<void>;
	/** Deterministic offline-test seam invoked after the bound inode write and reconciliation. */
	afterWrite?: () => void | Promise<void>;
}

export interface CreateGuardedChildWriteToolOptions {
	cwd: string;
	workspace: Readonly<WorkspaceIdentity>;
	writeScope?: Readonly<CanonicalWriteScope>;
	claimFiles: (
		targets: readonly Readonly<CanonicalWorkspacePath>[],
	) => void | Promise<void>;
	reconcileFile: (
		target: Readonly<CanonicalWorkspacePath>,
	) => void | Promise<void>;
	recordMutation: (
		target: Readonly<CanonicalWorkspacePath>,
	) => void | Promise<void>;
	dependencies?: GuardedChildWriteToolDependencies;
}

function writeConflictMessage(
	error: WorkspaceLeaseConflictError,
	target: Readonly<CanonicalWorkspacePath>,
): string {
	const conflict = error.conflict;
	const owner = conflict.ownerKind === "child"
		? `sub-agent ${boundedOneLine(conflict.ownerAgentId, SUB_AGENT_BOUNDS.agentIdChars) || "unknown"}` +
			(conflict.ownerAgentName
				? ` (${boundedOneLine(conflict.ownerAgentName, SUB_AGENT_BOUNDS.nameChars)})`
				: "")
		: "a parent mutation";
	return `Cannot write ${target.relativePath}: the shared workspace target is owned by ${owner}. Report this lease conflict to the parent; do not retry or bypass it.`;
}

async function resolveWriteTarget(
	options: CreateGuardedChildWriteToolOptions,
	path: string,
	allowMissing: boolean,
): Promise<CanonicalWorkspacePath> {
	try {
		return await resolveCanonicalWorkspacePath({
			workspace: options.workspace,
			cwd: options.cwd,
			path,
			allowMissing,
		});
	} catch (error) {
		if (error instanceof WorkspacePathError) {
			throw new GuardedChildWriteError(
				"invalid_write_path",
				"The write target is unavailable or outside the approved shared workspace",
			);
		}
		throw new GuardedChildWriteError(
			"invalid_write_path",
			"Could not validate the write target inside the approved shared workspace",
		);
	}
}

function sameResolvedWriteTarget(
	left: Readonly<CanonicalWorkspacePath>,
	right: Readonly<CanonicalWorkspacePath>,
): boolean {
	return (
		left.workspaceKey === right.workspaceKey &&
		left.path === right.path &&
		left.exists === right.exists &&
		left.provisionalNamespace === right.provisionalNamespace
	);
}

async function captureRegularWriteIdentity(
	path: string,
	lstatFile: typeof lstat,
): Promise<FileIdentity> {
	try {
		const stats = await lstatFile(path);
		if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("not a regular file");
		return { dev: stats.dev, ino: stats.ino };
	} catch {
		throw new GuardedChildWriteError(
			"path_identity_changed",
			"The claimed write target changed before the guarded mutation boundary",
		);
	}
}

function rewriteSuccessfulWriteResultPath<T extends {
	content: readonly { type: string; text?: string }[];
}>(
	result: T,
	canonicalPath: string,
	requestedPath: string,
	contentLength: number,
): T {
	const canonicalSuccess = `Successfully wrote ${contentLength} bytes to ${canonicalPath}`;
	const requestedSuccess = `Successfully wrote ${contentLength} bytes to ${requestedPath}`;
	return {
		...result,
		content: result.content.map((entry) =>
			entry.type === "text" && entry.text === canonicalSuccess
				? { ...entry, text: requestedSuccess }
				: entry,
		),
	};
}

function rewriteWriteErrorPath(
	error: unknown,
	canonicalPath: string,
	requestedPath: string,
): unknown {
	if (!(error instanceof Error)) return error;
	let message = error.message.split(canonicalPath).join(requestedPath);
	const canonicalDir = dirname(canonicalPath);
	if (canonicalDir !== canonicalPath) {
		message = message.split(canonicalDir).join(dirname(requestedPath));
	}
	return message === error.message ? error : new Error(message);
}

/**
 * Create one child-only write definition that preserves Pi's built-in schema,
 * prompt metadata, renderers, sole mutation queue, and undefined-details result
 * contract while binding overwrite/create I/O to an exact retained file lease.
 */
export function createGuardedChildWriteTool(
	options: CreateGuardedChildWriteToolOptions,
): ReturnType<typeof createWriteToolDefinition> {
	if (!options || typeof options !== "object" || Array.isArray(options)) {
		throw new GuardedChildWriteError("invalid_write_path", "Guarded write options are required");
	}
	if (
		typeof options.claimFiles !== "function" ||
		typeof options.reconcileFile !== "function" ||
		typeof options.recordMutation !== "function"
	) {
		throw new GuardedChildWriteError(
			"lease_claim_failed",
			"Guarded write workspace callbacks are required",
		);
	}

	const metadataDefinition = createWriteToolDefinition(options.cwd);
	return {
		...metadataDefinition,
		async execute(toolCallId, params: WriteToolInput, signal, onUpdate, ctx) {
			throwIfAborted(signal);
			const requestedPath = params.path;
			const target = await resolveWriteTarget(options, requestedPath, true);
			try {
				assertCanonicalPathInWriteScope(target, options.writeScope);
			} catch (error) {
				if (error instanceof WorkspacePathError && error.code === "path_outside_scope") {
					throw new GuardedChildWriteError(
						"path_outside_scope",
						`Cannot write ${target.relativePath}: the target is outside the declared write scope`,
					);
				}
				throw error;
			}
			throwIfAborted(signal);

			try {
				await options.claimFiles([target]);
			} catch (error) {
				if (structuralLeaseConflict(error)) {
					throw new GuardedChildWriteError(
						"lease_conflict",
						writeConflictMessage(error, target),
					);
				}
				throw new GuardedChildWriteError(
					"lease_claim_failed",
					`Could not acquire the shared workspace lease for ${target.relativePath}`,
				);
			}
			throwIfAborted(signal);

			const rebound = await resolveWriteTarget(options, requestedPath, true).catch(() => {
				throw new GuardedChildWriteError(
					"path_identity_changed",
					`Cannot write ${target.relativePath}: the target identity changed after its lease was acquired`,
				);
			});
			if (!sameResolvedWriteTarget(target, rebound)) {
				throw new GuardedChildWriteError(
					"path_identity_changed",
					`Cannot write ${target.relativePath}: the target identity changed after its lease was acquired`,
				);
			}
			throwIfAborted(signal);

			const dependencies = options.dependencies ?? {};
			const openFile = dependencies.openFile ?? open;
			const lstatFile = dependencies.lstatFile ?? lstat;
			const mkdirPath = dependencies.mkdirPath ?? mkdir;
			let handle: FileHandle | undefined;
			let directoryMutationPossible = false;
			let mutationStarted = false;
			let reconciledTarget: CanonicalWorkspacePath | undefined;
			let reconciliationFailed = false;

			const requireStableBoundary = async (
				expectedExists: boolean,
			): Promise<CanonicalWorkspacePath> => {
				let current: CanonicalWorkspacePath;
				try {
					current = await resolveCanonicalWorkspacePath({
						workspace: options.workspace,
						cwd: options.cwd,
						path: requestedPath,
						allowMissing: !expectedExists,
					});
				} catch {
					throw new GuardedChildWriteError(
						"path_identity_changed",
						"The claimed write target changed at the guarded mutation boundary",
					);
				}
				if (
					current.workspaceKey !== rebound.workspaceKey ||
					current.path !== rebound.path ||
					current.exists !== expectedExists
				) {
					throw new GuardedChildWriteError(
						"path_identity_changed",
						"The claimed write target changed at the guarded mutation boundary",
					);
				}
				return current;
			};

			const operations: WriteOperations = {
				async mkdir(dir) {
					if (dir !== dirname(rebound.path)) {
						throw new GuardedChildWriteError(
							"path_identity_changed",
							"The delegated write directory does not match the claimed target",
						);
					}
					try {
						const parentStats = await lstatFile(dir);
						if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
							throw new GuardedChildWriteError(
								"path_identity_changed",
								"The delegated write parent is not a stable canonical directory",
							);
						}
					} catch (error) {
						if (error instanceof GuardedChildWriteError) throw error;
						// Recursive mkdir can partially create a previously missing path even
						// when it later rejects, so this is an uncertainty boundary before await.
						directoryMutationPossible = true;
					}
					await mkdirPath(dir, { recursive: true });
					await dependencies.afterMkdir?.();
					await requireStableBoundary(rebound.exists);
				},
				async writeFile(_path, content) {
					if (typeof constants.O_NOFOLLOW !== "number") {
						throw new GuardedChildWriteError(
							"path_identity_changed",
							"The local platform cannot bind the guarded write target without following links",
						);
					}
					const boundary = await requireStableBoundary(rebound.exists);
					let expectedIdentity: FileIdentity | undefined;
					if (boundary.exists) {
						expectedIdentity = await captureRegularWriteIdentity(boundary.path, lstatFile);
						handle = await openFile(boundary.path, constants.O_WRONLY | constants.O_NOFOLLOW);
					} else {
						handle = await openFile(
							boundary.path,
							constants.O_WRONLY |
								constants.O_CREAT |
								constants.O_EXCL |
								constants.O_NOFOLLOW,
							0o666,
						);
						// O_CREAT has already created the leased target at this point.
						mutationStarted = true;
					}
					const openedStats = await handle.stat();
					const openedIdentity = { dev: openedStats.dev, ino: openedStats.ino };
					if (
						!openedStats.isFile() ||
						(expectedIdentity !== undefined && !sameIdentity(expectedIdentity, openedIdentity))
					) {
						throw new GuardedChildWriteError(
							"path_identity_changed",
							"The claimed write target changed at the guarded mutation boundary",
						);
					}
					mutationStarted = true;
					await writeWholeFile(handle, content);

					const currentIdentity = await captureRegularWriteIdentity(boundary.path, lstatFile);
					if (!sameIdentity(openedIdentity, currentIdentity)) {
						throw new GuardedChildWriteError(
							"path_identity_changed",
							"The claimed write target changed during the guarded mutation",
						);
					}
					reconciledTarget = await requireStableBoundary(true);
					await dependencies.afterWrite?.();
					const finalIdentity = await captureRegularWriteIdentity(boundary.path, lstatFile);
					if (!sameIdentity(openedIdentity, finalIdentity)) {
						throw new GuardedChildWriteError(
							"path_identity_changed",
							"The claimed write target changed after the guarded mutation",
						);
					}
					reconciledTarget = await requireStableBoundary(true);
					try {
						await options.reconcileFile(reconciledTarget);
					} catch {
						reconciliationFailed = true;
						throw new GuardedChildWriteError(
							"lease_reconciliation_failed",
							"The created file identity could not be reconciled with its retained workspace lease",
						);
					}
				},
			};

			// The public built-in remains the sole withFileMutationQueue() owner.
			// Guarded operations bind both overwrite and create paths to one inode;
			// missing targets are reconciled only after canonical post-create checks.
			const delegatedDefinition = createWriteToolDefinition(options.cwd, { operations });
			let result: Awaited<ReturnType<typeof delegatedDefinition.execute>> | undefined;
			let executionError: unknown;
			try {
				result = await delegatedDefinition.execute(
					toolCallId,
					{ ...params, path: rebound.path },
					signal,
					onUpdate,
					ctx,
				);
			} catch (error) {
				executionError = rewriteWriteErrorPath(error, rebound.path, requestedPath);
			}
			try {
				await handle?.close();
			} catch {
				executionError ??= new GuardedChildWriteError(
					"path_identity_changed",
					"The guarded write target could not be closed cleanly",
				);
			}

			if (mutationStarted) {
				try {
					await options.recordMutation(reconciledTarget ?? rebound);
				} catch {
					throw new GuardedChildWriteError(
						"mutation_recording_failed",
						"The file write changed or may have changed the target, but its bounded workspace metadata could not be recorded. Do not retry the write blindly.",
					);
				}
			}
			if (executionError) {
				if (mutationStarted) {
					const reconciliation = reconciliationFailed
						? " Its retained lease remains conservative because identity reconciliation did not complete."
						: "";
					throw new GuardedChildWriteError(
						"mutation_outcome_uncertain",
						`The guarded write changed or may have changed ${rebound.relativePath}, but did not reach a clean success boundary.${reconciliation} Do not retry it blindly; inspect the file and report the outcome to the parent.`,
					);
				}
				if (directoryMutationPossible) {
					throw new GuardedChildWriteError(
						"mutation_outcome_uncertain",
						`The guarded write may have created parent directories for ${rebound.relativePath}, but the file write did not reach a clean boundary. Do not retry it blindly; inspect the target path and report the outcome to the parent.`,
					);
				}
				throw executionError;
			}
			return rewriteSuccessfulWriteResultPath(
				result!,
				rebound.path,
				requestedPath,
				params.content.length,
			);
		},
	};
}

export type GuardedChildBashErrorCode =
	| "detached_process_rejected"
	| "lease_conflict"
	| "lease_claim_failed";

export class GuardedChildBashError extends Error {
	readonly code: GuardedChildBashErrorCode;

	constructor(code: GuardedChildBashErrorCode, message: string) {
		super(message);
		this.name = "GuardedChildBashError";
		this.code = code;
	}
}

export interface GuardedChildBashToolDependencies {
	/** Deterministic offline-test seam; production uses Pi's local bash backend. */
	operations?: BashOperations;
}

export interface CreateGuardedChildBashToolOptions {
	cwd: string;
	workspace: Readonly<WorkspaceIdentity>;
	claimWorkspace: () => void | Promise<void>;
	dependencies?: GuardedChildBashToolDependencies;
}

/**
 * Reject the ordinary unquoted shell `&` job-control operator. This deliberately
 * conservative lexical check avoids false positives for quoted/escaped ampersands,
 * `&&`, and redirection forms such as `2>&1`/`&>file`.
 *
 * This is defense in depth, not a shell sandbox: arbitrary programs can daemonize
 * without using `&`. The retained workspace lease remains the actual coordination
 * boundary, and deliberately detached descendants are a documented residual risk.
 */
function hasObviousBackgroundOperator(command: string): boolean {
	let quote: "single" | "double" | undefined;
	let escaped = false;
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index]!;
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\" && quote !== "single") {
			escaped = true;
			continue;
		}
		if (quote === "single") {
			if (character === "'") quote = undefined;
			continue;
		}
		if (quote === "double") {
			if (character === '"') quote = undefined;
			continue;
		}
		if (character === "'") {
			quote = "single";
			continue;
		}
		if (character === '"') {
			quote = "double";
			continue;
		}
		if (character !== "&") continue;

		const previous = command[index - 1];
		const next = command[index + 1];
		if (next === "&") {
			index += 1;
			continue;
		}
		if (previous === "&" || previous === ">" || previous === "<" || previous === "|") {
			continue;
		}
		if (next === ">" || next === "<") continue;
		return true;
	}
	return false;
}

function bashConflictMessage(error: WorkspaceLeaseConflictError): string {
	const conflict = error.conflict;
	const owner = conflict.ownerKind === "child"
		? `sub-agent ${boundedOneLine(conflict.ownerAgentId, SUB_AGENT_BOUNDS.agentIdChars) || "unknown"}` +
			(conflict.ownerAgentName
				? ` (${boundedOneLine(conflict.ownerAgentName, SUB_AGENT_BOUNDS.nameChars)})`
				: "")
		: "a parent mutation";
	return `Cannot execute bash in the shared workspace because it is owned by ${owner}. Report this workspace lease conflict to the parent; do not retry or bypass it.`;
}

/**
 * Create one child-only bash definition that preserves Pi's schema, renderers,
 * streaming, truncation/temp-file details, timeout handling, and abort signal.
 * Every invocation re-verifies the assignment-retained workspace lease before
 * delegating to the built-in implementation.
 */
export function createGuardedChildBashTool(
	options: CreateGuardedChildBashToolOptions,
): ReturnType<typeof createBashToolDefinition> {
	if (!options || typeof options !== "object" || Array.isArray(options)) {
		throw new GuardedChildBashError("lease_claim_failed", "Guarded bash options are required");
	}
	if (typeof options.claimWorkspace !== "function") {
		throw new GuardedChildBashError(
			"lease_claim_failed",
			"Guarded bash requires the generation-scoped workspace lease callback",
		);
	}
	if (
		!options.workspace ||
		options.workspace.mode !== "shared" ||
		typeof options.workspace.root !== "string" ||
		typeof options.workspace.key !== "string"
	) {
		throw new GuardedChildBashError(
			"lease_claim_failed",
			"Guarded bash requires a valid shared workspace identity",
		);
	}

	const operations = options.dependencies?.operations;
	const metadataDefinition = createBashToolDefinition(
		options.cwd,
		operations ? { operations } : undefined,
	);
	return {
		...metadataDefinition,
		// Any sibling tool batch containing bash must run in source order. The
		// workspace lease coordinates different owners; sequential execution also
		// prevents one child from overlapping its own arbitrary bash mutation with
		// guarded edit/write or another bash call.
		executionMode: "sequential",
		async execute(toolCallId, params: BashToolInput, signal, onUpdate, ctx) {
			if (signal?.aborted) throw new Error("Command aborted");
			if (hasObviousBackgroundOperator(params.command)) {
				throw new GuardedChildBashError(
					"detached_process_rejected",
					"Guarded shared-workspace bash does not allow the unquoted '&' background-job operator. Run work in the foreground so assignment cleanup can observe its process lifetime.",
				);
			}
			try {
				await options.claimWorkspace();
			} catch (error) {
				if (structuralLeaseConflict(error)) {
					throw new GuardedChildBashError(
						"lease_conflict",
						bashConflictMessage(error),
					);
				}
				throw new GuardedChildBashError(
					"lease_claim_failed",
					"Could not acquire the shared workspace lease for guarded bash",
				);
			}
			if (signal?.aborted) throw new Error("Command aborted");
			return metadataDefinition.execute(
				toolCallId,
				params,
				signal,
				onUpdate,
				ctx,
			);
		},
	};
}
