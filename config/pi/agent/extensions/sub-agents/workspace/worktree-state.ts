import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
	lstat,
	mkdir,
	open,
	opendir,
	realpath,
	rename,
	rmdir,
	stat,
	unlink,
	type FileHandle,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";

/** On-disk format and layout version. */
export const WORKTREE_STATE_VERSION = 1 as const;
export const WORKTREE_STATE_RECORD_MAX_BYTES = 32 * 1024;
export const WORKTREE_STATE_DEFAULT_MAX_REPOSITORIES = 128;
export const WORKTREE_STATE_DEFAULT_MAX_RECORDS = 2_048;
export const WORKTREE_STATE_DEFAULT_MAX_RECORDS_PER_REPOSITORY = 512;

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const REPO_KEY = /^[0-9a-f]{64}$/u;
const SESSION_GENERATION = /^sag1-[A-Za-z0-9_-]{1,80}$/u;
const SUB_AGENT_ID = /^sa1-[A-Za-z0-9_-]{1,195}$/u;
const WORKSPACE_ID = /^saw1-[A-Za-z0-9_-]{32,180}$/u;
const WORKSPACE_KEY = /^sawk1-[A-Za-z0-9_-]{32,180}$/u;
const CORRELATION_TOKEN = /^sact1-[A-Za-z0-9_-]{32,180}$/u;
const FULL_BRANCH = /^refs\/heads\/pi\/sub-agents\/([0-9a-f]{16})\/(saw1-[A-Za-z0-9_-]{32,180})$/u;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ISO_TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const SAFE_BOUNDED_TEXT = /^[^\u0000-\u001f\u007f]{1,200}$/u;
const LOCK_OWNER_FILE = "owner.json";
const LOCK_DIRECTORY = "repository-operation.lock";
const RECORD_KEYS = Object.freeze([
	"version",
	"revision",
	"state",
	"correlationToken",
	"sourceGeneration",
	"childId",
	"repositoryTopLevel",
	"gitCommonDirectory",
	"worktreePath",
	"logicalRoot",
	"workspaceId",
	"workspaceKey",
	"branchRef",
	"baseCommit",
	"lastObservedCommit",
	"observedStatus",
	"createdAt",
	"updatedAt",
	"failureCategory",
] as const);

export type WorktreeLifecycleState =
	| "allocating"
	| "ready"
	| "retained"
	| "cleanup-pending"
	| "uncertain"
	| "cleaned";

export type WorktreeObservedStatus = "unknown" | "clean" | "dirty" | "conflicted";

export type WorktreeFailureCategory =
	| "cancelled"
	| "git-failed"
	| "materialization-failed"
	| "runtime-failed"
	| "ownership-mismatch"
	| "reconciliation-incomplete"
	| "cleanup-failed"
	| "unknown";

/** Exact, canonical private ownership record stored as one JSON object. */
export interface WorktreeOwnershipRecordV1 {
	readonly version: 1;
	readonly revision: number;
	readonly state: WorktreeLifecycleState;
	readonly correlationToken: string;
	readonly sourceGeneration: string;
	readonly childId: string;
	readonly repositoryTopLevel: string;
	readonly gitCommonDirectory: string;
	readonly worktreePath: string;
	readonly logicalRoot: string;
	readonly workspaceId: string;
	readonly workspaceKey: string;
	readonly branchRef: string;
	readonly baseCommit: string;
	readonly lastObservedCommit: string;
	readonly observedStatus: WorktreeObservedStatus;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly failureCategory: WorktreeFailureCategory | null;
}

export interface NewWorktreeOwnershipRecordV1 {
	readonly state?: "allocating";
	readonly correlationToken: string;
	readonly sourceGeneration: string;
	readonly childId: string;
	readonly repositoryTopLevel: string;
	readonly gitCommonDirectory: string;
	readonly worktreePath: string;
	readonly logicalRoot: string;
	readonly workspaceId: string;
	readonly workspaceKey: string;
	readonly branchRef: string;
	readonly baseCommit: string;
	readonly lastObservedCommit?: string;
	readonly observedStatus?: WorktreeObservedStatus;
	readonly createdAt: string;
	readonly updatedAt?: string;
	readonly failureCategory?: WorktreeFailureCategory | null;
}

/** Mutable fields accepted by a compare-and-swap transition. */
export interface WorktreeRecordTransition {
	readonly state: WorktreeLifecycleState;
	readonly lastObservedCommit?: string;
	readonly observedStatus?: WorktreeObservedStatus;
	readonly updatedAt: string;
	readonly failureCategory?: WorktreeFailureCategory | null;
}

export interface GeneratedWorktreeIdentity {
	readonly workspaceId: string;
	readonly workspaceKey: string;
	readonly correlationToken: string;
	readonly branchRef: string;
}

export interface WorktreeRepositoryState {
	readonly repoKey: string;
	readonly repositoryTopLevel: string;
	readonly gitCommonDirectory: string;
	readonly repositoryStateDirectory: string;
	readonly recordsDirectory: string;
	readonly treesDirectory: string;
	readonly emptyHooksDirectory: string;
}

export type WorktreeCatalogDisposition = "active" | "retained" | "cleaned" | "uncertain";

/** Path-free summary safe for normal parent/model management surfaces. */
export interface WorktreeCatalogEntry {
	readonly workspaceId: string;
	readonly branchRef: string;
	readonly revision: number;
	readonly disposition: WorktreeCatalogDisposition;
	readonly baseCommit: string;
	readonly lastObservedCommit: string;
	readonly clean: boolean;
	readonly dirty: boolean;
	readonly conflicted: boolean;
	readonly uncertain: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly sourceGeneration: string;
	readonly childId: string;
	readonly failureCategory: WorktreeFailureCategory | null;
}

export interface WorktreeCatalogResult {
	readonly entries: readonly WorktreeCatalogEntry[];
	readonly unresolvedRecords: number;
	readonly unresolvedRepositories: number;
	readonly truncated: boolean;
}

export interface WorktreeCatalogRecordLookup {
	readonly repository: Readonly<WorktreeRepositoryState>;
	readonly record: Readonly<WorktreeOwnershipRecordV1>;
}

export interface WorktreeCatalogOptions {
	readonly workspaceId?: string;
	readonly maxRepositories?: number;
	readonly maxRecords?: number;
	readonly maxRecordsPerRepository?: number;
}

export interface CreateWorktreeStateStoreOptions {
	/** Canonicalized and kept disjoint from the state root. */
	readonly agentDirectory: string;
	/** Test/platform injection. The production default follows XDG_STATE_HOME. */
	readonly stateRoot?: string;
	readonly now?: () => Date;
}

export type WorktreeStateErrorCode =
	| "invalid_input"
	| "unsupported_platform"
	| "unsafe_state"
	| "state_unavailable"
	| "record_exists"
	| "record_missing"
	| "malformed_record"
	| "revision_conflict"
	| "invalid_transition"
	| "repository_locked"
	| "lock_lost"
	| "catalog_limit";

