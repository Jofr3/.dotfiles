# `firecrawl_extract`

Firecrawl marks this structured extract endpoint deprecated/maintenance-mode. Prefer scrape `jsonOptions` for one page, batch `jsonOptions` for exact URLs, or crawl `scrapeJsonOptions` for a linked section. Use extract only when the user explicitly needs this legacy endpoint or narrower structured routes are insufficient.

## Actions and fields

| Action | Required | Other start fields |
|---|---|---|
| `wait` | `schema`, plus `urls` and/or `prompt` | `advancedOptions`, polling |
| `start` | `schema`, plus `urls` and/or `prompt` | `advancedOptions` |
| `status` | `jobId` | no start fields |

There is **no `cancel` action** in the pinned SDK.

- `urls`: when supplied, 1–50 unique absolute HTTP(S) URLs, each at most 4096 characters.
- `prompt`: optional nonblank extraction instruction, at most 20,000 characters.
- `schema`: required JSON object for every new job; see [schema bounds](structured-json.md).
- `advancedOptions`: [bounded extract allowlist](advanced-options.md).
- `timeoutSeconds`: 5–900; wait default 180, other actions default 60.
- Wait polling: interval 1–30 seconds (default 2), polls 1–300 (default 120).

Example start:

```json
{
  "action": "start",
  "urls": ["https://example.com/catalog"],
  "prompt": "Extract the public catalog entries.",
  "schema": {"type":"object","properties":{"entries":{"type":"array"}}}
}
```

A start response can already be completed; otherwise retain its ID and call `status`. A timed-out or cancelled local wait leaves the extract remote and it can only be checked with status. Never imply it can be cancelled.
