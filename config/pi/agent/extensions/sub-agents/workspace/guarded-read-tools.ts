import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import {
	constants,
	type Stats,
} from "node:fs";
import {
	lstat,
	open,
	opendir,
	stat,
} from "node:fs/promises";
import {
	basename,
	matchesGlob,
	relative,
	sep,
} from "node:path";
import {
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	truncateHead,
	truncateLine,
	type FindToolInput,
	type GrepToolInput,
	type LsToolInput,
	type ReadToolInput,
} from "@earendil-works/pi-coding-agent";
import type { WorkspaceIdentity } from "../types.ts";
import {
	WorkspacePathError,
	isPathWithinRoot,
	resolveCanonicalWorkspacePath,
	type CanonicalWorkspacePath,
} from "./paths.ts";

export type GuardedChildReadErrorCode =
	| "invalid_read_path"
	| "path_outside_workspace"
	| "sensitive_path_rejected"
	| "read_operation_failed";

export class GuardedChildReadError extends Error {
	readonly code: GuardedChildReadErrorCode;

	constructor(code: GuardedChildReadErrorCode, message: string) {
		super(message);
		this.name = "GuardedChildReadError";
		this.code = code;
	}
}

interface GuardedReadToolOptions {
	cwd: string;
	workspace: Readonly<WorkspaceIdentity>;
}

const MAX_SEARCH_FILES = 10_000;
const MAX_SEARCH_ENTRIES = 20_000;
const MAX_SEARCH_FILE_BYTES = 4 * 1024 * 1024;
const MAX_GREP_MATCHES = 1_000;
const MAX_GREP_CONTEXT_LINES = 20;
const MAX_GREP_OUTPUT_LINES = 2_100;
const PROTECTED_SEARCH_ENV_ALLOWLIST = Object.freeze([
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"PATH",
	"PATHEXT",
	"SystemRoot",
	"WINDIR",
] as const);
const PROTECTED_SEARCH_GLOBS = Object.freeze([
	"!**/.env*",
	"!**/.git/**",
	"!**/.git-credentials",
	"!**/.netrc",
	"!**/.npmrc",
	"!**/.pypirc",
	"!**/auth.json",
	"!**/agent/sessions/**",
	"!**/.agent/credentials/**",
	"!**/.pi/credentials/**",
	"!**/*.pem",
	"!**/*.key",
]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu;
const SENSITIVE_FILE_NAMES = new Set([
	".git-credentials",
	".netrc",
	".npmrc",
	".pypirc",
	"auth.json",
]);

function protectedSearchEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const environment: NodeJS.ProcessEnv = {};
	for (const key of PROTECTED_SEARCH_ENV_ALLOWLIST) {
		const value = source[key];
		if (typeof value === "string" && !value.includes("\0")) environment[key] = value;
	}
	return environment;
}

function throwIfReadAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw new Error("Operation aborted");
}

function genericReadFailure(toolName: "read" | "grep" | "find" | "ls"): GuardedChildReadError {
	return new GuardedChildReadError(
		"read_operation_failed",
		`The guarded ${toolName} operation failed inside the shared workspace`,
	);
}

function workspaceRelativePath(workspace: Readonly<WorkspaceIdentity>, path: string): string {
	return relative(workspace.root, path).split(sep).join("/");
}

/**
 * Fail closed for the credential/session files this extension is never allowed
 * to inspect. This is a narrow structural denylist, not general secret
 * classification; projects must still keep other private data out of child scope.
 */
function isSensitiveWorkspacePath(
	workspace: Readonly<WorkspaceIdentity>,
	path: string,
): boolean {
	const relativePath = workspaceRelativePath(workspace, path);
	if (!relativePath || relativePath.startsWith("../")) return false;
	const segments = relativePath.split("/").filter(Boolean);
	const lower = segments.map((segment) => segment.toLowerCase());
	const fileName = lower.at(-1) ?? "";
	if (SENSITIVE_FILE_NAMES.has(fileName)) return true;
	if (fileName === ".env" || fileName.startsWith(".env.")) return true;
	if (fileName.endsWith(".pem") || fileName.endsWith(".key")) return true;
	if (lower.includes(".git")) return true;
	for (let index = 0; index < lower.length - 1; index += 1) {
		if (lower[index] === ".agent" && lower[index + 1] === "credentials") return true;
		if (lower[index] === "agent" && lower[index + 1] === "sessions") return true;
		if (lower[index] === ".pi" && lower[index + 1] === "credentials") return true;
	}
	return false;
}

