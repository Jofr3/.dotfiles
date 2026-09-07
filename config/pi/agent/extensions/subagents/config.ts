import * as fs from "node:fs";
import * as path from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

export type ResourceMode = "lean" | "inherit";

export interface SubagentDefaults {
	concurrency: number;
	maxTasks: number;
	timeoutSeconds: number;
	outputLimit: number;
	totalOutputLimit: number;
	thinking: ThinkingLevel;
	fast: boolean;
	resources: ResourceMode;
}

export interface SubagentConfig {
	aliases: Record<string, string>;
	defaults: SubagentDefaults;
	loadedPaths: string[];
	notices: string[];
}

const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const RESOURCE_MODES = new Set<ResourceMode>(["lean", "inherit"]);

const BUILTIN_ALIASES: Record<string, string> = {
	luna: "openai-codex/gpt-5.6-luna",
	terra: "openai-codex/gpt-5.6-terra",
	sol: "openai-codex/gpt-5.6-sol",
	astra: "openai-codex/gpt-6-astra",
};

const BUILTIN_DEFAULTS: SubagentDefaults = {
	concurrency: 6,
	maxTasks: 12,
	timeoutSeconds: 900,
	outputLimit: 6000,
	totalOutputLimit: 30000,
	thinking: "medium",
	fast: true,
	resources: "lean",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(min, Math.min(max, Math.floor(value)))
		: fallback;
}

function findNearestProjectConfig(cwd: string): string | null {
	let current: string;
	try {
		current = fs.realpathSync(cwd);
	} catch {
		current = path.resolve(cwd);
	}
	while (true) {
		const candidate = path.join(current, CONFIG_DIR_NAME, "subagents.json");
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function mergeConfigFile(config: SubagentConfig, filePath: string): void {
	let raw: unknown;
	try {
		raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch (error) {
		config.notices.push(`Could not load ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
		return;
	}
	if (!isRecord(raw)) {
		config.notices.push(`Ignored ${filePath}: root must be an object.`);
		return;
	}

	if (isRecord(raw.aliases)) {
		for (const [name, model] of Object.entries(raw.aliases)) {
			if (typeof model === "string" && name.trim() && model.trim()) config.aliases[name.trim()] = model.trim();
		}
	}

	if (isRecord(raw.defaults)) {
		const thinking = typeof raw.defaults.thinking === "string" && THINKING_LEVELS.has(raw.defaults.thinking as ThinkingLevel)
			? (raw.defaults.thinking as ThinkingLevel)
			: config.defaults.thinking;
		const resources = typeof raw.defaults.resources === "string" && RESOURCE_MODES.has(raw.defaults.resources as ResourceMode)
			? (raw.defaults.resources as ResourceMode)
			: config.defaults.resources;
		config.defaults = {
			concurrency: clampInteger(raw.defaults.concurrency, config.defaults.concurrency, 1, 8),
			maxTasks: clampInteger(raw.defaults.maxTasks, config.defaults.maxTasks, 1, 12),
			timeoutSeconds: clampInteger(raw.defaults.timeoutSeconds, config.defaults.timeoutSeconds, 10, 3600),
			outputLimit: clampInteger(raw.defaults.outputLimit, config.defaults.outputLimit, 1000, 20000),
			totalOutputLimit: clampInteger(raw.defaults.totalOutputLimit, config.defaults.totalOutputLimit, 4000, 50000),
			thinking,
			fast: typeof raw.defaults.fast === "boolean" ? raw.defaults.fast : config.defaults.fast,
			resources,
		};
	}

	config.loadedPaths.push(filePath);
}

export function loadSubagentConfig(cwd: string, projectTrusted: boolean): SubagentConfig {
	const config: SubagentConfig = {
		aliases: Object.assign(Object.create(null) as Record<string, string>, BUILTIN_ALIASES),
		defaults: { ...BUILTIN_DEFAULTS },
		loadedPaths: [],
		notices: [],
	};

	const globalPath = path.join(getAgentDir(), "subagents.json");
	if (fs.existsSync(globalPath)) mergeConfigFile(config, globalPath);

	const projectPath = findNearestProjectConfig(cwd);
	if (projectPath && projectTrusted) mergeConfigFile(config, projectPath);
	else if (projectPath) config.notices.push(`Skipped untrusted project config: ${projectPath}`);

	return config;
}

export function resolveModelAlias(model: string, aliases: Record<string, string>, inheritedModel?: string): string | undefined {
	let current = model.trim();
	if (!current) return undefined;
	const seen = new Set<string>();
	while (true) {
		if (current === "inherit") return inheritedModel?.trim() || undefined;
		if (seen.has(current)) return undefined;
		if (!Object.prototype.hasOwnProperty.call(aliases, current)) return current;
		const next = aliases[current];
		if (typeof next !== "string") return undefined;
		seen.add(current);
		current = next.trim();
		if (!current) return undefined;
	}
}
