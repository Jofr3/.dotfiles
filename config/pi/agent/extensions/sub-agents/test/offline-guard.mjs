import { createRequire, syncBuiltinESMExports } from "node:module";
import { realpathSync, statSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
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
const SAFE_GIT_ARGUMENTS = Object.freeze([
	["--version"],
	["init", "--quiet"],
	["symbolic-ref", "HEAD", "refs/heads/main"],
	["add", "--all"],
	["commit", "--quiet", "--no-gpg-sign", "-m", "offline fixture"],
	["remote"],
	["rev-parse", "--abbrev-ref", "HEAD"],
	["status", "--porcelain"],
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
	"GIT_CONFIG_NOSYSTEM",
	"GIT_CONFIG_GLOBAL",
	"GIT_TERMINAL_PROMPT",
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
const UNSAFE_PROCESS_ARGUMENT = /^(?:--output(?:=|$)|--exec(?:=|$)|--ext-diff$|--textconv$|--upload-pack(?:=|$)|--receive-pack(?:=|$)|--strategy(?:=|$)|--strategy-option(?:=|$)|--gpg-sign(?:=|$)|--show-signature$|--edit-description$|-S$)/u;

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
		args.length < 9 ||
		args[0] !== "-c" ||
		typeof args[1] !== "string" ||
		!args[1].startsWith("core.hooksPath=") ||
		!isInsideSandbox(args[1].slice("core.hooksPath=".length)) ||
		args[2] !== "-c" ||
		args[3] !== "commit.gpgsign=false" ||
		args[4] !== "-c" ||
		args[5] !== "tag.gpgsign=false" ||
		args[6] !== "-c" ||
		args[7] !== "protocol.file.allow=never"
	) return undefined;
	return args.slice(8);
}

function allowLocalGit(command, args, options) {
	if (!isPinnedCommand(command, "git") || options?.env?.PATH !== INITIAL_PATH) return false;
	if (!hasOnlyEnvironmentKeys(options.env, SAFE_GIT_ENVIRONMENT)) return false;
	if (
		options.env.PI_SUB_AGENTS_LOCAL_GIT_FIXTURE !== "1" ||
		options.env.GIT_CONFIG_NOSYSTEM !== "1" ||
		options.env.GIT_TERMINAL_PROMPT !== "0" ||
		!isInsideSandbox(options.cwd ?? process.cwd())
	) return false;
	const publicArgs = localGitArguments(args);
	if (!publicArgs || hasUnsafeArgument(publicArgs)) return false;
	return SAFE_GIT_ARGUMENTS.some((expected) =>
		expected.length === publicArgs.length && expected.every((value, index) => value === publicArgs[index]),
	);
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
