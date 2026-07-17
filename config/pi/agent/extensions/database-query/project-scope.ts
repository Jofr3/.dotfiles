import { Buffer } from "node:buffer";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, normalize, parse, sep } from "node:path";
import { deriveProjectScopeId } from "./protocol.ts";

export const MAX_PROJECT_PATH_BYTES = 4096;
export const MAX_PROJECT_PATH_SEGMENTS = 256;
const UNSAFE_PATH_TEXT = /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u;

export interface ProjectScope {
	readonly projectPath: string;
	readonly projectScopeId: string;
}

export class ProjectScopeError extends Error {
	constructor() { super("Database project scope is unavailable."); }
}

export function canonicalizeProjectScope(cwd: unknown): ProjectScope {
	if (
		typeof cwd !== "string" || cwd.length === 0 || cwd.trim() !== cwd ||
		Buffer.byteLength(cwd, "utf8") > MAX_PROJECT_PATH_BYTES || UNSAFE_PATH_TEXT.test(cwd) ||
		!isAbsolute(cwd)
	) throw new ProjectScopeError();
	let canonical: string;
	try {
		canonical = realpathSync.native(cwd);
		const stat = statSync(canonical);
		if (!stat.isDirectory()) throw new ProjectScopeError();
	} catch (error) {
		if (error instanceof ProjectScopeError) throw error;
		throw new ProjectScopeError();
	}
	if (
		canonical.length === 0 || canonical !== normalize(canonical) || !isAbsolute(canonical) ||
		Buffer.byteLength(canonical, "utf8") > MAX_PROJECT_PATH_BYTES || UNSAFE_PATH_TEXT.test(canonical)
	) throw new ProjectScopeError();
	const root = parse(canonical).root;
	const remainder = canonical.slice(root.length);
	const segments = remainder === "" ? [] : remainder.split(sep);
	if (segments.length > MAX_PROJECT_PATH_SEGMENTS || segments.some((segment) => segment.length === 0)) {
		throw new ProjectScopeError();
	}
	return Object.freeze({ projectPath: canonical, projectScopeId: deriveProjectScopeId(canonical) });
}

export function sameProjectScope(left: ProjectScope, right: ProjectScope): boolean {
	return left.projectPath === right.projectPath && left.projectScopeId === right.projectScopeId;
}
