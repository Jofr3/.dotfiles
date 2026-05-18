# Skill & Extension Improvement Report

Generated: 2026-05-18T11:14:31.719Z
Reason: background
CWD: `/home/jofre/lsw/renovacions`
Store: `/home/jofre/.pi/agent/skill-extension-improver`

## Summary

- Skills discovered: 14
- Extensions discovered: 8
- Findings: 0 errors, 0 warnings, 5 info

## Findings

- ℹ️ **extension/context7** (~/.pi/agent/extensions/context7.ts): Extension registers tools without `promptSnippet` metadata.
  - Suggestion: Add concise `promptSnippet` text so custom tools are better represented in the system prompt.
- ℹ️ **extension/database** (~/.pi/agent/extensions/database.ts): Extension uses UI methods without checking `ctx.hasUI`.
  - Suggestion: Guard interactive prompts/notifications for print, JSON, and RPC modes.
- ℹ️ **extension/sftp** (~/.pi/agent/extensions/sftp.ts): Extension uses UI methods without checking `ctx.hasUI`.
  - Suggestion: Guard interactive prompts/notifications for print, JSON, and RPC modes.
- ℹ️ **extension/workflow-opportunity-scout** (~/.pi/agent/extensions/workflow-opportunity-scout.ts): Extension file is large (59KB).
  - Suggestion: Consider moving helpers into a directory-style extension with focused modules.
- ℹ️ **skill/bash-error-recovery-playbook** (~/.pi/agent/skills/bash-error-recovery-playbook/SKILL.md): Skill description does not include an explicit use-case trigger.
  - Suggestion: Add wording like `Use when the user asks to ...` to improve selection.

## Resource Inventory

| Kind | Name | Scope | Path |
| --- | --- | --- | --- |
| extension | agent-browser | global | ~/.pi/agent/extensions/agent-browser.ts |
| extension | context7 | global | ~/.pi/agent/extensions/context7.ts |
| extension | database | global | ~/.pi/agent/extensions/database.ts |
| extension | push | global | ~/.pi/agent/extensions/push.ts |
| extension | safeguard | global | ~/.pi/agent/extensions/safeguard.ts |
| extension | sftp | global | ~/.pi/agent/extensions/sftp.ts |
| extension | skill-extension-improver | global | ~/.pi/agent/extensions/skill-extension-improver.ts |
| extension | workflow-opportunity-scout | global | ~/.pi/agent/extensions/workflow-opportunity-scout.ts |
| skill | agent-browser | global | ~/.pi/agent/skills/agent-browser/SKILL.md |
| skill | bash-error-recovery-playbook | global | ~/.pi/agent/skills/bash-error-recovery-playbook/SKILL.md |
| skill | context7 | global | ~/.pi/agent/skills/context7/SKILL.md |
| skill | database | global | ~/.pi/agent/skills/database/SKILL.md |
| skill | gitnexus-cli | global | ~/.agents/skills/gitnexus-cli/SKILL.md |
| skill | gitnexus-debugging | global | ~/.agents/skills/gitnexus-debugging/SKILL.md |
| skill | gitnexus-exploring | global | ~/.agents/skills/gitnexus-exploring/SKILL.md |
| skill | gitnexus-guide | global | ~/.agents/skills/gitnexus-guide/SKILL.md |
| skill | gitnexus-impact-analysis | global | ~/.agents/skills/gitnexus-impact-analysis/SKILL.md |
| skill | gitnexus-pr-review | global | ~/.agents/skills/gitnexus-pr-review/SKILL.md |
| skill | gitnexus-refactoring | global | ~/.agents/skills/gitnexus-refactoring/SKILL.md |
| skill | nix-dotfiles-workflow | global | ~/.pi/agent/skills/nix-dotfiles-workflow/SKILL.md |
| skill | safeguard | global | ~/.pi/agent/skills/safeguard/SKILL.md |
| skill | sftp | global | ~/.pi/agent/skills/sftp/SKILL.md |

## Performance Metrics

Metrics file: `/home/jofre/.pi/agent/skill-extension-improver/metrics.json`
Updated: 2026-05-18T11:13:37.958Z

### Tool telemetry
| Tool | Source | Calls | Errors | Avg | Max | Last |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| read | <builtin:read> | 307 | 1 | 7ms | 113ms | 2026-05-18T11:13:36.958Z |
| bash | <builtin:bash> | 241 | 16 | 2.5s | 513.4s | 2026-05-18T11:13:34.830Z |
| edit | <builtin:edit> | 103 | 3 | 381ms | 7.6s | 2026-05-18T11:03:32.400Z |
| database_query | ~/.pi/agent/extensions/database.ts | 17 | 0 | 301ms | 459ms | 2026-05-18T11:02:19.820Z |
| agent_browser_eval | ~/.pi/agent/extensions/agent-browser.ts | 6 | 0 | 166ms | 172ms | 2026-05-18T07:57:28.483Z |
| agent_browser_screenshot | ~/.pi/agent/extensions/agent-browser.ts | 14 | 0 | 9.1s | 30.2s | 2026-05-18T07:57:03.471Z |
| agent_browser_run | ~/.pi/agent/extensions/agent-browser.ts | 31 | 0 | 295ms | 1.4s | 2026-05-18T07:56:12.173Z |
| agent_browser_batch | ~/.pi/agent/extensions/agent-browser.ts | 7 | 0 | 8.6s | 35.7s | 2026-05-18T07:52:01.391Z |
| write | <builtin:write> | 4 | 0 | 13ms | 41ms | 2026-05-18T07:24:42.685Z |
| agent_browser_snapshot | ~/.pi/agent/extensions/agent-browser.ts | 14 | 0 | 207ms | 314ms | 2026-05-18T06:59:00.638Z |
| agent_browser_open | ~/.pi/agent/extensions/agent-browser.ts | 9 | 0 | 1.2s | 2.2s | 2026-05-18T06:58:58.857Z |

### Skill telemetry
| Skill | Loads | Explicit invocations | Agent runs | Avg agent run | Last |
| --- | ---: | ---: | ---: | ---: | --- |
| bash-error-recovery-playbook | 4 | 0 | 0 | 0ms | 2026-05-18T11:03:39.432Z |
| sftp | 5 | 0 | 0 | 0ms | 2026-05-18T11:03:17.190Z |
| gitnexus-debugging | 4 | 0 | 0 | 0ms | 2026-05-18T11:01:32.755Z |
| agent-browser | 3 | 3 | 3 | 81.6s | 2026-05-18T06:58:52.001Z |
| database | 3 | 0 | 0 | 0ms | 2026-05-18T06:47:29.397Z |

## How to improve safely

1. Fix `error` findings first; missing skill descriptions can prevent loading entirely.
2. Use telemetry to prioritize high-error or slow extension tools, especially setup/credential failures that should be solved in the owning resource.
3. Prefer small, reviewable edits and run `/reload` after editing extensions or skills.
4. Upgrade prompts never edit files unless the user accepts the prompt.
