import { Buffer } from "node:buffer";
import { constants as fsConstants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import {
	SECRET_RESOLVER_CONSUMER_PATTERN,
	SECRET_RESOLVER_PURPOSE_PATTERN,
	SECRET_RESOLVER_SLOT_PATTERN,
} from "./resolver-protocol.ts";

export const RESOLVER_BINDINGS_ENV = "PI_BITWARDEN_RESOLVER_BINDINGS";
export const DEFAULT_RESOLVER_BINDINGS_PATH = fileURLToPath(new URL("../resolver-bindings.json", import.meta.url));
export const MAX_RESOLVER_BINDINGS = 128;
export const MAX_RESOLVER_BINDINGS_BYTES = 64 * 1024;

const SECRET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const UNSAFE_PATH_TEXT = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
const MAX_OVERRIDE_PATH_BYTES = 4 * 1024;
const ALLOWED_ROOT_KEYS = new Set(["version", "bindings"]);
const ALLOWED_BINDING_KEYS = new Set(["consumer", "slot", "purpose", "secretId"]);

export type ResolverBindingsSource = "override" | "package";

export interface ResolverBinding {
	consumer: string;
	slot: string;
	purpose: string;
	secretId: string;
}

export interface ResolverBindings {
	version: 1;
	bindings: readonly ResolverBinding[];
}

export interface LoadedResolverBindings {
	config: ResolverBindings;
	source: ResolverBindingsSource;
}

export type ResolverBindingsErrorCode =
	| "duplicate-binding"
	| "invalid-config"
	| "invalid-json"
	| "invalid-override-path"
	| "missing-config"
	| "read-failed"
	| "too-large"
	| "unsafe-file";

const BINDING_ERROR_MESSAGES: Readonly<Record<ResolverBindingsErrorCode, string>> = Object.freeze({
	"duplicate-binding": "The resolver binding configuration contains a duplicate tuple.",
	"invalid-config": "The resolver binding configuration has an invalid shape.",
	"invalid-json": "The resolver binding configuration is not valid JSON.",
	"invalid-override-path": "The resolver binding override path is invalid.",
	"missing-config": "The resolver binding configuration is not present.",
	"read-failed": "The resolver binding configuration could not be read safely.",
	"too-large": "The resolver binding configuration exceeds its size limit.",
	"unsafe-file": "The resolver binding configuration is not a protected regular file.",
});

export class ResolverBindingsError extends Error {
	readonly code: ResolverBindingsErrorCode;

	constructor(code: ResolverBindingsErrorCode) {
		super(BINDING_ERROR_MESSAGES[code]);
		this.name = "BitwardenResolverBindingsError";
		this.code = code;
	}
}

function ownDataProperties(value: unknown, allowed: ReadonlySet<string>): Record<string, PropertyDescriptor> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new ResolverBindingsError("invalid-config");
	}
	try {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw new ResolverBindingsError("invalid-config");
		}
		const descriptors = Object.getOwnPropertyDescriptors(value);
		for (const key of Reflect.ownKeys(descriptors)) {
			if (typeof key !== "string" || !allowed.has(key)) throw new ResolverBindingsError("invalid-config");
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
				throw new ResolverBindingsError("invalid-config");
			}
		}
		return descriptors;
	} catch (error) {
		if (error instanceof ResolverBindingsError) throw error;
		throw new ResolverBindingsError("invalid-config");
	}
}

function descriptorValue(descriptors: Record<string, PropertyDescriptor>, key: string): unknown {
	const descriptor = descriptors[key];
	return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function bindingString(value: unknown, pattern: RegExp): string {
	if (typeof value !== "string" || !pattern.test(value)) throw new ResolverBindingsError("invalid-config");
	return value;
}

function arrayDataItem(value: unknown[], index: number): unknown {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
			throw new ResolverBindingsError("invalid-config");
		}
		return descriptor.value;
	} catch (error) {
		if (error instanceof ResolverBindingsError) throw error;
		throw new ResolverBindingsError("invalid-config");
	}
}

export function bindingTupleKey(consumer: string, slot: string, purpose: string): string {
	return `${consumer}\u0000${slot}\u0000${purpose}`;
}

