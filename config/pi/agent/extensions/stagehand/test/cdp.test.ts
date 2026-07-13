import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import {
	DEFAULT_CDP_DISCOVERY_ORIGIN,
	discoverLoopbackCdpUrl,
	validateCdpDiscoveryOrigin,
	validateConfiguredCdpUrl,
	validateDiscoveredBrowserWebSocket,
} from "../src/cdp.ts";

test("CDP discovery defaults to Chrome's conventional loopback debugging port", () => {
	assert.equal(DEFAULT_CDP_DISCOVERY_ORIGIN, "http://127.0.0.1:9222");
});

test("CDP discovery accepts only literal loopback HTTP origins with explicit ports", () => {
	assert.equal(validateCdpDiscoveryOrigin("http://127.0.0.1:9222"), "http://127.0.0.1:9222");
	assert.equal(validateCdpDiscoveryOrigin("http://[::1]:9333"), "http://[::1]:9333");
	for (const rejected of [
		"http://localhost:9222",
		"https://127.0.0.1:9222",
		"http://127.0.0.1",
		"http://127.0.0.1:9222/other",
		"http://user:pass@127.0.0.1:9222",
		"http://192.168.1.10:9222",
	]) {
		assert.throws(() => validateCdpDiscoveryOrigin(rejected));
	}
});

test("explicit loopback discovery reads only the bounded version endpoint", async () => {
	let requestedPath: string | undefined;
	const server = createServer((request, response) => {
		requestedPath = request.url;
		const address = server.address();
		const port = typeof address === "object" && address ? address.port : 0;
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify({
			webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/test-id`,
		}));
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	try {
		const address = server.address();
		assert.ok(address && typeof address === "object");
		assert.equal(
			await discoverLoopbackCdpUrl(`http://127.0.0.1:${address.port}`),
			`ws://127.0.0.1:${address.port}/devtools/browser/test-id`,
		);
		assert.equal(requestedPath, "/json/version");
	} finally {
		await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
	}
});

test("direct CDP configuration accepts only loopback browser websocket endpoints", () => {
	assert.equal(
		validateConfiguredCdpUrl("ws://127.0.0.1:9222/devtools/browser/opaque-id"),
		"ws://127.0.0.1:9222/devtools/browser/opaque-id",
	);
	for (const rejected of [
		"http://127.0.0.1:9222",
		"ws://localhost:9222/devtools/browser/id",
		"ws://192.168.1.10:9222/devtools/browser/id",
		"wss://127.0.0.1:9222/devtools/browser/id",
		"ws://127.0.0.1:9222/devtools/page/id",
		"ws://user:pass@127.0.0.1:9222/devtools/browser/id",
		"ws://127.0.0.1:9222/devtools/browser/id?token=secret",
	]) {
		assert.throws(() => validateConfiguredCdpUrl(rejected));
	}
});

test("discovered endpoint must remain a browser websocket on the same loopback host and port", () => {
	assert.equal(
		validateDiscoveredBrowserWebSocket(
			"ws://127.0.0.1:9222/devtools/browser/opaque-id",
			"http://127.0.0.1:9222",
		),
		"ws://127.0.0.1:9222/devtools/browser/opaque-id",
	);
	for (const rejected of [
		"ws://127.0.0.1:9333/devtools/browser/id",
		"ws://192.168.1.10:9222/devtools/browser/id",
		"wss://127.0.0.1:9222/devtools/browser/id",
		"ws://127.0.0.1:9222/devtools/page/id",
		"ws://127.0.0.1:9222/devtools/browser/id?token=secret",
	]) {
		assert.throws(() =>
			validateDiscoveredBrowserWebSocket(rejected, "http://127.0.0.1:9222"),
		);
	}
});
