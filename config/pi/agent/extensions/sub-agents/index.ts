import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
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

const STATUS_ORDER = ["creating", "running", "idle", "blocked", "failed", "stopping"] as const;

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
			};
		});
	const createStatusRuntime =
		dependencies.createStatusRuntime ??
		((current: ManagerLifecycle): SubAgentsStatusRuntime | undefined => {
			if (!(current instanceof SubAgentManager)) return undefined;
			return { manager: current };
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

	const stopParentMutations = async (
		current: ParentMutationLifecycle | undefined,
	): Promise<void> => {
		if (!current) return;
		current.shutdown();
		await current.waitForIdle();
	};

	const replaceManager = (
		cwd: string,
		reason: string,
		widgetHost?: SubAgentWidgetHost,
		checkpointDisposedHistory = true,
		getActiveBranch: () => readonly SessionEntry[] = () => [],
	): Promise<void> =>
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
			if (!checkpointDisposedHistory) stopPersistence(previousPersistence);
			await stopParentMutations(previousParentMutations);
			stopDashboard(previousDashboard);
			stopWidget(previousWidget);
			stopNotifications(previousNotifications);
			try {
				if (previous) await previous.disposeAll(reason);
			} finally {
				if (checkpointDisposedHistory) {
					checkpointPersistence(previousPersistence);
					stopPersistence(previousPersistence);
				}
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
				await stopParentMutations(nextParentMutationRuntime);
				stopDashboard(nextDashboardRuntime);
				stopWidget(nextWidgetRuntime);
				stopNotifications(nextNotificationRuntime);
				stopPersistence(nextPersistenceRuntime);
				try {
					await next.disposeAll(`${reason}: runtime initialization failed`);
				} catch {
					// Preserve the original initialization failure.
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
			await stopParentMutations(previousParentMutations);
			stopDashboard(previousDashboard);
			stopWidget(previousWidget);
			stopNotifications(previousNotifications);
			try {
				if (previous) await previous.disposeAll(reason);
			} finally {
				checkpointPersistence(previousPersistence);
				stopPersistence(previousPersistence);
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
		await shutdownManager(`session shutdown: ${event.reason}`);
		ctx.ui.setStatus("sub-agents", undefined);
		ctx.ui.setWidget("sub-agents", undefined);
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
