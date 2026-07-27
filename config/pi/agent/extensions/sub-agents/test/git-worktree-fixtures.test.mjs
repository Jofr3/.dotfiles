import assert from "node:assert/strict";
import {
	access,
	chmod,
	mkdir,
	readdir,
	readFile,
	readlink,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
	isLocalGitAvailable,
	parseCatFileBatch,
	parseLsTreeZ,
	parseWorktreePorcelainZ,
	withTempGitRepository,
} from "./git-fixtures.mjs";

const OID_A = "a".repeat(40);
const OID_B = "b".repeat(40);

async function requireLocalGit(context) {
	if (await isLocalGitAvailable()) return true;
	context.skip("local git executable is unavailable");
	return false;
}

async function materializeFixtureSnapshot(root, snapshot) {
	for (const entry of snapshot.entries) {
		if (entry.mode === "160000") continue;
		const target = join(root, ...entry.path.split("/"));
		await mkdir(dirname(target), { recursive: true });
		const content = snapshot.objects.get(entry.oid);
		assert.ok(content, `missing fixture object: ${entry.oid}`);
		if (entry.mode === "120000") {
			await symlink(content.toString("utf8"), target);
		} else {
			await writeFile(target, content);
			await chmod(target, entry.mode === "100755" ? 0o755 : 0o644);
		}
	}
}

test("worktree, tree, and object-batch parsers accept exact NUL framing and reject malformed data", () => {
	const firstPath = resolve("/tmp", "pi-worktree-parser-a");
	const secondPath = resolve("/tmp", "pi-worktree-parser-b");
	const worktreeOutput = Buffer.from(
		`worktree ${firstPath}\0HEAD ${OID_A}\0branch refs/heads/main\0\0` +
		`worktree ${secondPath}\0HEAD ${OID_B}\0branch refs/heads/pi/sub-agents/fixture/parser\0locked fixture\0\0`,
	);
	const worktrees = parseWorktreePorcelainZ(worktreeOutput);
	assert.equal(worktrees.length, 2);
	assert.equal(worktrees[1].path, secondPath);
	assert.equal(worktrees[1].locked, "fixture");
	assert.throws(() => parseWorktreePorcelainZ(worktreeOutput.subarray(0, -1)), /double-NUL|inside a record/u);
	assert.throws(
		() => parseWorktreePorcelainZ(Buffer.from(`worktree relative\0HEAD ${OID_A}\0branch refs/heads/main\0\0`)),
		/path is invalid/u,
	);
	assert.throws(
		() => parseWorktreePorcelainZ(Buffer.from(`worktree ${firstPath}\0HEAD bad\0branch refs/heads/main\0\0`)),
		/object ID/u,
	);

	const tree = parseLsTreeZ(Buffer.from(
		`100644 blob ${OID_A}\tREADME.md\0` +
		`100755 blob ${OID_B}\tscripts/run.sh\0`,
	));
	assert.deepEqual(tree.map(({ mode, path }) => ({ mode, path })), [
		{ mode: "100644", path: "README.md" },
		{ mode: "100755", path: "scripts/run.sh" },
	]);
	assert.throws(() => parseLsTreeZ(Buffer.from(`100644 blob ${OID_A}\t../escape\0`)), /unsafe/u);
	assert.throws(() => parseLsTreeZ(Buffer.from(`100644 blob ${OID_A}\t.git/config\0`)), /unsafe/u);
	assert.throws(
		() => parseLsTreeZ(Buffer.from(`100644 blob ${OID_A}\tName\0` + `100644 blob ${OID_B}\tname\0`)),
		/collision/u,
	);
	assert.throws(() => parseLsTreeZ(Buffer.from(`100644 blob ${OID_A}\tmissing-nul`)), /NUL terminated/u);

	const batch = Buffer.concat([
		Buffer.from(`${OID_A} blob 4\n`),
		Buffer.from("one\n"),
		Buffer.from("\n"),
		Buffer.from(`${OID_B} blob 3\n`),
		Buffer.from("two"),
		Buffer.from("\n"),
	]);
	const objects = parseCatFileBatch(batch, [OID_A, OID_B]);
	assert.equal(objects.get(OID_A).toString("utf8"), "one\n");
	assert.equal(objects.get(OID_B).toString("utf8"), "two");
	assert.throws(() => parseCatFileBatch(batch, [OID_B, OID_A]), /out of order/u);
	assert.throws(() => parseCatFileBatch(batch.subarray(0, -1), [OID_A, OID_B]), /framing/u);
	assert.throws(() => parseCatFileBatch(Buffer.from(`${OID_A} missing\n`), [OID_A]), /malformed/u);
	assert.throws(() => parseCatFileBatch(Buffer.alloc(0), ["../bad"]), /object ID/u);
});

