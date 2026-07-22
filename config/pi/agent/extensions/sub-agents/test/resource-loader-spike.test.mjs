import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { importInstalledPackages } from "./installed-packages.mjs";

function createIsolatedResourceLoader(codingAgent, { systemPrompt, contextFiles }) {
	const extensionsResult = {
		extensions: [],
		errors: [],
		runtime: codingAgent.createExtensionRuntime(),
	};
	const approvedContext = contextFiles.map(({ path, content }) => ({ path, content }));

	return {
		getExtensions: () => extensionsResult,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: approvedContext.map((file) => ({ ...file })) }),
		getSystemPrompt: () => systemPrompt,
		getAppendSystemPrompt: () => [],
		extendResources(paths) {
			const count =
				(paths.skillPaths?.length ?? 0) +
				(paths.promptPaths?.length ?? 0) +
				(paths.themePaths?.length ?? 0);
			if (count > 0) throw new Error("Isolated child resource loaders reject dynamic resource extension");
		},
		async reload() {},
	};
}

function approveParentContext(projectTrusted, parentContextFiles) {
	if (!projectTrusted) return [];
	return parentContextFiles.map(({ path, content }) => ({ path, content }));
}

function snapshotResourceLoader(loader) {
	return {
		extensions: loader.getExtensions().extensions.map((extension) => extension.path),
		extensionErrors: loader.getExtensions().errors,
		skills: loader.getSkills().skills.map((skill) => skill.name),
		prompts: loader.getPrompts().prompts.map((prompt) => prompt.name),
		themes: loader.getThemes().themes.map((theme) => theme.name),
		contextFiles: loader.getAgentsFiles().agentsFiles,
		systemPrompt: loader.getSystemPrompt(),
		appendSystemPrompt: loader.getAppendSystemPrompt(),
	};
}

function dynamicPrompt({ id, name, role, objective }) {
	return [
		"You are a dynamically configured managed Pi sub-agent.",
		`Sub-agent ID: ${id}`,
		`Name: ${name}`,
		`Role: ${role}`,
		`Objective: ${objective}`,
		"Do not create other sub-agents.",
	].join("\n");
}

async function writeFixtureResources(projectDir, agentDir) {
	const files = new Map([
		[join(projectDir, "CLAUDE.md"), "TRUSTED_PROJECT_CONTEXT_MARKER"],
		[
			join(projectDir, ".pi", "extensions", "parent-tools.ts"),
			'export default function (pi) { pi.registerTool({ name: "sub_agents_spawn", label: "forbidden", description: "forbidden", parameters: {}, execute: async () => ({ content: [] }) }); }',
		],
		[join(projectDir, ".pi", "skills", "forbidden", "SKILL.md"), "FORBIDDEN_SKILL_MARKER"],
		[join(projectDir, ".pi", "prompts", "forbidden.md"), "FORBIDDEN_PROMPT_MARKER"],
		[join(projectDir, ".pi", "themes", "forbidden.json"), "FORBIDDEN_THEME_MARKER"],
		[join(projectDir, ".pi", "agents", "forbidden.md"), "FORBIDDEN_AGENT_PROFILE_MARKER"],
		[join(projectDir, ".pi", "SYSTEM.md"), "FORBIDDEN_SYSTEM_PROMPT_MARKER"],
		[join(projectDir, ".pi", "APPEND_SYSTEM.md"), "FORBIDDEN_APPEND_PROMPT_MARKER"],
		[join(agentDir, "extensions", "global-parent-tools.ts"), "FORBIDDEN_GLOBAL_EXTENSION_MARKER"],
	]);

	for (const [path, content] of files) {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content, "utf8");
	}
	return { contextPath: join(projectDir, "CLAUDE.md") };
}

