# Skill & Extension Improvement Report

Generated: 2026-05-15T13:01:43.524Z
Reason: background
CWD: `/home/jofre/.dotfiles`
Store: `/home/jofre/.pi/agent/skill-extension-improver`

## Summary

- Skills discovered: 13
- Extensions discovered: 8
- Findings: 0 errors, 0 warnings, 5 info

## Findings

- ℹ️ **extension/agent-browser** (~/.pi/agent/extensions/agent-browser.ts): Extension uses UI methods without checking `ctx.hasUI`.
  - Suggestion: Guard interactive prompts/notifications for print, JSON, and RPC modes.
- ℹ️ **extension/context7** (~/.pi/agent/extensions/context7.ts): Extension registers tools without `promptSnippet` metadata.
  - Suggestion: Add concise `promptSnippet` text so custom tools are better represented in the system prompt.
- ℹ️ **extension/database** (~/.pi/agent/extensions/database.ts): Extension uses UI methods without checking `ctx.hasUI`.
  - Suggestion: Guard interactive prompts/notifications for print, JSON, and RPC modes.
- ℹ️ **extension/sftp** (~/.pi/agent/extensions/sftp.ts): Extension uses UI methods without checking `ctx.hasUI`.
  - Suggestion: Guard interactive prompts/notifications for print, JSON, and RPC modes.
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
| skill | safeguard | global | ~/.pi/agent/skills/safeguard/SKILL.md |
| skill | sftp | global | ~/.pi/agent/skills/sftp/SKILL.md |

## Performance Metrics

Metrics file: `/home/jofre/.pi/agent/skill-extension-improver/metrics.json`
Updated: 2026-05-15T13:01:40.036Z

### Tool telemetry
| Tool | Source | Calls | Errors | Avg | Max | Last |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| bash | <builtin:bash> | 109 | 10 | 4.9s | 513.4s | 2026-05-15T13:01:39.036Z |
| write | <builtin:write> | 3 | 0 | 16ms | 41ms | 2026-05-15T12:59:15.647Z |
| read | <builtin:read> | 107 | 0 | 7ms | 113ms | 2026-05-15T12:58:20.360Z |
| edit | <builtin:edit> | 19 | 1 | 261ms | 2.6s | 2026-05-15T12:31:10.076Z |
| database_query | ~/.pi/agent/extensions/database.ts | 5 | 0 | 339ms | 403ms | 2026-05-15T12:30:54.666Z |
| agent_browser_snapshot | ~/.pi/agent/extensions/agent-browser.ts | 13 | 0 | 210ms | 314ms | 2026-05-15T09:23:38.084Z |
| agent_browser_run | ~/.pi/agent/extensions/agent-browser.ts | 13 | 0 | 419ms | 1.4s | 2026-05-15T09:23:36.112Z |
| agent_browser_open | ~/.pi/agent/extensions/agent-browser.ts | 8 | 0 | 1.2s | 2.2s | 2026-05-15T09:23:29.784Z |
| agent_browser_screenshot | ~/.pi/agent/extensions/agent-browser.ts | 1 | 0 | 2.6s | 2.6s | 2026-05-15T08:53:19.659Z |

### Skill telemetry
| Skill | Loads | Explicit invocations | Agent runs | Avg agent run | Last |
| --- | ---: | ---: | ---: | ---: | --- |
| sftp | 2 | 0 | 0 | 0ms | 2026-05-15T12:58:09.302Z |
| database | 1 | 0 | 0 | 0ms | 2026-05-15T12:58:09.302Z |
| gitnexus-debugging | 1 | 0 | 0 | 0ms | 2026-05-15T12:27:57.013Z |
| agent-browser | 1 | 3 | 3 | 81.6s | 2026-05-15T09:23:04.674Z |

## How to improve safely

1. Fix `error` findings first; missing skill descriptions can prevent loading entirely.
2. Use telemetry to prioritize high-error or slow extension tools.
3. Prefer small, reviewable edits and run `/reload` after editing extensions or skills.
4. Upgrade prompts never edit files unless the user accepts the prompt.
