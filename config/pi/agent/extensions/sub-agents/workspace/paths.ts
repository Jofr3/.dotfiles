import { lstat, realpath, stat } from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	relative,
	resolve,
	sep,
} from "node:path";
import type { WorkspaceIdentity } from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";

export type WorkspacePathErrorCode =
	| "invalid_path"
	| "workspace_unavailable"
	| "workspace_outside_root"
	| "path_unavailable"
	| "path_outside_root"
	| "path_outside_scope";

export class WorkspacePathError extends Error {
	readonly code: WorkspacePathErrorCode;

	constructor(code: WorkspacePathErrorCode, message: string) {
		super(message);
		this.name = "WorkspacePathError";
		this.code = code;
	}
}

export interface ResolvedSharedWorkspace {
	readonly identity: Readonly<WorkspaceIdentity>;
	readonly cwd: string;
}

/** One canonical lease identity for an existing or not-yet-created path. */
export interface CanonicalWorkspacePath {
	readonly workspaceKey: string;
	readonly path: string;
	readonly relativePath: string;
	readonly exists: boolean;
	/** Canonical existing directory whose unresolved namespace contains a missing target. */
	readonly provisionalNamespace?: string;
}

/** Canonical exact-path scope declared before guarded mutation begins. */
export interface CanonicalWriteScope {
	readonly workspaceKey: string;
	readonly paths: readonly CanonicalWorkspacePath[];
}

export interface ResolveCanonicalWorkspacePathOptions {
	workspace: Readonly<WorkspaceIdentity>;
	cwd?: string;
	path: string;
	allowMissing?: boolean;
	allowWorkspaceRoot?: boolean;
}

function pathErrorCode(error: unknown): string | undefined {
	return error && typeof error === "object" && "code" in error
		? String((error as { code?: unknown }).code ?? "")
		: undefined;
}

function isMissingPathError(error: unknown): boolean {
	const code = pathErrorCode(error);
	return code === "ENOENT" || code === "ENOTDIR";
}

function requirePathText(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0 || value.length > SUB_AGENT_BOUNDS.contextPathChars) {
		throw new WorkspacePathError(
			"invalid_path",
			`${label} must contain between 1 and ${SUB_AGENT_BOUNDS.contextPathChars} characters`,
		);
	}
	if (value.includes("\0")) {
		throw new WorkspacePathError("invalid_path", `${label} contains an unsupported null character`);
	}
	return value;
}

/** Match Pi built-ins by removing exactly one model-added leading `@`. */
export function stripLeadingPathAt(path: string): string {
	return path.startsWith("@") ? path.slice(1) : path;
}