function assertNonSensitivePath(
	workspace: Readonly<WorkspaceIdentity>,
	target: Readonly<CanonicalWorkspacePath>,
): void {
	if (isSensitiveWorkspacePath(workspace, target.path)) {
		throw new GuardedChildReadError(
			"sensitive_path_rejected",
			"Child read-only tools cannot inspect credential, environment, key, session, or repository-metadata paths",
		);
	}
}

async function resolveExistingReadPath(
	options: GuardedReadToolOptions,
	path: string,
	allowWorkspaceRoot: boolean,
): Promise<CanonicalWorkspacePath> {
	try {
		const target = await resolveCanonicalWorkspacePath({
			workspace: options.workspace,
			cwd: options.cwd,
			path,
			allowMissing: false,
			allowWorkspaceRoot,
		});
		assertNonSensitivePath(options.workspace, target);
		return target;
	} catch (error) {
		if (error instanceof GuardedChildReadError) throw error;
		if (error instanceof WorkspacePathError && (
			error.code === "path_outside_root" ||
			error.code === "workspace_outside_root"
		)) {
			throw new GuardedChildReadError(
				"path_outside_workspace",
				"Child read-only tools cannot inspect paths outside the shared workspace",
			);
		}
		throw new GuardedChildReadError(
			"invalid_read_path",
			"The requested child read path is unavailable inside the shared workspace",
		);
	}
}

function rewriteCanonicalPath(text: string, canonicalPath: string, requestedPath: string): string {
	return text.includes(canonicalPath) ? text.split(canonicalPath).join(requestedPath) : text;
}

function sameFileIdentity(left: Stats, right: Stats): boolean {
	return left.isFile() && right.isFile() && left.dev === right.dev && left.ino === right.ino;
}

/** Descriptor-bound read of one already canonicalized regular file. */
async function readStableFile(
	workspace: Readonly<WorkspaceIdentity>,
	target: Readonly<CanonicalWorkspacePath>,
	maxBytes?: number,
	signal?: AbortSignal,
): Promise<Buffer | undefined> {
	throwIfReadAborted(signal);
	assertNonSensitivePath(workspace, target);
	const expected = await lstat(target.path);
	if (!expected.isFile()) throw genericReadFailure("read");
	if (maxBytes !== undefined && expected.size > maxBytes) return undefined;
	const handle = await open(target.path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const opened = await handle.stat();
		if (!sameFileIdentity(expected, opened)) throw genericReadFailure("read");
		const content = await handle.readFile();
		throwIfReadAborted(signal);
		const current = await lstat(target.path);
		if (!sameFileIdentity(opened, current)) throw genericReadFailure("read");
		return content;
	} finally {
		await handle.close();
	}
}

/** Same-name text-read override bound to a canonical regular-file descriptor. */
export function createGuardedChildReadTool(
	options: GuardedReadToolOptions,
): ReturnType<typeof createReadToolDefinition> {
	const metadata = createReadToolDefinition(options.cwd);
	return {
		...metadata,
		description:
			"Read one text file confined to the canonical shared workspace. Credential/environment/key/session/repository-metadata paths and escaping symlinks are rejected.",
		promptGuidelines: [
			...(metadata.promptGuidelines ?? []),
			"Use child read only for nonsecret files inside the assigned shared workspace; protected paths and escaping symlinks are rejected.",
		],
		async execute(toolCallId, params: ReadToolInput, signal, onUpdate, ctx) {
			throwIfReadAborted(signal);
			const target = await resolveExistingReadPath(options, params.path, false);
			throwIfReadAborted(signal);
			try {
				const delegated = createReadToolDefinition(options.cwd, {
					autoResizeImages: false,
					operations: {
						async access(path) {
							if (path !== target.path) throw genericReadFailure("read");
						},
						async readFile(path) {
							if (path !== target.path) throw genericReadFailure("read");
							return (await readStableFile(options.workspace, target, undefined, signal))!;
						},
					},
				});
				const result = await delegated.execute(
					toolCallId,
					{ ...params, path: target.path },
					signal,
					onUpdate,
					ctx,
				);
				return {
					...result,
					content: result.content.map((part) => part.type === "text"
						? { ...part, text: rewriteCanonicalPath(part.text, target.path, params.path) }
						: part),
				};
			} catch (error) {
				if (error instanceof GuardedChildReadError) throw error;
				if (signal?.aborted) throw new Error("Operation aborted");
				throw genericReadFailure("read");
			}
		},
	};
}

