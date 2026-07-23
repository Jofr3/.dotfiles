import assert from "node:assert/strict";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const { SubAgentManager, createSessionGeneration } = await importSubAgentsModule("manager.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");
const {
	SubAgentDashboardComponent,
	createSubAgentDashboardRuntime,
	runSubAgentsDashboardCommand,
} = await importSubAgentsModule("ui/dashboard.ts");

const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/gu;
const FORBIDDEN_CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/u;

function deterministicManager(label = "dashboard") {
	let nonce = 0;
	let now = 1_000;
	return new SubAgentManager({
		cwd: process.cwd(),
		generation: createSessionGeneration(label),
		nonce: () => `nonce-${++nonce}`,
		now: () => ++now,
		cleanupTimeoutMs: 100,
	});
}

function agentSpec(name, tags = []) {
	return {
		name,
		role: `Role for ${name}`,
		objective: `PRIVATE_OBJECTIVE_${name}`,
		tags,
	};
}

function plainTheme() {
	return {
		fg(_color, text) {
			return text;
		},
		bold(text) {
			return text;
		},
	};
}

function keybindings() {
	const values = {
		"tui.select.up": "up",
		"tui.select.down": "down",
		"tui.select.pageUp": "pageUp",
		"tui.select.pageDown": "pageDown",
		"tui.select.confirm": "enter",
		"tui.select.cancel": "escape",
		"tui.editor.cursorLeft": "left",
	};
	return {
		matches(data, id) {
			return values[id] === data;
		},
	};
}

function assertWidthSafe(component) {
	for (const width of [1, 7, 19, 48, 96, 200]) {
		for (const line of component.render(width)) {
			const visible = line.replace(ANSI, "");
			assert.ok([...visible].length <= width, `line exceeds width ${width}: ${JSON.stringify(line)}`);
			assert.doesNotMatch(visible, FORBIDDEN_CONTROLS);
		}
		component.invalidate();
	}
}

function counters(overrides = {}) {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: 0,
		...overrides,
	};
}

function detailedFixture(id = "sa1-dashboard-fixture") {
	const events = Array.from({ length: 20 }, (_, index) => ({
		sequence: index + 1,
		kind: index % 2 ? "runtime" : "assignment",
		state: "idle",
		summary: `event-${index}\u0007`,
		timestamp: index + 1,
	}));
	return {
		id,
		generation: "sag1-dashboard-fixture",
		spec: {
			name: "detail\u001b[31m-worker",
			role: "Inspect dashboard detail boundaries",
			objective: "PRIVATE_DETAIL_OBJECTIVE",
			tags: ["ui", "review"],
			workspace: { mode: "shared", cwd: "packages/worker" },
		},
		state: "idle",
		createdAt: 1,
		updatedAt: 20,
		assignmentCount: 2,
		currentAssignment: {
			id: `${id}:assignment:2`,
			sequence: 2,
			objective: "PRIVATE_CURRENT_OBJECTIVE",
			state: "idle",
			startedAt: 10,
			endedAt: 20,
			usage: { totals: counters({ totalTokens: 12, cost: 0.02 }), turns: 1 },
		},
		latestReport: {
			state: "result",
			summary: "bounded report",
			details: "bounded report detail",
			files: ["src/report.ts"],
			timestamp: 19,
		},
		latestResult: {
			summary: "bounded result",
			details: "bounded result detail",
			files: ["src/result.ts"],
			completedAt: 20,
		},
		modelRoute: {
			requestedPolicy: "auto",
			requestedComplexity: "moderate",
			selectedModel: { provider: "fixture", id: "gpt-5.6-terra" },
			selectedTier: "moderate",
			fallbackUsed: false,
			fallbackPath: [{ source: "tier", modelId: "gpt-5.6-terra", complexity: "moderate", outcome: "selected" }],
			reason: "fixture route",
		},
		effectiveThinkingLevel: "high",
		lastError: "bounded prior error",
		events,
		omittedEventCount: 3,
		runtime: {
			phase: "settled",
			activeToolCount: 0,
			activeTools: [],
			pendingMessageCount: 0,
		},
		usage: {
			totals: counters({ input: 10, output: 8, totalTokens: 18, cost: 0.04 }),
			reported: counters({ totalTokens: 5, cost: 0.01 }),
			turns: 2,
			assignments: 2,
		},
		leases: Array.from({ length: 15 }, (_, index) => ({
			kind: "file",
			workspaceKey: "shared",
			ownerAgentId: id,
			path: `src/file-${index}.ts`,
			acquiredAt: index + 1,
		})),
	};
}

