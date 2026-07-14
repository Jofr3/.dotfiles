# 1Password Secrets Manager for Pi

A conservative global Pi extension backed by the official `@1password/sdk@0.4.0` package. It provides a disabled-by-default, session-local, in-memory secret resolver for trusted Pi extensions such as MCP Toolbox. It supports mutually exclusive protected static bindings and consent-gated dynamic secret selection.

There is no get/reveal tool. The model cannot provide a secret reference. A fetched value may leave the manager only as the argument to a one-shot process-local callback. This extension never places a fetched value or an internally generated dynamic reference in a Pi event payload, tool argument/result, message, session entry, notification, status, log, error, file, temporary file, command, or process metadata.

## Pi surface

- `onepassword_sm_status` — safe offline aggregate status only
- `/onepassword-sm status` — the same safe state and counts through UI
- `/onepassword-sm resolver-enable` — explicit session-local approval and protected static binding-file load
- `/onepassword-sm resolver-disable` — immediate revocation of either mode and bounded draining
- `/onepassword-sm dynamic-enable` — informed metadata-disclosure consent; no binding-file read
- `/onepassword-sm dynamic-disable` — immediate dynamic-mode/grant revocation

After dynamic consent, and only while dynamic mode is active, these fixed sequential model tools are activated:

- `onepassword_list_vaults`
- `onepassword_list_items`
- `onepassword_list_fields`
- `onepassword_grant_secret`

Status reports only the SDK version, client phase, authentication-setting presence booleans, the safe authentication category (`service_account`, `desktop`, `none`, or `ambiguous`), resolver mode (`disabled`, `static`, or `dynamic`), protected binding count, aggregate one-shot grant count, metadata enablement, and aggregate call/pending bounds. It never reports authentication values, metadata IDs/titles, slots, purposes, tuples, or references. Status does **not** read bindings, import or validate through the SDK, construct desktop authentication, create a client, authenticate, or contact 1Password.

The resolver allows at most 20 accepted calls and four pending calls per extension instance. The manager separately allows at most 20 secret calls and 20 metadata SDK calls, each with four pending operations. All SDK work shares one serialization queue, uses at most a 30-second caller-side deadline, and drains for at most one second on disable or shutdown. Disable/reset never replenishes any call budget.

## Install

This directory is a Pi package with its entry declared in `package.json`. It requires Node.js `>=22.19.0`.

```bash
cd ~/.pi/agent/extensions/onepassword-secrets-manager
npm ci --ignore-scripts
```

The lockfile pins `@1password/sdk` and `@1password/sdk-core` to stable version `0.4.0`. Reload Pi with `/reload`, or restart it.

## Authentication

Configure **exactly one** authentication mode in Pi's launch environment. If both settings are present, the configuration is ambiguous: the first accepted resolution fails before SDK import, client phase transition, or authentication. If neither is present, resolution also fails closed.

### Service-account mode

Service-account behavior remains unchanged:

```bash
export OP_SERVICE_ACCOUNT_TOKEN
pi
```

Set the token outside Pi. **Never type, paste, or pass it in a prompt, tool argument, slash command, resolver binding, project file, extension setting, or `.env` file.** Use a dedicated least-privilege service account restricted to the required vaults/items.

### Desktop-app mode

Set the explicit, non-secret account selector to the account name shown in the 1Password desktop app sidebar, or to the account UUID:

```bash
export PI_ONEPASSWORD_DESKTOP_ACCOUNT='your desktop account name or UUID'
pi
```

You may persist this non-secret setting in a trusted launcher or trusted shell configuration used to start Pi. The extension reads only `PI_ONEPASSWORD_DESKTOP_ACCOUNT`; it intentionally ignores broad ambient aliases such as `OP_ACCOUNT`. Account selectors are own-data-property read, limited to 1024 UTF-8 bytes, and rejected if empty, surrounded by whitespace, or containing control/format/bidirectional text characters. The account selector is never placed in status, errors, notifications, tool output, session data, or logs.

