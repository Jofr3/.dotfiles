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
const WEBSITE_KEYS = new Set(["url", "label", "autofillBehavior"]);
const WEBSITE_REQUIRED = ["url", "label", "autofillBehavior"] as const;
const AUTOFILL_BEHAVIORS = new Set(["AnywhereOnWebsite", "ExactDomain", "Never"]);
const STANDARD_USERNAME_TITLES = new Set(["username", "user name", "email", "email address", "login", "user"]);

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
// Metadata projection must not depend on secret-bearing or otherwise unused SDK members.
// Some valid item/category shapes omit those members, while these safe fields are the
// complete subset needed to verify identity and emit bounded metadata.
const FULL_ITEM_REQUIRED = ["id", "title", "category", "vaultId", "fields", "sections"] as const;
const FIELD_REQUIRED = ["id", "title", "fieldType"] as const;
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

export interface SearchItemMetadata extends ItemMetadata {
	readonly vaultId: string;
	readonly vaultTitle: string;
}

export interface LoginWebsitePolicy {
	readonly origin: string;
	readonly hostname: string;
	readonly port: string;
	readonly protocol: "https:";
	readonly behavior: "AnywhereOnWebsite" | "ExactDomain";
}

export interface LoginItemMetadata {
	readonly id: string;
	readonly vaultId: string;
	readonly title: string;
	readonly usernameField: FieldMetadata;
	readonly passwordField: FieldMetadata;
	readonly websites: readonly LoginWebsitePolicy[];
}

export type MetadataResponseDiagnostic =
	| "metadata_shape"
	| "vault_record"
	| "item_overview_record"
	| "full_item_record"
	| "field_record"
	| "section_record"
	| "website_record"
	| "vault_array"
	| "item_overview_array"
	| "field_array"
	| "section_array"
	| "website_array"
	| "identifier"
	| "text"
	| "enum"
	| "count"
	| "vault_identity"
	| "item_identity"
	| "field_section"
	| "duplicate"
	| "record_limit"
	| "website_policy"
	| "output_limit";

export class MetadataResponseError extends PublicError {
	readonly diagnostic: MetadataResponseDiagnostic;

	constructor(diagnostic: MetadataResponseDiagnostic) {
		super("response");
		this.name = "OnePasswordMetadataResponseError";
		this.diagnostic = diagnostic;
	}
}

function responseFailure(diagnostic: MetadataResponseDiagnostic = "metadata_shape"): never {
	throw new MetadataResponseError(diagnostic);
}

function recordDescriptors(
	value: unknown,
	allowed: ReadonlySet<string>,
	required: readonly string[],
	diagnostic: MetadataResponseDiagnostic = "metadata_shape",
): Record<string, PropertyDescriptor> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) responseFailure(diagnostic);
	try {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) responseFailure(diagnostic);
		const descriptors = Object.getOwnPropertyDescriptors(value);
		for (const key of Reflect.ownKeys(descriptors)) {
			if (typeof key !== "string" || !allowed.has(key)) responseFailure(diagnostic);
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) responseFailure(diagnostic);
		}
		for (const key of required) {
			if (!Object.hasOwn(descriptors, key)) responseFailure(diagnostic);
		}
		return descriptors;
	} catch (error) {
		if (error instanceof PublicError) throw error;
		return responseFailure(diagnostic);
	}
}

function selectedValue(descriptors: Record<string, PropertyDescriptor>, key: string): unknown {
	const descriptor = descriptors[key];
	if (!descriptor || !("value" in descriptor)) responseFailure();
	return descriptor.value;
}

function denseArrayValues(
	value: unknown,
	maximum = MAX_METADATA_RAW_RECORDS,
	diagnostic: MetadataResponseDiagnostic = "metadata_shape",
): readonly unknown[] {
	if (!Array.isArray(value)) responseFailure(diagnostic);
	try {
		if (Object.getPrototypeOf(value) !== Array.prototype) responseFailure(diagnostic);
		const keys = Reflect.ownKeys(value);
		const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
		if (
			!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable ||
			!Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
			lengthDescriptor.value > maximum || keys.length !== lengthDescriptor.value + 1
		) responseFailure(diagnostic);
		const length = lengthDescriptor.value as number;
		const values: unknown[] = [];
		for (let index = 0; index < length; index += 1) {
			const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) responseFailure(diagnostic);
			values.push(descriptor.value);
		}
		for (const key of keys) {
			if (typeof key !== "string") responseFailure(diagnostic);
			if (key === "length") continue;
			if (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length) responseFailure(diagnostic);
		}
		return values;
	} catch (error) {
		if (error instanceof PublicError) throw error;
		return responseFailure(diagnostic);
	}
}

export function safeMetadataId(value: unknown): string {
	if (
		typeof value !== "string" || !SAFE_ID_PATTERN.test(value) ||
		Buffer.byteLength(value, "utf8") > MAX_METADATA_ID_BYTES
	) responseFailure("identifier");
	return value;
}

