import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

const piBin = process.env.PI_TEST_BIN;
const extensionDir = process.env.SUBAGENT_EXTENSION_DIR;
if (!piBin || !extensionDir) throw new Error("Tests must be started through test/run.mjs");

test("Pi loads the real extension and exposes its command without a model call", () => {
	const env = { ...process.env };
	delete env.PI_DYNAMIC_SUBAGENT_CHILD;
	delete env.PI_DYNAMIC_SUBAGENT_SERVICE_TIER;
	const result = spawnSync(piBin, [
		"--mode", "rpc",
		"--no-session",
		"--no-extensions",
		"--no-skills",
		"--no-prompt-templates",
		"--no-themes",
		"-e", join(extensionDir, "index.ts"),
	], {
		env,
		encoding: "utf8",
		input: `${JSON.stringify({ id: "commands", type: "get_commands" })}\n`,
		timeout: 20_000,
	});
	assert.equal(result.status, 0, result.stderr);
	const messages = result.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
	const response = messages.find((message) => message.id === "commands");
	assert.equal(response?.success, true);
	const command = response.data.commands.find((item) => item.name === "subagents");
	assert.ok(command);
	assert.equal(command.sourceInfo.path, join(extensionDir, "index.ts"));
});
