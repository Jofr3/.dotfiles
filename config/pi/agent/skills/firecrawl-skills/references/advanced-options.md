# Advanced options

Use first-class fields whenever available. `advancedOptions` is a bounded escape hatch for selected `firecrawl@4.30.0` options, not an arbitrary SDK request. Unknown top-level options fail.

## Exact top-level allowlists

| Tool | Allowed keys |
|---|---|
| scrape | `includeTags`, `excludeTags`, `onlyMainContent`, `timeout`, `waitFor`, `mobile`, `parsers`, `location`, `skipTlsVerification`, `removeBase64Images`, `fastMode`, `blockAds`, `proxy`, `maxAge`, `minAge`, `storeInCache`, `lockdown`, `redactPII`, `threatProtection` |
| search | `categories`, `tbs`, `location`, `ignoreInvalidURLs`, `timeout`, `scrapeOptions`, `enterprise`, `threatProtection` |
| map | `ignoreQueryParameters`, `timeout`, `location`, `threatProtection` |
| crawl | `prompt`, `maxDiscoveryDepth`, `sitemap`, `ignoreQueryParameters`, `deduplicateSimilarURLs`, `crawlEntireDomain`, `allowExternalLinks`, `allowSubdomains`, `robotsUserAgent`, `delay`, `maxConcurrency`, `regexOnFullURL`, `zeroDataRetention`, `scrapeOptions` |
| batch | `options`, `ignoreInvalidURLs`, `maxConcurrency`, `zeroDataRetention` |
| extract | `systemPrompt`, `allowExternalLinks`, `enableWebSearch`, `showSources`, `scrapeOptions`, `ignoreInvalidURLs`, `agent`, `threatProtection` |
| agent | `threatProtection` |

First-class/control fields cannot be overridden. In particular, search/crawl `advancedOptions.scrapeOptions.formats` and batch `advancedOptions.options.formats` are rejected; use the operation's first-class format/JSON fields.

## Safety bounds

The object is limited to 64KB serialized, depth 8, 1,000 total values, 100 properties per object, 200 items per array, and 20,000 characters per string. Top-level property names are 1–100 characters. It is recursively cloned into plain null-prototype JSON.

Selected numeric keys are bounded exactly as follows (milliseconds where the SDK option uses milliseconds):

| Key | Minimum | Maximum |
|---|---:|---:|
| `timeout` | 1,000 | 295,000 |
| `waitFor` | 0 | 60,000 |
| `maxDiscoveryDepth` | 0 | 100 |
| `maxConcurrency` | 1 | 100 |
| `delay` | 0 | 60,000 |
| `maxAge`, `minAge` | 0 | 31,536,000,000 |
| `maxPages` | 1 | 1,000 |
| `riskScoreThreshold` | 0 | 100 |

Prototype keys; API key/base URL, authorization, cookie, password, secret, token, and credential fields; arbitrary headers; webhooks; browser `actions`; profiles; mock, origin, and integration controls; URL userinfo; bearer values; and the configured API-key value are rejected. Never attempt to bypass those controls.

Nested option shapes are not fully validated locally; the SDK/service may still reject an allowed but malformed value. Keep advanced options minimal and consult the tool's live schema rather than guessing.
