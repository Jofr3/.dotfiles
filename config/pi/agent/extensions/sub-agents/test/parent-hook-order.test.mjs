import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importInstalledPackages } from "./installed-packages.mjs";

function missing(error) {
	return error && typeof error === "object" && error.code === "ENOENT";
}

test("installed Pi hooks expose completed built-in mutations before tool_result/end and end every blocked call", async () => {
	const { codingAgent, piAi } = await importInstalledPackages();
	const {
		createAgentSession,
		DefaultResourceLoader,
		ModelRuntime,
		SessionManager,
		SettingsManager,
	} = codingAgent;
	const { InMemoryCredentialStore, fauxAssistantMessage, fauxProvider, fauxToolCall } = piAi;
	const root = await mkdtemp(join(tmpdir(), "pi-parent-hook-order-"));
	let session;
	try {
		const faux = fauxProvider({ provider: "parent-hook-order-faux", tokensPerSecond: 100_000 });
		const modelRuntime = await ModelRuntime.create({
			credentials: new InMemoryCredentialStore(),
			modelsPath: null,
			allowModelNetwork: false,
		});
		modelRuntime.registerNativeProvider(faux.provider);
		const model = modelRuntime.getModel("parent-hook-order-faux", "faux-1");
		assert.ok(model);

		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("write", { path: "state.txt", content: "before" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("write complete"),
			fauxAssistantMessage(fauxToolCall("edit", {
				path: "state.txt",
				edits: [{ oldText: "before", newText: "after" }],
			}), { stopReason: "toolUse" }),
			fauxAssistantMessage("edit complete"),
			fauxAssistantMessage(fauxToolCall("bash", { command: "printf shell > shell.txt" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("bash complete"),
			fauxAssistantMessage(fauxToolCall("write", { path: "blocked.txt", content: "must-not-exist" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("blocked write observed"),
		]);

		const events = [];
		const verifyMutation = async (toolName) => {
			if (toolName === "write") {
				assert.equal(await readFile(join(root, "state.txt"), "utf8"), "before");
			} else if (toolName === "edit") {
				assert.equal(await readFile(join(root, "state.txt"), "utf8"), "after");
			} else if (toolName === "bash") {
				assert.equal(await readFile(join(root, "shell.txt"), "utf8"), "shell");
			}
		};
		const extensionFactory = (pi) => {
			pi.on("tool_call", (event) => {
				events.push({ phase: "call", id: event.toolCallId, tool: event.toolName });
				if (event.toolName === "write" && event.input.path === "blocked.txt") {
					return { block: true, reason: "synthetic blocked parent mutation" };
				}
			});
			pi.on("tool_result", async (event) => {
				await verifyMutation(event.toolName);
				events.push({ phase: "result", id: event.toolCallId, tool: event.toolName });
			});
			pi.on("tool_execution_end", async (event) => {
				if (!(event.toolName === "write" && event.isError)) {
					await verifyMutation(event.toolName);
				}
				events.push({
					phase: "end",
					id: event.toolCallId,
					tool: event.toolName,
					isError: event.isError,
				});
			});
		};
		const resourceLoader = new DefaultResourceLoader({
			cwd: root,
			agentDir: join(root, "agent"),
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			extensionFactories: [{ name: "parent-hook-order", factory: extensionFactory }],
			systemPrompt: "Run the supplied deterministic built-in tool call.",
		});
		await resourceLoader.reload();
		const result = await createAgentSession({
			cwd: root,
			agentDir: join(root, "agent"),
			model,
			thinkingLevel: "off",
			modelRuntime,
			tools: ["write", "edit", "bash"],
			resourceLoader,
			sessionManager: SessionManager.inMemory(root),
			settingsManager: SettingsManager.inMemory({
				compaction: { enabled: false },
				retry: { enabled: false },
			}),
		});
		session = result.session;

		await session.prompt("write");
		await session.prompt("edit");
		await session.prompt("bash");
		await session.prompt("blocked write");

		const groups = new Map();
		for (const event of events) {
			const group = groups.get(event.id) ?? [];
			group.push(event);
			groups.set(event.id, group);
		}
		const completed = [...groups.values()].filter((group) => group.some((event) => !event.isError && event.phase === "end"));
		assert.equal(completed.length, 3);
		for (const group of completed) {
			assert.deepEqual(group.map((event) => event.phase), ["call", "result", "end"]);
			assert.equal(group.at(-1).isError, false);
		}
		const blocked = [...groups.values()].find((group) => group.at(-1)?.isError === true);
		assert.ok(blocked);
		assert.deepEqual(blocked.map((event) => event.phase), ["call", "end"]);
		await assert.rejects(access(join(root, "blocked.txt")), missing);
	} finally {
		session?.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
