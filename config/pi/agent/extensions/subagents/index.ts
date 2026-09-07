import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentToolResult, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getMarkdownTheme,
	keyHint,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import {
	loadSubagentConfig,
	resolveModelAlias,
	type ResourceMode,
	type SubagentConfig,
} from "./config.ts";

const SELF_PATH = fileURLToPath(import.meta.url);
const CHILD_MARKER = "PI_DYNAMIC_SUBAGENT_CHILD";
const CHILD_SERVICE_TIER = "PI_DYNAMIC_SUBAGENT_SERVICE_TIER";
const ACTIVITY_LIMIT = 16;
const STDERR_LIMIT = 64 * 1024;
const HARD_MAX_TASKS = 12;
const HARD_MAX_CONCURRENCY = 8;
const PRIORITY_MODELS = /^(openai|openai-codex)\/(?:gpt-5\.6-(?:luna|terra|sol)|gpt-6-astra)$/;

const ThinkingSchema = StringEnum(["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const);
const ResourceSchema = StringEnum(["lean", "inherit"] as const);
const ModeSchema = StringEnum(["parallel", "sequential"] as const);

const TaskSchema = Type.Object({
	task: Type.String({ description: "Self-contained delegated task", minLength: 1, maxLength: 30000 }),
	label: Type.Optional(Type.String({ description: "Short stable label for progress and results", maxLength: 80 })),
	model: Type.String({
		description: 'Model alias ("luna", "terra", "sol", "astra", "inherit") or exact provider/model',
		minLength: 1,
		pattern: "\\S",
	}),
	thinking: Type.Optional(
		ThinkingSchema,
	),
	fast: Type.Optional(
		Type.Boolean({ description: "Request OpenAI priority service tier for supported GPT-5.6 and GPT-6 Astra models. Default: true." }),
	),
	resources: Type.Optional(
		ResourceSchema,
	),
	tools: Type.Array(Type.String(), {
		description: 'Exact tool allowlist chosen for this task. Use [] for no tools or ["*"] for all normally available tools.',
		maxItems: 32,
	}),
	cwd: Type.Optional(Type.String({ description: "Task working directory, absolute or relative to the parent cwd" })),
	instructions: Type.Optional(
		Type.String({ description: "Additional task-specific system instructions", maxLength: 12000 }),
	),
	outputLimit: Type.Optional(
		Type.Integer({ description: "Maximum bytes returned to the parent for this task", minimum: 1000, maximum: 20000 }),
	),
});

const SubagentParams = Type.Object({
	tasks: Type.Array(TaskSchema, {
		description: "Independent tasks to run in parallel by default",
		minItems: 1,
		maxItems: HARD_MAX_TASKS,
	}),
	mode: Type.Optional(ModeSchema),
	concurrency: Type.Optional(
		Type.Integer({ description: "Maximum simultaneous child agents", minimum: 1, maximum: HARD_MAX_CONCURRENCY }),
	),
	sharedContext: Type.Optional(
		Type.String({
			description: "Small context block copied to every child. Prefer paths and constraints over pasted source.",
			maxLength: 30000,
		}),
	),
	timeoutSeconds: Type.Optional(
		Type.Integer({ description: "Per-child timeout", minimum: 10, maximum: 3600 }),
	),
});

type TaskInput = Static<typeof TaskSchema>;
type SubagentInput = Static<typeof SubagentParams>;
type RunMode = Static<typeof ModeSchema>;

interface ResolvedTask {
	index: number;
	label: string;
	task: string;
	model: string;
	thinking: ThinkingLevel;
	fast: boolean;
	resources: ResourceMode;
	tools: string[];
	cwd: string;
	instructions: string;
	outputLimit: number;
}

type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "aborted" | "timed-out" | "skipped";

interface TaskResult {
	index: number;
	label: string;
	task: string;
	model: string;
	thinking: ThinkingLevel;
	fastRequested: boolean;
	priorityApplied: boolean;
	fastFallback: boolean;
	resources: ResourceMode;
	tools: string[];
	cwd: string;
	status: TaskStatus;
	output: string;
	error?: string;
	artifactPath?: string;
	activity: string[];
	usage: Usage;
	turns: number;
	durationMs: number;
	attempts: number;
}

interface SubagentReplay {
	version: 1;
	input: SubagentInput;
	totalOutputLimit?: number;
	interrupted: boolean;
	retryIndexes: number[];
}

interface SubagentDetails {
	mode: RunMode;
	concurrency: number;
	artifactDir: string;
	loadedConfigPaths: string[];
	notices: string[];
	results: TaskResult[];
	replay?: SubagentReplay;
}

interface ResumeCandidate {
	sessionId: string;
	input: SubagentInput;
	results: TaskResult[];
	retryIndexes: number[];
	totalOutputLimit?: number;
}

interface AttemptResult {
	result: TaskResult;
	fullOutput: string;
	toolCalls: number;
	stderr: string;
}

type ProgressCallback = (result: TaskResult) => void;
type ToolUpdate = (partial: AgentToolResult<SubagentDetails>) => void;

function emptyUsage(): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function numberOrZero(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeUsage(value: unknown): Usage {
	if (!value || typeof value !== "object") return emptyUsage();
	const raw = value as Record<string, unknown>;
	const rawCost = raw.cost && typeof raw.cost === "object" ? (raw.cost as Record<string, unknown>) : {};
	const usage: Usage = {
		input: numberOrZero(raw.input),
		output: numberOrZero(raw.output),
		cacheRead: numberOrZero(raw.cacheRead),
		cacheWrite: numberOrZero(raw.cacheWrite),
		totalTokens: numberOrZero(raw.totalTokens),
		cost: {
			input: numberOrZero(rawCost.input),
			output: numberOrZero(rawCost.output),
			cacheRead: numberOrZero(rawCost.cacheRead),
			cacheWrite: numberOrZero(rawCost.cacheWrite),
			total: numberOrZero(rawCost.total),
		},
	};
	if (typeof raw.reasoning === "number") usage.reasoning = raw.reasoning;
	if (typeof raw.cacheWrite1h === "number") usage.cacheWrite1h = raw.cacheWrite1h;
	return usage;
}

function addUsage(target: Usage, value: Usage): Usage {
	target.input += value.input;
	target.output += value.output;
	target.cacheRead += value.cacheRead;
	target.cacheWrite += value.cacheWrite;
	target.totalTokens += value.totalTokens;
	target.cost.input += value.cost.input;
	target.cost.output += value.cost.output;
	target.cost.cacheRead += value.cost.cacheRead;
	target.cost.cacheWrite += value.cost.cacheWrite;
	target.cost.total += value.cost.total;
	if (value.reasoning !== undefined) target.reasoning = (target.reasoning ?? 0) + value.reasoning;
	if (value.cacheWrite1h !== undefined) target.cacheWrite1h = (target.cacheWrite1h ?? 0) + value.cacheWrite1h;
	return target;
}

function totalUsage(results: TaskResult[]): Usage {
	return results.reduce((total, result) => addUsage(total, result.usage), emptyUsage());
}

function formatTokens(value: number): string {
	if (value < 1000) return String(value);
	if (value < 1000000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k`;
	return `${(value / 1000000).toFixed(1)}M`;
}

function formatUsage(usage: Usage, turns?: number): string {
	const parts: string[] = [];
	if (turns) parts.push(`${turns}t`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost.total) parts.push(`$${usage.cost.total.toFixed(4)}`);
	return parts.join(" ");
}

function cloneResult(result: TaskResult): TaskResult {
	return { ...result, activity: [...result.activity], usage: { ...result.usage, cost: { ...result.usage.cost } } };
}

function cloneTaskInput(task: TaskInput): TaskInput {
	return { ...task, tools: [...task.tools] };
}

function cloneSubagentInput(input: SubagentInput): SubagentInput {
	return { ...input, tasks: input.tasks.map(cloneTaskInput) };
}

function isSubagentInput(value: unknown): value is SubagentInput {
	if (!value || typeof value !== "object") return false;
	const tasks = (value as { tasks?: unknown }).tasks;
	return Array.isArray(tasks) && tasks.length > 0 && tasks.every((task) => {
		if (!task || typeof task !== "object") return false;
		const candidate = task as Partial<TaskInput>;
		return typeof candidate.task === "string"
			&& typeof candidate.model === "string"
			&& Array.isArray(candidate.tools)
			&& candidate.tools.every((tool) => typeof tool === "string");
	});
}

function isBareRecoveryRequest(text: string): boolean {
	return /^\s*(?:please\s+)?(?:resume|continue)(?:\s+(?:the\s+)?(?:subagents?(?:\s+workflow)?|workflow|work|task))?\s*[.!?]*\s*$/iu.test(text);
}

function hasMeaningfulMessagesAfter(entries: any[], resultIndex: number): boolean {
	for (const entry of entries.slice(resultIndex + 1)) {
		if (entry?.type !== "message") continue;
		const message = entry.message;
		if (
			message?.role === "assistant"
			&& (message.stopReason === "error" || message.stopReason === "aborted")
			&& (!Array.isArray(message.content) || message.content.length === 0)
		) {
			continue;
		}
		return true;
	}
	return false;
}

function findLegacyToolCallInput(entries: any[], resultIndex: number, toolCallId: string): SubagentInput | undefined {
	for (let index = resultIndex - 1; index >= 0; index--) {
		const message = entries[index]?.type === "message" ? entries[index].message : undefined;
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const part of message.content) {
			if (part?.type === "toolCall" && part.id === toolCallId && part.name === "subagent") {
				return isSubagentInput(part.arguments) ? cloneSubagentInput(part.arguments) : undefined;
			}
		}
	}
	return undefined;
}

function isAbortRetryResult(result: TaskResult): boolean {
	return ["aborted", "queued", "running"].includes(result.status)
		|| (result.status === "skipped" && /subagent run was aborted/iu.test(result.output));
}

function findResumeCandidate(ctx: ExtensionContext, requireImmediate: boolean): ResumeCandidate | undefined {
	const entries = ctx.sessionManager.getBranch() as any[];
	for (let index = entries.length - 1; index >= 0; index--) {
		const message = entries[index]?.type === "message" ? entries[index].message : undefined;
		if (message?.role !== "toolResult" || !["subagent", "subagent_resume"].includes(message.toolName)) continue;
		const details = message.details as SubagentDetails | undefined;
		const results = Array.isArray(details?.results) ? details.results : [];
		const interrupted = details?.replay?.interrupted
			?? results.some((result) => ["aborted", "queued", "running"].includes(result.status));
		if (!interrupted || (requireImmediate && hasMeaningfulMessagesAfter(entries, index))) return undefined;
		const replayInput = details?.replay?.input;
		const input = isSubagentInput(replayInput)
			? cloneSubagentInput(replayInput)
			: findLegacyToolCallInput(entries, index, message.toolCallId);
		if (!input) return undefined;
		const abortRetryIndexes = new Set(results.filter(isAbortRetryResult).map((result) => result.index));
		const retryIndexes = (details?.replay?.retryIndexes ?? [...abortRetryIndexes])
			.filter((value) => Number.isInteger(value) && abortRetryIndexes.has(value));
		return retryIndexes.length > 0
			? {
				sessionId: ctx.sessionManager.getSessionId(),
				input,
				results: results.map(cloneResult),
				retryIndexes,
				totalOutputLimit: details?.replay?.totalOutputLimit,
			}
			: undefined;
	}
	return undefined;
}

function appendRecoveryInstruction(instructions: string | undefined): string {
	const note = "Recovery: this child task is restarting after an interrupted attempt. Inspect the current filesystem and external state before acting, preserve valid partial work, and continue idempotently instead of assuming a clean start.";
	if (!instructions?.trim()) return note;
	const available = Math.max(0, 12000 - note.length - 2);
	return `${instructions.slice(0, available)}\n\n${note}`;
}

function replacePreviousForRecovery(task: string, previous: string): string {
	const matches = task.match(/\{previous\}/gu);
	if (!matches?.length) return task;
	const withoutPlaceholders = task.replace(/\{previous\}/gu, "");
	const availablePerPlaceholder = Math.max(0, Math.floor((30000 - withoutPlaceholders.length) / matches.length));
	const replacement = previous.slice(0, availablePerPlaceholder);
	return task.replace(/\{previous\}/gu, () => replacement).slice(0, 30000);
}

function buildResumeInput(candidate: ResumeCandidate): SubagentInput {
	const request = cloneSubagentInput(candidate.input);
	const byIndex = new Map(candidate.results.map((result, position) => [result.index ?? position, result]));
	const retryIndexes = new Set(candidate.retryIndexes);
	let selected = request.tasks
		.map((task, index) => ({ task, index, result: byIndex.get(index) }))
		.filter(({ index }) => retryIndexes.has(index));
	if (selected.length === 0) throw new Error("The interrupted subagent workflow has no unfinished tasks.");

	if ((request.mode ?? "parallel") === "sequential") {
		const first = Math.min(...selected.map(({ index }) => index));
		selected = request.tasks.slice(first).map((task, offset) => ({
			task,
			index: first + offset,
			result: byIndex.get(first + offset),
		}));
		const previous = first > 0 ? byIndex.get(first - 1)?.output ?? "" : "";
		selected[0] = {
			...selected[0],
			task: { ...selected[0].task, task: replacePreviousForRecovery(selected[0].task.task, previous) },
		};
	}

	const tasks = selected.map(({ task, result }) => ({
		...task,
		model: result?.model ?? task.model,
		thinking: result?.thinking ?? task.thinking,
		fast: result?.fastRequested ?? task.fast,
		resources: result?.resources ?? task.resources,
		tools: result?.tools ? [...result.tools] : [...task.tools],
		cwd: result?.cwd ?? task.cwd,
		instructions: appendRecoveryInstruction(task.instructions),
	}));
	return {
		...request,
		tasks,
		concurrency: (request.mode ?? "parallel") === "sequential"
			? 1
			: Math.min(request.concurrency ?? tasks.length, tasks.length),
	};
}

function recoveryPrompt(): string {
	return [
		"Resume the most recent interrupted subagent workflow before doing any other parent-level work.",
		"Call `subagent_resume` now with an empty object. It will restart only unfinished child tasks with a fresh cancellation signal; do not redo tasks that already succeeded.",
		"After it returns, combine the earlier successful handoffs with the resumed results and continue the original objective.",
		"Do not replace the interrupted child task with parent-side exploration before calling the resume tool.",
	].join(" ");
}

function pushActivity(result: TaskResult, text: string): void {
	result.activity.push(text.replace(/\s+/g, " ").trim());
	if (result.activity.length > ACTIVITY_LIMIT) result.activity.splice(0, result.activity.length - ACTIVITY_LIMIT);
}

function sanitizeLabel(value: string): string {
	const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
	return cleaned.slice(0, 60) || "task";
}

function taskLabel(task: TaskInput, index: number): string {
	if (task.label?.trim()) return task.label.trim();
	const words = task.task.trim().split(/\s+/).slice(0, 6).join(" ");
	return words.length > 60 ? `${words.slice(0, 57)}...` : words || `task-${index + 1}`;
}

function truncateUtf8(value: string, maxBytes: number): { text: string; truncated: boolean; omitted: number } {
	const totalBytes = Buffer.byteLength(value, "utf8");
	if (totalBytes <= maxBytes) return { text: value, truncated: false, omitted: 0 };
	let end = Math.min(value.length, Math.max(0, maxBytes));
	let text = value.slice(0, end);
	while (text && (Buffer.byteLength(text, "utf8") > maxBytes || /[\uD800-\uDBFF]$/.test(text))) {
		text = text.slice(0, -1);
	}
	return { text, truncated: true, omitted: totalBytes - Buffer.byteLength(text, "utf8") };
}

function truncateWithNotice(value: string, maxBytes: number, notice: (omitted: number) => string): string {
	const totalBytes = Buffer.byteLength(value, "utf8");
	if (totalBytes <= maxBytes) return value;
	let omitted = totalBytes;
	for (let iteration = 0; iteration < 8; iteration++) {
		const suffix = notice(omitted);
		const suffixBytes = Buffer.byteLength(suffix, "utf8");
		if (suffixBytes >= maxBytes) return truncateUtf8(suffix, maxBytes).text;
		const truncated = truncateUtf8(value, maxBytes - suffixBytes);
		const nextOmitted = totalBytes - Buffer.byteLength(truncated.text, "utf8");
		if (nextOmitted === omitted) return truncated.text + suffix;
		omitted = nextOmitted;
	}
	const suffix = notice(omitted);
	return truncateUtf8(value, Math.max(0, maxBytes - Buffer.byteLength(suffix, "utf8"))).text + suffix;
}

function appendCappedTail(current: string, next: string, cap: number): string {
	const combined = current + next;
	if (Buffer.byteLength(combined, "utf8") <= cap) return combined;
	let tail = combined.slice(Math.max(0, combined.length - cap));
	while (tail && (Buffer.byteLength(tail, "utf8") > cap || /^[\uDC00-\uDFFF]/.test(tail))) tail = tail.slice(1);
	return tail;
}

function extractAssistantText(message: AssistantMessage): string {
	return message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
}

function formatToolActivity(toolName: string, value: unknown): string {
	const args = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	const filePath = typeof args.path === "string"
		? args.path
		: typeof args.file_path === "string"
			? args.file_path
			: undefined;
	switch (toolName) {
		case "read":
		case "write":
		case "edit":
		case "ls":
		case "find":
			return `→ ${toolName}${filePath ? ` ${filePath}` : ""}`;
		case "grep": {
			const pattern = typeof args.pattern === "string" ? args.pattern.slice(0, 60) : "";
			return `→ grep${pattern ? ` /${pattern}/` : ""}${filePath ? ` in ${filePath}` : ""}`;
		}
		case "bash": {
			const command = typeof args.command === "string" ? args.command.replace(/\s+/g, " ").slice(0, 100) : "";
			return `→ bash${command ? ` ${command}` : ""}`;
		}
		default:
			return `→ ${toolName}`;
	}
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const executable = path.basename(process.execPath).toLowerCase();
	if (!/^(node|bun)(\.exe)?$/.test(executable)) return { command: process.execPath, args };
	return { command: "pi", args };
}

function childEnvironment(priority: boolean): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const name of ["PI_SESSION_ID", "PI_SESSION_FILE", "PI_PROVIDER", "PI_MODEL", "PI_REASONING_LEVEL"]) {
		delete env[name];
	}
	env.PI_SKIP_VERSION_CHECK = "1";
	env[CHILD_MARKER] = "1";
	env[CHILD_SERVICE_TIER] = priority ? "priority" : "";
	return env;
}

function terminateProcessTree(child: ChildProcess): void {
	if (!child.pid) return;
	const kill = (force: boolean) => {
		if (process.platform === "win32") {
			try {
				const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", ...(force ? ["/f"] : [])], {
					stdio: "ignore",
					windowsHide: true,
				});
				killer.on("error", () => {
					try {
						child.kill(force ? "SIGKILL" : "SIGTERM");
					} catch {
						// Process already exited.
					}
				});
				killer.unref();
				return;
			} catch {
				// Fall through to ChildProcess.kill().
			}
		}
		try {
			if (process.platform === "win32") child.kill(force ? "SIGKILL" : "SIGTERM");
			else process.kill(-child.pid!, force ? "SIGKILL" : "SIGTERM");
		} catch {
			try {
				child.kill(force ? "SIGKILL" : "SIGTERM");
			} catch {
				// Process already exited.
			}
		}
	};
	kill(false);
	const timer = setTimeout(() => kill(true), 3000);
	timer.unref();
}

async function mapWithLimit<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
	signal?: AbortSignal,
): Promise<Array<R | undefined>> {
	const results = new Array<R | undefined>(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (!signal?.aborted) {
			const index = nextIndex++;
			if (index >= items.length) return;
			results[index] = await fn(items[index], index);
		}
	});
	await Promise.all(workers);
	return results;
}

function resolveTask(
	input: TaskInput,
	index: number,
	config: SubagentConfig,
	parentCwd: string,
	parentModel: string | undefined,
): ResolvedTask {
	const model = resolveModelAlias(input.model, config.aliases, parentModel);
	if (!model) throw new Error(`Could not resolve a model for task "${taskLabel(input, index)}".`);
	const cwd = path.resolve(parentCwd, input.cwd ?? ".");
	let stat: fs.Stats;
	try {
		stat = fs.statSync(cwd);
	} catch {
		throw new Error(`Subagent cwd does not exist: ${cwd}`);
	}
	if (!stat.isDirectory()) throw new Error(`Subagent cwd is not a directory: ${cwd}`);
	const baseInstructions = `Complete only the delegated task. Work autonomously with the model, reasoning level, tools, and resources selected by the parent agent. Stay within any stated ownership boundary and return an evidence-based handoff.`;
	return {
		index,
		label: taskLabel(input, index),
		task: input.task,
		model,
		thinking: (input.thinking ?? config.defaults.thinking) as ThinkingLevel,
		fast: input.fast ?? config.defaults.fast,
		resources: (input.resources ?? config.defaults.resources) as ResourceMode,
		tools: [...input.tools],
		cwd,
		instructions: [baseInstructions, input.instructions].filter(Boolean).join("\n\n"),
		outputLimit: input.outputLimit ?? config.defaults.outputLimit,
	};
}

function initialResult(task: ResolvedTask): TaskResult {
	return {
		index: task.index,
		label: task.label,
		task: task.task,
		model: task.model,
		thinking: task.thinking,
		fastRequested: task.fast,
		priorityApplied: false,
		fastFallback: false,
		resources: task.resources,
		tools: task.tools,
		cwd: task.cwd,
		status: "queued",
		output: "",
		activity: [],
		usage: emptyUsage(),
		turns: 0,
		durationMs: 0,
		attempts: 0,
	};
}

function buildSystemPrompt(task: ResolvedTask): string {
	return `${task.instructions}

You are a child agent with an isolated context. Do not attempt to delegate to more agents.
Work autonomously and keep your final response compact (target at most ${task.outputLimit} bytes).
The final response is a handoff to a parent agent. Put durable detail in files or artifacts when appropriate instead of pasting large source blocks.`;
}

function buildUserPrompt(task: ResolvedTask, sharedContext?: string): string {
	const contextBlock = sharedContext?.trim()
		? `<shared_context>\n${sharedContext.trim()}\n</shared_context>\n\n`
		: "";
	return `${contextBlock}<delegated_task>\n${task.task.trim()}\n</delegated_task>`;
}

function supportsPriorityMode(model: string): boolean {
	return PRIORITY_MODELS.test(model);
}

function shouldRetryWithoutPriority(attempt: AttemptResult): boolean {
	if (attempt.toolCalls > 0) return false;
	const error = [attempt.result.error, attempt.stderr, attempt.fullOutput].filter(Boolean).join("\n");
	return /service[_ -]?tier|priority tier|unsupported.{0,40}priority|invalid.{0,40}priority|unknown parameter.{0,40}tier/i.test(error);
}

async function runAttempt(
	task: ResolvedTask,
	sharedContext: string | undefined,
	timeoutSeconds: number,
	priority: boolean,
	runDir: string,
	signal: AbortSignal | undefined,
	onProgress: ProgressCallback,
): Promise<AttemptResult> {
	const startedAt = Date.now();
	const result = initialResult(task);
	if (signal?.aborted) {
		result.status = "aborted";
		result.error = "Subagent run aborted before the child started.";
		pushActivity(result, "aborted before start");
		onProgress(cloneResult(result));
		return { result, fullOutput: "", toolCalls: 0, stderr: "" };
	}
	result.status = "running";
	result.attempts = 1;
	result.priorityApplied = priority;
	pushActivity(result, priority ? "starting with OpenAI priority tier" : "starting");
	onProgress(cloneResult(result));

	const promptPath = path.join(runDir, `${String(task.index + 1).padStart(2, "0")}-${sanitizeLabel(task.label)}-system.md`);
	await withFileMutationQueue(promptPath, async () => {
		await fs.promises.writeFile(promptPath, buildSystemPrompt(task), { encoding: "utf8", mode: 0o600 });
	});
	if (signal?.aborted) {
		await fs.promises.unlink(promptPath).catch(() => {});
		result.status = "aborted";
		result.error = "Subagent run aborted before the child started.";
		pushActivity(result, "aborted before start");
		onProgress(cloneResult(result));
		return { result, fullOutput: "", toolCalls: 0, stderr: "" };
	}

	const args = ["--mode", "json", "-p", "--no-session"];
	if (task.resources === "lean") {
		args.push("--no-extensions", "-e", SELF_PATH, "--no-skills", "--no-prompt-templates", "--no-themes");
	}
	args.push("--model", task.model, "--thinking", task.thinking);
	if (task.tools?.length === 0) args.push("--no-tools");
	else if (task.tools && !task.tools.includes("*")) args.push("--tools", task.tools.join(","));
	args.push("--append-system-prompt", promptPath, buildUserPrompt(task, sharedContext));

	let finalOutput = "";
	let stderr = "";
	let toolCalls = 0;
	let stopReason: string | undefined;
	let errorMessage: string | undefined;
	let timedOut = false;
	let aborted = false;
	let buffer = "";

	const invocation = getPiInvocation(args);
	const child = spawn(invocation.command, invocation.args, {
		cwd: task.cwd,
		shell: false,
		detached: process.platform !== "win32",
		stdio: ["ignore", "pipe", "pipe"],
		env: childEnvironment(priority),
	});

	const processLine = (line: string) => {
		if (!line.trim()) return;
		let event: any;
		try {
			event = JSON.parse(line);
		} catch {
			return;
		}
		if (event.type === "tool_execution_start") {
			toolCalls++;
			pushActivity(result, formatToolActivity(event.toolName, event.args));
			result.durationMs = Date.now() - startedAt;
			onProgress(cloneResult(result));
			return;
		}
		if (event.type === "tool_execution_end") {
			if (event.isError) pushActivity(result, `tool failed: ${event.toolName}`);
			if (event.result?.usage) addUsage(result.usage, normalizeUsage(event.result.usage));
			result.durationMs = Date.now() - startedAt;
			onProgress(cloneResult(result));
			return;
		}
		if (event.type === "message_end" && event.message?.role === "assistant") {
			const message = event.message as AssistantMessage;
			const text = extractAssistantText(message);
			if (text) finalOutput = text;
			addUsage(result.usage, normalizeUsage(message.usage));
			result.turns++;
			if (message.model) result.model = `${message.provider}/${message.model}`;
			stopReason = message.stopReason;
			errorMessage = message.errorMessage;
			if (message.stopReason === "error") pushActivity(result, `model error: ${message.errorMessage ?? "unknown error"}`);
			else pushActivity(result, `turn ${result.turns} complete`);
			result.durationMs = Date.now() - startedAt;
			onProgress(cloneResult(result));
		}
	};

	const exitCode = await new Promise<number>((resolve) => {
		let settled = false;
		const finish = (code: number) => {
			if (settled) return;
			settled = true;
			resolve(code);
		};
		const onAbort = () => {
			aborted = true;
			terminateProcessTree(child);
		};
		if (signal?.aborted) onAbort();
		else signal?.addEventListener("abort", onAbort, { once: true });
		const timeout = setTimeout(() => {
			timedOut = true;
			terminateProcessTree(child);
		}, timeoutSeconds * 1000);
		timeout.unref();

		child.stdout?.on("data", (chunk) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		});
		child.stderr?.on("data", (chunk) => {
			stderr = appendCappedTail(stderr, chunk.toString(), STDERR_LIMIT);
		});
		child.on("error", (error) => {
			errorMessage = error.message;
			finish(1);
		});
		child.on("close", (code) => {
			if (buffer.trim()) processLine(buffer);
			clearTimeout(timeout);
			signal?.removeEventListener("abort", onAbort);
			finish(code ?? 1);
		});
	});

	await fs.promises.unlink(promptPath).catch(() => {});
	result.durationMs = Date.now() - startedAt;
	const missingResult = result.turns === 0;
	const failed = exitCode !== 0 || stopReason === "error" || stopReason === "aborted" || timedOut || aborted || missingResult;
	if (aborted || stopReason === "aborted") result.status = "aborted";
	else if (timedOut) result.status = "timed-out";
	else result.status = failed ? "failed" : "succeeded";
	result.error = aborted || stopReason === "aborted"
		? "Subagent run aborted."
		: timedOut
			? `Subagent timed out after ${timeoutSeconds} seconds.`
			: failed
				? errorMessage
					|| stderr.trim()
					|| (exitCode !== 0
						? `Child pi exited with code ${exitCode}`
						: missingResult
							? "Child pi exited without an assistant result."
							: `Child stopped: ${stopReason}`)
				: undefined;
	result.output = finalOutput;
	pushActivity(result, result.status);
	onProgress(cloneResult(result));
	return { result, fullOutput: finalOutput, toolCalls, stderr };
}

async function writeArtifact(runDir: string, task: ResolvedTask, attempt: AttemptResult): Promise<string> {
	const artifactPath = path.join(runDir, `${String(task.index + 1).padStart(2, "0")}-${sanitizeLabel(task.label)}.md`);
	const body = [
		`# ${task.label}`,
		"",
		`- Model: ${attempt.result.model}`,
		`- Thinking: ${task.thinking}`,
		`- Status: ${attempt.result.status}`,
		`- Working directory: ${task.cwd}`,
		"",
		"## Task",
		"",
		task.task,
		"",
		"## Output",
		"",
		attempt.fullOutput || "(no output)",
		...(attempt.result.error ? ["", "## Error", "", attempt.result.error] : []),
		...(attempt.stderr.trim() && attempt.stderr.trim() !== attempt.result.error
			? ["", "## Child stderr", "", "```text", attempt.stderr.trim(), "```"]
			: []),
		...(attempt.result.activity.length ? ["", "## Recent activity", "", ...attempt.result.activity.map((item) => `- ${item}`)] : []),
	].join("\n");
	await withFileMutationQueue(artifactPath, async () => {
		await fs.promises.writeFile(artifactPath, body, { encoding: "utf8", mode: 0o600 });
	});
	return artifactPath;
}

async function runResolvedTask(
	task: ResolvedTask,
	sharedContext: string | undefined,
	timeoutSeconds: number,
	runDir: string,
	signal: AbortSignal | undefined,
	onProgress: ProgressCallback,
): Promise<TaskResult> {
	const priority = task.fast && supportsPriorityMode(task.model);
	const deadline = Date.now() + timeoutSeconds * 1000;
	let attempt = await runAttempt(task, sharedContext, timeoutSeconds, priority, runDir, signal, onProgress);
	if (priority && attempt.result.status === "failed" && shouldRetryWithoutPriority(attempt)) {
		const remainingMs = deadline - Date.now();
		if (remainingMs > 0) {
			const firstUsage = attempt.result.usage;
			const firstDuration = attempt.result.durationMs;
			const firstError = attempt.result.error;
			const retry = await runAttempt(task, sharedContext, remainingMs / 1000, false, runDir, signal, onProgress);
			retry.result.fastFallback = true;
			retry.result.attempts = 2;
			retry.result.durationMs += firstDuration;
			addUsage(retry.result.usage, firstUsage);
			pushActivity(retry.result, `priority tier unsupported; retried normally${firstError ? ` (${firstError.slice(0, 100)})` : ""}`);
			attempt = retry;
		}
	}

	const fullForSummary = [
		attempt.fullOutput,
		attempt.result.error ? `Error: ${attempt.result.error}` : "",
	].filter(Boolean).join("\n\n") || "(no output)";
	attempt.result.output = truncateWithNotice(
		fullForSummary,
		task.outputLimit,
		(omitted) => `\n\n[Truncated ${omitted} bytes; full output is in the artifact.]`,
	);
	try {
		attempt.result.artifactPath = await writeArtifact(runDir, task, attempt);
	} catch (error) {
		const message = `Could not write the subagent artifact: ${error instanceof Error ? error.message : String(error)}`;
		attempt.result.status = "failed";
		attempt.result.error = attempt.result.error ? `${attempt.result.error}\n${message}` : message;
		attempt.result.output = truncateWithNotice(
			`${attempt.result.output}\n\nError: ${message}`,
			task.outputLimit,
			(omitted) => `\n\n[Truncated ${omitted} bytes.]`,
		);
	}
	attempt.result.priorityApplied = priority && !attempt.result.fastFallback;
	onProgress(cloneResult(attempt.result));
	return attempt.result;
}

function statusSummary(results: TaskResult[]): string {
	const running = results.filter((result) => result.status === "running").length;
	const queued = results.filter((result) => result.status === "queued").length;
	const skipped = results.filter((result) => result.status === "skipped").length;
	const succeeded = results.filter((result) => result.status === "succeeded").length;
	const failed = results.length - running - queued - skipped - succeeded;
	if (running || queued) return `Subagents: ${succeeded + failed}/${results.length} done, ${running} running, ${queued} queued`;
	return `Subagents: ${succeeded}/${results.length} succeeded${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped` : ""}`;
}

function modelVisibleOutput(details: SubagentDetails, totalLimit: number): string {
	const chunks = details.results.map((result) => {
		const fast = result.priorityApplied ? " · fast" : result.fastFallback ? " · fast→normal fallback" : "";
		const toolSummary = result.tools?.includes("*") ? "all tools" : `${result.tools?.length ?? 0} tools`;
		const metadata = `${result.model} · ${result.thinking} · ${toolSummary}${fast} · ${(result.durationMs / 1000).toFixed(1)}s`;
		const status = result.status === "succeeded" ? "completed" : result.status;
		return `### ${result.label} [${status}]\n_${metadata}_\n\n${result.output || result.error || "(no output)"}\n\nArtifact: \`${result.artifactPath ?? details.artifactDir}\``;
	});
	const full = `${statusSummary(details.results)}\n\n${chunks.join("\n\n---\n\n")}`;
	return truncateWithNotice(
		full,
		totalLimit,
		(omitted) => `\n\n[Aggregate output truncated ${omitted} bytes. Full per-task artifacts: ${details.artifactDir}]`,
	);
}