export function safeMetadataText(value: unknown): string {
	if (
		typeof value !== "string" || value.trim() !== value ||
		Buffer.byteLength(value, "utf8") > MAX_METADATA_TEXT_BYTES ||
		UNSAFE_METADATA_TEXT.test(value)
	) responseFailure("text");
	return value;
}

function safeEnum(value: unknown, allowed: ReadonlySet<string>): string {
	if (typeof value !== "string" || !allowed.has(value)) responseFailure("enum");
	return value;
}

function safeCount(value: unknown): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) responseFailure("count");
	return value as number;
}

function mapVault(value: unknown): VaultMetadata {
	const descriptors = recordDescriptors(value, VAULT_KEYS, VAULT_REQUIRED, "vault_record");
	return Object.freeze({
		id: safeMetadataId(selectedValue(descriptors, "id")),
		title: safeMetadataText(selectedValue(descriptors, "title")),
		vaultType: safeEnum(selectedValue(descriptors, "vaultType"), VAULT_TYPES),
		activeItemCount: safeCount(selectedValue(descriptors, "activeItemCount")),
	});
}

function mapItemOverview(value: unknown, expectedVaultId: string): ItemMetadata {
	const descriptors = recordDescriptors(value, ITEM_OVERVIEW_KEYS, ITEM_OVERVIEW_REQUIRED, "item_overview_record");
	const vaultId = safeMetadataId(selectedValue(descriptors, "vaultId"));
	if (vaultId !== expectedVaultId) responseFailure("vault_identity");
	const state = safeEnum(selectedValue(descriptors, "state"), ITEM_STATES);
	return Object.freeze({
		id: safeMetadataId(selectedValue(descriptors, "id")),
		title: safeMetadataText(selectedValue(descriptors, "title")),
		category: safeEnum(selectedValue(descriptors, "category"), ITEM_CATEGORIES),
		state: state as "active" | "archived",
	});
}

function mapSection(value: unknown): SectionMetadata {
	const descriptors = recordDescriptors(value, SECTION_KEYS, SECTION_REQUIRED, "section_record");
	return Object.freeze({
		id: safeMetadataId(selectedValue(descriptors, "id")),
		title: safeMetadataText(selectedValue(descriptors, "title")),
	});
}

function mapField(value: unknown, sections: ReadonlyMap<string, SectionMetadata>): FieldMetadata {
	const descriptors = recordDescriptors(value, FIELD_KEYS, FIELD_REQUIRED, "field_record");
	const id = safeMetadataId(selectedValue(descriptors, "id"));
	const title = safeMetadataText(selectedValue(descriptors, "title"));
	const fieldType = safeEnum(selectedValue(descriptors, "fieldType"), FIELD_TYPES);
	let section: SectionMetadata | undefined;
	if (Object.hasOwn(descriptors, "sectionId")) {
		const rawSectionId = selectedValue(descriptors, "sectionId");
		// SDK/WASM bridges may retain an own optional key as null or undefined for sectionless built-in fields.
		if (rawSectionId !== null && rawSectionId !== undefined) {
			const sectionId = safeMetadataId(rawSectionId);
			section = sections.get(sectionId);
			if (section === undefined) responseFailure("field_section");
		}
	}
	return Object.freeze({ id, title, fieldType, ...(section === undefined ? {} : { section }) });
}

export function mapVaultMetadataList(value: unknown): readonly VaultMetadata[] {
	const raw = denseArrayValues(value, MAX_METADATA_RAW_RECORDS, "vault_array");
	const result: VaultMetadata[] = [];
	const ids = new Set<string>();
	for (const record of raw) {
		const mapped = mapVault(record);
		if (ids.has(mapped.id)) responseFailure("duplicate");
		ids.add(mapped.id);
		result.push(mapped);
	}
	return Object.freeze(result);
}

export function mapItemMetadataList(value: unknown, expectedVaultId: string): readonly ItemMetadata[] {
	const vaultId = safeMetadataId(expectedVaultId);
	const raw = denseArrayValues(value, MAX_METADATA_RAW_RECORDS, "item_overview_array");
	const result: ItemMetadata[] = [];
	const ids = new Set<string>();
	for (const record of raw) {
		const mapped = mapItemOverview(record, vaultId);
		if (ids.has(mapped.id)) responseFailure("duplicate");
		ids.add(mapped.id);
		result.push(mapped);
	}
	return Object.freeze(result);
}

function normalizedFieldName(value: string): string {
	return value.trim().toLowerCase().replace(/[_-]+/gu, " ").replace(/\s+/gu, " ");
}

function oneStandardField(
	fields: readonly FieldMetadata[],
	kind: "username" | "password",
): FieldMetadata {
	const preferredId = kind;
	const byId = fields.filter((field) => normalizedFieldName(field.id) === preferredId);
	if (byId.length > 0) {
		if (byId.length !== 1) responseFailure();
		const selected = byId[0]!;
		if (kind === "password" ? selected.fieldType !== "Concealed" : selected.fieldType !== "Text" && selected.fieldType !== "Email") {
			responseFailure();
		}
		return selected;
	}
	const candidates = fields.filter((field) => {
		const title = normalizedFieldName(field.title);
		if (kind === "password") return field.fieldType === "Concealed" && title === "password";
		return (field.fieldType === "Text" || field.fieldType === "Email") && STANDARD_USERNAME_TITLES.has(title);
	});
	if (candidates.length !== 1) responseFailure();
	return candidates[0]!;
}