export function parseResolverBindings(value: unknown): ResolverBindings {
	const root = ownDataProperties(value, ALLOWED_ROOT_KEYS);
	if (descriptorValue(root, "version") !== 1) throw new ResolverBindingsError("invalid-config");
	const rawBindings = descriptorValue(root, "bindings");
	if (!Array.isArray(rawBindings) || rawBindings.length === 0 || rawBindings.length > MAX_RESOLVER_BINDINGS) {
		throw new ResolverBindingsError("invalid-config");
	}
	try {
		if (Object.getPrototypeOf(rawBindings) !== Array.prototype) throw new ResolverBindingsError("invalid-config");
		const descriptors = Object.getOwnPropertyDescriptors(rawBindings);
		for (const key of Reflect.ownKeys(descriptors)) {
			if (typeof key !== "string" || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key))) {
				throw new ResolverBindingsError("invalid-config");
			}
		}
	} catch (error) {
		if (error instanceof ResolverBindingsError) throw error;
		throw new ResolverBindingsError("invalid-config");
	}

	const bindings: ResolverBinding[] = [];
	const tuples = new Set<string>();
	for (let index = 0; index < rawBindings.length; index += 1) {
		const item = ownDataProperties(arrayDataItem(rawBindings, index), ALLOWED_BINDING_KEYS);
		const consumer = bindingString(descriptorValue(item, "consumer"), SECRET_RESOLVER_CONSUMER_PATTERN);
		const slot = bindingString(descriptorValue(item, "slot"), SECRET_RESOLVER_SLOT_PATTERN);
		const purpose = bindingString(descriptorValue(item, "purpose"), SECRET_RESOLVER_PURPOSE_PATTERN);
		const secretId = bindingString(descriptorValue(item, "secretId"), SECRET_ID_PATTERN);
		const tuple = bindingTupleKey(consumer, slot, purpose);
		if (tuples.has(tuple)) throw new ResolverBindingsError("duplicate-binding");
		tuples.add(tuple);
		bindings.push(Object.freeze({ consumer, slot, purpose, secretId }));
	}
	return Object.freeze({ version: 1, bindings: Object.freeze(bindings) });
}

function validateOverridePath(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		Buffer.byteLength(value, "utf8") > MAX_OVERRIDE_PATH_BYTES ||
		value.trim() !== value ||
		UNSAFE_PATH_TEXT.test(value) ||
		!isAbsolute(value)
	) {
		throw new ResolverBindingsError("invalid-override-path");
	}
	return value;
}

function configuredOverridePath(environment: unknown): string | undefined {
	if (typeof environment !== "object" || environment === null) return undefined;
	let descriptor: PropertyDescriptor | undefined;
	try {
		descriptor = Object.getOwnPropertyDescriptor(environment, RESOLVER_BINDINGS_ENV);
	} catch {
		throw new ResolverBindingsError("invalid-override-path");
	}
	if (descriptor === undefined) return undefined;
	if (!("value" in descriptor)) throw new ResolverBindingsError("invalid-override-path");
	if (descriptor.value === undefined) return undefined;
	return validateOverridePath(descriptor.value);
}

function filesystemErrorCode(error: unknown): string {
	if (typeof error !== "object" || error === null) return "";
	try {
		const descriptor = Object.getOwnPropertyDescriptor(error, "code");
		return descriptor && "value" in descriptor && typeof descriptor.value === "string" ? descriptor.value : "";
	} catch {
		return "";
	}
}

interface ProtectedFileStat {
	dev: bigint;
	ino: bigint;
	mode: bigint;
	nlink: bigint;
	uid: bigint;
	size: bigint;
	mtimeNs: bigint;
	ctimeNs: bigint;
	isFile(): boolean;
	isSymbolicLink(): boolean;
}

function assertProtectedStat(stat: ProtectedFileStat, currentUid: bigint): void {
	if (
		!stat.isFile() ||
		stat.isSymbolicLink() ||
		stat.nlink !== 1n ||
		stat.uid !== currentUid ||
		(stat.mode & 0o7777n) !== 0o600n ||
		stat.size < 0n
	) {
		throw new ResolverBindingsError("unsafe-file");
	}
	if (stat.size > BigInt(MAX_RESOLVER_BINDINGS_BYTES)) throw new ResolverBindingsError("too-large");
}

