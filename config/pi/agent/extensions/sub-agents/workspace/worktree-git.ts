import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
	access,
	lstat,
	mkdir,
	open,
	readdir,
	readlink,
	realpath,
	stat,
	symlink,
	type FileHandle,
} from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const GENERATED_FULL_REF = /^refs\/heads\/pi\/sub-agents\/([0-9a-f]{16})\/(saw1-[A-Za-z0-9_-]{32,180})$/u;
const GENERIC_FULL_BRANCH = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,510}$/u;
const CONFIG_KEY = /^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$/u;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_TREE_ENTRIES = 100_000;
const DEFAULT_MAX_BLOB_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BLOB_BYTES = 256 * 1024 * 1024;
const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_REASON_CHARS = 200;
const POSITIVE_ENVIRONMENT = Object.freeze([
	"PATH", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC", "LANG", "LC_ALL", "LC_CTYPE",
] as const);

export type GitObjectId = string;
export type GitTreeMode = "100644" | "100755" | "120000" | "160000";
export type GitTreeObjectType = "blob" | "commit";

export interface GitTreeEntry {
	readonly mode: GitTreeMode;
	readonly type: GitTreeObjectType;
	readonly oid: GitObjectId;
	readonly path: string;
}

export interface GitIndexEntry {
	readonly mode: GitTreeMode;
	readonly oid: GitObjectId;
	readonly stage: 0;
	readonly path: string;
}

export interface GitWorktreeEntry {
	readonly path: string;
	readonly head: GitObjectId;
	readonly branch?: string;
	readonly detached?: true;
	readonly bare?: true;
	readonly locked?: true | string;
	readonly prunable?: true | string;
}

export interface GitConfigEntry {
	readonly scope: "local" | "worktree";
	readonly key: string;
	readonly value: string;
}

export interface RepositoryInspection {
	readonly trusted: true;
	readonly insideWorkTree: true;
	readonly bare: false;
	readonly topLevel: string;
	readonly commonDirectory: string;
	readonly headCommit: GitObjectId;
	readonly objectFormat: "sha1" | "sha256";
	readonly clean: true;
	readonly configFingerprint: string;
}

export interface RegisteredNoCheckoutWorktree {
	readonly path: string;
	readonly branchRef: string;
	readonly baseCommit: GitObjectId;
	readonly locked: true;
}

export interface MaterializedWorktree {
	readonly path: string;
	readonly branchRef: string;
	readonly baseCommit: GitObjectId;
	readonly entryCount: number;
	readonly blobCount: number;
}

export interface WorktreeInspection {
	readonly registered: boolean;
	readonly registration?: GitWorktreeEntry;
	readonly head?: GitObjectId;
	readonly branchRef?: string;
	readonly refCommit?: GitObjectId;
	readonly clean?: boolean;
	readonly indexMatchesBase?: boolean;
}

export interface WorktreeReconciliation {
	readonly pathExists: boolean;
	readonly branchExists: boolean;
	readonly branchCommit?: GitObjectId;
	readonly registration?: GitWorktreeEntry;
	readonly exact: boolean;
	readonly inspection?: WorktreeInspection;
}

export type WorktreeGitErrorCode =
	| "invalid_input"
	| "git_unavailable"
	| "git_failed"
	| "git_timeout"
	| "cancelled"
	| "output_limit"
	| "ineligible_repository"
	| "unsafe_repository"
	| "malformed_output"
	| "worktree_mismatch"
	| "materialization_failed"
	| "unsupported_platform";

export class WorktreeGitError extends Error {
	readonly code: WorktreeGitErrorCode;
	constructor(code: WorktreeGitErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "WorktreeGitError";
		this.code = code;
	}
}

export interface GitOperationOptions {
	readonly signal?: AbortSignal;
	readonly timeoutMs?: number;
}

export interface InspectRepositoryOptions extends GitOperationOptions {
	readonly cwd: string;
	/** The caller's already-established Pi project trust decision. */
	readonly trusted: boolean;
}

export interface RegisterNoCheckoutWorktreeOptions extends GitOperationOptions {
	readonly repository: Readonly<RepositoryInspection>;
	readonly path: string;
	readonly branchRef: string;
	readonly baseCommit: GitObjectId;
	readonly lockReason: string;
}

export interface MaterializeTreeOptions extends GitOperationOptions {
	readonly repository: Readonly<RepositoryInspection>;
	readonly worktree: Readonly<RegisteredNoCheckoutWorktree>;
}

export interface ListWorktreesOptions extends GitOperationOptions {
	readonly repository: Readonly<RepositoryInspection>;
}

export interface InspectWorktreeOptions extends GitOperationOptions {
	readonly repository: Readonly<RepositoryInspection>;
	readonly path: string;
	readonly expectedBranchRef?: string;
	readonly expectedBaseCommit?: GitObjectId;
}

export interface ReconcileWorktreeOptions extends GitOperationOptions {
	readonly repository: Readonly<RepositoryInspection>;
	readonly path: string;
	readonly branchRef: string;
	readonly baseCommit: GitObjectId;
}

/** Closed production grammar. It deliberately has no generic runGit escape hatch. */
export interface WorktreeGitOperations {
	inspectRepository(options: InspectRepositoryOptions): Promise<RepositoryInspection>;
	registerNoCheckoutWorktree(options: RegisterNoCheckoutWorktreeOptions): Promise<RegisteredNoCheckoutWorktree>;
	materializeTree(options: MaterializeTreeOptions): Promise<MaterializedWorktree>;
	listWorktrees(options: ListWorktreesOptions): Promise<readonly GitWorktreeEntry[]>;
	inspectWorktree(options: InspectWorktreeOptions): Promise<WorktreeInspection>;
	reconcileWorktree(options: ReconcileWorktreeOptions): Promise<WorktreeReconciliation>;
	collectSummary(options: InspectWorktreeOptions): Promise<WorktreeInspection>;
}

export interface CreateWorktreeGitOperationsOptions {
	/** Captured once by the caller at extension startup. Later process.env changes are ignored. */
	readonly operationalEnvironment?: Readonly<NodeJS.ProcessEnv>;
	/** Existing extension-owned private directories. Symlinks and group/world access are rejected on POSIX. */
	readonly privateHomeDirectory: string;
	readonly privateTemporaryDirectory: string;
	readonly emptyHooksDirectory: string;
	readonly defaultTimeoutMs?: number;
	readonly maxOutputBytes?: number;
	readonly maxTreeEntries?: number;
	readonly maxBlobBytes?: number;
	readonly maxTotalBlobBytes?: number;
}

function fail(code: WorktreeGitErrorCode, message: string, cause?: unknown): never {
	throw new WorktreeGitError(code, message, cause === undefined ? undefined : { cause });
}

function strictUtf8(value: Uint8Array, label: string): string {
	try {
		return UTF8.decode(value);
	} catch (error) {
		fail("malformed_output", `${label} is not valid UTF-8`, error);
	}
}

export function validateGitObjectId(value: unknown): GitObjectId {
	if (typeof value !== "string" || !OBJECT_ID.test(value)) fail("invalid_input", "Git object ID is invalid");
	return value;
}

function validateOidForFormat(value: unknown, format: "sha1" | "sha256"): GitObjectId {
	const oid = validateGitObjectId(value);
	if (oid.length !== (format === "sha1" ? 40 : 64)) fail("invalid_input", "Git object ID does not match the repository format");
	return oid;
}

function validateGeneratedBranchRef(value: unknown): { full: string; short: string } {
	if (typeof value !== "string" || value.length > 512 || !GENERATED_FULL_REF.test(value) || value.includes("..")) {
		fail("invalid_input", "Generated worktree branch ref is invalid");
	}
	return { full: value, short: value.slice("refs/heads/".length) };
}

