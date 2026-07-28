import assert from "node:assert/strict";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	SubAgentManager,
	createSessionGeneration,
} = await importSubAgentsModule("manager.ts");
const {
	SubAgentsStatusError,
	createSubAgentsStatusTool,
} = await importSubAgentsModule("tools/status.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");

function deterministicManager(label) {
	let nonce = 0;
	let now = 100_000;
	return new SubAgentManager({
		cwd: process.cwd(),
		generation: createSessionGeneration(label),
		nonce: () => `${label}-${++nonce}`,
		now: () => ++now,
		cleanupTimeoutMs: 100,
	});
}

function spec(name) {
	return {
		name,
		role: `Inspect bounded status for ${name}`,
		objective: `Complete the ${name} status fixture.`,
		modelPolicy: "auto",
		complexity: "moderate",
		thinkingLevel: "high",
		tags: ["status", "offline"],
	};
}

function route() {
	return {
		requestedPolicy: "auto",
		requestedComplexity: "moderate",
		selectedModel: { provider: "fixture-provider", id: "gpt-5.6-terra" },
		selectedTier: "moderate",
		fallbackUsed: false,
		fallbackPath: [
			{
				source: "tier",
				modelId: "gpt-5.6-terra",
				complexity: "moderate",
				outcome: "selected",
			},
		],
		reason: "Selected the deterministic moderate fixture route.",
	};
}

function complexRoute() {
	return {
		requestedPolicy: "auto",
		requestedComplexity: "complex",
		selectedModel: { provider: "fixture-provider", id: "gpt-5.6-sol" },
		selectedTier: "complex",
		fallbackUsed: false,
		fallbackPath: [
			{
				source: "tier",
				modelId: "gpt-5.6-sol",
				complexity: "complex",
				outcome: "selected",
			},
		],
		reason: "Selected the deterministic complex fixture route.",
	};
}

function fakeTheme() {
	return {
		fg(_color, text) {
			return text;
		},
		bold(text) {
			return text;
		},
	};
}

function renderContext(args, lastComponent) {
	return {
		args,
		lastComponent,
		state: {},
		invalidate() {},
		toolCallId: "status-render",
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: true,
		showImages: false,
		isError: false,
	};
}

