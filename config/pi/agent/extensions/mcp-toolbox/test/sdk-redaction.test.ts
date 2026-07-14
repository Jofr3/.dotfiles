import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import { createInvocationSnapshot, parseConfig } from "../src/config.ts";
import { clearCredentialMaterial, type CredentialMaterial } from "../src/credentials.ts";
import { createToolboxSdkClient } from "../src/sdk.ts";

const CANARIES = [
	"SDK_RPC_MESSAGE_EXACT_CANARY",
	"SDK_RPC_DATA_EXACT_CANARY",
	"SDK_RPC_SIBLING_EXACT_CANARY",
	"SDK_RPC_ARRAY_EXACT_CANARY",
	"SDK_RPC_CAUSE_EXACT_CANARY",
	"https://user:pass@example.test/path?token=SDK_RPC_URL_EXACT_CANARY",
];

function invocationServer(url = "http://127.0.0.1:9") {
	const config = parseConfig({
		version: 1,
		requestTimeoutMs: 1_000,
		servers: [{
			id: "local",
			url,
			tools: [{ name: "search", confirmation: "not-required" }],
		}],
	});
	return createInvocationSnapshot(config, "local", "search").server;
}

function credentials(): CredentialMaterial {
	return {
		headers: Object.create(null) as Record<string, string>,
		authTokens: Object.create(null) as Record<string, string>,
		boundParams: Object.create(null) as Record<string, string>,
		redactionValues: [CANARIES[1]!],
		resolverValuesUsed: true,
	};
}

function publicConsoleText(calls: unknown[][]): string {
	return calls.map((call) => call.map((value) => {
		try {
			return typeof value === "string" ? value : JSON.stringify(value);
		} catch {
			return "[unserializable]";
		}
	}).join(" ")).join("\n");
}

test("locked SDK console.error observes only a fixed replacement for cyclic JSON-RPC errors", async () => {
	const previousAdapter = axios.defaults.adapter;
	const previousConsoleError = console.error;
	const calls: unknown[][] = [];
	const payload: Record<string, unknown> = {
		jsonrpc: "2.0",
		id: "request",
		error: {
			code: -32_000,
			message: CANARIES[0],
			data: { nested: CANARIES[1], array: [CANARIES[3]] },
			cause: { message: CANARIES[4] },
		},
		sibling: CANARIES[2],
		url: CANARIES[5],
	};
	(payload.error as Record<string, unknown>).cycle = payload;
	axios.defaults.adapter = async (config) => ({
		data: payload,
		status: 200,
		statusText: "OK",
		headers: {},
		config,
		request: {},
	});
	console.error = (...args: unknown[]) => { calls.push(args); };

	let client: Awaited<ReturnType<typeof createToolboxSdkClient>> | undefined;
	try {
		client = await createToolboxSdkClient(invocationServer(), 1_000, credentials());
		await assert.rejects(
			() => client!.loadTool("search", new AbortController().signal),
			/code.*-32000/u,
		);
	} finally {
		await client?.dispose?.();
		console.error = previousConsoleError;
		axios.defaults.adapter = previousAdapter;
	}

	assert.ok(calls.length >= 1, "the locked SDK console.error branch was not exercised");
	const consoleText = publicConsoleText(calls);
	for (const canary of CANARIES) {
		assert.equal(consoleText.includes(canary), false, `console.error retained ${canary}`);
	}
	assert.match(consoleText, /code.*-32000/u);
});

