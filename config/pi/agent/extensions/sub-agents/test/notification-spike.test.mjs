import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importInstalledPackages } from "./installed-packages.mjs";

const IMPORTANT_STATES = new Set(["idle", "blocked", "failed"]);
const MAX_EVENTS = 20;
const MAX_SUMMARY_CHARS = 400;

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

class BackgroundNotificationInbox {
	#sendMessage;
	#flushDelayMs;
	#events = [];
	#omitted = 0;
	#timer;
	#closed = false;
	#batchSequence = 0;

	constructor({ sendMessage, flushDelayMs = 10 }) {
		this.#sendMessage = sendMessage;
		this.#flushDelayMs = flushDelayMs;
	}

	get pendingCount() {
		return this.#events.length;
	}

	get hasScheduledFlush() {
		return this.#timer !== undefined;
	}

	enqueue(event) {
		if (this.#closed || !IMPORTANT_STATES.has(event.state)) return false;
		const bounded = {
			id: String(event.id).slice(0, 80),
			name: String(event.name).slice(0, 120),
			state: event.state,
			summary: String(event.summary ?? "").slice(0, MAX_SUMMARY_CHARS),
		};
		if (this.#events.length === MAX_EVENTS) {
			this.#events.shift();
			this.#omitted += 1;
		}
		this.#events.push(bounded);
		this.#schedule();
		return true;
	}

	#schedule() {
		if (this.#timer !== undefined || this.#closed) return;
		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			this.flushNow();
		}, this.#flushDelayMs);
		this.#timer.unref?.();
	}

	flushNow() {
		if (this.#closed || this.#events.length === 0) return false;
		if (this.#timer !== undefined) {
			clearTimeout(this.#timer);
			this.#timer = undefined;
		}
		const events = this.#events;
		const omitted = this.#omitted;
		this.#events = [];
		this.#omitted = 0;
		this.#batchSequence += 1;

		const lines = events.map((event) => `- ${event.id} ${event.name}: ${event.state} — ${event.summary || "(no summary)"}`);
		if (omitted > 0) lines.push(`- ${omitted} earlier event(s) omitted by the bounded inbox`);
		this.#sendMessage(
			{
				customType: "sub-agents-event",
				content: `[sub-agents event batch ${this.#batchSequence}]\n${lines.join("\n")}`,
				display: true,
				details: {
					version: 1,
					source: "sub-agents",
					count: events.length,
					omitted,
				},
			},
			// This single policy is race-safe for both parent states. While the
			// parent streams it cannot steer the current turn; while idle,
			// triggerTurn starts one model turn for the coalesced batch.
			{ deliverAs: "followUp", triggerTurn: true },
		);
		return true;
	}

	shutdown() {
		if (this.#closed) return;
		this.#closed = true;
		if (this.#timer !== undefined) clearTimeout(this.#timer);
		this.#timer = undefined;
		this.#events = [];
		this.#omitted = 0;
	}
}

test("background completions coalesce into one follow-up while the parent streams and one triggered turn while idle", async () => {
	const { codingAgent, piAi } = await importInstalledPackages();
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agents-notifications-"));
	let session;
	let inbox;

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
						inbox = new BackgroundNotificationInbox({
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
			assert.equal(
				inbox.enqueue({
					id: `child-${index}`,
					name: `worker-${index}`,
					state: "idle",
					summary: `result ${index}`,
				}),
				true,
			);
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

		assert.equal(
			inbox.enqueue({ id: "progress-only", name: "progress", state: "progress", summary: "do not wake" }),
			false,
		);
		assert.equal(
			inbox.enqueue({ id: "child-idle", name: "later-worker", state: "blocked", summary: "needs orchestration" }),
			true,
		);
		assert.equal(inbox.flushNow(), true);
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
	const inbox = new BackgroundNotificationInbox({
		sendMessage: (...args) => sent.push(args),
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
