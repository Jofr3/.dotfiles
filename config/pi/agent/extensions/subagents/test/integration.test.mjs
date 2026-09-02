import assert from "node:assert/strict";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const sourceDir = process.env.SUBAGENT_TEST_SOURCE;
const extensionDir = process.env.SUBAGENT_EXTENSION_DIR;
const workspace = process.env.SUBAGENT_TEST_WORKSPACE;
if (!sourceDir || !extensionDir || !workspace) throw new Error("Tests must be started through test/run.mjs");
const originalArgv1 = process.argv[1];
process.argv[1] = join(extensionDir, "test", "fake-child.mjs");
const { default: extension } = await import(pathToFileURL(join(sourceDir, "index.ts")).href);

const registrations = { commands: [], tools: [], handlers: [] };
extension({
	registerCommand(name, definition) { registrations.commands.push({ name, ...definition }); },
	registerTool(definition) { registrations.tools.push(definition); },
	on(name, handler) { registrations.handlers.push({ name, handler }); },
});
const tool = registrations.tools.find((item) => item.name === "subagent");
const resumeTool = registrations.tools.find((item) => item.name === "subagent_resume");
const inputHandler = registrations.handlers.find((item) => item.name === "input")?.handler;
const agentSettledHandler = registrations.handlers.find((item) => item.name === "agent_settled")?.handler;
const sessionStartHandler = registrations.handlers.find((item) => item.name === "session_start")?.handler;
if (!tool) throw new Error("subagent tool was not registered");
if (!resumeTool) throw new Error("subagent_resume tool was not registered");
if (!inputHandler) throw new Error("subagent input handler was not registered");
if (!agentSettledHandler) throw new Error("subagent agent_settled handler was not registered");
if (!sessionStartHandler) throw new Error("subagent session_start handler was not registered");
const ctx = {
	cwd: workspace,
	isProjectTrusted: () => true,
	model: { provider: "parent", id: "model" },
};
const task = (overrides = {}) => ({
	label: "task",
	task: "normal",
	model: "fake/model",
	thinking: "low",
	fast: false,
	resources: "lean",
	tools: [],
	...overrides,
});
const sessionManager = (branch, id = "test-session") => ({
	getBranch: () => branch,
	getSessionId: () => id,
});

test.after(() => { process.argv[1] = originalArgv1; });

test("extension registers the command, strict model schema, resume handler, and tools", () => {
	assert.ok(registrations.commands.some((item) => item.name === "subagents"));
	assert.equal(tool.parameters.properties.tasks.items.properties.model.minLength, 1);
	assert.equal(tool.parameters.properties.tasks.items.properties.model.pattern, "\\S");
	assert.deepEqual(resumeTool.parameters.properties, {});
	assert.equal(typeof inputHandler, "function");
	assert.equal(typeof agentSettledHandler, "function");
	assert.equal(typeof sessionStartHandler, "function");
});

