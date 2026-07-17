import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const DATABASE_REQUIREMENTS_PROTOCOL = "pi.database.profile-requirements/v1" as const;
export const DATABASE_REQUIREMENTS_CHANNEL = "pi:database:profile-requirements:v1" as const;
export const DATABASE_PROFILE_PROTOCOL = "pi.database.profile-resolver/v1" as const;
export const DATABASE_PROFILE_REQUEST_CHANNEL = "pi:database:profile-resolver:v1:request" as const;
export const DATABASE_PROFILE_CONSUMER = "pi-database" as const;
export const DATABASE_QUERY_TOOL = "database_query" as const;
export const DATABASE_PROFILE_PURPOSE = "database.profile-json" as const;
export const DATABASE_PROFILE_ROLE = "connection-profile" as const;
export const DATABASE_PROFILE_CONTRACT = "pi.database.connection-profile/v1" as const;

export const DATABASE_PROFILE_NAME_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/u;
export const DATABASE_PROJECT_SCOPE_ID_PATTERN = /^dbs1-[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
export const DATABASE_PREPARATION_ID_PATTERN = /^dbn1-[A-Za-z0-9_-]{32}$/u;
export const DATABASE_REQUIREMENT_ID_PATTERN = /^dbp1-P-[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
export const DATABASE_REQUEST_ID_PATTERN = /^dbr1_[A-Za-z0-9_-]{32}$/u;

const PROJECT_SCOPE_DOMAIN = Buffer.from("pi.database.project-scope-id\0", "ascii");
const REQUIREMENT_DOMAIN = Buffer.from("pi.database.profile-requirement-id\0", "ascii");

function frame(value: string): Buffer {
	const bytes = Buffer.from(value, "utf8");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(bytes.byteLength, 0);
	return Buffer.concat([length, bytes]);
}

export function deriveProjectScopeId(canonicalProjectPath: string): string {
	const suffix = createHash("sha256")
		.update(Buffer.concat([PROJECT_SCOPE_DOMAIN, frame(canonicalProjectPath)]))
		.digest("base64url");
	return `dbs1-${suffix}`;
}

export interface DatabaseProfileRequirement {
	readonly requirementId: string;
	readonly preparationId: string;
	readonly projectScopeId: string;
	readonly projectPath: string;
	readonly consumer: typeof DATABASE_PROFILE_CONSUMER;
	readonly tool: typeof DATABASE_QUERY_TOOL;
	readonly purpose: typeof DATABASE_PROFILE_PURPOSE;
	readonly profileName: string;
	readonly profileRole: typeof DATABASE_PROFILE_ROLE;
	readonly contract: typeof DATABASE_PROFILE_CONTRACT;
}

export function deriveDatabaseRequirementId(input: Omit<DatabaseProfileRequirement, "requirementId" | "projectPath">): string {
	const suffix = createHash("sha256").update(Buffer.concat([
		REQUIREMENT_DOMAIN,
		frame("1"),
		frame(input.preparationId),
		frame(input.projectScopeId),
		frame(input.consumer),
		frame(input.tool),
		frame(input.purpose),
		frame(input.profileRole),
		frame(input.profileName),
		frame(input.contract),
	])).digest("base64url");
	return `dbp1-P-${suffix}`;
}

export type DatabaseProfileFailureCode =
	| "aborted"
	| "binding_denied"
	| "busy"
	| "call_limit"
	| "configuration"
	| "deadline_exceeded"
	| "disabled"
	| "duplicate_request"
	| "invalid_request"
	| "lifecycle"
	| "request_failed"
	| "response_rejected"
	| "sdk_unavailable"
	| "unexpected"
	| "unavailable";

export type DatabaseProfileResponse =
	| Readonly<{ protocol: typeof DATABASE_PROFILE_PROTOCOL; ok: true; value: string }>
	| Readonly<{ protocol: typeof DATABASE_PROFILE_PROTOCOL; ok: false; code: Exclude<DatabaseProfileFailureCode, "unavailable"> }>;

export interface DatabaseProfileRequest {
	readonly protocol: typeof DATABASE_PROFILE_PROTOCOL;
	readonly consumer: typeof DATABASE_PROFILE_CONSUMER;
	readonly tool: typeof DATABASE_QUERY_TOOL;
	readonly purpose: typeof DATABASE_PROFILE_PURPOSE;
	readonly profileRole: typeof DATABASE_PROFILE_ROLE;
	readonly contract: typeof DATABASE_PROFILE_CONTRACT;
	readonly requirementId: string;
	readonly projectScopeId: string;
	readonly profileName: string;
	readonly requestId: string;
	readonly deadlineAt: number;
	readonly signal: AbortSignal;
	readonly respond: (response: DatabaseProfileResponse) => unknown;
}

export interface DatabaseEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
	emit(channel: string, data: unknown): void;
}
