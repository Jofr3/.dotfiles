import {
	ConfigError,
	ConfigStore,
	findConfiguredTool,
	type LoadedConfig,
} from "./config.ts";
import {
	createRequirementArtifacts,
	type RequirementMetadataEvent,
	type RequirementToolResult,
} from "./requirements.ts";

const SERVER_ID = /^[a-z][a-z0-9-]{0,31}$/u;
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;

export interface RequirementsToolInput {
	readonly server: string;
	readonly tool: string;
}

export interface RequirementEventEmitter {
	emit(event: RequirementMetadataEvent): void;
}

export class RequirementDiscoveryError extends Error {
	readonly code: "invalid-input" | "configuration" | "not-allowed" | "planning" | "event";

	constructor(
		code: "invalid-input" | "configuration" | "not-allowed" | "planning" | "event",
		message: string,
	) {
		super(message);
		this.name = "McpToolboxRequirementDiscoveryError";
		this.code = code;
	}
}

function parseInput(value: unknown): RequirementsToolInput {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new RequirementDiscoveryError("invalid-input", "MCP Toolbox requirements input was invalid");
	}
	let prototype: object | null;
	let descriptors: Record<PropertyKey, PropertyDescriptor>;
	try {
		prototype = Object.getPrototypeOf(value);
		descriptors = Object.getOwnPropertyDescriptors(value);
	} catch {
		throw new RequirementDiscoveryError("invalid-input", "MCP Toolbox requirements input was invalid");
	}
	if (prototype !== Object.prototype && prototype !== null) {
		throw new RequirementDiscoveryError("invalid-input", "MCP Toolbox requirements input was invalid");
	}
	const keys = Reflect.ownKeys(descriptors);
	if (keys.length !== 2 || !keys.includes("server") || !keys.includes("tool")) {
		throw new RequirementDiscoveryError("invalid-input", "MCP Toolbox requirements input was invalid");
	}
	const read = (key: "server" | "tool"): unknown => {
		const descriptor = descriptors[key];
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
			throw new RequirementDiscoveryError("invalid-input", "MCP Toolbox requirements input was invalid");
		}
		return descriptor.value;
	};
	const server = read("server");
	const tool = read("tool");
	if (typeof server !== "string" || !SERVER_ID.test(server) || typeof tool !== "string" || !REMOTE_NAME.test(tool)) {
		throw new RequirementDiscoveryError("invalid-input", "MCP Toolbox requirements input was invalid");
	}
	return Object.freeze({ server, tool });
}

/** Offline implementation behind the fixed Pi requirements tool. */
export async function discoverRequirements(
	store: ConfigStore,
	input: unknown,
	emitter: RequirementEventEmitter,
): Promise<RequirementToolResult> {
	const parsed = parseInput(input);
	let loaded: LoadedConfig;
	try {
		loaded = await store.get();
	} catch {
		throw new RequirementDiscoveryError(
			"configuration",
			"MCP Toolbox credential requirements are unavailable because local configuration is invalid",
		);
	}
	if (!loaded.config) {
		throw new RequirementDiscoveryError(
			"configuration",
			"MCP Toolbox credential requirements are unavailable because MCP Toolbox is not configured",
		);
	}
	let selected: ReturnType<typeof findConfiguredTool>;
	try {
		selected = findConfiguredTool(loaded.config, parsed.server, parsed.tool);
	} catch (error) {
		if (error instanceof ConfigError && ["server-not-allowed", "tool-denied", "tool-not-allowed"].includes(error.code)) {
			throw new RequirementDiscoveryError(
				"not-allowed",
				"MCP Toolbox credential requirements are unavailable for the selected server/tool",
			);
		}
		throw new RequirementDiscoveryError(
			"configuration",
			"MCP Toolbox credential requirements are unavailable because local configuration is invalid",
		);
	}
	let artifacts: ReturnType<typeof createRequirementArtifacts>;
	try {
		artifacts = createRequirementArtifacts(selected.server, selected.tool);
	} catch {
		throw new RequirementDiscoveryError(
			"planning",
			"MCP Toolbox credential requirements could not be derived safely",
		);
	}
	try {
		emitter.emit(artifacts.event);
	} catch {
		throw new RequirementDiscoveryError(
			"event",
			"MCP Toolbox credential requirements could not be published safely",
		);
	}
	return artifacts.result;
}
