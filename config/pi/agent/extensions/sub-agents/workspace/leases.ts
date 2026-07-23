import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync, statSync } from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	relative,
	resolve,
	sep,
} from "node:path";
import type {
	SessionGeneration,
	SubAgentId,
	WorkspaceIdentity,
	WorkspaceLeaseKind,
	WorkspaceLeaseRecord,
} from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";
import {
	isPathWithinRoot,
	type CanonicalWorkspacePath,
} from "./paths.ts";

export type WorkspaceLeaseOwnerKind = "child" | "parent";

export interface WorkspaceLeaseConflict {
	readonly requestedKind: WorkspaceLeaseKind;
	readonly workspaceKey: string;
	readonly path?: string;
	readonly ownerKind: WorkspaceLeaseOwnerKind;
	readonly ownerAgentId?: SubAgentId;
	readonly ownerAgentName?: string;
	readonly heldKind: WorkspaceLeaseKind;
	readonly heldPath?: string;
}

export type WorkspaceLeaseManagerErrorCode =
	| "invalid_lease_request"
	| "duplicate_parent_reservation"
	| "lease_conflict"
	| "lease_manager_closed"
	| "stale_agent";

export class WorkspaceLeaseManagerError extends Error {
	readonly code: WorkspaceLeaseManagerErrorCode;

	constructor(code: WorkspaceLeaseManagerErrorCode, message: string) {
		super(message);
		this.name = "WorkspaceLeaseManagerError";
		this.code = code;
	}
}

export class WorkspaceLeaseConflictError extends WorkspaceLeaseManagerError {
	readonly conflict: Readonly<WorkspaceLeaseConflict>;

	constructor(conflict: WorkspaceLeaseConflict) {
		const owner = conflict.ownerKind === "child"
			? `sub-agent ${conflict.ownerAgentId ?? "unknown"}`
			: "a parent mutation";
		const target = conflict.path ? ` for ${conflict.path}` : "";
		super("lease_conflict", `Workspace ownership conflict${target}: held by ${owner}`);
		this.name = "WorkspaceLeaseConflictError";
		this.conflict = Object.freeze({ ...conflict });
	}
}

export class WorkspaceLeaseManagerClosedError extends WorkspaceLeaseManagerError {
	constructor() {
		super("lease_manager_closed", "The workspace lease manager generation is closed");
		this.name = "WorkspaceLeaseManagerClosedError";
	}
}

export interface WorkspaceLeaseManagerOptions {
	generation: SessionGeneration;
	workspaceRoot: string;
	now?: () => number;
	nonce?: () => string;
}

export interface ChildFileLeaseRequest {
	agentId: SubAgentId;
	agentName: string;
	workspace: Readonly<WorkspaceIdentity>;
	targets: readonly Readonly<CanonicalWorkspacePath>[];
}

export interface ChildWorkspaceLeaseRequest {
	agentId: SubAgentId;
	agentName: string;
	workspace: Readonly<WorkspaceIdentity>;
}

export interface ChildFileLeaseReconciliationRequest {
	agentId: SubAgentId;
	agentName: string;
	workspace: Readonly<WorkspaceIdentity>;
	/** Existing canonical identity verified after a guarded create/overwrite. */
	target: Readonly<CanonicalWorkspacePath>;
}

export interface ParentFileReservationRequest {
	reservationId: string;
	workspace: Readonly<WorkspaceIdentity>;
	targets: readonly Readonly<CanonicalWorkspacePath>[];
}

export interface ParentWorkspaceReservationRequest {
	reservationId: string;
	workspace: Readonly<WorkspaceIdentity>;
}

export interface ParentWorkspaceReservation {
	readonly token: string;
	readonly leases: readonly Readonly<WorkspaceLeaseRecord>[];
}

type InternalLeaseKind = "file" | "workspace";

interface LeaseOwner {
	readonly kind: WorkspaceLeaseOwnerKind;
	readonly key: string;
	readonly agentId?: SubAgentId;
	readonly agentName?: string;
	readonly reservationId?: string;
	readonly reservationToken?: string;
}

interface HeldWorkspaceLease {
	readonly owner: LeaseOwner;
	readonly kind: InternalLeaseKind;
	readonly workspaceKey: string;
	readonly canonicalPath?: string;
	readonly relativePath?: string;
	readonly provisionalNamespace?: string;
	readonly acquiredAt: number;
}

