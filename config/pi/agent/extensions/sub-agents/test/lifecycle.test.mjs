import assert from "node:assert/strict";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const { formatSubAgentsStatus, registerSubAgentsExtension } = await importSubAgentsModule("index.ts");

function emptyCounts() {
	return {
		creating: 0,
		running: 0,
		idle: 0,
		blocked: 0,
		failed: 0,
		stopping: 0,
		removed: 0,
	};
}

function createFakePi() {
	const handlers = new Map();
	const commands = new Map();
	const tools = new Map();
	const entries = [];
	return {
		handlers,
		commands,
		tools,
		entries,
		api: {
			on(name, handler) {
				handlers.set(name, handler);
			},
			registerCommand(name, command) {
				commands.set(name, command);
			},
			registerTool(tool) {
				tools.set(tool.name, tool);
			},
			appendEntry(customType, data) {
				entries.push({ customType, data });
			},
		},
	};
}

function createContext() {
	const notifications = [];
	const statusChanges = [];
	const widgetChanges = [];
	let projectTrusted = true;
	return {
		notifications,
		statusChanges,
		widgetChanges,
		setProjectTrusted(value) {
			projectTrusted = value;
		},
		context: {
			cwd: process.cwd(),
			mode: "tui",
			hasUI: true,
			isProjectTrusted() {
				return projectTrusted;
			},
			ui: {
				notify(message, level) {
					notifications.push({ message, level });
				},
				setStatus(key, value) {
					statusChanges.push({ key, value });
				},
				setWidget(key, value) {
					widgetChanges.push({ key, value });
				},
			},
		},
	};
}

