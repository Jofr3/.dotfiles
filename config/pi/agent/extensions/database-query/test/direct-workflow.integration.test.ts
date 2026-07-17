import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import type { DatabaseProfile } from "../profile.ts";
import { deriveProjectScopeId } from "../protocol.ts";
import { OnePasswordManager } from "../../onepassword-secrets-manager/src/manager.ts";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "typebox") return { url: "direct-database-test:typebox", shortCircuit: true };
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url === "direct-database-test:typebox") {
			return {
				format: "module",
				shortCircuit: true,
				source: `
					const node = (kind, value, options = {}) => ({ kind, value, ...options });
					export const Type = {
						Object: (properties, options = {}) => node("object", properties, options),
						String: (options = {}) => node("string", undefined, options),
						Integer: (options = {}) => node("integer", undefined, options),
						Optional: (value) => ({ ...value, optional: true }),
					};
				`,
			};
		}
		return nextLoad(url, context);
	},
});

const TOKEN = "OFFLINE_FAKE_SERVICE_TOKEN_CANARY";
const PASSWORD = "DIRECT_DATABASE_PASSWORD_CANARY";
const PROFILE_TEXT = JSON.stringify({
	version: 1,
	engine: "mysql",
	host: "127.0.0.1",
	port: 3306,
	user: "direct_user",
	password: PASSWORD,
	database: "direct_db",
});
const PROJECT_PATH = "/offline/projects/direct-workflow";
const PROJECT_SCOPE = Object.freeze({
	projectPath: PROJECT_PATH,
	projectScopeId: deriveProjectScopeId(PROJECT_PATH),
});
const RAW_VAULT_ID = "vault-internal-id";
const RAW_ITEM_ID = "item-internal-id";
const RAW_FIELD_ID = "field-internal-id";
const RAW_REFERENCE = `op://${RAW_VAULT_ID}/${RAW_ITEM_ID}/${RAW_FIELD_ID}`;

function fakeVault() {
	return {
		id: RAW_VAULT_ID,
		title: "Team Databases",
		vaultType: "userCreated",
		activeItemCount: 1,
		contentVersion: 1,
		attributeVersion: 1,
		description: PASSWORD,
		createdAt: PASSWORD,
		updatedAt: PASSWORD,
	};
}
function fakeItem() {
	return {
		id: RAW_ITEM_ID,
		vaultId: RAW_VAULT_ID,
		title: "project1_database",
		category: "Database",
		state: "active",
		websites: [PASSWORD],
		tags: [PASSWORD],
		createdAt: PASSWORD,
		updatedAt: PASSWORD,
	};
}
function fakeFullItem() {
	return {
		id: RAW_ITEM_ID,
		vaultId: RAW_VAULT_ID,
		title: "project1_database",
		category: "Database",
		fields: [{
			id: RAW_FIELD_ID,
			title: "Connection Profile JSON",
			fieldType: "Concealed",
			value: PROFILE_TEXT,
			details: { canary: PASSWORD },
		}],
		sections: [],
		notes: PASSWORD,
		tags: [PASSWORD],
		websites: [PASSWORD],
		files: [PASSWORD],
		document: PASSWORD,
		version: 1,
		createdAt: PASSWORD,
		updatedAt: PASSWORD,
	};
}

