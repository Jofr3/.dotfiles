import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import test from "node:test";
import {
	MAX_CACHED_REQUIREMENT_SCOPES,
	MAX_REQUIREMENTS_PER_EVENT,
	MCP_TOOLBOX_REQUIREMENTS_CHANNEL,
	MCP_TOOLBOX_REQUIREMENTS_PROTOCOL,
	parseDynamicRequirementId,
	RequirementMetadataCache,
} from "../src/requirements.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const VECTOR_ID = "mcp1-B-agZKwxZncAXfB6p1TMx7g0dZQk97793GMxXC_ky7E_A";
const MCP_SOURCE = new URL("../../mcp-toolbox/src/requirements.ts", import.meta.url);
const MCP_AVAILABLE = existsSync(MCP_SOURCE);
const REQUIREMENT_PREFIX = { header: "mcp1-H-", "auth-token": "mcp1-A-", "bound-param": "mcp1-B-" } as const;

function frame(value: string): Buffer {
	const bytes = Buffer.from(value, "utf8");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(bytes.byteLength, 0);
	return Buffer.concat([length, bytes]);
}

function deriveRequirementId(
	server: string,
	tool: string,
	targetKind: "header" | "auth-token" | "bound-param",
	targetName: string,
): string {
	const suffix = createHash("sha256").update(Buffer.concat([
		Buffer.from("pi.mcp-toolbox.requirement-id\0", "ascii"),
		frame("1"), frame(server), frame(tool), frame(targetKind), frame(targetName),
	])).digest("base64url");
	return `${REQUIREMENT_PREFIX[targetKind]}${suffix}`;
}

function requirementId(marker: "H" | "A" | "B", seed: number): string {
	const digest = Buffer.alloc(32);
	digest.writeUInt32BE(seed >>> 0, 28);
	return `mcp1-${marker}-${digest.toString("base64url")}`;
}

function purpose(marker: "H" | "A" | "B") {
	if (marker === "H") return "mcp-toolbox.header" as const;
	if (marker === "A") return "mcp-toolbox.auth-token" as const;
	return "mcp-toolbox.bound-param" as const;
}

function kind(marker: "H" | "A" | "B") {
	if (marker === "H") return "header" as const;
	if (marker === "A") return "auth-token" as const;
	return "bound-param" as const;
}

function record(
	marker: "H" | "A" | "B" = "B",
	seed = 1,
	targetName = `target_${seed}`,
	server = "production",
	tool = "search-hotels",
) {
	const targetKind = kind(marker);
	const canonicalTarget = marker === "H" ? `X-Target-${seed}` : targetName;
	return Object.freeze({
		requirementId: deriveRequirementId(server, tool, targetKind, canonicalTarget),
		targetKind,
		targetName: canonicalTarget,
		purpose: purpose(marker),
	});
}

function replace(
	server = "production",
	tool = "search-hotels",
	requirements: readonly object[] = [record()],
) {
	return Object.freeze({
		protocol: MCP_TOOLBOX_REQUIREMENTS_PROTOCOL,
		action: "replace" as const,
		server,
		tool,
		requirements: Object.freeze([...requirements]),
	});
}

function invalidate() {
	return Object.freeze({
		protocol: MCP_TOOLBOX_REQUIREMENTS_PROTOCOL,
		action: "invalidate" as const,
	});
}

function assertRetained(
	cache: RequirementMetadataCache,
	requirementId: string,
	callbackCount: number,
	invalidations: readonly unknown[],
): void {
	assert.equal(cache.lookup(requirementId)?.requirementId, requirementId);
	assert.equal(invalidations.length, callbackCount);
	assert.equal(cache.status().requirementCount, 1);
}

