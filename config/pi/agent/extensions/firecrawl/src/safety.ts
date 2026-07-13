const MAX_ADVANCED_BYTES = 64 * 1024;
const MAX_JSON_BYTES = 128 * 1024;
const MAX_DEPTH = 8;
const MAX_TOTAL_NODES = 1_000;
const MAX_OBJECT_PROPERTIES = 100;
const MAX_ARRAY_ITEMS = 200;
const MAX_STRING_LENGTH = 20_000;

const PROTOTYPE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const FORBIDDEN_ADVANCED_KEYS = new Set([
	"apikey",
	"apiurl",
	"baseurl",
	"authorization",
	"cookie",
	"cookies",
	"credential",
	"credentials",
	"password",
	"secret",
	"token",
	"accesstoken",
	"refreshtoken",
	"headers",
	"webhook",
	"actions",
	"profile",
	"usemock",
	"origin",
	"integration",
]);

const NUMERIC_LIMITS: Record<string, { minimum: number; maximum: number }> = {
	timeout: { minimum: 1_000, maximum: 295_000 },
	waitfor: { minimum: 0, maximum: 60_000 },
	maxdiscoverydepth: { minimum: 0, maximum: 100 },
	maxconcurrency: { minimum: 1, maximum: 100 },
	delay: { minimum: 0, maximum: 60_000 },
	maxage: { minimum: 0, maximum: 31_536_000_000 },
	minage: { minimum: 0, maximum: 31_536_000_000 },
	maxpages: { minimum: 1, maximum: 1_000 },
	riskscorethreshold: { minimum: 0, maximum: 100 },
};

interface CloneState {
	nodes: number;
	knownApiKey?: string;
	blockAdvancedKeys: boolean;
}

function normalizedKey(key: string): string {
	return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function serializedSize(value: unknown, label: string, maximum: number): void {
	let serialized: string;
	try {
		serialized = JSON.stringify(value);
	} catch {
		throw new Error(`${label} must be JSON serializable`);
	}
	if (Buffer.byteLength(serialized ?? "", "utf8") > maximum) {
		throw new Error(`${label} exceeds the ${Math.floor(maximum / 1024)}KB limit`);
	}
}

function cloneJson(value: unknown, state: CloneState, depth: number, path: string): unknown {
	state.nodes += 1;
	if (state.nodes > MAX_TOTAL_NODES) throw new Error(`${path} contains too many values`);
	if (depth > MAX_DEPTH) throw new Error(`${path} exceeds the maximum nesting depth of ${MAX_DEPTH}`);

	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "string") {
		if (value.length > MAX_STRING_LENGTH) {
			throw new Error(`${path} contains a string longer than ${MAX_STRING_LENGTH} characters`);
		}
		if (state.knownApiKey && value.includes(state.knownApiKey)) {
			throw new Error(`${path} must not contain FIRECRAWL_API_KEY`);
		}
		if (/\bBearer\s+[A-Za-z0-9._~+/=-]+/i.test(value)) {
			throw new Error(`${path} must not contain bearer credentials`);
		}
		try {
			const url = new URL(value);
			if (url.username || url.password) throw new Error(`${path} must not contain URL credentials`);
		} catch (error) {
			if (error instanceof Error && error.message.endsWith("must not contain URL credentials")) throw error;
		}
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
		return value;
	}
	if (typeof value !== "object") throw new Error(`${path} contains a non-JSON value`);

	if (Array.isArray(value)) {
		if (value.length > MAX_ARRAY_ITEMS) {
			throw new Error(`${path} contains more than ${MAX_ARRAY_ITEMS} array items`);
		}
		return value.map((item, index) => cloneJson(item, state, depth + 1, `${path}[${index}]`));
	}

	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new Error(`${path} must contain only plain JSON objects`);
	}
	if (Object.getOwnPropertySymbols(value).length > 0) throw new Error(`${path} must not contain symbol keys`);

	const descriptors = Object.getOwnPropertyDescriptors(value);
	const keys = Object.keys(descriptors);
	if (keys.length > MAX_OBJECT_PROPERTIES) {
		throw new Error(`${path} contains more than ${MAX_OBJECT_PROPERTIES} object properties`);
	}

	const output: Record<string, unknown> = Object.create(null);
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!("value" in descriptor)) throw new Error(`${path}.${key} must not use accessors`);
		if (PROTOTYPE_KEYS.has(key.toLowerCase())) throw new Error(`${path}.${key} is not permitted`);
		const normalized = normalizedKey(key);
		if (state.blockAdvancedKeys && FORBIDDEN_ADVANCED_KEYS.has(normalized)) {
			throw new Error(`${path}.${key} is security-sensitive or unsupported`);
		}
		const cloned = cloneJson(descriptor.value, state, depth + 1, `${path}.${key}`);
		const numericLimit = NUMERIC_LIMITS[normalized];
		if (numericLimit && typeof cloned === "number") {
			if (cloned < numericLimit.minimum || cloned > numericLimit.maximum) {
				throw new Error(
					`${path}.${key} must be between ${numericLimit.minimum} and ${numericLimit.maximum}`,
				);
			}
		}
		output[key] = cloned;
	}
	return output;
}

