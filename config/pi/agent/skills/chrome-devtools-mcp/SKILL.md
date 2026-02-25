---
name: chrome-devtools-mcp
description: Inspect and interact with a live Chrome browser via Chrome DevTools. Use for debugging web apps, checking console errors, inspecting network requests, taking screenshots, evaluating JavaScript, running performance traces, automating form filling and clicks, and building visual feedback loops during web development.
---

# Chrome DevTools MCP

Control and inspect a live Chrome browser through the `devtools` tool. The browser launches automatically on first use (or connects to an existing instance).

## Prerequisites

- [Node.js](https://nodejs.org/) v20.19+
- [Chrome](https://www.google.com/chrome/) stable or newer
- npx available in PATH

The `chrome-devtools-mcp` npm package is fetched automatically via npx on first use.

## Configuration

Use `/devtools` to configure interactively, or edit `~/.pi/agent/chrome-devtools-mcp.json`:

```json
{
  "headless": false,
  "slim": false,
  "noUsageStatistics": true,
  "noPerformanceCrux": true,
  "channel": "stable",
  "isolated": false,
  "npxPath": "npx",
  "extraArgs": []
}
```

Key options:
- `headless` — run Chrome without a visible window (good for CI)
- `browserUrl` — connect to a running Chrome instance (e.g. `http://127.0.0.1:9222`)
- `slim` — only expose 3 tools: navigate, evaluate_script, take_screenshot
- `isolated` — use a temp profile that's cleaned up on exit

Use `/devtools-reconnect` to restart the connection after config changes.

## Tool: `devtools`

All Chrome DevTools operations go through a single `devtools` tool with two parameters:
- `tool` — the DevTools action name
- `args` — a JSON object of arguments for that action

### Navigation

| Tool | Description | Key Args |
|------|-------------|----------|
| `navigate_page` | Navigate to a URL | `url` |
| `new_page` | Open a new tab | `url` (optional) |
| `close_page` | Close a tab | — |
| `list_pages` | List all open tabs | — |
| `select_page` | Switch to a tab | `index` or `url` |
| `wait_for` | Wait for a condition | `time`, `selector`, `url`, etc. |

### Input / Interaction

| Tool | Description | Key Args |
|------|-------------|----------|
| `click` | Click an element | `uid` |
| `fill` | Fill an input field | `uid`, `value` |
| `fill_form` | Fill multiple form fields at once | `fields` |
| `hover` | Hover over an element | `uid` |
| `press_key` | Press a keyboard key | `key` |
| `type_text` | Type text character by character | `text` |
| `drag` | Drag from one element to another | `startUid`, `endUid` |
| `handle_dialog` | Accept/dismiss a browser dialog | `accept`, `promptText` |
| `upload_file` | Upload a file to an input | `uid`, `filePaths` |

### Inspection / Debugging

| Tool | Description | Key Args |
|------|-------------|----------|
| `take_screenshot` | Screenshot the page or element | `uid`, `fullPage`, `format`, `filePath` |
| `take_snapshot` | Get the DOM tree with UIDs | — |
| `evaluate_script` | Run JavaScript in the page | `script` |
| `list_console_messages` | List console log messages | — |
| `get_console_message` | Get a specific console message | `id` |

### Network

| Tool | Description | Key Args |
|------|-------------|----------|
| `list_network_requests` | List all network requests | — |
| `get_network_request` | Get details of a request | `id` |

### Performance

| Tool | Description | Key Args |
|------|-------------|----------|
| `performance_start_trace` | Start recording a perf trace | — |
| `performance_stop_trace` | Stop and get trace results | — |
| `performance_analyze_insight` | Analyze a specific insight | `insightId` |
| `take_memory_snapshot` | Take a heap snapshot | — |

### Emulation

| Tool | Description | Key Args |
|------|-------------|----------|
| `emulate` | Emulate a device | `deviceName` |
| `resize_page` | Resize the viewport | `width`, `height` |

## Workflow Patterns

### Visual feedback loop (most common)

Use this when building or debugging a web app to verify changes visually:

```
1. devtools({ tool: "navigate_page", args: { url: "http://localhost:3000" } })
2. devtools({ tool: "take_screenshot", args: {} })
3. // Make code changes based on what you see
4. devtools({ tool: "evaluate_script", args: { script: "location.reload()" } })
5. devtools({ tool: "take_screenshot", args: {} })
```

### Debug console errors

```
1. devtools({ tool: "navigate_page", args: { url: "http://localhost:3000" } })
2. devtools({ tool: "list_console_messages", args: {} })
3. // Investigate and fix errors
```

### Inspect and interact with elements

```
1. devtools({ tool: "take_snapshot", args: {} })
   // Returns DOM tree with uid attributes on each element
2. devtools({ tool: "click", args: { uid: "abc123" } })
3. devtools({ tool: "fill", args: { uid: "def456", value: "hello world" } })
4. devtools({ tool: "take_screenshot", args: {} })
```

### Verify API calls

```
1. devtools({ tool: "navigate_page", args: { url: "http://localhost:3000" } })
2. // Trigger an action that makes API calls
3. devtools({ tool: "list_network_requests", args: {} })
4. devtools({ tool: "get_network_request", args: { id: "request-id" } })
```

### Performance profiling

```
1. devtools({ tool: "navigate_page", args: { url: "https://example.com" } })
2. devtools({ tool: "performance_start_trace", args: {} })
3. // Interact with the page
4. devtools({ tool: "performance_stop_trace", args: {} })
5. devtools({ tool: "performance_analyze_insight", args: { insightId: "..." } })
```

### Responsive design testing

```
1. devtools({ tool: "navigate_page", args: { url: "http://localhost:3000" } })
2. devtools({ tool: "emulate", args: { deviceName: "iPhone 14" } })
3. devtools({ tool: "take_screenshot", args: {} })
4. devtools({ tool: "resize_page", args: { width: 1920, height: 1080 } })
5. devtools({ tool: "take_screenshot", args: {} })
```

### Full-page vs element screenshot

```
// Viewport only (default)
devtools({ tool: "take_screenshot", args: {} })

// Full page scroll capture
devtools({ tool: "take_screenshot", args: { fullPage: true } })

// Specific element by uid (from snapshot)
devtools({ tool: "take_screenshot", args: { uid: "element-uid" } })

// Save to file instead of inline
devtools({ tool: "take_screenshot", args: { filePath: "/tmp/screenshot.png" } })
```

## Tips

1. **Always take_snapshot first** — It returns the DOM tree with `uid` attributes needed for click, fill, hover, etc.
2. **Use take_screenshot for visual verification** — Screenshots are returned as images the LLM can see.
3. **Connection is lazy** — The browser starts on the first tool call, not at session start.
4. **Reconnect after config changes** — Use `/devtools-reconnect` after modifying settings.
5. **evaluate_script for complex logic** — You can run any JS: read localStorage, modify DOM, call APIs.
6. **Combine with code edits** — Edit source → reload page → screenshot → verify. This is the core feedback loop.
7. **Check console for errors** — After any page interaction, `list_console_messages` catches runtime errors.
8. **wait_for for async pages** — Use `wait_for` with a selector or time to handle pages that load dynamically.
