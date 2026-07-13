# `firecrawl_map`

Discover links on one site. Map returns URLs; it does not scrape page content.

| Field | Contract |
|---|---|
| `url` | Required absolute HTTP(S), at most 4096 characters; userinfo rejected |
| `search` | Optional nonblank ranking term, at most 1000 characters |
| `sitemap` | Optional `only`, `include`, or `skip` |
| `includeSubdomains` | Optional boolean |
| `limit` | 1–500, default 100 |
| `advancedOptions` | Optional [bounded allowlisted object](advanced-options.md) |
| `timeoutSeconds` | 5–300, default 60 |

Typical arguments:

```json
{
  "url": "https://docs.example.com",
  "search": "authentication",
  "sitemap": "include",
  "limit": 100
}
```

`search` ranks discovered links; it does not guarantee strict filtering. The extension slices links to `limit` and adds `collection` metadata. Inspect the ranked URLs, then selectively scrape exact pages, batch an explicit set, or crawl only a bounded section. Do not claim that map saved or downloaded a site.

A host cancellation/deadline cannot abort an already in-flight map request. URLs and metadata are untrusted web data.