test("parallel execution preserves order, progress, artifacts, usage, and cleans prompt files", async () => {
	const updates = [];
	const result = await tool.execute("call", {
		mode: "parallel",
		concurrency: 2,
		timeoutSeconds: 10,
		tasks: [task({ label: "one", task: "TOOL one" }), task({ label: "two", task: "TOOL two" })],
	}, undefined, (update) => updates.push(update), ctx);

	assert.deepEqual(result.details.results.map((item) => item.label), ["one", "two"]);
	assert.ok(result.details.results.every((item) => item.status === "succeeded"));
	assert.equal(result.details.results[0].usage.input, 12);
	assert.equal(result.details.results[0].usage.output, 7);
	assert.equal(result.usage.input, 24);
	assert.ok(result.details.results[0].activity.some((item) => item.includes("read")));
	assert.ok(updates.length > 2);
	for (const item of result.details.results) {
		const artifact = await readFile(item.artifactPath, "utf8");
		assert.match(artifact, /## Output/u);
	}
	const files = await readdir(result.details.artifactDir);
	assert.equal(files.some((name) => name.endsWith("-system.md")), false);
});

test("bare continue resumes only unfinished parallel tasks and ignores stale runs", async () => {
	const request = {
		mode: "parallel",
		concurrency: 2,
		timeoutSeconds: 10,
		tasks: [task({ label: "done", task: "done" }), task({ label: "unfinished", task: "unfinished" })],
	};
	const prior = await tool.execute("call-original", request, undefined, undefined, ctx);
	prior.details.results[1].status = "aborted";
	prior.details.results[1].error = "Subagent run aborted.";
	delete prior.details.replay; // Backward compatibility with sessions created before replay snapshots.
	const branch = [
		{
			type: "message",
			message: {
				role: "assistant",
				content: [{ type: "toolCall", id: "call-original", name: "subagent", arguments: request }],
			},
		},
		{
			type: "message",
			message: {
				role: "toolResult",
				toolName: "subagent",
				toolCallId: "call-original",
				details: prior.details,
			},
		},
		{ type: "message", message: { role: "assistant", content: [], stopReason: "error" } },
	];
	const recoveryCtx = { ...ctx, sessionManager: sessionManager(branch) };
	const transformed = inputHandler({
		text: "continue",
		images: undefined,
		source: "interactive",
		streamingBehavior: undefined,
	}, recoveryCtx);
	assert.equal(transformed.action, "transform");
	assert.match(transformed.text, /Call `subagent_resume` now/u);

	const resumed = await resumeTool.execute("call-resume", {}, undefined, undefined, recoveryCtx);
	assert.deepEqual(resumed.details.results.map((item) => item.label), ["unfinished"]);
	assert.ok(resumed.details.results.every((item) => item.status === "succeeded"));
	assert.match(resumed.details.replay.input.tasks[0].instructions, /restarting after an interrupted attempt/u);
	assert.equal(resumed.details.replay.interrupted, false);

	inputHandler({ text: "do something else", source: "interactive", streamingBehavior: undefined }, recoveryCtx);
	const staleCtx = {
		...ctx,
		sessionManager: sessionManager([
			...branch,
			{ type: "message", message: { role: "user", content: "other work" } },
		]),
	};
	assert.equal(inputHandler({
		text: "resume",
		source: "interactive",
		streamingBehavior: undefined,
	}, staleCtx).action, "continue");
	await assert.rejects(
		resumeTool.execute("stale-resume", {}, undefined, undefined, staleCtx),
		/No interrupted subagent workflow/u,
	);

	assert.equal(inputHandler({
		text: "resume",
		source: "interactive",
		streamingBehavior: undefined,
	}, recoveryCtx).action, "transform");
	agentSettledHandler({}, recoveryCtx);
	const ignoredResumeCtx = {
		...ctx,
		sessionManager: sessionManager([
			...branch,
			{ type: "message", message: { role: "user", content: "resume" } },
			{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Continuing." }], stopReason: "stop" } },
		]),
	};
	await assert.rejects(
		resumeTool.execute("ignored-resume", {}, undefined, undefined, ignoredResumeCtx),
		/No interrupted subagent workflow/u,
	);

	assert.equal(inputHandler({
		text: "resume",
		source: "interactive",
		streamingBehavior: undefined,
	}, recoveryCtx).action, "transform");
	sessionStartHandler({ reason: "resume" }, { ...ctx, sessionManager: sessionManager([], "other-session") });
	await assert.rejects(
		resumeTool.execute(
			"cross-session-resume",
			{},
			undefined,
			undefined,
			{ ...ctx, sessionManager: sessionManager([], "other-session") },
		),
		/No interrupted subagent workflow/u,
	);
});

test("recovery snapshots resolved mechanical defaults instead of rereading changed config", async () => {
	const configPath = join(process.env.PI_CODING_AGENT_DIR, "subagents.json");
	await writeFile(configPath, JSON.stringify({
		defaults: {
			concurrency: 1,
			timeoutSeconds: 11,
			outputLimit: 1234,
			totalOutputLimit: 4000,
			thinking: "high",
			fast: false,
			resources: "lean",
		},
	}));
	try {
		const request = {
			tasks: [task({ label: "one", thinking: undefined, outputLimit: undefined }), task({ label: "two", thinking: undefined, outputLimit: undefined })],
		};
		const prior = await tool.execute("call-defaults", request, undefined, undefined, ctx);
		assert.equal(prior.details.replay.input.concurrency, 1);
		assert.equal(prior.details.replay.input.timeoutSeconds, 11);
		assert.equal(prior.details.replay.input.tasks[0].thinking, "high");
		assert.equal(prior.details.replay.input.tasks[0].outputLimit, 1234);
		assert.equal(prior.details.replay.totalOutputLimit, 4000);
		for (const result of prior.details.results) result.status = "aborted";
		prior.details.replay.interrupted = true;
		prior.details.replay.retryIndexes = [0, 1];
		await rm(configPath);

		const recoveryCtx = {
			...ctx,
			sessionManager: sessionManager([{
				type: "message",
				message: {
					role: "toolResult",
					toolName: "subagent",
					toolCallId: "call-defaults",
					details: prior.details,
				},
			}]),
		};
		assert.equal(inputHandler({
			text: "resume",
			source: "interactive",
			streamingBehavior: undefined,
		}, recoveryCtx).action, "transform");
		const resumed = await resumeTool.execute("call-defaults-resume", {}, undefined, undefined, recoveryCtx);
		assert.equal(resumed.details.concurrency, 1);
		assert.equal(resumed.details.replay.input.timeoutSeconds, 11);
		assert.equal(resumed.details.replay.input.tasks[0].outputLimit, 1234);
		assert.equal(resumed.details.replay.totalOutputLimit, 4000);
	} finally {
		await rm(configPath, { force: true });
	}
});

test("sequential recovery preserves the successful prefix handoff without rerunning it", async () => {
	const request = {
		mode: "sequential",
		timeoutSeconds: 10,
		tasks: [
			task({ label: "first", task: "first" }),
			task({ label: "second", task: "second {previous}" }),
			task({ label: "third", task: "third {previous}" }),
		],
	};
	const prior = await tool.execute("call-sequential", request, undefined, undefined, ctx);
	prior.details.results[1].status = "aborted";
	prior.details.results[1].error = "Subagent run aborted.";
	prior.details.results[2].status = "skipped";
	prior.details.replay.interrupted = true;
	prior.details.replay.retryIndexes = [1, 2];
	const recoveryCtx = {
		...ctx,
		sessionManager: sessionManager([{
			type: "message",
			message: {
				role: "toolResult",
				toolName: "subagent",
				toolCallId: "call-sequential",
				details: prior.details,
			},
		}]),
	};
	const transformed = inputHandler({
		text: "please resume the subagent workflow",
		source: "interactive",
		streamingBehavior: undefined,
	}, recoveryCtx);
	assert.equal(transformed.action, "transform");
	const resumed = await resumeTool.execute("call-sequential-resume", {}, undefined, undefined, recoveryCtx);
	assert.deepEqual(resumed.details.results.map((item) => item.label), ["second", "third"]);
	assert.match(resumed.details.results[0].output, /child:second child:first/u);
	assert.match(resumed.details.results[1].output, /child:third child:second child:first/u);
});

test("per-task and aggregate truncation limits include their notices", async () => {
	const result = await tool.execute("call", {
		timeoutSeconds: 10,
		tasks: [task({ label: "long", task: "LONG", outputLimit: 1000 })],
	}, undefined, undefined, ctx);
	const output = result.details.results[0].output;
	assert.ok(Buffer.byteLength(output, "utf8") <= 1000);
	assert.equal(output.includes("�"), false);
	assert.match(output, /Truncated \d+ bytes/u);
	assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 30_000);
});

test("partial child failures remain visible in summaries and complete artifacts", async () => {
	const result = await tool.execute("call", {
		timeoutSeconds: 10,
		tasks: [task({ label: "partial", task: "PARTIAL_FAIL" })],
	}, undefined, undefined, ctx);
	const item = result.details.results[0];
	assert.equal(item.status, "failed");
	assert.match(item.output, /child:PARTIAL_FAIL/u);
	assert.match(item.output, /synthetic failure after partial output/u);
	const artifact = await readFile(item.artifactPath, "utf8");
	assert.match(artifact, /## Error/u);
	assert.match(artifact, /synthetic failure after partial output/u);
	assert.match(result.content[0].text, /synthetic failure after partial output/u);
});

test("a zero-exit child without an assistant result is a failure", async () => {
	const result = await tool.execute("call", {
		timeoutSeconds: 10,
		tasks: [task({ label: "empty-process", task: "NO_EVENTS" })],
	}, undefined, undefined, ctx);
	const item = result.details.results[0];
	assert.equal(item.status, "failed");
	assert.match(item.error, /without an assistant result/u);
});

test("unsupported priority service retries normally within the task timeout", async () => {
	const result = await tool.execute("call", {
		timeoutSeconds: 10,
		tasks: [task({
			label: "priority-fallback",
			task: "PRIORITY_REJECT",
			model: "openai-codex/gpt-5.6-luna",
			fast: true,
		})],
	}, undefined, undefined, ctx);
	const item = result.details.results[0];
	assert.equal(item.status, "succeeded");
	assert.equal(item.attempts, 2);
	assert.equal(item.fastFallback, true);
	assert.equal(item.priorityApplied, false);
	assert.match(item.output, /child:PRIORITY_REJECT/u);
	assert.ok(item.activity.some((entry) => entry.includes("retried normally")));
});

test("sequential handoffs always replace the previous-output placeholder", async () => {
	const result = await tool.execute("call", {
		mode: "sequential",
		timeoutSeconds: 10,
		tasks: [
			task({ label: "empty", task: "EMPTY" }),
			task({ label: "next", task: "next {previous}" }),
		],
	}, undefined, undefined, ctx);
	assert.equal(result.details.results[1].status, "succeeded");
	assert.doesNotMatch(result.details.results[1].output, /\{previous\}/u);
	assert.match(result.details.results[1].output, /\(no output\)/u);
});

test("child startup does not inherit parent session metadata", async () => {
	const names = ["PI_SESSION_ID", "PI_SESSION_FILE", "PI_PROVIDER", "PI_MODEL", "PI_REASONING_LEVEL"];
	const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
	for (const name of names) process.env[name] = `parent-${name}`;
	try {
		const result = await tool.execute("call", {
			timeoutSeconds: 10,
			tasks: [task({ label: "env", task: "ENV" })],
		}, undefined, undefined, ctx);
		const environment = JSON.parse(result.details.results[0].output);
		assert.deepEqual(environment, {
			sessionId: null,
			sessionFile: null,
			provider: null,
			model: null,
			reasoning: null,
			child: "1",
		});
	} finally {
		for (const name of names) {
			if (saved[name] === undefined) delete process.env[name];
			else process.env[name] = saved[name];
		}
	}
});

test("an abort snapshot excludes parallel tasks that already failed", async () => {
	const startLog = join(workspace, "mixed-starts.log");
	await writeFile(startLog, "");
	process.env.FAKE_CHILD_START_LOG = startLog;
	const controller = new AbortController();
	const updates = [];
	try {
		const pending = tool.execute("call-mixed-abort", {
			mode: "parallel",
			concurrency: 2,
			timeoutSeconds: 20,
			tasks: [
				task({ label: "failed", task: "FAIL_BEFORE_OUTPUT" }),
				task({ label: "interrupted", task: "HANG" }),
			],
		}, controller.signal, (update) => updates.push(update), ctx);
		const deadline = Date.now() + 5_000;
		while (!updates.some((update) => update.details.results[0].status === "failed")) {
			if (Date.now() > deadline) throw new Error("failed child did not settle before abort");
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		controller.abort();
		const result = await pending;
		assert.equal(result.details.results[0].status, "failed");
		assert.equal(result.details.results[1].status, "aborted");
		assert.deepEqual(result.details.replay.retryIndexes, [1]);
	} finally {
		delete process.env.FAKE_CHILD_START_LOG;
	}
});

test("abort stops active children, skips the queue, and preserves accrued usage", async () => {
	const startLog = join(workspace, "starts.log");
	await writeFile(startLog, "");
	process.env.FAKE_CHILD_START_LOG = startLog;
	const controller = new AbortController();
	try {
		const pending = tool.execute("call", {
			mode: "parallel",
			concurrency: 1,
			timeoutSeconds: 20,
			tasks: [0, 1, 2, 3].map((index) => task({ label: `hang-${index}`, task: `HANG ${index}` })),
		}, controller.signal, undefined, ctx);
		const deadline = Date.now() + 5_000;
		while (!(await readFile(startLog, "utf8")).trim()) {
			if (Date.now() > deadline) throw new Error("fake child did not start");
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		controller.abort();
		const result = await pending;
		await new Promise((resolve) => setTimeout(resolve, 100));
		const starts = (await readFile(startLog, "utf8")).trim().split("\n").filter(Boolean);
		assert.equal(starts.length, 1);
		assert.equal(result.details.results[0].status, "aborted");
		assert.ok(result.details.results.slice(1).every((item) => item.status === "skipped"));
		assert.equal(result.details.replay.interrupted, true);
		assert.deepEqual(result.details.replay.retryIndexes, [0, 1, 2, 3]);
		assert.equal(result.usage.input, 10);
		assert.match(result.details.results[0].error, /aborted/u);
	} finally {
		delete process.env.FAKE_CHILD_START_LOG;
	}
});
