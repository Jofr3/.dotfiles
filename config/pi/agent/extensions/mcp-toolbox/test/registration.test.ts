import assert from "node:assert/strict";
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
