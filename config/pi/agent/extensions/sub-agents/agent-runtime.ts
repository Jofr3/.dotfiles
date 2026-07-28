import {
	createAgentSession,
	SessionManager,
	SettingsManager,
	type AgentSession,
	type AgentSessionEventListener,
	type BashOperations,
	type CreateAgentSessionOptions,
	type CreateAgentSessionResult,
	type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import type { ResolvedChildModel } from "./model-runtime.ts";
import {
	createSubAgentResourceLoader,
	type CreateSubAgentResourceLoaderOptions,
	type ParentContextSnapshotV1,
} from "./resource-loader.ts";
import {
	createReportToParentTool,
	REPORT_TO_PARENT_TOOL_NAME,
	type ReportToParentHandler,
} from "./tools/report-to-parent.ts";
import type {
	ChildToolName,
	DynamicAgentSpec,
	SessionGeneration,
	SubAgentId,
	ThinkingLevel,
	WorkspaceIdentity,
} from "./types.ts";
import { SUB_AGENT_BOUNDS } from "./types.ts";
import {
	createGuardedChildBashTool,
	createGuardedChildEditTool,
	createGuardedChildWriteTool,
} from "./workspace/guarded-tools.ts";
import {
	createGuardedChildFindTool,
	createGuardedChildGrepTool,
	createGuardedChildLsTool,
	createGuardedChildReadTool,
} from "./workspace/guarded-read-tools.ts";
import {
	WorkspacePathError,
	resolveCanonicalWorkspacePath,
	resolveCanonicalWriteScope,
	resolveSharedWorkspace,
	type CanonicalWorkspacePath,
	type CanonicalWriteScope,
} from "./workspace/paths.ts";

export const READ_ONLY_CHILD_TOOL_NAMES = Object.freeze([
	"read",
	"grep",
	"find",
	"ls",
] as const);

export type ReadOnlyChildToolName = (typeof READ_ONLY_CHILD_TOOL_NAMES)[number];
export type GuardedChildToolName = "edit" | "write" | "bash";
export type EnabledChildBuiltInToolName = ReadOnlyChildToolName | GuardedChildToolName;
export type ChildSessionToolName =
	| EnabledChildBuiltInToolName
	| typeof REPORT_TO_PARENT_TOOL_NAME;

const READ_ONLY_CHILD_TOOLS = new Set<string>(READ_ONLY_CHILD_TOOL_NAMES);
const ENABLED_GUARDED_CHILD_TOOLS = new Set<string>(["edit", "write", "bash"]);
const THINKING_LEVELS = new Set<string>([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);
const DEFAULT_SESSION_CLEANUP_TIMEOUT_MS = 2_000;

export type SubAgentSessionFactoryErrorCode =
	| "invalid_runtime_request"
	| "unsupported_workspace"
	| "workspace_unavailable"
	| "workspace_outside_root"
	| "unsupported_tool"
	| "mutating_tools_disabled"
	| "session_initialization_failed"
	| "session_validation_failed"
	| "event_subscription_failed"
	| "session_cleanup_failed";

export class SubAgentSessionFactoryError extends Error {
	readonly code: SubAgentSessionFactoryErrorCode;
	/** True only when no child run can remain active after this failure. */
	readonly runtimeSettled: boolean;

	constructor(
		code: SubAgentSessionFactoryErrorCode,
		message: string,
		options: { runtimeSettled?: boolean } = {},
	) {
		super(message);
		this.name = "SubAgentSessionFactoryError";
		this.code = code;
		this.runtimeSettled = options.runtimeSettled ?? true;
	}
}

export interface SubAgentSessionFactoryDependencies {
	createSession?: (options: CreateAgentSessionOptions) => Promise<CreateAgentSessionResult>;
	createSessionManager?: (cwd: string) => SessionManager;
	createSettingsManager?: () => SettingsManager;
	createResourceLoader?: (options: CreateSubAgentResourceLoaderOptions) => ResourceLoader;
	/** Deterministic offline-test seam; production uses Pi's local bash backend. */
	guardedBashOperations?: BashOperations;
	/** Bounded partial-session cleanup deadline; production defaults to two seconds. */
	cleanupTimeoutMs?: number;
}

export interface ResolvedSubAgentWorkspace {
	readonly identity: Readonly<WorkspaceIdentity>;
	readonly cwd: string;
}

export interface CreateSubAgentSessionOptions {
	id: SubAgentId;
	generation: SessionGeneration;
	/** Parent generation's canonical workspace boundary; used only for shared-mode fallback resolution. */
	cwd: string;
	/** Pre-resolved workspace/cwd from the runner/provisioner. Required by future worktree provisioning. */
	resolvedWorkspace?: Readonly<ResolvedSubAgentWorkspace>;
	spec: Readonly<DynamicAgentSpec>;
	resolvedModel: ResolvedChildModel;
	parentContext?: ParentContextSnapshotV1;
	onEvent: AgentSessionEventListener;
	onReport: ReportToParentHandler;
	claimFileLeases?: (
		workspace: Readonly<WorkspaceIdentity>,
		targets: readonly Readonly<CanonicalWorkspacePath>[],
	) => void | Promise<void>;
	reconcileFileLease?: (
		workspace: Readonly<WorkspaceIdentity>,
		target: Readonly<CanonicalWorkspacePath>,
	) => void | Promise<void>;
	claimWorkspaceLease?: (
		workspace: Readonly<WorkspaceIdentity>,
	) => void | Promise<void>;
	onFileMutation?: (
		target: Readonly<CanonicalWorkspacePath>,
	) => void | Promise<void>;
	dependencies?: SubAgentSessionFactoryDependencies;
}

/**
 * One fully initialized, in-process child session and its in-memory owners.
 *
 * `dispose()` only disconnects and disposes the AgentSession. Call `close()` or
 * the abort/wait/dispose trio when an active child must be settled first.
 */
export class SubAgentSessionRuntime {
	readonly id: SubAgentId;
	readonly generation: SessionGeneration;
	readonly cwd: string;
	readonly workspace: Readonly<WorkspaceIdentity>;
	readonly writeScope?: Readonly<CanonicalWriteScope>;
	readonly session: AgentSession;
	readonly sessionManager: SessionManager;
	readonly settingsManager: SettingsManager;
	readonly resourceLoader: ResourceLoader;
	readonly selectedTools: readonly ChildSessionToolName[];

	#unsubscribe?: () => void;
	#prepareWorkspaceOwnership: () => Promise<void>;
	#cleanupTimeoutMs: number;
	#disposed = false;
	#closePromise?: Promise<void>;

	constructor(options: {
		id: SubAgentId;
		generation: SessionGeneration;
		cwd: string;
		workspace: Readonly<WorkspaceIdentity>;
		writeScope?: Readonly<CanonicalWriteScope>;
		session: AgentSession;
		sessionManager: SessionManager;
		settingsManager: SettingsManager;
		resourceLoader: ResourceLoader;
		selectedTools: readonly ChildSessionToolName[];
		prepareWorkspaceOwnership: () => Promise<void>;
		unsubscribe: () => void;
		cleanupTimeoutMs?: number;
	}) {
		this.id = options.id;
		this.generation = options.generation;
		this.cwd = options.cwd;
		this.workspace = options.workspace;
		this.writeScope = options.writeScope;
		this.session = options.session;
		this.sessionManager = options.sessionManager;
		this.settingsManager = options.settingsManager;
		this.resourceLoader = options.resourceLoader;
		this.selectedTools = Object.freeze([...options.selectedTools]);
		this.#prepareWorkspaceOwnership = options.prepareWorkspaceOwnership;
		this.#unsubscribe = options.unsubscribe;
		this.#cleanupTimeoutMs = normalizeCleanupTimeout(options.cleanupTimeoutMs);
	}

	get disposed(): boolean {
		return this.#disposed;
	}

	get modelRef(): Readonly<{ provider: string; id: string }> {
		const model = this.session.model;
		if (!model) {
			throw new SubAgentSessionFactoryError(
				"session_validation_failed",
				"The child session has no selected model",
			);
		}
		return Object.freeze({ provider: model.provider, id: model.id });
	}

	get thinkingLevel(): ThinkingLevel {
		return this.session.thinkingLevel as ThinkingLevel;
	}

	/** Reclaim assignment-retained shared ownership after an explicit idle release. */
	async prepareAssignmentWorkspace(): Promise<void> {
		if (this.#disposed) {
			throw new SubAgentSessionFactoryError(
				"session_validation_failed",
				"The disposed child session cannot prepare workspace ownership",
			);
		}
		await this.#prepareWorkspaceOwnership();
	}

	async reconfigureModel(
		resolvedModel: ResolvedChildModel,
		requestedThinkingLevel?: ThinkingLevel,
	): Promise<{
		modelRef: Readonly<{ provider: string; id: string }>;
		thinkingLevel: ThinkingLevel;
	}> {
		if (
			!resolvedModel?.runtime ||
			!resolvedModel.model ||
			resolvedModel.runtime !== this.session.modelRuntime
		) {
			throw new SubAgentSessionFactoryError(
				"invalid_runtime_request",
				"The replacement model does not belong to this child runtime",
			);
		}
		if (requestedThinkingLevel !== undefined && !THINKING_LEVELS.has(requestedThinkingLevel)) {
			throw new SubAgentSessionFactoryError(
				"invalid_runtime_request",
				"The replacement thinking level is invalid",
			);
		}
		try {
			await this.session.setModel(resolvedModel.model);
			if (requestedThinkingLevel !== undefined) {
				this.session.setThinkingLevel(requestedThinkingLevel);
			}
			return {
				modelRef: this.modelRef,
				thinkingLevel: this.thinkingLevel,
			};
		} catch {
			throw new SubAgentSessionFactoryError(
				"session_validation_failed",
				"Could not apply the replacement child model configuration",
			);
		}
	}

	abort(): Promise<void> {
		return this.session.abort();
	}

	waitForIdle(): Promise<void> {
		return this.session.waitForIdle();
	}

	dispose(): void {
		if (this.#disposed) return;
		let firstError: unknown;
		try {
			this.#unsubscribe?.();
		} catch (error) {
			firstError = error;
		} finally {
			this.#unsubscribe = undefined;
		}
		try {
			this.session.dispose();
			this.#disposed = true;
		} catch (error) {
			firstError ??= error;
		}
		if (firstError) {
			throw new SubAgentSessionFactoryError(
				"session_cleanup_failed",
				"Could not dispose the child session cleanly",
				{ runtimeSettled: false },
			);
		}
	}

	close(): Promise<void> {
		if (this.#closePromise) return this.#closePromise;
		this.#closePromise = (async () => {
			let failed = false;
			const abort = await settleCleanupOperation(
				() => this.abort(),
				this.#cleanupTimeoutMs,
			);
			if (!abort.fulfilled) failed = true;

			let runtimeSettled = false;
			if (!abort.timedOut) {
				const idle = await settleCleanupOperation(
					() => this.waitForIdle(),
					this.#cleanupTimeoutMs,
				);
				runtimeSettled = idle.fulfilled;
				if (!idle.fulfilled) failed = true;
			} else {
				failed = true;
			}

			try {
				this.dispose();
			} catch {
				failed = true;
				runtimeSettled = false;
			}
			if (failed) {
				throw new SubAgentSessionFactoryError(
					"session_cleanup_failed",
					"Could not close the child session cleanly",
					{ runtimeSettled },
				);
			}
		})();
		return this.#closePromise;
	}
}

function mapWorkspacePathError(error: WorkspacePathError): SubAgentSessionFactoryError {
	if (error.code === "workspace_outside_root" || error.code === "path_outside_root") {
		return new SubAgentSessionFactoryError(
			"workspace_outside_root",
			"The child workspace must remain inside its resolved workspace root",
		);
	}
	if (error.code === "invalid_path") {
		return new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"The child workspace path is invalid",
		);
	}
	return new SubAgentSessionFactoryError(
		"workspace_unavailable",
		"The child workspace directory is unavailable",
	);
}

async function validateResolvedWorkspace(
	workspace: Readonly<ResolvedSubAgentWorkspace>,
	specMode: WorkspaceIdentity["mode"],
): Promise<ResolvedSubAgentWorkspace> {
	if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"A resolved child workspace is required",
		);
	}
	if (workspace.identity?.mode !== specMode) {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"The resolved child workspace does not match the requested workspace mode",
		);
	}
	try {
		const root = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			cwd: workspace.identity.root,
			path: ".",
			allowMissing: false,
			allowWorkspaceRoot: true,
		});
		if (root.path !== workspace.identity.root || root.relativePath !== "" || !root.exists) {
			throw new WorkspacePathError("workspace_unavailable", "The resolved workspace root is not canonical");
		}
		const cwd = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			cwd: workspace.cwd,
			path: ".",
			allowMissing: false,
			allowWorkspaceRoot: true,
		});
		return Object.freeze({
			identity: Object.freeze({ ...workspace.identity }),
			cwd: cwd.path,
		});
	} catch (error) {
		if (error instanceof WorkspacePathError) throw mapWorkspacePathError(error);
		throw error;
	}
}

