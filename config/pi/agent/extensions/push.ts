/**
 * Conventional Push Extension
 *
 * /push — Analyze current git changes from git status/diffs, create one or
 * more Conventional Commits when appropriate, and push.
 *
 * Commit messages are intentionally generated only from git artifacts. Session
 * conversation context is ignored, and the command does not prompt for commit
 * message review or confirmation.
 */

import { complete, type Message } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { formatSize, truncateHead, truncateTail } from "@mariozechner/pi-coding-agent";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const MAX_COMMITS = 8;

const CONVENTIONAL_TYPES = [
	"feat",
	"fix",
	"docs",
	"style",
	"refactor",
	"perf",
	"test",
	"build",
	"ci",
	"chore",
	"revert",
] as const;

const COMMIT_PLAN_SYSTEM_PROMPT = `You create excellent git commit plans from git diffs.

Return ONLY valid JSON. Do not wrap it in quotes or markdown fences.

Schema:
{"commits":[{"message":"<Conventional Commit message>","files":["<changed-file label>"]}]}

Rules:
- Base the plan and messages only on the provided git status, diffs, stats, and summaries
- Never use session/conversation context or unstated user intent
- Use recent git history only to match repository commit style, never as change content
- Use one commit unless the diff contains clearly independent changes that are safer and clearer as separate commits
- Split into multiple commits only when each commit is coherent and all listed files belong together
- Every changed-file label provided by the user must appear exactly once across the JSON
- Do not invent, omit, rename, or duplicate changed-file labels
- Each message must follow Conventional Commit format:
  <type>(optional-scope): <short imperative summary>
- type must be one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- first line should be <= 72 characters when possible
- use imperative mood ("add", "fix", "update", "remove")
- do not end the first line with a period
- use a scope when it is obvious from the changed area
- avoid generic scopes like src, app, lib, or code; use the domain/module/component/command or omit scope
- include an optional body only if it adds useful context from the diff
- never use generic summaries like "update project changes", "update files", "apply changes", or "misc changes"
- if behavior is hard to infer, name the specific module, command, route, component, or config changed
- never include explanations outside the JSON`;

interface GitSnapshot {
	status: string;
	nameStatus: string;
	stat: string;
	summary: string;
	diff: string;
	recentLog: string;
}

interface ChangeEntry {
	label: string;
	status: string;
	paths: string[];
}

interface PlannedCommit {
	message: string;
	files: string[];
	pathspecs: string[];
}

type CommandOutputTruncationMode = "head" | "tail";

function truncateCommandOutput(text: string, mode: CommandOutputTruncationMode = "tail"): string {
	const output = text.trim();
	if (!output) return "";

	const truncation = mode === "head" ? truncateHead(output) : truncateTail(output);
	if (!truncation.truncated) return output;

	const shownPosition = mode === "head" ? "first" : "last";
	const omittedLines = truncation.totalLines - truncation.outputLines;
	const omittedBytes = truncation.totalBytes - truncation.outputBytes;

	return `${truncation.content.trimEnd()}\n\n[Output truncated: showing ${shownPosition} ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.]`;
}

function commandOutput(result: { stdout: string; stderr: string }): string {
	return truncateCommandOutput(result.stderr || result.stdout);
}

function stripCodeFence(text: string): string {
	let result = text.trim();
	result = result.replace(/^```[a-zA-Z0-9_-]*\s*/, "");
	result = result.replace(/\s*```$/, "");
	return result.trim();
}

function isConventional(message: string): boolean {
	const firstLine = message.trim().split(/\r?\n/, 1)[0] ?? "";
	const typePattern = CONVENTIONAL_TYPES.join("|");
	return new RegExp(`^(${typePattern})(\\([^)]+\\))?!?: .+`).test(firstLine);
}

function commitSummary(message: string): string {
	const firstLine = message.trim().split(/\r?\n/, 1)[0] ?? "";
	const match = firstLine.match(/^[a-z]+(?:\([^)]+\))?!?:\s*(.+)$/i);
	return (match?.[1] ?? firstLine).trim().toLowerCase();
}

function isGenericCommitMessage(message: string): boolean {
	const summary = commitSummary(message).replace(/\.$/, "");
	return [
		/^(update|change|modify|adjust|improve|enhance) ((project|source|src|tracked) )?(changes|files|code|implementation|updates)$/,
		/^(apply|make) ((project|source|src) )?(changes|updates)$/,
		/^(misc|miscellaneous) (changes|updates)$/,
		/^(update|change|modify|adjust|improve|enhance) (project|source|src)$/,
		/^update .+ changes$/,
	].some((pattern) => pattern.test(summary));
}

