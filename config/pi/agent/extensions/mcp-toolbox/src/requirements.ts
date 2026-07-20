import { createHash } from "node:crypto";
import type {
	ConfiguredTool,
	CredentialReference,
	DynamicResolverReference,
} from "./config.ts";
import { ONEPASSWORD_RESOLVER_PROVIDER, type ResolverPurpose } from "./resolver.ts";

export const MCP_TOOLBOX_REQUIREMENTS_PROTOCOL_VERSION = 1 as const;
export const MCP_TOOLBOX_REQUIREMENTS_PROTOCOL = "pi.mcp-toolbox.requirements/v1" as const;
export const MCP_TOOLBOX_REQUIREMENTS_CHANNEL = "pi:mcp-toolbox:requirements:v1" as const;
export const MAX_REQUIREMENTS_PER_TOOL = 20;
export const MAX_REQUIREMENT_METADATA_BYTES = 16 * 1024;
export const MAX_SELECTED_CREDENTIAL_REFERENCES = 32;
export const MAX_UNIQUE_RESOLVER_TUPLES = 20;

const REQUIREMENT_DOMAIN = Buffer.from("pi.mcp-toolbox.requirement-id\0", "ascii");
const REQUIREMENT_VERSION = "1";
const SERVER_ID = /^[a-z][a-z0-9-]{0,31}$/u;
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,64}$/u;
const DYNAMIC_REQUIREMENT_ID = /^mcp1-(H|A|B)-[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

export type RequirementTargetKind = "header" | "auth-token" | "bound-param";
export type CredentialTarget = "headers" | "authTokens" | "boundParams";

const REQUIREMENT_FIELDS: Readonly<Record<RequirementTargetKind, Readonly<{
	prefix: string;
	purpose: ResolverPurpose;
	rank: number;
}>>> = Object.freeze({
	header: Object.freeze({ prefix: "mcp1-H-", purpose: "mcp-toolbox.header", rank: 0 }),
	"auth-token": Object.freeze({ prefix: "mcp1-A-", purpose: "mcp-toolbox.auth-token", rank: 1 }),
	"bound-param": Object.freeze({ prefix: "mcp1-B-", purpose: "mcp-toolbox.bound-param", rank: 2 }),
});

const MARKER_KIND = new Map<string, RequirementTargetKind>([
	["H", "header"],
	["A", "auth-token"],
	["B", "bound-param"],
]);

export interface ParsedDynamicRequirementId {
	targetKind: RequirementTargetKind;
	purpose: ResolverPurpose;
}

export interface RequirementRecord {
	readonly requirementId: string;
	readonly targetKind: RequirementTargetKind;
	readonly targetName: string;
	readonly purpose: ResolverPurpose;
}

export interface RequirementSet {
	readonly protocol: typeof MCP_TOOLBOX_REQUIREMENTS_PROTOCOL;
	readonly server: string;
	readonly tool: string;
	readonly requirements: readonly RequirementRecord[];
}

export type RequirementMetadataEvent =
	| Readonly<{
		protocol: typeof MCP_TOOLBOX_REQUIREMENTS_PROTOCOL;
		action: "replace";
		server: string;
		tool: string;
		requirements: readonly RequirementRecord[];
	}>
	| Readonly<{
		protocol: typeof MCP_TOOLBOX_REQUIREMENTS_PROTOCOL;
		action: "invalidate";
	}>;

export interface RequirementToolResult {
	readonly content: readonly [Readonly<{ type: "text"; text: string }>];
	readonly details: RequirementSet;
}

export interface CredentialPlanServer {
	readonly id: string;
	readonly headers: Record<string, CredentialReference>;
	readonly authTokens: Record<string, CredentialReference>;
	readonly boundParams: Record<string, CredentialReference>;
}

export interface PlannedCredential {
	readonly target: CredentialTarget;
	readonly targetKind: RequirementTargetKind;
	readonly targetName: string;
	readonly reference: CredentialReference;
	readonly purpose: ResolverPurpose;
	readonly resolver?: Readonly<{
		provider: typeof ONEPASSWORD_RESOLVER_PROVIDER;
		slot: string;
	}>;
	readonly requirement?: RequirementRecord;
}

export class RequirementPlanningError extends Error {
	readonly code: "invalid-plan" | "credential-count" | "resolver-count" | "requirement-count" | "collision";

	constructor(
		code: "invalid-plan" | "credential-count" | "resolver-count" | "requirement-count" | "collision",
		message: string,
	) {
		super(message);
		this.name = "McpToolboxRequirementPlanningError";
		this.code = code;
	}
}

function frame(value: string): Buffer {
	const bytes = Buffer.from(value, "utf8");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(bytes.byteLength, 0);
	return Buffer.concat([length, bytes]);
}

function validateCanonicalFields(
	server: string,
	tool: string,
	targetKind: RequirementTargetKind,
	targetName: string,
): void {
	if (!SERVER_ID.test(server) || !REMOTE_NAME.test(tool) || !Object.hasOwn(REQUIREMENT_FIELDS, targetKind)) {
		throw new RequirementPlanningError("invalid-plan", "contains invalid canonical requirement identity fields");
	}
	const targetPattern = targetKind === "header" ? HEADER_NAME : REMOTE_NAME;
	if (!targetPattern.test(targetName)) {
		throw new RequirementPlanningError("invalid-plan", "contains an invalid configured credential target name");
	}
}

export function deriveRequirementId(
	server: string,
	tool: string,
	targetKind: RequirementTargetKind,
	targetName: string,
): string {
	validateCanonicalFields(server, tool, targetKind, targetName);
	const preimage = Buffer.concat([
		REQUIREMENT_DOMAIN,
		frame(REQUIREMENT_VERSION),
		frame(server),
		frame(tool),
		frame(targetKind),
		frame(targetName),
	]);
	const suffix = createHash("sha256").update(preimage).digest("base64url");
	const requirementId = `${REQUIREMENT_FIELDS[targetKind].prefix}${suffix}`;
	const parsed = parseDynamicRequirementId(requirementId);
	if (!parsed || parsed.targetKind !== targetKind) {
		throw new RequirementPlanningError("invalid-plan", "could not derive a canonical requirement identifier");
	}
	return requirementId;
}

export function parseDynamicRequirementId(value: unknown): ParsedDynamicRequirementId | undefined {
	if (typeof value !== "string" || value.length !== 50 || !DYNAMIC_REQUIREMENT_ID.test(value)) return undefined;
	const targetKind = MARKER_KIND.get(value[5]!);
	if (!targetKind) return undefined;
	const suffix = value.slice(7);
	let decoded: Buffer;
	try {
		decoded = Buffer.from(suffix, "base64url");
	} catch {
		return undefined;
	}
	if (decoded.byteLength !== 32 || decoded.toString("base64url") !== suffix) return undefined;
	return Object.freeze({ targetKind, purpose: REQUIREMENT_FIELDS[targetKind].purpose });
}

export function requirementPurpose(targetKind: RequirementTargetKind): ResolverPurpose {
	const fields = REQUIREMENT_FIELDS[targetKind];
	if (!fields) throw new RequirementPlanningError("invalid-plan", "contains an invalid requirement target kind");
	return fields.purpose;
}

export function isDynamicResolverReference(
	reference: CredentialReference,
): reference is DynamicResolverReference {
	return reference.resolver.provider === ONEPASSWORD_RESOLVER_PROVIDER && reference.resolver.dynamic === true;
}

function canonicalRequirementIdentity(
	server: string,
	tool: string,
	targetKind: RequirementTargetKind,
	targetName: string,
): string {
	return JSON.stringify([REQUIREMENT_VERSION, server, tool, targetKind, targetName]);
}

function selectedReference(
	server: CredentialPlanServer,
	target: CredentialTarget,
	name: string,
): CredentialReference {
	const reference = server[target][name];
	if (!reference) {
		throw new RequirementPlanningError("invalid-plan", "references a missing configured credential target");
	}
	return reference;
}

function createPlannedCredential(
	server: CredentialPlanServer,
	tool: ConfiguredTool,
	target: CredentialTarget,
	targetKind: RequirementTargetKind,
	targetName: string,
	reference: CredentialReference,
): PlannedCredential {
	validateCanonicalFields(server.id, tool.name, targetKind, targetName);
	const purpose = requirementPurpose(targetKind);
	if (!isDynamicResolverReference(reference)) {
		throw new RequirementPlanningError("invalid-plan", "contains a non-dynamic or non-1Password credential source");
	}
	const requirementId = deriveRequirementId(server.id, tool.name, targetKind, targetName);
	const parsed = parseDynamicRequirementId(requirementId);
	if (!parsed || parsed.targetKind !== targetKind || parsed.purpose !== purpose) {
		throw new RequirementPlanningError("invalid-plan", "derived requirement identity disagrees with its target");
	}
	const requirement = Object.freeze({
		requirementId,
		targetKind,
		targetName,
		purpose,
	});
	return Object.freeze({
		target,
		targetKind,
		targetName,
		reference,
		purpose,
		resolver: Object.freeze({
			provider: ONEPASSWORD_RESOLVER_PROVIDER,
			slot: requirementId,
		}),
		requirement,
	});
}

/** Shared selected-target planner used by both offline discovery and invocation. */
export function planSelectedCredentials(
	server: CredentialPlanServer,
	tool: ConfiguredTool,
): readonly PlannedCredential[] {
	validateCanonicalFields(server.id, tool.name, "bound-param", "plan-check");
	const plan: PlannedCredential[] = [];
	for (const [name, reference] of Object.entries(server.headers)) {
		plan.push(createPlannedCredential(server, tool, "headers", "header", name, reference));
	}
	for (const name of tool.authTokens) {
		plan.push(createPlannedCredential(
			server,
			tool,
			"authTokens",
			"auth-token",
			name,
			selectedReference(server, "authTokens", name),
		));
	}
	for (const name of tool.boundParams) {
		plan.push(createPlannedCredential(
			server,
			tool,
			"boundParams",
			"bound-param",
			name,
			selectedReference(server, "boundParams", name),
		));
	}
	if (plan.length > MAX_SELECTED_CREDENTIAL_REFERENCES) {
		throw new RequirementPlanningError(
			"credential-count",
			`selects more than ${MAX_SELECTED_CREDENTIAL_REFERENCES} credential references`,
		);
	}

	const targetTuples = new Set<string>();
	const resolverTuples = new Set<string>();
	const requirementIds = new Map<string, string>();
	let requirementCount = 0;
	for (const item of plan) {
		const targetTuple = `${item.targetKind}\0${item.targetName}`;
		if (targetTuples.has(targetTuple)) {
			throw new RequirementPlanningError("invalid-plan", "contains a duplicate selected credential target");
		}
		targetTuples.add(targetTuple);
		if (item.resolver) {
			resolverTuples.add(`${item.resolver.provider}\0${item.purpose}\0${item.resolver.slot}`);
		}
		if (item.requirement) {
			requirementCount += 1;
			const identity = canonicalRequirementIdentity(
				server.id,
				tool.name,
				item.targetKind,
				item.targetName,
			);
			const previous = requirementIds.get(item.requirement.requirementId);
			if (previous !== undefined && previous !== identity) {
				throw new RequirementPlanningError("collision", "contains colliding derived requirement identifiers");
			}
			requirementIds.set(item.requirement.requirementId, identity);
		}
	}
	if (resolverTuples.size > MAX_UNIQUE_RESOLVER_TUPLES) {
		throw new RequirementPlanningError(
			"resolver-count",
			`requires more than ${MAX_UNIQUE_RESOLVER_TUPLES} resolver references`,
		);
	}
	if (requirementCount > MAX_REQUIREMENTS_PER_TOOL) {
		throw new RequirementPlanningError(
			"requirement-count",
			`requires more than ${MAX_REQUIREMENTS_PER_TOOL} dynamic credential requirements`,
		);
	}
	return Object.freeze(plan);
}

function compareRequirements(left: RequirementRecord, right: RequirementRecord): number {
	const rank = REQUIREMENT_FIELDS[left.targetKind].rank - REQUIREMENT_FIELDS[right.targetKind].rank;
	if (rank !== 0) return rank;
	return left.targetName < right.targetName ? -1 : left.targetName > right.targetName ? 1 : 0;
}

function detachedRequirements(plan: readonly PlannedCredential[]): readonly RequirementRecord[] {
	const requirements = plan
		.filter((item): item is PlannedCredential & { requirement: RequirementRecord } => item.requirement !== undefined)
		.map((item) => Object.freeze({
			requirementId: item.requirement.requirementId,
			targetKind: item.requirement.targetKind,
			targetName: item.requirement.targetName,
			purpose: item.requirement.purpose,
		}))
		.sort(compareRequirements);
	return Object.freeze(requirements);
}

function assertMetadataBound(value: unknown): void {
	let serialized: string;
	try {
		serialized = JSON.stringify(value);
	} catch {
		throw new RequirementPlanningError("invalid-plan", "could not serialize requirement metadata");
	}
	if (Buffer.byteLength(serialized, "utf8") > MAX_REQUIREMENT_METADATA_BYTES) {
		throw new RequirementPlanningError("requirement-count", "requirement metadata exceeds its fixed size bound");
	}
}

export function createRequirementArtifacts(
	server: CredentialPlanServer,
	tool: ConfiguredTool,
): Readonly<{ result: RequirementToolResult; event: RequirementMetadataEvent }> {
	const plan = planSelectedCredentials(server, tool);
	const details: RequirementSet = Object.freeze({
		protocol: MCP_TOOLBOX_REQUIREMENTS_PROTOCOL,
		server: server.id,
		tool: tool.name,
		requirements: detachedRequirements(plan),
	});
	assertMetadataBound(details);
	const contentPart = Object.freeze({ type: "text" as const, text: JSON.stringify(details) });
	const result: RequirementToolResult = Object.freeze({
		content: Object.freeze([contentPart] as const),
		details,
	});
	const event: RequirementMetadataEvent = Object.freeze({
		protocol: MCP_TOOLBOX_REQUIREMENTS_PROTOCOL,
		action: "replace" as const,
		server: server.id,
		tool: tool.name,
		requirements: detachedRequirements(plan),
	});
	assertMetadataBound(event);
	return Object.freeze({ result, event });
}

export function createRequirementInvalidationEvent(): RequirementMetadataEvent {
	return Object.freeze({
		protocol: MCP_TOOLBOX_REQUIREMENTS_PROTOCOL,
		action: "invalidate" as const,
	});
}
