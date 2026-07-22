import assert from "node:assert/strict";
import test from "node:test";
import {
	importInstalledTypeBoxValue,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const {
	dynamicAgentSpecSchema,
	subAgentsReconfigureSchema,
	subAgentsRemoveSchema,
	subAgentsSendSchema,
	subAgentsSpawnSchema,
	subAgentsStatusSchema,
	subAgentsWaitSchema,
} = await importSubAgentsModule("tools/schemas.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");
const { Check } = await importInstalledTypeBoxValue();

const AGENT_ID = "sa1-schema-generation-1-schema-nonce";

function minimalAgent(overrides = {}) {
	return {
		name: "schema-agent",
		role: "Exercise the public control schema",
		objective: "Validate one bounded dynamic assignment without external services.",
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

function assertAccepted(schema, value, label) {
	assert.equal(Check(schema, value), true, `${label} should be accepted`);
}

function assertRejected(schema, value, label) {
	assert.equal(Check(schema, value), false, `${label} should be rejected`);
}

test("all public control schemas are strict at every object boundary", () => {
	for (const [name, schema] of Object.entries({
		dynamicAgentSpecSchema,
		subAgentsSpawnSchema,
		subAgentsStatusSchema,
		subAgentsSendSchema,
		subAgentsReconfigureSchema,
		subAgentsWaitSchema,
		subAgentsRemoveSchema,
	})) {
		assertEveryObjectIsStrict(schema, name);
	}
});

test("spawn accepts bounded dynamic specifications and rejects structural or capability metadata overflow", () => {
	assertAccepted(subAgentsSpawnSchema, { agents: [minimalAgent()] }, "minimal spawn");
	assertAccepted(
		subAgentsSpawnSchema,
		{
			agents: [
				minimalAgent({
					instructions: "Use only the exposed child capabilities.",
					context: "Synthetic schema fixture context.",
					modelPolicy: "explicit",
					model: { provider: "fixture-provider", id: "fixture-model" },
					complexity: "complex",
					thinkingLevel: "high",
					tools: ["read", "grep", "find", "ls"],
					workspace: {
						mode: "shared",
						cwd: "src",
						writeScope: ["src/a.ts", "src/b.ts"],
						bashPolicy: "disabled",
					},
					resultInstructions: "Return a concise file/function map.",
					tags: ["schema", "offline"],
					notifyOn: ["idle", "blocked", "failed"],
				}),
			],
		},
		"full spawn",
	);

	assertRejected(subAgentsSpawnSchema, { agents: [] }, "empty spawn batch");
	assertRejected(subAgentsSpawnSchema, { agents: [minimalAgent()], unknown: true }, "unknown top-level field");
	assertRejected(
		subAgentsSpawnSchema,
		{ agents: [minimalAgent({ unknown: true })] },
		"unknown dynamic-spec field",
	);
	assertRejected(
		subAgentsSpawnSchema,
		{ agents: [minimalAgent({ name: " ".repeat(4) })] },
		"whitespace-only name",
	);
	assertRejected(
		subAgentsSpawnSchema,
		{ agents: [minimalAgent({ objective: "x".repeat(SUB_AGENT_BOUNDS.objectiveChars + 1) })] },
		"oversized objective",
	);
	assertRejected(
		subAgentsSpawnSchema,
		{ agents: [minimalAgent({ tools: ["read", "read"] })] },
		"duplicate tools",
	);
	assertRejected(
		subAgentsSpawnSchema,
		{ agents: [minimalAgent({ modelPolicy: "profile" })] },
		"unsupported model policy",
	);
	assertRejected(
		subAgentsSpawnSchema,
		{ agents: new Array(SUB_AGENT_BOUNDS.spawnBatchAgents + 1).fill(null).map((_, index) => minimalAgent({ name: `agent-${index}` })) },
		"oversized per-call spawn batch",
	);
});

test("status bounds target IDs, detail levels, timelines, and explicit usage draining", () => {
	assertAccepted(subAgentsStatusSchema, {}, "all-agent compact status");
	assertAccepted(
		subAgentsStatusSchema,
		{
			ids: [AGENT_ID],
			includeRemoved: true,
			detail: "timeline",
			eventLimit: SUB_AGENT_BOUNDS.eventTimeline,
			drainUsage: true,
		},
		"selected timeline status",
	);
	assertRejected(subAgentsStatusSchema, { ids: [] }, "empty explicit ID selection");
	assertRejected(subAgentsStatusSchema, { ids: [AGENT_ID, AGENT_ID] }, "duplicate status IDs");
	assertRejected(subAgentsStatusSchema, { ids: ["not-an-agent-id"] }, "malformed agent ID");
	assertRejected(subAgentsStatusSchema, { detail: "messages" }, "unbounded detail level");
	assertRejected(
		subAgentsStatusSchema,
		{ eventLimit: SUB_AGENT_BOUNDS.eventTimeline + 1 },
		"oversized event timeline",
	);
	assertRejected(subAgentsStatusSchema, { extra: true }, "unknown status field");
});

test("send and reconfigure use bounded per-target arrays and provider-compatible enums", () => {
	assertAccepted(
		subAgentsSendSchema,
		{ messages: [{ id: AGENT_ID, message: "Inspect the follow-up evidence.", delivery: "followUp" }] },
		"send follow-up",
	);
	assertRejected(subAgentsSendSchema, { messages: [] }, "empty send batch");
	assertRejected(
		subAgentsSendSchema,
		{ messages: [{ id: AGENT_ID, message: " ", delivery: "steer" }] },
		"blank send message",
	);
	assertRejected(
		subAgentsSendSchema,
		{ messages: [{ id: AGENT_ID, message: "ok", delivery: "interrupt" }] },
		"unsupported send delivery",
	);

	assertAccepted(
		subAgentsReconfigureSchema,
		{
			changes: [
				{
					id: AGENT_ID,
					modelPolicy: "explicit",
					model: { provider: "fixture-provider", id: "fixture-model" },
					complexity: "complex",
					thinkingLevel: "xhigh",
					runningBehavior: "abort-and-switch",
				},
			],
		},
		"explicit reconfiguration",
	);
	assertRejected(subAgentsReconfigureSchema, { changes: [] }, "empty reconfigure batch");
	assertRejected(
		subAgentsReconfigureSchema,
		{ changes: [{ id: AGENT_ID, modelPolicy: "auto", runningBehavior: "immediate" }] },
		"unsupported reconfigure behavior",
	);
	assertRejected(
		subAgentsReconfigureSchema,
		{ changes: [{ id: AGENT_ID, modelPolicy: "inherit", secret: "must-not-pass" }] },
		"unknown reconfigure field",
	);
});

test("wait and remove expose bounded barriers, timeouts, and explicit removal scope", () => {
	assertAccepted(subAgentsWaitSchema, {}, "all-active default wait");
	assertAccepted(
		subAgentsWaitSchema,
		{
			ids: [AGENT_ID],
			condition: "any",
			states: ["idle", "blocked", "failed", "removed"],
			timeoutSeconds: SUB_AGENT_BOUNDS.waitTimeoutSeconds,
		},
		"selected terminal barrier",
	);
	assertRejected(subAgentsWaitSchema, { states: [] }, "empty wait-state set");
	assertRejected(subAgentsWaitSchema, { states: ["idle", "idle"] }, "duplicate wait states");
	assertRejected(subAgentsWaitSchema, { condition: "first" }, "unsupported wait condition");
	assertRejected(
		subAgentsWaitSchema,
		{ timeoutSeconds: SUB_AGENT_BOUNDS.waitTimeoutSeconds + 1 },
		"oversized wait timeout",
	);

	assertAccepted(
		subAgentsRemoveSchema,
		{
			scope: "selected",
			ids: [AGENT_ID],
			mode: "graceful",
			gracePeriodSeconds: SUB_AGENT_BOUNDS.gracefulStopSeconds,
		},
		"selected graceful removal",
	);
	assertAccepted(subAgentsRemoveSchema, { scope: "all", mode: "abort" }, "all-agent forced removal");
	assertRejected(subAgentsRemoveSchema, {}, "missing removal scope");
	assertRejected(subAgentsRemoveSchema, { scope: "historical" }, "unsupported removal scope");
	assertRejected(
		subAgentsRemoveSchema,
		{ scope: "all", gracePeriodSeconds: SUB_AGENT_BOUNDS.gracefulStopSeconds + 1 },
		"oversized graceful deadline",
	);
	assertRejected(subAgentsRemoveSchema, { scope: "all", extra: true }, "unknown remove field");
});