async function runSubagentRequest(
	params: SubagentInput,
	signal: AbortSignal | undefined,
	onUpdate: ToolUpdate | undefined,
	ctx: ExtensionContext,
	totalOutputLimitOverride?: number,
): Promise<AgentToolResult<SubagentDetails>> {
	const config = loadSubagentConfig(ctx.cwd, ctx.isProjectTrusted());
	if (params.tasks.length > config.defaults.maxTasks) {
		throw new Error(`Requested ${params.tasks.length} subagents; configured maximum is ${config.defaults.maxTasks}.`);
	}
	const parentModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
	const tasks = params.tasks.map((task, index) => resolveTask(task, index, config, ctx.cwd, parentModel));
	const mode: RunMode = params.mode ?? "parallel";
	const concurrency = mode === "sequential"
		? 1
		: Math.max(1, Math.min(params.concurrency ?? config.defaults.concurrency, tasks.length, HARD_MAX_CONCURRENCY));
	const timeoutSeconds = params.timeoutSeconds ?? config.defaults.timeoutSeconds;
	const totalOutputLimit = totalOutputLimitOverride ?? config.defaults.totalOutputLimit;
	const replayInput: SubagentInput = {
		...cloneSubagentInput(params),
		mode,
		concurrency,
		timeoutSeconds,
		tasks: params.tasks.map((input, index) => ({
			...cloneTaskInput(input),
			model: tasks[index].model,
			thinking: tasks[index].thinking,
			fast: tasks[index].fast,
			resources: tasks[index].resources,
			tools: [...tasks[index].tools],
			cwd: tasks[index].cwd,
			outputLimit: tasks[index].outputLimit,
		})),
	};
	const artifactDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagents-"));
	await fs.promises.chmod(artifactDir, 0o700);
	const results = tasks.map(initialResult);
	const makeDetails = (): SubagentDetails => {
		const interrupted = Boolean(signal?.aborted) || results.some((result) => result.status === "aborted");
		return {
			mode,
			concurrency,
			artifactDir,
			loadedConfigPaths: [...config.loadedPaths],
			notices: [...config.notices],
			results: results.map(cloneResult),
			replay: {
				version: 1,
				input: cloneSubagentInput(replayInput),
				totalOutputLimit,
				interrupted,
				retryIndexes: interrupted
					? results.filter(isAbortRetryResult).map((result) => result.index)
					: [],
			},
		};
	};
	const emit = () => onUpdate?.({
		content: [{ type: "text", text: statusSummary(results) }],
		details: makeDetails(),
	});
	const runOne = async (task: ResolvedTask, sharedContext?: string) => {
		try {
			const result = await runResolvedTask(
				task,
				sharedContext,
				timeoutSeconds,
				artifactDir,
				signal,
				(update) => {
					results[task.index] = update;
					emit();
				},
			);
			results[task.index] = result;
			return result;
		} catch (error) {
			const result = initialResult(task);
			result.status = signal?.aborted ? "aborted" : "failed";
			result.error = error instanceof Error ? error.message : String(error);
			result.output = `Error: ${result.error}`;
			pushActivity(result, result.status);
			results[task.index] = result;
			emit();
			return result;
		}
	};

	if (mode === "parallel") {
		await mapWithLimit(tasks, concurrency, (task) => runOne(task, params.sharedContext), signal);
		if (signal?.aborted) {
			for (const queued of tasks.filter((task) => results[task.index].status === "queued")) {
				results[queued.index] = {
					...initialResult(queued),
					status: "skipped",
					output: "Skipped because the subagent run was aborted.",
				};
			}
			emit();
		}
	} else {
		let previous = "";
		for (let index = 0; index < tasks.length; index++) {
			if (signal?.aborted) {
				for (const skipped of tasks.slice(index)) {
					results[skipped.index] = {
						...initialResult(skipped),
						status: "skipped",
						output: "Skipped because the subagent run was aborted.",
					};
				}
				emit();
				break;
			}
			const task = tasks[index];
			const chainedTask = { ...task, task: task.task.replace(/\{previous\}/g, () => previous) };
			const result = await runOne(chainedTask, params.sharedContext);
			previous = result.output;
			if (result.status !== "succeeded") {
				for (const skipped of tasks.slice(index + 1)) {
					results[skipped.index] = {
						...initialResult(skipped),
						status: "skipped",
						output: signal?.aborted
							? "Skipped because the subagent run was aborted."
							: "Skipped because an earlier sequential task failed.",
					};
				}
				emit();
				break;
			}
		}
	}

	const details = makeDetails();
	return {
		content: [{ type: "text", text: modelVisibleOutput(details, totalOutputLimit) }],
		details,
		usage: totalUsage(details.results),
	};
}

