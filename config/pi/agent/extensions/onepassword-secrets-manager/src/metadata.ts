import { Buffer } from "node:buffer";
import { PublicError } from "./safety.ts";

export const MAX_METADATA_RECORDS = 50;
export const MAX_METADATA_RAW_RECORDS = 1_000;
export const MAX_METADATA_TEXT_BYTES = 256;
export const MAX_METADATA_ID_BYTES = 128;
export const MAX_METADATA_OUTPUT_BYTES = 32 * 1024;
export const MAX_METADATA_OUTPUT_LINES = 500;

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const UNSAFE_METADATA_TEXT = /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u;

const VAULT_TYPES = new Set(["personal", "everyone", "transfer", "userCreated", "unsupported"]);
const ITEM_CATEGORIES = new Set([
	"Login",
	"SecureNote",
	"CreditCard",
	"CryptoWallet",
	"Identity",
	"Password",
	"Document",
	"ApiCredentials",
	"BankAccount",
	"Database",
	"DriverLicense",
	"Email",
	"MedicalRecord",
	"Membership",
	"OutdoorLicense",
	"Passport",
	"Rewards",
	"Router",
	"Server",
	"SshKey",
	"SocialSecurityNumber",
	"SoftwareLicense",
	"Person",
	"Unsupported",
]);
const ITEM_STATES = new Set(["active", "archived"]);
const FIELD_TYPES = new Set([
	"Text",
	"Concealed",
	"CreditCardType",
	"CreditCardNumber",
	"Phone",
	"Url",
	"Totp",
	"Email",
	"Reference",
	"SshKey",
	"Menu",
	"MonthYear",
	"Address",
	"Date",
	"Unsupported",
]);

const VAULT_KEYS = new Set([
	"id",
	"title",
	"description",
	"vaultType",
	"activeItemCount",
	"contentVersion",
	"attributeVersion",
	"createdAt",
	"updatedAt",
]);
const ITEM_OVERVIEW_KEYS = new Set([
	"id",
	"title",
	"category",
	"vaultId",
	"websites",
	"tags",
	"createdAt",
	"updatedAt",
	"state",
]);
const FULL_ITEM_KEYS = new Set([
	"id",
	"title",
	"category",
	"vaultId",
	"fields",
	"sections",
	"notes",
	"tags",
	"websites",
	"version",
	"files",
	"document",
	"createdAt",
	"updatedAt",
]);
const FIELD_KEYS = new Set(["id", "title", "sectionId", "fieldType", "value", "details"]);
const SECTION_KEYS = new Set(["id", "title"]);

const VAULT_REQUIRED = [
	"id",
	"title",
	"description",
	"vaultType",
	"activeItemCount",
	"contentVersion",
	"attributeVersion",
	"createdAt",
	"updatedAt",
] as const;
const ITEM_OVERVIEW_REQUIRED = [
	"id",
	"title",
	"category",
	"vaultId",
	"websites",
	"tags",
	"createdAt",
	"updatedAt",
	"state",
] as const;
const FULL_ITEM_REQUIRED = [
	"id",
	"title",
	"category",
	"vaultId",
	"fields",
	"sections",
	"notes",
	"tags",
	"websites",
	"version",
	"files",
	"createdAt",
	"updatedAt",
] as const;
const FIELD_REQUIRED = ["id", "title", "fieldType", "value"] as const;
const SECTION_REQUIRED = ["id", "title"] as const;

export interface VaultMetadata {
	readonly id: string;
	readonly title: string;
	readonly vaultType: string;
	readonly activeItemCount: number;
}

export interface ItemMetadata {
	readonly id: string;
	readonly title: string;
	readonly category: string;
	readonly state: "active" | "archived";
}

export interface SectionMetadata {
	readonly id: string;
	readonly title: string;
}

export interface FieldMetadata {
	readonly id: string;
	readonly title: string;
	readonly fieldType: string;
	readonly section?: SectionMetadata;
}

export interface FullItemMetadata {
	readonly id: string;
	readonly vaultId: string;
	readonly title: string;
	readonly category: string;
	readonly fields: readonly FieldMetadata[];
}

function responseFailure(): never {
	throw new PublicError("response");
}

function recordDescriptors(
	value: unknown,
	allowed: ReadonlySet<string>,
	required: readonly string[],
): Record<string, PropertyDescriptor> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) responseFailure();
	try {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) responseFailure();
		const descriptors = Object.getOwnPropertyDescriptors(value);
		for (const key of Reflect.ownKeys(descriptors)) {
			if (typeof key !== "string" || !allowed.has(key)) responseFailure();
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) responseFailure();
		}
		for (const key of required) {
			if (!Object.hasOwn(descriptors, key)) responseFailure();
		}
		return descriptors;
	} catch (error) {
		if (error instanceof PublicError) throw error;
		return responseFailure();
	}
}

