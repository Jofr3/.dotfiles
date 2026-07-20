import assert from "node:assert/strict";
import test from "node:test";
import { Protocol, ToolboxClient } from "@toolbox-sdk/core";

test("locked core SDK exposes the exact client surface without network access", () => {
	const client = new ToolboxClient(
		"http://127.0.0.1:9",
		null,
		null,
		Protocol.MCP_v20251125,
		"pi-mcp-toolbox-test",
		"2.2.0",
	);
	assert.equal(typeof client.loadTool, "function");
	assert.equal(typeof client.loadToolset, "function");
	assert.equal("invoke" in client, false);
	assert.equal("close" in client, false);
	assert.equal("dispose" in client, false);
	assert.equal(Protocol.MCP_v20251125, "2025-11-25");
});
