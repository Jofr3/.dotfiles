import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const MCP_TOOLBOX_REQUIREMENTS_PROTOCOL_VERSION = 1 as const;
export const MCP_TOOLBOX_REQUIREMENTS_PROTOCOL = "pi.mcp-toolbox.requirements/v1" as const;
export const MCP_TOOLBOX_REQUIREMENTS_CHANNEL = "pi:mcp-toolbox:requirements:v1" as const;
export const MAX_REQUIREMENTS_PER_EVENT = 20;
export const MAX_REQUIREMENT_METADATA_BYTES = 16 * 1024;
export const MAX_CACHED_REQUIREMENT_SCOPES = 256;
export const MAX_CACHED_REQUIREMENTS = MAX_CACHED_REQUIREMENT_SCOPES * MAX_REQUIREMENTS_PER_EVENT;

const REQUIREMENT_DOMAIN = Buffer.from("pi.mcp-toolbox.requirement-id\0", "ascii");
const REQUIREMENT_VERSION = "1";
const SERVER_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
const REMOTE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,64}$/u;
const FORBIDDEN_HEADERS = new Set([
	"connection",
	"content-length",
	"cookie",
	"forwarded",
	"host",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"set-cookie",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"x-forwarded-for",
	"x-forwarded-host",
	"x-forwarded-port",
	"x-forwarded-proto",
	"x-real-ip",
]);
export const DYNAMIC_REQUIREMENT_ID_PATTERN = /^mcp1-(H|A|B)-[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

export type RequirementTargetKind = "header" | "auth-token" | "bound-param";
export type RequirementPurpose =
	| "mcp-toolbox.header"
	| "mcp-toolbox.auth-token"
	| "mcp-toolbox.bound-param";

const REQUIREMENT_KIND_FIELDS: Readonly<Record<RequirementTargetKind, Readonly<{
	marker: "H" | "A" | "B";
	purpose: RequirementPurpose;
}>>> = Object.freeze({
	header: Object.freeze({ marker: "H", purpose: "mcp-toolbox.header" }),
	"auth-token": Object.freeze({ marker: "A", purpose: "mcp-toolbox.auth-token" }),
	"bound-param": Object.freeze({ marker: "B", purpose: "mcp-toolbox.bound-param" }),
});

const MARKER_KIND = new Map<string, RequirementTargetKind>([
	["H", "header"],
	["A", "auth-token"],
	["B", "bound-param"],
]);
const KIND_RANK: Readonly<Record<RequirementTargetKind, number>> = Object.freeze({
	header: 0,
	"auth-token": 1,
	"bound-param": 2,
});

const INVALIDATE_EVENT_KEYS = Object.freeze(["protocol", "action"] as const);
const REPLACE_EVENT_KEYS = Object.freeze(["protocol", "action", "server", "tool", "requirements"] as const);
const REQUIREMENT_RECORD_KEYS = Object.freeze(["requirementId", "targetKind", "targetName", "purpose"] as const);

export interface ParsedDynamicRequirementId {
	readonly targetKind: RequirementTargetKind;
	readonly purpose: RequirementPurpose;
}

export interface CachedRequirementRecord {
	readonly requirementId: string;
	readonly server: string;
	readonly tool: string;
	readonly targetKind: RequirementTargetKind;
	readonly targetName: string;
	readonly purpose: RequirementPurpose;
}

export interface RequirementEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
}

export interface RequirementCacheStatus {
	readonly enabled: boolean;
	readonly scopeCount: number;
	readonly requirementCount: number;
}

export type RequirementInvalidationHandler = (
	records: readonly CachedRequirementRecord[],
) => void;

type ParsedRequirementEvent =
	| Readonly<{ action: "invalidate" }>
	| Readonly<{
		action: "replace";
		server: string;
		tool: string;
		requirements: readonly CachedRequirementRecord[];
	}>;

class RequirementAdmissionError extends Error {}

function admissionFailure(): never {
	throw new RequirementAdmissionError();
}

function exactFrozenObjectDescriptors(
	value: unknown,
	keys: readonly string[],
): Record<string, PropertyDescriptor> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) admissionFailure();
	try {
		if (!Object.isFrozen(value)) admissionFailure();
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype) admissionFailure();
		const descriptors = Object.getOwnPropertyDescriptors(value);
		const ownKeys = Reflect.ownKeys(descriptors);
		if (ownKeys.length !== keys.length) admissionFailure();
		const allowed = new Set(keys);
		for (const key of ownKeys) {
			if (typeof key !== "string" || !allowed.has(key)) admissionFailure();
			const descriptor = descriptors[key];
			if (
				!descriptor || !("value" in descriptor) || !descriptor.enumerable ||
				descriptor.configurable !== false || descriptor.writable !== false
			) admissionFailure();
		}
		for (const key of keys) {
			if (!Object.hasOwn(descriptors, key)) admissionFailure();
		}
		return descriptors;
	} catch (error) {
		if (error instanceof RequirementAdmissionError) throw error;
		return admissionFailure();
	}
}

