import { Buffer } from "node:buffer";
import { createHmac, randomBytes } from "node:crypto";
import {
	type FullItemMetadata,
	MAX_METADATA_RECORDS,
	MAX_METADATA_TEXT_BYTES,
	serializeFieldMetadata,
	serializeItemMetadata,
	serializeVaultMetadata,
	type FieldMetadata,
	type ItemMetadata,
	type VaultMetadata,
} from "./metadata.ts";
import {
	type DynamicSecretGrantCapability,
	OnePasswordManager,
	revokeDynamicSecretGrant,
} from "./manager.ts";
import { dynamicGrantConfirmation } from "./presentation.ts";
import {
	type CachedRequirementRecord,
	RequirementMetadataCache,
} from "./requirements.ts";
import {
	type DynamicResolverPurpose,
	SecretResolverProvider,
} from "./resolver.ts";
import { PublicError, REQUEST_DEADLINE_MS } from "./safety.ts";

export const DYNAMIC_TOOL_NAMES = Object.freeze([
	"onepassword_list_vaults",
	"onepassword_list_items",
	"onepassword_list_fields",
	"onepassword_grant_secret",
] as const);
export const DEFAULT_METADATA_RESULT_LIMIT = 20;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const UNSAFE_INPUT_TEXT = /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u;
const VAULT_INPUT_KEYS = new Set(["query", "limit"]);
const ITEM_INPUT_KEYS = new Set(["vaultId", "query", "state", "limit"]);
const FIELD_INPUT_KEYS = new Set(["vaultId", "itemId", "query", "limit"]);
const GRANT_INPUT_KEYS = new Set(["vaultId", "itemId", "fieldId", "requirementId"]);

export type DynamicToolFailureCode =
	| "aborted"
	| "approval_denied"
	| "approval_required"
	| "busy"
	| "call_limit"
	| "configuration"
	| "deadline_exceeded"
	| "disabled"
	| "invalid_input"
	| "lifecycle"
	| "request_failed"
	| "response_rejected"
	| "sdk_unavailable"
	| "unexpected";

export interface DynamicToolResult {
	readonly content: readonly Readonly<{ type: "text"; text: string }>[];
	readonly details: Readonly<{
		ok: boolean;
		code?: DynamicToolFailureCode;
		recordCount?: number;
		grantCount?: number;
	}>;
}

export interface DynamicToolContext {
	readonly hasUI: boolean;
	readonly ui: {
		confirm(title: string, message: string, options?: { timeout?: number; signal?: AbortSignal }): Promise<boolean>;
	};
}

class DynamicFailure {
	readonly code: DynamicToolFailureCode;
	constructor(code: DynamicToolFailureCode) { this.code = code; }
}

interface ListInput {
	query?: string;
	limit: number;
}

interface ItemListInput extends ListInput {
	vaultId: string;
	state: "active" | "archived" | "all";
}

interface FieldListInput extends ListInput {
	vaultId: string;
	itemId: string;
}

interface GrantInput {
	vaultId: string;
	itemId: string;
	fieldId: string;
	requirementId: string;
}

function inputFailure(): never {
	throw new DynamicFailure("invalid_input");
}

function inputDescriptors(value: unknown, allowed: ReadonlySet<string>): Record<string, PropertyDescriptor> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) inputFailure();
	try {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) inputFailure();
		const descriptors = Object.getOwnPropertyDescriptors(value);
		for (const key of Reflect.ownKeys(descriptors)) {
			if (typeof key !== "string" || !allowed.has(key)) inputFailure();
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) inputFailure();
		}
		return descriptors;
	} catch (error) {
		if (error instanceof DynamicFailure) throw error;
		return inputFailure();
	}
}

