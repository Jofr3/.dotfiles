# Structured JSON

## Supported format fields

Simple format arrays accept unique values from this exact set, with at most 12 items:

`markdown`, `html`, `rawHtml`, `links`, `images`, `summary`, `attributes`, `branding`, `product`, `menu`, `audio`, `video`

Never add the bare string `"json"` to `formats` or `scrapeFormats`; the pinned SDK rejects it. Instead use:

| Tool | Structured field |
|---|---|
| `firecrawl_scrape` | `jsonOptions` |
| `firecrawl_search` | `scrapeJsonOptions` |
| `firecrawl_crawl` | `scrapeJsonOptions` |
| `firecrawl_batch_scrape` | `jsonOptions` |
| `firecrawl_agent` | top-level optional `schema` |
| `firecrawl_extract` | top-level required `schema` for a new job |

`jsonOptions` and `scrapeJsonOptions` have the closed shape `{prompt?, schema?}` and require at least one of those fields. Their prompt is nonblank and at most 20,000 characters. The extension converts the object to the SDK's required structured format internally. No local default page format is promised when no format field is supplied.

Example arguments for `firecrawl_scrape`:

```json
{
  "url": "https://example.com/pricing",
  "formats": ["markdown"],
  "jsonOptions": {
    "prompt": "Extract the public pricing plans.",
    "schema": {
      "type": "object",
      "properties": {
        "plans": {
          "type": "array",
          "items": {"type": "object"}
        }
      },
      "required": ["plans"]
    }
  }
}
```

## Schema bounds

A schema must be a JSON object, at most 128KB serialized and at most 100 top-level properties; each top-level key is 1–100 characters. Recursive safety checks also limit nesting depth to 8, total values to 1,000, properties in any object to 100, items in any array to 200, and strings to 20,000 characters. Values must be finite, plain JSON; prototype keys and embedded configured API-key/bearer values are rejected.

A schema describes desired output; never include actual secrets or private examples in it. Prefer explicit object properties, types, arrays, and `required` fields over a vague prompt. Keep schemas only as broad as the requested evidence supports.

For one page, prefer `firecrawl_scrape` with `jsonOptions`. For a known URL set, use batch JSON options; for a bounded linked section, use crawl JSON options. Use maintenance-mode extract only when those routes are insufficient.
