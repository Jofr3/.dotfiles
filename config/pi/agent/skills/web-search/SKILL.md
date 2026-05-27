---
name: web-search
description: Automatically use web_search when the user asks for current information, outside knowledge, recent facts, releases, external research, comparisons, news, source discovery, or anything likely beyond local files/model memory. No slash command is required.
---

# Web Search

This skill should be picked up from user intent. Do not ask the user to run a command. If the request needs current or external information, call `web_search` directly.

## Intent Triggers

Use `web_search` when the user asks about:

- Recent/current facts, releases, changelogs, pricing, news, or availability
- External research or source discovery
- Library/framework comparisons or ecosystem questions
- Documentation/source URLs when Context7 is not the right fit or is insufficient
- Anything that may be outside local files or model knowledge

## Tool Workflow

For a focused question:

```ts
web_search({ query: "specific current question" })
```

For broad research, use 2-4 meaningfully different query angles:

```ts
web_search({
  queries: [
    "topic official documentation current",
    "topic release notes changelog",
    "topic source repository implementation"
  ],
  numResults: 5
})
```

Then use `web_fetch` on promising URLs before making source-specific claims.

## Provider Notes

Default provider order:

1. Brave Search if `BRAVE_SEARCH_API_KEY` or `braveApiKey` in `~/.pi/web-search.json` is configured
2. Zero-config Exa MCP
3. DuckDuckGo HTML fallback

Filters:

```ts
web_search({ query: "React 19 migration", recencyFilter: "month" })
web_search({ query: "SQLite vector search", domainFilter: ["sqlite.org", "-reddit.com"] })
web_search({ query: "TypeScript decorators", provider: "exa" })
```

## Guidelines

- Prefer authoritative sources: official docs, source repos, standards, release notes.
- Do not repeat near-identical queries.
- Search first, fetch/cite next.
- If all providers fail, explain the failure and consider browser automation if appropriate.
