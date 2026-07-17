# Secure direct `database_query`

This directory implements the tools registered by `../database.ts`:

- `database_profile_requirements` — prepare one nonsecret, canonical-project-scoped profile requirement;
- `database_query` — execute bounded SQL through either an exact approved one-shot 1Password profile or protected legacy static configuration;
- `/database` — route editor SQL to `database_query` without exposing credentials;
- `/database-profile-clear` — revoke all current in-memory database requirements/callbacks/grants.

## Exact direct 1Password workflow

MCP Toolbox is unnecessary for this path. No MCP configuration is read, created, spoofed, or changed; existing MCP dynamic and protected static resolver behavior remains separate.

1. Configure exactly one 1Password authentication mode in the environment that launches Pi, using least-privilege vault access.
2. Run `/onepassword-sm dynamic-enable` and approve bounded safe metadata disclosure.
3. Call `database_profile_requirements({ profileName: "primary" })` and wait for its result. The label is nonsecret display/scope metadata.
4. Call `onepassword_list_vaults` and wait. Choose one emitted opaque `vaultId` from bounded metadata.
5. Call `onepassword_list_items({ vaultId, ... })` and wait. Choose one emitted opaque `itemId`.
6. Call `onepassword_list_fields({ vaultId, itemId, ... })` and wait. Choose the one field that contains the documented atomic JSON profile.
7. Call `onepassword_grant_database_profile({ vaultId, itemId, fieldId, profileId })` with exact emitted handles and the exact `profileId` from step 3.
8. Review the explicit approval. It shows canonical project path/scope, profile label, fixed consumer/tool/purpose/role/contract, vault/item/field metadata, and exact opaque requirement ID. It does not resolve or show the field value, endpoint, user, password, raw 1Password IDs, account selector, or private reference.
9. **End that tool turn.** The grant is staged and cannot be used during the grant turn. In a mandatory later turn (a later model/tool turn), call `database_query({ query: "SELECT ...", profileId })`.
10. Prepare and approve a fresh profile before every later dynamic query or retry. The first exact admitted `database_query` attempt permanently consumes the requirement/grant, including destructive-confirmation denial/cancellation, resolution/profile/client/query/output failure, timeout, or cancellation.
11. Run `/database-profile-clear` or `/onepassword-sm dynamic-disable` when finished.

An item title such as `project1_database`, project/conversation/memory context, canonical path, and `profileName` may help the LLM choose among metadata. They are **hints/display/scope metadata only—not lookup keys and not authorization**. Code never derives a vault/item/field from them. Explicit approval for the exact displayed field and requirement is the authorization boundary.

Requirements are scoped to the canonical full project realpath plus fixed `pi-database` consumer, `database_query` tool, `database.profile-json` purpose, profile label, `connection-profile` role, `pi.database.connection-profile/v1` contract, and fresh preparation ID. Same basenames differ; symlink aliases converge and scope is rechecked before execution. Different projects and multiple databases use separate labels, profile IDs, and one-shot approvals. There is no model-controlled database/catalog override.

## Atomic dynamic profile contract

Only **one selected 1Password field containing one complete flat JSON value** is supported dynamically. The model maps that one field to fixed role `connection-profile`. DSNs/connection URLs, separate-field mapping, aliases, nested resolvers, and project-controlled references are deliberately unsupported because they broaden parser semantics or create partial-grant/retry hazards.

MySQL/MariaDB (MariaDB uses canonical engine `mysql`):

```json
{"version":1,"engine":"mysql","host":"127.0.0.1","port":3306,"user":"app","password":"example-only","database":"appdb"}
```

A MySQL profile may use one absolute normalized `socket` instead of `host`. Its port defaults to 3306.

SQL Server/MSSQL (MSSQL uses canonical engine `sqlserver`):

```json
{"version":1,"engine":"sqlserver","host":"db.example.test","port":1433,"user":"app","password":"example-only","database":"appdb","schema":"dbo","encrypt":true,"trustServerCertificate":false}
```

SQL Server requires explicit port, `encrypt`, and `trustServerCertificate` fields. The parser enforces a 32 KiB profile and 8 KiB password limit, root depth one, exact known keys, unique keys, safe bounded routing strings, normalized socket paths, valid ports, and exact booleans. It rejects DSNs, aliases, nested data, malformed Unicode, `op://` values, option-shaped routing text, ambiguous host/socket combinations, and unknown keys.

The selected field is resolved only after grant approval and exact later admission. The full JSON, password, and private `op://` reference cross only trusted in-memory callbacks/parser/runner state. They never enter model-visible arguments/results/progress, Pi messages/session entries, approval/notification text, errors, logs, files, temporary files, or process argv. Output redaction covers the exact profile, password, and known raw/normalized/escaped profile scalar forms before session framing.

## SQL policy and confirmation

The extension enforces SQL policy inside `database_query.execute()` after Pi tool-call interception:

- query maximum: 64 KiB;
- lexer maximum: 20,000 tokens, eight statements, parenthesis depth 64, block-comment nesting depth 16 for SQL Server;
- rejects malformed/unclosed lexical forms, MySQL/MariaDB executable comments (`/*!...*/` and `/*M!...*/`), optimizer hints, or nested comments, MySQL backslash quote ambiguity, MySQL/SQLCMD client metacommands, `:!!`, SQLCMD variables/`GO`, controls, and unsupported ambiguity;
- implements MySQL's whitespace/control requirement for `--` comments, so `SELECT 1--1; DROP ...` is not misclassified as a comment-hidden read;
- only a single plain `SELECT`-like statement, supported plain `EXPLAIN`, or MySQL `SHOW`/`DESCRIBE`/`DESC` with no detected risky syntax avoids confirmation;
- function-call syntax is always confirmation-required, including built-in, aggregate, user/stored, quoted/qualified, table-valued, nested, CTE, and explained calls; functions are not assumed harmless;
- sequence access, unquoted `@`/`@@` variable syntax, assignment, `SELECT ... INTO`, `INTO OUTFILE`/`DUMPFILE`, `FOR UPDATE`/`FOR SHARE`, `LOCK IN SHARE MODE`, SQL Server table hints, and their nested forms require confirmation;
- mutation, DDL, administrative, unknown, and multiple statements also require per-invocation confirmation.

