import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
	SessionGeneration,
	SubAgentId,
	WorkspaceIdentity,
} from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";

const GENERATION_PREFIX = "sag1-";
const AGENT_ID_PREFIX = "sa1-";
const GENERATION = /^sag1-[A-Za-z0-9_-]{1,80}$/u;
const WORKSPACE_ID = /^saw1-[A-Za-z0-9_-]{32,180}$/u;
const WORKSPACE_KEY = /^sawk1-[A-Za-z0-9_-]{32,180}$/u;
const GENERATED_BRANCH = /^refs\/heads\/pi\/sub-agents\/[0-9a-f]{16}\/saw1-[A-Za-z0-9_-]{32,180}$/u;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export type WorkspaceRegistryErrorCode =
	| "invalid_registry"
	| "invalid_workspace"
	| "duplicate_workspace"
	| "owner_mismatch"
	| "workspace_not_registered"
	| "registry_closed"
	| "stale_agent";

export class WorkspaceRegistryError extends Error {
	readonly code: WorkspaceRegistryErrorCode;

	constructor(code: WorkspaceRegistryErrorCode, message: string) {
		super(message);
		this.name = "WorkspaceRegistryError";
		this.code = code;
	}
}

export class WorkspaceRegistryClosedError extends WorkspaceRegistryError {
	constructor() {
		super("registry_closed", "The workspace registry generation is closed");
		this.name = "WorkspaceRegistryClosedError";
	}
}

export interface WorkspaceRegistryOptions {
	readonly generation: SessionGeneration;
	readonly workspaceRoot: string;
	/** Injectable only so deterministic offline tests need no ambient randomness. */
	readonly nonce?: () => string;
}

export interface WorktreeWorkspaceRegistration {
	readonly workspaceId: string;
	readonly root: string;
	readonly branch: string;
	readonly baseCommit: string;
	readonly ownerAgentId: SubAgentId;
	/** Normally omitted. Provisioning code may supply its already allocated opaque key. */
	readonly key?: string;
}

/** Internal coordinator record. Its identity contains paths and is never a parent-facing summary. */
export interface RegisteredWorkspace {
	readonly identity: Readonly<WorkspaceIdentity>;
	readonly ownerAgentId?: SubAgentId;
	/** Bounded label safe for lease/status display; never derived from a filesystem path. */
	readonly displayLabel: string;
}

export interface WorkspaceRegistryEntrySummary {
	readonly mode: "shared" | "worktree";
	readonly displayLabel: string;
	readonly workspaceId?: string;
	readonly ownerAgentId?: SubAgentId;
}

function fail(code: WorkspaceRegistryErrorCode, message: string): never {
	throw new WorkspaceRegistryError(code, message);
}

function text(value: unknown, label: string, max: number): string {
	if (typeof value !== "string" || value.length === 0 || value.length > max || value.includes("\0")) {
		fail("invalid_workspace", `${label} is invalid`);
	}
	return value;
}

function generation(value: unknown): SessionGeneration {
	if (typeof value !== "string" || !GENERATION.test(value)) {
		fail("invalid_registry", "The workspace registry generation is invalid");
	}
	return value;
}

function canonicalDirectory(value: unknown, label: string): string {
	const input = text(value, label, SUB_AGENT_BOUNDS.contextPathChars);
	try {
		const canonical = realpathSync(resolve(input));
		if (!isAbsolute(canonical) || !statSync(canonical).isDirectory()) throw new Error("not a directory");
		return canonical;
	} catch (error) {
		if (error instanceof WorkspaceRegistryError) throw error;
		fail("invalid_workspace", `${label} is unavailable`);
	}
}

function pathsOverlap(left: string, right: string): boolean {
	const leftToRight = relative(left, right);
	const rightToLeft = relative(right, left);
	const contained = (value: string) => value === "" || (!isAbsolute(value) && value !== ".." && !value.startsWith(`..${sep}`));
	return contained(leftToRight) || contained(rightToLeft);
}

function ownKeys(value: object): readonly string[] {
	return Object.keys(value).sort();
}

function exactKeys(value: object, required: readonly string[], optional: readonly string[] = []): boolean {
	const allowed = new Set([...required, ...optional]);
	const keys = ownKeys(value);
	return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key));
}

