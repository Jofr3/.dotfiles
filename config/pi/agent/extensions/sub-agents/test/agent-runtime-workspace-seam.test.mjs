import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { importSubAgentsModule } from "./installed-packages.mjs";

const {
	SubAgentSessionFactoryError,
	createSubAgentSession,
	resolveSubAgentSessionWorkspace,
} = await importSubAgentsModule("agent-runtime.ts");
const { captureParentContextSnapshot } = await importSubAgentsModule("resource-loader.ts");

function spec(overrides = {}) {
	return {
		name: "workspace-seam",
		role: "Validate the resolved workspace seam",
		objective: "Return the resolved workspace metadata.",
		...overrides,
	};
}

function worktreeIdentity(root) {
	const workspaceId = `saw1-${"C".repeat(32)}`;
	return Object.freeze({
		mode: "worktree",
		root: resolve(root),
		key: `sawk1-${"D".repeat(32)}`,
		workspaceId,
		branch: `refs/heads/pi/sub-agents/0123456789abcdef/${workspaceId}`,
		baseCommit: "b".repeat(40),
	});
}

function assertFactoryError(error, code) {
	assert.ok(error instanceof SubAgentSessionFactoryError);
	assert.equal(error.code, code);
	return true;
}

test("pre-resolved worktree context display paths map to the child workspace without rereading files", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runtime-worktree-context-"));
	try {
		const parentRoot = join(root, "repo", "packages", "app");
		const worktreeRoot = join(root, "state", "trees", "workspace", "packages", "app");
		const worktreeCwd = join(worktreeRoot, "src");
		await Promise.all([
			mkdir(parentRoot, { recursive: true }),
			mkdir(worktreeCwd, { recursive: true }),
		]);
		const generation = "sag1-worktree-context-seam";
		const outsidePath = join(root, "outside", "GLOBAL.md");
		const parentContext = captureParentContextSnapshot({
			generation,
			trusted: true,
			contextFiles: [
				{ path: join(parentRoot, "CLAUDE.md"), content: "IN_REPO_CONTEXT" },
				{ path: outsidePath, content: "OUTSIDE_CONTEXT" },
			],
			capturedAt: 1,
		});
		const identity = worktreeIdentity(worktreeRoot);
		let captured;

		await assert.rejects(
			createSubAgentSession({
				id: "sa1-worktree-context-seam-1-child",
				generation,
				cwd: parentRoot,
				resolvedWorkspace: { identity, cwd: worktreeCwd },
				spec: spec({ tools: [], workspace: { mode: "worktree", bashPolicy: "disabled" } }),
				resolvedModel: {
					runtime: {},
					model: {},
					ref: { provider: "fake", id: "fake-model" },
				},
				parentContext,
				onEvent() {},
				onReport() {},
				dependencies: {
					async createSession(options) {
						captured = {
							cwd: options.cwd,
							contextFiles: options.resourceLoader.getAgentsFiles().agentsFiles,
						};
						throw new Error("synthetic stop after resource construction");
					},
				},
			}),
			(error) => assertFactoryError(error, "session_initialization_failed"),
		);

		assert.equal(captured.cwd, resolve(worktreeCwd));
		assert.deepEqual(captured.contextFiles, [
			{ path: join(resolve(worktreeRoot), "CLAUDE.md"), content: "IN_REPO_CONTEXT" },
			{ path: outsidePath, content: "OUTSIDE_CONTEXT" },
		]);
		assert.deepEqual(parentContext.files[0], {
			path: join(parentRoot, "CLAUDE.md"),
			content: "IN_REPO_CONTEXT",
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("resolved workspace seam preserves shared fallback and accepts exact prepared worktree cwd", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agent-runtime-workspace-seam-"));
	try {
		const shared = join(root, "shared");
		const sharedNested = join(shared, "packages", "shared-child");
		const worktree = join(root, "state", "trees", "worktree-child");
		const worktreeNested = join(worktree, "packages", "worktree-child");
		await Promise.all([
			mkdir(sharedNested, { recursive: true }),
			mkdir(worktreeNested, { recursive: true }),
		]);

		const sharedResolved = await resolveSubAgentSessionWorkspace(
			shared,
			spec({ workspace: { mode: "shared", cwd: "packages/shared-child" } }),
		);
		assert.deepEqual(sharedResolved.identity, {
			mode: "shared",
			root: resolve(shared),
			key: `shared:${resolve(shared)}`,
		});
		assert.equal(sharedResolved.cwd, resolve(sharedNested));

		const identity = worktreeIdentity(worktree);
		const prepared = await resolveSubAgentSessionWorkspace(
			shared,
			spec({ workspace: { mode: "worktree", bashPolicy: "disabled" } }),
			{ identity, cwd: worktreeNested },
		);
		assert.deepEqual(prepared.identity, identity);
		assert.equal(prepared.cwd, resolve(worktreeNested));
		assert.ok(Object.isFrozen(prepared));
		assert.ok(Object.isFrozen(prepared.identity));

		await assert.rejects(
			resolveSubAgentSessionWorkspace(
				shared,
				spec({ workspace: { mode: "worktree" } }),
			),
			(error) => assertFactoryError(error, "unsupported_workspace"),
		);
		await assert.rejects(
			resolveSubAgentSessionWorkspace(
				shared,
				spec({ workspace: { mode: "shared" } }),
				{ identity, cwd: worktreeNested },
			),
			(error) => assertFactoryError(error, "invalid_runtime_request"),
		);
		await assert.rejects(
			resolveSubAgentSessionWorkspace(
				shared,
				spec({ workspace: { mode: "worktree" } }),
				{ identity, cwd: join(worktree, ".git") },
			),
			(error) => assertFactoryError(error, "workspace_unavailable"),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