function descriptorValue(descriptors: Record<string, PropertyDescriptor>, key: string): unknown {
	const descriptor = descriptors[key];
	return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function exactFrozenDenseArray(value: unknown): readonly unknown[] {
	if (!Array.isArray(value)) admissionFailure();
	try {
		if (!Object.isFrozen(value) || Object.getPrototypeOf(value) !== Array.prototype) admissionFailure();
		const descriptors = Object.getOwnPropertyDescriptors(value);
		const lengthDescriptor = descriptors.length;
		if (
			!lengthDescriptor || !("value" in lengthDescriptor) ||
			!Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
			lengthDescriptor.value > MAX_REQUIREMENTS_PER_EVENT || lengthDescriptor.enumerable ||
			lengthDescriptor.configurable !== false || lengthDescriptor.writable !== false
		) admissionFailure();
		const length = lengthDescriptor.value as number;
		const ownKeys = Reflect.ownKeys(descriptors);
		if (ownKeys.length !== length + 1) admissionFailure();
		for (let index = 0; index < length; index += 1) {
			const descriptor = descriptors[String(index)];
			if (
				!descriptor || !("value" in descriptor) || !descriptor.enumerable ||
				descriptor.configurable !== false || descriptor.writable !== false
			) admissionFailure();
		}
		for (const key of ownKeys) {
			if (key === "length") continue;
			if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)) admissionFailure();
			const index = Number(key);
			if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) admissionFailure();
		}
		const detached: unknown[] = [];
		for (let index = 0; index < length; index += 1) {
			const descriptor = descriptors[String(index)]!;
			detached.push("value" in descriptor ? descriptor.value : admissionFailure());
		}
		return Object.freeze(detached);
	} catch (error) {
		if (error instanceof RequirementAdmissionError) throw error;
		return admissionFailure();
	}
}

export function parseDynamicRequirementId(value: unknown): ParsedDynamicRequirementId | undefined {
	if (typeof value !== "string" || value.length !== 50 || !DYNAMIC_REQUIREMENT_ID_PATTERN.test(value)) {
		return undefined;
	}
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
	return Object.freeze({ targetKind, purpose: REQUIREMENT_KIND_FIELDS[targetKind].purpose });
}

function frameRequirementField(value: string): Buffer {
	const bytes = Buffer.from(value, "utf8");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(bytes.byteLength, 0);
	return Buffer.concat([length, bytes]);
}

function expectedRequirementId(
	server: string,
	tool: string,
	targetKind: RequirementTargetKind,
	targetName: string,
): string {
	const suffix = createHash("sha256").update(Buffer.concat([
		REQUIREMENT_DOMAIN,
		frameRequirementField(REQUIREMENT_VERSION),
		frameRequirementField(server),
		frameRequirementField(tool),
		frameRequirementField(targetKind),
		frameRequirementField(targetName),
	])).digest("base64url");
	return `mcp1-${REQUIREMENT_KIND_FIELDS[targetKind].marker}-${suffix}`;
}

function safeHeaderTarget(value: string): boolean {
	if (!HEADER_NAME_PATTERN.test(value)) return false;
	const lower = value.toLowerCase();
	return !FORBIDDEN_HEADERS.has(lower) && !lower.startsWith("proxy-") && !lower.startsWith("sec-");
}

function parseRequirementRecord(
	value: unknown,
	server: string,
	tool: string,
): CachedRequirementRecord {
	const descriptors = exactFrozenObjectDescriptors(value, REQUIREMENT_RECORD_KEYS);
	const requirementId = descriptorValue(descriptors, "requirementId");
	const targetKind = descriptorValue(descriptors, "targetKind");
	const targetName = descriptorValue(descriptors, "targetName");
	const purpose = descriptorValue(descriptors, "purpose");
	const parsedId = parseDynamicRequirementId(requirementId);
	if (
		!parsedId || typeof targetKind !== "string" || !Object.hasOwn(REQUIREMENT_KIND_FIELDS, targetKind) ||
		parsedId.targetKind !== targetKind || parsedId.purpose !== purpose ||
		typeof targetName !== "string" ||
		!(targetKind === "header" ? safeHeaderTarget(targetName) : REMOTE_NAME_PATTERN.test(targetName)) ||
		requirementId !== expectedRequirementId(
			server,
			tool,
			targetKind as RequirementTargetKind,
			targetName,
		)
	) admissionFailure();
	return Object.freeze({
		requirementId: requirementId as string,
		server,
		tool,
		targetKind: targetKind as RequirementTargetKind,
		targetName,
		purpose: purpose as RequirementPurpose,
	});
}