export function prepareAdvancedOptions(
	value: Record<string, unknown> | undefined,
	allowedTopLevelKeys: ReadonlySet<string>,
	controlledTopLevelKeys: ReadonlySet<string>,
	label: string,
): Record<string, unknown> {
	if (value === undefined) return Object.create(null) as Record<string, unknown>;
	serializedSize(value, `${label} advancedOptions`, MAX_ADVANCED_BYTES);
	const cloned = cloneJson(
		value,
		{
			nodes: 0,
			knownApiKey: process.env.FIRECRAWL_API_KEY?.trim() || undefined,
			blockAdvancedKeys: true,
		},
		0,
		`${label}.advancedOptions`,
	) as Record<string, unknown>;

	for (const key of Object.keys(cloned)) {
		if (controlledTopLevelKeys.has(key)) {
			throw new Error(`${label}.advancedOptions.${key} cannot override a first-class tool argument`);
		}
		if (!allowedTopLevelKeys.has(key)) {
			throw new Error(`${label}.advancedOptions.${key} is not a supported SDK option for this operation`);
		}
	}
	return cloned;
}

export function prepareJsonSchema(value: Record<string, unknown> | undefined, label: string): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	serializedSize(value, label, MAX_JSON_BYTES);
	return cloneJson(
		value,
		{
			nodes: 0,
			knownApiKey: process.env.FIRECRAWL_API_KEY?.trim() || undefined,
			blockAdvancedKeys: false,
		},
		0,
		label,
	) as Record<string, unknown>;
}

export function requireHttpUrl(value: string, label: string): string {
	const trimmed = value.trim();
	if (!trimmed) throw new Error(`${label} must not be blank`);
	if (trimmed.length > 4_096) throw new Error(`${label} exceeds 4096 characters`);
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new Error(`${label} must be an absolute http:// or https:// URL`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`${label} must use http:// or https://`);
	}
	if (url.username || url.password) throw new Error(`${label} must not contain embedded credentials`);
	return url.toString();
}

export function validateApiUrl(value: string): string {
	const url = requireHttpUrl(value, "FIRECRAWL_API_URL");
	const parsed = new URL(url);
	if (parsed.search || parsed.hash) {
		throw new Error("FIRECRAWL_API_URL must not contain a query string or fragment");
	}
	return parsed.toString().replace(/\/$/, "");
}

export function requireJobId(value: string | undefined, toolName: string): string {
	const id = value?.trim();
	if (!id) throw new Error(`${toolName} requires jobId for this action`);
	if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) {
		throw new Error(`${toolName} jobId must contain only letters, numbers, underscores, or hyphens`);
	}
	return id;
}

export interface StructuredJsonFormatInput {
	prompt?: string;
	schema?: Record<string, unknown>;
}

export function prepareScrapeFormats(
	formats: readonly string[] | undefined,
	jsonOptions: StructuredJsonFormatInput | undefined,
	label: string,
): Array<string | { type: "json"; prompt?: string; schema?: Record<string, unknown> }> | undefined {
	if (formats?.includes("json")) {
		throw new Error(`${label} cannot use bare \"json\"; supply structured JSON options instead`);
	}
	const output: Array<string | { type: "json"; prompt?: string; schema?: Record<string, unknown> }> = [
		...(formats ?? []),
	];
	if (jsonOptions) {
		const prompt = jsonOptions.prompt === undefined
			? undefined
			: requireText(jsonOptions.prompt, `${label}.prompt`);
		const schema = prepareJsonSchema(jsonOptions.schema, `${label}.schema`);
		if (!prompt && !schema) {
			throw new Error(`${label} requires prompt and/or schema`);
		}
		output.push({
			type: "json",
			...(prompt ? { prompt } : {}),
			...(schema ? { schema } : {}),
		});
	}
	return output.length > 0 ? output : undefined;
}

export function requireText(value: string | undefined, label: string): string {
	const text = value?.trim();
	if (!text) throw new Error(`${label} must contain non-whitespace text`);
	return text;
}