function isAcceptableCommitMessage(message: string): boolean {
	return isConventional(message) && !isGenericCommitMessage(message);
}

function sanitizeCommitMessage(raw: string, fallback: string): string {
	let message = stripCodeFence(raw)
		.replace(/^commit message:\s*/i, "")
		.replace(/^message:\s*/i, "")
		.trim();

	// If the model included commentary, keep from the first conventional-looking line.
	const lines = message.split(/\r?\n/);
	const firstConventionalIndex = lines.findIndex((line) => isConventional(line));
	if (firstConventionalIndex > 0) {
		message = lines.slice(firstConventionalIndex).join("\n").trim();
	}

	message = message
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.join("\n")
		.replace(/^['"]|['"]$/g, "")
		.trim();

	return isAcceptableCommitMessage(message) ? message : fallback;
}

function parseChangeEntries(nameStatus: string): ChangeEntry[] {
	return nameStatus
		.split("\n")
		.map((line) => line.replace(/\r$/, ""))
		.filter(Boolean)
		.map((line) => {
			const parts = line.split("\t");
			const status = parts[0] ?? "";
			const changeType = status[0] ?? "";

			if ((changeType === "R" || changeType === "C") && parts.length >= 3) {
				const oldPath = parts[1] ?? "";
				const newPath = parts[2] ?? "";
				return {
					label: `${oldPath} -> ${newPath}`,
					status,
					paths: [oldPath, newPath].filter(Boolean),
				};
			}

			const path = parts[parts.length - 1] ?? "";
			return { label: path, status, paths: path ? [path] : [] };
		})
		.filter((change) => change.label && change.paths.length > 0);
}

function primaryPathsFromChanges(changes: ChangeEntry[]): string[] {
	return changes
		.map((change) => change.paths[change.paths.length - 1] ?? change.label)
		.filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}

function pathspecsFromChanges(changes: ChangeEntry[]): string[] {
	return uniqueStrings(changes.flatMap((change) => change.paths));
}

const GENERIC_PATH_SEGMENTS = new Set([
	".",
	"src",
	"source",
	"sources",
	"app",
	"apps",
	"lib",
	"libs",
	"pkg",
	"packages",
	"module",
	"modules",
]);

const GENERIC_FILE_STEMS = new Set([
	"index",
	"main",
	"default",
	"mod",
	"init",
	"__init__",
]);

const DIRECTORY_NOUNS: Record<string, string> = {
	commands: "command",
	components: "component",
	controllers: "controller",
	extensions: "extension",
	hooks: "hook",
	migrations: "migration",
	models: "model",
	pages: "page",
	plugins: "plugin",
	routes: "route",
	screens: "screen",
	scripts: "script",
	services: "service",
	skills: "skill",
	tests: "tests",
	tools: "tool",
	views: "view",
};

const SPECIAL_FILE_DESCRIPTIONS: Record<string, string> = {
	"cargo.lock": "cargo lockfile",
	"cargo.toml": "cargo manifest",
	"flake.lock": "flake lockfile",
	"flake.nix": "nix flake",
	"go.mod": "go module",
	"go.sum": "go checksums",
	"package-lock.json": "npm lockfile",
	"package.json": "package manifest",
	"pnpm-lock.yaml": "pnpm lockfile",
	"yarn.lock": "yarn lockfile",
};

function stripKnownExtension(fileName: string): string {
	return fileName.replace(/\.(test|spec)\.[^.]+$/i, "").replace(/\.[^.]+$/, "");
}

function humanizeSegment(segment: string): string {
	return stripKnownExtension(segment)
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_.-]+/g, " ")
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.trim()
		.toLowerCase();
}

function isGenericPathSegment(segment: string): boolean {
	return GENERIC_PATH_SEGMENTS.has(segment.trim().toLowerCase());
}

function meaningfulParent(parts: string[]): string | undefined {
	for (const part of [...parts].reverse()) {
		if (!isGenericPathSegment(part)) return part;
	}
	return undefined;
}

