import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_DESKTOP_ACCOUNT;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

test("package manifest pins the stable SDK, Node floor, Pi entry, and optional Pi peers", async () => {
	const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
	assert.equal(manifest.engines.node, ">=22.19.0");
	assert.equal(manifest.dependencies["@1password/sdk"], "0.4.0");
	assert.deepEqual(manifest.pi.extensions, ["./src/index.ts"]);
	assert.equal(manifest.peerDependencies["@earendil-works/pi-coding-agent"], "*");
	assert.equal(manifest.peerDependencies.typebox, "*");
	assert.equal(manifest.peerDependenciesMeta["@earendil-works/pi-coding-agent"].optional, true);
	assert.equal(manifest.peerDependenciesMeta.typebox.optional, true);
});

test("lockfile pins SDK and core 0.4.0 with integrity metadata", async () => {
	const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
	assert.equal(lock.lockfileVersion, 3);
	for (const name of ["@1password/sdk", "@1password/sdk-core"]) {
		const entry = lock.packages[`node_modules/${name}`];
		assert.equal(entry.version, "0.4.0");
		assert.match(entry.integrity, /^sha512-/u);
	}
});
