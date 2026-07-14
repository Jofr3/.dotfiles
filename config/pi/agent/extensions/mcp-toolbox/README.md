# MCP Toolbox for Pi

A global Pi extension for calling an operator-controlled allowlist of [MCP Toolbox](https://github.com/googleapis/mcp-toolbox-sdk-js) tools through the official JavaScript SDK.

The extension uses `@toolbox-sdk/core@1.0.1` and deliberately exposes four fixed Pi tools rather than dynamically registering server-provided names, descriptions, or schemas:

- `mcp_toolbox_status` — local configuration/lazy-state status; no network
- `mcp_toolbox_list` — exact configured allowlist; no network
- `mcp_toolbox_requirements` — derive dynamic 1Password requirement IDs for one exact configured tool; local config only, no network
- `mcp_toolbox_call` — lazy load and invoke one exact configured tool

This dispatcher prevents remote metadata from overriding Pi tools or injecting descriptions into Pi's system prompt. Remote arguments are still validated by the SDK's Zod schema before invocation.

## Install

Pi discovers this immediate extension package from `agent/extensions/mcp-toolbox/package.json`.

```bash
cd /home/jofre/.dotfiles/config/pi/agent/extensions/mcp-toolbox
npm ci --ignore-scripts
```

Requirements:

- Pi's Node runtime (`>=22.19.0`)
- an MCP Toolbox server compatible with one of the configured protocol versions
- credential values supplied either by trusted process environment references or the optional in-memory secret-resolver protocol

The Bitwarden and 1Password providers are optional. MCP Toolbox reproduces the small provider-aware resolver-v2 wire contract locally and has no runtime import or package dependency on either provider extension, so environment-only configurations still work when both are absent. Resolver configuration accepts exactly `bitwarden-secrets-manager` or `onepassword-secrets-manager`; arbitrary provider names are rejected.

The SDK, Axios, and Zod are pinned in `package.json` and `package-lock.json`. `node_modules/`, `config.json`, logs, and `.env*` files are ignored.

## Configure

No real config or secrets file is created. Install the sanitized example with owner-only permissions:

```bash
cd /home/jofre/.dotfiles/config/pi/agent/extensions/mcp-toolbox
install -m 600 config.example.json config.json
$EDITOR config.json
```

Alternatively set `PI_MCP_TOOLBOX_CONFIG` to an **absolute** JSON path. The override is authoritative: a missing or invalid override does not fall back to package config.

Configuration discovery is intentionally global-only:

1. `PI_MCP_TOOLBOX_CONFIG` absolute path
2. package-local `config.json`
3. unconfigured safe state

The extension does not read project config, `.env`, application credentials, Pi auth/session data, or arbitrary parent directories. A config file must be a current-UID-owned, non-symlink regular file with exactly one link, exact mode `0600`, and size no larger than 256 KiB. Loading requires real `O_NOFOLLOW`, `O_NONBLOCK`, and POSIX UID support; it binds `lstat` to the opened descriptor by device/inode, uses bounded positional reads plus an EOF probe, verifies unchanged owner/mode/link/size/timestamps, and fatally decodes UTF-8.

The first successful read is deeply cloned, frozen, and cached. Replacing a path or editing a file has no effect until `/mcp-toolbox reload`. Reload replaces the cache before validation; a failed reload remains invalid and never falls back to the prior endpoint. Each call then creates a separate frozen invocation snapshot containing only its selected endpoint, protocol, tool policy, and credential references.

### Schema

```json
{
  "version": 1,
  "requestTimeoutMs": 30000,
  "servers": [
    {
      "id": "production",
      "url": "https://toolbox.example.com",
      "protocol": "2025-11-25",
      "tools": [
        {
          "name": "search-hotels",
          "toolset": "hotel-tools",
          "confirmation": "required",
          "authTokens": ["my_oauth"],
          "boundParams": ["tenant_id", "example_database_password"]
        },
        {
          "name": "update-hotel",
          "toolset": "hotel-tools",
          "confirmation": "required",
          "authTokens": ["my_oauth"],
          "boundParams": ["tenant_id", "example_database_password"]
        }
      ],
      "denyTools": [],
      "headers": {
        "Authorization": {
          "resolver": {
            "provider": "bitwarden-secrets-manager",
            "slot": "production-authorization"
          }
        }
      },
      "authTokens": {
        "my_oauth": {
          "resolver": {
            "provider": "bitwarden-secrets-manager",
            "slot": "production-oauth"
          }
        }
      },
      "boundParams": {
        "tenant_id": {
          "resolver": {
            "provider": "bitwarden-secrets-manager",
            "slot": "production-tenant"
          }
        },
        "example_database_password": {
          "resolver": {
            "provider": "onepassword-secrets-manager",
            "dynamic": true
          }
        }
      }
    }
  ]
}
```

All objects reject unknown fields.

#### Server fields

- `id`: lowercase identifier used as the Pi-facing server name.
- `url`: Toolbox **base URL**, not an `/mcp` URL. HTTPS is required except literal `127.0.0.1` or `[::1]` loopback development. Userinfo, query strings, fragments, and redirects are rejected.
- `protocol`: one of `2024-11-05`, `2025-03-26`, `2025-06-18`, or `2025-11-25`; defaults to the SDK's latest implemented protocol, `2025-11-25`. SDK 1.0.1 does not negotiate/fallback automatically.
- `tools`: non-empty explicit allowlist. There is no allow-everything mode.
- `denyTools`: exact deny list; deny always wins.
- `headers`: request header to credential-reference map. Hop-by-hop, cookie, forwarding, proxy, `Host`, `Content-Length`, and `Sec-*` headers are blocked.
- `authTokens`: Toolbox auth-service definitions. The SDK sends selected source `name` as header `name_token`; the extension rejects collisions with configured headers. Values are not automatically prefixed with `Bearer`.
- `boundParams`: server-side parameter names mapped to credential references.

Each credential reference is exactly one of:

```json
{ "env": "TOOLBOX_AUTHORIZATION" }
```

or a protected static resolver binding:

```json
{
  "resolver": {
    "provider": "bitwarden-secrets-manager",
    "slot": "production-authorization"
  }
}
```

or an automatically derived dynamic 1Password requirement:

```json
{
  "resolver": {
    "provider": "onepassword-secrets-manager",
    "dynamic": true
  }
}
```

Static `{provider,slot}` references remain supported for both Bitwarden and 1Password. The dynamic shape is accepted only for `onepassword-secrets-manager`, must contain literal `dynamic:true`, and has no configured slot. The parser rejects mixed `env`/`resolver`, mixed `slot`/`dynamic`, `dynamic:false`, dynamic Bitwarden, literal/value-bearing shapes, interpolation, unsafe static slots, accessors, and unknown fields. Resolver references are accepted only inside `headers`, `authTokens`, and `boundParams`; URLs, tool declarations, protocols, and model-supplied call arguments cannot contain them. One selected tool may select at most 32 credential references total and at most 20 unique provider/effective-slot/purpose tuples, including dynamic requirements. Provider is retained in the frozen invocation snapshot and deduplication key, so equal static slot/purpose pairs at different providers never collide.

#### Tool fields

- `name`: exact remote tool name. Calls never use fuzzy matching.
- `toolset`: optional named Toolbox toolset. If omitted, SDK `loadTool(name, auth, bound)` loads from the default endpoint. If present, SDK `loadToolset(toolset, auth, bound, false)` is called and the exact allowlisted member is selected.
- `confirmation`: `required` (default) or `not-required`.
- `authTokens`: auth definitions selected for this tool.
- `boundParams`: bound-parameter definitions selected for this tool.

For a named toolset invocation, only the selected allowlisted tool's configured auth/bound names are supplied. Other configured members' credential slots are not resolved. SDK 1.0.1 rejects supplied auth or bound names that do not apply to any member of the loaded tool/toolset, so select only relevant definitions. Reload after changing config or bound-parameter selection.

### Environment credentials

Environment references retain their existing behavior. Export values before invoking a tool, never put literal credentials in JSON, and do not use shell interpolation in config:

```bash
export TOOLBOX_AUTHORIZATION='Bearer ...'
export TOOLBOX_MY_OAUTH_TOKEN='...'
export TOOLBOX_TENANT_ID='tenant-example'
```

Pi persists tool arguments. `mcp_toolbox_call` rejects credential-bearing argument keys, bearer values, selected configured environment credentials, URL userinfo, prototype keys, accessors, cycles, non-JSON values, non-finite numbers, and oversized/deep inputs. After resolver handoff it repeats argument inspection against every fetched exact value before SDK construction. A credential should never be supplied as an argument in the first place.

### Secret resolver opt-in

Resolver use requires trusted MCP/provider configuration and explicit provider session consent. The model can choose only an already allowlisted `server` and `tool`; it cannot provide a provider name, slot, purpose, Bitwarden ID, 1Password reference, or secret value. For dynamic 1Password references it receives an opaque MCP-derived requirement ID, never a user-authored destination slot. MCP emits one frozen provider-aware v2 request per unique selected tuple and never probes or races providers.

#### Bitwarden workflow

1. In MCP Toolbox `config.json`, use the Bitwarden resolver references shown above.
2. In the Bitwarden extension's protected `resolver-bindings.json` (owner-only mode, normally `0600`), bind those exact tuples to Bitwarden secret UUIDs:

```json
{
  "version": 1,
  "bindings": [
    {
      "consumer": "mcp-toolbox",
      "slot": "production-authorization",
      "purpose": "mcp-toolbox.header",
      "secretId": "11111111-2222-3333-8444-555555555555"
    },
    {
      "consumer": "mcp-toolbox",
      "slot": "production-oauth",
      "purpose": "mcp-toolbox.auth-token",
      "secretId": "aaaaaaaa-bbbb-cccc-8ddd-eeeeeeeeeeee"
    },
    {
      "consumer": "mcp-toolbox",
      "slot": "production-tenant",
      "purpose": "mcp-toolbox.bound-param",
      "secretId": "ffffffff-eeee-dddd-8ccc-bbbbbbbbbbbb"
    }
  ]
}
```

3. Launch Pi with the Bitwarden machine credential configured outside prompts/config/session data, following the Bitwarden extension README.
4. In an interactive trusted session run `/bitwarden-sm resolver-enable`, review the warning, and explicitly approve it. This consent ends on resolver disable, Pi's built-in `/reload`, session replacement, shutdown, or restart; MCP Toolbox's config-only reload does not alter the independent provider consent.
5. Invoke only the statically allowlisted Toolbox tool. MCP Toolbox derives `consumer=mcp-toolbox` and the fixed purpose from the credential location, resolves only all selected-server headers plus the selected tool's auth/bound definitions, and initializes an invocation-scoped SDK client only after all values arrive.
6. Run `/bitwarden-sm resolver-disable` when finished.

#### Dynamic 1Password workflow (no manual destination slot)

The `example_database_password` entry in `config.example.json` is deliberately value-free and uses only `{provider:"onepassword-secrets-manager",dynamic:true}`. Do not add a slot, `op://` reference, environment name, or value.

1. Launch and enable the 1Password extension's consent-gated dynamic mode according to `../onepassword-secrets-manager/README.md`. Use its supported service-account or DesktopAuth setup outside prompts and MCP config. Review every loaded extension before enabling dynamic mode; headless modes fail closed.
2. Select an exact configured pair with `mcp_toolbox_list`, then call and **wait for**:

   ```json
   {
     "server": "production",
     "tool": "search-hotels"
   }
   ```

   through `mcp_toolbox_requirements`. It reads only the already validated cached local config. It does not construct a Toolbox SDK client, contact the endpoint, resolve a credential, read an environment value, or invoke 1Password. It returns only the selected tool's dynamic requirements: `requirementId`, target kind (`header`, `auth-token`, or `bound-param`), configured target name, and location-derived purpose.
3. Use the 1Password metadata tools one step at a time to select a vault, item, and field. Then call `onepassword_grant_secret` with that field's IDs and the exact returned `requirementId`; never invent or alter an ID. Approve the per-secret confirmation.
4. Wait until a **later turn**, then call `mcp_toolbox_call` with only ordinary tool arguments. MCP re-derives the requirement ID internally from config and uses it as the protocol-v2 slot with provider `onepassword-secrets-manager` and the fixed location-derived purpose. The model never supplies those resolver fields.
5. Disable dynamic 1Password mode when finished. Requirements/grants are session-local and are cleared by disable, MCP config invalidation, Pi reload/session replacement/fork, shutdown, or restart. Rerun `mcp_toolbox_requirements` after enabling dynamic mode or after invalidation.

Requirement IDs are deterministic SHA-256/base64url identifiers over length-framed validated fields only: protocol version, exact server ID, exact tool name, target kind, and target name. IDs are isolated per exact tool and target. They do not hash URLs, environment names, static slots, references, or values. Prefixes map strictly to purpose: `mcp1-H-` → `mcp-toolbox.header`, `mcp1-A-` → `mcp-toolbox.auth-token`, and `mcp1-B-` → `mcp-toolbox.bound-param`.

`mcp_toolbox_requirements` inputs/results are model-visible and normally persist in Pi's session/tool history and RPC/tool events. It emits protocol `pi.mcp-toolbox.requirements/v1` on the process-local `pi:mcp-toolbox:requirements:v1` channel. MCP Toolbox does not append that custom event to the session, but every loaded event-bus listener can observe, impersonate, or retain it. The recursively frozen metadata payload contains no credential value/reference, URL, environment name, static slot, provider, callback, or raw config; freezing prevents mutation, not observation or spoofing. Pi's cooperative event bus is **not** an authentication boundary.

#### Static 1Password compatibility

Protected reusable static 1Password bindings remain backward compatible. Configure `{resolver:{provider:"onepassword-secrets-manager",slot:"example-production-db-password"}}` in MCP, bind the exact `consumer=mcp-toolbox` / slot / location-derived purpose tuple to an operator-selected `op://` reference in the 1Password extension's owner-only binding file, and enable its static resolver mode as documented there. Static bindings do not use `mcp_toolbox_requirements` or dynamic grants.

If the selected provider is absent, loaded later, disabled, denied, replaced, wrongly addressed, or too slow, the current request fails with one fixed credential-resolution error. A non-addressed provider remains silent and does not consume its budget. There is no provider discovery/status probe and no slot, purpose, provider failure code, or value is returned to the model. A later invocation can succeed after the selected provider is enabled, so extension load order is not relied upon.

## Commands

```text
/mcp-toolbox status
/mcp-toolbox list
/mcp-toolbox reload
/mcp-toolbox help
```

- `status` reads/validates config and reports only source category, counts, environment-variable presence counts, and invocation state. It never probes the resolver or prints URLs, paths, provider/slot/purpose names, header values, tokens, bindings, or raw config.
- `list` shows only operator-configured canonical names and confirmation policy. It does not contact a server or display remote descriptions.
- The separate `mcp_toolbox_requirements` Pi tool takes exact configured `server` and `tool` fields, returns only that tool's bounded dynamic requirement metadata, and emits one frozen versioned replacement event. Unknown, denied, unconfigured, invalid, colliding, or over-limit selections fail without resolver/SDK/network activity.
- `reload` first emits a requirement-cache invalidation event, then advances the lifecycle generation and aborts active adapter/resolver work, replaces the config cache, waits for Pi to settle, and completes a bounded drain. It validates config without network access. Invalidation occurs even when the replacement config later fails; invalid reloads remain failed closed instead of retaining the old endpoint.
- `help` is local.

After editing extension source/package files, Pi's built-in `/reload` reloads the entire extension runtime. The extension-specific `/mcp-toolbox reload` reloads only Toolbox config/cache state.

## Calling tools

For environment/static credentials the model normally calls directly. For dynamic 1Password references, it first calls `mcp_toolbox_requirements(server,tool)`, waits, selects and approves a 1Password field with the returned requirement ID, waits for a later turn, and only then calls:

```json
{
  "server": "production",
  "tool": "search-hotels",
  "arguments": {
    "city": "Barcelona"
  }
}
```

Canonical identity is `server/tool`, but the dispatcher uses separate exact `server` and `tool` fields. Endpoint URLs, headers, auth sources, and bound parameters are never model-controlled.

Tools default to confirmation required. Confirmation displays only canonical identity and sorted argument **key names**, never values. A required-confirmation tool fails closed in print/JSON modes without UI. Mark an exact read-only tool `not-required` only after reviewing its behavior; this is also the explicit operator opt-in needed for noninteractive use.

Calls use Pi's sequential execution mode to avoid concurrent side effects through the dispatcher. There are no automatic invocation retries.

## Safety and lifecycle

- Extension load only registers its namespaced tools and command. It does not read config, import/construct the SDK, or access the network.
- Every SDK client and loaded tool is invocation-scoped, including environment-only calls. This intentionally avoids the SDK's retained header getters, load promises, generated auth headers, bound values, and callable-tool closures keeping a fetched resolver value in a cache.
- Server failures are isolated. There is no client/tool/schema cache to retain credential closures between invocations.
- Axios has a configured overall request timeout, redirects disabled, and an `AbortSignal` injected through `AsyncLocalStorage` for each SDK operation. Cancellation/timeout can leave a remote side-effect outcome unknown; verify remote state before retrying.
- Non-2xx bodies and complete JSON-RPC error payloads are replaced with one fixed data-only error before the SDK can parse, stringify, or pass them to its `console.error` path. Successful payloads are defensively cloned and exact-value redacted; malformed, accessor-backed, cyclic, oversized-structure, array-root, URL-object, and other non-data shapes are replaced wholesale. Adapter diagnostics never serialize Axios request/response/config objects or error stacks. SDK 1.0.1 still calls `console.error` and logs its configured request URL on failures; it has no logging-off option, so configured URLs cannot contain userinfo, query strings, or fragments and the extension does not claim console silence.
- Resolution uses provider-aware protocol v2 with a required exact provider, fresh cryptographic request ID, frozen value/reference-free event payload, strict frozen v2 response parsing, one-shot response handling, at most four concurrent requests, at most 20 accepted resolver requests per extension instance, a maximum 30-second resolver wait, the shorter overall Toolbox deadline, and Pi cancellation. Static slots retain the lowercase legacy grammar. Dynamic IDs use a strict canonical 50-character grammar, are accepted only for 1Password, and must have a prefix matching the exact request purpose; Bitwarden can never receive a dynamic ID. Duplicate/late responses are ignored; v1 responses are never accepted for v2 requests.
- Every selected environment value and every fetched exact value is installed in downstream JSON-RPC/error/output redaction before SDK initialization. Raw downstream, transport, cleanup, and callback errors are replaced or suppressed where they are unsafe. Output also redacts obvious credential fields/patterns, strips terminal/bidirectional controls, and is capped at Pi's 50 KB / 2,000-line limits. Full output is **not** persisted, including on truncation.
- Status/list/call result `details` contain only operation, canonical ids, duration/counts, and truncation metadata. Requirements result `details` use the exact metadata allowlist: protocol, selected server/tool IDs, and bounded requirement records containing only requirement ID, target kind/name, and derived purpose.
- Toolbox config reload, Pi reload, session replacement, and shutdown synchronously publish requirement invalidation, invalidate generations, abort active adapter/resolver requests, discard partial credential maps, clear active credential records, and boundedly await secret-bearing promise chains for at most one second. Sibling resolver requests are aborted on the first failure and drained before resolution returns. Late work cannot invoke a tool after invalidation. Every client is released in `finally`; the adapter ejects its Axios interceptors and disables its async-local context, while injected test clients are disposed when supported. `@toolbox-sdk/core@1.0.1` exposes no native `close`, `dispose`, or async-dispose method.
- The four fixed tool names use the `mcp_toolbox_` namespace to avoid accidental collisions. Pi's normal registration-order semantics apply if another extension deliberately registers the same name. Pi itself may suffix duplicate slash commands.

### Upstream SDK limitations

Version 1.0.1 returns text only and does not expose structured/image output, output schemas, annotations, list pagination, list-change notifications, or native per-call signal/cleanup methods. It also ignores MCP `isError: true` in an otherwise valid call response. Therefore:

- treat every returned string as untrusted data;
- server-side failures represented only by `isError` may appear as successful text;
- do not depend on non-text MCP content;
- reload after server tool/schema changes;
- use idempotency or remote status checks for consequential operations.

Generic redaction is defense in depth, not a data-loss-prevention guarantee. Exact-value replacement cannot detect transformed, encoded, hashed, split, or indirectly derived secret material. JavaScript strings, Axios/SDK internals, and upstream native/WASM provider memory cannot be zeroized deterministically. A reset settles and drains the consumer-side resolver promises, but the provider owns its underlying SDK work. The pinned Bitwarden native SDK and `@1password/sdk@0.4.0` cannot truly cancel or zeroize already-running work; late completion may occur locally after consumer cancellation and is discarded by the providers. Disable the selected resolver to reset its extension-held client state when finished. Avoid returning secrets from Toolbox tools.

Pi's process-wide event bus is not an authentication boundary. Any loaded extension can observe resolver requests and requirement metadata, impersonate a configured tuple/provider or requirement replacement, issue invalidation, retain metadata, or race a response. MCP Toolbox freezes exact bounded events/requests and validates strict resolver responses, while provider-aware routing prevents accidental provider races; labels/channels remain cooperative routing rather than cryptographic authentication. Enable Bitwarden or 1Password resolution only when every loaded extension is trusted.

## Validation

All focused tests are mock-only or constructor-only and do not contact a Toolbox server:

```bash
cd /home/jofre/.dotfiles/config/pi/agent/extensions/mcp-toolbox
npm ci --ignore-scripts
npm run check
npm ls --all
```

Coverage includes secure config-file races and bounds; exact static/environment/dynamic config unions; normative requirement-ID vectors, canonical framing, kind/purpose mapping, and target isolation; deeply frozen output/event allowlists and canary scans; offline discovery denial/no-client/no-resolver behavior; provider-preserving snapshots and tuple isolation; actual dynamic planner protocol-v2 requests; both static providers registered together with injected fake sources; wrong-provider silence/timeouts; one-shot v2 callbacks; sink-wide redaction; allow/deny mapping; argument validation; generation invalidation; reset/disposal drains; and the locked SDK export surface.