function validateReportedBranchRef(value: string): string {
	if (!GENERIC_FULL_BRANCH.test(value) || value.includes("..") || value.includes("//") || value.endsWith(".") || value.endsWith("/")) {
		fail("malformed_output", "Git reported an invalid full branch ref");
	}
	return value;
}

function validateTreePath(value: string): string {
	if (!value || value.length > 4096 || value.includes("\0") || value.includes("\\") || isAbsolute(value)) {
		fail("malformed_output", "Git tree path is invalid");
	}
	if (Buffer.byteLength(value, "utf8") > 16 * 1024 || value !== value.normalize("NFC")) {
		fail("malformed_output", "Git tree path has an unsupported encoding or length");
	}
	const parts = value.split("/");
	if (parts.some((part) => !part || part === "." || part === ".." || part.normalize("NFC").toLocaleLowerCase("en-US") === ".git")) {
		fail("malformed_output", "Git tree path is unsafe");
	}
	return value;
}

export function parseWorktreePorcelainZ(input: Uint8Array): readonly GitWorktreeEntry[] {
	const buffer = Buffer.from(input);
	if (buffer.length < 2 || buffer.at(-1) !== 0 || buffer.at(-2) !== 0) {
		fail("malformed_output", "Git worktree porcelain output is not double-NUL terminated");
	}
	const text = strictUtf8(buffer, "Git worktree porcelain output");
	const result: GitWorktreeEntry[] = [];
	const seenPaths = new Set<string>();
	let current: Partial<GitWorktreeEntry> | undefined;
	for (const token of text.split("\0")) {
		if (!token) {
			if (!current) continue;
			const identityMarkers = Number(Boolean(current.branch)) + Number(Boolean(current.detached)) + Number(Boolean(current.bare));
			if (!current.path || !current.head || identityMarkers !== 1 || seenPaths.has(current.path)) {
				fail("malformed_output", "Git worktree porcelain record is incomplete or ambiguous");
			}
			seenPaths.add(current.path);
			result.push(Object.freeze(current as GitWorktreeEntry));
			current = undefined;
			continue;
		}
		current ??= {};
		const split = token.indexOf(" ");
		const key = split < 0 ? token : token.slice(0, split);
		const value = split < 0 ? "" : token.slice(split + 1);
		switch (key) {
			case "worktree":
				if (current.path || !isAbsolute(value) || value.includes("\0") || resolve(value) !== value) fail("malformed_output", "Git worktree path is invalid");
				current.path = value;
				break;
			case "HEAD":
				if (current.head) fail("malformed_output", "Git worktree HEAD is duplicated");
				current.head = validateGitObjectId(value);
				break;
			case "branch":
				if (current.branch || current.detached) fail("malformed_output", "Git worktree branch is duplicated");
				current.branch = validateReportedBranchRef(value);
				break;
			case "detached":
			case "bare":
				if (value || current[key] || current.branch || (key === "detached" ? current.bare : current.detached)) fail("malformed_output", `Git worktree ${key} marker is invalid`);
				current[key] = true;
				break;
			case "locked":
			case "prunable":
				if (current[key] || value.length > 256 || /[\r\n]/u.test(value)) fail("malformed_output", `Git worktree ${key} reason is invalid`);
				current[key] = value || true;
				break;
			default:
				fail("malformed_output", "Git worktree porcelain contains an unsupported field");
		}
	}
	if (current) fail("malformed_output", "Git worktree porcelain ended inside a record");
	return Object.freeze(result);
}

export function parseLsTreeZ(input: Uint8Array, maxEntries = DEFAULT_MAX_TREE_ENTRIES): readonly GitTreeEntry[] {
	if (!Number.isSafeInteger(maxEntries) || maxEntries < 0 || maxEntries > 1_000_000) fail("invalid_input", "Git tree entry bound is invalid");
	const buffer = Buffer.from(input);
	if (buffer.length && buffer.at(-1) !== 0) fail("malformed_output", "Git ls-tree output is not NUL terminated");
	const entries: GitTreeEntry[] = [];
	const exact = new Set<string>();
	const exactDirectories = new Set<string>();
	const folded = new Set<string>();
	const foldedDirectories = new Set<string>();
	let start = 0;
	for (let cursor = 0; cursor < buffer.length; cursor += 1) {
		if (buffer[cursor] !== 0) continue;
		if (entries.length >= maxEntries) fail("output_limit", "Git tree contains too many entries");
		const record = strictUtf8(buffer.subarray(start, cursor), "Git ls-tree record");
		start = cursor + 1;
		const match = /^(100644|100755|120000) blob ([0-9a-f]+)\t(.+)$|^(160000) commit ([0-9a-f]+)\t(.+)$/u.exec(record);
		if (!match) fail("malformed_output", "Git ls-tree record is malformed or has an unsupported mode");
		const mode = (match[1] ?? match[4]) as GitTreeMode;
		const type = (match[1] ? "blob" : "commit") as GitTreeObjectType;
		const oid = validateGitObjectId(match[2] ?? match[5]);
		const path = validateTreePath(match[3] ?? match[6]);
		const segments = path.split("/");
		const collisionKey = path.normalize("NFC").toLocaleLowerCase("en-US");
		if (exact.has(path) || exactDirectories.has(path) || folded.has(collisionKey) || foldedDirectories.has(collisionKey)) {
			fail("malformed_output", "Git tree has a duplicate, case, normalization, or file/directory collision");
		}
		for (let index = 1; index < segments.length; index += 1) {
			const parent = segments.slice(0, index).join("/");
			const foldedParent = parent.normalize("NFC").toLocaleLowerCase("en-US");
			if (exact.has(parent) || folded.has(foldedParent)) fail("malformed_output", "Git tree has a file/directory collision");
			exactDirectories.add(parent);
			foldedDirectories.add(foldedParent);
		}
		exact.add(path);
		folded.add(collisionKey);
		entries.push(Object.freeze({ mode, type, oid, path }));
	}
	return Object.freeze(entries);
}

export function assertOrdinaryIndexFlags(input: Uint8Array, maxEntries = DEFAULT_MAX_TREE_ENTRIES): void {
	const buffer = Buffer.from(input);
	if (buffer.length && buffer.at(-1) !== 0) fail("malformed_output", "Git index-flag output is not NUL terminated");
	let count = 0;
	let start = 0;
	for (let cursor = 0; cursor < buffer.length; cursor += 1) {
		if (buffer[cursor] !== 0) continue;
		if (count >= maxEntries) fail("output_limit", "Git index contains too many flagged entries");
		const record = strictUtf8(buffer.subarray(start, cursor), "Git index-flag record");
		start = cursor + 1;
		if (!record.startsWith("H ")) fail("unsafe_repository", "Assume-unchanged, skip-worktree, or non-ordinary index flags are unsupported");
		validateTreePath(record.slice(2));
		count += 1;
	}
}

export function parseIndexEntriesZ(input: Uint8Array, maxEntries = DEFAULT_MAX_TREE_ENTRIES): readonly GitIndexEntry[] {
	const buffer = Buffer.from(input);
	if (buffer.length && buffer.at(-1) !== 0) fail("malformed_output", "Git index output is not NUL terminated");
	const result: GitIndexEntry[] = [];
	let start = 0;
	for (let cursor = 0; cursor < buffer.length; cursor += 1) {
		if (buffer[cursor] !== 0) continue;
		if (result.length >= maxEntries) fail("output_limit", "Git index contains too many entries");
		const record = strictUtf8(buffer.subarray(start, cursor), "Git index record");
		start = cursor + 1;
		const match = /^(100644|100755|120000|160000) ([0-9a-f]+) ([0-3])\t(.+)$/u.exec(record);
		if (!match || match[3] !== "0") fail("malformed_output", "Git index entry is malformed or conflicted");
		result.push(Object.freeze({ mode: match[1] as GitTreeMode, oid: validateGitObjectId(match[2]), stage: 0, path: validateTreePath(match[4]) }));
	}
	return Object.freeze(result);
}