interface NormalizedWorkspace {
	readonly root: string;
	readonly key: string;
}

interface NormalizedTarget {
	readonly workspaceKey: string;
	readonly canonicalPath: string;
	readonly relativePath: string;
	readonly exists: boolean;
	readonly provisionalNamespace?: string;
}

const GENERATION_PREFIX = "sag1-";
const AGENT_ID_PREFIX = "sa1-";

function invalidLease(message: string): never {
	throw new WorkspaceLeaseManagerError("invalid_lease_request", message);
}

function requireBoundedText(value: unknown, label: string, maxChars: number): string {
	if (typeof value !== "string" || value.length === 0 || value.length > maxChars || value.includes("\0")) {
		invalidLease(`${label} is invalid`);
	}
	return value;
}

function normalizeGeneration(value: unknown): SessionGeneration {
	const generation = requireBoundedText(value, "session generation", 96);
	if (!generation.startsWith(GENERATION_PREFIX) || generation.length === GENERATION_PREFIX.length) {
		invalidLease("The session generation is invalid");
	}
	return generation;
}

function normalizeNonce(value: string): string {
	const normalized = String(value).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
	if (!normalized) invalidLease("Could not create an opaque parent reservation token");
	return normalized;
}

function normalizeWorkspace(
	workspace: Readonly<WorkspaceIdentity>,
	authorizedRoot: string,
): NormalizedWorkspace {
	if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
		invalidLease("A shared workspace identity is required");
	}
	if (
		workspace.mode !== "shared" ||
		workspace.root !== authorizedRoot ||
		workspace.key !== `shared:${authorizedRoot}` ||
		workspace.branch !== undefined
	) {
		invalidLease("The shared workspace identity is invalid");
	}
	return Object.freeze({ root: authorizedRoot, key: workspace.key });
}

function isSafeRelativePath(path: string): boolean {
	return (
		path.length > 0 &&
		!isAbsolute(path) &&
		path !== ".." &&
		!path.startsWith(`..${sep}`)
	);
}

function filesystemErrorCode(error: unknown): string | undefined {
	return error && typeof error === "object" && "code" in error
		? String((error as { code?: unknown }).code ?? "")
		: undefined;
}

function isMissingFilesystemError(error: unknown): boolean {
	const code = filesystemErrorCode(error);
	return code === "ENOENT" || code === "ENOTDIR";
}

/** Revalidate resolver metadata synchronously at the atomic claim boundary. */
function revalidateTarget(target: NormalizedTarget): void {
	if (target.exists) {
		try {
			if (realpathSync(target.canonicalPath) !== target.canonicalPath) {
				invalidLease("The canonical workspace target changed before its lease claim");
			}
			return;
		} catch (error) {
			if (error instanceof WorkspaceLeaseManagerError) throw error;
			invalidLease("The canonical workspace target changed before its lease claim");
		}
	}

	try {
		realpathSync(target.canonicalPath);
		invalidLease("The missing workspace target now exists and must be resolved again");
	} catch (error) {
		if (error instanceof WorkspaceLeaseManagerError) throw error;
		if (!isMissingFilesystemError(error)) {
			invalidLease("The missing workspace target cannot be revalidated");
		}
	}

	const missingSegments: string[] = [];
	let cursor = target.canonicalPath;
	while (true) {
		let exists = true;
		try {
			lstatSync(cursor);
		} catch (error) {
			if (!isMissingFilesystemError(error)) {
				invalidLease("The missing workspace target cannot be revalidated");
			}
			exists = false;
		}
		if (exists) {
			let canonicalAncestor: string;
			try {
				canonicalAncestor = realpathSync(cursor);
			} catch {
				invalidLease("The missing workspace target has an unresolved component");
			}
			if (!statSync(canonicalAncestor).isDirectory()) {
				invalidLease("The missing workspace target parent is not a directory");
			}
			const reconstructed = resolve(canonicalAncestor, ...missingSegments.reverse());
			if (
				reconstructed !== target.canonicalPath ||
				canonicalAncestor !== target.provisionalNamespace
			) {
				invalidLease("The missing workspace target changed before its lease claim");
			}
			return;
		}
		const parent = dirname(cursor);
		if (parent === cursor) invalidLease("The missing workspace target has no existing parent");
		missingSegments.push(basename(cursor));
		cursor = parent;
	}
}

