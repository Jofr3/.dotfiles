# Pi Stagehand extension

Session-scoped browser automation for Pi using `@browserbasehq/stagehand` **3.6.0**. Loading Pi is credential-free and side-effect-free: the extension does not construct Stagehand, launch Chrome, attach CDP, or contact Browserbase until `stagehand_navigate` or `stagehand_tabs` needs a browser.

## Install

```bash
cd ~/.pi/agent/extensions/stagehand
npm ci
```

This checkout is auto-discovered through `package.json` → `pi.extensions`. Runtime dependencies are pinned in `package-lock.json`; Pi's own packages remain host-provided peers. Stagehand requires Node `^20.19.0 || >=22.12.0`.

Stagehand 3.6.0 statically imports its AI SDK provider adapters, so `.npmrc` ensures npm includes Stagehand's optional adapter packages and the lockfile pins the complete tree. Zod 3.25.76 satisfies Stagehand and its required OpenAI 4 client and provides the `zod/v4` compatibility export used by the optional Ollama adapter. A narrow package override aligns Ollama's peer metadata to that exact compatibility release; `npm ls zod --all` then validates the full installed tree.

## Configuration

### Browserbase (remote opt-in)

Export credentials in the environment that launches Pi:

```bash
export BROWSERBASE_API_KEY='...'
# Optional legacy/project setting:
export BROWSERBASE_PROJECT_ID='...'
# Optional model override. Browserbase Model Gateway can work with only the Browserbase key:
export STAGEHAND_MODEL='google/gemini-3-flash-preview'
```

### Local Chrome/Chromium (default)

```bash
export STAGEHAND_ENV=LOCAL
export STAGEHAND_MODEL='openai/gpt-5'
export OPENAI_API_KEY='...'
```

Local mode attaches by default to Chrome/Chromium's browser-level DevTools endpoint discovered at `http://127.0.0.1:9222`. It requires the selected model provider's normal authentication for AI-backed operations; navigation and screenshots themselves do not need an LLM key.

Start Chrome with remote debugging before using a local Stagehand tool:

```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.cache/stagehand-chrome-profile"
```

The endpoint can still be overridden when needed:

```bash
export STAGEHAND_CDP_URL='ws://127.0.0.1:9333/devtools/browser/...' # optional; sensitive
# Or override the loopback discovery origin:
export STAGEHAND_CDP_DISCOVERY_ORIGIN='http://127.0.0.1:9333'
```

### Reusing an existing Chrome safely

An already managed Stagehand instance is always reused preferentially. Stagehand 3.6.0 cannot discover arbitrary running Chrome/Chromium processes or make a normal personal browser controllable. The extension deliberately does **not** inspect process command lines or profile files, scan ports, or guess a debugger endpoint.

Reuse of an external browser requires the operator to start Chrome with remote debugging. The extension automatically resolves the **browser-level WebSocket** endpoint from `http://127.0.0.1:9222/json/version`, so no CDP environment variable is required. Use a dedicated debugging profile rather than a personal/default profile:

```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.cache/stagehand-chrome-profile"
```

Stagehand itself needs browser-level `Target.*` access: a `/devtools/page/...` endpoint is not sufficient. Direct `STAGEHAND_CDP_URL` values are restricted to a literal loopback `ws://` host with an explicit port, no credentials/query/fragment, and `/devtools/browser/<id>`. The resolver accepts only `http://127.0.0.1:<port>` or `http://[::1]:<port>`, requests exactly `/json/version` with a 2-second timeout, rejects redirects, caps the body at 64KB, and verifies that `webSocketDebuggerUrl` is a browser endpoint on the same loopback host/port. `STAGEHAND_CDP_URL` takes precedence; `STAGEHAND_CDP_DISCOVERY_ORIGIN` overrides the default discovery origin. No other host or port is probed. Resolution failure is explicit and does not silently scan or fall back to launching another browser.

Chrome 136+ requires a non-default `--user-data-dir` for remote-debugging switches. CDP access exposes every top-level tab, cookie, and signed-in state available through that browser endpoint, so use a dedicated profile and loopback listener.