test("sub_agents_status observes live/removed selections with bounded compact and timeline metadata", async () => {
	const manager = deterministicManager("status-selection");
	const live = manager.createAgent(spec("live-child"));
	await manager.recordModelRoute(live.id, route());
	await manager.recordEffectiveThinkingLevel(live.id, "high");
	const running = await manager.startAssignment(live.id);
	await manager.queueModelReconfiguration(live.id, {
		afterAssignmentId: running.currentAssignment.id,
		route: complexRoute(),
		requestedThinkingLevel: "xhigh",
	});
	await manager.updateRuntimeActivity(live.id, {
		phase: "tools",
		streamingPreview: "Inspecting the current bounded status fixture.",
		activeToolCount: 1,
		activeTools: [
			{
				toolCallId: "tool-call-1",
				toolName: "grep",
				startedAt: 100_100,
				updatedAt: 100_101,
			},
		],
		pendingMessageCount: 2,
	});
	await manager.recordReport(live.id, {
		state: "progress",
		summary: "Status fixture evidence collected",
		files: ["src/a.ts"],
	});
	await manager.addUsage(live.id, {
		input: 11,
		output: 7,
		cacheRead: 3,
		totalTokens: 21,
		cost: 0.125,
		turns: 1,
	});

	const historical = manager.createAgent(spec("removed-child"));
	await manager.startAssignment(historical.id);
	await manager.completeAssignment(historical.id, {
		state: "idle",
		summary: "Historical fixture complete",
	});
	await manager.removeAgent(historical.id, "status fixture cleanup");

	const runtime = { manager, now: () => 101_000 };
	const tool = createSubAgentsStatusTool(() => runtime);
	try {
		const compact = await tool.execute(
			"status-compact",
			{},
			undefined,
			undefined,
			{},
		);
		assert.equal(compact.details.selection, "all");
		assert.equal(compact.details.succeeded, 1);
		assert.equal(compact.details.failed, 0);
		assert.equal(compact.details.outcomes[0].id, live.id);
		assert.equal(compact.details.outcomes[0].state, "running");
		assert.equal(compact.details.outcomes[0].model.id, "gpt-5.6-terra");
		assert.equal(compact.details.outcomes[0].requested.effectiveThinkingLevel, "high");
		assert.equal(compact.details.outcomes[0].pendingModel.id, "gpt-5.6-sol");
		assert.equal(compact.details.outcomes[0].pendingModel.afterAssignmentSequence, 1);
		assert.equal(compact.details.outcomes[0].pendingModel.requestedThinkingLevel, "xhigh");
		assert.equal(compact.details.outcomes[0].runtime.activeTools[0].name, "grep");
		assert.equal(compact.details.outcomes[0].runtime.pendingMessageCount, 2);
		assert.equal(compact.details.outcomes[0].report.summary, "Status fixture evidence collected");
		assert.equal(compact.details.outcomes[0].usage.unreported, true);
		assert.equal(compact.usage, undefined, "observational status must not attach nested usage");
		assert.equal(manager.getAgent(live.id).usage.reported.input, 0);

		const unknown = `${live.id.slice(0, live.id.lastIndexOf("-") + 1)}missing`;
		const stale = "sa1-another-generation-1-missing";
		const selected = await tool.execute(
			"status-selected",
			{
				ids: [live.id, historical.id, unknown, stale],
				detail: "timeline",
				eventLimit: 2,
			},
			undefined,
			undefined,
			{},
		);
		assert.equal(selected.details.succeeded, 1);
		assert.equal(selected.details.failed, 3);
		assert.deepEqual(
			selected.details.outcomes.slice(1).map((outcome) => outcome.code),
			["removed_excluded", "unknown_agent", "stale_agent"],
		);
		assert.ok(selected.details.outcomes[0].events.length <= 2);
		assert.ok(selected.details.outcomes[0].omittedEventCount > 0);

		const withRemoved = await tool.execute(
			"status-removed",
			{ ids: [historical.id], includeRemoved: true },
			undefined,
			undefined,
			{},
		);
		assert.equal(withRemoved.details.outcomes[0].state, "removed");
		assert.equal(withRemoved.details.outcomes[0].result.summary, "Historical fixture complete");

		assert.equal(tool.executionMode, "parallel");
		assert.ok(tool.promptGuidelines.some((line) => /drainUsage/.test(line)));
		const callComponent = tool.renderCall(
			{ ids: [live.id], detail: "timeline", drainUsage: true },
			fakeTheme(),
			renderContext({ ids: [live.id], detail: "timeline", drainUsage: true }),
		);
		assert.match(callComponent.render(200).join("\n"), /1 selected · timeline · drain usage/);
		const resultComponent = tool.renderResult(
			selected,
			{ expanded: true, isPartial: false },
			fakeTheme(),
			renderContext({ ids: [live.id], detail: "timeline" }),
		);
		assert.match(resultComponent.render(300).join("\n"), /live-child/);
	} finally {
		await manager.disposeAll("status selection test complete");
	}
});

