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
	return {
		handlers,
		commands,
		api: {
			on(name, handler) {
				handlers.set(name, handler);
			},
			registerCommand(name, command) {
				commands.set(name, command);
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

	registerSubAgentsExtension(fakePi.api, { createManager });
	assert.equal(managers.length, 0, "loading the extension must not start session-scoped resources");
	assert.deepEqual(
		[...fakePi.handlers.keys()].sort(),
		["before_agent_start", "session_compact", "session_shutdown", "session_start", "session_tree"],
	);
	assert.ok(fakePi.commands.has("sub-agents"));

	const ui = createContext();
	await fakePi.handlers.get("session_start")({ reason: "startup" }, ui.context);
	assert.equal(managers.length, 1);
	assert.equal(managers[0].cwd, process.cwd());

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
	assert.deepEqual(ui.statusChanges.at(-1), { key: "sub-agents", value: undefined });
	assert.deepEqual(ui.widgetChanges.at(-1), { key: "sub-agents", value: undefined });

	await fakePi.commands.get("sub-agents").handler("", ui.context);
	assert.match(ui.notifications.at(-1).message, /inactive/);
	assert.equal(ui.notifications.at(-1).level, "warning");

	await fakePi.handlers.get("session_start")({ reason: "reload" }, ui.context);
	assert.equal(managers.length, 4);
	assert.match(formatSubAgentsStatus(managers[3].getSummary()), /manager ready/);
});