export class WorktreeStateError extends Error {
	readonly code: WorktreeStateErrorCode;
	constructor(code: WorktreeStateErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "WorktreeStateError";
		this.code = code;
	}
}

export interface WorktreeStateTransaction {
	readonly repository: Readonly<WorktreeRepositoryState>;
	readonly ownerToken: string;
	createRecord(record: Readonly<NewWorktreeOwnershipRecordV1>): Promise<Readonly<WorktreeOwnershipRecordV1>>;
	readRecord(workspaceId: string): Promise<Readonly<WorktreeOwnershipRecordV1>>;
	compareAndSwap(
		expected: Readonly<WorktreeOwnershipRecordV1>,
		transition: Readonly<WorktreeRecordTransition>,
	): Promise<Readonly<WorktreeOwnershipRecordV1>>;
	deleteRecord(expected: Readonly<WorktreeOwnershipRecordV1>): Promise<void>;
}

export interface WorktreeStateStoreApi {
	readonly configuredStateRoot: string;
	openRepository(repositoryTopLevel: string, gitCommonDirectory: string): Promise<Readonly<WorktreeRepositoryState>>;
	generateIdentity(repository: Pick<WorktreeRepositoryState, "repoKey">): GeneratedWorktreeIdentity;
	withRepositoryLock<T>(
		repository: Readonly<WorktreeRepositoryState>,
		operation: (transaction: WorktreeStateTransaction) => Promise<T>,
	): Promise<T>;
	readRecord(repository: Readonly<WorktreeRepositoryState>, workspaceId: string): Promise<Readonly<WorktreeOwnershipRecordV1>>;
	readCatalogRecord(workspaceId: string): Promise<Readonly<WorktreeCatalogRecordLookup>>;
	catalog(options?: WorktreeCatalogOptions): Promise<WorktreeCatalogResult>;
}

const repositoryQueues = new Map<string, Promise<void>>();

function fail(code: WorktreeStateErrorCode, message: string, cause?: unknown): never {
	throw new WorktreeStateError(code, message, cause === undefined ? undefined : { cause });
}