test("explicit concurrent status drains advance each child watermark once and attach Pi usage", async () => {
	const manager = deterministicManager("status-drain");
	const child = manager.createAgent(spec("usage-child"));
	await manager.startAssignment(child.id);
	await manager.addUsage(child.id, {
		input: 17,
		output: 9,
		cacheRead: 4,
		cacheWrite: 2,
		totalTokens: 32,
		cost: 0.75,
		turns: 2,
	});
	const tool = createSubAgentsStatusTool(() => ({ manager, now: () => 101_000 }));
	try {
		const observed = await tool.execute(
			"observe",
			{ ids: [child.id] },
			undefined,
			undefined,
			{},
		);
		assert.equal(observed.details.outcomes[0].usage.unreported, true);
		assert.equal(manager.getAgent(child.id).usage.reported.totalTokens, 0);

		const drains = await Promise.all([
			tool.execute("drain-a", { ids: [child.id], drainUsage: true }, undefined, undefined, {}),
			tool.execute("drain-b", { ids: [child.id], drainUsage: true }, undefined, undefined, {}),
		]);
		assert.equal(drains.reduce((sum, result) => sum + result.usage.input, 0), 17);
		assert.equal(drains.reduce((sum, result) => sum + result.usage.output, 0), 9);
		assert.equal(drains.reduce((sum, result) => sum + result.usage.totalTokens, 0), 32);
		assert.equal(drains.reduce((sum, result) => sum + result.usage.cost.total, 0), 0.75);
		assert.equal(
			drains.reduce((sum, result) => sum + result.details.usageDrained.cacheRead, 0),
			4,
		);
		assert.equal(manager.getAgent(child.id).usage.reported.totalTokens, 32);
		assert.equal(drains.every((result) => result.details.outcomes[0].usage.unreported === false), true);
	} finally {
		await manager.disposeAll("status drain test complete");
	}
});

function largeSnapshot(index) {
	const id = `sa1-output-${index.toString().padStart(3, "0")}-${"x".repeat(170)}`;
	const events = Array.from({ length: SUB_AGENT_BOUNDS.eventTimeline }, (_, eventIndex) => ({
		sequence: eventIndex + 1,
		kind: "runtime",
		state: "running",
		summary: `${"timeline-status-summary ".repeat(30)}${eventIndex}`,
		timestamp: 1_000 + eventIndex,
	}));
	return {
		id,
		generation: "sag1-output-bounds",
		spec: {
			name: `${"😀".repeat(30)}-${index}`,
			role: "r".repeat(1_000),
			objective: "o".repeat(12_000),
			modelPolicy: "auto",
			complexity: "complex",
			thinkingLevel: "xhigh",
			tags: Array.from({ length: 20 }, (_, tag) => `tag-${tag}-${"t".repeat(70)}`),
		},
		state: "running",
		createdAt: 1,
		updatedAt: 2,
		assignmentCount: 1,
		currentAssignment: {
			id: `${id}:assignment:1`,
			sequence: 1,
			objective: "assignment ".repeat(1_000),
			state: "running",
			startedAt: 1,
			usage: {
				totals: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: 0.01 },
				turns: 1,
			},
		},
		latestReport: {
			state: "progress",
			summary: "report ".repeat(400),
			files: Array.from({ length: 100 }, (_, file) => `src/${"f".repeat(100)}-${file}.ts`),
			timestamp: 2,
		},
		modelRoute: route(),
		events,
		omittedEventCount: 5_000,
		runtime: {
			phase: "tools",
			streamingPreview: "preview ".repeat(500),
			activeToolCount: 32,
			activeTools: Array.from({ length: 32 }, (_, tool) => ({
				toolCallId: `tool-${tool}-${"i".repeat(100)}`,
				toolName: `tool-${tool}-${"n".repeat(100)}`,
				startedAt: 1,
				updatedAt: 2,
			})),
			pendingMessageCount: 100,
		},
		usage: {
			totals: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: 0.01 },
			reported: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 },
			turns: 1,
			assignments: 1,
		},
		leases: [],
	};
}

