import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
	ConfigStore,
	createInvocationSnapshot,
	parseConfig,
} from "../src/config.ts";
import { resolveCredentialMaterial } from "../src/credentials.ts";
import {
	createRequirementArtifacts,
	createRequirementInvalidationEvent,
	deriveRequirementId,
	MCP_TOOLBOX_REQUIREMENTS_CHANNEL,
	MCP_TOOLBOX_REQUIREMENTS_PROTOCOL,
	parseDynamicRequirementId,
	planSelectedCredentials,
	requirementPurpose,
} from "../src/requirements.ts";
import {
	discoverRequirements,
	RequirementDiscoveryError,
} from "../src/requirements-tool.ts";
import {
	ONEPASSWORD_RESOLVER_PROVIDER,
	SECRET_RESOLVER_V2_REQUEST_CHANNEL,
	SecretResolverConsumer,
} from "../src/resolver.ts";

const ENDPOINT_CANARY = "https://endpoint-canary.example.test/private";
const ENV_NAME_CANARY = "MCP_REQUIREMENT_ENV_CANARY";
const ENV_VALUE_CANARY = "ENV_VALUE_CANARY_NEVER_METADATA";
const STATIC_SLOT_CANARY = "static-slot-canary";
const UNUSED_TARGET_CANARY = "unused_dynamic_canary";
const SECRET_VALUE = "DYNAMIC_RESOLVER_SECRET_CANARY";

function dynamicConfig() {
	return parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{
			id: "production",
			url: ENDPOINT_CANARY,
			tools: [
				{
					name: "search-hotels",
					confirmation: "required",
					authTokens: ["my_oauth"],
					boundParams: ["example_database_password", "static_tenant"],
				},
				{
					name: "update-hotel",
					confirmation: "required",
					boundParams: ["example_database_password"],
				},
				{ name: "denied-tool", confirmation: "required" },
			],
			denyTools: ["denied-tool"],
			headers: {
				"X-Environment": { env: ENV_NAME_CANARY },
				"X-Static": {
					resolver: { provider: "bitwarden-secrets-manager", slot: STATIC_SLOT_CANARY },
				},
				Authorization: {
					resolver: { provider: "onepassword-secrets-manager", dynamic: true },
				},
			},
			authTokens: {
				my_oauth: {
					resolver: { provider: "onepassword-secrets-manager", dynamic: true },
				},
				[UNUSED_TARGET_CANARY]: {
					resolver: { provider: "onepassword-secrets-manager", dynamic: true },
				},
			},
			boundParams: {
				example_database_password: {
					resolver: { provider: "onepassword-secrets-manager", dynamic: true },
				},
				static_tenant: {
					resolver: { provider: "onepassword-secrets-manager", slot: STATIC_SLOT_CANARY },
				},
			},
		}],
	});
}

function assertDeepFrozen(value: unknown, seen = new Set<object>()): void {
	if ((typeof value !== "object" && typeof value !== "function") || value === null) return;
	if (seen.has(value)) return;
	seen.add(value);
	assert.equal(Object.isFrozen(value), true);
	assert.equal(Object.getPrototypeOf(value), Array.isArray(value) ? Array.prototype : Object.prototype);
	assert.ok(Reflect.ownKeys(value).every((key) => typeof key === "string"));
	for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
		assert.ok("value" in descriptor);
		if (!(Array.isArray(value) && key === "length")) assert.equal(descriptor.enumerable, true);
		if ("value" in descriptor) assertDeepFrozen(descriptor.value, seen);
	}
}

function assertMetadataAllowlist(value: unknown): void {
	const serialized = JSON.stringify(value);
	for (const canary of [
		ENDPOINT_CANARY,
		ENV_NAME_CANARY,
		ENV_VALUE_CANARY,
		STATIC_SLOT_CANARY,
		UNUSED_TARGET_CANARY,
		SECRET_VALUE,
		"bitwarden-secrets-manager",
		"onepassword-secrets-manager",
		"requestTimeoutMs",
		"confirmation",
		"toolset",
	]) {
		assert.equal(serialized.includes(canary), false, `metadata leaked ${canary}`);
	}
}

class FakeResolverBus {
	readonly events: Array<{ channel: string; data: unknown }> = [];

	emit(channel: string, data: unknown): void {
		this.events.push({ channel, data });
		if (channel !== SECRET_RESOLVER_V2_REQUEST_CHANNEL) return;
		const request = data as { respond(value: unknown): void };
		request.respond(Object.freeze({
			protocol: "pi.secret-resolver/v2",
			ok: true,
			value: SECRET_VALUE,
		}));
	}
}

