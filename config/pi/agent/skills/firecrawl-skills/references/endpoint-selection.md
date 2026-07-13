# Endpoint selection

Use the smallest local `firecrawl_*` operation that satisfies the request.

| Intent | Route |
|---|---|
| Setup, version, or environment uncertainty | `firecrawl_status` |
| Current information or source discovery; no URL yet | `firecrawl_search` |
| Read or structure one exact page | `firecrawl_scrape` |
| Known site, unknown subpage, or URL inventory | `firecrawl_map`, then selectively scrape |
| Known finite URL list with shared options | `firecrawl_batch_scrape` |
| Follow links through a bounded site or section | `firecrawl_crawl` |
| Explicit legacy cross-page extraction request | `firecrawl_extract` (maintenance-mode only) |
| Open-ended multi-source objective that narrower tools cannot solve | `firecrawl_agent` |

Structured output is not a separate endpoint choice. Use scrape `jsonOptions`, search/crawl `scrapeJsonOptions`, or batch `jsonOptions`. Prefer page-level JSON over extract, and narrower deterministic operations over agent jobs.

## Conditional escalation

`status if uncertain → search → selective scrape → map when a domain emerges → batch exact URLs OR crawl a section → agent only if still necessary`

This is not a mandatory pipeline:

- If search already returned sufficient content through `scrapeFormats` or `scrapeJsonOptions`, do not scrape the same result again.
- Map discovers and ranks links but does not read page content. Map plus selective scrape is often better than a broad crawl.
- Scope bulk work with paths, URL lists, result limits, and output formats before starting it.
- Use batch for explicit URLs; use crawl only when link traversal/discovery is required.
- Put a schema on structured work when predictable output matters.

## Unsupported routes

The extension exposes no Firecrawl browser/action, interact, parse, monitor, download, research-endpoint, or session/profile tool. It also exposes no extract cancellation. For authorized clicks, forms, login, scrolling, screenshots, or interactive pagination, use separate `agent_browser_*` tools if available; never describe those as Firecrawl capabilities. Audio and video are scrape output formats, not a download API.