test("the extension factory is inert until session_start and rotates managers at successful lifecycle boundaries", async () => {
	const fakePi = createFakePi();
	const managers = [];
	const createManager = (cwd) => {
		const index = managers.length + 1;
		const manager = {
			generation: `sag1-lifecycle-${index}`,
			cwd,
			disposals: [],
			contextCaptures: [],
			notificationShutdowns: 0,
			disposalNotificationShutdowns: [],
			widgetShutdowns: 0,
			disposalWidgetShutdowns: [],
			closed: false,
			captureParentContext(contextFiles, trusted) {
				this.contextCaptures.push({ contextFiles, trusted });
			},
			getSummary() {
				return {
					generation: this.generation,
					closed: this.closed,
					total: 0,
					active: 0,
					historical: 0,
					counts: emptyCounts(),
				};
			},
			async disposeAll(reason) {
				if (!this.closed) {
					this.disposals.push(reason);
					this.disposalNotificationShutdowns.push(this.notificationShutdowns);
					this.disposalWidgetShutdowns.push(this.widgetShutdowns);
				}
				this.closed = true;
			},
		};
		managers.push(manager);
		return manager;
	};

	registerSubAgentsExtension(fakePi.api, {
		createManager,
		createStatusRuntime(manager) {
			return {
				manager: {
					generation: manager.generation,
					listAgents() {
						return [];
					},
					getAgent() {
						throw new Error("unused lifecycle status lookup");
					},
					async drainUsage() {
						throw new Error("unused lifecycle status drain");
					},
				},
			};
		},
		createSendRuntime(manager) {
			const id = `sa1-${manager.generation.slice("sag1-".length)}-1-lifecycle`;
			let snapshot = { id, state: "idle", assignmentCount: 0 };
			return {
				manager: {
					generation: manager.generation,
					getAgent() {
						return snapshot;
					},
				},
				runner: {
					async prompt(_id, _message) {
						snapshot = {
							id,
							state: "running",
							assignmentCount: 1,
							currentAssignment: { id: `${id}:assignment:1`, sequence: 1 },
						};
						return { id, accepted: true, assignmentId: snapshot.currentAssignment.id, snapshot };
					},
					async send() {
						throw new Error("unused lifecycle send");
					},
					async waitForAssignment() {
						throw new Error("unused lifecycle wait");
					},
				},
			};
		},
		createReconfigureRuntime(manager) {
			const id = `sa1-${manager.generation.slice("sag1-".length)}-1-lifecycle`;
			const oldRoute = {
				requestedPolicy: "auto",
				requestedComplexity: "simple",
				selectedModel: { provider: "fixture", id: "old-model" },
				selectedTier: "simple",
				fallbackUsed: false,
				fallbackPath: [
					{ source: "tier", modelId: "old-model", complexity: "simple", outcome: "selected" },
				],
				reason: "Old lifecycle route.",
			};
			const newRoute = {
				requestedPolicy: "auto",
				requestedComplexity: "moderate",
				selectedModel: { provider: "fixture", id: "new-model" },
				selectedTier: "moderate",
				fallbackUsed: false,
				fallbackPath: [
					{ source: "tier", modelId: "new-model", complexity: "moderate", outcome: "selected" },
				],
				reason: "New lifecycle route.",
			};
			const snapshot = { id, state: "idle", modelRoute: oldRoute };
			return {
				manager: {
					generation: manager.generation,
					getAgent() {
						return snapshot;
					},
				},
				router: {
					async resolve() {
						return { runtime: {}, model: {}, ref: newRoute.selectedModel, route: newRoute };
					},
				},
				runner: {
					async reconfigure() {
						return {
							id,
							action: "applied",
							oldRoute,
							newRoute,
							oldThinkingLevel: "low",
							effectiveThinkingLevel: "medium",
							snapshot: { ...snapshot, modelRoute: newRoute },
						};
					},
				},
			};
		},
		createWaitRuntime(manager) {
			return {
				manager: {
					generation: manager.generation,
					listAgents() {
						return [];
					},
					getAgent() {
						throw new Error("unused lifecycle wait lookup");
					},
					async drainUsage() {
						throw new Error("unused lifecycle wait drain");
					},
				},
			};
		},
		createReleaseRuntime(manager) {
			const id = `sa1-${manager.generation.slice("sag1-".length)}-1-lifecycle`;
			return {
				manager: {
					generation: manager.generation,
					getAgent() {
						return { id, state: "idle", leases: [] };
					},
					async releaseChildLeasesWithResult() {
						return {
							snapshot: { id, state: "idle", leases: [] },
							released: [],
						};
					},
				},
			};
		},
		createRemoveRuntime(manager) {
			return {
				manager: {
					generation: manager.generation,
					listAgents() {
						return [];
					},
					getAgent() {
						throw new Error("unused lifecycle remove lookup");
					},
					async removeAgent() {
						throw new Error("unused lifecycle removal");
					},
					async drainUsage() {
						throw new Error("unused lifecycle remove drain");
					},
				},
				runner: {
					async send() {
						throw new Error("unused lifecycle graceful stop");
					},
				},
			};
		},
		createNotificationRuntime(manager) {
			return {
				shutdown() {
					manager.notificationShutdowns += 1;
				},
			};
		},
		createWidgetRuntime(manager, host) {
			assert.equal(host, ui.context.ui);
			return {
				shutdown() {
					manager.widgetShutdowns += 1;
				},
			};
		},
	});
	assert.equal(managers.length, 0, "loading the extension must not start session-scoped resources");
	assert.deepEqual(
		[...fakePi.handlers.keys()].sort(),
		[
			"before_agent_start",
			"session_compact",
			"session_shutdown",
			"session_start",
			"session_tree",
			"tool_call",
			"tool_execution_end",
			"tool_result",
		],
	);
	assert.ok(fakePi.commands.has("sub-agents"));
	assert.ok(fakePi.tools.has("sub_agents_spawn"));
	assert.equal(fakePi.tools.get("sub_agents_spawn").executionMode, "parallel");
	assert.ok(fakePi.tools.has("sub_agents_status"));
	assert.equal(fakePi.tools.get("sub_agents_status").executionMode, "parallel");
	assert.ok(fakePi.tools.has("sub_agents_send"));
	assert.equal(fakePi.tools.get("sub_agents_send").executionMode, "parallel");
	assert.ok(fakePi.tools.has("sub_agents_reconfigure"));
	assert.equal(fakePi.tools.get("sub_agents_reconfigure").executionMode, "parallel");
	assert.ok(fakePi.tools.has("sub_agents_wait"));
	assert.equal(fakePi.tools.get("sub_agents_wait").executionMode, "parallel");
	assert.ok(fakePi.tools.has("sub_agents_release"));
	assert.equal(fakePi.tools.get("sub_agents_release").executionMode, "parallel");
	assert.ok(fakePi.tools.has("sub_agents_remove"));
	assert.equal(fakePi.tools.get("sub_agents_remove").executionMode, "parallel");

	const ui = createContext();
	await fakePi.handlers.get("session_start")({ reason: "startup" }, ui.context);
	assert.equal(managers.length, 1);
	assert.equal(managers[0].cwd, process.cwd());
	const initialStatus = await fakePi.tools.get("sub_agents_status").execute(
		"lifecycle-status",
		{},
		undefined,
		undefined,
		ui.context,
	);
	assert.equal(initialStatus.details.generation, "sag1-lifecycle-1");
	const initialRelease = await fakePi.tools.get("sub_agents_release").execute(
		"lifecycle-release",
		{ ids: ["sa1-lifecycle-1-1-lifecycle"] },
		undefined,
		undefined,
		ui.context,
	);
	assert.equal(initialRelease.details.generation, "sag1-lifecycle-1");
	assert.equal(initialRelease.details.noOpTargets, 1);
	const initialSend = await fakePi.tools.get("sub_agents_send").execute(
		"lifecycle-send",
		{
			messages: [
				{ id: "sa1-lifecycle-1-1-lifecycle", message: "start lifecycle assignment" },
			],
		},
		undefined,
		undefined,
		ui.context,
	);
	assert.equal(initialSend.details.generation, "sag1-lifecycle-1");
	assert.equal(initialSend.details.accepted, 1);
	const initialReconfigure = await fakePi.tools.get("sub_agents_reconfigure").execute(
		"lifecycle-reconfigure",
		{
			changes: [
				{ id: "sa1-lifecycle-1-1-lifecycle", modelPolicy: "auto", complexity: "moderate" },
			],
		},
		undefined,
		undefined,
		{ ...ui.context, modelRegistry: {}, model: undefined },
	);
	assert.equal(initialReconfigure.details.generation, "sag1-lifecycle-1");
	assert.equal(initialReconfigure.details.applied, 1);
	const initialWait = await fakePi.tools.get("sub_agents_wait").execute(
		"lifecycle-wait",
		{},
		undefined,
		undefined,
		ui.context,
	);
	assert.equal(initialWait.details.generation, "sag1-lifecycle-1");
	assert.equal(initialWait.details.completion, "no_targets");
	const initialRemove = await fakePi.tools.get("sub_agents_remove").execute(
		"lifecycle-remove",
		{ scope: "all", mode: "graceful" },
		undefined,
		undefined,
		ui.context,
	);
	assert.equal(initialRemove.details.generation, "sag1-lifecycle-1");
	assert.equal(initialRemove.details.requested, 0);

	const parentContextFiles = [{ path: "/project/CLAUDE.md", content: "CURRENT_CONTEXT" }];
	await fakePi.handlers.get("before_agent_start")(
		{ systemPromptOptions: { contextFiles: parentContextFiles } },
		ui.context,
	);
	assert.deepEqual(managers[0].contextCaptures, [
		{ contextFiles: parentContextFiles, trusted: true },
	]);

	await fakePi.commands.get("sub-agents").handler("", ui.context);
	assert.equal(ui.notifications.length, 1);
	assert.match(ui.notifications[0].message, /sag1-lifecycle-1/);
	assert.match(ui.notifications[0].message, /0 active/);

	await fakePi.handlers.get("session_compact")({ reason: "manual" }, ui.context);
	assert.equal(managers.length, 2);
	assert.deepEqual(managers[0].disposals, ["session compact: manual"]);
	assert.equal(managers[0].notificationShutdowns, 1);
	assert.deepEqual(managers[0].disposalNotificationShutdowns, [1]);
	assert.equal(managers[0].widgetShutdowns, 1);
	assert.deepEqual(managers[0].disposalWidgetShutdowns, [1]);
	assert.deepEqual(managers[1].contextCaptures, [], "a new generation starts without stale parent context");
	ui.setProjectTrusted(false);
	await fakePi.handlers.get("before_agent_start")(
		{ systemPromptOptions: { contextFiles: parentContextFiles } },
		ui.context,
	);
	assert.deepEqual(managers[1].contextCaptures, [
		{ contextFiles: parentContextFiles, trusted: false },
	]);
	await fakePi.handlers.get("session_tree")({}, ui.context);
	assert.equal(managers.length, 3);
	assert.deepEqual(managers[1].disposals, ["session tree navigation"]);
	assert.equal(managers[1].notificationShutdowns, 1);
	assert.deepEqual(managers[1].disposalNotificationShutdowns, [1]);
	assert.equal(managers[1].widgetShutdowns, 1);
	assert.deepEqual(managers[1].disposalWidgetShutdowns, [1]);

	await fakePi.handlers.get("session_shutdown")({ reason: "reload" }, ui.context);
	assert.equal(managers.length, 3, "shutdown must not create a replacement generation");
	assert.deepEqual(managers[2].disposals, ["session shutdown: reload"]);
	assert.equal(managers[2].notificationShutdowns, 1);
	assert.deepEqual(managers[2].disposalNotificationShutdowns, [1]);
	assert.equal(managers[2].widgetShutdowns, 1);
	assert.deepEqual(managers[2].disposalWidgetShutdowns, [1]);
	await assert.rejects(
		fakePi.tools.get("sub_agents_status").execute(
			"inactive-lifecycle-status",
			{},
			undefined,
			undefined,
			ui.context,
		),
		(error) => error.code === "manager_inactive",
	);
	await assert.rejects(
		fakePi.tools.get("sub_agents_send").execute(
			"inactive-lifecycle-send",
			{
				messages: [
					{ id: "sa1-lifecycle-3-1-lifecycle", message: "must not be delivered" },
				],
			},
			undefined,
			undefined,
			ui.context,
		),
		(error) => error.code === "manager_inactive",
	);
	await assert.rejects(
		fakePi.tools.get("sub_agents_reconfigure").execute(
			"inactive-lifecycle-reconfigure",
			{
				changes: [
					{ id: "sa1-lifecycle-3-1-lifecycle", modelPolicy: "inherit" },
				],
			},
			undefined,
			undefined,
			{ ...ui.context, modelRegistry: {}, model: undefined },
		),
		(error) => error.code === "manager_inactive",
	);
	await assert.rejects(
		fakePi.tools.get("sub_agents_wait").execute(
			"inactive-lifecycle-wait",
			{},
			undefined,
			undefined,
			ui.context,
		),
		(error) => error.code === "manager_inactive",
	);
	await assert.rejects(
		fakePi.tools.get("sub_agents_release").execute(
			"inactive-lifecycle-release",
			{ ids: ["sa1-lifecycle-3-1-lifecycle"] },
			undefined,
			undefined,
			ui.context,
		),
		(error) => error.code === "manager_inactive",
	);
	await assert.rejects(
		fakePi.tools.get("sub_agents_remove").execute(
			"inactive-lifecycle-remove",
			{ scope: "all" },
			undefined,
			undefined,
			ui.context,
		),
		(error) => error.code === "manager_inactive",
	);
	assert.deepEqual(ui.statusChanges.at(-1), { key: "sub-agents", value: undefined });
	assert.deepEqual(ui.widgetChanges.at(-1), { key: "sub-agents", value: undefined });

	await fakePi.commands.get("sub-agents").handler("", ui.context);
	assert.match(ui.notifications.at(-1).message, /inactive/);
	assert.equal(ui.notifications.at(-1).level, "warning");

	await fakePi.handlers.get("session_start")({ reason: "reload" }, ui.context);
	assert.equal(managers.length, 4);
	assert.match(formatSubAgentsStatus(managers[3].getSummary()), /manager ready/);
});

