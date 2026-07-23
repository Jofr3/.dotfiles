import assert from "node:assert/strict";
import test from "node:test";
import {
	importInstalledTypeBoxValue,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const {
	SUB_AGENTS_STATE_CUSTOM_TYPE,
	SUB_AGENTS_STATE_VERSION,
	SubAgentPersistenceError,
	createPersistedSubAgentHistoryV1,
	persistedSubAgentHistoryByteLength,
	persistedSubAgentHistoryV1Schema,
} = await importSubAgentsModule("persistence.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");
const { Check } = await importInstalledTypeBoxValue();

function counters(overrides = {}) {
	return {
		input: 10,
		output: 4,
		cacheRead: 2,
		cacheWrite: 1,
		totalTokens: 17,
		cost: 0.25,
		...overrides,
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
		reason: "Automatic moderate route selected the fixture model.",
	};
}

function completedResult(overrides = {}) {
	return {
		summary: "Persistence schema complete.",
		details: "The checkpoint is strict and bounded.",
		files: ["src/from-result.ts"],
		completedAt: 1_150,
		...overrides,
	};
}

function snapshot(overrides = {}) {
	return {
		id: "sa1-persistence-generation-1-fixture",
		generation: "sag1-persistence-generation",
		spec: {
			name: "history-worker",
			role: "Review the exact persistence boundary.",
			objective: "Capture a bounded branch-aware historical checkpoint without runtime state.",
			instructions: "PRIVATE_INSTRUCTIONS_MUST_NOT_PERSIST",
			context: "PRIVATE_CONTEXT_MUST_NOT_PERSIST",
			workspace: { mode: "shared", bashPolicy: "disabled" },
		},
		state: "idle",
		createdAt: 1_000,
		updatedAt: 1_200,
		assignmentCount: 1,
		currentAssignment: {
			id: "sa1-persistence-generation-1-fixture:assignment:1",
			sequence: 1,
			objective: "Summarize the final persistence contract for the active assignment.",
			state: "idle",
			startedAt: 1_050,
			endedAt: 1_150,
			result: completedResult(),
			modifiedFiles: ["src/from-assignment.ts"],
			usage: { totals: counters(), turns: 1 },
		},
		latestReport: {
			state: "result",
			summary: "Structured result is available.",
			files: ["src/from-report.ts"],
			timestamp: 1_140,
		},
		latestResult: completedResult(),
		modelRoute: route(),
		events: [
			{
				sequence: 1,
				kind: "runtime",
				state: "idle",
				summary: "PRIVATE_EVENT_MUST_NOT_PERSIST",
				timestamp: 1_199,
			},
		],
		omittedEventCount: 0,
		runtime: {
			phase: "settled",
			streamingPreview: "PRIVATE_STREAM_MUST_NOT_PERSIST",
			activeToolCount: 0,
			activeTools: [],
			pendingMessageCount: 0,
		},
		usage: {
			totals: counters(),
			reported: counters({ output: 1, totalTokens: 14, cost: 0.1 }),
			turns: 1,
			assignments: 1,
		},
		leases: [
			{
				kind: "file",
				workspaceKey: "shared",
				ownerAgentId: "sa1-persistence-generation-1-fixture",
				path: "src/from-lease.ts",
				acquiredAt: 1_060,
			},
		],
		auth: { token: "PRIVATE_AUTH_MUST_NOT_PERSIST" },
		messages: ["PRIVATE_MESSAGE_MUST_NOT_PERSIST"],
		...overrides,
	};
}

function assertEveryObjectIsStrict(schema, path = "schema", seen = new Set()) {
	if (!schema || typeof schema !== "object" || seen.has(schema)) return;
	seen.add(schema);
	if (schema.type === "object") {
		assert.equal(schema.additionalProperties, false, `${path} must reject unknown properties`);
	}
	for (const [key, value] of Object.entries(schema)) {
		if (key === "default" || key === "description") continue;
		if (Array.isArray(value)) {
			value.forEach((entry, index) => assertEveryObjectIsStrict(entry, `${path}.${key}[${index}]`, seen));
		} else {
			assertEveryObjectIsStrict(value, `${path}.${key}`, seen);
		}
	}
}

test("sub-agents-state-v1 is one strict per-agent historical checkpoint schema", () => {
	assert.equal(SUB_AGENTS_STATE_CUSTOM_TYPE, "sub-agents-state-v1");
	assert.equal(SUB_AGENTS_STATE_VERSION, 1);
	assertEveryObjectIsStrict(persistedSubAgentHistoryV1Schema);

	const history = createPersistedSubAgentHistoryV1(snapshot());
	assert.equal(Check(persistedSubAgentHistoryV1Schema, history), true);
	assert.equal(Check(persistedSubAgentHistoryV1Schema, { ...history, runtime: {} }), false);
	assert.equal(
		Check(persistedSubAgentHistoryV1Schema, {
			...history,
			usage: { ...history.usage, auth: "not allowed" },
		}),
		false,
	);
	assert.equal(
		Check(persistedSubAgentHistoryV1Schema, {
			...history,
			result: { ...history.result, files: ["not part of persisted result v1"] },
		}),
		false,
	);
	assert.equal(Check(persistedSubAgentHistoryV1Schema, { ...history, state: "running" }), false);
	assert.equal(
		Check(persistedSubAgentHistoryV1Schema, {
			...history,
			objectiveSummary: "x".repeat(SUB_AGENT_BOUNDS.persistenceObjectiveChars + 1),
		}),
		false,
	);
});

test("history reduction persists bounded task/result/usage/file metadata and excludes live or secret-bearing state", () => {
	const source = snapshot();
	const history = createPersistedSubAgentHistoryV1(source);
	assert.deepEqual(history, {
		version: 1,
		generation: "sag1-persistence-generation",
		id: "sa1-persistence-generation-1-fixture",
		name: "history-worker",
		role: "Review the exact persistence boundary.",
		objectiveSummary: "Summarize the final persistence contract for the active assignment.",
		state: "idle",
		result: {
			summary: "Persistence schema complete.",
			details: "The checkpoint is strict and bounded.",
			completedAt: 1_150,
		},
		modelRoute: route(),
		usage: {
			totals: counters(),
			reported: counters({ output: 1, totalTokens: 14, cost: 0.1 }),
			unreported: {
				input: 0,
				output: 3,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 3,
				cost: 0.15,
			},
			turns: 1,
			assignments: 1,
		},
		files: [
			"src/from-result.ts",
			"src/from-report.ts",
			"src/from-assignment.ts",
			"src/from-lease.ts",
		],
		omittedFileCount: 0,
		createdAt: 1_000,
		updatedAt: 1_200,
	});
	const encoded = JSON.stringify(history);
	for (const privateText of [
		"PRIVATE_INSTRUCTIONS_MUST_NOT_PERSIST",
		"PRIVATE_CONTEXT_MUST_NOT_PERSIST",
		"PRIVATE_EVENT_MUST_NOT_PERSIST",
		"PRIVATE_STREAM_MUST_NOT_PERSIST",
		"PRIVATE_AUTH_MUST_NOT_PERSIST",
		"PRIVATE_MESSAGE_MUST_NOT_PERSIST",
	]) {
		assert.doesNotMatch(encoded, new RegExp(privateText));
	}

	source.latestResult.summary = "mutated after reduction";
	source.currentAssignment.result.summary = "mutated current result after reduction";
	source.modelRoute.selectedModel.id = "mutated-model";
	source.usage.totals.output = 999;
	source.leases[0].path = "mutated-path";
	assert.equal(history.result.summary, "Persistence schema complete.");
	assert.equal(history.modelRoute.selectedModel.id, "gpt-5.6-terra");
	assert.equal(history.usage.totals.output, 4);
	assert.deepEqual(history.files.at(-1), "src/from-lease.ts");
});

test("worst-case file metadata is deterministically omitted until the custom entry fits its byte budget", () => {
	const noisy = `dir/${"\\\"😀".repeat(1_000)}`;
	const resultFiles = Array.from(
		{ length: SUB_AGENT_BOUNDS.reportFiles },
		(_, index) => `${noisy}-result-${index}`,
	);
	const reportFiles = Array.from(
		{ length: SUB_AGENT_BOUNDS.reportFiles },
		(_, index) => `${noisy}-report-${index}`,
	);
	const noisyResult = completedResult({
		summary: "\"😀".repeat(SUB_AGENT_BOUNDS.persistenceResultSummaryChars / 2),
		details: "\\😀".repeat(SUB_AGENT_BOUNDS.persistenceResultDetailsChars / 2),
		files: resultFiles,
	});
	const source = snapshot({
		currentAssignment: {
			...snapshot().currentAssignment,
			result: noisyResult,
		},
		latestResult: noisyResult,
		latestReport: {
			state: "result",
			summary: "bounded",
			files: reportFiles,
			timestamp: 1_140,
		},
	});
	const history = createPersistedSubAgentHistoryV1(source);
	assert.equal(Check(persistedSubAgentHistoryV1Schema, history), true);
	assert.ok(history.omittedFileCount >= SUB_AGENT_BOUNDS.reportFiles);
	assert.ok(history.files.length < SUB_AGENT_BOUNDS.reportFiles);
	assert.ok(
		persistedSubAgentHistoryByteLength(history) <= SUB_AGENT_BOUNDS.persistenceEntryBytes,
	);
});

test("history reduction fails closed on live states, inconsistent timestamps, usage, or model routes", () => {
	assert.throws(
		() => createPersistedSubAgentHistoryV1(snapshot({ state: "running" })),
		(error) => error instanceof SubAgentPersistenceError && error.code === "invalid_persisted_state",
	);
	assert.throws(() =>
		createPersistedSubAgentHistoryV1(snapshot({ updatedAt: 999 })),
	);
	assert.throws(() =>
		createPersistedSubAgentHistoryV1(
			snapshot({
				usage: {
					totals: counters({ output: 1 }),
					reported: counters({ output: 2 }),
					turns: 1,
					assignments: 1,
				},
			}),
		),
	);
	assert.throws(() =>
		createPersistedSubAgentHistoryV1(
			snapshot({
				modelRoute: {
					...route(),
					fallbackPath: [
						{
							source: "tier",
							modelId: "not-the-selected-model",
							complexity: "moderate",
							outcome: "selected",
						},
					],
				},
			}),
		),
	);
	assert.throws(() =>
		createPersistedSubAgentHistoryV1(snapshot({ state: "removed", removedAt: undefined })),
	);
	assert.throws(() =>
		createPersistedSubAgentHistoryV1(
			snapshot({ state: "removed", removedAt: 1_300, updatedAt: 1_250 }),
		),
	);
	assert.throws(() =>
		createPersistedSubAgentHistoryV1(snapshot({ generation: "not-a-generation" })),
	);
	const failed = createPersistedSubAgentHistoryV1(
		snapshot({
			state: "failed",
			lastError: "PRIVATE_PROVIDER_ERROR_MUST_NOT_PERSIST",
			currentAssignment: {
				...snapshot().currentAssignment,
				state: "failed",
				result: undefined,
				error: "PRIVATE_TOOL_ERROR_MUST_NOT_PERSIST",
			},
		}),
	);
	assert.equal(failed.statusSummary, "Sub-agent failed; runtime error text was not persisted.");
	assert.equal(failed.result, undefined, "a prior assignment result is not the failed assignment result");
	assert.equal(failed.files.includes("src/from-result.ts"), false);
	assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_(PROVIDER|TOOL)_ERROR/);
	const removed = createPersistedSubAgentHistoryV1(
		snapshot({
			state: "removed",
			removedAt: 1_250,
			removalReason: "Session generation replaced.",
			updatedAt: 1_250,
		}),
	);
	assert.equal(removed.state, "removed");
	assert.equal(removed.statusSummary, "Session generation replaced.");
	assert.equal(removed.removedAt, 1_250);
	assert.equal(Check(persistedSubAgentHistoryV1Schema, removed), true);
});
