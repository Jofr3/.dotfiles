import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { chmod, link, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	loadResolverBindings,
	parseResolverBindings,
	ResolverBindingsError,
} from "../src/resolver-bindings.ts";

const SECRET_ID = "11111111-2222-3333-8444-555555555555";

function validConfiguration(): Record<string, unknown> {
	return {
		version: 1,
		bindings: [{
			consumer: "mcp-toolbox",
			slot: "production-authorization",
			purpose: "mcp-toolbox.header",
			secretId: SECRET_ID,
		}],
	};
}

function expectConfigCode(action: () => unknown, code: ResolverBindingsError["code"]): void {
	assert.throws(action, (error: unknown) => error instanceof ResolverBindingsError && error.code === code);
}

test("tracked resolver binding example is strict, value-free, and valid", async () => {
	const text = await readFile(new URL("../resolver-bindings.example.json", import.meta.url), "utf8");
	assert.equal(/"(?:value|secretValue|password|token)"\s*:/iu.test(text), false);
	const parsed = parseResolverBindings(JSON.parse(text));
	assert.equal(parsed.version, 1);
	assert.equal(parsed.bindings.length, 3);
});

test("binding parser accepts exact tuples and rejects duplicates, arbitrary fields, and unsafe identifiers", () => {
	const parsed = parseResolverBindings(validConfiguration());
	assert.deepEqual(parsed.bindings[0], {
		consumer: "mcp-toolbox",
		slot: "production-authorization",
		purpose: "mcp-toolbox.header",
		secretId: SECRET_ID,
	});
	assert.equal(Object.isFrozen(parsed), true);
	assert.equal(Object.isFrozen(parsed.bindings), true);
	assert.equal(Object.isFrozen(parsed.bindings[0]), true);

	const duplicate = validConfiguration();
	(duplicate.bindings as unknown[]).push({ ...(duplicate.bindings as Record<string, unknown>[])[0] });
	expectConfigCode(() => parseResolverBindings(duplicate), "duplicate-binding");

	for (const invalid of [
		{ ...validConfiguration(), value: "must-not-be-accepted" },
		{ version: 1, bindings: [{ ...(validConfiguration().bindings as Record<string, unknown>[])[0], value: "x" }] },
		{ version: 1, bindings: [{ ...(validConfiguration().bindings as Record<string, unknown>[])[0], secretId: "../arbitrary" }] },
		{ version: 1, bindings: [{ ...(validConfiguration().bindings as Record<string, unknown>[])[0], slot: "Unsafe Slot" }] },
	]) {
		expectConfigCode(() => parseResolverBindings(invalid), "invalid-config");
	}
});

test("binding parser never invokes accessors", () => {
	let invoked = false;
	const binding = {
		consumer: "mcp-toolbox",
		slot: "production-authorization",
		purpose: "mcp-toolbox.header",
	} as Record<string, unknown>;
	Object.defineProperty(binding, "secretId", {
		enumerable: true,
		get() {
			invoked = true;
			return SECRET_ID;
		},
	});
	expectConfigCode(() => parseResolverBindings({ version: 1, bindings: [binding] }), "invalid-config");
	assert.equal(invoked, false);
});

test("loader accepts only owner-protected regular files and absolute authoritative overrides", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-bitwarden-resolver-bindings-"));
	const protectedPath = join(directory, "bindings.json");
	await writeFile(protectedPath, JSON.stringify(validConfiguration()), { mode: 0o600 });
	await chmod(protectedPath, 0o600);

	const loaded = await loadResolverBindings({ overridePath: protectedPath, packagePath: join(directory, "unused.json") });
	assert.equal(loaded.source, "override");
	assert.equal(loaded.config.bindings.length, 1);

	await assert.rejects(
		() => loadResolverBindings({ overridePath: "relative.json", packagePath: protectedPath }),
		(error: unknown) => error instanceof ResolverBindingsError && error.code === "invalid-override-path",
	);
	await chmod(protectedPath, 0o644);
	await assert.rejects(
		() => loadResolverBindings({ overridePath: protectedPath }),
		(error: unknown) => error instanceof ResolverBindingsError && error.code === "unsafe-file",
	);
	await chmod(protectedPath, 0o600);

	const linkPath = join(directory, "link.json");
	await symlink(protectedPath, linkPath);
	await assert.rejects(
		() => loadResolverBindings({ overridePath: linkPath }),
		(error: unknown) => error instanceof ResolverBindingsError && error.code === "unsafe-file",
	);
});