test("a notification runtime initialization failure transactionally disposes the new manager", async () => {
	const fakePi = createFakePi();
	const disposals = [];
	const manager = {
		generation: "sag1-notification-init-failure",
		captureParentContext() {},
		getSummary() {
			return {
				generation: this.generation,
				closed: false,
				total: 0,
				active: 0,
				historical: 0,
				counts: emptyCounts(),
			};
		},
		async disposeAll(reason) {
			disposals.push(reason);
		},
	};
	registerSubAgentsExtension(fakePi.api, {
		createManager() {
			return manager;
		},
		createNotificationRuntime() {
			throw new Error("synthetic notification initialization failure");
		},
	});
	const ui = createContext();
	await assert.rejects(
		fakePi.handlers.get("session_start")({ reason: "startup" }, ui.context),
		/synthetic notification initialization failure/,
	);
	assert.deepEqual(disposals, ["session start: startup: runtime initialization failed"]);
	await fakePi.commands.get("sub-agents").handler("", ui.context);
	assert.match(ui.notifications.at(-1).message, /inactive/);
});

test("the persistent widget runtime is TUI-only and a widget initialization failure is transactional", async () => {
	const rpcPi = createFakePi();
	let rpcWidgetCreations = 0;
	const rpcManager = {
		generation: "sag1-widget-rpc",
		captureParentContext() {},
		getSummary() {
			return {
				generation: this.generation,
				closed: false,
				total: 0,
				active: 0,
				historical: 0,
				counts: emptyCounts(),
			};
		},
		async disposeAll() {},
	};
	registerSubAgentsExtension(rpcPi.api, {
		createManager() {
			return rpcManager;
		},
		createWidgetRuntime() {
			rpcWidgetCreations += 1;
			return { shutdown() {} };
		},
	});
	const rpcUi = createContext();
	await rpcPi.handlers.get("session_start")(
		{ reason: "startup" },
		{ ...rpcUi.context, mode: "rpc" },
	);
	assert.equal(rpcWidgetCreations, 0);
	await rpcPi.handlers.get("session_shutdown")(
		{ reason: "quit" },
		{ ...rpcUi.context, mode: "rpc" },
	);

	const failingPi = createFakePi();
	const disposals = [];
	let notificationShutdowns = 0;
	const failingManager = {
		generation: "sag1-widget-init-failure",
		captureParentContext() {},
		getSummary() {
			return {
				generation: this.generation,
				closed: false,
				total: 0,
				active: 0,
				historical: 0,
				counts: emptyCounts(),
			};
		},
		async disposeAll(reason) {
			disposals.push(reason);
		},
	};
	registerSubAgentsExtension(failingPi.api, {
		createManager() {
			return failingManager;
		},
		createNotificationRuntime() {
			return {
				shutdown() {
					notificationShutdowns += 1;
				},
			};
		},
		createWidgetRuntime() {
			throw new Error("synthetic widget initialization failure");
		},
	});
	const failingUi = createContext();
	await assert.rejects(
		failingPi.handlers.get("session_start")({ reason: "startup" }, failingUi.context),
		/synthetic widget initialization failure/,
	);
	assert.equal(notificationShutdowns, 1);
	assert.deepEqual(disposals, ["session start: startup: runtime initialization failed"]);
	await failingPi.commands.get("sub-agents").handler("", failingUi.context);
	assert.match(failingUi.notifications.at(-1).message, /inactive/);
});

