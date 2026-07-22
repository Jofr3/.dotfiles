import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importInstalledPackages } from "./installed-packages.mjs";

function textFromUserContent(content) {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function userTexts(messages) {
	return messages.filter((message) => message.role === "user").map((message) => textFromUserContent(message.content));
}

function createTwoPartyBarrier(timeoutMs = 2_000) {
	const arrivals = new Set();
	let release;
	const released = new Promise((resolve) => {
		release = resolve;
	});

	return {
		async arrive(label) {
			assert.ok(!arrivals.has(label), `Duplicate barrier arrival: ${label}`);
			arrivals.add(label);
			if (arrivals.size === 2) release();

			let timer;
			try {
				await Promise.race([
					released,
					new Promise((_, reject) => {
						timer = setTimeout(() => reject(new Error(`Timed out waiting for concurrent prompts: ${[...arrivals].join(", ")}`)), timeoutMs);
					}),
				]);
			} finally {
				if (timer) clearTimeout(timer);
			}
		},
	};
}

test("concurrent in-process AgentSessions are isolated, failure-tolerant, reusable, and disposable", async () => {
	const { codingAgent, piAi } = await importInstalledPackages();
	const {
		createAgentSession,
		DefaultResourceLoader,
		defineTool,
		ModelRuntime,
		SessionManager,
		SettingsManager,
	} = codingAgent;
	const { InMemoryCredentialStore, Type, fauxAssistantMessage, fauxProvider, fauxToolCall } = piAi;

	const root = await mkdtemp(join(tmpdir(), "pi-sub-agents-spike-"));
	let sessionA;
	let sessionB;

	try {
		const faux = fauxProvider({ provider: "sub-agents-faux", tokensPerSecond: 100_000 });
		const modelRuntime = await ModelRuntime.create({
			credentials: new InMemoryCredentialStore(),
			modelsPath: null,
			allowModelNetwork: false,
		});
		modelRuntime.registerNativeProvider(faux.provider);
		const model = modelRuntime.getModel("sub-agents-faux", "faux-1");
		assert.ok(model, "The registered faux model must be resolvable through ModelRuntime");

		const barrier = createTwoPartyBarrier();
		let activeInitialResponses = 0;
		let maximumConcurrentResponses = 0;
		let secondAssignmentSawPriorContext = false;

		const initialResponse = async (context) => {
			const latestUser = [...context.messages].reverse().find((message) => message.role === "user");
			assert.ok(latestUser, "Initial request must include a user message");
			const prompt = textFromUserContent(latestUser.content);

			activeInitialResponses += 1;
			maximumConcurrentResponses = Math.max(maximumConcurrentResponses, activeInitialResponses);
			try {
				await barrier.arrive(prompt);
			} finally {
				activeInitialResponses -= 1;
			}

			if (prompt === "alpha") {
				return fauxAssistantMessage(fauxToolCall("marker", { value: "alpha" }), { stopReason: "toolUse" });
			}
			assert.equal(prompt, "beta");
			return fauxAssistantMessage([], {
				stopReason: "error",
				errorMessage: "synthetic child failure",
			});
		};

		faux.setResponses([
			initialResponse,
			initialResponse,
			(context) => {
				const toolResult = context.messages.find((message) => message.role === "toolResult");
				assert.equal(toolResult?.toolName, "marker");
				assert.equal(toolResult?.content[0]?.type, "text");
				assert.equal(toolResult?.content[0]?.text, "marked:alpha");
				return fauxAssistantMessage("alpha complete");
			},
			(context) => {
				secondAssignmentSawPriorContext = context.messages.some(
					(message) =>
						message.role === "assistant" &&
						message.content.some((part) => part.type === "text" && part.text === "alpha complete"),
				);
				return fauxAssistantMessage("alpha second complete");
			},
		]);

		const markerTool = defineTool({
			name: "marker",
			label: "Marker",
			description: "Record a deterministic offline test marker",
			parameters: Type.Object({ value: Type.String() }),
			async execute(_toolCallId, params) {
				return {
					content: [{ type: "text", text: `marked:${params.value}` }],
					details: { value: params.value },
				};
			},
		});

		async function createChild(name, customTools, tools) {
			const cwd = join(root, name);
			const agentDir = join(root, `${name}-agent`);
			const resourceLoader = new DefaultResourceLoader({
				cwd,
				agentDir,
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
				systemPrompt: `You are isolated child ${name}.`,
			});
			await resourceLoader.reload();

			const sessionManager = SessionManager.inMemory(cwd);
			const settingsManager = SettingsManager.inMemory({
				compaction: { enabled: false },
				retry: { enabled: false },
			});
			const result = await createAgentSession({
				cwd,
				agentDir,
				model,
				thinkingLevel: "off",
				modelRuntime,
				customTools,
				tools,
				resourceLoader,
				sessionManager,
				settingsManager,
			});
			return { session: result.session, sessionManager };
		}

		const childA = await createChild("a", [markerTool], ["marker"]);
		const childB = await createChild("b", [], []);
		sessionA = childA.session;
		sessionB = childB.session;

		assert.equal(childA.sessionManager.isPersisted(), false);
		assert.equal(childB.sessionManager.isPersisted(), false);
		assert.notEqual(childA.sessionManager.getSessionId(), childB.sessionManager.getSessionId());
		assert.notEqual(childA.sessionManager.getCwd(), childB.sessionManager.getCwd());

		const eventsA = [];
		const eventsB = [];
		sessionA.subscribe((event) => eventsA.push({ type: event.type, toolName: event.toolName }));
		sessionB.subscribe((event) => eventsB.push({ type: event.type, toolName: event.toolName }));

		// Intentionally launch both before awaiting either. The two-party barrier proves
		// both provider requests overlap instead of merely finishing eventually.
		const runA = sessionA.prompt("alpha");
		const runB = sessionB.prompt("beta");
		await Promise.all([runA, runB]);

		assert.equal(maximumConcurrentResponses, 2);
		assert.equal(sessionA.isIdle, true);
		assert.equal(sessionB.isIdle, true);
		assert.equal(sessionA.getLastAssistantText(), "alpha complete");
		assert.equal(sessionB.messages.at(-1)?.role, "assistant");
		assert.equal(sessionB.messages.at(-1)?.stopReason, "error");
		assert.equal(sessionB.messages.at(-1)?.errorMessage, "synthetic child failure");
		assert.ok(eventsA.some((event) => event.type === "tool_execution_start" && event.toolName === "marker"));
		assert.ok(eventsA.some((event) => event.type === "tool_execution_end" && event.toolName === "marker"));
		assert.ok(!eventsB.some((event) => event.type.startsWith("tool_execution_")));
		assert.ok(eventsA.some((event) => event.type === "agent_settled"));
		assert.ok(eventsB.some((event) => event.type === "agent_settled"));

		assert.notStrictEqual(sessionA.messages, sessionB.messages);
		assert.deepEqual(userTexts(sessionA.messages), ["alpha"]);
		assert.deepEqual(userTexts(sessionB.messages), ["beta"]);
		assert.ok(!sessionA.messages.some((message) => JSON.stringify(message).includes("synthetic child failure")));
		assert.ok(!sessionB.messages.some((message) => JSON.stringify(message).includes("alpha complete")));
		assert.notStrictEqual(childA.sessionManager.getEntries(), childB.sessionManager.getEntries());

		await sessionA.prompt("alpha second");
		assert.equal(secondAssignmentSawPriorContext, true);
		assert.deepEqual(userTexts(sessionA.messages), ["alpha", "alpha second"]);
		assert.equal(sessionA.getLastAssistantText(), "alpha second complete");
		assert.deepEqual(userTexts(sessionB.messages), ["beta"]);

		const eventCountBeforeDispose = eventsA.length;
		const entryCountBeforeDispose = childA.sessionManager.getEntries().length;
		sessionA.dispose();
		sessionB.dispose();

		// AgentSession.dispose() is synchronous. Its supported observable effect is
		// disconnection: the underlying Agent can still be driven directly, but the
		// disposed AgentSession no longer emits or persists those events.
		faux.appendResponses([fauxAssistantMessage("post-dispose low-level response")]);
		await sessionA.agent.prompt("post-dispose low-level prompt");
		assert.equal(eventsA.length, eventCountBeforeDispose);
		assert.equal(childA.sessionManager.getEntries().length, entryCountBeforeDispose);
	} finally {
		// Repeated disposal is safe and keeps failure paths leak-free.
		sessionA?.dispose();
		sessionB?.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