With `STAGEHAND_CDP_URL`, a live status reports `connectionSource: "local-cdp-configured"`; successful default or overridden loopback resolution reports `"local-cdp-discovered"`. Browserbase reports `"browserbase-created"` or `"browserbase-resumed"`. These values distinguish Browserbase-managed sessions and explicit CDP attachment without returning an endpoint. This is bounded fixed-origin CDP resolution, not arbitrary Chrome discovery. Closing/reloading Pi disconnects Stagehand but does not kill the external browser or close its existing/Stagehand-created tabs.

### Per-navigation local/remote and tab selection

`stagehand_navigate` accepts optional launch arguments:

- `environment: local` — use installed Chrome/Chromium
- `environment: remote` — use Browserbase
- `headless: true|false` — unavailable with the default external CDP attachment; control Chrome's mode when starting it
- `tabRef` — activate and navigate one exact current reference returned by `stagehand_tabs`
- `newTab: true` — create a fresh top-level tab, then await navigation there

A call containing only `url` navigates the currently authorized tab when one exists, otherwise Stagehand's active page. `tabRef` and `newTab: true` are mutually exclusive. A reference cannot be combined with `environment` or `headless`, because a session switch invalidates it. The destination is validated against the same HTTP(S)/private-network policy before any tab is created or activated.

Local mode uses an external CDP browser, so `headless` cannot be set because Stagehand does not control that browser's launch mode. Start Chrome itself with the desired headed or headless setting.

An explicit environment overrides `STAGEHAND_ENV` for that navigation. If it differs from the open session, the extension closes the managed session and initializes the requested environment; subsequent `stagehand_*` tools continue in that session. When the argument is omitted, an existing session is reused, then `STAGEHAND_ENV` is honored, and a local browser is the final default.

The extension never accepts Browserbase/provider credentials as tool arguments and does not load `.env` or credential files. Status reports only credential/configuration presence booleans. Session IDs, debug/CDP URLs, URL queries, fragments, userinfo, and path components are omitted from public output. Errors are redacted against known credential values and active Browserbase metadata.

### Optional behavior

| Variable | Default | Purpose |
|---|---:|---|
| `STAGEHAND_ENV` | `LOCAL` | Default environment (`LOCAL` or `BROWSERBASE`) when navigation does not explicitly select local/remote |
| `STAGEHAND_MODEL` | Stagehand default | Stagehand model name |
| `STAGEHAND_KEEP_ALIVE` | `false` | Disconnect on close but intentionally leave the remote/local browser alive |
| `STAGEHAND_HEADLESS` | `false` | Incompatible with the default external CDP attachment; launch Chrome itself in the desired mode |
| `STAGEHAND_CDP_URL` | unset | Explicit sensitive browser-level WebSocket endpoint that overrides discovery |
| `STAGEHAND_CDP_DISCOVERY_ORIGIN` | `http://127.0.0.1:9222` | Override the one literal loopback origin used to resolve `/json/version`; never scans |
| `STAGEHAND_EXPERIMENTAL` | Browserbase: `false`; local: `true` | Enable direct-library experimental features |
| `STAGEHAND_SELF_HEAL` | `true` | Stagehand action self-healing |
| `STAGEHAND_SERVER_CACHE` | `false` | Browserbase server-side AI-operation cache; privacy-oriented default is off |
| `STAGEHAND_VERBOSE` | `0` | Stagehand verbosity (`0`–`2`); extension logger/Pino remain disabled |
| `STAGEHAND_INIT_TIMEOUT_MS` | `120000` | Initialization deadline (`10000`–`300000`) |
| `STAGEHAND_DOM_SETTLE_TIMEOUT_MS` | unset | DOM settle timeout (`0`–`120000`) |
| `STAGEHAND_REGION` | unset | Browserbase region |
| `STAGEHAND_VIEWPORT_WIDTH` / `STAGEHAND_VIEWPORT_HEIGHT` | unset | Viewport pair |
| `STAGEHAND_BROWSERBASE_SESSION_ID` | unset | Resume a Browserbase session; value is never shown |
| `STAGEHAND_ALLOW_PRIVATE_NETWORK` | `false` | Permit explicit localhost/private/link-local navigation |
| `STAGEHAND_ALLOW_SDK_LOGGING` | `false` | Permit inherited Stagehand flow-log sinks (see below) |