test("sub_agents_status exposes successful worktree workspace summaries without private paths", async () => {
	const workspaceId = `saw1-${"z".repeat(32)}`;
	const privateRoot = "/private/state/worktrees/hidden";
	const snapshot = {
		...largeSnapshot(1),
		id: "sa1-status-worktree-summary",
		spec: {
			...largeSnapshot(1).spec,
			name: "status-worktree-summary",
			workspace: { mode: "worktree" },
		},
		workspace: {
			mode: "worktree",
			workspaceId,
			branchRef: `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`,
			baseCommit: "e".repeat(40),
			disposition: "active",
		},
	};
	const manager = {
		generation: "sag1-status-worktree-summary",
		listAgents() { return [snapshot]; },
		getAgent() { return snapshot; },
		async drainUsage() { throw new Error("unused"); },
	};
	const tool = createSubAgentsStatusTool(() => ({ manager, now: () => 10_000 }));
	const result = await tool.execute("status-worktree-summary", {}, undefined, undefined, {});
	assert.equal(result.details.outcomes[0].ok, true);
	assert.equal(result.details.outcomes[0].workspace.workspaceId, workspaceId);
	assert.equal(result.details.outcomes[0].workspace.disposition, "active");
	assert.match(result.content[0].text, /worktree saw1-/);
	assert.doesNotMatch(JSON.stringify(result), new RegExp(privateRoot.replaceAll("/", "\\/")));
});

test("sub_agents_status can include path-free exact-owned worktree change collection", async () => {
	const workspaceId = `saw1-${"c".repeat(32)}`;
	const branchRef = `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`;
	const baseCommit = "1".repeat(40);
	const currentCommit = "2".repeat(40);
	const privateRoot = "/private/state/worktrees/hidden-status-collection";
	const snapshot = {
		...largeSnapshot(2),
		id: "sa1-status-worktree-collection",
		spec: {
			...largeSnapshot(2).spec,
			name: "status-worktree-collection",
			workspace: { mode: "worktree" },
		},
		workspace: {
			mode: "worktree",
			workspaceId,
			branchRef,
			baseCommit,
			disposition: "active",
		},
	};
	let collected = 0;
	const manager = {
		generation: "sag1-status-worktree-collection",
		listAgents() { return [snapshot]; },
		getAgent() { return snapshot; },
		async drainUsage() { throw new Error("unused"); },
		async collectWorkspaceChanges(id) {
			assert.equal(id, snapshot.id);
			collected += 1;
			return {
				summary: {
					workspaceId,
					branchRef,
					baseCommit: baseCommit.slice(0, 12),
					lastObservedCommit: currentCommit.slice(0, 12),
					disposition: "ready",
				},
				registered: true,
				exactOwnership: true,
				clean: false,
				conflicted: false,
				incomplete: false,
				collection: {
					registered: true,
					head: currentCommit,
					branchRef,
					refCommit: currentCommit,
					clean: false,
					indexMatchesBase: true,
					changedFileCount: 2,
					changedFiles: [
						{ path: "src/changed.ts", status: " M", kind: "modified" },
						{ path: "src/new.ts", status: "??", kind: "untracked" },
					],
					changedFilesTruncated: false,
					diffStat: {
						filesChanged: 1,
						insertions: 3,
						deletions: 1,
						binaryFiles: 0,
						files: [{ path: "src/changed.ts", insertions: 3, deletions: 1, binary: false }],
						truncated: false,
					},
					commitRange: { baseCommit, currentCommit, aheadCount: 1 },
					patchPreview: {
						lineCount: 6,
						lines: ["diff --git a/src/changed.ts b/src/changed.ts", "--- a/src/changed.ts", "+++ b/src/changed.ts", "-old", "+new"],
						truncated: false,
						omittedLineCount: 1,
						omittedByteCount: 0,
					},
					conflicted: false,
					incomplete: false,
				},
			};
		},
	};
	const tool = createSubAgentsStatusTool(() => ({ manager, now: () => 10_000 }));
	const result = await tool.execute(
		"status-worktree-collection",
		{ ids: [snapshot.id], includeWorktreeChanges: true },
		undefined,
		undefined,
		{},
	);
	assert.equal(collected, 1);
	assert.equal(result.details.includeWorktreeChanges, true);
	assert.equal(result.details.worktreeCollectionsFailed, 0);
	const outcome = result.details.outcomes[0];
	assert.equal(outcome.ok, true);
	assert.equal(outcome.worktreeChanges.ok, true);
	assert.equal(outcome.worktreeChanges.changedFileCount, 2);
	assert.equal(outcome.worktreeChanges.diffStat.insertions, 3);
	assert.equal(outcome.worktreeChanges.commitRange.aheadCount, 1);
	assert.equal(outcome.worktreeChanges.patchPreview.lineCount, 6);
	assert.ok(outcome.worktreeChanges.patchPreview.lines.some((line) => line.includes("+new")));
	assert.match(result.content[0].text, /changes 2 files/);
	assert.match(result.content[0].text, /patch 6 lines/);
	assert.doesNotMatch(JSON.stringify(result), new RegExp(privateRoot.replaceAll("/", "\\/")));

	const callComponent = tool.renderCall(
		{ ids: [snapshot.id], includeWorktreeChanges: true },
		fakeTheme(),
		renderContext({ ids: [snapshot.id], includeWorktreeChanges: true }),
	);
	assert.match(callComponent.render(200).join("\n"), /worktree changes/);
});

