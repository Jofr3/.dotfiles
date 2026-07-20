import assert from "node:assert/strict";
import axios from "axios";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "@earendil-works/pi-tui") {
			return { url: "mcp-toolbox-test:tui", shortCircuit: true };
		}
		if (specifier === "typebox") {
			return { url: "mcp-toolbox-test:typebox", shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url === "mcp-toolbox-test:tui") {
			return {
				format: "module",
				shortCircuit: true,
				source: "export class Text { constructor(text, x, y) { this.text = text; this.x = x; this.y = y; } }",
			};
		}
		if (url === "mcp-toolbox-test:typebox") {
			return {
				format: "module",
				shortCircuit: true,
				source: `
					const node = (kind, value, options = {}) => ({ kind, value, ...options });
					export const Type = {
						Object: (properties, options = {}) => node("object", properties, options),
						String: (options = {}) => node("string", undefined, options),
						Record: (key, value, options = {}) => node("record", { key, value }, options),
						Unknown: (options = {}) => node("unknown", undefined, options),
					};
				`,
			};
		}
		return nextLoad(url, context);
	},
});

interface RegisteredTool {
	name: string;
	description: string;
	parameters: { kind: string; value: Record<string, unknown>; additionalProperties?: boolean };
	executionMode?: string;
	promptGuidelines?: string[];
	execute(...args: unknown[]): Promise<unknown>;
}