Configuration is read and validated lazily. `/stagehand status` and `stagehand_status` do not initialize a browser.

`STAGEHAND_KEEP_ALIVE=true` is an explicit cleanup opt-out. The extension disconnects and forgets the SDK instance, but the underlying browser/session may continue running. An external browser attached through either CDP configuration method is always operator-owned: Stagehand close disconnects from it, and does not kill that browser or close its tabs, regardless of `STAGEHAND_KEEP_ALIVE`.

Browserbase defaults to non-experimental API mode so Model Gateway can work with only `BROWSERBASE_API_KEY`. Local mode defaults to experimental direct-library mode. Setting Browserbase experimental mode generally requires provider-specific model credentials. Hybrid agents require experimental mode and a coordinate/vision-capable model.

### Stagehand flow logging

Stagehand 3.6.0 can inherit `BROWSERBASE_CONFIG_DIR` (JSONL/files) and `BROWSERBASE_FLOW_LOGS=1` (stderr). Those sinks may contain page content and raw CDP parameters/results. The extension refuses to initialize while either sink is configured unless `STAGEHAND_ALLOW_SDK_LOGGING=true` explicitly accepts that exposure. `disablePino` alone does not disable these sinks.

## Tools

- `stagehand_navigate` — lazy initialization and HTTP(S) navigation in the active, exact referenced, or a new tab
- `stagehand_tabs` — bounded `list`/title-or-display-URL search, exact `select`, and blank `new` tab creation
- `stagehand_observe` — grounded candidate actions
- `stagehand_act` — one natural-language or observed action
- `stagehand_extract` — requested schema-less extraction
- `stagehand_state` — raw accessibility/page text
- `stagehand_agent` — opt-in bounded DOM/hybrid autonomous task
- `stagehand_screenshot` — bounded in-memory capture; image attachment is opt-in
- `stagehand_status` — non-initializing state/configuration report, including page count, active tab reference, and live connection source
- `stagehand_close` — reset and best-effort SDK cleanup

Command: `/stagehand status|close|reset`. Print/JSON users should use the tools because notification UI is unavailable there.

### Private 1Password credential lease

The Stagehand extension also serves one fixed process-local `pi.stagehand.credential-lease/v1` handshake for the trusted `onepassword-secrets-manager` consumer. It is not an LLM tool. The event request contains only fixed protocol/consumer/purpose strings, a random nonce, and a direct responder callback. It never contains a credential, `op://` reference, page object, URL, tab/target ID, or browser metadata. The returned frozen lease is callback-only and is normally cached by the 1Password extension for the Pi session.

A lease can run only the fixed `login-form-fill` operation against the already authorized Stagehand page. It exposes a narrow page facade (`url`, `evaluate`, bounded load wait, bounded delay), reuses the manager's existing serialization queue/session, and never calls Stagehand model-backed act/extract/agent APIs. Configured Browserbase/Stagehand SDK flow logging makes credential leasing unavailable because raw CDP evaluate arguments contain credentials. Explicit Stagehand close/reset, 1Password disable, session replacement, `/reload`, and shutdown synchronously revoke leases. Session shutdown removes the broker's event listener.

`stagehand_tabs` behavior is explicit and deterministic:

- `action=list` may lazily initialize the current/default session, enumerates at most 200 tabs for metadata, and returns at most `maxResults` (default 20, maximum 50). It reports scanned/unscanned and matched/returned/omitted counts.
- `query` matches only opaque references, redacted/bounded titles, and sanitized origin-only display URLs. Ranking is exact reference, exact title, exact URL, title prefix, URL prefix, title substring, then URL substring; ties use a stable tab ordinal.
- Search never selects automatically. Multiple matches set `ambiguous: true`; select one exact `tabRef` or narrow the query rather than guessing.
- `action=select` accepts only an exact current reference. Unknown, closed, pre-reinitialization, or pre-`/reload` references fail and never fall back to an index or active page. HTTP(S) tabs must pass the same private-network policy as direct navigation and establish usable page state. `about:blank` is permitted for selection but leaves `navigationRequired: true`.
- `action=new` creates/selects `about:blank` and sets `navigationRequired: true`. When a URL is known, prefer `stagehand_navigate { url, newTab: true }` so creation and awaited navigation are one queued operation.