function dashboardSnapshot(rows, overrides = {}) {
	const removed = rows.filter((row) => row.state === "removed").length;
	return {
		generation: "sag1-dashboard-fixture",
		closed: false,
		active: rows.length - removed,
		historical: removed,
		counts: {
			creating: rows.filter((row) => row.state === "creating").length,
			running: rows.filter((row) => row.state === "running").length,
			idle: rows.filter((row) => row.state === "idle").length,
			blocked: rows.filter((row) => row.state === "blocked").length,
			failed: rows.filter((row) => row.state === "failed").length,
			stopping: rows.filter((row) => row.state === "stopping").length,
			removed,
		},
		usage: counters({ totalTokens: 18, cost: 0.04 }),
		usageClamped: false,
		includeRemoved: true,
		rows,
		omittedRowCount: 0,
		...overrides,
	};
}

test("manager dashboard snapshots stay lightweight, bounded, prioritized, and defensive", async () => {
	const manager = deterministicManager("dashboard-overview");
	const children = [];
	for (let index = 0; index < SUB_AGENT_BOUNDS.dashboardAgents + 5; index += 1) {
		const child = manager.createAgent(agentSpec(`worker-${index}`, [`tag-${index}`]));
		children.push(child);
	}
	await manager.startAssignment(children[0].id);
	await manager.completeAssignment(children[0].id, { state: "blocked", summary: "blocked", needs: "operator" });
	await manager.startAssignment(children[1].id);
	await manager.failAgent(children[1].id, "failed");
	await manager.startAssignment(children[2].id);
	await manager.addUsage(children[2].id, { input: 5, output: 3, totalTokens: 8, cost: 0.1, turns: 1 });
	await manager.removeAgent(children.at(-1).id, "history");

	const snapshot = manager.getDashboardSnapshot();
	assert.equal(snapshot.rows.length, SUB_AGENT_BOUNDS.dashboardAgents);
	assert.equal(snapshot.omittedRowCount, 5);
	assert.deepEqual(snapshot.rows.slice(0, 3).map((row) => row.state), ["blocked", "failed", "running"]);
	assert.equal(snapshot.usage.totalTokens, 8);
	assert.equal(snapshot.usage.cost, 0.1);
	assert.equal(snapshot.historical, 1);
	assert.equal("events" in snapshot.rows[0], false);
	snapshot.rows[0].tags.push("mutated");
	assert.doesNotMatch(manager.getDashboardSnapshot().rows[0].tags.join(","), /mutated/);

	const liveOnly = manager.getDashboardSnapshot(SUB_AGENT_BOUNDS.dashboardAgents, false);
	assert.equal(liveOnly.includeRemoved, false);
	assert.ok(liveOnly.rows.every((row) => row.state !== "removed"));
	await manager.disposeAll("dashboard snapshot cleanup");
});