function metadataByteSize(
	server: string,
	tool: string,
	requirements: readonly CachedRequirementRecord[],
): number {
	let bytes = Buffer.byteLength(MCP_TOOLBOX_REQUIREMENTS_PROTOCOL, "utf8") +
		Buffer.byteLength(server, "utf8") + Buffer.byteLength(tool, "utf8") + 128;
	for (const record of requirements) {
		bytes += Buffer.byteLength(record.requirementId, "utf8") +
			Buffer.byteLength(record.targetKind, "utf8") +
			Buffer.byteLength(record.targetName, "utf8") +
			Buffer.byteLength(record.purpose, "utf8") + 128;
	}
	return bytes;
}

function parseRequirementEvent(value: unknown): ParsedRequirementEvent {
	if (typeof value !== "object" || value === null || Array.isArray(value)) admissionFailure();
	let preliminary: Record<string, PropertyDescriptor>;
	try {
		if (!Object.isFrozen(value)) admissionFailure();
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype) admissionFailure();
		preliminary = Object.getOwnPropertyDescriptors(value);
		for (const key of Reflect.ownKeys(preliminary)) {
			if (typeof key !== "string") admissionFailure();
			const descriptor = preliminary[key];
			if (
				!descriptor || !("value" in descriptor) || !descriptor.enumerable ||
				descriptor.configurable !== false || descriptor.writable !== false
			) admissionFailure();
		}
	} catch (error) {
		if (error instanceof RequirementAdmissionError) throw error;
		return admissionFailure();
	}
	const action = descriptorValue(preliminary!, "action");
	if (action === "invalidate") {
		const descriptors = exactFrozenObjectDescriptors(value, INVALIDATE_EVENT_KEYS);
		if (descriptorValue(descriptors, "protocol") !== MCP_TOOLBOX_REQUIREMENTS_PROTOCOL) admissionFailure();
		return Object.freeze({ action: "invalidate" as const });
	}
	if (action !== "replace") admissionFailure();
	const descriptors = exactFrozenObjectDescriptors(value, REPLACE_EVENT_KEYS);
	if (descriptorValue(descriptors, "protocol") !== MCP_TOOLBOX_REQUIREMENTS_PROTOCOL) admissionFailure();
	const server = descriptorValue(descriptors, "server");
	const tool = descriptorValue(descriptors, "tool");
	if (
		typeof server !== "string" || !SERVER_ID_PATTERN.test(server) ||
		typeof tool !== "string" || !REMOTE_NAME_PATTERN.test(tool)
	) admissionFailure();
	const rawRequirements = exactFrozenDenseArray(descriptorValue(descriptors, "requirements"));
	const requirements: CachedRequirementRecord[] = [];
	const ids = new Set<string>();
	const targets = new Set<string>();
	let previous: CachedRequirementRecord | undefined;
	for (let index = 0; index < rawRequirements.length; index += 1) {
		const record = parseRequirementRecord(rawRequirements[index], server, tool);
		const target = `${record.targetKind}\u0000${record.targetName}`;
		if (ids.has(record.requirementId) || targets.has(target)) admissionFailure();
		if (previous !== undefined) {
			const rankDifference = KIND_RANK[previous.targetKind] - KIND_RANK[record.targetKind];
			if (
				rankDifference > 0 ||
				(rankDifference === 0 && previous.targetName >= record.targetName)
			) admissionFailure();
		}
		ids.add(record.requirementId);
		targets.add(target);
		requirements.push(record);
		previous = record;
	}
	if (metadataByteSize(server, tool, requirements) > MAX_REQUIREMENT_METADATA_BYTES) admissionFailure();
	return Object.freeze({
		action: "replace" as const,
		server,
		tool,
		requirements: Object.freeze(requirements),
	});
}

function scopeKey(server: string, tool: string): string {
	return `${server}\u0000${tool}`;
}

export class RequirementMetadataCache {
	readonly #onInvalidated: RequirementInvalidationHandler | undefined;
	readonly #isDynamicMode: () => boolean;
	#enabled = false;
	#closed = false;
	#unsubscribe: (() => void) | undefined;
	#records = new Map<string, CachedRequirementRecord>();
	#scopes = new Map<string, ReadonlyMap<string, CachedRequirementRecord>>();