class SharedEventBus {
	readonly observed: Array<{ channel: string; data: unknown }> = [];
	#listeners = new Map<string, Set<(data: unknown) => void>>();
	on(channel: string, handler: (data: unknown) => void): () => void {
		const listeners = this.#listeners.get(channel) ?? new Set<(data: unknown) => void>();
		listeners.add(handler);
		this.#listeners.set(channel, listeners);
		return () => { listeners.delete(handler); };
	}
	emit(channel: string, data: unknown): void {
		this.observed.push({ channel, data });
		for (const handler of this.#listeners.get(channel) ?? []) handler(data);
	}
}

interface Tool { name: string; execute(...args: unknown[]): Promise<unknown>; }

async function harness() {
	const bus = new SharedEventBus();
	const tools = new Map<string, Tool>();
	const commands = new Map<string, { handler(args: string, ctx: unknown): Promise<void> }>();
	const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
	const activeTools: string[] = [];
	const confirmations: Array<{ title: string; message: string; options: unknown }> = [];
	const notifications: Array<{ text: string; level: string }> = [];
	const messages: string[] = [];
	const updates: unknown[] = [];
	const validatedReferences: string[] = [];
	const resolvedReferences: string[] = [];
	const runnerProfiles: DatabaseProfile[] = [];
	const runnerQueries: string[] = [];
	let itemGets = 0;
	class Secrets {
		static validateSecretReference(reference: string): void { validatedReferences.push(reference); }
	}
	class DesktopAuth { constructor(_account: string) {} }
	const client = {
		secrets: {
			resolve: async (reference: string) => {
				resolvedReferences.push(reference);
				assert.equal(reference, RAW_REFERENCE);
				return PROFILE_TEXT;
			},
		},
		vaults: { list: async () => [fakeVault()] },
		items: {
			list: async () => [fakeItem()],
			get: async () => { itemGets += 1; return fakeFullItem(); },
		},
	};
	const manager = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		loadSdk: async () => ({ default: { Secrets, DesktopAuth, createClient: async () => client } }),
	});
	const pi = {
		events: bus,
		registerTool(tool: Tool) { tools.set(tool.name, tool); },
		registerCommand(name: string, command: { handler(args: string, ctx: unknown): Promise<void> }) { commands.set(name, command); },
		on(name: string, handler: (event: unknown, ctx: unknown) => unknown) {
			const values = handlers.get(name) ?? [];
			values.push(handler);
			handlers.set(name, values);
		},
		getActiveTools() { return [...activeTools]; },
		setActiveTools(names: string[]) { activeTools.splice(0, activeTools.length, ...names); },
		sendUserMessage(message: string) { messages.push(message); },
	};
	const ctx = {
		cwd: PROJECT_PATH,
		hasUI: true,
		mode: "tui",
		isProjectTrusted: () => true,
		waitForIdle: async () => {},
		ui: {
			async confirm(title: string, message: string, options: unknown) {
				confirmations.push({ title, message, options });
				return true;
			},
			notify(text: string, level: string) { notifications.push({ text, level }); },
			setStatus() {},
		},
	};
	const { registerDatabaseExtension } = await import(`../extension.ts?direct=${Math.random()}`);
	const { registerOnePasswordSecretsManagerExtension } = await import(`../../onepassword-secrets-manager/src/index.ts?direct=${Math.random()}`);
	registerDatabaseExtension(pi as never, {
		canonicalizeProject: () => PROJECT_SCOPE,
		loadStaticProfile: () => { throw new Error("static profile must not be used"); },
		runner: {
			async run(profile, query) {
				runnerProfiles.push(profile);
				runnerQueries.push(query);
				return Object.freeze({
					ok: true,
					stdout: Buffer.from(`password\t${PASSWORD}\nprofile\t${PROFILE_TEXT}\nrow\tok\n`),
					elapsedMs: 7,
				});
			},
		},
	});
	registerOnePasswordSecretsManagerExtension(pi as never, { manager });
	const invoke = (name: string, params: unknown, signal = new AbortController().signal) =>
		tools.get(name)!.execute(`${name}-call`, params, signal, (update: unknown) => updates.push(update), ctx);
	const lifecycle = async (name: string, event: unknown = {}) => {
		for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
	};
	return {
		bus, tools, commands, handlers, activeTools, confirmations, notifications, messages, updates,
		validatedReferences, resolvedReferences, runnerProfiles, runnerQueries, manager, ctx, invoke, lifecycle,
		get itemGets() { return itemGets; },
	};
}