function normalizeTarget(
	workspace: NormalizedWorkspace,
	target: Readonly<CanonicalWorkspacePath>,
	revalidate = true,
): NormalizedTarget {
	if (!target || typeof target !== "object" || Array.isArray(target)) {
		invalidLease("A canonical workspace target is required");
	}
	if (
		target.workspaceKey !== workspace.key ||
		typeof target.path !== "string" ||
		!isAbsolute(target.path) ||
		!isPathWithinRoot(workspace.root, target.path)
	) {
		invalidLease("The canonical workspace target does not belong to the requested workspace");
	}
	const expectedRelativePath = relative(workspace.root, target.path);
	if (
		typeof target.relativePath !== "string" ||
		target.relativePath !== expectedRelativePath ||
		!isSafeRelativePath(target.relativePath) ||
		typeof target.exists !== "boolean"
	) {
		invalidLease("The canonical workspace target metadata is inconsistent");
	}
	let provisionalNamespace: string | undefined;
	if (target.provisionalNamespace !== undefined) {
		if (
			target.exists ||
			typeof target.provisionalNamespace !== "string" ||
			!isAbsolute(target.provisionalNamespace) ||
			!isPathWithinRoot(workspace.root, target.provisionalNamespace) ||
			!isPathWithinRoot(target.provisionalNamespace, target.path)
		) {
			invalidLease("The provisional workspace namespace is invalid");
		}
		provisionalNamespace = target.provisionalNamespace;
	}
	if (!target.exists && provisionalNamespace === undefined) {
		invalidLease("A missing canonical workspace target requires its provisional namespace");
	}
	const normalized = Object.freeze({
		workspaceKey: workspace.key,
		canonicalPath: target.path,
		relativePath: target.relativePath,
		exists: target.exists,
		...(provisionalNamespace ? { provisionalNamespace } : {}),
	});
	if (revalidate) revalidateTarget(normalized);
	return normalized;
}

function normalizeTargets(
	workspace: NormalizedWorkspace,
	targets: readonly Readonly<CanonicalWorkspacePath>[],
	revalidate = true,
): readonly NormalizedTarget[] {
	if (!Array.isArray(targets) || targets.length > SUB_AGENT_BOUNDS.writeScopePaths) {
		invalidLease(`A file claim must contain at most ${SUB_AGENT_BOUNDS.writeScopePaths} targets`);
	}
	const byPath = new Map<string, NormalizedTarget>();
	for (const target of targets) {
		const normalized = normalizeTarget(workspace, target, revalidate);
		const previous = byPath.get(normalized.canonicalPath);
		if (
			previous &&
			(previous.relativePath !== normalized.relativePath ||
				previous.provisionalNamespace !== normalized.provisionalNamespace)
		) {
			invalidLease("Duplicate canonical targets contain inconsistent metadata");
		}
		byPath.set(normalized.canonicalPath, normalized);
	}
	return Object.freeze(
		[...byPath.values()].sort((left, right) =>
			left.canonicalPath < right.canonicalPath
				? -1
				: left.canonicalPath > right.canonicalPath
					? 1
					: 0,
		),
	);
}

function publicKind(lease: HeldWorkspaceLease): WorkspaceLeaseKind {
	if (lease.owner.kind === "child") return lease.kind;
	return lease.kind === "file" ? "parent-file" : "parent-workspace";
}

function publicRecord(lease: HeldWorkspaceLease): Readonly<WorkspaceLeaseRecord> {
	return Object.freeze({
		kind: publicKind(lease),
		workspaceKey: "shared",
		ownerAgentId: lease.owner.agentId,
		path: lease.relativePath,
		acquiredAt: lease.acquiredAt,
	});
}

function compareRecords(left: WorkspaceLeaseRecord, right: WorkspaceLeaseRecord): number {
	if (left.workspaceKey !== right.workspaceKey) return left.workspaceKey.localeCompare(right.workspaceKey);
	if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
	return (left.path ?? "").localeCompare(right.path ?? "");
}

function leasesConflict(
	requestedKind: InternalLeaseKind,
	requestedTarget: NormalizedTarget | undefined,
	held: HeldWorkspaceLease,
): boolean {
	if (requestedKind === "workspace" || held.kind === "workspace") return true;
	if (requestedTarget?.canonicalPath === held.canonicalPath) return true;
	if (
		requestedTarget?.provisionalNamespace &&
		held.canonicalPath &&
		isPathWithinRoot(requestedTarget.provisionalNamespace, held.canonicalPath)
	) {
		return true;
	}
	if (
		held.provisionalNamespace &&
		requestedTarget?.canonicalPath &&
		isPathWithinRoot(held.provisionalNamespace, requestedTarget.canonicalPath)
	) {
		return true;
	}
	return false;
}

