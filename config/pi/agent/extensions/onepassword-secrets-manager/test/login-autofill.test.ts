import assert from "node:assert/strict";
import test from "node:test";
import { DynamicSelectionSession } from "../src/dynamic.ts";
import { LoginAutofillService, analyzeLoginPage, classifyLoginStep, fillLoginPage, type LoginPageAnalysis, type LoginPostStep } from "../src/login.ts";
import { OnePasswordManager } from "../src/manager.ts";
import { RequirementMetadataCache } from "../src/requirements.ts";
import { SecretResolverProvider } from "../src/resolver.ts";
import type { StagehandCredentialLease, StagehandLeasePage, StagehandLeaseSource } from "../src/stagehand-lease.ts";

const USERNAME = "LOGIN_USERNAME_SENTINEL_NEVER_PUBLIC";
const PASSWORD = "LOGIN_PASSWORD_SENTINEL_NEVER_PUBLIC";
const TOKEN = "LOGIN_TOKEN_SENTINEL_NEVER_PUBLIC";
const SDK_ERROR = "LOGIN_SDK_ERROR_SENTINEL_NEVER_PUBLIC";
const RAW_VAULT_A = "login-vault-a-internal";
const RAW_VAULT_B = "login-vault-b-internal";
const RAW_ITEM = "login-item-internal";
const USER_FIELD = "username";
const PASSWORD_FIELD = "password";
const USER_REFERENCE = `op://${RAW_VAULT_A}/${RAW_ITEM}/${USER_FIELD}`;
const PASSWORD_REFERENCE = `op://${RAW_VAULT_A}/${RAW_ITEM}/${PASSWORD_FIELD}`;

function vault(id = RAW_VAULT_A, title = "Logins") {
	return { id, title, description: PASSWORD, vaultType: "userCreated", activeItemCount: 1, contentVersion: 1, attributeVersion: 1, createdAt: PASSWORD, updatedAt: PASSWORD };
}
function overview(vaultId = RAW_VAULT_A, title = "Example Login") {
	return { id: RAW_ITEM, title, category: "Login", vaultId, websites: [{ url: "https://example.test/login", label: "website", autofillBehavior: "ExactDomain" }], tags: [PASSWORD], createdAt: PASSWORD, updatedAt: PASSWORD, state: "active" };
}
function loginItem(options: { ambiguous?: boolean; website?: string } = {}) {
	const passwordFields = options.ambiguous
		? [
			{ id: "password-one", title: "Password", fieldType: "Concealed", value: PASSWORD },
			{ id: "password-two", title: "Password", fieldType: "Concealed", value: PASSWORD },
		]
		: [{ id: PASSWORD_FIELD, title: "Password", fieldType: "Concealed", value: PASSWORD }];
	return {
		id: RAW_ITEM,
		title: "Example Login",
		category: "Login",
		vaultId: RAW_VAULT_A,
		fields: [{ id: USER_FIELD, title: "Username", fieldType: "Text", value: USERNAME }, ...passwordFields],
		sections: [],
		notes: PASSWORD,
		tags: [PASSWORD],
		websites: [{ url: options.website ?? "https://example.test/login", label: "website", autofillBehavior: "ExactDomain" }],
		version: 1,
		files: [],
		createdAt: PASSWORD,
		updatedAt: PASSWORD,
	};
}

class FakePage implements StagehandLeasePage {
	currentUrl = "https://example.test/login";
	analysis: LoginPageAnalysis = { usernameCandidates: 1, passwordCandidates: 1, sameForm: true, formAction: "https://example.test/session", submitCandidates: 1 };
	step: LoginPostStep = "complete";
	redirectAfterFill?: string;
	throwOnFill = false;
	credentialArguments: Array<{ username: string; password: string; submit: boolean }> = [];
	url(): string { return this.currentUrl; }
	async evaluate<R = unknown, A = unknown>(fn: (argument: A) => R | Promise<R>, argument?: A): Promise<R> {
		if (fn === analyzeLoginPage) return this.analysis as R;
		if (fn === fillLoginPage) {
			const credentials = argument as { username: string; password: string; submit: boolean };
			this.credentialArguments.push({ ...credentials });
			if (this.throwOnFill) throw new Error(`${SDK_ERROR}-${credentials.password}`);
			if (this.redirectAfterFill) this.currentUrl = this.redirectAfterFill;
			return { filled: true, submitted: credentials.submit } as R;
		}
		if (fn === classifyLoginStep) return this.step as R;
		throw new Error("unexpected fake page evaluation");
	}
	async waitForLoadState(): Promise<void> {}
	async waitForTimeout(): Promise<void> {}
}