test("parent mutation interception follows exact tool lifecycle and shuts down before manager disposal", async () => {
	const fakePi = createFakePi();
	const order = [];
	const calls = [];
	let managerIndex = 0;
	registerSubAgentsExtension(fakePi.api, {
		createManager() {
			const index = ++managerIndex;
			return {
				generation: `sag1-parent-mutations-${index}`,
				captureParentContext() {},
				getSummary() {
					return {
						generation: this.generation,
						closed: false,
						total: 0,
						active: 0,
						historical: 0,
						counts: emptyCounts(),
					};
				},
				async disposeAll() {
					order.push(`dispose-${index}`);
				},
			};
		},
		createParentMutationRuntime(manager) {
			const index = Number(manager.generation.split("-").at(-1));
			const owned = new Map();
			return {
				async handleToolCall(event, cwd) {
					calls.push({ phase: "call", index, event, cwd });
					if (event.toolName === "write") {
						return { block: true, reason: "synthetic parent reservation conflict" };
					}
					owned.set(event.toolCallId, event.toolName);
					return undefined;
				},
				handleToolResult(event) {
					calls.push({ phase: "result", index, event });
					owned.delete(event.toolCallId);
				},
				handleToolExecutionEnd(event) {
					calls.push({ phase: "end", index, event });
					owned.delete(event.toolCallId);
				},
				ownsToolCall(event) {
					return owned.get(event.toolCallId) === event.toolName;
				},
				shutdown() {
					order.push(`parent-${index}`);
				},
				async waitForIdle() {},
			};
		},
	});
	const ui = createContext();
	assert.deepEqual(
		await fakePi.handlers.get("tool_call")(
			{ toolName: "edit", toolCallId: "inactive-edit", input: { path: "file.txt" } },
			ui.context,
		),
		{
			block: true,
			reason: "Blocked by sub-agent workspace coordination: the parent session generation is inactive.",
		},
	);

	await fakePi.handlers.get("session_start")({ reason: "startup" }, ui.context);
	assert.equal(await fakePi.handlers.get("tool_call")(
		{ toolName: "read", toolCallId: "read-1", input: { path: "file.txt" } },
		ui.context,
	), undefined);
	assert.equal(calls.length, 0, "non-mutating tools must bypass the reservation runtime");
	const blocked = await fakePi.handlers.get("tool_call")(
		{ toolName: "write", toolCallId: "write-1", input: { path: "file.txt" } },
		ui.context,
	);
	assert.deepEqual(blocked, { block: true, reason: "synthetic parent reservation conflict" });
	await fakePi.handlers.get("tool_execution_end")(
		{ toolName: "write", toolCallId: "write-1" },
		ui.context,
	);
	assert.equal(await fakePi.handlers.get("tool_call")(
		{ toolName: "edit", toolCallId: "edit-1", input: { path: "file.txt" } },
		ui.context,
	), undefined);
	await fakePi.handlers.get("tool_result")({ toolName: "edit", toolCallId: "edit-1" }, ui.context);
	const stillFinalizing = await fakePi.handlers.get("tool_call")(
		{ toolName: "edit", toolCallId: "edit-1", input: { path: "other.txt" } },
		ui.context,
	);
	assert.equal(stillFinalizing?.block, true);
	assert.match(stillFinalizing.reason, /still finalizing an earlier mutation/);
	await fakePi.handlers.get("tool_execution_end")(
		{ toolName: "edit", toolCallId: "edit-1" },
		ui.context,
	);
	assert.deepEqual(calls.map((entry) => entry.phase), ["call", "call", "result", "end"]);
	assert.equal(calls[0].cwd, process.cwd());

	await fakePi.handlers.get("session_compact")({ reason: "manual" }, ui.context);
	assert.deepEqual(order.slice(0, 2), ["parent-1", "dispose-1"]);
	await fakePi.handlers.get("session_shutdown")({ reason: "quit" }, ui.context);
	assert.deepEqual(order.slice(2), ["parent-2", "dispose-2"]);
});