export async function resolveSubAgentSessionWorkspace(
	parentCwd: string,
	spec: Readonly<DynamicAgentSpec>,
	resolvedWorkspace?: Readonly<ResolvedSubAgentWorkspace>,
): Promise<ResolvedSubAgentWorkspace> {
	if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"A dynamic child specification is required",
		);
	}
	if (
		spec.workspace !== undefined &&
		(!spec.workspace || typeof spec.workspace !== "object" || Array.isArray(spec.workspace))
	) {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"The child workspace specification is invalid",
		);
	}
	const workspaceMode = spec.workspace?.mode ?? "shared";
	if (workspaceMode !== "shared" && workspaceMode !== "worktree") {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"The child workspace mode is invalid",
		);
	}
	const bashPolicy = spec.workspace?.bashPolicy ?? "disabled";
	if (bashPolicy !== "disabled" && bashPolicy !== "workspace-exclusive") {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"The child bash policy is invalid",
		);
	}

	if (resolvedWorkspace !== undefined) {
		return validateResolvedWorkspace(resolvedWorkspace, workspaceMode);
	}
	if (workspaceMode === "worktree") {
		throw new SubAgentSessionFactoryError(
			"unsupported_workspace",
			"Worktree child sessions require an approved pre-resolved workspace",
		);
	}

	const requested = spec.workspace?.cwd?.trim();
	try {
		return await resolveSharedWorkspace(parentCwd, requested || undefined);
	} catch (error) {
		if (error instanceof WorkspacePathError) {
			if (error.code === "workspace_outside_root") {
				throw new SubAgentSessionFactoryError(
					"workspace_outside_root",
					"The child workspace must remain inside the parent workspace",
				);
			}
			if (error.code === "invalid_path") {
				throw new SubAgentSessionFactoryError(
					"invalid_runtime_request",
					"The child workspace path is invalid",
				);
			}
		}
		throw new SubAgentSessionFactoryError(
			"workspace_unavailable",
			"The child workspace directory is unavailable",
		);
	}
}