test("terminal normalization cannot reconstruct a credential before locked SDK validation logging", async () => {
	const previousAdapter = axios.defaults.adapter;
	const previousConsoleError = console.error;
	const secret = "SDK_NORMALIZATION�COLLISION_CANARY";
	const hostileNearMatch = "SDK_NORMALIZATION\u001bCOLLISION_CANARY";
	const calls: unknown[][] = [];
	axios.defaults.adapter = async (config) => ({
		data: {
			jsonrpc: "2.0",
			id: "collision",
			result: { malformed: { note: hostileNearMatch } },
		},
		status: 200,
		statusText: "OK",
		headers: {},
		config,
		request: {},
	});
	console.error = (...args: unknown[]) => { calls.push(args); };
	const material = credentials();
	material.headers.Authorization = secret;
	material.redactionValues = [secret];
	let client: Awaited<ReturnType<typeof createToolboxSdkClient>> | undefined;
	try {
		client = await createToolboxSdkClient(invocationServer("https://toolbox.example.test"), 1_000, material);
		await assert.rejects(() => client!.loadTool("search", new AbortController().signal));
	} finally {
		await client?.dispose?.();
		console.error = previousConsoleError;
		axios.defaults.adapter = previousAdapter;
	}
	assert.ok(calls.length >= 1, "the locked SDK validation logger was not exercised");
	assert.equal(publicConsoleText(calls).includes(secret), false);
});

test("mismatched server protocol cannot combine with an SDK prefix into a credential", async () => {
	const previousAdapter = axios.defaults.adapter;
	const previousConsoleError = console.error;
	const attackerVersion = "ATTACKER_VERSION";
	const prefixedSecret = `MCP version mismatch: client does not support server version ${attackerVersion}`;
	const formerFixedMessageSecret = "Remote error details were removed";
	const calls: unknown[][] = [];
	axios.defaults.adapter = async (config) => ({
		data: {
			jsonrpc: "2.0",
			id: "protocol-collision",
			result: {
				protocolVersion: attackerVersion,
				capabilities: { tools: {} },
				serverInfo: { name: "offline", version: "1" },
			},
		},
		status: 200,
		statusText: "OK",
		headers: {},
		config,
		request: {},
	});
	console.error = (...args: unknown[]) => { calls.push(args); };
	const material = credentials();
	material.headers.Authorization = prefixedSecret;
	material.redactionValues = [prefixedSecret, formerFixedMessageSecret];
	let client: Awaited<ReturnType<typeof createToolboxSdkClient>> | undefined;
	try {
		client = await createToolboxSdkClient(invocationServer("https://toolbox.example.test"), 1_000, material);
		await assert.rejects(() => client!.loadTool("search", new AbortController().signal));
	} finally {
		await client?.dispose?.();
		console.error = previousConsoleError;
		axios.defaults.adapter = previousAdapter;
	}
	const consoleText = publicConsoleText(calls);
	assert.equal(consoleText.includes(prefixedSecret), false);
	assert.equal(consoleText.includes(formerFixedMessageSecret), false);
});

test("method-aware validation blocks Zod formatting from prefixing a malformed value into a credential", async () => {
	const previousAdapter = axios.defaults.adapter;
	const previousConsoleError = console.error;
	const suffix = "ATTACKER_SUFFIX";
	const secret = `"received": "${suffix}"`;
	const calls: unknown[][] = [];
	axios.defaults.adapter = async (config) => {
		const request = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
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
		} else if (request.method === "tools/list") {
			data = {
				jsonrpc: "2.0",
				id: request.id,
				result: {
					tools: [{ name: "search", inputSchema: { type: "object", properties: {} } }],
				},
			};
		} else {
			data = {
				jsonrpc: "2.0",
				id: request.id,
				result: { content: [{ type: suffix, text: "not accepted" }] },
			};
		}
		return { data, status, statusText: "OK", headers: {}, config, request: {} };
	};
	console.error = (...args: unknown[]) => { calls.push(args); };
	const material = credentials();
	material.headers.Authorization = secret;
	material.redactionValues = [secret];
	let client: Awaited<ReturnType<typeof createToolboxSdkClient>> | undefined;
	try {
		client = await createToolboxSdkClient(invocationServer("https://toolbox.example.test"), 1_000, material);
		const tool = await client.loadTool("search", new AbortController().signal);
		await assert.rejects(() => client!.invoke(tool, {}, new AbortController().signal));
	} finally {
		await client?.dispose?.();
		console.error = previousConsoleError;
		axios.defaults.adapter = previousAdapter;
	}
	assert.equal(publicConsoleText(calls).includes(secret), false);
});

