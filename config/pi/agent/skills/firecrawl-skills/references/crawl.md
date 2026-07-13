# `firecrawl_crawl`

Use crawl for bounded linked-page discovery and extraction from one site or section.

## Actions and fields

| Action | Required | Valid operation-specific fields |
|---|---|---|
| `wait` | `url` | start fields, polling, pagination |
| `start` | `url` | start fields |
| `status` | `jobId` | pagination |
| `cancel` | `jobId` | no start fields |

Start fields:

- `url`: absolute HTTP(S), at most 4096 characters; userinfo rejected.
- `includePaths`, `excludePaths`: each at most 50 nonblank strings, each at most 1000 characters.
- `limit`: remotely requested pages, 1–200, default 100.
- `scrapeFormats`, `scrapeJsonOptions`: per-page output configuration.
- `advancedOptions`: [bounded crawl allowlist](advanced-options.md).

All actions accept `timeoutSeconds` 5–900; wait defaults to 180, others to 60. Wait polling and wait/status pagination use the exact shared bounds in [job lifecycle](job-lifecycle.md). `maxResults` is a separate local returned-document cap; it does not change crawl `limit`.

Start a long crawl with arguments such as:

```json
{
  "action": "start",
  "url": "https://docs.example.com",
  "includePaths": ["/guides/"],
  "excludePaths": ["/guides/archive/"],
  "limit": 50,
  "scrapeFormats": ["markdown", "links"]
}
```

Then call `status` with only the intended job and collection controls, for example:

```json
{"action":"status","jobId":"job_abc123","maxPages":2,"maxResults":100}
```

Scope before starting. Prefer map plus selective scrape if only a few pages are needed. After local timeout/cancellation, status the known job before retrying; use `cancel` only with the exact intended ID.