export function resolveReadOnlyChildTools(
	requested: readonly ChildToolName[] | undefined,
): readonly ReadOnlyChildToolName[] {
	const selected = resolveEnabledChildTools(requested);
	if (selected.some((name) => !READ_ONLY_CHILD_TOOLS.has(name))) {
		throw new SubAgentSessionFactoryError(
			"mutating_tools_disabled",
			"The read-only child tool resolver does not accept guarded mutation tools",
		);
	}
	return selected as readonly ReadOnlyChildToolName[];
}

export function resolveEnabledChildTools(
	requested: readonly ChildToolName[] | undefined,
): readonly EnabledChildBuiltInToolName[] {
	if (requested === undefined) return READ_ONLY_CHILD_TOOL_NAMES;
	if (!Array.isArray(requested) || requested.length > SUB_AGENT_BOUNDS.tools) {
		throw new SubAgentSessionFactoryError(
			"unsupported_tool",
			`Child tools must be an array of at most ${SUB_AGENT_BOUNDS.tools} names`,
		);
	}

	const selected: EnabledChildBuiltInToolName[] = [];
	const seen = new Set<string>();
	for (const value of requested) {
		if (typeof value !== "string" || !value.trim()) {
			throw new SubAgentSessionFactoryError("unsupported_tool", "A child tool name is invalid");
		}
		const name = value.trim();
		if (!READ_ONLY_CHILD_TOOLS.has(name) && !ENABLED_GUARDED_CHILD_TOOLS.has(name)) {
			throw new SubAgentSessionFactoryError("unsupported_tool", `Unsupported child tool: ${name.slice(0, 80)}`);
		}
		if (!seen.has(name)) {
			seen.add(name);
			selected.push(name as EnabledChildBuiltInToolName);
		}
	}
	return Object.freeze(selected);
}

