import assert from "node:assert/strict";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const sourceDir = process.env.SUBAGENT_TEST_SOURCE;
const workspace = process.env.SUBAGENT_TEST_WORKSPACE;
if (!sourceDir || !workspace) throw new Error("Tests must be started through test/run.mjs");
const { loadSubagentConfig, resolveModelAlias } = await import(pathToFileURL(join(sourceDir, "config.ts")).href);

test("model aliases trim input, support inherited chains, and reject cycles", () => {
	assert.equal(resolveModelAlias(" luna ", { luna: "provider/model" }), "provider/model");
	assert.equal(resolveModelAlias("reviewer", { reviewer: "preferred", preferred: "inherit" }, "parent/model"), "parent/model");
	assert.equal(resolveModelAlias("inherit", {}, "parent/model"), "parent/model");
	assert.equal(resolveModelAlias(" ", {}, "parent/model"), undefined);
	assert.equal(resolveModelAlias("a", { a: "b", b: "a" }), undefined);
	assert.equal(resolveModelAlias("self", { self: "self" }), undefined);
	assert.equal(resolveModelAlias("constructor", {}), "constructor");
	assert.equal(resolveModelAlias("constructor", { constructor: "provider/safe" }), "provider/safe");
});

test("configuration merges global and nearest trusted project defaults", async () => {
	const agentDir = process.env.PI_CODING_AGENT_DIR;
	if (!agentDir) throw new Error("PI_CODING_AGENT_DIR is missing");
	const project = join(workspace, "config-project");
	await mkdir(join(project, ".pi"), { recursive: true });
	await writeFile(join(agentDir, "subagents.json"), JSON.stringify({
		aliases: { quick: "provider/global" },
		defaults: { concurrency: 99, maxTasks: 0, timeoutSeconds: 2, outputLimit: 12 },
	}));
	await writeFile(join(project, ".pi", "subagents.json"), JSON.stringify({
		aliases: { quick: "provider/project" },
		defaults: { resources: "inherit", fast: false, thinking: "high" },
	}));

	const trusted = loadSubagentConfig(project, true);
	assert.equal(trusted.loadedPaths.length, 2);
	assert.equal(trusted.aliases.quick, "provider/project");
	assert.equal(trusted.aliases.astra, "openai-codex/gpt-6-astra");
	assert.equal(trusted.defaults.concurrency, 8);
	assert.equal(trusted.defaults.maxTasks, 1);
	assert.equal(trusted.defaults.timeoutSeconds, 10);
	assert.equal(trusted.defaults.outputLimit, 1000);
	assert.equal(trusted.defaults.resources, "inherit");
	assert.equal(trusted.defaults.fast, false);
	assert.equal(trusted.defaults.thinking, "high");

	const untrusted = loadSubagentConfig(project, false);
	assert.equal(untrusted.loadedPaths.length, 1);
	assert.equal(untrusted.aliases.quick, "provider/global");
	assert.match(untrusted.notices.join("\n"), /Skipped untrusted project config/u);

	await rm(join(agentDir, "subagents.json"), { force: true });
});

test("nearest project config follows the real cwd instead of a lexical symlink ancestor", { skip: process.platform === "win32" }, async () => {
	const root = join(workspace, "symlink-config");
	const physical = join(root, "physical", "project");
	const child = join(physical, "child");
	const lexical = join(root, "lexical");
	await mkdir(join(physical, ".pi"), { recursive: true });
	await mkdir(join(lexical, ".pi"), { recursive: true });
	await mkdir(child, { recursive: true });
	await writeFile(join(physical, ".pi", "subagents.json"), JSON.stringify({ aliases: { selected: "provider/physical" } }));
	await writeFile(join(lexical, ".pi", "subagents.json"), JSON.stringify({ aliases: { selected: "provider/lexical" } }));
	await symlink(physical, join(lexical, "linked"), "dir");

	const config = loadSubagentConfig(join(lexical, "linked", "child"), true);
	assert.equal(config.aliases.selected, "provider/physical");
});
