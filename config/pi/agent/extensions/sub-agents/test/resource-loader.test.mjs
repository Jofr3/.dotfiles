import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
	importInstalledPackages,
	importSubAgentsModule,
} from "./installed-packages.mjs";

const {
	SubAgentResourceLoaderError,
	captureParentContextSnapshot,
	createSubAgentResourceLoader,
} = await importSubAgentsModule("resource-loader.ts");
const { SUB_AGENT_BOUNDS } = await importSubAgentsModule("types.ts");

function spec(overrides = {}) {
	return {
		name: "isolated-resources",
		role: "Inspect only the dynamically approved project context",
		objective: "Return a bounded summary without loading parent extensions or personas.",
		...overrides,
	};
}

function assertResourceError(error, code) {
	assert.ok(error instanceof SubAgentResourceLoaderError);
	assert.equal(error.code, code);
	return true;
}

test("trusted parent context is copied into immutable generation-scoped isolated resources", async () => {
	const generation = "sag1-resource-generation";
	const source = [
		{ path: "/project/CLAUDE.md", content: "TRUSTED_CONTEXT_A" },
		{ path: "/project/packages/a/CLAUDE.md", content: "TRUSTED_CONTEXT_B" },
	];
	const snapshot = captureParentContextSnapshot({
		generation,
		trusted: true,
		contextFiles: source,
		capturedAt: 123,
	});
	source[0].content = "MUTATED_AFTER_CAPTURE";

	assert.equal(snapshot.version, 1);
	assert.equal(snapshot.generation, generation);
	assert.equal(snapshot.capturedAt, 123);
	assert.equal(snapshot.trusted, true);
	assert.ok(Object.isFrozen(snapshot));
	assert.ok(Object.isFrozen(snapshot.files));
	assert.ok(Object.isFrozen(snapshot.files[0]));
	assert.deepEqual(snapshot.files, [
		{ path: "/project/CLAUDE.md", content: "TRUSTED_CONTEXT_A" },
		{ path: "/project/packages/a/CLAUDE.md", content: "TRUSTED_CONTEXT_B" },
	]);

	const loader = createSubAgentResourceLoader({
		id: "sa1-resource-generation-1-child",
		generation,
		spec: spec(),
		parentContext: snapshot,
	});
	await loader.reload();
	const extensions = loader.getExtensions();
	assert.deepEqual(extensions.extensions, []);
	assert.deepEqual(extensions.errors, []);
	assert.equal(loader.getExtensions().runtime, extensions.runtime, "one loader owns one stable empty runtime");
	assert.deepEqual(loader.getSkills(), { skills: [], diagnostics: [] });
	assert.deepEqual(loader.getPrompts(), { prompts: [], diagnostics: [] });
	assert.deepEqual(loader.getThemes(), { themes: [], diagnostics: [] });
	assert.deepEqual(loader.getAppendSystemPrompt(), []);
	assert.match(loader.getSystemPrompt(), /^# Managed Pi sub-agent protocol/);
	assert.match(loader.getSystemPrompt(), /sa1-resource-generation-1-child/);

	const firstRead = loader.getAgentsFiles().agentsFiles;
	assert.deepEqual(firstRead, snapshot.files);
	firstRead[0].content = "MUTATED_LOADER_RESULT";
	assert.equal(loader.getAgentsFiles().agentsFiles[0].content, "TRUSTED_CONTEXT_A");
	assert.doesNotThrow(() => loader.extendResources({}));
	assert.throws(
		() => loader.extendResources({ skillPaths: [{ path: "/forbidden", metadata: {} }] }),
		(error) => assertResourceError(error, "dynamic_resources_rejected"),
	);

	const secondLoader = createSubAgentResourceLoader({
		id: "sa1-resource-generation-2-child",
		generation,
		spec: spec({ name: "second-isolated-loader" }),
		parentContext: snapshot,
	});
	assert.notEqual(secondLoader.getExtensions().runtime, extensions.runtime, "each child gets a fresh extension runtime");
});

test("untrusted, missing, and stale snapshots yield no child context while malformed current snapshots fail closed", () => {
	const generation = "sag1-current-generation";
	const untrusted = captureParentContextSnapshot({
		generation,
		trusted: false,
		contextFiles: [{ path: "", content: 42 }],
		capturedAt: 1,
	});
	assert.deepEqual(untrusted.files, [], "untrusted candidate content is not inspected or copied");

	for (const parentContext of [
		undefined,
		untrusted,
		captureParentContextSnapshot({
			generation: "sag1-stale-generation",
			trusted: true,
			contextFiles: [{ path: "/old/CLAUDE.md", content: "STALE_CONTEXT" }],
			capturedAt: 1,
		}),
	]) {
		const loader = createSubAgentResourceLoader({
			id: "sa1-current-generation-1-child",
			generation,
			spec: spec(),
			parentContext,
		});
		assert.deepEqual(loader.getAgentsFiles().agentsFiles, []);
	}

	assert.throws(
		() =>
			createSubAgentResourceLoader({
				id: "sa1-current-generation-2-child",
				generation,
				spec: spec(),
				parentContext: {
					version: 1,
					generation,
					trusted: true,
					capturedAt: 1,
					files: [{ path: "", content: "invalid" }],
				},
			}),
		(error) => assertResourceError(error, "invalid_context_snapshot"),
	);
});

test("parent context snapshots enforce file, path, per-file, and aggregate UTF-8 bounds", () => {
	const base = {
		generation: "sag1-context-bounds",
		trusted: true,
		capturedAt: 1,
	};
	assert.throws(
		() =>
			captureParentContextSnapshot({
				...base,
				contextFiles: Array.from(
					{ length: SUB_AGENT_BOUNDS.contextFiles + 1 },
					(_, index) => ({ path: `/context/${index}`, content: "x" }),
				),
			}),
		(error) => assertResourceError(error, "context_snapshot_too_large"),
	);
	assert.throws(
		() =>
			captureParentContextSnapshot({
				...base,
				contextFiles: [{
					path: "x".repeat(SUB_AGENT_BOUNDS.contextPathChars + 1),
					content: "x",
				}],
			}),
		(error) => assertResourceError(error, "invalid_context_snapshot"),
	);
	assert.throws(
		() =>
			captureParentContextSnapshot({
				...base,
				contextFiles: [{
					path: "/context/oversized",
					content: "界".repeat(Math.ceil(SUB_AGENT_BOUNDS.contextFileBytes / Buffer.byteLength("界")) + 1),
				}],
			}),
		(error) => assertResourceError(error, "context_snapshot_too_large"),
	);

	const content = "x".repeat(SUB_AGENT_BOUNDS.contextFileBytes);
	assert.throws(
		() =>
			captureParentContextSnapshot({
				...base,
				contextFiles: Array.from({ length: 5 }, (_, index) => ({
					path: `/context/${index}`,
					content,
				})),
			}),
		(error) => assertResourceError(error, "context_snapshot_too_large"),
	);
});

test("a production isolated loader composes approved context without discovering recursive project extensions", async () => {
	const { codingAgent, piAi } = await importInstalledPackages();
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agents-production-resources-"));
	let session;

	try {
		const projectDir = join(root, "project");
		const forbiddenExtension = join(projectDir, ".pi", "extensions", "recursive.ts");
		await mkdir(dirname(forbiddenExtension), { recursive: true });
		await writeFile(
			forbiddenExtension,
			'export default function (pi) { pi.registerTool({ name: "sub_agents_spawn", label: "forbidden", description: "forbidden", parameters: {}, execute: async () => ({ content: [] }) }); }',
			"utf8",
		);

		const generation = "sag1-production-loader";
		const parentContext = captureParentContextSnapshot({
			generation,
			trusted: true,
			contextFiles: [{ path: join(projectDir, "CLAUDE.md"), content: "APPROVED_PRODUCTION_CONTEXT" }],
			capturedAt: 1,
		});
		const loader = createSubAgentResourceLoader({
			id: "sa1-production-loader-1-child",
			generation,
			spec: spec(),
			parentContext,
		});

		const capturedPrompts = [];
		const faux = piAi.fauxProvider({ provider: "production-resource-faux", tokensPerSecond: 100_000 });
		faux.setResponses([
			(context) => {
				capturedPrompts.push(context.systemPrompt);
				return piAi.fauxAssistantMessage("isolated child complete");
			},
		]);
		const modelRuntime = await codingAgent.ModelRuntime.create({
			credentials: new piAi.InMemoryCredentialStore(),
			modelsPath: null,
			allowModelNetwork: false,
		});
		modelRuntime.registerNativeProvider(faux.provider);
		const model = modelRuntime.getModel("production-resource-faux", "faux-1");
		assert.ok(model);

		({ session } = await codingAgent.createAgentSession({
			cwd: projectDir,
			model,
			thinkingLevel: "off",
			modelRuntime,
			tools: ["read"],
			resourceLoader: loader,
			sessionManager: codingAgent.SessionManager.inMemory(projectDir),
			settingsManager: codingAgent.SettingsManager.inMemory({
				compaction: { enabled: false },
				retry: { enabled: false },
			}),
		}));
		assert.deepEqual(session.getAllTools().map((tool) => tool.name), ["read"]);
		await session.prompt("begin isolated assignment");
		assert.equal(capturedPrompts.length, 1);
		const systemPrompt = capturedPrompts[0];
		const contextIndex = systemPrompt.indexOf("<project_context>");
		const cwdIndex = systemPrompt.indexOf("Current working directory:");
		assert.ok(contextIndex > systemPrompt.indexOf("# Managed Pi sub-agent protocol"));
		assert.ok(cwdIndex > contextIndex);
		assert.match(systemPrompt, /APPROVED_PRODUCTION_CONTEXT/);
		assert.doesNotMatch(systemPrompt, /sub_agents_spawn/);
	} finally {
		session?.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