Keep the 1Password desktop app installed and unlocked. The first accepted metadata or secret operation may cause official 1Password authorization UI to appear. No `/login` command is needed or provided: either enable command grants only extension consent and does not authenticate.

Do **not** set `OP_SERVICE_ACCOUNT_TOKEN` and `PI_ONEPASSWORD_DESKTOP_ACCOUNT` together. The extension does not support Connect variables, token files, account prompts inside Pi, or alternate authentication variable names.

### Lazy initialization

Status, startup, and resolver enablement do not import the SDK, construct `DesktopAuth`, create a client, authenticate, or contact 1Password. When an accepted secret or metadata operation needs a new client, the extension snapshots both explicit authentication settings, selects exactly one mode, validates it, imports and descriptor-validates the pinned SDK, and calls `sdk.createClient` with the selected authentication and fixed integration identity. In desktop mode only, it first constructs `new sdk.DesktopAuth(accountSelector)`; service-account mode never constructs `DesktopAuth`.

The runtime retains only these documented SDK methods: `client.secrets.resolve`, `client.vaults.list`, `client.items.list`, and `client.items.get`, plus root `Secrets.validateSecretReference`. Secret resolution validates the private reference first. Dynamic discovery calls only the corresponding metadata method. No vault/item write, archive, delete, share, group, batch, or file API is read or exposed.

Service-account mode passes the token string as `auth`. Desktop mode passes the exact constructed `DesktopAuth` object. Raw constructor, client-creation, SDK request, and response errors are reduced to fixed public categories. Credentials are not verified until the first accepted metadata or secret operation.

## Protected resolver bindings

The operator-controlled binding file contains `op://` references, never values. It is global, not project-controlled, and is read only after UI approval. Enablement exists only in memory and ends on disable, reload, session replacement/fork, shutdown, or process restart. Print/JSON modes have no approval UI and fail closed; TUI and RPC UI can present the approval prompt.

Create the ignored package-local file with exact owner-only permissions:

```bash
cd ~/.pi/agent/extensions/onepassword-secrets-manager
install -m 600 resolver-bindings.example.json resolver-bindings.json
$EDITOR resolver-bindings.json
```

A trusted launcher may instead set `PI_ONEPASSWORD_RESOLVER_BINDINGS` to an absolute path. When present, that path is authoritative; an invalid, missing, or unsafe override never falls back to the package-local file.

Accepted files must be current-UID-owned, non-symlink regular files with exactly one link, exact mode `0600` (including no special bits), and no more than 64 KiB. Loading fails closed unless POSIX UID checks and real `O_NOFOLLOW`/`O_NONBLOCK` flags are available. The loader uses bigint `lstat`/`fstat` identity checks, bounded positional reads with a one-byte growth probe, before/after metadata checks, a final path-identity check, and fatal UTF-8 decoding.

The parser accepts at most 128 exact, unique tuples and rejects unknown fields, accessors, symbols, custom prototypes, sparse arrays, unsafe identifiers, and malformed local `op://` shapes. The official SDK performs the authoritative syntax validation lazily on first use, before authentication/resolution.

Schema (all identifiers and references below are deliberately fake):

```json
{
  "version": 1,
  "bindings": [
    {
      "consumer": "mcp-toolbox",
      "slot": "production-db-password",
      "purpose": "mcp-toolbox.bound-param",
      "secretReference": "op://example-vault/example-database/password"
    }
  ]
}
```

Tuple fields are exact and case-sensitive. MCP Toolbox uses these fixed purposes:

- `mcp-toolbox.header`
- `mcp-toolbox.auth-token`
- `mcp-toolbox.bound-param`

The consumer request contains only the provider and tuple—not the bound `op://` reference. Run `/onepassword-sm resolver-enable` only after the launch environment and protected file are ready.

## Dynamic secret selection

Dynamic mode does **not** read or require `resolver-bindings.json`. `/onepassword-sm dynamic-enable` first displays an informed UI confirmation. Print and JSON modes have no approval UI and remain disabled; TUI and RPC UI can confirm. Consent acknowledges that these bounded, sanitized records are sent to the active model, appear in Pi tool/RPC events, and are normally persisted in the Pi session:

