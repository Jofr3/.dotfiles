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
| `~/.pi/agent/extensions/safeguard.ts` | Configurable policy engine for tool call interception |
| `~/.pi/agent/safeguard.json` | Safeguard rules config (block/confirm/allow with regex matching) |