function describePath(path: string): string {
	const parts = path.split("/").filter(Boolean);
	const fileName = parts.pop() ?? path;
	const lowerFileName = fileName.toLowerCase();
	if (SPECIAL_FILE_DESCRIPTIONS[lowerFileName]) return SPECIAL_FILE_DESCRIPTIONS[lowerFileName];

	const stem = humanizeSegment(fileName);
	const parentRaw = meaningfulParent(parts);
	const parent = parentRaw ? humanizeSegment(parentRaw) : "";
	const parentNoun = parentRaw ? DIRECTORY_NOUNS[parentRaw.toLowerCase()] : undefined;

	if (!stem || GENERIC_FILE_STEMS.has(stem)) {
		return parent || stem || "tracked files";
	}
	if (parentNoun && !stem.endsWith(parentNoun)) {
		return `${stem} ${parentNoun}`;
	}
	if (parent && parent !== stem && !stem.includes(parent)) {
		return `${parent} ${stem}`;
	}
	return stem;
}

function joinSubjectParts(parts: string[]): string {
	const unique = uniqueStrings(parts.map((part) => part.trim()).filter(Boolean));
	if (unique.length === 0) return "tracked files";
	if (unique.length === 1) return unique[0];
	if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
	return `${unique[0]}, ${unique[1]} and ${unique.length - 2} more areas`;
}

function commonSubject(paths: string[]): string | undefined {
	const parents = paths
		.map((path) => meaningfulParent(path.split("/").filter(Boolean).slice(0, -1)))
		.filter((parent): parent is string => Boolean(parent));
	if (parents.length !== paths.length || parents.length === 0) return undefined;
	const first = parents[0];
	if (parents.every((parent) => parent === first)) return humanizeSegment(first);
	return undefined;
}

function fallbackSubject(changes: ChangeEntry[]): string {
	const paths = primaryPathsFromChanges(changes);
	if (paths.length === 0) return "tracked files";
	if (paths.length === 1) return describePath(paths[0]);
	return commonSubject(paths) ?? joinSubjectParts(paths.map(describePath));
}

function shortenSubject(subject: string, maxLength: number): string {
	if (subject.length <= maxLength) return subject;
	const shortened = subject.slice(0, Math.max(12, maxLength)).replace(/\s+\S*$/, "").trim();
	return shortened || subject.slice(0, Math.max(12, maxLength)).trim();
}

function inferAction(changes: ChangeEntry[], type: string, diff: string): string {
	const statuses = changes.map((change) => change.status[0] ?? "");
	if (statuses.length > 0 && statuses.every((status) => status === "A")) return "add";
	if (statuses.length > 0 && statuses.every((status) => status === "D")) return "remove";
	if (statuses.length > 0 && statuses.every((status) => status === "R")) return "rename";
	if (type === "fix") return "fix";
	if (type === "feat" && /\b(add|adds|added|new|introduce|implement|enable|support)\b/i.test(diff)) {
		return "add";
	}
	return "update";
}

function inferType(paths: string[], diff: string): string {
	const lowerText = diff.toLowerCase();
	if (paths.length > 0 && paths.every((path) => /(^|\/)(docs?|readme|changelog)|\.mdx?$/i.test(path))) {
		return "docs";
	}
	if (paths.length > 0 && paths.every((path) => /(^|\/)(test|tests|spec|__tests__)|\.(test|spec)\./i.test(path))) {
		return "test";
	}
	if (paths.some((path) => /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|flake\.lock|Cargo\.toml|go\.mod)$/i.test(path))) {
		return "build";
	}
	if (paths.some((path) => /(^|\/)(\.github|\.gitlab|ci|workflows)(\/|$)/i.test(path))) {
		return "ci";
	}
	if (/\b(fix|bug|error|regression|broken|issue)\b/.test(lowerText)) {
		return "fix";
	}
	if (/\b(add|implement|feature|support|enable)\b/.test(lowerText)) {
		return "feat";
	}
	if (/\b(refactor|cleanup|restructure|rename|move)\b/.test(lowerText)) {
		return "refactor";
	}
	return "chore";
}

function inferScope(paths: string[]): string | undefined {
	if (paths.length === 0) return undefined;
	const scopes = paths
		.map((path) => path.split("/").filter(Boolean).slice(0, -1).find((part) => !part.startsWith(".") && !isGenericPathSegment(part)))
		.filter((part): part is string => Boolean(part));
	if (scopes.length !== paths.length || scopes.length === 0) return undefined;
	const first = scopes[0];
	if (scopes.every((scope) => scope === first)) {
		return first.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
	}
	return undefined;
}

function fallbackCommitMessage(snapshot: GitSnapshot, changes: ChangeEntry[]): string {
	const paths = primaryPathsFromChanges(changes);
	const type = inferType(paths, snapshot.diff);
	const scope = inferScope(paths);
	const scopePart = scope ? `(${scope})` : "";
	const action = inferAction(changes, type, snapshot.diff);
	const prefix = `${type}${scopePart}: ${action} `;
	const subject = shortenSubject(fallbackSubject(changes), Math.max(20, 72 - prefix.length));
	return `${prefix}${subject}`;
}

