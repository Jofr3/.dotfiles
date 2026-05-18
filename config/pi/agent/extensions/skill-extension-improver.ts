/**
 * Skill & Extension Improver
 *
 * Auto-loaded pi extension that continuously monitors skills/extensions in the
 * background, records lightweight telemetry, and decides when to prompt the user
 * for a skill/extension upgrade. It is intentionally non-destructive by default:
 * it only writes reports/metrics unless the user accepts an upgrade prompt.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { lstat, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

const HOME = homedir();
const PI_AGENT_DIR = join(HOME, ".pi", "agent");
const STORE_DIR = join(PI_AGENT_DIR, "skill-extension-improver");
const CONFIG_PATH = join(STORE_DIR, "config.json");
const METRICS_PATH = join(STORE_DIR, "metrics.json");
const REPORT_PATH = join(STORE_DIR, "report.md");
const MAX_REPORT_CHARS = 45_000;

const DEFAULT_CONFIG: ImproverConfig = {
	startupAudit: true,
	notifyOnFindings: false,
	includeInfoFindings: true,
	continuousMonitoring: true,
	monitorTurnInterval: 1,
	minPromptIntervalMs: 10 * 60_000,
	maxPromptsPerSession: 4,
	showPromptWidget: true,
	promptOnToolProblems: true,
	minCallsForPerformanceWarning: 3,
	maxErrorRateForTools: 0.25,
	maxAverageToolMs: 15_000,
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

type ResourceKind = "skill" | "extension";
type Scope = "global" | "project";
type Severity = "info" | "warning" | "error";
type AuditReason = "startup" | "reload" | "background";

interface ImproverConfig {
	startupAudit: boolean;
	notifyOnFindings: boolean;
	includeInfoFindings: boolean;
	continuousMonitoring: boolean;
	monitorTurnInterval: number;
	minPromptIntervalMs: number;
	maxPromptsPerSession: number;
	showPromptWidget: boolean;
	promptOnToolProblems: boolean;
	minCallsForPerformanceWarning: number;
	maxErrorRateForTools: number;
	maxAverageToolMs: number;
}

interface ResourceInfo {
	kind: ResourceKind;
	name: string;
	path: string;
	scope: Scope;
	sizeBytes: number;
	mtimeMs: number;
}

interface Finding {
	severity: Severity;
	kind: ResourceKind | "performance";
	name: string;
	path?: string;
	message: string;
	suggestion: string;
	autoFixable?: boolean;
}

interface UpgradeSuggestion {
	key: string;
	severity: Severity;
	title: string;
	message: string;
	action: string;
	path?: string;
	paths?: string[];
	autoFixable?: boolean;
}

interface AuditResult {
	reason: AuditReason;
	cwd: string;
	generatedAt: string;
	resources: ResourceInfo[];
	findings: Finding[];
	summary: {
		skills: number;
		extensions: number;
		errors: number;
		warnings: number;
		infos: number;
	};
}

interface ToolMetric {
	toolName: string;
	source: string;
	sourcePath?: string;
	calls: number;
	errors: number;
	totalMs: number;
	maxMs: number;
	lastMs: number;
	lastUsedAt: string;
	lastError?: string;
}

interface SkillMetric {
	name: string;
	path?: string;
	loads: number;
	explicitInvocations: number;
	agentRuns: number;
	totalAgentMs: number;
	lastUsedAt: string;
}

interface MetricsStore {
	version: 1;
	createdAt: string;
	updatedAt: string;
	tools: Record<string, ToolMetric>;
	skills: Record<string, SkillMetric>;
}

interface ToolStart {
	toolName: string;
	startedAt: number;
}

interface ExplicitSkillRun {
	name: string;
	startedAt?: number;
}

interface FrontmatterResult {
	frontmatter: Record<string, string | boolean>;
	body: string;
	raw: string;
}

function ensureStoreDir(): void {
	mkdirSync(STORE_DIR, { recursive: true });
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

function loadConfig(): ImproverConfig {
	return { ...DEFAULT_CONFIG, ...readJson<Partial<ImproverConfig>>(CONFIG_PATH, {}) };
}

function loadMetrics(): MetricsStore {
	const now = new Date().toISOString();
	return readJson<MetricsStore>(METRICS_PATH, {
		version: 1,
		createdAt: now,
		updatedAt: now,
		tools: {},
		skills: {},
	});
}

function saveMetrics(metrics: MetricsStore): void {
	metrics.updatedAt = new Date().toISOString();
	writeJson(METRICS_PATH, metrics);
}

function countBySeverity(findings: Finding[], severity: Severity): number {
	return findings.filter((finding) => finding.severity === severity).length;
}

function normalizeName(input: string): string {
	return input.trim().replace(/^['"]|['"]$/g, "");
}

function parseFrontmatter(text: string): FrontmatterResult {
	if (!text.startsWith("---")) {
		return { frontmatter: {}, body: text, raw: "" };
	}

	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { frontmatter: {}, body: text, raw: "" };

	const raw = match[1] ?? "";
	const frontmatter: Record<string, string | boolean> = {};
	for (const line of raw.split(/\r?\n/)) {
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

	return {
		frontmatter,
		body: text.slice(match[0].length),
		raw,
	};
}

function isValidSkillName(name: string): boolean {
	return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(name) && !name.includes("--");
}

function truncate(text: string, max = MAX_REPORT_CHARS): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n\n[Report truncated at ${max} characters. Full report: ${REPORT_PATH}]`;
}

function redact(text: string): string {
	return text
		.replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, "[redacted private key]")
		.replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[redacted]")
		.replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret)(\s*[:=]\s*)(['\"]?)[^'\"\s]+/gi, "$1$2$3[redacted]")
		.replace(/[A-Za-z0-9+/]{80,}={0,2}/g, "[redacted-long-token]");
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

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function maybeAddFile(resources: ResourceInfo[], path: string, kind: ResourceKind, name: string, scope: Scope): Promise<void> {
	try {
		const fileStat = await stat(path);
		if (!fileStat.isFile()) return;
		if (resources.some((resource) => resource.path === path)) return;
		resources.push({
			kind,
			name,
			path,
			scope,
			sizeBytes: fileStat.size,
			mtimeMs: fileStat.mtimeMs,
		});
	} catch {
		// Ignore disappeared files during discovery.
	}
}

async function discoverExtensionsInDir(dir: string, scope: Scope): Promise<ResourceInfo[]> {
	const resources: ResourceInfo[] = [];
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
			await maybeAddFile(resources, fullPath, "extension", basename(entry.name, extname(entry.name)), scope);
		} else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
			for (const indexName of ["index.ts", "index.js", "index.mjs", "index.cjs"]) {
				const indexPath = join(fullPath, indexName);
				if (await pathExists(indexPath)) {
					await maybeAddFile(resources, indexPath, "extension", entry.name, scope);
					break;
				}
			}
		}
	}

	return resources;
}

async function walkSkillDir(dir: string, scope: Scope, includeRootMarkdown: boolean, root = dir): Promise<ResourceInfo[]> {
	const resources: ResourceInfo[] = [];
	if (!(await pathExists(dir))) return resources;

	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return resources;
	}

	const skillFile = join(dir, "SKILL.md");
	if (await pathExists(skillFile)) {
		await maybeAddFile(resources, skillFile, "skill", basename(dir), scope);
		return resources;
	}

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isFile()) {
			if (includeRootMarkdown && dir === root && entry.name.endsWith(".md")) {
				await maybeAddFile(resources, fullPath, "skill", basename(entry.name, ".md"), scope);
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
		resources.push(...(await walkSkillDir(fullPath, scope, includeRootMarkdown, root)));
	}

	return resources;
}

async function discoverResources(cwd: string): Promise<ResourceInfo[]> {
	const resources: ResourceInfo[] = [];
	const extensionDirs: Array<{ path: string; scope: Scope }> = [
		{ path: join(PI_AGENT_DIR, "extensions"), scope: "global" },
	];
	const skillDirs: Array<{ path: string; scope: Scope; includeRootMarkdown: boolean }> = [
		{ path: join(PI_AGENT_DIR, "skills"), scope: "global", includeRootMarkdown: true },
		{ path: join(HOME, ".agents", "skills"), scope: "global", includeRootMarkdown: false },
	];

	for (const ancestor of getAncestorDirs(cwd)) {
		extensionDirs.push({ path: join(ancestor, ".pi", "extensions"), scope: "project" });
		skillDirs.push({ path: join(ancestor, ".pi", "skills"), scope: "project", includeRootMarkdown: true });
		skillDirs.push({ path: join(ancestor, ".agents", "skills"), scope: "project", includeRootMarkdown: false });
	}

	for (const dir of extensionDirs) {
		resources.push(...(await discoverExtensionsInDir(dir.path, dir.scope)));
	}
	for (const dir of skillDirs) {
		resources.push(...(await walkSkillDir(dir.path, dir.scope, dir.includeRootMarkdown)));
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

function extractMarkdownLinks(markdown: string): string[] {
	const links: string[] = [];
	const regex = /\[[^\]]*\]\(([^)]+)\)/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(markdown))) {
		const target = match[1]?.trim();
		if (!target) continue;
		if (/^(https?:|mailto:|#)/i.test(target)) continue;
		if (target.startsWith("/")) continue;
		const clean = target.split("#")[0]?.trim();
		if (clean) links.push(clean);
	}
	return links;
}

async function auditSkill(resource: ResourceInfo): Promise<Finding[]> {
	const findings: Finding[] = [];
	let text: string;
	try {
		text = await readFile(resource.path, "utf-8");
	} catch (error: any) {
		return [{
			severity: "error",
			kind: "skill",
			name: resource.name,
			path: resource.path,
			message: `Could not read skill: ${error.message}`,
			suggestion: "Fix file permissions or remove the broken skill entry.",
		}];
	}

	const { frontmatter, body } = parseFrontmatter(text);
	const name = typeof frontmatter.name === "string" ? frontmatter.name : resource.name;
	const description = typeof frontmatter.description === "string" ? frontmatter.description : "";
	const isDirectorySkill = basename(resource.path) === "SKILL.md";

	if (!text.startsWith("---")) {
		findings.push({
			severity: "error",
			kind: "skill",
			name,
			path: resource.path,
			message: "Skill is missing YAML frontmatter.",
			suggestion: "Add frontmatter with required `name` and `description` fields.",
		});
	}

	if (!name) {
		findings.push({
			severity: "error",
			kind: "skill",
			name: resource.name,
			path: resource.path,
			message: "Skill frontmatter is missing `name`.",
			suggestion: "Set `name` to the lowercase hyphenated skill name.",
		});
	} else if (!isValidSkillName(name)) {
		findings.push({
			severity: "warning",
			kind: "skill",
			name,
			path: resource.path,
			message: "Skill name does not follow Agent Skills naming rules.",
			suggestion: "Use lowercase letters, numbers, and single hyphens only; max 64 characters.",
		});
	}

	if (isDirectorySkill && name && name !== basename(dirname(resource.path))) {
		findings.push({
			severity: "warning",
			kind: "skill",
			name,
			path: resource.path,
			message: `Skill name does not match parent directory (${basename(dirname(resource.path))}).`,
			suggestion: "Rename the directory or update the `name` frontmatter so they match.",
		});
	}

	if (!description) {
		findings.push({
			severity: "error",
			kind: "skill",
			name,
			path: resource.path,
			message: "Skill frontmatter is missing `description`; pi will not load it.",
			suggestion: "Add a specific description that says what the skill does and when to use it.",
		});
	} else {
		if (description.length > 1024) {
			findings.push({
				severity: "warning",
				kind: "skill",
				name,
				path: resource.path,
				message: "Skill description exceeds 1024 characters.",
				suggestion: "Shorten the description so it fits the Agent Skills frontmatter limit.",
			});
		}
		if (description.length < 60 || /\b(help(s|er)?|misc|various|stuff|things)\b/i.test(description)) {
			findings.push({
				severity: "info",
				kind: "skill",
				name,
				path: resource.path,
				message: "Skill description may be too generic for reliable automatic loading.",
				suggestion: "Mention concrete tasks and trigger phrases, e.g. `Use when ...`.",
			});
		}
		if (!/\buse\s+(when|for|to)\b/i.test(description)) {
			findings.push({
				severity: "info",
				kind: "skill",
				name,
				path: resource.path,
				message: "Skill description does not include an explicit use-case trigger.",
				suggestion: "Add wording like `Use when the user asks to ...` to improve selection.",
			});
		}
	}

	if (!/^#\s+\S/m.test(body)) {
		findings.push({
			severity: "info",
			kind: "skill",
			name,
			path: resource.path,
			message: "Skill body has no top-level heading.",
			suggestion: "Add a clear `# Skill Name` heading before workflow instructions.",
		});
	}

	for (const link of extractMarkdownLinks(body)) {
		const targetPath = resolve(dirname(resource.path), link);
		if (!(await pathExists(targetPath))) {
			findings.push({
				severity: "warning",
				kind: "skill",
				name,
				path: resource.path,
				message: `Relative link target does not exist: ${link}`,
				suggestion: "Fix the link or add the referenced file so agents can follow skill instructions.",
			});
		}
	}

	if (resource.sizeBytes > 35_000) {
		findings.push({
			severity: "info",
			kind: "skill",
			name,
			path: resource.path,
			message: `Skill file is large (${Math.round(resource.sizeBytes / 1024)}KB).`,
			suggestion: "Move deep reference material into separate files and link to them for progressive disclosure.",
		});
	}

	return findings;
}

function hasAny(source: string, patterns: RegExp[]): boolean {
	return patterns.some((pattern) => pattern.test(source));
}

async function auditExtension(resource: ResourceInfo, metrics: MetricsStore, config: ImproverConfig): Promise<Finding[]> {
	const findings: Finding[] = [];
	let source: string;
	try {
		source = await readFile(resource.path, "utf-8");
	} catch (error: any) {
		return [{
			severity: "error",
			kind: "extension",
			name: resource.name,
			path: resource.path,
			message: `Could not read extension: ${error.message}`,
			suggestion: "Fix file permissions or remove the broken extension entry.",
		}];
	}

	if (!/export\s+default\s+(async\s+)?function\b|export\s+default\s+\(/.test(source)) {
		findings.push({
			severity: "error",
			kind: "extension",
			name: resource.name,
			path: resource.path,
			message: "Extension does not appear to default-export a factory function.",
			suggestion: "Export `default function (pi: ExtensionAPI) { ... }` so pi can load it.",
		});
	}

	if (source.includes("registerTool(") && !source.includes("promptSnippet")) {
		findings.push({
			severity: "info",
			kind: "extension",
			name: resource.name,
			path: resource.path,
			message: "Extension registers tools without `promptSnippet` metadata.",
			suggestion: "Add concise `promptSnippet` text so custom tools are better represented in the system prompt.",
		});
	}

	if (source.includes("pi.exec(") && !/truncate(Head|Tail|Line)|DEFAULT_MAX_BYTES|DEFAULT_MAX_LINES/.test(source)) {
		findings.push({
			severity: "warning",
			kind: "extension",
			name: resource.name,
			path: resource.path,
			message: "Extension executes commands but does not appear to truncate tool output.",
			suggestion: "Use pi truncation helpers before returning command output to the model.",
		});
	}

	if (hasAny(source, [/setInterval\s*\(/, /fs\.watch\s*\(/, /watch\s*\(/, /createServer\s*\(/]) && !source.includes("session_shutdown")) {
		findings.push({
			severity: "warning",
			kind: "extension",
			name: resource.name,
			path: resource.path,
			message: "Extension starts long-lived work but has no `session_shutdown` cleanup handler.",
			suggestion: "Add a `session_shutdown` handler to close timers, watchers, servers, or connections.",
		});
	}

	if (source.includes("ctx.ui") && !source.includes("ctx.hasUI")) {
		findings.push({
			severity: "info",
			kind: "extension",
			name: resource.name,
			path: resource.path,
			message: "Extension uses UI methods without checking `ctx.hasUI`.",
			suggestion: "Guard interactive prompts/notifications for print, JSON, and RPC modes.",
		});
	}

	if (!source.endsWith("\n")) {
		findings.push({
			severity: "info",
			kind: "extension",
			name: resource.name,
			path: resource.path,
			message: "Extension file has no trailing newline.",
			suggestion: "Apply a safe hygiene upgrade that adds a final newline.",
			autoFixable: true,
		});
	}

	if (/[^\S\r\n]+$/m.test(source)) {
		findings.push({
			severity: "info",
			kind: "extension",
			name: resource.name,
			path: resource.path,
			message: "Extension file contains trailing whitespace.",
			suggestion: "Apply a safe hygiene upgrade that trims trailing whitespace.",
			autoFixable: true,
		});
	}

	const relatedMetrics = Object.values(metrics.tools).filter((metric) => metric.sourcePath === resource.path);
	for (const metric of relatedMetrics) {
		if (metric.calls < config.minCallsForPerformanceWarning) continue;
		const errorRate = metric.calls === 0 ? 0 : metric.errors / metric.calls;
		const averageMs = metric.totalMs / metric.calls;
		if (errorRate > config.maxErrorRateForTools) {
			findings.push({
				severity: "warning",
				kind: "performance",
				name: metric.toolName,
				path: resource.path,
				message: `Tool error rate is ${(errorRate * 100).toFixed(0)}% (${metric.errors}/${metric.calls}).`,
				suggestion: "Inspect recent failures, improve validation/error handling, and add clearer tool descriptions.",
			});
		}
		if (averageMs > config.maxAverageToolMs) {
			findings.push({
				severity: "warning",
				kind: "performance",
				name: metric.toolName,
				path: resource.path,
				message: `Tool average runtime is ${formatDuration(averageMs)} across ${metric.calls} calls.`,
				suggestion: "Cache repeated work, reduce shell calls, stream progress, or narrow expensive scans.",
			});
		}
	}

	if (resource.sizeBytes > 60_000) {
		findings.push({
			severity: "info",
			kind: "extension",
			name: resource.name,
			path: resource.path,
			message: `Extension file is large (${Math.round(resource.sizeBytes / 1024)}KB).`,
			suggestion: "Consider moving helpers into a directory-style extension with focused modules.",
		});
	}

	return findings;
}

async function runAudit(cwd: string, reason: AuditReason, metrics: MetricsStore, config: ImproverConfig): Promise<AuditResult> {
	const resources = await discoverResources(cwd);
	const findings: Finding[] = [];

	for (const resource of resources) {
		const resourceFindings = resource.kind === "skill"
			? await auditSkill(resource)
			: await auditExtension(resource, metrics, config);
		findings.push(...resourceFindings);
	}

	const visibleFindings = config.includeInfoFindings
		? findings
		: findings.filter((finding) => finding.severity !== "info");

	return {
		reason,
		cwd,
		generatedAt: new Date().toISOString(),
		resources,
		findings: visibleFindings,
		summary: {
			skills: resources.filter((resource) => resource.kind === "skill").length,
			extensions: resources.filter((resource) => resource.kind === "extension").length,
			errors: countBySeverity(visibleFindings, "error"),
			warnings: countBySeverity(visibleFindings, "warning"),
			infos: countBySeverity(visibleFindings, "info"),
		},
	};
}

function formatFinding(finding: Finding, cwd: string): string {
	const icon = finding.severity === "error" ? "❌" : finding.severity === "warning" ? "⚠️" : "ℹ️";
	const path = finding.path ? ` (${formatRelative(finding.path, cwd)})` : "";
	return `- ${icon} **${finding.kind}/${finding.name}**${path}: ${finding.message}\n  - Suggestion: ${finding.suggestion}`;
}

function formatMetrics(metrics: MetricsStore, cwd: string): string {
	const toolRows = Object.values(metrics.tools)
		.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
		.slice(0, 40);
	const skillRows = Object.values(metrics.skills)
		.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
		.slice(0, 40);

	const lines: string[] = [];
	lines.push("## Performance Metrics");
	lines.push("");
	lines.push(`Metrics file: \`${METRICS_PATH}\``);
	lines.push(`Updated: ${metrics.updatedAt}`);
	lines.push("");

	lines.push("### Tool telemetry");
	if (toolRows.length === 0) {
		lines.push("No tool telemetry recorded yet.");
	} else {
		lines.push("| Tool | Source | Calls | Errors | Avg | Max | Last |");
		lines.push("| --- | --- | ---: | ---: | ---: | ---: | --- |");
		for (const metric of toolRows) {
			const avg = metric.calls ? metric.totalMs / metric.calls : 0;
			const source = metric.sourcePath ? formatRelative(metric.sourcePath, cwd) : metric.source;
			lines.push(`| ${metric.toolName} | ${source} | ${metric.calls} | ${metric.errors} | ${formatDuration(avg)} | ${formatDuration(metric.maxMs)} | ${metric.lastUsedAt} |`);
		}
	}
	lines.push("");

	lines.push("### Skill telemetry");
	if (skillRows.length === 0) {
		lines.push("No skill telemetry recorded yet.");
	} else {
		lines.push("| Skill | Loads | Explicit invocations | Agent runs | Avg agent run | Last |");
		lines.push("| --- | ---: | ---: | ---: | ---: | --- |");
		for (const metric of skillRows) {
			const avg = metric.agentRuns ? metric.totalAgentMs / metric.agentRuns : 0;
			lines.push(`| ${metric.name} | ${metric.loads} | ${metric.explicitInvocations} | ${metric.agentRuns} | ${formatDuration(avg)} | ${metric.lastUsedAt} |`);
		}
	}

	return lines.join("\n");
}

function formatReport(result: AuditResult, metrics: MetricsStore): string {
	const lines: string[] = [];
	lines.push("# Skill & Extension Improvement Report");
	lines.push("");
	lines.push(`Generated: ${result.generatedAt}`);
	lines.push(`Reason: ${result.reason}`);
	lines.push(`CWD: \`${result.cwd}\``);
	lines.push(`Store: \`${STORE_DIR}\``);
	lines.push("");
	lines.push("## Summary");
	lines.push("");
	lines.push(`- Skills discovered: ${result.summary.skills}`);
	lines.push(`- Extensions discovered: ${result.summary.extensions}`);
	lines.push(`- Findings: ${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.infos} info`);
	lines.push("");
	lines.push("## Findings");
	lines.push("");
	if (result.findings.length === 0) {
		lines.push("No findings. Keep watching telemetry for regressions.");
	} else {
		const sorted = [...result.findings].sort((a, b) => {
			const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
			return order[a.severity] - order[b.severity] || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
		});
		for (const finding of sorted) lines.push(formatFinding(finding, result.cwd));
	}
	lines.push("");
	lines.push("## Resource Inventory");
	lines.push("");
	lines.push("| Kind | Name | Scope | Path |");
	lines.push("| --- | --- | --- | --- |");
	for (const resource of result.resources) {
		lines.push(`| ${resource.kind} | ${resource.name} | ${resource.scope} | ${formatRelative(resource.path, result.cwd)} |`);
	}
	lines.push("");
	lines.push(formatMetrics(metrics, result.cwd));
	lines.push("");
	lines.push("## How to improve safely");
	lines.push("");
	lines.push("1. Fix `error` findings first; missing skill descriptions can prevent loading entirely.");
	lines.push("2. Use telemetry to prioritize high-error or slow extension tools, especially setup/credential failures that should be solved in the owning resource.");
	lines.push("3. Prefer small, reviewable edits and run `/reload` after editing extensions or skills.");
	lines.push("4. Upgrade prompts never edit files unless the user accepts the prompt.");
	return lines.join("\n");
}

function severityRank(severity: Severity): number {
	return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}

function findingSuggestionKey(finding: Finding): string {
	return `finding:${finding.severity}:${finding.kind}:${finding.name}:${finding.path ?? ""}:${finding.message}`;
}

function suggestionFromFinding(finding: Finding): UpgradeSuggestion {
	return {
		key: findingSuggestionKey(finding),
		severity: finding.severity,
		title: `${finding.kind}/${finding.name}`,
		message: finding.message,
		action: finding.suggestion,
		path: finding.path,
		autoFixable: finding.autoFixable,
	};
}

function isExtensionToolMetric(metric: ToolMetric): boolean {
	if (metric.source === "builtin" || metric.source === "sdk") return false;
	if (metric.sourcePath?.startsWith("<builtin:")) return false;
	return true;
}

function uniquePaths(paths: Array<string | undefined>): string[] {
	return [...new Set(paths.filter((path): path is string => typeof path === "string" && path.length > 0))];
}

function findResourcePath(resources: ResourceInfo[], kind: ResourceKind, name: string): string | undefined {
	return resources.find((resource) => resource.kind === kind && resource.name === name)?.path;
}

function databaseConfigSetupError(text: string): boolean {
	return /No database config found|\.agent\/credentials\/database\.json|auth\/credentials\/database\.json|Invalid database config|Invalid or missing database type|missing (host|host or socket|user|password|type)/i.test(text);
}

function genericSetupOrCredentialsError(text: string): boolean {
	return /No .*config found|missing .*credentials?|missing .*config|credentials? .*missing|auth\/credentials|\.agent\/credentials|not configured/i.test(text);
}

function contextualToolUpgradeSuggestion(metric: ToolMetric, resources: ResourceInfo[]): UpgradeSuggestion | undefined {
	if (!metric.lastError) return undefined;
	const base = `${metric.sourcePath ?? metric.source}:${metric.toolName}`;
	const databaseSkillPath = findResourcePath(resources, "skill", "database");

	if (metric.toolName === "database_query" && databaseConfigSetupError(metric.lastError)) {
		const paths = uniquePaths([metric.sourcePath, databaseSkillPath]);
		return {
			key: `tool-setup:database:${base}`,
			severity: "warning",
			title: "Database skill/extension needs a credential setup workflow",
			message: `database_query could not run because project database credentials/config are missing or incomplete: ${metric.lastError}`,
			action: "Upgrade the database extension and database skill so a missing .agent/credentials/database.json starts a setup path: inspect common project sources (.env*, docker-compose*, framework config), ask the user before writing credentials, allow user-provided credentials, write .agent/credentials/database.json only with confirmation, redact secrets in all output, and offer another solution when credentials cannot be inferred.",
			path: paths[0],
			paths,
		};
	}

	if (genericSetupOrCredentialsError(metric.lastError)) {
		return {
			key: `tool-setup:${base}`,
			severity: "warning",
			title: `Extension tool ${metric.toolName} needs setup guidance`,
			message: `The tool failed because required configuration or credentials appear to be missing: ${metric.lastError}`,
			action: "Upgrade the owning skill/extension with a first-run setup workflow that discovers safe project config hints, asks the user for missing secrets, writes any credential file only after confirmation, and documents alternatives instead of repeatedly failing or creating a one-off recovery skill.",
			path: metric.sourcePath,
			paths: uniquePaths([metric.sourcePath]),
		};
	}

	return undefined;
}

function collectPerformanceSuggestions(metrics: MetricsStore, config: ImproverConfig, resources: ResourceInfo[]): UpgradeSuggestion[] {
	const suggestions: UpgradeSuggestion[] = [];
	for (const metric of Object.values(metrics.tools)) {
		if (!isExtensionToolMetric(metric)) continue;
		if (metric.calls === 0) continue;

		const averageMs = metric.totalMs / metric.calls;
		const errorRate = metric.errors / metric.calls;
		const base = `${metric.sourcePath ?? metric.source}:${metric.toolName}`;
		const contextual = contextualToolUpgradeSuggestion(metric, resources);

		if (contextual) {
			suggestions.push(contextual);
		} else if (metric.lastError || (metric.calls >= config.minCallsForPerformanceWarning && errorRate > config.maxErrorRateForTools)) {
			suggestions.push({
				key: `tool-error:${base}`,
				severity: "warning",
				title: `Extension tool ${metric.toolName} is failing`,
				message: metric.lastError
					? `Last failure: ${metric.lastError}`
					: `Error rate is ${(errorRate * 100).toFixed(0)}% (${metric.errors}/${metric.calls}).`,
				action: "Improve the owning skill/extension's validation, setup guidance, error messages, and recovery behavior. Prefer teaching the resource to solve its own recurring setup problem over creating a separate band-aid playbook.",
				path: metric.sourcePath,
				paths: uniquePaths([metric.sourcePath]),
			});
		}

		if (metric.lastMs > config.maxAverageToolMs || (metric.calls >= config.minCallsForPerformanceWarning && averageMs > config.maxAverageToolMs)) {
			suggestions.push({
				key: `tool-slow:${base}`,
				severity: "warning",
				title: `Extension tool ${metric.toolName} is slow`,
				message: `Last run took ${formatDuration(metric.lastMs)}; average is ${formatDuration(averageMs)} across ${metric.calls} call(s).`,
				action: "Improve the owning extension by caching repeated work, narrowing scans, streaming progress, or reducing shell/process startup overhead.",
				path: metric.sourcePath,
				paths: uniquePaths([metric.sourcePath]),
			});
		}
	}
	return suggestions.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

function collectUpgradeSuggestions(
	result: AuditResult,
	metrics: MetricsStore,
	config: ImproverConfig,
	emittedKeys: Set<string>,
	preferPerformance: boolean,
): UpgradeSuggestion[] {
	const findings = result.findings
		.filter((finding) => finding.severity !== "info" || finding.autoFixable)
		.map(suggestionFromFinding)
		.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
	const performance = collectPerformanceSuggestions(metrics, config, result.resources);
	const ordered = preferPerformance ? [...performance, ...findings] : [...findings, ...performance];
	return ordered.filter((suggestion) => !emittedKeys.has(suggestion.key));
}

function suggestionPaths(suggestion: UpgradeSuggestion): string[] {
	return suggestion.paths?.length ? suggestion.paths : uniquePaths([suggestion.path]);
}

function formatUpgradeSuggestion(suggestion: UpgradeSuggestion, cwd: string): string {
	const icon = suggestion.severity === "error" ? "❌" : suggestion.severity === "warning" ? "⚠️" : "ℹ️";
	const paths = suggestionPaths(suggestion);
	const lines = [
		"💡 Skill/extension upgrade prompt",
		"",
		`${icon} ${suggestion.title}`,
		"",
		suggestion.message,
		"",
		`Suggested change: ${suggestion.action}`,
	];
	if (paths.length === 1) lines.push("", `File: ${formatRelative(paths[0]!, cwd)}`);
	else if (paths.length > 1) lines.push("", "Files:", ...paths.map((path) => `- ${formatRelative(path, cwd)}`));
	lines.push("", `Report: ${REPORT_PATH}`);
	return lines.join("\n");
}

function formatSuggestionWidget(suggestion: UpgradeSuggestion, cwd: string): string[] {
	const paths = suggestionPaths(suggestion);
	const location = paths.length === 1
		? ` — ${formatRelative(paths[0]!, cwd)}`
		: paths.length > 1
			? ` — ${formatRelative(paths[0]!, cwd)} +${paths.length - 1} more`
			: "";
	return [
		`💡 Skill/extension upgrade prompt: ${suggestion.title}${location}`,
		`Suggested change: ${suggestion.action}`,
	];
}

async function writeReport(result: AuditResult, metrics: MetricsStore): Promise<void> {
	ensureStoreDir();
	await writeFile(REPORT_PATH, formatReport(result, metrics) + "\n", "utf-8");
}

function skillNameFromReadPath(path: string, knownSkills: ResourceInfo[], cwd: string): ResourceInfo | undefined {
	const cleaned = path.replace(/^@/, "");
	const absolute = resolve(cwd, cleaned);
	return knownSkills.find((skill) => {
		if (skill.path === absolute) return true;
		return absolute === skill.path || absolute.startsWith(dirname(skill.path) + "/");
	});
}

function updateSkillMetric(metrics: MetricsStore, name: string, patch: Partial<SkillMetric>): void {
	const now = new Date().toISOString();
	const current = metrics.skills[name] ?? {
		name,
		path: patch.path,
		loads: 0,
		explicitInvocations: 0,
		agentRuns: 0,
		totalAgentMs: 0,
		lastUsedAt: now,
	};
	metrics.skills[name] = {
		...current,
		...patch,
		loads: (current.loads ?? 0) + (patch.loads ?? 0),
		explicitInvocations: (current.explicitInvocations ?? 0) + (patch.explicitInvocations ?? 0),
		agentRuns: (current.agentRuns ?? 0) + (patch.agentRuns ?? 0),
		totalAgentMs: (current.totalAgentMs ?? 0) + (patch.totalAgentMs ?? 0),
		lastUsedAt: now,
	};
}

function extractToolResultText(result: unknown): string | undefined {
	const content = (result as any)?.content;
	if (Array.isArray(content)) {
		const text = content
			.map((item) => typeof item?.text === "string" ? item.text : "")
			.filter(Boolean)
			.join("\n")
			.trim();
		if (text) return redact(text).slice(0, 500);
	}
	return undefined;
}

function toolResultIndicatesError(result: unknown, isError: boolean): boolean {
	if (isError) return true;
	const details = (result as any)?.details;
	if (details?.error === true || (result as any)?.isError === true) return true;
	const text = extractToolResultText(result);
	return Boolean(text && /^(Error|Failed|Failure):/i.test(text));
}

function updateToolMetric(metrics: MetricsStore, key: string, patch: Omit<ToolMetric, "calls" | "errors" | "totalMs" | "maxMs" | "lastUsedAt"> & { durationMs: number; isError: boolean }): void {
	const now = new Date().toISOString();
	const current = metrics.tools[key] ?? {
		toolName: patch.toolName,
		source: patch.source,
		sourcePath: patch.sourcePath,
		calls: 0,
		errors: 0,
		totalMs: 0,
		maxMs: 0,
		lastMs: 0,
		lastUsedAt: now,
	};

	metrics.tools[key] = {
		...current,
		toolName: patch.toolName,
		source: patch.source,
		sourcePath: patch.sourcePath,
		calls: current.calls + 1,
		errors: current.errors + (patch.isError ? 1 : 0),
		totalMs: current.totalMs + patch.durationMs,
		maxMs: Math.max(current.maxMs, patch.durationMs),
		lastMs: patch.durationMs,
		lastUsedAt: now,
		lastError: patch.isError ? patch.lastError ?? current.lastError : undefined,
	};
}

async function applySafeHygieneFixes(resources: ResourceInfo[]): Promise<{ changed: string[]; skipped: string[] }> {
	const changed: string[] = [];
	const skipped: string[] = [];
	for (const resource of resources) {
		if (![".ts", ".js", ".md", ".mjs", ".cjs"].includes(extname(resource.path))) {
			skipped.push(resource.path);
			continue;
		}
		let original: string;
		try {
			original = await readFile(resource.path, "utf-8");
		} catch {
			skipped.push(resource.path);
			continue;
		}
		const fixed = original
			.replace(/[^\S\r\n]+$/gm, "")
			.replace(/\s*$/u, "\n");
		if (fixed !== original) {
			await writeFile(resource.path, fixed, "utf-8");
			changed.push(resource.path);
		}
	}
	return { changed, skipped };
}

export default function skillExtensionImprover(pi: ExtensionAPI) {
	let config = loadConfig();
	let metrics = loadMetrics();
	let knownSkills: ResourceInfo[] = [];
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	const toolStarts = new Map<string, ToolStart>();
	const emittedSuggestionKeys = new Set<string>();
	let pendingExplicitSkill: ExplicitSkillRun | undefined;
	let turnsSinceSuggestionCheck = 0;
	let lastSuggestionAt = 0;
	let performanceSuggestionPending = false;
	let monitoringPromptsDisabledForSession = false;

	function scheduleMetricsSave(): void {
		if (saveTimer) return;
		saveTimer = setTimeout(() => {
			saveTimer = undefined;
			saveMetrics(metrics);
		}, 1000);
	}

	async function auditAndPersist(cwd: string, reason: AuditReason): Promise<AuditResult> {
		config = loadConfig();
		if (saveTimer) {
			clearTimeout(saveTimer);
			saveTimer = undefined;
			saveMetrics(metrics);
		}
		metrics = loadMetrics();
		const result = await runAudit(cwd, reason, metrics, config);
		knownSkills = result.resources.filter((resource) => resource.kind === "skill");
		await writeReport(result, metrics);
		return result;
	}

	function emitUpgradeDetails(suggestion: UpgradeSuggestion, ctx: { cwd: string }): void {
		const paths = suggestionPaths(suggestion).map((path) => formatRelative(path, ctx.cwd));
		pi.sendMessage({
			customType: "skill-extension-improver-suggestion",
			content: formatUpgradeSuggestion(suggestion, ctx.cwd),
			display: true,
			details: {
				suggestion,
				path: paths.join(", ") || undefined,
				reportPath: REPORT_PATH,
			},
		});
	}

	function queueUpgradeTask(suggestion: UpgradeSuggestion, ctx: { cwd: string }): void {
		const paths = suggestionPaths(suggestion);
		const fileLine = paths.length === 0
			? ""
			: paths.length === 1
				? `\nTarget file: ${formatRelative(paths[0]!, ctx.cwd)}`
				: `\nTarget files:\n${paths.map((path) => `- ${formatRelative(path, ctx.cwd)}`).join("\n")}`;
		pi.sendUserMessage(
			`Please apply this Pi skill/extension upgrade that the background monitor recommended.\n\n` +
			`Finding: ${suggestion.title}\n` +
			`Problem: ${suggestion.message}\n` +
			`Upgrade: ${suggestion.action}${fileLine}\n\n` +
			`Before editing, read the target file(s). Improve the owning skill/extension rather than creating a one-off workaround, make the smallest safe change, validate extension loading if possible, and tell me whether /reload is needed.`,
			{ deliverAs: "followUp" },
		);
	}

	async function promptForUpgrade(
		suggestion: UpgradeSuggestion,
		result: AuditResult,
		ctx: { cwd: string; hasUI: boolean; ui: any },
	): Promise<void> {
		emittedSuggestionKeys.add(suggestion.key);
		lastSuggestionAt = Date.now();
		turnsSinceSuggestionCheck = 0;

		if (!ctx.hasUI) {
			emitUpgradeDetails(suggestion, ctx);
			return;
		}

		if (config.showPromptWidget) {
			ctx.ui.setWidget("skill-extension-improver-suggestion", formatSuggestionWidget(suggestion, ctx.cwd), { placement: "belowEditor" });
		}

		const upgradeLabel = suggestion.autoFixable ? "Apply safe upgrade now" : "Queue upgrade task now";
		const choice = await ctx.ui.select(
			`Skill/extension upgrade recommended\n\n${suggestion.title}\n\n${suggestion.message}\n\n${suggestion.action}`,
			[upgradeLabel, "Show details", "Not now", "Disable prompts this session"],
		);

		if (choice === upgradeLabel) {
			if (suggestion.autoFixable) {
				const targetResources = suggestion.path
					? result.resources.filter((resource) => resource.path === suggestion.path)
					: result.resources;
				const fixed = await applySafeHygieneFixes(targetResources);
				await auditAndPersist(ctx.cwd, "background");
				ctx.ui.notify(`Applied safe skill/extension upgrade to ${fixed.changed.length} file(s).`, "info");
				ctx.ui.setWidget("skill-extension-improver-suggestion", undefined);
				return;
			}

			queueUpgradeTask(suggestion, ctx);
			ctx.ui.notify("Queued skill/extension upgrade task.", "info");
			ctx.ui.setWidget("skill-extension-improver-suggestion", undefined);
			return;
		}

		if (choice === "Show details") {
			emitUpgradeDetails(suggestion, ctx);
			return;
		}

		if (choice === "Disable prompts this session") {
			monitoringPromptsDisabledForSession = true;
			ctx.ui.setWidget("skill-extension-improver-suggestion", undefined);
			ctx.ui.notify("Skill/extension upgrade prompts disabled for this session.", "info");
			return;
		}

		ctx.ui.setWidget("skill-extension-improver-suggestion", undefined);
	}

	pi.registerMessageRenderer("skill-extension-improver-report", (message, { expanded }, theme) => {
		const details = message.details as { reportPath?: string; summary?: AuditResult["summary"] } | undefined;
		const summary = details?.summary;
		let text = theme.fg("toolTitle", theme.bold("Skill & Extension Improvement Report"));
		if (summary) {
			text += `\n${theme.fg("dim", `${summary.skills} skills, ${summary.extensions} extensions, ${summary.errors} errors, ${summary.warnings} warnings, ${summary.infos} info`)}`;
		}
		if (details?.reportPath) text += `\n${theme.fg("muted", details.reportPath)}`;
		if (expanded && typeof message.content === "string") text += `\n\n${theme.fg("dim", message.content)}`;
		return new Text(text, 0, 0);
	});

	pi.registerMessageRenderer("skill-extension-improver-suggestion", (message, { expanded }, theme) => {
		const details = message.details as { suggestion?: UpgradeSuggestion; path?: string } | undefined;
		const suggestion = details?.suggestion;
		let text = theme.fg("accent", theme.bold("💡 Skill/extension upgrade prompt"));
		if (suggestion) {
			const color = suggestion.severity === "error" ? "error" : suggestion.severity === "warning" ? "warning" : "muted";
			text += `\n${theme.fg(color, suggestion.title)}`;
			text += `\n${theme.fg("dim", suggestion.action)}`;
		}
		if (details?.path) text += `\n${theme.fg("muted", details.path)}`;
		if (expanded && typeof message.content === "string") text += `\n\n${theme.fg("dim", message.content)}`;
		return new Text(text, 0, 0);
	});

	pi.on("session_start", async (event, ctx) => {
		config = loadConfig();
		if (!config.startupAudit) return;
		const result = await auditAndPersist(ctx.cwd, event.reason === "reload" ? "reload" : "startup");
		const status = result.summary.errors > 0
			? `improver: ${result.summary.errors} error(s)`
			: result.summary.warnings > 0
				? `improver: ${result.summary.warnings} warning(s)`
				: "improver: ok";
		if (ctx.hasUI) {
			ctx.ui.setStatus("skill-extension-improver", status);
			if (config.notifyOnFindings && (result.summary.errors > 0 || result.summary.warnings > 0)) {
				ctx.ui.notify(`Skill/extension audit: ${result.summary.errors} errors, ${result.summary.warnings} warnings. Report: ${REPORT_PATH}`, result.summary.errors > 0 ? "error" : "warning");
			}
		}
		pi.events.emit("skill-extension-improver:audit", { summary: result.summary, reportPath: REPORT_PATH });

	});

	pi.on("input", (event) => {
		const match = event.text.match(/^\s*\/skill:([a-z0-9-]+)/i);
		if (!match) return;
		const name = match[1]!;
		pendingExplicitSkill = { name };
		updateSkillMetric(metrics, name, { name, explicitInvocations: 1 });
		scheduleMetricsSave();
	});

	pi.on("agent_start", () => {
		if (pendingExplicitSkill) pendingExplicitSkill.startedAt = Date.now();
	});

	pi.on("agent_end", async (_event, ctx) => {
		let metricsChanged = false;
		if (pendingExplicitSkill?.startedAt) {
			updateSkillMetric(metrics, pendingExplicitSkill.name, {
				name: pendingExplicitSkill.name,
				agentRuns: 1,
				totalAgentMs: Date.now() - pendingExplicitSkill.startedAt,
			});
			metricsChanged = true;
		}
		pendingExplicitSkill = undefined;
		if (metricsChanged) scheduleMetricsSave();

		config = loadConfig();
		if (!config.continuousMonitoring) return;
		if (monitoringPromptsDisabledForSession) return;
		if (emittedSuggestionKeys.size >= config.maxPromptsPerSession) return;

		turnsSinceSuggestionCheck += 1;
		const dueToToolProblem = config.promptOnToolProblems && performanceSuggestionPending;
		const dueToInterval = turnsSinceSuggestionCheck >= Math.max(1, config.monitorTurnInterval);
		const dueToTime = Date.now() - lastSuggestionAt >= Math.max(0, config.minPromptIntervalMs);
		if (!dueToToolProblem && !dueToInterval) return;

		try {
			const result = await auditAndPersist(ctx.cwd, "background");
			const promptAllowed = dueToToolProblem || dueToTime;
			performanceSuggestionPending = false;
			if (!promptAllowed) {
				turnsSinceSuggestionCheck = 0;
				return;
			}
			const suggestions = collectUpgradeSuggestions(result, metrics, config, emittedSuggestionKeys, dueToToolProblem);
			const suggestion = suggestions[0];
			if (!suggestion) {
				turnsSinceSuggestionCheck = 0;
				return;
			}
			await promptForUpgrade(suggestion, result, ctx);
		} catch (error: any) {
			performanceSuggestionPending = false;
			if (ctx.hasUI) ctx.ui.notify(`Skill/extension background monitor failed: ${error.message}`, "warning");
		}
	});

	pi.on("tool_execution_start", (event) => {
		toolStarts.set(event.toolCallId, { toolName: event.toolName, startedAt: Date.now() });
	});

	pi.on("tool_call", (event, ctx) => {
		if (event.toolName !== "read") return;
		const input = event.input as { path?: unknown };
		if (typeof input.path !== "string") return;
		const skill = skillNameFromReadPath(input.path, knownSkills, ctx.cwd);
		if (!skill) return;
		updateSkillMetric(metrics, skill.name, { name: skill.name, path: skill.path, loads: 1 });
		scheduleMetricsSave();
	});

	pi.on("tool_execution_end", (event) => {
		const started = toolStarts.get(event.toolCallId);
		toolStarts.delete(event.toolCallId);
		const durationMs = started ? Date.now() - started.startedAt : 0;
		const tool = pi.getAllTools().find((candidate: any) => candidate.name === event.toolName) as any;
		const sourceInfo = tool?.sourceInfo ?? {};
		const source = String(sourceInfo.source ?? "unknown");
		const sourcePath = typeof sourceInfo.path === "string" ? sourceInfo.path : undefined;
		const key = `${sourcePath ?? source}::${event.toolName}`;
		const resultFailed = toolResultIndicatesError(event.result, Boolean(event.isError));
		const errorText = resultFailed ? extractToolResultText(event.result) ?? "Tool failed" : undefined;
		updateToolMetric(metrics, key, {
			toolName: event.toolName,
			source,
			sourcePath,
			durationMs,
			isError: resultFailed,
			lastMs: durationMs,
			lastError: errorText,
		});
		if (
			config.promptOnToolProblems &&
			source !== "builtin" &&
			source !== "sdk" &&
			!sourcePath?.startsWith("<builtin:") &&
			(resultFailed || durationMs > config.maxAverageToolMs)
		) {
			performanceSuggestionPending = true;
		}
		scheduleMetricsSave();
	});

	pi.on("session_shutdown", () => {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = undefined;
		saveMetrics(metrics);
	});

}