/**
 * Synchronous, generation-scoped ownership coordinator over already canonical
 * workspace identities. Canonicalization performs filesystem I/O separately;
 * each claim below checks and commits without an await point, so multi-path
 * acquisition is non-blocking and all-or-nothing.
 */
export class WorkspaceLeaseManager {
	readonly generation: SessionGeneration;

	#now: () => number;
	#nonce: () => string;
	#workspaceRoot: string;
	#agentPrefix: string;
	#parentSequence = 0;
	#closed = false;
	#byWorkspace = new Map<string, Set<HeldWorkspaceLease>>();
	#byOwner = new Map<string, Set<HeldWorkspaceLease>>();
	#parentOwnerByReservationId = new Map<string, string>();
	#parentOwnerByToken = new Map<string, string>();

	constructor(options: WorkspaceLeaseManagerOptions) {
		if (!options || typeof options !== "object" || Array.isArray(options)) {
			invalidLease("Workspace lease manager options are required");
		}
		this.generation = normalizeGeneration(options.generation);
		this.#agentPrefix = `${AGENT_ID_PREFIX}${this.generation.slice(GENERATION_PREFIX.length)}-`;
		this.#now = options.now ?? Date.now;
		this.#nonce = options.nonce ?? randomUUID;
		try {
			this.#workspaceRoot = realpathSync(
				resolve(requireBoundedText(options.workspaceRoot, "workspace root", SUB_AGENT_BOUNDS.contextPathChars)),
			);
			if (!statSync(this.#workspaceRoot).isDirectory()) {
				invalidLease("The workspace lease root is not a directory");
			}
		} catch (error) {
			if (error instanceof WorkspaceLeaseManagerError) throw error;
			invalidLease("The workspace lease root is unavailable");
		}
	}

	get closed(): boolean {
		return this.#closed;
	}