function frozenSummary(record: RegisteredWorkspace): Readonly<WorkspaceRegistryEntrySummary> {
	return Object.freeze({
		mode: record.identity.mode,
		displayLabel: record.displayLabel,
		...(record.identity.workspaceId ? { workspaceId: record.identity.workspaceId } : {}),
		...(record.ownerAgentId ? { ownerAgentId: record.ownerAgentId } : {}),
	});
}

/**
 * Generation-owned in-memory authority for the one shared workspace and any
 * exact child-owned linked worktrees. Registration is intentionally separate
 * from provisioning: this class performs no Git operation and adopts nothing.
 */
export class WorkspaceRegistry {
	readonly generation: SessionGeneration;
	readonly sharedIdentity: Readonly<WorkspaceIdentity>;

	#nonce: () => string;
	#agentPrefix: string;
	#closed = false;
	#byKey = new Map<string, RegisteredWorkspace>();
	#byRoot = new Map<string, RegisteredWorkspace>();
	#byWorkspaceId = new Map<string, RegisteredWorkspace>();
	#byOwner = new Map<SubAgentId, RegisteredWorkspace>();

	constructor(options: WorkspaceRegistryOptions) {
		if (!options || typeof options !== "object" || Array.isArray(options)) {
			fail("invalid_registry", "Workspace registry options are required");
		}
		this.generation = generation(options.generation);
		this.#agentPrefix = `${AGENT_ID_PREFIX}${this.generation.slice(GENERATION_PREFIX.length)}-`;
		this.#nonce = options.nonce ?? randomUUID;
		const root = canonicalDirectory(options.workspaceRoot, "The shared workspace root");
		this.sharedIdentity = Object.freeze<WorkspaceIdentity>({
			mode: "shared",
			root,
			key: `shared:${root}`,
		});
		const shared = Object.freeze<RegisteredWorkspace>({
			identity: this.sharedIdentity,
			displayLabel: "shared",
		});
		this.#byKey.set(this.sharedIdentity.key, shared);
		this.#byRoot.set(root, shared);
	}

	get closed(): boolean {
		return this.#closed;
	}

	get sharedRoot(): string {
		return this.sharedIdentity.root;
	}

	registerWorktree(input: WorktreeWorkspaceRegistration): Readonly<WorkspaceIdentity> {
		this.#assertOpen();
		if (
			!input ||
			typeof input !== "object" ||
			Array.isArray(input) ||
			!exactKeys(input, ["workspaceId", "root", "branch", "baseCommit", "ownerAgentId"], ["key"])
		) {
			fail("invalid_workspace", "The worktree registration is malformed");
		}
		const workspaceId = text(input.workspaceId, "The worktree workspace id", SUB_AGENT_BOUNDS.agentIdChars);
		if (!WORKSPACE_ID.test(workspaceId)) fail("invalid_workspace", "The worktree workspace id is invalid");
		const root = canonicalDirectory(input.root, "The worktree root");
		const branch = text(input.branch, "The worktree branch", 512);
		const branchMatch = GENERATED_BRANCH.exec(branch);
		if (!branchMatch || !branch.endsWith(`/${workspaceId}`)) {
			fail("invalid_workspace", "The worktree branch is not the exact generated ref for its workspace id");
		}
		const baseCommit = text(input.baseCommit, "The worktree base commit", 64);
		if (!OBJECT_ID.test(baseCommit)) fail("invalid_workspace", "The worktree base commit is invalid");
		const ownerAgentId = this.#agent(input.ownerAgentId);
		const key = input.key === undefined ? this.#newKey() : text(input.key, "The workspace key", 200);
		if (!WORKSPACE_KEY.test(key)) fail("invalid_workspace", "The worktree workspace key is invalid");

		if (
			this.#byKey.has(key) ||
			[...this.#byRoot.keys()].some((registeredRoot) => pathsOverlap(registeredRoot, root)) ||
			this.#byWorkspaceId.has(workspaceId) ||
			this.#byOwner.has(ownerAgentId)
		) {
			fail("duplicate_workspace", "The worktree key, root, workspace id, or owner is already registered");
		}

		const identity = Object.freeze<WorkspaceIdentity>({
			mode: "worktree",
			root,
			key,
			workspaceId,
			branch,
			baseCommit,
		});
		const record = Object.freeze<RegisteredWorkspace>({
			identity,
			ownerAgentId,
			displayLabel: `worktree:${workspaceId}`,
		});
		this.#byKey.set(key, record);
		this.#byRoot.set(root, record);
		this.#byWorkspaceId.set(workspaceId, record);
		this.#byOwner.set(ownerAgentId, record);
		return identity;
	}

	/** Resolve only the exact frozen identity currently owned by this registry. */
	authorize(
		workspace: Readonly<WorkspaceIdentity>,
		ownerAgentId?: SubAgentId,
	): Readonly<RegisteredWorkspace> {
		this.#assertOpen();
		if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
			fail("invalid_workspace", "A workspace identity is required");
		}
		const record = typeof workspace.key === "string" ? this.#byKey.get(workspace.key) : undefined;
		if (!record) fail("workspace_not_registered", "The workspace identity is not registered");

		if (record.identity.mode === "shared") {
			// Released callers obtain this structurally identical frozen identity from paths.ts.
			if (
				!exactKeys(workspace, ["mode", "root", "key"]) ||
				workspace.mode !== "shared" ||
				workspace.root !== record.identity.root ||
				workspace.key !== record.identity.key
			) {
				fail("invalid_workspace", "The shared workspace identity does not exactly match the registry");
			}
			if (ownerAgentId !== undefined) this.#agent(ownerAgentId);
			return record;
		}

		if (
			workspace !== record.identity ||
			!Object.isFrozen(workspace) ||
			!exactKeys(workspace, ["mode", "root", "key", "workspaceId", "branch", "baseCommit"])
		) {
			fail("invalid_workspace", "The worktree identity is forged or no longer exact");
		}
		if (ownerAgentId === undefined || this.#agent(ownerAgentId) !== record.ownerAgentId) {
			fail("owner_mismatch", "The worktree identity is not owned by the exact sub-agent");
		}
		return record;
	}

