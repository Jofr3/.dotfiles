import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	importInstalledPackages,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const {
	GuardedChildReadError,
	createGuardedChildFindTool,
	createGuardedChildGrepTool,
	createGuardedChildLsTool,
	createGuardedChildReadTool,
} = await importSubAgentsModule("workspace/guarded-read-tools.ts");
const { resolveSharedWorkspace } = await importSubAgentsModule("workspace/paths.ts");

function assertGuardedReadError(error, code) {
	assert.ok(error instanceof GuardedChildReadError);
	assert.equal(error.code, code);
	assert.doesNotMatch(error.message, /\/tmp\//);
	return true;
}

test("guarded read-only definitions preserve built-in contracts and reject outside paths and escaping aliases", async () => {
	const temporary = await mkdtemp(join(tmpdir(), "pi-sub-agent-guarded-read-"));
	const previousRipgrepConfig = process.env.RIPGREP_CONFIG_PATH;
	try {
		const project = join(temporary, "project");
		const childCwd = join(project, "packages", "child");
		const outside = join(temporary, "outside");
		await Promise.all([
			mkdir(childCwd, { recursive: true }),
			mkdir(join(project, "agent", "sessions"), { recursive: true }),
			mkdir(outside, { recursive: true }),
		]);
		await Promise.all([
			writeFile(join(temporary, "ripgrep.conf"), "--follow\n", "utf8"),
			writeFile(join(project, "inside.txt"), "inside workspace\n", "utf8"),
			writeFile(join(project, ".env.local"), "PRIVATE_ENV_MUST_NOT_APPEAR\n", "utf8"),
			writeFile(join(project, "agent", "auth.json"), "PRIVATE_AUTH_MUST_NOT_APPEAR\n", "utf8"),
			writeFile(join(project, "agent", "sessions", "one.json"), "PRIVATE_SESSION_MUST_NOT_APPEAR\n", "utf8"),
			writeFile(join(outside, "private.txt"), "outside workspace\n", "utf8"),
			symlink(outside, join(project, "outside-link")),
		]);
		const workspace = await resolveSharedWorkspace(project, "packages/child");
		const options = { cwd: workspace.cwd, workspace: workspace.identity };
		const definitions = {
			read: createGuardedChildReadTool(options),
			grep: createGuardedChildGrepTool(options),
			find: createGuardedChildFindTool(options),
			ls: createGuardedChildLsTool(options),
		};
		const { codingAgent } = await importInstalledPackages();
		const builtIns = {
			read: codingAgent.createReadToolDefinition(workspace.cwd),
			grep: codingAgent.createGrepToolDefinition(workspace.cwd),
			find: codingAgent.createFindToolDefinition(workspace.cwd),
			ls: codingAgent.createLsToolDefinition(workspace.cwd),
		};
		for (const name of Object.keys(definitions)) {
			assert.deepEqual(definitions[name].parameters, builtIns[name].parameters);
			assert.equal(definitions[name].renderCall.toString(), builtIns[name].renderCall.toString());
			assert.equal(definitions[name].renderResult.toString(), builtIns[name].renderResult.toString());
			assert.notStrictEqual(definitions[name].execute, builtIns[name].execute);
			assert.match(definitions[name].description, /shared workspace/);
		}

		const inside = await definitions.read.execute(
			"guarded-read-inside",
			{ path: "../../inside.txt" },
			undefined,
			undefined,
			undefined,
		);
		assert.equal(inside.content[0].text, "inside workspace\n");
		const listing = await definitions.ls.execute(
			"guarded-ls-inside",
			{ path: "../.." },
			undefined,
			undefined,
			undefined,
		);
		assert.match(listing.content[0].text, /inside\.txt/);
		assert.doesNotMatch(listing.content[0].text, /\.env|outside-link/);

		for (const candidate of ["../../.env.local", "../../agent/auth.json", "../../agent/sessions/one.json"]) {
			await assert.rejects(
				definitions.read.execute(
					"guarded-read-sensitive",
					{ path: candidate },
					undefined,
					undefined,
					undefined,
				),
				(error) => assertGuardedReadError(error, "sensitive_path_rejected"),
			);
		}
		process.env.RIPGREP_CONFIG_PATH = join(temporary, "ripgrep.conf");
		const safeSearch = await definitions.grep.execute(
			"guarded-grep-inside",
			{ pattern: "inside workspace", path: "../.." },
			undefined,
			undefined,
			undefined,
		);
		assert.match(safeSearch.content[0].text, /^inside\.txt:1:/m);
		assert.doesNotMatch(safeSearch.content[0].text, new RegExp(temporary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
		const singleFileSearch = await definitions.grep.execute(
			"guarded-grep-single-file",
			{ pattern: "inside workspace", path: "../../inside.txt", limit: 1 },
			undefined,
			undefined,
			undefined,
		);
		assert.match(singleFileSearch.content[0].text, /^inside\.txt:1:/m);
		assert.equal(singleFileSearch.details.matchLimitReached, 1);
		const protectedSearch = await definitions.grep.execute(
			"guarded-grep-sensitive",
			{ pattern: "PRIVATE_|outside workspace", path: "../.." },
			undefined,
			undefined,
			undefined,
		);
		assert.equal(protectedSearch.content[0].text, "No matches found");
		const found = await definitions.find.execute(
			"guarded-find-sensitive",
			{ pattern: "**/*", path: "../.." },
			undefined,
			undefined,
			undefined,
		);
		assert.match(found.content[0].text, /inside\.txt/);
		assert.doesNotMatch(found.content[0].text, /auth\.json|sessions|\.env|outside-link/);

		const outsidePath = join(outside, "private.txt");
		for (const candidate of [outsidePath, "../../outside-link/private.txt"]) {
			await assert.rejects(
				definitions.read.execute(
					"guarded-read-outside",
					{ path: candidate },
					undefined,
					undefined,
					undefined,
				),
				(error) => assertGuardedReadError(error, "path_outside_workspace"),
			);
		}
		for (const [name, params] of [
			["grep", { pattern: "outside", path: outside }],
			["find", { pattern: "*", path: outside }],
			["ls", { path: outside }],
		]) {
			await assert.rejects(
				definitions[name].execute(
					`guarded-${name}-outside`,
					params,
					undefined,
					undefined,
					undefined,
				),
				(error) => assertGuardedReadError(error, "path_outside_workspace"),
			);
		}
	} finally {
		if (previousRipgrepConfig === undefined) delete process.env.RIPGREP_CONFIG_PATH;
		else process.env.RIPGREP_CONFIG_PATH = previousRipgrepConfig;
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded read tools honor caller cancellation before filesystem or subprocess work", async () => {
	const temporary = await mkdtemp(join(tmpdir(), "pi-sub-agent-guarded-read-cancel-"));
	try {
		const project = join(temporary, "project");
		await mkdir(project, { recursive: true });
		await writeFile(join(project, "inside.txt"), "inside\n", "utf8");
		const workspace = await resolveSharedWorkspace(project);
		const options = { cwd: workspace.cwd, workspace: workspace.identity };
		const controller = new AbortController();
		controller.abort();
		for (const [definition, params] of [
			[createGuardedChildReadTool(options), { path: "inside.txt" }],
			[createGuardedChildGrepTool(options), { pattern: "inside", path: "." }],
			[createGuardedChildFindTool(options), { pattern: "*", path: "." }],
			[createGuardedChildLsTool(options), { path: "." }],
		]) {
			await assert.rejects(
				definition.execute("guarded-read-cancelled", params, controller.signal, undefined, undefined),
				/aborted/i,
			);
		}
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("guarded read rewrites built-in long-line guidance without exposing its canonical absolute path", async () => {
	const temporary = await mkdtemp(join(tmpdir(), "pi-sub-agent-guarded-read-output-"));
	try {
		const project = join(temporary, "project");
		await mkdir(project, { recursive: true });
		await writeFile(join(project, "long.txt"), "x".repeat(60 * 1024), "utf8");
		const workspace = await resolveSharedWorkspace(project);
		const definition = createGuardedChildReadTool({
			cwd: workspace.cwd,
			workspace: workspace.identity,
		});
		const result = await definition.execute(
			"guarded-read-long-line",
			{ path: "long.txt" },
			undefined,
			undefined,
			undefined,
		);
		assert.match(result.content[0].text, /long\.txt/);
		assert.doesNotMatch(result.content[0].text, new RegExp(project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});
