# Skill & Extension Improvement Report

Generated: 2026-05-20T06:02:07.425Z
Reason: background
CWD: `/home/jofre/projects/mult`
Store: `/home/jofre/.pi/agent/skill-extension-improver`

## Summary

- Skills discovered: 12
- Extensions discovered: 6
- Findings: 0 errors, 1 warnings, 3 info

## Findings

- ⚠️ **extension/database** (~/.pi/agent/extensions/database.ts): Extension starts long-lived work but has no `session_shutdown` cleanup handler.
  - Suggestion: Add a `session_shutdown` handler to close timers, watchers, servers, or connections.
- ℹ️ **extension/context7** (~/.pi/agent/extensions/context7.ts): Extension registers tools without `promptSnippet` metadata.
  - Suggestion: Add concise `promptSnippet` text so custom tools are better represented in the system prompt.
- ℹ️ **extension/database** (~/.pi/agent/extensions/database.ts): Extension uses UI methods without checking `ctx.hasUI`.
  - Suggestion: Guard interactive prompts/notifications for print, JSON, and RPC modes.
- ℹ️ **extension/sftp** (~/.pi/agent/extensions/sftp.ts): Extension uses UI methods without checking `ctx.hasUI`.
  - Suggestion: Guard interactive prompts/notifications for print, JSON, and RPC modes.

## Resource Inventory

| Kind | Name | Scope | Path |
| --- | --- | --- | --- |
| extension | agent-browser | global | ~/.pi/agent/extensions/agent-browser.ts |
| extension | context7 | global | ~/.pi/agent/extensions/context7.ts |
| extension | database | global | ~/.pi/agent/extensions/database.ts |
| extension | push | global | ~/.pi/agent/extensions/push.ts |
| extension | safeguard | global | ~/.pi/agent/extensions/safeguard.ts |
| extension | sftp | global | ~/.pi/agent/extensions/sftp.ts |
| skill | agent-browser | global | ~/.pi/agent/skills/agent-browser/SKILL.md |
| skill | context7 | global | ~/.pi/agent/skills/context7/SKILL.md |
| skill | database | global | ~/.pi/agent/skills/database/SKILL.md |
| skill | gitnexus-cli | global | ~/.agents/skills/gitnexus-cli/SKILL.md |
| skill | gitnexus-debugging | global | ~/.agents/skills/gitnexus-debugging/SKILL.md |
| skill | gitnexus-exploring | global | ~/.agents/skills/gitnexus-exploring/SKILL.md |
| skill | gitnexus-guide | global | ~/.agents/skills/gitnexus-guide/SKILL.md |
| skill | gitnexus-impact-analysis | global | ~/.agents/skills/gitnexus-impact-analysis/SKILL.md |
| skill | gitnexus-pr-review | global | ~/.agents/skills/gitnexus-pr-review/SKILL.md |
| skill | gitnexus-refactoring | global | ~/.agents/skills/gitnexus-refactoring/SKILL.md |
| skill | safeguard | global | ~/.pi/agent/skills/safeguard/SKILL.md |
| skill | sftp | global | ~/.pi/agent/skills/sftp/SKILL.md |

## Performance Metrics

Metrics file: `/home/jofre/.pi/agent/skill-extension-improver/metrics.json`
Updated: 2026-05-20T06:02:03.751Z

### Tool telemetry
| Tool | Source | Calls | Errors | Avg | Max | Last |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| bash | <builtin:bash> | 254 | 17 | 2.0s | 82.6s | 2026-05-20T06:02:02.751Z |
| read | <builtin:read> | 285 | 1 | 12ms | 99ms | 2026-05-20T06:01:49.999Z |
| edit | <builtin:edit> | 366 | 31 | 21ms | 208ms | 2026-05-20T06:01:29.516Z |
| write | <builtin:write> | 26 | 0 | 8ms | 16ms | 2026-05-19T15:06:13.515Z |
| context7_docs | ~/.pi/agent/extensions/context7.ts | 2 | 0 | 1.6s | 1.6s | 2026-05-19T10:57:12.656Z |
| context7_search | ~/.pi/agent/extensions/context7.ts | 2 | 0 | 1.3s | 1.5s | 2026-05-19T10:57:06.251Z |

### Skill telemetry
| Skill | Loads | Explicit invocations | Agent runs | Avg agent run | Last |
| --- | ---: | ---: | ---: | ---: | --- |
| bash-error-recovery-playbook | 6 | 0 | 0 | 0ms | 2026-05-20T05:58:14.868Z |
| nix-dotfiles-workflow | 2 | 0 | 0 | 0ms | 2026-05-19T19:06:20.253Z |
| context7 | 2 | 0 | 0 | 0ms | 2026-05-19T10:57:02.720Z |

## How to improve safely

1. Fix `error` findings first; missing skill descriptions can prevent loading entirely.
2. Use telemetry to prioritize high-error or slow extension tools, especially setup/credential failures that should be solved in the owning resource.
3. Prefer small, reviewable edits and run `/reload` after editing extensions or skills.
4. Upgrade prompts never edit files unless the user accepts the prompt.
