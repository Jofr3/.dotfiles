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
	return {
		handlers,
		commands,
		tools,
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
				if (!this.closed) this.disposals.push(reason);
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
	});
	assert.equal(managers.length, 0, "loading the extension must not start session-scoped resources");
	assert.deepEqual(
		[...fakePi.handlers.keys()].sort(),
		["before_agent_start", "session_compact", "session_shutdown", "session_start", "session_tree"],
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

	await fakePi.handlers.get("session_shutdown")({ reason: "reload" }, ui.context);
	assert.equal(managers.length, 3, "shutdown must not create a replacement generation");
	assert.deepEqual(managers[2].disposals, ["session shutdown: reload"]);
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
