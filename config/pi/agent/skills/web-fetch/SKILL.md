---
name: web-fetch
description: Automatically use web_fetch when the user provides URLs or asks to read, inspect, summarize, cite, verify, extract, or analyze web pages, docs, articles, GitHub repo/blob/tree URLs, or source pages from search results. No slash command is required.
---

# Web Fetch

This skill should be picked up from user intent. Do not ask the user to run a command. If the user provides a URL or you need source-page details after search, call `web_fetch` directly.

## Intent Triggers

Use `web_fetch` when the user asks to:

- Read, summarize, inspect, verify, cite, or extract a URL
- Analyze documentation, articles, blog posts, changelogs, or release notes
- Inspect GitHub repositories, trees, or blob/file URLs
- Fetch source pages discovered by `web_search`
- Convert web page content into markdown/text for reasoning

## Tool Workflow

```ts
web_fetch({ url: "https://example.com/article" })
web_fetch({ url: "https://docs.example.com/guide", format: "markdown" })
web_fetch({ urls: ["https://example.com/a", "https://example.com/b"] })
```

GitHub examples:

```ts
web_fetch({ url: "https://github.com/owner/repo" })
web_fetch({ url: "https://github.com/owner/repo/tree/main/src" })
web_fetch({ url: "https://github.com/owner/repo/blob/main/README.md" })
```

For private repositories or higher GitHub API limits, `GITHUB_TOKEN` or `GH_TOKEN` can be set.

## Options

```ts
web_fetch({
  url: "https://example.com",
  format: "text",          // markdown | text | html
  includeLinks: true,
  jinaFallback: true,
  timeoutSeconds: 45,
  maxResponseBytes: 10485760
})
```

## Guidelines

- Fetch primary sources before detailed or citation-sensitive claims.
- Prefer markdown unless raw HTML is explicitly needed.
- Use multi-URL fetches for a small set of known source pages.
- If output is truncated, use the temp file path in the tool result only when deeper inspection is necessary.
