import assert from "node:assert/strict";
import test from "node:test";
import FirecrawlDefault, { Firecrawl } from "firecrawl";

const expectedMethods = [
	"scrape",
	"search",
	"map",
	"startCrawl",
	"getCrawlStatus",
	"cancelCrawl",
	"startBatchScrape",
	"getBatchScrapeStatus",
	"cancelBatchScrape",
	"startExtract",
	"getExtractStatus",
	"startAgent",
	"getAgentStatus",
	"cancelAgent",
] as const;

test("official named/default exports and required 4.30.0 methods exist without network access", () => {
	assert.equal(FirecrawlDefault, Firecrawl);
	const client = new Firecrawl({
		apiKey: "test-only-not-sent",
		apiUrl: "http://127.0.0.1:9",
		timeoutMs: 1,
		maxRetries: 1,
	});
	for (const method of expectedMethods) {
		assert.equal(typeof client[method], "function", method);
	}
	assert.equal("cancelExtract" in client, false);
});
