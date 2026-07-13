import assert from "node:assert/strict";
import test from "node:test";
import {
	confirmationArgumentKeys,
	prepareToolArguments,
	requireEnvironmentValue,
} from "../src/safety.ts";
import {
	formatToolboxOutput,
	redactText,
	safeErrorMessage,
	sanitizeRpcErrorPayload,
	sanitizeTerminalText,
} from "../src/output.ts";

test("tool arguments are deeply cloned to null-prototype bounded JSON", () => {
	const output = prepareToolArguments({
		query: "hotel",
		filters: { stars: [4, 5], open: true },
	});
	assert.equal(Object.getPrototypeOf(output), null);
	assert.equal(Object.getPrototypeOf(output.filters as object), null);
	assert.equal(Object.isFrozen(output), true);
	assert.equal(Object.isFrozen(output.filters as object), true);
	assert.equal(Object.isFrozen((output.filters as { stars: object }).stars), true);
	assert.deepEqual(JSON.parse(JSON.stringify(output)), {
		query: "hotel",
		filters: { stars: [4, 5], open: true },
	});
	assert.equal(confirmationArgumentKeys({ z: 1, a: 2 }), "\"a\", \"z\"");
});

test("tool arguments reject prototype pollution, credentials, accessors, cycles, and bounds", () => {
	assert.throws(
		() => prepareToolArguments(JSON.parse('{"__proto__":{"polluted":true}}')),
		/not permitted/,
	);
	assert.throws(() => prepareToolArguments({ authorization: "Bearer value" }), /credential-bearing/);
	assert.throws(() => prepareToolArguments({ note: "Bearer abcdefghijklmnop" }), /bearer credentials/);
	assert.throws(() => prepareToolArguments({ url: "https://user:pass@example.com" }), /URL credentials/);
	assert.throws(() => prepareToolArguments({ note: "prefix test-secret-value" }, ["test-secret-value"]), /credential values/);
	assert.throws(
		() => prepareToolArguments({ "test-secret-value": "note" }, ["test-secret-value"]),
		/credential material in a property name/,
	);
	assert.throws(() => prepareToolArguments({ "unsafe\nkey": "value" }), /control characters/);

	const accessor = Object.create(null) as Record<string, unknown>;
	Object.defineProperty(accessor, "value", { enumerable: true, get: () => "unsafe" });
	assert.throws(() => prepareToolArguments(accessor), /must not use accessors/);

	const cycle: Record<string, unknown> = {};
	cycle.self = cycle;
	assert.throws(() => prepareToolArguments(cycle), /cycle or repeated object reference/);
	assert.throws(() => prepareToolArguments({ value: "x".repeat(20_001) }), /string longer/);
});

test("environment references are resolved without accepting blank, huge, or injected values", () => {
	delete process.env.PI_MCP_TOOLBOX_TEST_VALUE;
	assert.throws(
		() => requireEnvironmentValue({ env: "PI_MCP_TOOLBOX_TEST_VALUE" }, "test"),
		/Required environment variable PI_MCP_TOOLBOX_TEST_VALUE is not set/,
	);
	process.env.PI_MCP_TOOLBOX_TEST_VALUE = "safe-test-value";
	assert.equal(
		requireEnvironmentValue({ env: "PI_MCP_TOOLBOX_TEST_VALUE" }, "test"),
		"safe-test-value",
	);
	process.env.PI_MCP_TOOLBOX_TEST_VALUE = "unsafe\r\nheader";
	assert.throws(() => requireEnvironmentValue({ env: "PI_MCP_TOOLBOX_TEST_VALUE" }, "test"), /unsafe/);
	delete process.env.PI_MCP_TOOLBOX_TEST_VALUE;
});

test("output redacts structured and textual secrets and neutralizes terminal controls", () => {
	const secret = "super-secret-value";
	const structured = formatToolboxOutput(JSON.stringify({
		name: "hotel",
		password: "visible-no-more",
		nested: { note: `contains ${secret}` },
		[`${secret}\u202E`]: "key-content",
	}), [secret]);
	assert.match(structured.text, /"password": "\[redacted\]"/);
	assert.doesNotMatch(structured.text, /visible-no-more|super-secret-value|\u202E/u);
	assert.match(redactText("Authorization: Bearer abcdefghijklmnop"), /\[redacted\]/);
	const boundary = redactText(`${"a".repeat(10_000)}${"b".repeat(10_000)}`, ["ab"]);
	assert.equal(boundary.includes("ab"), false);
	assert.ok(boundary.length <= 20_000);
	assert.equal(redactText("Bearer abcdefghijklmnop", ["[redacted]"]).includes("[redacted]"), false);
	assert.equal(sanitizeTerminalText("safe\u001b[31m\u202Etext"), "safe�[31m�text");
});

