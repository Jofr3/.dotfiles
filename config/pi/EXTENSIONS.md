# Pi Agent Extension Guide

Reference for creating pi extensions. Source code at `~/projects/pi-mono/packages/coding-agent/src/core/extensions/`.

## Extension Structure

An extension is a TypeScript (or JS) file that default-exports a factory function:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Register event handlers, commands, tools, shortcuts, etc.
}
```

The factory can be `async`. It receives an `ExtensionAPI` instance.

## Loading & Discovery

Extensions are discovered from three sources (in order, deduplicated):

1. **Global**: `~/.pi/agent/extensions/*.ts` (or `.js`)
2. **Project-local**: `<cwd>/.pi/extensions/*.ts`
3. **Configured paths**: passed via CLI (`pi -e path/to/ext.ts`) or config

Subdirectories are supported: `extensions/my-ext/index.ts` or via `package.json` with a `"pi.extensions"` field.

Loaded via `@mariozechner/jiti` — plain TypeScript, no build step needed. Extensions can import from:
- `@mariozechner/pi-coding-agent` (main package, includes `DynamicBorder`, `CustomEditor`)
- `@mariozechner/pi-tui` (UI components: `Container`, `Text`, `SelectList`, `Key`, `matchesKey`)
- `@mariozechner/pi-agent-core`
- `@mariozechner/pi-ai`
- `@sinclair/typebox` (for tool parameter schemas)
- Node.js built-ins (`fs`, `path`, `os`, etc.)

## Events

Register handlers with `pi.on(eventName, handler)`. Handlers receive `(event, ctx: ExtensionContext)`.

### Session Events

| Event | Description | Can cancel/modify? |
|-------|-------------|-------------------|
| `session_start` | Initial session load | No |
| `session_before_switch` | Before switching sessions | `{ cancel: true }` |
| `session_switch` | After switching | No |
| `session_before_fork` | Before forking | `{ cancel: true }` |
| `session_fork` | After forking | No |
| `session_before_compact` | Before context compaction | `{ cancel: true }` or provide custom compaction |
| `session_compact` | After compaction | No |
| `session_before_tree` | Before tree navigation | `{ cancel: true }` or provide summary |
| `session_tree` | After tree navigation | No |
| `session_shutdown` | Process exit | No |

### Agent Events

| Event | Description | Can modify? |
|-------|-------------|------------|
| `before_agent_start` | After user prompt, before agent loop | Add messages, replace system prompt |
| `agent_start` | Agent loop starts | No |
| `agent_end` | Agent loop ends | No |
| `turn_start` | Each turn starts | No |
| `turn_end` | Each turn ends | No |
| `context` | Before each LLM call | Modify messages |
| `message_start` | Message starts | No |
| `message_update` | Streaming updates | No |
| `message_end` | Message ends | No |
| `tool_execution_start` | Tool begins | No |
| `tool_execution_update` | Tool streaming | No |
| `tool_execution_end` | Tool finishes | No |
| `model_select` | Model changed | No |
| `input` | User input received | Transform or block |
| `user_bash` | User runs `!` / `!!` command | Override execution |
| `resources_discover` | Provide skill/prompt/theme paths | Return paths |

### Tool Events (Interception)

**`tool_call`** — fired before a tool executes. Return `{ block: true, reason: "..." }` to prevent execution. Return `undefined` to allow.

```ts
pi.on("tool_call", async (event, ctx) => {
  // event.toolName: string
  // event.toolCallId: string
  // event.input: tool-specific input object
  if (event.toolName === "bash" && /\brm\b/.test(event.input.command)) {
    return { block: true, reason: "Blocked rm command" };
  }
  return undefined;
});
```

**`tool_result`** — fired after a tool executes. Can modify the result:

```ts
pi.on("tool_result", async (event, ctx) => {
  // event.toolName, event.toolCallId, event.input
  // event.content: (TextContent | ImageContent)[]
  // event.details: tool-specific details
  // event.isError: boolean
  return { content: modifiedContent }; // or undefined to keep original
});
```

## Tool Input Schemas

Each built-in tool has typed input:

| Tool | Input fields |
|------|-------------|
| `bash` | `command: string`, `timeout?: number` |
| `read` | `path: string`, `offset?: number`, `limit?: number` |
| `write` | `path: string`, `content: string` |
| `edit` | `path: string`, `oldText: string`, `newText: string` |
| `grep` | `pattern: string`, `path?: string`, `glob?: string`, `ignoreCase?: boolean`, `literal?: boolean`, `context?: number`, `limit?: number` |
| `find` | `pattern: string`, `path?: string`, `limit?: number` |
| `ls` | `path?: string`, `limit?: number` |
| Custom | `Record<string, unknown>` |

Use `isToolCallEventType("bash", event)` for type narrowing (direct `event.toolName === "bash"` doesn't narrow because `CustomToolCallEvent.toolName` is `string`).

## ExtensionContext (`ctx`)

Passed as second argument to all event handlers.

```ts
interface ExtensionContext {
  ui: ExtensionUIContext;          // UI methods
  hasUI: boolean;                  // false in print/RPC mode
  cwd: string;                    // Current working directory
  sessionManager: ReadonlySessionManager;
  modelRegistry: ModelRegistry;
  model: Model<any> | undefined;
  isIdle(): boolean;
  abort(): void;
  hasPendingMessages(): boolean;
  shutdown(): void;
  getContextUsage(): ContextUsage | undefined;
  compact(options?: CompactOptions): void;
  getSystemPrompt(): string;
}
```

Command handlers get `ExtensionCommandContext` which adds: `waitForIdle()`, `newSession()`, `fork()`, `navigateTree()`, `switchSession()`, `reload()`.

## UI Methods (`ctx.ui`)

### Dialogs

All dialogs accept optional `{ signal?: AbortSignal, timeout?: number }`.

```ts
// Select from options — returns chosen string or undefined (cancelled)
const choice = await ctx.ui.select("Title", ["Option A", "Option B"]);

// Confirm — returns boolean
const confirmed = await ctx.ui.confirm("Title", "Are you sure?");

// Text input — returns string or undefined
const text = await ctx.ui.input("Title", "placeholder");

// Multi-line editor
const content = await ctx.ui.editor("Edit config", existingContent);

// Timed dialog (auto-dismisses with countdown)
const choice = await ctx.ui.select("Pick", ["A", "B"], { timeout: 5000 });
```

### Notifications

```ts
ctx.ui.notify("message", "info");    // "info" | "warning" | "error"
```

### Status Line

```ts
ctx.ui.setStatus("my-key", "text");  // Set persistent footer status
ctx.ui.setStatus("my-key", undefined); // Clear it
```

Supports theme colors:

```ts
const theme = ctx.ui.theme;
ctx.ui.setStatus("my-ext", theme.fg("success", "●") + theme.fg("dim", " Active"));
```

### Working Message

```ts
ctx.ui.setWorkingMessage("Processing...");  // Override streaming message
ctx.ui.setWorkingMessage();                  // Restore default
```

### Widgets

```ts
// Simple text widget above editor
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);

// Component factory widget
ctx.ui.setWidget("my-widget", (tui, theme) => new MyComponent());

// Below editor
ctx.ui.setWidget("my-widget", ["text"], { placement: "belowEditor" });

// Remove
ctx.ui.setWidget("my-widget", undefined);
```

### Custom Components (Full UI)

```ts
const result = await ctx.ui.custom<string>((tui, theme, keybindings, done) => {
  // Build a component, call done(value) when finished
  // Return: { render(w), invalidate(), handleInput(data), dispose?() }
});
```

### Other UI

```ts
ctx.ui.setTitle("Window Title");
ctx.ui.setEditorText("prefill text");
ctx.ui.getEditorText();
ctx.ui.pasteToEditor("text");
ctx.ui.setToolsExpanded(true);
ctx.ui.theme;                         // Current Theme object
ctx.ui.getAllThemes();
ctx.ui.setTheme("theme-name");
ctx.ui.setHeader(factory | undefined);
ctx.ui.setFooter(factory | undefined);
ctx.ui.setEditorComponent(factory | undefined);
ctx.ui.onTerminalInput(handler);      // Returns unsubscribe fn
```

## Commands

```ts
pi.registerCommand("my-command", {
  description: "What it does",
  getArgumentCompletions: (prefix) => {
    // Return AutocompleteItem[] | null for tab completion
    return [{ value: "option", label: "option" }];
  },
  handler: async (args: string, ctx: ExtensionCommandContext) => {
    // args is the raw string after /my-command
  },
});
```

User invokes as `/my-command args`.

## Tools

Register LLM-callable tools:

```ts
import { Type } from "@sinclair/typebox";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "Description for the LLM",
  parameters: Type.Object({
    input: Type.String({ description: "The input" }),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // params.input is typed
    onUpdate?.({ content: [{ type: "text", text: "Progress..." }], details: {} });
    return {
      content: [{ type: "text", text: "Result" }],
      details: { custom: "data" },
    };
  },
  renderCall: (args, theme) => { /* optional Component */ },
  renderResult: (result, options, theme) => { /* optional Component */ },
});
```

Registering a tool with the same name as a built-in overrides it.

## Keyboard Shortcuts

```ts
pi.registerShortcut("ctrl+k", {
  description: "My shortcut",
  handler: async (ctx) => { /* ... */ },
});
```

## CLI Flags

```ts
pi.registerFlag("verbose", {
  description: "Enable verbose output",
  type: "boolean",
  default: false,
});

