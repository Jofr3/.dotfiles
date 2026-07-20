import { createHash } from "node:crypto";

export const MAX_CATALOG_TOOLS_PER_TOOLSET = 128;
export const MAX_DISCOVERED_TOOLS_TOTAL = 256;
export const MAX_DISCOVERY_TOOLSETS = 8;
export const MAX_CATALOG_PARAMETERS_PER_TOOL = 100;
export const MAX_CATALOG_METADATA_BYTES = 256 * 1024;
export const MAX_CATALOG_NODES = 20_000;
export const MAX_CATALOG_SCHEMA_DEPTH = 8;
export const MAX_CATALOG_AUTH_ALTERNATIVES = 8;
export const MAX_CATALOG_AUTH_TARGETS = 20;

const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const PROTOTYPE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SCALAR_TYPES = new Set(["string", "integer", "float", "number", "boolean"]);
const FIXED_DESCRIPTION = "Remote MCP Toolbox tool (description withheld by Pi)";

export interface CatalogParameterSummary {
	readonly name: string;
	readonly type: string;
	readonly required: boolean;
}

export interface CatalogToolMetadata {
	readonly name: string;
	readonly toolset?: string;
	readonly parameters: readonly CatalogParameterSummary[];
	readonly authTokens: readonly string[];
	readonly usable: boolean;
	readonly fingerprint: string;
}

interface NormalizedType {
	readonly schema: Readonly<Record<string, unknown>>;
	readonly summary: string;
}

interface NormalizedTool {
	readonly rpc: Readonly<Record<string, unknown>>;
	readonly name: string;
	readonly parameters: readonly CatalogParameterSummary[];
	readonly authTokens: readonly string[];
	readonly usable: boolean;
	readonly fingerprintInput: Readonly<Record<string, unknown>>;
}

interface CatalogState {
	nodes: number;
}

export class CatalogValidationError extends Error {
	constructor() {
		super("MCP Toolbox catalog metadata was malformed or exceeded a safety bound");
		this.name = "McpToolboxCatalogValidationError";
	}
}

function fail(): never {
	throw new CatalogValidationError();
}

function count(state: CatalogState, amount = 1): void {
	state.nodes += amount;
	if (state.nodes > MAX_CATALOG_NODES) fail();
}

function dataRecord(value: unknown, state: CatalogState): Record<string, unknown> {
	count(state);
	if (!value || typeof value !== "object" || Array.isArray(value)) fail();
	let prototype: object | null;
	let descriptors: Record<PropertyKey, PropertyDescriptor>;
	try {
		prototype = Object.getPrototypeOf(value);
		descriptors = Object.getOwnPropertyDescriptors(value);
	} catch {
		fail();
	}
	if (prototype !== Object.prototype && prototype !== null) fail();
	const output: Record<string, unknown> = Object.create(null);
	for (const key of Reflect.ownKeys(descriptors!)) {
		if (typeof key !== "string") fail();
		const descriptor = descriptors![key];
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail();
		output[key] = descriptor.value;
	}
	return output;
}

function safeName(value: unknown): string {
	if (typeof value !== "string" || !REMOTE_NAME.test(value) || PROTOTYPE_KEYS.has(value.toLowerCase())) fail();
	return value;
}

function boundedDescription(value: unknown): void {
	if (value === undefined || value === null) return;
	if (typeof value !== "string" || value.length > 4_096) fail();
}

function normalizeType(value: unknown, state: CatalogState, depth: number): NormalizedType {
	if (depth > MAX_CATALOG_SCHEMA_DEPTH) fail();
	const schema = dataRecord(value, state);
	const type = schema.type === undefined ? "string" : schema.type;
	if (typeof type !== "string") fail();
	if (SCALAR_TYPES.has(type)) {
		return Object.freeze({
			schema: Object.freeze({ type }),
			summary: type,
		});
	}
	if (type === "array") {
		if (schema.items === undefined || schema.items === null) {
			return Object.freeze({ schema: Object.freeze({ type: "array" }), summary: "array<any>" });
		}
		if (Array.isArray(schema.items)) {
			return Object.freeze({ schema: Object.freeze({ type: "array" }), summary: "array<any>" });
		}
		const items = normalizeType(schema.items, state, depth + 1);
		return Object.freeze({
			schema: Object.freeze({ type: "array", items: items.schema }),
			summary: `array<${items.summary}>`,
		});
	}
	if (type === "object") {
		const additional = schema.additionalProperties;
		if (additional === false) {
			return Object.freeze({
				schema: Object.freeze({ type: "object", additionalProperties: false }),
				summary: "object<closed>",
			});
		}
		if (additional && typeof additional === "object" && !Array.isArray(additional)) {
			const normalized = normalizeType(additional, state, depth + 1);
			const nestedType = normalized.schema.type;
			if (typeof nestedType !== "string" || !SCALAR_TYPES.has(nestedType)) fail();
			const valueSchema = Object.freeze({ type: nestedType });
			return Object.freeze({
				schema: Object.freeze({ type: "object", additionalProperties: valueSchema }),
				summary: `object<string,${nestedType}>`,
			});
		}
		if (additional !== undefined && additional !== null && additional !== true) fail();
		return Object.freeze({
			schema: Object.freeze({ type: "object", additionalProperties: true }),
			summary: "object<string,any>",
		});
	}
	fail();
}