test("dashboard list/detail rendering is bounded, width-safe, actionable, and event-storm coalesced", () => {
	const detail = detailedFixture();
	let listener;
	let dashboardReads = 0;
	let includeRemoved = true;
	const rows = [
		{
			id: detail.id,
			name: detail.spec.name,
			state: "idle",
			updatedAt: 20,
			assignmentCount: 2,
			phase: "settled",
			pendingMessageCount: 0,
			resultReady: true,
			tags: ["ui"],
		},
		{
			id: "sa1-dashboard-removed",
			name: "removed-worker",
			state: "removed",
			updatedAt: 10,
			assignmentCount: 1,
			phase: "settled",
			pendingMessageCount: 0,
			resultReady: false,
			tags: [],
		},
	];
	const manager = {
		generation: detail.generation,
		getDashboardSnapshot(_maxRows, nextIncludeRemoved) {
			dashboardReads += 1;
			includeRemoved = nextIncludeRemoved;
			return dashboardSnapshot(nextIncludeRemoved ? rows : rows.slice(0, 1), { includeRemoved: nextIncludeRemoved });
		},
		getAgent(id) {
			if (id === detail.id) return structuredClone(detail);
			return { ...structuredClone(detail), id, spec: { ...detail.spec, name: "removed-worker" }, state: "removed" };
		},
		subscribeChanges(next) {
			listener = next;
			return () => {
				if (listener === next) listener = undefined;
			};
		},
	};
	const actions = [];
	let renders = 0;
	const component = new SubAgentDashboardComponent({
		manager,
		tui: { requestRender() { renders += 1; } },
		theme: plainTheme(),
		keybindings: keybindings(),
		onAction(action) { actions.push(action); },
		refreshDelayMs: 1_000,
	});
	assert.equal(dashboardReads, 1);
	const list = component.render(200).join("\n");
	assert.match(list, /Sub-Agents/);
	assert.match(list, /detail-worker/);
	assert.doesNotMatch(list, /PRIVATE_DETAIL_OBJECTIVE|PRIVATE_CURRENT_OBJECTIVE/);
	assertWidthSafe(component);

	component.handleInput("enter");
	assert.equal(component.view, "detail");
	const expanded = component.render(200).join("\n");
	assert.match(expanded, /gpt-5\.6-terra/);
	assert.match(expanded, /bounded report detail/);
	assert.match(expanded, /bounded result detail/);
	assert.match(expanded, /usage: 2 turns/);
	assert.match(expanded, /leases/);
	assert.match(expanded, /more lease/);
	assert.match(expanded, /recent events/);
	assert.match(expanded, /additional detail omitted/);
	assert.match(expanded, /Esc back/);
	assert.ok(component.render(200).length <= 48);
	assert.doesNotMatch(expanded, /PRIVATE_DETAIL_OBJECTIVE|PRIVATE_CURRENT_OBJECTIVE|\u001b\[31m/);
	assertWidthSafe(component);

	component.handleInput("m");
	component.handleInput("l");
	component.handleInput("x");
	component.handleInput("X");
	assert.deepEqual(actions, [
		{ kind: "send", id: detail.id },
		{ kind: "release", id: detail.id },
		{ kind: "remove", id: detail.id },
		{ kind: "remove-all" },
	]);
	component.handleInput("h");
	assert.equal(includeRemoved, false);

	for (let index = 0; index < 1_000; index += 1) listener();
	assert.equal(component.hasScheduledRefresh, true);
	const readsBeforeFlush = dashboardReads;
	assert.equal(component.flushNow(), true);
	assert.equal(dashboardReads, readsBeforeFlush + 1);
	assert.ok(renders > 0);
	component.dispose();
	assert.equal(component.hasScheduledRefresh, false);
	assert.deepEqual(component.render(80), []);
});

test("dashboard runtime shutdown closes an active custom panel at the lifecycle boundary", async () => {
	const manager = {
		generation: "sag1-dashboard-shutdown",
		getSummary() {
			return { generation: this.generation, closed: false, total: 0, active: 0, historical: 0, counts: {} };
		},
		getDashboardSnapshot(_maxRows, includeRemoved) {
			return dashboardSnapshot([], { generation: this.generation, includeRemoved });
		},
		getAgent() { throw new Error("no selected child"); },
		listAgentIds() { return []; },
		async removeAgent() { throw new Error("no selected child"); },
		subscribeChanges() { return () => undefined; },
	};
	const sendRuntime = {
		manager: { generation: manager.generation, getAgent: manager.getAgent },
		runner: { prompt() {}, send() {}, waitForAssignment() {} },
	};
	const runtime = createSubAgentDashboardRuntime({ manager, sendRuntime });
	let panelCreated = false;
	const command = runSubAgentsDashboardCommand({
		mode: "tui",
		hasUI: true,
		ui: {
			custom(factory) {
				return new Promise((resolve) => {
					factory(
						{ requestRender() {} },
						plainTheme(),
						keybindings(),
						resolve,
					);
					panelCreated = true;
				});
			},
			notify() {},
		},
	}, runtime);
	await Promise.resolve();
	assert.equal(panelCreated, true);
	runtime.shutdown();
	await command;
	assert.equal(runtime.closed, true);
});

test("dashboard command sends manual work, confirms selected/all removal, and falls back outside TUI", async () => {
	const detail = detailedFixture("sa1-dashboard-command-one");
	const second = { ...detailedFixture("sa1-dashboard-command-two"), spec: { ...detail.spec, name: "second" } };
	const records = new Map([[detail.id, detail], [second.id, second]]);
	const removed = [];
	const released = [];
	const prompted = [];
	const notifications = [];
	const dialogText = [];
	const manager = {
		generation: detail.generation,
		getSummary() {
			const active = [...records.values()].filter((snapshot) => snapshot.state !== "removed").length;
			return { generation: this.generation, closed: false, total: records.size, active, historical: records.size - active, counts: {} };
		},
		getAgent(id) {
			const snapshot = records.get(id);
			if (!snapshot) throw new Error("unknown");
			return snapshot;
		},
		listAgentIds({ includeRemoved = true } = {}) {
			return [...records.values()]
				.filter((snapshot) => includeRemoved || snapshot.state !== "removed")
				.map((snapshot) => snapshot.id);
		},
		async releaseChildLeasesWithResult(id) {
			const snapshot = this.getAgent(id);
			const prior = [...snapshot.leases];
			const next = { ...snapshot, leases: [] };
			records.set(id, next);
			released.push(id);
			return { snapshot: next, released: prior };
		},
		async removeAgent(id) {
			const snapshot = this.getAgent(id);
			const next = { ...snapshot, state: "removed" };
			records.set(id, next);
			removed.push(id);
			return next;
		},
	};
	const sendRuntime = {
		manager: {
			generation: detail.generation,
			getAgent(id) {
				return manager.getAgent(id);
			},
		},
		runner: {
			async prompt(id, message) {
				prompted.push({ id, message });
				const snapshot = { ...manager.getAgent(id), state: "running", assignmentCount: 3, currentAssignment: { id: `${id}:assignment:3`, sequence: 3 } };
				records.set(id, snapshot);
				return { id, accepted: true, assignmentId: snapshot.currentAssignment.id, snapshot };
			},
			async send() {
				throw new Error("unused active send");
			},
			async waitForAssignment() {},
		},
	};
	const actions = [
		{ kind: "release", id: detail.id },
		{ kind: "send", id: detail.id },
		{ kind: "remove", id: detail.id },
		{ kind: "close" },
	];
	const context = {
		mode: "tui",
		hasUI: true,
		ui: {
			async custom() { return actions.shift(); },
			async editor(title) { dialogText.push(title); return "manual dashboard assignment"; },
			async select(title) { dialogText.push(title); return "Follow up after current work"; },
			async confirm(title, message) { dialogText.push(title, message); return true; },
			notify(message, level) { notifications.push({ message, level }); },
		},
	};
	await runSubAgentsDashboardCommand(context, { manager, sendRuntime });
	assert.deepEqual(released, [detail.id]);
	assert.deepEqual(prompted, [{ id: detail.id, message: "manual dashboard assignment" }]);
	assert.deepEqual(removed, [detail.id]);
	assert.match(notifications.map((entry) => entry.message).join("\n"), /released|message accepted|removed/);
	assert.doesNotMatch(dialogText.join("\n"), /\u001b\[31m/);
	assert.doesNotMatch(dialogText.join("\n"), FORBIDDEN_CONTROLS);

	records.set(detail.id, detail);
	records.set(second.id, second);
	const allActions = [{ kind: "remove-all" }, { kind: "close" }];
	await runSubAgentsDashboardCommand({
		...context,
		ui: {
			...context.ui,
			async custom() { return allActions.shift(); },
		},
	}, { manager, sendRuntime });
	assert.ok(removed.includes(detail.id));
	assert.ok(removed.includes(second.id));

	let customCalled = false;
	const rpcNotifications = [];
	await runSubAgentsDashboardCommand({
		mode: "rpc",
		hasUI: true,
		ui: {
			custom() { customCalled = true; },
			notify(message, level) { rpcNotifications.push({ message, level }); },
		},
	}, { manager, sendRuntime });
	assert.equal(customCalled, false);
	assert.match(rpcNotifications[0].message, /active|historical/);
});
