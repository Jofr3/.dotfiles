# `firecrawl_batch_scrape`

Use batch for an explicit finite URL set whose pages share scrape options. It does not discover or follow links.

## Actions and fields

| Action | Required | Valid operation-specific fields |
|---|---|---|
| `wait` | `urls` | start fields, polling, pagination |
| `start` | `urls` | start fields |
| `status` | `jobId` | pagination |
| `cancel` | `jobId` | no start fields |

Start fields:

- `urls`: 1–100 unique absolute HTTP(S) URLs, each at most 4096 characters; userinfo rejected.
- `formats`, `jsonOptions`: shared page output configuration.
- `advancedOptions`: [bounded batch allowlist](advanced-options.md).

All actions accept `timeoutSeconds` 5–900; wait defaults to 180, others to 60. Wait polling and wait/status pagination use [shared job bounds](job-lifecycle.md). Status/wait return at most 200 documents and include collection metadata.

Example long-job start:

```json
{
  "action": "start",
  "urls": ["https://example.com/a", "https://example.com/b"],
  "formats": ["markdown", "links"]
}
```

Then inspect with:

```json
{"action":"status","jobId":"job_abc123","maxPages":2,"maxResults":100}
```

Do not split a list into repeated one-page calls when options are shared. After local timeout/cancellation, status a known job before retrying. Use `cancel` only with the exact intended ID.
