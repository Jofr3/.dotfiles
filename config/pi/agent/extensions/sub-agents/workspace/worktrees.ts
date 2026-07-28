import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { SessionGeneration, SubAgentId, WorkspaceIdentity } from "../types.ts";
import type { WorkspaceRegistry } from "./registry.ts";
import type {
	RepositoryInspection,
	WorktreeCollectionSummary,
	WorktreeGitOperations,
	WorktreeInspection,
	WorktreeReconciliation,
} from "./worktree-git.ts";
import {
	computeWorktreeRepositoryKey,
	type GeneratedWorktreeIdentity,
	type WorktreeCatalogOptions,
	type WorktreeCatalogResult,
	type WorktreeFailureCategory,
	type WorktreeOwnershipRecordV1,
	type WorktreeRepositoryState,
	type WorktreeStateStoreApi,
	type WorktreeStateTransaction,
} from "./worktree-state.ts";

const DIGEST = /^[0-9a-f]{64}$/u;
const SESSION_GENERATION = /^sag1-[A-Za-z0-9_-]{1,80}$/u;
const SUB_AGENT_ID = /^sa1-[A-Za-z0-9_-]{1,195}$/u;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]{1,200}$/u;

export type WorktreeProvisionDisposition = "ready" | "retained" | "cleaned" | "uncertain";

/** Path-free result intended for parent/status surfaces. */
export interface WorktreeOutcomeSummary {
	readonly workspaceId: string;
	readonly branchRef: string;
	readonly baseCommit: string;
	readonly lastObservedCommit: string;
	readonly disposition: WorktreeProvisionDisposition;
}

/**
 * An approval subject, not a public status object. It intentionally contains the
 * exact canonical repository handle required to detect substitution at admission.
 */
export interface WorktreeWorkspacePlan {
	readonly version: 1;
	readonly repository: Readonly<RepositoryInspection>;
	readonly sourceGeneration: SessionGeneration;
	readonly childId: SubAgentId;
	readonly parentRelativeRoot: string;
	readonly relativeCwd?: string;
	readonly identity: Readonly<GeneratedWorktreeIdentity>;
	readonly approvalDigest: string;
}

export interface PrepareWorktreeOptions {
	readonly cwd: string;
	readonly trusted: boolean;
	readonly sourceGeneration: SessionGeneration;
	readonly childId: SubAgentId;
	/** Optional child cwd, relative to the logical root represented by cwd. */
	readonly relativeCwd?: string;
	readonly signal?: AbortSignal;
}

export interface ApprovedWorktreeAdmission {
	readonly approvalDigest: string;
	readonly correlationToken: string;
}

/** Opaque manager-issued handle used by internal retain/inspection operations. */
export interface WorktreeAllocationHandle {
	readonly workspaceId: string;
	readonly correlationToken: string;
}

export interface WorktreeProvisionResult {
	readonly summary: Readonly<WorktreeOutcomeSummary>;
	/** Present only after exact registry registration. Internal coordinator value. */
	readonly workspace?: Readonly<WorkspaceIdentity>;
	/** Present while a protected ownership record remains. */
	readonly allocation?: Readonly<WorktreeAllocationHandle>;
	readonly relativeCwd?: string;
}

export interface WorktreeOwnedInspection {
	readonly summary: Readonly<WorktreeOutcomeSummary>;
	readonly registered: boolean;
	readonly exactOwnership: boolean;
	readonly clean: boolean;
}

export interface WorktreeOwnedChangeCollection {
	readonly summary: Readonly<WorktreeOutcomeSummary>;
	readonly registered: boolean;
	readonly exactOwnership: boolean;
	readonly clean: boolean;
	readonly conflicted: boolean;
	readonly incomplete: boolean;
	readonly collection: Readonly<WorktreeCollectionSummary>;
}

export interface WorktreeCatalogChangeCollection extends WorktreeOwnedChangeCollection {
	readonly revision: number;
}