function resolveRequestedThinkingLevel(spec: Readonly<DynamicAgentSpec>): ThinkingLevel {
	const requested = spec.thinkingLevel ?? "medium";
	if (typeof requested !== "string" || !THINKING_LEVELS.has(requested)) {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"The child thinking level is invalid",
		);
	}
	return requested as ThinkingLevel;
}

function sameToolSet(actual: readonly string[], expected: readonly string[]): boolean {
	return actual.length === expected.length && expected.every((name) => actual.includes(name));
}

function validateInitializedSession(options: {
	session: AgentSession;
	sessionManager: SessionManager;
	settingsManager: SettingsManager;
	resourceLoader: ResourceLoader;
	resolvedModel: ResolvedChildModel;
	selectedTools: readonly ChildSessionToolName[];
	cwd: string;
}): void {
	const {
		session,
		sessionManager,
		settingsManager,
		resourceLoader,
		resolvedModel,
		selectedTools,
		cwd,
	} = options;
	const model = session.model;
	const allTools = session.getAllTools().map((tool) => tool.name);
	const activeTools = session.getActiveToolNames();
	if (
		!model ||
		model.provider !== resolvedModel.ref.provider ||
		model.id !== resolvedModel.ref.id ||
		session.modelRuntime !== resolvedModel.runtime ||
		session.sessionManager !== sessionManager ||
		session.settingsManager !== settingsManager ||
		session.resourceLoader !== resourceLoader ||
		session.sessionFile !== undefined ||
		sessionManager.isPersisted() ||
		sessionManager.getCwd() !== cwd ||
		!THINKING_LEVELS.has(session.thinkingLevel) ||
		!sameToolSet(allTools, selectedTools) ||
		!sameToolSet(activeTools, selectedTools)
	) {
		throw new SubAgentSessionFactoryError(
			"session_validation_failed",
			"The initialized child session did not preserve its isolated runtime contract",
		);
	}
}

