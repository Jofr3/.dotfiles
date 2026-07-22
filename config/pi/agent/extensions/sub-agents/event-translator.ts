import type {
	AgentSessionEvent,
	AgentSessionEventListener,
} from "@earendil-works/pi-coding-agent";
import type {
	AssistantMessage,
	ToolResultMessage,
	Usage,
} from "@earendil-works/pi-ai";
import type { SubAgentManager } from "./manager.ts";
import type {
	ActiveToolCallSummary,
	AgentRuntimeActivity,
	AgentRuntimePhase,
	SubAgentId,
	UsageCounters,
} from "./types.ts";
import { SUB_AGENT_BOUNDS } from "./types.ts";

const DEFAULT_COMPLETION_SUMMARY = "Assignment completed without a text result.";
const DEFAULT_MODEL_FAILURE = "The child model run failed.";
const DEFAULT_ABORT_FAILURE = "The child assignment was aborted.";

export type ChildEventTranslatorManager = Pick<
	SubAgentManager,
	| "addUsage"
	| "completeAssignment"
	| "failAgent"
	| "getAgent"
	| "recordRuntimeEvent"
	| "updateRuntimeActivity"
>;

export interface ChildEventTranslatorOptions {
	manager: ChildEventTranslatorManager;
	id: SubAgentId;
	now?: () => number;
}

export interface ChildBlocker {
	summary: string;
	needs?: string;
}

interface TerminalAssistantState {
	stopReason: AssistantMessage["stopReason"];
	text?: string;
	error?: string;
}

export class ChildEventTranslatorError extends Error {
	readonly code = "event_translation_failed" as const;

	constructor(message = "Child event translation failed") {
		super(message);
		this.name = "ChildEventTranslatorError";
	}
}

function boundedHead(value: unknown, maxChars: number): string {
	const text = typeof value === "string" ? value : String(value ?? "");
	if (text.length <= maxChars) return text;
	if (maxChars <= 1) return text.slice(0, maxChars);
	return `${text.slice(0, maxChars - 1)}…`;
}

function boundedTail(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	if (maxChars <= 1) return value.slice(-maxChars);
	return `…${value.slice(-(maxChars - 1))}`;
}

function boundedIdentity(value: unknown, maxChars: number, fallback: string): string {
	const text = typeof value === "string" ? value.trim() : "";
	return boundedHead(text || fallback, maxChars);
}

function safeTimestamp(value: number): number {
	return Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeCount(value: number): number {
	return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function assistantTextHead(message: AssistantMessage): string | undefined {
	let text = "";
	for (const part of message.content) {
		if (part.type !== "text") continue;
		text = boundedHead(
			text ? `${text}\n${part.text}` : part.text,
			SUB_AGENT_BOUNDS.resultSummaryChars,
		);
	}
	return text.trim() ? text : undefined;
}

function assistantTextPreview(message: AssistantMessage): string | undefined {
	let text = "";
	for (const part of message.content) {
		if (part.type !== "text") continue;
		text = boundedTail(
			text ? `${text}\n${part.text}` : part.text,
			SUB_AGENT_BOUNDS.streamingPreviewChars,
		);
	}
	return text.trim() ? text : undefined;
}

function isAssistantMessage(value: unknown): value is AssistantMessage {
	return Boolean(
		value &&
			typeof value === "object" &&
			(value as { role?: unknown }).role === "assistant" &&
			Array.isArray((value as { content?: unknown }).content),
	);
}

function terminalState(message: unknown): TerminalAssistantState | undefined {
	if (!isAssistantMessage(message)) return undefined;
	return {
		stopReason: message.stopReason,
		text: assistantTextHead(message),
		error:
			typeof message.errorMessage === "string" && message.errorMessage.trim()
				? boundedHead(message.errorMessage.trim(), SUB_AGENT_BOUNDS.errorChars)
				: undefined,
	};
}

function lastAssistant(messages: readonly unknown[]): TerminalAssistantState | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const terminal = terminalState(messages[index]);
		if (terminal) return terminal;
	}
	return undefined;
}

function emptyUsageDelta(): UsageCounters & { turns: number } {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: 0,
		turns: 0,
	};
}

function safeUsageNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function addUsage(delta: UsageCounters & { turns: number }, usage: Usage | undefined): void {
	if (!usage) return;
	delta.input += safeUsageNumber(usage.input);
	delta.output += safeUsageNumber(usage.output);
	delta.cacheRead += safeUsageNumber(usage.cacheRead);
	delta.cacheWrite += safeUsageNumber(usage.cacheWrite);
	delta.totalTokens += safeUsageNumber(usage.totalTokens);
	delta.cost += safeUsageNumber(usage.cost?.total);
}

function turnUsage(message: unknown, toolResults: readonly ToolResultMessage[]): UsageCounters & { turns: number } {
	const delta = emptyUsageDelta();
	if (isAssistantMessage(message)) {
		addUsage(delta, message.usage);
		delta.turns = 1;
	}
	for (const result of toolResults) addUsage(delta, result.usage);
	return delta;
}

function hasUsage(delta: UsageCounters & { turns: number }): boolean {
	return (
		delta.turns > 0 ||
		delta.input > 0 ||
		delta.output > 0 ||
		delta.cacheRead > 0 ||
		delta.cacheWrite > 0 ||
		delta.totalTokens > 0 ||
		delta.cost > 0
	);
}

/**
 * Converts a child AgentSession's high-volume event stream into bounded manager
 * state. Streaming updates are coalesced into one transient preview; thinking,
 * raw deltas, tool arguments, and partial tool results are never retained.
 */
export class ChildEventTranslator {
	readonly id: SubAgentId;
	readonly listener: AgentSessionEventListener;

	#manager: ChildEventTranslatorManager;
	#now: () => number;
	#phase: AgentRuntimePhase = "initializing";
	#preview?: string;
	#activeToolCount = 0;
	#activeTools = new Map<string, ActiveToolCallSummary>();
	#pendingMessageCount = 0;
	#terminal?: TerminalAssistantState;
	#operationTail: Promise<void> = Promise.resolve();
	#pendingActivity?: AgentRuntimeActivity;
	#activityTaskQueued = false;
	#closed = false;
	#error?: ChildEventTranslatorError;

	constructor(options: ChildEventTranslatorOptions) {
		this.id = options.id;
		this.#manager = options.manager;
		this.#now = options.now ?? Date.now;
		this.listener = (event) => this.handle(event);
	}

	get closed(): boolean {
		return this.#closed;
	}

	get error(): ChildEventTranslatorError | undefined {
		return this.#error;
	}