export interface CollectWorktreeCatalogChangesOptions {
	readonly workspaceId: string;
	readonly expectedRevision?: number;
	readonly signal?: AbortSignal;
}

export interface CreateWorktreeManagerOptions {
	readonly git: WorktreeGitOperations;
	readonly state: WorktreeStateStoreApi;
	readonly registry: Pick<WorkspaceRegistry, "registerWorktree" | "authorize">;
	readonly now?: () => Date;
}

interface AllocationInternal {
	readonly repository: Readonly<WorktreeRepositoryState>;
	readonly plan: Readonly<WorktreeWorkspacePlan>;
}

function fail(message: string): never {
	throw new TypeError(message);
}

function boundedText(value: unknown, label: string): string {
	if (typeof value !== "string" || !SAFE_TEXT.test(value) || Buffer.byteLength(value, "utf8") > 512) fail(`${label} is invalid`);
	return value;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new DOMException("Worktree provisioning was cancelled", "AbortError");
}

function isWithin(root: string, candidate: string): boolean {
	const rel = relative(root, candidate);
	return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function normalizeRelative(value: unknown, label: string, allowEmpty: boolean): string {
	if (typeof value !== "string" || value.includes("\0") || isAbsolute(value) || Buffer.byteLength(value, "utf8") > 16 * 1024) fail(`${label} is invalid`);
	const anchor = resolve(sep, "__pi_worktree_logical_root__");
	const candidate = resolve(anchor, value);
	if (!isWithin(anchor, candidate)) fail(`${label} escapes its root`);
	const normalized = relative(anchor, candidate);
	if (!allowEmpty && !normalized) fail(`${label} is empty`);
	return normalized;
}

function sameRepository(left: Readonly<RepositoryInspection>, right: Readonly<RepositoryInspection>): boolean {
	return left.trusted === true && right.trusted === true && left.insideWorkTree === true && right.insideWorkTree === true &&
		left.bare === false && right.bare === false && left.clean === true && right.clean === true &&
		left.topLevel === right.topLevel && left.commonDirectory === right.commonDirectory &&
		left.headCommit === right.headCommit && left.objectFormat === right.objectFormat &&
		left.configFingerprint === right.configFingerprint;
}

function planDigest(input: Omit<WorktreeWorkspacePlan, "approvalDigest">): string {
	return createHash("sha256").update(JSON.stringify({
		version: input.version,
		repository: input.repository,
		sourceGeneration: input.sourceGeneration,
		childId: input.childId,
		parentRelativeRoot: input.parentRelativeRoot,
		relativeCwd: input.relativeCwd ?? null,
		identity: input.identity,
	}), "utf8").digest("hex");
}

function category(error: unknown): WorktreeFailureCategory {
	const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
	const name = error && typeof error === "object" && "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
	if (code === "cancelled" || name === "AbortError") return "cancelled";
	if (code === "materialization_failed") return "materialization-failed";
	if (code === "duplicate_workspace" || code === "owner_mismatch" || code === "invalid_workspace" || code === "stale_agent") return "ownership-mismatch";
	if (code.startsWith("git_") || code === "worktree_mismatch") return "git-failed";
	return "unknown";
}

function statusOf(inspection: WorktreeInspection | undefined): "unknown" | "clean" | "dirty" {
	if (inspection?.clean === true) return "clean";
	if (inspection?.clean === false) return "dirty";
	return "unknown";
}

function completed(reconciliation: WorktreeReconciliation): boolean {
	return reconciliation.exact === true && reconciliation.inspection?.clean === true &&
		reconciliation.inspection.indexMatchesBase === true;
}

function absent(reconciliation: WorktreeReconciliation): boolean {
	return reconciliation.pathExists === false && reconciliation.branchExists === false && reconciliation.registration === undefined;
}

function disposition(record: Readonly<WorktreeOwnershipRecordV1>): WorktreeProvisionDisposition {
	if (record.state === "ready") return "ready";
	if (record.state === "retained") return "retained";
	if (record.state === "cleaned") return "cleaned";
	return "uncertain";
}

function summary(record: Readonly<WorktreeOwnershipRecordV1>, selected?: WorktreeProvisionDisposition): Readonly<WorktreeOutcomeSummary> {
	return Object.freeze({
		workspaceId: record.workspaceId,
		branchRef: record.branchRef,
		baseCommit: record.baseCommit.slice(0, 12),
		lastObservedCommit: record.lastObservedCommit.slice(0, 12),
		disposition: selected ?? disposition(record),
	});
}

/** Strict transaction facade. It has deliberately no cleanup or generic Git escape hatch. */
export class WorktreeManager {
	readonly #git: WorktreeGitOperations;
	readonly #state: WorktreeStateStoreApi;
	readonly #registry: Pick<WorkspaceRegistry, "registerWorktree" | "authorize">;
	readonly #now: () => Date;
	readonly #plans = new WeakSet<object>();
	readonly #admitted = new WeakSet<object>();
	readonly #allocations = new WeakMap<object, AllocationInternal>();

	constructor(options: Readonly<CreateWorktreeManagerOptions>) {
		if (!options || typeof options !== "object" || !options.git || !options.state || !options.registry) fail("Worktree manager backends are required");
		this.#git = options.git;
		this.#state = options.state;
		this.#registry = options.registry;
		this.#now = options.now ?? (() => new Date());
	}

	/** Exact clean eligibility inspection. No state directory, record, registry, or Git artifact is created. */
	async prepare(options: Readonly<PrepareWorktreeOptions>): Promise<Readonly<WorktreeWorkspacePlan>> {
		if (!options || typeof options !== "object") fail("Worktree preparation options are required");
		const sourceGeneration = boundedText(options.sourceGeneration, "Source generation");
		const childId = boundedText(options.childId, "Child ID");
		if (!SESSION_GENERATION.test(sourceGeneration) || !SUB_AGENT_ID.test(childId)) fail("Worktree generation or child identity is unsupported");
		if (!childId.startsWith(`sa1-${sourceGeneration.slice("sag1-".length)}-`)) fail("Worktree child identity does not belong to the supplied generation");
		if (options.trusted !== true) fail("Worktree preparation requires a trusted project decision");
		throwIfAborted(options.signal);
		const canonicalCwd = await realpath(options.cwd);
		if (!(await stat(canonicalCwd)).isDirectory()) fail("Parent cwd is not a directory");
		const inspected = await this.#git.inspectRepository({ cwd: canonicalCwd, trusted: true, signal: options.signal });
		const repository = Object.freeze({ ...inspected });
		if (!isWithin(repository.topLevel, canonicalCwd)) fail("Parent cwd is outside the inspected repository");
		const parentRelativeRoot = relative(repository.topLevel, canonicalCwd);
		const relativeCwd = options.relativeCwd === undefined ? undefined : normalizeRelative(options.relativeCwd, "Relative child cwd", false);
		const repoKey = computeWorktreeRepositoryKey(repository.commonDirectory);
		const identity = Object.freeze({ ...this.#state.generateIdentity({ repoKey }) });
		const unsigned = Object.freeze({
			version: 1 as const,
			repository,
			sourceGeneration: options.sourceGeneration,
			childId: options.childId,
			parentRelativeRoot,
			...(relativeCwd !== undefined ? { relativeCwd } : {}),
			identity,
		});
		const plan = Object.freeze({ ...unsigned, approvalDigest: planDigest(unsigned) });
		this.#plans.add(plan);
		return plan;
	}

	/** Admit one exact approved plan and execute its locked allocate/materialize/reconcile transaction. */
	async provisionApproved(
		plan: Readonly<WorktreeWorkspacePlan>,
		admission: Readonly<ApprovedWorktreeAdmission>,
		options: { readonly signal?: AbortSignal } = {},
	): Promise<Readonly<WorktreeProvisionResult>> {
		if (!plan || typeof plan !== "object" || !this.#plans.has(plan as object) || !Object.isFrozen(plan) || this.#admitted.has(plan as object)) fail("Worktree plan is not an unused manager-issued plan");
		if (!admission || typeof admission !== "object" || !DIGEST.test(admission.approvalDigest) ||
			admission.approvalDigest !== plan.approvalDigest || admission.correlationToken !== plan.identity.correlationToken) {
			fail("Worktree approval does not exactly admit this plan");
		}
		this.#admitted.add(plan as object);
		throwIfAborted(options.signal);
		const repository = await this.#state.openRepository(plan.repository.topLevel, plan.repository.commonDirectory);
		const worktreePath = join(repository.treesDirectory, plan.identity.workspaceId);
		const logicalRoot = join(worktreePath, plan.parentRelativeRoot);
		const childCwd = plan.relativeCwd === undefined ? logicalRoot : resolve(logicalRoot, plan.relativeCwd);
		if (!isWithin(logicalRoot, childCwd)) fail("Relative child cwd escaped its logical root");

		let completedResult: Readonly<WorktreeProvisionResult> | undefined;
		let publication: { readonly record: Readonly<WorktreeOwnershipRecordV1>; readonly canonicalRoot: string } | undefined;
		const finish = (result: Readonly<WorktreeProvisionResult>): Readonly<WorktreeProvisionResult> => {
			completedResult = result;
			return result;
		};
		let lockedResult: Readonly<WorktreeProvisionResult>;
		try {
			lockedResult = await this.#state.withRepositoryLock(repository, async (transaction) => {
			const current = await this.#git.inspectRepository({ cwd: plan.repository.topLevel, trusted: true, signal: options.signal });
			if (!sameRepository(plan.repository, current)) fail("Repository eligibility changed after approval");
			throwIfAborted(options.signal);
			const createdAt = this.#timestamp();
			const initial = Object.freeze({
				correlationToken: plan.identity.correlationToken,
				sourceGeneration: plan.sourceGeneration,
				childId: plan.childId,
				repositoryTopLevel: repository.repositoryTopLevel,
				gitCommonDirectory: repository.gitCommonDirectory,
				worktreePath,
				logicalRoot,
				workspaceId: plan.identity.workspaceId,
				workspaceKey: plan.identity.workspaceKey,
				branchRef: plan.identity.branchRef,
				baseCommit: current.headCommit,
				createdAt,
			});
			let record: Readonly<WorktreeOwnershipRecordV1>;
			let operationError: unknown = undefined;
			try {
				record = await transaction.createRecord(initial);
			} catch (error) {
				// A durable create can fail while verifying or syncing its result. If and
				// only if the exact intended revision is readable, allocation has begun
				// and must enter the normal signal-free reconciliation path.
				let recovered: Readonly<WorktreeOwnershipRecordV1>;
				try { recovered = await transaction.readRecord(plan.identity.workspaceId); }
				catch { throw error; }
				if (recovered.revision !== 1 || recovered.state !== "allocating" || recovered.createdAt !== createdAt ||
					recovered.repositoryTopLevel !== initial.repositoryTopLevel || recovered.gitCommonDirectory !== initial.gitCommonDirectory ||
					recovered.worktreePath !== initial.worktreePath || recovered.logicalRoot !== initial.logicalRoot ||
					recovered.workspaceId !== initial.workspaceId || recovered.workspaceKey !== initial.workspaceKey ||
					recovered.branchRef !== initial.branchRef || recovered.baseCommit !== initial.baseCommit ||
					recovered.correlationToken !== initial.correlationToken || recovered.sourceGeneration !== initial.sourceGeneration ||
					recovered.childId !== initial.childId) throw error;
				record = recovered;
				operationError = error;
			}
			const handle = Object.freeze({ workspaceId: record.workspaceId, correlationToken: record.correlationToken });
			this.#allocations.set(handle, { repository, plan });

			if (operationError === undefined) {
				try {
					const registered = await this.#git.registerNoCheckoutWorktree({
						repository: current,
						path: worktreePath,
						branchRef: record.branchRef,
						baseCommit: record.baseCommit,
						lockReason: `pi sub-agent ${record.workspaceId}`,
						signal: options.signal,
					});
					await this.#git.materializeTree({ repository: current, worktree: registered, signal: options.signal });
				} catch (error) {
					operationError = error;
				}
			}
			if (options.signal?.aborted) {
				operationError ??= new DOMException("Worktree provisioning was cancelled after allocation", "AbortError");
			}

			let reconciliation: WorktreeReconciliation | undefined;
			try {
				reconciliation = await this.#git.reconcileWorktree({ repository: current, path: worktreePath, branchRef: record.branchRef, baseCommit: record.baseCommit });
			} catch (error) {
				operationError ??= error;
			}
			if (options.signal?.aborted) {
				operationError ??= new DOMException("Worktree provisioning was cancelled during reconciliation", "AbortError");
			}

				if (!reconciliation) {
					record = await this.#uncertain(transaction, record, "reconciliation-incomplete");
					return finish(Object.freeze({ summary: summary(record), allocation: handle, ...(plan.relativeCwd !== undefined ? { relativeCwd: plan.relativeCwd } : {}) }));
				}
				const observedCommit = reconciliation.inspection?.head ?? reconciliation.branchCommit ?? record.baseCommit;
				const observedStatus = statusOf(reconciliation.inspection);
				if (absent(reconciliation)) {
					const cleaned = await transaction.compareAndSwap(record, { state: "cleaned", lastObservedCommit: observedCommit, observedStatus, updatedAt: this.#timestamp(), failureCategory: category(operationError) });
					await transaction.deleteRecord(cleaned);
					this.#allocations.delete(handle);
					return finish(Object.freeze({ summary: summary(cleaned, "cleaned"), ...(plan.relativeCwd !== undefined ? { relativeCwd: plan.relativeCwd } : {}) }));
				}
				if (!completed(reconciliation)) {
					record = await transaction.compareAndSwap(record, { state: "uncertain", lastObservedCommit: observedCommit, observedStatus, updatedAt: this.#timestamp(), failureCategory: "reconciliation-incomplete" });
					return finish(Object.freeze({ summary: summary(record), allocation: handle, ...(plan.relativeCwd !== undefined ? { relativeCwd: plan.relativeCwd } : {}) }));
				}

				record = await transaction.compareAndSwap(record, { state: "ready", lastObservedCommit: observedCommit, observedStatus: "clean", updatedAt: this.#timestamp(), failureCategory: null });
				if (operationError !== undefined) {
					record = await transaction.compareAndSwap(record, { state: "retained", updatedAt: this.#timestamp(), failureCategory: category(operationError) });
					return finish(Object.freeze({ summary: summary(record), allocation: handle, ...(plan.relativeCwd !== undefined ? { relativeCwd: plan.relativeCwd } : {}) }));
				}
				try {
					const canonicalRoot = await realpath(record.logicalRoot);
					if (canonicalRoot !== record.logicalRoot || !(await stat(canonicalRoot)).isDirectory()) fail("Materialized logical root is not an exact canonical directory");
					if (plan.relativeCwd !== undefined) {
						const canonicalChildCwd = await realpath(childCwd);
						if (canonicalChildCwd !== childCwd || !(await stat(canonicalChildCwd)).isDirectory() || !isWithin(canonicalRoot, canonicalChildCwd)) fail("Materialized child cwd is not an exact directory beneath its logical root");
					}
					publication = Object.freeze({ record, canonicalRoot });
					return finish(Object.freeze({ summary: summary(record), allocation: handle, ...(plan.relativeCwd !== undefined ? { relativeCwd: plan.relativeCwd } : {}) }));
				} catch {
					record = await transaction.compareAndSwap(record, { state: "retained", updatedAt: this.#timestamp(), failureCategory: "ownership-mismatch" });
					return finish(Object.freeze({ summary: summary(record), allocation: handle, ...(plan.relativeCwd !== undefined ? { relativeCwd: plan.relativeCwd } : {}) }));
				}
			});
		} catch (error) {
			if (!completedResult) throw error;
			if (completedResult.summary.disposition !== "ready") return completedResult;
			return Object.freeze({
				...completedResult,
				summary: Object.freeze({ ...completedResult.summary, disposition: "uncertain" as const }),
			});
		}

		if (!publication) return lockedResult;
		try {
			const { record, canonicalRoot } = publication;
			const workspace = this.#registry.registerWorktree({
				workspaceId: record.workspaceId,
				root: canonicalRoot,
				branch: record.branchRef,
				baseCommit: record.baseCommit,
				ownerAgentId: record.childId,
				key: record.workspaceKey,
			});
			const registered = this.#registry.authorize(workspace, record.childId);
			if (registered.identity !== workspace || workspace.mode !== "worktree" || workspace.root !== record.logicalRoot ||
				workspace.key !== record.workspaceKey || workspace.workspaceId !== record.workspaceId ||
				workspace.branch !== record.branchRef || workspace.baseCommit !== record.baseCommit || !Object.isFrozen(workspace)) fail("Registry did not return the exact child-owned identity");
			return Object.freeze({ ...lockedResult, workspace });
		} catch {
			try {
				const retained = await this.#state.withRepositoryLock(repository, async (transaction) => {
					let record = await transaction.readRecord(plan.identity.workspaceId);
					if (!lockedResult.allocation) fail("Ready worktree result lost its allocation handle");
					this.#assertRecord(record, lockedResult.allocation, plan);
					if (record.state === "ready") record = await transaction.compareAndSwap(record, { state: "retained", updatedAt: this.#timestamp(), failureCategory: "ownership-mismatch" });
					return record;
				});
				return Object.freeze({ ...lockedResult, summary: summary(retained), workspace: undefined });
			} catch {
				return Object.freeze({
					...lockedResult,
					summary: Object.freeze({ ...lockedResult.summary, disposition: "uncertain" as const }),
					workspace: undefined,
				});
			}
		}
	}

	/** Preserve a ready allocation after a later runtime/session failure. No Git mutation occurs. */
	async retain(allocation: Readonly<WorktreeAllocationHandle>): Promise<Readonly<WorktreeOutcomeSummary>> {
		const internal = this.#requireAllocation(allocation);
		return this.#state.withRepositoryLock(internal.repository, async (transaction) => {
			let record = await transaction.readRecord(allocation.workspaceId);
			this.#assertRecord(record, allocation, internal.plan);
			if (record.state === "ready") record = await transaction.compareAndSwap(record, { state: "retained", updatedAt: this.#timestamp(), failureCategory: "runtime-failed" });
			else if (record.state !== "retained") fail("Only a ready or retained allocation can be retained");
			return summary(record);
		});
	}

	/** Exact ownership and Git observation; it never adopts or mutates an artifact. */
	async inspectOwned(allocation: Readonly<WorktreeAllocationHandle>, workspace: Readonly<WorkspaceIdentity>): Promise<Readonly<WorktreeOwnedInspection>> {
		const internal = this.#requireAllocation(allocation);
		return this.#state.withRepositoryLock(internal.repository, async (transaction) => {
			const record = await transaction.readRecord(allocation.workspaceId);
			this.#assertRecord(record, allocation, internal.plan);
			let repositoryExact = false;
			try {
				const current = await this.#git.inspectRepository({ cwd: record.repositoryTopLevel, trusted: true });
				repositoryExact = sameRepository(internal.plan.repository, current);
			} catch { repositoryExact = false; }
			let registryExact = false;
			try {
				const registered = this.#registry.authorize(workspace, record.childId);
				registryExact = registered.identity === workspace && workspace.root === record.logicalRoot && workspace.key === record.workspaceKey &&
					workspace.workspaceId === record.workspaceId && workspace.branch === record.branchRef && workspace.baseCommit === record.baseCommit;
			} catch { registryExact = false; }
			const observed = await this.#git.collectSummary({ repository: internal.plan.repository, path: record.worktreePath, expectedBranchRef: record.branchRef, expectedBaseCommit: record.baseCommit });
			const gitExact = observed.registered === true && observed.registration?.path === record.worktreePath &&
				observed.registration.branch === record.branchRef && observed.registration.head === record.lastObservedCommit && Boolean(observed.registration.locked) &&
				observed.head === record.lastObservedCommit && observed.branchRef === record.branchRef &&
				observed.refCommit === record.lastObservedCommit && observed.indexMatchesBase === true;
			return Object.freeze({ summary: summary(record), registered: observed.registered, exactOwnership: repositoryExact && registryExact && gitExact, clean: observed.clean === true });
		});
	}

	/** Bounded read-only changed-file/diff/commit collection for one exact owned workspace. */
	async collectOwnedChanges(allocation: Readonly<WorktreeAllocationHandle>, workspace: Readonly<WorkspaceIdentity>): Promise<Readonly<WorktreeOwnedChangeCollection>> {
		const internal = this.#requireAllocation(allocation);
		return this.#state.withRepositoryLock(internal.repository, async (transaction) => {
			const record = await transaction.readRecord(allocation.workspaceId);
			this.#assertRecord(record, allocation, internal.plan);
			let repositoryExact = false;
			try {
				const current = await this.#git.inspectRepository({ cwd: record.repositoryTopLevel, trusted: true });
				repositoryExact = current.trusted === true && current.insideWorkTree === true && current.bare === false &&
					current.topLevel === internal.plan.repository.topLevel && current.commonDirectory === internal.plan.repository.commonDirectory &&
					current.objectFormat === internal.plan.repository.objectFormat && current.configFingerprint === internal.plan.repository.configFingerprint;
			} catch { repositoryExact = false; }
			let registryExact = false;
			try {
				const registered = this.#registry.authorize(workspace, record.childId);
				registryExact = registered.identity === workspace && workspace.root === record.logicalRoot && workspace.key === record.workspaceKey &&
					workspace.workspaceId === record.workspaceId && workspace.branch === record.branchRef && workspace.baseCommit === record.baseCommit;
			} catch { registryExact = false; }
			const observed = await this.#git.collectSummary({ repository: internal.plan.repository, path: record.worktreePath, expectedBranchRef: record.branchRef, expectedBaseCommit: record.baseCommit });
			return this.#collectionFromRecord(record, observed, repositoryExact && registryExact);
		});
	}

	/** Bounded read-only collection from the protected retained/uncertain catalog. It never needs a live child allocation handle. */
	async collectCatalogChanges(options: Readonly<CollectWorktreeCatalogChangesOptions>): Promise<Readonly<WorktreeCatalogChangeCollection>> {
		if (!options || typeof options !== "object") fail("Catalog collection options are required");
		const workspaceId = boundedText(options.workspaceId, "Catalog workspace ID");
		const expectedRevision = options.expectedRevision;
		if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) fail("Catalog expected revision is invalid");
		throwIfAborted(options.signal);
		const lookup = await this.#state.readCatalogRecord(workspaceId);
		return this.#state.withRepositoryLock(lookup.repository, async (transaction) => {
			const record = await transaction.readRecord(workspaceId);
			if (expectedRevision !== undefined && record.revision !== expectedRevision) fail("Catalog ownership record revision changed");
			if (record.state === "allocating" || record.state === "cleanup-pending" || record.state === "cleaned") fail("Catalog worktree is not collectable");
			let repositoryExact = false;
			try {
				const current = await this.#git.inspectRepository({ cwd: record.repositoryTopLevel, trusted: true, signal: options.signal });
				repositoryExact = current.trusted === true && current.insideWorkTree === true && current.bare === false &&
					current.topLevel === record.repositoryTopLevel && current.commonDirectory === record.gitCommonDirectory &&
					current.objectFormat === (record.baseCommit.length === 64 ? "sha256" : "sha1") && current.configFingerprint.length === 64;
			} catch { repositoryExact = false; }
			const observed = await this.#git.collectSummary({ repository: {
				trusted: true,
				insideWorkTree: true,
				bare: false,
				topLevel: record.repositoryTopLevel,
				commonDirectory: record.gitCommonDirectory,
				headCommit: record.baseCommit,
				objectFormat: record.baseCommit.length === 64 ? "sha256" : "sha1",
				clean: true,
				configFingerprint: "0".repeat(64),
			}, path: record.worktreePath, expectedBranchRef: record.branchRef, expectedBaseCommit: record.baseCommit, signal: options.signal });
			return Object.freeze({ ...this.#collectionFromRecord(record, observed, repositoryExact), revision: record.revision });
		});
	}

	catalog(options?: WorktreeCatalogOptions): Promise<WorktreeCatalogResult> {
		return this.#state.catalog(options);
	}

	#collectionFromRecord(
		record: Readonly<WorktreeOwnershipRecordV1>,
		observed: Readonly<WorktreeCollectionSummary>,
		authorityExact: boolean,
	): Readonly<WorktreeOwnedChangeCollection> {
		const gitExact = observed.registered === true && observed.registration?.path === record.worktreePath &&
			observed.registration.branch === record.branchRef && Boolean(observed.registration.locked) &&
			observed.head !== undefined && observed.branchRef === record.branchRef && observed.refCommit === observed.head;
		const { registration: _privateRegistration, ...pathFreeCollection } = observed;
		return Object.freeze({
			summary: summary(record),
			registered: observed.registered,
			exactOwnership: authorityExact && gitExact,
			clean: observed.clean === true,
			conflicted: observed.conflicted === true,
			incomplete: observed.incomplete === true,
			collection: Object.freeze(pathFreeCollection),
		});
	}

	#requireAllocation(allocation: Readonly<WorktreeAllocationHandle>): AllocationInternal {
		if (!allocation || typeof allocation !== "object") fail("A manager-issued allocation is required");
		const internal = this.#allocations.get(allocation as object);
		if (!internal || !Object.isFrozen(allocation)) fail("Allocation handle is forged or unavailable");
		return internal;
	}

	#assertRecord(record: Readonly<WorktreeOwnershipRecordV1>, allocation: Readonly<WorktreeAllocationHandle>, plan: Readonly<WorktreeWorkspacePlan>): void {
		if (record.workspaceId !== allocation.workspaceId || record.correlationToken !== allocation.correlationToken ||
			record.workspaceId !== plan.identity.workspaceId || record.workspaceKey !== plan.identity.workspaceKey ||
			record.branchRef !== plan.identity.branchRef || record.baseCommit !== plan.repository.headCommit ||
			record.childId !== plan.childId || record.sourceGeneration !== plan.sourceGeneration) fail("Protected ownership record does not match the exact allocation");
	}

	async #uncertain(transaction: WorktreeStateTransaction, record: Readonly<WorktreeOwnershipRecordV1>, failureCategory: WorktreeFailureCategory): Promise<Readonly<WorktreeOwnershipRecordV1>> {
		return transaction.compareAndSwap(record, { state: "uncertain", updatedAt: this.#timestamp(), failureCategory });
	}

	#timestamp(): string {
		const value = this.#now();
		if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail("Worktree manager clock returned an invalid date");
		return value.toISOString();
	}
}

export function createWorktreeManager(options: Readonly<CreateWorktreeManagerOptions>): WorktreeManager {
	return new WorktreeManager(options);
}
