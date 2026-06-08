/**
 * Dynamic Fleet Extension
 *
 * A dynamic-subagent orchestration plugin for Pi.
 *
 * Unlike role-first subagent plugins, this extension only exposes one parent
 * tool: dynamic_fleet. The parent model decides when the user's prompt is large
 * enough to benefit from delegation. When called, the tool starts a temporary
 * child Pi session named "orchestrator". The orchestrator designs a task-specific
 * fleet of ephemeral subagents, then this extension executes that fleet and asks
 * the orchestrator to synthesize the result.
 *
 * There are no predefined role agents and no modal/popup UI. Progress is rendered
 * inline in the tool result, with a compact tree inspired by Claude Code's task
 * UI.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { Type } from "typebox";

const TOOL_NAME = "dynamic_fleet";
const CHILD_ENV = "PI_DYNAMIC_FLEET_CHILD";
const RUN_ID_ENV = "PI_DYNAMIC_FLEET_RUN_ID";
const CHILD_AGENT_ID_ENV = "PI_DYNAMIC_FLEET_AGENT_ID";
const CHILD_WRITE_PATHS_ENV = "PI_DYNAMIC_FLEET_WRITE_PATHS";
const DEFAULT_MAX_AGENTS = 6;
const HARD_MAX_AGENTS = 10;
const DEFAULT_MAX_WRITERS = 3;
const HARD_MAX_WRITERS = HARD_MAX_AGENTS;
const DEFAULT_CONCURRENCY = 4;
const PROCESS_TIMEOUT_MS = 45 * 60 * 1000;
const TASK_ARG_LIMIT = 8000;
const DEFAULT_WRITE_PATHS = ["**"];

const BUILTIN_READ_TOOLS = ["read", "grep", "find", "ls"];
const BUILTIN_ANALYSIS_TOOLS = [...BUILTIN_READ_TOOLS, "bash"];
const WRITE_TOOLS = ["edit", "write"];
const OPTIONAL_RESEARCH_TOOLS = ["web_search", "web_fetch", "context7_search", "context7_docs"];
const ALLOWED_TOOLS = new Set([
	...BUILTIN_ANALYSIS_TOOLS,
	...WRITE_TOOLS,
	...OPTIONAL_RESEARCH_TOOLS,
]);

const FleetParams = Type.Object({
	task: Type.String({
		description:
			"Full task/request to delegate. Include the user's actual goal, relevant constraints, files already discussed, and what final output is expected.",
	}),
	maxAgents: Type.Optional(Type.Integer({
		minimum: 1,
		maximum: HARD_MAX_AGENTS,
		description: `Maximum number of dynamic subagents the orchestrator may create. Default ${DEFAULT_MAX_AGENTS}.`,
	})),
	concurrency: Type.Optional(Type.Integer({
		minimum: 1,
		maximum: HARD_MAX_AGENTS,
		description: `Maximum subagents to run at once inside a phase. Default ${DEFAULT_CONCURRENCY}.`,
	})),
	maxWriters: Type.Optional(Type.Integer({
		minimum: 1,
		maximum: HARD_MAX_WRITERS,
		description: `Maximum write-access subagents the orchestrator may create. Default ${DEFAULT_MAX_WRITERS}. Writers must have non-overlapping write paths when run in parallel.`,
	})),
	allowWrites: Type.Optional(Type.Boolean({
		description:
			"Allow the orchestrator to nominate write-access subagents with edit/write tools. Defaults to true; set false for review/research only.",
	})),
	model: Type.Optional(Type.String({
		description:
			"Optional model override for the orchestrator and all dynamic subagents. Omit to use the current/default Pi model.",
	})),
});

type ProcessRole = "orchestrator" | "subagent" | "synthesizer";
type FleetStatus = "planning" | "running" | "synthesizing" | "completed" | "failed" | "cancelled";
type AgentStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface PlannedAgent {
	id: string;
	name: string;
	purpose: string;
	systemPrompt: string;
	task: string;
	tools: string[];
	writeAccess: boolean;
	writePaths: string[];
}

interface PlannedPhase {
	name: string;
	agents: string[];
}

interface FleetPlan {
	overview: string;
	strategy: string;
	agents: PlannedAgent[];
	phases: PlannedPhase[];
	synthesisPrompt: string;
}

interface AgentRunState {
	id: string;
	name: string;
	purpose: string;
	phase: string;
	status: AgentStatus;
	tools: string[];
	writeAccess: boolean;
	writePaths: string[];
	startedAt?: number;
	endedAt?: number;
	currentTool?: string;
	toolCount: number;
	turnCount: number;
	outputPath?: string;
	outputPreview?: string;
	error?: string;
}

interface FleetRunDetails {
	runId: string;
	status: FleetStatus;
	task: string;
	cwd: string;
	runDir: string;
	startedAt: number;
	endedAt?: number;
	orchestratorStatus: AgentStatus | "planning" | "synthesizing" | "completed" | "failed";
	currentPhase?: string;
	planOverview?: string;
	planStrategy?: string;
	phaseOrder: string[];
	agents: AgentRunState[];
	synthesisPreview?: string;
	error?: string;
}

interface ChildRunResult {
	role: ProcessRole;
	name: string;
	exitCode: number | null;
	output: string;
	stderr: string;
	toolCount: number;
	turnCount: number;
	model?: string;
	error?: string;
}

interface RunPiChildInput {
	role: ProcessRole;
	name: string;
	cwd: string;
	runDir: string;
	runId: string;
	systemPrompt: string;
	task: string;
	tools: string[];
	writePaths?: string[];
	model?: string;
	signal?: AbortSignal;
	onToolStart?: (toolName: string) => void;
	onToolEnd?: (toolName: string | undefined) => void;
	onAssistantOutput?: (text: string, turnCount: number) => void;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(max, Math.floor(value)));
}

function makeRunId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

function safeFileStem(value: string): string {
	const stem = value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
	return stem || "agent";
}

function sanitizeId(value: string, fallback: string, used: Set<string>): string {
	let id = safeFileStem(value || fallback).slice(0, 40) || fallback;
	let candidate = id;
	let i = 2;
	while (used.has(candidate)) {
		candidate = `${id}-${i++}`;
	}
	used.add(candidate);
	return candidate;
}

function toPosixPath(value: string): string {
	return value.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function hasGlobPattern(value: string): boolean {
	return /[*?]/.test(value);
}

function normalizeWritePathPattern(raw: string, cwd: string): string | undefined {
	let value = toPosixPath(raw.trim());
	if (!value || value.includes("\0")) return undefined;

	const cwdPosix = toPosixPath(path.resolve(cwd));
	if (value === cwdPosix) value = "**";
	else if (value.startsWith(`${cwdPosix}/`)) value = value.slice(cwdPosix.length + 1);

	if (path.isAbsolute(value) || value.startsWith("~")) return undefined;
	value = value.replace(/^\.\/+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
	if (!value || value === ".") return "**";
	if (value.split("/").some((segment) => segment === "..")) return undefined;
	return value;
}

function normalizeWritePathList(raw: unknown, cwd: string): string[] {
	const items = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
	const paths: string[] = [];
	for (const item of items) {
		const normalized = normalizeWritePathPattern(item, cwd);
		if (normalized && !paths.includes(normalized)) paths.push(normalized);
	}
	return paths;
}

function relativePathFromToolPath(rawPath: unknown, cwd: string): string | undefined {
	if (typeof rawPath !== "string" || !rawPath.trim()) return undefined;
	const target = rawPath.trim();
	const abs = path.isAbsolute(target) ? path.resolve(target) : path.resolve(cwd, target);
	const rel = path.relative(cwd, abs);
	if (!rel) return ".";
	if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return undefined;
	return toPosixPath(rel);
}

function escapeRegExp(value: string): string {
	return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globPatternToRegExp(pattern: string): RegExp {
	let source = "";
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i]!;
		if (char === "*") {
			if (pattern[i + 1] === "*") {
				source += ".*";
				i++;
			} else {
				source += "[^/]*";
			}
		} else if (char === "?") {
			source += "[^/]";
		} else {
			source += escapeRegExp(char);
		}
	}
	return new RegExp(`^${source}$`);
}

function matchesWritePattern(relativePath: string, pattern: string): boolean {
	const rel = toPosixPath(relativePath).replace(/^\.\/+/, "");
	const cleanPattern = toPosixPath(pattern).replace(/^\.\/+/, "").replace(/\/+$/, "");
	if (!cleanPattern || cleanPattern === "." || cleanPattern === "**") return true;
	if (!hasGlobPattern(cleanPattern)) return rel === cleanPattern || rel.startsWith(`${cleanPattern}/`);
	if (cleanPattern.endsWith("/**")) {
		const base = cleanPattern.slice(0, -3).replace(/\/+$/, "");
		if (base && (rel === base || rel.startsWith(`${base}/`))) return true;
	}
	return globPatternToRegExp(cleanPattern).test(rel);
}

function isPathAllowedForWrite(relativePath: string, writePaths: string[]): boolean {
	return writePaths.some((pattern) => matchesWritePattern(relativePath, pattern));
}

function literalPrefixForOverlap(pattern: string): string {
	const clean = toPosixPath(pattern).replace(/^\.\/+/, "").replace(/\/+$/, "");
	if (!clean || clean === "**") return "";
	const globIndex = clean.search(/[*?]/);
	if (globIndex === -1) return clean;
	const literal = clean.slice(0, globIndex).replace(/\/+$/, "");
	if (!literal) return "";
	const preceding = clean[globIndex - 1];
	if (preceding === "/") return literal;
	const slash = literal.lastIndexOf("/");
	return slash === -1 ? "" : literal.slice(0, slash);
}

function writePathPatternsMayOverlap(a: string, b: string): boolean {
	if (a === "**" || b === "**") return true;
	if (matchesWritePattern(a, b) || matchesWritePattern(b, a)) return true;
	const aPrefix = literalPrefixForOverlap(a);
	const bPrefix = literalPrefixForOverlap(b);
	if (!aPrefix || !bPrefix) return true;
	return aPrefix === bPrefix || aPrefix.startsWith(`${bPrefix}/`) || bPrefix.startsWith(`${aPrefix}/`);
}

function writePathSetsMayOverlap(a: string[], b: string[]): boolean {
	const left = a.length ? a : DEFAULT_WRITE_PATHS;
	const right = b.length ? b : DEFAULT_WRITE_PATHS;
	return left.some((leftPattern) => right.some((rightPattern) => writePathPatternsMayOverlap(leftPattern, rightPattern)));
}

function formatWritePaths(writePaths: string[]): string {
	return writePaths.length ? writePaths.join(", ") : "none";
}

function commandLooksMutating(command: string): boolean {
	const normalized = command.replace(/\\\n/g, " ");
	return /(^|[;&|]\s*)(rm|mv|cp|mkdir|touch|chmod|chown|ln|tee|truncate)\b/.test(normalized)
		|| /(^|[;&|]\s*)git\s+(init|add|commit|checkout|switch|merge|reset|clean|apply|am)\b/.test(normalized)
		|| /(^|[;&|]\s*)(bun\s+(install|add|remove|create)|npm\s+(install|i|add|remove)|pnpm\s+(install|add|remove)|yarn\s+(install|add|remove))\b/.test(normalized)
		|| /(^|[^<])>>?\s*[^&\s]/.test(normalized)
		|| /<<\s*\w+/.test(normalized);
}

function registerChildPermissionGuard(pi: ExtensionAPI): void {
	const role = process.env[CHILD_ENV];
	let writePaths: string[] = [];
	try {
		const parsed = JSON.parse(process.env[CHILD_WRITE_PATHS_ENV] || "[]");
		if (Array.isArray(parsed)) writePaths = parsed.filter((item): item is string => typeof item === "string");
	} catch {
		writePaths = [];
	}
	const canWrite = role === "subagent" && writePaths.length > 0;

	pi.on("tool_call", async (event: any, ctx: ExtensionContext) => {
		const toolName = typeof event.toolName === "string" ? event.toolName : "";
		if (toolName === "write" || toolName === "edit") {
			if (!canWrite) {
				return { block: true, reason: "This dynamic-fleet child has no write permission." };
			}
			const target = relativePathFromToolPath(event.input?.path, ctx.cwd);
			if (!target) {
				return { block: true, reason: "Refusing to write outside the current working directory." };
			}
			if (!isPathAllowedForWrite(target, writePaths)) {
				return {
					block: true,
					reason: `Write to ${target} is outside this subagent's allowed paths: ${formatWritePaths(writePaths)}.`,
				};
			}
		}

		if (toolName === "bash" && !canWrite) {
			const command = typeof event.input?.command === "string" ? event.input.command : "";
			if (commandLooksMutating(command)) {
				return { block: true, reason: "Read-only dynamic-fleet subagents may not run shell commands that appear to modify files." };
			}
		}

		return undefined;
	});
}

function textFromMessageContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const p = part as { type?: unknown; text?: unknown; content?: unknown };
		if (p.type === "text" && typeof p.text === "string") parts.push(p.text);
		else if (typeof p.content === "string") parts.push(p.content);
	}
	return parts.join("\n").trim();
}

function preview(text: string, max = 700): string {
	const clean = text.trim().replace(/\n{3,}/g, "\n\n");
	if (clean.length <= max) return clean;
	return `${clean.slice(0, max).trimEnd()}…`;
}

function limitForPrompt(text: string, max = 12000): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n\n[truncated ${text.length - max} chars]`;
}

function extractJsonObject(text: string): unknown {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidates = fenced ? [fenced[1] ?? ""] : [];
	const first = text.indexOf("{");
	const last = text.lastIndexOf("}");
	if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
	candidates.push(text);

	let lastError: unknown;
	for (const candidate of candidates) {
		try {
			return JSON.parse(candidate.trim());
		} catch (error) {
			lastError = error;
		}
	}
	throw new Error(`Could not parse orchestrator JSON plan: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function normalizeToolList(raw: unknown, writeAccess: boolean, allowWrites: boolean): string[] {
	const requested = Array.isArray(raw)
		? raw.filter((item): item is string => typeof item === "string")
		: [];
	const base = requested.length > 0 ? requested : BUILTIN_ANALYSIS_TOOLS;
	const tools: string[] = [];
	for (const item of base) {
		const tool = item.trim();
		if (!tool || !ALLOWED_TOOLS.has(tool)) continue;
		if (WRITE_TOOLS.includes(tool) && (!writeAccess || !allowWrites)) continue;
		if (!tools.includes(tool)) tools.push(tool);
	}
	for (const required of BUILTIN_READ_TOOLS) {
		if (!tools.includes(required)) tools.unshift(required);
	}
	if (writeAccess && allowWrites) {
		for (const tool of WRITE_TOOLS) {
			if (!tools.includes(tool)) tools.push(tool);
		}
	}
	return tools;
}

function splitConcurrentWriterConflicts(phases: PlannedPhase[], agents: PlannedAgent[]): PlannedPhase[] {
	const byId = new Map(agents.map((agent) => [agent.id, agent]));
	const repaired: PlannedPhase[] = [];

	for (const phase of phases) {
		const groups: string[][] = [];
		for (const id of phase.agents) {
			const agent = byId.get(id);
			if (!agent?.writeAccess) {
				if (groups.length === 0) groups.push([]);
				groups[groups.length - 1]!.push(id);
				continue;
			}

			let placed = false;
			for (const group of groups) {
				const conflicts = group.some((existingId) => {
					const existing = byId.get(existingId);
					return existing?.writeAccess && writePathSetsMayOverlap(agent.writePaths, existing.writePaths);
				});
				if (!conflicts) {
					group.push(id);
					placed = true;
					break;
				}
			}

			if (!placed) groups.push([id]);
		}

		const nonEmptyGroups = groups.filter((group) => group.length > 0);
		if (nonEmptyGroups.length <= 1) {
			repaired.push({ ...phase, agents: nonEmptyGroups[0] ?? [] });
			continue;
		}

		for (let i = 0; i < nonEmptyGroups.length; i++) {
			repaired.push({
				name: i === 0 ? phase.name : `${phase.name} (write group ${i + 1})`,
				agents: nonEmptyGroups[i]!,
			});
		}
	}

	return repaired.filter((phase) => phase.agents.length > 0);
}

function normalizeFleetPlan(raw: unknown, maxAgents: number, allowWrites: boolean, maxWriters: number, cwd: string): FleetPlan {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("Orchestrator plan must be a JSON object.");
	}
	const obj = raw as Record<string, unknown>;
	const rawAgents = Array.isArray(obj.agents) ? obj.agents : [];
	if (rawAgents.length === 0) {
		throw new Error("Orchestrator plan did not define any agents.");
	}

	const usedIds = new Set<string>();
	const writerLimit = allowWrites ? Math.min(maxWriters, maxAgents) : 0;
	let writersAssigned = 0;
	const agents: PlannedAgent[] = [];

	for (let index = 0; index < rawAgents.length && agents.length < maxAgents; index++) {
		const rawAgent = rawAgents[index];
		if (!rawAgent || typeof rawAgent !== "object" || Array.isArray(rawAgent)) continue;
		const a = rawAgent as Record<string, unknown>;
		const rawName = typeof a.name === "string" && a.name.trim() ? a.name.trim() : `agent-${index + 1}`;
		const id = sanitizeId(
			typeof a.id === "string" ? a.id : rawName,
			`agent-${index + 1}`,
			usedIds,
		);
		const requestedWriteAccess = a.writeAccess === true || (Array.isArray(a.tools) && a.tools.some((t) => typeof t === "string" && WRITE_TOOLS.includes(t)));
		const requestedWritePaths = normalizeWritePathList(a.writePaths, cwd);
		const writeAccess = allowWrites && requestedWriteAccess && writersAssigned < writerLimit;
		if (writeAccess) writersAssigned++;
		const writePaths = writeAccess ? (requestedWritePaths.length > 0 ? requestedWritePaths : [...DEFAULT_WRITE_PATHS]) : [];
		const tools = normalizeToolList(a.tools, writeAccess, allowWrites);
		agents.push({
			id,
			name: rawName.slice(0, 60),
			purpose: typeof a.purpose === "string" && a.purpose.trim() ? a.purpose.trim() : "Task-specific investigation",
			systemPrompt: typeof a.systemPrompt === "string" && a.systemPrompt.trim()
				? a.systemPrompt.trim()
				: "Be precise, evidence-driven, and stay inside your assigned mission.",
			task: typeof a.task === "string" && a.task.trim()
				? a.task.trim()
				: `Complete your purpose for the parent task: ${String(obj.overview ?? "")}`,
			tools,
			writeAccess,
			writePaths,
		});
	}

	if (agents.length === 0) throw new Error("No usable agents remained after plan normalization.");

	const agentIds = new Set(agents.map((a) => a.id));
	const phases: PlannedPhase[] = [];
	if (Array.isArray(obj.phases)) {
		for (let i = 0; i < obj.phases.length; i++) {
			const rawPhase = obj.phases[i];
			if (!rawPhase || typeof rawPhase !== "object" || Array.isArray(rawPhase)) continue;
			const p = rawPhase as Record<string, unknown>;
			const phaseAgents = Array.isArray(p.agents)
				? p.agents.filter((id): id is string => typeof id === "string" && agentIds.has(safeFileStem(id)))
				: [];
			const normalizedPhaseAgents = phaseAgents
				.map((id) => safeFileStem(id))
				.filter((id, idx, all) => agentIds.has(id) && all.indexOf(id) === idx);
			if (normalizedPhaseAgents.length === 0) continue;
			phases.push({
				name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : `Phase ${i + 1}`,
				agents: normalizedPhaseAgents,
			});
		}
	}

	const assigned = new Set(phases.flatMap((phase) => phase.agents));
	const unassigned = agents.map((a) => a.id).filter((id) => !assigned.has(id));
	if (unassigned.length > 0 || phases.length === 0) {
		phases.push({ name: phases.length === 0 ? "Parallel fleet" : "Remaining agents", agents: unassigned.length ? unassigned : agents.map((a) => a.id) });
	}

	const safePhases = splitConcurrentWriterConflicts(phases, agents);

	return {
		overview: typeof obj.overview === "string" ? obj.overview.trim() : "Dynamic fleet plan",
		strategy: typeof obj.strategy === "string" ? obj.strategy.trim() : "Run the task-specific fleet and synthesize results.",
		agents,
		phases: safePhases,
		synthesisPrompt: typeof obj.synthesisPrompt === "string" && obj.synthesisPrompt.trim()
			? obj.synthesisPrompt.trim()
			: "Synthesize the fleet results into the best final answer for the original user task.",
	};
}

function currentModelId(ctx: ExtensionContext, override?: string): string | undefined {
	if (override?.trim()) return override.trim();
	const model = ctx.model as { provider?: string; id?: string } | undefined;
	if (!model?.id) return undefined;
	return model.provider ? `${model.provider}/${model.id}` : model.id;
}

function buildChildArgs(input: RunPiChildInput, promptPath: string, taskPath?: string): string[] {
	const args = ["--mode", "json", "-p", "--no-session", "--no-skills"];
	if (input.model) args.push("--model", input.model);
	if (input.tools.length > 0) args.push("--tools", input.tools.join(","));
	args.push("--append-system-prompt", promptPath);
	if (taskPath) args.push(`@${taskPath}`);
	else args.push(`Task: ${input.task}`);
	return args;
}

function appendLog(filePath: string, text: string): void {
	try {
		fs.appendFileSync(filePath, text, "utf-8");
	} catch {
		// Logging should never fail the run.
	}
}

async function runPiChild(input: RunPiChildInput): Promise<ChildRunResult> {
	ensureDir(input.runDir);
	const stem = safeFileStem(input.name || input.role);
	const promptPath = path.join(input.runDir, `${stem}.system.md`);
	const jsonlPath = path.join(input.runDir, `${stem}.jsonl`);
	const stderrPath = path.join(input.runDir, `${stem}.stderr.log`);
	fs.writeFileSync(promptPath, input.systemPrompt, { encoding: "utf-8", mode: 0o600 });

	let taskPath: string | undefined;
	if (input.task.length > TASK_ARG_LIMIT) {
		taskPath = path.join(input.runDir, `${stem}.task.md`);
		fs.writeFileSync(taskPath, `Task:\n\n${input.task}`, { encoding: "utf-8", mode: 0o600 });
	}

	const args = buildChildArgs(input, promptPath, taskPath);
	const env = {
		...process.env,
		[CHILD_ENV]: input.role,
		[RUN_ID_ENV]: input.runId,
		[CHILD_AGENT_ID_ENV]: input.name,
		[CHILD_WRITE_PATHS_ENV]: JSON.stringify(input.writePaths ?? []),
	};

	return new Promise<ChildRunResult>((resolve) => {
		let proc: ChildProcessWithoutNullStreams | undefined;
		let stdoutBuffer = "";
		let stderr = "";
		let latestAssistant = "";
		let toolCount = 0;
		let turnCount = 0;
		let currentTool: string | undefined;
		let model: string | undefined;
		let settled = false;
		let timeout: NodeJS.Timeout | undefined;
		let removeAbort: (() => void) | undefined;

		const finish = (result: ChildRunResult) => {
			if (settled) return;
			settled = true;
			if (timeout) clearTimeout(timeout);
			removeAbort?.();
			resolve(result);
		};

		const kill = (reason: string) => {
			if (!proc || settled) return;
			appendLog(stderrPath, `\n[dynamic-fleet] ${reason}\n`);
			try { proc.kill("SIGTERM"); } catch {}
			setTimeout(() => {
				try { if (proc && !proc.killed) proc.kill("SIGKILL"); } catch {}
			}, 3000).unref?.();
		};

		const processLine = (line: string) => {
			if (!line.trim()) return;
			appendLog(jsonlPath, `${line}\n`);
			let event: any;
			try {
				event = JSON.parse(line);
			} catch {
				return;
			}

			if (event.type === "tool_execution_start") {
				currentTool = typeof event.toolName === "string" ? event.toolName : "tool";
				toolCount++;
				input.onToolStart?.(currentTool);
				return;
			}

			if (event.type === "tool_execution_end") {
				input.onToolEnd?.(currentTool);
				currentTool = undefined;
				return;
			}

			if (event.type === "message_end" && event.message?.role === "assistant") {
				const text = textFromMessageContent(event.message.content);
				if (text) latestAssistant = text;
				turnCount++;
				if (typeof event.message.model === "string") model = event.message.model;
				input.onAssistantOutput?.(latestAssistant, turnCount);
			}
		};

		try {
			proc = spawn("pi", args, {
				cwd: input.cwd,
				env,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});
		} catch (error) {
			finish({
				role: input.role,
				name: input.name,
				exitCode: 1,
				output: "",
				stderr: "",
				toolCount,
				turnCount,
				error: error instanceof Error ? error.message : String(error),
			});
			return;
		}

		timeout = setTimeout(() => kill(`timeout after ${PROCESS_TIMEOUT_MS}ms`), PROCESS_TIMEOUT_MS);
		timeout.unref?.();

		if (input.signal) {
			const abort = () => kill("aborted by parent");
			if (input.signal.aborted) abort();
			else {
				input.signal.addEventListener("abort", abort, { once: true });
				removeAbort = () => input.signal?.removeEventListener("abort", abort);
			}
		}

		proc.stdout.on("data", (chunk: Buffer) => {
			stdoutBuffer += chunk.toString();
			const lines = stdoutBuffer.split("\n");
			stdoutBuffer = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		});

		proc.stderr.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			stderr += text;
			appendLog(stderrPath, text);
		});

		proc.on("error", (error) => {
			finish({
				role: input.role,
				name: input.name,
				exitCode: 1,
				output: latestAssistant,
				stderr,
				toolCount,
				turnCount,
				model,
				error: error instanceof Error ? error.message : String(error),
			});
		});

		proc.on("close", (code, signal) => {
			if (stdoutBuffer.trim()) processLine(stdoutBuffer);
			const error = signal ? `Child process terminated by ${signal}` : code && code !== 0 ? (stderr.trim() || `Child process exited ${code}`) : undefined;
			finish({
				role: input.role,
				name: input.name,
				exitCode: code,
				output: latestAssistant,
				stderr,
				toolCount,
				turnCount,
				model,
				error,
			});
		});
	});
}

function buildOrchestratorPlanningPrompt(maxAgents: number, maxWriters: number, allowWrites: boolean): string {
	return `You are orchestrator, a temporary dynamic-subagent designer.

Your job is to decide and create a task-specific fleet for the parent request. There are no predefined subagent roles. Invent the right specialists for this task from first principles.

You may inspect the repository with read/search/bash if it helps you design a better fleet. Do not edit files in the planning step.

Design principles:
- Create subagents only when they add parallel evidence, independent reasoning, implementation throughput, or adversarial validation.
- Prefer 2-${maxAgents} strong, distinct agents over many vague agents.
- Make each subagent's purpose narrow and non-overlapping.
- Use phases when later agents should depend on earlier outputs. Agents inside the same phase run concurrently.
- ${allowWrites ? `You may nominate up to ${maxWriters} writer subagents by setting writeAccess: true.` : "Do not nominate writer agents; allowWrites is false."}
- For greenfield or multi-area implementation tasks, prefer a small serial foundation writer if needed, then parallel writers split by non-overlapping directories/packages, then a serial integration or validation phase.
- Every writer MUST declare explicit writePaths relative to the working directory. Examples: ["package.json", "flake.nix"], ["apps/mobile/**"], ["apps/api/**"], ["packages/db/**", "packages/contracts/**"].
- Writers in the same phase MUST NOT have overlapping writePaths. If two writers need the same files, put them in separate phases or assign those files to one integration/foundation writer.
- Read-only reviewers/scouts/researchers/validators should have writeAccess: false and writePaths: []; they may run inspection or no-output validation commands, but not install/build commands that write artifacts.
- Use only these tools when listing tools: ${[...ALLOWED_TOOLS].join(", ")}.
- Give every subagent a custom systemPrompt and concrete task for this specific request.

Return ONLY valid JSON. Do not include markdown fences, comments, or prose outside JSON.

Schema:
{
  "overview": "one sentence summary of the plan",
  "strategy": "short explanation of why this fleet shape fits the task",
  "agents": [
    {
      "id": "stable-kebab-id",
      "name": "Human readable dynamic agent name",
      "purpose": "narrow reason this agent exists",
      "systemPrompt": "role-specific instructions and constraints",
      "task": "the exact task this subagent should perform",
      "tools": ["read", "grep", "find", "ls", "bash"],
      "writeAccess": false,
      "writePaths": []
    }
  ],
  "phases": [
    { "name": "Phase name", "agents": ["stable-kebab-id"] }
  ],
  "synthesisPrompt": "instructions for orchestrator's final synthesis after all subagents return"
}`;
}

function buildAgentSystemPrompt(agent: PlannedAgent): string {
	const writePolicy = agent.writeAccess
		? `You have write access only for these relative path scopes: ${formatWritePaths(agent.writePaths)}. Make narrow, coherent edits only inside those scopes. Use write/edit for file changes so the path guard can enforce ownership; do not use bash to modify files outside your scopes.`
		: "You are read-only for project/source files. Do not edit, write, move, or delete project files. If bash is available, use it only for inspection or validation commands that do not mutate files.";
	return `You are ${agent.name}, a dynamic subagent created by orchestrator for one specific task.

Purpose: ${agent.purpose}

Hard boundaries:
- You are not the parent orchestrator.
- Do not create or suggest more subagents.
- Stay inside your assigned mission; do not broaden scope.
- ${writePolicy}
- Cite concrete evidence: file paths, commands, errors, docs, or reasoning traces that matter.
- If the task cannot be completed safely, explain the blocker and the smallest needed next decision.

Role-specific instructions from orchestrator:
${agent.systemPrompt}

Final response shape:
- Result
- Evidence / files inspected
- Changes made (if any)
- Validation run (if any)
- Risks or open questions`;
}

function buildAgentTask(originalTask: string, plan: FleetPlan, agent: PlannedAgent, previousPhaseOutputs: string): string {
	const previous = previousPhaseOutputs.trim()
		? `\n\nPrevious phase outputs you may rely on:\n${limitForPrompt(previousPhaseOutputs, 10000)}`
		: "";
	const permissions = agent.writeAccess
		? `\n\nWrite permissions: ${formatWritePaths(agent.writePaths)}. Do not modify files outside these scopes.`
		: "\n\nWrite permissions: none (read-only).";
	return `Original user task:\n${originalTask}\n\nFleet strategy:\n${plan.strategy}${permissions}\n\nYour assigned task:\n${agent.task}${previous}`;
}

function buildSynthesisPrompt(): string {
	return `You are orchestrator, returning after your dynamic fleet completed.

Synthesize the fleet results into the final answer for the parent Pi session. Resolve disagreements explicitly. Do not hide failed agents. If files were changed, summarize changed files and validation. If no changes were made, say so. Be concise but complete.`;
}

function buildSynthesisTask(originalTask: string, plan: FleetPlan, results: Array<{ agent: PlannedAgent; state: AgentRunState; output: string }>): string {
	const blocks = results.map(({ agent, state, output }, index) => {
		return `## ${index + 1}. ${agent.name} (${state.status})\nPurpose: ${agent.purpose}\nWrite access: ${agent.writeAccess ? "yes" : "no"}\nWrite paths: ${formatWritePaths(agent.writePaths)}\nTools: ${agent.tools.join(", ")}\nOutput:\n${limitForPrompt(output || state.error || "(no output)", 10000)}`;
	}).join("\n\n");
	return `Original user task:\n${originalTask}\n\nYour fleet plan overview:\n${plan.overview}\n\nYour synthesis instruction:\n${plan.synthesisPrompt}\n\nFleet results:\n${blocks}\n\nNow produce the final answer for the parent session.`;
}

function detailsSnapshot(details: FleetRunDetails): FleetRunDetails {
	return {
		...details,
		phaseOrder: [...details.phaseOrder],
		agents: details.agents.map((agent) => ({ ...agent, tools: [...agent.tools], writePaths: [...(agent.writePaths ?? [])] })),
	};
}

function buildStateFromPlan(run: FleetRunDetails, plan: FleetPlan): void {
	run.planOverview = plan.overview;
	run.planStrategy = plan.strategy;
	run.phaseOrder = plan.phases.map((phase) => phase.name);
	const phaseByAgent = new Map<string, string>();
	for (const phase of plan.phases) {
		for (const id of phase.agents) phaseByAgent.set(id, phase.name);
	}
	run.agents = plan.agents.map((agent) => ({
		id: agent.id,
		name: agent.name,
		purpose: agent.purpose,
		phase: phaseByAgent.get(agent.id) ?? "Fleet",
		status: "pending",
		tools: agent.tools,
		writeAccess: agent.writeAccess,
		writePaths: agent.writePaths,
		toolCount: 0,
		turnCount: 0,
	}));
}

function renderStatusIcon(status: AgentStatus | FleetStatus | string, theme: any): string {
	switch (status) {
		case "completed": return theme.fg("success", "✓");
		case "failed": return theme.fg("error", "✗");
		case "running":
		case "planning":
		case "synthesizing": return theme.fg("warning", "●");
		case "cancelled": return theme.fg("warning", "■");
		case "skipped": return theme.fg("dim", "- ").trimEnd();
		default: return theme.fg("dim", "○");
	}
}

function renderFleetDetails(result: any, options: { expanded?: boolean; isPartial?: boolean }, theme: any): Text {
	const details = result.details as FleetRunDetails | undefined;
	if (!details) {
		const first = Array.isArray(result.content) ? result.content[0] : undefined;
		return new Text(first?.type === "text" ? first.text : "dynamic fleet", 0, 0);
	}
	const lines: string[] = [];
	const headIcon = renderStatusIcon(details.status, theme);
	lines.push(`${headIcon} ${theme.bold("orchestrator")} ${theme.fg("dim", details.status)}`);
	if (details.planOverview) lines.push(`  ${theme.fg("muted", details.planOverview)}`);
	if (details.currentPhase) lines.push(`  ${theme.fg("accent", `phase: ${details.currentPhase}`)}`);
	if (details.error) lines.push(`  ${theme.fg("error", details.error)}`);

	const phases = details.phaseOrder.length > 0 ? details.phaseOrder : [...new Set(details.agents.map((a) => a.phase))];
	for (const phase of phases) {
		const agents = details.agents.filter((a) => a.phase === phase);
		if (agents.length === 0) continue;
		lines.push(`  ${theme.fg("dim", "┌")} ${theme.fg("accent", phase)}`);
		for (let i = 0; i < agents.length; i++) {
			const agent = agents[i]!;
			const branch = i === agents.length - 1 ? "└─" : "├─";
			const icon = renderStatusIcon(agent.status, theme);
			lines.push(`  ${theme.fg("dim", branch)} ${icon} ${theme.bold(agent.name)} ${theme.fg("dim", agent.status)}`);
			if (options.expanded) {
				lines.push(`  ${theme.fg("dim", "│")}  ${theme.fg("muted", agent.purpose)}`);
				if (agent.writeAccess) lines.push(`  ${theme.fg("dim", "│")}  ${theme.fg("muted", `write paths: ${formatWritePaths(agent.writePaths ?? [])}`)}`);
				if (agent.outputPreview) {
					for (const line of wrapTextWithAnsi(theme.fg("dim", agent.outputPreview), 90).slice(0, 6)) {
						lines.push(`  ${theme.fg("dim", "│")}  ${line}`);
					}
				}
				if (agent.error) lines.push(`  ${theme.fg("dim", "│")}  ${theme.fg("error", agent.error)}`);
				if (agent.outputPath) lines.push(`  ${theme.fg("dim", "│")}  ${theme.fg("muted", `output: ${agent.outputPath}`)}`);
			}
		}
	}
	if (details.synthesisPreview && options.expanded) {
		lines.push("");
		lines.push(theme.fg("accent", "Synthesis preview:"));
		lines.push(...wrapTextWithAnsi(theme.fg("dim", details.synthesisPreview), 100).slice(0, 10));
	}
	if (!options.expanded && details.agents.some((a) => a.outputPreview || a.outputPath)) {
		lines.push(theme.fg("dim", "Ctrl+O to expand fleet details"));
	}
	return new Text(lines.join("\n"), 0, 0);
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await worker(items[index]!, index);
		}
	});
	await Promise.all(runners);
	return results;
}

async function runDynamicFleet(params: any, signal: AbortSignal, onUpdate: ((result: any) => void) | undefined, ctx: ExtensionContext) {
	const runId = makeRunId();
	const runDir = path.join(os.tmpdir(), "pi-dynamic-fleet", runId);
	ensureDir(runDir);
	const maxAgents = clampInt(params.maxAgents, DEFAULT_MAX_AGENTS, 1, HARD_MAX_AGENTS);
	const concurrency = clampInt(params.concurrency, DEFAULT_CONCURRENCY, 1, HARD_MAX_AGENTS);
	const maxWriters = clampInt(params.maxWriters, Math.min(DEFAULT_MAX_WRITERS, maxAgents), 1, Math.min(HARD_MAX_WRITERS, maxAgents));
	const allowWrites = params.allowWrites !== false;
	const model = currentModelId(ctx, params.model);
	const task = String(params.task ?? "").trim();
	const run: FleetRunDetails = {
		runId,
		status: "planning",
		task,
		cwd: ctx.cwd,
		runDir,
		startedAt: Date.now(),
		orchestratorStatus: "planning",
		phaseOrder: [],
		agents: [],
	};
	const emit = (text?: string) => {
		onUpdate?.({
			content: [{ type: "text", text: text ?? run.status }],
			details: detailsSnapshot(run),
		});
		if (ctx.hasUI) ctx.ui.requestRender?.();
	};

	emit("Orchestrator is designing a dynamic fleet...");

	let plan: FleetPlan;
	let rawPlanOutput = "";
	try {
		const planner = await runPiChild({
			role: "orchestrator",
			name: "orchestrator-plan",
			cwd: ctx.cwd,
			runDir,
			runId,
			model,
			signal,
			tools: [...BUILTIN_ANALYSIS_TOOLS, ...OPTIONAL_RESEARCH_TOOLS],
			systemPrompt: buildOrchestratorPlanningPrompt(maxAgents, maxWriters, allowWrites),
			task: `Parent task:\n${task}\n\nCurrent working directory: ${ctx.cwd}\n\nCreate the dynamic fleet plan now.`,
			onToolStart: () => emit("Orchestrator is inspecting context..."),
			onAssistantOutput: (text) => {
				rawPlanOutput = text;
				run.synthesisPreview = preview(text, 300);
				emit("Orchestrator drafted a plan...");
			},
		});
		rawPlanOutput = planner.output || rawPlanOutput;
		if (planner.error) throw new Error(planner.error);
		fs.writeFileSync(path.join(runDir, "orchestrator-plan.raw.md"), rawPlanOutput, "utf-8");
		plan = normalizeFleetPlan(extractJsonObject(rawPlanOutput), maxAgents, allowWrites, maxWriters, ctx.cwd);
		fs.writeFileSync(path.join(runDir, "orchestrator-plan.json"), JSON.stringify(plan, null, 2), "utf-8");
	} catch (error) {
		run.status = signal.aborted ? "cancelled" : "failed";
		run.orchestratorStatus = "failed";
		run.error = error instanceof Error ? error.message : String(error);
		run.endedAt = Date.now();
		emit(run.error);
		return {
			content: [{ type: "text", text: `Dynamic fleet failed while planning: ${run.error}\nRun dir: ${runDir}` }],
			details: detailsSnapshot(run),
			isError: true,
		};
	}

	buildStateFromPlan(run, plan);
	run.status = "running";
	run.orchestratorStatus = "completed";
	run.synthesisPreview = undefined;
	emit(`Running ${plan.agents.length} dynamic subagents...`);

	const stateById = new Map(run.agents.map((agent) => [agent.id, agent]));
	const plannedById = new Map(plan.agents.map((agent) => [agent.id, agent]));
	const outputs = new Map<string, string>();
	let previousPhaseOutputs = "";

	for (const phase of plan.phases) {
		if (signal.aborted) break;
		run.currentPhase = phase.name;
		emit(`Running phase: ${phase.name}`);
		const phaseAgents = phase.agents
			.map((id) => plannedById.get(id))
			.filter((agent): agent is PlannedAgent => Boolean(agent));

		await mapConcurrent(phaseAgents, concurrency, async (agent) => {
			const state = stateById.get(agent.id)!;
			state.status = "running";
			state.startedAt = Date.now();
			state.currentTool = undefined;
			emit(`Running ${agent.name}...`);
			const outputPath = path.join(runDir, `${safeFileStem(agent.id)}.out.md`);
			try {
				const result = await runPiChild({
					role: "subagent",
					name: agent.id,
					cwd: ctx.cwd,
					runDir,
					runId,
					model,
					signal,
					tools: agent.tools,
					writePaths: agent.writePaths,
					systemPrompt: buildAgentSystemPrompt(agent),
					task: buildAgentTask(task, plan, agent, previousPhaseOutputs),
					onToolStart: (tool) => {
						state.currentTool = tool;
						state.toolCount++;
						emit(`${agent.name}: ${tool}`);
					},
					onToolEnd: () => {
						state.currentTool = undefined;
						emit(`${agent.name}: tool finished`);
					},
					onAssistantOutput: (text, turnCount) => {
						state.turnCount = turnCount;
						state.outputPreview = preview(text, 500);
						emit(`${agent.name}: updated output`);
					},
				});
				state.endedAt = Date.now();
				state.toolCount = Math.max(state.toolCount, result.toolCount);
				state.turnCount = Math.max(state.turnCount, result.turnCount);
				state.outputPath = outputPath;
				state.outputPreview = preview(result.output || result.error || "", 700);
				if (result.error) {
					state.status = "failed";
					state.error = result.error;
				} else {
					state.status = "completed";
				}
				fs.writeFileSync(outputPath, result.output || result.error || "(no output)", "utf-8");
				outputs.set(agent.id, result.output || "");
			} catch (error) {
				state.status = signal.aborted ? "skipped" : "failed";
				state.endedAt = Date.now();
				state.error = error instanceof Error ? error.message : String(error);
				state.outputPath = outputPath;
				fs.writeFileSync(outputPath, state.error, "utf-8");
				outputs.set(agent.id, state.error);
			}
			emit(`${agent.name}: ${state.status}`);
		});

		previousPhaseOutputs += `\n\n# ${phase.name}\n`;
		for (const agent of phaseAgents) {
			const state = stateById.get(agent.id)!;
			previousPhaseOutputs += `\n## ${agent.name} (${state.status})\n${limitForPrompt(outputs.get(agent.id) || state.error || "(no output)", 5000)}\n`;
		}
	}

	if (signal.aborted) {
		run.status = "cancelled";
		run.endedAt = Date.now();
		emit("Dynamic fleet cancelled.");
		return {
			content: [{ type: "text", text: `Dynamic fleet cancelled. Run dir: ${runDir}` }],
			details: detailsSnapshot(run),
			isError: true,
		};
	}

	run.status = "synthesizing";
	run.orchestratorStatus = "synthesizing";
	run.currentPhase = "Synthesis";
	emit("Orchestrator is synthesizing fleet results...");

	const synthesisInputs = plan.agents.map((agent) => ({
		agent,
		state: stateById.get(agent.id)!,
		output: outputs.get(agent.id) ?? "",
	}));
	let synthesis: ChildRunResult;
	try {
		synthesis = await runPiChild({
			role: "synthesizer",
			name: "orchestrator-synthesis",
			cwd: ctx.cwd,
			runDir,
			runId,
			model,
			signal,
			tools: BUILTIN_ANALYSIS_TOOLS,
			systemPrompt: buildSynthesisPrompt(),
			task: buildSynthesisTask(task, plan, synthesisInputs),
			onToolStart: (tool) => {
				emit(`orchestrator synthesis: ${tool}`);
			},
			onAssistantOutput: (text) => {
				run.synthesisPreview = preview(text, 600);
				emit("orchestrator synthesis updated");
			},
		});
	} catch (error) {
		synthesis = {
			role: "synthesizer",
			name: "orchestrator-synthesis",
			exitCode: 1,
			output: "",
			stderr: "",
			toolCount: 0,
			turnCount: 0,
			error: error instanceof Error ? error.message : String(error),
		};
	}

	const failedAgents = run.agents.filter((agent) => agent.status === "failed").length;
	const finalText = synthesis.output || synthesis.error || "(orchestrator produced no synthesis)";
	fs.writeFileSync(path.join(runDir, "final-synthesis.md"), finalText, "utf-8");
	run.status = synthesis.error ? "failed" : "completed";
	run.orchestratorStatus = synthesis.error ? "failed" : "completed";
	run.currentPhase = undefined;
	run.endedAt = Date.now();
	run.synthesisPreview = preview(finalText, 700);
	if (synthesis.error) run.error = synthesis.error;
	emit("Dynamic fleet complete.");

	const footer = [
		`\n---`,
		`Dynamic fleet: ${run.agents.filter((a) => a.status === "completed").length}/${run.agents.length} agents completed${failedAgents ? `, ${failedAgents} failed` : ""}.`,
		`Run artifacts: ${runDir}`,
	].join("\n");

	return {
		content: [{ type: "text", text: `${finalText.trim()}${footer}` }],
		details: detailsSnapshot(run),
		...(synthesis.error ? { isError: true } : {}),
	};
}

const PARENT_INSTRUCTIONS = `

# Dynamic Fleet Delegation

For every user prompt, first decide silently whether the work is small enough to handle directly or likely to benefit from a dynamic fleet.

Proceed normally without delegation for small/fast work: simple questions, tiny edits, obvious one-file fixes, formatting, command lookups, or anything where subagents would add overhead.

Use the \`${TOOL_NAME}\` tool when the prompt is complex, high-risk, multi-file, research-heavy, benefits from independent review, has unclear architecture tradeoffs, or can be decomposed into parallel investigation/implementation/validation. Pass a complete task brief including the user's goal, constraints, relevant files, and expected final output.

The tool will create a temporary \`orchestrator\` subagent. The orchestrator dynamically invents task-specific subagents and phases; do not preselect fixed roles yourself. After the tool returns, use its synthesized answer as the basis for your response.

Do not call \`${TOOL_NAME}\` just to look busy. If delegation is not clearly useful, solve the task directly.`;

export default function dynamicFleetExtension(pi: ExtensionAPI) {
	// Child Pi processes launched by this extension should not recursively expose
	// the parent orchestration tool or inject parent-only routing instructions, but
	// they still install permission guards for write-scoped subagents.
	if (process.env[CHILD_ENV]) {
		registerChildPermissionGuard(pi);
		return;
	}

	pi.on("before_agent_start", (event) => {
		if (process.env[CHILD_ENV]) return undefined;
		return { systemPrompt: `${event.systemPrompt}${PARENT_INSTRUCTIONS}` };
	});

	pi.registerTool({
		name: TOOL_NAME,
		label: "Dynamic Fleet",
		description: `Dynamically delegate complex work. Use only after deciding the user task is worth subagents. This creates a temporary orchestrator subagent which designs task-specific ephemeral subagents, may assign multiple path-scoped writers, runs them, and synthesizes the answer. Do NOT use for small or fast tasks. No predefined roles are used.`,
		parameters: FleetParams,

		execute(_toolCallId, params, signal, onUpdate, ctx) {
			return runDynamicFleet(params, signal, onUpdate, ctx);
		},

		renderCall(args, theme) {
			const rawTask = typeof args.task === "string" ? args.task.replace(/\s+/g, " ").trim() : "";
			const task = rawTask.length > 80 ? `${rawTask.slice(0, 77)}…` : rawTask;
			return new Text(`${theme.fg("toolTitle", theme.bold("dynamic_fleet "))}${theme.fg("accent", task || "orchestrate")}`, 0, 0);
		},

		renderResult(result, options, theme) {
			return renderFleetDetails(result, options, theme);
		},
	});

	pi.registerCommand("fleet", {
		description: "Ask Pi to use the dynamic fleet for a task: /fleet <task>",
		handler: async (args, _ctx) => {
			const task = args.trim();
			if (!task) {
				pi.sendMessage({ customType: "dynamic-fleet-info", content: "Usage: /fleet <task>", display: true });
				return;
			}
			pi.sendUserMessage(`Use ${TOOL_NAME} for this task:\n\n${task}`);
		},
	});

	pi.registerMessageRenderer("dynamic-fleet-info", (message, _options, theme) => {
		const content = typeof message.content === "string" ? message.content : "dynamic fleet";
		return new Text(theme.fg("muted", content), 0, 0);
	});
}
