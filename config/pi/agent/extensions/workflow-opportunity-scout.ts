/**
 * Workflow Opportunity Scout
 *
 * Auto-loaded pi extension that watches your agent sessions for repeated work,
 * friction, and automation opportunities, then suggests creating new skills or
 * extensions that would improve your workflow. It is intentionally
 * non-destructive: it writes telemetry/reports and only queues creation work
 * when you accept a prompt.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { lstat, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

const HOME = homedir();
const PI_AGENT_DIR = join(HOME, ".pi", "agent");
const STORE_DIR = join(PI_AGENT_DIR, "workflow-opportunity-scout");
const CONFIG_PATH = join(STORE_DIR, "config.json");
const METRICS_PATH = join(STORE_DIR, "metrics.json");
const REPORT_PATH = join(STORE_DIR, "report.md");
const MAX_REPORT_CHARS = 45_000;

const DEFAULT_CONFIG: ScoutConfig = {
	startupReport: true,
	notifyOnStartup: false,
	continuousMonitoring: true,
	monitorTurnInterval: 1,
	minPromptIntervalMs: 20 * 60_000,
	maxPromptsPerSession: 3,
	showPromptWidget: true,
	suggestSkills: true,
	suggestExtensions: true,
	suggestProjectContext: true,
	minSignalsForSkillSuggestion: 3,
	minSignalsForExtensionSuggestion: 2,
	minBashRepeatsForExtension: 3,
	minToolSequenceRepeats: 3,
	minToolProblemSignals: 4,
	minConfidenceToPrompt: 0.58,
	snoozeMs: 24 * 60 * 60_000,
	storePromptSamples: true,
	maxEvidenceItems: 6,
};

const SKIP_DIRS = new Set([
	".git",
	".hg",
	".svn",
	"node_modules",
	"dist",
	"build",
	".next",
	".cache",
	"coverage",
]);

const GENERIC_BASH_COMMANDS = [
	/^pwd$/,
	/^ls\b/,
	/^find\b/,
	/^rg\b/,
	/^grep\b/,
	/^sed\b/,
	/^awk\b/,
	/^cat\b/,
	/^head\b/,
	/^tail\b/,
	/^wc\b/,
	/^realpath\b/,
	/^git\s+status\b/,
	/^git\s+diff\b/,
];

type ResourceKind = "skill" | "extension" | "context";
type SuggestionKind = "skill" | "extension" | "project-context";
type Severity = "info" | "medium" | "high";

interface ScoutConfig {
	startupReport: boolean;
	notifyOnStartup: boolean;
	continuousMonitoring: boolean;
	monitorTurnInterval: number;
	minPromptIntervalMs: number;
	maxPromptsPerSession: number;
	showPromptWidget: boolean;
	suggestSkills: boolean;
	suggestExtensions: boolean;
	suggestProjectContext: boolean;
	minSignalsForSkillSuggestion: number;
	minSignalsForExtensionSuggestion: number;
	minBashRepeatsForExtension: number;
	minToolSequenceRepeats: number;
	minToolProblemSignals: number;
	minConfidenceToPrompt: number;
	snoozeMs: number;
	storePromptSamples: boolean;
	maxEvidenceItems: number;
}

interface ResourceSummary {
	kind: ResourceKind;
	name: string;
	path: string;
	description?: string;
}

interface TaskPatternDefinition {
	key: string;
	kind: SuggestionKind;
	title: string;
	proposedName: string;
	rationale: string;
	action: string;
	regexes: RegExp[];
	cwdRegexes?: RegExp[];
	minSignals?: number;
	baseConfidence?: number;
	skipIfResources?: string[];
	tags: string[];
}

interface PromptPatternMetric {
	key: string;
	kind: SuggestionKind;
	title: string;
	proposedName: string;
	rationale: string;
	action: string;
	tags: string[];
	count: number;
	firstSeenAt: string;
	lastSeenAt: string;
	averageConfidence: number;
	maxConfidence: number;
	cwdSamples: string[];
	examples: string[];
	minSignals: number;
	skipIfResources?: string[];
}

interface BashCommandMetric {
	key: string;
	commandKey: string;
	count: number;
	errors: number;
	totalMs: number;
	maxMs: number;
	firstSeenAt: string;
	lastSeenAt: string;
	cwdSamples: string[];
	examples: string[];
}

interface ToolSequenceMetric {
	key: string;
	sequence: string[];
	count: number;
	firstSeenAt: string;
	lastSeenAt: string;
	cwdSamples: string[];
	examples: string[];
}

interface ToolProblemMetric {
	key: string;
	toolName: string;
	problemType: "error" | "slow";
	count: number;
	firstSeenAt: string;
	lastSeenAt: string;
	lastMessage?: string;
	cwdSamples: string[];
	examples: string[];
}

interface SuggestionState {
	key: string;
	status: "seen" | "queued" | "snoozed" | "dismissed";
	firstSuggestedAt: string;
	lastSuggestedAt: string;
	timesShown: number;
	snoozedUntil?: string;
	queuedAt?: string;
}

interface MetricsStore {
	version: 1;
	createdAt: string;
	updatedAt: string;
	promptPatterns: Record<string, PromptPatternMetric>;
	bashCommands: Record<string, BashCommandMetric>;
	toolSequences: Record<string, ToolSequenceMetric>;
	toolProblems: Record<string, ToolProblemMetric>;
	suggestions: Record<string, SuggestionState>;
}

interface WorkflowSuggestion {
	key: string;
	kind: SuggestionKind;
	severity: Severity;
	title: string;
	proposedName: string;
	rationale: string;
	action: string;
	evidence: string[];
	confidence: number;
	source: "prompt-pattern" | "bash-command" | "tool-sequence" | "tool-problem";
	count: number;
}

interface ToolStart {
	toolName: string;
	startedAt: number;
}

interface PendingBashCall {
	command: string;
	commandKey: string;
}

interface CurrentRun {
	startedAt: number;
	promptSnippet?: string;
	tools: string[];
	bashCommandKeys: string[];
}

const TASK_PATTERNS: TaskPatternDefinition[] = [
	{
		key: "pi-skill-extension-authoring",
		kind: "skill",
		title: "Pi skill/extension authoring playbook",
		proposedName: "pi-skill-extension-authoring",
		rationale: "You are repeatedly asking Pi to create, modify, or reason about skills/extensions. A dedicated skill can capture the docs to read, file locations, testing steps, and safety rules.",
		action: "Create a global skill with a concise authoring checklist for Pi skills/extensions, including docs to read, common extension APIs, validation steps, and when to prefer a skill vs an extension.",
		regexes: [
			/\bpi\b[\s\S]{0,100}\b(skill|skills|extension|extensions|tool|tools|command|commands|provider|tui)\b/i,
			/\b(skill|skills|extension|extensions)\b[\s\S]{0,100}\b(create|build|write|improve|suggest|workflow|author)\b/i,
			/\bExtensionAPI\b|\bregisterTool\b|\bregisterCommand\b|agent\/extensions|agent\/skills/i,
		],
		cwdRegexes: [/\.dotfiles\/config\/pi\b/, /\.pi\/agent\b/],
		minSignals: 2,
		baseConfidence: 0.48,
		tags: ["pi", "skills", "extensions"],
	},
	{
		key: "nix-dotfiles-workflow",
		kind: "skill",
		title: "NixOS/Home Manager dotfiles workflow",
		proposedName: "nix-dotfiles-workflow",
		rationale: "Nix and dotfiles changes tend to have repo-specific conventions, rebuild commands, host-specific differences, and theming caveats that are worth loading on demand.",
		action: "Create a project or global skill documenting your NixOS flake layout, rebuild commands, machine differences, Stylix/theming workflow, and safe validation steps.",
		regexes: [
			/\bnixos\b|\bhome-manager\b|\bnix\s+flake\b|\bnixfmt\b|\bnixos-rebuild\b/i,
			/\bflake\.nix\b|\bflakes?\b[\s\S]{0,80}\b(nix|nixos|home-manager)\b/i,
			/\bhyprland\b|\bstylix\b|\bbase16\b|\brose-pine\b/i,
		],
		cwdRegexes: [/\.dotfiles\/config\/nix\b/, /\.dotfiles\b/],
		minSignals: 3,
		baseConfidence: 0.42,
		tags: ["nix", "dotfiles", "home-manager"],
	},
	{
		key: "neovim-dotfiles-workflow",
		kind: "skill",
		title: "Neovim configuration workflow",
		proposedName: "neovim-config-workflow",
		rationale: "Neovim plugin/configuration work benefits from a compact playbook for your lazy.nvim layout, plugin conventions, formatter choices, and validation commands.",
		action: "Create a skill for editing your Neovim config: module layout, plugin file conventions, lazy.nvim operations, formatting, and smoke-test commands.",
		regexes: [
			/\bnvim\b|\bneovim\b|\blazy\.nvim\b|\blua\/plugins\b/i,
			/\bsnacks\.nvim\b|\bblink\.cmp\b|\btreesitter\b|\blspconfig\b/i,
		],
		cwdRegexes: [/\.dotfiles\/config\/nvim\b/],
		minSignals: 3,
		baseConfidence: 0.42,
		tags: ["neovim", "dotfiles"],
	},
	{
		key: "launcher-scripts-workflow",
		kind: "skill",
		title: "Launcher scripts and JSON menu workflow",
		proposedName: "launcher-scripts-workflow",
		rationale: "Your launcher scripts use repo-specific JSON files and Hyprland bindings; repeated edits are good candidates for a small skill with examples and gotchas.",
		action: "Create a skill covering apps/bookmarks/password launcher JSON schema, script conventions, Hyprland keybindings, and safe handling of private password files.",
		regexes: [
			/\bapps-launcher\b|\bbookmarks-launcher\b|\bpasswords-launcher\b|\bclipboard\b/i,
			/\bapps\.json\b|\bbookmarks\.json\b|\bpasswords\.json\b|\bwofi\b|\brofi\b/i,
		],
		cwdRegexes: [/\.dotfiles\/scripts\b/],
		minSignals: 3,
		baseConfidence: 0.44,
		tags: ["launchers", "dotfiles"],
	},
	{
		key: "workflow-automation-command",
		kind: "extension",
		title: "Personal automation slash commands",
		proposedName: "personal-workflow-commands",
		rationale: "Repeated requests to automate recurring work usually pay off as Pi slash commands or custom tools with validation and status UI.",
		action: "Create a global extension that adds slash command(s) or tool(s) for the recurring workflow, with clear prompts, validation, output truncation, and status messages.",
		regexes: [
			/\b(automate|automation|shortcut|slash command|custom command|custom tool|every time|always do|repeatedly|again and again)\b/i,
			/\bmake (this|it) easier\b|\bsave me time\b|\bimprove my workflow\b/i,
		],
		minSignals: 2,
		baseConfidence: 0.5,
		tags: ["automation", "extension"],
	},
	{
		key: "project-runtime-context",
		kind: "project-context",
		title: "Project runtime and dev-server context",
		proposedName: "project-runtime-context",
		rationale: "Repeated runtime/server friction usually means Pi is missing stable project context: how the app is normally run, which terminal/container owns the dev server, URLs/ports, and when the agent should avoid launching duplicate processes.",
		action: "Update project context (AGENTS.md/CLAUDE.md) or create a project skill with dev-server ownership, URLs/ports, health checks, log locations, start/stop policy, and validation commands. Capture durable project facts instead of fixing only the current session.",
		regexes: [
			/\b(dev server|development server|local server|localhost:\d+|port \d+|EADDRINUSE|address already in use|already running|different terminal)\b/i,
			/\b(npm|pnpm|yarn|bun)\s+(?:run\s+)?(dev|start|serve|preview)\b/i,
			/\b(vite|next\s+dev|nuxt|astro|webpack-dev-server)\b/i,
		],
		minSignals: 2,
		baseConfidence: 0.52,
		tags: ["project-context", "runtime", "dev-server"],
	},
	{
		key: "browser-ui-workflow",
		kind: "skill",
		title: "Browser/UI testing workflow",
		proposedName: "browser-ui-testing-workflow",
		rationale: "Frequent browser automation can benefit from a project-specific skill that captures URLs, login hints, visual QA expectations, and when to use screenshots vs accessibility snapshots.",
		action: "Create a skill with your browser-testing conventions, target app URLs, login/auth workflow, screenshot expectations, and agent-browser command patterns.",
		regexes: [/\bbrowser\b|\bscreenshot\b|\bclick\b|\bfill\b|\bwebsite\b|\bweb app\b|\bui\b|\blogin\b/i],
		skipIfResources: ["agent-browser"],
		minSignals: 4,
		baseConfidence: 0.35,
		tags: ["browser", "ui"],
	},
	{
		key: "database-workflow",
		kind: "skill",
		title: "Database inspection/change workflow",
		proposedName: "database-change-workflow",
		rationale: "Database work often needs project-specific safety rules, schema conventions, backup expectations, and dialect reminders.",
		action: "Create a skill with database safety rules, schema-inspection queries, migration conventions, and when to request confirmation for destructive statements.",
		regexes: [/\bdatabase\b|\bsql\b|\bquery\b|\bmysql\b|\bmariadb\b|\bsql server\b|\bmssql\b/i],
		skipIfResources: ["database"],
		minSignals: 4,
		baseConfidence: 0.35,
		tags: ["database"],
	},
	{
		key: "release-git-workflow",
		kind: "extension",
		title: "Release/commit automation workflow",
		proposedName: "release-ship-workflow",
		rationale: "Repeated commit, push, merge, or release chores are usually best encoded as a command extension with guardrails.",
		action: "Create or extend a Pi extension for your release workflow: branch checks, generated commit messages, staging/main merge policy, and push confirmations.",
		regexes: [/\bcommit\b|\bpush\b|\bmerge\b|\brelease\b|\bship\b|\bstaging\b|\bmain\b/i],
		skipIfResources: ["push"],
		minSignals: 4,
		baseConfidence: 0.35,
		tags: ["git", "release"],
	},
	{
		key: "project-debugging-playbook",
		kind: "skill",
		title: "Project-specific debugging playbook",
		proposedName: "project-debugging-playbook",
		rationale: "Repeated debugging requests benefit from a skill that captures the project test commands, log locations, tracing strategy, and known failure modes.",
		action: "Create a project skill with debug workflow, test commands, common error sources, and when to use code graph/search tools.",
		regexes: [/\bdebug\b|\bfailing\b|\bfails\b|\berror\b|\bstack trace\b|\bwhy is\b[\s\S]{0,80}\bfail/i],
		skipIfResources: ["gitnexus-debugging"],
		minSignals: 5,
		baseConfidence: 0.34,
		tags: ["debugging"],
	},
];

function ensureStoreDir(): void {
	mkdirSync(STORE_DIR, { recursive: true });
}

function nowIso(): string {
	return new Date().toISOString();
}

function readJson<T>(path: string, fallback: T): T {
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as T;
	} catch {
		return fallback;
	}
}

function writeJson(path: string, value: unknown): void {
	ensureStoreDir();
	writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function loadConfig(): ScoutConfig {
	return { ...DEFAULT_CONFIG, ...readJson<Partial<ScoutConfig>>(CONFIG_PATH, {}) };
}

function createEmptyMetrics(): MetricsStore {
	const now = nowIso();
	return {
		version: 1,
		createdAt: now,
		updatedAt: now,
		promptPatterns: {},
		bashCommands: {},
		toolSequences: {},
		toolProblems: {},
		suggestions: {},
	};
}

function loadMetrics(): MetricsStore {
	const fallback = createEmptyMetrics();
	const loaded = readJson<Partial<MetricsStore>>(METRICS_PATH, {});
	return {
		...fallback,
		...loaded,
		version: 1,
		createdAt: typeof loaded.createdAt === "string" ? loaded.createdAt : fallback.createdAt,
		updatedAt: typeof loaded.updatedAt === "string" ? loaded.updatedAt : fallback.updatedAt,
		promptPatterns: loaded.promptPatterns ?? {},
		bashCommands: loaded.bashCommands ?? {},
		toolSequences: loaded.toolSequences ?? {},
		toolProblems: loaded.toolProblems ?? {},
		suggestions: loaded.suggestions ?? {},
	};
}

function saveMetrics(metrics: MetricsStore): void {
	metrics.updatedAt = nowIso();
	writeJson(METRICS_PATH, metrics);
}

function truncate(text: string, max = MAX_REPORT_CHARS): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n\n[Report truncated at ${max} characters. Full report: ${REPORT_PATH}]`;
}

function formatDuration(ms: number): string {
	if (!Number.isFinite(ms)) return "n/a";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelative(path: string, cwd: string): string {
	if (!path.startsWith("/")) return path;
	const rel = relative(cwd, path);
	return rel && !rel.startsWith("..") ? rel : path.replace(HOME, "~");
}

function projectRootFromCwd(cwd: string): string {
	let current = resolve(cwd);
	let nearestPackageRoot: string | undefined;
	while (true) {
		if (existsSync(join(current, ".git"))) return current;
		if (!nearestPackageRoot && existsSync(join(current, "package.json"))) nearestPackageRoot = current;
		const parent = dirname(current);
		if (parent === current) return nearestPackageRoot ?? resolve(cwd);
		current = parent;
	}
}

function suggestionKindLabel(kind: SuggestionKind): string {
	if (kind === "project-context") return "project context update";
	return kind;
}

function suggestionIcon(kind: SuggestionKind): string {
	if (kind === "skill") return "📘";
	if (kind === "extension") return "🧩";
	return "🗺️";
}

function slugify(input: string, fallback = "workflow"): string {
	const slug = input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 64)
		.replace(/-$/g, "");
	return slug || fallback;
}

function normalizeName(input: string): string {
	return input.trim().replace(/^['"]|['"]$/g, "");
}

function parseFrontmatter(text: string): { frontmatter: Record<string, string | boolean>; body: string } {
	if (!text.startsWith("---")) return { frontmatter: {}, body: text };
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { frontmatter: {}, body: text };
	const frontmatter: Record<string, string | boolean> = {};
	for (const line of (match[1] ?? "").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const colon = trimmed.indexOf(":");
		if (colon === -1) continue;
		const key = trimmed.slice(0, colon).trim();
		const rawValue = trimmed.slice(colon + 1).trim();
		if (rawValue === "true") frontmatter[key] = true;
		else if (rawValue === "false") frontmatter[key] = false;
		else frontmatter[key] = normalizeName(rawValue);
	}
	return { frontmatter, body: text.slice(match[0].length) };
}

function redact(text: string): string {
	return text
		.replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, "[redacted private key]")
		.replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[redacted]")
		.replace(/\b(sk-[A-Za-z0-9_-]{16,})\b/g, "sk-[redacted]")
		.replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret)(\s*[:=]\s*)(['\"]?)[^'\"\s]+/gi, "$1$2$3[redacted]")
		.replace(/[A-Za-z0-9+/]{80,}={0,2}/g, "[redacted-long-token]");
}

function clipEvidence(text: string, max = 280): string {
	const clipped = redact(text).replace(/\s+/g, " ").trim();
	return clipped.length <= max ? clipped : `${clipped.slice(0, max - 1)}…`;
}

function pushBoundedUnique(items: string[], value: string, max: number): void {
	const clean = clipEvidence(value);
	if (!clean || items.includes(clean)) return;
	items.push(clean);
	while (items.length > max) items.shift();
}

function pushCwdSample(items: string[], cwd: string, max = 5): void {
	const clean = cwd.replace(HOME, "~");
	if (!items.includes(clean)) items.push(clean);
	while (items.length > max) items.shift();
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

function getAncestorDirs(cwd: string): string[] {
	const dirs: string[] = [];
	let current = resolve(cwd);
	while (true) {
		dirs.push(current);
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return dirs;
}

async function discoverExtensionsInDir(dir: string): Promise<ResourceSummary[]> {
	const resources: ResourceSummary[] = [];
	if (!(await pathExists(dir))) return resources;

	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return resources;
	}

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isFile() && [".ts", ".js", ".mjs", ".cjs"].includes(extname(entry.name))) {
			resources.push({ kind: "extension", name: basename(entry.name, extname(entry.name)), path: fullPath });
		} else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
			for (const indexName of ["index.ts", "index.js", "index.mjs", "index.cjs"]) {
				const indexPath = join(fullPath, indexName);
				if (await pathExists(indexPath)) {
					resources.push({ kind: "extension", name: entry.name, path: indexPath });
					break;
				}
			}
		}
	}

	return resources;
}

async function maybeAddSkill(resources: ResourceSummary[], path: string, fallbackName: string): Promise<void> {
	try {
		const fileStat = await stat(path);
		if (!fileStat.isFile()) return;
		const text = await readFile(path, "utf-8");
		const { frontmatter } = parseFrontmatter(text);
		const name = typeof frontmatter.name === "string" ? frontmatter.name : fallbackName;
		const description = typeof frontmatter.description === "string" ? frontmatter.description : undefined;
		resources.push({ kind: "skill", name, path, description });
	} catch {
		// Ignore unreadable skills during discovery; the improver extension audits them separately.
	}
}

async function walkSkillDir(dir: string, includeRootMarkdown: boolean, root = dir): Promise<ResourceSummary[]> {
	const resources: ResourceSummary[] = [];
	if (!(await pathExists(dir))) return resources;

	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return resources;
	}

	const skillFile = join(dir, "SKILL.md");
	if (await pathExists(skillFile)) {
		await maybeAddSkill(resources, skillFile, basename(dir));
		return resources;
	}

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isFile()) {
			if (includeRootMarkdown && dir === root && entry.name.endsWith(".md")) {
				await maybeAddSkill(resources, fullPath, basename(entry.name, ".md"));
			}
			continue;
		}

		if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
		try {
			const linkStat = await lstat(fullPath);
			if (linkStat.isSymbolicLink()) continue;
		} catch {
			continue;
		}
		resources.push(...(await walkSkillDir(fullPath, includeRootMarkdown, root)));
	}

	return resources;
}

async function discoverContextFiles(cwd: string): Promise<ResourceSummary[]> {
	const resources: ResourceSummary[] = [];
	for (const ancestor of getAncestorDirs(cwd)) {
		for (const name of ["AGENTS.md", "CLAUDE.md"]) {
			const path = join(ancestor, name);
			if (await pathExists(path)) resources.push({ kind: "context", name, path });
		}
	}
	return resources;
}

async function discoverResources(cwd: string): Promise<ResourceSummary[]> {
	const resources: ResourceSummary[] = [];
	resources.push(...(await discoverContextFiles(cwd)));
	resources.push(...(await discoverExtensionsInDir(join(PI_AGENT_DIR, "extensions"))));
	resources.push(...(await walkSkillDir(join(PI_AGENT_DIR, "skills"), true)));
	resources.push(...(await walkSkillDir(join(HOME, ".agents", "skills"), false)));

	for (const ancestor of getAncestorDirs(cwd)) {
		resources.push(...(await discoverExtensionsInDir(join(ancestor, ".pi", "extensions"))));
		resources.push(...(await walkSkillDir(join(ancestor, ".pi", "skills"), true)));
		resources.push(...(await walkSkillDir(join(ancestor, ".agents", "skills"), false)));
	}

	const seen = new Set<string>();
	return resources
		.filter((resource) => {
			if (seen.has(resource.path)) return false;
			seen.add(resource.path);
			return true;
		})
		.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

function resourceExists(name: string, resources: ResourceSummary[], aliases: string[] = []): boolean {
	const normalized = new Set([slugify(name), ...aliases.map((alias) => slugify(alias))]);
	return resources.some((resource) => normalized.has(slugify(resource.name)));
}

function isSuggestionEnabled(kind: SuggestionKind, config: ScoutConfig): boolean {
	if (kind === "skill") return config.suggestSkills;
	if (kind === "extension") return config.suggestExtensions;
	return config.suggestProjectContext;
}

function patternMatched(pattern: TaskPatternDefinition, text: string, cwd: string): { matched: boolean; confidence: number } {
	const textMatches = pattern.regexes.filter((regex) => regex.test(text)).length;
	const cwdMatches = pattern.cwdRegexes?.filter((regex) => regex.test(cwd)).length ?? 0;
	if (textMatches === 0 && cwdMatches === 0) return { matched: false, confidence: 0 };
	const base = pattern.baseConfidence ?? 0.4;
	const confidence = Math.min(0.96, base + textMatches * 0.12 + cwdMatches * 0.08);
	return { matched: true, confidence };
}

function minSignalsForPattern(pattern: TaskPatternDefinition, config: ScoutConfig): number {
	if (pattern.minSignals) return pattern.minSignals;
	if (pattern.kind === "skill") return config.minSignalsForSkillSuggestion;
	if (pattern.kind === "extension") return config.minSignalsForExtensionSuggestion;
	return Math.max(2, Math.min(config.minSignalsForSkillSuggestion, config.minSignalsForExtensionSuggestion));
}

function updatePromptPattern(metrics: MetricsStore, pattern: TaskPatternDefinition, text: string, cwd: string, confidence: number, config: ScoutConfig): void {
	const now = nowIso();
	const current = metrics.promptPatterns[pattern.key] ?? {
		key: pattern.key,
		kind: pattern.kind,
		title: pattern.title,
		proposedName: pattern.proposedName,
		rationale: pattern.rationale,
		action: pattern.action,
		tags: pattern.tags,
		count: 0,
		firstSeenAt: now,
		lastSeenAt: now,
		averageConfidence: 0,
		maxConfidence: 0,
		cwdSamples: [],
		examples: [],
		minSignals: minSignalsForPattern(pattern, config),
		skipIfResources: pattern.skipIfResources,
	};

	const count = current.count + 1;
	metrics.promptPatterns[pattern.key] = {
		...current,
		count,
		lastSeenAt: now,
		averageConfidence: ((current.averageConfidence * current.count) + confidence) / count,
		maxConfidence: Math.max(current.maxConfidence, confidence),
		minSignals: minSignalsForPattern(pattern, config),
	};
	pushCwdSample(metrics.promptPatterns[pattern.key]!.cwdSamples, cwd);
	if (config.storePromptSamples) pushBoundedUnique(metrics.promptPatterns[pattern.key]!.examples, text, config.maxEvidenceItems);
}

function normalizeBashCommand(command: string): string | undefined {
	const firstLine = command
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line && !line.startsWith("#"));
	if (!firstLine) return undefined;

	let normalized = firstLine
		.replace(/^sudo\s+/, "")
		.replace(/\s+/g, " ")
		.trim();

	if (GENERIC_BASH_COMMANDS.some((pattern) => pattern.test(normalized))) return undefined;
	if (/\bnixos-rebuild\s+switch\b/.test(normalized)) return "nixos-rebuild switch";
	if (/\bhome-manager\s+switch\b/.test(normalized)) return "home-manager switch";
	if (/\bnix\s+flake\s+update\b/.test(normalized)) return "nix flake update";
	if (/\bnixfmt\b/.test(normalized)) return "nixfmt";
	if (/\b(git)\s+(commit|push|merge|rebase|checkout|switch)\b/.test(normalized)) {
		return normalized.match(/\bgit\s+(commit|push|merge|rebase|checkout|switch)\b/)?.[0];
	}
	const devServerMatch = normalized.match(/\b(npm|pnpm|yarn|bun)\s+(?:run\s+)?(dev|start|serve|preview)\b/);
	if (devServerMatch?.[0]) return devServerMatch[0];
	if (/\b(vite|next\s+dev|nuxt\s+dev|astro\s+dev)\b/.test(normalized)) {
		return normalized.match(/\b(vite|next\s+dev|nuxt\s+dev|astro\s+dev)\b/)?.[0];
	}
	if (/\b(npm|pnpm|yarn|bun)\s+(test|run|build|lint|format|check)\b/.test(normalized)) {
		return normalized.match(/\b(npm|pnpm|yarn|bun)\s+(test|run|build|lint|format|check)\b/)?.[0];
	}
	if (/\b(cargo|go)\s+(test|build|check|fmt)\b/.test(normalized)) {
		return normalized.match(/\b(cargo|go)\s+(test|build|check|fmt)\b/)?.[0];
	}
	if (/\b(pytest|ruff|mypy|tsc|eslint|prettier)\b/.test(normalized)) {
		return normalized.match(/\b(pytest|ruff|mypy|tsc|eslint|prettier)\b/)?.[0];
	}

	const tokens = normalized.split(/\s+/).slice(0, 3);
	if (tokens.length === 0) return undefined;
	if (tokens[0] && ["python", "python3", "node", "bun", "deno"].includes(tokens[0]) && tokens[1]) {
		tokens[1] = tokens[1].replace(/^.*\//, "<script>/");
	}
	normalized = tokens.join(" ");
	return normalized.length >= 3 ? normalized : undefined;
}

function updateBashMetric(metrics: MetricsStore, command: string, commandKey: string, cwd: string, durationMs: number, isError: boolean, config: ScoutConfig): void {
	const now = nowIso();
	const key = slugify(commandKey);
	const current = metrics.bashCommands[key] ?? {
		key,
		commandKey,
		count: 0,
		errors: 0,
		totalMs: 0,
		maxMs: 0,
		firstSeenAt: now,
		lastSeenAt: now,
		cwdSamples: [],
		examples: [],
	};
	metrics.bashCommands[key] = {
		...current,
		count: current.count + 1,
		errors: current.errors + (isError ? 1 : 0),
		totalMs: current.totalMs + durationMs,
		maxMs: Math.max(current.maxMs, durationMs),
		lastSeenAt: now,
	};
	pushCwdSample(metrics.bashCommands[key]!.cwdSamples, cwd);
	pushBoundedUnique(metrics.bashCommands[key]!.examples, command, config.maxEvidenceItems);
}

function sequenceKeyForRun(run: CurrentRun): string | undefined {
	const significant = run.tools
		.map((tool) => tool === "bash" && run.bashCommandKeys.length > 0 ? `bash:${run.bashCommandKeys[0]}` : tool)
		.filter((tool) => !["read", "edit", "write", "ls", "grep", "find"].includes(tool));
	const deduped = significant.filter((tool, index) => index === 0 || tool !== significant[index - 1]);
	if (deduped.length < 2) return undefined;
	return deduped.slice(0, 6).join(" > ");
}

function updateToolSequenceMetric(metrics: MetricsStore, run: CurrentRun, cwd: string, config: ScoutConfig): void {
	const sequenceKey = sequenceKeyForRun(run);
	if (!sequenceKey) return;
	const now = nowIso();
	const key = slugify(sequenceKey);
	const current = metrics.toolSequences[key] ?? {
		key,
		sequence: sequenceKey.split(" > "),
		count: 0,
		firstSeenAt: now,
		lastSeenAt: now,
		cwdSamples: [],
		examples: [],
	};
	metrics.toolSequences[key] = {
		...current,
		count: current.count + 1,
		lastSeenAt: now,
	};
	pushCwdSample(metrics.toolSequences[key]!.cwdSamples, cwd);
	if (run.promptSnippet) pushBoundedUnique(metrics.toolSequences[key]!.examples, run.promptSnippet, config.maxEvidenceItems);
}

function updateToolProblemMetric(metrics: MetricsStore, toolName: string, problemType: "error" | "slow", cwd: string, message: string | undefined, config: ScoutConfig): void {
	const now = nowIso();
	const key = `${slugify(toolName)}-${problemType}`;
	const current = metrics.toolProblems[key] ?? {
		key,
		toolName,
		problemType,
		count: 0,
		firstSeenAt: now,
		lastSeenAt: now,
		cwdSamples: [],
		examples: [],
	};
	metrics.toolProblems[key] = {
		...current,
		count: current.count + 1,
		lastSeenAt: now,
		lastMessage: message ? clipEvidence(message, 500) : current.lastMessage,
	};
	pushCwdSample(metrics.toolProblems[key]!.cwdSamples, cwd);
	if (message) pushBoundedUnique(metrics.toolProblems[key]!.examples, message, config.maxEvidenceItems);
}

function suggestionSeverity(confidence: number, count: number): Severity {
	if (confidence >= 0.78 || count >= 6) return "high";
	if (confidence >= 0.6 || count >= 3) return "medium";
	return "info";
}

function isDevServerCommand(commandKey: string): boolean {
	return /\b(npm|pnpm|yarn|bun)\s+(?:run\s+)?(dev|start|serve|preview)\b/i.test(commandKey) ||
		/\b(vite|next\s+dev|nuxt\s+dev|astro\s+dev)\b/i.test(commandKey);
}

function textMentionsRuntimeContext(text: string): boolean {
	return /\b(EADDRINUSE|address already in use|port \d+|already running|dev server|development server|localhost:\d+)\b/i.test(text);
}

function projectRuntimeContextSuggestion(sourceKey: string, source: WorkflowSuggestion["source"], count: number, evidence: string[], confidence: number, commandOrSequence?: string): WorkflowSuggestion {
	const subject = commandOrSequence ? ` (${commandOrSequence})` : "";
	return {
		key: `project-context:${sourceKey}`,
		kind: "project-context",
		severity: suggestionSeverity(confidence, count),
		title: "Document project runtime/dev-server context",
		proposedName: "project-runtime-context",
		rationale: `Runtime/server friction${subject} keeps appearing. This is usually not a new automation tool problem; it means Pi needs stable project context about how the app is normally run and when not to start another server.`,
		action: "Update AGENTS.md/CLAUDE.md or create a project skill with the normal dev-server owner (external terminal/container), URLs/ports, health-check commands, logs, when to start/stop servers, and validation/test commands.",
		evidence,
		confidence,
		source,
		count,
	};
}

function suggestionFromPromptMetric(metric: PromptPatternMetric, resources: ResourceSummary[], config: ScoutConfig): WorkflowSuggestion | undefined {
	if (!isSuggestionEnabled(metric.kind, config)) return undefined;
	if (metric.count < metric.minSignals) return undefined;
	if (resourceExists(metric.proposedName, resources, metric.skipIfResources ?? [])) return undefined;
	const confidence = Math.min(0.96, metric.averageConfidence + Math.min(0.24, metric.count * 0.04));
	return {
		key: `prompt:${metric.key}`,
		kind: metric.kind,
		severity: suggestionSeverity(confidence, metric.count),
		title: metric.title,
		proposedName: metric.proposedName,
		rationale: metric.rationale,
		action: metric.action,
		evidence: metric.examples.length > 0 ? metric.examples : [`${metric.count} matching prompt signal(s) across ${metric.cwdSamples.join(", ") || "current sessions"}.`],
		confidence,
		source: "prompt-pattern",
		count: metric.count,
	};
}

function suggestionFromBashMetric(metric: BashCommandMetric, resources: ResourceSummary[], config: ScoutConfig): WorkflowSuggestion | undefined {
	if (isDevServerCommand(metric.commandKey)) {
		if (!config.suggestProjectContext) return undefined;
		if (metric.count < 2) return undefined;
		const confidence = Math.min(0.94, 0.58 + metric.count * 0.08 + (metric.errors > 0 ? 0.08 : 0));
		return projectRuntimeContextSuggestion(`bash:${metric.key}`, "bash-command", metric.count, metric.examples, confidence, metric.commandKey);
	}

	if (!config.suggestExtensions) return undefined;
	if (metric.count < config.minBashRepeatsForExtension) return undefined;
	if (/^git\s+(commit|push|merge)$/.test(metric.commandKey) && resourceExists("push", resources)) return undefined;
	const proposedName = `${slugify(metric.commandKey)}-command`;
	if (resourceExists(proposedName, resources)) return undefined;
	const averageMs = metric.count ? metric.totalMs / metric.count : 0;
	const confidence = Math.min(0.92, 0.48 + metric.count * 0.07 + (metric.errors > 0 ? 0.05 : 0));
	return {
		key: `bash:${metric.key}`,
		kind: "extension",
		severity: suggestionSeverity(confidence, metric.count),
		title: `Automate repeated command: ${metric.commandKey}`,
		proposedName,
		rationale: `The command pattern \`${metric.commandKey}\` has appeared ${metric.count} time(s). Repeated shell commands are often better as Pi slash commands/tools with prompts, validation, status UI, and output truncation.`,
		action: `Create a Pi extension that exposes a slash command or tool for \`${metric.commandKey}\`, validates inputs, runs the command safely, shows progress, and summarizes/truncates output. Average runtime observed: ${formatDuration(averageMs)}.`,
		evidence: metric.examples,
		confidence,
		source: "bash-command",
		count: metric.count,
	};
}

function suggestionFromToolSequenceMetric(metric: ToolSequenceMetric, resources: ResourceSummary[], config: ScoutConfig): WorkflowSuggestion | undefined {
	const sequenceText = metric.sequence.join(" → ");
	if (metric.sequence.some((item) => isDevServerCommand(item) || textMentionsRuntimeContext(item))) {
		if (!config.suggestProjectContext) return undefined;
		if (metric.count < 2) return undefined;
		const confidence = Math.min(0.9, 0.54 + metric.count * 0.07);
		return projectRuntimeContextSuggestion(`sequence:${metric.key}`, "tool-sequence", metric.count, metric.examples, confidence, sequenceText);
	}

	if (!config.suggestExtensions) return undefined;
	if (metric.count < config.minToolSequenceRepeats) return undefined;
	const proposedName = `${slugify(metric.sequence.join("-"), "tool-chain")}-workflow`;
	if (resourceExists(proposedName, resources)) return undefined;
	const confidence = Math.min(0.88, 0.46 + metric.count * 0.06);
	return {
		key: `sequence:${metric.key}`,
		kind: "extension",
		severity: suggestionSeverity(confidence, metric.count),
		title: `Automate recurring tool chain: ${sequenceText}`,
		proposedName,
		rationale: `A similar non-trivial tool chain has repeated ${metric.count} time(s). This may be a good fit for a command, wizard, or focused tool that coordinates the steps.`,
		action: "Create a Pi extension that wraps this recurring tool chain behind a slash command or custom tool, asks for the few required inputs, and records clear results.",
		evidence: metric.examples,
		confidence,
		source: "tool-sequence",
		count: metric.count,
	};
}

function suggestionFromToolProblemMetric(metric: ToolProblemMetric, _resources: ResourceSummary[], config: ScoutConfig): WorkflowSuggestion | undefined {
	if (!config.suggestProjectContext) return undefined;
	if (metric.count < 2) return undefined;
	const evidence = metric.examples.length > 0 ? metric.examples : metric.lastMessage ? [metric.lastMessage] : [];
	const combined = evidence.join("\n");
	if (!textMentionsRuntimeContext(combined)) return undefined;
	const confidence = Math.min(0.88, 0.5 + metric.count * 0.06);
	return projectRuntimeContextSuggestion(`tool-problem:${metric.key}`, "tool-problem", metric.count, evidence, confidence, `${metric.toolName} ${metric.problemType}`);
}

function isSnoozed(state: SuggestionState | undefined): boolean {
	if (!state?.snoozedUntil) return false;
	return Date.parse(state.snoozedUntil) > Date.now();
}

function collectSuggestions(metrics: MetricsStore, resources: ResourceSummary[], config: ScoutConfig): WorkflowSuggestion[] {
	const suggestions: WorkflowSuggestion[] = [];
	for (const metric of Object.values(metrics.promptPatterns)) {
		const suggestion = suggestionFromPromptMetric(metric, resources, config);
		if (suggestion) suggestions.push(suggestion);
	}
	for (const metric of Object.values(metrics.bashCommands)) {
		const suggestion = suggestionFromBashMetric(metric, resources, config);
		if (suggestion) suggestions.push(suggestion);
	}
	for (const metric of Object.values(metrics.toolSequences)) {
		const suggestion = suggestionFromToolSequenceMetric(metric, resources, config);
		if (suggestion) suggestions.push(suggestion);
	}
	for (const metric of Object.values(metrics.toolProblems)) {
		const suggestion = suggestionFromToolProblemMetric(metric, resources, config);
		if (suggestion) suggestions.push(suggestion);
	}

	return suggestions
		.filter((suggestion) => suggestion.confidence >= Math.min(0.99, config.minConfidenceToPrompt))
		.filter((suggestion) => !isSnoozed(metrics.suggestions[suggestion.key]))
		.sort((a, b) => b.confidence - a.confidence || b.count - a.count || a.title.localeCompare(b.title));
}

function markSuggestion(metrics: MetricsStore, suggestion: WorkflowSuggestion, patch: Partial<SuggestionState>): void {
	const now = nowIso();
	const current = metrics.suggestions[suggestion.key] ?? {
		key: suggestion.key,
		status: "seen" as const,
		firstSuggestedAt: now,
		lastSuggestedAt: now,
		timesShown: 0,
	};
	metrics.suggestions[suggestion.key] = {
		...current,
		...patch,
		lastSuggestedAt: now,
		timesShown: current.timesShown + (patch.status === "seen" ? 1 : 0),
	};
}

function suggestionLocation(kind: SuggestionKind, proposedName: string, cwd: string): string {
	if (kind === "skill") return join(PI_AGENT_DIR, "skills", proposedName, "SKILL.md");
	if (kind === "extension") return join(PI_AGENT_DIR, "extensions", `${proposedName}.ts`);
	return join(projectRootFromCwd(cwd), "AGENTS.md");
}

function suggestionTargetDescription(suggestion: WorkflowSuggestion, cwd: string): string {
	const target = formatRelative(suggestionLocation(suggestion.kind, suggestion.proposedName, cwd), cwd);
	if (suggestion.kind === "project-context") return `${target} (or a project skill under .agents/skills/)`;
	return target;
}

function formatSuggestion(suggestion: WorkflowSuggestion, cwd: string): string {
	const icon = suggestionIcon(suggestion.kind);
	const label = suggestionKindLabel(suggestion.kind);
	const evidence = suggestion.evidence.length > 0
		? suggestion.evidence.map((item) => `- ${item}`).join("\n")
		: "- No prompt samples stored; see metrics for counts.";
	return [
		`${icon} Workflow opportunity: ${label}`,
		"",
		`Title: ${suggestion.title}`,
		`Suggested name: ${suggestion.proposedName}`,
		`Confidence: ${(suggestion.confidence * 100).toFixed(0)}% from ${suggestion.count} signal(s)`,
		`Target: ${suggestionTargetDescription(suggestion, cwd)}`,
		"",
		"Why this helps:",
		suggestion.rationale,
		"",
		"Suggested change:",
		suggestion.action,
		"",
		"Evidence:",
		evidence,
		"",
		`Report: ${REPORT_PATH}`,
	].join("\n");
}

function formatSuggestionWidget(suggestion: WorkflowSuggestion): string[] {
	const icon = suggestionIcon(suggestion.kind);
	return [
		`${icon} Workflow opportunity: ${suggestionKindLabel(suggestion.kind)} \`${suggestion.proposedName}\``,
		`${suggestion.title} — ${(suggestion.confidence * 100).toFixed(0)}% confidence from ${suggestion.count} signal(s)`,
	];
}

function formatReport(metrics: MetricsStore, resources: ResourceSummary[], suggestions: WorkflowSuggestion[], cwd: string): string {
	const lines: string[] = [];
	lines.push("# Workflow Opportunity Scout Report");
	lines.push("");
	lines.push(`Generated: ${nowIso()}`);
	lines.push(`CWD: \`${cwd}\``);
	lines.push(`Store: \`${STORE_DIR}\``);
	lines.push("");
	lines.push("## Summary");
	lines.push("");
	lines.push(`- Active suggestions: ${suggestions.length}`);
	lines.push(`- Prompt patterns tracked: ${Object.keys(metrics.promptPatterns).length}`);
	lines.push(`- Repeated bash command patterns tracked: ${Object.keys(metrics.bashCommands).length}`);
	lines.push(`- Tool sequences tracked: ${Object.keys(metrics.toolSequences).length}`);
	lines.push(`- Tool problem patterns tracked: ${Object.keys(metrics.toolProblems).length}`);
	lines.push(`- Known resources: ${resources.filter((resource) => resource.kind === "skill").length} skills, ${resources.filter((resource) => resource.kind === "extension").length} extensions, ${resources.filter((resource) => resource.kind === "context").length} context files`);
	lines.push("");

	lines.push("## Top Suggestions");
	lines.push("");
	if (suggestions.length === 0) {
		lines.push("No ready suggestions yet. Keep working; suggestions appear after repeated signals cross configured thresholds.");
	} else {
		for (const suggestion of suggestions.slice(0, 10)) {
			lines.push(`### ${suggestionIcon(suggestion.kind)} ${suggestion.title}`);
			lines.push("");
			lines.push(`- Kind: ${suggestionKindLabel(suggestion.kind)}`);
			lines.push(`- Suggested name: \`${suggestion.proposedName}\``);
			lines.push(`- Confidence: ${(suggestion.confidence * 100).toFixed(0)}% (${suggestion.count} signal(s), source: ${suggestion.source})`);
			lines.push(`- Target: \`${suggestionTargetDescription(suggestion, cwd)}\``);
			lines.push(`- Why: ${suggestion.rationale}`);
			lines.push(`- Action: ${suggestion.action}`);
			if (suggestion.evidence.length > 0) {
				lines.push("- Evidence:");
				for (const item of suggestion.evidence) lines.push(`  - ${item}`);
			}
			lines.push("");
		}
	}

	lines.push("## Prompt Pattern Signals");
	lines.push("");
	const promptMetrics = Object.values(metrics.promptPatterns).sort((a, b) => b.count - a.count);
	if (promptMetrics.length === 0) {
		lines.push("No prompt patterns tracked yet.");
	} else {
		lines.push("| Pattern | Kind | Count | Confidence | Proposed name | Last seen |");
		lines.push("| --- | --- | ---: | ---: | --- | --- |");
		for (const metric of promptMetrics.slice(0, 25)) {
			lines.push(`| ${metric.title} | ${metric.kind} | ${metric.count} | ${(metric.averageConfidence * 100).toFixed(0)}% | \`${metric.proposedName}\` | ${metric.lastSeenAt} |`);
		}
	}
	lines.push("");

	lines.push("## Repeated Bash Command Signals");
	lines.push("");
	const bashMetrics = Object.values(metrics.bashCommands).sort((a, b) => b.count - a.count);
	if (bashMetrics.length === 0) {
		lines.push("No repeated bash command patterns tracked yet.");
	} else {
		lines.push("| Command pattern | Count | Errors | Avg | Max | Last seen |");
		lines.push("| --- | ---: | ---: | ---: | ---: | --- |");
		for (const metric of bashMetrics.slice(0, 25)) {
			const avg = metric.count ? metric.totalMs / metric.count : 0;
			lines.push(`| \`${metric.commandKey}\` | ${metric.count} | ${metric.errors} | ${formatDuration(avg)} | ${formatDuration(metric.maxMs)} | ${metric.lastSeenAt} |`);
		}
	}
	lines.push("");

	lines.push("## Known Resources Considered");
	lines.push("");
	lines.push("| Kind | Name | Path |");
	lines.push("| --- | --- | --- |");
	for (const resource of resources.slice(0, 80)) {
		lines.push(`| ${resource.kind} | ${resource.name} | ${formatRelative(resource.path, cwd)} |`);
	}
	lines.push("");
	lines.push("## Notes");
	lines.push("");
	lines.push("- Prompt samples are redacted and clipped before storage.");
	lines.push("- Suggestions are heuristic; accept only ideas that match your workflow.");
	lines.push("- Tool-specific setup/failure fixes are intentionally left to Skill & Extension Improver; this scout favors broader global or project context opportunities.");
	lines.push("- Accepted prompts queue an agent task; they do not edit files directly.");
	lines.push("- Configure thresholds in `config.json` or with `/workflow-scout config`.");
	return truncate(lines.join("\n"));
}

async function writeReport(metrics: MetricsStore, resources: ResourceSummary[], suggestions: WorkflowSuggestion[], cwd: string): Promise<void> {
	ensureStoreDir();
	await writeFile(REPORT_PATH, formatReport(metrics, resources, suggestions, cwd) + "\n", "utf-8");
}

function queueCreationTask(pi: ExtensionAPI, suggestion: WorkflowSuggestion, cwd: string): void {
	const kindInstructions = suggestion.kind === "skill"
		? "Use the Agent Skills directory structure: a directory named after the skill with SKILL.md frontmatter (`name`, `description`) and concise progressive-disclosure instructions."
		: suggestion.kind === "extension"
			? "Use the Pi extension pattern: a TypeScript file that default-exports `function (pi: ExtensionAPI)`, guards UI calls with `ctx.hasUI`, truncates large outputs, and cleans up long-lived work on `session_shutdown`."
			: "Prefer stable project context over automation: update AGENTS.md/CLAUDE.md if the information should always be loaded, or create a project skill under .agents/skills/ if it is task-specific. Capture durable facts, commands, URLs, ownership, and constraints; do not patch only the current failure.";

	pi.sendUserMessage(
		`Please implement the broader workflow improvement recommended by Workflow Opportunity Scout.\n\n` +
		`Kind: ${suggestionKindLabel(suggestion.kind)}\n` +
		`Suggested name: ${suggestion.proposedName}\n` +
		`Target: ${suggestionTargetDescription(suggestion, cwd)}\n\n` +
		`Why this helps:\n${suggestion.rationale}\n\n` +
		`Desired change:\n${suggestion.action}\n\n` +
		`Evidence:\n${suggestion.evidence.map((item) => `- ${item}`).join("\n") || "- See the scout report."}\n\n` +
		`${kindInstructions}\n\n` +
		`Before editing, inspect existing project context files, skills, and extensions to avoid duplicates. Think at the project/global workflow level first, make the smallest useful implementation, validate syntax/formatting if possible, and tell me whether /reload is needed.`,
		{ deliverAs: "followUp" },
	);
}

export default function workflowOpportunityScout(pi: ExtensionAPI) {
	let config = loadConfig();
	let metrics = loadMetrics();
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let knownResources: ResourceSummary[] = [];
	let promptCountThisSession = 0;
	let turnsSinceSuggestionCheck = 0;
	let lastSuggestionAt = 0;
	let promptsDisabledForSession = false;
	let pendingPromptSnippet: string | undefined;
	let currentRun: CurrentRun | undefined;
	const toolStarts = new Map<string, ToolStart>();
	const pendingBashCalls = new Map<string, PendingBashCall>();
	const emittedThisSession = new Set<string>();

	function scheduleMetricsSave(): void {
		if (saveTimer) return;
		saveTimer = setTimeout(() => {
			saveTimer = undefined;
			saveMetrics(metrics);
		}, 1000);
	}

	async function refreshResourcesAndReport(cwd: string): Promise<WorkflowSuggestion[]> {
		config = loadConfig();
		knownResources = await discoverResources(cwd);
		const suggestions = collectSuggestions(metrics, knownResources, config);
		await writeReport(metrics, knownResources, suggestions, cwd);
		return suggestions;
	}

	function emitSuggestionDetails(suggestion: WorkflowSuggestion, cwd: string): void {
		pi.sendMessage({
			customType: "workflow-opportunity-scout-suggestion",
			content: formatSuggestion(suggestion, cwd),
			display: true,
			details: { suggestion, reportPath: REPORT_PATH },
		});
	}

	async function promptForSuggestion(suggestion: WorkflowSuggestion, ctx: { cwd: string; hasUI: boolean; ui: any }): Promise<void> {
		emittedThisSession.add(suggestion.key);
		lastSuggestionAt = Date.now();
		turnsSinceSuggestionCheck = 0;
		promptCountThisSession += 1;
		markSuggestion(metrics, suggestion, { status: "seen" });
		scheduleMetricsSave();

		if (!ctx.hasUI) {
			emitSuggestionDetails(suggestion, ctx.cwd);
			return;
		}

		if (config.showPromptWidget) {
			ctx.ui.setWidget("workflow-opportunity-scout-suggestion", formatSuggestionWidget(suggestion), { placement: "belowEditor" });
		}

		const choice = await ctx.ui.select(
			`Workflow opportunity detected\n\n${suggestionKindLabel(suggestion.kind)}: ${suggestion.proposedName}\n\n${suggestion.title}\n\n${suggestion.rationale}\n\n${suggestion.action}`,
			["Queue improvement task", "Show details", "Snooze", "Disable prompts this session"],
		);

		if (choice === "Queue improvement task") {
			markSuggestion(metrics, suggestion, { status: "queued", queuedAt: nowIso() });
			saveMetrics(metrics);
			queueCreationTask(pi, suggestion, ctx.cwd);
			ctx.ui.notify(`Queued ${suggestionKindLabel(suggestion.kind)} task: ${suggestion.proposedName}`, "info");
			ctx.ui.setWidget("workflow-opportunity-scout-suggestion", undefined);
			return;
		}

		if (choice === "Show details") {
			emitSuggestionDetails(suggestion, ctx.cwd);
			return;
		}

		if (choice === "Snooze") {
			markSuggestion(metrics, suggestion, {
				status: "snoozed",
				snoozedUntil: new Date(Date.now() + Math.max(60_000, config.snoozeMs)).toISOString(),
			});
			saveMetrics(metrics);
			ctx.ui.setWidget("workflow-opportunity-scout-suggestion", undefined);
			ctx.ui.notify("Workflow opportunity snoozed.", "info");
			return;
		}

		if (choice === "Disable prompts this session") {
			promptsDisabledForSession = true;
			ctx.ui.setWidget("workflow-opportunity-scout-suggestion", undefined);
			ctx.ui.notify("Workflow opportunity prompts disabled for this session.", "info");
			return;
		}

		ctx.ui.setWidget("workflow-opportunity-scout-suggestion", undefined);
	}

	pi.registerMessageRenderer("workflow-opportunity-scout-suggestion", (message, { expanded }, theme) => {
		const details = message.details as { suggestion?: WorkflowSuggestion; reportPath?: string } | undefined;
		const suggestion = details?.suggestion;
		let text = theme.fg("accent", theme.bold("💡 Workflow opportunity"));
		if (suggestion) {
			const color = suggestion.severity === "high" ? "warning" : suggestion.severity === "medium" ? "toolTitle" : "muted";
			text += `\n${theme.fg(color, `${suggestionKindLabel(suggestion.kind)}: ${suggestion.proposedName}`)}`;
			text += `\n${theme.fg("dim", suggestion.title)}`;
		}
		if (details?.reportPath) text += `\n${theme.fg("muted", details.reportPath)}`;
		if (expanded && typeof message.content === "string") text += `\n\n${theme.fg("dim", message.content)}`;
		return new Text(text, 0, 0);
	});

	pi.registerMessageRenderer("workflow-opportunity-scout-report", (message, { expanded }, theme) => {
		const details = message.details as { suggestionCount?: number; reportPath?: string } | undefined;
		let text = theme.fg("toolTitle", theme.bold("Workflow Opportunity Scout Report"));
		if (typeof details?.suggestionCount === "number") {
			text += `\n${theme.fg("dim", `${details.suggestionCount} active suggestion(s)`)}`;
		}
		if (details?.reportPath) text += `\n${theme.fg("muted", details.reportPath)}`;
		if (expanded && typeof message.content === "string") text += `\n\n${theme.fg("dim", message.content)}`;
		return new Text(text, 0, 0);
	});

	pi.registerCommand("workflow-scout", {
		description: "Show or configure workflow skill/extension/project-context suggestions (report, suggest, config, reset)",
		getArgumentCompletions: (prefix) => {
			const items = ["report", "suggest", "config", "status", "reset", "help"];
			return items
				.filter((item) => item.startsWith(prefix.trim()))
				.map((item) => ({ value: item, label: item }));
		},
		handler: async (args, ctx) => {
			const command = args.trim() || "report";
			config = loadConfig();
			metrics = loadMetrics();

			if (command === "help") {
				pi.sendMessage({
					customType: "workflow-opportunity-scout-report",
					content: [
						"/workflow-scout report  - write and show the latest report",
						"/workflow-scout suggest - prompt for the top current suggestion",
						"/workflow-scout status  - show current counts",
						"/workflow-scout config  - edit JSON config",
						"/workflow-scout reset   - clear telemetry after confirmation",
					].join("\n"),
					display: true,
					details: { reportPath: REPORT_PATH },
				});
				return;
			}

			if (command === "config") {
				if (!ctx.hasUI) {
					pi.sendMessage({
						customType: "workflow-opportunity-scout-report",
						content: `Config path: ${CONFIG_PATH}`,
						display: true,
						details: { reportPath: REPORT_PATH },
					});
					return;
				}
				const edited = await ctx.ui.editor("Workflow Scout config", JSON.stringify(config, null, 2) + "\n");
				if (edited === undefined) return;
				try {
					const parsed = JSON.parse(edited) as Partial<ScoutConfig>;
					writeJson(CONFIG_PATH, { ...config, ...parsed });
					config = loadConfig();
					ctx.ui.notify("Workflow Scout config saved. Use /reload if you want a clean extension restart.", "info");
				} catch (error: any) {
					ctx.ui.notify(`Invalid Workflow Scout config JSON: ${error.message}`, "error");
				}
				return;
			}

			if (command === "reset") {
				const ok = !ctx.hasUI || await ctx.ui.confirm("Reset Workflow Scout telemetry?", `This overwrites ${METRICS_PATH}. Suggestions will rebuild from future sessions.`);
				if (!ok) return;
				metrics = createEmptyMetrics();
				saveMetrics(metrics);
				const suggestions = await refreshResourcesAndReport(ctx.cwd);
				if (ctx.hasUI) ctx.ui.notify("Workflow Scout telemetry reset.", "info");
				pi.sendMessage({
					customType: "workflow-opportunity-scout-report",
					content: `Telemetry reset. Active suggestions: ${suggestions.length}. Report: ${REPORT_PATH}`,
					display: true,
					details: { suggestionCount: suggestions.length, reportPath: REPORT_PATH },
				});
				return;
			}

			const suggestions = await refreshResourcesAndReport(ctx.cwd);

			if (command === "suggest") {
				const suggestion = suggestions.find((candidate) => !emittedThisSession.has(candidate.key)) ?? suggestions[0];
				if (!suggestion) {
					if (ctx.hasUI) ctx.ui.notify("No workflow suggestions are ready yet.", "info");
					return;
				}
				await promptForSuggestion(suggestion, ctx);
				return;
			}

			if (command === "status") {
				const content = [
					`Active suggestions: ${suggestions.length}`,
					`Prompt patterns: ${Object.keys(metrics.promptPatterns).length}`,
					`Bash command patterns: ${Object.keys(metrics.bashCommands).length}`,
					`Tool sequences: ${Object.keys(metrics.toolSequences).length}`,
					`Tool problems: ${Object.keys(metrics.toolProblems).length}`,
					`Report: ${REPORT_PATH}`,
				].join("\n");
				pi.sendMessage({
					customType: "workflow-opportunity-scout-report",
					content,
					display: true,
					details: { suggestionCount: suggestions.length, reportPath: REPORT_PATH },
				});
				return;
			}

			if (command !== "report") {
				if (ctx.hasUI) ctx.ui.notify(`Unknown workflow-scout command: ${command}`, "warning");
				return;
			}

			const report = await readFile(REPORT_PATH, "utf-8");
			pi.sendMessage({
				customType: "workflow-opportunity-scout-report",
				content: report,
				display: true,
				details: { suggestionCount: suggestions.length, reportPath: REPORT_PATH },
			});
		},
	});

	pi.on("session_start", async (event, ctx) => {
		config = loadConfig();
		metrics = loadMetrics();
		if (!config.startupReport) return;
		const suggestions = await refreshResourcesAndReport(ctx.cwd);
		if (ctx.hasUI) {
			const theme = ctx.ui.theme;
			const statusText = suggestions.length > 0
				? theme.fg("accent", `scout: ${suggestions.length} idea(s)`)
				: theme.fg("dim", "scout: watching");
			ctx.ui.setStatus("workflow-opportunity-scout", statusText);
			if (config.notifyOnStartup && suggestions.length > 0) {
				ctx.ui.notify(`Workflow Scout has ${suggestions.length} suggestion(s). Run /workflow-scout report.`, "info");
			}
		}
		pi.events.emit("workflow-opportunity-scout:report", { suggestionCount: suggestions.length, reportPath: REPORT_PATH, reason: event.reason });
	});

	pi.on("input", (event, ctx) => {
		if (event.source === "extension") return;
		const text = event.text.trim();
		if (!text) return;
		if (/^\/workflow-scout\b/.test(text)) return;

		pendingPromptSnippet = clipEvidence(text, 500);

		if (text.startsWith("/")) {
			return;
		}

		config = loadConfig();
		let changed = false;
		for (const pattern of TASK_PATTERNS) {
			const match = patternMatched(pattern, text, ctx.cwd);
			if (!match.matched) continue;
			updatePromptPattern(metrics, pattern, text, ctx.cwd, match.confidence, config);
			changed = true;
		}
		if (changed) scheduleMetricsSave();
	});

	pi.on("agent_start", () => {
		currentRun = {
			startedAt: Date.now(),
			promptSnippet: pendingPromptSnippet,
			tools: [],
			bashCommandKeys: [],
		};
		pendingPromptSnippet = undefined;
	});

	pi.on("tool_execution_start", (event) => {
		toolStarts.set(event.toolCallId, { toolName: event.toolName, startedAt: Date.now() });
	});

	pi.on("tool_call", (event) => {
		currentRun?.tools.push(event.toolName);
		if (event.toolName !== "bash") return;
		const input = event.input as { command?: unknown };
		if (typeof input.command !== "string") return;
		const commandKey = normalizeBashCommand(input.command);
		if (!commandKey) return;
		pendingBashCalls.set(event.toolCallId, { command: input.command, commandKey });
		currentRun?.bashCommandKeys.push(commandKey);
	});

	pi.on("tool_execution_end", (event, ctx) => {
		const started = toolStarts.get(event.toolCallId);
		toolStarts.delete(event.toolCallId);
		const durationMs = started ? Date.now() - started.startedAt : 0;
		const bashCall = pendingBashCalls.get(event.toolCallId);
		pendingBashCalls.delete(event.toolCallId);

		config = loadConfig();
		if (bashCall) {
			updateBashMetric(metrics, bashCall.command, bashCall.commandKey, ctx.cwd, durationMs, Boolean(event.isError), config);
		}

		const resultText = typeof (event.result as any)?.content?.[0]?.text === "string"
			? String((event.result as any).content[0].text)
			: undefined;
		if (event.isError) {
			updateToolProblemMetric(metrics, event.toolName, "error", ctx.cwd, resultText, config);
		} else if (durationMs > 30_000 && !["bash"].includes(event.toolName)) {
			updateToolProblemMetric(metrics, event.toolName, "slow", ctx.cwd, `Last run took ${formatDuration(durationMs)}.`, config);
		}
		scheduleMetricsSave();
	});

	pi.on("agent_end", async (_event, ctx) => {
		config = loadConfig();
		let changed = false;
		if (currentRun) {
			updateToolSequenceMetric(metrics, currentRun, ctx.cwd, config);
			currentRun = undefined;
			changed = true;
		}
		if (changed) scheduleMetricsSave();

		if (!config.continuousMonitoring) return;
		if (promptsDisabledForSession) return;
		if (promptCountThisSession >= config.maxPromptsPerSession) return;

		turnsSinceSuggestionCheck += 1;
		const dueToInterval = turnsSinceSuggestionCheck >= Math.max(1, config.monitorTurnInterval);
		const dueToTime = Date.now() - lastSuggestionAt >= Math.max(0, config.minPromptIntervalMs);
		if (!dueToInterval || !dueToTime) return;

		try {
			const suggestions = await refreshResourcesAndReport(ctx.cwd);
			if (ctx.hasUI) {
				const theme = ctx.ui.theme;
				ctx.ui.setStatus(
					"workflow-opportunity-scout",
					suggestions.length > 0 ? theme.fg("accent", `scout: ${suggestions.length} idea(s)`) : theme.fg("dim", "scout: watching"),
				);
			}
			const suggestion = suggestions.find((candidate) => !emittedThisSession.has(candidate.key));
			if (!suggestion) {
				turnsSinceSuggestionCheck = 0;
				return;
			}
			await promptForSuggestion(suggestion, ctx);
		} catch (error: any) {
			if (ctx.hasUI) ctx.ui.notify(`Workflow Scout failed: ${error.message}`, "warning");
		}
	});

	pi.on("session_shutdown", () => {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = undefined;
		saveMetrics(metrics);
	});
}