export function parseCatFileBatch(
	input: Uint8Array,
	expectedObjectIds: readonly string[],
	limits: { readonly maxBlobBytes?: number; readonly maxTotalBytes?: number } = {},
): ReadonlyMap<GitObjectId, Buffer> {
	if (!Array.isArray(expectedObjectIds) || expectedObjectIds.length > DEFAULT_MAX_TREE_ENTRIES) fail("invalid_input", "Expected Git object list is invalid");
	const expected = expectedObjectIds.map(validateGitObjectId);
	if (new Set(expected).size !== expected.length) fail("invalid_input", "Expected Git object IDs are not unique");
	const maxBlobBytes = limits.maxBlobBytes ?? DEFAULT_MAX_BLOB_BYTES;
	const maxTotalBytes = limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BLOB_BYTES;
	if (!Number.isSafeInteger(maxBlobBytes) || maxBlobBytes < 0 || !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 0) {
		fail("invalid_input", "Git blob bounds are invalid");
	}
	const buffer = Buffer.from(input);
	if (buffer.length > maxTotalBytes + expected.length * 128) fail("output_limit", "Git object output exceeds its bound");
	const objects = new Map<GitObjectId, Buffer>();
	let offset = 0;
	let total = 0;
	for (const expectedOid of expected) {
		const newline = buffer.indexOf(10, offset);
		if (newline < 0) fail("malformed_output", "Git cat-file batch header is unterminated");
		const header = strictUtf8(buffer.subarray(offset, newline), "Git cat-file batch header");
		const match = /^([0-9a-f]+) blob ([0-9]+)$/u.exec(header);
		if (!match || validateGitObjectId(match[1]) !== expectedOid) fail("malformed_output", "Git cat-file batch header is malformed or out of order");
		const size = Number(match[2]);
		if (!Number.isSafeInteger(size) || size < 0 || size > maxBlobBytes || total + size > maxTotalBytes) fail("output_limit", "Git blob exceeds its configured bound");
		const contentStart = newline + 1;
		const contentEnd = contentStart + size;
		if (contentEnd >= buffer.length || buffer[contentEnd] !== 10) fail("malformed_output", "Git cat-file batch framing is malformed");
		objects.set(expectedOid, Buffer.from(buffer.subarray(contentStart, contentEnd)));
		total += size;
		offset = contentEnd + 1;
	}
	if (offset !== buffer.length) fail("malformed_output", "Git cat-file batch output contains trailing data");
	return objects;
}

function parseConfigListZ(input: Uint8Array, scope: "local" | "worktree"): readonly GitConfigEntry[] {
	const buffer = Buffer.from(input);
	if (buffer.length > MAX_CONFIG_BYTES) fail("output_limit", "Git configuration output exceeds its bound");
	if (buffer.length && buffer.at(-1) !== 0) fail("malformed_output", "Git configuration output is not NUL terminated");
	const result: GitConfigEntry[] = [];
	for (const token of strictUtf8(buffer, "Git configuration output").split("\0")) {
		if (!token) continue;
		const newline = token.indexOf("\n");
		const key = newline < 0 ? token : token.slice(0, newline);
		const value = newline < 0 ? "" : token.slice(newline + 1);
		if (!CONFIG_KEY.test(key) || key.length > 512 || value.length > 64 * 1024) fail("malformed_output", "Git configuration entry is malformed");
		result.push(Object.freeze({ scope, key: key.toLowerCase(), value }));
		if (result.length > 20_000) fail("output_limit", "Git configuration has too many entries");
	}
	return Object.freeze(result);
}

function configBoolean(value: string): boolean | undefined {
	const normalized = value.trim().toLowerCase();
	if (["true", "yes", "on", "1", ""].includes(normalized)) return true;
	if (["false", "no", "off", "0"].includes(normalized)) return false;
	return undefined;
}

function assertSafeConfiguration(entries: readonly GitConfigEntry[]): void {
	for (const { key, value } of entries) {
		if (key === "include.path" || key.startsWith("includeif.")) fail("unsafe_repository", "Git configuration includes are unsupported");
		if (/^filter\..+\.(?:clean|smudge|process|required)$/u.test(key)) fail("unsafe_repository", "Configured Git filters are unsupported");
		if (key === "core.fsmonitor" && configBoolean(value) !== false) fail("unsafe_repository", "Executable Git fsmonitor configuration is unsupported");
		if (key === "core.filemode" && configBoolean(value) !== true) fail("unsafe_repository", "Disabled Git file-mode tracking is unsupported");
		if (key === "core.ignorestat" && configBoolean(value) !== false) fail("unsafe_repository", "Git ignore-stat mode is unsupported");
		if (key === "core.trustctime" && configBoolean(value) !== true) fail("unsafe_repository", "Disabled Git ctime validation is unsupported");
		if (key === "core.checkstat" && value.trim().toLowerCase() !== "default") fail("unsafe_repository", "Reduced Git stat validation is unsupported");
		if (key === "diff.external" || /^diff\..+\.(?:command|textconv)$/u.test(key)) fail("unsafe_repository", "External Git diff configuration is unsupported");
		if (/^merge\..+\.driver$/u.test(key)) fail("unsafe_repository", "Custom Git merge drivers are unsupported");
		if (key === "extensions.partialclone" || /^remote\..+\.(?:promisor|partialclonefilter)$/u.test(key)) fail("unsafe_repository", "Partial clone configuration is unsupported");
		if ((key === "core.sparsecheckout" || key === "core.sparsecheckoutcone") && configBoolean(value) !== false) fail("unsafe_repository", "Sparse checkout configuration is unsupported");
		if (["core.worktree", "core.hookspath", "core.attributesfile", "core.excludesfile", "core.alternaterefscommand", "core.sshcommand"].includes(key)) {
			fail("unsafe_repository", "Unsafe Git path or executable indirection is unsupported");
		}
		if (/^submodule\..+\.update$/u.test(key) && value.trim().startsWith("!")) fail("unsafe_repository", "Executable submodule update configuration is unsupported");
		if (
			key.startsWith("alias.") ||
			key === "core.pager" || key.startsWith("pager.") ||
			key === "core.editor" || key === "sequence.editor" || key === "interactive.difffilter" ||
			key === "credential.helper" || /^credential\..+\.helper$/u.test(key) ||
			key === "gpg.program" || /^gpg\..+\.program$/u.test(key)
		) fail("unsafe_repository", "Executable Git helper configuration is unsupported");
	}
}

function isWithin(root: string, candidate: string): boolean {
	const rel = relative(root, candidate);
	return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function requireAbsolutePath(value: unknown, label: string): string {
	if (typeof value !== "string" || !value || value.length > 16 * 1024 || value.includes("\0") || !isAbsolute(value)) fail("invalid_input", `${label} is invalid`);
	return resolve(value);
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) fail("cancelled", "The local Git operation was cancelled", signal.reason);
}

