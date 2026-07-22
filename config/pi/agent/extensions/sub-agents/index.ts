import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SubAgentManager } from "./manager.ts";
import type { ParentContextFile } from "./resource-loader.ts";
import type { SubAgentManagerSummary } from "./types.ts";

const STATUS_ORDER = ["creating", "running", "idle", "blocked", "failed", "stopping"] as const;

interface ManagerLifecycle {
	readonly generation: string;
	getSummary(): SubAgentManagerSummary;
	captureParentContext(contextFiles: readonly ParentContextFile[] | undefined, trusted: boolean): unknown;
	disposeAll(reason?: string): Promise<void>;
}

export interface SubAgentsExtensionDependencies {
	createManager?: (cwd: string) => ManagerLifecycle;
}

export function formatSubAgentsStatus(summary: SubAgentManagerSummary | undefined): string {
	if (!summary) return "sub-agents: inactive (no parent session generation)";
	const states = STATUS_ORDER.map((state) => `${state} ${summary.counts[state]}`).join(" · ");
	return [
		`sub-agents ${summary.generation}`,
		`${summary.active} active · ${summary.historical} historical · ${states}`,
		summary.closed
			? "manager closed"
			: "manager ready (Phase 2 dynamic child runtime and routing complete; Phase 3 public control tools not enabled yet)",
	].join("\n");
}

export function registerSubAgentsExtension(
	pi: ExtensionAPI,
	dependencies: SubAgentsExtensionDependencies = {},
): void {
	const createManager = dependencies.createManager ?? ((cwd: string) => new SubAgentManager({ cwd }));
	let manager: ManagerLifecycle | undefined;
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
			if (previous) await previous.disposeAll(reason);
			manager = createManager(cwd);
		});

	const shutdownManager = (reason: string): Promise<void> =>
		serializeLifecycle(async () => {
			const previous = manager;
			manager = undefined;
			if (previous) await previous.disposeAll(reason);
		});

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