function inputValue(descriptors: Record<string, PropertyDescriptor>, key: string): unknown {
	const descriptor = descriptors[key];
	return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function inputId(value: unknown): string {
	if (typeof value !== "string" || !ID_PATTERN.test(value)) inputFailure();
	return value;
}

function inputQuery(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	if (
		typeof value !== "string" || value.length === 0 || value.trim() !== value ||
		Buffer.byteLength(value, "utf8") > MAX_METADATA_TEXT_BYTES || UNSAFE_INPUT_TEXT.test(value)
	) inputFailure();
	return value;
}

function inputLimit(value: unknown): number {
	if (value === undefined) return DEFAULT_METADATA_RESULT_LIMIT;
	if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_METADATA_RECORDS) inputFailure();
	return value as number;
}

function parseVaultInput(value: unknown): ListInput {
	const descriptors = inputDescriptors(value, VAULT_INPUT_KEYS);
	return { query: inputQuery(inputValue(descriptors, "query")), limit: inputLimit(inputValue(descriptors, "limit")) };
}

function parseItemInput(value: unknown): ItemListInput {
	const descriptors = inputDescriptors(value, ITEM_INPUT_KEYS);
	const state = inputValue(descriptors, "state") ?? "active";
	if (state !== "active" && state !== "archived" && state !== "all") inputFailure();
	return {
		vaultId: inputId(inputValue(descriptors, "vaultId")),
		query: inputQuery(inputValue(descriptors, "query")),
		limit: inputLimit(inputValue(descriptors, "limit")),
		state,
	};
}

function parseFieldInput(value: unknown): FieldListInput {
	const descriptors = inputDescriptors(value, FIELD_INPUT_KEYS);
	return {
		vaultId: inputId(inputValue(descriptors, "vaultId")),
		itemId: inputId(inputValue(descriptors, "itemId")),
		query: inputQuery(inputValue(descriptors, "query")),
		limit: inputLimit(inputValue(descriptors, "limit")),
	};
}

function parseGrantInput(value: unknown): GrantInput {
	const descriptors = inputDescriptors(value, GRANT_INPUT_KEYS);
	const requirementId = inputValue(descriptors, "requirementId");
	if (typeof requirementId !== "string") inputFailure();
	return {
		vaultId: inputId(inputValue(descriptors, "vaultId")),
		itemId: inputId(inputValue(descriptors, "itemId")),
		fieldId: inputId(inputValue(descriptors, "fieldId")),
		requirementId,
	};
}

function signalIsAborted(signal: AbortSignal | undefined): boolean {
	if (signal === undefined) return false;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted");
		if (!descriptor || typeof descriptor.get !== "function") return true;
		return Reflect.apply(descriptor.get, signal, []) === true;
	} catch {
		return true;
	}
}

function fixedFailureCode(error: unknown): DynamicToolFailureCode {
	if (error instanceof DynamicFailure) return error.code;
	if (error instanceof PublicError) {
		switch (error.code) {
			case "aborted": return "aborted";
			case "busy": return "busy";
			case "call_limit": return "call_limit";
			case "configuration": return "configuration";
			case "invalid_input": return "invalid_input";
			case "lifecycle": return "lifecycle";
			case "request": return "request_failed";
			case "response": return "response_rejected";
			case "sdk": return "sdk_unavailable";
			case "timeout": return "deadline_exceeded";
			default: return "unexpected";
		}
	}
	return "unexpected";
}

function failureResult(error: unknown): DynamicToolResult {
	const code = fixedFailureCode(error);
	return Object.freeze({
		content: Object.freeze([{ type: "text" as const, text: `1Password dynamic request failed (${code}).` }]),
		details: Object.freeze({ ok: false, code }),
	});
}

function metadataResult(text: string, recordCount: number): DynamicToolResult {
	return Object.freeze({
		content: Object.freeze([{ type: "text" as const, text }]),
		details: Object.freeze({ ok: true, recordCount }),
	});
}

function grantResult(grantCount: number): DynamicToolResult {
	return Object.freeze({
		content: Object.freeze([{
			type: "text" as const,
			text: "One-shot MCP Toolbox grant approved. It becomes available after this tool turn; wait for this result, then call MCP Toolbox in a later turn. Any admitted matching resolver request consumes it, including on downstream failure.",
		}]),
		details: Object.freeze({ ok: true, grantCount }),
	});
}

