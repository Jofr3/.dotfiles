import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
	access,
	chmod,
	lstat,
	mkdir,
	readdir,
	readFile,
	realpath,
	readlink,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { withTempDirectory } from "./fixtures.mjs";

const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
const GIT_TIMEOUT_MS = 10_000;
const FIXTURE_LOCK_REASON = "pi-sub-agents-offline-fixture";
const WORKSPACE_ID = /^[a-z][a-z0-9-]{0,31}$/u;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const FULL_FIXTURE_BRANCH = /^refs\/heads\/pi\/sub-agents\/(?:fixture|unowned)\/[a-z][a-z0-9-]{0,31}$/u;
const SHORT_FIXTURE_BRANCH = /^pi\/sub-agents\/(?:fixture|unowned)\/[a-z][a-z0-9-]{0,31}$/u;
const SAFE_PUBLIC_GIT_ARGUMENTS = Object.freeze([
	["rev-parse", "--abbrev-ref", "HEAD"],
	["status", "--porcelain"],
]);
const UNSAFE_GIT_OPTION = /^(?:-c$|-f$|--force(?:=|$)|--prune(?:=|$)|--delete(?:=|$)|--output(?:=|$)|--exec(?:=|$)|--ext-diff$|--textconv$|--upload-pack(?:=|$)|--receive-pack(?:=|$)|--strategy(?:=|$)|--strategy-option(?:=|$)|--config(?:=|$)|--global$|--system$|--local$|--worktree$)/u;
const UNSAFE_GIT_TEXT = /(?:^|[.=/-])(?:alias|credential|filter|hooks?|pager|editor|askpass|sshcommand|textconv|fsmonitor|uploadpack|receivepack)(?:[.=/-]|$)/iu;
const REMOTE_ARGUMENT = /(?:[a-z][a-z0-9+.-]*:\/\/|[^/\s]+@[^:\s]+:)/iu;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function execFileAsync(file, args, options, input) {
	return new Promise((resolvePromise, rejectPromise) => {
		let child;
		try {
			child = execFile(file, args, options, (error, stdout, stderr) => {
				if (error) rejectPromise(error);
				else resolvePromise({ stdout, stderr });
			});
		} catch (error) {
			rejectPromise(error);
			return;
		}
		if (input !== undefined) {
			child.stdin?.on("error", () => {});
			child.stdin?.end(input);
		}
	});
}