function selectedValue(descriptors: Record<string, PropertyDescriptor>, key: string): unknown {
	const descriptor = descriptors[key];
	if (!descriptor || !("value" in descriptor)) responseFailure();
	return descriptor.value;
}

function denseArrayValues(value: unknown, maximum = MAX_METADATA_RAW_RECORDS): readonly unknown[] {
	if (!Array.isArray(value)) responseFailure();
	try {
		if (Object.getPrototypeOf(value) !== Array.prototype) responseFailure();
		const keys = Reflect.ownKeys(value);
		const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
		if (
			!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable ||
			!Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
			lengthDescriptor.value > maximum || keys.length !== lengthDescriptor.value + 1
		) responseFailure();
		const length = lengthDescriptor.value as number;
		const values: unknown[] = [];
		for (let index = 0; index < length; index += 1) {
			const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) responseFailure();
			values.push(descriptor.value);
		}
		for (const key of keys) {
			if (typeof key !== "string") responseFailure();
			if (key === "length") continue;
			if (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length) responseFailure();
		}
		return values;
	} catch (error) {
		if (error instanceof PublicError) throw error;
		return responseFailure();
	}
}

export function safeMetadataId(value: unknown): string {
	if (
		typeof value !== "string" || !SAFE_ID_PATTERN.test(value) ||
		Buffer.byteLength(value, "utf8") > MAX_METADATA_ID_BYTES
	) responseFailure();
	return value;
}

export function safeMetadataText(value: unknown): string {
	if (
		typeof value !== "string" || value.trim() !== value ||
		Buffer.byteLength(value, "utf8") > MAX_METADATA_TEXT_BYTES ||
		UNSAFE_METADATA_TEXT.test(value)
	) responseFailure();
	return value;
}

function safeEnum(value: unknown, allowed: ReadonlySet<string>): string {
	if (typeof value !== "string" || !allowed.has(value)) responseFailure();
	return value;
}

function safeCount(value: unknown): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) responseFailure();
	return value as number;
}

function mapVault(value: unknown): VaultMetadata {
	const descriptors = recordDescriptors(value, VAULT_KEYS, VAULT_REQUIRED);
	return Object.freeze({
		id: safeMetadataId(selectedValue(descriptors, "id")),
		title: safeMetadataText(selectedValue(descriptors, "title")),
		vaultType: safeEnum(selectedValue(descriptors, "vaultType"), VAULT_TYPES),
		activeItemCount: safeCount(selectedValue(descriptors, "activeItemCount")),
	});
}

function mapItemOverview(value: unknown, expectedVaultId: string): ItemMetadata {
	const descriptors = recordDescriptors(value, ITEM_OVERVIEW_KEYS, ITEM_OVERVIEW_REQUIRED);
	const vaultId = safeMetadataId(selectedValue(descriptors, "vaultId"));
	if (vaultId !== expectedVaultId) responseFailure();
	const state = safeEnum(selectedValue(descriptors, "state"), ITEM_STATES);
	return Object.freeze({
		id: safeMetadataId(selectedValue(descriptors, "id")),
		title: safeMetadataText(selectedValue(descriptors, "title")),
		category: safeEnum(selectedValue(descriptors, "category"), ITEM_CATEGORIES),
		state: state as "active" | "archived",
	});
}

function mapSection(value: unknown): SectionMetadata {
	const descriptors = recordDescriptors(value, SECTION_KEYS, SECTION_REQUIRED);
	return Object.freeze({
		id: safeMetadataId(selectedValue(descriptors, "id")),
		title: safeMetadataText(selectedValue(descriptors, "title")),
	});
}

function mapField(value: unknown, sections: ReadonlyMap<string, SectionMetadata>): FieldMetadata {
	const descriptors = recordDescriptors(value, FIELD_KEYS, FIELD_REQUIRED);
	const id = safeMetadataId(selectedValue(descriptors, "id"));
	const title = safeMetadataText(selectedValue(descriptors, "title"));
	const fieldType = safeEnum(selectedValue(descriptors, "fieldType"), FIELD_TYPES);
	let section: SectionMetadata | undefined;
	if (Object.hasOwn(descriptors, "sectionId")) {
		const sectionId = safeMetadataId(selectedValue(descriptors, "sectionId"));
		section = sections.get(sectionId);
		if (section === undefined) responseFailure();
	}
	return Object.freeze({ id, title, fieldType, ...(section === undefined ? {} : { section }) });
}

export function mapVaultMetadataList(value: unknown): readonly VaultMetadata[] {
	const raw = denseArrayValues(value);
	const result: VaultMetadata[] = [];
	const ids = new Set<string>();
	for (const record of raw) {
		const mapped = mapVault(record);
		if (ids.has(mapped.id)) responseFailure();
		ids.add(mapped.id);
		result.push(mapped);
	}
	return Object.freeze(result);
}