Tab references are opaque per-runtime/per-generation handles backed by Stagehand's stable page target identity. Raw CDP target IDs are never returned. Stagehand's active tab is its internal selected/most-recent target; ordinary manual Chrome tab switching is not reliably observable by Stagehand 3.6.0. Status and tab results report `activeTabRef` so callers can verify selection.

Page operations require either a successful `stagehand_navigate` or successful selection of a permitted existing HTTP(S) tab. That exact authorized target is used for observe/act/extract/state/agent/screenshot calls even if a popup or another externally opened tab becomes Stagehand's SDK-active page. If the authorized tab closes, operations fail closed until another permitted tab is selected or navigated. Tab listing is allowed before navigation; a newly created or selected blank tab requires navigation before page-analysis/action tools. All tools use Pi's sequential mode plus a manager queue, so commands, cleanup, tab selection, and page operations cannot race.

## Output and screenshot privacy

- Browser text and final composites are capped at Pi's 50 KB / 2000-line limits.
- Tab titles are terminal-sanitized, generically credential-redacted, and capped at 500 characters. Tab URLs expose only scheme/origin plus a redacted-path marker; queries and fragments are never returned.
- Tab queries, returned titles/origins, navigation URLs, and other tool arguments/results may still reveal private browsing context and are persisted in normal Pi sessions. Use narrow non-sensitive queries, a dedicated browser profile, and `--no-session` for sensitive browsing.
- Browser-controlled C0/C1, ESC, OSC/APC introducers, DEL, and bidi formatting controls are neutralized before terminal rendering.
- Full untruncated browser output is not written by this extension.
- Screenshot capture is preflighted at 16,000,000 CSS pixels and 16,384 px per dimension.
- `attachImage` defaults to **false**. Opt-in attachments are resized to at most 1600×1600 and 1 MB decoded.
- Pi persists tool-result image base64 in normal session files. Use `--no-session` and avoid `attachImage` for sensitive pages. The extension does not write a separate screenshot file.

## Autonomous-agent gates

`stagehand_agent` is disabled by default. Enable it deliberately:

```bash
export STAGEHAND_ENABLE_AGENT=true
```

Each call must set `confirmAutonomousTask: true`. TUI/RPC runs also show an operator confirmation dialog with the task. Print/JSON runs are rejected unless preconfigured:

```bash
export STAGEHAND_ALLOW_NONINTERACTIVE_AGENT=true
```

Consequential autonomous actions require both `allowConsequentialActions: true` on that call and:

```bash
export STAGEHAND_ALLOW_CONSEQUENTIAL_AGENT_ACTIONS=true
```

These gates reduce accidental autonomy; they do not turn webpage content into trusted instructions. Prefer `stagehand_observe` → `stagehand_act` for review-sensitive work.

## Lifecycle and failure semantics

The extension owns one Stagehand instance per Pi session. Pi calls cleanup on quit, reload, new/resume, and fork. Stagehand's own `close()` is best-effort and can swallow provider/context cleanup failures, so status says whether the SDK close promise settled—not that Browserbase independently confirmed termination.

Stagehand primitive timeouts can be cooperative. On host timeout/cancellation, the manager:

1. removes the instance from reuse;
2. attempts SDK close immediately;
3. retains the late promise; and
4. attempts SDK close again after that promise settles.

If initialization or an action never settles, status reports pending late cleanup. A timed-out/cancelled `stagehand_act` or `stagehand_agent` has an **unknown side-effect outcome**; inspect the external system before retrying. Transport-closed errors discard the dead instance and require a new `stagehand_navigate`; mutating operations are never automatically retried.

`%name%` variable values are hidden from Stagehand's model, but Pi stores tool arguments in session history. Do not put secrets in the `variables` parameter.

Direct `stagehand_navigate` blocks localhost/private/link-local destinations by default and resolves hostnames before local-mode navigation. Autonomous link following cannot provide a complete network sandbox; use autonomous mode only in an appropriately isolated environment.