test("an explicit child ResourceLoader is fail-closed while DefaultResourceLoader isolation flags remain equivalent", async () => {
	const { codingAgent } = await importInstalledPackages();
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agents-resources-"));

	try {
		const projectDir = join(root, "project");
		const agentDir = join(root, "agent");
		const { contextPath } = await writeFixtureResources(projectDir, agentDir);
		const parentContextFiles = [{ path: contextPath, content: await readFile(contextPath, "utf8") }];
		const approvedContext = approveParentContext(true, parentContextFiles);
		const prompt = dynamicPrompt({
			id: "child-fixture",
			name: "resource-audit",
			role: "Inspect resource isolation",
			objective: "Prove only approved resources are visible.",
		});

		const explicitLoader = createIsolatedResourceLoader(codingAgent, {
			systemPrompt: prompt,
			contextFiles: approvedContext,
		});
		await explicitLoader.reload();

		const settingsManager = codingAgent.SettingsManager.inMemory();
		const defaultLoader = new codingAgent.DefaultResourceLoader({
			cwd: projectDir,
			agentDir,
			settingsManager,
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			systemPrompt: prompt,
			appendSystemPrompt: [],
			agentsFilesOverride: () => ({ agentsFiles: approvedContext }),
		});
		await defaultLoader.reload();

		const expected = {
			extensions: [],
			extensionErrors: [],
			skills: [],
			prompts: [],
			themes: [],
			contextFiles: approvedContext,
			systemPrompt: prompt,
			appendSystemPrompt: [],
		};
		assert.deepEqual(snapshotResourceLoader(explicitLoader), expected);
		assert.deepEqual(snapshotResourceLoader(defaultLoader), expected);
		assert.throws(
			() => explicitLoader.extendResources({ skillPaths: [{ path: contextPath, metadata: {} }] }),
			/Isolated child resource loaders reject dynamic resource extension/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("isolated child sessions compose dynamic prompts with trusted context and never inherit parent tools", async () => {
	const { codingAgent, piAi } = await importInstalledPackages();
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agents-context-"));
	const sessions = [];

	try {
		const projectDir = join(root, "project");
		const agentDir = join(root, "agent");
		const { contextPath } = await writeFixtureResources(projectDir, agentDir);
		const parentContextFiles = [{ path: contextPath, content: await readFile(contextPath, "utf8") }];

		const trustedPrompt = dynamicPrompt({
			id: "child-trusted",
			name: "trusted-review",
			role: "Review trusted project guidance",
			objective: "Return a bounded review.",
		});
		const untrustedPrompt = dynamicPrompt({
			id: "child-untrusted",
			name: "untrusted-review",
			role: "Work without project guidance",
			objective: "Return a bounded inventory.",
		});

		const faux = piAi.fauxProvider({ provider: "resource-loader-faux", tokensPerSecond: 100_000 });
		const capturedPrompts = [];
		faux.setResponses([
			(context) => {
				capturedPrompts.push(context.systemPrompt);
				return piAi.fauxAssistantMessage("trusted child complete");
			},
			(context) => {
				capturedPrompts.push(context.systemPrompt);
				return piAi.fauxAssistantMessage("untrusted child complete");
			},
		]);

		const modelRuntime = await codingAgent.ModelRuntime.create({
			credentials: new piAi.InMemoryCredentialStore(),
			modelsPath: null,
			allowModelNetwork: false,
		});
		modelRuntime.registerNativeProvider(faux.provider);
		const model = modelRuntime.getModel("resource-loader-faux", "faux-1");
		assert.ok(model);

		const reportTool = codingAgent.defineTool({
			name: "report_to_parent",
			label: "Report to Parent",
			description: "Record a bounded child report in the owning manager",
			parameters: piAi.Type.Object({ summary: piAi.Type.String() }),
			async execute(_toolCallId, params) {
				return { content: [{ type: "text", text: params.summary }], details: {} };
			},
		});

		async function createChild(prompt, projectTrusted) {
			const loader = createIsolatedResourceLoader(codingAgent, {
				systemPrompt: prompt,
				contextFiles: approveParentContext(projectTrusted, parentContextFiles),
			});
			await loader.reload();
			const sessionManager = codingAgent.SessionManager.inMemory(projectDir);
			const settingsManager = codingAgent.SettingsManager.inMemory({
				compaction: { enabled: false },
				retry: { enabled: false },
			});
			const { session } = await codingAgent.createAgentSession({
				cwd: projectDir,
				agentDir,
				model,
				thinkingLevel: "off",
				modelRuntime,
				customTools: [reportTool],
				tools: ["read", "report_to_parent"],
				resourceLoader: loader,
				sessionManager,
				settingsManager,
			});
			sessions.push(session);
			return session;
		}

		const trustedSession = await createChild(trustedPrompt, true);
		const untrustedSession = await createChild(untrustedPrompt, false);

		for (const session of sessions) {
			assert.deepEqual(session.getActiveToolNames().sort(), ["read", "report_to_parent"]);
			assert.deepEqual(
				session.getAllTools().map((tool) => tool.name).sort(),
				["read", "report_to_parent"],
			);
			assert.ok(!session.agent.state.tools.some((tool) => tool.name.startsWith("sub_agents_")));
		}

		await trustedSession.prompt("begin trusted assignment");
		await untrustedSession.prompt("begin untrusted assignment");
		assert.equal(capturedPrompts.length, 2);

		const trustedSystemPrompt = capturedPrompts[0];
		const untrustedSystemPrompt = capturedPrompts[1];
		assert.ok(trustedSystemPrompt.startsWith(trustedPrompt));
		assert.ok(untrustedSystemPrompt.startsWith(untrustedPrompt));
		assert.ok(!trustedSystemPrompt.includes("Work without project guidance"));
		assert.ok(!untrustedSystemPrompt.includes("Review trusted project guidance"));

		const contextIndex = trustedSystemPrompt.indexOf("<project_context>");
		const cwdIndex = trustedSystemPrompt.indexOf("Current working directory:");
		assert.ok(contextIndex > trustedSystemPrompt.indexOf("Return a bounded review."));
		assert.ok(cwdIndex > contextIndex);
		assert.ok(trustedSystemPrompt.includes("TRUSTED_PROJECT_CONTEXT_MARKER"));
		assert.ok(!untrustedSystemPrompt.includes("TRUSTED_PROJECT_CONTEXT_MARKER"));
		assert.ok(!untrustedSystemPrompt.includes("<project_context>"));

		for (const systemPrompt of capturedPrompts) {
			assert.ok(!systemPrompt.includes("FORBIDDEN_SKILL_MARKER"));
			assert.ok(!systemPrompt.includes("FORBIDDEN_PROMPT_MARKER"));
			assert.ok(!systemPrompt.includes("FORBIDDEN_THEME_MARKER"));
			assert.ok(!systemPrompt.includes("FORBIDDEN_AGENT_PROFILE_MARKER"));
			assert.ok(!systemPrompt.includes("FORBIDDEN_SYSTEM_PROMPT_MARKER"));
			assert.ok(!systemPrompt.includes("FORBIDDEN_APPEND_PROMPT_MARKER"));
			assert.ok(!systemPrompt.includes("FORBIDDEN_GLOBAL_EXTENSION_MARKER"));
			assert.ok(!systemPrompt.includes("sub_agents_spawn"));
		}
	} finally {
		for (const session of sessions) session.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
