import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { disableResolverLifecycle, shutdownLifecycle } from "../src/lifecycle.ts";

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => { resolve = resolvePromise; });
	return { promise, resolve };
}

test("resolver disable revokes provider and manager synchronously before awaiting either bounded drain", async () => {
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
	assert.equal(settled, true);
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

test("resolver-disable command has no idle wait before lifecycle revocation", async () => {
	const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
	const branch = source.match(/if \(action === "resolver-disable"\) \{([\s\S]*?)\n\t\t\t\}/u)?.[1] ?? "";
	assert.match(branch, /await disableResolverLifecycle\(resolver, manager\)/u);
	assert.doesNotMatch(branch, /waitForIdle/u);
});