function mapLoginWebsite(value: unknown): LoginWebsitePolicy | undefined {
	const descriptors = recordDescriptors(value, WEBSITE_KEYS, WEBSITE_REQUIRED, "website_record");
	const rawUrl = safeMetadataText(selectedValue(descriptors, "url"));
	// Validate the label even though it is intentionally not retained or exposed.
	safeMetadataText(selectedValue(descriptors, "label"));
	const behavior = safeEnum(selectedValue(descriptors, "autofillBehavior"), AUTOFILL_BEHAVIORS);
	if (behavior === "Never") return undefined;
	let url: URL;
	try { url = new URL(rawUrl); }
	catch { return responseFailure("website_policy"); }
	if (
		url.protocol !== "https:" || url.username || url.password ||
		Buffer.byteLength(url.toString(), "utf8") > 2_048
	) responseFailure("website_policy");
	return Object.freeze({
		origin: url.origin,
		hostname: url.hostname.toLowerCase(),
		port: url.port,
		protocol: "https:" as const,
		behavior: behavior as "AnywhereOnWebsite" | "ExactDomain",
	});
}

/**
 * Map only the metadata needed for login selection. Field values, notes, tags,
 * files, and details are descriptor-validated but never read.
 */
export function mapLoginItemMetadata(
	value: unknown,
	expectedVaultId: string,
	expectedItemId: string,
): LoginItemMetadata {
	const item = mapFullItemMetadata(value, expectedVaultId, expectedItemId);
	if (item.category !== "Login") responseFailure("enum");
	const descriptors = recordDescriptors(value, FULL_ITEM_KEYS, FULL_ITEM_REQUIRED, "full_item_record");
	const rawWebsites = denseArrayValues(selectedValue(descriptors, "websites"), MAX_METADATA_RAW_RECORDS, "website_array");
	if (rawWebsites.length > MAX_METADATA_RECORDS) responseFailure("record_limit");
	const websites: LoginWebsitePolicy[] = [];
	const websiteKeys = new Set<string>();
	for (const rawWebsite of rawWebsites) {
		const website = mapLoginWebsite(rawWebsite);
		if (website === undefined) continue;
		const key = `${website.origin}\u0000${website.behavior}`;
		if (websiteKeys.has(key)) continue;
		websiteKeys.add(key);
		websites.push(website);
	}
	if (websites.length === 0) responseFailure("website_policy");
	return Object.freeze({
		id: item.id,
		vaultId: item.vaultId,
		title: item.title,
		usernameField: oneStandardField(item.fields, "username"),
		passwordField: oneStandardField(item.fields, "password"),
		websites: Object.freeze(websites),
	});
}

export function mapFullItemMetadata(
	value: unknown,
	expectedVaultId: string,
	expectedItemId: string,
): FullItemMetadata {
	const vaultId = safeMetadataId(expectedVaultId);
	const itemId = safeMetadataId(expectedItemId);
	const descriptors = recordDescriptors(value, FULL_ITEM_KEYS, FULL_ITEM_REQUIRED, "full_item_record");
	const returnedVaultId = safeMetadataId(selectedValue(descriptors, "vaultId"));
	const returnedItemId = safeMetadataId(selectedValue(descriptors, "id"));
	if (returnedVaultId !== vaultId || returnedItemId !== itemId) responseFailure("item_identity");

	const rawSections = denseArrayValues(selectedValue(descriptors, "sections"), MAX_METADATA_RAW_RECORDS, "section_array");
	const rawFields = denseArrayValues(selectedValue(descriptors, "fields"), MAX_METADATA_RAW_RECORDS, "field_array");
	if (rawSections.length + rawFields.length > MAX_METADATA_RECORDS) responseFailure("record_limit");
	const sections = new Map<string, SectionMetadata>();
	for (const rawSection of rawSections) {
		const section = mapSection(rawSection);
		if (sections.has(section.id)) responseFailure("duplicate");
		sections.set(section.id, section);
	}
	const fields: FieldMetadata[] = [];
	const fieldIds = new Set<string>();
	for (const rawField of rawFields) {
		const field = mapField(rawField, sections);
		if (fieldIds.has(field.id)) responseFailure("duplicate");
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
		responseFailure("output_limit");
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

export function serializeSearchItemMetadata(items: readonly SearchItemMetadata[]): string {
	const records: string[] = [];
	for (const item of items) {
		records.push(`{"vaultId":${quoteJson(item.vaultId)},"vaultTitle":${quoteJson(item.vaultTitle)},"itemId":${quoteJson(item.id)},"title":${quoteJson(item.title)},"category":${quoteJson(item.category)},"state":${quoteJson(item.state)}}`);
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
