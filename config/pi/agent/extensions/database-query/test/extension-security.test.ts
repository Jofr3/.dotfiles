import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { DatabaseProfile } from "../profile.ts";
import { deriveProjectScopeId } from "../protocol.ts";
import { loadProtectedStaticDatabaseProfile } from "../static-config.ts";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "typebox") return { url: "database-query-test:typebox", shortCircuit: true };
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url === "database-query-test:typebox") {
			return {
				format: "module",
				shortCircuit: true,
				source: `
					const node = (kind, value, options = {}) => ({ kind, value, ...options });
					export const Type = {
						Object: (properties, options = {}) => node("object", properties, options),
						String: (options = {}) => node("string", undefined, options),
						Optional: (value) => ({ ...value, optional: true }),
					};
				`,
			};
		}
		return nextLoad(url, context);
	},
});

const PASSWORD = "EXTENSION_PASSWORD_CANARY_NEVER_PUBLIC";
const ERROR_CANARY = "EXTENSION_INTERNAL_ERROR_CANARY_NEVER_PUBLIC";
const PROJECT_PATH = "/offline/projects/extension-security";
const PROJECT_SCOPE = Object.freeze({
	projectPath: PROJECT_PATH,
	projectScopeId: deriveProjectScopeId(PROJECT_PATH),
});
const DYNAMIC_PROFILE_TEXT = JSON.stringify({
	version: 1,
	engine: "mysql",
	host: "127.0.0.1",
	port: 3306,
	user: "dynamic_user",
	password: PASSWORD,
	database: "dynamic_db",
});
const STATIC_PROFILE: DatabaseProfile = Object.freeze({
	version: 1,
	engine: "mysql",
	host: "127.0.0.1",
	port: 3306,
	user: "static_user",
	password: PASSWORD,
	database: "static_db",
});

interface Tool {
	name: string;
	description: string;
	parameters: { kind: string; value: Record<string, unknown>; additionalProperties?: boolean };
	executionMode?: string;
	promptGuidelines?: string[];
	execute(...args: unknown[]): Promise<unknown>;
}

