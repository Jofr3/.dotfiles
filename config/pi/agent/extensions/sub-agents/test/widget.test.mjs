import assert from "node:assert/strict";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const { SubAgentManager, createSessionGeneration } = await importSubAgentsModule("manager.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");
const {
	SUB_AGENTS_WIDGET_KEY,
	SubAgentStatusWidget,
	createSubAgentStatusWidgetRuntime,
} = await importSubAgentsModule("ui/widget.ts");

function deterministicManager(label = "widget") {
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

function agentSpec(name) {
	return {
		name,
		role: "Exercise the bounded status widget",
		objective: "This raw objective must never appear in the persistent widget.",
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

function assertWidthSafe(lines, width) {
	for (const line of lines) {
		const visible = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "");
		assert.ok([...visible].length <= width, `line exceeds width ${width}: ${JSON.stringify(line)}`);
	}
}

test("manager overview aggregates usage and prioritizes a bounded live-child row set", async () => {
	const manager = deterministicManager("overview");
	const children = [];
	for (let index = 0; index < 8; index += 1) {
		const child = manager.createAgent(agentSpec(`worker-${index}`));
		children.push(child);
		await manager.startAssignment(child.id);
		await manager.addUsage(child.id, {
			input: index + 1,
			output: 1,
			totalTokens: index + 2,
			cost: 0.01,
			turns: 1,
		});
	}
	await manager.completeAssignment(children[0].id, {
		state: "blocked",
		summary: "blocked",
		needs: "choose one safe path",
	});
	await manager.failAgent(children[1].id, new Error("private failure details"));
	await manager.updateRuntimeActivity(children[2].id, {
		phase: "tools",
		activeToolCount: 5,
		activeTools: [
			{ toolCallId: "tool-1", toolName: "grep", startedAt: 1, updatedAt: 2 },
			{ toolCallId: "tool-2", toolName: "read", startedAt: 1, updatedAt: 2 },
			{ toolCallId: "tool-3", toolName: "find", startedAt: 1, updatedAt: 2 },
		],
		pendingMessageCount: 0,
	});
	await manager.completeAssignment(children[7].id, { state: "idle", summary: "private result text" });

	const overview = manager.getOverview();
	assert.equal(overview.rows.length, SUB_AGENT_BOUNDS.statusWidgetRows);
	assert.equal(overview.omittedRowCount, 3);
	assert.deepEqual(overview.rows.slice(0, 3).map((row) => row.state), ["blocked", "failed", "running"]);
	assert.equal(overview.rows[0].blocker, "choose one safe path");
	assert.deepEqual(overview.rows[2].activeTools, ["grep", "read", "find"]);
	assert.equal(overview.rows[2].omittedActiveToolCount, 2);
	assert.equal(overview.usage.input, 36);
	assert.equal(overview.usage.output, 8);
	assert.equal(overview.usage.totalTokens, 44);
	assert.equal(overview.usage.cost, 0.08);
	assert.equal(overview.usageClamped, false);

	overview.rows[0].activeTools.push("mutated");
	assert.deepEqual(manager.getOverview().rows[0].activeTools, []);
	await manager.disposeAll("overview test cleanup");
});

test("the widget is bounded, width-safe, and omits raw prompts, results, failures, and streaming output", async () => {
	const manager = deterministicManager("render");
	const blocked = manager.createAgent(agentSpec("blocked\u001b[31m-worker"));
	await manager.startAssignment(blocked.id);
	await manager.completeAssignment(blocked.id, {
		state: "blocked",
		summary: "blocked",
		needs: "lease: src/auth/token.ts\nchoose owner",
	});
	const failed = manager.createAgent(agentSpec("failed-worker"));
	await manager.startAssignment(failed.id);
	await manager.failAgent(failed.id, new Error("PRIVATE_FAILURE_TEXT"));
	const running = manager.createAgent(agentSpec("running-worker"));
	await manager.startAssignment(running.id);
	await manager.updateRuntimeActivity(running.id, {
		phase: "tools",
		streamingPreview: "PRIVATE_STREAMING_OUTPUT",
		activeToolCount: 1,
		activeTools: [{ toolCallId: "tool", toolName: "grep", startedAt: 1, updatedAt: 2 }],
		pendingMessageCount: 0,
	});
	const idle = manager.createAgent(agentSpec("idle-worker"));
	await manager.startAssignment(idle.id);
	await manager.completeAssignment(idle.id, { state: "idle", summary: "PRIVATE_RESULT_TEXT" });
	for (let index = 0; index < 4; index += 1) {
		manager.createAgent(agentSpec(`extra-worker-${index}`));
	}

	const component = new SubAgentStatusWidget(manager.getOverview(), plainTheme());
	for (const width of [120, 60, 36, 18, 8, 1]) {
		component.invalidate();
		const lines = component.render(width);
		assert.ok(lines.length <= SUB_AGENT_BOUNDS.statusWidgetRows + 3);
		assertWidthSafe(lines, width);
	}
	const wide = component.render(120).join("\n");
	assert.match(wide, /sub-agents:/);
	assert.match(wide, /tok/);
	assert.match(wide, /tool grep/);
	assert.match(wide, /lease: src\/auth\/token\.ts choose owner/);
	assert.match(wide, /more live/);
	assert.doesNotMatch(wide, /PRIVATE_FAILURE_TEXT|PRIVATE_STREAMING_OUTPUT|PRIVATE_RESULT_TEXT|raw objective/);
	assert.doesNotMatch(wide, /\u001b\[31m/);
	component.dispose();
	assert.deepEqual(component.render(80), []);
	await manager.disposeAll("render test cleanup");
});

test("theme invalidation rebuilds themed content instead of retaining cached colors", () => {
	let version = "old";
	const theme = {
		fg(_color, text) {
			return `<${version}>${text}`;
		},
		bold(text) {
			return text;
		},
	};
	const snapshot = {
		generation: "sag1-theme",
		closed: false,
		active: 1,
		historical: 0,
		counts: { creating: 0, running: 1, idle: 0, blocked: 0, failed: 0, stopping: 0, removed: 0 },
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 },
		usageClamped: false,
		rows: [{
			id: "sa1-theme-child",
			name: "theme-worker",
			state: "running",
			updatedAt: 1,
			phase: "streaming",
			activeToolCount: 0,
			activeTools: [],
			omittedActiveToolCount: 0,
			pendingMessageCount: 0,
			resultReady: false,
		}],
		omittedRowCount: 0,
	};
	const component = new SubAgentStatusWidget(snapshot, theme);
	const oldRender = component.render(200).join("\n");
	assert.match(oldRender, /<old>/);
	version = "new";
	assert.equal(component.render(200).join("\n"), oldRender, "same-width render should use its cache");
	component.invalidate();
	const newRender = component.render(200).join("\n");
	assert.match(newRender, /<new>/);
	assert.doesNotMatch(newRender, /<old>/);
});

test("event storms coalesce one uncapped-pool scan and a delayed widget factory binds the latest overview", () => {
	let listener;
	let overviewReads = 0;
	const factories = [];
	const base = {
		generation: "sag1-coalesced-widget",
		closed: false,
		historical: 0,
		counts: { creating: 0, running: 0, idle: 0, blocked: 0, failed: 0, stopping: 0, removed: 0 },
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 },
		usageClamped: false,
		rows: [],
		omittedRowCount: 0,
	};
	let current = { ...base, active: 0 };
	const manager = {
		generation: base.generation,
		getOverview() {
			overviewReads += 1;
			return current;
		},
		subscribeChanges(next) {
			listener = next;
			return () => {
				if (listener === next) listener = undefined;
			};
		},
	};
	const host = {
		setWidget(_key, content) {
			if (typeof content === "function") factories.push(content);
		},
	};
	const runtime = createSubAgentStatusWidgetRuntime({ manager, host, refreshDelayMs: 1_000 });
	assert.equal(overviewReads, 1);
	current = {
		...base,
		active: 1,
		counts: { ...base.counts, running: 1 },
		rows: [{
			id: "sa1-coalesced-child",
			name: "coalesced-worker",
			state: "running",
			updatedAt: 1,
			phase: "streaming",
			activeToolCount: 0,
			activeTools: [],
			omittedActiveToolCount: 0,
			pendingMessageCount: 0,
			resultReady: false,
		}],
	};
	for (let index = 0; index < 1_000; index += 1) listener();
	assert.equal(runtime.hasScheduledRefresh, true);
	assert.equal(overviewReads, 1, "the event burst must not synchronously rescan the live pool");
	assert.equal(runtime.flushNow(), true);
	assert.equal(overviewReads, 2);
	assert.equal(factories.length, 1);

	current = {
		...current,
		rows: [{
			...current.rows[0],
			updatedAt: 2,
			phase: "tools",
			activeToolCount: 1,
			activeTools: ["read"],
		}],
	};
	for (let index = 0; index < 1_000; index += 1) listener();
	assert.equal(runtime.flushNow(), true);
	assert.equal(overviewReads, 3);
	const delayedComponent = factories[0]({ requestRender() {} }, plainTheme());
	const rendered = delayedComponent.render(100).join("\n");
	assert.match(rendered, /tool read/);
	assert.doesNotMatch(rendered, /streaming/);
	runtime.shutdown();
	assert.equal(runtime.hasScheduledRefresh, false);
});

test("the runtime installs on first live child, refreshes from manager changes, clears at zero live children, and shuts down", async () => {
	const manager = deterministicManager("runtime-widget");
	const widgetChanges = [];
	let requestRenders = 0;
	let component;
	const host = {
		setWidget(key, content, options) {
			widgetChanges.push({ key, content, options });
			if (typeof content === "function") {
				component = content({ requestRender() { requestRenders += 1; } }, plainTheme());
			} else {
				component?.dispose?.();
				component = undefined;
			}
		},
	};
	const runtime = createSubAgentStatusWidgetRuntime({ manager, host, refreshDelayMs: 1_000 });
	assert.equal(runtime.visible, false);
	assert.equal(widgetChanges.length, 0, "an empty generation should not reserve widget space");

	const child = manager.createAgent(agentSpec("runtime-worker"));
	assert.equal(runtime.hasScheduledRefresh, true);
	assert.equal(runtime.flushNow(), true);
	assert.equal(runtime.visible, true);
	assert.equal(widgetChanges.length, 1);
	assert.equal(widgetChanges[0].key, SUB_AGENTS_WIDGET_KEY);
	assert.deepEqual(widgetChanges[0].options, { placement: "aboveEditor" });
	assert.ok(component);

	await manager.startAssignment(child.id);
	assert.equal(runtime.flushNow(), true);
	const rendersAfterStart = requestRenders;
	await manager.updateRuntimeActivity(child.id, {
		phase: "streaming",
		streamingPreview: "token-only preview must not repaint the persistent widget",
		activeToolCount: 0,
		activeTools: [],
		pendingMessageCount: 0,
	});
	assert.equal(requestRenders, rendersAfterStart);
	await manager.addUsage(child.id, { totalTokens: 9, turns: 1 });
	await manager.updateRuntimeActivity(child.id, {
		phase: "tools",
		activeToolCount: 1,
		activeTools: [{ toolCallId: "tool", toolName: "read", startedAt: 1, updatedAt: 2 }],
		pendingMessageCount: 0,
	});
	assert.equal(runtime.flushNow(), true, "usage and tool changes should share one refresh");
	assert.ok(requestRenders >= 2);
	assert.match(component.render(100).join("\n"), /tool read/);
	assert.match(component.render(100).join("\n"), /9 tok/);

	await manager.removeAgent(child.id, "widget zero-live cleanup");
	assert.equal(runtime.flushNow(), true);
	assert.equal(runtime.visible, false);
	assert.equal(widgetChanges.at(-1).content, undefined);
	const changesAfterRemoval = widgetChanges.length;
	runtime.shutdown();
	runtime.shutdown();
	assert.equal(runtime.closed, true);
	manager.createAgent(agentSpec("late-worker"));
	assert.equal(widgetChanges.length, changesAfterRemoval);
	await manager.disposeAll("runtime widget test cleanup");
});
