import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
	consumeDynamicSecretGrant,
	hasDynamicSecretGrant,
	type DynamicSecretGrantCapability,
	type OnePasswordManager,
	revokeDynamicSecretGrant,
} from "./manager.ts";
import type { VaultMetadata } from "./metadata.ts";

export const DATABASE_REQUIREMENTS_PROTOCOL = "pi.database.profile-requirements/v1" as const;
export const DATABASE_REQUIREMENTS_CHANNEL = "pi:database:profile-requirements:v1" as const;
export const DATABASE_PROFILE_PROTOCOL = "pi.database.profile-resolver/v1" as const;
export const DATABASE_PROFILE_REQUEST_CHANNEL = "pi:database:profile-resolver:v1:request" as const;
export const DATABASE_PROFILE_CONSUMER = "pi-database" as const;
export const DATABASE_QUERY_TOOL = "database_query" as const;
export const DATABASE_PROFILE_PURPOSE = "database.profile-json" as const;
export const DATABASE_PROFILE_ROLE = "connection-profile" as const;
export const DATABASE_PROFILE_CONTRACT = "pi.database.connection-profile/v1" as const;

const PROJECT_SCOPE_ID_PATTERN = /^dbs1-[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
const PREPARATION_ID_PATTERN = /^dbn1-[A-Za-z0-9_-]{32}$/u;
export const DATABASE_REQUIREMENT_ID_PATTERN = /^dbp1-P-[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
const REQUEST_ID_PATTERN = /^dbr1_[A-Za-z0-9_-]{32}$/u;
const PROFILE_NAME_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/u;
const SAFE_PATH = /^\/[^\p{Cc}\p{Cf}\p{Cs}]*$/u;
const REQUIREMENT_DOMAIN = Buffer.from("pi.database.profile-requirement-id\0", "ascii");
const PROJECT_SCOPE_DOMAIN = Buffer.from("pi.database.project-scope-id\0", "ascii");

function frame(value: string): Buffer {
	const bytes = Buffer.from(value, "utf8");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(bytes.byteLength, 0);
	return Buffer.concat([length, bytes]);
}

function deriveProjectScopeId(path: string): string {
	return `dbs1-${createHash("sha256").update(Buffer.concat([PROJECT_SCOPE_DOMAIN, frame(path)])).digest("base64url")}`;
}

function deriveRequirementId(input: Omit<DatabaseProfileRequirementRecord, "requirementId" | "projectPath">): string {
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

export interface DatabaseProfileRequirementRecord {
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

export type DatabaseRequirementEvent =
	| Readonly<{
		protocol: typeof DATABASE_REQUIREMENTS_PROTOCOL;
		action: "replace";
		projectScopeId: string;
		profileName: string;
		requirements: readonly DatabaseProfileRequirementRecord[];
	}>
	| Readonly<{ protocol: typeof DATABASE_REQUIREMENTS_PROTOCOL; action: "invalidate" }>;

export interface DatabaseEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
	emit(channel: string, data: unknown): void;
}

const REPLACE_KEYS = ["protocol", "action", "projectScopeId", "profileName", "requirements"] as const;
const INVALIDATE_KEYS = ["protocol", "action"] as const;
const REQUIREMENT_KEYS = [
	"requirementId", "preparationId", "projectScopeId", "projectPath", "consumer", "tool",
	"purpose", "profileName", "profileRole", "contract",
] as const;

function exactData(value: unknown, keys: readonly string[]): Record<string, PropertyDescriptor> {
	if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.isFrozen(value)) throw new Error("invalid");
	if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("invalid");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== keys.length) throw new Error("invalid");
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("invalid");
	}
	return descriptors;
}

