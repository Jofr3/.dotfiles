import { Buffer } from "node:buffer";
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { parseLegacyDatabaseProfile, type DatabaseProfile, DATABASE_PROFILE_MAX_BYTES } from "./profile.ts";
import type { ProjectScope } from "./project-scope.ts";

export const STATIC_DATABASE_CONFIG_RELATIVE_PATH = ".agent/credentials/database.json";

export class StaticDatabaseConfigError extends Error {
	constructor() { super("Protected project database configuration is missing or invalid."); }
}

interface Snapshot {
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

function same(left: Snapshot, right: Snapshot): boolean {
	return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode &&
		left.nlink === right.nlink && left.uid === right.uid && left.size === right.size &&
		left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function validate(stat: Snapshot): void {
	if (typeof process.getuid !== "function") throw new StaticDatabaseConfigError();
	if (
		!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.uid !== BigInt(process.getuid()) ||
		(stat.mode & 0o7777n) !== 0o600n || stat.size < 1n || stat.size > BigInt(DATABASE_PROFILE_MAX_BYTES)
	) throw new StaticDatabaseConfigError();
}

export function loadProtectedStaticDatabaseProfile(scope: ProjectScope): DatabaseProfile {
	const path = join(scope.projectPath, STATIC_DATABASE_CONFIG_RELATIVE_PATH);
	let initial: Snapshot;
	try {
		if (realpathSync.native(path) !== path) throw new StaticDatabaseConfigError();
		initial = lstatSync(path, { bigint: true }) as Snapshot;
		validate(initial);
	} catch (error) {
		if (error instanceof StaticDatabaseConfigError) throw error;
		throw new StaticDatabaseConfigError();
	}
	const noFollow = constants.O_NOFOLLOW;
	const nonBlock = constants.O_NONBLOCK;
	if (!Number.isSafeInteger(noFollow) || noFollow <= 0 || !Number.isSafeInteger(nonBlock) || nonBlock <= 0) {
		throw new StaticDatabaseConfigError();
	}
	let descriptor: number;
	try { descriptor = openSync(path, constants.O_RDONLY | noFollow | nonBlock); }
	catch { throw new StaticDatabaseConfigError(); }
	try {
		const before = fstatSync(descriptor, { bigint: true }) as Snapshot;
		validate(before);
		if (!same(initial, before)) throw new StaticDatabaseConfigError();
		const expected = Number(before.size);
		const buffer = Buffer.alloc(expected + 1);
		let total = 0;
		while (total < buffer.byteLength) {
			const count = readSync(descriptor, buffer, total, buffer.byteLength - total, total);
			if (count === 0) break;
			total += count;
		}
		if (total !== expected) throw new StaticDatabaseConfigError();
		const after = fstatSync(descriptor, { bigint: true }) as Snapshot;
		validate(after);
		if (!same(before, after)) throw new StaticDatabaseConfigError();
		const finalPath = lstatSync(path, { bigint: true }) as Snapshot;
		validate(finalPath);
		if (!same(after, finalPath) || realpathSync.native(path) !== path) throw new StaticDatabaseConfigError();
		let text: string;
		try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, expected)); }
		catch { throw new StaticDatabaseConfigError(); }
		try { return parseLegacyDatabaseProfile(text); }
		finally { text = ""; buffer.fill(0); }
	} catch (error) {
		if (error instanceof StaticDatabaseConfigError) throw error;
		throw new StaticDatabaseConfigError();
	} finally {
		try { closeSync(descriptor); } catch { /* Fixed failure behavior. */ }
	}
}