test("zero-file managed database adoption stays local and explicit external discovery remains bounded", async () => {
	const previousAdapter = axios.defaults.adapter;
	const requests: Array<{ method: string; url: string; proxy: unknown }> = [];
	axios.defaults.adapter = async (config) => {
		const request = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
		requests.push({ method: request.method, url: config.url ?? "", proxy: config.proxy });
		let data: unknown;
		let status = 200;
		if (request.method === "initialize") {
			data = {
				jsonrpc: "2.0",
				id: request.id,
				result: {
					protocolVersion: "2025-11-25",
					capabilities: { tools: {} },
					serverInfo: { name: "offline", version: "1" },
				},
			};
		} else if (request.method === "notifications/initialized") {
			status = 202;
			data = null;
		} else {
			data = {
				jsonrpc: "2.0",
				id: request.id,
				result: {
					tools: [{
						name: "search",
						description: "UNTRUSTED_DESCRIPTION_CANARY",
						inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
					}, {
						name: "authenticated-local-tool",
						description: "must be omitted for unverified loopback",
						inputSchema: { type: "object", properties: {} },
						_meta: { "toolbox/authInvoke": ["local_login"] },
					}],
				},
			};
		}
		return { data, status, statusText: "OK", headers: {}, config, request: {} };
	};
	const tools: RegisteredTool[] = [];
	const commands: Array<{ name: string; definition: { handler(args: string, ctx: any): Promise<void> } }> = [];
	const handlers: Array<{ name: string; handler(event: unknown, ctx: unknown): Promise<void> }> = [];
	const emissions: unknown[] = [];
	const notifications: string[] = [];
	const pi = {
		events: { emit(_channel: string, data: unknown) { emissions.push(data); } },
		registerTool(tool: RegisteredTool) { tools.push(tool); },
		registerCommand(name: string, definition: { handler(args: string, ctx: any): Promise<void> }) {
			commands.push({ name, definition });
		},
		on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) { handlers.push({ name, handler }); },
	};
	const extension = (await import(`../src/index.ts?local-registration=${Date.now()}`)).default;
	try {
		delete process.env.PI_MCP_TOOLBOX_CONFIG;
		extension(pi as never);
		await tools[0]!.execute();
		assert.equal(requests.length, 0, "registration and status must not touch transport");
		const automaticList = await tools[1]!.execute(
			"automatic-managed-list",
			{},
			new AbortController().signal,
			undefined,
			{ hasUI: true, ui: { confirm: async () => { throw new Error("managed list must stay local"); } } },
		) as { content: Array<{ text: string }> };
		assert.match(automaticList.content[0]!.text, /onepassword-db\/execute_sql/u);
		assert.match(automaticList.content[0]!.text, /credentials=dynamic-1password/u);
		assert.equal(requests.length, 0, "managed list must not contact a Toolbox service");
		const managedStatus = await tools[0]!.execute() as { content: Array<{ text: string }> };
		assert.match(managedStatus.content[0]!.text, /session-only managed 1Password database tool/u);
		assert.equal(managedStatus.content[0]!.text.includes("127.0.0.1"), false);
		assert.equal(requests.length, 0, "managed status must stay offline");
		const managedRequirements = await tools[2]!.execute("managed-requirements", {
			server: "onepassword-db",
			tool: "execute_sql",
		}) as { details: { requirements: Array<{ targetName: string }> } };
		assert.deepEqual(managedRequirements.details.requirements.map((item) => item.targetName), [
			"database", "database_type", "password", "port", "server", "username",
		]);
		assert.equal(requests.length, 0, "managed requirements must stay offline");
		const command = commands[0]!;
		await command.definition.handler("discover-local", {
			hasUI: true,
			waitForIdle: async () => {},
			ui: {
				confirm: async () => true,
				notify: (message: string) => { notifications.push(message); },
				setStatus() {},
			},
		});
		assert.ok(requests.length >= 3);
		assert.ok(requests.every((request) => request.url.startsWith("http://127.0.0.1:5000/mcp/")));
		assert.ok(requests.every((request) => request.proxy === false), "ambient proxy routing must be disabled");
		assert.match(notifications.join("\n"), /local\/search/u);
		assert.equal(notifications.join("\n").includes("authenticated-local-tool"), false);
		assert.match(notifications.join("\n"), /1 remote tool\(s\) omitted/u);
		assert.equal(notifications.join("\n").includes("UNTRUSTED_DESCRIPTION_CANARY"), false);
		const requestsBeforeStatus = requests.length;
		const status = await tools[0]!.execute() as { content: Array<{ text: string }> };
		assert.equal(requests.length, requestsBeforeStatus);
		assert.match(status.content[0]!.text, /session-only loopback bootstrap/u);
		assert.equal(status.content[0]!.text.includes("127.0.0.1"), false);

		await assert.rejects(() => tools[1]!.execute(
			"denied-list",
			{},
			new AbortController().signal,
			undefined,
			{ hasUI: true, ui: { confirm: async () => false } },
		), /did not approve/u);
		assert.equal(requests.length, requestsBeforeStatus, "discovery denial must make zero requests");
		const refreshed = await tools[1]!.execute(
			"approved-list",
			{},
			new AbortController().signal,
			undefined,
			{ hasUI: true, ui: { confirm: async () => true } },
		) as { content: Array<{ text: string }> };
		assert.match(refreshed.content[0]!.text, /local\/search/u);
		assert.equal(refreshed.content[0]!.text.includes("authenticated-local-tool"), false);
		const requestsBeforeCall = requests.length;

		let callConfirmation = "";
		await assert.rejects(() => tools[3]!.execute(
			"denied-call",
			{ server: "local", tool: "search", arguments: { query: "PRIVATE_ARGUMENT_VALUE_CANARY" } },
			new AbortController().signal,
			undefined,
			{
				hasUI: true,
				ui: {
					confirm: async (_title: string, message: string) => {
						callConfirmation = message;
						return false;
					},
					setStatus() {},
				},
			},
		), /did not approve/u);
		assert.match(callConfirmation, /local\/search/u);
		assert.match(callConfirmation, /"query"/u);
		assert.equal(callConfirmation.includes("PRIVATE_ARGUMENT_VALUE_CANARY"), false);
		assert.equal(requests.length, requestsBeforeCall, "discovered-call denial must precede resolver and network work");

		axios.defaults.adapter = async () => {
			throw new Error("RAW_LOOPBACK_TRANSPORT_CANARY");
		};
		await assert.rejects(() => tools[1]!.execute(
			"failed-local-list",
			{},
			new AbortController().signal,
			undefined,
			{ hasUI: true, ui: { confirm: async () => true } },
		), (error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /No-config local MCP Toolbox discovery failed/u);
			assert.match(error.message, /does not install or start the Google Toolbox server/u);
			assert.match(error.message, /No Pi MCP configuration file is required/u);
			assert.match(error.message, /running Toolbox server with database tools is required/u);
			assert.match(error.message, /127\.0\.0\.1:5000/u);
			assert.doesNotMatch(error.message, /RAW_LOOPBACK_TRANSPORT_CANARY/u);
			return true;
		});
		assert.ok(emissions.length >= 1, "adoption invalidates stale requirement/grant metadata");
	} finally {
		await handlers[0]?.handler({ reason: "quit" }, { hasUI: false });
		axios.defaults.adapter = previousAdapter;
	}
});