export function mapItemMetadataList(value: unknown, expectedVaultId: string): readonly ItemMetadata[] {
	const vaultId = safeMetadataId(expectedVaultId);
	const raw = denseArrayValues(value);
	const result: ItemMetadata[] = [];
	const ids = new Set<string>();
	for (const record of raw) {
		const mapped = mapItemOverview(record, vaultId);
		if (ids.has(mapped.id)) responseFailure();
		ids.add(mapped.id);
		result.push(mapped);
	}
	return Object.freeze(result);
}

export function mapFullItemMetadata(
	value: unknown,
	expectedVaultId: string,
	expectedItemId: string,
): FullItemMetadata {
	const vaultId = safeMetadataId(expectedVaultId);
	const itemId = safeMetadataId(expectedItemId);
	const descriptors = recordDescriptors(value, FULL_ITEM_KEYS, FULL_ITEM_REQUIRED);
	const returnedVaultId = safeMetadataId(selectedValue(descriptors, "vaultId"));
	const returnedItemId = safeMetadataId(selectedValue(descriptors, "id"));
	if (returnedVaultId !== vaultId || returnedItemId !== itemId) responseFailure();

	const rawSections = denseArrayValues(selectedValue(descriptors, "sections"));
	const rawFields = denseArrayValues(selectedValue(descriptors, "fields"));
	if (rawSections.length + rawFields.length > MAX_METADATA_RECORDS) responseFailure();
	const sections = new Map<string, SectionMetadata>();
	for (const rawSection of rawSections) {
		const section = mapSection(rawSection);
		if (sections.has(section.id)) responseFailure();
		sections.set(section.id, section);
	}
	const fields: FieldMetadata[] = [];
	const fieldIds = new Set<string>();
	for (const rawField of rawFields) {
		const field = mapField(rawField, sections);
		if (fieldIds.has(field.id)) responseFailure();
		fieldIds.add(field.id);
		fields.push(field);
	}
	return Object.freeze({
		id: returnedItemId,
		vaultId: returnedVaultId,
		title: safeMetadataText(selectedValue(descriptors, "title")),
		category: safeEnum(selectedValue(descriptors, "category"), ITEM_CATEGORIES),
		fields: Object.freeze(fields),
	});
}

function quoteJson(value: string): string {
	let output = '"';
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index] as string;
		if (character === '"') output += '\\"';
		else if (character === "\\") output += "\\\\";
		else output += character;
	}
	return `${output}"`;
}

function serializeSection(section: SectionMetadata): string {
	return `{"sectionId":${quoteJson(section.id)},"title":${quoteJson(section.title)}}`;
}

function serializeField(field: FieldMetadata): string {
	const section = field.section === undefined ? "" : `,"section":${serializeSection(field.section)}`;
	return `{"fieldId":${quoteJson(field.id)},"title":${quoteJson(field.title)},"fieldType":${quoteJson(field.fieldType)}${section}}`;
}

function boundedOutput(output: string): string {
	let lines = 1;
	for (let index = 0; index < output.length; index += 1) {
		if (output[index] === "\n") lines += 1;
	}
	if (Buffer.byteLength(output, "utf8") > MAX_METADATA_OUTPUT_BYTES || lines > MAX_METADATA_OUTPUT_LINES) {
		responseFailure();
	}
	return output;
}

export function serializeVaultMetadata(vaults: readonly VaultMetadata[]): string {
	const records: string[] = [];
	for (const vault of vaults) {
		records.push(`{"vaultId":${quoteJson(vault.id)},"title":${quoteJson(vault.title)},"vaultType":${quoteJson(vault.vaultType)},"activeItemCount":${vault.activeItemCount}}`);
	}
	return boundedOutput(`{"vaults":[${records.join(",")}]}`);
}

export function serializeItemMetadata(items: readonly ItemMetadata[]): string {
	const records: string[] = [];
	for (const item of items) {
		records.push(`{"itemId":${quoteJson(item.id)},"title":${quoteJson(item.title)},"category":${quoteJson(item.category)},"state":${quoteJson(item.state)}}`);
	}
	return boundedOutput(`{"items":[${records.join(",")}]}`);
}

export function serializeFieldMetadata(item: FullItemMetadata, fields: readonly FieldMetadata[]): string {
	const records: string[] = [];
	for (const field of fields) records.push(serializeField(field));
	return boundedOutput(
		`{"item":{"itemId":${quoteJson(item.id)},"title":${quoteJson(item.title)},"category":${quoteJson(item.category)}},"fields":[${records.join(",")}]}`,
	);
}
