# MCP Toolbox for Pi

A secure, lazy Pi dispatcher for [MCP Toolbox](https://github.com/googleapis/mcp-toolbox-sdk-js) using `@toolbox-sdk/core@1.0.1`.

With no protected config, Pi locally defines one managed `onepassword-db/execute_sql` tool. Its database type, server, port, database, username, and password are mapped from bounded 1Password field metadata and resolved only through six exact approved one-shot grants. The pinned Google Toolbox server starts on a random loopback port only for the confirmed call and is stopped afterward.

Configured external servers retain bounded catalog discovery after explicit operator confirmation. Credentials remain **dynamic 1Password-only**. The extension rejects literals, environment references, static slots, Bitwarden, project credential files, `.env` discovery, resolver binding files, `op://` configuration, and parent-directory searches.

## Pi surface

- `mcp_toolbox_status` — local config/catalog/lifecycle status; **never networked**
- `mcp_toolbox_list` — locally defines the managed 1Password database tool when no config exists; configured discovery servers still use confirmed credential-free catalog access
- `mcp_toolbox_requirements` — derives dynamic 1Password requirement IDs from one exact cached tool; **never networked**
- `mcp_toolbox_call` — confirms, revalidates, resolves one-shot grants, and invokes one exact tool
- `/mcp-toolbox status|list|discover-local|reload|help`

Remote tools are not dynamically registered as Pi tools. Remote descriptions never enter Pi's system prompt or list output.

## Quick start: managed database tool with no config

The pinned Linux x64 Google Toolbox 1.5.0 runtime is installed once with:

```bash
cd /home/jofre/.dotfiles/config/pi/agent/extensions/mcp-toolbox
npm run install-managed-runtime
```

The installer downloads one exact HTTPS artifact, enforces the pinned 304,021,960-byte size and SHA-256, and installs it owner-executable under ignored `runtime/`. No credential or endpoint configuration is created.

Then call `mcp_toolbox_list` (normally the agent does this), or run `/mcp-toolbox list`. With no protected config, listing is offline and returns `onepassword-db/execute_sql`. The exact workflow is:

1. `mcp_toolbox_requirements({ server: "onepassword-db", tool: "execute_sql" })`.
2. Discover one 1Password Database item and its safe field metadata.
3. Map the emitted `database_type`, `server`, `port`, `database`, `username`, and `password` requirement IDs to the corresponding exact fields and approve all six with `onepassword_grant_secret`.
4. In a later turn call `mcp_toolbox_call({ server: "onepassword-db", tool: "execute_sql", arguments: { sql: "SELECT 1" } })` and approve the call.
5. The extension validates the six values, starts the pinned Toolbox child on its session-random loopback port using a value-free engine template and a minimal child environment, invokes the real Toolbox `mysql-execute-sql` or `mssql-execute-sql` tool through `@toolbox-sdk/core`, then terminates the child.

The managed path writes no secret/config value to a file, argv, tool argument, result, log, or session entry. The child environment is the deliberate in-memory/process handoff and may be observable to same-UID/root processes. Toolbox validates the database connection at startup. Linux x64 is currently the only managed runtime target.

`/mcp-toolbox discover-local` remains an explicit, confirmed probe of a separately running external service at literal `127.0.0.1:5000`; it replaces the session-managed tool only after successful discovery. Remote or nonstandard endpoints still use protected configuration.

## Minimal protected configuration

For nonstandard or remote endpoints, the unavoidable bootstrap is a stable server ID, exact base URL, and protocol. `tools` is omitted:

```json
{
  "version": 1,
  "requestTimeoutMs": 30000,
  "servers": [
    {
      "id": "production",
      "url": "https://toolbox.example.com",
      "protocol": "2025-11-25",
      "denyTools": []
    }
  ]
}
```

Install the sanitized example as an owner-only file:

```bash
cd /home/jofre/.dotfiles/config/pi/agent/extensions/mcp-toolbox
install -m 600 config.example.json config.json
```

Alternatively set `PI_MCP_TOOLBOX_CONFIG` to an absolute protected JSON path. The override is authoritative and does not fall back when missing or invalid.

Config discovery order:

1. `PI_MCP_TOOLBOX_CONFIG`
2. package-local `config.json`
3. unconfigured safe state

Config files must be current-user-owned regular `0600` files with one link. Symlinks, races, invalid UTF-8, files over 256 KiB, and platforms without secure open flags fail closed.

### Named toolsets and denies

The default Toolbox toolset is always discovered. Add up to eight known named toolsets when required:

```json
{
  "id": "production",
  "url": "https://toolbox.example.com",
  "protocol": "2025-11-25",
  "toolsets": ["hotel-tools"],
  "denyTools": ["delete-hotel"]
}
```

The pinned SDK cannot discover named toolset names. Exact deny rules always win during listing, requirements, and invocation.

## Automatic discovery behavior

Calling `mcp_toolbox_list` for a discovery-mode server:

1. requires UI/RPC operator confirmation; headless modes fail before network access;
2. invalidates stale MCP requirement/grant metadata;
3. contacts only protected bootstrap endpoints from config;
4. uses no client headers, auth tokens, bound parameters, or 1Password resolver calls;
5. loads the default toolset plus configured named toolsets;
6. replaces remote descriptions with fixed text and strips remote parameter descriptions/defaults before the SDK handles them;
7. validates and detaches exact names, basic parameter type/required summaries, and supported Toolbox auth metadata;
8. advances the manager generation, aborts older operations, applies exact denies, and atomically caches a frozen generation-scoped catalog.

Discovery limits include 128 tools per toolset, 256 usable tools total, 100 parameters per tool, schema depth 8, 20,000 metadata nodes, 256 KiB normalized metadata, 8 auth alternatives per parameter, and 20 inferred auth destinations per tool. Unsafe/prototype/control names, case-confusable tool or authentication-header collisions, malformed schemas/auth metadata, accessors, excessive catalogs, and unsupported shapes fail closed.

Remote descriptions, examples, defaults, raw schemas, endpoint URLs, SDK/Zod objects, clients, and getters are never returned in tool results/details. List output contains only bounded canonical names, parameter summaries, and inferred auth destination names.

### Credential metadata that can be inferred

The pinned SDK reliably exposes:

- required invocation auth services from `_meta["toolbox/authInvoke"]`;
- auth-parameter service alternatives from `_meta["toolbox/authParam"]`.

Pi automatically creates dynamic 1Password auth-token requirements only for required invocation services and **single-choice** auth-parameter services. A tool with multiple alternatives is omitted because choosing one automatically would weaken least privilege.

Pi does **not** guess:

- catalog/client headers;
- protected bound parameters based on names such as `password`;
- a credential after HTTP 401/403 or `WWW-Authenticate`;
- named toolsets, server URL/ID, or protocol;
- confirmation exceptions or consequences.

Therefore discovery-mode servers must expose catalogs without credentials and cannot declare `headers`, `authTokens`, or `boundParams` in config. If catalog listing needs authentication, if a tool needs a protected bound parameter/client header, or if auth alternatives need operator selection, use the backward-compatible legacy allowlist below. There is no automatic fallback or secret guessing.

## Exact invocation and dynamic workflow

1. Call `mcp_toolbox_list`. Managed no-config listing is offline; configured external discovery asks for network approval.
2. Select an exact `server/tool` name from its bounded result.
3. Call `mcp_toolbox_requirements` for that exact pair.
4. Dynamically search/list 1Password metadata and call `onepassword_grant_secret` with each emitted opaque `requirementId`. For `onepassword-db/execute_sql`, all six targets must map to fields from one Database item.
5. Review and approve every verified one-shot grant.
6. In a **later tool turn**, call `mcp_toolbox_call` with ordinary noncredential arguments. The managed SQL tool accepts exactly the remote Toolbox argument `{ "sql": "..." }`.
7. Repeat requirement/grant preparation for each later call or retry.

Discovered and managed tools always use `confirmation: required`. Confirmation shows only canonical server/tool identity and sorted argument keys, never values.

Before consuming a grant, calls re-fetch and compare the exact catalog fingerprint. After credential resolution, the credential-bearing loaded tool is checked again before invocation. A removed, renamed, denied, auth-changed, schema-changed, or generation-stale tool is not invoked; its cached catalog and requirement/grant metadata are invalidated, and fresh discovery/approval is required.

Requirement prefixes remain:

- `mcp1-H-…` → header → `mcp-toolbox.header`
- `mcp1-A-…` → auth token → `mcp-toolbox.auth-token`
- `mcp1-B-…` → bound parameter → `mcp-toolbox.bound-param`

The model never receives a secret value, private 1Password ID, secret reference, configured endpoint, or credential source mapping.

## Backward-compatible legacy allowlists

Existing configs with a non-empty `tools` array retain exact per-tool behavior, including explicit dynamic headers, auth-token destinations, bound parameters, named toolsets, and protected `not-required` exceptions:

```json
{
  "version": 1,
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
          "boundParams": ["database_password"]
        }
      ],
      "headers": {},
      "authTokens": {
        "my_oauth": {
          "resolver": {
            "provider": "onepassword-secrets-manager",
            "dynamic": true
          }
        }
      },
      "boundParams": {
        "database_password": {
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

Every credential destination must use exactly the value-free dynamic marker shown above. Legacy mode remains the explicit operator policy for non-inferable credential routing.

## Transport, output, and lifecycle

- Registration, status, requirements, and managed no-config listing never construct the SDK, resolve a value, verify the large runtime binary, start a child, or contact a server.
- Managed invocation verifies the exact owner-only Linux x64 Toolbox 1.5.0 binary size/SHA-256 and value-free templates, starts one detached loopback-only child after grants and confirmation, ignores child stdout/stderr, and applies bounded readiness, cancellation, process-group termination, and cleanup.
- External discovery is short-lived, confirmation-gated, credential-free, redirect-free, ambient-proxy-free, deadline-bound, abort-aware, and response-bounded.
- The pinned SDK receives only a fixed non-sensitive placeholder origin; Pi's private Axios interceptor rewrites exact bounded MCP paths immediately before transport, then detaches endpoint-bearing request/config objects, response headers, and status text before returning to SDK code. SDK-retained error graphs and its internal logger therefore receive neither configured endpoints nor credential headers.
- Invocation clients/tools are short-lived; secret getters and bound values are not catalog-cached. Managed source fields cross only the resolver-to-child environment boundary and are cleared from extension-owned mutable containers on cleanup where possible.
- Arguments are cloned/frozen bounded JSON and recursively reject credential-bearing/routing keys and values, bearer tokens, `op://`, requirement IDs, URL credentials, accessors, cycles, prototype keys, and known credential values.
- SDK Zod validation runs again before invocation.
- Exact credential echoes and common secret patterns are redacted. Output is control-sanitized and capped at 50 KiB / 2,000 lines without a full-output temp file.
- Cancellation or timeout can leave remote side effects uncertain; verify remote state before retrying.
- Catalog refresh/mismatch advances the manager generation, aborts sibling operations, clears active credential records, and invalidates relevant catalogs, requirements, and grants. Reload, failed reload, session replacement/fork, shutdown, and sibling 1Password failure/tree/compaction boundaries do the same. Generation tickets captured before confirmation become stale across every boundary.
- If the cooperative requirement/grant invalidation event throws during reload, the config store enters a non-callable disabled state instead of installing or retaining any endpoint. Only a later successful `/mcp-toolbox reload` can restore configuration.
- JavaScript strings and upstream SDK/Axios/provider memory cannot be deterministically zeroized.

Pi's process-wide extension event bus is cooperative, not authenticated. Every loaded extension is part of the trusted computing base. Use a dedicated least-privilege `OP_SERVICE_ACCOUNT_TOKEN`; it remains the only launch-environment credential used by the sibling 1Password extension.

## Remaining bootstrap requirements

The managed no-config database path still requires one 1Password Database item with six unambiguous fields named/mappable as database type, server, port, database, username, and password. It supports MySQL/MariaDB and Microsoft SQL Server through Toolbox's execute-SQL tools. Other source options, TLS tuning, sockets, SSH tunnels, cloud-specific sources, and predeclared SQL tools require an external Toolbox deployment.

External automatic discovery cannot safely infer:

- a non-loopback server URL or stable server ID;
- protocol changes/downgrades;
- names of non-default toolsets;
- catalog authentication headers;
- protected client headers or bound parameters;
- a choice among multiple auth services;
- exact denies or any legacy `not-required` exception.

The extension never reads user Toolbox `tools.yaml`, application configuration, `.env`, project credentials, Pi auth/session data, resolver bindings, source code, parent directories, process lists, or open ports to obtain those values. The two tracked managed YAML templates contain only fixed source/tool structure and environment placeholders; they contain no resolved values.

## Offline validation

```bash
cd /home/jofre/.dotfiles/config/pi/agent/extensions/mcp-toolbox
npm run check
npm ls --all
```

Tests use fake SDK clients/Axios adapters only; they do not contact Toolbox, 1Password, or external services.