test("extension registers the exact four fixed tools including sequential offline requirements discovery", async () => {
	const tools: RegisteredTool[] = [];
	const commands: Array<{ name: string; definition: { handler(args: string, ctx: unknown): Promise<void> } }> = [];
	const handlers: Array<{ name: string; handler(event: unknown, ctx: unknown): Promise<void> }> = [];
	const eventEmissions: Array<{ channel: string; data: unknown }> = [];
	const pi = {
		events: {
			emit(channel: string, data: unknown) { eventEmissions.push({ channel, data }); },
		},
		registerTool(tool: RegisteredTool) { tools.push(tool); },
		registerCommand(name: string, definition: { handler(args: string, ctx: unknown): Promise<void> }) {
			commands.push({ name, definition });
		},
		on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
			handlers.push({ name, handler });
		},
	};
	const extension = (await import(`../src/index.ts?registration=${Date.now()}`)).default;
	extension(pi as never);
	assert.deepEqual(tools.map((tool) => tool.name), [
		"mcp_toolbox_status",
		"mcp_toolbox_list",
		"mcp_toolbox_requirements",
		"mcp_toolbox_call",
	]);
	const requirements = tools[2]!;
	assert.equal(requirements.executionMode, "sequential");
	assert.equal(requirements.parameters.kind, "object");
	assert.equal(requirements.parameters.additionalProperties, false);
	assert.deepEqual(Object.keys(requirements.parameters.value), ["server", "tool"]);
	assert.doesNotMatch(requirements.description, /argument value|URL|environment name|static slot/u);
	assert.ok(requirements.promptGuidelines?.some((line) => line.includes("Wait for mcp_toolbox_requirements")));
	const list = tools[1]!;
	assert.equal(list.executionMode, "sequential");
	assert.ok(list.promptGuidelines?.some((line) => line.includes("explicit user request to use MCP Toolbox")));
	assert.ok(list.promptGuidelines?.some((line) => line.includes("do not ask the user to create Pi or Toolbox configuration")));
	assert.ok(list.promptGuidelines?.some((line) => line.includes("database_type, server, port, database, username, and password")));
	assert.deepEqual(commands.map((command) => command.name), ["mcp-toolbox"]);
	assert.deepEqual(handlers.map((handler) => handler.name), ["session_shutdown"]);
	assert.deepEqual(eventEmissions, [], "registration must not emit, resolve, construct a client, or access network state");

	const directory = await mkdtemp(join(tmpdir(), "mcp-toolbox-registration-"));
	const configPath = join(directory, "config.json");
	await writeFile(configPath, JSON.stringify({
		version: 1,
		servers: [{
			id: "production",
			url: "https://registration-endpoint-canary.example.test",
			tools: [{ name: "search", confirmation: "required", boundParams: ["database_password"] }],
			boundParams: {
				database_password: {
					resolver: { provider: "onepassword-secrets-manager", dynamic: true },
				},
			},
		}],
	}));
	await chmod(configPath, 0o600);
	process.env.PI_MCP_TOOLBOX_CONFIG = configPath;
	try {
		const result = await requirements.execute("registration-call", {
			server: "production",
			tool: "search",
		}) as {
			content: Array<{ text: string }>;
			details: { requirements: unknown[] };
		};
		assert.equal(result.details.requirements.length, 1);
		assert.equal(eventEmissions.length, 1);
		assert.equal(eventEmissions[0]!.channel, "pi:mcp-toolbox:requirements:v1");
		assert.equal(JSON.stringify(result).includes("registration-endpoint-canary"), false);
		assert.equal(JSON.stringify(eventEmissions).includes("registration-endpoint-canary"), false);
		assert.equal(Object.isFrozen(result), true);
		assert.equal(Object.isFrozen(eventEmissions[0]!.data), true);
		const listed = await tools[1]!.execute() as { content: Array<{ text: string }> };
		assert.match(listed.content[0]!.text, /credentials=dynamic-1password/u);
		assert.equal(listed.content[0]!.text.includes("project-fallback"), false);
		const status = await tools[0]!.execute() as {
			details: { initializedServers: number; loadedTools: number; activeOperations: number };
		};
		assert.deepEqual({
			initializedServers: status.details.initializedServers,
			loadedTools: status.details.loadedTools,
			activeOperations: status.details.activeOperations,
		}, { initializedServers: 0, loadedTools: 0, activeOperations: 0 });

		await writeFile(configPath, "{ invalid replacement config");
		await commands[0]!.definition.handler("reload", {
			hasUI: false,
			waitForIdle: async () => {},
		});
		assert.equal((eventEmissions[1]!.data as { action: string }).action, "invalidate");
		assert.equal(Object.isFrozen(eventEmissions[1]!.data), true);
		await handlers[0]!.handler({ reason: "quit" }, { hasUI: false });
		assert.equal((eventEmissions[2]!.data as { action: string }).action, "invalidate");
	} finally {
		delete process.env.PI_MCP_TOOLBOX_CONFIG;
	}
});

