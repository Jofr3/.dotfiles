import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const sourceDir = process.env.SUBAGENT_TEST_SOURCE;
if (!sourceDir) throw new Error("Tests must be started through test/run.mjs");
process.env.PI_DYNAMIC_SUBAGENT_CHILD = "1";
process.env.PI_DYNAMIC_SUBAGENT_SERVICE_TIER = "priority";
const { default: extension } = await import(`${pathToFileURL(join(sourceDir, "index.ts")).href}?child-mode`);

test.after(() => {
	delete process.env.PI_DYNAMIC_SUBAGENT_CHILD;
	delete process.env.PI_DYNAMIC_SUBAGENT_SERVICE_TIER;
});

test("child mode registers only the priority provider hook for supported models", () => {
	const registrations = { commands: [], tools: [], handlers: [] };
	extension({
		registerCommand(...args) { registrations.commands.push(args); },
		registerTool(...args) { registrations.tools.push(args); },
		on(name, handler) { registrations.handlers.push({ name, handler }); },
	});
	assert.equal(registrations.commands.length, 0);
	assert.equal(registrations.tools.length, 0);
	assert.deepEqual(registrations.handlers.map((item) => item.name), ["before_provider_request"]);

	const hook = registrations.handlers[0].handler;
	const payload = { model: "gpt-5.6-luna" };
	assert.deepEqual(
		hook({ payload }, { model: { provider: "openai-codex", id: "gpt-5.6-luna" } }),
		{ model: "gpt-5.6-luna", service_tier: "priority" },
	);
	const astraPayload = { model: "gpt-6-astra" };
	assert.deepEqual(
		hook({ payload: astraPayload }, { model: { provider: "openai-codex", id: "gpt-6-astra" } }),
		{ model: "gpt-6-astra", service_tier: "priority" },
	);
	assert.equal(hook({ payload }, { model: { provider: "other", id: "model" } }), undefined);
});
