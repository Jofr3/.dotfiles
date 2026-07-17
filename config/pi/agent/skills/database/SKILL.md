---
name: database
description: Run bounded MySQL/MariaDB or SQL Server/MSSQL queries with database_query, preferably through an explicitly approved one-shot 1Password JSON connection profile. Use for schema inspection, reads, mutations, and DDL without exposing credentials.
---

# Database Skill

Use `database_query` for project database work. Do not read `.env`, framework configuration, credential files, or application secrets to discover credentials. Do not create/rewrite credential files, put credentials or `op://` references in tool arguments, or fall back to `bash`, `mysql`, `sqlcmd`, application snippets, MCP Toolbox, or ad-hoc drivers.

## Preferred direct 1Password workflow

MCP Toolbox configuration is neither needed nor used for this flow. The LLM may use the current canonical project, conversation, and remembered context to choose among **bounded nonsecret metadata**, but titles, project names/paths, and profile labels are hints/display/scope metadata only. They never select or authorize a secret. The user's explicit grant approval for the exact displayed project/requirement/vault/item/field is the authorization boundary.

Perform these steps sequentially and wait for every result:

1. Ask the user to run `/onepassword-sm dynamic-enable` if dynamic mode is not active. Enabling requires TUI/RPC approval for metadata disclosure; JSON/print modes fail closed.
2. Call `database_profile_requirements({ profileName: "primary" })`. `profileName` is a short nonsecret label (`primary`, `reporting`, `staging`, etc.), not a 1Password title or lookup key.
3. Call `onepassword_list_vaults` and choose one emitted opaque `vaultId` handle from bounded metadata.
4. Call `onepassword_list_items({ vaultId, ... })` and choose one emitted opaque `itemId`. A title such as `project1_database` is only a model-visible hint.
5. Call `onepassword_list_fields({ vaultId, itemId, ... })` and choose the one field that fulfills role `connection-profile` under contract `pi.database.connection-profile/v1`.
6. Call `onepassword_grant_database_profile({ vaultId, itemId, fieldId, profileId })` using only the exact emitted handles and exact `profileId` from step 2. The approval shows canonical project/scope, profile label, fixed consumer/tool/purpose/role/contract, and selected vault/item/field metadata. It does not show a value, endpoint, password, raw 1Password ID, or `op://` reference.
7. **Stop the tool batch.** The approved grant is staged until that successful tool turn ends. Never place the grant and `database_query` in the same or a parallel tool batch.
8. In a mandatory later turn, call `database_query({ query: "SELECT ...", profileId })`.
9. Prepare and approve a new profile before every later dynamic query or retry. The first exact admitted attempt consumes the requirement/grant permanently, including denial/cancellation of required SQL confirmation, resolution/profile/client/query/output failure, timeout, or cancellation. Never retry an old `profileId`.
10. Run `/database-profile-clear` or `/onepassword-sm dynamic-disable` when finished.

Different databases and projects require separately prepared and approved profile IDs. Canonical full real paths scope projects; basenames and symlink spellings do not authorize access. Use different nonsecret labels for multiple databases in one project, but remember that labels remain non-authoritative.

## Supported dynamic profile contract

Dynamic mode supports **one selected 1Password field containing one complete flat versioned JSON profile**. The model maps that one selected field to the fixed `connection-profile` role. DSNs/connection URLs, separate-field mapping, nested resolvers, aliases, and project-controlled references are not supported.

MySQL/MariaDB (MariaDB uses canonical engine `mysql`):

```json
{"version":1,"engine":"mysql","host":"127.0.0.1","port":3306,"user":"app","password":"example-only","database":"appdb"}
```

A MySQL profile may use one absolute normalized `socket` instead of `host`.

SQL Server/MSSQL (MSSQL uses canonical engine `sqlserver`):

```json
{"version":1,"engine":"sqlserver","host":"db.example.test","port":1433,"user":"app","password":"example-only","database":"appdb","schema":"dbo","encrypt":true,"trustServerCertificate":false}
```

