---
name: agent-browser
description: Browser automation with the agent-browser CLI. Use when the user needs to open websites, inspect pages, click/fill/type/select elements, take screenshots, extract page data, test web apps, log in, manage tabs/sessions, debug browser state, or automate any browser workflow. Prefer this over generic shell/browser approaches for web UI tasks.
allowed-tools: agent_browser_open agent_browser_snapshot agent_browser_run agent_browser_screenshot agent_browser_eval agent_browser_batch Bash(agent-browser:*) Bash(npx agent-browser:*)
---

# agent-browser CLI

Use `agent-browser` for browser automation. It drives Chrome/Chromium through CDP and returns compact accessibility snapshots with `@eN` refs that are easy for agents to act on.

Docs: https://agent-browser.dev

## Pi tools

Prefer the extension tools when available:

| Tool | Use |
|---|---|
| `agent_browser_open` | Navigate/open a URL. Browser session persists across later calls. |
| `agent_browser_snapshot` | Read the page as an accessibility tree with `@eN` refs. Defaults to interactive + compact. |
| `agent_browser_run` | Run any CLI command as argv, without the leading `agent-browser`. |
| `agent_browser_screenshot` | Capture a screenshot and attach the image when practical. |
| `agent_browser_eval` | Run JavaScript safely via base64, avoiding shell quoting. |
| `agent_browser_batch` | Run multiple CLI commands sequentially. |

Slash commands for humans: `/browser <args>`, `/browser-close [--all]`, `/browser-doctor`.

## Core loop

1. Open a page.
2. Snapshot it.
3. Act using refs from the latest snapshot.
4. Re-snapshot after any page change.

Example tool flow:

```text
agent_browser_open({ url: "https://example.com" })
agent_browser_snapshot({ interactive: true, compact: true })
agent_browser_run({ args: ["click", "@e3"] })
agent_browser_snapshot({ interactive: true, compact: true })
```

Refs (`@e1`, `@e2`, ...) are assigned fresh on every snapshot. They become stale after navigation, submits, modal open/close, dynamic re-render, tab switch, or any other page-changing action. Never guess refs; re-snapshot.

## Search engines and bot mitigation

If a search engine or site returns bot mitigation (CAPTCHA, reCAPTCHA, "unusual traffic", Cloudflare challenge, "I'm not a robot"):

- Do not try to solve or bypass the challenge.
- Do not repeatedly retry the same blocked workflow.
- Prefer direct/source-specific URLs, official site search, or public APIs when they satisfy the task.
- If the user explicitly needs the blocked site, report that manual CAPTCHA completion is required.

Example: for Wikipedia's article of the day, open `https://en.wikipedia.org/wiki/Main_Page` directly and inspect the "From today's featured article" section instead of searching Google.

## Reading pages

Use snapshots first:

```text
agent_browser_snapshot({})
agent_browser_snapshot({ urls: true })
agent_browser_snapshot({ depth: 3 })
agent_browser_snapshot({ selector: "#main" })
```

Use targeted getters when you already have a selector/ref:

```text
agent_browser_run({ args: ["get", "text", "@e1"] })
agent_browser_run({ args: ["get", "html", "@e1"] })
agent_browser_run({ args: ["get", "attr", "@e1", "href"] })
agent_browser_run({ args: ["get", "url"] })
agent_browser_run({ args: ["get", "title"] })
```

Use screenshots for visual/layout checks:

```text
agent_browser_screenshot({ full: true })
agent_browser_screenshot({ annotate: true })
```

`annotate: true` overlays numbered labels; label `[N]` corresponds to ref `@eN`.

## Interacting

Use refs from the latest snapshot:

```text
agent_browser_run({ args: ["click", "@e1"] })
agent_browser_run({ args: ["fill", "@e2", "user@example.com"] })
agent_browser_run({ args: ["type", "@e2", " more text"] })
agent_browser_run({ args: ["press", "Enter"] })
agent_browser_run({ args: ["check", "@e3"] })
agent_browser_run({ args: ["uncheck", "@e3"] })
agent_browser_run({ args: ["select", "@e4", "option-value"] })
agent_browser_run({ args: ["hover", "@e5"] })
agent_browser_run({ args: ["scroll", "down", "500"] })
agent_browser_run({ args: ["scrollintoview", "@e6"] })
```

When refs are unavailable, use semantic locators:

```text
agent_browser_run({ args: ["find", "role", "button", "click", "--name", "Submit"] })
agent_browser_run({ args: ["find", "label", "Email", "fill", "user@example.com"] })
agent_browser_run({ args: ["find", "placeholder", "Search", "type", "query"] })
agent_browser_run({ args: ["find", "text", "Sign In", "click", "--exact"] })
```

Raw CSS selectors are the fallback:

```text
agent_browser_run({ args: ["click", "button.primary"] })
agent_browser_run({ args: ["fill", "input[name=email]", "user@example.com"] })
```

## Waiting

Choose a specific wait after page-changing actions:

```text
agent_browser_run({ args: ["wait", "@e1"] })
agent_browser_run({ args: ["wait", "--text", "Success"] })
agent_browser_run({ args: ["wait", "--url", "**/dashboard"] })
agent_browser_run({ args: ["wait", "--load", "networkidle"] })
agent_browser_run({ args: ["wait", "--fn", "window.appReady === true"] })
```

Avoid `wait 2000` except as a last resort.

## JavaScript extraction

Use `agent_browser_eval` for scripts with quotes, backticks, or multiple lines:

```text
agent_browser_eval({ script: "Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText, href: a.href }))" })
```

For simple commands, `agent_browser_run({ args: ["eval", "document.title"] })` is okay, but prefer `agent_browser_eval` for reliability.

## Sessions and auth

- Use `session` parameters or global `--session` for isolated parallel browsers.
- Use `--session-name` or `state save/load` to persist cookies and localStorage.
- Do not put passwords in tool args or shell history. Prefer the auth vault:

```bash
echo "password" | agent-browser auth save my-app --url https://app.example.com/login --username user@example.com --password-stdin
agent-browser auth login my-app
```

Common state commands:

```text
agent_browser_run({ args: ["state", "save", "auth.json"] })
agent_browser_run({ args: ["--state", "auth.json", "open", "https://app.example.com"] })
```

## Debugging

```text
agent_browser_run({ args: ["--version"] })
agent_browser_run({ args: ["--help"] })
agent_browser_run({ args: ["console"] })
agent_browser_run({ args: ["errors"] })
agent_browser_run({ args: ["highlight", "@e1"] })
agent_browser_run({ args: ["inspect"] })
agent_browser_run({ args: ["close"] })
```

If available in the installed version, run diagnostics:

```text
agent_browser_run({ args: ["doctor"] })
```

If a documented command fails with “unknown command”, check `agent-browser --version`; the installed CLI may be older than https://agent-browser.dev.

## Safety and security

For untrusted sites or production agents, consider:

```bash
agent-browser --content-boundaries snapshot
agent-browser --max-output 50000 snapshot
agent-browser --allowed-domains "example.com,*.example.com" open https://example.com
agent-browser --action-policy ./policy.json open https://example.com
agent-browser --confirm-actions eval,download eval "document.title"
```

Security categories include navigation, click, fill/type, eval, download/upload, snapshot, scroll, wait, get, network, and state operations. Deny `eval`, `download`, and `upload` unless needed.

## Troubleshooting rules

- “Ref not found” / element not found: re-snapshot; refs are stale.
- Element missing: wait for expected text/URL/load state, scroll, then re-snapshot.
- Click does nothing: look for overlays/cookie banners/modals; dismiss then re-snapshot.
- Fill/type fails: focus the input, then try `keyboard inserttext`.
- Need visual confirmation: take an annotated screenshot.
- Done with browser: `agent_browser_run({ args: ["close"] })` or `/browser-close`.