export function isPathWithinRoot(root: string, candidate: string): boolean {
	const pathFromRoot = relative(root, candidate);
	return (
		pathFromRoot === "" ||
		(!isAbsolute(pathFromRoot) && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`))
	);
}

function sharedWorkspaceKey(root: string): string {
	return `shared:${root}`;
}

function requireSharedWorkspace(workspace: Readonly<WorkspaceIdentity>): void {
	if (
		!workspace ||
		workspace.mode !== "shared" ||
		typeof workspace.root !== "string" ||
		!isAbsolute(workspace.root) ||
		workspace.key !== sharedWorkspaceKey(workspace.root) ||
		workspace.branch !== undefined
	) {
		throw new WorkspacePathError("invalid_path", "The shared workspace identity is invalid");
	}
}

async function canonicalExistingDirectory(
	path: string,
	code: "workspace_unavailable" | "path_unavailable",
	message: string,
): Promise<string> {
	try {
		const canonical = await realpath(path);
		if (!(await stat(canonical)).isDirectory()) throw new Error("not a directory");
		return canonical;
	} catch {
		throw new WorkspacePathError(code, message);
	}
}

/**
 * Canonicalize one shared root and an existing child cwd beneath it.
 * The returned key is stable for every child sharing that canonical root and
 * leaves mode/root room for later worktree identities.
 */
export async function resolveSharedWorkspace(
	rootPath: string,
	cwdPath?: string,
): Promise<ResolvedSharedWorkspace> {
	const rootInput = requirePathText(rootPath, "workspace root");
	const root = await canonicalExistingDirectory(
		resolve(rootInput),
		"workspace_unavailable",
		"The shared workspace root is unavailable",
	);
	const requestedCwd = cwdPath === undefined
		? root
		: resolve(root, requirePathText(cwdPath, "workspace cwd"));
	if (!isPathWithinRoot(root, requestedCwd)) {
		throw new WorkspacePathError(
			"workspace_outside_root",
			"The child workspace must remain inside the shared workspace root",
		);
	}
	const cwd = await canonicalExistingDirectory(
		requestedCwd,
		"workspace_unavailable",
		"The child workspace directory is unavailable",
	);
	if (!isPathWithinRoot(root, cwd)) {
		throw new WorkspacePathError(
			"workspace_outside_root",
			"The child workspace must remain inside the shared workspace root",
		);
	}
	const identity = Object.freeze<WorkspaceIdentity>({
		mode: "shared",
		root,
		key: sharedWorkspaceKey(root),
	});
	return Object.freeze({ identity, cwd });
}

async function resolveFromNearestExistingAncestor(absolutePath: string): Promise<{
	path: string;
	exists: boolean;
	provisionalNamespace?: string;
}> {
	try {
		return { path: await realpath(absolutePath), exists: true };
	} catch (error) {
		if (!isMissingPathError(error)) {
			throw new WorkspacePathError("path_unavailable", "The workspace path is unavailable");
		}
	}

	const missingSegments: string[] = [];
	let cursor = absolutePath;
	while (true) {
		try {
			await lstat(cursor);
			let canonicalAncestor: string;
			try {
				canonicalAncestor = await realpath(cursor);
			} catch {
				// An existing but unresolved component is commonly a dangling symlink.
				// Treating it as a new lexical path could let delegated writes escape.
				throw new WorkspacePathError("path_unavailable", "The workspace path has an unresolved component");
			}
			if (!(await stat(canonicalAncestor)).isDirectory()) {
				throw new WorkspacePathError("path_unavailable", "The workspace path parent is not a directory");
			}
			return {
				path: resolve(canonicalAncestor, ...missingSegments.reverse()),
				exists: false,
				provisionalNamespace: canonicalAncestor,
			};
		} catch (error) {
			if (error instanceof WorkspacePathError) throw error;
			if (!isMissingPathError(error)) {
				throw new WorkspacePathError("path_unavailable", "The workspace path is unavailable");
			}
			const parent = dirname(cursor);
			if (parent === cursor) {
				throw new WorkspacePathError("path_unavailable", "The workspace path has no existing parent");
			}
			missingSegments.push(basename(cursor));
			cursor = parent;
		}
	}
}

/**
 * Resolve one tool path to its canonical lease identity.
 *
 * Existing targets use `realpath()`. Missing targets use their canonical
 * nearest existing directory plus the missing suffix, so aliases through an
 * existing parent symlink converge. Existing unresolved components and
 * non-directory parents fail closed. The later guarded-tool phase must still
 * bind this identity to delegation and reconcile identity after creation.
 */
export async function resolveCanonicalWorkspacePath(
	options: ResolveCanonicalWorkspacePathOptions,
): Promise<CanonicalWorkspacePath> {
	requireSharedWorkspace(options.workspace);
	const rawPath = stripLeadingPathAt(requirePathText(options.path, "workspace path"));
	if (!rawPath) throw new WorkspacePathError("invalid_path", "The workspace path is empty after removing its prefix");

	const cwdInput = requirePathText(options.cwd ?? options.workspace.root, "workspace cwd");
	const resolvedCwd = isAbsolute(cwdInput) ? resolve(cwdInput) : resolve(options.workspace.root, cwdInput);
	if (!isPathWithinRoot(options.workspace.root, resolvedCwd)) {
		throw new WorkspacePathError("path_outside_root", "The workspace path cwd is outside the shared root");
	}
	const canonicalCwd = await canonicalExistingDirectory(
		resolvedCwd,
		"path_unavailable",
		"The workspace path cwd is unavailable",
	);
	if (!isPathWithinRoot(options.workspace.root, canonicalCwd)) {
		throw new WorkspacePathError("path_outside_root", "The workspace path cwd is outside the shared root");
	}

	const absolutePath = resolve(canonicalCwd, rawPath);
	if (!isPathWithinRoot(options.workspace.root, absolutePath)) {
		throw new WorkspacePathError("path_outside_root", "The workspace path is outside the shared root");
	}
	const canonical = await resolveFromNearestExistingAncestor(absolutePath);
	if (!isPathWithinRoot(options.workspace.root, canonical.path)) {
		throw new WorkspacePathError("path_outside_root", "The workspace path resolves outside the shared root");
	}
	if (!canonical.exists && options.allowMissing === false) {
		throw new WorkspacePathError("path_unavailable", "The workspace path does not exist");
	}
	const relativePath = relative(options.workspace.root, canonical.path);
	if (!relativePath && options.allowWorkspaceRoot !== true) {
		throw new WorkspacePathError("invalid_path", "The shared workspace root is not a file target");
	}
	return Object.freeze({
		workspaceKey: options.workspace.key,
		path: canonical.path,
		relativePath,
		exists: canonical.exists,
		...(canonical.provisionalNamespace
			? { provisionalNamespace: canonical.provisionalNamespace }
			: {}),
	});
}

/** Canonicalize, deduplicate, and sort an optional exact-file write scope. */
export async function resolveCanonicalWriteScope(
	workspace: Readonly<WorkspaceIdentity>,
	paths: readonly string[] | undefined,
): Promise<CanonicalWriteScope | undefined> {
	requireSharedWorkspace(workspace);
	if (paths === undefined) return undefined;
	if (!Array.isArray(paths) || paths.length > SUB_AGENT_BOUNDS.writeScopePaths) {
		throw new WorkspacePathError(
			"invalid_path",
			`The write scope must contain at most ${SUB_AGENT_BOUNDS.writeScopePaths} paths`,
		);
	}

	const byCanonicalPath = new Map<string, CanonicalWorkspacePath>();
	for (const value of paths) {
		const rawPath = stripLeadingPathAt(requirePathText(value, "write scope path"));
		if (!rawPath || isAbsolute(rawPath)) {
			throw new WorkspacePathError("invalid_path", "Write scope paths must be workspace-relative");
		}
		const canonical = await resolveCanonicalWorkspacePath({
			workspace,
			cwd: workspace.root,
			path: value,
			allowMissing: true,
		});
		byCanonicalPath.set(canonical.path, canonical);
	}
	const canonicalPaths = [...byCanonicalPath.values()].sort((left, right) =>
		left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
	);
	return Object.freeze({
		workspaceKey: workspace.key,
		paths: Object.freeze(canonicalPaths),
	});
}

/** Omitted scope is unrestricted inside the root; a present scope is exact-path only. */
export function isCanonicalPathInWriteScope(
	target: Readonly<CanonicalWorkspacePath>,
	scope: Readonly<CanonicalWriteScope> | undefined,
): boolean {
	if (scope === undefined) return true;
	return (
		target.workspaceKey === scope.workspaceKey &&
		scope.paths.some((candidate) => candidate.path === target.path)
	);
}

export function assertCanonicalPathInWriteScope(
	target: Readonly<CanonicalWorkspacePath>,
	scope: Readonly<CanonicalWriteScope> | undefined,
): void {
	if (!isCanonicalPathInWriteScope(target, scope)) {
		throw new WorkspacePathError("path_outside_scope", "The workspace path is outside the declared write scope");
	}
}