test("stale completion events stay bound to their owning parent mutation generation", async () => {
	const fakePi = createFakePi();
	const runtimes = [];
	let managerIndex = 0;
	registerSubAgentsExtension(fakePi.api, {
		createManager() {
			const index = ++managerIndex;
			return {
				generation: `sag1-parent-owner-${index}`,
				captureParentContext() {},
				getSummary() {
					return {
						generation: this.generation,
						closed: false,
						total: 0,
						active: 0,
						historical: 0,
						counts: emptyCounts(),
					};
				},
				async disposeAll() {},
			};
		},
		createParentMutationRuntime(manager) {
			const active = new Map();
			const waiters = new Set();
			const resolveIdle = () => {
				if (active.size !== 0) return;
				for (const resolvePromise of [...waiters]) resolvePromise();
				waiters.clear();
			};
			const runtime = {
				generation: manager.generation,
				calls: [],
				ends: [],
				async handleToolCall(event) {
					this.calls.push(event.toolCallId);
					active.set(event.toolCallId, event.toolName);
					return undefined;
				},
				handleToolResult(event) {
					active.delete(event.toolCallId);
					resolveIdle();
				},
				handleToolExecutionEnd(event) {
					this.ends.push(event.toolCallId);
					active.delete(event.toolCallId);
					resolveIdle();
				},
				ownsToolCall(event) {
					return active.get(event.toolCallId) === event.toolName;
				},
				shutdown() {},
				waitForIdle() {
					if (active.size === 0) return Promise.resolve();
					return new Promise((resolvePromise) => waiters.add(resolvePromise));
				},
			};
			runtimes.push(runtime);
			return runtime;
		},
	});
	const ui = createContext();
	await fakePi.handlers.get("session_start")({ reason: "startup" }, ui.context);
	assert.equal(await fakePi.handlers.get("tool_call")(
		{ toolName: "edit", toolCallId: "active-during-rotation", input: { path: "file.txt" } },
		ui.context,
	), undefined);
	const pendingRotation = fakePi.handlers.get("session_compact")({ reason: "manual" }, ui.context);
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(runtimes.length, 1, "a replacement generation must wait for the active parent mutation");
	await fakePi.handlers.get("tool_execution_end")(
		{ toolName: "edit", toolCallId: "active-during-rotation" },
		ui.context,
	);
	await pendingRotation;
	assert.equal(runtimes.length, 2);

	assert.equal(await fakePi.handlers.get("tool_call")(
		{ toolName: "edit", toolCallId: "reused-parent-id", input: { path: "file.txt" } },
		ui.context,
	), undefined);
	await fakePi.handlers.get("tool_result")(
		{ toolName: "edit", toolCallId: "reused-parent-id" },
		ui.context,
	);
	await fakePi.handlers.get("session_compact")({ reason: "manual" }, ui.context);
	assert.equal(runtimes.length, 3);

	const duplicate = await fakePi.handlers.get("tool_call")(
		{ toolName: "edit", toolCallId: "reused-parent-id", input: { path: "other.txt" } },
		ui.context,
	);
	assert.equal(duplicate?.block, true);
	assert.match(duplicate.reason, /still finalizing an earlier mutation/);
	assert.equal(runtimes[2].calls.length, 0);
	await fakePi.handlers.get("tool_execution_end")(
		{ toolName: "edit", toolCallId: "reused-parent-id" },
		ui.context,
	);
	assert.deepEqual(runtimes[1].ends, ["reused-parent-id"]);
	assert.deepEqual(runtimes[2].ends, []);
	assert.equal(await fakePi.handlers.get("tool_call")(
		{ toolName: "edit", toolCallId: "reused-parent-id", input: { path: "other.txt" } },
		ui.context,
	), undefined);
	assert.deepEqual(runtimes[2].calls, ["reused-parent-id"]);
	await fakePi.handlers.get("tool_execution_end")(
		{ toolName: "edit", toolCallId: "reused-parent-id" },
		ui.context,
	);
	await fakePi.handlers.get("session_shutdown")({ reason: "quit" }, ui.context);
});

