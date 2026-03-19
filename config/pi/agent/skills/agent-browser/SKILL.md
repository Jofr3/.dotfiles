---
name: agent-browser
description: Browser automation via the agent-browser CLI. Use when the user needs to interact with websites — navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task. Triggers include requests to "open a website", "fill out a form", "click a button", "take a screenshot", "scrape data from a page", "test this web app", "login to a site", or any task requiring programmatic web interaction.
---

# Browser Automation with agent-browser

Control a headless Chrome browser through dedicated tools. The browser launches automatically on first use via a background daemon and persists between commands for fast subsequent operations.

## Prerequisites

- [agent-browser](https://github.com/vercel-labs/agent-browser) — Install via `npm i -g agent-browser`, `brew install agent-browser`, or `cargo install agent-browser`
- Run `agent-browser install` once to download Chrome from [Chrome for Testing](https://developer.chrome.com/blog/chrome-for-testing/)

## Tools

| Tool | Description |
|------|-------------|
| `browser_open` | Navigate to a URL. Optionally wait for a load condition. |
| `browser_snapshot` | Get the accessibility tree with element refs (`@e1`, `@e2`…). |
| `browser_action` | Click, fill, type, select, press, scroll, hover, check, drag using refs. |
| `browser_screenshot` | Take a screenshot (full page, annotated with element labels). |
| `browser_get` | Get text, HTML, value, URL, title, attribute, count, or styles. |
| `browser_wait` | Wait for element, text, URL pattern, network idle, JS condition, or time. |
| `browser_eval` | Execute JavaScript in the browser context. |
| `browser_exec` | Run any raw agent-browser command (tabs, cookies, network, state, etc.). |
| `browser_close` | Close the browser session. Always close when done. |

## Core Workflow

Every browser automation follows the **snapshot → ref → interact → re-snapshot** pattern:

1. **Navigate**: `browser_open({ url: "https://example.com" })`
2. **Snapshot**: `browser_snapshot({})` — get interactive elements with refs
3. **Interact**: Use refs from the snapshot to click, fill, select
4. **Re-snapshot**: After any page change, get fresh refs

```
browser_open({ url: "https://example.com/form" })
browser_snapshot({})
# Output: @e1 [input] "Email", @e2 [input] "Password", @e3 [button] "Submit"

browser_action({ action: "fill", ref: "@e1", value: "user@example.com" })
browser_action({ action: "fill", ref: "@e2", value: "password123" })
browser_action({ action: "click", ref: "@e3" })
browser_wait({ condition: "load", value: "networkidle" })
browser_snapshot({})  # MUST re-snapshot — refs are invalidated after navigation
```

## Ref Lifecycle (Critical)

Refs (`@e1`, `@e2`, etc.) are **invalidated** whenever the page changes. Always re-snapshot after:

- Clicking links or buttons that navigate
- Form submissions
- Dynamic content loading (dropdowns, modals, SPA transitions)

```
browser_action({ action: "click", ref: "@e5" })   # Navigates
browser_snapshot({})                                # MUST re-snapshot
browser_action({ action: "click", ref: "@e1" })    # Use NEW refs
```

## Common Patterns

### Form Filling

```
browser_open({ url: "https://example.com/signup" })
browser_snapshot({})
browser_action({ action: "fill", ref: "@e1", value: "Jane Doe" })
browser_action({ action: "fill", ref: "@e2", value: "jane@example.com" })
browser_action({ action: "select", ref: "@e3", value: "California" })
browser_action({ action: "check", ref: "@e4" })
browser_action({ action: "click", ref: "@e5" })
browser_wait({ condition: "load", value: "networkidle" })
```

### Data Extraction

```
browser_open({ url: "https://example.com/products" })
browser_snapshot({})
browser_get({ what: "text", ref: "@e5" })          # Get element text
browser_get({ what: "url" })                        # Get current URL
browser_get({ what: "title" })                      # Get page title
browser_get({ what: "attr", ref: "@e3", attr: "href" })  # Get attribute
```

### Wait for Dynamic Content

```
browser_wait({ condition: "selector", value: "#content" })          # Wait for element
browser_wait({ condition: "text", value: "Welcome" })               # Wait for text
browser_wait({ condition: "url", value: "**/dashboard" })           # Wait for URL
browser_wait({ condition: "load", value: "networkidle" })           # Wait for network
browser_wait({ condition: "fn", value: "window.ready === true" })   # Wait for JS
browser_wait({ condition: "ms", value: "3000" })                    # Fixed delay

# Wait for element to disappear
browser_wait({ condition: "fn", value: "!document.body.innerText.includes('Loading...')" })
browser_wait({ condition: "selector", value: "#spinner", state: "hidden" })
```

### Screenshots

```
browser_screenshot({})                                      # Viewport to temp dir
browser_screenshot({ path: "page.png" })                    # Save to path
browser_screenshot({ full: true })                          # Full page
browser_screenshot({ annotate: true })                      # With [N] labels on elements
```

Annotated screenshots overlay `[N]` labels on interactive elements — each maps to `@eN` refs. Use when:
- The page has unlabeled icon buttons or visual-only elements
- You need to verify visual layout or styling
- Canvas or chart elements are present (invisible to text snapshots)

### JavaScript Evaluation

```
browser_eval({ script: "document.title" })
browser_eval({ script: "document.querySelectorAll('img').length" })
browser_eval({ script: "JSON.stringify(Array.from(document.querySelectorAll('a')).map(a => a.href))" })
```

Complex scripts with nested quotes are safe — the extension uses base64 encoding automatically.

### Scrolling

```
browser_action({ action: "scroll", value: "down" })         # Default 300px
browser_action({ action: "scroll", value: "down 500" })     # Custom distance
browser_action({ action: "scroll", value: "up" })
```

### Keyboard

```
browser_action({ action: "press", value: "Enter" })
browser_action({ action: "press", value: "Tab" })
browser_action({ action: "press", value: "Control+a" })
```

### Authentication with State Persistence

```
# Login once
browser_open({ url: "https://app.example.com/login" })
browser_snapshot({})
browser_action({ action: "fill", ref: "@e1", value: "user@example.com" })
browser_action({ action: "fill", ref: "@e2", value: "password" })
browser_action({ action: "click", ref: "@e3" })
browser_wait({ condition: "url", value: "**/dashboard" })

# Save state for reuse
browser_exec({ args: ["state", "save", "auth.json"] })

# In future sessions, restore state
browser_exec({ args: ["state", "load", "auth.json"] })
browser_open({ url: "https://app.example.com/dashboard" })
```

### Tabs

```
browser_exec({ args: ["tab"] })                                     # List tabs
browser_exec({ args: ["tab", "new", "https://example.com"] })      # New tab
browser_exec({ args: ["tab", "2"] })                                # Switch to tab 2
browser_exec({ args: ["tab", "close"] })                            # Close current tab
```

### Network Inspection

```
browser_exec({ args: ["network", "requests"] })                    # View requests
browser_exec({ args: ["network", "requests", "--filter", "api"] }) # Filter
browser_exec({ args: ["network", "route", "**/api/*", "--abort"] })# Block requests
```

### Cookies & Storage

```
browser_exec({ args: ["cookies"] })                                 # Get all cookies
browser_exec({ args: ["storage", "local"] })                        # Get localStorage
browser_exec({ args: ["storage", "local", "set", "key", "val"] })  # Set value
```

### Navigation

```
browser_exec({ args: ["back"] })                                    # Go back
browser_exec({ args: ["forward"] })                                 # Go forward
browser_exec({ args: ["reload"] })                                  # Reload page
```

### Viewport & Device Emulation

```
browser_exec({ args: ["set", "viewport", "1920", "1080"] })        # Set viewport
browser_exec({ args: ["set", "viewport", "375", "812"] })          # Mobile width
browser_exec({ args: ["set", "device", "iPhone 14"] })             # Emulate device
```

### Working with Iframes

Iframe content is automatically inlined in snapshots. Refs inside iframes carry frame context, so you can interact with them directly — no frame switch needed:

```
browser_snapshot({})
# @e3 [Iframe] "payment-frame"
#   @e4 [input] "Card number"
#   @e5 [button] "Pay"

browser_action({ action: "fill", ref: "@e4", value: "4111111111111111" })
browser_action({ action: "click", ref: "@e5" })
```

### Semantic Locators (Alternative to Refs)

When refs are unavailable or unreliable:

```
browser_exec({ args: ["find", "text", "Sign In", "click"] })
browser_exec({ args: ["find", "label", "Email", "fill", "user@test.com"] })
browser_exec({ args: ["find", "role", "button", "click", "--name", "Submit"] })
```

### Console & Errors

```
browser_exec({ args: ["console"] })          # View console messages
browser_exec({ args: ["errors"] })           # View page errors
```

### Diffing (Verify Changes)

```
browser_snapshot({})                                                            # Baseline
browser_action({ action: "click", ref: "@e2" })                                # Action
browser_exec({ args: ["diff", "snapshot"] })                                    # See what changed
browser_exec({ args: ["diff", "screenshot", "--baseline", "before.png"] })     # Visual diff
```

## Snapshot Options

The `browser_snapshot` tool accepts filtering options to reduce output:

| Parameter | Description |
|-----------|-------------|
| `interactive` | Only show interactive elements — buttons, links, inputs (default: `true`) |
| `cursor` | Include cursor-interactive elements (divs with onclick, cursor:pointer) |
| `compact` | Remove empty structural elements |
| `depth` | Limit tree depth (e.g. `3`) |
| `selector` | Scope to CSS selector (e.g. `"#main"`) |

```
browser_snapshot({ interactive: true, compact: true, depth: 5 })
browser_snapshot({ selector: "#main" })
browser_snapshot({ interactive: true, cursor: true })  # For modern SPAs with custom clickable divs
```

## Configuration

Use `/browser` to configure interactively, or edit `~/.pi/agent/agent-browser.json`:

```json
{
  "headed": true,
  "sessionName": "myapp",
  "profile": "./browser-data",
  "colorScheme": "dark",
  "engine": "chrome",
  "contentBoundaries": false,
  "allowedDomains": "example.com,*.example.com",
  "extraFlags": []
}
```

Use `/browser-close` to quickly close the browser session.

## Timeouts and Slow Pages

Default timeout is 25 seconds. For slow pages, use explicit waits:

```
browser_open({ url: "https://slow-site.com" })
browser_wait({ condition: "load", value: "networkidle" })   # Wait for network to settle
browser_wait({ condition: "selector", value: "#content" })  # Wait for specific element
browser_snapshot({})
```

## Session Cleanup

Always close the browser when done to avoid leaked daemon processes:

```
browser_close({})
```

The extension also auto-closes the browser on session shutdown.

## Guidelines

- **Always snapshot before interacting.** You need refs to click, fill, or interact with elements.
- **Re-snapshot after page changes.** Refs are invalidated by navigation, form submissions, and dynamic content.
- **Use `browser_wait` for async pages.** Don't assume content is loaded immediately after navigation.
- **Prefer `browser_snapshot` over `browser_screenshot`.** Text snapshots are faster and more informative for most tasks. Use screenshots only for visual verification.
- **Close when done.** Call `browser_close` to free resources and avoid orphaned processes.
- **Use `browser_exec` for advanced operations.** Tabs, cookies, network, state management, viewport settings — anything not covered by the focused tools.