async function canonicalPrivateDirectory(path: string, empty: boolean): Promise<string> {
	const absolute = requireAbsolutePath(path, "Private Git directory");
	let metadata;
	let canonicalMetadata;
	let canonical;
	try {
		metadata = await lstat(absolute);
		canonical = await realpath(absolute);
		canonicalMetadata = await stat(canonical);
	} catch (error) {
		fail("invalid_input", "A required private Git directory is unavailable", error);
	}
	if (!metadata.isDirectory() || metadata.isSymbolicLink() || !canonicalMetadata.isDirectory() || canonical !== absolute || metadata.dev !== canonicalMetadata.dev || metadata.ino !== canonicalMetadata.ino) fail("invalid_input", "A required private Git directory has unsafe provenance");
	if (typeof process.geteuid === "function") {
		if (metadata.uid !== process.geteuid() || (metadata.mode & 0o077) !== 0) fail("invalid_input", "A required private Git directory is not private to the effective user");
	}
	if (empty && (await readdir(canonical)).length !== 0) fail("invalid_input", "The Git hooks directory must be empty");
	return canonical;
}

async function resolveGitExecutable(environment: Readonly<NodeJS.ProcessEnv>): Promise<string> {
	const path = environment.PATH;
	if (typeof path !== "string" || !path || path.includes("\0")) fail("git_unavailable", "The captured operational PATH is unavailable");
	const directories = path.split(delimiter);
	if (directories.some((directory) => !directory || !isAbsolute(directory))) fail("git_unavailable", "The captured operational PATH contains an unsafe entry");
	const suffixes = process.platform === "win32"
		? (environment.PATHEXT ?? ".EXE").split(";").filter((value) => /^\.[A-Za-z0-9]+$/u.test(value))
		: [""];
	for (const directory of directories) {
		for (const suffix of suffixes) {
			const candidate = join(directory, `git${suffix}`);
			try {
				await access(candidate, constants.X_OK);
				const pinned = await realpath(candidate);
				const metadata = await stat(pinned);
				if (metadata.isFile()) return pinned;
			} catch {
				// Continue through the captured, absolute PATH.
			}
		}
	}
	fail("git_unavailable", "A regular executable Git binary was not found on the captured operational PATH");
}

interface ExecutorContext {
	readonly executable: string;
	readonly environment: NodeJS.ProcessEnv;
	readonly prefix: readonly string[];
	readonly timeoutMs: number;
	readonly maxOutputBytes: number;
	readonly maxTreeEntries: number;
	readonly maxBlobBytes: number;
	readonly maxTotalBlobBytes: number;
}

async function executeGit(
	context: ExecutorContext,
	cwd: string,
	args: readonly string[],
	options: GitOperationOptions & {
		readonly input?: Buffer;
		readonly allowedExitCodes?: readonly number[];
	} = {},
): Promise<{ readonly stdout: Buffer; readonly stderr: Buffer; readonly exitCode: number }> {
	throwIfAborted(options.signal);
	const timeout = options.timeoutMs ?? context.timeoutMs;
	if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 120_000) fail("invalid_input", "Git timeout is outside the supported bound");
	if (options.input && options.input.length > context.maxOutputBytes) fail("output_limit", "Git input exceeds its configured bound");
	return await new Promise((resolvePromise, rejectPromise) => {
		let child;
		try {
			child = execFile(context.executable, [...context.prefix, ...args], {
				cwd,
				env: context.environment,
				encoding: null,
				timeout,
				maxBuffer: context.maxOutputBytes,
				windowsHide: true,
				shell: false,
				...(options.signal ? { signal: options.signal } : {}),
			}, (error, stdout, stderr) => {
				if (!error) {
					resolvePromise({ stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode: 0 });
					return;
				}
				const candidate = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: string | number };
				if (typeof candidate.code === "number" && options.allowedExitCodes?.includes(candidate.code)) {
					resolvePromise({ stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode: candidate.code });
					return;
				}
				if (options.signal?.aborted || candidate.name === "AbortError" || candidate.code === "ABORT_ERR") {
					rejectPromise(new WorktreeGitError("cancelled", "The local Git operation was cancelled", { cause: error }));
				} else if (candidate.killed || candidate.signal === "SIGTERM") {
					rejectPromise(new WorktreeGitError("git_timeout", "The local Git operation exceeded its time bound", { cause: error }));
				} else if (candidate.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
					rejectPromise(new WorktreeGitError("output_limit", "The local Git operation exceeded its output bound", { cause: error }));
				} else {
					rejectPromise(new WorktreeGitError("git_failed", "The allowlisted local Git operation failed", { cause: error }));
				}
			});
		} catch (error) {
			rejectPromise(new WorktreeGitError("git_failed", "The allowlisted local Git operation could not start", { cause: error }));
			return;
		}
		if (options.input) {
			child.stdin?.on("error", () => { /* callback observes process failure */ });
			child.stdin?.end(options.input);
		}
	});
}

function oneLineOutput(buffer: Buffer, label: string): string {
	const value = strictUtf8(buffer, label).replace(/\r?\n$/u, "");
	if (!value || /[\r\n\0]/u.test(value)) fail("malformed_output", `${label} is malformed`);
	return value;
}

async function pathIsAbsent(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return false;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
		throw error;
	}
}

async function rejectObjectIndirection(commonDirectory: string): Promise<void> {
	const objects = join(commonDirectory, "objects");
	try {
		const metadata = await lstat(objects);
		if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("unsafe_repository", "Git object storage has unsafe indirection");
	} catch (error) {
		if (error instanceof WorktreeGitError) throw error;
		fail("unsafe_repository", "Git object storage could not be inspected", error);
	}
	for (const name of ["alternates", "http-alternates"]) {
		if (!await pathIsAbsent(join(objects, "info", name))) fail("unsafe_repository", "Git object alternates are unsupported");
	}
	const packDirectory = join(objects, "pack");
	let packs: string[] = [];
	try {
		const metadata = await lstat(packDirectory);
		if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("unsafe_repository", "Git pack storage has unsafe indirection");
		packs = await readdir(packDirectory);
	} catch (error) {
		if (error instanceof WorktreeGitError) throw error;
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") fail("unsafe_repository", "Git object storage could not be inspected", error);
	}
	if (packs.length > 100_000 || packs.some((name) => name.endsWith(".promisor"))) fail("unsafe_repository", "Promisor Git object storage is unsupported");
}

function entriesEqual(tree: readonly GitTreeEntry[], index: readonly GitIndexEntry[]): boolean {
	return tree.length === index.length && tree.every((entry, position) => {
		const actual = index[position];
		return actual?.mode === entry.mode && actual.oid === entry.oid && actual.path === entry.path;
	});
}

async function assertEmptyNoCheckoutRoot(path: string): Promise<void> {
	const entries = await readdir(path, { withFileTypes: true });
	if (entries.length !== 1 || entries[0]?.name !== ".git" || !entries[0].isFile() || entries[0].isSymbolicLink()) {
		fail("materialization_failed", "No-checkout worktree contains an unexpected preexisting entry");
	}
	const gitFile = await lstat(join(path, ".git"));
	if (!gitFile.isFile() || gitFile.isSymbolicLink()) fail("materialization_failed", "Linked worktree administrative entry is invalid");
}

interface OpenDirectory {
	readonly handle: FileHandle;
	readonly anchor: string;
}

async function openAnchoredDirectory(path: string): Promise<OpenDirectory> {
	if (process.platform !== "linux") fail("unsupported_platform", "Exact no-follow tree materialization currently requires Linux /proc descriptor paths");
	const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
	const anchor = `/proc/self/fd/${handle.fd}`;
	let linked: string;
	try {
		linked = await realpath(anchor);
	} catch (error) {
		await handle.close();
		fail("unsupported_platform", "Descriptor-anchored filesystem paths are unavailable", error);
	}
	if (linked !== await realpath(path)) {
		await handle.close();
		fail("materialization_failed", "Worktree root identity changed before materialization");
	}
	return { handle, anchor };
}

