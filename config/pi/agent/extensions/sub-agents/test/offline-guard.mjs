import { createRequire, syncBuiltinESMExports } from "node:module";
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

if (process.env.PI_SUB_AGENTS_OFFLINE_TEST !== "1") {
	throw new Error("The sub-agents offline guard requires PI_SUB_AGENTS_OFFLINE_TEST=1");
}

export class OfflineNetworkAccessError extends Error {
	constructor(operation) {
		super(`Offline sub-agents tests blocked network or external-process access: ${operation}`);
		this.name = "OfflineNetworkAccessError";
		this.code = "SUB_AGENTS_OFFLINE_NETWORK_BLOCKED";
	}
}

function blocked(operation) {
	return function blockOfflineAccess() {
		throw new OfflineNetworkAccessError(operation);
	};
}

const require = createRequire(import.meta.url);
const net = require("node:net");
const tls = require("node:tls");
const http = require("node:http");
const https = require("node:https");
const http2 = require("node:http2");
const dgram = require("node:dgram");
const dns = require("node:dns");
const childProcess = require("node:child_process");
const cluster = require("node:cluster");
const workerThreads = require("node:worker_threads");

net.connect = blocked("net.connect");
net.createConnection = blocked("net.createConnection");
net.createServer = blocked("net.createServer");
net.Socket.prototype.connect = blocked("net.Socket.connect");
net.Server.prototype.listen = blocked("net.Server.listen");
tls.connect = blocked("tls.connect");
tls.createServer = blocked("tls.createServer");
http.request = blocked("http.request");
http.get = blocked("http.get");
http.createServer = blocked("http.createServer");
https.request = blocked("https.request");
https.get = blocked("https.get");
https.createServer = blocked("https.createServer");
http2.connect = blocked("http2.connect");
http2.createServer = blocked("http2.createServer");
http2.createSecureServer = blocked("http2.createSecureServer");
dgram.createSocket = blocked("dgram.createSocket");
cluster.fork = blocked("cluster.fork");
workerThreads.Worker = blocked("worker_threads.Worker");

const DNS_METHODS = Object.freeze([
	"lookup",
	"lookupService",
	"resolve",
	"resolve4",
	"resolve6",
	"resolveAny",
	"resolveCaa",
	"resolveCname",
	"resolveMx",
	"resolveNaptr",
	"resolveNs",
	"resolvePtr",
	"resolveSoa",
	"resolveSrv",
	"resolveTxt",
	"reverse",
]);
for (const name of DNS_METHODS) {
	if (typeof dns[name] === "function") dns[name] = blocked(`dns.${name}`);
	if (typeof dns.Resolver?.prototype?.[name] === "function") {
		dns.Resolver.prototype[name] = blocked(`dns.Resolver.${name}`);
	}
	if (typeof dns.promises?.[name] === "function") {
		dns.promises[name] = async () => {
			throw new OfflineNetworkAccessError(`dns.promises.${name}`);
		};
	}
	if (typeof dns.promises?.Resolver?.prototype?.[name] === "function") {
		dns.promises.Resolver.prototype[name] = async () => {
			throw new OfflineNetworkAccessError(`dns.promises.Resolver.${name}`);
		};
	}
}

Object.defineProperty(globalThis, "fetch", {
	value: async () => {
		throw new OfflineNetworkAccessError("fetch");
	},
	writable: false,
	configurable: false,
});

if ("WebSocket" in globalThis) {
	Object.defineProperty(globalThis, "WebSocket", {
		value: class OfflineWebSocket {
			constructor() {
				throw new OfflineNetworkAccessError("WebSocket");
			}
		},
		writable: false,
		configurable: false,
	});
}