- MCP requirement: configured server/tool IDs, target kind/name, location-derived purpose, and opaque `requirementId`;
- vault: opaque session handle, title, type, active item count;
- item overview: opaque session handle, title, category, state;
- field: opaque session handle, title, field type, and optional section title/opaque handle.

Descriptions, versions, dates, websites, tags, notes, files, document metadata, field values, field details, and raw 1Password vault/item/field/section IDs are not emitted. 1Password responses are descriptor-checked plain records/dense arrays with at most 1,000 raw records inspected and 50 records emitted, 256-byte labels, safe bounded internal IDs, no controls/ANSI/bidirectional formatting, and at most 32 KiB/500 lines of output. The schema keeps the compatibility property names `vaultId`, `itemId`, and `fieldId`, but every value returned there is a session-epoch HMAC handle; it is not the underlying 1Password ID and cannot be composed into the internally generated `op://` reference. Handles are cleared and re-keyed on reset. There is no fallback or temporary output file. Each discovery call must use handles emitted by the prior step.

Dynamic mode is **less restrictive** than protected static bindings. The model may inspect and choose any metadata-visible item/field permitted by the authenticated account. Every selected field still requires a separate metadata-only user confirmation for one exact prior cached MCP credential requirement, but that approval is not equivalent to operator-preselecting a permanent allowlist. Prefer protected static mode when a fixed allowlist is practical. For dynamic mode, use a dedicated least-privilege service account or tightly restrict the desktop account's vault access.

### Automatically derived MCP requirement handshake

Dynamic mode does not create or alter MCP configuration. MCP Toolbox must already declare an exact dynamic 1Password reference at the credential location. It has `dynamic: true` and **no slot**:

```json
{
  "resolver": {
    "provider": "onepassword-secrets-manager",
    "dynamic": true
  }
}
```

The operator and model never name a destination slot or purpose for this dynamic flow. MCP Toolbox deterministically derives a 50-character opaque `requirementId` from only the validated protocol version, configured server ID, exact tool name, target kind, and safe target name. It does not hash a URL, environment name, static slot, provider, reference, or value. The ID prefix fixes the target kind and resolver purpose:

- `mcp1-H-…` → configured header → `mcp-toolbox.header`
- `mcp1-A-…` → configured authentication source → `mcp-toolbox.auth-token`
- `mcp1-B-…` → configured bound parameter → `mcp-toolbox.bound-param`

`mcp_toolbox_requirements(server, tool)` is offline. It reads only validated cached local MCP configuration and returns only that selected tool's dynamic requirements. It exposes no credential values, endpoint URLs, environment names, static slots, providers, raw config, or other-tool configuration, and it does not construct either SDK/client, resolve a credential, authenticate, or contact a server.

On success, MCP Toolbox also emits the same metadata as an exact deeply frozen process-local event on `pi:mcp-toolbox:requirements:v1` using protocol `pi.mcp-toolbox.requirements/v1`. While dynamic mode is enabled, this extension admits only strict bounded plain-data records, caches at most 20 records per event across at most 256 scopes, and replaces only the exact server/tool scope. Mutable, accessor-backed, symbolic, extra-keyed, custom-prototype, malformed, oversized, duplicate, colliding, or prefix/kind/purpose-inconsistent events are ignored without SDK work. A requirement ID must be in this cache before `onepassword_grant_secret` accepts it. The consumer independently recomputes the canonical requirement hash from the frozen server/tool/kind/name metadata and rejects any rebinding. This remains a cooperative metadata handshake, not an authentication boundary, because another trusted-process extension can still impersonate the producer.

Requirement tool results are model-visible, appear in tool/RPC events, and are normally persisted in the Pi session. The process-local event is visible to loaded extensions for the life of that runtime. It is not written separately by this extension. Pi's process-wide event bus is cooperative and **not an authentication boundary**: any loaded extension can observe or spoof metadata and resolver requests. Review and trust every loaded extension, and verify the server/tool/target shown in the final approval prompt.

