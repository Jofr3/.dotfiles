import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
	createBarrier,
	createDeferred,
	createTempDirectoryFixture,
	withOfflineFauxProvider,
	withTempWorkspace,
} from "./fixtures.mjs";
import {
	isLocalGitAvailable,
	withTempGitRepository,
} from "./git-fixtures.mjs";

function modelDefinition(id) {
	return {
		id,
		name: id,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 32_000,
		maxTokens: 4_096,
	};
}

test("shared deferred and barrier fixtures settle deterministically and reject duplicate arrivals", async () => {
	const deferred = createDeferred("fixture test");
	assert.equal(deferred.settled, false);
	assert.equal(deferred.resolve("ready"), true);
	assert.equal(deferred.resolve("ignored"), false);
	assert.equal(await deferred.promise, "ready");
	assert.equal(deferred.settled, true);

	const barrier = createBarrier(2, { label: "two-party fixture", timeoutMs: 1_000 });
	await Promise.all([barrier.arrive("left"), barrier.arrive("right")]);
	assert.equal(barrier.size, 2);
	await assert.rejects(barrier.arrive("left"), /Duplicate two-party fixture arrival/u);
});

test("temporary workspace fixtures stay beneath one disposable root and always clean up", async () => {
	const standalone = await createTempDirectoryFixture("pi-sub-agents-standalone-fixture");
	await access(standalone.root);
	await standalone.cleanup();
	await standalone.cleanup();
	await assert.rejects(access(standalone.root));

	let removedRoot;
	await withTempWorkspace({
		prefix: "pi-sub-agents-fixture-test",
		directories: ["src/generated"],
		files: { "src/value.txt": "fixture value\n" },
	}, async ({ temporary, project, outside }) => {
		removedRoot = temporary;
		assert.equal(await readFile(`${project}/src/value.txt`, "utf8"), "fixture value\n");
		await access(`${project}/src/generated`);
		await access(outside);
	});
	await assert.rejects(access(removedRoot));

	await assert.rejects(
		withTempWorkspace({ prefix: "pi-sub-agents-fixture-escape", files: { "../escape": "no" } }, async () => undefined),
		/escapes its temporary root/u,
	);
});

test("offline faux-provider fixtures use only in-memory credentials and consume deterministic responses", async () => {
	await withTempWorkspace({ prefix: "pi-sub-agents-faux-fixture" }, async ({ project }) => {
		await withOfflineFauxProvider({
			providerId: "shared-fixture-faux",
			models: [modelDefinition("shared-fixture-model")],
			modelId: "shared-fixture-model",
		}, async ({ codingAgent, piAi, runtime, provider, model }) => {
			provider.setResponses([piAi.fauxAssistantMessage("fixture response")]);
			const resourceLoader = new codingAgent.DefaultResourceLoader({
				cwd: project,
				agentDir: project,
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
				systemPrompt: "Offline fixture test",
			});
			await resourceLoader.reload();
			const { session } = await codingAgent.createAgentSession({
				cwd: project,
				agentDir: project,
				model,
				thinkingLevel: "off",
				modelRuntime: runtime,
				tools: [],
				customTools: [],
				resourceLoader,
				sessionManager: codingAgent.SessionManager.inMemory(project),
				settingsManager: codingAgent.SettingsManager.inMemory({
					compaction: { enabled: false },
					retry: { enabled: false },
				}),
			});
			try {
				await session.prompt("consume fixture response");
				assert.equal(session.getLastAssistantText(), "fixture response");
				assert.equal(provider.getPendingResponseCount(), 0);
			} finally {
				session.dispose();
			}
		});
	});
});

test("temporary git fixtures have isolated config, disabled hooks, local-only commands, and no remotes", async (context) => {
	const originalCwd = process.cwd();
	if (!await isLocalGitAvailable()) {
		context.skip("local git executable is unavailable");
		return;
	}
	let removedRoot;
	await withTempGitRepository({
		prefix: "pi-sub-agents-git-fixture-test",
		files: { "src/value.txt": "one\n" },
	}, async ({ temporary, repository, runGit, listRemotes }) => {
		removedRoot = temporary;
		assert.deepEqual(await listRemotes(), []);
		assert.equal((await runGit(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim(), "main");
		assert.equal((await runGit(["status", "--porcelain"])).stdout, "");
		assert.equal((await readFile(`${repository}/src/value.txt`, "utf8")), "one\n");
		await assert.rejects(runGit(["fetch", "https://example.invalid/repository"]), /remote-capable/u);
		await assert.rejects(runGit(["show", "https://example.invalid/repository"]), /remote-capable/u);
		await assert.rejects(runGit(["worktree", "add", "../outside", "main"]), /non-allowlisted/u);
		await assert.rejects(runGit(["commit", "--edit"]), /non-allowlisted/u);
		await assert.rejects(runGit(["diff", "--output=/tmp/outside.diff"]), /side-effecting/u);
	});
	assert.equal(process.cwd(), originalCwd);
	await assert.rejects(access(removedRoot));
});