function throwIfAborted(signal) {
	if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

function gitConfigPrefix(hooks) {
	return [
		"-c", `core.hooksPath=${hooks}`,
		"-c", "core.fsmonitor=false",
		"-c", "core.autocrlf=false",
		"-c", "commit.gpgsign=false",
		"-c", "tag.gpgsign=false",
		"-c", "protocol.file.allow=never",
		"-c", "submodule.recurse=false",
	];
}

async function resolveGitExecutable(source = process.env) {
	const searchPath = source.PATH;
	if (typeof searchPath !== "string" || !searchPath || searchPath.includes("\0")) {
		throw new Error("PATH is required for the local git fixture");
	}
	const suffixes = process.platform === "win32"
		? (source.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
		: [""];
	for (const directory of searchPath.split(delimiter).filter(Boolean)) {
		for (const suffix of suffixes) {
			const candidate = join(directory, `git${suffix}`);
			try {
				await access(candidate, constants.X_OK);
				const canonical = await realpath(candidate);
				if ((await stat(canonical)).isFile()) return canonical;
			} catch {
				// Continue through the fixed PATH candidates.
			}
		}
	}
	throw new Error("Local git executable is unavailable");
}

function containedPath(root, path) {
	if (typeof path !== "string" || !path || path.includes("\0") || isAbsolute(path)) {
		throw new Error("Git fixture paths must be nonempty relative paths");
	}
	const target = resolve(root, path);
	const targetRelative = relative(root, target);
	if (!targetRelative || targetRelative.startsWith("..") || isAbsolute(targetRelative)) {
		throw new Error("Git fixture path escapes its temporary repository");
	}
	return target;
}

function validateWorkspaceId(workspaceId) {
	if (typeof workspaceId !== "string" || !WORKSPACE_ID.test(workspaceId)) {
		throw new Error("Git fixture workspace ID is invalid");
	}
	return workspaceId;
}

function validateObjectId(objectId) {
	if (typeof objectId !== "string" || !OBJECT_ID.test(objectId)) {
		throw new Error("Git fixture object ID is invalid");
	}
	return objectId;
}

function shortBranch(kind, workspaceId) {
	const branch = `pi/sub-agents/${kind}/${validateWorkspaceId(workspaceId)}`;
	if (!SHORT_FIXTURE_BRANCH.test(branch)) throw new Error("Git fixture branch is invalid");
	return branch;
}

function fullBranch(kind, workspaceId) {
	return `refs/heads/${shortBranch(kind, workspaceId)}`;
}

function strictUtf8(buffer, label) {
	try {
		return UTF8_DECODER.decode(buffer);
	} catch {
		throw new Error(`${label} is not valid UTF-8`);
	}
}

function validateTreePath(path) {
	if (typeof path !== "string" || !path || path.includes("\0") || path.includes("\\") || isAbsolute(path)) {
		throw new Error("Git tree path is invalid");
	}
	const parts = path.split("/");
	if (parts.some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) {
		throw new Error("Git tree path is unsafe");
	}
	if (path !== path.normalize("NFC")) throw new Error("Git tree path is not NFC-normalized");
	return path;
}

function gitEnvironment(source, home, temporary) {
	const environment = {};
	for (const name of ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC", "LANG", "LC_ALL", "LC_CTYPE"]) {
		const value = source[name];
		if (typeof value === "string" && !value.includes("\0")) environment[name] = value;
	}
	if (!environment.PATH) throw new Error("PATH is required for the local git fixture");
	return {
		...environment,
		HOME: home,
		USERPROFILE: home,
		XDG_CONFIG_HOME: join(home, ".config"),
		TMPDIR: temporary,
		TMP: temporary,
		TEMP: temporary,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
		GIT_TERMINAL_PROMPT: "0",
		GIT_NO_LAZY_FETCH: "1",
		GIT_NO_REPLACE_OBJECTS: "1",
		GIT_AUTHOR_NAME: "Pi Offline Fixture",
		GIT_AUTHOR_EMAIL: "pi-offline@example.invalid",
		GIT_COMMITTER_NAME: "Pi Offline Fixture",
		GIT_COMMITTER_EMAIL: "pi-offline@example.invalid",
		PI_SUB_AGENTS_LOCAL_GIT_FIXTURE: "1",
	};
}

async function executeGit(context, args, options = {}) {
	throwIfAborted(options.signal);
	const result = await execFileAsync(context.gitExecutable, [
		...gitConfigPrefix(context.hooks),
		...args,
	], {
		cwd: options.cwd ?? context.repository,
		env: context.environment,
		encoding: options.encoding ?? "utf8",
		timeout: options.timeoutMs ?? GIT_TIMEOUT_MS,
		maxBuffer: MAX_GIT_OUTPUT_BYTES,
		windowsHide: true,
		...(options.signal ? { signal: options.signal } : {}),
	}, options.input);
	return { stdout: result.stdout, stderr: result.stderr };
}

function validatePublicGitArguments(args) {
	if (!Array.isArray(args) || args.length === 0) {
		throw new Error("Local git fixture rejected a non-allowlisted subcommand");
	}
	for (const value of args) {
		if (
			typeof value !== "string" ||
			value.includes("\0") ||
			REMOTE_ARGUMENT.test(value) ||
			UNSAFE_GIT_OPTION.test(value) ||
			UNSAFE_GIT_TEXT.test(value)
		) {
			throw new Error("Local git fixture rejected a remote-capable or side-effecting argument");
		}
	}
	if (!SAFE_PUBLIC_GIT_ARGUMENTS.some((expected) =>
		expected.length === args.length && expected.every((value, index) => value === args[index])
	)) {
		throw new Error("Local git fixture rejected a non-allowlisted subcommand");
	}
}

export function parseWorktreePorcelainZ(input) {
	const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
	const text = strictUtf8(buffer, "Git worktree porcelain output");
	if (!text.endsWith("\0\0")) throw new Error("Git worktree porcelain output is not double-NUL terminated");
	const records = [];
	let current = undefined;
	for (const token of text.split("\0")) {
		if (token === "") {
			if (!current) continue;
			if (!current.path || !current.head || (!current.branch && !current.detached && !current.bare)) {
				throw new Error("Git worktree porcelain record is incomplete");
			}
			records.push(Object.freeze(current));
			current = undefined;
			continue;
		}
		current ??= {};
		const space = token.indexOf(" ");
		const key = space === -1 ? token : token.slice(0, space);
		const value = space === -1 ? "" : token.slice(space + 1);
		if (key === "worktree") {
			if (current.path || !isAbsolute(value) || value.includes("\0")) throw new Error("Git worktree path is invalid");
			current.path = value;
		} else if (key === "HEAD") {
			if (current.head) throw new Error("Git worktree HEAD is duplicated");
			current.head = validateObjectId(value);
		} else if (key === "branch") {
			if (current.branch || !/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/u.test(value) || value.includes("..")) {
				throw new Error("Git worktree branch is invalid");
			}
			current.branch = value;
		} else if (key === "detached" || key === "bare") {
			if (value) throw new Error(`Git worktree ${key} marker is invalid`);
			current[key] = true;
		} else if (key === "locked" || key === "prunable") {
			if (value.includes("\n") || value.includes("\r") || value.length > 256) throw new Error(`Git worktree ${key} reason is invalid`);
			current[key] = value || true;
		} else {
			throw new Error(`Git worktree porcelain field is unsupported: ${key}`);
		}
	}
	if (current) throw new Error("Git worktree porcelain output ended inside a record");
	return Object.freeze(records);
}

export function parseLsTreeZ(input) {
	const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
	if (buffer.length > 0 && buffer.at(-1) !== 0) throw new Error("Git ls-tree output is not NUL terminated");
	const records = [];
	const collisionKeys = new Set();
	let start = 0;
	for (let index = 0; index < buffer.length; index += 1) {
		if (buffer[index] !== 0) continue;
		const recordText = strictUtf8(buffer.subarray(start, index), "Git ls-tree record");
		start = index + 1;
		const match = /^(100644|100755|120000) blob ([0-9a-f]+)\t(.+)$|^(160000) commit ([0-9a-f]+)\t(.+)$/u.exec(recordText);
		if (!match) throw new Error("Git ls-tree record is malformed or has an unsupported mode");
		const mode = match[1] ?? match[4];
		const type = match[1] ? "blob" : "commit";
		const oid = validateObjectId(match[2] ?? match[5]);
		const path = validateTreePath(match[3] ?? match[6]);
		const collisionKey = path.normalize("NFC").toLocaleLowerCase("en-US");
		if (collisionKeys.has(collisionKey)) throw new Error("Git tree contains a case or normalization collision");
		collisionKeys.add(collisionKey);
		records.push(Object.freeze({ mode, type, oid, path }));
	}
	return Object.freeze(records);
}

export function parseCatFileBatch(input, expectedObjectIds) {
	if (!Array.isArray(expectedObjectIds) || expectedObjectIds.length > 1_000) {
		throw new Error("Expected Git object IDs must be a bounded array");
	}
	const expected = expectedObjectIds.map(validateObjectId);
	if (new Set(expected).size !== expected.length) throw new Error("Expected Git object IDs must be unique");
	const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
	const objects = new Map();
	let offset = 0;
	for (const expectedOid of expected) {
		const newline = buffer.indexOf(10, offset);
		if (newline === -1) throw new Error("Git cat-file batch header is unterminated");
		const header = strictUtf8(buffer.subarray(offset, newline), "Git cat-file batch header");
		const match = /^([0-9a-f]+) blob ([0-9]+)$/u.exec(header);
		if (!match || validateObjectId(match[1]) !== expectedOid) throw new Error("Git cat-file batch header is malformed or out of order");
		const size = Number(match[2]);
		if (!Number.isSafeInteger(size) || size < 0 || size > MAX_GIT_OUTPUT_BYTES) throw new Error("Git cat-file batch object size is invalid");
		const contentStart = newline + 1;
		const contentEnd = contentStart + size;
		if (contentEnd >= buffer.length || buffer[contentEnd] !== 10) throw new Error("Git cat-file batch object framing is malformed");
		objects.set(expectedOid, Buffer.from(buffer.subarray(contentStart, contentEnd)));
		offset = contentEnd + 1;
	}
	if (offset !== buffer.length) throw new Error("Git cat-file batch output has unexpected trailing data");
	return objects;
}

async function assertEmptyNoCheckoutWorktree(path) {
	const entries = await readdir(path, { withFileTypes: true });
	if (entries.length !== 1 || entries[0].name !== ".git" || !entries[0].isFile() || entries[0].isSymbolicLink()) {
		throw new Error("No-checkout worktree contains an unexpected preexisting entry");
	}
	const gitFile = await lstat(join(path, ".git"));
	if (!gitFile.isFile() || gitFile.isSymbolicLink()) throw new Error("Linked worktree .git entry is invalid");
}

async function readTreeSnapshot(context, record, options = {}) {
	throwIfAborted(options.signal);
	if (options.populateIndex) {
		await assertEmptyNoCheckoutWorktree(record.path);
		await executeGit(context, ["read-tree", "--reset", record.baseCommit], { cwd: record.path, signal: options.signal });
	}
	const treeResult = await executeGit(context, ["ls-tree", "-rz", "--full-tree", record.baseCommit], {
		cwd: record.path,
		encoding: null,
		signal: options.signal,
	});
	const entries = parseLsTreeZ(treeResult.stdout);
	const objectIds = [...new Set(entries.filter((entry) => entry.type === "blob").map((entry) => entry.oid))];
	const batchInput = objectIds.length === 0 ? Buffer.alloc(0) : Buffer.from(`${objectIds.join("\n")}\n`, "utf8");
	const batchResult = await executeGit(context, ["cat-file", "--batch"], {
		cwd: record.path,
		encoding: null,
		input: batchInput,
		signal: options.signal,
	});
	return Object.freeze({ entries, objects: parseCatFileBatch(batchResult.stdout, objectIds) });
}

function parseIndexEntries(input) {
	const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
	if (buffer.length > 0 && buffer.at(-1) !== 0) throw new Error("Git index output is not NUL terminated");
	const entries = [];
	for (const raw of strictUtf8(buffer, "Git index output").split("\0")) {
		if (!raw) continue;
		const match = /^(100644|100755|120000|160000) ([0-9a-f]+) ([0-3])\t(.+)$/u.exec(raw);
		if (!match || match[3] !== "0") throw new Error("Git index entry is malformed or conflicted");
		entries.push(Object.freeze({ mode: match[1], oid: validateObjectId(match[2]), path: validateTreePath(match[4]) }));
	}
	return entries;
}

async function assertExactFixtureManifest(context, record, options = {}) {
	const snapshot = await readTreeSnapshot(context, record, { signal: options.signal, populateIndex: false });
	const indexResult = await executeGit(context, ["ls-files", "--stage", "-z"], {
		cwd: record.path,
		encoding: null,
		signal: options.signal,
	});
	const indexEntries = parseIndexEntries(indexResult.stdout);
	if (indexEntries.length !== snapshot.entries.length) throw new Error("Git fixture index does not match the recorded tree");
	for (let index = 0; index < indexEntries.length; index += 1) {
		const actual = indexEntries[index];
		const expectedEntry = snapshot.entries[index];
		if (actual.mode !== expectedEntry.mode || actual.oid !== expectedEntry.oid || actual.path !== expectedEntry.path) {
			throw new Error("Git fixture index does not match the recorded tree");
		}
	}
	const expected = new Map(snapshot.entries.map((entry) => [entry.path, entry]));
	const expectedDirectories = new Set();
	for (const entry of snapshot.entries) {
		let parent = dirname(entry.path).replaceAll("\\", "/");
		while (parent && parent !== ".") {
			expectedDirectories.add(parent);
			parent = dirname(parent).replaceAll("\\", "/");
		}
	}
	const seen = new Set();
	async function walk(directory, prefix = "") {
		const directoryEntries = await readdir(directory, { withFileTypes: true });
		for (const directoryEntry of directoryEntries) {
			if (!prefix && directoryEntry.name === ".git") continue;
			const relativePath = prefix ? `${prefix}/${directoryEntry.name}` : directoryEntry.name;
			validateTreePath(relativePath);
			const absolutePath = containedPath(record.path, relativePath);
			const metadata = await lstat(absolutePath);
			if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
				if (!expectedDirectories.has(relativePath)) throw new Error("Git fixture manifest contains an extra directory");
				await walk(absolutePath, relativePath);
				continue;
			}
			const treeEntry = expected.get(relativePath);
			if (!treeEntry || treeEntry.mode === "160000") throw new Error("Git fixture manifest contains an extra or mismatched entry");
			seen.add(relativePath);
			const expectedContent = snapshot.objects.get(treeEntry.oid);
			if (!expectedContent) throw new Error("Git fixture manifest is missing an expected object");
			if (treeEntry.mode === "120000") {
				if (!metadata.isSymbolicLink() || Buffer.from(await readlink(absolutePath), "utf8").compare(expectedContent) !== 0) {
					throw new Error("Git fixture manifest symlink does not match");
				}
			} else {
				if (!metadata.isFile() || metadata.isSymbolicLink() || Buffer.compare(await readFile(absolutePath), expectedContent) !== 0) {
					throw new Error("Git fixture manifest file does not match");
				}
				const executable = (metadata.mode & 0o111) !== 0;
				if (executable !== (treeEntry.mode === "100755")) throw new Error("Git fixture manifest executable mode does not match");
			}
		}
	}
	await walk(record.path);
	for (const entry of snapshot.entries) {
		if (entry.mode !== "160000" && !seen.has(entry.path)) throw new Error("Git fixture manifest is missing a tracked entry");
	}
}

let defaultGitAvailabilityPromise;

async function probeLocalGitAvailability(source) {
	try {
		const gitExecutable = await resolveGitExecutable(source);
		const versionHome = tmpdir();
		const versionEnvironment = gitEnvironment(source, versionHome, versionHome);
		const versionResult = await execFileAsync(gitExecutable, ["--version"], {
			cwd: versionHome,
			env: versionEnvironment,
			encoding: "utf8",
			timeout: 5_000,
			maxBuffer: 64 * 1024,
			windowsHide: true,
		});
		if (!/^git version \d+\.\d+(?:\.\d+)?/u.test(versionResult.stdout.trim())) return false;
		return await withTempDirectory("pi-sub-agents-git-probe", async (temporary) => {
			const repository = join(temporary, "repository");
			const home = join(temporary, "home");
			const hooks = join(temporary, "empty-hooks");
			const processTemp = join(temporary, "tmp");
			const worktreeRoot = join(temporary, "worktrees");
			await Promise.all([
				mkdir(repository, { recursive: true }),
				mkdir(home, { recursive: true }),
				mkdir(hooks, { recursive: true }),
				mkdir(processTemp, { recursive: true }),
				mkdir(worktreeRoot, { recursive: true }),
			]);
			const context = {
				gitExecutable,
				repository,
				environment: gitEnvironment(source, home, processTemp),
				hooks,
			};
			await executeGit(context, ["init", "--quiet"]);
			await executeGit(context, ["symbolic-ref", "HEAD", "refs/heads/main"]);
			await writeFile(join(repository, "probe.txt"), "probe\n");
			await executeGit(context, ["add", "--all"]);
			await executeGit(context, ["commit", "--quiet", "--no-gpg-sign", "-m", "offline fixture"]);
			const baseCommit = validateObjectId((await executeGit(context, ["rev-parse", "--verify", "HEAD^{commit}"])).stdout.trim());
			const format = (await executeGit(context, ["rev-parse", "--show-object-format"])).stdout.trim();
			if (!new Set(["sha1", "sha256"]).has(format)) return false;

			const removablePath = join(worktreeRoot, "fixture-probe");
			await executeGit(context, ["check-ref-format", "--branch", "pi/sub-agents/fixture/probe"]);
			await executeGit(context, [
				"worktree", "add", "--no-checkout", "--lock", "--reason", FIXTURE_LOCK_REASON,
				"-b", "pi/sub-agents/fixture/probe", removablePath, baseCommit,
			]);
			const listed = parseWorktreePorcelainZ((await executeGit(context, ["worktree", "list", "--porcelain", "-z"], { encoding: null })).stdout);
			const canonicalRemovablePath = await realpath(removablePath);
			if (!listed.some((entry) => entry.path === canonicalRemovablePath && entry.locked)) return false;
			await executeGit(context, ["read-tree", "--reset", baseCommit], { cwd: removablePath });
			await writeFile(join(removablePath, "probe.txt"), "probe\n");
			await executeGit(context, ["worktree", "unlock", removablePath]);
			await executeGit(context, ["worktree", "lock", "--reason", FIXTURE_LOCK_REASON, removablePath]);
			await executeGit(context, ["worktree", "unlock", removablePath]);
			await executeGit(context, ["worktree", "remove", removablePath]);

			const objectPath = join(worktreeRoot, "fixture-objects");
			await executeGit(context, ["check-ref-format", "--branch", "pi/sub-agents/fixture/objects"]);
			await executeGit(context, [
				"worktree", "add", "--no-checkout", "--lock", "--reason", FIXTURE_LOCK_REASON,
				"-b", "pi/sub-agents/fixture/objects", objectPath, baseCommit,
			]);
			await executeGit(context, ["read-tree", "--reset", baseCommit], { cwd: objectPath });
			const tree = parseLsTreeZ((await executeGit(context, ["ls-tree", "-rz", "--full-tree", baseCommit], { cwd: objectPath, encoding: null })).stdout);
			const blob = tree.find((entry) => entry.type === "blob");
			if (!blob) return false;
			const batch = await executeGit(context, ["cat-file", "--batch"], {
				cwd: objectPath,
				encoding: null,
				input: Buffer.from(`${blob.oid}\n`, "utf8"),
			});
			parseCatFileBatch(batch.stdout, [blob.oid]);
			await executeGit(context, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: objectPath, encoding: null });
			await executeGit(context, ["diff", "--no-ext-diff", "--no-textconv", "--numstat", "-z", baseCommit, "--"], { cwd: objectPath, encoding: null });
			await executeGit(context, ["ls-files", "--stage", "-z"], { cwd: objectPath, encoding: null });
			return true;
		});
	} catch {
		return false;
	}
}

