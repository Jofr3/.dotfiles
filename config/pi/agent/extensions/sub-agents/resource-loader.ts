import { Buffer } from "node:buffer";
import {
	createExtensionRuntime,
	type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { buildSubAgentSystemPrompt } from "./prompt-builder.ts";
import type {
	DynamicAgentSpec,
	SessionGeneration,
	SubAgentId,
} from "./types.ts";
import { SUB_AGENT_BOUNDS } from "./types.ts";

const SNAPSHOT_VERSION = 1 as const;

export interface ParentContextFile {
	readonly path: string;
	readonly content: string;
}

export interface ParentContextSnapshotV1 {
	readonly version: typeof SNAPSHOT_VERSION;
	readonly generation: SessionGeneration;
	readonly trusted: boolean;
	readonly capturedAt: number;
	readonly files: readonly ParentContextFile[];
}

export interface CaptureParentContextOptions {
	generation: SessionGeneration;
	trusted: boolean;
	contextFiles?: readonly ParentContextFile[];
	capturedAt?: number;
}

export interface CreateSubAgentResourceLoaderOptions {
	id: SubAgentId;
	generation: SessionGeneration;
	spec: Readonly<DynamicAgentSpec>;
	parentContext?: ParentContextSnapshotV1;
}

export type SubAgentResourceLoaderErrorCode =
	| "invalid_context_snapshot"
	| "context_snapshot_too_large"
	| "dynamic_resources_rejected";

export class SubAgentResourceLoaderError extends Error {
	readonly code: SubAgentResourceLoaderErrorCode;

	constructor(code: SubAgentResourceLoaderErrorCode, message: string) {
		super(message);
		this.name = "SubAgentResourceLoaderError";
		this.code = code;
	}
}

function requireGeneration(value: unknown): SessionGeneration {
	if (
		typeof value !== "string" ||
		!value.trim() ||
		value.length > SUB_AGENT_BOUNDS.agentIdChars
	) {
		throw new SubAgentResourceLoaderError(
			"invalid_context_snapshot",
			"The parent session generation is invalid",
		);
	}
	return value;
}

function requireCapturedAt(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new SubAgentResourceLoaderError(
			"invalid_context_snapshot",
			"The parent context capture time is invalid",
		);
	}
	return value;
}

function copyBoundedContextFiles(value: unknown): readonly ParentContextFile[] {
	if (value === undefined) return Object.freeze([]);
	if (!Array.isArray(value)) {
		throw new SubAgentResourceLoaderError(
			"invalid_context_snapshot",
			"Parent context files must be an array",
		);
	}
	if (value.length > SUB_AGENT_BOUNDS.contextFiles) {
		throw new SubAgentResourceLoaderError(
			"context_snapshot_too_large",
			`Parent context exceeds ${SUB_AGENT_BOUNDS.contextFiles} files`,
		);
	}

	let totalBytes = 0;
	const files = value.map((candidate, index) => {
		if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
			throw new SubAgentResourceLoaderError(
				"invalid_context_snapshot",
				`Parent context file ${index + 1} is invalid`,
			);
		}
		const { path, content } = candidate as { path?: unknown; content?: unknown };
		if (
			typeof path !== "string" ||
			!path.trim() ||
			path.includes("\0") ||
			path.length > SUB_AGENT_BOUNDS.contextPathChars
		) {
			throw new SubAgentResourceLoaderError(
				"invalid_context_snapshot",
				`Parent context file ${index + 1} has an invalid path`,
			);
		}
		if (typeof content !== "string") {
			throw new SubAgentResourceLoaderError(
				"invalid_context_snapshot",
				`Parent context file ${index + 1} has invalid content`,
			);
		}
		const contentBytes = Buffer.byteLength(content, "utf8");
		if (contentBytes > SUB_AGENT_BOUNDS.contextFileBytes) {
			throw new SubAgentResourceLoaderError(
				"context_snapshot_too_large",
				`Parent context file ${index + 1} exceeds ${SUB_AGENT_BOUNDS.contextFileBytes} bytes`,
			);
		}
		totalBytes += Buffer.byteLength(path, "utf8") + contentBytes;
		if (totalBytes > SUB_AGENT_BOUNDS.contextTotalBytes) {
			throw new SubAgentResourceLoaderError(
				"context_snapshot_too_large",
				`Parent context exceeds ${SUB_AGENT_BOUNDS.contextTotalBytes} bytes`,
			);
		}
		return Object.freeze({ path, content });
	});
	return Object.freeze(files);
}

/**
 * Copies the current parent turn's already loaded context without rediscovery.
 * Untrusted projects are deliberately handled before the candidate array is
 * inspected so their context content is neither copied nor validated.
 */
export function captureParentContextSnapshot(
	options: CaptureParentContextOptions,
): ParentContextSnapshotV1 {
	const generation = requireGeneration(options.generation);
	const capturedAt = requireCapturedAt(options.capturedAt ?? Date.now());
	const trusted = options.trusted === true;
	const files = trusted
		? copyBoundedContextFiles(options.contextFiles)
		: Object.freeze([]);
	return Object.freeze({
		version: SNAPSHOT_VERSION,
		generation,
		trusted,
		capturedAt,
		files,
	});
}

function approvedContextFiles(
	expectedGeneration: SessionGeneration,
	snapshot: ParentContextSnapshotV1 | undefined,
): readonly ParentContextFile[] {
	const generation = requireGeneration(expectedGeneration);
	if (
		!snapshot ||
		snapshot.version !== SNAPSHOT_VERSION ||
		snapshot.trusted !== true ||
		snapshot.generation !== generation
	) {
		return Object.freeze([]);
	}
	return copyBoundedContextFiles(snapshot.files);
}

function hasDynamicResourcePaths(
	paths: Parameters<ResourceLoader["extendResources"]>[0],
): boolean {
	return (
		(paths.skillPaths?.length ?? 0) > 0 ||
		(paths.promptPaths?.length ?? 0) > 0 ||
		(paths.themePaths?.length ?? 0) > 0
	);
}

/**
 * Creates a fully explicit child loader. It performs no filesystem discovery,
 * has a fresh empty extension runtime, and rejects attempts to add executable
 * or prompt-bearing resources after construction.
 */
export function createSubAgentResourceLoader(
	options: CreateSubAgentResourceLoaderOptions,
): ResourceLoader {
	const systemPrompt = buildSubAgentSystemPrompt(options.id, options.spec);
	const contextFiles = approvedContextFiles(options.generation, options.parentContext);
	const extensionsResult = {
		extensions: [],
		errors: [],
		runtime: createExtensionRuntime(),
	};

	return {
		getExtensions: () => extensionsResult,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({
			agentsFiles: contextFiles.map((file) => ({ ...file })),
		}),
		getSystemPrompt: () => systemPrompt,
		getAppendSystemPrompt: () => [],
		extendResources(paths) {
			if (hasDynamicResourcePaths(paths)) {
				throw new SubAgentResourceLoaderError(
					"dynamic_resources_rejected",
					"Isolated child resource loaders reject dynamic resource extension",
				);
			}
		},
		async reload() {
			// Every resource is immutable and supplied explicitly at construction.
		},
	};
}
