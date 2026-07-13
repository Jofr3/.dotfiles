# Provenance and adaptation notes

Routing, trigger phrasing, endpoint-selection concepts, map-then-scrape guidance, avoidance of redundant fetches, and narrower-tool-before-agent guidance were adapted from official Firecrawl Agent Skills. Outcome recipes were adapted only where executable through the local Pi extension.

## Reviewed upstream sources

- [`firecrawl/cli` umbrella skill](https://github.com/firecrawl/cli/blob/5cf5c926d35fc114dc7579b9dbad09811fd42335/skills/firecrawl-cli/SKILL.md), plus its scrape, search, map, crawl, and agent skills, at revision `5cf5c926d35fc114dc7579b9dbad09811fd42335` (reviewed 2026-07-13). Package metadata identifies Firecrawl as author and ISC as license.
- [`firecrawl/skills`](https://github.com/firecrawl/skills/tree/7ad43730e76913c4d1e9f94bf6fa6f82e38fc12b) at revision `7ad43730e76913c4d1e9f94bf6fa6f82e38fc12b`, including endpoint-selection and integration references. Its build skills target application integration and were not copied as live-tool instructions.
- [`firecrawl/firecrawl-workflows`](https://github.com/firecrawl/firecrawl-workflows/tree/1a6b302731139d6de6117d205efd8198d3775cc3) at revision `1a6b302731139d6de6117d205efd8198d3775cc3`; only plugin-executable research, static SEO, and public knowledge-base concepts were retained.

The upstream ISC notices are preserved in [the bundled license](../LICENSE).

## Local authoritative contract

This adaptation targets Pi's registered `firecrawl_*` tools and the pinned `firecrawl@4.30.0` SDK. Exact behavior comes from the local [extension README](../../../extensions/firecrawl/README.md), [tool registrations](../../../extensions/firecrawl/src/index.ts), [safety implementation](../../../extensions/firecrawl/src/safety.ts), and [output implementation](../../../extensions/firecrawl/src/output.ts), not upstream command syntax.

All command-line invocation, installation, login, flag, shell-pipeline, automatic-output-file, feedback, credit-status, and concurrency instructions were removed. The pack invokes no command-line client and requires no helper scripts.

## Deliberately omitted capabilities

The local extension does not register Firecrawl browser actions, interact, parse, monitor, download, research-endpoint, session, or persistent-profile APIs. It also has no extract cancellation. Browser interaction is routed to separate `agent_browser_*` tools when available, never presented as a Firecrawl operation. Application-code integration skills were excluded because this pack is for live Pi tool use.