// Later:
const verbose = pi.getFlag("verbose"); // boolean | string | undefined
```

## Messages

```ts
// Custom message (not sent to LLM unless triggerTurn is set)
pi.sendMessage({
  customType: "my-type",
  content: "text",
  display: "Display text",
  details: { any: "data" },
}, { triggerTurn: true, deliverAs: "steer" | "followUp" | "nextTurn" });

// User message (always triggers a turn)
pi.sendUserMessage("Hello agent", { deliverAs: "steer" | "followUp" });

// Persist data to session (not sent to LLM)
pi.appendEntry("custom-type", { data: "value" });
```

Custom message renderers:

```ts
pi.registerMessageRenderer("my-type", (message, options, theme) => {
  // Return Component | undefined
});
```

## Shell Execution

```ts
const result = await pi.exec("git", ["status", "--porcelain"], { cwd: ctx.cwd });
// result.code: number, result.stdout: string, result.stderr: string
```

## Session & Model

```ts
pi.setSessionName("My Session");
pi.getSessionName();
pi.setLabel(entryId, "bookmark-label");
pi.getActiveTools();        // string[]
pi.getAllTools();            // ToolInfo[]
pi.setActiveTools(names);
pi.getCommands();           // SlashCommandInfo[]
await pi.setModel(model);   // Returns false if no API key
pi.getThinkingLevel();
pi.setThinkingLevel("low" | "medium" | "high");
```

## Event Bus (Inter-Extension)

```ts
pi.events.on("my:event", (data) => { /* ... */ });
pi.events.emit("my:event", { key: "value" });
```

## Provider Registration

```ts
pi.registerProvider("my-proxy", {
  baseUrl: "https://proxy.example.com",
  apiKey: "ENV_VAR_NAME",
  api: "anthropic-messages",  // or "openai-responses"
  headers: { "X-Custom": "value" },
  authHeader: true,
  models: [{
    id: "model-id",
    name: "Display Name",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 16384,
  }],
  oauth: {
    name: "Provider Name",
    async login(callbacks) { /* ... */ },
    async refreshToken(credentials) { /* ... */ },
    getApiKey(credentials) { return credentials.access; },
  },
});
```

## Existing Extensions (Reference)

In `~/projects/pi-mono`:

| File | What it demonstrates |
|------|---------------------|
| `.pi/extensions/diff.ts` | Custom UI with `SelectList`, `/diff` command, `pi.exec()` for git |
| `.pi/extensions/files.ts` | Session introspection, parsing tool calls from entries |
| `examples/extensions/permission-gate.ts` | `tool_call` blocking with regex patterns + confirm dialog |
| `examples/extensions/protected-paths.ts` | Blocking writes to protected paths |
| `examples/extensions/confirm-destructive.ts` | Cancelling session events with `before_*` handlers |
| `examples/extensions/tool-override.ts` | Overriding built-in tools |
| `examples/extensions/status-line.ts` | `setStatus()` with themed colors |
| `examples/extensions/timed-confirm.ts` | Timed dialogs with `timeout` option |
| `examples/extensions/commands.ts` | Command with `getArgumentCompletions` |
| `examples/extensions/shutdown-command.ts` | Registering tools with `Type.Object` schemas |
| `examples/extensions/event-bus.ts` | Inter-extension communication via `pi.events` |

## Local Extensions

| File | Purpose |
|------|---------|
| `~/.pi/agent/extensions/bitwarden-secrets-manager/` | Disabled-by-default Bitwarden metadata tools and protected in-memory resolver; command: `/bitwarden-sm` |
| `~/.pi/agent/extensions/context7.ts` | `context7_search` and `context7_docs` documentation tools |
| `~/.pi/agent/extensions/database.ts` + `database-query/` | Secure direct `database_query` for MySQL/MariaDB and SQL Server/MSSQL; one-shot 1Password profiles or protected legacy static config; tools: `database_profile_requirements`, `database_query`; commands: `/database`, `/database-profile-clear` |
| `~/.pi/agent/extensions/dynamic-fleet.ts` | Task-specific dynamic subagent orchestration through `dynamic_fleet` |
| `~/.pi/agent/extensions/firecrawl/` | Lazy Firecrawl SDK tools for scrape/search/map/crawl/batch/extract/agent jobs; command: `/firecrawl status` |
| `~/.pi/agent/extensions/mcp-toolbox/` | Operator-allowlisted MCP Toolbox dispatcher with static/dynamic resolver compatibility; command: `/mcp-toolbox` |
| `~/.pi/agent/extensions/onepassword-secrets-manager/` | Disabled-by-default, service-account-only 1Password protected resolver, bounded metadata/search, TUI-only timed reveal, Stagehand Login autofill, and distinct one-shot MCP/database grants; tool: `onepassword_sm_status`; command: `/onepassword-sm` |
| `~/.pi/agent/extensions/push.ts` | `/push` Conventional Commit/push workflow and `/ship` staging-to-main merge/push |
| `~/.pi/agent/extensions/resource-toggler.ts` | `/toggle` session-only tool/skill/context prompt exposure controls (does not unload modules) |
| `~/.pi/agent/extensions/safeguard.ts` | Configurable tool-call allow/block/confirm policy engine |
| `~/.pi/agent/extensions/sftp.ts` | Project `.vscode/sftp.json` upload automation and `/sftp-push`/`/sftp-status` |
| `~/.pi/agent/extensions/stagehand/` | Session-scoped local/Browserbase browser automation with lazy Stagehand initialization |
| `~/.pi/agent/safeguard.json` | Safeguard rules config |

### Direct `database_query` + 1Password workflow

MCP Toolbox configuration is unnecessary and unchanged for direct database use. The exact sequence is:

1. Run `/onepassword-sm dynamic-enable` and approve bounded metadata disclosure.
2. Call `database_profile_requirements({ profileName: "primary" })` and wait.
3. Call and wait for `onepassword_list_vaults`, `onepassword_list_items`, and `onepassword_list_fields`, carrying forward only emitted opaque handles.
4. Let the model choose the one metadata-visible field that contains the documented atomic `pi.database.connection-profile/v1` JSON profile.
5. Call `onepassword_grant_database_profile({ vaultId, itemId, fieldId, profileId })`, review the canonical project/profile plus fixed consumer/tool/purpose/role/contract and selected metadata, and explicitly approve.
6. Stop that tool batch. After the successful grant turn ends, call `database_query({ query, profileId })` only in a **later turn**.
7. Prepare and approve a fresh profile for every later dynamic query or retry. The first exact admitted attempt burns the requirement/grant, including confirmation denial/cancellation and any later failure.
8. Clear with `/database-profile-clear` or `/onepassword-sm dynamic-disable`.

Project/conversation/memory context, titles such as `project1_database`, canonical project paths, and profile labels are model selection hints/display/scope metadata—not hardcoded lookup keys and not authorization. Explicit approval for the exact displayed project requirement and field is the authorization boundary. Multiple projects/databases use separate canonical scopes, profile IDs, and one-shot approvals.

Only one selected 1Password field containing one complete flat versioned JSON profile is supported dynamically. DSNs and separate-field mapping are unsupported. Resolved profile text/password/private references never enter model-visible arguments/results/progress/session data, approval text, logs, errors, files, temp files, or argv; known profile scalar echoes are redacted from output. The SQL executor enforces destructive/unknown/multi-statement confirmation in TUI/RPC and fails closed headlessly, with 64 KiB query, 30-second execution, 256/64 KiB raw output, 200-row, 100-column, 4 KiB-cell, and 32 KiB/500-line display bounds. Static plaintext `.agent/credentials/database.json` remains compatible only as an exact-current-project, trusted, owner-only `0600` file; the model must not read or create it.

Requirements/grants are invalidated on failure/retry, tree navigation, compaction, disable/clear, session replacement/fork, reload, shutdown, and restart. Database and MCP protocols are distinct and prevent accidental cross-consumption, but Pi's shared event bus cannot authenticate extensions; every loaded extension is part of the trusted computing base. Passwords use a minimal child-only environment because no pinned in-process drivers were available; same-UID/root environment observation and unpinned client versions are documented residual assumptions. See `agent/extensions/database-query/README.md`, `agent/extensions/onepassword-secrets-manager/README.md`, and `agent/skills/database/SKILL.md`.

### 1Password dynamic workflow

Dynamic mode does not read or require `resolver-bindings.json`. It is less restrictive than protected static bindings: after `/onepassword-sm dynamic-enable` consent, the model can see bounded safe MCP/direct-database requirement and 1Password vault/item/field metadata and choose any metadata-visible field permitted by the authenticated account. Discovery exposes keyed session-epoch handles rather than raw 1Password vault/item/field/section IDs, so the model cannot compose the internally generated `op://` reference from discovery outputs. Tool results are sent to the active model, appear in tool/RPC events, and are normally persisted in the Pi session. Requirement metadata also crosses a versioned process-local event. Use `OP_SERVICE_ACCOUNT_TOKEN` for a dedicated least-privilege service account restricted to the required vaults/items; prefer static protected bindings when a fixed allowlist is practical.

