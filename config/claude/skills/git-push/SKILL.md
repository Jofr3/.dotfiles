---
description: Stage all changes, create a short commit message, and push to remote
user_invocable: true
---

Stage all changes in the current git repository, generate a concise commit message, and push to the remote.

Steps:
1. Run `git status` to see all changed and untracked files
2. Run `git diff --stat` to understand what changed
3. Run `git log --oneline -3` to match the repo's commit message style
4. Stage all changes with `git add -A`
5. Generate a short, descriptive commit message summarizing the changes (1 line, imperative mood)
6. Commit with the generated message (include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`)
7. Push to the remote with `git push`
8. Report the commit hash and branch to the user

If there are no changes to commit, inform the user that the working tree is clean.
If the push fails, report the error and suggest next steps.
