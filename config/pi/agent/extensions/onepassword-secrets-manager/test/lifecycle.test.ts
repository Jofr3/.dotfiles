import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { disableResolverLifecycle, shutdownLifecycle } from "../src/lifecycle.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => { resolve = resolvePromise; });
	return { promise, resolve };
}

test("disable synchronously revokes resolver and manager before awaiting either bounded drain", async () => {
	const resolverDrain = deferred();
	const managerDrain = deferred();
	const calls: string[] = [];
	const operation = disableResolverLifecycle(
		{
			disable() { calls.push("resolver-disable"); return resolverDrain.promise; },
			shutdown() { throw new Error("not used"); },
		},
		{
			reset() { calls.push("manager-reset"); return managerDrain.promise; },
			shutdown() { throw new Error("not used"); },
		},
	);
	assert.deepEqual(calls, ["resolver-disable", "manager-reset"]);
	let settled = false;
	void operation.then(() => { settled = true; });
	resolverDrain.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(settled, false);
	managerDrain.resolve();
	await operation;
});

test("shutdown synchronously unsubscribes/revokes both components and awaits both drains", async () => {
	const resolverDrain = deferred();
	const managerDrain = deferred();
	const calls: string[] = [];
	const operation = shutdownLifecycle(
		{
			disable() { throw new Error("not used"); },
			shutdown() { calls.push("resolver-shutdown"); return resolverDrain.promise; },
		},
		{
			reset() { throw new Error("not used"); },
			shutdown() { calls.push("manager-shutdown"); return managerDrain.promise; },
		},
	);
	assert.deepEqual(calls, ["resolver-shutdown", "manager-shutdown"]);
	resolverDrain.resolve();
	managerDrain.resolve();
	await operation;
});

test("requirement cache is synchronously cleared before resolver and manager lifecycle drains", async () => {
	const disableCalls: string[] = [];
	await disableResolverLifecycle(
		{
			disable() { disableCalls.push("resolver-disable"); return Promise.resolve(); },
			shutdown() { throw new Error("not used"); },
		},
		{
			reset() { disableCalls.push("manager-reset"); return Promise.resolve(); },
			shutdown() { throw new Error("not used"); },
		},
		{ reset() { disableCalls.push("dynamic-reset"); } },
		{
			disable() { disableCalls.push("requirements-disable"); },
			shutdown() { throw new Error("not used"); },
		},
	);
	assert.deepEqual(disableCalls, [
		"requirements-disable",
		"dynamic-reset",
		"resolver-disable",
		"manager-reset",
	]);

	const shutdownCalls: string[] = [];
	await shutdownLifecycle(
		{
			disable() { throw new Error("not used"); },
			shutdown() { shutdownCalls.push("resolver-shutdown"); return Promise.resolve(); },
		},
		{
			reset() { throw new Error("not used"); },
			shutdown() { shutdownCalls.push("manager-shutdown"); return Promise.resolve(); },
		},
		{ reset() { shutdownCalls.push("dynamic-reset"); } },
		{
			disable() { throw new Error("not used"); },
			shutdown() { shutdownCalls.push("requirements-shutdown"); },
		},
	);
	assert.deepEqual(shutdownCalls, [
		"requirements-shutdown",
		"dynamic-reset",
		"resolver-shutdown",
		"manager-shutdown",
	]);
});

test("command and session lifecycle stay disabled by default and revoke without an idle gap", async () => {
	const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
	assert.match(source, /if \(!ctx\.hasUI\) return;/u);
	assert.match(source, /await requestConsent\(/u);
	assert.match(source, /abortPendingConsents\(\)/u);
	assert.match(source, /const loaded = await loadBindings\(\)/u);
	const disableBranch = source.match(/if \(action === "resolver-disable" \|\| action === "dynamic-disable"\) \{([\s\S]*?)\n\t\t\t\}/u)?.[1] ?? "";
	assert.match(disableBranch, /await disableAll\(\)/u);
	assert.doesNotMatch(disableBranch, /waitForIdle/u);
	assert.match(source, /const drain = disableResolverLifecycle\(resolver, manager, dynamic, requirements\)/u);
	assert.match(source, /requirements\.enable\(\)/u);
	assert.match(source, /requirements\.start\(pi\.events\)/u);
	assert.match(source, /\(\) => resolver\.status\(\)\.mode === "dynamic"/u);
	assert.match(source, /pi\.on\("session_before_switch"/u);
	assert.match(source, /pi\.on\("session_before_fork"/u);
	assert.match(source, /pi\.on\("session_before_tree"/u);
	assert.match(source, /pi\.on\("session_before_compact"/u);
	assert.match(source, /pi\.on\("session_shutdown"/u);
	assert.match(source, /databaseRequirements\.shutdown\(\)/u);
	assert.match(source, /databaseProvider\?\.shutdown\(\)/u);
	assert.match(source, /revealRegistry\.shutdown\(\)/u);
	assert.match(source, /login\.shutdown\(\)/u);
	assert.match(source, /shutdownLifecycle\(resolver, manager, dynamic, requirements\)/u);
	assert.doesNotMatch(source, /session_start[\s\S]*resolver\.enable/u);
});
