import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SubAgentAssignmentRunner } from "./assignment-runner.ts";
import { SubAgentManager } from "./manager.ts";
import { SubAgentModelRouter } from "./model-router.ts";
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

const STATUS_ORDER = ["creating", "running", "idle", "blocked", "failed", "stopping"] as const;

export interface ManagerLifecycle {
	readonly generation: string;
	getSummary(): SubAgentManagerSummary;
	captureParentContext(contextFiles: readonly ParentContextFile[] | undefined, trusted: boolean): unknown;
	disposeAll(reason?: string): Promise<void>;
}

export interface SubAgentsExtensionDependencies {
	createManager?: (cwd: string) => ManagerLifecycle;
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
	createRemoveRuntime?: (
		manager: ManagerLifecycle,
		spawnRuntime: SubAgentsSpawnRuntime | undefined,
	) => SubAgentsRemoveRuntime | undefined;
}

export function formatSubAgentsStatus(summary: SubAgentManagerSummary | undefined): string {
	if (!summary) return "sub-agents: inactive (no parent session generation)";
	const states = STATUS_ORDER.map((state) => `${state} ${summary.counts[state]}`).join(" · ");
	return [
		`sub-agents ${summary.generation}`,
		`${summary.active} active · ${summary.historical} historical · ${states}`,
		summary.closed
			? "manager closed"
			: "manager ready (spawn/status/send/reconfigure/wait/remove enabled)",
	].join("\n");
}

export function registerSubAgentsExtension(
	pi: ExtensionAPI,
	dependencies: SubAgentsExtensionDependencies = {},
): void {
	const createManager = dependencies.createManager ?? ((cwd: string) => new SubAgentManager({ cwd }));
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
	const createRemoveRuntime =
		dependencies.createRemoveRuntime ??
		((
			current: ManagerLifecycle,
			currentSpawnRuntime: SubAgentsSpawnRuntime | undefined,
		): SubAgentsRemoveRuntime | undefined => {
			if (!(current instanceof SubAgentManager) || !currentSpawnRuntime) return undefined;
			return { manager: current, runner: currentSpawnRuntime.runner };
		});
	let manager: ManagerLifecycle | undefined;
	let spawnRuntime: SubAgentsSpawnRuntime | undefined;
	let statusRuntime: SubAgentsStatusRuntime | undefined;
	let sendRuntime: SubAgentsSendRuntime | undefined;
	let reconfigureRuntime: SubAgentsReconfigureRuntime | undefined;
	let waitRuntime: SubAgentsWaitRuntime | undefined;
	let removeRuntime: SubAgentsRemoveRuntime | undefined;
	let lifecycleTail: Promise<void> = Promise.resolve();

	const serializeLifecycle = (operation: () => void | Promise<void>): Promise<void> => {
		const run = lifecycleTail.then(operation, operation);
		lifecycleTail = run.catch(() => undefined);
		return run;
	};

	const replaceManager = (cwd: string, reason: string): Promise<void> =>
		serializeLifecycle(async () => {
			const previous = manager;
			manager = undefined;
			spawnRuntime = undefined;
			statusRuntime = undefined;
			sendRuntime = undefined;
			reconfigureRuntime = undefined;
			waitRuntime = undefined;
			removeRuntime = undefined;
			if (previous) await previous.disposeAll(reason);
			const next = createManager(cwd);
			const nextSpawnRuntime = createSpawnRuntime(next);
			manager = next;
			spawnRuntime = nextSpawnRuntime;
			statusRuntime = createStatusRuntime(next);
			sendRuntime = createSendRuntime(next, nextSpawnRuntime);
			reconfigureRuntime = createReconfigureRuntime(next, nextSpawnRuntime);
			waitRuntime = createWaitRuntime(next);
			removeRuntime = createRemoveRuntime(next, nextSpawnRuntime);
		});

	const shutdownManager = (reason: string): Promise<void> =>
		serializeLifecycle(async () => {
			const previous = manager;
			manager = undefined;
			spawnRuntime = undefined;
			statusRuntime = undefined;
			sendRuntime = undefined;
			reconfigureRuntime = undefined;
			waitRuntime = undefined;
			removeRuntime = undefined;
			if (previous) await previous.disposeAll(reason);
		});

	pi.registerTool(createSubAgentsSpawnTool(() => spawnRuntime));
	pi.registerTool(createSubAgentsStatusTool(() => statusRuntime));
	pi.registerTool(createSubAgentsSendTool(() => sendRuntime));
	pi.registerTool(createSubAgentsReconfigureTool(() => reconfigureRuntime));
	pi.registerTool(createSubAgentsWaitTool(() => waitRuntime));
	pi.registerTool(createSubAgentsRemoveTool(() => removeRuntime));

	pi.on("session_start", async (event, ctx) => {
		await replaceManager(ctx.cwd, `session start: ${event.reason}`);
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
		await replaceManager(ctx.cwd, `session compact: ${event.reason}`);
	});

	pi.on("session_tree", async (_event, ctx) => {
		await replaceManager(ctx.cwd, "session tree navigation");
	});

	pi.on("session_shutdown", async (event, ctx) => {
		await shutdownManager(`session shutdown: ${event.reason}`);
		ctx.ui.setStatus("sub-agents", undefined);
		ctx.ui.setWidget("sub-agents", undefined);
	});

	pi.registerCommand("sub-agents", {
		description: "Show the current dynamic sub-agent manager status",
		handler: async (_args, ctx) => {
			const text = formatSubAgentsStatus(manager?.getSummary());
			if (ctx.hasUI) ctx.ui.notify(text, manager ? "info" : "warning");
		},
	});
}

export default function subAgentsExtension(pi: ExtensionAPI): void {
	registerSubAgentsExtension(pi);
}
