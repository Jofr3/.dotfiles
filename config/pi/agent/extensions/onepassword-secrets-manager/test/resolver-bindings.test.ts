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

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const REFERENCE = "op://example-vault/example-item/password";

function validConfiguration(): Record<string, unknown> {
	return {
		version: 1,
		bindings: [{
			consumer: "mcp-toolbox",
			slot: "production-db-password",
			purpose: "mcp-toolbox.bound-param",
			secretReference: REFERENCE,
		}],
	};
}

function expectCode(action: () => unknown, code: ResolverBindingsError["code"]): void {
	assert.throws(action, (error: unknown) => error instanceof ResolverBindingsError && error.code === code);
}

test("tracked example is strict, value-free, fake, and valid", async () => {
	const text = await readFile(new URL("../resolver-bindings.example.json", import.meta.url), "utf8");
	assert.equal(/"(?:value|secretValue|password|token)"\s*:/iu.test(text), false);
	assert.equal(text.includes("op://example-vault/"), true);
	const parsed = parseResolverBindings(JSON.parse(text));
	assert.equal(parsed.bindings.length, 3);
});

test("parser freezes exact tuples and rejects duplicates, unknowns, holes, accessors, and unsafe references", () => {
	const parsed = parseResolverBindings(validConfiguration());
	assert.deepEqual(parsed.bindings[0], {
		consumer: "mcp-toolbox",
		slot: "production-db-password",
		purpose: "mcp-toolbox.bound-param",
		secretReference: REFERENCE,
	});
	assert.equal(Object.isFrozen(parsed), true);
	assert.equal(Object.isFrozen(parsed.bindings), true);
	assert.equal(Object.isFrozen(parsed.bindings[0]), true);
	const encoded = validConfiguration();
	(encoded.bindings as Record<string, unknown>[])[0].secretReference =
		"op://example%20vault/example%20item/one-time%20password?attribute=totp";
	assert.equal(parseResolverBindings(encoded).bindings.length, 1);

	const duplicate = validConfiguration();
	(duplicate.bindings as unknown[]).push({ ...(duplicate.bindings as Record<string, unknown>[])[0] });
	expectCode(() => parseResolverBindings(duplicate), "duplicate-binding");

	const sparse = new Array(1);
	expectCode(() => parseResolverBindings({ version: 1, bindings: sparse }), "invalid-config");
	for (const invalid of [
		{ ...validConfiguration(), value: "must-not-be-accepted" },
		{ version: 1, bindings: [{ ...(validConfiguration().bindings as Record<string, unknown>[])[0], value: "x" }] },
		{ version: 1, bindings: [{ ...(validConfiguration().bindings as Record<string, unknown>[])[0], slot: "Unsafe Slot" }] },
		{ version: 1, bindings: [{ ...(validConfiguration().bindings as Record<string, unknown>[])[0], slot: "mcp1-B-agZKwxZncAXfB6p1TMx7g0dZQk97793GMxXC_ky7E_A" }] },
		{ version: 1, bindings: [{ ...(validConfiguration().bindings as Record<string, unknown>[])[0], secretReference: "https://example.test/secret" }] },
		{ version: 1, bindings: [{ ...(validConfiguration().bindings as Record<string, unknown>[])[0], secretReference: "op://vault/item" }] },
		{ version: 1, bindings: [{ ...(validConfiguration().bindings as Record<string, unknown>[])[0], secretReference: "op://vault/item/field%0asecond" }] },
		{ version: 1, bindings: [{ ...(validConfiguration().bindings as Record<string, unknown>[])[0], secretReference: "op://vault/item/field#fragment" }] },
	]) {
		expectCode(() => parseResolverBindings(invalid), "invalid-config");
	}

	let invoked = false;
	const binding = {
		consumer: "mcp-toolbox",
		slot: "production-db-password",
		purpose: "mcp-toolbox.bound-param",
	} as Record<string, unknown>;
	Object.defineProperty(binding, "secretReference", {
		enumerable: true,
		get() {
			invoked = true;
			return REFERENCE;
		},
	});
	expectCode(() => parseResolverBindings({ version: 1, bindings: [binding] }), "invalid-config");
	assert.equal(invoked, false);
});

test("loader accepts only owner-protected regular files and absolute authoritative overrides", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-onepassword-resolver-bindings-"));
	const protectedPath = join(directory, "bindings.json");
	await writeFile(protectedPath, JSON.stringify(validConfiguration()), { mode: 0o600 });
	await chmod(protectedPath, 0o600);
	const loaded = await loadResolverBindings({ overridePath: protectedPath, packagePath: join(directory, "unused.json") });
	assert.equal(loaded.source, "override");
	assert.equal(loaded.config.bindings.length, 1);
	assert.equal(Object.isFrozen(loaded), true);

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

	const symlinkPath = join(directory, "link.json");
	await symlink(protectedPath, symlinkPath);
	await assert.rejects(
		() => loadResolverBindings({ overridePath: symlinkPath }),
		(error: unknown) => error instanceof ResolverBindingsError && error.code === "unsafe-file",
	);
});

test("loader rejects hard links, directories, special/non-exact modes, invalid UTF-8, and oversized files", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-onepassword-resolver-hardening-"));
	const validText = JSON.stringify(validConfiguration());
	const path = join(directory, "bindings.json");
	await writeFile(path, validText, { mode: 0o600 });
	await chmod(path, 0o600);
	const hardLink = join(directory, "hard-link.json");
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
	assert.equal((await loadResolverBindings({ overridePath: exactLimit })).config.bindings.length, 1);
});

test("override environment is descriptor-bound, absolute, authoritative, and never falls back", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-onepassword-resolver-override-"));
	const packagePath = join(directory, "bindings.json");
	await writeFile(packagePath, JSON.stringify(validConfiguration()), { mode: 0o600 });
	await chmod(packagePath, 0o600);

	for (const overridePath of ["", "relative.json", " /tmp/file", "/tmp/file ", "/tmp/line\nfile", "/tmp/\u202efile"]) {
		await assert.rejects(
			() => loadResolverBindings({ environment: { PI_ONEPASSWORD_RESOLVER_BINDINGS: overridePath }, packagePath }),
			(error: unknown) => error instanceof ResolverBindingsError && error.code === "invalid-override-path",
		);
	}
	await assert.rejects(
		() => loadResolverBindings({
			environment: { PI_ONEPASSWORD_RESOLVER_BINDINGS: join(directory, "missing.json") },
			packagePath,
		}),
		(error: unknown) => error instanceof ResolverBindingsError && error.code === "missing-config",
	);

	let invoked = false;
	const environment = Object.create(null);
	Object.defineProperty(environment, "PI_ONEPASSWORD_RESOLVER_BINDINGS", {
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

test("loader source enforces bigint identity, final path identity, bounded positional reads, and fail-closed flags", async () => {
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
	assert.match(source, /finalPath = await lstat\(path, \{ bigint: true \}\)/u);
	assert.match(source, /sameFileSnapshot\(after, finalPath\)/u);
	assert.match(source, /TextDecoder\("utf-8", \{ fatal: true \}\)/u);
});