The confirmation shows escaped 1Password vault/item/field/section titles/types plus the cached MCP server, tool, target kind, target name, opaque requirement ID, and verified derived resolver purpose. It does not show raw 1Password IDs or accept/show a model-provided label/purpose, URL, account selector, credential, token, secret reference, or value. The consumer remains fixed internally to MCP Toolbox.

Dynamic mode chooses which approved 1Password field backs that derived requirement for the **next admitted matching request only**. A grant is in memory, exact-requirement, one-shot, and consumed atomically before resolution starts. Success, SDK/authentication failure, cancellation after admission, callback failure, or later MCP failure does not restore it. A retry always needs another approved grant.

### Exact requirements-first dynamic workflow

1. Configure exactly one 1Password authentication mode, restrict it to the minimum needed vaults, and launch Pi.
2. Configure the chosen MCP credential location with `{ "resolver": { "provider": "onepassword-secrets-manager", "dynamic": true } }`; do not configure a dynamic slot.
3. Run `/onepassword-sm dynamic-enable` and approve metadata disclosure.
4. Call `mcp_toolbox_requirements` with the exact configured `server` and `tool`; wait for its result and use only an emitted `requirementId`. Never invent or alter one.
5. Call `onepassword_list_vaults`; wait for its result and choose one opaque handle emitted as `vaultId`.
6. Call `onepassword_list_items` with that exact handle; wait and choose one opaque handle emitted as `itemId`.
7. Call `onepassword_list_fields` with those exact handles; wait and choose one opaque handle emitted as `fieldId`.
8. Call `onepassword_grant_secret` with only those exact opaque handles and the prior `requirementId`; review the verified MCP target metadata and approve.
9. Wait for the successful grant tool result.
10. In a **later tool turn**, call `mcp_toolbox_call` with only its normal server/tool/arguments. Never issue grant and MCP calls in the same or a parallel tool batch.
11. Re-run requirements and re-grant before every retry or later MCP call as needed.
12. Run `/onepassword-sm dynamic-disable` when finished.

Grants are staged until the grant tool's turn ends, so a same-turn MCP request is denied rather than racing approval. Re-running requirements safely replaces only that exact scope and revokes grants based on its previous records. MCP Toolbox reload/invalidation clears cached requirements and corresponding grants. Disable, Pi reload, new/resumed/forked session replacement, shutdown, or process restart clears consent, requirement metadata, discoveries, and every staged/armed grant; shutdown unsubscribes the listener or leaves any stale callback inert.

### Full-item decryption limitation

`onepassword_list_fields` and grant verification resolve opaque handles internally, then use official `client.items.get(vaultId, itemId)` with raw IDs that are never emitted. The SDK decrypts and materializes the **full item** in SDK/application memory first, including all field values/details, notes, websites, tags, and files. The extension inspects property descriptors, reads/maps only strict item/field/section metadata, never reads or traverses field `value`/`details` or unrelated content, and releases its raw response reference promptly. It cannot prevent or zeroize upstream SDK/WASM copies or control upstream memory, networking, telemetry, or logging behavior.

## Provider-aware resolver protocol v2

1Password implements v2 only. It intentionally ignores v1 and every valid request addressed to another provider. Consumers should reproduce the dependency-free constants/types locally rather than importing the provider package:

```ts
const protocol = "pi.secret-resolver/v2";
const channel = "pi:secret-resolver:v2:request";
const provider = "onepassword-secrets-manager";

type Request = {
  protocol: typeof protocol;
  provider: typeof provider;
  consumer: string;
  slot: string;
  purpose: string;
  requestId: string;      // fresh cryptographic nonce, 16–128 safe characters
  deadlineAt: number;     // absolute Date.now() milliseconds
  signal?: AbortSignal;
  respond(result:
    | Readonly<{ protocol: typeof protocol; ok: true; value: string }>
    | Readonly<{ protocol: typeof protocol; ok: false; code: FailureCode }>
  ): unknown;
};

pi.events.emit(channel, Object.freeze(request));
```