test("sub_agents_status can collect retained worktree catalog changes by workspace ID", async () => {
	const workspaceId = `saw1-${"r".repeat(32)}`;
	const branchRef = `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`;
	const baseCommit = "3".repeat(40);
	const currentCommit = "4".repeat(40);
	const privateRoot = "/private/state/worktrees/catalog-hidden";
	const manager = {
		generation: "sag1-status-catalog-collection",
		listAgents() { return []; },
		getAgent() { throw new Error("unused"); },
		async drainUsage() { throw new Error("unused"); },
	};
	let collected = 0;
	const tool = createSubAgentsStatusTool(() => ({
		manager,
		now: () => 10_000,
		async collectWorktreeCatalogChanges(request) {
			assert.equal(request.workspaceId, workspaceId);
			assert.equal(request.expectedRevision, 9);
			collected += 1;
			return {
				revision: 9,
				summary: {
					workspaceId,
					branchRef,
					baseCommit,
					lastObservedCommit: currentCommit,
					disposition: "retained",
				},
				registered: true,
				exactOwnership: true,
				clean: false,
				conflicted: false,
				incomplete: false,
				collection: {
					registered: true,
					head: currentCommit,
					branchRef,
					refCommit: currentCommit,
					clean: false,
					indexMatchesBase: true,
					changedFileCount: 1,
					changedFiles: [{ path: "src/retained.ts", status: " M", kind: "modified" }],
					changedFilesTruncated: false,
					diffStat: {
						filesChanged: 1,
						insertions: 2,
						deletions: 1,
						binaryFiles: 0,
						files: [{ path: "src/retained.ts", insertions: 2, deletions: 1, binary: false }],
						truncated: false,
					},
					commitRange: { baseCommit, currentCommit, aheadCount: 2 },
					patchPreview: {
						lineCount: 4,
						lines: ["diff --git a/src/retained.ts b/src/retained.ts", "--- a/src/retained.ts", "+++ b/src/retained.ts", "+retained"],
						truncated: false,
						omittedLineCount: 0,
						omittedByteCount: 0,
					},
					conflicted: false,
					incomplete: false,
				},
			};
		},
	}));
	const result = await tool.execute(
		"status-catalog-collection",
		{ worktreeCatalogChanges: [{ workspaceId, expectedRevision: 9 }] },
		undefined,
		undefined,
		{},
	);
	assert.equal(collected, 1);
	assert.equal(result.details.worktreeCatalogRequested, 1);
	assert.equal(result.details.worktreeCatalogFailed, 0);
	assert.equal(result.details.worktreeCatalog[0].ok, true);
	assert.equal(result.details.worktreeCatalog[0].revision, 9);
	assert.equal(result.details.worktreeCatalog[0].workspace.disposition, "retained");
	assert.equal(result.details.worktreeCatalog[0].changes.changedFileCount, 1);
	assert.equal(result.details.worktreeCatalog[0].changes.patchPreview.lineCount, 4);
	assert.ok(result.details.worktreeCatalog[0].changes.patchPreview.lines.some((line) => line.includes("+retained")));
	assert.match(result.content[0].text, /worktree catalog/);
	assert.match(result.content[0].text, /rev 9/);
	assert.doesNotMatch(JSON.stringify(result), new RegExp(privateRoot.replaceAll("/", "\\/")));

	const callComponent = tool.renderCall(
		{ worktreeCatalogChanges: [{ workspaceId, expectedRevision: 9 }] },
		fakeTheme(),
		renderContext({ worktreeCatalogChanges: [{ workspaceId, expectedRevision: 9 }] }),
	);
	assert.match(callComponent.render(200).join("\n"), /1 catalog/);
	const resultComponent = tool.renderResult(
		result,
		{ expanded: true, isPartial: false },
		fakeTheme(),
		renderContext({ worktreeCatalogChanges: [{ workspaceId, expectedRevision: 9 }] }),
	);
	assert.match(resultComponent.render(300).join("\n"), /catalog changes: 1 file/);
});