class EventBus {
	readonly observed: Array<{ channel: string; data: unknown }> = [];
	#listeners = new Map<string, Set<(data: unknown) => void>>();
	on(channel: string, handler: (data: unknown) => void): () => void {
		const handlers = this.#listeners.get(channel) ?? new Set<(data: unknown) => void>();
		handlers.add(handler);
		this.#listeners.set(channel, handlers);
		return () => { handlers.delete(handler); };
	}
	emit(channel: string, data: unknown): void {
		this.observed.push({ channel, data });
		for (const handler of this.#listeners.get(channel) ?? []) handler(data);
	}
}

async function extensionHarness(options: {
	trusted?: boolean;
	confirm?: (title: string, message: string, options: unknown) => Promise<boolean>;
	runner?: { run(...args: unknown[]): Promise<unknown> };
	loadStatic?: () => DatabaseProfile;
	profileResolver?: { resolve(...args: unknown[]): Promise<string>; invalidate(): void; shutdown(): void };
} = {}) {
	const bus = new EventBus();
	const tools = new Map<string, Tool>();
	const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
	const commands = new Map<string, { handler(args: string, ctx: unknown): Promise<void> }>();
	const messages: string[] = [];
	const notifications: Array<{ text: string; level: string }> = [];
	const confirmations: Array<{ title: string; message: string; options: unknown }> = [];
	const updates: unknown[] = [];
	let runnerCalls = 0;
	const runner = options.runner ?? {
		async run() {
			runnerCalls += 1;
			return Object.freeze({ ok: true, stdout: Buffer.from("id\tname\n1\talice\n"), elapsedMs: 5 });
		},
	};
	const pi = {
		events: bus,
		registerTool(tool: Tool) { tools.set(tool.name, tool); },
		registerCommand(name: string, command: { handler(args: string, ctx: unknown): Promise<void> }) { commands.set(name, command); },
		on(name: string, handler: (event: unknown, ctx: unknown) => unknown) {
			const entries = handlers.get(name) ?? [];
			entries.push(handler);
			handlers.set(name, entries);
		},
		sendUserMessage(message: string) { messages.push(message); },
	};
	const { registerDatabaseExtension } = await import(`../extension.ts?harness=${Math.random()}`);
	registerDatabaseExtension(pi as never, {
		canonicalizeProject: () => PROJECT_SCOPE,
		loadStaticProfile: options.loadStatic ?? (() => STATIC_PROFILE),
		runner: runner as never,
		...(options.profileResolver === undefined ? {} : { profileResolver: options.profileResolver as never }),
	});
	const ctx = {
		cwd: PROJECT_PATH,
		hasUI: true,
		isProjectTrusted: () => options.trusted ?? true,
		ui: {
			async confirm(title: string, message: string, confirmOptions: unknown) {
				confirmations.push({ title, message, options: confirmOptions });
				return options.confirm?.(title, message, confirmOptions) ?? true;
			},
			notify(text: string, level: string) { notifications.push({ text, level }); },
		},
	};
	return {
		bus, tools, handlers, commands, messages, notifications, confirmations, updates, ctx,
		get runnerCalls() { return runnerCalls; },
		async query(params: unknown, signal = new AbortController().signal, context: unknown = ctx) {
			return tools.get("database_query")!.execute("query-call", params, signal, (update: unknown) => updates.push(update), context);
		},
		async lifecycle(name: string, event: unknown = {}) {
			for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
		},
	};
}

function assertFixedFailure(error: unknown, code: string): boolean {
	assert.ok(error instanceof Error);
	assert.equal(error.name, "DatabaseQueryError");
	assert.match(error.message, new RegExp(`^Database query failed \\(${code}\\)\\.`));
	for (const canary of [PASSWORD, ERROR_CANARY, "op://"]) assert.equal(error.message.includes(canary), false);
	return true;
}

test("registered tools are sequential, exact, and expose no model-controlled database or credential override", async () => {
	const harness = await extensionHarness();
	assert.deepEqual([...harness.tools.keys()], ["database_profile_requirements", "database_query"]);
	for (const tool of harness.tools.values()) {
		assert.equal(tool.executionMode, "sequential");
		assert.equal(tool.parameters.kind, "object");
		assert.equal(tool.parameters.additionalProperties, false);
	}
	assert.deepEqual(Object.keys(harness.tools.get("database_profile_requirements")!.parameters.value), ["profileName"]);
	assert.deepEqual(Object.keys(harness.tools.get("database_query")!.parameters.value), ["query", "profileId"]);
	for (const forbidden of ["databaseOverride", "hostOverride", "password", "connectionUrl", "secretReference"]) {
		assert.equal(Object.keys(harness.tools.get("database_query")!.parameters.value).includes(forbidden), false);
	}
	assert.deepEqual([...harness.commands.keys()], ["database", "database-profile-clear"]);
	assert.deepEqual([...harness.handlers.keys()], [
		"session_before_switch",
		"session_before_fork",
		"session_before_tree",
		"session_before_compact",
		"turn_end",
		"agent_end",
		"session_shutdown",
	]);
});

test("trusted legacy static profile remains compatible and read-only SQL needs no confirmation", async () => {
	let observedProfile: DatabaseProfile | undefined;
	let observedQuery = "";
	const harness = await extensionHarness({
		runner: {
			async run(profile, query) {
				observedProfile = profile as DatabaseProfile;
				observedQuery = query as string;
				return Object.freeze({ ok: true, stdout: Buffer.from("id\tname\n1\talice\n"), elapsedMs: 4 });
			},
		},
	});
	const result = await harness.query({ query: "SELECT id, name FROM users" }) as {
		content: Array<{ text: string }>;
		details: Record<string, unknown>;
	};
	assert.equal(observedProfile, STATIC_PROFILE);
	assert.equal(observedQuery, "SELECT id, name FROM users");
	assert.equal(harness.confirmations.length, 0);
	assert.match(result.content[0]!.text, /alice/u);
	assert.deepEqual(result.details, {
		success: true,
		profile: "legacy-static",
		classification: "read-only",
		statementCount: 1,
		displayedRows: 2,
		truncated: false,
		elapsedMs: 4,
	});
	for (const publicValue of [result, harness.updates, harness.confirmations]) {
		const text = JSON.stringify(publicValue);
		assert.equal(text.includes(PASSWORD), false);
		assert.equal(text.includes("op://"), false);
	}
});

test("legacy static profile is denied for untrusted projects before config loading or runner work", async () => {
	let loads = 0;
	const harness = await extensionHarness({
		trusted: false,
		loadStatic: () => { loads += 1; return STATIC_PROFILE; },
	});
	await assert.rejects(() => harness.query({ query: "SELECT 1" }), (error) => assertFixedFailure(error, "project_not_trusted"));
	assert.equal(loads, 0);
	assert.equal(harness.runnerCalls, 0);
});

test("destructive, unknown, function, sequence, and multiple SQL require informed confirmation and fail closed headlessly", async () => {
	for (const query of [
		"UPDATE users SET active = 0",
		"VACUUM",
		"SELECT app.audit_read()",
		"SELECT NEXT VALUE FOR dbo.order_seq",
		"SELECT 1; SELECT 2",
	]) {
		const denied = await extensionHarness({ confirm: async () => false });
		await assert.rejects(() => denied.query({ query }), (error) => assertFixedFailure(error, "confirmation_denied"));
		assert.equal(denied.runnerCalls, 0);
		assert.equal(denied.confirmations.length, 1);
		const approval = denied.confirmations[0]!;
		for (const expected of [PROJECT_PATH, PROJECT_SCOPE.projectScopeId, "legacy-static", "SQL SHA-256:", "Statements:", "Preview:"]) {
			assert.equal(approval.message.includes(expected), true, expected);
		}
		assert.equal(approval.message.includes(PASSWORD), false);
		assert.equal(approval.message.includes("op://"), false);

		const headless = await extensionHarness();
		await assert.rejects(
			() => headless.query({ query }, undefined, { ...headless.ctx, hasUI: false }),
			(error) => assertFixedFailure(error, "confirmation_required"),
		);
		assert.equal(headless.confirmations.length, 0);
		assert.equal(headless.runnerCalls, 0);
	}
});

test("tool input parser rejects getters, custom prototypes, symbols, extra routing and oversized SQL before work", async () => {
	const harness = await extensionHarness();
	let getterCalls = 0;
	const getter = {} as Record<string, unknown>;
	Object.defineProperty(getter, "query", {
		enumerable: true,
		get() { getterCalls += 1; return "SELECT 1"; },
	});
	const custom = Object.assign(Object.create({ inherited: true }), { query: "SELECT 1" });
	const symbol = { query: "SELECT 1" } as Record<PropertyKey, unknown>;
	symbol[Symbol("database")] = "other";
	for (const input of [
		getter,
		custom,
		symbol,
		{ query: "SELECT 1", database: "other" },
		{ query: "SELECT 1", host: "attacker" },
		{ query: "SELECT 1", profileId: "not-an-id" },
		{ query: "x".repeat(64 * 1024 + 1) },
	]) await assert.rejects(() => harness.query(input), (error) => assertFixedFailure(error, input === getter || input === custom || input === symbol || "database" in input || "host" in input || "profileId" in input ? "invalid_input" : "sql_rejected"));
	assert.equal(getterCalls, 0);
	assert.equal(harness.runnerCalls, 0);
});

test("fixed runner failures and output rejection never expose child diagnostics or profile material", async () => {
	for (const result of [
		Object.freeze({ ok: false, code: "client_unavailable", elapsedMs: 1 }),
		Object.freeze({ ok: false, code: "client_error", elapsedMs: 1 }),
		Object.freeze({ ok: false, code: "timeout", elapsedMs: 30_000 }),
		Object.freeze({ ok: false, code: "aborted", elapsedMs: 1 }),
		Object.freeze({ ok: false, code: "output_limit", elapsedMs: 1 }),
	]) {
		const harness = await extensionHarness({ runner: { async run() { return result; } } });
		await assert.rejects(() => harness.query({ query: "SELECT 1" }), (error) => assertFixedFailure(error, result.code));
	}
	const invalidOutput = await extensionHarness({
		runner: { async run() { return Object.freeze({ ok: true, stdout: Buffer.from([0xc3, 0x28]), elapsedMs: 1 }); } },
	});
	await assert.rejects(() => invalidOutput.query({ query: "SELECT 1" }), (error) => assertFixedFailure(error, "output_rejected"));
});

test("every admitted dynamic attempt consumes its exact requirement on success, resolver/profile/connection/SQL/abort/timeout/output failure", async () => {
	const scenarios: Array<{
		name: string;
		resolve?: () => Promise<string>;
		run?: () => Promise<unknown>;
		failure?: string;
	}> = [
		{ name: "success", run: async () => Object.freeze({ ok: true, stdout: Buffer.from("row\\tok\\n"), elapsedMs: 1 }) },
		{ name: "resolver failure", resolve: async () => { throw new Error(`${ERROR_CANARY}:${PASSWORD}`); }, failure: "profile_resolution" },
		{ name: "malformed profile", resolve: async () => "{ malformed profile", failure: "profile_invalid" },
		{ name: "connection failure", run: async () => Object.freeze({ ok: false, code: "client_unavailable", elapsedMs: 1 }), failure: "client_unavailable" },
		{ name: "SQL failure", run: async () => Object.freeze({ ok: false, code: "client_error", elapsedMs: 1 }), failure: "client_error" },
		{ name: "abort", run: async () => Object.freeze({ ok: false, code: "aborted", elapsedMs: 1 }), failure: "aborted" },
		{ name: "timeout", run: async () => Object.freeze({ ok: false, code: "timeout", elapsedMs: 30_000 }), failure: "timeout" },
		{ name: "output limit", run: async () => Object.freeze({ ok: false, code: "output_limit", elapsedMs: 1 }), failure: "output_limit" },
		{ name: "output decode", run: async () => Object.freeze({ ok: true, stdout: Buffer.from([0xc3, 0x28]), elapsedMs: 1 }), failure: "output_rejected" },
	];
	for (const scenario of scenarios) {
		let resolveCalls = 0;
		const harness = await extensionHarness({
			profileResolver: {
				async resolve() { resolveCalls += 1; return scenario.resolve?.() ?? DYNAMIC_PROFILE_TEXT; },
				invalidate() {},
				shutdown() {},
			},
			runner: { async run() { return scenario.run?.() ?? Object.freeze({ ok: true, stdout: Buffer.from("row\\tok\\n"), elapsedMs: 1 }); } },
		});
		const prepared = await harness.tools.get("database_profile_requirements")!.execute(
			"prepare", { profileName: scenario.name.replaceAll(" ", "-").toLowerCase() }, new AbortController().signal, undefined, harness.ctx,
		) as { details: { profileId: string } };
		const call = () => harness.query({ query: "SELECT 1", profileId: prepared.details.profileId });
		if (scenario.failure === undefined) assert.equal((await call() as { details: { success: boolean } }).details.success, true);
		else await assert.rejects(call, (error) => assertFixedFailure(error, scenario.failure!));
		assert.equal(resolveCalls, 1, `${scenario.name} must resolve at most once after admission`);
		await assert.rejects(call, (error) => assertFixedFailure(error, "profile_not_current"));
		assert.equal(resolveCalls, 1, `${scenario.name} replay must not resolve again`);
	}
});

test("function and sequence confirmation cancellation burns an already-approved dynamic requirement before resolution", async () => {
	for (const [query, profileName] of [
		["SELECT app.audit_read()", "function-call"],
		["SELECT NEXT VALUE FOR dbo.order_seq", "sequence-read"],
	] as const) {
		let resolveCalls = 0;
		const harness = await extensionHarness({
			confirm: async () => false,
			profileResolver: {
				async resolve() { resolveCalls += 1; return DYNAMIC_PROFILE_TEXT; },
				invalidate() {},
				shutdown() {},
			},
		});
		const prepared = await harness.tools.get("database_profile_requirements")!.execute(
			"prepare", { profileName }, new AbortController().signal, undefined, harness.ctx,
		) as { details: { profileId: string } };
		await assert.rejects(
			() => harness.query({ query, profileId: prepared.details.profileId }),
			(error) => assertFixedFailure(error, "confirmation_denied"),
		);
		assert.equal(resolveCalls, 0, `${query} must prompt before profile resolution`);
		assert.equal(harness.runnerCalls, 0, `${query} must prompt before runner work`);
		await assert.rejects(
			() => harness.query({ query: "SELECT 1", profileId: prepared.details.profileId }),
			(error) => assertFixedFailure(error, "profile_not_current"),
		);
		assert.equal(resolveCalls, 0, "cancelled approval must not become silently reusable");
	}
});

test("unexpected runner rejection is sanitized rather than surfacing a secret-bearing exception", async () => {
	const harness = await extensionHarness({
		runner: { async run() { throw new Error(`${ERROR_CANARY}:${PASSWORD}:op://vault/item/field`); } },
	});
	await assert.rejects(
		() => harness.query({ query: "SELECT 1" }),
		(error: unknown) => assertFixedFailure(error, "client_error"),
	);
});

test("requirement clear and every project/session lifecycle boundary invalidate prepared IDs", async () => {
	for (const boundary of ["session_before_switch", "session_before_fork", "session_before_tree", "session_before_compact"]) {
		const harness = await extensionHarness();
		const prepared = await harness.tools.get("database_profile_requirements")!.execute(
			"prepare", { profileName: "primary" }, new AbortController().signal, undefined, harness.ctx,
		) as { details: { profileId: string } };
		await harness.lifecycle(boundary);
		await assert.rejects(
			() => harness.query({ query: "SELECT 1", profileId: prepared.details.profileId }),
			(error) => assertFixedFailure(error, "profile_not_current"),
		);
	}
	const failedAgent = await extensionHarness();
	const failedAgentPrepared = await failedAgent.tools.get("database_profile_requirements")!.execute(
		"prepare", { profileName: "primary" }, new AbortController().signal, undefined, failedAgent.ctx,
	) as { details: { profileId: string } };
	await failedAgent.lifecycle("agent_end", { messages: [{ stopReason: "aborted" }] });
	await assert.rejects(
		() => failedAgent.query({ query: "SELECT 1", profileId: failedAgentPrepared.details.profileId }),
		(error) => assertFixedFailure(error, "profile_not_current"),
	);

	const retryAgent = await extensionHarness();
	const retryPrepared = await retryAgent.tools.get("database_profile_requirements")!.execute(
		"prepare", { profileName: "retry" }, new AbortController().signal, undefined, retryAgent.ctx,
	) as { details: { profileId: string } };
	await retryAgent.lifecycle("agent_end", { messages: [], willRetry: true });
	await assert.rejects(
		() => retryAgent.query({ query: "SELECT 1", profileId: retryPrepared.details.profileId }),
		(error) => assertFixedFailure(error, "profile_not_current"),
	);

	const commandHarness = await extensionHarness();
	const prepared = await commandHarness.tools.get("database_profile_requirements")!.execute(
		"prepare", { profileName: "primary" }, new AbortController().signal, undefined, commandHarness.ctx,
	) as { details: { profileId: string } };
	await commandHarness.commands.get("database-profile-clear")!.handler("", commandHarness.ctx);
	await assert.rejects(
		() => commandHarness.query({ query: "SELECT 1", profileId: prepared.details.profileId }),
		(error) => assertFixedFailure(error, "profile_not_current"),
	);
	assert.equal(commandHarness.notifications.some((entry) => entry.text.includes("invalidated")), true);

	const shutdown = await extensionHarness();
	await shutdown.lifecycle("session_shutdown", { reason: "quit" });
	await assert.rejects(() => shutdown.query({ query: "SELECT 1" }), (error) => assertFixedFailure(error, "lifecycle"));
	await assert.rejects(
		() => shutdown.tools.get("database_profile_requirements")!.execute("prepare", { profileName: "primary" }, new AbortController().signal, undefined, shutdown.ctx),
		(error) => assertFixedFailure(error, "preparation_failed"),
	);
});

test("protected plaintext loader accepts only a 0600 regular canonical file and rejects permission/symlink substitution", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-db-static-test-"));
	try {
		const credentials = join(root, ".agent", "credentials");
		await mkdir(credentials, { recursive: true });
		const path = join(credentials, "database.json");
		await writeFile(path, JSON.stringify({
			type: "mysql",
			host: "127.0.0.1",
			user: "legacy",
			password: PASSWORD,
			database: "legacy_db",
		}), { mode: 0o600 });
		await chmod(path, 0o600);
		const profile = loadProtectedStaticDatabaseProfile({ projectPath: root, projectScopeId: deriveProjectScopeId(root) });
		assert.equal(profile.password, PASSWORD);
		assert.equal(profile.engine, "mysql");

		await chmod(path, 0o644);
		assert.throws(() => loadProtectedStaticDatabaseProfile({ projectPath: root, projectScopeId: deriveProjectScopeId(root) }));
		await rm(path);
		const outside = join(root, "outside.json");
		await writeFile(outside, "{}", { mode: 0o600 });
		await symlink(outside, path);
		assert.throws(() => loadProtectedStaticDatabaseProfile({ projectPath: root, projectScopeId: deriveProjectScopeId(root) }));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