function safeDisplayPath(value: string): string {
	return value.replace(CONTROL_CHARACTERS, " ").replace(/\s+/gu, " ").trim();
}

function matchesRequestedGlob(relativePath: string, pattern: string): boolean {
	const normalized = relativePath.split(sep).join("/");
	return pattern.includes("/")
		? matchesGlob(normalized, pattern)
		: matchesGlob(basename(normalized), pattern);
}

async function canonicalChild(
	options: GuardedReadToolOptions,
	path: string,
	allowWorkspaceRoot = false,
): Promise<CanonicalWorkspacePath> {
	const target = await resolveCanonicalWorkspacePath({
		workspace: options.workspace,
		cwd: options.workspace.root,
		path,
		allowMissing: false,
		allowWorkspaceRoot,
	});
	if (!isPathWithinRoot(options.workspace.root, target.path)) {
		throw new GuardedChildReadError(
			"path_outside_workspace",
			"Child read-only tools cannot inspect paths outside the shared workspace",
		);
	}
	assertNonSensitivePath(options.workspace, target);
	return target;
}

async function collectSearchFiles(
	options: GuardedReadToolOptions,
	root: Readonly<CanonicalWorkspacePath>,
	signal?: AbortSignal,
): Promise<CanonicalWorkspacePath[]> {
	throwIfReadAborted(signal);
	const rootStat = await lstat(root.path);
	if (rootStat.isFile()) return [root];
	if (!rootStat.isDirectory()) return [];
	const files: CanonicalWorkspacePath[] = [];
	const pending = [root.path];
	let visitedEntries = 0;
	while (
		pending.length > 0 &&
		files.length < MAX_SEARCH_FILES &&
		visitedEntries < MAX_SEARCH_ENTRIES
	) {
		throwIfReadAborted(signal);
		const directory = pending.pop()!;
		const current = await canonicalChild(options, directory, true);
		if (current.path !== directory) throw genericReadFailure("find");
		let directoryHandle;
		try {
			directoryHandle = await opendir(directory);
		} catch {
			throw genericReadFailure("find");
		}
		for await (const entry of directoryHandle) {
			throwIfReadAborted(signal);
			visitedEntries += 1;
			if (
				visitedEntries > MAX_SEARCH_ENTRIES ||
				files.length >= MAX_SEARCH_FILES
			) break;
			if (entry.isSymbolicLink()) continue;
			const candidatePath = `${directory}${sep}${entry.name}`;
			if (isSensitiveWorkspacePath(options.workspace, candidatePath)) continue;
			if (entry.isDirectory()) pending.push(candidatePath);
			else if (entry.isFile()) files.push(await canonicalChild(options, candidatePath));
		}
	}
	return files;
}

interface ProtectedGrepResult {
	lines: string[];
	matches: number;
	matchLimitReached: boolean;
	outputLimitReached: boolean;
	linesTruncated: boolean;
}