function assertNoSecret(value: unknown, label: string): void {
	const serialized = value instanceof Error ? `${value.name}:${value.message}` : JSON.stringify(value);
	for (const canary of [PASSWORD, PROFILE_TEXT, TOKEN, RAW_REFERENCE, RAW_VAULT_ID, RAW_ITEM_ID, RAW_FIELD_ID]) {
		assert.equal(serialized.includes(canary), false, `${label} exposed ${canary}`);
	}
}

async function discover(instance: Awaited<ReturnType<typeof harness>>) {
	const vaults = await instance.invoke("onepassword_list_vaults", { limit: 20 }) as { content: Array<{ text: string }> };
	const vaultId = JSON.parse(vaults.content[0]!.text).vaults[0].vaultId as string;
	const items = await instance.invoke("onepassword_list_items", { vaultId, limit: 20 }) as { content: Array<{ text: string }> };
	const itemId = JSON.parse(items.content[0]!.text).items[0].itemId as string;
	const fields = await instance.invoke("onepassword_list_fields", { vaultId, itemId, limit: 20 }) as { content: Array<{ text: string }> };
	const fieldId = JSON.parse(fields.content[0]!.text).fields[0].fieldId as string;
	for (const [name, result] of [["vaults", vaults], ["items", items], ["fields", fields]] as const) assertNoSecret(result, name);
	return { vaultId, itemId, fieldId };
}

async function prepare(instance: Awaited<ReturnType<typeof harness>>, profileName = "primary") {
	const result = await instance.invoke("database_profile_requirements", { profileName }) as {
		content: Array<{ text: string }>;
		details: { profileId: string; projectScopeId: string; projectPath: string; profileName: string };
	};
	assertNoSecret(result, "requirement result");
	assert.equal(result.details.projectPath, PROJECT_PATH);
	assert.equal(result.details.projectScopeId, PROJECT_SCOPE.projectScopeId);
	assert.equal(result.details.profileName, profileName);
	return result.details.profileId;
}