export function assertMaterializedBlobBudget(
	entries: readonly GitTreeEntry[],
	objects: ReadonlyMap<string, Buffer>,
	maxTotalBytes: number,
): void {
	if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 0) fail("invalid_input", "Materialized blob bound is invalid");
	let total = 0;
	for (const entry of entries) {
		if (entry.mode === "160000") continue;
		const content = objects.get(entry.oid);
		if (!content) fail("materialization_failed", "A required Git blob was not returned");
		total += content.length;
		if (!Number.isSafeInteger(total) || total > maxTotalBytes) fail("output_limit", "Materialized tree blob bytes exceed their bound");
	}
}

async function writeExactTree(
	root: string,
	entries: readonly GitTreeEntry[],
	objects: ReadonlyMap<string, Buffer>,
	signal?: AbortSignal,
): Promise<void> {
	const rootDirectory = await openAnchoredDirectory(root);
	const directories = new Map<string, OpenDirectory>([["", rootDirectory]]);
	try {
		const requireDirectory = async (path: string): Promise<OpenDirectory> => {
			const existing = directories.get(path);
			if (existing) return existing;
			const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
			const name = path.slice(parentPath ? parentPath.length + 1 : 0);
			const parent = await requireDirectory(parentPath);
			const target = join(parent.anchor, name);
			try {
				await mkdir(target, { mode: 0o755 });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
			const metadata = await lstat(target);
			if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("materialization_failed", "A materialized directory collided with an existing entry");
			const opened = await openAnchoredDirectory(target);
			directories.set(path, opened);
			return opened;
		};

		for (const entry of entries) {
			throwIfAborted(signal);
			const slash = entry.path.lastIndexOf("/");
			const parentPath = slash < 0 ? "" : entry.path.slice(0, slash);
			const name = slash < 0 ? entry.path : entry.path.slice(slash + 1);
			const parent = await requireDirectory(parentPath);
			if (entry.mode === "160000") {
				// An uninitialized gitlink is represented by one empty directory. Leaving
				// it absent would make the exact index appear deleted to Git status.
				await requireDirectory(entry.path);
				continue;
			}
			const target = join(parent.anchor, name);
			const content = objects.get(entry.oid);
			if (!content) fail("materialization_failed", "A required Git blob was not returned");
			if (entry.mode === "120000") {
				if (!content.length || content.includes(0)) fail("materialization_failed", "Git symlink target is unsupported");
				try {
					await symlink(content, target);
				} catch (error) {
					fail("materialization_failed", "A Git symlink could not be created exclusively", error);
				}
				const metadata = await lstat(target);
				if (!metadata.isSymbolicLink()) fail("materialization_failed", "A Git symlink was replaced during materialization");
				continue;
			}
			let file: FileHandle;
			try {
				file = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, entry.mode === "100755" ? 0o700 : 0o600);
			} catch (error) {
				fail("materialization_failed", "A Git file could not be created exclusively", error);
			}
			try {
				await file.writeFile(content);
				await file.chmod(entry.mode === "100755" ? 0o755 : 0o644);
				await file.sync();
			} finally {
				await file.close();
			}
		}
	} finally {
		for (const directory of [...directories.values()].reverse()) await directory.handle.close().catch(() => {});
	}
}

async function verifyExactFilesystem(
	root: string,
	entries: readonly GitTreeEntry[],
	objects: ReadonlyMap<string, Buffer>,
): Promise<void> {
	const expected = new Map(entries.map((entry) => [entry.path, entry]));
	const directories = new Set<string>();
	for (const entry of entries) {
		const parts = entry.path.split("/");
		for (let index = 1; index < parts.length; index += 1) directories.add(parts.slice(0, index).join("/"));
		if (entry.mode === "160000") directories.add(entry.path);
	}
	const seen = new Set<string>();
	const rootDirectory = await openAnchoredDirectory(root);
	const walk = async (directory: OpenDirectory, prefix = ""): Promise<void> => {
		for (const item of await readdir(directory.anchor, { withFileTypes: true })) {
			if (!prefix && item.name === ".git") continue;
			const path = prefix ? `${prefix}/${item.name}` : item.name;
			validateTreePath(path);
			const target = join(directory.anchor, item.name);
			const metadata = await lstat(target);
			if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
				if (!directories.has(path)) fail("materialization_failed", "Materialized tree contains an unexpected directory");
				const child = await openAnchoredDirectory(target);
				try {
					const opened = await child.handle.stat();
					if (opened.dev !== metadata.dev || opened.ino !== metadata.ino) fail("materialization_failed", "Materialized directory changed during verification");
					const gitlink = expected.get(path);
					if (gitlink?.mode === "160000") {
						if ((await readdir(child.anchor)).length !== 0) fail("materialization_failed", "Uninitialized gitlink directory is not empty");
						seen.add(path);
					} else {
						await walk(child, path);
					}
				} finally {
					await child.handle.close().catch(() => undefined);
				}
				continue;
			}
			const entry = expected.get(path);
			if (!entry) fail("materialization_failed", "Materialized tree contains an unexpected entry");
			const content = objects.get(entry.oid);
			if (!content) fail("materialization_failed", "Materialized tree is missing object content");
			if (entry.mode === "120000") {
				if (!metadata.isSymbolicLink() || Buffer.compare(await readlink(target, { encoding: "buffer" }), content) !== 0) fail("materialization_failed", "Materialized symlink does not match its Git blob");
				const after = await lstat(target);
				if (!after.isSymbolicLink() || after.dev !== metadata.dev || after.ino !== metadata.ino) fail("materialization_failed", "Materialized symlink changed during verification");
			} else {
				let file: FileHandle | undefined;
				try {
					file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
					const opened = await file.stat();
					if (!opened.isFile() || opened.dev !== metadata.dev || opened.ino !== metadata.ino || Buffer.compare(await file.readFile(), content) !== 0) fail("materialization_failed", "Materialized file does not match its Git blob");
					if (((opened.mode & 0o111) !== 0) !== (entry.mode === "100755")) fail("materialization_failed", "Materialized executable mode does not match the Git tree");
				} finally {
					await file?.close().catch(() => undefined);
				}
			}
			seen.add(path);
		}
	};
	try {
		await walk(rootDirectory);
	} finally {
		await rootDirectory.handle.close().catch(() => undefined);
	}
	if (seen.size !== expected.size) fail("materialization_failed", "Materialized tree is missing a tracked entry");
}

