# Job lifecycle

## Actions

| Tool | New job | Inspect | Cancel |
|---|---|---|---|
| `firecrawl_crawl` | `wait` or `start` | `status` | `cancel` |
| `firecrawl_batch_scrape` | `wait` or `start` | `status` | `cancel` |
| `firecrawl_extract` | `wait` or `start` | `status` | **not supported** |
| `firecrawl_agent` | `wait` or `start` | `status` | `cancel` |

- `wait` starts a new remote job and polls it. Extract is the exception: its start response can already be complete.
- Use `wait` only for work expected to finish inside a deliberately bounded host call.
- Prefer `start`, save the returned job ID, then call `status` for long or uncertain work.
- Use `cancel` only with the exact intended job ID. Cancellation must be confirmed by the SDK.
- New-job fields are rejected on `status`/`cancel`. Omit irrelevant fields: `jobId` on `wait`/`start`, polling on non-`wait` actions, and pagination on `start`/`cancel` are accepted in some shared schemas but ignored.

Job IDs are 1–200 characters and must match `^[A-Za-z0-9_-]+$`.

## Deadlines and polling

Every job action accepts `timeoutSeconds` from 5–900. The default is 180 for `wait` and 60 otherwise. A waiter uses `pollIntervalSeconds` 1–30 (default 2) and `maxPolls` 1–300 (default 120). It polls immediately after starting, then sleeps between polls. Poll exhaustion is an error and does not cancel the remote job.

Each SDK transport call has a 60-second timeout and at most two total attempts. The host deadline is separately enforced but cannot abort a transport request already in flight.

## Crawl/batch status collection

`wait` and `status` can auto-collect paginated crawl/batch documents:

- `maxPages`: 0–10 additional pages, default 2; `0` disables auto-pagination.
- `maxResults`: 1–200 documents returned locally, default 100.
- `paginationWaitSeconds`: 1–60, default 20.

For crawl, `limit` is instead the number of pages requested remotely (1–200, default 100). It is independent of the local `maxResults` return cap. Collection metadata reports received/returned/cap/truncation.

## Cancellation and retry safety

The public SDK methods used here do not accept `AbortSignal`:

- A locally cancelled/timed-out scrape, search, map, or status read may still finish remotely.
- Interruption during `start` leaves job creation uncertain. If an ID becomes known, check `status` before retrying. If no ID was returned, do not blindly retry: this plugin exposes no job-list operation, so report the unknown outcome and ask the user how to proceed.
- Once a job ID is known, a cancelled/timed-out waiter leaves the job running. Check `status`; explicitly cancel a known crawl, batch, or agent job if desired.
- Interruption during `cancel` leaves cancellation outcome uncertain. Check `status` before retrying.
- Extract has no cancellation method. A timed-out extract can only be checked with `firecrawl_extract` action `status`.

No waiter automatically cancels its remote job. Locally recognized terminal states are `completed`, `failed`, and `cancelled`; failed wait jobs surface as tool errors.