test("consumer constants and strict ID/purpose parser match the completed MCP producer", { skip: !MCP_AVAILABLE }, async () => {
	const producer = await import(MCP_SOURCE.href);
	assert.equal(MCP_TOOLBOX_REQUIREMENTS_PROTOCOL, producer.MCP_TOOLBOX_REQUIREMENTS_PROTOCOL);
	assert.equal(MCP_TOOLBOX_REQUIREMENTS_CHANNEL, "pi:mcp-toolbox:requirements:v1");
	assert.deepEqual(parseDynamicRequirementId(VECTOR_ID), {
		targetKind: "bound-param",
		purpose: "mcp-toolbox.bound-param",
	});
	for (const invalid of [
		"legacy-slot",
		"mcp1-b-agZKwxZncAXfB6p1TMx7g0dZQk97793GMxXC_ky7E_A",
		"mcp1-Z-agZKwxZncAXfB6p1TMx7g0dZQk97793GMxXC_ky7E_A",
		"mcp1-B-agZKwxZncAXfB6p1TMx7g0dZQk97793GMxXC_ky7E_B",
		`${VECTOR_ID}x`,
	]) assert.equal(parseDynamicRequirementId(invalid), undefined);
});

test("listener checks live resolver mode and does not inspect events outside dynamic mode", () => {
	let dynamicMode = true;
	let getterCalls = 0;
	const cache = new RequirementMetadataCache(undefined, () => dynamicMode);
	cache.enable();
	const hostile = {} as Record<string, unknown>;
	Object.defineProperty(hostile, "action", {
		enumerable: true,
		get() { getterCalls += 1; return "replace"; },
	});
	dynamicMode = false;
	assert.equal(cache.handleEvent(hostile), false);
	assert.equal(cache.lookup(requirementId("B", 1)), undefined);
	assert.equal(getterCalls, 0);
	assert.equal(cache.status().enabled, false);
	dynamicMode = true;
	assert.equal(cache.handleEvent(replace()), true);
	assert.equal(cache.status().enabled, true);
});

test("actual MCP artifact is admitted only while enabled and becomes detached frozen exact metadata", { skip: !MCP_AVAILABLE }, async () => {
	const { createRequirementArtifacts } = await import(MCP_SOURCE.href);
	let disabledGetter = 0;
	const disabledEvent = {} as Record<string, unknown>;
	Object.defineProperty(disabledEvent, "protocol", {
		enumerable: true,
		get() { disabledGetter += 1; return MCP_TOOLBOX_REQUIREMENTS_PROTOCOL; },
	});
	const cache = new RequirementMetadataCache();
	assert.equal(cache.handleEvent(disabledEvent), false);
	assert.equal(disabledGetter, 0, "disabled cache must not inspect event data");

	cache.enable();
	const artifacts = createRequirementArtifacts({
		id: "production",
		headers: Object.create(null),
		authTokens: Object.create(null),
		boundParams: {
			example_database_password: {
				resolver: { provider: "onepassword-secrets-manager", dynamic: true },
			},
		},
	}, {
		name: "search-hotels",
		confirmation: "not-required",
		authTokens: [],
		boundParams: ["example_database_password"],
	});
	assert.equal(cache.handleEvent(artifacts.event), true);
	const cached = cache.lookup(VECTOR_ID);
	assert.deepEqual(cached, {
		requirementId: VECTOR_ID,
		server: "production",
		tool: "search-hotels",
		targetKind: "bound-param",
		targetName: "example_database_password",
		purpose: "mcp-toolbox.bound-param",
	});
	assert.equal(Object.isFrozen(cached), true);
	assert.notEqual(cached, artifacts.event.requirements[0]);
	assert.equal(cache.isCurrent(cached!), true);
	assert.deepEqual(cache.status(), { enabled: true, scopeCount: 1, requirementCount: 1 });
});