For dynamic 1Password credentials, MCP Toolbox configuration uses exactly `{ "resolver": { "provider": "onepassword-secrets-manager", "dynamic": true } }`—there is no user-authored slot. First call `mcp_toolbox_requirements(server, tool)` and wait. It reads only validated cached local config, derives an opaque per-tool/per-target `requirementId`, and exposes no value, URL, environment name, static slot, or raw config. Then call and wait for `onepassword_list_vaults`, `onepassword_list_items`, `onepassword_list_fields`, and `onepassword_grant_secret(..., requirementId)` in order. Never invent or alter an ID or provide a slot/purpose.

The grant confirmation shows escaped 1Password metadata plus the cached MCP server/tool/target kind/target name, opaque ID, and verified derived purpose. After approval and a successful grant result, call `mcp_toolbox_call` only in a **later tool turn**, never in the same/parallel batch. Each exact grant is in-memory and one-shot; any admitted downstream success or failure consumes it, so retries require fresh approval. Staged MCP grants arm only after a `stop`/`toolUse` turn whose finalized tools have `isError: false` and no `details.ok: false`; error, aborted, length-limited, malformed, thrown-tool-error, or logically failed turns revoke staged and armed grants. Failed/aborted agent runs and automatic-retry, compaction, or tree-navigation boundaries clear requirements, discoveries, and grants. Successful `agent_end`/`agent_settled` preserves an armed grant for mandatory later-turn use, while a cancelled retry cannot restore a grant revoked by its failed run. Re-running requirements replaces only its exact scope; MCP reload/invalidation revokes stale requirements/grants. `/onepassword-sm dynamic-disable`, Pi reload, session replacement/fork, shutdown, and restart clear requirement metadata, dynamic consent, discoveries, and grants.

