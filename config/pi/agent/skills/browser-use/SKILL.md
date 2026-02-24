---
name: browser-use
description: Automate web browser tasks using AI. Use when you need to navigate websites, fill forms, extract data from web pages, take screenshots, interact with web UIs, or perform any browser-based task that requires real browser interaction. Powered by browser-use Python library.
---

# Browser Use — AI Browser Automation

Drive a real browser with natural language instructions. The `browser_use` tool delegates to an AI agent (via the browser-use Python library) that can navigate pages, click buttons, fill forms, extract structured data, and more.

## Prerequisites

### Installation

```bash
pip install browser-use
uvx browser-use install   # installs Chromium
```

### API Keys

Set the appropriate environment variable for your chosen LLM provider:

| Provider | Environment Variable |
|----------|---------------------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google | `GOOGLE_API_KEY` |
| Browser-Use | `BROWSER_USE_API_KEY` |

### Configuration

Use `/browser-use` to configure defaults interactively, or edit `~/.pi/agent/browser-use.json`:

```json
{
  "llmProvider": "openai",
  "llmModel": "gpt-4o",
  "headless": true,
  "useVision": true,
  "maxSteps": 25,
  "useCloud": false,
  "pythonPath": "python3"
}
```

## Tool: `browser_use`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | string | **Yes** | Natural language task description. Be specific — include URLs, expected data shape, steps. |
| `llm_provider` | string | No | Override LLM provider (`openai`, `anthropic`, `google`, `browseruse`). |
| `llm_model` | string | No | Override LLM model name. |
| `headless` | boolean | No | Run browser without visible window. |
| `use_vision` | boolean | No | Enable screenshot-based vision for the agent. |
| `max_steps` | number | No | Maximum agent steps before stopping. |
| `allowed_domains` | string[] | No | Restrict navigation to these domain patterns (e.g. `["*.github.com"]`). |
| `sensitive_data` | object | No | Key-value pairs of secrets. Use placeholder keys in the task; real values stay hidden from the LLM. |

### Return Value

The tool returns structured results including:
- `final_result` — the agent's final extracted answer
- `urls` — list of visited URLs
- `extracted_content` — content extracted at each step
- `actions` — list of actions performed
- `steps` / `duration_seconds` — execution metrics
- `errors` — any errors encountered

## Usage Patterns

### Basic web search & extraction

```
browser_use({
  task: "Go to news.ycombinator.com and extract the titles and URLs of the top 5 posts"
})
```

### Form filling with credentials

```
browser_use({
  task: "Go to https://example.com/login, log in with username my_user and password my_pass, then navigate to the dashboard and extract the account balance",
  sensitive_data: {
    "my_user": "actual_username",
    "my_pass": "actual_password"
  },
  use_vision: false
})
```

**Important:** When using `sensitive_data`, disable vision (`use_vision: false`) to prevent the LLM from seeing credentials in screenshots.

### Domain-restricted browsing

```
browser_use({
  task: "Find the pricing page on example.com and extract all plan names and prices",
  allowed_domains: ["*.example.com"]
})
```

### Headless data extraction

```
browser_use({
  task: "Navigate to https://github.com/browser-use/browser-use and extract: star count, fork count, last commit date, and description",
  headless: true,
  max_steps: 10
})
```

### Multi-step workflow

```
browser_use({
  task: "1. Go to Google Scholar. 2. Search for 'transformer architecture attention mechanism'. 3. Extract the title, authors, year, and citation count of the top 5 results. 4. Return as a structured list."
})
```

## Tips

1. **Be specific in tasks** — Include exact URLs, field names, expected data format. The more detail, the better the browser agent performs.
2. **Use `max_steps` wisely** — Simple extraction might need 5-10 steps. Complex multi-page workflows may need 30+. Default is 25.
3. **Vision helps with complex UIs** — `use_vision: true` (default) lets the agent see screenshots, which helps with dynamic/JavaScript-heavy pages. Disable for faster execution on simple pages.
4. **Secure credentials** — Always use `sensitive_data` for passwords and tokens. Reference placeholder keys in the task description.
5. **Domain restrictions** — Use `allowed_domains` when you want to prevent the browser from navigating to unexpected sites.
6. **Headless for CI/automation** — Set `headless: true` for background execution. Use `headless: false` during development to watch the browser.
7. **Cloud browsers** — Enable `useCloud` via `/browser-use` config if you need anti-detection, proxied browsing, or don't have a local Chromium.