function normalizeCleanupTimeout(value: number | undefined): number {
	return Number.isSafeInteger(value) && value! > 0
		? Math.min(value!, 60_000)
		: DEFAULT_SESSION_CLEANUP_TIMEOUT_MS;
}

interface CleanupSettlement {
	fulfilled: boolean;
	timedOut: boolean;
}

async function settleCleanupOperation(
	operation: () => void | Promise<void>,
	timeoutMs: number,
): Promise<CleanupSettlement> {
	const run = Promise.resolve().then(operation);
	// Keep observing a late rejection even after the bounded caller moves on.
	void Promise.allSettled([run]);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			run.then(
				() => ({ fulfilled: true, timedOut: false }),
				() => ({ fulfilled: false, timedOut: false }),
			),
			new Promise<CleanupSettlement>((resolvePromise) => {
				timer = setTimeout(
					() => resolvePromise({ fulfilled: false, timedOut: true }),
					timeoutMs,
				);
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

async function cleanPartialSession(
	session: AgentSession | undefined,
	unsubscribe: (() => void) | undefined,
	timeoutMs: number,
): Promise<{ runtimeSettled: boolean; cleanupFailed: boolean }> {
	if (!session) return { runtimeSettled: true, cleanupFailed: false };
	let cleanupFailed = false;
	try {
		unsubscribe?.();
	} catch {
		cleanupFailed = true;
	}

	const abort = await settleCleanupOperation(() => session.abort(), timeoutMs);
	if (!abort.fulfilled) cleanupFailed = true;
	let runtimeSettled = false;
	if (!abort.timedOut) {
		const idle = await settleCleanupOperation(() => session.waitForIdle(), timeoutMs);
		runtimeSettled = idle.fulfilled;
		if (!idle.fulfilled) cleanupFailed = true;
	} else {
		cleanupFailed = true;
	}
	try {
		session.dispose();
	} catch {
		cleanupFailed = true;
		runtimeSettled = false;
	}
	return { runtimeSettled, cleanupFailed };
}

/**
 * Builds one reusable isolated child AgentSession with no persisted settings,
 * session transcript, discovered extension, or unapproved/unguarded tool.
 */
export async function createSubAgentSession(
	options: CreateSubAgentSessionOptions,
): Promise<SubAgentSessionRuntime> {
	if (typeof options.onEvent !== "function") {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"A child session event listener is required",
		);
	}
	if (typeof options.onReport !== "function") {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"A child parent-report handler is required",
		);
	}
	if (!options.resolvedModel?.runtime || !options.resolvedModel?.model || !options.resolvedModel?.ref) {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"A resolved child model is required",
		);
	}

	const dependencies = options.dependencies ?? {};
	const cleanupTimeoutMs = normalizeCleanupTimeout(dependencies.cleanupTimeoutMs);
	const createSession = dependencies.createSession ?? createAgentSession;
	const createSessionManager = dependencies.createSessionManager ?? ((cwd) => SessionManager.inMemory(cwd));
	const createSettingsManager = dependencies.createSettingsManager ?? (() => SettingsManager.inMemory());
	const createResourceLoader = dependencies.createResourceLoader ?? createSubAgentResourceLoader;
	const selectedBuiltInTools = resolveEnabledChildTools(options.spec.tools);
	const editEnabled = selectedBuiltInTools.includes("edit");
	const writeEnabled = selectedBuiltInTools.includes("write");
	const bashEnabled = selectedBuiltInTools.includes("bash");
	const fileMutationEnabled = editEnabled || writeEnabled;
	const bashPolicy = options.spec.workspace?.bashPolicy ?? "disabled";
	if (bashEnabled && bashPolicy !== "workspace-exclusive") {
		throw new SubAgentSessionFactoryError(
			"mutating_tools_disabled",
			"Child bash requires workspace.bashPolicy=workspace-exclusive",
		);
	}
	if (!bashEnabled && bashPolicy === "workspace-exclusive") {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"workspace-exclusive bash policy requires bash in the child tool allowlist",
		);
	}
	if (
		fileMutationEnabled &&
		(typeof options.claimFileLeases !== "function" || typeof options.onFileMutation !== "function")
	) {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"Guarded file mutation requires the generation-scoped lease and mutation callbacks",
		);
	}
	if (writeEnabled && typeof options.reconcileFileLease !== "function") {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"Guarded write requires the generation-scoped post-write lease reconciliation callback",
		);
	}
	if (bashEnabled && typeof options.claimWorkspaceLease !== "function") {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"Guarded bash requires the generation-scoped workspace lease callback",
		);
	}
	const declaredWriteScope = options.spec.workspace?.writeScope;
	if (
		!fileMutationEnabled &&
		declaredWriteScope !== undefined &&
		(!Array.isArray(declaredWriteScope) || declaredWriteScope.length > 0)
	) {
		throw new SubAgentSessionFactoryError(
			"mutating_tools_disabled",
			"A nonempty declared write scope requires guarded edit or write capability",
		);
	}
	const selectedTools: readonly ChildSessionToolName[] = Object.freeze([
		...selectedBuiltInTools,
		REPORT_TO_PARENT_TOOL_NAME,
	]);
	const reportToParentTool = createReportToParentTool(options.onReport);
	const requestedThinkingLevel = resolveRequestedThinkingLevel(options.spec);
	const workspace = await resolveSubAgentSessionWorkspace(
		options.cwd,
		options.spec,
		options.resolvedWorkspace,
	);
	const cwd = workspace.cwd;
	const contextDisplayPathMapping = workspace.identity.mode === "worktree"
		? Object.freeze({ parentRoot: options.cwd, workspace: workspace.identity })
		: undefined;
	let writeScope: CanonicalWriteScope | undefined;
	try {
		writeScope = await resolveCanonicalWriteScope(
			workspace.identity,
			options.spec.workspace?.writeScope,
		);
	} catch (error) {
		if (error instanceof WorkspacePathError) {
			const code = error.code === "path_outside_root"
				? "workspace_outside_root"
				: error.code === "invalid_path"
					? "invalid_runtime_request"
					: "workspace_unavailable";
			throw new SubAgentSessionFactoryError(
				code,
				"The child write scope could not be validated inside the resolved workspace",
			);
		}
		throw error;
	}
	const prepareWorkspaceOwnership = async (): Promise<void> => {
		// Claim the coarse workspace first. If it succeeds, later same-owner exact
		// scope claims cannot conflict with another participant, avoiding partial
		// file ownership before a failed workspace claim.
		if (bashEnabled) {
			await options.claimWorkspaceLease!(workspace.identity);
		}
		if (fileMutationEnabled && writeScope && writeScope.paths.length > 0) {
			// Declared missing targets can become existing after a successful guarded
			// write. Refresh only their filesystem metadata while preserving the exact
			// canonical identity authorized at child creation; aliases may not retarget
			// a released scope before the next assignment reacquires ownership.
			const refreshedTargets = await Promise.all(
				writeScope.paths.map(async (expected) => {
					const current = await resolveCanonicalWorkspacePath({
						workspace: workspace.identity,
						cwd: workspace.identity.root,
						path: expected.path,
						allowMissing: true,
					});
					if (current.path !== expected.path) {
						throw new WorkspacePathError(
							"path_outside_scope",
							"A declared write-scope identity changed before ownership could be reacquired",
						);
					}
					return current;
				}),
			);
			await options.claimFileLeases!(workspace.identity, refreshedTargets);
		}
	};
	try {
		await prepareWorkspaceOwnership();
	} catch {
		throw new SubAgentSessionFactoryError(
			"session_initialization_failed",
			bashEnabled
				? "Could not acquire the child workspace-exclusive bash lease"
				: "Could not acquire the declared child write scope",
		);
	}
	const guardedReadTool = selectedBuiltInTools.includes("read")
		? createGuardedChildReadTool({ cwd, workspace: workspace.identity })
		: undefined;
	const guardedGrepTool = selectedBuiltInTools.includes("grep")
		? createGuardedChildGrepTool({ cwd, workspace: workspace.identity })
		: undefined;
	const guardedFindTool = selectedBuiltInTools.includes("find")
		? createGuardedChildFindTool({ cwd, workspace: workspace.identity })
		: undefined;
	const guardedLsTool = selectedBuiltInTools.includes("ls")
		? createGuardedChildLsTool({ cwd, workspace: workspace.identity })
		: undefined;
	const guardedEditTool = editEnabled
		? createGuardedChildEditTool({
				cwd,
				workspace: workspace.identity,
				writeScope,
				claimFiles: (targets) => options.claimFileLeases!(workspace.identity, targets),
				recordMutation: (target) => options.onFileMutation!(target),
			})
		: undefined;
	const guardedWriteTool = writeEnabled
		? createGuardedChildWriteTool({
				cwd,
				workspace: workspace.identity,
				writeScope,
				claimFiles: (targets) => options.claimFileLeases!(workspace.identity, targets),
				reconcileFile: (target) => options.reconcileFileLease!(workspace.identity, target),
				recordMutation: (target) => options.onFileMutation!(target),
			})
		: undefined;
	const guardedBashTool = bashEnabled
		? createGuardedChildBashTool({
				cwd,
				workspace: workspace.identity,
				claimWorkspace: () => options.claimWorkspaceLease!(workspace.identity),
				dependencies: dependencies.guardedBashOperations
					? { operations: dependencies.guardedBashOperations }
					: undefined,
			})
		: undefined;

	let session: AgentSession | undefined;
	let unsubscribe: (() => void) | undefined;
	try {
		const sessionManager = createSessionManager(cwd);
		const settingsManager = createSettingsManager();
		const resourceLoader = createResourceLoader({
			id: options.id,
			generation: options.generation,
			spec: options.spec,
			parentContext: options.parentContext,
			contextDisplayPathMapping,
		});
		const result = await createSession({
			cwd,
			model: options.resolvedModel.model,
			thinkingLevel: requestedThinkingLevel,
			modelRuntime: options.resolvedModel.runtime,
			customTools: [
				reportToParentTool,
				...(guardedReadTool ? [guardedReadTool] : []),
				...(guardedGrepTool ? [guardedGrepTool] : []),
				...(guardedFindTool ? [guardedFindTool] : []),
				...(guardedLsTool ? [guardedLsTool] : []),
				...(guardedEditTool ? [guardedEditTool] : []),
				...(guardedWriteTool ? [guardedWriteTool] : []),
				...(guardedBashTool ? [guardedBashTool] : []),
			],
			tools: [...selectedTools],
			resourceLoader,
			sessionManager,
			settingsManager,
		});
		session = result.session;
		validateInitializedSession({
			session,
			sessionManager,
			settingsManager,
			resourceLoader,
			resolvedModel: options.resolvedModel,
			selectedTools,
			cwd,
		});
		try {
			unsubscribe = session.subscribe(options.onEvent);
		} catch {
			throw new SubAgentSessionFactoryError(
				"event_subscription_failed",
				"Could not subscribe to child session events",
			);
		}

		return new SubAgentSessionRuntime({
			id: options.id,
			generation: options.generation,
			cwd,
			workspace: workspace.identity,
			writeScope,
			session,
			sessionManager,
			settingsManager,
			resourceLoader,
			selectedTools,
			prepareWorkspaceOwnership,
			unsubscribe,
			cleanupTimeoutMs,
		});
	} catch (error) {
		const cleanup = await cleanPartialSession(session, unsubscribe, cleanupTimeoutMs);
		if (cleanup.cleanupFailed || !cleanup.runtimeSettled) {
			throw new SubAgentSessionFactoryError(
				"session_cleanup_failed",
				"Could not initialize and settle the child session cleanly",
				{ runtimeSettled: cleanup.runtimeSettled },
			);
		}
		if (error instanceof SubAgentSessionFactoryError) throw error;
		throw new SubAgentSessionFactoryError(
			"session_initialization_failed",
			"Could not initialize the child session",
			{ runtimeSettled: true },
		);
	}
}
