import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	type Context,
	type StreamOptions,
} from "@earendil-works/pi-ai";

const PROVIDER_ID = "sub-agents-tui-qa";
const MODEL_ID = "qa-model";

const faux = fauxProvider({
	provider: PROVIDER_ID,
	models: [{
		id: MODEL_ID,
		name: "Offline Sub-Agent TUI QA",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
	}],
	tokensPerSecond: 100_000,
});

const COMPLETION_STORM_SIZE = 10;
const COMPLETION_STORM_DEADLINE_MS = 10_000;
const LONG_LABEL_DELAY_MS = 250;

let parentPostSpawnResponses = 0;
const completionArrivals = new Set<string>();
let releaseCompletionStorm: (() => void) | undefined;
const completionStorm = new Promise<void>((resolve) => {
	releaseCompletionStorm = resolve;
});

const agents = [
	...Array.from({ length: 10 }, (_, index) => ({
		name: `qa-complete-${String(index + 1).padStart(2, "0")}`,
		role: "Complete one deterministic offline QA assignment",
		objective: `Complete offline fixture ${index + 1} and report a concise result.`,
		modelPolicy: "inherit" as const,
		complexity: "simple" as const,
		tools: [] as const,
		workspace: { mode: "shared" as const },
		notifyOn: ["idle" as const],
		tags: ["storm", "idle"],
	})),
	...Array.from({ length: 3 }, (_, index) => ({
		name: `qa-running-${String(index + 1).padStart(2, "0")}`,
		role: "Remain active until the operator exercises removal",
		objective: `Hold offline fixture ${index + 1} until aborted by the QA operator.`,
		modelPolicy: "inherit" as const,
		complexity: "moderate" as const,
		tools: [] as const,
		workspace: { mode: "shared" as const },
		notifyOn: ["failed" as const],
		tags: ["running", "abort"],
	})),
	{
		name: "qa-blocked-lease-review",
		role: "Report a deterministic orchestration blocker",
		objective: "Report that operator review is required, then remain blocked.",
		modelPolicy: "inherit" as const,
		complexity: "moderate" as const,
		tools: [] as const,
		workspace: { mode: "shared" as const },
		notifyOn: ["blocked" as const],
		tags: ["blocked", "review"],
	},
	{
		name: "qa-failed-synthetic",
		role: "Produce one deterministic bounded model failure",
		objective: "Fail deterministically for offline TUI failure-state validation.",
		modelPolicy: "inherit" as const,
		complexity: "simple" as const,
		tools: [] as const,
		workspace: { mode: "shared" as const },
		notifyOn: ["failed" as const],
		tags: ["failed"],
	},
	{
		name: "qa-idle-with-a-deliberately-long-display-name-for-narrow-terminal-truncation",
		role: "Exercise long bounded labels and result text in the dashboard",
		objective: "Complete with a bounded long result for narrow and wide terminal validation.",
		modelPolicy: "inherit" as const,
		complexity: "simple" as const,
		tools: [] as const,
		workspace: { mode: "shared" as const },
		notifyOn: ["idle" as const],
		tags: ["long-label", "width"],
	},
];

function hasTool(context: Context, name: string): boolean {
	return context.tools?.some((tool) => tool.name === name) ?? false;
}

function hasToolResult(context: Context, name: string): boolean {
	return context.messages.some((message) => message.role === "toolResult" && message.toolName === name);
}

function childName(context: Context): string {
	for (const agent of agents) {
		if (context.systemPrompt?.includes(agent.name)) return agent.name;
	}
	return "unknown-child";
}

async function waitForCompletionStormRelease(): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			completionStorm,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(
					() => reject(new Error("Offline QA completion storm did not reach ten children")),
					COMPLETION_STORM_DEADLINE_MS,
				);
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

async function waitForCompletionScenario(name: string): Promise<void> {
	if (name.startsWith("qa-complete-")) {
		completionArrivals.add(name);
		if (completionArrivals.size === COMPLETION_STORM_SIZE) releaseCompletionStorm?.();
		await waitForCompletionStormRelease();
		return;
	}
	if (name === "qa-idle-with-a-deliberately-long-display-name-for-narrow-terminal-truncation") {
		await waitForCompletionStormRelease();
		await new Promise<void>((resolve) => setTimeout(resolve, LONG_LABEL_DELAY_MS));
	}
}

function waitForAbort(options: StreamOptions | undefined) {
	return new Promise<ReturnType<typeof fauxAssistantMessage>>((resolve) => {
		const finish = () => resolve(fauxAssistantMessage([], {
			stopReason: "aborted",
			errorMessage: "Offline QA hold was aborted by the operator",
		}));
		if (options?.signal?.aborted) {
			finish();
			return;
		}
		options?.signal?.addEventListener("abort", finish, { once: true });
	});
}

async function responseRouter(context: Context, options: StreamOptions | undefined) {
	if (hasTool(context, "sub_agents_spawn")) {
		if (!hasToolResult(context, "sub_agents_spawn")) {
			return fauxAssistantMessage(
				fauxToolCall("sub_agents_spawn", { agents }),
				{ stopReason: "toolUse" },
			);
		}
		parentPostSpawnResponses += 1;
		return fauxAssistantMessage(
			parentPostSpawnResponses === 1
				? "Offline QA pool seeded. Open /sub-agents, resize the terminal, toggle tool expansion with the configured app.tools.expand binding, switch dark/light themes, and exercise confirmed removal. No live provider or external service is involved."
				: "Acknowledged one bounded offline sub-agent event batch.",
		);
	}

	const name = childName(context);
	if (name.startsWith("qa-running-")) return waitForAbort(options);
	if (name === "qa-failed-synthetic") {
		return fauxAssistantMessage([], {
			stopReason: "error",
			errorMessage: "Synthetic offline QA failure",
		});
	}

	if (!hasToolResult(context, "report_to_parent")) {
		if (name === "qa-blocked-lease-review") {
			return fauxAssistantMessage(
				fauxToolCall("report_to_parent", {
					state: "blocked",
					summary: "Offline QA blocker requires operator review",
					details: "Synthetic blocker for dashboard and notification validation",
					needs: "Choose release, resume, or removal",
				}),
				{ stopReason: "toolUse" },
			);
		}
		await waitForCompletionScenario(name);
		return fauxAssistantMessage(
			fauxToolCall("report_to_parent", {
				state: "result",
				summary: `${name} completed in the offline fixture`,
				details: "Deterministic completion used to validate bounded TUI rendering and coalescing",
				files: [`qa/${name}.txt`],
			}),
			{ stopReason: "toolUse" },
		);
	}

	return fauxAssistantMessage(`${name} final offline response`);
}

faux.setResponses(Array.from({ length: 512 }, () => responseRouter));

export default function (pi: ExtensionAPI) {
	pi.registerProvider(faux.provider);
}
