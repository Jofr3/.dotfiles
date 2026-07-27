#!/usr/bin/env node

import { spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIRECTORY = resolve(TEST_DIRECTORY, "..");
const PROJECT_DIRECTORY = resolve(EXTENSION_DIRECTORY, "../../..");
const OFFLINE_GUARD = join(TEST_DIRECTORY, "offline-guard.mjs");
const TEST_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.test\.mjs$/u;

const PASSTHROUGH_ENVIRONMENT = Object.freeze([
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
]);

export async function discoverOfflineTestFiles(testDirectory = TEST_DIRECTORY) {
	const canonicalDirectory = await realpath(testDirectory);
	const entries = await readdir(canonicalDirectory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (!TEST_FILE_PATTERN.test(entry.name)) continue;
		const candidate = join(canonicalDirectory, entry.name);
		const metadata = await lstat(candidate);
		if (!entry.isFile() || !metadata.isFile() || metadata.isSymbolicLink()) {
			throw new Error(`Offline test discovery rejected a non-regular test file: ${entry.name}`);
		}
		const canonicalCandidate = await realpath(candidate);
		const candidateRelative = relative(canonicalDirectory, canonicalCandidate);
		if (!candidateRelative || candidateRelative.startsWith("..") || resolve(canonicalDirectory, candidateRelative) !== canonicalCandidate) {
			throw new Error(`Offline test discovery rejected an escaping test file: ${entry.name}`);
		}
		files.push(canonicalCandidate);
	}
	files.sort();
	if (files.length === 0) throw new Error("No sub-agents offline test files were discovered");
	return files;
}

export function buildOfflineTestEnvironment(source, sandboxRoot) {
	if (!source || typeof source !== "object") throw new Error("A source environment is required");
	if (typeof sandboxRoot !== "string" || !sandboxRoot) throw new Error("An offline sandbox root is required");
	const environment = {};
	for (const name of PASSTHROUGH_ENVIRONMENT) {
		const value = source[name];
		if (typeof value === "string" && !value.includes("\0")) environment[name] = value;
	}
	if (!environment.PATH) throw new Error("PATH is required to locate the installed Pi and local test tools");

	const home = join(sandboxRoot, "home");
	const temporary = join(sandboxRoot, "tmp");
	environment.HOME = home;
	environment.USERPROFILE = home;
	environment.XDG_CONFIG_HOME = join(home, ".config");
	environment.XDG_CACHE_HOME = join(home, ".cache");
	environment.XDG_DATA_HOME = join(home, ".local", "share");
	environment.TMPDIR = temporary;
	environment.TMP = temporary;
	environment.TEMP = temporary;
	environment.PI_SUB_AGENTS_OFFLINE_TEST = "1";
	environment.GIT_CONFIG_NOSYSTEM = "1";
	environment.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
	environment.GIT_TERMINAL_PROMPT = "0";
	return environment;
}

function waitForChild(child) {
	return new Promise((resolvePromise, rejectPromise) => {
		let settled = false;
		const finish = (operation) => {
			if (settled) return;
			settled = true;
			process.removeListener("SIGHUP", onSighup);
			process.removeListener("SIGINT", onSigint);
			process.removeListener("SIGTERM", onSigterm);
			operation();
		};
		const forward = (signal) => {
			if (!child.killed) child.kill(signal);
		};
		const onSighup = () => forward("SIGHUP");
		const onSigint = () => forward("SIGINT");
		const onSigterm = () => forward("SIGTERM");
		process.once("SIGHUP", onSighup);
		process.once("SIGINT", onSigint);
		process.once("SIGTERM", onSigterm);
		child.once("error", (error) => finish(() => rejectPromise(error)));
		child.once("exit", (code, signal) => finish(() => resolvePromise({ code, signal })));
	});
}

export async function runOfflineTests(options = {}) {
	const testDirectory = options.testDirectory ?? TEST_DIRECTORY;
	const projectDirectory = options.projectDirectory ?? PROJECT_DIRECTORY;
	const guardPath = options.guardPath ?? OFFLINE_GUARD;
	const sourceEnvironment = options.environment ?? process.env;
	const sandboxRoot = await mkdtemp(join(tmpdir(), "pi-sub-agents-offline-"));
	try {
		await Promise.all([
			mkdir(join(sandboxRoot, "home"), { recursive: true }),
			mkdir(join(sandboxRoot, "tmp"), { recursive: true }),
		]);
		const files = await discoverOfflineTestFiles(testDirectory);
		const environment = buildOfflineTestEnvironment(sourceEnvironment, sandboxRoot);
		const child = spawn(process.execPath, [
			"--experimental-strip-types",
			"--import",
			pathToFileURL(guardPath).href,
			"--test",
			...files,
		], {
			cwd: projectDirectory,
			env: environment,
			stdio: "inherit",
			shell: false,
			windowsHide: true,
		});
		return await waitForChild(child);
	} finally {
		await rm(sandboxRoot, { recursive: true, force: true });
	}
}

export async function main() {
	if (process.argv.length > 2) {
		throw new Error("The canonical offline test runner accepts no arguments");
	}
	const result = await runOfflineTests();
	if (result.signal) {
		process.kill(process.pid, result.signal);
		return;
	}
	process.exitCode = result.code ?? 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : "Offline sub-agents test runner failed");
		process.exitCode = 1;
	});
}