test("typed fixture helpers create two locked no-checkout worktrees, materialize exact blobs, isolate writes, and retain branches", async (context) => {
	if (!await requireLocalGit(context)) return;
	const fixtureOptions = {
		prefix: "pi-sub-agents-worktree-fixture-test",
		files: {
			".gitignore": "ignored/\n",
			"README.md": "offline worktree fixture\n",
			"scripts/run.sh": "#!/bin/sh\nprintf fixture\n",
			"src/value.txt": "one\n",
		},
		executableFiles: ["scripts/run.sh"],
		...(process.platform === "win32" ? {} : { symlinks: { "value-link": "src/value.txt" } }),
	};
	await withTempGitRepository(fixtureOptions, async ({ baseCommit, repository, worktrees }) => {
		const inspection = await worktrees.inspectRepository();
		assert.equal(inspection.topLevel, resolve(repository));
		assert.equal(inspection.headCommit, baseCommit);
		assert.equal(inspection.branchRef, "refs/heads/main");
		assert.equal(inspection.clean, true);
		assert.match(inspection.objectFormat, /^sha(?:1|256)$/u);

		const first = await worktrees.registerOwnedNoCheckout("first");
		const second = await worktrees.registerOwnedNoCheckout("second");
		assert.deepEqual(await readdir(first.path), [".git"]);
		assert.deepEqual(await readdir(second.path), [".git"]);
		let listed = await worktrees.list();
		for (const record of [first, second]) {
			const entry = listed.find((candidate) => candidate.path === record.path);
			assert.ok(entry);
			assert.equal(entry.branch, record.branchRef);
			assert.equal(entry.head, baseCommit);
			assert.equal(entry.locked, "pi-sub-agents-offline-fixture");
		}

		const [firstSnapshot, secondSnapshot] = await Promise.all([
			worktrees.prepareOwnedSnapshot("first"),
			worktrees.prepareOwnedSnapshot("second"),
		]);
		await Promise.all([
			materializeFixtureSnapshot(first.path, firstSnapshot),
			materializeFixtureSnapshot(second.path, secondSnapshot),
		]);
		assert.equal(await readFile(join(first.path, "src/value.txt"), "utf8"), "one\n");
		assert.equal(await readFile(join(second.path, "src/value.txt"), "utf8"), "one\n");
		if (process.platform !== "win32") {
			assert.equal(await readlink(join(first.path, "value-link")), "src/value.txt");
			assert.notEqual((await stat(join(first.path, "scripts/run.sh"))).mode & 0o111, 0);
		}
		assert.equal((await worktrees.indexEntriesOwned("first")).includes(Buffer.from("src/value.txt")), true);
		assert.equal((await worktrees.statusOwned("first")).length, 0);
		assert.equal((await worktrees.diffNumstatOwned("first")).length, 0);

		await writeFile(join(first.path, "src/value.txt"), "first-only\n");
		assert.equal(await readFile(join(second.path, "src/value.txt"), "utf8"), "one\n");
		assert.notEqual((await worktrees.statusOwned("first")).length, 0);
		assert.notEqual((await worktrees.diffNumstatOwned("first")).length, 0);
		await assert.rejects(worktrees.removeOwnedClean("first"), /dirty or extra-entry/u);
		assert.equal((await worktrees.list()).some((entry) => entry.path === first.path && entry.locked), true);

		await writeFile(join(first.path, "src/value.txt"), "one\n");
		await mkdir(join(first.path, "ignored"));
		await writeFile(join(first.path, "ignored/cache"), "ignored\n");
		assert.notEqual((await worktrees.statusOwned("first", { includeIgnored: true })).length, 0);
		await assert.rejects(worktrees.removeOwnedClean("first"), /dirty or extra-entry/u);
		await rm(join(first.path, "ignored"), { recursive: true });
		await mkdir(join(first.path, "empty-extra"));
		assert.equal((await worktrees.statusOwned("first", { includeIgnored: true })).length, 0);
		await assert.rejects(worktrees.removeOwnedClean("first"), /extra directory/u);
		await rm(join(first.path, "empty-extra"), { recursive: true });

		await worktrees.unlockOwned("first");
		listed = await worktrees.list();
		assert.equal(Boolean(listed.find((entry) => entry.path === first.path)?.locked), false);
		await worktrees.lockOwned("first");
		assert.equal(Boolean((await worktrees.list()).find((entry) => entry.path === first.path)?.locked), true);

		await worktrees.removeOwnedClean("first");
		await worktrees.removeOwnedClean("second");
		await assert.rejects(access(first.path));
		await assert.rejects(access(second.path));
		assert.equal(await worktrees.branchCommitOwned("first"), baseCommit);
		assert.equal(await worktrees.branchCommitOwned("second"), baseCommit);
		assert.equal((await worktrees.list()).length, 1, "only the parent worktree remains registered");
	});
});

