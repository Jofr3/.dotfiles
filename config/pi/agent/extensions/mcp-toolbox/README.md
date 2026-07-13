# MCP Toolbox for Pi

A global Pi extension for calling an operator-controlled allowlist of [MCP Toolbox](https://github.com/googleapis/mcp-toolbox-sdk-js) tools through the official JavaScript SDK.

The extension uses `@toolbox-sdk/core@1.0.1` and deliberately exposes three fixed Pi tools rather than dynamically registering server-provided names, descriptions, or schemas:

- `mcp_toolbox_status` — local configuration/lazy-state status; no network
- `mcp_toolbox_list` — exact configured allowlist; no network
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

The Bitwarden provider is optional. MCP Toolbox reproduces the small resolver-v1 wire contract locally and has no import or package dependency on the Bitwarden extension, so it still loads and its environment-only configuration still works when that provider is absent.

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
          "boundParams": ["tenant_id"]
        },
        {
          "name": "update-hotel",
          "toolset": "hotel-tools",
          "confirmation": "required",
          "authTokens": ["my_oauth"],
          "boundParams": ["tenant_id"]
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

or:

```json
{
  "resolver": {
    "provider": "bitwarden-secrets-manager",
    "slot": "production-authorization"
  }
}
```

The parser rejects mixed `env`/`resolver` objects, literal strings, interpolation, unknown providers, unsafe slot names, accessors, and unknown nested fields. Resolver references are accepted only inside `headers`, `authTokens`, and `boundParams`; URLs, tool declarations, protocols, and model-supplied call arguments cannot contain them. One selected tool may select at most 32 credential references total and at most 20 unique resolver slot/purpose tuples.

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

### Bitwarden resolver opt-in

Resolver use requires two separately trusted static configurations and explicit session consent. The model can choose only an already allowlisted `server` and `tool`; it cannot provide a provider name, slot, purpose, Bitwarden ID, or secret value.

1. In MCP Toolbox `config.json`, use the three resolver references shown above.
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

If the provider is absent, loaded later, disabled, denied, replaced, or too slow, the current request fails with one fixed credential-resolution error. There is no provider discovery/status probe and no slot, purpose, provider failure code, or value is returned to the model. A later invocation can succeed after the provider is enabled, so extension load order is not relied upon.

## Commands

```text
/mcp-toolbox status
/mcp-toolbox list
/mcp-toolbox reload
/mcp-toolbox help
```

- `status` reads/validates config and reports only source category, counts, environment-variable presence counts, and invocation state. It never probes the resolver or prints URLs, paths, provider/slot/purpose names, header values, tokens, bindings, or raw config.
- `list` shows only operator-configured canonical names and confirmation policy. It does not contact a server or display remote descriptions.
- `reload` first advances the lifecycle generation and aborts active adapter/resolver work, replaces the config cache, then waits for Pi to settle and completes a bounded drain. It validates config without network access. Invalid reloads remain failed closed instead of retaining the old endpoint.
- `help` is local.

After editing extension source/package files, Pi's built-in `/reload` reloads the entire extension runtime. The extension-specific `/mcp-toolbox reload` reloads only Toolbox config/cache state.

## Calling tools

The model normally calls:

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
- Resolution uses a fresh cryptographic request ID, a frozen value-free event payload, one-shot response handling, at most four concurrent requests, at most 20 accepted resolver requests per extension instance, a maximum 30-second resolver wait, the shorter overall Toolbox deadline, and Pi cancellation. Duplicate/late responses are ignored.
- Every selected environment value and every fetched exact value is installed in downstream JSON-RPC/error/output redaction before SDK initialization. Raw downstream, transport, cleanup, and callback errors are replaced or suppressed where they are unsafe. Output also redacts obvious credential fields/patterns, strips terminal/bidirectional controls, and is capped at Pi's 50 KB / 2,000-line limits. Full output is **not** persisted, including on truncation.
- Result `details` contain only operation, canonical ids, duration/counts, and truncation metadata.
- Toolbox config reload, Pi reload, session replacement, and shutdown synchronously invalidate generations, abort active adapter/resolver requests, discard partial credential maps, clear active credential records, and boundedly await secret-bearing promise chains for at most one second. Sibling resolver requests are aborted on the first failure and drained before resolution returns. Late work cannot invoke a tool after invalidation. Every client is released in `finally`; the adapter ejects its Axios interceptors and disables its async-local context, while injected test clients are disposed when supported. `@toolbox-sdk/core@1.0.1` exposes no native `close`, `dispose`, or async-dispose method.
- The three fixed tool names use the `mcp_toolbox_` namespace to avoid accidental collisions. Pi's normal registration-order semantics apply if another extension deliberately registers the same name. Pi itself may suffix duplicate slash commands.

### Upstream SDK limitations

Version 1.0.1 returns text only and does not expose structured/image output, output schemas, annotations, list pagination, list-change notifications, or native per-call signal/cleanup methods. It also ignores MCP `isError: true` in an otherwise valid call response. Therefore:

- treat every returned string as untrusted data;
- server-side failures represented only by `isError` may appear as successful text;
- do not depend on non-text MCP content;
- reload after server tool/schema changes;
- use idempotency or remote status checks for consequential operations.

Generic redaction is defense in depth, not a data-loss-prevention guarantee. Exact-value replacement cannot detect transformed, encoded, hashed, split, or indirectly derived secret material. JavaScript strings, Axios/SDK internals, and upstream native Bitwarden memory cannot be zeroized deterministically. A reset settles and drains the consumer-side resolver promises, but the provider owns its underlying SDK work; with the pinned Bitwarden native SDK, already-running native work may finish locally after consumer cancellation. Disable the Bitwarden resolver to synchronously reset that provider's shared client state when finished. Avoid returning secrets from Toolbox tools.

Pi's process-wide event bus is not an authentication boundary. Any loaded extension can observe resolver request metadata, impersonate a configured tuple, mutate an unfrozen hostile payload, or race a response. MCP Toolbox freezes its own requests and validates one response, but provider identity in config is an operator allowlist label rather than cryptographic authentication. Enable the Bitwarden resolver only when every loaded extension is trusted.

## Validation

All focused tests are mock-only or constructor-only and do not contact a Toolbox server:

```bash
cd /home/jofre/.dotfiles/config/pi/agent/extensions/mcp-toolbox
npm ci --ignore-scripts
npm run check
npm ls --all
```

Coverage includes secure config-file races and bounds, deep snapshots, allow/deny mapping, argument validation, prototype pollution, exact console canaries, output bounds/redaction, resolver failure races, generation invalidation, toolset mapping, reset/disposal drains, and the locked SDK export surface.
