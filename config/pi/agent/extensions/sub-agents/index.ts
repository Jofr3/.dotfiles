import { chmod, mkdir } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";
import { getAgentDir, type ExtensionAPI, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { SubAgentAssignmentRunner } from "./assignment-runner.ts";
import { SubAgentManager } from "./manager.ts";
import { SubAgentModelRouter } from "./model-router.ts";
import {
	createSubAgentNotificationRuntime,
	type ParentNotificationSender,
} from "./notifications.ts";
import {
	createSubAgentPersistenceRuntime,
	reconstructSubAgentHistoryFromBranch,
	type SubAgentCheckpointBatchResult,
} from "./persistence.ts";
import type { ParentContextFile } from "./resource-loader.ts";
import {
	createSubAgentsReconfigureTool,
	type SubAgentsReconfigureRuntime,
} from "./tools/reconfigure.ts";
import {
	createSubAgentsRemoveTool,
	type SubAgentsRemoveRuntime,
} from "./tools/remove.ts";
import {
	createSubAgentsReleaseTool,
	type SubAgentsReleaseRuntime,
} from "./tools/release.ts";
import {
	createSubAgentsSendTool,
	type SubAgentsSendRuntime,
} from "./tools/send.ts";
import {
	createSubAgentsSpawnTool,
	type SubAgentsSpawnRuntime,
} from "./tools/spawn.ts";
import {
	createSubAgentsStatusTool,
	type SubAgentsStatusRuntime,
} from "./tools/status.ts";
import {
	createSubAgentsWaitTool,
	type SubAgentsWaitRuntime,
} from "./tools/wait.ts";
import type { SubAgentManagerSummary } from "./types.ts";
import {
	createSubAgentDashboardRuntime,
	runSubAgentsDashboardCommand,
	type SubAgentDashboardRuntime,
} from "./ui/dashboard.ts";
import {
	createSubAgentStatusWidgetRuntime,
	type SubAgentWidgetHost,
} from "./ui/widget.ts";
import {
	isParentMutationToolName,
	ParentMutationInterceptor,
	type ParentMutationBlock,
	type ParentMutationCompletionEvent,
	type ParentMutationToolCallEvent,
} from "./workspace/parent-mutations.ts";
import { createWorktreeGitOperations } from "./workspace/worktree-git.ts";
import { createWorktreeStateStore } from "./workspace/worktree-state.ts";
import { createWorktreeManager } from "./workspace/worktrees.ts";

const STATUS_ORDER = ["creating", "running", "idle", "blocked", "failed", "stopping"] as const;

type SpawnWorktreeRuntime = NonNullable<SubAgentsSpawnRuntime["worktrees"]>;

export interface ProductionWorktreeProvisionerOptions {
	readonly agentDirectory?: string;
	readonly stateRoot?: string;
	readonly operationalEnvironment?: Readonly<NodeJS.ProcessEnv>;
	readonly now?: () => Date;
}

async function ensurePrivateDirectory(path: string): Promise<string> {
	const absolute = resolvePath(path);
	await mkdir(absolute, { recursive: true, mode: 0o700 });
	if (process.platform !== "win32") await chmod(absolute, 0o700);
	return absolute;
}

/**
 * Lazy production Phase 8 worktree provisioner. Constructing this object performs
 * no Git/state side effect; initialization occurs only after the disabled public
 * release gate is opened and a worktree request reaches the resolver.
 */
export function createProductionWorktreeProvisioner(
	manager: SubAgentManager,
	options: Readonly<ProductionWorktreeProvisionerOptions> = {},
): SpawnWorktreeRuntime {
	let promise: Promise<ReturnType<typeof createWorktreeManager>> | undefined;
	const load = async () => {
		if (!promise) {
			promise = (async () => {
				const state = createWorktreeStateStore({
					agentDirectory: resolvePath(options.agentDirectory ?? getAgentDir()),
					...(options.stateRoot ? { stateRoot: resolvePath(options.stateRoot) } : {}),
					...(options.now ? { now: options.now } : {}),
				});
				const runtimeRoot = state.configuredStateRoot;
				const [home, temporary, hooks] = await Promise.all([
					ensurePrivateDirectory(join(runtimeRoot, "git-home")),
					ensurePrivateDirectory(join(runtimeRoot, "git-temp")),
					ensurePrivateDirectory(join(runtimeRoot, "empty-hooks")),
				]);
				const git = await createWorktreeGitOperations({
					operationalEnvironment: options.operationalEnvironment,
					privateHomeDirectory: home,
					privateTemporaryDirectory: temporary,
					emptyHooksDirectory: hooks,
				});
				return createWorktreeManager({
					git,
					state,
					registry: {
						registerWorktree: (input) => manager.registerWorktreeWorkspace(input),
						authorize: (workspace, ownerAgentId) => manager.authorizeWorkspace(workspace, ownerAgentId),
					},
					...(options.now ? { now: options.now } : {}),
				});
			})();
		}
		return promise;
	};
	return Object.freeze({
		prepare: async (request) => (await load()).prepare(request),
		provisionApproved: async (plan, admission, runtimeOptions) =>
			(await load()).provisionApproved(plan, admission, runtimeOptions),
		retain: async (allocation) => (await load()).retain(allocation),
		collectOwnedChanges: async (allocation, workspace) =>
			(await load()).collectOwnedChanges(allocation, workspace),
		collectCatalogChanges: async (request) =>
			(await load()).collectCatalogChanges(request),
	});
}

export interface ManagerLifecycle {
	readonly generation: string;
	getSummary(): SubAgentManagerSummary;
	captureParentContext(contextFiles: readonly ParentContextFile[] | undefined, trusted: boolean): unknown;
	disposeAll(reason?: string): Promise<void>;
}

export interface NotificationLifecycle {
	shutdown(): void;
}

export interface PersistenceLifecycle {
	checkpointAll(): SubAgentCheckpointBatchResult;
	shutdown(): void;
}

export interface WidgetLifecycle {
	shutdown(): void;
}

export interface ParentMutationLifecycle {
	handleToolCall(
		event: ParentMutationToolCallEvent,
		cwd: string,
	): Promise<ParentMutationBlock | undefined>;
	handleToolResult(event: ParentMutationCompletionEvent): void;
	handleToolExecutionEnd(event: ParentMutationCompletionEvent): void;
	ownsToolCall(event: ParentMutationCompletionEvent): boolean;
	shutdown(): void;
	waitForIdle(): Promise<void>;
}

export interface SubAgentsExtensionDependencies {
	createManager?: (cwd: string) => ManagerLifecycle;
	restoreManagerHistory?: (
		manager: ManagerLifecycle,
		getActiveBranch: () => readonly SessionEntry[],
	) => void;
	createPersistenceRuntime?: (
		manager: ManagerLifecycle,
		appendEntry: (customType: string, data: unknown) => void,
	) => PersistenceLifecycle | undefined;
	createSpawnRuntime?: (manager: ManagerLifecycle) => SubAgentsSpawnRuntime | undefined;
	createStatusRuntime?: (manager: ManagerLifecycle) => SubAgentsStatusRuntime | undefined;
	createSendRuntime?: (
		manager: ManagerLifecycle,
		spawnRuntime: SubAgentsSpawnRuntime | undefined,
	) => SubAgentsSendRuntime | undefined;
	createReconfigureRuntime?: (
		manager: ManagerLifecycle,
		spawnRuntime: SubAgentsSpawnRuntime | undefined,
	) => SubAgentsReconfigureRuntime | undefined;
	createWaitRuntime?: (manager: ManagerLifecycle) => SubAgentsWaitRuntime | undefined;
	createReleaseRuntime?: (manager: ManagerLifecycle) => SubAgentsReleaseRuntime | undefined;
	createRemoveRuntime?: (
		manager: ManagerLifecycle,
		spawnRuntime: SubAgentsSpawnRuntime | undefined,
	) => SubAgentsRemoveRuntime | undefined;
	createNotificationRuntime?: (
		manager: ManagerLifecycle,
		sendMessage: ParentNotificationSender,
	) => NotificationLifecycle | undefined;
	createWidgetRuntime?: (
		manager: ManagerLifecycle,
		host: SubAgentWidgetHost,
	) => WidgetLifecycle | undefined;
	createDashboardRuntime?: (
		manager: ManagerLifecycle,
		sendRuntime: SubAgentsSendRuntime | undefined,
	) => SubAgentDashboardRuntime | undefined;
	createParentMutationRuntime?: (
		manager: ManagerLifecycle,
	) => ParentMutationLifecycle | undefined;
}

export function formatSubAgentsStatus(summary: SubAgentManagerSummary | undefined): string {
	if (!summary) return "sub-agents: inactive (no parent session generation)";
	const states = STATUS_ORDER.map((state) => `${state} ${summary.counts[state]}`).join(" · ");
	return [
		`sub-agents ${summary.generation}`,
		`${summary.active} active · ${summary.historical} historical · ${states}`,
		summary.closed
			? "manager closed"
			: "manager ready (spawn/status/send/reconfigure/wait/release/remove enabled)",
	].join("\n");
}

export function registerSubAgentsExtension(
	pi: ExtensionAPI,
	dependencies: SubAgentsExtensionDependencies = {},
): void {
	const createManager = dependencies.createManager ?? ((cwd: string) => new SubAgentManager({ cwd }));
	const restoreManagerHistory =
		dependencies.restoreManagerHistory ??
		((current: ManagerLifecycle, getActiveBranch: () => readonly SessionEntry[]): void => {
			if (!(current instanceof SubAgentManager)) return;
			const restoration = reconstructSubAgentHistoryFromBranch(getActiveBranch());
			current.restoreHistoricalRecords(restoration.histories);
		});
	const createPersistenceRuntime =
		dependencies.createPersistenceRuntime ??
		((
			current: ManagerLifecycle,
			appendEntry: (customType: string, data: unknown) => void,
		): PersistenceLifecycle | undefined => {
			if (!(current instanceof SubAgentManager)) return undefined;
			return createSubAgentPersistenceRuntime({
				manager: current,
				appendEntry: (customType, data) => appendEntry(customType, data),
			});
		});
	const createSpawnRuntime =
		dependencies.createSpawnRuntime ??
		((current: ManagerLifecycle): SubAgentsSpawnRuntime | undefined => {
			if (!(current instanceof SubAgentManager)) return undefined;
			return {
				manager: current,
				runner: new SubAgentAssignmentRunner(current),
				router: new SubAgentModelRouter(current.modelRuntime),
				worktrees: createProductionWorktreeProvisioner(current),
				worktreeModeEnabled: false,
			};
		});
	const createStatusRuntime =
		dependencies.createStatusRuntime ??
		((current: ManagerLifecycle): SubAgentsStatusRuntime | undefined => {
			if (!(current instanceof SubAgentManager)) return undefined;
			const worktrees = createProductionWorktreeProvisioner(current);
			return {
				manager: current,
				collectWorktreeCatalogChanges: (request) => worktrees.collectCatalogChanges!(request),
			};
		});
	const createSendRuntime =
		dependencies.createSendRuntime ??
		((
			current: ManagerLifecycle,
			currentSpawnRuntime: SubAgentsSpawnRuntime | undefined,
		): SubAgentsSendRuntime | undefined => {
			if (!(current instanceof SubAgentManager) || !currentSpawnRuntime) return undefined;
			return { manager: current, runner: currentSpawnRuntime.runner };
		});
	const createReconfigureRuntime =
		dependencies.createReconfigureRuntime ??
		((
			current: ManagerLifecycle,
			currentSpawnRuntime: SubAgentsSpawnRuntime | undefined,
		): SubAgentsReconfigureRuntime | undefined => {
			if (!(current instanceof SubAgentManager) || !currentSpawnRuntime) return undefined;
			return {
				manager: current,
				runner: currentSpawnRuntime.runner,
				router: currentSpawnRuntime.router,
			};
		});
	const createWaitRuntime =
		dependencies.createWaitRuntime ??
		((current: ManagerLifecycle): SubAgentsWaitRuntime | undefined => {
			if (!(current instanceof SubAgentManager)) return undefined;
			return { manager: current };
		});
	const createReleaseRuntime =
		dependencies.createReleaseRuntime ??
		((current: ManagerLifecycle): SubAgentsReleaseRuntime | undefined => {
			if (!(current instanceof SubAgentManager)) return undefined;
			return { manager: current };
		});
	const createRemoveRuntime =
		dependencies.createRemoveRuntime ??
		((
			current: ManagerLifecycle,
			currentSpawnRuntime: SubAgentsSpawnRuntime | undefined,
		): SubAgentsRemoveRuntime | undefined => {
			if (!(current instanceof SubAgentManager) || !currentSpawnRuntime) return undefined;
			return { manager: current, runner: currentSpawnRuntime.runner };
		});
	const createNotificationRuntime =
		dependencies.createNotificationRuntime ??
		((
			current: ManagerLifecycle,
			sendMessage: ParentNotificationSender,
		): NotificationLifecycle | undefined => {
			if (!(current instanceof SubAgentManager)) return undefined;
			return createSubAgentNotificationRuntime({ manager: current, sendMessage });
		});
	const createWidgetRuntime =
		dependencies.createWidgetRuntime ??
		((current: ManagerLifecycle, host: SubAgentWidgetHost): WidgetLifecycle | undefined => {
			if (!(current instanceof SubAgentManager)) return undefined;
			return createSubAgentStatusWidgetRuntime({ manager: current, host });
		});
	const createDashboardRuntime =
		dependencies.createDashboardRuntime ??
		((
			current: ManagerLifecycle,
			currentSendRuntime: SubAgentsSendRuntime | undefined,
		): SubAgentDashboardRuntime | undefined => {
			if (!(current instanceof SubAgentManager) || !currentSendRuntime) return undefined;
			return createSubAgentDashboardRuntime({
				manager: current,
				sendRuntime: currentSendRuntime,
			});
		});
	const createParentMutationRuntime =
		dependencies.createParentMutationRuntime ??
		((current: ManagerLifecycle): ParentMutationLifecycle | undefined => {
			if (!(current instanceof SubAgentManager)) return undefined;
			return new ParentMutationInterceptor(current);
		});
	let manager: ManagerLifecycle | undefined;
	let persistenceRuntime: PersistenceLifecycle | undefined;
	let spawnRuntime: SubAgentsSpawnRuntime | undefined;
	let statusRuntime: SubAgentsStatusRuntime | undefined;
	let sendRuntime: SubAgentsSendRuntime | undefined;
	let reconfigureRuntime: SubAgentsReconfigureRuntime | undefined;
	let waitRuntime: SubAgentsWaitRuntime | undefined;
	let releaseRuntime: SubAgentsReleaseRuntime | undefined;
	let removeRuntime: SubAgentsRemoveRuntime | undefined;
	let notificationRuntime: NotificationLifecycle | undefined;
	let widgetRuntime: WidgetLifecycle | undefined;
	let dashboardRuntime: SubAgentDashboardRuntime | undefined;
	let parentMutationRuntime: ParentMutationLifecycle | undefined;
	const parentMutationOwnerByToolCallId = new Map<
		string,
		{ owner: ParentMutationLifecycle; toolName: string }
	>();
	let lifecycleTail: Promise<void> = Promise.resolve();
	let lifecycleCleanupBlocked = false;

	const serializeLifecycle = (operation: () => void | Promise<void>): Promise<void> => {
		const run = lifecycleTail.then(operation, operation);
		lifecycleTail = run.catch(() => undefined);
		return run;
	};

	const checkpointPersistence = (current: PersistenceLifecycle | undefined): void => {
		try {
			current?.checkpointAll();
		} catch {
			// A persistence failure must not prevent authoritative manager cleanup.
		}
	};

	const stopPersistence = (current: PersistenceLifecycle | undefined): void => {
		try {
			current?.shutdown();
		} catch {
			// Persistence cleanup must not prevent authoritative manager disposal.
		}
	};

	const stopNotifications = (current: NotificationLifecycle | undefined): void => {
		try {
			current?.shutdown();
		} catch {
			// Notification cleanup must not prevent authoritative manager disposal.
		}
	};

	const stopWidget = (current: WidgetLifecycle | undefined): void => {
		try {
			current?.shutdown();
		} catch {
			// Widget cleanup must not prevent authoritative manager disposal.
		}
	};

	const stopDashboard = (current: SubAgentDashboardRuntime | undefined): void => {
		try {
			current?.shutdown();
		} catch {
			// Dashboard cleanup must not prevent authoritative manager disposal.
		}
	};

	const forgetParentMutationOwner = (
		current: ParentMutationLifecycle | undefined,
	): void => {
		if (!current) return;
		for (const [toolCallId, entry] of parentMutationOwnerByToolCallId) {
			if (entry.owner === current) parentMutationOwnerByToolCallId.delete(toolCallId);
		}
	};

	const stopParentMutations = async (
		current: ParentMutationLifecycle | undefined,
	): Promise<boolean> => {
		if (!current) return false;
		let failed = false;
		try {
			current.shutdown();
		} catch {
			failed = true;
		}
		try {
			await current.waitForIdle();
		} catch {
			failed = true;
		}
		return failed;
	};

	const replaceManager = (
		cwd: string,
		reason: string,
		widgetHost?: SubAgentWidgetHost,
		checkpointDisposedHistory = true,
		getActiveBranch: () => readonly SessionEntry[] = () => [],
	): Promise<void> =>
		serializeLifecycle(async () => {
			if (lifecycleCleanupBlocked) {
				throw new Error("Sub-agent generation cleanup remains unproven; replacement is blocked");
			}
			const previous = manager;
			const previousPersistence = persistenceRuntime;
			const previousNotifications = notificationRuntime;
			const previousWidget = widgetRuntime;
			const previousDashboard = dashboardRuntime;
			const previousParentMutations = parentMutationRuntime;
			manager = undefined;
			persistenceRuntime = undefined;
			spawnRuntime = undefined;
			statusRuntime = undefined;
			sendRuntime = undefined;
			reconfigureRuntime = undefined;
			waitRuntime = undefined;
			releaseRuntime = undefined;
			removeRuntime = undefined;
			notificationRuntime = undefined;
			widgetRuntime = undefined;
			dashboardRuntime = undefined;
			parentMutationRuntime = undefined;
			if (!checkpointDisposedHistory) stopPersistence(previousPersistence);
			// Stop callback producers before any potentially delayed parent-tool
			// quiescence wait so no timer/dialog/notification survives shutdown.
			stopDashboard(previousDashboard);
			stopWidget(previousWidget);
			stopNotifications(previousNotifications);
			const parentMutationCleanupFailed = await stopParentMutations(previousParentMutations);
			let managerCleanupFailed = false;
			try {
				if (previous) await previous.disposeAll(reason);
			} catch {
				managerCleanupFailed = true;
			} finally {
				if (checkpointDisposedHistory) {
					checkpointPersistence(previousPersistence);
					stopPersistence(previousPersistence);
				}
			}
			if (parentMutationCleanupFailed || managerCleanupFailed) {
				lifecycleCleanupBlocked = true;
				forgetParentMutationOwner(previousParentMutations);
				throw new Error("Sub-agent generation cleanup failed; the session generation remains inactive");
			}
			const next = createManager(cwd);
			let nextPersistenceRuntime: PersistenceLifecycle | undefined;
			let nextNotificationRuntime: NotificationLifecycle | undefined;
			let nextWidgetRuntime: WidgetLifecycle | undefined;
			let nextDashboardRuntime: SubAgentDashboardRuntime | undefined;
			let nextParentMutationRuntime: ParentMutationLifecycle | undefined;
			try {
				restoreManagerHistory(next, getActiveBranch);
				nextPersistenceRuntime = createPersistenceRuntime(
					next,
					(customType, data) => pi.appendEntry(customType, data),
				);
				const nextSpawnRuntime = createSpawnRuntime(next);
				const nextStatusRuntime = createStatusRuntime(next);
				const nextSendRuntime = createSendRuntime(next, nextSpawnRuntime);
				const nextReconfigureRuntime = createReconfigureRuntime(next, nextSpawnRuntime);
				const nextWaitRuntime = createWaitRuntime(next);
				const nextReleaseRuntime = createReleaseRuntime(next);
				const nextRemoveRuntime = createRemoveRuntime(next, nextSpawnRuntime);
				nextDashboardRuntime = createDashboardRuntime(next, nextSendRuntime);
				nextParentMutationRuntime = createParentMutationRuntime(next);
				nextNotificationRuntime = createNotificationRuntime(
					next,
					(message, options) => pi.sendMessage(message, options),
				);
				nextWidgetRuntime = widgetHost
					? createWidgetRuntime(next, widgetHost)
					: undefined;
				manager = next;
				persistenceRuntime = nextPersistenceRuntime;
				spawnRuntime = nextSpawnRuntime;
				statusRuntime = nextStatusRuntime;
				sendRuntime = nextSendRuntime;
				reconfigureRuntime = nextReconfigureRuntime;
				waitRuntime = nextWaitRuntime;
				releaseRuntime = nextReleaseRuntime;
				removeRuntime = nextRemoveRuntime;
				notificationRuntime = nextNotificationRuntime;
				widgetRuntime = nextWidgetRuntime;
				dashboardRuntime = nextDashboardRuntime;
				parentMutationRuntime = nextParentMutationRuntime;
			} catch (error) {
				stopDashboard(nextDashboardRuntime);
				stopWidget(nextWidgetRuntime);
				stopNotifications(nextNotificationRuntime);
				const nextParentCleanupFailed = await stopParentMutations(nextParentMutationRuntime);
				if (nextParentCleanupFailed) forgetParentMutationOwner(nextParentMutationRuntime);
				stopPersistence(nextPersistenceRuntime);
				let nextManagerCleanupFailed = false;
				try {
					await next.disposeAll(`${reason}: runtime initialization failed`);
				} catch {
					nextManagerCleanupFailed = true;
				}
				if (nextParentCleanupFailed || nextManagerCleanupFailed) {
					lifecycleCleanupBlocked = true;
					forgetParentMutationOwner(nextParentMutationRuntime);
				}
				throw error;
			}
		});

	const shutdownManager = (reason: string): Promise<void> =>
		serializeLifecycle(async () => {
			const previous = manager;
			const previousPersistence = persistenceRuntime;
			const previousNotifications = notificationRuntime;
			const previousWidget = widgetRuntime;
			const previousDashboard = dashboardRuntime;
			const previousParentMutations = parentMutationRuntime;
			manager = undefined;
			persistenceRuntime = undefined;
			spawnRuntime = undefined;
			statusRuntime = undefined;
			sendRuntime = undefined;
			reconfigureRuntime = undefined;
			waitRuntime = undefined;
			releaseRuntime = undefined;
			removeRuntime = undefined;
			notificationRuntime = undefined;
			widgetRuntime = undefined;
			dashboardRuntime = undefined;
			parentMutationRuntime = undefined;
			stopDashboard(previousDashboard);
			stopWidget(previousWidget);
			stopNotifications(previousNotifications);
			const parentMutationCleanupFailed = await stopParentMutations(previousParentMutations);
			let managerCleanupFailed = false;
			try {
				if (previous) await previous.disposeAll(reason);
			} catch {
				managerCleanupFailed = true;
			} finally {
				checkpointPersistence(previousPersistence);
				stopPersistence(previousPersistence);
			}
			if (parentMutationCleanupFailed || managerCleanupFailed) {
				lifecycleCleanupBlocked = true;
				forgetParentMutationOwner(previousParentMutations);
				throw new Error("Sub-agent generation cleanup failed; the session generation remains inactive");
			}
		});

	pi.registerTool(createSubAgentsSpawnTool(() => spawnRuntime));
	pi.registerTool(createSubAgentsStatusTool(() => statusRuntime));
	pi.registerTool(createSubAgentsSendTool(() => sendRuntime));
	pi.registerTool(createSubAgentsReconfigureTool(() => reconfigureRuntime));
	pi.registerTool(createSubAgentsWaitTool(() => waitRuntime));
	pi.registerTool(createSubAgentsReleaseTool(() => releaseRuntime));
	pi.registerTool(createSubAgentsRemoveTool(() => removeRuntime));

	pi.on("tool_call", async (event, ctx) => {
		if (!isParentMutationToolName(event.toolName)) return undefined;
		if (parentMutationOwnerByToolCallId.has(event.toolCallId)) {
			return {
				block: true,
				reason: "Blocked by sub-agent workspace coordination: this tool-call ID is still finalizing an earlier mutation.",
			};
		}
		const current = parentMutationRuntime;
		if (!current) {
			return {
				block: true,
				reason: "Blocked by sub-agent workspace coordination: the parent session generation is inactive.",
			};
		}
		const result = await current.handleToolCall(event, ctx.cwd);
		if (current.ownsToolCall(event)) {
			parentMutationOwnerByToolCallId.set(event.toolCallId, {
				owner: current,
				toolName: event.toolName,
			});
		}
		return result;
	});

	pi.on("tool_result", (event) => {
		const entry = parentMutationOwnerByToolCallId.get(event.toolCallId);
		if (entry?.toolName === event.toolName) entry.owner.handleToolResult(event);
	});

	pi.on("tool_execution_end", (event) => {
		const entry = parentMutationOwnerByToolCallId.get(event.toolCallId);
		if (!entry || entry.toolName !== event.toolName) return;
		entry.owner.handleToolExecutionEnd(event);
		if (!entry.owner.ownsToolCall(event)) {
			parentMutationOwnerByToolCallId.delete(event.toolCallId);
		}
	});

	pi.on("session_start", async (event, ctx) => {
		await replaceManager(
			ctx.cwd,
			`session start: ${event.reason}`,
			ctx.mode === "tui" ? ctx.ui : undefined,
			true,
			() => ctx.sessionManager.getBranch(),
		);
	});

	pi.on("before_agent_start", (event, ctx) => {
		const current = manager;
		if (!current) return;
		try {
			current.captureParentContext(
				event.systemPromptOptions.contextFiles,
				ctx.isProjectTrusted(),
			);
		} catch {
			if (ctx.hasUI) {
				ctx.ui.notify(
					"sub-agents: parent context snapshot was rejected; children will receive no project context",
					"warning",
				);
			}
		}
	});

	pi.on("session_compact", async (event, ctx) => {
		await replaceManager(
			ctx.cwd,
			`session compact: ${event.reason}`,
			ctx.mode === "tui" ? ctx.ui : undefined,
			true,
			() => ctx.sessionManager.getBranch(),
		);
	});

	pi.on("session_tree", async (_event, ctx) => {
		await replaceManager(
			ctx.cwd,
			"session tree navigation",
			ctx.mode === "tui" ? ctx.ui : undefined,
			false,
			() => ctx.sessionManager.getBranch(),
		);
	});

	pi.on("session_shutdown", async (event, ctx) => {
		try {
			await shutdownManager(`session shutdown: ${event.reason}`);
		} finally {
			ctx.ui.setStatus("sub-agents", undefined);
			ctx.ui.setWidget("sub-agents", undefined);
		}
	});

	pi.registerCommand("sub-agents", {
		description: "Open the dynamic sub-agent dashboard",
		handler: async (_args, ctx) => {
			if (ctx.mode === "tui" && dashboardRuntime) {
				await runSubAgentsDashboardCommand(ctx, dashboardRuntime);
				return;
			}
			const text = formatSubAgentsStatus(manager?.getSummary());
			if (ctx.hasUI) ctx.ui.notify(text, manager ? "info" : "warning");
		},
	});
}

export default function subAgentsExtension(pi: ExtensionAPI): void {
	registerSubAgentsExtension(pi);
}