function uniqueNames(
	value: unknown,
	state: CatalogState,
	maximum: number,
	caseInsensitive = false,
): string[] {
	if (!Array.isArray(value) || value.length > maximum) fail();
	count(state, value.length);
	const output: string[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		const name = safeName(item);
		const identity = caseInsensitive ? name.toLowerCase() : name;
		if (seen.has(identity)) fail();
		seen.add(identity);
		output.push(name);
	}
	return output;
}

function normalizeTool(value: unknown, state: CatalogState): NormalizedTool {
	const tool = dataRecord(value, state);
	const name = safeName(tool.name);
	boundedDescription(tool.description);
	const inputSchema = dataRecord(tool.inputSchema, state);
	if (inputSchema.type !== undefined && inputSchema.type !== "object") fail();
	const propertiesRecord = inputSchema.properties === undefined
		? Object.create(null) as Record<string, unknown>
		: dataRecord(inputSchema.properties, state);
	const propertyEntries = Object.entries(propertiesRecord);
	if (propertyEntries.length > MAX_CATALOG_PARAMETERS_PER_TOOL) fail();
	const propertyNames = new Set<string>();
	const propertyNamesFolded = new Set<string>();
	const normalizedProperties: Record<string, unknown> = Object.create(null);
	const types = new Map<string, string>();
	for (const [rawName, rawSchema] of propertyEntries) {
		const parameterName = safeName(rawName);
		const folded = parameterName.toLowerCase();
		if (propertyNames.has(parameterName) || propertyNamesFolded.has(folded)) fail();
		propertyNames.add(parameterName);
		propertyNamesFolded.add(folded);
		const parameter = dataRecord(rawSchema, state);
		boundedDescription(parameter.description);
		const normalized = normalizeType(parameter, state, 1);
		normalizedProperties[parameterName] = Object.freeze({
			...normalized.schema,
			description: "",
		});
		types.set(parameterName, normalized.summary);
	}
	const required = inputSchema.required === undefined
		? []
		: uniqueNames(inputSchema.required, state, MAX_CATALOG_PARAMETERS_PER_TOOL);
	const requiredSet = new Set<string>();
	for (const parameterName of required) {
		if (!propertyNames.has(parameterName) || requiredSet.has(parameterName)) fail();
		requiredSet.add(parameterName);
	}

	let authParam: Record<string, readonly string[]> = Object.create(null);
	let authInvoke: string[] = [];
	let usable = true;
	if (tool._meta !== undefined && tool._meta !== null) {
		const meta = dataRecord(tool._meta, state);
		if (meta["toolbox/authParam"] !== undefined) {
			const rawAuthParam = dataRecord(meta["toolbox/authParam"], state);
			if (Object.keys(rawAuthParam).length > MAX_CATALOG_AUTH_TARGETS) fail();
			authParam = Object.create(null) as Record<string, readonly string[]>;
			for (const [rawParameter, rawAlternatives] of Object.entries(rawAuthParam)) {
				const parameterName = safeName(rawParameter);
				if (!propertyNames.has(parameterName)) fail();
				const alternatives = uniqueNames(
					rawAlternatives,
					state,
					MAX_CATALOG_AUTH_ALTERNATIVES,
					true,
				);
				if (alternatives.length === 0) fail();
				if (alternatives.length !== 1) usable = false;
				authParam[parameterName] = Object.freeze(alternatives);
			}
		}
		if (meta["toolbox/authInvoke"] !== undefined) {
			authInvoke = uniqueNames(meta["toolbox/authInvoke"], state, MAX_CATALOG_AUTH_TARGETS, true);
		}
	}
	const authTokens = new Map<string, string>();
	const addAuthToken = (name: string): void => {
		const folded = name.toLowerCase();
		const existing = authTokens.get(folded);
		if (existing !== undefined && existing !== name) fail();
		authTokens.set(folded, name);
	};
	for (const name of authInvoke) addAuthToken(name);
	for (const alternatives of Object.values(authParam)) {
		if (alternatives.length === 1) addAuthToken(alternatives[0]!);
	}
	if (authTokens.size > MAX_CATALOG_AUTH_TARGETS) fail();
	const orderedAuthTokens = [...authTokens.values()].sort();
	const parameters = [...propertyNames]
		.filter((parameterName) => !Object.hasOwn(authParam, parameterName))
		.sort()
		.map((parameterName) => Object.freeze({
			name: parameterName,
			type: types.get(parameterName)!,
			required: requiredSet.has(parameterName),
		}));
	const normalizedMeta: Record<string, unknown> = Object.create(null);
	if (Object.keys(authParam).length > 0) normalizedMeta["toolbox/authParam"] = Object.freeze(authParam);
	if (authInvoke.length > 0) normalizedMeta["toolbox/authInvoke"] = Object.freeze(authInvoke);
	const normalizedInputSchema = Object.freeze({
		type: "object",
		properties: Object.freeze(normalizedProperties),
		required: Object.freeze([...requiredSet]),
	});
	const rpc = Object.freeze({
		name,
		description: FIXED_DESCRIPTION,
		inputSchema: normalizedInputSchema,
		...(Object.keys(normalizedMeta).length === 0 ? {} : { _meta: Object.freeze(normalizedMeta) }),
	});
	return Object.freeze({
		rpc,
		name,
		parameters: Object.freeze(parameters),
		authTokens: Object.freeze(orderedAuthTokens),
		usable,
		fingerprintInput: Object.freeze({
			name,
			inputSchema: normalizedInputSchema,
			meta: Object.freeze(normalizedMeta),
		}),
	});
}