export async function isLocalGitAvailable(source = process.env) {
	if (source !== process.env) return probeLocalGitAvailability(source);
	defaultGitAvailabilityPromise ??= probeLocalGitAvailability(source);
	return defaultGitAvailabilityPromise;
}

/**
 * Create one disposable local repository with isolated config, no remotes, and
 * a closed typed worktree/object API. The legacy runGit helper remains limited
 * to two read-only compatibility probes and cannot invoke worktree commands.
 */
export async function withTempGitRepository(options, operation) {
	if (!options || typeof options !== "object" || typeof operation !== "function") {
		throw new Error("Temporary git fixture options and operation are required");
	}
	if (!await isLocalGitAvailable()) throw new Error("Local git executable is unavailable");
	return withTempDirectory(options.prefix ?? "pi-sub-agents-git", async (temporary) => {
		const repository = join(temporary, "repository");
		const home = join(temporary, "home");
		const hooks = join(temporary, "empty-hooks");
		const processTemp = join(temporary, "tmp");
		const worktreeRoot = join(temporary, "worktrees");
		const outside = join(temporary, "outside");
		await Promise.all([
			mkdir(repository, { recursive: true }),
			mkdir(home, { recursive: true }),
			mkdir(hooks, { recursive: true }),
			mkdir(processTemp, { recursive: true }),
			mkdir(worktreeRoot, { recursive: true }),
			mkdir(outside, { recursive: true }),
		]);
		const gitExecutable = await resolveGitExecutable(process.env);
		const environment = gitEnvironment(process.env, home, processTemp);
		const context = { gitExecutable, repository, environment, hooks };
		await executeGit(context, ["init", "--quiet"]);
		await executeGit(context, ["symbolic-ref", "HEAD", "refs/heads/main"]);
		for (const [path, content] of Object.entries(options.files ?? { "README.md": "offline fixture\n" })) {
			if (typeof content !== "string" && !Buffer.isBuffer(content)) {
				throw new Error(`Git fixture file content must be string or Buffer: ${path}`);
			}
			const target = containedPath(repository, path);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, content);
		}
		for (const path of options.executableFiles ?? []) {
			const target = containedPath(repository, path);
			await chmod(target, 0o755);
		}
		for (const [path, target] of Object.entries(options.symlinks ?? {})) {
			if (typeof target !== "string" || !target || target.includes("\0")) throw new Error(`Git fixture symlink target is invalid: ${path}`);
			const link = containedPath(repository, path);
			await mkdir(dirname(link), { recursive: true });
			await symlink(target, link);
		}
		if (options.initialCommit !== false) {
			await executeGit(context, ["add", "--all"]);
			await executeGit(context, ["commit", "--quiet", "--no-gpg-sign", "-m", "offline fixture"]);
		}
		const baseCommit = (await executeGit(context, ["rev-parse", "--verify", "HEAD^{commit}"])).stdout.trim();
		validateObjectId(baseCommit);
		const owned = new Map();
		const unowned = new Map();

		async function inspectRepository(options = {}) {
			throwIfAborted(options.signal);
			const [top, common, head, branch, objectFormat, statusResult] = await Promise.all([
				executeGit(context, ["rev-parse", "--show-toplevel"], { signal: options.signal }),
				executeGit(context, ["rev-parse", "--git-common-dir"], { signal: options.signal }),
				executeGit(context, ["rev-parse", "--verify", "HEAD^{commit}"], { signal: options.signal }),
				executeGit(context, ["symbolic-ref", "--quiet", "HEAD"], { signal: options.signal }),
				executeGit(context, ["rev-parse", "--show-object-format"], { signal: options.signal }),
				executeGit(context, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { encoding: null, signal: options.signal }),
			]);
			const topLevel = await realpath(top.stdout.trim());
			const commonValue = common.stdout.trim();
			const commonDirectory = await realpath(isAbsolute(commonValue) ? commonValue : resolve(repository, commonValue));
			const headCommit = validateObjectId(head.stdout.trim());
			const branchRef = branch.stdout.trim();
			if (!/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/u.test(branchRef)) throw new Error("Git fixture repository branch is invalid");
			const format = objectFormat.stdout.trim();
			if (!new Set(["sha1", "sha256"]).has(format)) throw new Error("Git fixture object format is unsupported");
			return Object.freeze({ topLevel, commonDirectory, headCommit, branchRef, objectFormat: format, clean: statusResult.stdout.length === 0 });
		}

		async function registerNoCheckout(kind, workspaceId, registerOptions = {}) {
			throwIfAborted(registerOptions.signal);
			const id = validateWorkspaceId(workspaceId);
			const records = kind === "fixture" ? owned : unowned;
			if (records.has(id)) throw new Error("Git fixture workspace ID is already registered");
			const selectedBase = validateObjectId(registerOptions.baseCommit ?? baseCommit);
			if (selectedBase !== baseCommit) throw new Error("Git fixture rejected a stale or foreign base object ID");
			const branch = shortBranch(kind, id);
			const branchRef = fullBranch(kind, id);
			const path = join(worktreeRoot, `${kind}-${id}`);
			try {
				await lstat(path);
				throw new Error("Git fixture worktree destination already exists");
			} catch (error) {
				if (error?.code !== "ENOENT") throw error;
			}
			await executeGit(context, ["check-ref-format", "--branch", branch], { signal: registerOptions.signal });
			await executeGit(context, [
				"worktree", "add", "--no-checkout", "--lock", "--reason", FIXTURE_LOCK_REASON,
				"-b", branch, path, selectedBase,
			], { signal: registerOptions.signal });
			const canonicalPath = await realpath(path);
			const record = Object.freeze({ id, kind, path: canonicalPath, branchRef, baseCommit: selectedBase, removed: false });
			records.set(id, record);
			return record;
		}

		function requireOwned(workspaceId, { allowRemoved = false } = {}) {
			const id = validateWorkspaceId(workspaceId);
			const record = owned.get(id);
			if (!record || (!allowRemoved && record.removed)) throw new Error("Git fixture does not own this live worktree");
			return record;
		}

		async function listWorktrees(options = {}) {
			const result = await executeGit(context, ["worktree", "list", "--porcelain", "-z"], { encoding: null, signal: options.signal });
			return parseWorktreePorcelainZ(result.stdout);
		}

		const worktrees = Object.freeze({
			inspectRepository,
			registerOwnedNoCheckout(workspaceId, registerOptions) {
				return registerNoCheckout("fixture", workspaceId, registerOptions);
			},
			registerUnownedNoCheckoutForTest(workspaceId, registerOptions) {
				return registerNoCheckout("unowned", workspaceId, registerOptions);
			},
			list: listWorktrees,
			async prepareOwnedSnapshot(workspaceId, snapshotOptions = {}) {
				return readTreeSnapshot(context, requireOwned(workspaceId), { ...snapshotOptions, populateIndex: true });
			},
			async statusOwned(workspaceId, statusOptions = {}) {
				const record = requireOwned(workspaceId);
				const args = statusOptions.includeIgnored
					? ["status", "--ignored", "--porcelain=v1", "-z", "--untracked-files=all"]
					: ["status", "--porcelain=v1", "-z", "--untracked-files=all"];
				const result = await executeGit(context, args, { cwd: record.path, encoding: null, signal: statusOptions.signal });
				return Buffer.from(result.stdout);
			},
			async diffNumstatOwned(workspaceId, diffOptions = {}) {
				const record = requireOwned(workspaceId);
				const result = await executeGit(context, ["diff", "--no-ext-diff", "--no-textconv", "--numstat", "-z", record.baseCommit, "--"], {
					cwd: record.path,
					encoding: null,
					signal: diffOptions.signal,
				});
				return Buffer.from(result.stdout);
			},
			async indexEntriesOwned(workspaceId, indexOptions = {}) {
				const record = requireOwned(workspaceId);
				const result = await executeGit(context, ["ls-files", "--stage", "-z"], {
					cwd: record.path,
					encoding: null,
					signal: indexOptions.signal,
				});
				return Buffer.from(result.stdout);
			},
			async injectOwnedIndexConflictForTest(workspaceId, conflictOptions = {}) {
				const record = requireOwned(workspaceId);
				const snapshot = await readTreeSnapshot(context, record, { signal: conflictOptions.signal, populateIndex: false });
				const selected = snapshot.entries.find((entry) => entry.type === "blob" && entry.mode !== "120000");
				if (!selected) throw new Error("Git fixture requires one regular tracked file for a conflict");
				const zeroObjectId = "0".repeat(selected.oid.length);
				const input = Buffer.from(
					`0 ${zeroObjectId} 0\t${selected.path}\0` +
					`${selected.mode} ${selected.oid} 1\t${selected.path}\0` +
					`${selected.mode} ${selected.oid} 2\t${selected.path}\0` +
					`${selected.mode} ${selected.oid} 3\t${selected.path}\0`,
					"utf8",
				);
				await executeGit(context, ["update-index", "-z", "--index-info"], {
					cwd: record.path,
					input,
					signal: conflictOptions.signal,
				});
				return selected.path;
			},
			async unlockOwned(workspaceId, unlockOptions = {}) {
				const record = requireOwned(workspaceId);
				await executeGit(context, ["worktree", "unlock", record.path], { signal: unlockOptions.signal });
			},
			async lockOwned(workspaceId, lockOptions = {}) {
				const record = requireOwned(workspaceId);
				await executeGit(context, ["worktree", "lock", "--reason", FIXTURE_LOCK_REASON, record.path], { signal: lockOptions.signal });
			},
			async removeOwnedClean(workspaceId, removeOptions = {}) {
				const record = requireOwned(workspaceId);
				throwIfAborted(removeOptions.signal);
				const statusResult = await executeGit(context, ["status", "--ignored", "--porcelain=v1", "-z", "--untracked-files=all"], {
					cwd: record.path,
					encoding: null,
					signal: removeOptions.signal,
				});
				if (statusResult.stdout.length !== 0) throw new Error("Git fixture refused to remove a dirty or extra-entry worktree");
				await assertExactFixtureManifest(context, record, { signal: removeOptions.signal });
				const registration = (await listWorktrees({ signal: removeOptions.signal })).find((entry) => entry.path === record.path);
				if (!registration || registration.branch !== record.branchRef || registration.head !== record.baseCommit) {
					throw new Error("Git fixture worktree ownership proof does not match");
				}
				if (registration.locked) await executeGit(context, ["worktree", "unlock", record.path], { signal: removeOptions.signal });
				await executeGit(context, ["worktree", "remove", record.path], { signal: removeOptions.signal });
				owned.set(record.id, Object.freeze({ ...record, removed: true }));
			},
			async branchCommitOwned(workspaceId, branchOptions = {}) {
				const record = requireOwned(workspaceId, { allowRemoved: true });
				if (!FULL_FIXTURE_BRANCH.test(record.branchRef)) throw new Error("Git fixture stored branch is invalid");
				const result = await executeGit(context, ["rev-parse", "--verify", `${record.branchRef}^{commit}`], { signal: branchOptions.signal });
				return validateObjectId(result.stdout.trim());
			},
		});

		const runGit = async (args) => {
			validatePublicGitArguments(args);
			return executeGit(context, args);
		};
		const listRemotes = async () => (await executeGit(context, ["remote"])).stdout
			.split(/\r?\n/u)
			.filter(Boolean);
		return operation({
			temporary,
			repository,
			outside,
			worktreeRoot,
			baseCommit,
			gitExecutable,
			runGit,
			listRemotes,
			worktrees,
			readSymlink: readlink,
		});
	});
}
