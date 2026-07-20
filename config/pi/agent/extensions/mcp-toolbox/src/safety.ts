export const MAX_ARGUMENT_BYTES = 64 * 1024;
const MAX_DEPTH = 8;
const MAX_NODES = 1_000;
const MAX_OBJECT_PROPERTIES = 100;
const MAX_ARRAY_ITEMS = 200;
const MAX_STRING_LENGTH = 20_000;
const PROTOTYPE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SENSITIVE_ARGUMENT_KEY = /(?:api[-_ ]?key|authorization|cookie|credential|headers?|password|secret|token)/i;
const CREDENTIAL_ROUTING_ARGUMENT_KEYS = new Set([
	"env",
	"resolver",
	"provider",
	"slot",
	"purpose",
	"dynamic",
	"requirementid",
]);
const CREDENTIAL_ROUTING_VALUES = new Set([
	"bitwarden-secrets-manager",
	"onepassword-secrets-manager",
	"mcp-toolbox.header",
	"mcp-toolbox.auth-token",
	"mcp-toolbox.bound-param",
]);
const DYNAMIC_REQUIREMENT_VALUE = /^mcp1-(?:H|A|B)-[A-Za-z0-9_-]{43}$/u;

function normalizedRoutingKey(key: string): string {
	return key.toLowerCase().replace(/[-_ ]/gu, "");
}

interface CloneState {
	nodes: number;
	seen: WeakSet<object>;
	knownSecrets: readonly string[];
}

function pathKey(path: string, key: string): string {
	return `${path}.${key}`;
}

function containsKnownSecret(value: string, secrets: readonly string[]): boolean {
	return secrets.some((secret) => secret.length > 0 && value.includes(secret));
}

function inspectString(value: string, state: CloneState, path: string): string {
	if (value.length > MAX_STRING_LENGTH) {
		throw new Error(`${path} contains a string longer than ${MAX_STRING_LENGTH} characters`);
	}
	if (/\bBearer\s+[A-Za-z0-9._~+/=-]+/i.test(value)) {
		throw new Error(`${path} must not contain bearer credentials`);
	}
	if (containsKnownSecret(value, state.knownSecrets)) {
		throw new Error(`${path} must not contain configured credential values`);
	}
	if (
		value.startsWith("op://") || CREDENTIAL_ROUTING_VALUES.has(value) ||
		DYNAMIC_REQUIREMENT_VALUE.test(value)
	) {
		throw new Error(`${path} must not contain credential-routing data`);
	}
	try {
		const url = new URL(value);
		if (url.username || url.password) throw new Error(`${path} must not contain URL credentials`);
	} catch (error) {
		if (error instanceof Error && error.message.endsWith("must not contain URL credentials")) throw error;
	}
	return value;
}

function cloneJson(value: unknown, state: CloneState, depth: number, path: string): unknown {
	state.nodes += 1;
	if (state.nodes > MAX_NODES) throw new Error(`${path} contains too many values`);
	if (depth > MAX_DEPTH) throw new Error(`${path} exceeds the maximum nesting depth of ${MAX_DEPTH}`);

	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "string") return inspectString(value, state, path);
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
		return value;
	}
	if (!value || typeof value !== "object") throw new Error(`${path} contains a non-JSON value`);
	if (state.seen.has(value)) throw new Error(`${path} contains a cycle or repeated object reference`);
	state.seen.add(value);
	if (Object.getOwnPropertySymbols(value).length > 0) throw new Error(`${path} must not contain symbol keys`);

	if (Array.isArray(value)) {
		if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error(`${path} must be a plain array`);
		if (value.length > MAX_ARRAY_ITEMS) throw new Error(`${path} contains more than ${MAX_ARRAY_ITEMS} array items`);
		const descriptors = Object.getOwnPropertyDescriptors(value);
		const output: unknown[] = [];
		for (let index = 0; index < value.length; index += 1) {
			const descriptor = descriptors[String(index)];
			if (!descriptor || !("value" in descriptor)) throw new Error(`${path} must not contain holes or accessors`);
			output.push(cloneJson(descriptor.value, state, depth + 1, `${path}[${index}]`));
		}
		for (const key of Object.keys(descriptors)) {
			if (key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)) {
				throw new Error(`${path} arrays must not contain named properties`);
			}
		}
		return output;
	}

	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new Error(`${path} must contain only plain JSON objects`);
	}
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const keys = Object.keys(descriptors);
	if (keys.length > MAX_OBJECT_PROPERTIES) {
		throw new Error(`${path} contains more than ${MAX_OBJECT_PROPERTIES} object properties`);
	}
	const output: Record<string, unknown> = Object.create(null);
	for (const key of keys) {
		const descriptor = descriptors[key]!;
		if (!("value" in descriptor)) throw new Error(`${pathKey(path, key)} must not use accessors`);
		if (!descriptor.enumerable) throw new Error(`${pathKey(path, key)} must be enumerable JSON data`);
		if (key.length === 0 || key.length > 128) throw new Error(`${path} contains an invalid property-name length`);
		if (/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/.test(key)) {
			throw new Error(`${path} contains control characters in a property name`);
		}
		if (containsKnownSecret(key, state.knownSecrets)) {
			throw new Error(`${path} contains configured credential material in a property name`);
		}
		if (PROTOTYPE_KEYS.has(key.toLowerCase())) throw new Error(`${pathKey(path, key)} is not permitted`);
		if (CREDENTIAL_ROUTING_ARGUMENT_KEYS.has(normalizedRoutingKey(key))) {
			throw new Error(`${pathKey(path, key)} is credential-routing data and must not appear in tool arguments`);
		}
		if (SENSITIVE_ARGUMENT_KEY.test(key)) {
			throw new Error(`${pathKey(path, key)} is credential-bearing and must be configured outside tool arguments`);
		}
		output[key] = cloneJson(descriptor.value, state, depth + 1, pathKey(path, key));
	}
	return output;
}

function freezeJson(value: unknown): void {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
	for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
		if ("value" in descriptor) freezeJson(descriptor.value);
	}
	Object.freeze(value);
}

export function prepareToolArguments(
	value: Record<string, unknown>,
	knownSecrets: readonly string[] = [],
): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("mcp_toolbox_call.arguments must be a JSON object");
	}
	const cloned = cloneJson(
		value,
		{ nodes: 0, seen: new WeakSet<object>(), knownSecrets },
		0,
		"mcp_toolbox_call.arguments",
	) as Record<string, unknown>;
	let serialized: string;
	try {
		serialized = JSON.stringify(cloned);
	} catch {
		throw new Error("mcp_toolbox_call.arguments must be JSON serializable");
	}
	if (Buffer.byteLength(serialized, "utf8") > MAX_ARGUMENT_BYTES) {
		throw new Error("mcp_toolbox_call.arguments exceeds the 64KB limit");
	}
	freezeJson(cloned);
	return cloned;
}

export function confirmationArgumentKeys(args: Record<string, unknown>): string {
	const keys = Object.keys(args).sort();
	if (keys.length === 0) return "(none)";
	return keys.map((key) => JSON.stringify(key)).join(", ");
}