test("RPC error sanitization replaces the whole hostile payload before SDK logging", () => {
	const canaries = [
		"RPC_MESSAGE_EXACT_CANARY",
		"RPC_DATA_EXACT_CANARY",
		"RPC_SIBLING_EXACT_CANARY",
		"RPC_ARRAY_EXACT_CANARY",
		"RPC_CAUSE_EXACT_CANARY",
		"https://user:pass@example.test/path?token=RPC_URL_EXACT_CANARY",
	];
	const payload: Record<string, unknown> = {
		jsonrpc: "2.0",
		id: "request",
		error: {
			code: -32_000,
			message: canaries[0],
			data: { nested: canaries[1], list: [canaries[3]] },
			cause: new Error(canaries[4]),
		},
		sibling: canaries[2],
		url: canaries[5],
	};
	(payload.error as Record<string, unknown>).cycle = payload;
	const sanitized = sanitizeRpcErrorPayload(payload, canaries);
	const serialized = JSON.stringify(sanitized);
	for (const canary of canaries) assert.equal(serialized.includes(canary), false);
	assert.deepEqual(JSON.parse(serialized), {
		jsonrpc: "2.0",
		id: 0,
		error: { code: -32_000, message: "Remote error details were removed" },
	});
	assert.equal(Object.isFrozen(sanitized), true);
	assert.equal(Object.isFrozen((sanitized as { error: object }).error), true);
});

test("RPC payload sanitization never invokes accessors and handles arrays, malformed objects, and cycles", () => {
	let getterInvoked = false;
	const accessor: Record<string, unknown> = { jsonrpc: "2.0", id: 1 };
	Object.defineProperty(accessor, "error", {
		enumerable: true,
		get() {
			getterInvoked = true;
			return { message: "ACCESSOR_CANARY" };
		},
	});
	const values: unknown[] = [
		accessor,
		[{ error: { message: "ARRAY_CANARY" } }],
		new URL("https://user:pass@example.test/?token=URL_CANARY"),
	];
	const cycle: Record<string, unknown> = { jsonrpc: "2.0", id: 1, result: {} };
	(cycle.result as Record<string, unknown>).self = cycle;
	values.push(cycle);
	for (const value of values) {
		const serialized = JSON.stringify(sanitizeRpcErrorPayload(value, [
			"ACCESSOR_CANARY",
			"ARRAY_CANARY",
			"URL_CANARY",
		]));
		assert.doesNotMatch(serialized, /ACCESSOR_CANARY|ARRAY_CANARY|URL_CANARY/u);
	}
	assert.equal(getterInvoked, false);

	const success = sanitizeRpcErrorPayload({
		jsonrpc: "2.0",
		id: 1,
		result: { note: "prefix SUCCESS_SECRET_CANARY", token: "other" },
	}, ["SUCCESS_SECRET_CANARY"]);
	const successText = JSON.stringify(success);
	assert.doesNotMatch(successText, /SUCCESS_SECRET_CANARY|other/u);
	assert.match(successText, /\[redacted\]/u);
});

test("formatted output always stays within final byte and line limits without persistence", () => {
	const oneLine = formatToolboxOutput("x".repeat(20_000), [], { maxBytes: 1_024, maxLines: 10 });
	assert.equal(oneLine.truncated, true);
	assert.ok(oneLine.outputBytes <= 1_024);
	assert.ok(oneLine.outputLines <= 10);
	assert.match(oneLine.text, /Full output was not persisted/);

	const manyLines = formatToolboxOutput(Array.from({ length: 100 }, (_, index) => `line-${index}`).join("\n"), [], {
		maxBytes: 4_096,
		maxLines: 12,
	});
	assert.equal(manyLines.truncated, true);
	assert.ok(manyLines.outputLines <= 12);
});

test("safe errors redact endpoint credentials, sensitive query values, controls, and long text", () => {
	const message = safeErrorMessage(
		new Error("failed https://user:pass@example.com/path?token=visible\u001b[2J secret-value " + "x".repeat(3_000)),
		{ knownSecrets: ["secret-value"] },
	);
	assert.doesNotMatch(message, /user:pass|visible|secret-value|\u001b/);
	assert.match(message, /token=%5Bredacted%5D/);
	assert.ok(message.length <= 2_001);
});