class FakeLeaseSource implements StagehandLeaseSource {
	readonly page = new FakePage();
	acquireCalls = 0;
	runCalls = 0;
	resetCalls = 0;
	shutdownCalls = 0;
	#closed = false;
	#lease: StagehandCredentialLease | undefined;
	acquire(): Promise<StagehandCredentialLease> {
		if (this.#closed) return Promise.reject(new Error(`${SDK_ERROR}-${PASSWORD}`));
		if (this.#lease && !this.#lease.isRevoked()) return Promise.resolve(this.#lease);
		this.acquireCalls += 1;
		let revoked = false;
		const source = this;
		this.#lease = Object.freeze({
			protocol: "pi.stagehand.credential-lease/v1" as const,
			consumer: "onepassword-secrets-manager" as const,
			purpose: "login-form-fill" as const,
			isRevoked: () => revoked,
			async run<T>(_operation: "login-form-fill", _signal: AbortSignal | undefined, work: (page: StagehandLeasePage) => Promise<T>): Promise<T> {
				if (revoked) throw new Error(`${SDK_ERROR}-${PASSWORD}`);
				source.runCalls += 1;
				return work(source.page);
			},
			release: () => { revoked = true; },
		});
		return Promise.resolve(this.#lease);
	}
	reset(): void { this.resetCalls += 1; this.#lease?.release(); this.#lease = undefined; }
	shutdown(): void { this.shutdownCalls += 1; this.#closed = true; this.reset(); }
	status() { return Object.freeze({ cached: Boolean(this.#lease), acquiring: false, closed: this.#closed }); }
	revoke(): void { this.#lease?.release(); }
}

function harness(options: { ambiguous?: boolean; failResolve?: boolean } = {}) {
	const resolved: string[] = [];
	let itemGets = 0;
	let failResolve = options.failResolve ?? false;
	class Secrets { static validateSecretReference(_reference: string): void {} }
	const manager = new OnePasswordManager({
		readEnvironment: () => ({ OP_SERVICE_ACCOUNT_TOKEN: TOKEN }),
		loadSdk: async () => ({ default: {
			Secrets,
			createClient: async () => ({
				secrets: { resolve: async (reference: string) => {
					resolved.push(reference);
					if (failResolve) throw new Error(`${SDK_ERROR}-${PASSWORD}`);
					if (reference === USER_REFERENCE) return USERNAME;
					if (reference === PASSWORD_REFERENCE) return PASSWORD;
					throw new Error(`${SDK_ERROR}-${reference}`);
				} },
				vaults: { list: async () => [vault(RAW_VAULT_A, "Logins"), vault(RAW_VAULT_B, "Other")] },
				items: {
					list: async (vaultId: string) => vaultId === RAW_VAULT_A ? [overview()] : [overview(RAW_VAULT_B, "Unrelated")],
					get: async () => { itemGets += 1; return loginItem({ ambiguous: options.ambiguous }); },
				},
			}),
		} }),
	});
	const resolver = new SecretResolverProvider(manager);
	const requirements = new RequirementMetadataCache();
	const dynamic = new DynamicSelectionSession(manager, resolver, requirements);
	resolver.enableDynamic();
	requirements.enable();
	const leases = new FakeLeaseSource();
	const service = new LoginAutofillService(dynamic, manager, leases);
	const confirmations: unknown[] = [];
	const ctx = {
		hasUI: true,
		ui: { async confirm(title: string, message: string, options: unknown) { confirmations.push({ title, message, options }); return true; } },
	};
	return {
		manager, resolver, requirements, dynamic, leases, service, confirmations, resolved, ctx,
		set failResolve(value: boolean) { failResolve = value; },
		get itemGets() { return itemGets; },
	};
}

async function discover(instance: ReturnType<typeof harness>) {
	const vaults = await instance.dynamic.listVaults({ query: "Logins", limit: 20 });
	const vaultId = JSON.parse(vaults.content[0]!.text).vaults[0].vaultId as string;
	const items = await instance.dynamic.listItems({ vaultId, query: "Example", limit: 20, state: "active" });
	const itemId = JSON.parse(items.content[0]!.text).items[0].itemId as string;
	return { vaultId, itemId, publicResults: [vaults, items] };
}

function loginArgs(value: { vaultId: string; itemId: string }) {
	return { vaultId: value.vaultId, itemId: value.itemId };
}

function assertPublic(value: unknown, label: string): void {
	const serialized = value instanceof Error ? `${value.name}:${value.message}:${value.stack ?? ""}` : JSON.stringify(value);
	for (const sentinel of [USERNAME, PASSWORD, TOKEN, SDK_ERROR, USER_REFERENCE, PASSWORD_REFERENCE, RAW_VAULT_A, RAW_VAULT_B, RAW_ITEM]) {
		assert.equal(serialized.includes(sentinel), false, `${label} exposed ${sentinel}`);
	}
}

test("all-vault metadata and bounded search emit only opaque handles and stale/cross-vault handles fail", async () => {
	const instance = harness();
	const search = await instance.dynamic.searchItems({ query: "Example", state: "active", limit: 10 });
	assert.equal(search.details.ok, true);
	const parsed = JSON.parse(search.content[0]!.text);
	assert.equal(parsed.items.length, 1);
	assert.match(parsed.items[0].vaultId, /^opv_[A-Za-z0-9_-]{43}$/u);
	assert.match(parsed.items[0].itemId, /^opi_[A-Za-z0-9_-]{43}$/u);
	assertPublic(search, "search result");
	const first = await discover(instance);
	const secondVaults = await instance.dynamic.listVaults({ query: "Other", limit: 20 });
	const secondVault = JSON.parse(secondVaults.content[0]!.text).vaults[0].vaultId;
	const crossed = await instance.dynamic.listFields({ vaultId: secondVault, itemId: first.itemId, limit: 20 });
	assert.deepEqual(crossed.details, { ok: false, code: "invalid_input" });
	instance.dynamic.reset();
	const stale = await instance.dynamic.listFields({ vaultId: first.vaultId, itemId: first.itemId, limit: 20 });
	assert.deepEqual(stale.details, { ok: false, code: "invalid_input" });
	assertPublic([crossed, stale], "handle failures");
	await instance.manager.shutdown();
});

test("standard Login mapping fills and submits, reuses one session lease, and re-resolves both fields on every use", async () => {
	const instance = harness();
	const discovered = await discover(instance);
	instance.leases.page.redirectAfterFill = "https://example.test/account";
	const first = await instance.service.fill({ vaultId: discovered.vaultId, itemId: discovered.itemId }, undefined, instance.ctx);
	assert.deepEqual(first.details, { ok: true, filled: true, submitted: true });
	const second = await instance.service.fill({ vaultId: discovered.vaultId, itemId: discovered.itemId, submit: false }, undefined, instance.ctx);
	assert.deepEqual(second.details, { ok: true, filled: true, submitted: false });
	assert.equal(instance.leases.acquireCalls, 1, "one lease must be reused throughout the session");
	assert.deepEqual(instance.resolved, [USER_REFERENCE, PASSWORD_REFERENCE, USER_REFERENCE, PASSWORD_REFERENCE]);
	assert.equal(instance.itemGets, 2, "the Login item must be re-fetched for each use");
	assert.equal(instance.leases.page.credentialArguments.length, 2);
	assert.equal(instance.leases.page.credentialArguments[0]!.username, USERNAME, "secret reaches only the fake browser consumer");
	for (const [label, value] of [["first", first], ["second", second], ["confirmations", instance.confirmations], ["metadata", discovered.publicResults], ["progress", []], ["logs", []], ["sessions", []]] as const) {
		assertPublic(value, label);
	}
	instance.service.shutdown();
	assert.equal(instance.leases.shutdownCalls, 1);
	await instance.manager.shutdown();
});

test("ambiguous item/DOM mapping, origin mismatch, and disallowed form action fail before secret resolution", async () => {
	const ambiguousItem = harness({ ambiguous: true });
	const itemHandles = await discover(ambiguousItem);
	const itemResult = await ambiguousItem.service.fill(loginArgs(itemHandles), undefined, ambiguousItem.ctx);
	assert.deepEqual(itemResult.details, { ok: false, code: "request_failed", filled: false, submitted: false });
	assert.deepEqual(ambiguousItem.resolved, []);
	assertPublic(itemResult, "ambiguous item");
	await ambiguousItem.manager.shutdown();

	const instance = harness();
	const handles = await discover(instance);
	instance.leases.page.analysis = { ...instance.leases.page.analysis, usernameCandidates: 2 };
	const dom = await instance.service.fill(loginArgs(handles), undefined, instance.ctx);
	assert.equal(dom.details.code, "field_mapping_ambiguous");
	assert.deepEqual(instance.resolved, []);
	instance.leases.page.analysis = { ...instance.leases.page.analysis, usernameCandidates: 1 };
	instance.leases.page.currentUrl = "https://evil.example/login";
	const origin = await instance.service.fill(loginArgs(handles), undefined, instance.ctx);
	assert.equal(origin.details.code, "origin_mismatch");
	assert.deepEqual(instance.resolved, []);
	instance.leases.page.currentUrl = "https://example.test/login";
	instance.leases.page.analysis = { ...instance.leases.page.analysis, formAction: "https://evil.example/collect" };
	const action = await instance.service.fill(loginArgs(handles), undefined, instance.ctx);
	assert.equal(action.details.code, "redirect_rejected");
	assert.deepEqual(instance.resolved, []);
	assertPublic([dom, origin, action], "preflight failures");
	await instance.manager.shutdown();
});

test("post-submit redirect rejection, MFA, unexpected steps, lease revocation, and consumer/SDK errors are fixed and sanitized", async () => {
	const redirect = harness();
	const handles = await discover(redirect);
	redirect.leases.page.redirectAfterFill = "https://evil.example/account";
	const redirected = await redirect.service.fill(loginArgs(handles), undefined, redirect.ctx);
	assert.equal(redirected.details.code, "redirect_rejected");
	assertPublic(redirected, "redirected result");
	await redirect.manager.shutdown();

	const mfa = harness();
	const mfaHandles = await discover(mfa);
	mfa.leases.page.step = "mfa";
	mfa.leases.page.redirectAfterFill = "https://example.test/mfa";
	const mfaResult = await mfa.service.fill(loginArgs(mfaHandles), undefined, mfa.ctx);
	assert.deepEqual(mfaResult.details, { ok: false, code: "mfa_required", filled: true, submitted: true });
	assertPublic(mfaResult, "mfa result");
	mfa.leases.page.step = "login_form";
	const unexpected = await mfa.service.fill(loginArgs(mfaHandles), undefined, mfa.ctx);
	assert.equal(unexpected.details.code, "unexpected_step");
	assertPublic(unexpected, "unexpected result");
	mfa.leases.revoke();
	mfa.leases.page.step = "complete";
	mfa.leases.page.redirectAfterFill = "https://example.test/account";
	const reacquired = await mfa.service.fill(loginArgs(mfaHandles), undefined, mfa.ctx);
	assert.equal(reacquired.details.ok, true);
	assert.equal(mfa.leases.acquireCalls, 2, "a revoked lease must never be reused");
	await mfa.manager.shutdown();

	const consumer = harness();
	const consumerHandles = await discover(consumer);
	consumer.leases.page.throwOnFill = true;
	const consumerFailure = await consumer.service.fill(loginArgs(consumerHandles), undefined, consumer.ctx);
	assert.equal(consumerFailure.details.code, "request_failed");
	assertPublic(consumerFailure, "consumer error");
	consumer.leases.page.throwOnFill = false;
	consumer.failResolve = true;
	const sdkFailure = await consumer.service.fill(loginArgs(consumerHandles), undefined, consumer.ctx);
	assert.equal(sdkFailure.details.code, "request_failed");
	assertPublic(sdkFailure, "SDK error");
	await consumer.manager.shutdown();
});