const originalChildProcess = Object.freeze({
	spawn: childProcess.spawn,
	spawnSync: childProcess.spawnSync,
	execFile: childProcess.execFile,
	execFileSync: childProcess.execFileSync,
});
const OFFLINE_GUARD_URL = import.meta.url;
const INITIAL_PATH = process.env.PATH;
const FIXTURE_LOCK_REASON = "pi-sub-agents-offline-fixture";
const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const GIT_WORKSPACE_ID = /^[a-z][a-z0-9-]{0,31}$/u;
const GIT_SHORT_FIXTURE_BRANCH = /^pi\/sub-agents\/(fixture|unowned)\/([a-z][a-z0-9-]{0,31})$/u;
const GIT_FULL_FIXTURE_BRANCH = /^refs\/heads\/pi\/sub-agents\/(fixture|unowned)\/([a-z][a-z0-9-]{0,31})$/u;
const PRODUCTION_REPOSITORY_KEY = /^[0-9a-f]{64}$/u;
const PRODUCTION_WORKSPACE_ID = /^saw1-[A-Za-z0-9_-]{32,180}$/u;
const PRODUCTION_SHORT_BRANCH = /^pi\/sub-agents\/([0-9a-f]{16})\/(saw1-[A-Za-z0-9_-]{32,180})$/u;
const PRODUCTION_FULL_BRANCH = /^refs\/heads\/pi\/sub-agents\/([0-9a-f]{16})\/(saw1-[A-Za-z0-9_-]{32,180})$/u;
const SAFE_FIXED_GIT_ARGUMENTS = Object.freeze([
	["--version"],
	["init", "--quiet"],
	["symbolic-ref", "HEAD", "refs/heads/main"],
	["symbolic-ref", "--quiet", "HEAD"],
	["add", "--all"],
	["commit", "--quiet", "--no-gpg-sign", "-m", "offline fixture"],
	["remote"],
	["rev-parse", "--abbrev-ref", "HEAD"],
	["rev-parse", "--show-toplevel"],
	["rev-parse", "--git-common-dir"],
	["rev-parse", "--verify", "HEAD^{commit}"],
	["rev-parse", "--show-object-format"],
	["status", "--porcelain"],
	["status", "--porcelain=v1", "-z", "--untracked-files=all"],
	["status", "--ignored", "--porcelain=v1", "-z", "--untracked-files=all"],
	["worktree", "list", "--porcelain", "-z"],
	["cat-file", "--batch"],
	["ls-files", "--stage", "-z"],
	["ls-files", "-v", "-z"],
	["update-index", "-z", "--index-info"],
]);
const SAFE_NODE_ENVIRONMENT = new Set([
	"PATH",
	"PATHEXT",
	"SystemRoot",
	"WINDIR",
	"COMSPEC",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"TERM",
	"COLORTERM",
	"NO_COLOR",
	"FORCE_COLOR",
	"CI",
	"PI_CODING_AGENT_PACKAGE_DIR",
	"PI_AI_PACKAGE_DIR",
	"PI_TUI_PACKAGE_DIR",
	"HOME",
	"USERPROFILE",
	"XDG_CONFIG_HOME",
	"XDG_CACHE_HOME",
	"XDG_DATA_HOME",
	"TMPDIR",
	"TMP",
	"TEMP",
	"PI_SUB_AGENTS_OFFLINE_TEST",
	"GIT_CONFIG_NOSYSTEM",
	"GIT_CONFIG_GLOBAL",
	"GIT_TERMINAL_PROMPT",
]);
const SAFE_PRODUCTION_GIT_ENVIRONMENT = new Set([
	"PATH",
	"PATHEXT",
	"SystemRoot",
	"WINDIR",
	"COMSPEC",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"HOME",
	"USERPROFILE",
	"XDG_CONFIG_HOME",
	"TMPDIR",
	"TMP",
	"TEMP",
	"GIT_CONFIG_NOSYSTEM",
	"GIT_CONFIG_GLOBAL",
	"GIT_TERMINAL_PROMPT",
	"GIT_NO_LAZY_FETCH",
	"GIT_NO_REPLACE_OBJECTS",
]);
const PRODUCTION_GIT_PREFIX_TAIL = Object.freeze([
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
const SAFE_GIT_ENVIRONMENT = new Set([
	"PATH",
	"PATHEXT",
	"SystemRoot",
	"WINDIR",
	"COMSPEC",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"HOME",
	"USERPROFILE",
	"XDG_CONFIG_HOME",
	"TMPDIR",
	"TMP",
	"TEMP",
	"GIT_CONFIG_NOSYSTEM",
	"GIT_CONFIG_GLOBAL",
	"GIT_TERMINAL_PROMPT",
	"GIT_NO_LAZY_FETCH",
	"GIT_NO_REPLACE_OBJECTS",
	"GIT_AUTHOR_NAME",
	"GIT_AUTHOR_EMAIL",
	"GIT_COMMITTER_NAME",
	"GIT_COMMITTER_EMAIL",
	"PI_SUB_AGENTS_LOCAL_GIT_FIXTURE",
]);
const SAFE_SHELL_ENVIRONMENT = new Set([
	"COLORTERM",
	"ComSpec",
	"HOME",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"LOGNAME",
	"PATH",
	"PATHEXT",
	"SHELL",
	"SystemRoot",
	"TEMP",
	"TERM",
	"TMP",
	"TMPDIR",
	"USER",
	"WINDIR",
]);
const SAFE_FOCUSED_SHELL_ENVIRONMENT = new Set([
	...SAFE_NODE_ENVIRONMENT,
	...SAFE_SHELL_ENVIRONMENT,
	"NODE_TEST_CONTEXT",
	"PI_SESSION_ID",
	"PI_PROVIDER",
	"PI_MODEL",
	"PI_REASONING_LEVEL",
]);
const SAFE_RG_ENVIRONMENT = new Set([
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"PATH",
	"PATHEXT",
	"SystemRoot",
	"WINDIR",
]);
const SAFE_RG_FLAGS = new Set([
	"--no-config",
	"--line-number",
	"--color=never",
	"--hidden",
	"--no-heading",
	"--with-filename",
	"--no-messages",
	"--max-columns-preview",
	"--ignore-case",
	"--fixed-strings",
]);
const SAFE_RG_VALUE_FLAGS = new Set([
	"--max-filesize",
	"--max-columns",
	"--context",
	"--glob",
	"--iglob",
]);
const REMOTE_ARGUMENT = /(?:[a-z][a-z0-9+.-]*:\/\/|[^/\s]+@[^:\s]+:)/iu;
const UNSAFE_PROCESS_ARGUMENT = /^(?:-c$|-f$|-S$|--force(?:=|$)|--prune(?:=|$)|--delete(?:=|$)|--output(?:=|$)|--exec(?:=|$)|--ext-diff$|--textconv$|--upload-pack(?:=|$)|--receive-pack(?:=|$)|--strategy(?:=|$)|--strategy-option(?:=|$)|--gpg-sign(?:=|$)|--show-signature$|--edit-description$|--config(?:=|$)|--global$|--system$|--local$|--worktree$)/u;
const UNSAFE_GIT_TEXT = /(?:^|[.=/-])(?:alias|credential|filter|hooks?|pager|editor|askpass|sshcommand|textconv|fsmonitor|uploadpack|receivepack)(?:[.=/-]|$)/iu;

function sandboxRoot() {
	const home = process.env.HOME || process.env.USERPROFILE;
	const temporary = process.env.TMPDIR || process.env.TMP || process.env.TEMP;
	if (!home || !temporary) return undefined;
	try {
		const homeParent = realpathSync(dirname(resolve(home)));
		const tempParent = realpathSync(dirname(resolve(temporary)));
		return homeParent === tempParent ? homeParent : undefined;
	} catch {
		return undefined;
	}
}

function isInsideSandbox(path) {
	const root = sandboxRoot();
	if (!root || typeof path !== "string") return false;
	try {
		const target = realpathSync(path);
		const targetRelative = relative(root, target);
		return target === root || (targetRelative !== "" && !targetRelative.startsWith("..") && !isAbsolute(targetRelative));
	} catch {
		return false;
	}
}

function isInsideSandboxAllowMissingLeaf(path) {
	if (isInsideSandbox(path)) return true;
	const root = sandboxRoot();
	if (!root || typeof path !== "string" || !isAbsolute(path) || path.includes("\0")) return false;
	try {
		const parent = realpathSync(dirname(path));
		const parentRelative = relative(root, parent);
		return basename(path) !== "" && basename(path) !== "." && basename(path) !== ".." &&
			(parent === root || (parentRelative !== "" && !parentRelative.startsWith("..") && !isAbsolute(parentRelative)));
	} catch {
		return false;
	}
}

function commandName(command) {
	return basename(String(command)).toLowerCase().replace(/\.exe$/u, "");
}

function findExecutable(command, searchPath = INITIAL_PATH) {
	if (typeof command !== "string" || !command || command.includes("\0")) return undefined;
	const suffixes = process.platform === "win32"
		? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
		: [""];
	const paths = basename(command) === command
		? (searchPath ?? "").split(delimiter).filter(Boolean).flatMap((directory) => suffixes.map((suffix) => join(directory, `${command}${suffix}`)))
		: [command];
	for (const path of paths) {
		try {
			const canonical = realpathSync(path);
			if (statSync(canonical).isFile()) return canonical;
		} catch {
			// Continue through the fixed PATH candidates.
		}
	}
	return undefined;
}

const PINNED_EXECUTABLES = new Map(
	["git", "rg", "bash", "sh", "dash"]
		.map((name) => [name, findExecutable(name)])
		.filter((entry) => typeof entry[1] === "string"),
);

function isPinnedCommand(command, expected, searchPath = INITIAL_PATH) {
	const pinned = PINNED_EXECUTABLES.get(expected);
	return typeof pinned === "string" && findExecutable(command, searchPath) === pinned;
}

function hasOnlyEnvironmentKeys(environment, allowlist) {
	return environment && typeof environment === "object" && Object.keys(environment).every((key) => allowlist.has(key));
}

function hasUnsafeArgument(args) {
	return args.some((value) =>
		typeof value !== "string" ||
		value.includes("\0") ||
		REMOTE_ARGUMENT.test(value) ||
		UNSAFE_PROCESS_ARGUMENT.test(value),
	);
}

function allowNodeGuardProbe(command, args, options) {
	if (resolve(String(command)) !== resolve(process.execPath)) return false;
	const environment = options && Object.hasOwn(options, "env") ? options.env : process.env;
	if (!hasOnlyEnvironmentKeys(environment, SAFE_NODE_ENVIRONMENT)) return false;
	if (args[0] !== "--import" || args[1] !== OFFLINE_GUARD_URL) return false;
	if (args.length === 4) return args[2] === "--eval" && typeof args[3] === "string";
	return args.length === 5 &&
		args[2] === "--input-type=module" &&
		args[3] === "--eval" &&
		typeof args[4] === "string";
}

function localGitArguments(args) {
	if (args.length === 1 && args[0] === "--version") return args;
	if (
		args.length < 15 ||
		args[0] !== "-c" ||
		typeof args[1] !== "string" ||
		!args[1].startsWith("core.hooksPath=") ||
		!isInsideSandbox(args[1].slice("core.hooksPath=".length)) ||
		args[2] !== "-c" ||
		args[3] !== "core.fsmonitor=false" ||
		args[4] !== "-c" ||
		args[5] !== "core.autocrlf=false" ||
		args[6] !== "-c" ||
		args[7] !== "commit.gpgsign=false" ||
		args[8] !== "-c" ||
		args[9] !== "tag.gpgsign=false" ||
		args[10] !== "-c" ||
		args[11] !== "protocol.file.allow=never" ||
		args[12] !== "-c" ||
		args[13] !== "submodule.recurse=false"
	) return undefined;
	return args.slice(14);
}

function productionGitArguments(args) {
	if (
		args.length <= 2 + PRODUCTION_GIT_PREFIX_TAIL.length ||
		args[0] !== "-c" ||
		typeof args[1] !== "string" ||
		!args[1].startsWith("core.hooksPath=") ||
		!PRODUCTION_GIT_PREFIX_TAIL.every((value, index) => args[index + 2] === value)
	) return undefined;
	return args.slice(2 + PRODUCTION_GIT_PREFIX_TAIL.length);
}

function exactArguments(args, expected) {
	return expected.length === args.length && expected.every((value, index) => value === args[index]);
}

function gitFixtureLayout(cwd) {
	try {
		const canonicalCwd = realpathSync(cwd);
		if (basename(canonicalCwd) === "repository") {
			return { root: dirname(canonicalCwd), repository: canonicalCwd, cwd: canonicalCwd, workspace: undefined };
		}
		const workspaceMatch = /^(fixture|unowned)-([a-z][a-z0-9-]{0,31})$/u.exec(basename(canonicalCwd));
		if (!workspaceMatch || basename(dirname(canonicalCwd)) !== "worktrees") return undefined;
		const root = dirname(dirname(canonicalCwd));
		return {
			root,
			repository: join(root, "repository"),
			cwd: canonicalCwd,
			workspace: { kind: workspaceMatch[1], id: workspaceMatch[2] },
		};
	} catch {
		return undefined;
	}
}

function fixtureWorktreePath(path, layout, kind, workspaceId, requireMissingLeaf = false) {
	if (!GIT_WORKSPACE_ID.test(workspaceId)) return false;
	const expected = join(layout.root, "worktrees", `${kind}-${workspaceId}`);
	if (resolve(String(path)) !== resolve(expected)) return false;
	if (!requireMissingLeaf) return isInsideSandbox(path);
	try {
		lstatSync(path);
		return false;
	} catch (error) {
		return error?.code === "ENOENT" && isInsideSandboxAllowMissingLeaf(path);
	}
}

function safeHooksDirectory(path, layout) {
	try {
		const originalMetadata = lstatSync(path);
		if (!originalMetadata.isDirectory() || originalMetadata.isSymbolicLink()) return false;
		const expected = realpathSync(join(layout.root, "empty-hooks"));
		const canonical = realpathSync(path);
		return canonical === expected && readdirSync(canonical).length === 0;
	} catch {
		return false;
	}
}

function pathContainedBy(root, target) {
	const targetRelative = relative(root, target);
	return target === root || (targetRelative !== "" && !targetRelative.startsWith("..") && !isAbsolute(targetRelative));
}

function safeFixtureGitMetadata(layout, args) {
	const mainGitDirectory = join(layout.repository, ".git");
	if (exactArguments(args, ["init", "--quiet"])) {
		try {
			lstatSync(mainGitDirectory);
			return false;
		} catch (error) {
			return error?.code === "ENOENT";
		}
	}
	try {
		const mainMetadata = lstatSync(mainGitDirectory);
		if (!mainMetadata.isDirectory() || mainMetadata.isSymbolicLink()) return false;
		const canonicalMainGit = realpathSync(mainGitDirectory);
		if (canonicalMainGit !== resolve(mainGitDirectory)) return false;
		if (!layout.workspace) return true;
		const pointerPath = join(layout.cwd, ".git");
		const pointerMetadata = lstatSync(pointerPath);
		if (!pointerMetadata.isFile() || pointerMetadata.isSymbolicLink() || pointerMetadata.size > 4_096) return false;
		const pointer = readFileSync(pointerPath, "utf8").trim();
		if (!pointer.startsWith("gitdir: ")) return false;
		const pointerValue = pointer.slice("gitdir: ".length);
		const adminDirectory = realpathSync(isAbsolute(pointerValue) ? pointerValue : resolve(layout.cwd, pointerValue));
		const worktreeAdminRoot = realpathSync(join(canonicalMainGit, "worktrees"));
		if (!pathContainedBy(worktreeAdminRoot, adminDirectory) || adminDirectory === worktreeAdminRoot) return false;
		const adminMetadata = lstatSync(adminDirectory);
		if (!adminMetadata.isDirectory() || adminMetadata.isSymbolicLink()) return false;
		for (const name of ["commondir", "gitdir"]) {
			const metadata = lstatSync(join(adminDirectory, name));
			if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 4_096) return false;
		}
		const commonValue = readFileSync(join(adminDirectory, "commondir"), "utf8").trim();
		const commonDirectory = realpathSync(isAbsolute(commonValue) ? commonValue : resolve(adminDirectory, commonValue));
		if (commonDirectory !== canonicalMainGit) return false;
		const gitdirValue = readFileSync(join(adminDirectory, "gitdir"), "utf8").trim();
		const gitdirPath = realpathSync(isAbsolute(gitdirValue) ? gitdirValue : resolve(adminDirectory, gitdirValue));
		return gitdirPath === realpathSync(pointerPath);
	} catch {
		return false;
	}
}

function safeFixtureRepositoryConfiguration(layout, args) {
	const configPath = join(layout.repository, ".git", "config");
	if (exactArguments(args, ["init", "--quiet"])) {
		try {
			lstatSync(configPath);
			return false;
		} catch (error) {
			return error?.code === "ENOENT";
		}
	}
	try {
		const metadata = lstatSync(configPath);
		if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 64 * 1024) return false;
		const config = readFileSync(configPath, "utf8");
		if (/\0/u.test(config)) return false;
		if (/^\s*\[(?:alias|credential|filter|diff|merge|include|includeif|remote|submodule)(?:\s|"|\])/imu.test(config)) return false;
		if (/^\s*(?:hooksPath|fsmonitor|sparseCheckout|sparseCheckoutCone|sshCommand|attributesFile|excludesFile|worktreeConfig|partialClone|promisor|external|textconv|clean|smudge|process|required)\s*=/imu.test(config)) return false;
		return true;
	} catch {
		return false;
	}
}

function safeProductionRepositoryConfiguration(layout) {
	const validate = (path, allowWorktreeConfig, optional) => {
		try {
			const metadata = lstatSync(path);
			if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 64 * 1024) return false;
			const config = readFileSync(path, "utf8");
			if (/\0/u.test(config)) return false;
			// Alias definitions are inert because the production argv grammar contains
			// only exact built-in command names; retaining them lets the backend read
			// and reject unsafe configuration without ever dispatching an alias.
			if (/^\s*\[(?:credential|filter|diff|merge|include|includeif|remote|submodule)(?:\s|"|\])/imu.test(config)) return false;
			const unsafeKey = allowWorktreeConfig
				? /^\s*(?:hooksPath|fsmonitor|sparseCheckout|sparseCheckoutCone|sshCommand|attributesFile|excludesFile|partialClone|promisor|external|textconv|clean|smudge|process|required)\s*=/imu
				: /^\s*(?:hooksPath|fsmonitor|sparseCheckout|sparseCheckoutCone|sshCommand|attributesFile|excludesFile|worktreeConfig|partialClone|promisor|external|textconv|clean|smudge|process|required)\s*=/imu;
			return !unsafeKey.test(config);
		} catch (error) {
			return optional && error?.code === "ENOENT";
		}
	};
	return validate(join(layout.repository, ".git", "config"), true, false) &&
		validate(join(layout.repository, ".git", "config.worktree"), false, true);
}

function repositoryContainsAttributes(layout) {
	try {
		try {
			lstatSync(join(layout.repository, ".git", "info", "attributes"));
			return true;
		} catch (error) {
			if (error?.code !== "ENOENT") return true;
		}
		const stack = [layout.repository];
		let visited = 0;
		while (stack.length > 0) {
			const directory = stack.pop();
			for (const entry of readdirSync(directory, { withFileTypes: true })) {
				visited += 1;
				if (visited > 2_000) return true;
				if (entry.name === ".git" && directory === layout.repository) continue;
				if (entry.name === ".gitattributes") return true;
				const path = join(directory, entry.name);
				const metadata = lstatSync(path);
				if (metadata.isSymbolicLink()) continue;
				if (metadata.isDirectory()) stack.push(path);
			}
		}
		return false;
	} catch {
		return true;
	}
}

function safeGitArgumentGrammar(args, layout) {
	const inRepository = layout.cwd === layout.repository;
	const inOwnedFixtureWorktree = layout.workspace?.kind === "fixture";
	if (SAFE_FIXED_GIT_ARGUMENTS.some((expected) => exactArguments(args, expected))) {
		if (new Set(["init", "add", "commit", "remote", "worktree"]).has(args[0])) return inRepository;
		if (args[0] === "rev-parse" && new Set(["--abbrev-ref", "--show-toplevel", "--git-common-dir", "--show-object-format"]).has(args[1])) return inRepository;
		if (args[0] === "symbolic-ref") return inRepository;
		if (args[0] === "cat-file" || args[0] === "ls-files" || args[0] === "update-index") return inOwnedFixtureWorktree;
		return inRepository || inOwnedFixtureWorktree;
	}
	if (args.length === 3 && args[0] === "check-ref-format" && args[1] === "--branch") {
		return inRepository && GIT_SHORT_FIXTURE_BRANCH.test(args[2]);
	}
	if (args.length === 10 && exactArguments(args.slice(0, 7), [
		"worktree", "add", "--no-checkout", "--lock", "--reason", FIXTURE_LOCK_REASON, "-b",
	])) {
		const branchMatch = GIT_SHORT_FIXTURE_BRANCH.exec(args[7]);
		return inRepository && Boolean(branchMatch) && fixtureWorktreePath(args[8], layout, branchMatch[1], branchMatch[2], true) && GIT_OBJECT_ID.test(args[9]);
	}
	if (args.length === 5 && exactArguments(args.slice(0, 4), ["worktree", "lock", "--reason", FIXTURE_LOCK_REASON])) {
		const match = /^fixture-([a-z][a-z0-9-]{0,31})$/u.exec(basename(String(args[4])));
		return inRepository && Boolean(match) && fixtureWorktreePath(args[4], layout, "fixture", match[1]);
	}
	if (args.length === 3 && args[0] === "worktree" && (args[1] === "unlock" || args[1] === "remove")) {
		const match = /^fixture-([a-z][a-z0-9-]{0,31})$/u.exec(basename(String(args[2])));
		return inRepository && Boolean(match) && fixtureWorktreePath(args[2], layout, "fixture", match[1]);
	}
	if (args.length === 3 && args[0] === "read-tree" && args[1] === "--reset") return inOwnedFixtureWorktree && GIT_OBJECT_ID.test(args[2]);
	if (args.length === 4 && exactArguments(args.slice(0, 3), ["ls-tree", "-rz", "--full-tree"])) return inOwnedFixtureWorktree && GIT_OBJECT_ID.test(args[3]);
	if (args.length === 7 && exactArguments(args.slice(0, 5), ["diff", "--no-ext-diff", "--no-textconv", "--numstat", "-z"])) {
		return inOwnedFixtureWorktree && GIT_OBJECT_ID.test(args[5]) && args[6] === "--";
	}
	if (args.length === 8 && exactArguments(args.slice(0, 6), ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--patch", "--unified=3"])) {
		return inOwnedFixtureWorktree && GIT_OBJECT_ID.test(args[6]) && args[7] === "--";
	}
	if (args.length === 3 && args[0] === "rev-parse" && args[1] === "--verify" && args[2].endsWith("^{commit}")) {
		return inRepository && GIT_FULL_FIXTURE_BRANCH.test(args[2].slice(0, -"^{commit}".length));
	}
	return false;
}

function safeLocalGitEnvironment(environment, layout) {
	if (!hasOnlyEnvironmentKeys(environment, SAFE_GIT_ENVIRONMENT)) return false;
	const nullFile = process.platform === "win32" ? "NUL" : "/dev/null";
	const baseSafe = environment.PATH === INITIAL_PATH &&
		environment.PI_SUB_AGENTS_LOCAL_GIT_FIXTURE === "1" &&
		environment.GIT_CONFIG_NOSYSTEM === "1" &&
		environment.GIT_CONFIG_GLOBAL === nullFile &&
		environment.GIT_TERMINAL_PROMPT === "0" &&
		environment.GIT_NO_LAZY_FETCH === "1" &&
		environment.GIT_NO_REPLACE_OBJECTS === "1" &&
		environment.GIT_AUTHOR_NAME === "Pi Offline Fixture" &&
		environment.GIT_AUTHOR_EMAIL === "pi-offline@example.invalid" &&
		environment.GIT_COMMITTER_NAME === "Pi Offline Fixture" &&
		environment.GIT_COMMITTER_EMAIL === "pi-offline@example.invalid" &&
		isInsideSandbox(environment.HOME) &&
		isInsideSandbox(environment.USERPROFILE) &&
		isInsideSandboxAllowMissingLeaf(environment.XDG_CONFIG_HOME) &&
		isInsideSandbox(environment.TMPDIR) &&
		isInsideSandbox(environment.TMP) &&
		isInsideSandbox(environment.TEMP);
	if (!baseSafe || !layout) return baseSafe;
	return resolve(environment.HOME) === resolve(layout.root, "home") &&
		resolve(environment.USERPROFILE) === resolve(layout.root, "home") &&
		resolve(environment.XDG_CONFIG_HOME) === resolve(layout.root, "home", ".config") &&
		resolve(environment.TMPDIR) === resolve(layout.root, "tmp") &&
		resolve(environment.TMP) === resolve(layout.root, "tmp") &&
		resolve(environment.TEMP) === resolve(layout.root, "tmp");
}

function productionGitLayout(cwd) {
	try {
		const canonicalCwd = realpathSync(cwd);
		let current = canonicalCwd;
		while (true) {
			if (basename(current) === "repository") {
				const root = dirname(current);
				if (!isInsideSandbox(root)) return undefined;
				return { root, repository: current, cwd: canonicalCwd, workspace: undefined };
			}
			const parent = dirname(current);
			if (parent === current) break;
			current = parent;
		}

		const workspaceId = basename(canonicalCwd);
		const trees = dirname(canonicalCwd);
		const repositoryKeyDirectory = dirname(trees);
		const repositories = dirname(repositoryKeyDirectory);
		const state = dirname(repositories);
		const root = dirname(state);
		const repositoryKey = basename(repositoryKeyDirectory);
		if (
			!PRODUCTION_WORKSPACE_ID.test(workspaceId) ||
			basename(trees) !== "trees" ||
			!PRODUCTION_REPOSITORY_KEY.test(repositoryKey) ||
			basename(repositories) !== "repositories" ||
			basename(state) !== "worktree-state" ||
			!isInsideSandbox(root)
		) return undefined;
		return {
			root,
			repository: join(root, "repository"),
			cwd: canonicalCwd,
			workspace: { id: workspaceId, repositoryKey },
		};
	} catch {
		return undefined;
	}
}

function productionWorktreePath(path, layout, repositoryKey, workspaceId, requireMissingLeaf = false) {
	if (!PRODUCTION_REPOSITORY_KEY.test(repositoryKey) || !PRODUCTION_WORKSPACE_ID.test(workspaceId)) return false;
	const expected = join(layout.root, "worktree-state", "repositories", repositoryKey, "trees", workspaceId);
	if (resolve(String(path)) !== resolve(expected)) return false;
	if (!requireMissingLeaf) return isInsideSandbox(path);
	try {
		lstatSync(path);
		return false;
	} catch (error) {
		return error?.code === "ENOENT" && isInsideSandboxAllowMissingLeaf(path);
	}
}

function safePrivateProductionDirectory(path, expected, empty = false) {
	try {
		const metadata = lstatSync(path);
		const canonical = realpathSync(path);
		if (!metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== resolve(expected)) return false;
		if (typeof process.geteuid === "function" && (metadata.uid !== process.geteuid() || (metadata.mode & 0o077) !== 0)) return false;
		return !empty || readdirSync(canonical).length === 0;
	} catch {
		return false;
	}
}

function safeProductionGitEnvironment(environment, layout, hooksPath) {
	if (!hasOnlyEnvironmentKeys(environment, SAFE_PRODUCTION_GIT_ENVIRONMENT)) return false;
	const nullFile = process.platform === "win32" ? "NUL" : "/dev/null";
	const home = join(layout.root, "home");
	const temporary = join(layout.root, "tmp");
	const hooks = join(layout.root, "empty-hooks");
	return environment.PATH === INITIAL_PATH &&
		environment.GIT_CONFIG_NOSYSTEM === "1" &&
		environment.GIT_CONFIG_GLOBAL === nullFile &&
		environment.GIT_TERMINAL_PROMPT === "0" &&
		environment.GIT_NO_LAZY_FETCH === "1" &&
		environment.GIT_NO_REPLACE_OBJECTS === "1" &&
		resolve(String(environment.HOME)) === resolve(home) &&
		resolve(String(environment.USERPROFILE)) === resolve(home) &&
		resolve(String(environment.XDG_CONFIG_HOME)) === resolve(home, ".config") &&
		resolve(String(environment.TMPDIR)) === resolve(temporary) &&
		resolve(String(environment.TMP)) === resolve(temporary) &&
		resolve(String(environment.TEMP)) === resolve(temporary) &&
		resolve(hooksPath) === resolve(hooks) &&
		safePrivateProductionDirectory(home, home) &&
		safePrivateProductionDirectory(temporary, temporary) &&
		safePrivateProductionDirectory(hooks, hooks, true);
}

function safeProductionObjectMetadata(layout) {
	try {
		const objects = join(layout.repository, ".git", "objects");
		const metadata = lstatSync(objects);
		if (!metadata.isDirectory() || metadata.isSymbolicLink() || realpathSync(objects) !== resolve(objects)) return false;
		for (const name of ["alternates", "http-alternates"]) {
			try {
				lstatSync(join(objects, "info", name));
				return false;
			} catch (error) {
				if (error?.code !== "ENOENT") return false;
			}
		}
		const pack = join(objects, "pack");
		try {
			const packMetadata = lstatSync(pack);
			if (!packMetadata.isDirectory() || packMetadata.isSymbolicLink()) return false;
			if (readdirSync(pack).some((name) => name.endsWith(".promisor"))) return false;
		} catch (error) {
			if (error?.code !== "ENOENT") return false;
		}
		return true;
	} catch {
		return false;
	}
}

function productionBranchForLayout(branch, layout, full) {
	const match = (full ? PRODUCTION_FULL_BRANCH : PRODUCTION_SHORT_BRANCH).exec(branch);
	if (!match) return undefined;
	let repositoryKey;
	if (layout.workspace) {
		if (match[1] !== layout.workspace.repositoryKey.slice(0, 16) || match[2] !== layout.workspace.id) return undefined;
		repositoryKey = layout.workspace.repositoryKey;
	} else {
		try {
			const repositories = join(layout.root, "worktree-state", "repositories");
			const matching = readdirSync(repositories).filter((name) => PRODUCTION_REPOSITORY_KEY.test(name) && name.slice(0, 16) === match[1]);
			if (matching.length !== 1) return undefined;
			repositoryKey = matching[0];
			for (const path of [join(repositories, repositoryKey), join(repositories, repositoryKey, "trees")]) {
				const metadata = lstatSync(path);
				if (!metadata.isDirectory() || metadata.isSymbolicLink() || realpathSync(path) !== resolve(path)) return undefined;
			}
		} catch {
			return undefined;
		}
	}
	return { repositoryPrefix: match[1], repositoryKey, workspaceId: match[2] };
}

function safeProductionGitArgumentGrammar(args, layout) {
	const inRepository = !layout.workspace;
	const inWorktree = Boolean(layout.workspace);
	const fixedRepository = [
		["rev-parse", "--is-inside-work-tree"],
		["rev-parse", "--is-bare-repository"],
		["rev-parse", "--show-toplevel"],
		["rev-parse", "--git-common-dir"],
		["rev-parse", "--show-object-format"],
		["status", "--porcelain=v1", "-z", "--untracked-files=all"],
		["status", "--ignored", "--porcelain=v1", "-z", "--untracked-files=all"],
		["config", "--local", "--null", "--list", "--no-includes"],
		["config", "--worktree", "--null", "--list", "--no-includes"],
		["worktree", "list", "--porcelain", "-z"],
	];
	if (fixedRepository.some((expected) => exactArguments(args, expected))) {
		if (args[0] === "config") return inRepository || inWorktree;
		if (args[0] === "worktree" || args[1] === "--is-inside-work-tree" || args[1] === "--is-bare-repository" || args[1] === "--show-object-format") return inRepository;
		return inRepository || inWorktree;
	}
	if (exactArguments(args, ["rev-parse", "--verify", "HEAD^{commit}"])) return inRepository || inWorktree;
	if (args.length === 4 && exactArguments(args.slice(0, 3), ["show-ref", "--verify", "--quiet"])) {
		return inRepository && Boolean(productionBranchForLayout(args[3], layout, true));
	}
	if (exactArguments(args, ["symbolic-ref", "--quiet", "HEAD"])) return inWorktree;
	if (exactArguments(args, ["ls-files", "-v", "-z"])) return inRepository || inWorktree;
	if (exactArguments(args, ["cat-file", "--batch"]) || exactArguments(args, ["ls-files", "--stage", "-z"])) return inWorktree;
	if (args.length === 3 && args[0] === "check-ref-format" && args[1] === "--branch") return inRepository && Boolean(productionBranchForLayout(args[2], layout, false));
	if (args.length === 10 && exactArguments(args.slice(0, 5), ["worktree", "add", "--no-checkout", "--lock", "--reason"]) && args[6] === "-b") {
		const branch = productionBranchForLayout(args[7], layout, false);
		if (!inRepository || !branch || args[5] !== `pi sub-agent ${branch.workspaceId}` || !GIT_OBJECT_ID.test(args[9])) return false;
		const pathParts = relative(join(layout.root, "worktree-state", "repositories"), resolve(String(args[8]))).split(sep);
		const actualRepositoryKey = pathParts[0];
		return pathParts.length === 3 && pathParts[1] === "trees" && actualRepositoryKey === branch.repositoryKey &&
			productionWorktreePath(args[8], layout, actualRepositoryKey, branch.workspaceId, true);
	}
	if (args.length === 3 && args[0] === "read-tree" && args[1] === "--reset") return inWorktree && GIT_OBJECT_ID.test(args[2]);
	if (args.length === 4 && exactArguments(args.slice(0, 3), ["ls-tree", "-rz", "--full-tree"])) return inWorktree && GIT_OBJECT_ID.test(args[3]);
	if (args.length === 7 && exactArguments(args.slice(0, 5), ["diff", "--no-ext-diff", "--no-textconv", "--numstat", "-z"])) {
		return inWorktree && GIT_OBJECT_ID.test(args[5]) && args[6] === "--";
	}
	if (args.length === 8 && exactArguments(args.slice(0, 6), ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--patch", "--unified=3"])) {
		return inWorktree && GIT_OBJECT_ID.test(args[6]) && args[7] === "--";
	}
	if (args.length === 3 && args[0] === "rev-list" && args[1] === "--count") {
		const range = String(args[2]).split("..");
		return inWorktree && range.length === 2 && GIT_OBJECT_ID.test(range[0]) && range[1] === "HEAD";
	}
	if (args.length === 3 && args[0] === "rev-parse" && args[1] === "--verify" && args[2].endsWith("^{commit}")) {
		return Boolean(productionBranchForLayout(args[2].slice(0, -"^{commit}".length), layout, true));
	}
	return false;
}

function allowProductionGit(command, args, options) {
	if (!isPinnedCommand(command, "git") || !isInsideSandbox(options?.cwd ?? process.cwd())) return false;
	const publicArgs = productionGitArguments(args);
	if (!publicArgs || publicArgs.length === 0 || publicArgs.some((value) => typeof value !== "string" || value.includes("\0") || REMOTE_ARGUMENT.test(value))) return false;
	const layout = productionGitLayout(options?.cwd ?? process.cwd());
	if (!layout) return false;
	const hooksPath = args[1].slice("core.hooksPath=".length);
	if (
		!safeProductionGitEnvironment(options?.env, layout, hooksPath) ||
		!safeHooksDirectory(hooksPath, layout) ||
		!safeFixtureGitMetadata(layout, publicArgs) ||
		!safeProductionRepositoryConfiguration(layout) ||
		!safeProductionObjectMetadata(layout) ||
		repositoryContainsAttributes(layout)
	) return false;
	return safeProductionGitArgumentGrammar(publicArgs, layout);
}

function allowLocalGit(command, args, options) {
	if (!isPinnedCommand(command, "git") || !isInsideSandbox(options?.cwd ?? process.cwd())) return false;
	const publicArgs = localGitArguments(args);
	if (!publicArgs || hasUnsafeArgument(publicArgs) || publicArgs.some((value) => value !== "--no-textconv" && UNSAFE_GIT_TEXT.test(value))) return false;
	if (exactArguments(publicArgs, ["--version"])) return safeLocalGitEnvironment(options?.env, undefined);
	const layout = gitFixtureLayout(options.cwd ?? process.cwd());
	if (!layout || !safeLocalGitEnvironment(options?.env, layout)) return false;
	const hooksPath = args[1].slice("core.hooksPath=".length);
	if (
		!safeHooksDirectory(hooksPath, layout) ||
		!safeFixtureGitMetadata(layout, publicArgs) ||
		!safeFixtureRepositoryConfiguration(layout, publicArgs)
	) return false;
	if ((publicArgs[0] === "add" || publicArgs[0] === "diff") && repositoryContainsAttributes(layout)) return false;
	return safeGitArgumentGrammar(publicArgs, layout);
}

function allowGuardedRipgrep(command, args, options) {
	if (!isPinnedCommand(command, "rg") || options?.env?.PATH !== INITIAL_PATH) return false;
	if (!hasOnlyEnvironmentKeys(options.env, SAFE_RG_ENVIRONMENT)) return false;
	const separator = args.length - 3;
	if (separator < 1 || args[separator] !== "--") return false;
	for (let index = 0; index < separator; index += 1) {
		const value = args[index];
		if (SAFE_RG_FLAGS.has(value)) continue;
		if (!SAFE_RG_VALUE_FLAGS.has(value) || index + 1 >= separator || typeof args[index + 1] !== "string") return false;
		index += 1;
	}
	const pattern = args[separator + 1];
	const root = args[separator + 2];
	return typeof pattern === "string" && !pattern.includes("\0") && typeof root === "string" && isInsideSandbox(root);
}

function allowFocusedShell(command, args, options) {
	const name = commandName(command);
	if (!new Set(["bash", "sh", "dash"]).has(name)) return false;
	if (!hasOnlyEnvironmentKeys(options?.env, SAFE_FOCUSED_SHELL_ENVIRONMENT)) return false;
	if (!isPinnedCommand(command, name, options.env.PATH)) return false;
	if (!isInsideSandbox(options.cwd ?? process.cwd())) return false;
	return args.length === 2 && args[0] === "-c" && args[1] === "printf shell > shell.txt";
}

function assertAllowedChildProcess(command, args, options) {
	if (options?.shell) throw new OfflineNetworkAccessError(`child_process:${commandName(command) || "unknown"}`);
	if (
		allowNodeGuardProbe(command, args, options) ||
		allowProductionGit(command, args, options) ||
		allowLocalGit(command, args, options) ||
		allowGuardedRipgrep(command, args, options) ||
		allowFocusedShell(command, args, options)
	) return;
	throw new OfflineNetworkAccessError(`child_process:${commandName(command) || "unknown"}`);
}

function normalizeProcessArguments(args, options) {
	if (Array.isArray(args)) return { args, options };
	return { args: [], options: args };
}

childProcess.spawn = function offlineSpawn(command, args, options) {
	const normalized = normalizeProcessArguments(args, options);
	assertAllowedChildProcess(command, normalized.args, normalized.options);
	return originalChildProcess.spawn.call(this, command, normalized.args, normalized.options);
};
childProcess.spawnSync = function offlineSpawnSync(command, args, options) {
	const normalized = normalizeProcessArguments(args, options);
	assertAllowedChildProcess(command, normalized.args, normalized.options);
	return originalChildProcess.spawnSync.call(this, command, normalized.args, normalized.options);
};
function offlineExecFile(command, args, options, callback) {
	let normalizedArgs = args;
	let normalizedOptions = options;
	let normalizedCallback = callback;
	if (!Array.isArray(normalizedArgs)) {
		if (typeof normalizedArgs === "function") normalizedCallback = normalizedArgs;
		else if (typeof normalizedOptions === "function") normalizedCallback = normalizedOptions;
		normalizedOptions = normalizedArgs && typeof normalizedArgs === "object" ? normalizedArgs : undefined;
		normalizedArgs = [];
	} else if (typeof normalizedOptions === "function") {
		normalizedCallback = normalizedOptions;
		normalizedOptions = undefined;
	}
	assertAllowedChildProcess(command, normalizedArgs, normalizedOptions);
	return originalChildProcess.execFile.call(this, command, normalizedArgs, normalizedOptions, normalizedCallback);
}
Object.defineProperty(offlineExecFile, promisify.custom, {
	value(command, args, options) {
		return new Promise((resolvePromise, rejectPromise) => {
			offlineExecFile(command, args, options, (error, stdout, stderr) => {
				if (error) rejectPromise(error);
				else resolvePromise({ stdout, stderr });
			});
		});
	},
});
childProcess.execFile = offlineExecFile;
childProcess.execFileSync = function offlineExecFileSync(command, args, options) {
	const normalized = normalizeProcessArguments(args, options);
	assertAllowedChildProcess(command, normalized.args, normalized.options);
	return originalChildProcess.execFileSync.call(this, command, normalized.args, normalized.options);
};
childProcess.exec = blocked("child_process.exec");
childProcess.execSync = blocked("child_process.execSync");
childProcess.fork = blocked("child_process.fork");

syncBuiltinESMExports();
