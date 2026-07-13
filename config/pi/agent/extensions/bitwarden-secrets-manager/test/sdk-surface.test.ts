import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);

function ownValue(record: unknown, key: string): unknown {
	if ((typeof record !== "object" && typeof record !== "function") || record === null) return undefined;
	const descriptor = Object.getOwnPropertyDescriptor(record, key);
	return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

test("pinned SDK exposes the verified metadata and single-secret surface with no cleanup lifecycle API", async () => {
	const imported = await import("@bitwarden/sdk-napi");
	const defaultExport = ownValue(imported, "default");
	const Client = ownValue(defaultExport, "BitwardenClient") ?? ownValue(imported, "BitwardenClient");
	assert.equal(typeof Client, "function");

	type InertClientSettings = { apiUrl: string; identityUrl: string; userAgent: string };
	const inertSettings: InertClientSettings = {
		apiUrl: "https://127.0.0.1:1",
		identityUrl: "https://127.0.0.1:1",
		userAgent: "pi-bitwarden-secrets-manager-offline-test",
	};
	const client = new (Client as new (
		settings?: InertClientSettings,
		logLevel?: number,
	) => Record<string, unknown>)(inertSettings, 4);
	for (const method of ["auth", "projects", "secrets"]) {
		assert.equal(typeof client[method], "function");
	}

	const auth = (client.auth as () => Record<string, unknown>)();
	const projects = (client.projects as () => Record<string, unknown>)();
	const secrets = (client.secrets as () => Record<string, unknown>)();
	assert.equal(typeof auth.loginAccessToken, "function");
	assert.equal(typeof projects.list, "function");
	assert.equal(typeof secrets.list, "function");
	assert.equal(typeof secrets.get, "function");

	const nativeClient = client.client as Record<string, unknown> | undefined;
	for (const forbidden of ["close", "dispose", "free", "logout", "lock"]) {
		assert.equal(client[forbidden], undefined);
		assert.equal(auth[forbidden], undefined);
		assert.equal(nativeClient?.[forbidden], undefined);
	}

	const entryPath = require.resolve("@bitwarden/sdk-napi");
	const packageJson = JSON.parse(await readFile(resolve(dirname(entryPath), "..", "package.json"), "utf8"));
	assert.equal(packageJson.name, "@bitwarden/sdk-napi");
	assert.equal(packageJson.version, "1.0.0");
});

test("runtime client code references only verified authentication, list, and single-secret methods", async () => {
	const source = await readFile(new URL("../src/manager.ts", import.meta.url), "utf8");
	assert.match(source, /callDataMethod\(authentication, "loginAccessToken", configuration\.accessToken\)/u);
	assert.match(source, /callDataMethod\(projects, "list", organizationId\)/u);
	assert.match(source, /callDataMethod\(secrets, "list", organizationId\)/u);
	assert.match(source, /callDataMethod\(secrets, "get", secretId\)/u);
	for (const forbiddenCall of ["getByIds", "create", "update", "delete", "sync", "close", "dispose", "free", "logout", "lock"]) {
		assert.equal(source.includes(`callDataMethod(client, "${forbiddenCall}"`), false);
		assert.equal(source.includes(`callDataMethod(authentication, "${forbiddenCall}"`), false);
		assert.equal(source.includes(`callDataMethod(projects, "${forbiddenCall}"`), false);
		assert.equal(source.includes(`callDataMethod(secrets, "${forbiddenCall}"`), false);
	}
	assert.doesNotMatch(source, /loginAccessToken\([^)]*,/u);
	assert.doesNotMatch(source, /stateFile/u);
});

test("runtime source contains no persistence, shell, message, editor, clipboard, or console sinks", async () => {
	const files = [
		"index.ts",
		"lifecycle.ts",
		"manager.ts",
		"output.ts",
		"resolver-bindings.ts",
		"resolver-protocol.ts",
		"resolver.ts",
		"safety.ts",
	];
	const source = (
		await Promise.all(files.map((file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8")))
	).join("\n");
	for (const forbidden of [
		"pi.exec(",
		"sendMessage(",
		"sendUserMessage(",
		"appendEntry(",
		"setEditorText(",
		"pasteToEditor(",
		"writeFile(",
		"mkdtemp(",
		"console.",
		"clipboard",
	]) {
		assert.equal(source.includes(forbidden), false);
	}
});

test("fetched-value path has no serialization, event-emission, UI, persistence, or logging sink", async () => {
	const source = (
		await Promise.all(["manager.ts", "resolver.ts"].map((file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8")))
	).join("\n");
	for (const forbidden of [
		"JSON.stringify",
		"events.emit",
		".emit(",
		"notify(",
		"setStatus(",
		"sendMessage(",
		"sendUserMessage(",
		"appendEntry(",
		"writeFile(",
		"console.",
	]) {
		assert.equal(source.includes(forbidden), false);
	}
});
