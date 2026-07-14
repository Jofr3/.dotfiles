# Bitwarden Secrets Manager for Pi

A conservative global Pi extension backed by the official `@bitwarden/sdk-napi@1.0.0` package. It has two independent, session-local capabilities:

- **metadata tools** — the existing consent-gated project/secret identifier tools;
- **in-memory secret resolver** — an operator-enabled provider for exact, pre-bound requests from trusted Pi extensions.

The model has no get/reveal tool and cannot supply a Bitwarden secret ID. A fetched value crosses only as the argument to a one-shot process-local callback. The provider never puts it in a Pi event payload, tool argument/result, session entry, notification, status, log, error, file, or command metadata.

## Pi surface

- `bitwarden_sm_status` — offline extension/configuration status and safe counts
- `bitwarden_sm_list_projects` — project IDs and names
- `bitwarden_sm_list_secrets` — secret IDs and keys from the SDK identifier-list API
- `/bitwarden-sm status|enable|disable` — existing session-local metadata gate
- `/bitwarden-sm resolver-enable|resolver-disable` — separate session-local resolver consent gate

Metadata enablement and call accounting remain independent from resolver enablement and accounting. Resolver operations have their own 20-call budget, at most four accepted source operations, a maximum 30-second deadline, serialization, cancellation, and lifecycle epoch.

## Install

The extension is auto-discovered from its immediate directory and entry declared in `package.json`. Install the pinned native dependency from this directory:

```bash
cd ~/.pi/agent/extensions/bitwarden-secrets-manager
npm ci --ignore-scripts
```

`@bitwarden/sdk-napi` is locked to `1.0.0`. Supported published artifacts for this release are macOS x64/arm64, Linux x64 glibc, and Windows x64 MSVC. Reload Pi with `/reload`, or restart Pi.

## Bitwarden runtime configuration

Launch Pi with a dedicated, least-privilege machine-account token in its environment:

```bash
export BWS_ACCESS_TOKEN
pi
```

Set the value outside Pi. **Do not type, paste, or pass it in a prompt, tool argument, slash command, project file, extension setting, or `.env` file.** Pi normally persists tool calls/results.

A trusted launcher may optionally set both endpoint overrides:

- `BWS_API_URL`
- `BWS_IDENTITY_URL`

Overrides must be paired absolute HTTPS URLs without credentials, query strings, fragments, raw or encoded controls, or surrounding whitespace. The extension does not pass a `stateFile` to `loginAccessToken`.

## Protected resolver bindings

The binding file contains Bitwarden UUIDs, never values. It is global/operator-controlled, is not read at extension load or by status, and is loaded only after the user approves `/bitwarden-sm resolver-enable` through Pi UI. Resolver enablement is in memory only and resets on disable, reload, session replacement, shutdown, or restart. Print/JSON modes have no approval UI and fail closed.

Create the ignored package-local file with owner-only permissions:

```bash
cd ~/.pi/agent/extensions/bitwarden-secrets-manager
install -m 600 resolver-bindings.example.json resolver-bindings.json
$EDITOR resolver-bindings.json
```

A trusted launcher may instead set `PI_BITWARDEN_RESOLVER_BINDINGS` to an absolute path. An override is authoritative and never falls back to the package file.

Accepted files must be non-symlink regular files owned by the current UID, have exactly one link and exact mode `0600`, and be no larger than 64 KiB. Loading fails closed unless POSIX UID checks plus real `O_NOFOLLOW` and `O_NONBLOCK` flags are available. The loader binds `lstat` to the opened descriptor by device/inode, performs bounded positional reads, verifies unchanged size/permissions/owner/link count/timestamps, and fatally validates UTF-8. The parser rejects unknown fields, accessors, non-plain objects, unsafe identifiers, non-canonical UUIDs, more than 128 bindings, and duplicate consumer/slot/purpose tuples.

Schema:

```json
{
  "version": 1,
  "bindings": [
    {
      "consumer": "mcp-toolbox",
      "slot": "production-authorization",
      "purpose": "mcp-toolbox.header",
      "secretId": "11111111-2222-3333-8444-555555555555"
    }
  ]
}
```