test("registered mock tools enforce staged/later-turn one-shot direct database workflow with no public secret sink", async () => {
	const instance = await harness();
	await instance.commands.get("onepassword-sm")!.handler("dynamic-enable", instance.ctx);
	for (const name of [
		"onepassword_list_vaults",
		"onepassword_list_items",
		"onepassword_list_fields",
		"onepassword_grant_secret",
		"onepassword_grant_database_profile",
	]) assert.equal(instance.activeTools.includes(name), true, name);
	await instance.lifecycle("turn_start");
	const handles = await discover(instance);

	const sameTurnId = await prepare(instance);
	const grantArguments = { ...handles, profileId: sameTurnId };
	assert.deepEqual(Object.keys(grantArguments), ["vaultId", "itemId", "fieldId", "profileId"]);
	const sameTurnGrant = await instance.invoke("onepassword_grant_database_profile", grantArguments);
	assertNoSecret(sameTurnGrant, "same-turn grant result");
	await assert.rejects(
		() => instance.invoke("database_query", { query: "SELECT 1", profileId: sameTurnId }),
		(error: unknown) => {
			assertNoSecret(error, "same-turn failure");
			return error instanceof Error && /profile_resolution/u.test(error.message);
		},
	);
	assert.equal(instance.resolvedReferences.length, 0, "a staged request must burn before 1Password resolution");
	await instance.lifecycle("turn_end", { message: { role: "assistant", stopReason: "stop" }, toolResults: [] });
	await instance.lifecycle("turn_start");
	await assert.rejects(
		() => instance.invoke("database_query", { query: "SELECT 1", profileId: sameTurnId }),
		(error: unknown) => error instanceof Error && /profile_not_current/u.test(error.message),
	);

	const profileId = await prepare(instance);
	const grant = await instance.invoke("onepassword_grant_database_profile", { ...handles, profileId });
	assertNoSecret(grant, "grant result");
	assert.equal(instance.itemGets, 3, "field discovery plus separately verified grants must re-fetch metadata");
	const databaseApproval = instance.confirmations.findLast((entry) => entry.title.includes("database profile"));
	assert.ok(databaseApproval);
	for (const expected of [
		PROJECT_PATH,
		PROJECT_SCOPE.projectScopeId,
		"primary",
		"pi-database",
		"database_query",
		"database.profile-json",
		"connection-profile",
		"pi.database.connection-profile/v1",
		"Team Databases",
		"project1_database",
		"Connection Profile JSON",
		profileId,
	]) assert.equal(databaseApproval!.message.includes(expected), true, expected);
	assertNoSecret(databaseApproval, "approval");

	await instance.lifecycle("turn_end", { message: { role: "assistant", stopReason: "stop" }, toolResults: [] });
	await instance.lifecycle("turn_start");
	const queryArguments = { query: "SELECT 1", profileId };
	assert.deepEqual(Object.keys(queryArguments), ["query", "profileId"]);
	assertNoSecret(queryArguments, "database tool arguments");
	const result = await instance.invoke("database_query", queryArguments) as {
		content: Array<{ text: string }>;
		details: Record<string, unknown>;
	};
	assert.equal(instance.resolvedReferences.length, 1);
	assert.equal(instance.resolvedReferences[0], RAW_REFERENCE);
	assert.equal(instance.runnerProfiles.length, 1);
	assert.equal(instance.runnerProfiles[0]!.password, PASSWORD, "secret is available only to the fake runner in memory");
	assert.deepEqual(instance.runnerQueries, ["SELECT 1"]);
	assert.equal(result.content[0]!.text.includes("[REDACTED]"), true);
	assertNoSecret(result, "database result");
	assertNoSecret(instance.updates, "progress");
	assertNoSecret(instance.notifications, "notifications");
	assertNoSecret(instance.messages, "messages");
	await assert.rejects(
		() => instance.invoke("database_query", queryArguments),
		(error: unknown) => error instanceof Error && /profile_not_current/u.test(error.message),
	);
	assert.equal(instance.resolvedReferences.length, 1, "replay must not resolve again");
	assert.equal(instance.runnerProfiles.length, 1, "replay must not reach the runner");

	for (const event of instance.bus.observed) assertNoSecret(event.data, `event ${event.channel}`);
	assert.deepEqual(instance.validatedReferences, [RAW_REFERENCE, RAW_REFERENCE, RAW_REFERENCE]);
	await instance.lifecycle("session_shutdown", { reason: "quit" });
});

test("aborted, error, or logical tool-failure turn_end revokes a staged database grant instead of arming it for retry", async () => {
	for (const scenario of [
		{ stopReason: "aborted", toolResults: [] },
		{ stopReason: "error", toolResults: [] },
		{ stopReason: "stop", toolResults: [{ isError: false, details: { ok: false, code: "request_failed" } }] },
	]) {
		const instance = await harness();
		await instance.commands.get("onepassword-sm")!.handler("dynamic-enable", instance.ctx);
		await instance.lifecycle("turn_start");
		const handles = await discover(instance);
		const profileId = await prepare(instance);
		await instance.invoke("onepassword_grant_database_profile", { ...handles, profileId });
		await instance.lifecycle("turn_end", {
			message: { role: "assistant", stopReason: scenario.stopReason },
			toolResults: scenario.toolResults,
		});
		await instance.lifecycle("turn_start");
		await assert.rejects(
			() => instance.invoke("database_query", { query: "SELECT 1", profileId }),
			(error: unknown) => error instanceof Error && /profile_not_current/u.test(error.message),
		);
		assert.equal(instance.resolvedReferences.length, 0);
		assert.equal(instance.runnerProfiles.length, 0);
		await instance.lifecycle("session_shutdown", { reason: "quit" });
	}
});