Requests must be shallow-frozen plain objects with exact own enumerable data properties. The v2 `slot` is a closed union: the existing lowercase legacy grammar (`^[a-z][a-z0-9._-]{0,127}$`) or a canonical 50-character dynamic requirement ID. Bitwarden and protected 1Password binding files remain legacy-slot-only. Dynamic 1Password grants are requirement-ID-only, and a dynamic ID's prefix must match the request purpose exactly.

The provider rejects arrays, unknown/symbol/non-enumerable/accessor fields, custom prototypes, invalid identifiers/deadlines/signals, noncanonical dynamic IDs, prefix/purpose mismatches, and addressed mutable requests. It reads only the own data-property `provider` first. Unknown, missing, accessor-backed, or non-addressed providers are ignored without inspecting `respond`, consuming capacity, or returning a failure. An addressed malformed request receives one frozen `invalid_request` callback.

The request event contains no reference or value. The asynchronous response is delivered only by direct invocation of the request-local `respond` capability; no response event is emitted. Provider and consumer must both enforce one-shot handling. Consumers must use a fresh request ID, freeze the request, impose their own deadline, synthesize `unavailable` if no addressed provider responds, and keep value use entirely inside trusted in-memory code.

Provider failure codes are fixed and carry no message/cause:

`aborted`, `binding_denied`, `busy`, `call_limit`, `configuration`, `deadline_exceeded`, `disabled`, `duplicate_request`, `invalid_request`, `lifecycle`, `request_failed`, `response_rejected`, `sdk_unavailable`, `unexpected`.

`unavailable` is consumer-only. Provider responses do not include a provider field: the callback is request-local, while the provider string is cooperative routing, not authentication.

## Protected static MCP Toolbox workflow

1. Launch Pi with exactly one of `OP_SERVICE_ACCOUNT_TOKEN` or `PI_ONEPASSWORD_DESKTOP_ACCOUNT` already present. For desktop mode, keep the desktop app installed and unlocked and approve official authorization UI if it appears.
2. Add an exact 1Password binding tuple matching the MCP credential slot and purpose.
3. Configure the MCP credential with provider `onepassword-secrets-manager` (never put a value or `op://` reference in MCP configuration).
4. Start/reload Pi, review every loaded extension, then run `/onepassword-sm resolver-enable` and approve the UI prompt.
5. Use MCP Toolbox. It requests the exact tuple over v2 and consumes the callback value only inside its trusted credential injection path. Static mappings remain reusable until disabled or bounded call budgets are exhausted.
6. Run `/onepassword-sm resolver-disable` when finished.

Provider names isolate cooperative routing: a Bitwarden request is invisible to 1Password and vice versa, including when slot/purpose names match.

## Safety properties

- Protected resolver bindings and all private references are absent from dynamic tool schemas/results, event payloads, status, and errors.
- Dynamic tools expose only bounded safe metadata and keyed opaque session handles after separate consent; raw 1Password IDs and reference components are not emitted. The grant schema accepts prior discovery handles plus one prior cached opaque requirement ID, never a slot, purpose, consumer, provider, account, label, URL, reference, or value.
- Requirement events are exact, deeply frozen, strictly parsed through descriptors, bounded by record/scope limits, ignored while dynamic mode is disabled, and never trigger SDK work.
- Dynamic grants are fixed internally to consumer `mcp-toolbox`, staged until a later turn, and deleted synchronously at exact derived-requirement admission.
- Status and startup are offline/non-initializing.
- Authentication reads are descriptor-based, bounded, and limited to `OP_SERVICE_ACCOUNT_TOKEN` and `PI_ONEPASSWORD_DESKTOP_ACCOUNT`; inherited, accessor-backed, malformed, ambiguous, and ambient alias settings fail closed.
- Status exposes only authentication presence booleans and a safe mode category, never authentication values or validity details.
- SDK exports, including `DesktopAuth`, plus only `client.secrets.resolve`, `client.vaults.list`, `client.items.list`, and `client.items.get` are resolved through data descriptors; accessor-backed or malformed mock surfaces fail closed without invocation.
- The SDK client and adapter are cached per lifecycle epoch and released on reset/shutdown.
- Authentication and every SDK operation are serialized. The serialization tail is not replaced on reset, so stale SDK/WASM work cannot overlap a new client.
- Resolved values must be non-empty strings no larger than 64 KiB. They are never stringified by the manager/provider.
- Raw SDK, configuration, reference, token, and callback errors are mapped to fixed categories. Callback throws/rejections are swallowed because they may contain the value.
- Lifecycle epochs synchronously revoke callbacks and discard late success. Request IDs and admission counters are bounded by the fixed call budget.
- The extension emits no console logs and has no shell, message, session, clipboard, output-stream, temporary-file, or write sink.