function value(descriptors: Record<string, PropertyDescriptor>, key: string): unknown {
	const descriptor = descriptors[key];
	return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function denseFrozenArray(input: unknown, maximum: number): readonly unknown[] {
	if (!Array.isArray(input) || !Object.isFrozen(input) || Object.getPrototypeOf(input) !== Array.prototype) throw new Error("invalid");
	const descriptors = Object.getOwnPropertyDescriptors(input);
	const length = Object.getOwnPropertyDescriptor(input, "length");
	const lengthValue = length && "value" in length ? length.value : undefined;
	if (typeof lengthValue !== "number" || !Number.isSafeInteger(lengthValue) || lengthValue < 0 || lengthValue > maximum) throw new Error("invalid");
	if (Reflect.ownKeys(descriptors).length !== lengthValue + 1) throw new Error("invalid");
	const output: unknown[] = [];
	for (let index = 0; index < lengthValue; index += 1) {
		const descriptor = descriptors[String(index)];
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("invalid");
		output.push(descriptor.value);
	}
	return output;
}

function parseRequirement(input: unknown): DatabaseProfileRequirementRecord {
	const descriptors = exactData(input, REQUIREMENT_KEYS);
	const requirement = {
		requirementId: value(descriptors, "requirementId"),
		preparationId: value(descriptors, "preparationId"),
		projectScopeId: value(descriptors, "projectScopeId"),
		projectPath: value(descriptors, "projectPath"),
		consumer: value(descriptors, "consumer"),
		tool: value(descriptors, "tool"),
		purpose: value(descriptors, "purpose"),
		profileName: value(descriptors, "profileName"),
		profileRole: value(descriptors, "profileRole"),
		contract: value(descriptors, "contract"),
	};
	if (
		typeof requirement.requirementId !== "string" || !DATABASE_REQUIREMENT_ID_PATTERN.test(requirement.requirementId) ||
		typeof requirement.preparationId !== "string" || !PREPARATION_ID_PATTERN.test(requirement.preparationId) ||
		typeof requirement.projectScopeId !== "string" || !PROJECT_SCOPE_ID_PATTERN.test(requirement.projectScopeId) ||
		typeof requirement.projectPath !== "string" || !SAFE_PATH.test(requirement.projectPath) ||
		Buffer.byteLength(requirement.projectPath, "utf8") > 4_096 ||
		typeof requirement.profileName !== "string" || !PROFILE_NAME_PATTERN.test(requirement.profileName) ||
		requirement.consumer !== DATABASE_PROFILE_CONSUMER || requirement.tool !== DATABASE_QUERY_TOOL ||
		requirement.purpose !== DATABASE_PROFILE_PURPOSE || requirement.profileRole !== DATABASE_PROFILE_ROLE ||
		requirement.contract !== DATABASE_PROFILE_CONTRACT ||
		deriveProjectScopeId(requirement.projectPath) !== requirement.projectScopeId
	) throw new Error("invalid");
	const typed = requirement as DatabaseProfileRequirementRecord;
	if (deriveRequirementId(typed) !== typed.requirementId) throw new Error("invalid");
	return Object.freeze(typed);
}

export function parseDatabaseRequirementEvent(input: unknown): DatabaseRequirementEvent {
	let action: unknown;
	try {
		if (typeof input !== "object" || input === null) throw new Error("invalid");
		const descriptor = Object.getOwnPropertyDescriptor(input, "action");
		action = descriptor && "value" in descriptor ? descriptor.value : undefined;
	} catch { throw new Error("Invalid database requirement event."); }
	try {
		if (action === "invalidate") {
			const descriptors = exactData(input, INVALIDATE_KEYS);
			if (value(descriptors, "protocol") !== DATABASE_REQUIREMENTS_PROTOCOL) throw new Error("invalid");
			return Object.freeze({ protocol: DATABASE_REQUIREMENTS_PROTOCOL, action: "invalidate" });
		}
		if (action !== "replace") throw new Error("invalid");
		const descriptors = exactData(input, REPLACE_KEYS);
		const projectScopeId = value(descriptors, "projectScopeId");
		const profileName = value(descriptors, "profileName");
		if (
			value(descriptors, "protocol") !== DATABASE_REQUIREMENTS_PROTOCOL ||
			typeof projectScopeId !== "string" || !PROJECT_SCOPE_ID_PATTERN.test(projectScopeId) ||
			typeof profileName !== "string" || !PROFILE_NAME_PATTERN.test(profileName)
		) throw new Error("invalid");
		const records = denseFrozenArray(value(descriptors, "requirements"), 64).map(parseRequirement);
		const ids = new Set<string>();
		for (const record of records) {
			if (record.projectScopeId !== projectScopeId || record.profileName !== profileName || ids.has(record.requirementId)) throw new Error("invalid");
			ids.add(record.requirementId);
		}
		return Object.freeze({
			protocol: DATABASE_REQUIREMENTS_PROTOCOL,
			action: "replace",
			projectScopeId,
			profileName,
			requirements: Object.freeze(records),
		});
	} catch { throw new Error("Invalid database requirement event."); }
}

function scopeKey(projectScopeId: string, profileName: string): string {
	return `${projectScopeId}\u0000${profileName}`;
}

export class DatabaseRequirementMetadataCache {
	readonly #onInvalidate: (records: readonly DatabaseProfileRequirementRecord[]) => void;
	#enabled = false;
	#closed = false;
	#unsubscribe: (() => void) | undefined;
	#records = new Map<string, DatabaseProfileRequirementRecord>();
	#scopes = new Map<string, readonly DatabaseProfileRequirementRecord[]>();

	constructor(onInvalidate: (records: readonly DatabaseProfileRequirementRecord[]) => void = () => undefined) {
		this.#onInvalidate = onInvalidate;
	}

	start(bus: Pick<DatabaseEventBus, "on">): void {
		if (this.#closed || this.#unsubscribe !== undefined) return;
		this.#unsubscribe = bus.on(DATABASE_REQUIREMENTS_CHANNEL, (data) => { this.handleEvent(data); });
	}

	enable(): void { if (!this.#closed) this.#enabled = true; }

	handleEvent(input: unknown): boolean {
		if (!this.#enabled || this.#closed) return false;
		let event: DatabaseRequirementEvent;
		try { event = parseDatabaseRequirementEvent(input); } catch { return false; }
		if (event.action === "invalidate") { this.#clear(); return true; }
		const key = scopeKey(event.projectScopeId, event.profileName);
		const previous = this.#scopes.get(key) ?? [];
		const previousIds = new Set(previous.map((record) => record.requirementId));
		for (const record of event.requirements) {
			const collision = this.#records.get(record.requirementId);
			if (collision !== undefined && !previousIds.has(record.requirementId)) return false;
		}
		for (const record of previous) this.#records.delete(record.requirementId);
		if (event.requirements.length === 0) this.#scopes.delete(key);
		else this.#scopes.set(key, event.requirements);
		for (const record of event.requirements) this.#records.set(record.requirementId, record);
		if (previous.length > 0) this.#onInvalidate(Object.freeze([...previous]));
		return true;
	}

	lookup(requirementId: unknown): DatabaseProfileRequirementRecord | undefined {
		if (!this.#enabled || this.#closed || typeof requirementId !== "string" || !DATABASE_REQUIREMENT_ID_PATTERN.test(requirementId)) return undefined;
		return this.#records.get(requirementId);
	}

	isCurrent(record: DatabaseProfileRequirementRecord): boolean {
		return this.lookup(record.requirementId) === record;
	}

	invalidate(): void { this.#clear(); }

	disable(): void { this.#enabled = false; this.#clear(); }

	shutdown(): void {
		if (this.#closed) return;
		this.disable();
		this.#closed = true;
		const unsubscribe = this.#unsubscribe;
		this.#unsubscribe = undefined;
		try { unsubscribe?.(); } catch { /* Closed state is authoritative. */ }
	}

	status(): Readonly<{ enabled: boolean; requirementCount: number; scopeCount: number }> {
		return Object.freeze({ enabled: this.#enabled && !this.#closed, requirementCount: this.#records.size, scopeCount: this.#scopes.size });
	}

	#clear(): void {
		const stale = Object.freeze([...this.#records.values()]);
		this.#records.clear();
		this.#scopes.clear();
		if (stale.length > 0) this.#onInvalidate(stale);
	}
}

export type DatabaseProfileFailureCode =
	| "aborted" | "binding_denied" | "busy" | "call_limit" | "configuration"
	| "deadline_exceeded" | "disabled" | "duplicate_request" | "invalid_request"
	| "lifecycle" | "request_failed" | "response_rejected" | "sdk_unavailable" | "unexpected";

type DatabaseResponse =
	| Readonly<{ protocol: typeof DATABASE_PROFILE_PROTOCOL; ok: true; value: string }>
	| Readonly<{ protocol: typeof DATABASE_PROFILE_PROTOCOL; ok: false; code: DatabaseProfileFailureCode }>;

interface ValidProfileRequest {
	requirementId: string;
	projectScopeId: string;
	profileName: string;
	requestId: string;
	deadlineAt: number;
	signal: AbortSignal;
	respond: (response: DatabaseResponse) => unknown;
}

interface DatabaseGrant {
	requirement: DatabaseProfileRequirementRecord;
	capability: DynamicSecretGrantCapability;
	state: "staged" | "armed";
}

const PROFILE_REQUEST_KEYS = [
	"protocol", "consumer", "tool", "purpose", "profileRole", "contract", "requirementId",
	"projectScopeId", "profileName", "requestId", "deadlineAt", "signal", "respond",
] as const;

function parseProfileRequest(input: unknown): ValidProfileRequest {
	const descriptors = exactData(input, PROFILE_REQUEST_KEYS);
	const read = (key: string) => value(descriptors, key);
	const signal = read("signal");
	if (
		read("protocol") !== DATABASE_PROFILE_PROTOCOL || read("consumer") !== DATABASE_PROFILE_CONSUMER ||
		read("tool") !== DATABASE_QUERY_TOOL || read("purpose") !== DATABASE_PROFILE_PURPOSE ||
		read("profileRole") !== DATABASE_PROFILE_ROLE || read("contract") !== DATABASE_PROFILE_CONTRACT ||
		typeof read("requirementId") !== "string" || !DATABASE_REQUIREMENT_ID_PATTERN.test(read("requirementId") as string) ||
		typeof read("projectScopeId") !== "string" || !PROJECT_SCOPE_ID_PATTERN.test(read("projectScopeId") as string) ||
		typeof read("profileName") !== "string" || !PROFILE_NAME_PATTERN.test(read("profileName") as string) ||
		typeof read("requestId") !== "string" || !REQUEST_ID_PATTERN.test(read("requestId") as string) ||
		!Number.isSafeInteger(read("deadlineAt")) || !(signal instanceof AbortSignal) ||
		typeof read("respond") !== "function"
	) throw new Error("invalid");
	return {
		requirementId: read("requirementId") as string,
		projectScopeId: read("projectScopeId") as string,
		profileName: read("profileName") as string,
		requestId: read("requestId") as string,
		deadlineAt: read("deadlineAt") as number,
		signal,
		respond: read("respond") as (response: DatabaseResponse) => unknown,
	};
}

function failure(code: DatabaseProfileFailureCode): DatabaseResponse {
	return Object.freeze({ protocol: DATABASE_PROFILE_PROTOCOL, ok: false, code });
}

function success(value: string): DatabaseResponse {
	return Object.freeze({ protocol: DATABASE_PROFILE_PROTOCOL, ok: true, value });
}

function callback(respond: ((response: DatabaseResponse) => unknown) | undefined): (response: DatabaseResponse) => void {
	let used = false;
	return (response) => {
		if (used || respond === undefined) return;
		used = true;
		try {
			const returned = Reflect.apply(respond, undefined, [response]);
			if (returned !== undefined && returned !== null) Promise.resolve(returned).catch(() => undefined);
		} catch { /* Consumer errors may contain the profile and are discarded. */ }
	};
}

function responder(input: unknown): ((response: DatabaseResponse) => unknown) | undefined {
	if (typeof input !== "object" || input === null) return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(input, "respond");
		return descriptor && "value" in descriptor && typeof descriptor.value === "function" ? descriptor.value : undefined;
	} catch { return undefined; }
}

export class DatabaseProfileGrantProvider {
	readonly #manager: OnePasswordManager;
	readonly #requirements: DatabaseRequirementMetadataCache;
	#grants = new Map<string, DatabaseGrant>();
	#unsubscribe: (() => void) | undefined;
	#closed = false;
	#enabled = false;
	#calls = 0;
	#pending = 0;
	#seen = new Set<string>();
	readonly #maxCalls: number;
	readonly #maxPending: number;

	constructor(manager: OnePasswordManager, requirements: DatabaseRequirementMetadataCache, maxCalls = 20, maxPending = 4) {
		this.#manager = manager;
		this.#requirements = requirements;
		this.#maxCalls = maxCalls;
		this.#maxPending = maxPending;
	}

	start(bus: DatabaseEventBus): void {
		if (this.#closed || this.#unsubscribe !== undefined) return;
		this.#unsubscribe = bus.on(DATABASE_PROFILE_REQUEST_CHANNEL, (data) => this.handleRequest(data));
	}

	enable(): void { if (!this.#closed) this.#enabled = true; }

	install(requirement: DatabaseProfileRequirementRecord, capability: DynamicSecretGrantCapability): void {
		if (!this.#enabled || this.#closed || !this.#requirements.isCurrent(requirement) || !hasDynamicSecretGrant(capability)) {
			revokeDynamicSecretGrant(capability);
			throw new Error("Database profile grant could not be installed.");
		}
		this.revoke(requirement.requirementId);
		this.#grants.set(requirement.requirementId, { requirement, capability, state: "staged" });
	}

	arm(): void {
		if (!this.#enabled || this.#closed) return;
		for (const grant of this.#grants.values()) grant.state = "armed";
	}

	revoke(requirementId: string): void {
		const grant = this.#grants.get(requirementId);
		if (grant === undefined) return;
		this.#grants.delete(requirementId);
		revokeDynamicSecretGrant(grant.capability);
	}

	revokeRequirements(records: readonly DatabaseProfileRequirementRecord[]): void {
		for (const record of records) this.revoke(record.requirementId);
	}

	revokeAll(): void {
		for (const grant of this.#grants.values()) revokeDynamicSecretGrant(grant.capability);
		this.#grants.clear();
	}

	disable(): void { this.#enabled = false; this.revokeAll(); }

	shutdown(): void {
		if (this.#closed) return;
		this.disable();
		this.#closed = true;
		const unsubscribe = this.#unsubscribe;
		this.#unsubscribe = undefined;
		try { unsubscribe?.(); } catch { /* Closed state is authoritative. */ }
	}

	handleRequest(input: unknown): void {
		if (this.#closed) return;
		const fallback = callback(responder(input));
		let request: ValidProfileRequest;
		try { request = parseProfileRequest(input); }
		catch { fallback(failure("invalid_request")); return; }
		const respond = callback(request.respond);
		void this.#process(request).then(respond, () => respond(failure("unexpected")));
	}

	async #process(request: ValidProfileRequest): Promise<DatabaseResponse> {
		if (!this.#enabled || this.#closed) return failure("disabled");
		if (request.signal.aborted) return failure("aborted");
		if (request.deadlineAt <= Date.now()) return failure("deadline_exceeded");
		if (this.#seen.has(request.requestId)) return failure("duplicate_request");
		if (this.#calls >= this.#maxCalls) return failure("call_limit");
		if (this.#pending >= this.#maxPending) return failure("busy");
		const grant = this.#grants.get(request.requirementId);
		if (
			grant === undefined || grant.state !== "armed" || !this.#requirements.isCurrent(grant.requirement) ||
			grant.requirement.projectScopeId !== request.projectScopeId || grant.requirement.profileName !== request.profileName
		) return failure("binding_denied");
		const reference = consumeDynamicSecretGrant(grant.capability);
		this.#grants.delete(request.requirementId);
		if (reference === undefined) return failure("lifecycle");
		this.#seen.add(request.requestId);
		this.#calls += 1;
		this.#pending += 1;
		try {
			const remaining = Math.max(1, Math.min(30_000, request.deadlineAt - Date.now()));
			const profile = await this.#manager.resolveSecretValue(reference, request.signal, remaining);
			if (this.#closed || !this.#enabled || request.signal.aborted) return failure("lifecycle");
			return success(profile);
		} catch (error) {
			const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
			if (code === "aborted") return failure("aborted");
			if (code === "timeout") return failure("deadline_exceeded");
			if (code === "sdk") return failure("sdk_unavailable");
			if (code === "configuration") return failure("configuration");
			return failure("request_failed");
		} finally {
			this.#pending = Math.max(0, this.#pending - 1);
		}
	}

	status(): Readonly<{ enabled: boolean; grantCount: number; callsUsed: number; pending: number }> {
		return Object.freeze({ enabled: this.#enabled && !this.#closed, grantCount: this.#grants.size, callsUsed: this.#calls, pending: this.#pending });
	}
}

export function databaseGrantConfirmation(
	vault: VaultMetadata,
	selection: Readonly<{
		item: Readonly<{ title: string }>;
		field: Readonly<{ title: string; fieldType: string; section?: Readonly<{ title: string }> }>;
	}>,
	requirement: DatabaseProfileRequirementRecord,
): string {
	return [
		"Approve this exact one-shot database profile grant?",
		"",
		`Project: ${requirement.projectPath}`,
		`Project scope: ${requirement.projectScopeId}`,
		`Profile: ${requirement.profileName}`,
		`Consumer: ${requirement.consumer}`,
		`Tool: ${requirement.tool}`,
		`Purpose: ${requirement.purpose}`,
		`Profile role: ${requirement.profileRole}`,
		`Contract: ${requirement.contract}`,
		`One-shot requirement: ${requirement.requirementId}`,
		"",
		`Vault: ${vault.title}`,
		`Item: ${selection.item.title}`,
		`Field: ${selection.field.title}`,
		`Field type: ${selection.field.fieldType}`,
		...(selection.field.section ? [`Section: ${selection.field.section.title}`] : []),
		"",
		"The field value is not shown. Approval stages one exact in-memory grant that can be consumed only by database_query in a later successful tool turn.",
	].join("\n");
}