	handle(event: AgentSessionEvent): void {
		if (this.#closed) return;

		switch (event.type) {
			case "agent_start":
				this.#terminal = undefined;
				this.#preview = undefined;
				this.#activeToolCount = 0;
				this.#activeTools.clear();
				this.#phase = "streaming";
				this.#queueActivity();
				this.#recordRuntimeEvent("Agent run started");
				break;

			case "turn_start":
				if (this.#phase !== "tools") this.#phase = "streaming";
				this.#queueActivity();
				break;

			case "message_update": {
				if (!isAssistantMessage(event.message)) break;
				const text = assistantTextPreview(event.message);
				if (!text) break;
				this.#preview = text;
				if (this.#activeToolCount === 0) this.#phase = "streaming";
				this.#queueActivity();
				break;
			}

			case "message_end": {
				const terminal = terminalState(event.message);
				if (!terminal) break;
				this.#terminal = terminal;
				const preview = assistantTextPreview(event.message);
				if (preview) {
					this.#preview = preview;
					this.#queueActivity();
				}
				break;
			}

			case "tool_execution_start": {
				const now = safeTimestamp(this.#now());
				const toolCallId = boundedIdentity(
					event.toolCallId,
					SUB_AGENT_BOUNDS.toolCallIdChars,
					"unknown-tool-call",
				);
				const toolName = boundedIdentity(
					event.toolName,
					SUB_AGENT_BOUNDS.toolNameChars,
					"unknown-tool",
				);
				this.#activeToolCount += 1;
				if (this.#activeTools.size < SUB_AGENT_BOUNDS.activeToolCalls) {
					this.#activeTools.set(toolCallId, {
						toolCallId,
						toolName,
						startedAt: now,
						updatedAt: now,
					});
				}
				this.#phase = "tools";
				this.#queueActivity();
				this.#recordRuntimeEvent(`Tool started: ${toolName}`);
				break;
			}

			case "tool_execution_update": {
				const toolCallId = boundedIdentity(
					event.toolCallId,
					SUB_AGENT_BOUNDS.toolCallIdChars,
					"unknown-tool-call",
				);
				const active = this.#activeTools.get(toolCallId);
				if (!active) break;
				active.updatedAt = safeTimestamp(this.#now());
				this.#queueActivity();
				break;
			}

			case "tool_execution_end": {
				const toolCallId = boundedIdentity(
					event.toolCallId,
					SUB_AGENT_BOUNDS.toolCallIdChars,
					"unknown-tool-call",
				);
				const active = this.#activeTools.get(toolCallId);
				const toolName = active?.toolName ?? boundedIdentity(
					event.toolName,
					SUB_AGENT_BOUNDS.toolNameChars,
					"unknown-tool",
				);
				this.#activeTools.delete(toolCallId);
				this.#activeToolCount = Math.max(0, this.#activeToolCount - 1);
				this.#phase = this.#activeToolCount > 0 ? "tools" : "streaming";
				this.#queueActivity();
				this.#recordRuntimeEvent(`Tool ${event.isError ? "failed" : "completed"}: ${toolName}`);
				break;
			}

			case "turn_end": {
				this.#terminal = terminalState(event.message) ?? this.#terminal;
				const usage = turnUsage(event.message, event.toolResults);
				if (hasUsage(usage)) this.#enqueue(() => this.#manager.addUsage(this.id, usage));
				this.#recordRuntimeEvent("Turn completed");
				break;
			}

			case "agent_end":
				this.#terminal = lastAssistant(event.messages) ?? this.#terminal;
				if (event.willRetry) {
					this.#phase = "retrying";
					this.#queueActivity();
					this.#recordRuntimeEvent("Agent run ended; retry pending");
				}
				break;

			case "agent_settled": {
				const terminal = this.#terminal;
				this.#settleActivity();
				this.#enqueue(async () => {
					const snapshot = this.#manager.getAgent(this.id);
					if (snapshot.state === "blocked" || snapshot.state === "failed" || snapshot.state === "idle") {
						return;
					}
					if (snapshot.state === "stopping" || snapshot.state === "removed") return;
					if (snapshot.state === "creating") {
						await this.#manager.failAgent(this.id, "Child run settled before its assignment was started");
						return;
					}
					if (terminal?.stopReason === "error") {
						await this.#manager.failAgent(this.id, terminal.error ?? DEFAULT_MODEL_FAILURE);
						return;
					}
					if (terminal?.stopReason === "aborted") {
						await this.#manager.failAgent(this.id, DEFAULT_ABORT_FAILURE);
						return;
					}
					const summary = boundedHead(
						terminal?.text?.trim() || DEFAULT_COMPLETION_SUMMARY,
						SUB_AGENT_BOUNDS.resultSummaryChars,
					);
					await this.#manager.completeAssignment(this.id, { state: "idle", summary });
				});
				break;
			}

			case "queue_update":
				this.#pendingMessageCount = safeCount(event.steering.length + event.followUp.length);
				this.#queueActivity();
				break;

			case "compaction_start":
				this.#phase = "compacting";
				this.#queueActivity();
				this.#recordRuntimeEvent(`Compaction started: ${event.reason}`);
				break;

			case "compaction_end": {
				this.#phase = "streaming";
				this.#queueActivity();
				const usage = emptyUsageDelta();
				addUsage(usage, event.result?.usage);
				if (hasUsage(usage)) this.#enqueue(() => this.#manager.addUsage(this.id, usage));
				this.#recordRuntimeEvent(
					event.aborted
						? `Compaction aborted: ${event.reason}`
						: event.errorMessage
							? `Compaction failed: ${event.reason}`
							: `Compaction completed: ${event.reason}`,
				);
				break;
			}

			case "auto_retry_start":
				this.#phase = "retrying";
				this.#queueActivity();
				this.#recordRuntimeEvent(
					`Retry ${safeCount(event.attempt)}/${safeCount(event.maxAttempts)} started`,
				);
				break;

			case "auto_retry_end":
				this.#phase = "streaming";
				this.#queueActivity();
				this.#recordRuntimeEvent(
					`Retry ${safeCount(event.attempt)} ${event.success ? "succeeded" : "ended"}`,
				);
				break;

