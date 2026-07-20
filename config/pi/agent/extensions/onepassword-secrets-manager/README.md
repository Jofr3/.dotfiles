# Dynamic 1Password for Pi

A service-account-only global Pi extension backed by pinned `@1password/sdk@0.4.0`.

Dynamic mode is enabled **by default during extension registration**. There is no startup consent command, static binding mode, resolver binding-file load, desktop authentication, or configured item mapping. Authentication and network access remain lazy until a dynamic metadata or approved secret operation is actually called. Every secret handoff still requires exact one-shot approval.

The model dynamically discovers bounded safe vault/item/field metadata. Secret values never enter tool arguments, results, details, progress, messages, event payloads, session entries, notifications, statuses, logs, files, temporary files, or commands. A value may leave the manager only through an exact approved one-shot consumer callback, a confirmed temporary TUI reveal, or a confirmed origin-checked Stagehand login lease.

## Pi surface

Always registered:

- `onepassword_sm_status` — safe offline status only
- `/onepassword-sm status`
- `/onepassword-sm disable` — revoke dynamic mode for the current extension instance
- `/onepassword-sm enable` — re-enable dynamic mode after manual disable

Registered and active by default:

- `onepassword_list_vaults`
- `onepassword_list_items`
- `onepassword_search_items`
- `onepassword_list_fields`
- `onepassword_grant_secret`
- `onepassword_grant_database_profile`
- `onepassword_reveal_field`
- `onepassword_fill_login`

Default activation is in-memory and offline. It does not inspect `OP_SERVICE_ACCOUNT_TOKEN`, import the SDK, create a client, authenticate, list metadata, resolve a value, read a binding file, or contact 1Password.

## Install

```bash
cd ~/.pi/agent/extensions/onepassword-secrets-manager
npm ci --ignore-scripts
```

Requires Node.js `>=22.19.0`.

## Authentication

Only a 1Password service account is supported. Use a dedicated least-privilege account restricted to the minimum vaults/items, then launch Pi with:

```bash
export OP_SERVICE_ACCOUNT_TOKEN
pi
```

Set the token outside Pi. Never place it in prompts, tool arguments, slash commands, MCP configuration, project files, `.env`, resolver bindings, or session data.

Status checks only whether the environment variable is present. It does not read or validate the token. The first accepted dynamic metadata or secret operation lazily validates the environment, imports the pinned SDK, and calls `createClient`.

The runtime retains only these official SDK methods:

- `client.vaults.list`
- `client.items.list`
- `client.items.get`
- `client.secrets.resolve`
- `Secrets.validateSecretReference`

No write, archive, delete, share, group, batch, or file API is exposed.

## Default dynamic metadata disclosure

Because dynamic mode is default-on, the active model may call the metadata tools without a separate enable confirmation. Their sanitized results are sent to the active model, appear in tool/RPC events, and are normally persisted in the Pi session.

Possible disclosed metadata is strictly bounded:

- vault: opaque epoch handle, title, type, active item count;
- item: opaque epoch handle, title, category, state;
- field: opaque epoch handle, title, field type, optional section title/opaque handle;
- MCP requirement: configured server/tool IDs, target kind/name, derived purpose, opaque requirement ID;
- database requirement: canonical project/scope metadata, profile label, fixed contract metadata, opaque profile ID.

Descriptions, dates, versions, websites, tags, notes, files, document metadata, raw 1Password IDs, secret references, field values, field details, credentials, and service-account data are not emitted.

Handles are keyed session-epoch values, not raw 1Password IDs. They are invalidated and re-keyed on reset. The model cannot compose an `op://` reference from them.

`onepassword_search_items` performs bounded local title matching across at most 20 vaults and 1,000 item overviews, returning at most 50 matches. The query is not sent to 1Password as a server-side search expression.

## Dynamic MCP Toolbox workflow

MCP Toolbox permits only the exact value-free dynamic credential marker:

```json
{
  "resolver": {
    "provider": "onepassword-secrets-manager",
    "dynamic": true
  }
}
```

No vault, item, field, title, slot, value, environment variable, or `op://` reference is configured.

Workflow:

1. Call `mcp_toolbox_requirements` with the exact configured server/tool.
2. Wait for the result and use only an emitted `requirementId`.
3. Call `onepassword_search_items`, or list vaults then items, to discover metadata dynamically.
4. Call `onepassword_list_fields` with exact emitted handles.
5. Call `onepassword_grant_secret` with exact vault/item/field handles and the prior requirement ID.
6. Review the verified MCP server/tool/target and selected 1Password metadata, then approve.
7. Wait for the successful tool turn to end.
8. In a **later tool turn**, call `mcp_toolbox_call` with ordinary arguments only.
9. Obtain a fresh grant for each later call or retry.