test("lifecycle replacement checkpoints disposed history before shutting down persistence", async () => {
	const fakePi = createFakePi();
	const order = [];
	let managerIndex = 0;
	registerSubAgentsExtension(fakePi.api, {
		createManager() {
			const index = ++managerIndex;
			return {
				generation: `sag1-persistence-lifecycle-${index}`,
				closed: false,
				captureParentContext() {},
				getSummary() {
					return {
						generation: this.generation,
						closed: this.closed,
						total: 0,
						active: 0,
						historical: 0,
						counts: emptyCounts(),
					};
				},
				async disposeAll() {
					this.closed = true;
					order.push(`dispose-${index}`);
				},
			};
		},
		createPersistenceRuntime(manager, appendEntry) {
			const index = Number(manager.generation.split("-").at(-1));
			return {
				checkpointAll() {
					assert.equal(manager.closed, true, "bulk history must observe post-cleanup records");
					order.push(`checkpoint-${index}`);
					appendEntry("sub-agents-state-v1", { generation: manager.generation });
					return { appended: 1, duplicates: 0, ignored: 0, failed: 0 };
				},
				shutdown() {
					order.push(`persistence-${index}`);
				},
			};
		},
	});
	const ui = createContext();
	await fakePi.handlers.get("session_start")({ reason: "startup" }, ui.context);
	await fakePi.handlers.get("session_compact")({ reason: "manual" }, ui.context);
	assert.deepEqual(order.slice(0, 3), ["dispose-1", "checkpoint-1", "persistence-1"]);
	assert.deepEqual(fakePi.entries[0], {
		customType: "sub-agents-state-v1",
		data: { generation: "sag1-persistence-lifecycle-1" },
	});

	await fakePi.handlers.get("session_tree")({}, ui.context);
	assert.deepEqual(order.slice(3), ["persistence-2", "dispose-2"]);
	assert.equal(
		fakePi.entries.length,
		1,
		"post-navigation cleanup must not append the abandoned generation onto the selected branch",
	);

	await fakePi.handlers.get("session_shutdown")({ reason: "quit" }, ui.context);
	assert.deepEqual(order.slice(5), ["dispose-3", "checkpoint-3", "persistence-3"]);
	assert.equal(fakePi.entries.length, 2);
});