test("failed grant invalidation disables every endpoint until a later successful reload", async () => {
	const directory = await mkdtemp(join(tmpdir(), "mcp-toolbox-invalidation-failure-"));
	const configPath = join(directory, "config.json");
	await writeFile(configPath, JSON.stringify({
		version: 1,
		servers: [{
			id: "local",
			url: "http://127.0.0.1:5000",
			tools: [{ name: "search", confirmation: "required" }],
		}],
	}));
	await chmod(configPath, 0o600);
	const tools: RegisteredTool[] = [];
	const commands: Array<{ name: string; definition: { handler(args: string, ctx: any): Promise<void> } }> = [];
	const handlers: Array<{ name: string; handler(event: unknown, ctx: unknown): Promise<void> }> = [];
	const notifications: string[] = [];
	const pi = {
		events: { emit() { throw new Error("synthetic cooperative bus failure"); } },
		registerTool(tool: RegisteredTool) { tools.push(tool); },
		registerCommand(name: string, definition: { handler(args: string, ctx: any): Promise<void> }) {
			commands.push({ name, definition });
		},
		on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
			handlers.push({ name, handler });
		},
	};
	const previousConfig = process.env.PI_MCP_TOOLBOX_CONFIG;
	process.env.PI_MCP_TOOLBOX_CONFIG = configPath;
	const extension = (await import(`../src/index.ts?invalidation-failure=${Date.now()}`)).default;
	try {
		extension(pi as never);
		const before = await tools[0]!.execute() as { content: Array<{ text: string }> };
		assert.match(before.content[0]!.text, /configured/u);
		await commands[0]!.definition.handler("reload", {
			hasUI: true,
			waitForIdle: async () => {},
			ui: {
				setStatus() {},
				notify(message: string) { notifications.push(message); },
			},
		});
		assert.match(notifications.join("\n"), /configuration was disabled/u);
		const after = await tools[0]!.execute() as { content: Array<{ text: string }> };
		assert.match(after.content[0]!.text, /extension: disabled/u);
		await assert.rejects(
			() => tools[1]!.execute(
				"blocked-list",
				{},
				new AbortController().signal,
				undefined,
				{ hasUI: true, ui: { confirm: async () => true } },
			),
			/disabled after failed grant invalidation/u,
		);
		await assert.rejects(
			() => tools[2]!.execute("blocked-requirements", { server: "local", tool: "search" }),
			/disabled after failed grant invalidation/u,
		);
	} finally {
		await handlers[0]?.handler({ reason: "quit" }, { hasUI: false });
		if (previousConfig === undefined) delete process.env.PI_MCP_TOOLBOX_CONFIG;
		else process.env.PI_MCP_TOOLBOX_CONFIG = previousConfig;
	}
});
