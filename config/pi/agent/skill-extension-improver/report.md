# Skill & Extension Improvement Report

Generated: 2026-05-19T12:35:44.298Z
Reason: background
CWD: `/home/jofre/lsw/ateinsa`
Store: `/home/jofre/.pi/agent/skill-extension-improver`

## Summary

- Skills discovered: 14
- Extensions discovered: 8
- Findings: 0 errors, 1 warnings, 5 info

## Findings

- ⚠️ **extension/database** (~/.pi/agent/extensions/database.ts): Extension starts long-lived work but has no `session_shutdown` cleanup handler.
  - Suggestion: Add a `session_shutdown` handler to close timers, watchers, servers, or connections.
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
Updated: 2026-05-19T12:35:36.898Z

### Tool telemetry
| Tool | Source | Calls | Errors | Avg | Max | Last |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| database_query | ~/.pi/agent/extensions/database.ts | 13 | 1 | 1.4s | 14.6s | 2026-05-19T12:35:35.898Z |
| read | <builtin:read> | 29 | 0 | 15ms | 46ms | 2026-05-19T12:34:14.318Z |
| bash | <builtin:bash> | 30 | 1 | 9.1s | 82.6s | 2026-05-19T11:04:48.956Z |
| edit | <builtin:edit> | 31 | 2 | 10ms | 30ms | 2026-05-19T11:04:18.285Z |
| write | <builtin:write> | 20 | 0 | 7ms | 12ms | 2026-05-19T11:02:26.956Z |
| context7_docs | ~/.pi/agent/extensions/context7.ts | 2 | 0 | 1.6s | 1.6s | 2026-05-19T10:57:12.656Z |
| context7_search | ~/.pi/agent/extensions/context7.ts | 2 | 0 | 1.3s | 1.5s | 2026-05-19T10:57:06.251Z |

### Skill telemetry
| Skill | Loads | Explicit invocations | Agent runs | Avg agent run | Last |
| --- | ---: | ---: | ---: | ---: | --- |
| database | 1 | 0 | 0 | 0ms | 2026-05-19T12:34:14.312Z |
| context7 | 2 | 0 | 0 | 0ms | 2026-05-19T10:57:02.720Z |
| bash-error-recovery-playbook | 1 | 0 | 0 | 0ms | 2026-05-19T10:46:40.423Z |
| nix-dotfiles-workflow | 1 | 0 | 0 | 0ms | 2026-05-19T09:04:37.531Z |

## How to improve safely

1. Fix `error` findings first; missing skill descriptions can prevent loading entirely.
2. Use telemetry to prioritize high-error or slow extension tools, especially setup/credential failures that should be solved in the owning resource.
3. Prefer small, reviewable edits and run `/reload` after editing extensions or skills.
4. Upgrade prompts never edit files unless the user accepts the prompt.