Tuple fields are exact and case-sensitive. Safe ASCII patterns are exported in `src/resolver-protocol.ts`. For MCP Toolbox the fixed purposes are:

- `mcp-toolbox.header`
- `mcp-toolbox.auth-token`
- `mcp-toolbox.bound-param`

A v2 consumer request names the provider plus only `consumer`, `slot`, and `purpose`; it has no secret-ID field. The provider looks up the UUID from the protected binding map.

## Resolver protocol v2

Provider-aware v2 is the current dependency-free contract. It is documented and exported by `src/resolver-protocol.ts`; consumers should reproduce these literals/types locally rather than importing or loading the provider package:

```ts
const protocol = "pi.secret-resolver/v2";
const channel = "pi:secret-resolver:v2:request";
const provider = "bitwarden-secrets-manager";

type Request = {
  protocol: typeof protocol;
  provider: typeof provider;
  consumer: string;
  slot: string;
  purpose: string;
  requestId: string;       // fresh cryptographic nonce, 16-128 safe characters
  deadlineAt: number;      // absolute Date.now() milliseconds
  signal?: AbortSignal;
  respond(result:
    | { protocol: typeof protocol; ok: true; value: string }
    | { protocol: typeof protocol; ok: false; code: ProviderFailureCode }
  ): unknown;
};

pi.events.emit(channel, Object.freeze(request));
```

A v2 request must be shallow-frozen and contain exactly the eight required own, enumerable data properties shown above plus optional `signal`. The optional value must be a native `AbortSignal`. Arrays, non-plain prototypes, symbols, unknown properties, accessors, non-enumerable properties, invalid identifiers/deadlines, and unfrozen requests are rejected. Responses are frozen, match v2 exactly, and deliberately omit `provider`: the callback itself is the request-local response capability.

Bitwarden reads only the own data descriptor for `provider` before anything else. Missing, accessor-backed, unsafe, or non-Bitwarden routing labels are ignored silently without inspecting `respond`, consuming a request ID, or charging call/pending bounds. A malformed request with the exact Bitwarden routing label receives one v2 `invalid_request` response if it supplied an own data-property callback. This makes one Bitwarden and one 1Password provider safe to load on the same bus without racing responses.

The request event contains no value. The asynchronous result is delivered by direct invocation of `respond`; no result event is emitted. Provider and consumer must both enforce one-shot response handling. Consumers must use a fresh request ID, set their own deadline, synthesize `unavailable` if the addressed provider does not respond, and keep all value use inside trusted in-memory code. They must not render, serialize, log, persist, notify, throw, or return the value.

Provider failure codes are fixed and carry no message or cause:

`aborted`, `binding_denied`, `busy`, `call_limit`, `configuration`, `deadline_exceeded`, `disabled`, `duplicate_request`, `invalid_request`, `lifecycle`, `request_failed`, `response_rejected`, `sdk_unavailable`, `unexpected`.

`unavailable` is reserved for a consumer to synthesize when the callback was not invoked before its deadline (for example, because the addressed provider is absent or loaded too late). Providers never send it.

### Legacy Bitwarden-only v1

The original `pi.secret-resolver/v1` request and `pi:secret-resolver:v1:request` channel remain unchanged solely for existing provider-less Bitwarden consumers. Do not add `provider` to a v1 payload: that is an unknown field and is rejected. Only Bitwarden listens on v1; new and updated consumers must use v2. v1 and v2 share the same consent gate, protected bindings, replay set, call/pending bounds, lifecycle epoch, and serialized SDK source.

Pi's event bus is synchronous only for listener dispatch; it does not await asynchronous handler work or report whether a listener exists. The provider catches all synchronous and asynchronous failures so Pi's event-handler logger cannot receive SDK or callback errors. A process-wide registry scopes ownership by event bus and provider identity: it blocks duplicate live Bitwarden providers, including across module reloads, without reserving the bus against 1Password. Both channel subscriptions become active atomically; partial startup rollback and shutdown first make stale listeners inert even if unsubscribe throws. Shutdown then revokes callbacks and boundedly drains accepted work. Request-at-use-time plus consumer deadlines makes extension load order fail closed.

