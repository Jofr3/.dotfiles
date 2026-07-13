import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { buildMetadataToolResult, formatMetadataList } from "../src/output.ts";
import { PublicError } from "../src/safety.ts";

const SENSITIVE_SENTINEL = "SENSITIVE_TEST_SENTINEL_DO_NOT_EMIT";
const CONFIGURED_ACCESS_TOKEN = "configured-access-token-do-not-emit";
const IDS = [
	"11111111-1111-1111-8111-111111111111",
	"22222222-2222-2222-8222-222222222222",
	"33333333-3333-3333-8333-333333333333",
];

function assertNoSentinel(value: unknown): void {
	let serialized = "";
	try {
		serialized = JSON.stringify(value);
	} catch {
		throw new Error("Safe output was not serializable");
	}
	if (serialized.includes(SENSITIVE_SENTINEL)) throw new Error("Sensitive sentinel leaked into public output");
}

test("secret identifier output maps only verified fields and never traverses extra secret data", () => {
	let extraGetterInvoked = false;
	const cyclic: Record<string, unknown> = { marker: SENSITIVE_SENTINEL };
	cyclic.self = cyclic;
	const item = {
		id: IDS[0],
		key: "service-key",
		value: SENSITIVE_SENTINEL,
		note: SENSITIVE_SENTINEL,
		nested: cyclic,
	};
	Object.defineProperty(item, "accessToken", {
		get() {
			extraGetterInvoked = true;
			return SENSITIVE_SENTINEL;
		},
	});

	const result = buildMetadataToolResult("secrets", { data: [item] }, 20, CONFIGURED_ACCESS_TOKEN);
	assert.equal(extraGetterInvoked, false);
	assert.deepEqual(result.details, {
		operation: "list_secret_metadata",
		returned: 1,
		truncated: false,
	});
	assert.deepEqual(JSON.parse(result.content[0]?.text ?? ""), {
		operation: "list_secret_metadata",
		items: [{ id: IDS[0], key: "service-key" }],
		returned: 1,
		truncated: false,
		notice: "Secret identifier metadata was disclosed; no secret-value field was requested or emitted.",
	});
	assertNoSentinel(result);
});

test("project records containing the configured access token in an emitted name are omitted", () => {
	const result = buildMetadataToolResult(
		"projects",
		{
			data: [
				{ id: IDS[0], name: `unsafe-${CONFIGURED_ACCESS_TOKEN}-project` },
				{ id: IDS[1], name: "safe-project" },
			],
		},
		20,
		CONFIGURED_ACCESS_TOKEN,
	);
	assert.deepEqual(JSON.parse(result.content[0]?.text ?? "").items, [{ id: IDS[1], name: "safe-project" }]);
	assert.equal(result.details.truncated, true);
	assert.equal(JSON.stringify(result).includes(CONFIGURED_ACCESS_TOKEN), false);
});

test("secret records containing the configured access token in an emitted key are omitted", () => {
	const result = buildMetadataToolResult(
		"secrets",
		{
			data: [
				{ id: IDS[0], key: `unsafe-${CONFIGURED_ACCESS_TOKEN}-key` },
				{ id: IDS[2], key: "safe-key" },
			],
		},
		20,
		CONFIGURED_ACCESS_TOKEN,
	);
	assert.deepEqual(JSON.parse(result.content[0]?.text ?? "").items, [{ id: IDS[2], key: "safe-key" }]);
	assert.equal(result.details.truncated, true);
	assert.equal(JSON.stringify(result).includes(CONFIGURED_ACCESS_TOKEN), false);
});

test("malformed, accessor-backed, prototype-bearing, and oversized records are omitted", () => {
	let keyGetterInvoked = false;
	const accessorItem = { id: IDS[1] } as Record<string, unknown>;
	Object.defineProperty(accessorItem, "key", {
		get() {
			keyGetterInvoked = true;
			return SENSITIVE_SENTINEL;
		},
	});
	const inheritedItem = Object.create({ id: IDS[1], key: SENSITIVE_SENTINEL });
	const response = {
		data: [
			{ id: IDS[0], key: "safe\u001b[31m-key\u001b[0m\u202e" },
			accessorItem,
			inheritedItem,
			{ id: IDS[1], key: "x".repeat(257) },
			{ id: "not-a-uuid", key: SENSITIVE_SENTINEL },
		],
	};

	const result = formatMetadataList("secrets", response, 20, CONFIGURED_ACCESS_TOKEN);
	assert.equal(keyGetterInvoked, false);
	assert.deepEqual(result.items, [{ id: IDS[0], key: "safe-key" }]);
	assert.equal(result.returned, 1);
	assert.equal(result.truncated, true);
	assertNoSentinel(result);
});

test("project output retains whole safe items within fixed byte and line bounds", () => {
	const data = Array.from({ length: 80 }, (_, index) => ({
		id: `${String(index).padStart(8, "0")}-1111-2222-8333-444444444444`,
		name: `project-${index}-${"n".repeat(200)}`,
		value: SENSITIVE_SENTINEL,
	}));
	const result = buildMetadataToolResult("projects", { data }, 50, CONFIGURED_ACCESS_TOKEN);
	const text = result.content[0]?.text ?? "";
	assert.equal(result.details.returned, 50);
	assert.equal(result.details.truncated, true);
	assert.ok(Buffer.byteLength(text, "utf8") <= 32 * 1024);
	assert.ok(text.split("\n").length <= 500);
	assertNoSentinel(result);
});

test("missing redaction state fails closed before processing metadata", () => {
	assert.throws(
		() => formatMetadataList("projects", { data: [{ id: IDS[0], name: "safe-project" }] }, 20, ""),
		(error: unknown) => error instanceof PublicError && error.code === "response",
	);
});

test("invalid response containers fail with a fixed public category without invoking accessors", () => {
	let getterInvoked = false;
	const response = {};
	Object.defineProperty(response, "data", {
		get() {
			getterInvoked = true;
			return [{ id: IDS[2], key: SENSITIVE_SENTINEL }];
		},
	});
	assert.throws(
		() => formatMetadataList("secrets", response, 20, CONFIGURED_ACCESS_TOKEN),
		(error: unknown) => error instanceof PublicError && error.code === "response",
	);
	assert.equal(getterInvoked, false);
});