test("sub_agents_status reports retained worktree catalog collection failures path-free", async () => {
	const workspaceId = `saw1-${"f".repeat(32)}`;
	const manager = {
		generation: "sag1-status-catalog-failure",
		listAgents() { return []; },
		getAgent() { throw new Error("unused"); },
		async drainUsage() { throw new Error("unused"); },
	};
	const tool = createSubAgentsStatusTool(() => ({
		manager,
		async collectWorktreeCatalogChanges() {
			throw new Error("PRIVATE_CATALOG_PATH_/tmp/secret-worktree");
		},
	}));
	const result = await tool.execute(
		"status-catalog-failure",
		{ worktreeCatalogChanges: [{ workspaceId, expectedRevision: 3 }] },
		undefined,
		undefined,
		{},
	);
	assert.equal(result.details.worktreeCatalogRequested, 1);
	assert.equal(result.details.worktreeCatalogFailed, 1);
	assert.equal(result.details.worktreeCatalog[0].ok, false);
	assert.equal(result.details.worktreeCatalog[0].code, "catalog_collection_failed");
	assert.doesNotMatch(JSON.stringify(result), /PRIVATE_CATALOG_PATH/);
});

function heavyCatalogCollection(workspaceId, index) {
	const baseCommit = index % 2 === 0 ? "5".repeat(40) : "6".repeat(40);
	const currentCommit = index % 2 === 0 ? "7".repeat(40) : "8".repeat(40);
	const branchRef = `refs/heads/pi/sub-agents/${index.toString(16).padStart(16, "0")}/${workspaceId}`;
	return {
		revision: index + 1,
		summary: {
			workspaceId,
			branchRef,
			baseCommit,
			lastObservedCommit: currentCommit,
			disposition: index % 3 === 0 ? "uncertain" : "retained",
		},
		registered: true,
		exactOwnership: true,
		clean: false,
		conflicted: index % 17 === 0,
		incomplete: index % 19 === 0,
		collection: {
			registered: true,
			head: currentCommit,
			branchRef,
			refCommit: currentCommit,
			clean: false,
			indexMatchesBase: true,
			changedFileCount: 60,
			changedFiles: Array.from({ length: 60 }, (_, file) => ({
				path: `src/${index.toString().padStart(3, "0")}/${"changed-".repeat(12)}${file}.ts`,
				status: file % 2 === 0 ? " M" : "??",
				kind: file % 2 === 0 ? "modified" : "untracked",
				oldPath: file % 5 === 0 ? `src/${index.toString().padStart(3, "0")}/old-${"renamed-".repeat(12)}${file}.ts` : undefined,
			})),
			changedFilesTruncated: true,
			diffStat: {
				filesChanged: 60,
				insertions: 12_345 + index,
				deletions: 6_789 + index,
				binaryFiles: 2,
				files: Array.from({ length: 60 }, (_, file) => ({
					path: `src/${index.toString().padStart(3, "0")}/${"diff-".repeat(16)}${file}.ts`,
					insertions: file % 7 === 0 ? null : 100 + file,
					deletions: file % 7 === 0 ? null : 50 + file,
					binary: file % 7 === 0,
				})),
				truncated: true,
			},
			commitRange: { baseCommit, currentCommit, aheadCount: 100 + index },
			patchPreview: {
				lineCount: 120,
				lines: Array.from({ length: 120 }, (_, line) => `+catalog ${index} ${line} ${"patch-preview ".repeat(30)}`),
				truncated: true,
				omittedLineCount: 40,
				omittedByteCount: 16_384,
			},
			conflicted: index % 17 === 0,
			incomplete: index % 19 === 0,
		},
	};
}

