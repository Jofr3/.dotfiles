import assert from "node:assert/strict";
import test from "node:test";
import {
	prepareAdvancedOptions,
	prepareJsonSchema,
	prepareScrapeFormats,
	requireHttpUrl,
	requireJobId,
	validateApiUrl,
} from "../src/safety.ts";

const allowed = new Set(["timeout", "location", "scrapeOptions"]);
const controlled = new Set(["url", "formats"]);

test("advanced options are copied without prototypes", () => {
	const input = {
		timeout: 10_000,
		location: { country: "US", languages: ["en"] },
	};
	const output = prepareAdvancedOptions(input, allowed, controlled, "test_tool");
	assert.equal(Object.getPrototypeOf(output), null);
	assert.equal(Object.getPrototypeOf(output.location as object), null);
	assert.deepEqual(JSON.parse(JSON.stringify(output)), input);
});

test("advanced options reject control, unknown, prototype, and credential keys", () => {
	assert.throws(
		() => prepareAdvancedOptions({ url: "https://example.com" }, allowed, controlled, "test_tool"),
		/cannot override/,
	);
	assert.throws(
		() => prepareAdvancedOptions({ madeUp: true }, allowed, controlled, "test_tool"),
		/not a supported SDK option/,
	);
	assert.throws(
		() => prepareAdvancedOptions(JSON.parse('{"__proto__":{"polluted":true}}'), allowed, controlled, "test_tool"),
		/not permitted/,
	);
	assert.throws(
		() => prepareAdvancedOptions({ scrapeOptions: { headers: { Authorization: "Bearer value" } } }, allowed, controlled, "test_tool"),
		/security-sensitive or unsupported/,
	);
});

test("advanced options reject known API keys and embedded URL credentials", () => {
	const previous = process.env.FIRECRAWL_API_KEY;
	process.env.FIRECRAWL_API_KEY = "fc-test-secret-value";
	try {
		assert.throws(
			() => prepareAdvancedOptions({ location: "fc-test-secret-value" }, allowed, controlled, "test_tool"),
			/must not contain FIRECRAWL_API_KEY/,
		);
		assert.throws(
			() => prepareAdvancedOptions({ location: "https://user:pass@example.com/" }, allowed, controlled, "test_tool"),
			/must not contain URL credentials/,
		);
	} finally {
		if (previous === undefined) delete process.env.FIRECRAWL_API_KEY;
		else process.env.FIRECRAWL_API_KEY = previous;
	}
});

test("JSON schemas are safely cloned but may describe sensitive field names", () => {
	const schema = prepareJsonSchema({
		type: "object",
		properties: {
			password: { type: "string" },
		},
	}, "schema");
	assert.equal((schema?.properties as Record<string, unknown>).password instanceof Object, false);
	assert.equal(((schema?.properties as Record<string, unknown>).password as Record<string, unknown>).type, "string");
});

test("target and API URL validation rejects credentials and API query controls", () => {
	assert.equal(requireHttpUrl("https://example.com/path?q=1", "url"), "https://example.com/path?q=1");
	assert.throws(() => requireHttpUrl("https://user:pass@example.com/", "url"), /embedded credentials/);
	assert.throws(() => requireHttpUrl("file:///tmp/test", "url"), /http:\/\/ or https:\/\//);
	assert.equal(validateApiUrl("https://firecrawl.example/v2/"), "https://firecrawl.example/v2");
	assert.throws(() => validateApiUrl("https://firecrawl.example/?token=x"), /query string or fragment/);
});

test("job IDs reject path traversal and accept Firecrawl-style identifiers", () => {
	assert.equal(requireJobId("job_ABC-123", "test_tool"), "job_ABC-123");
	for (const invalid of ["../batch/scrape/job", "job/id", "job.id", "job id", "%2e%2e"]) {
		assert.throws(() => requireJobId(invalid, "test_tool"), /jobId/);
	}
});

test("structured JSON formats use the SDK-required object shape", () => {
	assert.deepEqual(
		JSON.parse(JSON.stringify(prepareScrapeFormats(["markdown"], {
			prompt: "Extract the title",
			schema: { type: "object", properties: { title: { type: "string" } } },
		}, "jsonOptions"))),
		[
			"markdown",
			{
				type: "json",
				prompt: "Extract the title",
				schema: { type: "object", properties: { title: { type: "string" } } },
			},
		],
	);
	assert.throws(() => prepareScrapeFormats(undefined, {}, "jsonOptions"), /prompt and\/or schema/);
	assert.throws(() => prepareScrapeFormats(["json"], undefined, "formats"), /cannot use bare/);
});
