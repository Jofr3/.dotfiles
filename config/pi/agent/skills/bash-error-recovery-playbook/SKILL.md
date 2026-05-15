---
name: bash-error-recovery-playbook
description: Prevention and recovery checklist for bash tool errors: missing paths, no-output exit 1, quoting/cwd mistakes, and runtime dependency failures. Use whenever a bash command fails or before running fragile shell/PHP/search commands.
---

# Bash Error Recovery Playbook

Use this skill when a `bash` tool call returns non-zero, warnings on stderr, missing files/directories, or an unexpected empty result. Recover once with focused diagnostics instead of repeating the same command.

## First response to a bash failure

1. **Classify the failure**: missing path/cwd, normal no-result exit, quoting/globbing, dependency/runtime, permissions, or destructive-risk ambiguity.
2. **Verify context before retrying**: check `pwd`, the expected project root, and whether referenced files/directories exist.
3. **Retry the smallest corrected command** with explicit paths and quoting.
4. **Stop after 2 failed retries** and explain the blocker or ask for clarification.

## Prevention checklist

- Prefer `read` for file contents; use `bash` for discovery (`ls`, `find`, `rg`), git, tests, and build commands.
- Do not assume common directories (`public`, `routes`, `resources`) exist. Verify them or build an existing path list first.
- Quote paths and patterns. Avoid unquoted globs unless expansion is intended.
- Treat `rg`/`grep` exit code `1` as "no matches" only when that is expected; do not hide other errors.
- For PHP scripts, verify cwd, relative includes, `composer.json`, and `vendor/autoload.php` before execution.
- Ask before installing dependencies, running migrations, broad delete/update commands, or hitting production-like remote URLs.

## Recovery patterns

| Symptom | Likely cause | Recovery |
| --- | --- | --- |
| `rg: public: No such file or directory` | Assumed search dirs are absent or wrong cwd | Run `pwd`; list dirs; rerun `rg` only against paths that exist. |
| `rg: routes/resources: No such file or directory` | Command copied from a different project layout | Locate root with `git rev-parse --show-toplevel 2>/dev/null || pwd`; use actual directories. |
| `(no output) Command exited with code 1` | No matches from `rg`/`grep`, failed `test`, or quiet command failure | If no-result is acceptable, rerun with an explicit fallback message; otherwise inspect stderr/inputs. |
| `include_once(../connexio.php) Failed to open stream` | PHP relative include cannot resolve from current execution context | Verify the target file and run from the directory where the relative include resolves, or inspect/fix include paths. |
| `require(vendor/autoload.php) Failed to open stream` | Missing Composer dependencies or wrong cwd/include path | Check `composer.json` and `vendor/autoload.php`; ask before `composer install`; run from project root when appropriate. |

## Safe command templates

Verify context:

```bash
pwd
git rev-parse --show-toplevel 2>/dev/null || true
find . -maxdepth 2 -type d | sort | head -80
```

Search only existing directories:

```bash
paths=()
for p in public routes resources app config; do
  [ -e "$p" ] && paths+=("$p")
done
if ((${#paths[@]})); then
  rg -n "needle" "${paths[@]}" || { code=$?; [ "$code" -eq 1 ] && echo "no matches" || exit "$code"; }
else
  echo "No expected search directories exist under $(pwd)"
fi
```

Check PHP dependency/include context:

```bash
cd /path/to/project || exit
[ -f composer.json ] && ls -l composer.json vendor/autoload.php 2>/dev/null || true
php -l path/to/file.php
```

## When to ask for clarification

Ask the user before proceeding when:

- The correct project root or target environment is unclear.
- Recovery requires installing dependencies, modifying server state, or using credentials.
- A command targets a remote/prod-like URL and could have side effects.
- Empty output could mean either "not found" or a broken assumption.
- Two corrected attempts still fail.