test("maximum retained worktree catalog status preserves every target under transport bounds", async () => {
	const requests = Array.from({ length: SUB_AGENT_BOUNDS.controlTargets }, (_, index) => ({
		workspaceId: `saw1-maxcatalog-${index.toString().padStart(3, "0")}-${"m".repeat(24)}`,
		expectedRevision: index + 1,
	}));
	const manager = {
		generation: "sag1-status-catalog-bounds",
		listAgents() { return []; },
		getAgent() { throw new Error("unused"); },
		async drainUsage() { throw new Error("unused"); },
	};
	const tool = createSubAgentsStatusTool(() => ({
		manager,
		async collectWorktreeCatalogChanges(request) {
			const index = requests.findIndex((candidate) => candidate.workspaceId === request.workspaceId);
			assert.notEqual(index, -1);
			assert.equal(request.expectedRevision, index + 1);
			return heavyCatalogCollection(request.workspaceId, index);
		},
	}));
	const result = await tool.execute(
		"status-catalog-bounds",
		{ worktreeCatalogChanges: requests },
		undefined,
		undefined,
		{},
	);
	assert.equal(result.details.worktreeCatalogRequested, SUB_AGENT_BOUNDS.controlTargets);
	assert.equal(result.details.worktreeCatalogFailed, 0);
	assert.equal(result.details.worktreeCatalog.length, SUB_AGENT_BOUNDS.controlTargets);
	assert.equal(result.details.worktreeCatalog.every((outcome) => outcome.ok), true);
	assert.equal(new Set(result.details.worktreeCatalog.map((outcome) => outcome.workspaceId)).size, requests.length);
	assert.ok(result.details.worktreeCatalogTruncated > 0);
	assert.equal(result.details.outputTruncated, true);
	assert.ok(result.details.worktreeCatalog.every((outcome) => !outcome.ok || (outcome.changes.patchPreview?.lines.length ?? 0) === 0));
	assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 48 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") <= 48 * 1024);
	assert.ok(result.content[0].text.split("\n").length <= 2_000);
});

test("status event summaries use UTF-8 ellipsis markers and report their truncation", async () => {
	const snapshot = largeSnapshot(0);
	snapshot.id = "sa1-status-marker";
	snapshot.spec = {
		...snapshot.spec,
		name: "status-marker",
		role: "focused marker fixture",
		objective: "focused marker fixture",
		tags: [],
	};
	snapshot.currentAssignment = {
		...snapshot.currentAssignment,
		id: "sa1-status-marker:assignment:1",
		objective: "focused marker fixture",
	};
	snapshot.latestReport = {
		...snapshot.latestReport,
		summary: "focused marker fixture",
		files: [],
	};
	snapshot.runtime = {
		...snapshot.runtime,
		streamingPreview: "focused marker fixture",
		activeToolCount: 0,
		activeTools: [],
	};
	snapshot.events = [
		{
			sequence: 1,
			kind: "runtime",
			state: "running",
			summary: "😀".repeat(100),
			timestamp: 1_000,
		},
	];
	const manager = {
		generation: "sag1-status-marker",
		listAgents() {
			return [snapshot];
		},
		getAgent(id) {
			if (id === snapshot.id) return snapshot;
			throw new Error("unused");
		},
		async drainUsage() {
			throw new Error("unused");
		},
	};
	const tool = createSubAgentsStatusTool(() => ({ manager, now: () => 10_000 }));
	const result = await tool.execute(
		"status-marker",
		{ detail: "timeline", eventLimit: 1 },
		undefined,
		undefined,
		{},
	);
	const outcome = result.details.outcomes[0];
	assert.equal(outcome.ok, true);
	assert.ok(outcome.events[0].summary.endsWith("…"));
	assert.ok(Buffer.byteLength(outcome.events[0].summary, "utf8") <= 176);
	assert.deepEqual(outcome.truncatedFields, ["events.summary"]);
	assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 48 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") <= 48 * 1024);
	assert.ok(result.content[0].text.split("\n").length <= 2_000);
});