	lookupByKey(key: string): Readonly<RegisteredWorkspace> | undefined {
		this.#assertOpen();
		return this.#byKey.get(text(key, "The workspace key", 200));
	}

	lookupByWorkspaceId(workspaceId: string): Readonly<RegisteredWorkspace> | undefined {
		this.#assertOpen();
		return this.#byWorkspaceId.get(text(workspaceId, "The workspace id", SUB_AGENT_BOUNDS.agentIdChars));
	}

	lookupByOwner(ownerAgentId: SubAgentId): Readonly<RegisteredWorkspace> | undefined {
		this.#assertOpen();
		return this.#byOwner.get(this.#agent(ownerAgentId));
	}

	list(): readonly Readonly<WorkspaceRegistryEntrySummary>[] {
		this.#assertOpen();
		return Object.freeze(
			[...this.#byKey.values()]
				.map(frozenSummary)
				.sort((left, right) => left.displayLabel.localeCompare(right.displayLabel)),
		);
	}

	// Worktree identities intentionally have no per-entry unregister operation in
	// SA-802. Cooperative leases may still reference an identity, and dropping its
	// indexes would permit the same root to be re-registered under a fresh key.
	// The complete generation is released only by close(); later cleanup wiring
	// must prove lease quiescence before introducing any narrower retirement API.

	close(): readonly Readonly<WorkspaceRegistryEntrySummary>[] {
		if (this.#closed) return Object.freeze([]);
		const entries = this.list();
		this.#closed = true;
		this.#byKey.clear();
		this.#byRoot.clear();
		this.#byWorkspaceId.clear();
		this.#byOwner.clear();
		return entries;
	}

	#newKey(): string {
		for (let attempt = 0; attempt < 8; attempt += 1) {
			const suffix = String(this.#nonce()).replace(/[^A-Za-z0-9_-]/gu, "").slice(0, 180);
			if (!suffix) continue;
			const key = `sawk1-${suffix}`;
			if (WORKSPACE_KEY.test(key) && !this.#byKey.has(key)) return key;
		}
		fail("invalid_workspace", "Could not allocate a distinct opaque workspace key");
	}

	#agent(value: unknown): SubAgentId {
		const owner = text(value, "The worktree owner sub-agent id", SUB_AGENT_BOUNDS.agentIdChars);
		if (
			!owner.startsWith(this.#agentPrefix) ||
			owner.length === this.#agentPrefix.length ||
			!/^[A-Za-z0-9_-]+$/u.test(owner)
		) {
			fail("stale_agent", "The worktree owner does not belong to this registry generation");
		}
		return owner;
	}

	#assertOpen(): void {
		if (this.#closed) throw new WorkspaceRegistryClosedError();
	}
}
