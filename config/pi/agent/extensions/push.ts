/**
 * Conventional Push Extension
 *
 * /push — Analyze current git changes, generate a Conventional Commit message,
 * commit all changes, and push.
 *
 * Fresh sessions generate the message from the staged diff. Existing sessions
 * generate the message primarily from conversation context, with git status/stat
 * as a sanity check.
 */

import { complete, type Message } from "@mariozechner/pi-ai";
import type { ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const MAX_DIFF_CHARS = 80_000;
const MAX_CONTEXT_CHARS = 60_000;

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

const COMMIT_MESSAGE_SYSTEM_PROMPT = `You write excellent Conventional Commit messages.

Return ONLY the commit message. Do not wrap it in quotes or markdown fences.

Format:
<type>(optional-scope): <short imperative summary>

Optional body after a blank line if it adds useful context.

Rules:
- type must be one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- first line should be <= 72 characters when possible
- use imperative mood ("add", "fix", "update", "remove")
- do not end the first line with a period
- use a scope when it is obvious from the changed area
- if changes are unrelated, choose the dominant intent and mention notable secondary changes in the body
- never include explanations outside the commit message`;

interface ConversationContext {
	fresh: boolean;
	text: string;
}

interface GitSnapshot {
	status: string;
	nameStatus: string;
	stat: string;
	diff: string;
}

function truncateEnd(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n[truncated: ${text.length - maxChars} more characters omitted]`;
}

function truncateStart(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `[truncated: ${text.length - maxChars} earlier characters omitted]\n\n${text.slice(-maxChars)}`;
}

function getConversationContext(ctx: any): ConversationContext {
	const branch = ctx.sessionManager.getBranch();
	const entries = branch.filter(
		(entry: SessionEntry): entry is SessionEntry & { type: "message" } => entry.type === "message",
	);
	const messages = entries.map((entry) => entry.message);
	const hasConversation = messages.some(
		(message: any) => message.role === "user" || message.role === "assistant",
	);

	if (!hasConversation) return { fresh: true, text: "" };

	const llmMessages = convertToLlm(messages);
	const conversationText = serializeConversation(llmMessages);
	return { fresh: false, text: truncateStart(conversationText, MAX_CONTEXT_CHARS) };
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

	return isConventional(message) ? message : fallback;
}

function pathsFromNameStatus(nameStatus: string): string[] {
	return nameStatus
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const parts = line.split("\t");
			return parts[parts.length - 1] ?? "";
		})
		.filter(Boolean);
}

function inferType(paths: string[], conversation: string, diff: string): string {
	const lowerText = `${conversation}\n${diff}`.toLowerCase();
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
		.map((path) => path.split("/")[0])
		.filter((part) => part && part !== "." && !part.startsWith("."));
	if (scopes.length === 0) return undefined;
	const first = scopes[0];
	if (scopes.every((scope) => scope === first)) {
		return first.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
	}
	return undefined;
}

function fallbackCommitMessage(snapshot: GitSnapshot, conversation: string): string {
	const paths = pathsFromNameStatus(snapshot.nameStatus);
	const type = inferType(paths, conversation, snapshot.diff);
	const scope = inferScope(paths);
	const scopePart = scope ? `(${scope})` : "";
	return `${type}${scopePart}: update project changes`;
}

function buildGenerationPrompt(snapshot: GitSnapshot, context: ConversationContext, extraInstructions: string): string {
	const shared = `## Git status\n\n\`\`\`\n${snapshot.status.trim()}\n\`\`\`\n\n## Changed files\n\n\`\`\`\n${snapshot.nameStatus.trim()}\n\`\`\`\n\n## Diff stat\n\n\`\`\`\n${snapshot.stat.trim()}\n\`\`\``;
	const instructions = extraInstructions.trim()
		? `\n\n## User-provided commit instructions\n\n${extraInstructions.trim()}`
		: "";

	if (context.fresh) {
		return `${shared}\n\n## Staged diff to analyze\n\n\`\`\`diff\n${truncateEnd(snapshot.diff, MAX_DIFF_CHARS)}\n\`\`\`${instructions}\n\nAnalyze the diff and produce the best Conventional Commit message.`;
	}

	return `${shared}\n\n## Conversation context\n\n${context.text}${instructions}\n\nUse the conversation context as the primary source for the commit message. Use the git status and diff stat only to verify the changed area and scope. Produce the best Conventional Commit message.`;
}

async function generateCommitMessage(
	ctx: any,
	snapshot: GitSnapshot,
	context: ConversationContext,
	extraInstructions: string,
): Promise<string> {
	const fallback = fallbackCommitMessage(snapshot, context.text);
	if (!ctx.model) {
		ctx.ui.notify("No model selected; using fallback commit message", "warning");
		return fallback;
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) {
		ctx.ui.notify(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error, "warning");
		return fallback;
	}

	const userMessage: Message = {
		role: "user",
		content: [{ type: "text", text: buildGenerationPrompt(snapshot, context, extraInstructions) }],
		timestamp: Date.now(),
	};

	const response = await complete(
		ctx.model,
		{ systemPrompt: COMMIT_MESSAGE_SYSTEM_PROMPT, messages: [userMessage] },
		{ apiKey: auth.apiKey, headers: auth.headers },
	);

	if (response.stopReason === "aborted") return fallback;

	const raw = response.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n");

	return sanitizeCommitMessage(raw, fallback);
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
		return { ok: false, error: checkout.stderr.trim() || checkout.stdout.trim() };
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

export default function (pi: ExtensionAPI) {
	pi.registerCommand("push", {
		description: "Analyze changes, create a Conventional Commit, commit, and push",
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
				ctx.ui.notify(`git status failed: ${statusBefore.stderr.trim()}`, "error");
				return;
			}
			if (!statusBefore.stdout.trim()) {
				ctx.ui.notify("No changes to commit", "info");
				return;
			}

			ctx.ui.notify("Staging changes...", "info");
			const add = await git(pi, repoRoot, ["add", "-A"]);
			if (add.code !== 0) {
				ctx.ui.notify(`git add failed: ${add.stderr.trim() || add.stdout.trim()}`, "error");
				return;
			}

			const [status, nameStatus, stat, diff] = await Promise.all([
				git(pi, repoRoot, ["status", "--short"]),
				git(pi, repoRoot, ["diff", "--cached", "--name-status", "--find-renames"]),
				git(pi, repoRoot, ["diff", "--cached", "--stat"]),
				git(pi, repoRoot, ["diff", "--cached", "--no-ext-diff", "--find-renames", "--unified=3"]),
			]);

			if (nameStatus.code !== 0 || !nameStatus.stdout.trim()) {
				ctx.ui.notify("No staged changes to commit after git add", "warning");
				return;
			}

			const context = getConversationContext(ctx);
			ctx.ui.notify(
				context.fresh
					? "Fresh session: analyzing staged diff for commit message..."
					: "Generating commit message from session context...",
				"info",
			);

			const snapshot: GitSnapshot = {
				status: status.stdout,
				nameStatus: nameStatus.stdout,
				stat: stat.stdout,
				diff: diff.stdout,
			};

			let commitMessage = await generateCommitMessage(ctx, snapshot, context, args);

			if (ctx.hasUI) {
				const edited = await ctx.ui.editor("Review commit message", commitMessage);
				if (edited === undefined || !edited.trim()) {
					ctx.ui.notify("Cancelled — changes remain staged", "info");
					return;
				}
				commitMessage = sanitizeCommitMessage(edited, fallbackCommitMessage(snapshot, context.text));

				const confirmed = await ctx.ui.confirm(
					"Commit and push?",
					`${commitMessage}\n\n${stat.stdout.trim()}`,
				);
				if (!confirmed) {
					ctx.ui.notify("Cancelled — changes remain staged", "info");
					return;
				}
			}

			const tempDir = mkdtempSync(join(tmpdir(), "pi-push-"));
			const messagePath = join(tempDir, "commit-message.txt");
			try {
				writeFileSync(messagePath, `${commitMessage.trim()}\n`, "utf-8");
				const commit = await git(pi, repoRoot, ["commit", "-F", messagePath]);
				if (commit.code !== 0) {
					ctx.ui.notify(`Commit failed: ${commit.stderr.trim() || commit.stdout.trim()}`, "error");
					return;
				}
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}

			ctx.ui.notify("Pushing...", "info");
			const upstream = await git(pi, repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
			const pushArgs = upstream.code === 0 ? ["push"] : ["push", "-u", "origin", "HEAD"];
			const push = await git(pi, repoRoot, pushArgs);
			if (push.code !== 0) {
				ctx.ui.notify(`Push failed: ${push.stderr.trim() || push.stdout.trim()}`, "error");
				return;
			}

			ctx.ui.notify(`✓ Committed and pushed: ${commitMessage.split(/\r?\n/, 1)[0]}`, "info");
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
				ctx.ui.notify(`git status failed: ${workingTree.stderr.trim()}`, "error");
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
				ctx.ui.notify(`git fetch failed: ${fetch.stderr.trim() || fetch.stdout.trim()}`, "error");
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
				ctx.ui.notify(`Could not fast-forward ${targetBranch}: ${pull.stderr.trim() || pull.stdout.trim()}`, "error");
				return;
			}

			ctx.ui.notify(`Merging ${sourceRef} into ${targetBranch}...`, "info");
			const merge = await git(pi, repoRoot, ["merge", "--no-edit", sourceRef]);
			if (merge.code !== 0) {
				ctx.ui.notify(
					`Merge failed. Resolve conflicts on '${targetBranch}', then commit/push manually.\n${merge.stderr.trim() || merge.stdout.trim()}`,
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
				ctx.ui.notify(`Push failed: ${push.stderr.trim() || push.stdout.trim()}`, "error");
				return;
			}

			ctx.ui.notify(`✓ Shipped ${sourceRef} into ${targetBranch} and pushed`, "info");
		},
	});
}