function normalizePayload(data: unknown): Readonly<{
	payload: Readonly<Record<string, unknown>>;
	tools: readonly NormalizedTool[];
}> {
	const state: CatalogState = { nodes: 0 };
	const rpc = dataRecord(data, state);
	if (rpc.jsonrpc !== "2.0" || (typeof rpc.id !== "string" && typeof rpc.id !== "number")) fail();
	if (Object.hasOwn(rpc, "error")) fail();
	const result = dataRecord(rpc.result, state);
	if (!Array.isArray(result.tools) || result.tools.length > MAX_CATALOG_TOOLS_PER_TOOLSET) fail();
	count(state, result.tools.length);
	const tools = result.tools.map((tool) => normalizeTool(tool, state));
	const exact = new Set<string>();
	const folded = new Set<string>();
	for (const tool of tools) {
		const lower = tool.name.toLowerCase();
		if (exact.has(tool.name) || folded.has(lower)) fail();
		exact.add(tool.name);
		folded.add(lower);
	}
	const payload = Object.freeze({
		jsonrpc: "2.0",
		id: rpc.id,
		result: Object.freeze({ tools: Object.freeze(tools.map((tool) => tool.rpc)) }),
	});
	let serialized: string;
	try {
		serialized = JSON.stringify(payload);
	} catch {
		fail();
	}
	if (Buffer.byteLength(serialized, "utf8") > MAX_CATALOG_METADATA_BYTES) fail();
	return Object.freeze({ payload, tools: Object.freeze(tools) });
}

export function normalizeToolCatalogRpcPayload(data: unknown): Readonly<Record<string, unknown>> {
	return normalizePayload(data).payload;
}

export function catalogMetadataFromSanitizedRpcPayload(
	data: unknown,
	toolset: string | undefined,
): readonly CatalogToolMetadata[] {
	if (toolset !== undefined) safeName(toolset);
	const normalized = normalizePayload(data);
	return Object.freeze(normalized.tools.map((tool) => {
		const fingerprint = createHash("sha256")
			.update("pi.mcp-toolbox.catalog/v1\0", "utf8")
			.update(JSON.stringify({ toolset: toolset ?? null, ...tool.fingerprintInput }), "utf8")
			.digest("base64url");
		return Object.freeze({
			name: tool.name,
			...(toolset === undefined ? {} : { toolset }),
			parameters: Object.freeze(tool.parameters.map((parameter) => Object.freeze({ ...parameter }))),
			authTokens: Object.freeze([...tool.authTokens]),
			usable: tool.usable,
			fingerprint,
		});
	}));
}