test("descriptor parser rejects accessors, symbols, extras, custom prototypes, mutability, and non-dense arrays without invocation", () => {
	const invalidations: unknown[] = [];
	const cache = new RequirementMetadataCache((records) => { invalidations.push(records); });
	cache.enable();
	const baseline = record("B", 90, "baseline", "production", "baseline-tool");
	assert.equal(cache.handleEvent(replace("production", "baseline-tool", [baseline])), true);
	const id = baseline.requirementId;
	let callbackCount = 0;

	let topGetter = 0;
	const accessorTop = {
		action: "replace",
		server: "production",
		tool: "search-hotels",
		requirements: Object.freeze([record()]),
	} as Record<string, unknown>;
	Object.defineProperty(accessorTop, "protocol", {
		enumerable: true,
		get() { topGetter += 1; return MCP_TOOLBOX_REQUIREMENTS_PROTOCOL; },
	});
	Object.freeze(accessorTop);

	let recordGetter = 0;
	const accessorRecord = {
		targetKind: "bound-param",
		targetName: "db",
		purpose: "mcp-toolbox.bound-param",
	} as Record<string, unknown>;
	Object.defineProperty(accessorRecord, "requirementId", {
		enumerable: true,
		get() { recordGetter += 1; return requirementId("B", 1); },
	});
	Object.freeze(accessorRecord);

	const customTop = Object.assign(Object.create({ inherited: true }), {
		protocol: MCP_TOOLBOX_REQUIREMENTS_PROTOCOL,
		action: "replace",
		server: "production",
		tool: "search-hotels",
		requirements: Object.freeze([record()]),
	});
	Object.freeze(customTop);
	const customRecord = Object.assign(Object.create({ inherited: true }), {
		requirementId: requirementId("B", 2),
		targetKind: "bound-param",
		targetName: "db",
		purpose: "mcp-toolbox.bound-param",
	});
	Object.freeze(customRecord);
	const nullPrototypeTop = Object.assign(Object.create(null), replace());
	Object.freeze(nullPrototypeTop);
	const nullPrototypeRecord = Object.assign(Object.create(null), record("B", 16));
	Object.freeze(nullPrototypeRecord);
	const symbolTop = { ...replace() } as Record<PropertyKey, unknown>;
	symbolTop[Symbol("extra")] = true;
	Object.freeze(symbolTop);
	const symbolRecord = { ...record("B", 3) } as Record<PropertyKey, unknown>;
	symbolRecord[Symbol("extra")] = true;
	Object.freeze(symbolRecord);
	const symbolArray = [record("B", 4)] as Array<object> & Record<PropertyKey, unknown>;
	symbolArray[Symbol("extra")] = true;
	Object.freeze(symbolArray);
	const hiddenTop = { ...replace() } as Record<string, unknown>;
	Object.defineProperty(hiddenTop, "hidden", { value: true, enumerable: false });
	Object.freeze(hiddenTop);
	const hiddenRecord = { ...record("B", 41) } as Record<string, unknown>;
	Object.defineProperty(hiddenRecord, "hidden", { value: true, enumerable: false });
	Object.freeze(hiddenRecord);
	const extraArray = [record("B", 42)] as Array<object> & Record<string, unknown>;
	Object.defineProperty(extraArray, "extra", { value: true, enumerable: false });
	Object.freeze(extraArray);
	const sparse = [record("B", 5), , record("B", 6)];
	Object.freeze(sparse);

	const mutableArray = [record("B", 7)];
	const mutableRecord = { ...record("B", 8) };
	const cases: unknown[] = [
		{ ...replace() },
		Object.freeze({ ...replace(), requirements: mutableArray }),
		Object.freeze({ ...replace(), requirements: Object.freeze([mutableRecord]) }),
		accessorTop,
		Object.freeze({ ...replace(), requirements: Object.freeze([accessorRecord]) }),
		customTop,
		Object.freeze({ ...replace(), requirements: Object.freeze([customRecord]) }),
		nullPrototypeTop,
		Object.freeze({ ...replace(), requirements: Object.freeze([nullPrototypeRecord]) }),
		symbolTop,
		Object.freeze({ ...replace(), requirements: Object.freeze([symbolRecord]) }),
		Object.freeze({ ...replace(), requirements: symbolArray }),
		hiddenTop,
		Object.freeze({ ...replace(), requirements: Object.freeze([hiddenRecord]) }),
		Object.freeze({ ...replace(), requirements: extraArray }),
		Object.freeze({ ...replace(), requirements: sparse }),
		Object.freeze({ ...replace(), extra: true }),
	];
	for (const value of cases) {
		assert.equal(cache.handleEvent(value), false);
		assertRetained(cache, id, callbackCount, invalidations);
	}
	assert.equal(topGetter, 0);
	assert.equal(recordGetter, 0);
});

