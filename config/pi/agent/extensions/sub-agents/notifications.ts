import { Buffer } from "node:buffer";
import type {
	NotificationState,
	SubAgentManagerEvent,
	SubAgentManagerEventListener,
} from "./types.ts";
import { SUB_AGENT_BOUNDS } from "./types.ts";

export const SUB_AGENTS_EVENT_CUSTOM_TYPE = "sub-agents-event" as const;
export const SUB_AGENTS_EVENT_SOURCE = "sub-agents" as const;
export const DEFAULT_NOTIFICATION_FLUSH_DELAY_MS = 50;

const IMPORTANT_STATES = new Set<NotificationState>(["idle", "blocked", "failed"]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

export interface ParentNotificationEventInput {
	id: string;
	name: string;
	state: NotificationState;
	summary: string;
	assignmentId?: string;
	timestamp?: number;
}

export interface ParentNotificationEvent {
	readonly id: string;
	readonly name: string;
	readonly state: NotificationState;
	readonly summary: string;
	readonly assignmentId?: string;
	readonly timestamp: number;
}

export interface ParentNotificationBatch {
	readonly version: 1;
	readonly source: typeof SUB_AGENTS_EVENT_SOURCE;
	readonly generation: string;
	readonly sequence: number;
	readonly events: readonly ParentNotificationEvent[];
	readonly omitted: number;
	readonly deduplicated: number;
	readonly flushedAt: number;
}

export interface SubAgentNotificationInboxOptions {
	generation: string;
	onBatch: (batch: ParentNotificationBatch) => void;
	onBatchError?: () => void;
	flushDelayMs?: number;
	maxEvents?: number;
	now?: () => number;
}

export interface ParentNotificationMessage {
	customType: typeof SUB_AGENTS_EVENT_CUSTOM_TYPE;
	content: string;
	display: true;
	details: {
		version: 1;
		source: typeof SUB_AGENTS_EVENT_SOURCE;
		generation: string;
		sequence: number;
		count: number;
		omitted: number;
		deduplicated: number;
		events: ParentNotificationEvent[];
	};
}

export type ParentNotificationSender = (
	message: ParentNotificationMessage,
	options: { deliverAs: "followUp"; triggerTurn: true },
) => void;

export interface SubAgentNotificationEventSource {
	readonly generation: string;
	subscribeEvents(listener: SubAgentManagerEventListener): () => void;
}

export interface SubAgentNotificationRuntimeOptions {
	manager: SubAgentNotificationEventSource;
	sendMessage: ParentNotificationSender;
	flushDelayMs?: number;
	maxEvents?: number;
	now?: () => number;
}

function boundedPositiveInteger(value: number | undefined, fallback: number, maximum: number): number {
	if (value === undefined) return fallback;
	if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
		throw new Error(`Notification bound must be between 1 and ${maximum}`);
	}
	return value;
}

function safeTimestamp(value: number): number {
	return Number.isFinite(value) && value >= 0 ? value : 0;
}

function truncateUtf8(value: string, maxBytes: number): string {
	if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
	let output = "";
	for (const character of value) {
		if (Buffer.byteLength(`${output}${character}…`, "utf8") > maxBytes) break;
		output += character;
	}
	return output ? `${output}…` : "";
}

function boundedSingleLine(value: unknown, maxChars: number, maxBytes: number): string {
	const normalized = String(value ?? "")
		.replace(CONTROL_CHARACTERS, " ")
		.replace(/\s+/g, " ")
		.trim();
	return truncateUtf8(normalized.slice(0, maxChars), maxBytes);
}

