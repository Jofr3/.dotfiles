# CLAUDE.md

This file guides agents working in this Pi runtime configuration directory.

## Overview

This is the runtime configuration/data directory for the Pi agent CLI, not Pi's main source repository. It does contain global TypeScript extensions, extension packages, skills, documentation, and mock/offline extension tests.

## Sensitive and excluded data

- `agent/auth.json` contains Anthropic OAuth credentials. Never inspect, print, modify, test with, or commit it.
- `agent/sessions/**` contains persisted conversations. Do not inspect it unless the user explicitly requests a session task and authorizes that access.
- Project `.agent/credentials/**`, resolver binding files, extension `.env*`, and real authentication values/references are sensitive. Do not inspect or copy them into prompts, tools, logs, tests, or documentation.
- Use fake clients/values for tests. Do not contact 1Password, Bitwarden, MCP, databases, or other external services during offline validation.

## Pi source and documentation

Pi source lives in `~/projects/pi-mono`. Installed documentation is under the active `@earendil-works/pi-coding-agent` package. For Pi extension work, read the relevant installed docs and linked examples completely before implementing.

Global extensions are auto-discovered from `agent/extensions/`. Plain TypeScript uses jiti and normally needs no build step. Canonical imports for the installed distribution are:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `@earendil-works/pi-ai`
- `typebox`
- Node.js built-ins

Extension packages may have their own pinned `package.json`, lockfile, `node_modules`, README, and offline test scripts. Do not install/update dependencies or access the network unless the user explicitly approves it.

## Local extensions

- `agent/extensions/bitwarden-secrets-manager/` — disabled-by-default Bitwarden metadata and protected in-memory resolver; `/bitwarden-sm`.
- `agent/extensions/context7.ts` — Context7 library search/documentation tools.
- `agent/extensions/database.ts` + `database-query/` — secure direct `database_query` for MySQL/MariaDB and SQL Server/MSSQL. Supports approved one-shot 1Password JSON profiles and protected legacy static configuration. Tools: `database_profile_requirements`, `database_query`; commands: `/database`, `/database-profile-clear`.
- `agent/extensions/dynamic-fleet.ts` — task-specific dynamic subagent orchestration via `dynamic_fleet`.
- `agent/extensions/firecrawl/` — lazy bounded Firecrawl SDK tools; `/firecrawl status`.
- `agent/extensions/mcp-toolbox/` — operator-allowlisted MCP Toolbox dispatcher with protected/dynamic resolver support; `/mcp-toolbox`.
- `agent/extensions/onepassword-secrets-manager/` — service-account-only protected static resolver, bounded metadata/search, TUI-only timed reveal, revocable Stagehand Login autofill, and distinct one-shot MCP/database grants; `/onepassword-sm`.
- `agent/extensions/push.ts` — `/push` Conventional Commit/push workflow and `/ship` staging-to-main merge/push.
- `agent/extensions/resource-toggler.ts` — `/toggle` session-only tool/skill/context prompt exposure controls; it does not unload modules.
- `agent/extensions/safeguard.ts` — configurable tool-call allow/block/confirm policy engine.
- `agent/extensions/sftp.ts` — project SFTP/FTP upload automation; `/sftp-push`, `/sftp-status`.
- `agent/extensions/stagehand/` — lazy session-scoped local/Browserbase browser automation.

See `EXTENSIONS.md` for the authoring guide and current workflow inventory.

## Direct `database_query` + 1Password rules

The preferred database flow is direct; MCP Toolbox configuration is unnecessary and must remain unchanged:

1. `/onepassword-sm dynamic-enable` with user metadata-disclosure approval.
2. `database_profile_requirements({ profileName })`; wait.
3. Sequential `onepassword_list_vaults` → `onepassword_list_items` → `onepassword_list_fields`, using only emitted opaque handles.
4. The model chooses the one field containing the documented atomic `pi.database.connection-profile/v1` JSON profile.
5. `onepassword_grant_database_profile({ vaultId, itemId, fieldId, profileId })`; explicit informed user approval.
6. End the tool turn. Only in a later turn call `database_query({ query, profileId })`.
7. Prepare and approve a fresh profile before every later dynamic query or retry; a consumed, cancelled, denied, or failed admitted attempt is never restored.

Project/conversation/memory context, item titles (for example `project1_database`), canonical paths, and profile labels are hints/display/scope metadata—not lookup keys and not authorization. Approval for the exact displayed project requirement and selected field is the boundary. Multiple projects/databases require separately scoped one-shot profiles.

Dynamic mode supports only one flat versioned JSON profile field, not DSNs or separate fields. Never place a value, password, JSON profile, DSN, host override, credential, or `op://` reference in model-visible arguments/results/session/logs. Never inspect `.env`, app config, or plaintext credential files to bootstrap database access. Never use raw clients or application snippets through `bash` as a fallback.

Omitting `profileId` preserves protected plaintext `.agent/credentials/database.json` compatibility for the exact trusted current project, but the extension reads it privately. Agents must not read, create, rewrite, search parent directories for, or expose that file.

`database_query` enforces SQL confirmation and fails closed without TUI/RPC approval for mutation, DDL, administrative, unknown, or multi-statement SQL. It also enforces query/time/output/row/column/cell/depth bounds and lifecycle invalidation. See:

- `agent/extensions/database-query/README.md`
- `agent/extensions/onepassword-secrets-manager/README.md`
- `agent/skills/database/SKILL.md`

## Trust boundary

Pi's process-wide extension event bus is cooperative, not authenticated. Protocol/project/tool/profile scoping prevents accidental cross-consumption but cannot isolate secrets from malicious loaded code. Treat every loaded global, project, package, and temporary extension as part of the trusted computing base. The database runner's minimal child password environment may be observable to same-UID/root processes; pinned in-process drivers are the documented remedy if that assumption is unacceptable.