test("requirement IDs match normative vectors, canonical framing, grammar, and purpose mapping", () => {
	const vectors = [
		["production", "search-hotels", "header", "Authorization", "mcp1-H-up78DpfeDWHhL5kSewBfL3xa8rljQn2KMjtl_9J4mJo"],
		["production", "search-hotels", "auth-token", "my_oauth", "mcp1-A-mpdPu7zFntHC35CnfFzSwEPToAxpZRtK9b_birVu7Qw"],
		["production", "search-hotels", "bound-param", "example_database_password", "mcp1-B-agZKwxZncAXfB6p1TMx7g0dZQk97793GMxXC_ky7E_A"],
		["production", "update-hotel", "bound-param", "example_database_password", "mcp1-B-IskjbaWlOV5yUhWhfS5l8nG0UWRc5YFkPQh6mOAw4jE"],
	] as const;
	for (const [server, tool, kind, target, expected] of vectors) {
		const actual = deriveRequirementId(server, tool, kind, target);
		assert.equal(actual, expected);
		assert.match(actual, /^mcp1-(H|A|B)-[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u);
		assert.equal(actual.length, 50);
		assert.deepEqual(parseDynamicRequirementId(actual), {
			targetKind: kind,
			purpose: requirementPurpose(kind),
		});
	}
	assert.notEqual(
		deriveRequirementId("a", "bc", "header", "X-Test"),
		deriveRequirementId("ab", "c", "header", "X-Test"),
	);
	for (const invalid of [
		"production-slot",
		"mcp1-h-up78DpfeDWHhL5kSewBfL3xa8rljQn2KMjtl_9J4mJo",
		"mcp1-H-up78DpfeDWHhL5kSewBfL3xa8rljQn2KMjtl_9J4mJp",
		"mcp1-Z-up78DpfeDWHhL5kSewBfL3xa8rljQn2KMjtl_9J4mJo",
	]) assert.equal(parseDynamicRequirementId(invalid), undefined);
});

test("shared planning separates exact server, tool, kind, and target identities", () => {
	const config = dynamicConfig();
	const search = createInvocationSnapshot(config, "production", "search-hotels");
	const update = createInvocationSnapshot(config, "production", "update-hotel");
	const searchPlan = planSelectedCredentials(search.server, search.tool);
	const updatePlan = planSelectedCredentials(update.server, update.tool);
	const ids = new Set(searchPlan.flatMap((item) => item.requirement ? [item.requirement.requirementId] : []));
	assert.equal(ids.size, 3);
	const searchBound = searchPlan.find((item) => item.targetName === "example_database_password")!.requirement!;
	const updateBound = updatePlan.find((item) => item.targetName === "example_database_password")!.requirement!;
	assert.notEqual(searchBound.requirementId, updateBound.requirementId);
	assert.notEqual(
		deriveRequirementId("production", "search-hotels", "header", "X-Same"),
		deriveRequirementId("production", "search-hotels", "auth-token", "X-Same"),
	);
	assert.notEqual(
		deriveRequirementId("production", "search-hotels", "header", "X-One"),
		deriveRequirementId("production", "search-hotels", "header", "X-Two"),
	);
	assert.notEqual(
		deriveRequirementId("production", "search-hotels", "header", "X-Same"),
		deriveRequirementId("secondary", "search-hotels", "header", "X-Same"),
	);
});

test("artifacts expose only canonical selected dynamic metadata in detached deeply frozen graphs", () => {
	process.env[ENV_NAME_CANARY] = ENV_VALUE_CANARY;
	try {
		const config = dynamicConfig();
		const { server, tool } = {
			server: config.servers[0]!,
			tool: config.servers[0]!.tools[0]!,
		};
		const artifacts = createRequirementArtifacts(server, tool);
		assert.deepEqual(Object.keys(artifacts.result.details), ["protocol", "server", "tool", "requirements"]);
		assert.deepEqual(Object.keys(artifacts.event), ["protocol", "action", "server", "tool", "requirements"]);
		assert.equal(artifacts.result.details.protocol, MCP_TOOLBOX_REQUIREMENTS_PROTOCOL);
		assert.equal(artifacts.event.protocol, MCP_TOOLBOX_REQUIREMENTS_PROTOCOL);
		assert.equal(artifacts.event.action, "replace");
		assert.deepEqual(
			artifacts.result.details.requirements.map((record) => [record.targetKind, record.targetName, record.purpose]),
			[
				["header", "Authorization", "mcp-toolbox.header"],
				["auth-token", "my_oauth", "mcp-toolbox.auth-token"],
				["bound-param", "example_database_password", "mcp-toolbox.bound-param"],
			],
		);
		for (const record of artifacts.result.details.requirements) {
			assert.deepEqual(Object.keys(record), ["requirementId", "targetKind", "targetName", "purpose"]);
		}
		assert.equal(artifacts.result.content[0].text, JSON.stringify(artifacts.result.details));
		assert.notEqual(artifacts.result.details.requirements, artifacts.event.requirements);
		assert.notEqual(artifacts.result.details.requirements[0], artifacts.event.requirements[0]);
		assertDeepFrozen(artifacts);
		assertMetadataAllowlist(artifacts);
		assert.deepEqual(createRequirementInvalidationEvent(), {
			protocol: MCP_TOOLBOX_REQUIREMENTS_PROTOCOL,
			action: "invalidate",
		});
		assertDeepFrozen(createRequirementInvalidationEvent());
	} finally {
		delete process.env[ENV_NAME_CANARY];
	}
});

test("offline discovery emits exactly one replace event and constructs no resolver or SDK work", async () => {
	process.env[ENV_NAME_CANARY] = ENV_VALUE_CANARY;
	try {
		const store = new ConfigStore(() => ({ config: dynamicConfig(), source: "package" }));
		const events: unknown[] = [];
		const result = await discoverRequirements(store, {
			server: "production",
			tool: "search-hotels",
		}, { emit(event) { events.push(event); } });
		assert.equal(events.length, 1);
		assert.equal((events[0] as { action: string }).action, "replace");
		assert.deepEqual(result.details.requirements, (events[0] as { requirements: unknown }).requirements);
		assert.notEqual(result.details.requirements, (events[0] as { requirements: unknown }).requirements);
		assertMetadataAllowlist(result);
		assertMetadataAllowlist(events[0]);
		assertDeepFrozen(result);
		assertDeepFrozen(events[0]);
	} finally {
		delete process.env[ENV_NAME_CANARY];
	}
});

test("offline discovery fails closed for malformed, unknown, denied, unconfigured, invalid, and throwing-event cases", async () => {
	const config = dynamicConfig();
	const cases = [
		{ server: "missing", tool: "search-hotels" },
		{ server: "production", tool: "missing" },
		{ server: "production", tool: "denied-tool" },
	];
	for (const input of cases) {
		let emissions = 0;
		await assert.rejects(
			() => discoverRequirements(
				new ConfigStore(() => ({ config, source: "package" })),
				input,
				{ emit() { emissions += 1; } },
			),
			(error: unknown) => error instanceof RequirementDiscoveryError && error.code === "not-allowed",
		);
		assert.equal(emissions, 0);
	}

	let getterInvoked = false;
	const accessor: Record<string, unknown> = { server: "production" };
	Object.defineProperty(accessor, "tool", {
		enumerable: true,
		get() { getterInvoked = true; return "search-hotels"; },
	});
	const symbolInput = { server: "production", tool: "search-hotels" } as Record<PropertyKey, unknown>;
	symbolInput[Symbol("extra")] = true;
	for (const input of [
		accessor,
		symbolInput,
		{ server: "production", tool: "search-hotels", arguments: {} },
		Object.assign(Object.create({ custom: true }), { server: "production", tool: "search-hotels" }),
	]) {
		await assert.rejects(
			() => discoverRequirements(
				new ConfigStore(() => ({ config, source: "package" })),
				input,
				{ emit() { throw new Error("must not emit"); } },
			),
			(error: unknown) => error instanceof RequirementDiscoveryError && error.code === "invalid-input",
		);
	}
	assert.equal(getterInvoked, false);

	await assert.rejects(
		() => discoverRequirements(
			new ConfigStore(() => ({ source: "none" })),
			{ server: "production", tool: "search-hotels" },
			{ emit() {} },
		),
		(error: unknown) => error instanceof RequirementDiscoveryError && error.code === "configuration",
	);
	await assert.rejects(
		() => discoverRequirements(
			new ConfigStore(() => { throw new Error(`${ENDPOINT_CANARY} ${SECRET_VALUE}`); }),
			{ server: "production", tool: "search-hotels" },
			{ emit() {} },
		),
		(error: unknown) => error instanceof RequirementDiscoveryError &&
			error.code === "configuration" &&
			!error.message.includes(ENDPOINT_CANARY) &&
			!error.message.includes(SECRET_VALUE),
	);
	await assert.rejects(
		() => discoverRequirements(
			new ConfigStore(() => ({ config, source: "package" })),
			{ server: "production", tool: "search-hotels" },
			{ emit() { throw new Error(`${ENDPOINT_CANARY} ${SECRET_VALUE}`); } },
		),
		(error: unknown) => error instanceof RequirementDiscoveryError &&
			error.code === "event" &&
			!error.message.includes(ENDPOINT_CANARY) &&
			!error.message.includes(SECRET_VALUE),
	);
});

test("a selected tool with no dynamic references returns and emits a frozen empty requirement set", async () => {
	const config = parseConfig({
		version: 1,
		servers: [{
			id: "local",
			url: "http://127.0.0.1:5000",
			tools: [{ name: "search", confirmation: "not-required" }],
		}],
	});
	let event: unknown;
	const result = await discoverRequirements(
		new ConfigStore(() => ({ config, source: "package" })),
		{ server: "local", tool: "search" },
		{ emit(value) { event = value; } },
	);
	assert.deepEqual(result.details.requirements, []);
	assert.deepEqual((event as { requirements: unknown }).requirements, []);
	assertDeepFrozen(result);
	assertDeepFrozen(event);
});

test("actual invocation planner converts dynamic targets to isolated protocol-v2 slots and derived purposes", async () => {
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 2_000,
		servers: [{
			id: "production",
			url: "https://toolbox.example.test",
			tools: [{
				name: "search-hotels",
				confirmation: "not-required",
				boundParams: ["database_password"],
			}],
			headers: {
				Authorization: { resolver: { provider: "onepassword-secrets-manager", dynamic: true } },
			},
			boundParams: {
				database_password: { resolver: { provider: "onepassword-secrets-manager", dynamic: true } },
			},
		}],
	});
	const invocation = createInvocationSnapshot(config, "production", "search-hotels");
	const bus = new FakeResolverBus();
	const consumer = new SecretResolverConsumer(bus, {
		requestId: (() => {
			let value = 0;
			return () => `requirements-planner-${String(++value).padStart(4, "0")}`;
		})(),
		maxWaitMs: 100,
	});
	const material = await resolveCredentialMaterial(
		invocation.server,
		invocation.tool,
		consumer,
		new AbortController().signal,
		Date.now() + 1_000,
	);
	assert.equal(material.headers.Authorization, SECRET_VALUE);
	assert.equal(material.boundParams.database_password, SECRET_VALUE);
	assert.equal(bus.events.length, 2);
	const requests = bus.events.map((event) => {
		assert.equal(event.channel, SECRET_RESOLVER_V2_REQUEST_CHANNEL);
		return event.data as {
			provider: string;
			slot: string;
			purpose: string;
			consumer: string;
		};
	});
	assert.deepEqual(
		requests.map(({ provider, slot, purpose, consumer }) => ({ provider, slot, purpose, consumer })),
		[
			{
				provider: ONEPASSWORD_RESOLVER_PROVIDER,
				slot: deriveRequirementId("production", "search-hotels", "header", "Authorization"),
				purpose: "mcp-toolbox.header",
				consumer: "mcp-toolbox",
			},
			{
				provider: ONEPASSWORD_RESOLVER_PROVIDER,
				slot: deriveRequirementId("production", "search-hotels", "bound-param", "database_password"),
				purpose: "mcp-toolbox.bound-param",
				consumer: "mcp-toolbox",
			},
		],
	);
	assert.notEqual(requests[0]!.slot, requests[1]!.slot);
	consumer.shutdown();
});

test("index registers the fixed offline requirements tool and versioned event channel without SDK use in its implementation", async () => {
	const index = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
	const implementation = await readFile(new URL("../src/requirements-tool.ts", import.meta.url), "utf8");
	assert.match(index, /name: "mcp_toolbox_requirements"/u);
	assert.match(index, /executionMode: "sequential"/u);
	assert.match(index, /discoverRequirements\(store/u);
	assert.ok(index.includes("MCP_TOOLBOX_REQUIREMENTS_CHANNEL"));
	assert.equal(MCP_TOOLBOX_REQUIREMENTS_CHANNEL, "pi:mcp-toolbox:requirements:v1");
	assert.doesNotMatch(
		implementation,
		/createToolboxSdkClient|ToolboxManager|SecretResolverConsumer|fetch\(|axios|process\.env\[|\.resolve\(/u,
	);
});