Pi's process-wide event bus is cooperative and not an authentication boundary: loaded extensions can observe or spoof requirement metadata and resolver requests. Enable this flow only when every extension is trusted and verify the target shown in the approval prompt. Field discovery and grant verification use official `items.get`, which decrypts the full item—including values, details, notes, websites, tags, and files—inside SDK/WASM memory. The extension emits only strict field/section metadata and promptly drops its raw response reference, but cannot prevent or zeroize upstream copies.

`onepassword_search_items` performs bounded local title search across at most 20 vaults/1,000 item overviews. `onepassword_reveal_field` is TUI-only, requires separate approval, and clears its private popup value after 30 seconds or early dismissal. `onepassword_fill_login` strictly maps standard Login fields, checks the current HTTPS origin and form action against item website policy before value resolution, re-resolves username/password on every use, uses one revocable session-wide Stagehand lease, submits only an unambiguous form, rejects unapproved redirects, and stops at MFA/unexpected steps. Values never enter tool results/details, progress, events, session entries, logs, errors, or serialized extension state; the approved reveal popup and approved browser DOM/CDP path are the only deliberate sinks. See `~/.pi/agent/extensions/onepassword-secrets-manager/README.md` for exact requirements-first setup, lifecycle bounds, event/session persistence, trust model, and protected static-slot instructions.
