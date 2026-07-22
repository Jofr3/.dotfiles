import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
	createAgentSession,
	SessionManager,
	SettingsManager,
	type AgentSession,
	type AgentSessionEventListener,
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
import type {
	ChildToolName,
	DynamicAgentSpec,
	SessionGeneration,
	SubAgentId,
	ThinkingLevel,
} from "./types.ts";
import { SUB_AGENT_BOUNDS } from "./types.ts";

export const READ_ONLY_CHILD_TOOL_NAMES = Object.freeze([
	"read",
	"grep",
	"find",
	"ls",
] as const);

export type ReadOnlyChildToolName = (typeof READ_ONLY_CHILD_TOOL_NAMES)[number];

const READ_ONLY_CHILD_TOOLS = new Set<string>(READ_ONLY_CHILD_TOOL_NAMES);
const MUTATING_CHILD_TOOLS = new Set<string>(["edit", "write", "bash"]);
const THINKING_LEVELS = new Set<string>([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

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

	constructor(code: SubAgentSessionFactoryErrorCode, message: string) {
		super(message);
		this.name = "SubAgentSessionFactoryError";
		this.code = code;
	}
}

export interface SubAgentSessionFactoryDependencies {
	createSession?: (options: CreateAgentSessionOptions) => Promise<CreateAgentSessionResult>;
	createSessionManager?: (cwd: string) => SessionManager;
	createSettingsManager?: () => SettingsManager;
	createResourceLoader?: (options: CreateSubAgentResourceLoaderOptions) => ResourceLoader;
}

export interface CreateSubAgentSessionOptions {
	id: SubAgentId;
	generation: SessionGeneration;
	/** Parent generation's canonical workspace boundary. */
	cwd: string;
	spec: Readonly<DynamicAgentSpec>;
	resolvedModel: ResolvedChildModel;
	parentContext?: ParentContextSnapshotV1;
	onEvent: AgentSessionEventListener;
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
	readonly session: AgentSession;
	readonly sessionManager: SessionManager;
	readonly settingsManager: SettingsManager;
	readonly resourceLoader: ResourceLoader;
	readonly selectedTools: readonly ReadOnlyChildToolName[];
	readonly modelRef: Readonly<{ provider: string; id: string }>;

	#unsubscribe?: () => void;
	#disposed = false;
	#closePromise?: Promise<void>;

	constructor(options: {
		id: SubAgentId;
		generation: SessionGeneration;
		cwd: string;
		session: AgentSession;
		sessionManager: SessionManager;
		settingsManager: SettingsManager;
		resourceLoader: ResourceLoader;
		selectedTools: readonly ReadOnlyChildToolName[];
		modelRef: Readonly<{ provider: string; id: string }>;
		unsubscribe: () => void;
	}) {
		this.id = options.id;
		this.generation = options.generation;
		this.cwd = options.cwd;
		this.session = options.session;
		this.sessionManager = options.sessionManager;
		this.settingsManager = options.settingsManager;
		this.resourceLoader = options.resourceLoader;
		this.selectedTools = Object.freeze([...options.selectedTools]);
		this.modelRef = Object.freeze({ ...options.modelRef });
		this.#unsubscribe = options.unsubscribe;
	}

	get disposed(): boolean {
		return this.#disposed;
	}

	get thinkingLevel(): ThinkingLevel {
		return this.session.thinkingLevel as ThinkingLevel;
	}

	abort(): Promise<void> {
		return this.session.abort();
	}

	waitForIdle(): Promise<void> {
		return this.session.waitForIdle();
	}

	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
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
		} catch (error) {
			firstError ??= error;
		}
		if (firstError) {
			throw new SubAgentSessionFactoryError(
				"session_cleanup_failed",
				"Could not dispose the child session cleanly",
			);
		}
	}

	close(): Promise<void> {
		if (this.#closePromise) return this.#closePromise;
		this.#closePromise = (async () => {
			let failed = false;
			for (const operation of [
				() => this.abort(),
				() => this.waitForIdle(),
				() => this.dispose(),
			]) {
				try {
					await operation();
				} catch {
					failed = true;
				}
			}
			if (failed) {
				throw new SubAgentSessionFactoryError(
					"session_cleanup_failed",
					"Could not close the child session cleanly",
				);
			}
		})();
		return this.#closePromise;
	}
}