test("history restoration reads the active branch lazily after cleanup checkpoints and after tree selection", async () => {
	const fakePi = createFakePi();
	const order = [];
	const restoredBranches = [];
	let activeBranch = [{ type: "custom", customType: "fixture", data: { branch: "startup" } }];
	let managerIndex = 0;
	registerSubAgentsExtension(fakePi.api, {
		createManager() {
			const index = ++managerIndex;
			return {
				generation: `sag1-restoration-order-${index}`,
				closed: false,
				captureParentContext() {},
				getSummary() {
					return {
						generation: this.generation,
						closed: this.closed,
						total: 0,
						active: 0,
						historical: 0,
						counts: emptyCounts(),
					};
				},
				async disposeAll() {
					this.closed = true;
					order.push(`dispose-${index}`);
				},
			};
		},
		restoreManagerHistory(manager, getActiveBranch) {
			order.push(`restore-${managerIndex}`);
			restoredBranches.push(getActiveBranch().map((entry) => entry.data?.branch));
		},
		createPersistenceRuntime(manager) {
			const index = Number(manager.generation.split("-").at(-1));
			return {
				checkpointAll() {
					order.push(`checkpoint-${index}`);
					activeBranch.push({
						type: "custom",
						customType: "fixture",
						data: { branch: `cleanup-${index}` },
					});
					return { appended: 1, duplicates: 0, ignored: 0, failed: 0 };
				},
				shutdown() {
					order.push(`persistence-${index}`);
				},
			};
		},
	});
	const ui = createContext();
	const context = {
		...ui.context,
		sessionManager: {
			getBranch() {
				return activeBranch;
			},
		},
	};

	await fakePi.handlers.get("session_start")({ reason: "startup" }, context);
	assert.deepEqual(restoredBranches, [["startup"]]);
	await fakePi.handlers.get("session_compact")({ reason: "manual" }, context);
	assert.deepEqual(restoredBranches[1], ["startup", "cleanup-1"]);
	assert.deepEqual(order.slice(1, 5), ["dispose-1", "checkpoint-1", "persistence-1", "restore-2"]);

	activeBranch = [{ type: "custom", customType: "fixture", data: { branch: "selected-tree" } }];
	await fakePi.handlers.get("session_tree")({}, context);
	assert.deepEqual(restoredBranches[2], ["selected-tree"]);
	assert.deepEqual(order.slice(5, 8), ["persistence-2", "dispose-2", "restore-3"]);
	await fakePi.handlers.get("session_shutdown")({ reason: "quit" }, context);
});