function sameFileSnapshot(left: ProtectedFileStat, right: ProtectedFileStat): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.mode === right.mode &&
		left.nlink === right.nlink &&
		left.uid === right.uid &&
		left.size === right.size &&
		left.mtimeNs === right.mtimeNs &&
		left.ctimeNs === right.ctimeNs
	);
}

function safeOpenFlags(): number {
	const noFollow = fsConstants.O_NOFOLLOW;
	const nonBlock = fsConstants.O_NONBLOCK;
	if (
		!Number.isSafeInteger(noFollow) || noFollow <= 0 ||
		!Number.isSafeInteger(nonBlock) || nonBlock <= 0
	) {
		throw new ResolverBindingsError("unsafe-file");
	}
	return fsConstants.O_RDONLY | noFollow | nonBlock;
}

async function readProtectedBindingsFile(path: string, optional: boolean): Promise<ResolverBindings | undefined> {
	if (typeof process.getuid !== "function") throw new ResolverBindingsError("unsafe-file");
	const currentUid = BigInt(process.getuid());
	const flags = safeOpenFlags();
	let initial: ProtectedFileStat;
	try {
		initial = await lstat(path, { bigint: true }) as ProtectedFileStat;
	} catch (error) {
		if (optional && filesystemErrorCode(error) === "ENOENT") return undefined;
		if (filesystemErrorCode(error) === "ENOENT") throw new ResolverBindingsError("missing-config");
		throw new ResolverBindingsError("read-failed");
	}
	assertProtectedStat(initial, currentUid);

	let handle;
	try {
		handle = await open(path, flags);
	} catch (error) {
		if (filesystemErrorCode(error) === "ENOENT" || filesystemErrorCode(error) === "ELOOP") {
			throw new ResolverBindingsError("unsafe-file");
		}
		throw new ResolverBindingsError("read-failed");
	}

	try {
		let before: ProtectedFileStat;
		try {
			before = await handle.stat({ bigint: true }) as ProtectedFileStat;
		} catch {
			throw new ResolverBindingsError("read-failed");
		}
		assertProtectedStat(before, currentUid);
		if (!sameFileSnapshot(initial, before)) throw new ResolverBindingsError("unsafe-file");

		const expectedBytes = Number(before.size);
		const buffer = Buffer.alloc(expectedBytes + 1);
		let total = 0;
		try {
			while (total < buffer.byteLength) {
				const { bytesRead } = await handle.read(buffer, total, buffer.byteLength - total, total);
				if (bytesRead === 0) break;
				total += bytesRead;
			}
		} catch {
			throw new ResolverBindingsError("read-failed");
		}
		if (total !== expectedBytes) throw new ResolverBindingsError("unsafe-file");

		let after: ProtectedFileStat;
		try {
			after = await handle.stat({ bigint: true }) as ProtectedFileStat;
		} catch {
			throw new ResolverBindingsError("read-failed");
		}
		assertProtectedStat(after, currentUid);
		if (!sameFileSnapshot(before, after)) throw new ResolverBindingsError("unsafe-file");

		let parsed: unknown;
		try {
			const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, expectedBytes));
			parsed = JSON.parse(text);
		} catch {
			throw new ResolverBindingsError("invalid-json");
		}
		return parseResolverBindings(parsed);
	} finally {
		await handle.close().catch(() => undefined);
	}
}

export async function loadResolverBindings(options: {
	overridePath?: string;
	packagePath?: string;
	environment?: unknown;
} = {}): Promise<LoadedResolverBindings> {
	const configuredPath = options.overridePath ?? configuredOverridePath(options.environment ?? process.env);
	if (configuredPath !== undefined) {
		const overridePath = validateOverridePath(configuredPath);
		const config = await readProtectedBindingsFile(overridePath, false);
		if (!config) throw new ResolverBindingsError("missing-config");
		return Object.freeze({ config, source: "override" });
	}
	const config = await readProtectedBindingsFile(options.packagePath ?? DEFAULT_RESOLVER_BINDINGS_PATH, true);
	if (!config) throw new ResolverBindingsError("missing-config");
	return Object.freeze({ config, source: "package" });
}