function matchesQuery(title: string, query: string | undefined): boolean {
	if (query === undefined) return true;
	return title.toLowerCase().includes(query.toLowerCase());
}

function selectVaults(records: readonly VaultMetadata[], query: string | undefined, limit: number): readonly VaultMetadata[] {
	const result: VaultMetadata[] = [];
	for (const record of records) {
		if (matchesQuery(record.title, query)) result.push(record);
		if (result.length >= limit) break;
	}
	return Object.freeze(result);
}

function selectItems(records: readonly ItemMetadata[], query: string | undefined, limit: number): readonly ItemMetadata[] {
	const result: ItemMetadata[] = [];
	for (const record of records) {
		if (matchesQuery(record.title, query)) result.push(record);
		if (result.length >= limit) break;
	}
	return Object.freeze(result);
}

function selectFields(records: readonly FieldMetadata[], query: string | undefined, limit: number): readonly FieldMetadata[] {
	const result: FieldMetadata[] = [];
	for (const record of records) {
		if (matchesQuery(record.title, query)) result.push(record);
		if (result.length >= limit) break;
	}
	return Object.freeze(result);
}

interface ItemSelection {
	readonly vaultHandle: string;
	readonly item: ItemMetadata;
}

interface FieldSelection {
	readonly vaultHandle: string;
	readonly itemHandle: string;
	readonly field: FieldMetadata;
}

function grantKey(requirementId: string, purpose: DynamicResolverPurpose): string {
	return `${requirementId}\u0000${purpose}`;
}

export class DynamicSelectionSession {
	readonly #manager: OnePasswordManager;
	readonly #resolver: SecretResolverProvider;
	readonly #requirements: RequirementMetadataCache;
	#epoch = 0;
	#handleKey = randomBytes(32);
	#vaults = new Map<string, VaultMetadata>();
	#items = new Map<string, ItemSelection>();
	#fields = new Map<string, FieldSelection>();
	#reservations = new Map<string, object>();
	#approvalControllers = new Map<AbortController, string>();

	constructor(
		manager: OnePasswordManager,
		resolver: SecretResolverProvider,
		requirements: RequirementMetadataCache,
	) {
		this.#manager = manager;
		this.#resolver = resolver;
		this.#requirements = requirements;
	}

	reset(): void {
		this.#epoch += 1;
		for (const controller of this.#approvalControllers.keys()) {
			try { Reflect.apply(AbortController.prototype.abort, controller, ["dynamic-session-reset"]); } catch { /* Inert after epoch change. */ }
		}
		this.#approvalControllers.clear();
		this.#vaults.clear();
		this.#items.clear();
		this.#fields.clear();
		this.#handleKey.fill(0);
		this.#handleKey = randomBytes(32);
		this.#reservations.clear();
	}

	invalidateRequirements(records: readonly CachedRequirementRecord[]): void {
		const staleIds = new Set(records.map((record) => record.requirementId));
		for (const [controller, requirementId] of this.#approvalControllers) {
			if (!staleIds.has(requirementId)) continue;
			try { Reflect.apply(AbortController.prototype.abort, controller, ["mcp-requirement-invalidated"]); } catch { /* Cache identity remains authoritative. */ }
			this.#approvalControllers.delete(controller);
		}
		for (const record of records) this.#reservations.delete(grantKey(record.requirementId, record.purpose));
	}

	async listVaults(input: unknown, signal?: AbortSignal): Promise<DynamicToolResult> {
		try {
			const parsed = parseVaultInput(input);
			const epoch = this.#start(signal);
			const records = await this.#manager.listVaultMetadata(signal);
			this.#assertCurrent(epoch, signal);
			const selected = selectVaults(records, parsed.query, parsed.limit);
			const display: VaultMetadata[] = [];
			for (const vault of selected) {
				const handle = this.#handle("opv", vault.id);
				this.#vaults.set(handle, vault);
				display.push(Object.freeze({ ...vault, id: handle }));
			}
			return metadataResult(serializeVaultMetadata(Object.freeze(display)), selected.length);
		} catch (error) {
			return failureResult(error);
		}
	}