function normalizeEvent(input: ParentNotificationEventInput, now: () => number): ParentNotificationEvent | undefined {
	if (!input || typeof input !== "object" || !IMPORTANT_STATES.has(input.state)) return undefined;
	const id = boundedSingleLine(
		input.id,
		SUB_AGENT_BOUNDS.agentIdChars,
		SUB_AGENT_BOUNDS.notificationIdBytes,
	);
	const name = boundedSingleLine(
		input.name,
		SUB_AGENT_BOUNDS.nameChars,
		SUB_AGENT_BOUNDS.notificationNameBytes,
	);
	const summary = boundedSingleLine(
		input.summary,
		SUB_AGENT_BOUNDS.notificationSummaryChars,
		SUB_AGENT_BOUNDS.notificationSummaryBytes,
	);
	if (!id || !name || !summary) return undefined;
	const assignmentId = input.assignmentId
		? boundedSingleLine(
				input.assignmentId,
				SUB_AGENT_BOUNDS.agentIdChars + 40,
				SUB_AGENT_BOUNDS.notificationAssignmentIdBytes,
			)
		: undefined;
	return Object.freeze({
		id,
		name,
		state: input.state,
		summary,
		assignmentId: assignmentId || undefined,
		timestamp: safeTimestamp(input.timestamp ?? now()),
	});
}

function eventKey(event: ParentNotificationEvent): string {
	return `${event.id}\u0000${event.assignmentId ?? ""}\u0000${event.state}`;
}

function cloneEvent(event: ParentNotificationEvent): ParentNotificationEvent {
	return { ...event };
}

/**
 * One bounded session-scoped coalescing queue. Repeated state events for the
 * same child/assignment replace their pending predecessor, while distinct
 * overflow evicts the oldest event and advances an omission counter.
 */
export class SubAgentNotificationInbox {
	readonly generation: string;

	#onBatch: (batch: ParentNotificationBatch) => void;
	#onBatchError?: () => void;
	#flushDelayMs: number;
	#maxEvents: number;
	#now: () => number;
	#events: ParentNotificationEvent[] = [];
	#omitted = 0;
	#deduplicated = 0;
	#sequence = 0;
	#timer?: ReturnType<typeof setTimeout>;
	#closed = false;