## Metadata use

1. Run `/bitwarden-sm status`. This does not import the SDK, construct a client, authenticate, read resolver bindings, or contact Bitwarden.
2. Run `/bitwarden-sm enable` to activate metadata tools for this extension instance.
3. Call a metadata list tool with a canonical lowercase organization UUID and optional limit (`1`–`50`, default `20`).
4. Approve the per-call disclosure prompt. Identifier/key/name metadata is sent to the model/events and normally retained in the Pi session.
5. Run `/bitwarden-sm disable` when finished. It waits for Pi's agent work to settle, then resets the shared cached client without replenishing either call budget. A resolver event that is active outside Pi's agent-idle accounting can consequently receive a fixed lifecycle failure and must be retried by its trusted consumer.

Metadata requests fail closed without approval UI. At most 20 approved metadata operations are accepted per extension/session instance.

## Safety and bounds

- SDK import, construction, access-token login, and requests remain lazy.
- Authentication and all SDK operations are serialized.
- Resolver disable immediately clears bindings, gives each pending resolver callback one fixed `lifecycle` failure, aborts resolver signals, clears the cached client/token-redaction wrapper through `manager.reset()`, and waits at most one second for provider and manager promise chains. Late successes are discarded.
- Resolver disable does not change metadata enablement or either capability's call counters. Because both capabilities share one SDK manager, resetting it can interrupt an already-active metadata operation with a fixed lifecycle error; a later metadata call lazily authenticates a fresh client.
- Secret values are retrieved only through the verified `client.secrets().get(id)` API. The provider validates an own data-property `response.id` exact match and an own string `response.value` no larger than 64 KiB without stringifying the response.
- SDK access is descriptor-based for the value path, so accessor-backed fake methods/responses fail closed.
- Raw SDK/config/callback errors are caught and mapped to fixed categories. Consumer callback throws/rejections are ignored because they could contain the fetched value.
- Resolver binding IDs and tuple names are never included in status; status exposes only enablement, counts, budgets, and pending totals.
- Metadata responses continue to be mapped field-by-field and bounded below 32 KiB/500 lines. Extra `value` fields are ignored.
- The extension emits no console logs and has no message/session/file/shell/clipboard sink for fetched values.

## Offline validation

```bash
npm run check
npm ls --all
```

Tests use fake SDKs and event buses or inert local SDK construction. They do not authenticate or make Bitwarden/MCP requests.

## Limitations

- Pi's process-wide event bus is **not an authentication boundary**. Any loaded extension can observe requests or impersonate a configured consumer if it knows a tuple; legacy v1 consumers may also emit mutable requests. v2 requests must be frozen, and the resolver should be enabled only when every loaded extension is trusted.
- Protected binding-file loading currently requires POSIX owner identity and permission bits (`process.getuid()` plus mode `0600`); it fails closed on platforms where those checks are unavailable.
- `@bitwarden/sdk-napi@1.0.0` is old/beta and exposes no logout, close, dispose, zeroization, cancellation, request timeout, or retry API. JavaScript strings and native memory cannot be deterministically cleared.
- A provider timeout, disable, reset, or shutdown cannot stop an already-running native request; it may complete locally after the callback has received a fixed failure and after the one-second drain bound expires. Queued work remains serialized, late values are discarded, and JavaScript references held only by completed extension promise chains are then released.
- The SDK/native boundary itself creates a JSON response string/object containing the value. The extension cannot remove that upstream copy.
- The SDK initializes a process-global native logger. The extension requests numeric error level `4` (`error`); this SDK exposes no `off` level, so upstream logging cannot be treated as a secrecy boundary. The extension itself has no console sink.
- Exact-value downstream redaction is defense in depth, not a general data-loss-prevention guarantee. A trusted consumer must keep the fetched value out of every public surface.