test("typed worktree helpers reject malformed, stale, cancelled, symlinked, and unowned targets without touching outside data", async (context) => {
	if (!await requireLocalGit(context)) return;
	await withTempGitRepository({
		prefix: "pi-sub-agents-worktree-refusal-test",
		files: { "src/value.txt": "one\n" },
	}, async ({ baseCommit, outside, worktreeRoot, worktrees }) => {
		const sentinel = join(outside, "sentinel.txt");
		await writeFile(sentinel, "outside\n");
		const unowned = await worktrees.registerUnownedNoCheckoutForTest("outsider");
		await assert.rejects(worktrees.removeOwnedClean("outsider"), /does not own/u);
		assert.equal((await worktrees.list()).some((entry) => entry.path === unowned.path), true);
		assert.equal(await readFile(sentinel, "utf8"), "outside\n");

		await assert.rejects(worktrees.registerOwnedNoCheckout("../escape"), /workspace ID/u);
		await assert.rejects(worktrees.registerOwnedNoCheckout("Uppercase"), /workspace ID/u);
		await assert.rejects(
			worktrees.registerOwnedNoCheckout("foreign", { baseCommit: OID_B === baseCommit ? OID_A : OID_B }),
			/stale or foreign/u,
		);

		if (process.platform !== "win32") {
			await symlink(outside, join(worktreeRoot, "fixture-escape"));
			await assert.rejects(worktrees.registerOwnedNoCheckout("escape"), /destination already exists/u);
			assert.equal(await readFile(sentinel, "utf8"), "outside\n");
		}

		const controller = new AbortController();
		controller.abort(new Error("fixture cancellation"));
		await assert.rejects(
			worktrees.registerOwnedNoCheckout("cancelled", { signal: controller.signal }),
			/fixture cancellation/u,
		);
		assert.equal((await worktrees.list()).some((entry) => entry.branch?.endsWith("/cancelled")), false);
		assert.equal(await readFile(sentinel, "utf8"), "outside\n");
	});
});

test("no-checkout snapshot preparation rejects a preexisting symlink parent before any object materialization", async (context) => {
	if (!await requireLocalGit(context)) return;
	if (process.platform === "win32") {
		context.skip("symlink creation requires platform-specific privileges on Windows");
		return;
	}
	await withTempGitRepository({
		prefix: "pi-sub-agents-worktree-symlink-test",
		files: { "src/value.txt": "one\n" },
	}, async ({ outside, worktrees }) => {
		const record = await worktrees.registerOwnedNoCheckout("symlinked");
		const sentinel = join(outside, "value.txt");
		await writeFile(sentinel, "outside\n");
		await symlink(outside, join(record.path, "src"));
		await assert.rejects(worktrees.prepareOwnedSnapshot("symlinked"), /unexpected preexisting entry/u);
		assert.equal(await readFile(sentinel, "utf8"), "outside\n");
	});
});

test("clean-removal fixture refuses an explicitly conflicted index and retains the locked worktree", async (context) => {
	if (!await requireLocalGit(context)) return;
	await withTempGitRepository({
		prefix: "pi-sub-agents-worktree-conflict-test",
		files: { "src/value.txt": "one\n" },
	}, async ({ worktrees }) => {
		const record = await worktrees.registerOwnedNoCheckout("conflicted");
		const snapshot = await worktrees.prepareOwnedSnapshot("conflicted");
		await materializeFixtureSnapshot(record.path, snapshot);
		assert.equal((await worktrees.statusOwned("conflicted")).length, 0);
		assert.equal(await worktrees.injectOwnedIndexConflictForTest("conflicted"), "src/value.txt");
		assert.notEqual((await worktrees.statusOwned("conflicted")).length, 0);
		await assert.rejects(worktrees.removeOwnedClean("conflicted"), /dirty or extra-entry/u);
		const retained = (await worktrees.list()).find((entry) => entry.path === record.path);
		assert.ok(retained?.locked);
	});
});