The parser allows exact known keys only, rejects duplicates/references/option-shaped routing values, requires an explicit SQL Server TLS decision, and caps the resolved profile at 32 KiB. The resolved JSON, password, and private reference remain inside trusted extension memory; they are not tool arguments/results/progress/errors/session entries/logs/files. Known profile scalar echoes are redacted from bounded client output.

## Query usage

```text
database_query({ query: "SHOW TABLES", profileId: "<exact newly approved profileId>" })
database_query({ query: "SELECT * FROM users LIMIT 10", profileId: "<exact newly approved profileId>" })
database_query({ query: "SELECT TOP 10 * FROM dbo.Users", profileId: "<exact newly approved profileId>" })
```

There is no model-controlled database/catalog override. To target another database, select and approve another profile. Database-account privileges remain the ultimate boundary against qualified cross-catalog queries.

## SQL and output safety

- A bounded lexer rejects malformed/ambiguous SQL, client metacommands, MySQL/MariaDB executable comments (`/*!...*/` and `/*M!...*/`), optimizer hints, unsupported MySQL quote/comment ambiguity, SQLCMD commands, excessive size/tokens/depth, and more than eight statements.
- Only a single plain `SELECT`-like statement, supported plain `EXPLAIN`, or MySQL `SHOW`/`DESCRIBE`/`DESC` with no detected risky syntax skips confirmation.
- Function-call syntax is always confirmation-required, including built-in/aggregate and user/stored/table-valued functions at any nesting depth. Do not assume a function-bearing `SELECT` is harmless.
- Sequence access, unquoted `@`/`@@` variables, assignment, `SELECT ... INTO`, `INTO OUTFILE`/`DUMPFILE`, `FOR UPDATE`/`FOR SHARE`, `LOCK IN SHARE MODE`, SQL Server table hints, nested stateful forms, mutations, DDL, administrative/unknown SQL, and multiple statements require extension-enforced approval for that invocation.
- This is a conservative lexical gate, not a full semantic proof. It cannot inspect server-side definitions such as views, computed columns, user-defined types, or row-level policies, so syntactically plain SQL can execute server-defined code indirectly. Explicit locking syntax is gated, but ordinary engine locks still depend on isolation, plans, privileges, and server configuration.
- Confirmation is available in TUI and RPC. Confirmation-required SQL fails closed in JSON/print/headless mode. Only literal `true` before the deadline is approval.
- The query limit is 64 KiB; execution timeout is 30 seconds and connection timeout is 5 seconds.
- Raw stdout/stderr are bounded at 256/64 KiB. Display is capped at 200 physical rows, 100 columns, 4 KiB per cell, and 32 KiB/500 lines. Full output is never persisted to a temporary file.
- Cancellation/timeout terminates the process group with bounded escalation. Mutating effects may be unknown; cancellation is not rollback.

## Protected legacy static compatibility

Omitting `profileId` retains compatibility with the exact current project's `.agent/credentials/database.json`, but only for a trusted project. The extension privately reads that file without caching, parent-directory search, creation, rewriting, or model exposure. It requires a current-UID-owned non-symlink regular file, one link, exact mode `0600`, and at most 32 KiB. Existing `type` aliases for MariaDB/MSSQL remain accepted; SQL Server defaults to encryption on and certificate trust off.

Never inspect this plaintext file with model tools and never bootstrap it from project source or `.env`. Prefer the approved 1Password workflow for new usage.

## Lifecycle and trust

Prepared requirements, discoveries, pending approvals, staged/armed grants, callbacks, and cached SDK/client references are invalidated on disable/clear, failed or retrying agent runs, tree navigation, compaction, session replacement/fork, reload, shutdown, and restart.

Pi's process-wide event bus is cooperative, not an authenticated extension boundary. Protocol IDs and exact consumer/tool/project/profile scopes prevent accidental MCP/cross-profile/cross-project use, but a malicious loaded extension can spoof or observe the bus and same-process data. Enable dynamic mode only when every loaded extension is trusted and the authenticated 1Password account is least-privilege.