function fallbackCommitPlan(snapshot: GitSnapshot, changes: ChangeEntry[]): PlannedCommit[] {
	return [
		{
			message: fallbackCommitMessage(snapshot, changes),
			files: changes.map((change) => change.label),
			pathspecs: pathspecsFromChanges(changes),
		},
	];
}

function buildChangeAliasMap(changes: ChangeEntry[]): Map<string, ChangeEntry> {
	const aliases = new Map<string, ChangeEntry>();
	const ambiguous = new Set<string>();
	const addAlias = (alias: string, change: ChangeEntry) => {
		if (!alias || ambiguous.has(alias)) return;
		const existing = aliases.get(alias);
		if (!existing) {
			aliases.set(alias, change);
			return;
		}
		if (existing !== change) {
			aliases.delete(alias);
			ambiguous.add(alias);
		}
	};

	for (const change of changes) {
		addAlias(change.label, change);
		for (const path of change.paths) addAlias(path, change);
	}

	return aliases;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonResponse(raw: string): unknown | undefined {
	const text = stripCodeFence(raw);
	try {
		return JSON.parse(text);
	} catch {
		// Continue with best-effort extraction below.
	}

	const objectStart = text.indexOf("{");
	const objectEnd = text.lastIndexOf("}");
	if (objectStart >= 0 && objectEnd > objectStart) {
		try {
			return JSON.parse(text.slice(objectStart, objectEnd + 1));
		} catch {
			// Continue with array extraction.
		}
	}

	const arrayStart = text.indexOf("[");
	const arrayEnd = text.lastIndexOf("]");
	if (arrayStart >= 0 && arrayEnd > arrayStart) {
		try {
			return JSON.parse(text.slice(arrayStart, arrayEnd + 1));
		} catch {
			return undefined;
		}
	}

	return undefined;
}

function normalizeCommitPlan(
	rawPlan: unknown,
	snapshot: GitSnapshot,
	changes: ChangeEntry[],
): PlannedCommit[] | undefined {
	const rawCommits = Array.isArray(rawPlan)
		? rawPlan
		: isRecord(rawPlan) && Array.isArray(rawPlan.commits)
			? rawPlan.commits
			: undefined;

	if (!rawCommits || rawCommits.length === 0 || rawCommits.length > MAX_COMMITS) {
		return undefined;
	}

	const aliases = buildChangeAliasMap(changes);
	const seen = new Set<string>();
	const planned: PlannedCommit[] = [];

	for (const rawCommit of rawCommits) {
		if (!isRecord(rawCommit)) return undefined;

		const rawFiles = Array.isArray(rawCommit.files)
			? rawCommit.files
			: Array.isArray(rawCommit.changes)
				? rawCommit.changes
				: Array.isArray(rawCommit.paths)
					? rawCommit.paths
					: undefined;

		if (!rawFiles || rawFiles.length === 0) return undefined;

		const commitChanges: ChangeEntry[] = [];
		for (const rawFile of rawFiles) {
			if (typeof rawFile !== "string") return undefined;
			const change = aliases.get(rawFile.trim());
			if (!change || seen.has(change.label)) return undefined;
			seen.add(change.label);
			commitChanges.push(change);
		}

		const fallback = fallbackCommitMessage(snapshot, commitChanges);
		const rawMessage = typeof rawCommit.message === "string" ? rawCommit.message : "";
		planned.push({
			message: sanitizeCommitMessage(rawMessage, fallback),
			files: commitChanges.map((change) => change.label),
			pathspecs: pathspecsFromChanges(commitChanges),
		});
	}

	if (seen.size !== changes.length) return undefined;
	return planned;
}

function buildPlanGenerationPrompt(
	snapshot: GitSnapshot,
	changes: ChangeEntry[],
	extraInstructions: string,
): string {
	const changedFiles = changes
		.map((change) => `- ${change.label} (${change.status})`)
		.join("\n");
	const instructions = extraInstructions.trim()
		? `\n\n## Direct /push arguments\n\n${extraInstructions.trim()}\n\nUse these only for grouping preferences or constraints. Never use them as source text for commit message content; derive messages from the git data above.`
		: "";
	const recentLog = snapshot.recentLog.trim()
		? `\n\n## Recent commit subjects (style reference only)\n\n\`\`\`\n${truncateCommandOutput(snapshot.recentLog, "head")}\n\`\`\``
		: "";

	return `Create a commit plan using ONLY the git information below.\n\n## Required changed-file labels\n\nEvery label in this list must appear exactly once in the JSON plan.\n\n${changedFiles}\n\n## Git status\n\n\`\`\`\n${truncateCommandOutput(snapshot.status, "head")}\n\`\`\`\n\n## Name status\n\n\`\`\`\n${truncateCommandOutput(snapshot.nameStatus, "head")}\n\`\`\`\n\n## Diff summary\n\n\`\`\`\n${truncateCommandOutput(snapshot.summary, "head")}\n\`\`\`\n\n## Diff stat\n\n\`\`\`\n${truncateCommandOutput(snapshot.stat, "head")}\n\`\`\`${recentLog}\n\n## Staged diff to analyze\n\n\`\`\`diff\n${truncateCommandOutput(snapshot.diff, "head")}\n\`\`\`${instructions}\n\nReturn the JSON commit plan now.`;
}

async function generateCommitPlan(
	ctx: any,
	snapshot: GitSnapshot,
	changes: ChangeEntry[],
	extraInstructions: string,
): Promise<PlannedCommit[]> {
	const fallback = fallbackCommitPlan(snapshot, changes);
	if (!ctx.model) {
		ctx.ui.notify("No model selected; using fallback single commit", "warning");
		return fallback;
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) {
		ctx.ui.notify(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error, "warning");
		return fallback;
	}

	const userMessage: Message = {
		role: "user",
		content: [{ type: "text", text: buildPlanGenerationPrompt(snapshot, changes, extraInstructions) }],
		timestamp: Date.now(),
	};

	const response = await complete(
		ctx.model,
		{ systemPrompt: COMMIT_PLAN_SYSTEM_PROMPT, messages: [userMessage] },
		{ apiKey: auth.apiKey, headers: auth.headers },
	);

	if (response.stopReason === "aborted") return fallback;

	const raw = response.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n");

	const parsed = parseJsonResponse(raw);
	const plan = parsed === undefined ? undefined : normalizeCommitPlan(parsed, snapshot, changes);
	if (!plan) {
		ctx.ui.notify("Could not parse a safe commit plan; using fallback single commit", "warning");
		return fallback;
	}

	return plan;
}

async function git(pi: ExtensionAPI, cwd: string, args: string[]) {
	return pi.exec("git", args, { cwd, timeout: 120_000 });
}

function parseShipArgs(args: string): { sourceBranch: string; targetBranch?: string } {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 1 && (parts[0] === "main" || parts[0] === "master")) {
		return { sourceBranch: "staging", targetBranch: parts[0] };
	}
	return {
		sourceBranch: parts[0] ?? "staging",
		targetBranch: parts[1],
	};
}