function configureChildFastMode(pi: ExtensionAPI): boolean {
	if (process.env[CHILD_MARKER] !== "1") return false;
	const tier = process.env[CHILD_SERVICE_TIER];
	if (tier) {
		pi.on("before_provider_request", (event, ctx) => {
			const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
			if (!supportsPriorityMode(model) || !event.payload || typeof event.payload !== "object") return;
			return { ...(event.payload as Record<string, unknown>), service_tier: tier };
		});
	}
	return true;
}

export default function (pi: ExtensionAPI) {
	if (configureChildFastMode(pi)) return;

	let armedResume: ResumeCandidate | undefined;
	const clearArmedResume = () => {
		armedResume = undefined;
	};

	pi.on("session_start", clearArmedResume);
	pi.on("session_shutdown", clearArmedResume);
	pi.on("agent_settled", clearArmedResume);

	pi.on("input", (event, ctx) => {
		if (event.source === "extension" || event.streamingBehavior !== undefined) return { action: "continue" };
		if (!isBareRecoveryRequest(event.text)) {
			clearArmedResume();
			return { action: "continue" };
		}
		const sessionId = ctx.sessionManager.getSessionId();
		const candidate = armedResume?.sessionId === sessionId
			? armedResume
			: findResumeCandidate(ctx, true);
		if (!candidate) {
			clearArmedResume();
			return { action: "continue" };
		}
		armedResume = candidate;
		return { action: "transform", text: recoveryPrompt(), images: event.images };
	});

	pi.on("tool_call", (event) => {
		if (armedResume && event.toolName !== "subagent_resume") clearArmedResume();
	});

	pi.registerCommand("subagents", {
		description: "Show dynamic subagent aliases and defaults",
		handler: async (_args, ctx) => {
			const config = loadSubagentConfig(ctx.cwd, ctx.isProjectTrusted());
			const aliases = Object.entries(config.aliases)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([alias, model]) => `${alias} → ${model}`);
			const defaults = config.defaults;
			const paths = config.loadedPaths.length ? config.loadedPaths.join(", ") : "built-ins only";
			ctx.ui.notify(
				[
					`Dynamic subagents (concurrency ${defaults.concurrency}, thinking ${defaults.thinking}, fast ${defaults.fast}, resources ${defaults.resources})`,
					...aliases,
					`Config: ${paths}`,
					...config.notices,
				].join("\n"),
				"info",
			);
		},
	});

	pi.registerTool({
		name: "subagent_resume",
		label: "Resume Subagents",
		description: "Resume the most recent interrupted subagent workflow. Restarts only unfinished tasks with their original effective settings and a fresh cancellation signal.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal, onUpdate: ToolUpdate | undefined, ctx) {
			const sessionId = ctx.sessionManager.getSessionId();
			const candidate = armedResume?.sessionId === sessionId
				? armedResume
				: findResumeCandidate(ctx, true);
			if (!candidate) throw new Error("No interrupted subagent workflow is available to resume.");
			clearArmedResume();
			return runSubagentRequest(
				buildResumeInput(candidate),
				signal,
				onUpdate,
				ctx,
				candidate.totalOutputLimit,
			);
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("subagents resume")), 0, 0);
		},
	});

	pi.registerTool({
		name: "subagent",
		label: "Subagents",
		description: [
			"Compose isolated child pi agents per task. For each task, choose the model, reasoning level, exact tool allowlist, resource mode, fast priority tier, cwd, and optional role instructions needed at that moment.",
			"Batch independent work in one parallel call to reduce latency and keep exploration, logs, and intermediate reasoning out of the parent context.",
			"Model aliases: Luna for fast narrow work, Terra for deeper work, Sol for the hardest cross-cutting work, Astra for exceptional tasks needing GPT-6 capability, or inherit/provider/model.",
			"Parallel writing tasks must own disjoint files. Full outputs are written to temporary artifacts; only compact handoffs enter parent context.",
		].join(" "),
		promptSnippet: "Compose isolated Luna/Terra/Sol/Astra agents on the fly and run them in parallel",
		promptGuidelines: [
			"Use subagent to batch independent exploration, research, review, testing, or implementation work when it will reduce latency or parent-context growth.",
			"Prefer one parallel subagent call with several independent tasks over several sequential calls.",
			"Compose every subagent on the fly: select Luna for fast narrow tasks, Terra for deeper tasks, Sol for the hardest cross-cutting tasks, or Astra only when GPT-6 capability materially justifies its higher cost; then choose the lowest sufficient thinking level and minimum required tools.",
			"Give each subagent task-specific role or behavioral guidance through its instructions field instead of relying on predefined profiles.",
			"Use lean resources unless the child specifically needs user/project skills or extensions; choose inherit only in that case.",
			"Do not assign parallel mutating subagent tasks to overlapping files; give each writer an explicit ownership boundary.",
			"Treat subagent handoffs as the primary context and read their full artifact files only when a missing detail is necessary.",
			"When a terse resume or continue request follows an interrupted subagent run, call subagent_resume before replacing the unfinished child task with parent-side work.",
		],
		parameters: SubagentParams,

		async execute(_toolCallId, params: SubagentInput, signal, onUpdate: ToolUpdate | undefined, ctx) {
			return runSubagentRequest(params, signal, onUpdate, ctx);
		},

		renderCall(args, theme) {
			const mode = args.mode ?? "parallel";
			let text = theme.fg("toolTitle", theme.bold("subagents ")) + theme.fg("accent", `${mode} (${args.tasks.length})`);
			for (const [index, task] of args.tasks.slice(0, 6).entries()) {
				const label = task.label || task.task.split(/\s+/).slice(0, 6).join(" ");
				const thinking = task.thinking ?? "medium";
				const tools = task.tools.includes("*") ? "all tools" : `${task.tools.length} tools`;
				text += `\n  ${theme.fg("muted", `${index + 1}.`)} ${theme.fg("accent", label)} ${theme.fg("dim", `[${task.model} · ${thinking} · ${tools}]`)}`;
			}
			if (args.tasks.length > 6) text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 6} more`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as SubagentDetails | undefined;
			if (!details) {
				const content = result.content[0];
				return new Text(content?.type === "text" ? content.text : "(no output)", 0, 0);
			}
			const container = new Container();
			container.addChild(new Text(theme.fg("toolTitle", theme.bold(statusSummary(details.results))), 0, 0));
			for (const task of details.results) {
				const icon = task.status === "succeeded"
					? theme.fg("success", "✓")
					: task.status === "running"
						? theme.fg("warning", "⏳")
						: task.status === "queued" || task.status === "skipped"
							? theme.fg("muted", "○")
							: theme.fg("error", "✗");
				const fast = task.priorityApplied ? theme.fg("warning", " fast") : task.fastFallback ? theme.fg("muted", " fallback") : "";
				container.addChild(new Spacer(1));
				const tools = task.tools?.includes("*") ? "all tools" : `${task.tools?.length ?? 0} tools`;
				container.addChild(
					new Text(
						`${icon} ${theme.fg("accent", task.label)} ${theme.fg("dim", `[${task.model} · ${task.thinking} · ${tools}]`)}${fast}`,
						0,
						0,
					),
				);
				if (task.status === "running" || task.status === "queued") {
					const last = task.activity.at(-1) ?? task.status;
					container.addChild(new Text(theme.fg("muted", `  ${last}`), 0, 0));
				} else if (expanded) {
					if (task.output) container.addChild(new Markdown(task.output, 0, 0, getMarkdownTheme()));
					if (task.error) container.addChild(new Text(theme.fg("error", task.error), 0, 0));
					if (task.artifactPath) container.addChild(new Text(theme.fg("dim", `artifact: ${task.artifactPath}`), 0, 0));
				} else {
					const firstLine = (task.output || task.error || "(no output)").split("\n").find(Boolean) ?? "(no output)";
					container.addChild(new Text(theme.fg("muted", `  ${firstLine.slice(0, 140)}`), 0, 0));
				}
				const usage = formatUsage(task.usage, task.turns);
				if (usage) container.addChild(new Text(theme.fg("dim", `  ${usage} · ${(task.durationMs / 1000).toFixed(1)}s`), 0, 0));
			}
			const aggregate = formatUsage(totalUsage(details.results));
			if (aggregate) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("dim", `Total: ${aggregate}`), 0, 0));
			}
			if (!expanded) {
				container.addChild(
					new Text(theme.fg("muted", `Artifacts: ${details.artifactDir} (${keyHint("app.tools.expand", "to expand")})`), 0, 0),
				);
			}
			return container;
		},
	});
}