function protectedGrep(
	root: Readonly<CanonicalWorkspacePath>,
	params: GrepToolInput,
	signal: AbortSignal | undefined,
): Promise<ProtectedGrepResult> {
	const context = Math.min(
		MAX_GREP_CONTEXT_LINES,
		Math.max(0, Math.floor(params.context ?? 0)),
	);
	const limit = Math.min(
		MAX_GREP_MATCHES,
		Math.max(1, Math.floor(params.limit ?? 100)),
	);
	const args = [
		"--no-config",
		"--line-number",
		"--color=never",
		"--hidden",
		"--no-heading",
		"--with-filename",
		"--no-messages",
		"--max-filesize",
		String(MAX_SEARCH_FILE_BYTES),
		"--max-columns",
		"500",
		"--max-columns-preview",
	];
	if (params.ignoreCase) args.push("--ignore-case");
	if (params.literal) args.push("--fixed-strings");
	if (context > 0) args.push("--context", String(context));
	if (params.glob) args.push("--glob", params.glob);
	for (const glob of PROTECTED_SEARCH_GLOBS) args.push("--iglob", glob);
	args.push("--", params.pattern, root.path);

	return new Promise((resolvePromise, rejectPromise) => {
		if (signal?.aborted) {
			rejectPromise(new Error("Operation aborted"));
			return;
		}
		const child = spawn("rg", args, {
			env: protectedSearchEnvironment(process.env),
			stdio: ["ignore", "pipe", "ignore"],
		});
		let pending = "";
		let settled = false;
		let intentionallyKilled = false;
		let matches = 0;
		let outputLimitReached = false;
		let linesTruncated = false;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const lines: string[] = [];
		const settle = (operation: () => void): void => {
			if (settled) return;
			settled = true;
			signal?.removeEventListener("abort", onAbort);
			if (killTimer !== undefined) clearTimeout(killTimer);
			operation();
		};
		const stop = (): void => {
			child.kill("SIGTERM");
			if (killTimer === undefined) {
				killTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
			}
		};
		const onAbort = (): void => stop();
		const normalizeLine = (rawLine: string): string => {
			let line = rawLine.replace(/\r$/u, "");
			const directoryPrefix = `${root.path}${sep}`;
			if (line.startsWith(directoryPrefix)) line = line.slice(directoryPrefix.length);
			else if (line.startsWith(`${root.path}:`) || line.startsWith(`${root.path}-`)) {
				line = `${basename(root.path)}${line.slice(root.path.length)}`;
			}
			const truncated = truncateLine(safeDisplayPath(line), 500);
			if (truncated.wasTruncated) linesTruncated = true;
			return truncated.text;
		};
		const acceptLine = (rawLine: string): void => {
			if (settled || intentionallyKilled) return;
			const line = normalizeLine(rawLine);
			if (/:[0-9]+:/u.test(line)) matches += 1;
			if (lines.length < MAX_GREP_OUTPUT_LINES) lines.push(line);
			else outputLimitReached = true;
			if (matches >= limit || outputLimitReached) {
				intentionallyKilled = true;
				stop();
			}
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		child.stdout?.on("data", (chunk: Buffer) => {
			pending += chunk.toString("utf8");
			let newline = pending.indexOf("\n");
			while (newline >= 0) {
				acceptLine(pending.slice(0, newline));
				pending = pending.slice(newline + 1);
				newline = pending.indexOf("\n");
			}
		});
		child.on("error", () => {
			settle(() => rejectPromise(genericReadFailure("grep")));
		});
		child.on("close", (code) => {
			if (pending) acceptLine(pending);
			settle(() => {
				if (signal?.aborted) {
					rejectPromise(new Error("Operation aborted"));
					return;
				}
				if (!intentionallyKilled && code !== 0 && code !== 1) {
					rejectPromise(genericReadFailure("grep"));
					return;
				}
				resolvePromise({
					lines,
					matches,
					matchLimitReached: matches >= limit,
					outputLimitReached,
					linesTruncated,
				});
			});
		});
	});
}

/** Same-name grep override using ripgrep with protected-path exclusions. */
export function createGuardedChildGrepTool(
	options: GuardedReadToolOptions,
): ReturnType<typeof createGrepToolDefinition> {
	const metadata = createGrepToolDefinition(options.cwd);
	return {
		...metadata,
		description:
			"Search nonsecret text files inside the canonical shared workspace. Protected paths and escaping symlinks are excluded; output remains bounded and no tool download is attempted.",
		async execute(_toolCallId, params: GrepToolInput, signal) {
			throwIfReadAborted(signal);
			const root = await resolveExistingReadPath(options, params.path || ".", true);
			throwIfReadAborted(signal);
			try {
				const result = await protectedGrep(root, params, signal);
				if (result.matches === 0) {
					return { content: [{ type: "text" as const, text: "No matches found" }], details: undefined };
				}
				const truncation = truncateHead(result.lines.join("\n"));
				const notices: string[] = [];
				const details: {
					matchLimitReached?: number;
					truncation?: typeof truncation;
					linesTruncated?: boolean;
				} = {};
				if (result.matchLimitReached) {
					details.matchLimitReached = Math.min(
						MAX_GREP_MATCHES,
						Math.max(1, Math.floor(params.limit ?? 100)),
					);
					notices.push(`${details.matchLimitReached} matches limit reached`);
				}
				if (result.outputLimitReached || truncation.truncated) {
					details.truncation = truncation;
					notices.push("output limit reached");
				}
				if (result.linesTruncated) {
					details.linesTruncated = true;
					notices.push("some lines truncated");
				}
				let text = truncation.content;
				if (notices.length > 0) text += `\n\n[${notices.join(". ")}]`;
				return {
					content: [{ type: "text" as const, text }],
					details: Object.keys(details).length > 0 ? details : undefined,
				};
			} catch (error) {
				if (error instanceof GuardedChildReadError) throw error;
				if (signal?.aborted) throw new Error("Operation aborted");
				throw genericReadFailure("grep");
			}
		},
	};
}

/** Same-name find override whose walker skips protected paths and symlinks. */
export function createGuardedChildFindTool(
	options: GuardedReadToolOptions,
): ReturnType<typeof createFindToolDefinition> {
	const metadata = createFindToolDefinition(options.cwd);
	return {
		...metadata,
		description:
			"Find files inside the canonical shared workspace. Protected paths and symlinks are excluded; output remains bounded.",
		async execute(toolCallId, params: FindToolInput, signal, onUpdate, ctx) {
			throwIfReadAborted(signal);
			const root = await resolveExistingReadPath(options, params.path || ".", true);
			throwIfReadAborted(signal);
			const delegated = createFindToolDefinition(options.cwd, {
				operations: {
					exists: async (path) => path === root.path,
					glob: async (pattern, cwd, globOptions) => {
						if (cwd !== root.path) throw genericReadFailure("find");
						const matches: string[] = [];
						for (const file of await collectSearchFiles(options, root, signal)) {
							const relativePath = root.path === file.path
								? basename(file.path)
								: relative(root.path, file.path).split(sep).join("/");
							if (matchesRequestedGlob(relativePath, pattern)) matches.push(file.path);
							if (matches.length >= globOptions.limit) break;
						}
						return matches;
					},
				},
			});
			try {
				return await delegated.execute(
					toolCallId,
					{ ...params, path: root.path },
					signal,
					onUpdate,
					ctx,
				);
			} catch (error) {
				if (error instanceof GuardedChildReadError) throw error;
				if (signal?.aborted) throw new Error("Operation aborted");
				throw genericReadFailure("find");
			}
		},
	};
}

/** Same-name ls override whose listing omits protected entries and symlinks. */
export function createGuardedChildLsTool(
	options: GuardedReadToolOptions,
): ReturnType<typeof createLsToolDefinition> {
	const metadata = createLsToolDefinition(options.cwd);
	return {
		...metadata,
		description:
			"List one directory inside the canonical shared workspace. Protected entries and symlinks are omitted; output remains bounded.",
		async execute(toolCallId, params: LsToolInput, signal, onUpdate, ctx) {
			throwIfReadAborted(signal);
			const root = await resolveExistingReadPath(options, params.path || ".", true);
			throwIfReadAborted(signal);
			const delegated = createLsToolDefinition(options.cwd, {
				operations: {
					exists: async (path) => path === root.path,
					stat: async (path) => {
						if (path === root.path) return stat(path);
						if (!isPathWithinRoot(root.path, path) || isSensitiveWorkspacePath(options.workspace, path)) {
							throw genericReadFailure("ls");
						}
						return lstat(path);
					},
					readdir: async (path) => {
						if (path !== root.path) throw genericReadFailure("ls");
						const names: string[] = [];
						const requestedLimit = Math.min(
							MAX_SEARCH_ENTRIES,
							Math.max(1, Math.floor(params.limit ?? 500)) + 1,
						);
						const directoryHandle = await opendir(path);
						for await (const entry of directoryHandle) {
							throwIfReadAborted(signal);
							if (
								!entry.isSymbolicLink() &&
								!isSensitiveWorkspacePath(options.workspace, `${path}${sep}${entry.name}`)
							) names.push(entry.name);
							if (names.length >= requestedLimit) break;
						}
						return names;
					},
				},
			});
			try {
				return await delegated.execute(
					toolCallId,
					{ ...params, path: root.path },
					signal,
					onUpdate,
					ctx,
				);
			} catch (error) {
				if (error instanceof GuardedChildReadError) throw error;
				if (signal?.aborted) throw new Error("Operation aborted");
				throw genericReadFailure("ls");
			}
		},
	};
}
