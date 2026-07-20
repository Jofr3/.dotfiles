import assert from "node:assert/strict";
import test from "node:test";
import { createInvocationSnapshot } from "../src/config.ts";
import {
	allocateManagedLoopbackPort,
	MANAGED_BOUND_PARAMS,
	MANAGED_SERVER_ID,
	MANAGED_TOOL_NAME,
	managedToolboxConfig,
	ManagedServerRegistry,
} from "../src/managed-config.ts";
import { planSelectedCredentials } from "../src/requirements.ts";

test("managed no-file config defines one exact confirmed SQL tool with six dynamic 1Password fields", async () => {
	const port = await allocateManagedLoopbackPort();
	assert.ok(Number.isInteger(port) && port > 0 && port <= 65_535);
	const config = managedToolboxConfig(port);
	assert.equal(config.servers.length, 1);
	const server = config.servers[0]!;
	assert.equal(server.id, MANAGED_SERVER_ID);
	assert.equal(server.url, `http://127.0.0.1:${port}`);
	assert.equal(server.mode, "allowlist");
	assert.equal(server.tools.length, 1);
	assert.equal(server.tools[0]!.name, MANAGED_TOOL_NAME);
	assert.equal(server.tools[0]!.confirmation, "required");
	assert.deepEqual(server.tools[0]!.boundParams, [...MANAGED_BOUND_PARAMS]);
	assert.deepEqual(Object.keys(server.boundParams), [...MANAGED_BOUND_PARAMS]);
	for (const reference of Object.values(server.boundParams)) {
		assert.deepEqual(reference, {
			resolver: { provider: "onepassword-secrets-manager", dynamic: true },
		});
	}
	const plan = planSelectedCredentials(server, server.tools[0]!);
	assert.deepEqual(plan.map((item) => item.targetName), [...MANAGED_BOUND_PARAMS]);
	assert.ok(plan.every((item) => item.targetKind === "bound-param" && item.requirement?.requirementId.startsWith("mcp1-B-")));
});

test("managed registry admits only the exact generated invocation identity and clears synchronously", () => {
	const config = managedToolboxConfig(54_321);
	const invocation = createInvocationSnapshot(config, MANAGED_SERVER_ID, MANAGED_TOOL_NAME);
	const registry = new ManagedServerRegistry();
	assert.equal(registry.matches(invocation.server), false);
	registry.adopt(config);
	assert.equal(registry.matches(invocation.server), true);
	assert.equal(registry.matches({ ...invocation.server, url: "http://127.0.0.1:54322" }), false);
	registry.clear();
	assert.equal(registry.matches(invocation.server), false);
});