test("loader rejects hard links, non-files, non-exact modes, invalid UTF-8, and oversized content", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-bitwarden-resolver-hardening-"));
	const path = join(directory, "bindings.json");
	const validText = JSON.stringify(validConfiguration());
	await writeFile(path, validText, { mode: 0o600 });
	await chmod(path, 0o600);

	const hardLink = join(directory, "bindings-hard-link.json");
	await link(path, hardLink);
	for (const candidate of [path, hardLink]) {
		await assert.rejects(
			() => loadResolverBindings({ overridePath: candidate }),
			(error: unknown) => error instanceof ResolverBindingsError && error.code === "unsafe-file",
		);
	}

	const modePath = join(directory, "mode.json");
	await writeFile(modePath, validText, { mode: 0o600 });
	for (const mode of [0o400, 0o700, 0o1600, 0o640]) {
		await chmod(modePath, mode);
		await assert.rejects(
			() => loadResolverBindings({ overridePath: modePath }),
			(error: unknown) => error instanceof ResolverBindingsError && error.code === "unsafe-file",
		);
	}

	const subdirectory = join(directory, "not-a-file");
	await mkdir(subdirectory, { mode: 0o700 });
	await assert.rejects(
		() => loadResolverBindings({ overridePath: subdirectory }),
		(error: unknown) => error instanceof ResolverBindingsError && error.code === "unsafe-file",
	);

	const invalidUtf8 = join(directory, "invalid-utf8.json");
	await writeFile(invalidUtf8, Buffer.from([0xff, 0xfe]), { mode: 0o600 });
	await chmod(invalidUtf8, 0o600);
	await assert.rejects(
		() => loadResolverBindings({ overridePath: invalidUtf8 }),
		(error: unknown) => error instanceof ResolverBindingsError && error.code === "invalid-json",
	);

	const oversized = join(directory, "oversized.json");
	await writeFile(oversized, " ".repeat(64 * 1024 + 1), { mode: 0o600 });
	await chmod(oversized, 0o600);
	await assert.rejects(
		() => loadResolverBindings({ overridePath: oversized }),
		(error: unknown) => error instanceof ResolverBindingsError && error.code === "too-large",
	);

	const exactLimit = join(directory, "exact-limit.json");
	await writeFile(exactLimit, validText.padEnd(64 * 1024, " "), { mode: 0o600 });
	await chmod(exactLimit, 0o600);
	const loaded = await loadResolverBindings({ overridePath: exactLimit });
	assert.equal(loaded.config.bindings.length, 1);
	assert.equal(Object.isFrozen(loaded), true);
});

test("loader source keeps descriptor binding, bigint identity, bounded reads, and fail-closed platform checks", async () => {
	const source = await readFile(new URL("../src/resolver-bindings.ts", import.meta.url), "utf8");
	assert.match(source, /lstat\(path, \{ bigint: true \}\)/u);
	assert.match(source, /handle\.stat\(\{ bigint: true \}\)/u);
	assert.match(source, /left\.dev === right\.dev/u);
	assert.match(source, /left\.ino === right\.ino/u);
	assert.match(source, /stat\.nlink !== 1n/u);
	assert.match(source, /\(stat\.mode & 0o7777n\) !== 0o600n/u);
	assert.match(source, /stat\.uid !== currentUid/u);
	assert.match(source, /noFollow <= 0/u);
	assert.match(source, /nonBlock <= 0/u);
	assert.match(source, /Buffer\.alloc\(expectedBytes \+ 1\)/u);
	assert.match(source, /handle\.read\(buffer, total, buffer\.byteLength - total, total\)/u);
	assert.match(source, /TextDecoder\("utf-8", \{ fatal: true \}\)/u);
});

test("override paths reject blanks, whitespace, controls, relative paths, and accessor values", async () => {
	for (const overridePath of ["", "relative.json", " /tmp/file", "/tmp/file ", "/tmp/line\nfile", "/tmp/\u202efile"]) {
		await assert.rejects(
			() => loadResolverBindings({ overridePath }),
			(error: unknown) => error instanceof ResolverBindingsError && error.code === "invalid-override-path",
		);
	}
});

test("a configured environment override never falls back and accessor-backed environment fails closed", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-bitwarden-resolver-override-"));
	const packagePath = join(directory, "bindings.json");
	await writeFile(packagePath, JSON.stringify(validConfiguration()), { mode: 0o600 });
	await chmod(packagePath, 0o600);

	await assert.rejects(
		() => loadResolverBindings({ environment: { PI_BITWARDEN_RESOLVER_BINDINGS: join(directory, "missing.json") }, packagePath }),
		(error: unknown) => error instanceof ResolverBindingsError && error.code === "missing-config",
	);

	let invoked = false;
	const environment = Object.create(null);
	Object.defineProperty(environment, "PI_BITWARDEN_RESOLVER_BINDINGS", {
		get() {
			invoked = true;
			return packagePath;
		},
	});
	await assert.rejects(
		() => loadResolverBindings({ environment, packagePath }),
		(error: unknown) => error instanceof ResolverBindingsError && error.code === "invalid-override-path",
	);
	assert.equal(invoked, false);
});