export async function createWorktreeGitOperations(options: CreateWorktreeGitOperationsOptions): Promise<WorktreeGitOperations> {
	if (!options || typeof options !== "object") fail("invalid_input", "Local Git executor options are required");
	const captured = Object.freeze({ ...(options.operationalEnvironment ?? process.env) });
	const [executable, home, temporary, hooks] = await Promise.all([
		resolveGitExecutable(captured),
		canonicalPrivateDirectory(options.privateHomeDirectory, false),
		canonicalPrivateDirectory(options.privateTemporaryDirectory, false),
		canonicalPrivateDirectory(options.emptyHooksDirectory, true),
	]);
	const timeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
	const maxTreeEntries = options.maxTreeEntries ?? DEFAULT_MAX_TREE_ENTRIES;
	const maxBlobBytes = options.maxBlobBytes ?? DEFAULT_MAX_BLOB_BYTES;
	const maxTotalBlobBytes = options.maxTotalBlobBytes ?? DEFAULT_MAX_TOTAL_BLOB_BYTES;
	for (const [value, minimum, maximum, label] of [
		[timeoutMs, 100, 120_000, "timeout"],
		[maxOutputBytes, 64 * 1024, 512 * 1024 * 1024, "output"],
		[maxTreeEntries, 0, 1_000_000, "tree entry"],
		[maxBlobBytes, 0, 512 * 1024 * 1024, "blob"],
		[maxTotalBlobBytes, 0, 1024 * 1024 * 1024, "total blob"],
	] as const) {
		if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail("invalid_input", `Local Git ${label} bound is invalid`);
	}
	const environment: NodeJS.ProcessEnv = {};
	for (const key of POSITIVE_ENVIRONMENT) {
		const value = captured[key];
		if (typeof value === "string" && !value.includes("\0")) environment[key] = value;
	}
	environment.HOME = home;
	environment.USERPROFILE = home;
	environment.XDG_CONFIG_HOME = join(home, ".config");
	environment.TMPDIR = temporary;
	environment.TMP = temporary;
	environment.TEMP = temporary;
	environment.GIT_CONFIG_NOSYSTEM = "1";
	environment.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
	environment.GIT_TERMINAL_PROMPT = "0";
	environment.GIT_NO_LAZY_FETCH = "1";
	environment.GIT_NO_REPLACE_OBJECTS = "1";
	const prefix = Object.freeze([
		"-c", `core.hooksPath=${hooks}`,
		"-c", "core.fsmonitor=false",
		"-c", "core.autocrlf=false",
		"-c", "core.symlinks=true",
		"-c", "commit.gpgsign=false",
		"-c", "tag.gpgsign=false",
		"-c", "protocol.file.allow=never",
		"-c", "submodule.recurse=false",
		"-c", "core.pager=cat",
		"-c", "pager.status=false",
		"-c", "core.editor=false",
		"-c", "gc.auto=0",
		"-c", "maintenance.auto=false",
	]);
	const context: ExecutorContext = Object.freeze({ executable, environment: Object.freeze(environment), prefix, timeoutMs, maxOutputBytes, maxTreeEntries, maxBlobBytes, maxTotalBlobBytes });

	const inspectSafeConfiguration = async (
		cwd: string,
		operation: GitOperationOptions,
	): Promise<readonly GitConfigEntry[]> => {
		const localRaw = (await executeGit(context, cwd, ["config", "--local", "--null", "--list", "--no-includes"], operation)).stdout;
		const local = parseConfigListZ(localRaw, "local");
		const worktreeConfigValues = local
			.filter((entry) => entry.key === "extensions.worktreeconfig")
			.map((entry) => configBoolean(entry.value));
		if (worktreeConfigValues.length > 1 || worktreeConfigValues.some((value) => value === undefined)) {
			fail("unsafe_repository", "Git worktree configuration enablement is ambiguous");
		}
		let worktree: readonly GitConfigEntry[] = [];
		if (worktreeConfigValues[0] === true) {
			const raw = (await executeGit(context, cwd, ["config", "--worktree", "--null", "--list", "--no-includes"], operation)).stdout;
			worktree = parseConfigListZ(raw, "worktree");
		}
		const config = Object.freeze([...local, ...worktree]);
		assertSafeConfiguration(config);
		return config;
	};

	const inspectRepository = async (request: InspectRepositoryOptions): Promise<RepositoryInspection> => {
		if (!request || request.trusted !== true) fail("ineligible_repository", "Worktree mode requires a trusted project decision");
		const cwdInput = requireAbsolutePath(request.cwd, "Repository cwd");
		let cwd: string;
		try {
			cwd = await realpath(cwdInput);
			if (!(await stat(cwd)).isDirectory()) fail("ineligible_repository", "Repository cwd is not a directory");
		} catch (error) {
			if (error instanceof WorktreeGitError) throw error;
			fail("ineligible_repository", "Repository cwd is unavailable", error);
		}
		const run = (args: readonly string[]) => executeGit(context, cwd, args, { signal: request.signal, timeoutMs: request.timeoutMs }).then((result) => oneLineOutput(result.stdout, "Git inspection output"));
		let inside: string, bare: string, topText: string, commonText: string, head: string, formatText: string;
		try {
			[inside, bare, topText, commonText, head, formatText] = await Promise.all([
				run(["rev-parse", "--is-inside-work-tree"]),
				run(["rev-parse", "--is-bare-repository"]),
				run(["rev-parse", "--show-toplevel"]),
				run(["rev-parse", "--git-common-dir"]),
				run(["rev-parse", "--verify", "HEAD^{commit}"]),
				run(["rev-parse", "--show-object-format"]),
			]);
		} catch (error) {
			if (error instanceof WorktreeGitError && ["cancelled", "git_timeout", "output_limit"].includes(error.code)) throw error;
			fail("ineligible_repository", "The current directory is not an inspectable local Git worktree", error);
		}
		if (inside !== "true" || bare !== "false") fail("ineligible_repository", "Worktree mode requires a non-bare Git worktree");
		if (formatText !== "sha1" && formatText !== "sha256") fail("ineligible_repository", "Git object format is unsupported");
		let topLevel: string, commonDirectory: string;
		try {
			topLevel = await realpath(requireAbsolutePath(topText, "Repository top level"));
			const commonCandidate = isAbsolute(commonText) ? commonText : resolve(cwd, commonText);
			commonDirectory = await realpath(commonCandidate);
			if (!(await stat(topLevel)).isDirectory() || !(await stat(commonDirectory)).isDirectory() || !isWithin(topLevel, cwd)) throw new Error("identity mismatch");
		} catch (error) {
			fail("ineligible_repository", "Git repository identity could not be canonicalized", error);
		}
		const headCommit = validateOidForFormat(head, formatText);

		// Inspect and reject executable/config/object indirection before invoking
		// status, because status itself may consult filters, fsmonitor, or lazy
		// object storage in a hostile repository configuration.
		const config = await inspectSafeConfiguration(cwd, { signal: request.signal, timeoutMs: request.timeoutMs });
		await rejectObjectIndirection(commonDirectory);
		const [statusOutput, indexFlagsOutput] = await Promise.all([
			executeGit(context, cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { signal: request.signal, timeoutMs: request.timeoutMs }).then((result) => result.stdout),
			executeGit(context, cwd, ["ls-files", "-v", "-z"], { signal: request.signal, timeoutMs: request.timeoutMs }).then((result) => result.stdout),
		]);
		assertOrdinaryIndexFlags(indexFlagsOutput, context.maxTreeEntries);
		if (statusOutput.length !== 0) fail("ineligible_repository", "Worktree mode requires a clean parent Git worktree");
		const configFingerprint = createHash("sha256").update(JSON.stringify(config)).digest("hex");
		return Object.freeze({ trusted: true, insideWorkTree: true, bare: false, topLevel, commonDirectory, headCommit, objectFormat: formatText, clean: true, configFingerprint });
	};

	const requireRepositoryHandle = (repository: Readonly<RepositoryInspection>): void => {
		if (!repository || repository.trusted !== true || repository.insideWorkTree !== true || repository.bare !== false || repository.clean !== true) {
			fail("invalid_input", "Repository inspection handle is invalid");
		}
		requireAbsolutePath(repository.topLevel, "Repository top level");
		requireAbsolutePath(repository.commonDirectory, "Git common directory");
		if (repository.objectFormat !== "sha1" && repository.objectFormat !== "sha256") fail("invalid_input", "Repository object format is invalid");
		validateOidForFormat(repository.headCommit, repository.objectFormat);
		if (!/^[0-9a-f]{64}$/u.test(repository.configFingerprint)) fail("invalid_input", "Repository configuration fingerprint is invalid");
	};

	const revalidateRepository = async (repository: Readonly<RepositoryInspection>, operation: GitOperationOptions): Promise<void> => {
		requireRepositoryHandle(repository);
		const current = await inspectRepository({ cwd: repository.topLevel, trusted: true, signal: operation.signal, timeoutMs: operation.timeoutMs });
		if (
			current.topLevel !== repository.topLevel ||
			current.commonDirectory !== repository.commonDirectory ||
			current.headCommit !== repository.headCommit ||
			current.objectFormat !== repository.objectFormat ||
			current.configFingerprint !== repository.configFingerprint
		) fail("ineligible_repository", "Repository eligibility changed after inspection");
	};

	const assertWorktreeRepositoryIdentity = async (repository: Readonly<RepositoryInspection>, path: string, operation: GitOperationOptions): Promise<void> => {
		let canonicalPath: string;
		try {
			canonicalPath = await realpath(path);
		} catch (error) {
			fail("worktree_mismatch", "Linked worktree path cannot be canonicalized", error);
		}
		if (canonicalPath !== path) fail("worktree_mismatch", "Linked worktree path changed canonical identity");
		const [topRaw, commonRaw] = await Promise.all([
			executeGit(context, path, ["rev-parse", "--show-toplevel"], operation),
			executeGit(context, path, ["rev-parse", "--git-common-dir"], operation),
		]);
		try {
			const top = await realpath(requireAbsolutePath(oneLineOutput(topRaw.stdout, "Linked worktree top level"), "Linked worktree top level"));
			const commonText = oneLineOutput(commonRaw.stdout, "Linked worktree common directory");
			const common = await realpath(isAbsolute(commonText) ? commonText : resolve(path, commonText));
			if (top !== path || common !== repository.commonDirectory) throw new Error("identity mismatch");
		} catch (error) {
			if (error instanceof WorktreeGitError) throw error;
			fail("worktree_mismatch", "Linked worktree Git identity does not match its repository", error);
		}
	};

	const listWorktrees = async (request: ListWorktreesOptions): Promise<readonly GitWorktreeEntry[]> => {
		requireRepositoryHandle(request.repository);
		const cwd = requireAbsolutePath(request.repository.topLevel, "Repository top level");
		const output = (await executeGit(context, cwd, ["worktree", "list", "--porcelain", "-z"], request)).stdout;
		const entries = parseWorktreePorcelainZ(output);
		const canonicalPaths = new Set<string>();
		for (const entry of entries) {
			validateOidForFormat(entry.head, request.repository.objectFormat);
			let canonical: string;
			try {
				canonical = await realpath(entry.path);
			} catch (error) {
				fail("worktree_mismatch", "A registered worktree path is unavailable", error);
			}
			if (canonical !== entry.path || canonicalPaths.has(canonical)) {
				fail("worktree_mismatch", "Registered worktree paths are aliased or noncanonical");
			}
			canonicalPaths.add(canonical);
		}
		return entries;
	};

	const inspectWorktree = async (request: InspectWorktreeOptions): Promise<WorktreeInspection> => {
		requireRepositoryHandle(request.repository);
		const path = requireAbsolutePath(request.path, "Worktree path");
		const expectedBranch = request.expectedBranchRef === undefined ? undefined : validateGeneratedBranchRef(request.expectedBranchRef).full;
		const expectedBase = request.expectedBaseCommit === undefined ? undefined : validateOidForFormat(request.expectedBaseCommit, request.repository.objectFormat);
		const registration = (await listWorktrees({ repository: request.repository, signal: request.signal, timeoutMs: request.timeoutMs })).find((entry) => resolve(entry.path) === path);
		if (!registration || await pathIsAbsent(path)) return Object.freeze({ registered: false });
		await assertWorktreeRepositoryIdentity(request.repository, path, request);
		await inspectSafeConfiguration(path, request);
		await rejectObjectIndirection(request.repository.commonDirectory);
		let head: GitObjectId | undefined, branchRef: string | undefined, refCommit: GitObjectId | undefined, clean: boolean | undefined, indexMatchesBase: boolean | undefined;
		try {
			const [headRaw, branchRaw, statusRaw, indexRaw, indexFlagsRaw] = await Promise.all([
				executeGit(context, path, ["rev-parse", "--verify", "HEAD^{commit}"], request),
				executeGit(context, path, ["symbolic-ref", "--quiet", "HEAD"], request),
				executeGit(context, path, ["status", "--ignored", "--porcelain=v1", "-z", "--untracked-files=all"], request),
				executeGit(context, path, ["ls-files", "--stage", "-z"], request),
				executeGit(context, path, ["ls-files", "-v", "-z"], request),
			]);
			assertOrdinaryIndexFlags(indexFlagsRaw.stdout, context.maxTreeEntries);
			head = validateOidForFormat(oneLineOutput(headRaw.stdout, "Worktree HEAD"), request.repository.objectFormat);
			branchRef = validateReportedBranchRef(oneLineOutput(branchRaw.stdout, "Worktree branch"));
			clean = statusRaw.stdout.length === 0;
			if (expectedBase) {
				const treeOutput = (await executeGit(context, path, ["ls-tree", "-rz", "--full-tree", expectedBase], request)).stdout;
				indexMatchesBase = entriesEqual(parseLsTreeZ(treeOutput, context.maxTreeEntries), parseIndexEntriesZ(indexRaw.stdout, context.maxTreeEntries));
			}
			if (expectedBranch) {
				const refRaw = await executeGit(context, path, ["rev-parse", "--verify", `${expectedBranch}^{commit}`], request);
				refCommit = validateOidForFormat(oneLineOutput(refRaw.stdout, "Worktree branch commit"), request.repository.objectFormat);
			}
		} catch (error) {
			if (error instanceof WorktreeGitError && ["cancelled", "git_timeout", "output_limit"].includes(error.code)) throw error;
		}
		return Object.freeze({ registered: true, registration, ...(head ? { head } : {}), ...(branchRef ? { branchRef } : {}), ...(refCommit ? { refCommit } : {}), ...(clean !== undefined ? { clean } : {}), ...(indexMatchesBase !== undefined ? { indexMatchesBase } : {}) });
	};

	const registerNoCheckoutWorktree = async (request: RegisterNoCheckoutWorktreeOptions): Promise<RegisteredNoCheckoutWorktree> => {
		throwIfAborted(request.signal);
		await revalidateRepository(request.repository, request);
		const branch = validateGeneratedBranchRef(request.branchRef);
		const baseCommit = validateOidForFormat(request.baseCommit, request.repository.objectFormat);
		if (baseCommit !== request.repository.headCommit) fail("invalid_input", "Worktree base commit does not match the inspected exact HEAD");
		if (typeof request.lockReason !== "string" || !request.lockReason || request.lockReason.length > MAX_REASON_CHARS || /[\0\r\n]/u.test(request.lockReason)) fail("invalid_input", "Worktree lock reason is invalid");
		const path = requireAbsolutePath(request.path, "Worktree destination");
		let parent: string;
		try {
			parent = await realpath(dirname(path));
		} catch (error) {
			fail("invalid_input", "Worktree destination parent is unavailable", error);
		}
		if (dirname(path) !== parent || !await pathIsAbsent(path)) fail("invalid_input", "Worktree destination must be absent beneath a canonical parent");
		const checked = await executeGit(context, request.repository.topLevel, ["check-ref-format", "--branch", branch.short], request);
		if (oneLineOutput(checked.stdout, "Git checked branch") !== branch.short) fail("worktree_mismatch", "Git did not validate the exact generated branch");
		await executeGit(context, request.repository.topLevel, [
			"worktree", "add", "--no-checkout", "--lock", "--reason", request.lockReason,
			"-b", branch.short, path, baseCommit,
		], request);
		let canonical: string;
		try {
			canonical = await realpath(path);
		} catch (error) {
			fail("worktree_mismatch", "Registered worktree destination is unavailable", error);
		}
		if (canonical !== path) fail("worktree_mismatch", "Registered worktree destination changed identity");
		const registration = (await listWorktrees({ repository: request.repository, signal: request.signal, timeoutMs: request.timeoutMs })).filter((entry) => entry.path === canonical);
		if (registration.length !== 1 || registration[0].branch !== branch.full || registration[0].head !== baseCommit || !registration[0].locked) {
			fail("worktree_mismatch", "Registered no-checkout worktree does not match the exact requested identity");
		}
		await assertWorktreeRepositoryIdentity(request.repository, canonical, request);
		await assertEmptyNoCheckoutRoot(canonical);
		return Object.freeze({ path: canonical, branchRef: branch.full, baseCommit, locked: true });
	};

	const materializeTree = async (request: MaterializeTreeOptions): Promise<MaterializedWorktree> => {
		throwIfAborted(request.signal);
		await revalidateRepository(request.repository, request);
		const path = requireAbsolutePath(request.worktree.path, "Worktree path");
		const branchRef = validateGeneratedBranchRef(request.worktree.branchRef).full;
		const baseCommit = validateOidForFormat(request.worktree.baseCommit, request.repository.objectFormat);
		if (baseCommit !== request.repository.headCommit) fail("invalid_input", "Worktree base commit does not match the inspected exact HEAD");
		await assertWorktreeRepositoryIdentity(request.repository, path, request);
		await inspectSafeConfiguration(path, request);
		await rejectObjectIndirection(request.repository.commonDirectory);
		await assertEmptyNoCheckoutRoot(path);
		const registrations = (await listWorktrees({ repository: request.repository, signal: request.signal, timeoutMs: request.timeoutMs })).filter((entry) => entry.path === path);
		if (registrations.length !== 1 || registrations[0].branch !== branchRef || registrations[0].head !== baseCommit || !registrations[0].locked) fail("worktree_mismatch", "Worktree registration changed before materialization");
		await executeGit(context, path, ["read-tree", "--reset", baseCommit], request);
		const treeRaw = (await executeGit(context, path, ["ls-tree", "-rz", "--full-tree", baseCommit], request)).stdout;
		const entries = parseLsTreeZ(treeRaw, context.maxTreeEntries);
		for (const entry of entries) validateOidForFormat(entry.oid, request.repository.objectFormat);
		const objectIds = [...new Set(entries.filter((entry) => entry.type === "blob").map((entry) => entry.oid))];
		const input = objectIds.length ? Buffer.from(`${objectIds.join("\n")}\n`, "ascii") : Buffer.alloc(0);
		const batchRaw = (await executeGit(context, path, ["cat-file", "--batch"], { ...request, input })).stdout;
		const objects = parseCatFileBatch(batchRaw, objectIds, { maxBlobBytes: context.maxBlobBytes, maxTotalBytes: context.maxTotalBlobBytes });
		assertMaterializedBlobBudget(entries, objects, context.maxTotalBlobBytes);
		await writeExactTree(path, entries, objects, request.signal);
		await verifyExactFilesystem(path, entries, objects);
		const [indexRaw, headRaw, branchRaw, refRaw, statusRaw] = await Promise.all([
			executeGit(context, path, ["ls-files", "--stage", "-z"], request),
			executeGit(context, path, ["rev-parse", "--verify", "HEAD^{commit}"], request),
			executeGit(context, path, ["symbolic-ref", "--quiet", "HEAD"], request),
			executeGit(context, path, ["rev-parse", "--verify", `${branchRef}^{commit}`], request),
			executeGit(context, path, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], request),
		]);
		const index = parseIndexEntriesZ(indexRaw.stdout, context.maxTreeEntries);
		if (!entriesEqual(entries, index) || validateOidForFormat(oneLineOutput(headRaw.stdout, "Worktree HEAD"), request.repository.objectFormat) !== baseCommit || oneLineOutput(branchRaw.stdout, "Worktree branch") !== branchRef || validateOidForFormat(oneLineOutput(refRaw.stdout, "Worktree branch commit"), request.repository.objectFormat) !== baseCommit || statusRaw.stdout.length !== 0) {
			fail("worktree_mismatch", "Materialized worktree failed exact index, HEAD, ref, or cleanliness verification");
		}
		const finalRegistration = (await listWorktrees({ repository: request.repository, signal: request.signal, timeoutMs: request.timeoutMs })).filter((entry) => entry.path === path);
		if (finalRegistration.length !== 1 || finalRegistration[0].branch !== branchRef || finalRegistration[0].head !== baseCommit || !finalRegistration[0].locked) fail("worktree_mismatch", "Materialized worktree registration changed during verification");
		return Object.freeze({ path, branchRef, baseCommit, entryCount: entries.length, blobCount: objectIds.length });
	};

	const reconcileWorktree = async (request: ReconcileWorktreeOptions): Promise<WorktreeReconciliation> => {
		requireRepositoryHandle(request.repository);
		const path = requireAbsolutePath(request.path, "Worktree path");
		const branchRef = validateGeneratedBranchRef(request.branchRef).full;
		const baseCommit = validateOidForFormat(request.baseCommit, request.repository.objectFormat);
		const pathExists = !await pathIsAbsent(path);
		const registration = (await listWorktrees({ repository: request.repository, signal: request.signal, timeoutMs: request.timeoutMs })).find((entry) => entry.path === path);
		let branchExists = false;
		let branchCommit: GitObjectId | undefined;
		const branchProbe = await executeGit(
			context,
			request.repository.topLevel,
			["show-ref", "--verify", "--quiet", branchRef],
			{ ...request, allowedExitCodes: [1] },
		);
		if (branchProbe.exitCode === 0) {
			const output = await executeGit(context, request.repository.topLevel, ["rev-parse", "--verify", `${branchRef}^{commit}`], request);
			branchCommit = validateOidForFormat(oneLineOutput(output.stdout, "Worktree branch commit"), request.repository.objectFormat);
			branchExists = true;
		}
		const inspection = pathExists && registration ? await inspectWorktree({ repository: request.repository, path, expectedBranchRef: branchRef, expectedBaseCommit: baseCommit, signal: request.signal, timeoutMs: request.timeoutMs }) : undefined;
		const exact = Boolean(pathExists && branchCommit === baseCommit && registration?.branch === branchRef && registration.head === baseCommit && registration.locked && inspection?.head === baseCommit && inspection.branchRef === branchRef && inspection.refCommit === baseCommit);
		return Object.freeze({ pathExists, branchExists, ...(branchCommit ? { branchCommit } : {}), ...(registration ? { registration } : {}), exact, ...(inspection ? { inspection } : {}) });
	};

	return Object.freeze({ inspectRepository, registerNoCheckoutWorktree, materializeTree, listWorktrees, inspectWorktree, reconcileWorktree, collectSummary: inspectWorktree });
}

// Explicit production parser names, plus the concise names shared with the disposable fixture vocabulary.
export const parseGitWorktreePorcelainZ = parseWorktreePorcelainZ;
export const parseGitLsTreeZ = parseLsTreeZ;
export const parseGitCatFileBatch = parseCatFileBatch;
export const parseGitIndexEntriesZ = parseIndexEntriesZ;
export const assertGitOrdinaryIndexFlags = assertOrdinaryIndexFlags;
export const assertGitMaterializedBlobBudget = assertMaterializedBlobBudget;
