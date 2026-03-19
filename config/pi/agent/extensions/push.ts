/**
 * Conventional Push Extension
 *
 * /push — Stage all changes, build a conventional commit message interactively, commit and push.
 * Follows https://www.conventionalcommits.org/en/v1.0.0/
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const TYPES = [
	"feat     — A new feature",
	"fix      — A bug fix",
	"docs     — Documentation only changes",
	"style    — Formatting, missing semi colons, etc.",
	"refactor — Code change that neither fixes a bug nor adds a feature",
	"perf     — A code change that improves performance",
	"test     — Adding missing tests or correcting existing tests",
	"build    — Changes to the build system or dependencies",
	"ci       — Changes to CI configuration files and scripts",
	"chore    — Other changes that don't modify src or test files",
	"revert   — Reverts a previous commit",
];

export default function (pi: ExtensionAPI) {
	pi.registerCommand("push", {
		description: "Stage, commit (conventional) and push current changes",
		handler: async (_args, ctx) => {
			// 1. Check for changes
			const status = await pi.exec("git", ["status", "--porcelain"], { cwd: ctx.cwd });
			if (status.code !== 0) {
				ctx.ui.notify("Not a git repository or git error", "error");
				return;
			}
			if (!status.stdout.trim()) {
				ctx.ui.notify("No changes to commit", "info");
				return;
			}

			// 2. Stage everything
			const add = await pi.exec("git", ["add", "-A"], { cwd: ctx.cwd });
			if (add.code !== 0) {
				ctx.ui.notify(`git add failed: ${add.stderr}`, "error");
				return;
			}

			// 3. Show staged diff summary
			const diff = await pi.exec("git", ["diff", "--cached", "--stat"], { cwd: ctx.cwd });
			ctx.ui.notify(diff.stdout.trim() || "Changes staged", "info");

			// 4. Select commit type
			const typeChoice = await ctx.ui.select("Commit type", TYPES);
			if (!typeChoice) return;
			const type = typeChoice.split(/\s/)[0];

			// 5. Optional scope
			const scope = await ctx.ui.input("Scope (optional, press Enter to skip)", "");

			// 6. Breaking change?
			const breaking = await ctx.ui.confirm("Breaking change?", "Is this a BREAKING CHANGE?");

			// 7. Description (required)
			const description = await ctx.ui.input("Short description", "");
			if (!description?.trim()) {
				ctx.ui.notify("Description is required — aborted", "warning");
				// Unstage
				await pi.exec("git", ["reset", "HEAD"], { cwd: ctx.cwd });
				return;
			}

			// 8. Optional body
			const body = await ctx.ui.editor("Commit body (optional, save empty to skip)", "");

			// 9. Build message
			const scopePart = scope?.trim() ? `(${scope.trim()})` : "";
			const bangPart = breaking ? "!" : "";
			let message = `${type}${scopePart}${bangPart}: ${description.trim()}`;

			if (body?.trim()) {
				message += `\n\n${body.trim()}`;
			}

			if (breaking) {
				message += `\n\nBREAKING CHANGE: ${description.trim()}`;
			}

			// 10. Confirm
			const confirmed = await ctx.ui.confirm("Commit & push?", message);
			if (!confirmed) {
				await pi.exec("git", ["reset", "HEAD"], { cwd: ctx.cwd });
				ctx.ui.notify("Aborted — changes unstaged", "info");
				return;
			}

			// 11. Commit
			const commit = await pi.exec("git", ["commit", "-m", message], { cwd: ctx.cwd });
			if (commit.code !== 0) {
				ctx.ui.notify(`Commit failed: ${commit.stderr}`, "error");
				return;
			}

			// 12. Push
			const push = await pi.exec("git", ["push"], { cwd: ctx.cwd });
			if (push.code !== 0) {
				ctx.ui.notify(`Push failed: ${push.stderr}`, "error");
				return;
			}

			ctx.ui.notify("✓ Committed and pushed!", "info");
		},
	});
}