test("successful locked SDK initialize/list/invoke accepts frozen cloned payloads and redacts exact echoes", async () => {
	const previousAdapter = axios.defaults.adapter;
	const secret = "SDK_SUCCESS_SECRET_EXACT_CANARY";
	const seenUrls: string[] = [];
	axios.defaults.adapter = async (config) => {
		seenUrls.push(config.url ?? "");
		const request = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
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
		} else if (request.method === "tools/list") {
			data = {
				jsonrpc: "2.0",
				id: request.id,
				result: {
					tools: [{
						name: "search",
						description: "offline",
						inputSchema: {
							type: "object",
							properties: { query: { type: "string" } },
							required: ["query"],
						},
					}],
				},
			};
		} else {
			data = {
				jsonrpc: "2.0",
				id: request.id,
				result: { content: [{ type: "text", text: `echo ${secret}` }] },
			};
		}
		return { data, status, statusText: "OK", headers: {}, config, request: {} };
	};
	const material = credentials();
	material.headers.Authorization = secret;
	material.redactionValues = [secret];
	let client: Awaited<ReturnType<typeof createToolboxSdkClient>> | undefined;
	try {
		client = await createToolboxSdkClient(invocationServer("https://toolbox.example.test"), 1_000, material);
		const tool = await client.loadTool("search", new AbortController().signal);
		const output = await client.invoke(tool, { query: "hotels" }, new AbortController().signal);
		assert.equal(output.includes(secret), false);
		assert.match(output, /^echo ./u);
	} finally {
		await client?.dispose?.();
		axios.defaults.adapter = previousAdapter;
	}
	assert.ok(seenUrls.every((url) => url.startsWith("https://toolbox.example.test/mcp/")));
});

test("cancel/reset clearing redactions cannot let a late successful payload reach SDK logging", async () => {
	const previousAdapter = axios.defaults.adapter;
	const previousConsoleError = console.error;
	const secret = "SDK_LATE_RESET_SECRET_EXACT_CANARY";
	const calls: unknown[][] = [];
	let release: ((response: unknown) => void) | undefined;
	axios.defaults.adapter = async (config) => await new Promise((resolve) => {
		release = () => resolve({
			data: {
				jsonrpc: "2.0",
				id: "late",
				result: { malformed: { note: secret } },
			},
			status: 200,
			statusText: "OK",
			headers: {},
			config,
			request: {},
		});
	});
	console.error = (...args: unknown[]) => { calls.push(args); };
	const material = credentials();
	material.headers.Authorization = secret;
	material.redactionValues = [secret];
	const controller = new AbortController();
	let client: Awaited<ReturnType<typeof createToolboxSdkClient>> | undefined;
	try {
		client = await createToolboxSdkClient(invocationServer("https://toolbox.example.test"), 1_000, material);
		const load = client.loadTool("search", controller.signal);
		void load.catch(() => undefined);
		while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
		clearCredentialMaterial(material);
		controller.abort("offline-reset");
		release({});
		await assert.rejects(load);
	} finally {
		await client?.dispose?.();
		console.error = previousConsoleError;
		axios.defaults.adapter = previousAdapter;
	}
	assert.equal(publicConsoleText(calls).includes(secret), false);
});

test("non-2xx payload details are replaced even with a synthetic fulfilled adapter", async () => {
	const previousAdapter = axios.defaults.adapter;
	const previousConsoleError = console.error;
	const calls: unknown[][] = [];
	axios.defaults.adapter = async (config) => ({
		data: { sibling: CANARIES[2], nested: [CANARIES[3]], cause: CANARIES[4] },
		status: 500,
		statusText: CANARIES[0],
		headers: {},
		config,
		request: {},
	});
	console.error = (...args: unknown[]) => { calls.push(args); };
	let client: Awaited<ReturnType<typeof createToolboxSdkClient>> | undefined;
	try {
		client = await createToolboxSdkClient(invocationServer(), 1_000, credentials());
		await assert.rejects(() => client!.loadTool("search", new AbortController().signal));
	} finally {
		await client?.dispose?.();
		console.error = previousConsoleError;
		axios.defaults.adapter = previousAdapter;
	}
	const consoleText = publicConsoleText(calls);
	for (const canary of CANARIES) assert.equal(consoleText.includes(canary), false);
});