test("active dashboard generations shut down before their managers are disposed", async () => {
	const fakePi = createFakePi();
	const order = [];
	let managerIndex = 0;
	registerSubAgentsExtension(fakePi.api, {
		createManager() {
			const index = ++managerIndex;
			return {
				generation: `sag1-dashboard-lifecycle-${index}`,
				captureParentContext() {},
				getSummary() {
					return {
						generation: this.generation,
						closed: false,
						total: 0,
						active: 0,
						historical: 0,
						counts: emptyCounts(),
					};
				},
				async disposeAll() {
					order.push(`dispose-${index}`);
				},
			};
		},
		createDashboardRuntime(manager) {
			const index = Number(manager.generation.split("-").at(-1));
			let closed = false;
			return {
				manager: {},
				sendRuntime: {},
				get closed() { return closed; },
				registerActiveDialog() { return () => undefined; },
				shutdown() {
					if (closed) return;
					closed = true;
					order.push(`dashboard-${index}`);
				},
			};
		},
	});
	const ui = createContext();
	await fakePi.handlers.get("session_start")({ reason: "startup" }, ui.context);
	await fakePi.handlers.get("session_compact")({ reason: "manual" }, ui.context);
	assert.deepEqual(order.slice(0, 2), ["dashboard-1", "dispose-1"]);
	await fakePi.handlers.get("session_shutdown")({ reason: "quit" }, ui.context);
	assert.deepEqual(order.slice(2), ["dashboard-2", "dispose-2"]);
});