## Offline validation

```bash
env -u OP_SERVICE_ACCOUNT_TOKEN -u PI_ONEPASSWORD_DESKTOP_ACCOUNT -u PI_ONEPASSWORD_RESOLVER_BINDINGS npm ci --ignore-scripts

env -u OP_SERVICE_ACCOUNT_TOKEN -u PI_ONEPASSWORD_DESKTOP_ACCOUNT -u PI_ONEPASSWORD_RESOLVER_BINDINGS npm run check
env -u OP_SERVICE_ACCOUNT_TOKEN -u PI_ONEPASSWORD_DESKTOP_ACCOUNT -u PI_ONEPASSWORD_RESOLVER_BINDINGS npm ls --all
```

Tests use fake SDKs/event buses/files plus manifest, export-source, and declaration inspection of the installed SDK surface. The installed-SDK test does not import runtime SDK code, construct `DesktopAuth`, call `createClient`, authenticate, or make 1Password/MCP network requests.

## Trust model and limitations

- **Pi's process-wide event bus is not an authentication boundary.** Any loaded extension can observe or spoof requirement metadata and can observe requests or impersonate a known tuple/provider. Frozen payloads prevent mutation, not observation or impersonation. Enable only when every loaded global/project/temporary extension is trusted.
- Provider routing and the requirement handshake prevent accidental races; both are cooperative labeling, not authentication. Static mode's protected exact tuple map or dynamic mode's approved one-shot requirement is the provider's local policy, but another loaded extension can still spoof MCP metadata or impersonate MCP Toolbox on the process-wide bus.
- Desktop mode depends on the local 1Password desktop app and its authorization flow. The extension cannot suppress, automate, or report details from official authorization UI.
- Dynamic mode deliberately exposes safe metadata to the active model/events/session and is therefore a broader authorization surface than protected static bindings. Per-secret confirmation reduces but does not eliminate model-selection risk.
- Field discovery necessarily decrypts a full item inside the official SDK before extension-side projection; filtering cannot prevent that upstream exposure.
- `@1password/sdk@0.4.0` exposes no `AbortSignal`, close/logout/dispose, request-timeout, or zeroization API for these calls. A resolver timeout, disable, reset, or shutdown cannot truly cancel already-running SDK/WASM work. It can only revoke callbacks, discard late values/metadata, release extension-held references, and stop stale queued work.
- JavaScript strings are garbage-collected and immutable. The token, desktop account selector, reference, and fetched value cannot be deterministically zeroized; SDK/WASM internals and Node's module cache may retain data or code beyond extension reference release.
- Bounded drain returns after one second even if SDK/WASM work hangs. Because the serialization tail is intentionally retained, a permanently hung SDK call can block future resolution until Pi restarts.
- Upstream SDK/WASM behavior, memory, networking, telemetry, and logging cannot be treated as a secrecy boundary. This extension does not log, but cannot prove or clear upstream copies.
- Protected file checks require POSIX UID/permission semantics and fail closed where unavailable.
- Once the callback transfers a value, the trusted consumer is responsible for keeping it out of model-visible, event, session, log, error, file, and process-command surfaces.
