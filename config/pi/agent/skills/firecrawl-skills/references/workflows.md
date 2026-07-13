# Executable workflows

These workflows use only the registered local `firecrawl_*` tools. Always apply [endpoint selection](endpoint-selection.md), [setup and safety](setup-safety-and-output.md), and [job lifecycle](job-lifecycle.md).

## Deep research brief

1. Define the question, freshness needs, and acceptable source types.
2. Run several meaningfully different `firecrawl_search` queries; use web/news/domain constraints deliberately.
3. Select authoritative and independent sources. If search hydrated them with page content, avoid duplicate scrapes; otherwise use `firecrawl_scrape`.
4. For a known source list with shared extraction needs, use `firecrawl_batch_scrape`. Use crawl only for a bounded linked section.
5. Escalate to `firecrawl_agent` only for genuinely open-ended multi-source work; constrain URLs where possible, provide a schema, and set `maxCredits`.
6. Return source URLs, dates when relevant, disagreements, gaps, and a clear separation between evidence and inference.

## Static SEO/content audit

1. Use `firecrawl_map` to inventory and rank site URLs.
2. Select representative or high-value pages. Batch exact URLs, or crawl a narrowly scoped section.
3. Request markdown/links plus structured fields for titles, descriptions, headings, canonical/public links, and other evidence actually present in page output.
4. Use search and targeted source scrapes for public comparison evidence.
5. Report coverage limits and actionable findings.

This is a static content/link audit. Firecrawl here does not provide runtime performance, responsive-layout, screenshot, form, authenticated-session, or interaction testing. Use separate browser/performance tools for those tasks.

## Public knowledge base

1. Map a public documentation site or search for its canonical entry points.
2. Crawl a bounded docs section, or batch an exact URL list when traversal is unnecessary.
3. Request markdown and links; add structured options for stable metadata such as title, section, and source URL.
4. Deduplicate by canonical/source URL, preserve provenance, and organize the returned content with normal Pi file tools if the user requests files.
5. Record crawl scope, skipped areas, truncation, and refresh date.

Do not claim Firecrawl downloaded a site or wrote a local tree. Pi may write files from returned data, but the extension has no download API. Authenticated portals, load-more controls, and interactive pagination require separate browser tooling.

## Supported snapshot recipes

- **Competitive snapshot:** search/map current public pages, batch pricing/features/changelogs, optionally agent-synthesize. This is not monitoring or scheduled change detection.
- **Public directory collection:** map static profile links, then batch JSON extraction. Login, CAPTCHA, dynamic filters, and infinite scroll require browser tools.
- **Static design inventory:** scrape `branding`, `images`, HTML, or markdown. Firecrawl does not capture screenshots; use a separate screenshot tool when authorized.