test("malformed protocols, names, counts, duplicate identities, and prefix/kind/purpose spoofing fail atomically", () => {
	const invalidations: unknown[] = [];
	const cache = new RequirementMetadataCache((records) => { invalidations.push(records); });
	cache.enable();
	const baseline = record("B", 91, "baseline", "production", "baseline-tool");
	assert.equal(cache.handleEvent(replace("production", "baseline-tool", [baseline])), true);
	const id = baseline.requirementId;

	const wrongKind = Object.freeze({ ...record("B", 10), targetKind: "auth-token" });
	const wrongPurpose = Object.freeze({ ...record("B", 11), purpose: "mcp-toolbox.header" });
	const badFinal = Object.freeze({ ...record("B", 12), requirementId: `${requirementId("B", 12).slice(0, -1)}B` });
	const forbiddenHeader = Object.freeze({ ...record("H", 23), targetName: "Host" });
	const oversized = Object.freeze(Array.from(
		{ length: MAX_REQUIREMENTS_PER_EVENT + 1 },
		(_, index) => record("B", 100 + index),
	));
	const cases: unknown[] = [
		Object.freeze({ ...replace(), protocol: "pi.mcp-toolbox.requirements/v2" }),
		Object.freeze({ protocol: MCP_TOOLBOX_REQUIREMENTS_PROTOCOL, action: "spoof" }),
		Object.freeze({ ...replace(), server: "Production" }),
		Object.freeze({ ...replace(), tool: "unsafe/tool" }),
		Object.freeze({ ...replace(), requirements: Object.freeze([wrongKind]) }),
		Object.freeze({ ...replace(), requirements: Object.freeze([wrongPurpose]) }),
		Object.freeze({ ...replace(), requirements: Object.freeze([badFinal]) }),
		Object.freeze({ ...replace(), requirements: Object.freeze([forbiddenHeader]) }),
		Object.freeze({ ...replace(), requirements: oversized }),
		Object.freeze({ ...replace(), requirements: Object.freeze([record("B", 13), record("B", 13)]) }),
		Object.freeze({ ...replace(), requirements: Object.freeze([record("B", 16), record("H", 17)]) }),
		Object.freeze({ ...replace(), requirements: Object.freeze([
			record("B", 18, "z_target"),
			record("B", 19, "a_target"),
		]) }),
		Object.freeze({
			...replace(),
			requirements: Object.freeze([record("B", 14, "same"), record("B", 15, "same")]),
		}),
		Object.freeze({ ...invalidate(), extra: true }),
	];
	for (const value of cases) {
		assert.equal(cache.handleEvent(value), false);
		assertRetained(cache, id, 0, invalidations);
	}
});

test("scoped replacement is atomic, preserves other scopes, rejects cross-scope ID collisions, and invalidates only replaced records", () => {
	const invalidated: string[][] = [];
	const cache = new RequirementMetadataCache((records) => {
		invalidated.push(records.map((item) => item.requirementId));
	});
	cache.enable();
	const first = record("B", 20, "db_one", "production", "first-tool");
	const second = record("A", 21, "oauth_two", "production", "second-tool");
	assert.equal(cache.handleEvent(replace("production", "first-tool", [first])), true);
	assert.equal(cache.handleEvent(replace("production", "second-tool", [second])), true);
	assert.deepEqual(cache.status(), { enabled: true, scopeCount: 2, requirementCount: 2 });

	const colliding = Object.freeze({ ...first, targetName: "other_db" });
	assert.equal(cache.handleEvent(replace("secondary", "third-tool", [colliding])), false);
	assert.equal(cache.lookup(first.requirementId)?.tool, "first-tool");
	assert.equal(cache.lookup(second.requirementId)?.tool, "second-tool");
	assert.deepEqual(invalidated, []);

	const replacement = record("H", 22, "target_22", "production", "first-tool");
	assert.equal(cache.handleEvent(replace("production", "first-tool", [replacement])), true);
	assert.equal(cache.lookup(first.requirementId), undefined);
	assert.equal(cache.lookup(replacement.requirementId)?.tool, "first-tool");
	assert.equal(cache.lookup(second.requirementId)?.tool, "second-tool");
	assert.deepEqual(invalidated, [[first.requirementId]]);
	assert.deepEqual(cache.status(), { enabled: true, scopeCount: 2, requirementCount: 2 });
});