test("maximum timeline snapshots preserve every selected outcome under content/details transport bounds", async () => {
	const snapshots = Array.from({ length: SUB_AGENT_BOUNDS.controlTargets }, (_, index) => largeSnapshot(index));
	const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
	const manager = {
		generation: "sag1-output-bounds",
		listAgents() {
			return snapshots;
		},
		getAgent(id) {
			const snapshot = byId.get(id);
			if (!snapshot) throw new Error("PRIVATE_STATUS_LOOKUP_FAILURE");
			return snapshot;
		},
		async drainUsage() {
			throw new Error("unused");
		},
	};
	const tool = createSubAgentsStatusTool(() => ({ manager, now: () => 10_000 }));
	const result = await tool.execute(
		"status-output-bounds",
		{ detail: "timeline", eventLimit: SUB_AGENT_BOUNDS.eventTimeline },
		undefined,
		undefined,
		{},
	);
	assert.equal(result.details.outcomes.length, SUB_AGENT_BOUNDS.controlTargets);
	assert.equal(result.details.succeeded, SUB_AGENT_BOUNDS.controlTargets);
	assert.equal(result.details.failed, 0);
	assert.ok(result.details.truncatedAgentDetails > 0);
	assert.ok(result.details.timelineEventsOmittedByTransport > 0);
	assert.equal(result.details.outputTruncated, true);
	assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 48 * 1024);
	assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") <= 48 * 1024);
	assert.ok(result.content[0].text.split("\n").length <= 2_000);
	assert.equal(new Set(result.details.outcomes.map((outcome) => outcome.id)).size, snapshots.length);
	assert.doesNotMatch(JSON.stringify(result), /PRIVATE_STATUS_LOOKUP_FAILURE/);
});

test("status fails closed before side effects without an active generation and redacts unknown lookup errors", async () => {
	const inactive = createSubAgentsStatusTool(() => undefined);
	await assert.rejects(
		inactive.execute("inactive", {}, undefined, undefined, {}),
		(error) => error instanceof SubAgentsStatusError && error.code === "manager_inactive",
	);
	const controller = new AbortController();
	controller.abort();
	const runtime = {
		manager: {
			generation: "sag1-cancelled",
			listAgents() {
				return [];
			},
			getAgent() {
				throw new Error("unused");
			},
			async drainUsage() {
				throw new Error("unused");
			},
		},
	};
	const cancelled = createSubAgentsStatusTool(() => runtime);
	await assert.rejects(
		cancelled.execute("cancelled", {}, controller.signal, undefined, {}),
		(error) => error instanceof SubAgentsStatusError && error.code === "cancelled",
	);

	const privateFailure = createSubAgentsStatusTool(() => ({
		manager: {
			generation: "sag1-private-failure",
			listAgents() {
				return [];
			},
			getAgent() {
				throw new Error("PRIVATE_STATUS_LOOKUP_FAILURE");
			},
			async drainUsage() {
				throw new Error("unused");
			},
		},
	}));
	const redacted = await privateFailure.execute(
		"redacted",
		{ ids: ["sa1-private-failure-1-missing"] },
		undefined,
		undefined,
		{},
	);
	assert.equal(redacted.details.outcomes[0].code, "status_failed");
	assert.doesNotMatch(JSON.stringify(redacted), /PRIVATE_STATUS_LOOKUP_FAILURE/);
});