	constructor(options: SubAgentNotificationInboxOptions) {
		const generation = boundedSingleLine(options.generation, 100, 256);
		if (!generation) throw new Error("A notification generation is required");
		if (typeof options.onBatch !== "function") throw new Error("A notification batch sink is required");
		this.generation = generation;
		this.#onBatch = options.onBatch;
		this.#onBatchError = options.onBatchError;
		this.#flushDelayMs = boundedPositiveInteger(options.flushDelayMs, DEFAULT_NOTIFICATION_FLUSH_DELAY_MS, 60_000);
		this.#maxEvents = boundedPositiveInteger(
			options.maxEvents,
			SUB_AGENT_BOUNDS.notificationInboxEvents,
			SUB_AGENT_BOUNDS.notificationInboxEvents,
		);
		this.#now = options.now ?? Date.now;
	}

	get closed(): boolean {
		return this.#closed;
	}

	get pendingCount(): number {
		return this.#events.length;
	}

	get omittedCount(): number {
		return this.#omitted;
	}

	get deduplicatedCount(): number {
		return this.#deduplicated;
	}

	get hasScheduledFlush(): boolean {
		return this.#timer !== undefined;
	}

	enqueue(input: ParentNotificationEventInput): boolean {
		if (this.#closed) return false;
		const event = normalizeEvent(input, this.#now);
		if (!event) return false;

		const key = eventKey(event);
		const duplicateIndex = this.#events.findIndex((pending) => eventKey(pending) === key);
		if (duplicateIndex >= 0) {
			this.#events.splice(duplicateIndex, 1);
			this.#deduplicated += 1;
		} else if (this.#events.length === this.#maxEvents) {
			this.#events.shift();
			this.#omitted += 1;
		}
		this.#events.push(event);
		this.#schedule();
		return true;
	}

	flushNow(): ParentNotificationBatch | undefined {
		if (this.#closed || this.#events.length === 0) return undefined;
		if (this.#timer !== undefined) {
			clearTimeout(this.#timer);
			this.#timer = undefined;
		}
		this.#sequence += 1;
		const batch: ParentNotificationBatch = Object.freeze({
			version: 1 as const,
			source: SUB_AGENTS_EVENT_SOURCE,
			generation: this.generation,
			sequence: this.#sequence,
			events: Object.freeze(this.#events.map((event) => Object.freeze(cloneEvent(event)))),
			omitted: this.#omitted,
			deduplicated: this.#deduplicated,
			flushedAt: safeTimestamp(this.#now()),
		});
		this.#events = [];
		this.#omitted = 0;
		this.#deduplicated = 0;
		try {
			this.#onBatch(batch);
		} catch {
			try {
				this.#onBatchError?.();
			} catch {
				// A failing observability sink must not escape a background timer.
			}
		}
		return batch;
	}

	shutdown(): void {
		if (this.#closed) return;
		this.#closed = true;
		if (this.#timer !== undefined) clearTimeout(this.#timer);
		this.#timer = undefined;
		this.#events = [];
		this.#omitted = 0;
		this.#deduplicated = 0;
	}

	#schedule(): void {
		if (this.#closed || this.#timer !== undefined) return;
		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			this.flushNow();
		}, this.#flushDelayMs);
		this.#timer.unref?.();
	}
}

function notificationInput(event: SubAgentManagerEvent): ParentNotificationEventInput | undefined {
	const state = event.notificationState;
	if (!state || state !== event.state) return undefined;
	if (!event.notifyOn.includes(state) || !event.notificationSummary) return undefined;
	return {
		id: event.id,
		name: event.name,
		state,
		summary: event.notificationSummary,
		assignmentId: event.assignmentId,
		timestamp: event.event.timestamp,
	};
}

function formatBatchContent(batch: ParentNotificationBatch): string {
	const lines = batch.events.map(
		(event) => `- ${event.id} ${event.name}: ${event.state} — ${event.summary}`,
	);
	if (batch.omitted > 0) {
		lines.push(`- ${batch.omitted} earlier event(s) omitted by the bounded inbox`);
	}
	return `[sub-agents event batch ${batch.sequence}]\n${lines.join("\n")}`;
}

function messageForBatch(batch: ParentNotificationBatch): ParentNotificationMessage {
	return {
		customType: SUB_AGENTS_EVENT_CUSTOM_TYPE,
		content: formatBatchContent(batch),
		display: true,
		details: {
			version: 1,
			source: SUB_AGENTS_EVENT_SOURCE,
			generation: batch.generation,
			sequence: batch.sequence,
			count: batch.events.length,
			omitted: batch.omitted,
			deduplicated: batch.deduplicated,
			events: batch.events.map(cloneEvent),
		},
	};
}

/** Manager-to-parent notification bridge for one exact parent-session generation. */
export class SubAgentNotificationRuntime {
	readonly inbox: SubAgentNotificationInbox;

	#unsubscribe?: () => void;
	#deliveryFailures = 0;
	#closed = false;

	constructor(options: SubAgentNotificationRuntimeOptions) {
		this.inbox = new SubAgentNotificationInbox({
			generation: options.manager.generation,
			flushDelayMs: options.flushDelayMs,
			maxEvents: options.maxEvents,
			now: options.now,
			onBatch: (batch) => {
				options.sendMessage(messageForBatch(batch), {
					deliverAs: "followUp",
					triggerTurn: true,
				});
			},
			onBatchError: () => {
				this.#deliveryFailures += 1;
			},
		});
		try {
			this.#unsubscribe = options.manager.subscribeEvents((event) => {
				const input = notificationInput(event);
				if (input) this.inbox.enqueue(input);
			});
		} catch (error) {
			this.inbox.shutdown();
			throw error;
		}
	}

	get closed(): boolean {
		return this.#closed;
	}

	get pendingCount(): number {
		return this.inbox.pendingCount;
	}

	get hasScheduledFlush(): boolean {
		return this.inbox.hasScheduledFlush;
	}

	get deliveryFailures(): number {
		return this.#deliveryFailures;
	}

	flushNow(): ParentNotificationBatch | undefined {
		return this.inbox.flushNow();
	}

	shutdown(): void {
		if (this.#closed) return;
		this.#closed = true;
		try {
			this.#unsubscribe?.();
		} finally {
			this.#unsubscribe = undefined;
			this.inbox.shutdown();
		}
	}
}

export function createSubAgentNotificationRuntime(
	options: SubAgentNotificationRuntimeOptions,
): SubAgentNotificationRuntime {
	return new SubAgentNotificationRuntime(options);
}
