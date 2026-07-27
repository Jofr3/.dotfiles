import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const { createSessionGeneration, SubAgentManager } = await importSubAgentsModule("manager.ts");
const { registerSubAgentsExtension } = await importSubAgentsModule("index.ts");
const {
	resolveCanonicalWorkspacePath,
	resolveSharedWorkspace,
} = await importSubAgentsModule("workspace/paths.ts");

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

function createFakePi(getBranch) {
	const handlers = new Map();
	const commands = new Map();
	const tools = new Map();
	const sentMessages = [];
	return {
		handlers,
		commands,
		tools,
		sentMessages,
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
				getBranch().push({ type: "custom", customType, data });
			},
			sendMessage(message, options) {
				sentMessages.push({ message, options });
			},
		},
	};
}

function createContext(getBranch, cwd = process.cwd(), mode = "tui") {
	const statusChanges = [];
	const widgetChanges = [];
	const notifications = [];
	return {
		statusChanges,
		widgetChanges,
		notifications,
		context: {
			cwd,
			mode,
			hasUI: mode === "tui" || mode === "rpc",
			isProjectTrusted() {
				return true;
			},
			sessionManager: {
				getBranch,
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

function branchLabels(branch) {
	return branch.map((entry) => entry.label ?? entry.data?.label ?? entry.customType ?? entry.type);
}

function createLifecycleHarness(initialBranch = [{ type: "fixture", label: "initial" }], options = {}) {
	let branch = initialBranch;
	let managerSequence = 0;
	const managers = [];
	const restorations = [];
	const order = [];
	const fakePi = createFakePi(() => branch);
	const ui = createContext(() => branch, process.cwd(), "tui");

	class FakeManager {
		constructor(cwd) {
			this.generation = `sag1-boundary-${++managerSequence}`;
			this.cwd = cwd;
			this.closed = false;
			this.liveRuntimes = 0;
			this.leaseCount = 0;
			this.disposals = [];
		}

		activate() {
			this.liveRuntimes = 1;
			this.leaseCount = 1;
		}

		captureParentContext() {}

		getSummary() {
			const counts = emptyCounts();
			counts[this.liveRuntimes > 0 ? "running" : this.closed ? "removed" : "idle"] = 1;
			return {
				generation: this.generation,
				closed: this.closed,
				total: 1,
				active: this.liveRuntimes,
				historical: this.closed ? 1 : 0,
				counts,
			};
		}

		async disposeAll(reason) {
			this.disposals.push(reason);
			order.push(`dispose:${this.generation}:${reason}`);
			this.liveRuntimes = 0;
			this.leaseCount = 0;
			this.closed = true;
		}
	}

	registerSubAgentsExtension(fakePi.api, {
		createManager(cwd) {
			const manager = new FakeManager(cwd);
			managers.push(manager);
			order.push(`create:${manager.generation}`);
			return manager;
		},
		restoreManagerHistory(manager, getActiveBranch) {
			const labels = branchLabels(getActiveBranch());
			restorations.push({ generation: manager.generation, labels });
			order.push(`restore:${manager.generation}:${labels.join(",")}`);
		},
		createPersistenceRuntime(manager, appendEntry) {
			order.push(`persistence-create:${manager.generation}`);
			return {
				checkpointAll() {
					order.push(`checkpoint:${manager.generation}`);
					appendEntry("sub-agents-state-v1", {
						version: 1,
						label: `checkpoint-${manager.generation}`,
					});
					if (options.throwAuxiliaryCleanup) throw new Error("synthetic checkpoint failure");
					return { appended: 1, duplicates: 0, ignored: 0, failed: 0 };
				},
				shutdown() {
					order.push(`persistence-stop:${manager.generation}`);
					if (options.throwAuxiliaryCleanup) throw new Error("synthetic persistence shutdown failure");
				},
			};
		},
		createNotificationRuntime(manager) {
			order.push(`notification-create:${manager.generation}`);
			return {
				shutdown() {
					order.push(`notification-stop:${manager.generation}`);
					if (options.throwAuxiliaryCleanup) throw new Error("synthetic notification failure");
				},
			};
		},
		createWidgetRuntime(manager) {
			order.push(`widget-create:${manager.generation}`);
			return {
				shutdown() {
					order.push(`widget-stop:${manager.generation}`);
					if (options.throwAuxiliaryCleanup) throw new Error("synthetic widget failure");
				},
			};
		},
		createDashboardRuntime(manager) {
			order.push(`dashboard-create:${manager.generation}`);
			return {
				manager: {},
				sendRuntime: {},
				registerActiveDialog() {
					return () => undefined;
				},
				shutdown() {
					order.push(`dashboard-stop:${manager.generation}`);
					if (options.throwAuxiliaryCleanup) throw new Error("synthetic dashboard failure");
				},
			};
		},
		createParentMutationRuntime(manager) {
			return {
				async handleToolCall() {
					return undefined;
				},
				handleToolResult() {},
				handleToolExecutionEnd() {},
				ownsToolCall() {
					return false;
				},
				shutdown() {
					order.push(`parent-stop:${manager.generation}`);
					if (options.parentCleanupFailure === "shutdown") {
						throw new Error("synthetic parent shutdown failure");
					}
				},
				async waitForIdle() {
					order.push(`parent-idle:${manager.generation}`);
					if (options.parentCleanupFailure === "wait") {
						throw new Error("synthetic parent settlement failure");
					}
				},
			};
		},
	});

	return {
		fakePi,
		ui,
		managers,
		restorations,
		order,
		get branch() {
			return branch;
		},
		setBranch(next) {
			branch = next;
		},
	};
}

const SESSION_REPLACEMENTS = [
	{ label: "reload", shutdownReason: "reload", startReason: "reload" },
	{ label: "new", shutdownReason: "new", startReason: "new" },
	{ label: "resume/switch", shutdownReason: "resume", startReason: "resume" },
	{ label: "fork", shutdownReason: "fork", startReason: "fork" },
	{ label: "clone", shutdownReason: "fork", startReason: "fork" },
];

for (const boundary of SESSION_REPLACEMENTS) {
	test(`${boundary.label} tears down the old extension instance before a fresh destination generation starts`, async () => {
		const oldBranch = [{ type: "fixture", label: `old-${boundary.label}` }];
		const old = createLifecycleHarness(oldBranch);
		await old.fakePi.handlers.get("session_start")({ reason: "startup" }, old.ui.context);
		old.managers[0].activate();

		await old.fakePi.handlers.get("session_shutdown")(
			{ reason: boundary.shutdownReason, targetSessionFile: "/synthetic/destination.jsonl" },
			old.ui.context,
		);
		assert.equal(old.managers.length, 1, "shutdown must not publish a replacement generation");
		assert.equal(old.managers[0].closed, true);
		assert.equal(old.managers[0].liveRuntimes, 0);
		assert.equal(old.managers[0].leaseCount, 0);
		assert.deepEqual(old.managers[0].disposals, [`session shutdown: ${boundary.shutdownReason}`]);
		assert.equal(oldBranch.at(-1).customType, "sub-agents-state-v1");
		await old.fakePi.commands.get("sub-agents").handler("", old.ui.context);
		assert.match(old.ui.notifications.at(-1).message, /inactive/);

		const destinationBranch = [{ type: "fixture", label: `destination-${boundary.label}` }];
		const destination = createLifecycleHarness(destinationBranch);
		await destination.fakePi.handlers.get("session_start")(
			{
				reason: boundary.startReason,
				previousSessionFile: "/synthetic/source.jsonl",
			},
			destination.ui.context,
		);
		assert.equal(destination.managers.length, 1);
		assert.equal(destination.managers[0].closed, false);
		assert.equal(destination.managers[0].liveRuntimes, 0);
		assert.equal(destination.managers[0].leaseCount, 0);
		assert.deepEqual(destination.restorations[0].labels, [`destination-${boundary.label}`]);
		assert.ok(
			!destination.restorations[0].labels.some((label) => label.startsWith("checkpoint-sag1-boundary")),
			"the destination instance must restore only its own active branch",
		);

		await destination.fakePi.handlers.get("session_shutdown")(
			{ reason: "quit" },
			destination.ui.context,
		);
	});
}

for (const compaction of [
	{ reason: "manual", willRetry: false },
	{ reason: "threshold", willRetry: false },
	{ reason: "overflow", willRetry: true },
]) {
	test(`${compaction.reason} compaction checkpoints cleanup, restores the active branch, and rotates before retry`, async () => {
		const activeBranch = [{ type: "fixture", label: `before-${compaction.reason}` }];
		const harness = createLifecycleHarness(activeBranch);
		await harness.fakePi.handlers.get("session_start")({ reason: "startup" }, harness.ui.context);
		harness.managers[0].activate();
		harness.order.length = 0;

		await harness.fakePi.handlers.get("session_compact")(
			{ reason: compaction.reason, willRetry: compaction.willRetry },
			harness.ui.context,
		);
		assert.equal(harness.managers.length, 2);
		assert.equal(harness.managers[0].closed, true);
		assert.equal(harness.managers[0].liveRuntimes, 0);
		assert.equal(harness.managers[0].leaseCount, 0);
		assert.equal(harness.managers[1].closed, false);
		assert.deepEqual(harness.managers[0].disposals, [`session compact: ${compaction.reason}`]);
		assert.deepEqual(harness.restorations[1].labels, [
			`before-${compaction.reason}`,
			"checkpoint-sag1-boundary-1",
		]);
		const disposeIndex = harness.order.indexOf(`dispose:sag1-boundary-1:session compact: ${compaction.reason}`);
		const checkpointIndex = harness.order.indexOf("checkpoint:sag1-boundary-1");
		const restoreIndex = harness.order.findIndex((entry) => entry.startsWith("restore:sag1-boundary-2:"));
		assert.ok(disposeIndex >= 0 && disposeIndex < checkpointIndex && checkpointIndex < restoreIndex);

		await harness.fakePi.handlers.get("session_shutdown")({ reason: "quit" }, harness.ui.context);
	});
}

test("tree navigation closes abandoned-branch persistence before cleanup and restores only the selected branch", async () => {
	const abandonedBranch = [{ type: "fixture", label: "abandoned" }];
	const selectedBranch = [{ type: "fixture", label: "selected" }];
	const harness = createLifecycleHarness(abandonedBranch);
	await harness.fakePi.handlers.get("session_start")({ reason: "startup" }, harness.ui.context);
	harness.managers[0].activate();
	harness.setBranch(selectedBranch);
	harness.order.length = 0;

	await harness.fakePi.handlers.get("session_tree")(
		{ oldLeafId: "old", newLeafId: "selected" },
		harness.ui.context,
	);
	assert.equal(harness.managers.length, 2);
	assert.equal(harness.managers[0].closed, true);
	assert.equal(harness.managers[0].liveRuntimes, 0);
	assert.equal(harness.managers[0].leaseCount, 0);
	assert.deepEqual(branchLabels(abandonedBranch), ["abandoned"]);
	assert.deepEqual(branchLabels(selectedBranch), ["selected"]);
	assert.deepEqual(harness.restorations[1].labels, ["selected"]);
	assert.ok(!harness.order.includes("checkpoint:sag1-boundary-1"));
	assert.ok(
		harness.order.indexOf("persistence-stop:sag1-boundary-1") <
			harness.order.indexOf("dispose:sag1-boundary-1:session tree navigation"),
	);

	await harness.fakePi.handlers.get("session_shutdown")({ reason: "quit" }, harness.ui.context);
});

test("quit checkpoints the final history, clears UI, and never publishes another live generation", async () => {
	const branch = [{ type: "fixture", label: "quit-branch" }];
	const harness = createLifecycleHarness(branch);
	await harness.fakePi.handlers.get("session_start")({ reason: "startup" }, harness.ui.context);
	harness.managers[0].activate();

	await harness.fakePi.handlers.get("session_shutdown")({ reason: "quit" }, harness.ui.context);
	assert.equal(harness.managers.length, 1);
	assert.equal(harness.managers[0].closed, true);
	assert.equal(harness.managers[0].liveRuntimes, 0);
	assert.equal(harness.managers[0].leaseCount, 0);
	assert.equal(branch.at(-1).customType, "sub-agents-state-v1");
	assert.deepEqual(harness.ui.statusChanges.at(-1), { key: "sub-agents", value: undefined });
	assert.deepEqual(harness.ui.widgetChanges.at(-1), { key: "sub-agents", value: undefined });
});

test("auxiliary cleanup failures are contained while authoritative disposal and replacement still complete", async () => {
	const harness = createLifecycleHarness(
		[{ type: "fixture", label: "partial-cleanup" }],
		{ throwAuxiliaryCleanup: true },
	);
	await harness.fakePi.handlers.get("session_start")({ reason: "startup" }, harness.ui.context);
	harness.managers[0].activate();

	await harness.fakePi.handlers.get("session_compact")(
		{ reason: "manual", willRetry: false },
		harness.ui.context,
	);
	assert.equal(harness.managers.length, 2);
	assert.equal(harness.managers[0].closed, true);
	assert.equal(harness.managers[0].liveRuntimes, 0);
	assert.equal(harness.managers[0].leaseCount, 0);
	assert.equal(harness.managers[1].closed, false);
	for (const expected of [
		"dashboard-stop:sag1-boundary-1",
		"widget-stop:sag1-boundary-1",
		"notification-stop:sag1-boundary-1",
		"checkpoint:sag1-boundary-1",
		"persistence-stop:sag1-boundary-1",
	]) {
		assert.ok(harness.order.includes(expected), `${expected} must be attempted`);
	}

	await harness.fakePi.handlers.get("session_shutdown")({ reason: "quit" }, harness.ui.context);
});

for (const parentCleanupFailure of ["shutdown", "wait"]) {
	test(`a parent mutation ${parentCleanupFailure} failure disposes the old generation and fails closed without replacement`, async () => {
		const harness = createLifecycleHarness(
			[{ type: "fixture", label: `parent-${parentCleanupFailure}-failure` }],
			{ parentCleanupFailure },
		);
		await harness.fakePi.handlers.get("session_start")({ reason: "startup" }, harness.ui.context);
		harness.managers[0].activate();

		const lifecycleOperation = parentCleanupFailure === "shutdown"
			? harness.fakePi.handlers.get("session_compact")(
				{ reason: "manual", willRetry: false },
				harness.ui.context,
			)
			: harness.fakePi.handlers.get("session_shutdown")(
				{ reason: "quit" },
				harness.ui.context,
			);
		await assert.rejects(lifecycleOperation, /session generation remains inactive/);
		assert.equal(harness.managers.length, 1, "an uncertain parent cleanup must not publish a replacement");
		assert.equal(harness.managers[0].closed, true);
		assert.equal(harness.managers[0].liveRuntimes, 0);
		assert.equal(harness.managers[0].leaseCount, 0);
		assert.ok(harness.order.includes("parent-stop:sag1-boundary-1"));
		assert.ok(harness.order.includes("parent-idle:sag1-boundary-1"));
		assert.ok(harness.order.includes("dashboard-stop:sag1-boundary-1"));
		assert.ok(harness.order.includes("checkpoint:sag1-boundary-1"));
		assert.ok(harness.order.includes("persistence-stop:sag1-boundary-1"));
		if (parentCleanupFailure === "wait") {
			assert.deepEqual(harness.ui.statusChanges.at(-1), { key: "sub-agents", value: undefined });
			assert.deepEqual(harness.ui.widgetChanges.at(-1), { key: "sub-agents", value: undefined });
		}
		await harness.fakePi.commands.get("sub-agents").handler("", harness.ui.context);
		assert.match(harness.ui.notifications.at(-1).message, /inactive/);
		await assert.rejects(
			harness.fakePi.handlers.get("session_start")({ reason: "resume" }, harness.ui.context),
			/replacement is blocked/,
		);
		assert.equal(harness.managers.length, 1, "later lifecycle events must not bypass quarantine");
	});
}

test("production manager cleanup failures quarantine the closed generation without publishing replacement", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agents-lifecycle-"));
	let branch = [];
	const managers = [];
	const fakePi = createFakePi(() => branch);
	const ui = createContext(() => branch, root, "json");
	try {
		await writeFile(join(root, "owned.txt"), "owned", "utf8");
		registerSubAgentsExtension(fakePi.api, {
			createManager(cwd) {
				const manager = new SubAgentManager({
					cwd,
					generation: createSessionGeneration(`boundary-production-${managers.length + 1}`),
					cleanupTimeoutMs: 100,
				});
				managers.push(manager);
				return manager;
			},
		});
		await fakePi.handlers.get("session_start")({ reason: "startup" }, ui.context);
		const old = managers[0];
		const child = old.createAgent({
			name: "partial-cleanup-child",
			role: "Exercise lifecycle cleanup",
			objective: "Hold a lease while synthetic runtime cleanup hooks fail.",
			workspace: { mode: "shared" },
		});
		const workspace = await resolveSharedWorkspace(root);
		const target = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			cwd: workspace.cwd,
			path: "owned.txt",
		});
		await old.claimChildFileLeases(child.id, workspace.identity, [target]);
		old.registerRuntimeCleanup(child.id, {
			abort() {
				throw new Error("synthetic abort cleanup failure");
			},
			async waitForIdle() {},
			dispose() {
				throw new Error("synthetic dispose cleanup failure");
			},
		});
		assert.equal(old.getAgent(child.id).leases.length, 1);

		await assert.rejects(
			fakePi.handlers.get("session_compact")(
				{ reason: "overflow", willRetry: true },
				ui.context,
			),
			/session generation remains inactive/,
		);
		assert.equal(managers.length, 1, "uncertain cleanup must not publish a replacement generation");
		assert.equal(old.closed, true);
		const historical = old.getAgent(child.id);
		assert.equal(historical.state, "removed");
		assert.deepEqual(historical.leases, []);
		assert.match(historical.lastError, /synthetic abort cleanup failure/);
		assert.match(historical.lastError, /synthetic dispose cleanup failure/);
		assert.throws(
			() => old.createAgent({
				name: "late-child",
				role: "Must remain inactive",
				objective: "Verify the quarantined generation rejects new work.",
			}),
			/closed/i,
		);
		await assert.rejects(
			fakePi.handlers.get("session_start")({ reason: "resume" }, ui.context),
			/replacement is blocked/,
		);
		assert.equal(managers.length, 1);
	} finally {
		await Promise.allSettled(managers.map((manager) => manager.disposeAll("test cleanup")));
		await rm(root, { recursive: true, force: true });
	}
});
