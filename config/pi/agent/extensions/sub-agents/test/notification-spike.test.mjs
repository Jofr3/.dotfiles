import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importInstalledPackages, importSubAgentsModule } from "./installed-packages.mjs";

const {
	SubAgentNotificationInbox,
	createSubAgentNotificationRuntime,
} = await importSubAgentsModule("notifications.ts");

function deferred() {
	let resolvePromise;
	let rejectPromise;
	const promise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function delay(ms) {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function textFromContent(content) {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function createNotificationSource() {
	let listener;
	return {
		source: {
			generation: "sag1-notification-spike",
			subscribeEvents(next) {
				listener = next;
				return () => {
					if (listener === next) listener = undefined;
				};
			},
		},
		emit({ id, name, state, summary }) {
			const lifecycleState = state === "progress" ? "running" : state;
			const kind = state === "progress" ? "report" : state === "failed" ? "runtime" : "assignment";
			listener?.({
				generation: "sag1-notification-spike",
				id,
				name,
				state: lifecycleState,
				assignmentId: `${id}:assignment:1`,
				notifyOn: ["idle", "blocked", "failed"],
				notificationState: state === "progress" ? undefined : state,
				notificationSummary: summary,
				event: {
					sequence: 1,
					kind,
					state: lifecycleState,
					summary,
					timestamp: Date.now(),
				},
			});
		},
	};
}

test("background completions coalesce into one follow-up while the parent streams and one triggered turn while idle", async () => {
	const { codingAgent, piAi } = await importInstalledPackages();
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agents-notifications-"));
	let session;
	let inbox;
	let emitNotification;

	try {
		const streamEntered = deferred();
		const releaseInitialResponse = deferred();
		const busyBatchHandled = deferred();
		const idleBatchHandled = deferred();
		const providerContexts = [];
		const faux = piAi.fauxProvider({ provider: "notification-faux", tokensPerSecond: 100_000 });
		faux.setResponses([
			async (context) => {
				providerContexts.push(context);
				streamEntered.resolve();
				await releaseInitialResponse.promise;
				return piAi.fauxAssistantMessage("initial parent response");
			},
			(context) => {
				providerContexts.push(context);
				busyBatchHandled.resolve();
				return piAi.fauxAssistantMessage("busy batch handled");
			},
			(context) => {
				providerContexts.push(context);
				idleBatchHandled.resolve();
				return piAi.fauxAssistantMessage("idle batch handled");
			},
		]);
		const modelRuntime = await codingAgent.ModelRuntime.create({
			credentials: new piAi.InMemoryCredentialStore(),
			modelsPath: null,
			allowModelNetwork: false,
		});
		modelRuntime.registerNativeProvider(faux.provider);
		const model = modelRuntime.getModel("notification-faux", "faux-1");
		assert.ok(model);

		let extensionApi;
		const dispatchedNotifications = [];
		const loader = new codingAgent.DefaultResourceLoader({
			cwd: root,
			agentDir: join(root, "agent"),
			settingsManager: codingAgent.SettingsManager.inMemory(),
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			systemPrompt: "You are the offline parent notification fixture.",
			appendSystemPrompt: [],
			extensionFactories: [
				{
					name: "notification-spike",
					factory(pi) {
						extensionApi = pi;
						const notificationSource = createNotificationSource();
						emitNotification = notificationSource.emit;
						inbox = createSubAgentNotificationRuntime({
							manager: notificationSource.source,
							sendMessage: (message, options) => {
								dispatchedNotifications.push({ message, options });
								pi.sendMessage(message, options);
							},
							flushDelayMs: 5,
						});
					},
				},
			],
		});
		await loader.reload();
		assert.ok(extensionApi);
		assert.ok(inbox);
		assert.ok(emitNotification);

		const result = await codingAgent.createAgentSession({
			cwd: root,
			agentDir: join(root, "agent"),
			model,
			thinkingLevel: "off",
			modelRuntime,
			tools: [],
			resourceLoader: loader,
			sessionManager: codingAgent.SessionManager.inMemory(root),
			settingsManager: codingAgent.SettingsManager.inMemory({
				compaction: { enabled: false },
				retry: { enabled: false },
			}),
		});
		session = result.session;

		const initialRun = session.prompt("start parent work");
		await streamEntered.promise;
		assert.equal(session.isStreaming, true);
		for (let index = 0; index < 10; index += 1) {
			emitNotification({
				id: `child-${index}`,
				name: `worker-${index}`,
				state: "idle",
				summary: `result ${index}`,
			});
		}
		assert.equal(inbox.pendingCount, 10);
		assert.equal(inbox.hasScheduledFlush, true);
		await delay(15);
		assert.equal(inbox.pendingCount, 0);
		assert.equal(
			session.messages.filter((message) => message.role === "custom" && message.customType === "sub-agents-event").length,
			0,
			"A busy-parent notification must remain queued until the current run reaches its follow-up boundary",
		);
		assert.equal(dispatchedNotifications.length, 1);
		assert.deepEqual(dispatchedNotifications[0].options, { deliverAs: "followUp", triggerTurn: true });

		releaseInitialResponse.resolve();
		await initialRun;
		await busyBatchHandled.promise;
		assert.equal(session.isIdle, true);
		let customMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "sub-agents-event",
		);
		assert.equal(customMessages.length, 1, "Ten completions must produce one custom message batch");
		assert.equal(customMessages[0].details.count, 10);
		assert.equal(customMessages[0].details.source, "sub-agents");
		assert.equal((customMessages[0].content.match(/child-/g) ?? []).length, 10);

		emitNotification({ id: "progress-only", name: "progress", state: "progress", summary: "do not wake" });
		assert.equal(inbox.pendingCount, 0);
		emitNotification({ id: "child-idle", name: "later-worker", state: "blocked", summary: "needs orchestration" });
		assert.ok(inbox.flushNow());
		await idleBatchHandled.promise;
		await session.waitForIdle();
		assert.equal(session.isIdle, true);
		customMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "sub-agents-event",
		);
		assert.equal(customMessages.length, 2, "An idle parent should receive one triggered turn for the next batch");
		assert.equal(customMessages[1].details.count, 1);
		assert.equal(dispatchedNotifications.length, 2);
		assert.deepEqual(dispatchedNotifications[1].options, { deliverAs: "followUp", triggerTurn: true });

		assert.equal(providerContexts.length, 3);
		const busyContextText = providerContexts[1].messages.map((message) => textFromContent(message.content)).join("\n");
		const idleContextText = providerContexts[2].messages.map((message) => textFromContent(message.content)).join("\n");
		assert.match(busyContextText, /sub-agents event batch 1/);
		assert.match(idleContextText, /sub-agents event batch 2/);
		assert.equal(
			session.messages.filter((message) => message.role === "custom" && message.customType === "sub-agents-event").length,
			2,
			"Handling an extension-origin notification must not recursively enqueue another notification",
		);
	} finally {
		inbox?.shutdown();
		session?.dispose();
		await rm(root, { recursive: true, force: true });
	}
});

test("notification shutdown clears the sole scheduled flush and rejects later events", async () => {
	const sent = [];
	const inbox = new SubAgentNotificationInbox({
		generation: "sag1-notification-shutdown",
		onBatch: (batch) => sent.push(batch),
		flushDelayMs: 5,
	});
	assert.equal(inbox.enqueue({ id: "child", name: "worker", state: "failed", summary: "failure" }), true);
	assert.equal(inbox.hasScheduledFlush, true);
	inbox.shutdown();
	inbox.shutdown();
	assert.equal(inbox.hasScheduledFlush, false);
	assert.equal(inbox.pendingCount, 0);
	assert.equal(inbox.enqueue({ id: "late", name: "late", state: "idle", summary: "late" }), false);
	await delay(15);
	assert.deepEqual(sent, []);
});