A grant is staged until a successful tool turn ends, then becomes armed. A same-turn request is denied. The first exact admitted resolver request consumes it, even if 1Password resolution, SDK setup, transport, or the downstream MCP call later fails.

Requirement IDs are deterministic SHA-256/base64url values over validated server/tool/target metadata. Prefixes bind target kind and purpose:

- `mcp1-H-…` → `mcp-toolbox.header`
- `mcp1-A-…` → `mcp-toolbox.auth-token`
- `mcp1-B-…` → `mcp-toolbox.bound-param`

The extension accepts requirement metadata only from exact deeply frozen `pi.mcp-toolbox.requirements/v1` events and independently recomputes canonical identities before approval/resolution.

## Direct database profile workflow

The existing direct database protocol remains dynamic and one-shot:

1. Call `database_profile_requirements`.
2. Dynamically discover a 1Password field containing one complete `pi.database.connection-profile/v1` JSON profile.
3. Call `onepassword_grant_database_profile` with exact opaque handles and the `profileId`.
4. Review and approve canonical project/profile/field metadata.
5. In a later turn call `database_query` with only that exact `profileId`.

The atomic profile reaches the database extension only through a request-local callback and never through an event payload or model-visible result.

## TUI reveal

`onepassword_reveal_field` requires a discovered field and separate confirmation. It works only in TUI mode. The value is rendered inside a private popup for at most 30 seconds and is cleared on timeout, dismissal, disable, session replacement, reload, or shutdown.

The value is never returned by the tool. Terminal scrollback, screen capture, and immutable JavaScript strings remain outside deterministic cleanup guarantees.

## Stagehand login fill

`onepassword_fill_login` supports one conventional Login item with exactly one username and current-password field. It:

1. re-fetches item metadata;
2. requires an HTTPS current origin allowed by item website policy;
3. checks for one unambiguous form and approved action origin;
4. asks for confirmation;
5. resolves username/password for that use only;
6. fills through a revocable callback-only Stagehand lease;
7. optionally submits and validates the resulting origin;
8. stops at MFA or unexpected steps.

Credential values never pass through Stagehand model-backed act/extract/agent calls. The approved page, browser/CDP transport, and destination origin necessarily receive them.

## Resolver protocol

MCP Toolbox uses provider-aware protocol v2:

```ts
{
  protocol: "pi.secret-resolver/v2",
  provider: "onepassword-secrets-manager",
  consumer: "mcp-toolbox",
  slot: "mcp1-H|A|B-…",
  purpose: "mcp-toolbox.header|auth-token|bound-param",
  requestId,
  deadlineAt,
  signal,
  respond
}
```

Only canonical dynamic MCP requirement IDs are accepted for MCP Toolbox. Legacy/static slots have no enabled producer path. Requests and responses are frozen, exact, bounded, one-shot, and value-free except for the direct callback success argument.

Pi's process-wide event bus is cooperative, not authenticated. Any loaded extension can observe or spoof requirement metadata or resolver requests. Use this default-on mode only in a runtime where every loaded global, project, package, and temporary extension is trusted.

## Lifecycle

Dynamic requirements, handles, reservations, popup timers, browser leases, and grants are cleared on:

- `/onepassword-sm disable`;
- failed/aborted agent runs;
- unsuccessful tool turns;
- automatic retry boundaries;
- tree navigation or compaction;
- session replacement or fork;
- Pi reload or shutdown;
- process restart.

A newly loaded extension instance enables a fresh dynamic epoch by default. Manual disable applies to the current instance until `/onepassword-sm enable` or reload/restart.

All SDK operations share a serialization queue. Disable/shutdown revokes callbacks immediately and boundedly drains for one second, but `@1password/sdk@0.4.0` exposes no request cancellation, close, logout, dispose, or zeroization API. Late SDK/WASM completion may occur and is discarded.

## Safety limits

- 20 accepted secret requests, at most 4 pending;
- 20 metadata requests, at most 4 pending;
- at most 20 vaults / 1,000 item overviews inspected by all-vault search;
- at most 50 metadata records emitted;
- 30-second operation deadlines;
- 64 KiB maximum resolved value;
- 32 KiB / 500-line metadata output cap;
- no logs, shell, clipboard, file-write, temp-file, message, or session-entry sink.

Field discovery uses `items.get`, which decrypts the full item inside official SDK/WASM memory before extension-side projection. The extension reads and emits only strict field/section metadata, but cannot prevent or zero upstream copies.

## Validation

```bash
cd ~/.pi/agent/extensions/onepassword-secrets-manager
env -u OP_SERVICE_ACCOUNT_TOKEN npm run check
npm ls --all
```

Tests use fake SDK clients, metadata, grants, event buses, TUI, browser leases, database/MCP consumers, and timers. They do not authenticate, contact 1Password, query a database, launch a browser, or call MCP servers.