function errorCode(error: unknown): string | undefined {
	return error && typeof error === "object" && "code" in error
		? String((error as { code?: unknown }).code ?? "")
		: undefined;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const actual = Object.keys(value);
	return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function onlyAllowedKeys(value: object, keys: readonly string[]): boolean {
	return Object.keys(value).every((key) => keys.includes(key));
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function randomText(prefix: string): string {
	// Independent calls are intentional: IDs, keys, and correlation values are not derivable from one another.
	return `${prefix}${randomBytes(24).toString("base64url")}`;
}

function requireAbsolutePath(value: unknown, label: string): string {
	if (typeof value !== "string" || !isAbsolute(value) || value.includes("\0") || Buffer.byteLength(value, "utf8") > 16 * 1024) {
		fail("invalid_input", `${label} must be a bounded absolute path`);
	}
	return resolve(value);
}

function isWithin(parent: string, candidate: string): boolean {
	const fromParent = relative(parent, candidate);
	return fromParent === "" || (!isAbsolute(fromParent) && fromParent !== ".." && !fromParent.startsWith(`..${sep}`));
}

function requireDisjoint(stateRoot: string, protectedPath: string): void {
	if (isWithin(stateRoot, protectedPath) || isWithin(protectedPath, stateRoot)) {
		fail("unsafe_state", "The private worktree state root overlaps a protected directory");
	}
}

function requirePosix(): number {
	if (process.platform !== "linux" || typeof process.geteuid !== "function") {
		fail("unsupported_platform", "Private descriptor-anchored worktree ownership currently requires Linux");
	}
	return process.geteuid();
}

async function canonicalDirectory(path: string, label: string): Promise<string> {
	const input = requireAbsolutePath(path, label);
	try {
		const canonical = await realpath(input);
		if (!(await stat(canonical)).isDirectory()) fail("invalid_input", `${label} is not a directory`);
		return canonical;
	} catch (error) {
		if (error instanceof WorktreeStateError) throw error;
		fail("state_unavailable", `${label} cannot be canonicalized`, error);
	}
}

interface PrivateDirectoryAnchor {
	readonly canonicalPath: string;
	readonly anchorPath: string;
	readonly handle: FileHandle;
}

async function openPrivateDirectoryAnchor(
	path: string,
	expectedCanonicalPath = path,
): Promise<PrivateDirectoryAnchor> {
	const expected = requireAbsolutePath(expectedCanonicalPath, "private directory identity");
	let handle: FileHandle | undefined;
	try {
		handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
		const opened = await handle.stat();
		const anchorPath = `/proc/self/fd/${handle.fd}`;
		const canonicalPath = await realpath(anchorPath);
		const euid = requirePosix();
		if (
			canonicalPath !== expected || !opened.isDirectory() || opened.uid !== euid ||
			(opened.mode & 0o777) !== DIRECTORY_MODE
		) fail("unsafe_state", "A private directory descriptor has unsafe provenance");
		return { canonicalPath, anchorPath, handle };
	} catch (error) {
		await handle?.close().catch(() => undefined);
		if (error instanceof WorktreeStateError) throw error;
		fail("unsafe_state", "A private directory could not be opened descriptor-safely", error);
	}
}

async function validatePrivateDirectory(path: string): Promise<void> {
	const euid = requirePosix();
	try {
		const before = await lstat(path);
		const canonical = await realpath(path);
		const after = await stat(canonical);
		if (
			canonical !== path || !before.isDirectory() || before.isSymbolicLink() || !after.isDirectory() ||
			before.dev !== after.dev || before.ino !== after.ino || before.uid !== euid || after.uid !== euid ||
			(before.mode & 0o777) !== DIRECTORY_MODE || (after.mode & 0o777) !== DIRECTORY_MODE
		) fail("unsafe_state", "A private state directory has unsafe provenance or permissions");
	} catch (error) {
		if (error instanceof WorktreeStateError) throw error;
		fail("state_unavailable", "A private state directory is unavailable", error);
	}
}

/**
 * Create only missing final components, rejecting every symlink encountered. Existing
 * non-extension parents need not be mode 0700; every directory created by this call is.
 */
async function ensurePrivatePath(path: string, firstPrivateComponent: string): Promise<void> {
	const absolute = requireAbsolutePath(path, "state directory");
	const privateStart = requireAbsolutePath(firstPrivateComponent, "private state boundary");
	if (!isWithin(privateStart, absolute)) fail("unsafe_state", "Private state layout escaped its root");
	const root = absolute.startsWith(sep) ? sep : absolute.slice(0, absolute.indexOf(sep) + 1);
	const components = absolute.slice(root.length).split(sep).filter(Boolean);
	let cursor = root;
	for (const component of components) {
		cursor = join(cursor, component);
		try {
			const metadata = await lstat(cursor);
			if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("unsafe_state", "A state path component is not a real directory");
		} catch (error) {
			if (error instanceof WorktreeStateError) throw error;
			if (errorCode(error) !== "ENOENT") fail("state_unavailable", "A state path component is unavailable", error);
			try {
				await mkdir(cursor, { mode: DIRECTORY_MODE });
			} catch (mkdirError) {
				fail("state_unavailable", "A private state directory could not be created exclusively", mkdirError);
			}
		}
		if (isWithin(privateStart, cursor)) await validatePrivateDirectory(cursor);
	}
	await validatePrivateDirectory(absolute);
}

async function prospectiveCanonical(path: string): Promise<string> {
	const absolute = requireAbsolutePath(path, "state root");
	let cursor = absolute;
	const missing: string[] = [];
	while (true) {
		try {
			const metadata = await lstat(cursor);
			if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("unsafe_state", "The state root has an unsafe path component");
			const canonical = await realpath(cursor);
			if (canonical !== cursor) fail("unsafe_state", "The state root must not traverse symlinks");
			return join(canonical, ...missing.reverse());
		} catch (error) {
			if (error instanceof WorktreeStateError) throw error;
			if (errorCode(error) !== "ENOENT") fail("state_unavailable", "The state root cannot be resolved safely", error);
			const parent = dirname(cursor);
			if (parent === cursor) fail("state_unavailable", "The state root has no existing ancestor");
			missing.push(cursor.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
			cursor = parent;
		}
	}
}

function defaultStateRoot(): string {
	const xdg = process.env.XDG_STATE_HOME;
	const base = xdg === undefined || xdg === "" ? join(homedir(), ".local", "state") : requireAbsolutePath(xdg, "XDG_STATE_HOME");
	return join(base, "pi", "sub-agents", "worktrees", "v1");
}

function validateTimestamp(value: unknown, label: string): string {
	if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
		fail("malformed_record", `${label} is invalid`);
	}
	return value;
}

function validateBoundedText(value: unknown, label: string): string {
	if (typeof value !== "string" || !SAFE_BOUNDED_TEXT.test(value) || Buffer.byteLength(value, "utf8") > 512) {
		fail("malformed_record", `${label} is invalid`);
	}
	return value;
}

function validateStoredPath(value: unknown, label: string): string {
	if (typeof value !== "string" || !isAbsolute(value) || value.includes("\0") || Buffer.byteLength(value, "utf8") > 16 * 1024 || resolve(value) !== value) {
		fail("malformed_record", `${label} is invalid`);
	}
	return value;
}

function validateRecord(value: unknown): WorktreeOwnershipRecordV1 {
	if (!isRecordObject(value) || !exactKeys(value, RECORD_KEYS)) fail("malformed_record", "Ownership record properties are not exact");
	if (value.version !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) fail("malformed_record", "Ownership record version or revision is invalid");
	const states: readonly WorktreeLifecycleState[] = ["allocating", "ready", "retained", "cleanup-pending", "uncertain", "cleaned"];
	if (!states.includes(value.state as WorktreeLifecycleState)) fail("malformed_record", "Ownership lifecycle state is invalid");
	if (typeof value.correlationToken !== "string" || !CORRELATION_TOKEN.test(value.correlationToken)) fail("malformed_record", "Correlation token is invalid");
	const sourceGeneration = validateBoundedText(value.sourceGeneration, "Source generation");
	const childId = validateBoundedText(value.childId, "Child ID");
	if (!SESSION_GENERATION.test(sourceGeneration) || !SUB_AGENT_ID.test(childId)) fail("malformed_record", "Generation or child identity is unsupported");
	if (!childId.startsWith(`sa1-${sourceGeneration.slice("sag1-".length)}-`)) fail("malformed_record", "Child identity does not belong to the recorded generation");
	validateStoredPath(value.repositoryTopLevel, "Repository top level");
	validateStoredPath(value.gitCommonDirectory, "Git common directory");
	validateStoredPath(value.worktreePath, "Worktree path");
	validateStoredPath(value.logicalRoot, "Logical root");
	if (typeof value.workspaceId !== "string" || !WORKSPACE_ID.test(value.workspaceId)) fail("malformed_record", "Workspace ID is invalid");
	if (typeof value.workspaceKey !== "string" || !WORKSPACE_KEY.test(value.workspaceKey)) fail("malformed_record", "Workspace key is invalid");
	if (typeof value.branchRef !== "string" || value.branchRef.length > 512 || !FULL_BRANCH.test(value.branchRef)) fail("malformed_record", "Branch ref is invalid");
	const branchMatch = FULL_BRANCH.exec(value.branchRef);
	if (!branchMatch || branchMatch[2] !== value.workspaceId) fail("malformed_record", "Branch and workspace identities disagree");
	if (typeof value.baseCommit !== "string" || !OBJECT_ID.test(value.baseCommit) || typeof value.lastObservedCommit !== "string" || !OBJECT_ID.test(value.lastObservedCommit) || value.baseCommit.length !== value.lastObservedCommit.length) fail("malformed_record", "Commit identity is invalid");
	const statuses: readonly WorktreeObservedStatus[] = ["unknown", "clean", "dirty", "conflicted"];
	if (!statuses.includes(value.observedStatus as WorktreeObservedStatus)) fail("malformed_record", "Observed status is invalid");
	const createdAt = validateTimestamp(value.createdAt, "Creation timestamp");
	const updatedAt = validateTimestamp(value.updatedAt, "Update timestamp");
	if (updatedAt < createdAt) fail("malformed_record", "Ownership record timestamps are inconsistent");
	const categories: readonly WorktreeFailureCategory[] = ["cancelled", "git-failed", "materialization-failed", "runtime-failed", "ownership-mismatch", "reconciliation-incomplete", "cleanup-failed", "unknown"];
	if (value.failureCategory !== null && !categories.includes(value.failureCategory as WorktreeFailureCategory)) fail("malformed_record", "Failure category is invalid");
	return Object.freeze(value as unknown as WorktreeOwnershipRecordV1);
}

function serializeRecord(record: Readonly<WorktreeOwnershipRecordV1>): Buffer {
	const validated = validateRecord(record);
	const bytes = Buffer.from(`${JSON.stringify(validated)}\n`, "utf8");
	if (bytes.byteLength > WORKTREE_STATE_RECORD_MAX_BYTES) fail("malformed_record", "Ownership record exceeds its byte limit");
	return bytes;
}

async function readBounded(handle: FileHandle, size: number): Promise<Buffer> {
	if (size < 2 || size > WORKTREE_STATE_RECORD_MAX_BYTES) fail("malformed_record", "Ownership record has an invalid byte length");
	const result = Buffer.alloc(size);
	let offset = 0;
	while (offset < size) {
		const read = await handle.read(result, offset, size - offset, offset);
		if (read.bytesRead === 0) fail("malformed_record", "Ownership record was truncated while reading");
		offset += read.bytesRead;
	}
	return result;
}

async function protectedFileMetadata(handle: FileHandle, path: string): Promise<{ dev: bigint | number; ino: bigint | number; size: number }> {
	const euid = requirePosix();
	const before = await lstat(path);
	const opened = await handle.stat();
	if (
		!before.isFile() || before.isSymbolicLink() || !opened.isFile() || before.dev !== opened.dev || before.ino !== opened.ino ||
		before.uid !== euid || opened.uid !== euid || (before.mode & 0o777) !== FILE_MODE || (opened.mode & 0o777) !== FILE_MODE
	) fail("unsafe_state", "A private state file has unsafe provenance or permissions");
	return { dev: opened.dev, ino: opened.ino, size: opened.size };
}

async function openProtected(path: string): Promise<FileHandle> {
	try {
		return await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
	} catch (error) {
		if (errorCode(error) === "ENOENT") fail("record_missing", "Ownership record does not exist");
		fail("unsafe_state", "Ownership record cannot be opened safely", error);
	}
}

async function readRecordPath(path: string): Promise<{ record: Readonly<WorktreeOwnershipRecordV1>; bytes: Buffer }> {
	const handle = await openProtected(path);
	try {
		const metadata = await protectedFileMetadata(handle, path);
		const bytes = await readBounded(handle, metadata.size);
		let text: string;
		try { text = UTF8.decode(bytes); } catch (error) { fail("malformed_record", "Ownership record is not valid UTF-8", error); }
		let parsed: unknown;
		try { parsed = JSON.parse(text); } catch (error) { fail("malformed_record", "Ownership record is not valid JSON", error); }
		const record = validateRecord(parsed);
		const canonical = serializeRecord(record);
		if (!canonical.equals(bytes)) fail("malformed_record", "Ownership record is not canonical exact-property JSON");
		return { record, bytes };
	} finally {
		await handle.close().catch(() => undefined);
	}
}

async function fsyncDirectory(path: string): Promise<void> {
	let anchor: PrivateDirectoryAnchor | undefined;
	try {
		anchor = await openPrivateDirectoryAnchor(path);
		await anchor.handle.sync();
	} catch (error) {
		if (error instanceof WorktreeStateError) throw error;
		fail("state_unavailable", "A private state directory could not be durably synchronized", error);
	} finally {
		await anchor?.handle.close().catch(() => undefined);
	}
}

async function writeExclusive(path: string, bytes: Buffer, directoryHandle?: FileHandle): Promise<void> {
	let handle: FileHandle | undefined;
	try {
		handle = await open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, FILE_MODE);
		const metadata = await protectedFileMetadata(handle, path);
		if (metadata.size !== 0) fail("unsafe_state", "A newly created private state file was not empty");
		await handle.writeFile(bytes);
		await handle.sync();
	} catch (error) {
		if (error instanceof WorktreeStateError) throw error;
		if (errorCode(error) === "EEXIST") fail("record_exists", "Ownership record already exists");
		fail("state_unavailable", "A private state file could not be created", error);
	} finally {
		await handle?.close().catch(() => undefined);
	}
	const verified = await readRecordPath(path);
	if (!verified.bytes.equals(bytes)) fail("unsafe_state", "A newly created ownership record failed verification");
	if (directoryHandle) await directoryHandle.sync();
	else await fsyncDirectory(dirname(path));
}

function recordMatchesRepository(record: WorktreeOwnershipRecordV1, repository: Readonly<WorktreeRepositoryState>): boolean {
	const expectedWorktreePath = join(repository.treesDirectory, record.workspaceId);
	return record.repositoryTopLevel === repository.repositoryTopLevel &&
		record.gitCommonDirectory === repository.gitCommonDirectory &&
		record.worktreePath === expectedWorktreePath &&
		isWithin(expectedWorktreePath, record.logicalRoot) &&
		record.branchRef === `refs/heads/pi/sub-agents/${repository.repoKey.slice(0, 16)}/${record.workspaceId}`;
}

const allowedTransitions: Readonly<Record<WorktreeLifecycleState, readonly WorktreeLifecycleState[]>> = Object.freeze({
	allocating: Object.freeze(["allocating", "ready", "uncertain", "cleaned"]),
	ready: Object.freeze(["ready", "retained", "cleanup-pending", "uncertain"]),
	retained: Object.freeze(["retained", "ready", "cleanup-pending", "uncertain"]),
	"cleanup-pending": Object.freeze(["cleanup-pending", "retained", "cleaned", "uncertain"]),
	uncertain: Object.freeze(["uncertain", "cleanup-pending"]),
	cleaned: Object.freeze([]),
});

function immutableFieldsEqual(a: WorktreeOwnershipRecordV1, b: WorktreeOwnershipRecordV1): boolean {
	return a.version === b.version && a.correlationToken === b.correlationToken && a.sourceGeneration === b.sourceGeneration &&
		a.childId === b.childId && a.repositoryTopLevel === b.repositoryTopLevel && a.gitCommonDirectory === b.gitCommonDirectory &&
		a.worktreePath === b.worktreePath && a.logicalRoot === b.logicalRoot && a.workspaceId === b.workspaceId &&
		a.workspaceKey === b.workspaceKey && a.branchRef === b.branchRef && a.baseCommit === b.baseCommit && a.createdAt === b.createdAt;
}

async function replaceCas(
	path: string,
	expected: WorktreeOwnershipRecordV1,
	next: WorktreeOwnershipRecordV1,
	directoryHandle?: FileHandle,
): Promise<void> {
	const current = await readRecordPath(path);
	if (current.record.revision !== expected.revision || !immutableFieldsEqual(current.record, expected) || !current.bytes.equals(serializeRecord(expected))) {
		fail("revision_conflict", "Ownership record no longer matches the expected revision");
	}
	const nextBytes = serializeRecord(next);
	const temporary = join(dirname(path), `.record-${randomText("")}.tmp`);
	let renamed = false;
	try {
		await writeExclusive(temporary, nextBytes, directoryHandle);
		const stillCurrent = await readRecordPath(path);
		if (!stillCurrent.bytes.equals(current.bytes)) fail("revision_conflict", "Ownership record changed during compare-and-swap");
		await rename(temporary, path);
		renamed = true;
		let syncError: unknown;
		try {
			if (directoryHandle) await directoryHandle.sync();
			else await fsyncDirectory(dirname(path));
		} catch (error) {
			syncError = error;
		}
		const verified = await readRecordPath(path);
		if (!verified.bytes.equals(nextBytes)) fail("unsafe_state", "Replaced ownership record failed verification");
		// Rename is the atomic authority boundary. If the exact next revision is
		// readable through the held directory descriptor, do not hide that commit
		// merely because the post-rename durability sync reported an error.
		void syncError;
	} catch (error) {
		if (!renamed) await unlink(temporary).catch(() => undefined);
		throw error;
	}
}

function makeInitial(input: Readonly<NewWorktreeOwnershipRecordV1>): WorktreeOwnershipRecordV1 {
	if (!input || typeof input !== "object" || !onlyAllowedKeys(input, [
		"state", "correlationToken", "sourceGeneration", "childId", "repositoryTopLevel", "gitCommonDirectory",
		"worktreePath", "logicalRoot", "workspaceId", "workspaceKey", "branchRef", "baseCommit",
		"lastObservedCommit", "observedStatus", "createdAt", "updatedAt", "failureCategory",
	])) fail("invalid_input", "Revision-1 record input contains unsupported properties");
	const value: WorktreeOwnershipRecordV1 = {
		version: 1,
		revision: 1,
		state: input.state ?? "allocating",
		correlationToken: input.correlationToken,
		sourceGeneration: input.sourceGeneration,
		childId: input.childId,
		repositoryTopLevel: input.repositoryTopLevel,
		gitCommonDirectory: input.gitCommonDirectory,
		worktreePath: input.worktreePath,
		logicalRoot: input.logicalRoot,
		workspaceId: input.workspaceId,
		workspaceKey: input.workspaceKey,
		branchRef: input.branchRef,
		baseCommit: input.baseCommit,
		lastObservedCommit: input.lastObservedCommit ?? input.baseCommit,
		observedStatus: input.observedStatus ?? "unknown",
		createdAt: input.createdAt,
		updatedAt: input.updatedAt ?? input.createdAt,
		failureCategory: input.failureCategory ?? null,
	};
	if (value.state !== "allocating") fail("invalid_transition", "Revision 1 must be in allocating state");
	return validateRecord(value);
}

async function queueRepository<T>(key: string, operation: () => Promise<T>): Promise<T> {
	const previous = repositoryQueues.get(key) ?? Promise.resolve();
	let release!: () => void;
	const marker = new Promise<void>((resolveMarker) => { release = resolveMarker; });
	const tail = previous.catch(() => undefined).then(() => marker);
	repositoryQueues.set(key, tail);
	await previous.catch(() => undefined);
	try {
		return await operation();
	} finally {
		release();
		if (repositoryQueues.get(key) === tail) repositoryQueues.delete(key);
	}
}

interface LockOwner {
	readonly version: 1;
	readonly ownerToken: string;
	readonly pid: number;
	readonly createdAt: string;
}

function lockBytes(owner: LockOwner): Buffer {
	return Buffer.from(`${JSON.stringify(owner)}\n`, "utf8");
}

async function readLockOwner(path: string): Promise<LockOwner> {
	const handle = await openProtected(path);
	try {
		const metadata = await protectedFileMetadata(handle, path);
		if (metadata.size > 1024) fail("lock_lost", "Repository lock owner record is oversized");
		const bytes = await readBounded(handle, metadata.size);
		let parsed: unknown;
		try { parsed = JSON.parse(UTF8.decode(bytes)); } catch (error) { fail("lock_lost", "Repository lock owner record is malformed", error); }
		if (!isRecordObject(parsed) || !exactKeys(parsed, ["version", "ownerToken", "pid", "createdAt"]) || parsed.version !== 1 ||
			typeof parsed.ownerToken !== "string" || !/^sal1-[A-Za-z0-9_-]{32,180}$/u.test(parsed.ownerToken) ||
			!Number.isSafeInteger(parsed.pid) || (parsed.pid as number) < 1 || typeof parsed.createdAt !== "string" || !ISO_TIMESTAMP.test(parsed.createdAt)) {
			fail("lock_lost", "Repository lock owner record is invalid");
		}
		const owner = parsed as unknown as LockOwner;
		if (!lockBytes(owner).equals(bytes)) fail("lock_lost", "Repository lock owner record is not canonical");
		return owner;
	} finally { await handle.close().catch(() => undefined); }
}

function catalogDisposition(state: WorktreeLifecycleState): WorktreeCatalogDisposition {
	if (state === "ready") return "active";
	if (state === "retained") return "retained";
	if (state === "cleaned") return "cleaned";
	return "uncertain";
}

function catalogEntry(record: WorktreeOwnershipRecordV1): WorktreeCatalogEntry {
	return Object.freeze({
		workspaceId: record.workspaceId,
		branchRef: record.branchRef,
		revision: record.revision,
		disposition: catalogDisposition(record.state),
		baseCommit: record.baseCommit.slice(0, 12),
		lastObservedCommit: record.lastObservedCommit.slice(0, 12),
		clean: record.observedStatus === "clean",
		dirty: record.observedStatus === "dirty",
		conflicted: record.observedStatus === "conflicted",
		uncertain: record.state === "uncertain" || record.state === "allocating" || record.state === "cleanup-pending" || record.observedStatus === "unknown",
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		sourceGeneration: record.sourceGeneration,
		childId: record.childId,
		failureCategory: record.failureCategory,
	});
}

async function directEntries(path: string, limit: number): Promise<{ names: string[]; truncated: boolean }> {
	const names: string[] = [];
	let directory;
	try { directory = await opendir(path); } catch (error) { fail("state_unavailable", "A private catalog directory cannot be opened", error); }
	let truncated = false;
	try {
		for await (const entry of directory) {
			if (names.length >= limit) { truncated = true; break; }
			names.push(entry.name);
		}
	} finally { await directory.close().catch(() => undefined); }
	names.sort();
	return { names, truncated };
}

export class WorktreeStateStore implements WorktreeStateStoreApi {
	readonly configuredStateRoot: string;
	readonly #agentDirectoryInput: string;
	readonly #now: () => Date;
	readonly #repositoryHandles = new WeakSet<object>();
	#rootPromise?: Promise<{ root: string; repositories: string; agent: string }>;

	constructor(options: Readonly<CreateWorktreeStateStoreOptions>) {
		requirePosix();
		this.#agentDirectoryInput = requireAbsolutePath(options.agentDirectory, "Pi agent directory");
		this.configuredStateRoot = requireAbsolutePath(options.stateRoot ?? defaultStateRoot(), "worktree state root");
		this.#now = options.now ?? (() => new Date());
	}

	async #initialize(extraProtected: readonly string[] = []): Promise<{ root: string; repositories: string; agent: string }> {
		if (!this.#rootPromise) {
			this.#rootPromise = (async () => {
				const agent = await canonicalDirectory(this.#agentDirectoryInput, "Pi agent directory");
				const future = await prospectiveCanonical(this.configuredStateRoot);
				requireDisjoint(future, agent);
				for (const path of extraProtected) requireDisjoint(future, path);
				await ensurePrivatePath(future, future);
				const root = await realpath(future);
				if (root !== future) fail("unsafe_state", "Private state root changed during initialization");
				requireDisjoint(root, agent);
				for (const path of extraProtected) requireDisjoint(root, path);
				const repositories = join(root, "repositories");
				await ensurePrivatePath(repositories, root);
				return { root, repositories, agent };
			})();
		}
		const initialized = await this.#rootPromise;
		for (const path of extraProtected) requireDisjoint(initialized.root, path);
		return initialized;
	}

	async openRepository(repositoryTopLevel: string, gitCommonDirectory: string): Promise<Readonly<WorktreeRepositoryState>> {
		const top = await canonicalDirectory(repositoryTopLevel, "Repository top level");
		const common = await canonicalDirectory(gitCommonDirectory, "Git common directory");
		const initialized = await this.#initialize([top, common]);
		requireDisjoint(initialized.root, top);
		requireDisjoint(initialized.root, common);
		const repoKey = createHash("sha256").update(common, "utf8").digest("hex");
		const repositoryStateDirectory = join(initialized.repositories, repoKey);
		const recordsDirectory = join(repositoryStateDirectory, "records");
		const treesDirectory = join(repositoryStateDirectory, "trees");
		const emptyHooksDirectory = join(repositoryStateDirectory, "empty-hooks");
		for (const path of [repositoryStateDirectory, recordsDirectory, treesDirectory, emptyHooksDirectory]) {
			await ensurePrivatePath(path, initialized.root);
		}
		const result = Object.freeze({ repoKey, repositoryTopLevel: top, gitCommonDirectory: common, repositoryStateDirectory, recordsDirectory, treesDirectory, emptyHooksDirectory });
		this.#repositoryHandles.add(result);
		return result;
	}

	#assertRepository(repository: Readonly<WorktreeRepositoryState>): void {
		if (!repository || typeof repository !== "object" || !this.#repositoryHandles.has(repository as object)) {
			fail("invalid_input", "Repository state handle was not issued by this store");
		}
	}

	generateIdentity(repository: Pick<WorktreeRepositoryState, "repoKey">): GeneratedWorktreeIdentity {
		if (!repository || typeof repository.repoKey !== "string" || !REPO_KEY.test(repository.repoKey)) fail("invalid_input", "Repository key is invalid");
		const workspaceId = randomText("saw1-");
		return Object.freeze({
			workspaceId,
			workspaceKey: randomText("sawk1-"),
			correlationToken: randomText("sact1-"),
			branchRef: `refs/heads/pi/sub-agents/${repository.repoKey.slice(0, 16)}/${workspaceId}`,
		});
	}

	async readRecord(repository: Readonly<WorktreeRepositoryState>, workspaceId: string): Promise<Readonly<WorktreeOwnershipRecordV1>> {
		this.#assertRepository(repository);
		if (!WORKSPACE_ID.test(workspaceId)) fail("invalid_input", "Workspace ID is invalid");
		await validatePrivateDirectory(repository.repositoryStateDirectory);
		await validatePrivateDirectory(repository.recordsDirectory);
		const repositoryDirectory = await openPrivateDirectoryAnchor(repository.repositoryStateDirectory);
		const records = await openPrivateDirectoryAnchor(
			join(repositoryDirectory.anchorPath, "records"),
			repository.recordsDirectory,
		);
		try {
			const { record } = await readRecordPath(join(records.anchorPath, `${workspaceId}.json`));
			if (record.workspaceId !== workspaceId || !recordMatchesRepository(record, repository)) {
				fail("malformed_record", "Ownership record does not belong to the selected repository and workspace");
			}
			return record;
		} finally {
			await records.handle.close().catch(() => undefined);
			await repositoryDirectory.handle.close().catch(() => undefined);
		}
	}

	async withRepositoryLock<T>(repository: Readonly<WorktreeRepositoryState>, operation: (transaction: WorktreeStateTransaction) => Promise<T>): Promise<T> {
		this.#assertRepository(repository);
		if (typeof operation !== "function") fail("invalid_input", "Repository operation callback is required");
		return queueRepository(repository.gitCommonDirectory, async () => {
			if (await realpath(repository.repositoryTopLevel) !== repository.repositoryTopLevel || await realpath(repository.gitCommonDirectory) !== repository.gitCommonDirectory) {
				fail("unsafe_state", "Repository identity changed before lock acquisition");
			}
			await validatePrivateDirectory(repository.repositoryStateDirectory);
			await validatePrivateDirectory(repository.recordsDirectory);
			const repositoryDirectory = await openPrivateDirectoryAnchor(repository.repositoryStateDirectory);
			const recordsDirectory = await openPrivateDirectoryAnchor(
				join(repositoryDirectory.anchorPath, "records"),
				repository.recordsDirectory,
			);
			let lockDirectory: PrivateDirectoryAnchor | undefined;
			const canonicalLockDirectory = join(repository.repositoryStateDirectory, LOCK_DIRECTORY);
			const anchoredLockDirectory = join(repositoryDirectory.anchorPath, LOCK_DIRECTORY);
			let ownerPath = "";
			try {
				try { await mkdir(anchoredLockDirectory, { mode: DIRECTORY_MODE }); }
				catch (error) {
					if (errorCode(error) === "EEXIST") fail("repository_locked", "Repository state is locked; stale locks are never broken automatically");
					fail("state_unavailable", "Repository lock could not be acquired", error);
				}
				lockDirectory = await openPrivateDirectoryAnchor(anchoredLockDirectory, canonicalLockDirectory);
				const ownerToken = randomText("sal1-");
				const owner: LockOwner = { version: 1, ownerToken, pid: process.pid, createdAt: this.#now().toISOString() };
				ownerPath = join(lockDirectory.anchorPath, LOCK_OWNER_FILE);
				try {
					let ownerHandle: FileHandle | undefined;
					try {
						ownerHandle = await open(ownerPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, FILE_MODE);
						await protectedFileMetadata(ownerHandle, ownerPath);
						await ownerHandle.writeFile(lockBytes(owner));
						await ownerHandle.sync();
					} finally { await ownerHandle?.close().catch(() => undefined); }
					await lockDirectory.handle.sync();
					await repositoryDirectory.handle.sync();
				} catch (error) {
					// A lock with incomplete ownership metadata is deliberately retained as a recovery condition.
					throw error;
				}

				const anchoredRecordPath = (workspaceId: string): string => {
					if (!WORKSPACE_ID.test(workspaceId)) fail("invalid_input", "Workspace ID is invalid");
					return join(recordsDirectory.anchorPath, `${workspaceId}.json`);
				};
				const readTransactionRecord = async (workspaceId: string): Promise<Readonly<WorktreeOwnershipRecordV1>> => {
					const { record } = await readRecordPath(anchoredRecordPath(workspaceId));
					if (record.workspaceId !== workspaceId || !recordMatchesRepository(record, repository)) {
						fail("malformed_record", "Ownership record does not belong to the locked repository");
					}
					return record;
				};
				let active = true;
				const requireActive = (): void => { if (!active) fail("lock_lost", "Repository transaction is no longer active"); };
				const transaction: WorktreeStateTransaction = Object.freeze({
					repository,
					ownerToken,
					createRecord: async (input) => {
						requireActive();
						const record = makeInitial(input);
						if (!recordMatchesRepository(record, repository)) fail("invalid_input", "Ownership record repository identity or generated path does not match the lock");
						await writeExclusive(anchoredRecordPath(record.workspaceId), serializeRecord(record), recordsDirectory.handle);
						return record;
					},
					readRecord: async (workspaceId) => { requireActive(); return readTransactionRecord(workspaceId); },
					compareAndSwap: async (expected, transition) => {
						requireActive();
						if (!transition || typeof transition !== "object" || !onlyAllowedKeys(transition, ["state", "lastObservedCommit", "observedStatus", "updatedAt", "failureCategory"])) {
							fail("invalid_input", "Record transition contains unsupported properties");
						}
						const prior = validateRecord(expected);
						if (!recordMatchesRepository(prior, repository)) fail("invalid_input", "Expected record does not belong to the locked repository");
						if (!allowedTransitions[prior.state].includes(transition.state)) fail("invalid_transition", `Lifecycle transition from ${prior.state} to ${transition.state} is not permitted`);
						const next: WorktreeOwnershipRecordV1 = {
							...prior,
							revision: prior.revision + 1,
							state: transition.state,
							lastObservedCommit: transition.lastObservedCommit ?? prior.lastObservedCommit,
							observedStatus: transition.observedStatus ?? prior.observedStatus,
							updatedAt: transition.updatedAt,
							failureCategory: transition.failureCategory === undefined ? prior.failureCategory : transition.failureCategory,
						};
						validateRecord(next);
						if (next.updatedAt < prior.updatedAt) fail("invalid_transition", "Record transition timestamp moved backwards");
						if (!immutableFieldsEqual(prior, next) || next.revision !== prior.revision + 1) fail("invalid_transition", "A record transition changed immutable ownership fields");
						await replaceCas(anchoredRecordPath(prior.workspaceId), prior, next, recordsDirectory.handle);
						return Object.freeze(next);
					},
					deleteRecord: async (expected) => {
						requireActive();
						const prior = validateRecord(expected);
						if (prior.state !== "cleaned") fail("invalid_transition", "Only an exact cleaned revision may be deleted");
						if (!recordMatchesRepository(prior, repository)) fail("invalid_input", "Expected record does not belong to the locked repository");
						const path = anchoredRecordPath(prior.workspaceId);
						const current = await readRecordPath(path);
						if (!current.bytes.equals(serializeRecord(prior))) fail("revision_conflict", "Ownership record no longer matches the expected delete revision");
						await unlink(path);
						let syncError: unknown;
						try { await recordsDirectory.handle.sync(); }
						catch (error) { syncError = error; }
						let deleted = false;
						try { await lstat(path); }
						catch (error) {
							if (errorCode(error) === "ENOENT") deleted = true;
							else throw error;
						}
						if (!deleted) fail("revision_conflict", "Ownership record reappeared after exact deletion");
						void syncError;
					},
				});

				let result: T;
				let operationError: unknown;
				let operationFailed = false;
				try { result = await operation(transaction); }
				catch (error) { operationFailed = true; operationError = error; result = undefined as T; }
				finally { active = false; }

				let releaseError: unknown;
				let releaseFailed = false;
				try {
					const currentOwner = await readLockOwner(ownerPath);
					if (currentOwner.ownerToken !== ownerToken || currentOwner.pid !== process.pid) fail("lock_lost", "Repository lock ownership changed unexpectedly");
					await unlink(ownerPath);
					await lockDirectory.handle.close();
					lockDirectory = undefined;
					await rmdir(anchoredLockDirectory);
					let syncError: unknown;
					try { await repositoryDirectory.handle.sync(); }
					catch (error) { syncError = error; }
					let released = false;
					try { await lstat(anchoredLockDirectory); }
					catch (error) {
						if (errorCode(error) === "ENOENT") released = true;
						else throw error;
					}
					if (!released) fail("lock_lost", "Repository lock directory reappeared after release");
					void syncError;
				} catch (error) { releaseFailed = true; releaseError = error; }
				if (operationFailed && releaseFailed) throw new AggregateError([operationError, releaseError], "Repository operation and lock release both failed");
				if (releaseFailed) throw releaseError;
				if (operationFailed) throw operationError;
				return result;
			} finally {
				await lockDirectory?.handle.close().catch(() => undefined);
				await recordsDirectory.handle.close().catch(() => undefined);
				await repositoryDirectory.handle.close().catch(() => undefined);
			}
		});
	}

	async #existingCatalogLayout(): Promise<{ root: string; repositories: string; agent: string } | undefined> {
		if (this.#rootPromise) return this.#rootPromise;
		const agent = await canonicalDirectory(this.#agentDirectoryInput, "Pi agent directory");
		let root: string;
		try {
			const metadata = await lstat(this.configuredStateRoot);
			if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("unsafe_state", "The catalog state root has unsafe provenance");
			root = await realpath(this.configuredStateRoot);
		} catch (error) {
			if (error instanceof WorktreeStateError) throw error;
			if (errorCode(error) === "ENOENT") return undefined;
			fail("state_unavailable", "The catalog state root is unavailable", error);
		}
		if (root !== this.configuredStateRoot) fail("unsafe_state", "The catalog state root is noncanonical");
		await validatePrivateDirectory(root);
		requireDisjoint(root, agent);
		const repositories = join(root, "repositories");
		try {
			await lstat(repositories);
		} catch (error) {
			if (errorCode(error) === "ENOENT") return undefined;
			throw error;
		}
		await validatePrivateDirectory(repositories);
		return { root, repositories, agent };
	}

	async readCatalogRecord(workspaceId: string): Promise<Readonly<WorktreeCatalogRecordLookup>> {
		if (!WORKSPACE_ID.test(workspaceId)) fail("invalid_input", "Catalog workspace ID is invalid");
		const initialized = await this.#existingCatalogLayout();
		if (!initialized) fail("record_missing", "Catalog ownership record does not exist");
		const repositories = await directEntries(initialized.repositories, WORKTREE_STATE_DEFAULT_MAX_REPOSITORIES);
		if (repositories.truncated) fail("catalog_limit", "Catalog repository lookup exceeded its bound");
		let found: WorktreeCatalogRecordLookup | undefined;
		for (const repoName of repositories.names) {
			if (!REPO_KEY.test(repoName)) continue;
			const repoDirectory = join(initialized.repositories, repoName);
			const recordsDirectory = join(repoDirectory, "records");
			const treesDirectory = join(repoDirectory, "trees");
			const emptyHooksDirectory = join(repoDirectory, "empty-hooks");
			try {
				await validatePrivateDirectory(repoDirectory);
				await validatePrivateDirectory(recordsDirectory);
				await validatePrivateDirectory(treesDirectory);
				await validatePrivateDirectory(emptyHooksDirectory);
			} catch { continue; }
			let record: Readonly<WorktreeOwnershipRecordV1>;
			try { ({ record } = await readRecordPath(join(recordsDirectory, `${workspaceId}.json`))); }
			catch (error) {
				if (error instanceof WorktreeStateError && error.code === "record_missing") continue;
				throw error;
			}
			const expectedWorktreePath = join(treesDirectory, record.workspaceId);
			if (record.workspaceId !== workspaceId || record.workspaceId !== record.branchRef.split("/").at(-1) ||
				createHash("sha256").update(record.gitCommonDirectory, "utf8").digest("hex") !== repoName ||
				record.worktreePath !== expectedWorktreePath || !isWithin(expectedWorktreePath, record.logicalRoot) ||
				record.branchRef !== `refs/heads/pi/sub-agents/${repoName.slice(0, 16)}/${record.workspaceId}`) {
				fail("malformed_record", "Catalog ownership record identity is inconsistent");
			}
			requireDisjoint(initialized.root, record.repositoryTopLevel);
			requireDisjoint(initialized.root, record.gitCommonDirectory);
			if (!isWithin(initialized.root, record.worktreePath) || !isWithin(initialized.root, record.logicalRoot)) {
				fail("malformed_record", "Catalog ownership record path is outside the protected state root");
			}
			if (found) fail("malformed_record", "Catalog workspace ID is ambiguous");
			const repository = await this.openRepository(record.repositoryTopLevel, record.gitCommonDirectory);
			if (repository.repoKey !== repoName || repository.repositoryStateDirectory !== repoDirectory || repository.recordsDirectory !== recordsDirectory ||
				repository.treesDirectory !== treesDirectory || repository.emptyHooksDirectory !== emptyHooksDirectory) {
				fail("malformed_record", "Catalog ownership record does not match the issued repository handle");
			}
			found = Object.freeze({ repository, record });
		}
		if (!found) fail("record_missing", "Catalog ownership record does not exist");
		return found;
	}

	async catalog(options: WorktreeCatalogOptions = {}): Promise<WorktreeCatalogResult> {
		const initialized = await this.#existingCatalogLayout();
		if (!initialized) {
			return Object.freeze({ entries: Object.freeze([]), unresolvedRecords: 0, unresolvedRepositories: 0, truncated: false });
		}
		const maxRepositories = boundedCatalogLimit(options.maxRepositories, WORKTREE_STATE_DEFAULT_MAX_REPOSITORIES, 1_024);
		const maxRecords = boundedCatalogLimit(options.maxRecords, WORKTREE_STATE_DEFAULT_MAX_RECORDS, 10_000);
		const perRepository = boundedCatalogLimit(options.maxRecordsPerRepository, WORKTREE_STATE_DEFAULT_MAX_RECORDS_PER_REPOSITORY, 2_000);
		if (options.workspaceId !== undefined && !WORKSPACE_ID.test(options.workspaceId)) fail("invalid_input", "Catalog workspace ID is invalid");
		const repositories = await directEntries(initialized.repositories, maxRepositories);
		let unresolvedRepositories = 0;
		let unresolvedRecords = 0;
		let truncated = repositories.truncated;
		const found: WorktreeCatalogEntry[] = [];
		const claimedWorkspaceIds = new Set<string>();
		const ambiguous = new Set<string>();
		let scannedRecords = 0;
		repositoryLoop: for (const repoName of repositories.names) {
			if (!REPO_KEY.test(repoName)) { unresolvedRepositories++; continue; }
			const repoDirectory = join(initialized.repositories, repoName);
			const recordsDirectory = join(repoDirectory, "records");
			try { await validatePrivateDirectory(repoDirectory); await validatePrivateDirectory(recordsDirectory); }
			catch { unresolvedRepositories++; continue; }
			let recordNames: { names: string[]; truncated: boolean };
			try { recordNames = await directEntries(recordsDirectory, perRepository); }
			catch { unresolvedRepositories++; continue; }
			if (recordNames.truncated) { truncated = true; unresolvedRecords++; }
			for (const fileName of recordNames.names) {
				if (scannedRecords >= maxRecords) { truncated = true; break repositoryLoop; }
				scannedRecords += 1;
				const match = /^(saw1-[A-Za-z0-9_-]{32,180})\.json$/u.exec(fileName);
				if (!match) { unresolvedRecords++; continue; }
				if (options.workspaceId !== undefined && match[1] !== options.workspaceId) continue;
				if (claimedWorkspaceIds.has(match[1])) {
					ambiguous.add(match[1]);
					unresolvedRecords++;
					continue;
				}
				claimedWorkspaceIds.add(match[1]);
				try {
					const { record } = await readRecordPath(join(recordsDirectory, fileName));
					const expectedWorktreePath = join(repoDirectory, "trees", record.workspaceId);
					if (record.workspaceId !== match[1] ||
						createHash("sha256").update(record.gitCommonDirectory, "utf8").digest("hex") !== repoName ||
						record.worktreePath !== expectedWorktreePath || !isWithin(expectedWorktreePath, record.logicalRoot) ||
						record.branchRef !== `refs/heads/pi/sub-agents/${repoName.slice(0, 16)}/${record.workspaceId}`) {
						throw new Error("record identity mismatch");
					}
					requireDisjoint(initialized.root, record.repositoryTopLevel);
					requireDisjoint(initialized.root, record.gitCommonDirectory);
					if (
						!isWithin(initialized.root, record.worktreePath) ||
						!isWithin(initialized.root, record.logicalRoot)
					) {
						throw new Error("record identity mismatch");
					}
					found.push(catalogEntry(record));
				} catch { unresolvedRecords++; }
			}
		}
		const entries = found.filter((entry) => !ambiguous.has(entry.workspaceId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.workspaceId.localeCompare(b.workspaceId));
		return Object.freeze({ entries: Object.freeze(entries), unresolvedRecords, unresolvedRepositories, truncated });
	}
}

function boundedCatalogLimit(value: number | undefined, fallback: number, ceiling: number): number {
	const selected = value ?? fallback;
	if (!Number.isSafeInteger(selected) || selected < 1 || selected > ceiling) fail("invalid_input", "Catalog bound is invalid");
	return selected;
}

export function createWorktreeStateStore(options: Readonly<CreateWorktreeStateStoreOptions>): WorktreeStateStoreApi {
	return new WorktreeStateStore(options);
}

export function computeWorktreeRepositoryKey(canonicalGitCommonDirectory: string): string {
	const path = requireAbsolutePath(canonicalGitCommonDirectory, "Canonical Git common directory");
	return createHash("sha256").update(path, "utf8").digest("hex");
}

export function isGeneratedWorktreeWorkspaceId(value: unknown): value is string {
	return typeof value === "string" && WORKSPACE_ID.test(value);
}
