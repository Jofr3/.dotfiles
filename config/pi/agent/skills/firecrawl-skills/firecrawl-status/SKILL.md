---
name: firecrawl-status
description: Diagnoses the local Pi Firecrawl extension with firecrawl_status. Use for setup checks, API-key or base-URL presence, pinned SDK version, reload-after-environment-change guidance, authentication failures, or requests for Firecrawl status. This check does not initialize the SDK or contact Firecrawl.
license: "ISC; see ../LICENSE"
compatibility: Requires Pi with the local Firecrawl extension and firecrawl_status tool.
---

# Firecrawl status

Call `firecrawl_status` directly with `{}`. Do not run a shell command and never ask for a credential value in chat.

Read [the exact status contract](../references/status.md) and [setup and secret safety](../references/setup-safety-and-output.md).

Interpret results narrowly:

- `not initialized` is normal before the first network tool call.
- Configuration booleans report environment-variable presence only.
- Status does not validate the key, endpoint, service, network, quota, or account.
- If environment values changed after initialization, direct the user to update the Pi launch environment and use `/reload`.
- Limited cloud keyless scrape/search may work; other operations normally require authentication.
