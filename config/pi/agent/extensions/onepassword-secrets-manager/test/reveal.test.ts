import assert from "node:assert/strict";
import test from "node:test";
import { DynamicSelectionSession } from "../src/dynamic.ts";
import { OnePasswordManager } from "../src/manager.ts";
import { RequirementMetadataCache } from "../src/requirements.ts";
import { SecretResolverProvider } from "../src/resolver.ts";
import {
	RevealRegistry,
	SecretRevealPopup,
	revealDynamicField,
	type RevealTimerApi,
} from "../src/reveal.ts";

const SECRET = "REVEAL_SENTINEL_SECRET_NEVER_PUBLIC";
const TOKEN = "REVEAL_SENTINEL_TOKEN_NEVER_PUBLIC";
const RAW_VAULT = "reveal-vault-internal";
const RAW_ITEM = "reveal-item-internal";
const RAW_FIELD = "reveal-field-internal";
const RAW_REFERENCE = `op://${RAW_VAULT}/${RAW_ITEM}/${RAW_FIELD}`;

function vault() {
	return { id: RAW_VAULT, title: "Personal", description: SECRET, vaultType: "personal", activeItemCount: 1, contentVersion: 1, attributeVersion: 1, createdAt: SECRET, updatedAt: SECRET };
}
function item() {
	return { id: RAW_ITEM, title: "Example", category: "Login", vaultId: RAW_VAULT, websites: [], tags: [SECRET], createdAt: SECRET, updatedAt: SECRET, state: "active" };
}
function fullItem() {
	return {
		id: RAW_ITEM, title: "Example", category: "Login", vaultId: RAW_VAULT,
		fields: [{ id: RAW_FIELD, title: "Password", fieldType: "Concealed", value: SECRET, details: { value: SECRET } }],
		sections: [], notes: SECRET, tags: [SECRET], websites: [], version: 1, files: [], createdAt: SECRET, updatedAt: SECRET,
	};
}

function harness() {
	let resolutions = 0;
	class Secrets { static validateSecretReference(reference: string): void { assert.equal(reference, RAW_REFERENCE); } }
	const manager = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		loadSdk: async () => ({ default: {
			Secrets,
			createClient: async () => ({
				secrets: { resolve: async () => { resolutions += 1; return SECRET; } },
				vaults: { list: async () => [vault()] },
				items: { list: async () => [item()], get: async () => fullItem() },
			}),
		} }),
	});
	const resolver = new SecretResolverProvider(manager);
	const requirements = new RequirementMetadataCache();
	const dynamic = new DynamicSelectionSession(manager, resolver, requirements);
	resolver.enableDynamic();
	requirements.enable();
	return { manager, resolver, dynamic, requirements, get resolutions() { return resolutions; } };
}

async function handles(instance: ReturnType<typeof harness>) {
	const vaultResult = await instance.dynamic.listVaults({ limit: 20 });
	const vaultId = JSON.parse(vaultResult.content[0]!.text).vaults[0].vaultId as string;
	const itemResult = await instance.dynamic.listItems({ vaultId, limit: 20, state: "active" });
	const itemId = JSON.parse(itemResult.content[0]!.text).items[0].itemId as string;
	const fieldResult = await instance.dynamic.listFields({ vaultId, itemId, limit: 20 });
	const fieldId = JSON.parse(fieldResult.content[0]!.text).fields[0].fieldId as string;
	return { vaultId, itemId, fieldId, publicResults: [vaultResult, itemResult, fieldResult] };
}

function assertPublic(value: unknown, label: string): void {
	const serialized = value instanceof Error ? `${value.name}:${value.message}:${value.stack ?? ""}` : JSON.stringify(value);
	for (const sentinel of [SECRET, TOKEN, RAW_REFERENCE, RAW_VAULT, RAW_ITEM, RAW_FIELD]) {
		assert.equal(serialized.includes(sentinel), false, `${label} exposed ${sentinel}`);
	}
}

class FakeTimers implements RevealTimerApi {
	#next = 0;
	callbacks = new Map<number, () => void>();
	cleared: number[] = [];
	setTimeout(callback: () => void): unknown { const id = ++this.#next; this.callbacks.set(id, callback); return id; }
	clearTimeout(handle: unknown): void { this.cleared.push(handle as number); this.callbacks.delete(handle as number); }
	fireAll(): void { for (const callback of [...this.callbacks.values()]) callback(); }
}

test("reveal is TUI-only, separately confirmed, and keeps the secret out of every public sink", async () => {
	const instance = harness();
	const discovered = await handles(instance);
	const confirmations: unknown[] = [];
	const popupRenders: string[] = [];
	const registry = new RevealRegistry();
	const ctx = {
		mode: "tui",
		hasUI: true,
		ui: {
			async confirm(title: string, message: string, options: unknown) { confirmations.push({ title, message, options }); return true; },
			async custom(factory: Function) {
				await new Promise<void>((resolve) => {
					const popup = factory({}, {}, {}, () => resolve()) as SecretRevealPopup;
					popupRenders.push(popup.render(120).join("\n"));
					popup.handleInput("\x1b");
				});
			},
		},
	};
	const revealArgs = { vaultId: discovered.vaultId, itemId: discovered.itemId, fieldId: discovered.fieldId };
	const result = await revealDynamicField(instance.dynamic, instance.manager, registry, revealArgs, undefined, ctx);
	assert.equal(result.details.ok, true);
	assert.equal(popupRenders.length, 1);
	assert.equal(popupRenders[0]!.includes(SECRET), true, "the intentional TUI reveal must show the value");
	assert.equal(instance.resolutions, 1);
	assert.equal(registry.status().active, 0);
	for (const [label, value] of [
		["tool result", result],
		["confirmations", confirmations],
		["metadata", discovered.publicResults],
		["serialized registry", registry.status()],
		["session entries", []],
		["progress", []],
		["logs", []],
	] as const) assertPublic(value, label);

	const before = instance.resolutions;
	const denied = await revealDynamicField(instance.dynamic, instance.manager, registry, revealArgs, undefined, {
		...ctx,
		ui: { ...ctx.ui, confirm: async () => false },
	});
	assert.deepEqual(denied.details, { ok: false, code: "approval_denied" });
	assert.equal(instance.resolutions, before, "rejection must happen before value resolution");
	assertPublic(denied, "denied result");

	for (const mode of ["rpc", "json", "print"]) {
		const blocked = await revealDynamicField(instance.dynamic, instance.manager, registry, revealArgs, undefined, { ...ctx, mode });
		assert.deepEqual(blocked.details, { ok: false, code: "approval_required" });
		assert.equal(instance.resolutions, before);
		assertPublic(blocked, `${mode} result`);
	}
	await instance.manager.shutdown();
});

test("30-second cleanup and early dismissal clear private popup state and timers", () => {
	const timers = new FakeTimers();
	let closed = 0;
	const timed = new SecretRevealPopup(SECRET, () => { closed += 1; }, timers);
	assert.equal(JSON.stringify(timed).includes(SECRET), false);
	assert.equal(timed.render(200).join("\n").includes(SECRET), true);
	timers.fireAll();
	assert.equal(timed.isCleared(), true);
	assert.deepEqual(timed.render(200), []);
	assert.equal(closed, 1);

	const earlyTimers = new FakeTimers();
	const early = new SecretRevealPopup(SECRET, () => { closed += 1; }, earlyTimers);
	early.handleInput("\r");
	assert.equal(early.isCleared(), true);
	assert.equal(earlyTimers.callbacks.size, 0);
	early.dispose();
	assert.equal(closed, 2, "cleanup must be idempotent");
});