The skip decision is a conservative lexical policy, not a general SQL semantic proof. Strings, comments, and non-invoked quoted identifiers are inert to these checks. Recognized expression grouping, subqueries, `IN`/`EXISTS`, SQL Server `TOP`, and CTE column-list parentheses remain allowed. The lexer cannot inspect server-side definitions such as views, computed columns, user-defined types, or row-level policies; syntactically plain SQL can therefore execute server-defined code indirectly. Explicit locking syntax is gated, but the database engine may still take ordinary locks according to account privileges, isolation level, query plan, and server configuration.

Confirmation shows only nonsecret project/profile requirement metadata, classification, statement count, bounded SQL preview, and SQL SHA-256. Only literal `true` before the 30-second extension/UI deadline approves. TUI and RPC can present approval; JSON/print/headless modes fail closed. For a dynamic call, the one-shot requirement is atomically reserved before awaiting confirmation, so denial/cancellation cannot leave an approved grant reusable. Cancellation is not rollback; effects can be unknown after an interrupted or failed mutating operation.

Database-account privileges remain the ultimate boundary against qualified cross-catalog/schema access.

## Execution and output bounds

No pinned in-process MySQL and SQL Server drivers were already available, and no dependency/network installation was performed. The dependency-free executor therefore:

- admits only fixed absolute root-owned, non-group/world-writable `mysql`/`sqlcmd` executables, including a validated current-user `/etc/profiles/per-user/<account>/bin/` Nix profile candidate;
- uses `shell: false`, a detached process group where supported, and no inherited environment;
- puts SQL only on stdin, never in argv;
- puts the password only in a minimal child environment (`MYSQL_PWD` or `SQLCMDPASSWORD`), never in argv;
- uses an unambiguous named MySQL `--database=<value>` option and rejects option-shaped profile routing values;
- enforces a 5-second client connection timeout and 30-second host execution timeout;
- terminates on cancellation/timeout/overflow with `SIGTERM`, then bounded `SIGKILL` escalation;
- streams at most 256 KiB stdout and 64 KiB stderr into memory; raw stderr and caught error text are discarded;
- displays at most 200 physical rows, 100 tab-separated columns, 4 KiB per cell, and 32 KiB/500 lines;
- never writes a full-output spill or temporary file.

Client/runner result shapes and failure codes are validated and all unexpected throws are replaced with fixed `DatabaseQueryError` messages. CLI formatting provides bounded physical records, not perfect semantic SQL Server row/cell parsing.

### Residual executor assumptions

Passwords in child environment variables may be observable to same-UID/root processes on some operating systems. The `mysql`/`sqlcmd` binaries and versions are not package-pinned; runtime admission checks file ownership/permissions but not semantic version. If either assumption is unacceptable, leave database execution disabled until exact pinned in-process MySQL and SQL Server drivers are approved and installed offline. JavaScript/SDK/client strings and child environments cannot be deterministically zeroized.

## Protected legacy static compatibility

Omitting `profileId` retains narrow compatibility with `.agent/credentials/database.json` in the exact canonical current project. The project must be trusted. The extension does not search parent directories, cache, create, rewrite, or expose the file. It requires a current-UID-owned non-symlink regular file with exactly one link, exact mode `0600`, canonical path identity, stable before/after metadata, and at most 32 KiB.

Legacy `type` aliases (`mariadb`, `maria`, `mssql`, etc.) normalize to the same internal profile. SQL Server defaults to encryption enabled and certificate trust disabled. The same SQL, process, timeout, output, and redaction policy applies. The model must never inspect this plaintext file or bootstrap it from `.env`/application source.

A dynamic call with a `profileId` never falls back to static configuration on any failure.

## Lifecycle and trust model

Prepared requirements, pending resolver callbacks, discoveries, staged/armed grants, and approved profiles are memory-only. They are invalidated on requirement replacement/clear, dynamic disable, failed/aborted/logically failed turns, automatic retry, tree navigation, compaction, session replacement/fork, reload, shutdown, and process restart. Session shutdown clears state synchronously before bounded SDK/client drains.

Database and MCP handshakes use distinct protocols, channels, ID prefixes, consumers, purposes, roles, and stores. This enforces exact cooperative project/profile/tool isolation and prevents accidental MCP/database cross-consumption.

**Pi's process-wide event bus is not an authentication boundary.** Any malicious loaded extension can observe/spoof requirement or resolver events, inject a profile response, consume an armed grant, patch process APIs, or read same-process data. Absolute isolation from another loaded extension is impossible without Pi-provided private provenance/capability channels or process isolation. Enable this workflow only when all global, project, package, and temporary extensions are trusted; RPC approval additionally trusts the RPC host/client to present the prompt faithfully.

The official 1Password SDK decrypts a full item for field metadata/verification and may retain SDK/WASM copies; upstream memory/networking/telemetry/logging and inability to cancel/zeroize SDK work remain trust assumptions. See `../onepassword-secrets-manager/README.md` for those details.