	async listItems(input: unknown, signal?: AbortSignal): Promise<DynamicToolResult> {
		try {
			const parsed = parseItemInput(input);
			const epoch = this.#start(signal);
			const vault = this.#vaults.get(parsed.vaultId);
			if (vault === undefined) throw new DynamicFailure("invalid_input");
			const records = await this.#manager.listItemMetadata(vault.id, parsed.state, signal);
			this.#assertCurrent(epoch, signal);
			const selected = selectItems(records, parsed.query, parsed.limit);
			const display: ItemMetadata[] = [];
			for (const item of selected) {
				const handle = this.#handle("opi", vault.id, item.id);
				this.#items.set(handle, Object.freeze({ vaultHandle: parsed.vaultId, item }));
				display.push(Object.freeze({ ...item, id: handle, vaultId: parsed.vaultId }));
			}
			return metadataResult(serializeItemMetadata(Object.freeze(display)), selected.length);
		} catch (error) {
			return failureResult(error);
		}
	}

	async listFields(input: unknown, signal?: AbortSignal): Promise<DynamicToolResult> {
		try {
			const parsed = parseFieldInput(input);
			const epoch = this.#start(signal);
			const vault = this.#vaults.get(parsed.vaultId);
			const knownItem = this.#items.get(parsed.itemId);
			if (vault === undefined || knownItem === undefined || knownItem.vaultHandle !== parsed.vaultId) {
				throw new DynamicFailure("invalid_input");
			}
			const item = await this.#manager.getItemFieldMetadata(vault.id, knownItem.item.id, signal);
			this.#assertCurrent(epoch, signal);
			const selected = selectFields(item.fields, parsed.query, parsed.limit);
			const displayFields: FieldMetadata[] = [];
			for (const field of selected) {
				const handle = this.#handle("opf", vault.id, item.id, field.id);
				this.#fields.set(handle, Object.freeze({
					vaultHandle: parsed.vaultId,
					itemHandle: parsed.itemId,
					field,
				}));
				displayFields.push(Object.freeze({
					...field,
					id: handle,
					...(field.section === undefined ? {} : {
						section: Object.freeze({
							...field.section,
							id: this.#handle("ops", vault.id, item.id, field.section.id),
						}),
					}),
				}));
			}
			const displayItem: FullItemMetadata = Object.freeze({
				...item,
				id: parsed.itemId,
				vaultId: parsed.vaultId,
				fields: Object.freeze(displayFields),
			});
			return metadataResult(serializeFieldMetadata(displayItem, displayItem.fields), selected.length);
		} catch (error) {
			return failureResult(error);
		}
	}

	async grantSecret(
		input: unknown,
		signal: AbortSignal | undefined,
		context: DynamicToolContext,
	): Promise<DynamicToolResult> {
		let capability: DynamicSecretGrantCapability | undefined;
		let installed = false;
		let reservationKey: string | undefined;
		let reservation: object | undefined;
		let approvalController: AbortController | undefined;
		let externalAbort: (() => void) | undefined;
		try {
			const parsed = parseGrantInput(input);
			const epoch = this.#start(signal);
			const requirement = this.#requirements.lookup(parsed.requirementId);
			if (requirement === undefined) throw new DynamicFailure("invalid_input");
			const vault = this.#vaults.get(parsed.vaultId);
			const item = this.#items.get(parsed.itemId);
			const field = this.#fields.get(parsed.fieldId);
			if (
				vault === undefined || item === undefined || field === undefined ||
				item.vaultHandle !== parsed.vaultId || field.vaultHandle !== parsed.vaultId ||
				field.itemHandle !== parsed.itemId
			) throw new DynamicFailure("invalid_input");
			if (!context.hasUI) throw new DynamicFailure("approval_required");
			reservationKey = grantKey(requirement.requirementId, requirement.purpose);
			if (this.#reservations.has(reservationKey)) throw new DynamicFailure("busy");
			reservation = Object.freeze({});
			this.#reservations.set(reservationKey, reservation);
			this.#resolver.revokeDynamicGrant(requirement.requirementId, requirement.purpose);

			const selection = await this.#manager.verifyDynamicFieldSelection(
				vault.id,
				item.item.id,
				field.field.id,
				signal,
			);
			this.#assertReservation(epoch, signal, reservationKey, reservation, requirement);
			approvalController = new AbortController();
			this.#approvalControllers.set(approvalController, requirement.requirementId);
			externalAbort = () => {
				try { Reflect.apply(AbortController.prototype.abort, approvalController, ["tool-cancelled"]); } catch { /* Fixed denial. */ }
			};
			if (signal !== undefined) {
				try { EventTarget.prototype.addEventListener.call(signal, "abort", externalAbort, { once: true }); } catch { externalAbort(); }
			}
			let approved = false;
			try {
				approved = await context.ui.confirm(
					"Approve one-shot 1Password grant",
					dynamicGrantConfirmation(vault, selection, requirement),
					{ timeout: REQUEST_DEADLINE_MS, signal: approvalController.signal },
				);
			} catch {
				approved = false;
			}
			this.#assertReservation(epoch, signal, reservationKey, reservation, requirement);
			if (!approved) throw new DynamicFailure("approval_denied");
			capability = await this.#manager.createDynamicSecretGrant(selection, signal);
			this.#assertReservation(epoch, signal, reservationKey, reservation, requirement);
			this.#resolver.installDynamicGrant(requirement.requirementId, requirement.purpose, capability);
			installed = true;
			return grantResult(this.#resolver.status().grantCount);
		} catch (error) {
			return failureResult(error);
		} finally {
			if (externalAbort !== undefined && signal !== undefined) {
				try { EventTarget.prototype.removeEventListener.call(signal, "abort", externalAbort); } catch { /* Fixed result. */ }
			}
			if (approvalController !== undefined) this.#approvalControllers.delete(approvalController);
			if (!installed && capability !== undefined) revokeDynamicSecretGrant(capability);
			if (
				reservationKey !== undefined && reservation !== undefined &&
				this.#reservations.get(reservationKey) === reservation
			) this.#reservations.delete(reservationKey);
		}
	}

	#handle(prefix: "opv" | "opi" | "opf" | "ops", ...parts: string[]): string {
		const digest = createHmac("sha256", this.#handleKey);
		for (const part of parts) {
			const bytes = Buffer.from(part, "utf8");
			const length = Buffer.allocUnsafe(4);
			length.writeUInt32BE(bytes.length);
			digest.update(length);
			digest.update(bytes);
		}
		return `${prefix}_${digest.digest("base64url")}`;
	}

	#start(signal: AbortSignal | undefined): number {
		if (this.#resolver.status().mode !== "dynamic") throw new DynamicFailure("disabled");
		if (signalIsAborted(signal)) throw new DynamicFailure("aborted");
		return this.#epoch;
	}

	#assertCurrent(epoch: number, signal: AbortSignal | undefined): void {
		if (signalIsAborted(signal)) throw new DynamicFailure("aborted");
		if (epoch !== this.#epoch || this.#resolver.status().mode !== "dynamic") {
			throw new DynamicFailure("lifecycle");
		}
	}

	#assertReservation(
		epoch: number,
		signal: AbortSignal | undefined,
		key: string,
		reservation: object,
		requirement: CachedRequirementRecord,
	): void {
		this.#assertCurrent(epoch, signal);
		if (
			this.#reservations.get(key) !== reservation ||
			!this.#requirements.isCurrent(requirement)
		) throw new DynamicFailure("lifecycle");
	}
}