async function isSafeBranchName(pi: ExtensionAPI, cwd: string, branch: string): Promise<boolean> {
	if (
		!branch ||
		branch.startsWith("-") ||
		branch.includes("..") ||
		branch.includes("@{") ||
		branch.includes("\\") ||
		branch.includes("//") ||
		branch.endsWith("/")
	) {
		return false;
	}
	const check = await git(pi, cwd, ["check-ref-format", "--branch", branch]);
	return check.code === 0;
}

async function hasLocalBranch(pi: ExtensionAPI, cwd: string, branch: string): Promise<boolean> {
	const result = await git(pi, cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
	return result.code === 0;
}

async function hasRemoteBranch(
	pi: ExtensionAPI,
	cwd: string,
	branch: string,
	remote = "origin",
): Promise<boolean> {
	const result = await git(pi, cwd, [
		"show-ref",
		"--verify",
		"--quiet",
		`refs/remotes/${remote}/${branch}`,
	]);
	return result.code === 0;
}

async function resolveShipTarget(
	pi: ExtensionAPI,
	cwd: string,
	targetBranch?: string,
): Promise<string | undefined> {
	if (targetBranch) return targetBranch;
	for (const candidate of ["main", "master"]) {
		if (
			(await hasLocalBranch(pi, cwd, candidate)) ||
			(await hasRemoteBranch(pi, cwd, candidate))
		) {
			return candidate;
		}
	}
	return undefined;
}

async function resolveSourceRef(
	pi: ExtensionAPI,
	cwd: string,
	sourceBranch: string,
): Promise<string | undefined> {
	const local = await hasLocalBranch(pi, cwd, sourceBranch);
	const remote = await hasRemoteBranch(pi, cwd, sourceBranch);

	if (local && remote) {
		const unpushed = await git(pi, cwd, ["rev-list", "--count", `origin/${sourceBranch}..${sourceBranch}`]);
		const hasUnpushedLocalCommits = unpushed.code === 0 && Number(unpushed.stdout.trim()) > 0;
		return hasUnpushedLocalCommits ? sourceBranch : `origin/${sourceBranch}`;
	}
	if (remote) return `origin/${sourceBranch}`;
	if (local) return sourceBranch;
	return undefined;
}

async function checkoutTargetBranch(
	pi: ExtensionAPI,
	cwd: string,
	targetBranch: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const local = await hasLocalBranch(pi, cwd, targetBranch);
	const remote = await hasRemoteBranch(pi, cwd, targetBranch);
	if (!local && !remote) {
		return { ok: false, error: `Target branch '${targetBranch}' does not exist locally or on origin.` };
	}

	const checkout = local
		? await git(pi, cwd, ["checkout", targetBranch])
		: await git(pi, cwd, ["checkout", "--track", `origin/${targetBranch}`]);

	if (checkout.code !== 0) {
		return { ok: false, error: commandOutput(checkout) };
	}

	return { ok: true };
}

async function pullCurrentBranch(pi: ExtensionAPI, cwd: string, branch: string) {
	const upstream = await git(pi, cwd, [
		"rev-parse",
		"--abbrev-ref",
		"--symbolic-full-name",
		"@{u}",
	]);
	if (upstream.code === 0) {
		return git(pi, cwd, ["pull", "--ff-only"]);
	}
	if (await hasRemoteBranch(pi, cwd, branch)) {
		return git(pi, cwd, ["pull", "--ff-only", "origin", branch]);
	}
	return { code: 0, stdout: "", stderr: "" };
}

function literalPathspec(path: string): string {
	return `:(literal)${path}`;
}

async function stagePathspecs(
	pi: ExtensionAPI,
	repoRoot: string,
	tempDir: string,
	index: number,
	pathspecs: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	if (pathspecs.length === 0) {
		return { code: 1, stdout: "", stderr: "Planned commit has no files" };
	}

	const pathspecPath = join(tempDir, `pathspecs-${index}.txt`);
	writeFileSync(pathspecPath, `${pathspecs.map(literalPathspec).join("\0")}\0`, "utf-8");
	return git(pi, repoRoot, [
		"add",
		"-A",
		`--pathspec-from-file=${pathspecPath}`,
		"--pathspec-file-nul",
	]);
}

async function commitWithMessage(
	pi: ExtensionAPI,
	repoRoot: string,
	tempDir: string,
	index: number,
	message: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const messagePath = join(tempDir, `commit-message-${index}.txt`);
	writeFileSync(messagePath, `${message.trim()}\n`, "utf-8");
	return git(pi, repoRoot, ["commit", "-F", messagePath]);
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("push", {
		description: "Analyze git diff, create Conventional Commit(s), and push",
		handler: async (args: string, ctx) => {
			await ctx.waitForIdle();

			const root = await git(pi, ctx.cwd, ["rev-parse", "--show-toplevel"]);
			if (root.code !== 0) {
				ctx.ui.notify("Not a git repository", "error");
				return;
			}
			const repoRoot = root.stdout.trim();

			const statusBefore = await git(pi, repoRoot, ["status", "--porcelain=v1"]);
			if (statusBefore.code !== 0) {
				ctx.ui.notify(`git status failed: ${commandOutput(statusBefore)}`, "error");
				return;
			}
			if (!statusBefore.stdout.trim()) {
				ctx.ui.notify("No changes to commit", "info");
				return;
			}

			ctx.ui.notify("Staging changes...", "info");
			const add = await git(pi, repoRoot, ["add", "-A"]);
			if (add.code !== 0) {
				ctx.ui.notify(`git add failed: ${commandOutput(add)}`, "error");
				return;
			}

			const [status, nameStatus, stat, summary, diff, recentLog] = await Promise.all([
				git(pi, repoRoot, ["status", "--short"]),
				git(pi, repoRoot, ["diff", "--cached", "--name-status", "--find-renames"]),
				git(pi, repoRoot, ["diff", "--cached", "--stat"]),
				git(pi, repoRoot, ["diff", "--cached", "--summary", "--find-renames"]),
				git(pi, repoRoot, ["diff", "--cached", "--no-ext-diff", "--find-renames", "--unified=3"]),
				git(pi, repoRoot, ["log", "--oneline", "-n", "20"]),
			]);

			if (status.code !== 0) {
				ctx.ui.notify(`git status failed: ${commandOutput(status)}`, "error");
				return;
			}
			if (nameStatus.code !== 0 || !nameStatus.stdout.trim()) {
				ctx.ui.notify("No staged changes to commit after git add", "warning");
				return;
			}
			if (diff.code !== 0) {
				ctx.ui.notify(`git diff failed: ${commandOutput(diff)}`, "error");
				return;
			}

			const changes = parseChangeEntries(nameStatus.stdout);
			if (changes.length === 0) {
				ctx.ui.notify("Could not parse staged changes", "error");
				return;
			}

			const snapshot: GitSnapshot = {
				status: status.stdout,
				nameStatus: nameStatus.stdout,
				stat: stat.code === 0 ? stat.stdout : "",
				summary: summary.code === 0 ? summary.stdout : "",
				diff: diff.stdout,
				recentLog: recentLog.code === 0 ? recentLog.stdout : "",
			};

			ctx.ui.notify("Analyzing staged git diff for commit plan...", "info");
			const plan = await generateCommitPlan(ctx, snapshot, changes, args);
			const subjects = plan.map((commit) => commit.message.split(/\r?\n/, 1)[0]);
			ctx.ui.notify(`Creating ${plan.length} commit(s): ${subjects.join("; ")}`, "info");

			const tempDir = mkdtempSync(join(tmpdir(), "pi-push-"));
			const committedSubjects: string[] = [];
			try {
				if (plan.length === 1) {
					const commit = await commitWithMessage(pi, repoRoot, tempDir, 0, plan[0].message);
					if (commit.code !== 0) {
						ctx.ui.notify(`Commit failed: ${commandOutput(commit)}`, "error");
						return;
					}
					committedSubjects.push(subjects[0]);
				} else {
					const head = await git(pi, repoRoot, ["rev-parse", "--verify", "HEAD"]);
					if (head.code !== 0) {
						const singleCommit = fallbackCommitPlan(snapshot, changes)[0];
						ctx.ui.notify(
							"Repository has no HEAD; creating a single initial commit instead of multiple commits",
							"warning",
						);
						const commit = await commitWithMessage(pi, repoRoot, tempDir, 0, singleCommit.message);
						if (commit.code !== 0) {
							ctx.ui.notify(`Commit failed: ${commandOutput(commit)}`, "error");
							return;
						}
						committedSubjects.push(singleCommit.message.split(/\r?\n/, 1)[0]);
					} else {
						const reset = await git(pi, repoRoot, ["reset", "-q", "HEAD", "--"]);
						if (reset.code !== 0) {
							ctx.ui.notify(`Could not reset staged changes for multi-commit plan: ${commandOutput(reset)}`, "error");
							return;
						}

						for (const [index, plannedCommit] of plan.entries()) {
							const subject = plannedCommit.message.split(/\r?\n/, 1)[0];
							ctx.ui.notify(`Committing ${index + 1}/${plan.length}: ${subject}`, "info");

							const stage = await stagePathspecs(
								pi,
								repoRoot,
								tempDir,
								index,
								plannedCommit.pathspecs,
							);
							if (stage.code !== 0) {
								ctx.ui.notify(`Staging planned commit failed: ${commandOutput(stage)}`, "error");
								return;
							}

							const staged = await git(pi, repoRoot, ["diff", "--cached", "--name-status", "--find-renames"]);
							if (staged.code !== 0 || !staged.stdout.trim()) {
								ctx.ui.notify(`Planned commit ${index + 1} staged no changes`, "error");
								return;
							}

							const commit = await commitWithMessage(pi, repoRoot, tempDir, index, plannedCommit.message);
							if (commit.code !== 0) {
								ctx.ui.notify(`Commit failed: ${commandOutput(commit)}`, "error");
								return;
							}
							committedSubjects.push(subject);
						}
					}
				}
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}

			const remaining = await git(pi, repoRoot, ["status", "--porcelain=v1"]);
			if (remaining.code !== 0) {
				ctx.ui.notify(`git status failed after commit: ${commandOutput(remaining)}`, "error");
				return;
			}
			if (remaining.stdout.trim()) {
				ctx.ui.notify(
					`Committed ${committedSubjects.length} commit(s), but changes remain; not pushing.\n${truncateCommandOutput(remaining.stdout, "head")}`,
					"error",
				);
				return;
			}

			ctx.ui.notify("Pushing...", "info");
			const upstream = await git(pi, repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
			const pushArgs = upstream.code === 0 ? ["push"] : ["push", "-u", "origin", "HEAD"];
			const push = await git(pi, repoRoot, pushArgs);
			if (push.code !== 0) {
				ctx.ui.notify(`Push failed: ${commandOutput(push)}`, "error");
				return;
			}

			ctx.ui.notify(`✓ Committed ${committedSubjects.length} commit(s) and pushed: ${committedSubjects.join("; ")}`, "info");
		},
	});

	pi.registerCommand("ship", {
		description: "Merge staging into main/master and push the release branch",
		handler: async (args: string, ctx) => {
			await ctx.waitForIdle();

			const root = await git(pi, ctx.cwd, ["rev-parse", "--show-toplevel"]);
			if (root.code !== 0) {
				ctx.ui.notify("Not a git repository", "error");
				return;
			}
			const repoRoot = root.stdout.trim();

			const workingTree = await git(pi, repoRoot, ["status", "--porcelain=v1"]);
			if (workingTree.code !== 0) {
				ctx.ui.notify(`git status failed: ${commandOutput(workingTree)}`, "error");
				return;
			}
			if (workingTree.stdout.trim()) {
				ctx.ui.notify("Working tree is not clean. Commit, stash, or discard changes before /ship.", "error");
				return;
			}

			const { sourceBranch, targetBranch: requestedTarget } = parseShipArgs(args);
			if (!(await isSafeBranchName(pi, repoRoot, sourceBranch))) {
				ctx.ui.notify(`Invalid source branch: ${sourceBranch}`, "error");
				return;
			}
			if (requestedTarget && !(await isSafeBranchName(pi, repoRoot, requestedTarget))) {
				ctx.ui.notify(`Invalid target branch: ${requestedTarget}`, "error");
				return;
			}

			ctx.ui.notify("Fetching origin...", "info");
			const fetch = await git(pi, repoRoot, ["fetch", "--prune", "origin"]);
			if (fetch.code !== 0) {
				ctx.ui.notify(`git fetch failed: ${commandOutput(fetch)}`, "error");
				return;
			}

			const targetBranch = await resolveShipTarget(pi, repoRoot, requestedTarget);
			if (!targetBranch) {
				ctx.ui.notify("Could not find a main or master branch locally or on origin.", "error");
				return;
			}
			if (sourceBranch === targetBranch) {
				ctx.ui.notify("Source and target branches are the same; nothing to ship.", "warning");
				return;
			}

			const sourceRef = await resolveSourceRef(pi, repoRoot, sourceBranch);
			if (!sourceRef) {
				ctx.ui.notify(`Could not find source branch '${sourceBranch}' locally or on origin.`, "error");
				return;
			}

			if (ctx.hasUI) {
				const confirmed = await ctx.ui.confirm(
					"Ship changes?",
					`This will checkout '${targetBranch}', fast-forward it from origin if possible, merge '${sourceRef}' into it, then push '${targetBranch}'.`,
				);
				if (!confirmed) {
					ctx.ui.notify("Ship cancelled", "info");
					return;
				}
			}

			const checkout = await checkoutTargetBranch(pi, repoRoot, targetBranch);
			if (!checkout.ok) {
				ctx.ui.notify(`Checkout failed: ${checkout.error}`, "error");
				return;
			}

			ctx.ui.notify(`Updating ${targetBranch}...`, "info");
			const pull = await pullCurrentBranch(pi, repoRoot, targetBranch);
			if (pull.code !== 0) {
				ctx.ui.notify(`Could not fast-forward ${targetBranch}: ${commandOutput(pull)}`, "error");
				return;
			}

			ctx.ui.notify(`Merging ${sourceRef} into ${targetBranch}...`, "info");
			const merge = await git(pi, repoRoot, ["merge", "--no-edit", sourceRef]);
			if (merge.code !== 0) {
				ctx.ui.notify(
					`Merge failed. Resolve conflicts on '${targetBranch}', then commit/push manually.\n${commandOutput(merge)}`,
					"error",
				);
				return;
			}

			ctx.ui.notify(`Pushing ${targetBranch}...`, "info");
			const upstream = await git(pi, repoRoot, [
				"rev-parse",
				"--abbrev-ref",
				"--symbolic-full-name",
				"@{u}",
			]);
			const pushArgs = upstream.code === 0 ? ["push"] : ["push", "-u", "origin", targetBranch];
			const push = await git(pi, repoRoot, pushArgs);
			if (push.code !== 0) {
				ctx.ui.notify(`Push failed: ${commandOutput(push)}`, "error");
				return;
			}

			ctx.ui.notify(`✓ Shipped ${sourceRef} into ${targetBranch} and pushed`, "info");
		},
	});
}