test("cache scope bound rejects flooding without evicting admitted metadata", () => {
	const cache = new RequirementMetadataCache();
	cache.enable();
	for (let index = 0; index < MAX_CACHED_REQUIREMENT_SCOPES; index += 1) {
		assert.equal(cache.handleEvent(replace(
			"production",
			`tool_${index}`,
			[record("B", 1_000 + index, `target_${1_000 + index}`, "production", `tool_${index}`)],
		)), true);
	}
	assert.deepEqual(cache.status(), {
		enabled: true,
		scopeCount: MAX_CACHED_REQUIREMENT_SCOPES,
		requirementCount: MAX_CACHED_REQUIREMENT_SCOPES,
	});
	const overflow = record("B", 9_999, "target_9999", "production", "one_too_many");
	assert.equal(cache.handleEvent(replace("production", "one_too_many", [overflow])), false);
	assert.equal(cache.lookup(
		deriveRequirementId("production", "tool_0", "bound-param", "target_1000"),
	)?.tool, "tool_0");
	assert.equal(cache.lookup(overflow.requirementId), undefined);
});

class StaleListenerBus {
	readonly listeners = new Set<(value: unknown) => void>();

	on(channel: string, listener: (value: unknown) => void): () => void {
		assert.equal(channel, MCP_TOOLBOX_REQUIREMENTS_CHANNEL);
		this.listeners.add(listener);
		return () => { throw new Error("unsubscribe failure"); };
	}

	emit(value: unknown): void {
		for (const listener of this.listeners) listener(value);
	}
}

test("disable/invalidate clear metadata and shutdown unsubscribes or leaves stale listeners inert", () => {
	const invalidated: string[][] = [];
	const bus = new StaleListenerBus();
	const cache = new RequirementMetadataCache((records) => {
		invalidated.push(records.map((item) => item.requirementId));
	});
	cache.start(bus);
	cache.enable();
	const first = record("B", 30, "target_30", "production", "search");
	bus.emit(replace("production", "search", [first]));
	assert.equal(cache.lookup(first.requirementId)?.tool, "search");
	bus.emit(invalidate());
	assert.deepEqual(cache.status(), { enabled: true, scopeCount: 0, requirementCount: 0 });
	assert.deepEqual(invalidated, [[first.requirementId]]);

	const second = record("B", 31, "target_31", "production", "search");
	bus.emit(replace("production", "search", [second]));
	cache.disable();
	assert.deepEqual(cache.status(), { enabled: false, scopeCount: 0, requirementCount: 0 });
	assert.deepEqual(invalidated, [[first.requirementId], [second.requirementId]]);
	bus.emit(replace("production", "search", [first]));
	assert.equal(cache.lookup(first.requirementId), undefined);

	cache.enable();
	bus.emit(replace("production", "search", [first]));
	cache.shutdown();
	assert.deepEqual(cache.status(), { enabled: false, scopeCount: 0, requirementCount: 0 });
	assert.deepEqual(invalidated, [[first.requirementId], [second.requirementId], [first.requirementId]]);
	bus.emit(replace("production", "search", [second]));
	assert.equal(cache.lookup(second.requirementId), undefined);
	assert.throws(() => cache.enable());
});