function isWithinRoot(root: string, candidate: string): boolean {
	const pathFromRoot = relative(root, candidate);
	return (
		pathFromRoot === "" ||
		(!isAbsolute(pathFromRoot) && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`))
	);
}

async function canonicalDirectory(path: string): Promise<string> {
	try {
		const canonical = await realpath(path);
		if (!(await stat(canonical)).isDirectory()) {
			throw new Error("not a directory");
		}
		return canonical;
	} catch {
		throw new SubAgentSessionFactoryError(
			"workspace_unavailable",
			"The child workspace directory is unavailable",
		);
	}
}

async function resolveChildWorkspaceCwd(
	parentCwd: string,
	spec: Readonly<DynamicAgentSpec>,
): Promise<string> {
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
	if (workspaceMode === "worktree") {
		throw new SubAgentSessionFactoryError(
			"unsupported_workspace",
			"Worktree child sessions are not enabled yet",
		);
	}
	if (workspaceMode !== "shared") {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"The child workspace mode is invalid",
		);
	}
	if (
		(spec.workspace?.writeScope?.length ?? 0) > 0 ||
		(spec.workspace?.bashPolicy !== undefined && spec.workspace.bashPolicy !== "disabled")
	) {
		throw new SubAgentSessionFactoryError(
			"mutating_tools_disabled",
			"Shared-workspace mutation policies are not enabled for read-only child sessions",
		);
	}

	const root = await canonicalDirectory(resolve(parentCwd));
	const requested = spec.workspace?.cwd?.trim();
	const candidate = await canonicalDirectory(requested ? resolve(root, requested) : root);
	if (!isWithinRoot(root, candidate)) {
		throw new SubAgentSessionFactoryError(
			"workspace_outside_root",
			"The child workspace must remain inside the parent workspace",
		);
	}
	return candidate;
}

export function resolveReadOnlyChildTools(
	requested: readonly ChildToolName[] | undefined,
): readonly ReadOnlyChildToolName[] {
	if (requested === undefined) return READ_ONLY_CHILD_TOOL_NAMES;
	if (!Array.isArray(requested) || requested.length > SUB_AGENT_BOUNDS.tools) {
		throw new SubAgentSessionFactoryError(
			"unsupported_tool",
			`Child tools must be an array of at most ${SUB_AGENT_BOUNDS.tools} names`,
		);
	}

	const selected: ReadOnlyChildToolName[] = [];
	const seen = new Set<string>();
	for (const value of requested) {
		if (typeof value !== "string" || !value.trim()) {
			throw new SubAgentSessionFactoryError("unsupported_tool", "A child tool name is invalid");
		}
		const name = value.trim();
		if (MUTATING_CHILD_TOOLS.has(name)) {
			throw new SubAgentSessionFactoryError(
				"mutating_tools_disabled",
				`Mutating child tool is not enabled yet: ${name}`,
			);
		}
		if (!READ_ONLY_CHILD_TOOLS.has(name)) {
			throw new SubAgentSessionFactoryError("unsupported_tool", `Unsupported child tool: ${name.slice(0, 80)}`);
		}
		if (!seen.has(name)) {
			seen.add(name);
			selected.push(name as ReadOnlyChildToolName);
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
	selectedTools: readonly ReadOnlyChildToolName[];
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

async function cleanPartialSession(
	session: AgentSession | undefined,
	unsubscribe: (() => void) | undefined,
): Promise<void> {
	if (!session) return;
	try {
		unsubscribe?.();
	} catch {
		// Continue through all supported child cleanup operations.
	}
	try {
		await session.abort();
	} catch {
		// Continue to idle wait and disposal.
	}
	try {
		await session.waitForIdle();
	} catch {
		// Disposal is still required after an incomplete wait.
	}
	try {
		session.dispose();
	} catch {
		// Initialization reports one bounded authoritative error below.
	}
}

/**
 * Builds one reusable, read-only child AgentSession with no persisted settings,
 * session transcript, discovered extension, or unapproved tool.
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
	if (!options.resolvedModel?.runtime || !options.resolvedModel?.model || !options.resolvedModel?.ref) {
		throw new SubAgentSessionFactoryError(
			"invalid_runtime_request",
			"A resolved child model is required",
		);
	}

	const dependencies = options.dependencies ?? {};
	const createSession = dependencies.createSession ?? createAgentSession;
	const createSessionManager = dependencies.createSessionManager ?? ((cwd) => SessionManager.inMemory(cwd));
	const createSettingsManager = dependencies.createSettingsManager ?? (() => SettingsManager.inMemory());
	const createResourceLoader = dependencies.createResourceLoader ?? createSubAgentResourceLoader;
	const selectedTools = resolveReadOnlyChildTools(options.spec.tools);
	const requestedThinkingLevel = resolveRequestedThinkingLevel(options.spec);
	const cwd = await resolveChildWorkspaceCwd(options.cwd, options.spec);

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
		});
		const result = await createSession({
			cwd,
			model: options.resolvedModel.model,
			thinkingLevel: requestedThinkingLevel,
			modelRuntime: options.resolvedModel.runtime,
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
			session,
			sessionManager,
			settingsManager,
			resourceLoader,
			selectedTools,
			modelRef: options.resolvedModel.ref,
			unsubscribe,
		});
	} catch (error) {
		await cleanPartialSession(session, unsubscribe);
		if (error instanceof SubAgentSessionFactoryError) throw error;
		throw new SubAgentSessionFactoryError(
			"session_initialization_failed",
			"Could not initialize the child session",
		);
	}
}
