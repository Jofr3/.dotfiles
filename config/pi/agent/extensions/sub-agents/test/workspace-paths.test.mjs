import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	WorkspacePathError,
	assertCanonicalPathInWriteScope,
	isCanonicalPathInWriteScope,
	isPathWithinRoot,
	resolveCanonicalWorkspacePath,
	resolveCanonicalWriteScope,
	resolveSharedWorkspace,
	stripLeadingPathAt,
} = await importSubAgentsModule("workspace/paths.ts");

function assertPathError(error, code) {
	assert.ok(error instanceof WorkspacePathError);
	assert.equal(error.code, code);
	return true;
}

async function fixture(prefix) {
	const temporary = await mkdtemp(join(tmpdir(), prefix));
	const project = join(temporary, "project");
	const outside = join(temporary, "outside");
	await Promise.all([
		mkdir(join(project, "packages", "a", "src"), { recursive: true }),
		mkdir(outside, { recursive: true }),
	]);
	return { temporary, project, outside };
}

test("shared workspace resolution canonicalizes root/cwd identity and rejects unavailable or escaping directories", async () => {
	const { temporary, project, outside } = await fixture("pi-sub-agent-workspace-root-");
	try {
		const projectAlias = join(temporary, "project-alias");
		await symlink(project, projectAlias);
		const workspace = await resolveSharedWorkspace(projectAlias, "packages/a");
		const canonicalProject = await realpath(project);
		assert.deepEqual(workspace.identity, {
			mode: "shared",
			root: canonicalProject,
			key: `shared:${canonicalProject}`,
		});
		assert.equal(workspace.cwd, await realpath(join(project, "packages", "a")));
		assert.ok(Object.isFrozen(workspace));
		assert.ok(Object.isFrozen(workspace.identity));
		assert.equal(isPathWithinRoot(workspace.identity.root, workspace.cwd), true);
		assert.equal(isPathWithinRoot(workspace.identity.root, outside), false);

		await symlink(outside, join(project, "outside-link"));
		await assert.rejects(
			resolveSharedWorkspace(project, "../outside"),
			(error) => assertPathError(error, "workspace_outside_root"),
		);
		await assert.rejects(
			resolveSharedWorkspace(project, "outside-link"),
			(error) => assertPathError(error, "workspace_outside_root"),
		);
		await assert.rejects(
			resolveSharedWorkspace(project, "missing"),
			(error) => assertPathError(error, "workspace_unavailable"),
		);
		await writeFile(join(project, "not-a-directory"), "file", "utf8");
		await assert.rejects(
			resolveSharedWorkspace(project, "not-a-directory"),
			(error) => assertPathError(error, "workspace_unavailable"),
		);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("canonical mutation paths strip one @, converge existing aliases, and preserve missing-file identity", async () => {
	const { temporary, project } = await fixture("pi-sub-agent-workspace-path-");
	try {
		const workspace = await resolveSharedWorkspace(project, "packages/a");
		const target = join(project, "packages", "a", "src", "target.txt");
		const alias = join(project, "packages", "a", "src", "alias.txt");
		await writeFile(target, "target", "utf8");
		await symlink(target, alias);

		assert.equal(stripLeadingPathAt("@src/target.txt"), "src/target.txt");
		assert.equal(stripLeadingPathAt("@@src/target.txt"), "@src/target.txt");
		const direct = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			cwd: workspace.cwd,
			path: "@src/target.txt",
		});
		const throughAlias = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			cwd: workspace.cwd,
			path: alias,
		});
		assert.deepEqual(throughAlias, direct);
		assert.equal(direct.path, await realpath(target));
		assert.equal(direct.relativePath, "packages/a/src/target.txt");
		assert.equal(direct.exists, true);
		assert.ok(Object.isFrozen(direct));

		const newFile = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			cwd: workspace.cwd,
			path: "src/nested/new.txt",
		});
		assert.equal(newFile.path, resolve(project, "packages/a/src/nested/new.txt"));
		assert.equal(newFile.relativePath, "packages/a/src/nested/new.txt");
		assert.equal(newFile.exists, false);
		assert.equal(newFile.provisionalNamespace, resolve(project, "packages/a/src"));
		await assert.rejects(
			resolveCanonicalWorkspacePath({
				workspace: workspace.identity,
				cwd: workspace.cwd,
				path: "src/nested/new.txt",
				allowMissing: false,
			}),
			(error) => assertPathError(error, "path_unavailable"),
		);
		await assert.rejects(
			resolveCanonicalWorkspacePath({
				workspace: workspace.identity,
				cwd: workspace.cwd,
				path: "@",
			}),
			(error) => assertPathError(error, "invalid_path"),
		);
		await assert.rejects(
			resolveCanonicalWorkspacePath({
				workspace: workspace.identity,
				cwd: workspace.cwd,
				path: "\0invalid",
			}),
			(error) => assertPathError(error, "invalid_path"),
		);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("missing targets canonicalize through inside aliases while outside, dangling, and non-directory ancestors fail closed", async () => {
	const { temporary, project, outside } = await fixture("pi-sub-agent-workspace-symlink-");
	try {
		const workspace = await resolveSharedWorkspace(project);
		const realDirectory = join(project, "real-directory");
		await mkdir(realDirectory);
		await symlink(realDirectory, join(project, "inside-alias"));
		await symlink(outside, join(project, "outside-alias"));
		await symlink(join(outside, "missing-target"), join(project, "dangling-alias"));
		await writeFile(join(project, "plain-file"), "file", "utf8");

		const inside = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			path: "inside-alias/new/child.txt",
		});
		assert.equal(inside.path, join(realDirectory, "new", "child.txt"));
		assert.equal(inside.exists, false);
		assert.equal(inside.provisionalNamespace, realDirectory);

		await assert.rejects(
			resolveCanonicalWorkspacePath({
				workspace: workspace.identity,
				path: "outside-alias/new.txt",
			}),
			(error) => assertPathError(error, "path_outside_root"),
		);
		await assert.rejects(
			resolveCanonicalWorkspacePath({
				workspace: workspace.identity,
				path: "dangling-alias",
			}),
			(error) => assertPathError(error, "path_unavailable"),
		);
		await assert.rejects(
			resolveCanonicalWorkspacePath({
				workspace: workspace.identity,
				path: "plain-file/child.txt",
			}),
			(error) => assertPathError(error, "path_unavailable"),
		);
		await assert.rejects(
			resolveCanonicalWorkspacePath({
				workspace: workspace.identity,
				path: "../outside/new.txt",
			}),
			(error) => assertPathError(error, "path_outside_root"),
		);
		await assert.rejects(
			resolveCanonicalWorkspacePath({
				workspace: workspace.identity,
				path: ".",
			}),
			(error) => assertPathError(error, "invalid_path"),
		);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("declared write scopes are relative, canonical, sorted, deduplicated, bounded, and exact-path enforced", async () => {
	const { temporary, project } = await fixture("pi-sub-agent-workspace-scope-");
	try {
		const workspace = await resolveSharedWorkspace(project);
		const source = join(project, "packages", "a", "src");
		const target = join(source, "target.txt");
		const atLiteral = join(project, "@literal.txt");
		await Promise.all([
			writeFile(target, "target", "utf8"),
			writeFile(atLiteral, "literal", "utf8"),
		]);
		await symlink(target, join(source, "alias.txt"));

		const scope = await resolveCanonicalWriteScope(workspace.identity, [
			"@@literal.txt",
			"packages/a/src/z-new.txt",
			"@packages/a/src/alias.txt",
			"packages/a/src/target.txt",
			"packages/a/src/a-new.txt",
		]);
		assert.ok(scope);
		assert.equal(scope.paths.length, 4);
		assert.deepEqual(
			scope.paths.map((entry) => entry.path),
			[
				atLiteral,
				join(source, "a-new.txt"),
				await realpath(target),
				join(source, "z-new.txt"),
			],
		);
		assert.ok(Object.isFrozen(scope));
		assert.ok(Object.isFrozen(scope.paths));

		const allowed = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			cwd: join(project, "packages", "a"),
			path: "src/alias.txt",
		});
		const denied = await resolveCanonicalWorkspacePath({
			workspace: workspace.identity,
			cwd: join(project, "packages", "a"),
			path: "src/other.txt",
		});
		assert.equal(isCanonicalPathInWriteScope(allowed, scope), true);
		assert.equal(isCanonicalPathInWriteScope(denied, scope), false);
		assert.equal(isCanonicalPathInWriteScope(denied, undefined), true);
		assert.doesNotThrow(() => assertCanonicalPathInWriteScope(allowed, scope));
		assert.throws(
			() => assertCanonicalPathInWriteScope(denied, scope),
			(error) => assertPathError(error, "path_outside_scope"),
		);

		const emptyScope = await resolveCanonicalWriteScope(workspace.identity, []);
		assert.equal(isCanonicalPathInWriteScope(allowed, emptyScope), false);
		assert.equal(await resolveCanonicalWriteScope(workspace.identity, undefined), undefined);
		await assert.rejects(
			resolveCanonicalWriteScope(workspace.identity, [target]),
			(error) => assertPathError(error, "invalid_path"),
		);
		await assert.rejects(
			resolveCanonicalWriteScope(workspace.identity, ["../outside.txt"]),
			(error) => assertPathError(error, "path_outside_root"),
		);
		await assert.rejects(
			resolveCanonicalWriteScope(
				workspace.identity,
				Array.from({ length: 101 }, (_, index) => `file-${index}.txt`),
			),
			(error) => assertPathError(error, "invalid_path"),
		);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});