	claimChildFiles(request: ChildFileLeaseRequest): readonly Readonly<WorkspaceLeaseRecord>[] {
		this.#assertOpen();
		const owner = this.#childOwner(request.agentId, request.agentName);
		const workspace = normalizeWorkspace(request.workspace, this.#workspaceRoot);
		const targets = normalizeTargets(workspace, request.targets);
		return this.#claim(owner, workspace, "file", targets);
	}

	claimChildWorkspace(request: ChildWorkspaceLeaseRequest): readonly Readonly<WorkspaceLeaseRecord>[] {
		this.#assertOpen();
		const owner = this.#childOwner(request.agentId, request.agentName);
		const workspace = normalizeWorkspace(request.workspace, this.#workspaceRoot);
		return this.#claim(owner, workspace, "workspace", [undefined]);
	}

	/**
	 * Replace one same-owner provisional missing-path lease with the verified
	 * existing identity created at that exact canonical path. This only narrows
	 * ownership; it never retargets or acquires a lease after mutation.
	 */
	reconcileChildFile(
		request: ChildFileLeaseReconciliationRequest,
	): readonly Readonly<WorkspaceLeaseRecord>[] {
		this.#assertOpen();
		const owner = this.#childOwner(request.agentId, request.agentName);
		const workspace = normalizeWorkspace(request.workspace, this.#workspaceRoot);
		const target = normalizeTarget(workspace, request.target);
		if (!target.exists || target.provisionalNamespace !== undefined) {
			invalidLease("A reconciled child file target must already exist canonically");
		}

		const owned = this.#byOwner.get(owner.key);
		const held = owned
			? [...owned].find((lease) =>
				lease.kind === "file" &&
				lease.workspaceKey === workspace.key &&
				lease.canonicalPath === target.canonicalPath,
			)
			: undefined;
		if (!held) {
			invalidLease("The child does not own the exact file lease being reconciled");
		}
		if (held.provisionalNamespace === undefined) return this.#listOwner(owner.key);

		const workspaceLeases = this.#byWorkspace.get(workspace.key);
		if (!workspaceLeases?.has(held)) {
			throw new Error("Workspace lease owner/workspace indexes disagree");
		}
		const {
			provisionalNamespace: _provisionalNamespace,
			...stableHeld
		} = held;
		const replacement: HeldWorkspaceLease = {
			...stableHeld,
			canonicalPath: target.canonicalPath,
			relativePath: target.relativePath,
		};
		owned!.delete(held);
		owned!.add(replacement);
		workspaceLeases.delete(held);
		workspaceLeases.add(replacement);
		return this.#listOwner(owner.key);
	}

	reserveParentFiles(request: ParentFileReservationRequest): Readonly<ParentWorkspaceReservation> {
		this.#assertOpen();
		const reservationId = this.#normalizeParentReservationId(request.reservationId);
		this.#assertUnusedParentReservation(reservationId);
		const workspace = normalizeWorkspace(request.workspace, this.#workspaceRoot);
		const targets = normalizeTargets(workspace, request.targets);
		if (targets.length === 0) invalidLease("A parent file reservation requires at least one target");
		const owner = this.#createParentOwner(reservationId);
		const leases = this.#claim(owner, workspace, "file", targets);
		this.#registerParentReservation(owner);
		return Object.freeze({ token: owner.reservationToken!, leases });
	}

	reserveParentWorkspace(request: ParentWorkspaceReservationRequest): Readonly<ParentWorkspaceReservation> {
		this.#assertOpen();
		const reservationId = this.#normalizeParentReservationId(request.reservationId);
		this.#assertUnusedParentReservation(reservationId);
		const workspace = normalizeWorkspace(request.workspace, this.#workspaceRoot);
		const owner = this.#createParentOwner(reservationId);
		const leases = this.#claim(owner, workspace, "workspace", [undefined]);
		this.#registerParentReservation(owner);
		return Object.freeze({ token: owner.reservationToken!, leases });
	}

	listChildLeases(agentId: SubAgentId): readonly Readonly<WorkspaceLeaseRecord>[] {
		const owner = this.#childOwner(agentId, "agent");
		return this.#listOwner(owner.key);
	}

	listLeases(): readonly Readonly<WorkspaceLeaseRecord>[] {
		return Object.freeze(
			[...this.#byOwner.values()]
				.flatMap((leases) => [...leases].map(publicRecord))
				.sort(compareRecords),
		);
	}

	releaseChildFileLeases(
		agentId: SubAgentId,
		workspace: Readonly<WorkspaceIdentity>,
		targets: readonly Readonly<CanonicalWorkspacePath>[],
	): readonly Readonly<WorkspaceLeaseRecord>[] {
		const owner = this.#childOwner(agentId, "agent");
		const normalizedWorkspace = normalizeWorkspace(workspace, this.#workspaceRoot);
		const normalizedTargets = normalizeTargets(normalizedWorkspace, targets, false);
		const paths = new Set(normalizedTargets.map((target) => target.canonicalPath));
		return this.#release(owner.key, (lease) =>
			lease.kind === "file" &&
			lease.workspaceKey === normalizedWorkspace.key &&
			paths.has(lease.canonicalPath ?? ""),
		);
	}

	releaseChildWorkspaceLease(
		agentId: SubAgentId,
		workspace: Readonly<WorkspaceIdentity>,
	): readonly Readonly<WorkspaceLeaseRecord>[] {
		const owner = this.#childOwner(agentId, "agent");
		const normalizedWorkspace = normalizeWorkspace(workspace, this.#workspaceRoot);
		return this.#release(owner.key, (lease) =>
			lease.kind === "workspace" && lease.workspaceKey === normalizedWorkspace.key,
		);
	}

	releaseChildLeases(agentId: SubAgentId): readonly Readonly<WorkspaceLeaseRecord>[] {
		const owner = this.#childOwner(agentId, "agent");
		return this.#release(owner.key, () => true);
	}

	releaseParentReservation(token: string): readonly Readonly<WorkspaceLeaseRecord>[] {
		const normalizedToken = requireBoundedText(
			token,
			"parent reservation token",
			SUB_AGENT_BOUNDS.agentIdChars,
		);
		const ownerKey = this.#parentOwnerByToken.get(normalizedToken);
		if (!ownerKey) return Object.freeze([]);
		const owned = this.#byOwner.get(ownerKey);
		const firstLease = owned ? owned.values().next().value as HeldWorkspaceLease | undefined : undefined;
		const reservationId = firstLease?.owner.reservationId;
		const released = this.#release(ownerKey, () => true);
		this.#parentOwnerByToken.delete(normalizedToken);
		if (reservationId) this.#parentOwnerByReservationId.delete(reservationId);
		return released;
	}

	close(): readonly Readonly<WorkspaceLeaseRecord>[] {
		if (this.#closed) return Object.freeze([]);
		const released = this.listLeases();
		this.#closed = true;
		this.#byWorkspace.clear();
		this.#byOwner.clear();
		this.#parentOwnerByReservationId.clear();
		this.#parentOwnerByToken.clear();
		return released;
	}

	/** Expensive explicit assertion surface used by deterministic safety tests. */
	assertInvariants(): void {
		for (const [ownerKey, owned] of this.#byOwner) {
			for (const lease of owned) {
				if (lease.owner.key !== ownerKey || !this.#byWorkspace.get(lease.workspaceKey)?.has(lease)) {
					throw new Error("Workspace lease owner/workspace indexes disagree");
				}
			}
		}
		for (const [reservationId, ownerKey] of this.#parentOwnerByReservationId) {
			const owned = this.#byOwner.get(ownerKey);
			const firstLease = owned ? owned.values().next().value as HeldWorkspaceLease | undefined : undefined;
			if (
				!firstLease ||
				firstLease.owner.kind !== "parent" ||
				firstLease.owner.reservationId !== reservationId ||
				this.#parentOwnerByToken.get(firstLease.owner.reservationToken!) !== ownerKey
			) {
				throw new Error("Parent reservation indexes disagree");
			}
		}
		for (const [token, ownerKey] of this.#parentOwnerByToken) {
			const owned = this.#byOwner.get(ownerKey);
			const firstLease = owned ? owned.values().next().value as HeldWorkspaceLease | undefined : undefined;
			if (
				!firstLease ||
				firstLease.owner.reservationToken !== token ||
				this.#parentOwnerByReservationId.get(firstLease.owner.reservationId!) !== ownerKey
			) {
				throw new Error("Parent reservation token index disagrees");
			}
		}
		for (const [workspaceKey, leases] of this.#byWorkspace) {
			const entries = [...leases];
			for (const lease of entries) {
				if (lease.workspaceKey !== workspaceKey || !this.#byOwner.get(lease.owner.key)?.has(lease)) {
					throw new Error("Workspace lease workspace/owner indexes disagree");
				}
			}
			for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
				for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
					const left = entries[leftIndex]!;
					const right = entries[rightIndex]!;
					if (
						left.owner.key !== right.owner.key &&
						leasesConflict(
							left.kind,
							left.kind === "file"
								? {
									workspaceKey: left.workspaceKey,
									canonicalPath: left.canonicalPath!,
									relativePath: left.relativePath!,
									provisionalNamespace: left.provisionalNamespace,
								}
								: undefined,
							right,
						)
					) {
						throw new Error("Conflicting workspace leases coexist");
					}
				}
			}
		}
	}

	#assertOpen(): void {
		if (this.#closed) throw new WorkspaceLeaseManagerClosedError();
	}

	#childOwner(agentId: SubAgentId, agentName: string): LeaseOwner {
		const id = requireBoundedText(agentId, "sub-agent id", SUB_AGENT_BOUNDS.agentIdChars);
		if (!id.startsWith(this.#agentPrefix)) {
			throw new WorkspaceLeaseManagerError(
				"stale_agent",
				"The sub-agent id does not belong to this workspace lease generation",
			);
		}
		const name = requireBoundedText(agentName, "sub-agent name", SUB_AGENT_BOUNDS.nameChars);
		return Object.freeze({ kind: "child", key: `child:${id}`, agentId: id, agentName: name });
	}

	#normalizeParentReservationId(reservationId: string): string {
		return requireBoundedText(
			reservationId,
			"parent reservation id",
			SUB_AGENT_BOUNDS.toolCallIdChars,
		);
	}

	#assertUnusedParentReservation(reservationId: string): void {
		if (this.#parentOwnerByReservationId.has(reservationId)) {
			throw new WorkspaceLeaseManagerError(
				"duplicate_parent_reservation",
				"The parent mutation already has an active workspace reservation",
			);
		}
	}

	#createParentOwner(reservationId: string): LeaseOwner {
		this.#parentSequence += 1;
		if (!Number.isSafeInteger(this.#parentSequence)) {
			invalidLease("The parent reservation sequence exceeds its supported range");
		}
		const token = [
			"pr1",
			this.generation.slice(GENERATION_PREFIX.length),
			this.#parentSequence.toString(36),
			normalizeNonce(this.#nonce()),
		].join("-");
		if (token.length > SUB_AGENT_BOUNDS.agentIdChars || this.#parentOwnerByToken.has(token)) {
			invalidLease("Could not create a unique parent reservation token");
		}
		return Object.freeze({
			kind: "parent",
			key: `parent:${token}`,
			reservationId,
			reservationToken: token,
		});
	}

	#registerParentReservation(owner: LeaseOwner): void {
		this.#parentOwnerByReservationId.set(owner.reservationId!, owner.key);
		this.#parentOwnerByToken.set(owner.reservationToken!, owner.key);
	}

	#claim(
		owner: LeaseOwner,
		workspace: NormalizedWorkspace,
		kind: InternalLeaseKind,
		targets: readonly (NormalizedTarget | undefined)[],
	): readonly Readonly<WorkspaceLeaseRecord>[] {
		const heldInWorkspace = this.#byWorkspace.get(workspace.key) ?? new Set<HeldWorkspaceLease>();
		const requestedKind: WorkspaceLeaseKind = owner.kind === "child"
			? kind
			: kind === "file"
				? "parent-file"
				: "parent-workspace";

		for (const target of targets) {
			for (const held of heldInWorkspace) {
				if (held.owner.key === owner.key || !leasesConflict(kind, target, held)) continue;
				throw new WorkspaceLeaseConflictError({
					requestedKind,
					workspaceKey: "shared",
					path: target?.relativePath,
					ownerKind: held.owner.kind,
					ownerAgentId: held.owner.agentId,
					ownerAgentName: held.owner.agentName,
					heldKind: publicKind(held),
					heldPath: held.relativePath,
				});
			}
		}

		const acquired: HeldWorkspaceLease[] = [];
		for (const target of targets) {
			const existing = [...(this.#byOwner.get(owner.key) ?? [])].find((lease) =>
				lease.workspaceKey === workspace.key &&
				lease.kind === kind &&
				(kind === "workspace" || lease.canonicalPath === target?.canonicalPath),
			);
			if (existing) {
				acquired.push(existing);
				continue;
			}
			const acquiredAt = this.#now();
			if (!Number.isFinite(acquiredAt) || acquiredAt < 0) {
				invalidLease("The workspace lease timestamp is invalid");
			}
			acquired.push({
				owner,
				kind,
				workspaceKey: workspace.key,
				canonicalPath: target?.canonicalPath,
				relativePath: target?.relativePath,
				provisionalNamespace: target?.provisionalNamespace,
				acquiredAt,
			});
		}

		if (acquired.length === 0) return Object.freeze([]);

		let workspaceLeases = this.#byWorkspace.get(workspace.key);
		if (!workspaceLeases) {
			workspaceLeases = new Set();
			this.#byWorkspace.set(workspace.key, workspaceLeases);
		}
		let ownerLeases = this.#byOwner.get(owner.key);
		if (!ownerLeases) {
			ownerLeases = new Set();
			this.#byOwner.set(owner.key, ownerLeases);
		}
		for (const lease of acquired) {
			workspaceLeases.add(lease);
			ownerLeases.add(lease);
		}
		return Object.freeze(acquired.map(publicRecord).sort(compareRecords));
	}

	#listOwner(ownerKey: string): readonly Readonly<WorkspaceLeaseRecord>[] {
		return Object.freeze(
			[...(this.#byOwner.get(ownerKey) ?? [])]
				.map(publicRecord)
				.sort(compareRecords),
		);
	}

	#release(
		ownerKey: string,
		shouldRelease: (lease: HeldWorkspaceLease) => boolean,
	): readonly Readonly<WorkspaceLeaseRecord>[] {
		const owned = this.#byOwner.get(ownerKey);
		if (!owned) return Object.freeze([]);
		const released: WorkspaceLeaseRecord[] = [];
		for (const lease of [...owned]) {
			if (!shouldRelease(lease)) continue;
			released.push(publicRecord(lease));
			owned.delete(lease);
			const workspace = this.#byWorkspace.get(lease.workspaceKey);
			workspace?.delete(lease);
			if (workspace?.size === 0) this.#byWorkspace.delete(lease.workspaceKey);
		}
		if (owned.size === 0) this.#byOwner.delete(ownerKey);
		return Object.freeze(released.sort(compareRecords));
	}
}