			case "summarization_retry_scheduled":
				this.#phase = "retrying";
				this.#queueActivity();
				this.#recordRuntimeEvent(
					`Summarization retry ${safeCount(event.attempt)}/${safeCount(event.maxAttempts)} scheduled`,
				);
				break;

			case "summarization_retry_attempt_start":
				this.#phase = "retrying";
				this.#queueActivity();
				this.#recordRuntimeEvent(`Summarization retry started: ${event.source}`);
				break;

			case "summarization_retry_finished":
				this.#phase = "streaming";
				this.#queueActivity();
				this.#recordRuntimeEvent("Summarization retry finished");
				break;
		}
	}

	/** Marks an explicit child-reported blocker without inferring one from tool errors. */
	recordBlocker(blocker: ChildBlocker): Promise<void> {
		if (this.#closed) return this.flush();
		const summary = boundedHead(
			typeof blocker?.summary === "string" && blocker.summary.trim()
				? blocker.summary.trim()
				: "The child reported a blocker.",
			SUB_AGENT_BOUNDS.resultSummaryChars,
		);
		const needs =
			typeof blocker?.needs === "string" && blocker.needs.trim()
				? boundedHead(blocker.needs.trim(), SUB_AGENT_BOUNDS.reportNeedsChars)
				: undefined;
		this.#settleActivity();
		this.#enqueue(async () => {
			const snapshot = this.#manager.getAgent(this.id);
			if (snapshot.state !== "running") return;
			await this.#manager.completeAssignment(this.id, {
				state: "blocked",
				summary,
				needs,
			});
		});
		return this.flush();
	}

	async flush(): Promise<void> {
		while (true) {
			const tail = this.#operationTail;
			await tail;
			if (tail === this.#operationTail && !this.#pendingActivity && !this.#activityTaskQueued) break;
		}
		if (this.#error) throw this.#error;
	}

	async close(): Promise<void> {
		if (this.#closed) return this.flush();
		this.#closed = true;
		await this.flush();
	}

	#activitySnapshot(): AgentRuntimeActivity {
		const activeTools = [...this.#activeTools.values()]
			.slice(0, SUB_AGENT_BOUNDS.activeToolCalls)
			.map((tool) => ({ ...tool }));
		return {
			phase: this.#phase,
			streamingPreview: this.#preview,
			activeToolCount: safeCount(this.#activeToolCount),
			activeTools,
			pendingMessageCount: safeCount(this.#pendingMessageCount),
		};
	}

	#queueActivity(): void {
		this.#pendingActivity = this.#activitySnapshot();
		if (this.#activityTaskQueued) return;
		this.#activityTaskQueued = true;
		this.#enqueue(async () => {
			const activity = this.#pendingActivity;
			this.#pendingActivity = undefined;
			this.#activityTaskQueued = false;
			if (activity) await this.#manager.updateRuntimeActivity(this.id, activity);
			if (this.#pendingActivity) this.#queueActivity();
		});
	}

	#settleActivity(): void {
		this.#phase = "settled";
		this.#preview = undefined;
		this.#activeToolCount = 0;
		this.#activeTools.clear();
		this.#pendingMessageCount = 0;
		this.#queueActivity();
	}

	#recordRuntimeEvent(summary: string): void {
		const bounded = boundedHead(summary, SUB_AGENT_BOUNDS.eventSummaryChars);
		this.#enqueue(() => this.#manager.recordRuntimeEvent(this.id, bounded));
	}

	#enqueue(operation: () => void | Promise<unknown>): Promise<void> {
		const run = this.#operationTail.then(async () => {
			await operation();
		});
		const handled = run.catch(() => {
			this.#error ??= new ChildEventTranslatorError();
		});
		this.#operationTail = handled;
		return handled;
	}
}

export function createChildEventTranslator(
	options: ChildEventTranslatorOptions,
): ChildEventTranslator {
	return new ChildEventTranslator(options);
}