	constructor(
		onInvalidated?: RequirementInvalidationHandler,
		isDynamicMode: () => boolean = () => true,
	) {
		this.#onInvalidated = onInvalidated;
		this.#isDynamicMode = isDynamicMode;
	}

	start(bus: RequirementEventBus): void {
		if (this.#closed || this.#unsubscribe !== undefined) throw new Error("Requirement metadata listener is unavailable");
		if ((typeof bus !== "object" && typeof bus !== "function") || bus === null) {
			throw new Error("Requirement metadata event bus is unavailable");
		}
		let unsubscribe: unknown;
		try {
			unsubscribe = bus.on(MCP_TOOLBOX_REQUIREMENTS_CHANNEL, (data: unknown) => { this.handleEvent(data); });
		} catch {
			throw new Error("Requirement metadata listener could not be registered");
		}
		if (typeof unsubscribe !== "function") throw new Error("Requirement metadata listener could not be registered");
		this.#unsubscribe = unsubscribe;
	}

	enable(): void {
		if (this.#closed || !this.#dynamicModeIsActive()) {
			throw new Error("Requirement metadata listener is closed or dynamic mode is disabled");
		}
		this.#clear();
		this.#enabled = true;
	}

	disable(): void {
		this.#enabled = false;
		this.#clear();
	}

	shutdown(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.#enabled = false;
		this.#clear();
		const unsubscribe = this.#unsubscribe;
		this.#unsubscribe = undefined;
		try { unsubscribe?.(); } catch { /* The closed guard leaves a stale listener inert. */ }
	}

	status(): RequirementCacheStatus {
		return Object.freeze({
			enabled: this.#enabled && !this.#closed && this.#dynamicModeIsActive(),
			scopeCount: this.#scopes.size,
			requirementCount: this.#records.size,
		});
	}

	lookup(requirementId: unknown): CachedRequirementRecord | undefined {
		if (!this.#enabled || this.#closed || !this.#dynamicModeIsActive() || !parseDynamicRequirementId(requirementId)) {
			return undefined;
		}
		return this.#records.get(requirementId as string);
	}

	isCurrent(record: CachedRequirementRecord): boolean {
		return this.#enabled && !this.#closed && this.#dynamicModeIsActive() &&
			this.#records.get(record.requirementId) === record;
	}

	handleEvent(value: unknown): boolean {
		if (!this.#enabled || this.#closed || !this.#dynamicModeIsActive()) return false;
		let event: ParsedRequirementEvent;
		try {
			event = parseRequirementEvent(value);
		} catch {
			return false;
		}
		if (event.action === "invalidate") {
			this.#clear();
			return true;
		}
		const key = scopeKey(event.server, event.tool);
		const previous = this.#scopes.get(key);
		if (previous === undefined && event.requirements.length > 0 && this.#scopes.size >= MAX_CACHED_REQUIREMENT_SCOPES) {
			return false;
		}
		const nextCount = this.#records.size - (previous?.size ?? 0) + event.requirements.length;
		if (nextCount > MAX_CACHED_REQUIREMENTS) return false;
		for (const record of event.requirements) {
			const existing = this.#records.get(record.requirementId);
			if (existing !== undefined && previous?.get(record.requirementId) !== existing) return false;
		}
		const invalidated = previous === undefined ? [] : Object.freeze([...previous.values()]);
		if (previous !== undefined) {
			for (const requirementId of previous.keys()) this.#records.delete(requirementId);
			this.#scopes.delete(key);
		}
		if (event.requirements.length > 0) {
			const replacement = new Map<string, CachedRequirementRecord>();
			for (const record of event.requirements) {
				replacement.set(record.requirementId, record);
				this.#records.set(record.requirementId, record);
			}
			this.#scopes.set(key, replacement);
		}
		this.#notifyInvalidated(invalidated);
		return true;
	}

	#dynamicModeIsActive(): boolean {
		try { return this.#isDynamicMode() === true; } catch { return false; }
	}

	#clear(): void {
		if (this.#records.size === 0) {
			this.#scopes.clear();
			return;
		}
		const invalidated = Object.freeze([...this.#records.values()]);
		this.#records.clear();
		this.#scopes.clear();
		this.#notifyInvalidated(invalidated);
	}

	#notifyInvalidated(records: readonly CachedRequirementRecord[]): void {
		if (records.length === 0 || this.#onInvalidated === undefined) return;
		try { this.#onInvalidated(records); } catch { /* Cache invalidation remains authoritative. */ }
	}
}
