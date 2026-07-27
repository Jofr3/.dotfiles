import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	buildOfflineTestEnvironment,
	discoverOfflineTestFiles,
} from "./run-offline.mjs";

const TEST_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const GUARD_PATH = new URL("./offline-guard.mjs", import.meta.url);

test("offline runner discovers only regular exact test files in deterministic order", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agents-runner-discovery-"));
	try {
		await Promise.all([
			writeFile(join(root, "z.test.mjs"), ""),
			writeFile(join(root, "a_.test.mjs"), ""),
			writeFile(join(root, "a-.test.mjs"), ""),
			writeFile(join(root, "a.test.mjs"), ""),
			writeFile(join(root, "helper.mjs"), ""),
			writeFile(join(root, ".hidden.test.mjs"), ""),
		]);
		assert.deepEqual(
			(await discoverOfflineTestFiles(root)).map((path) => path.split(/[\\/]/u).at(-1)),
			["a-.test.mjs", "a.test.mjs", "a_.test.mjs", "z.test.mjs"],
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("offline runner rejects matching symlinks and non-regular entries instead of silently skipping them", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-sub-agents-runner-reject-"));
	try {
		await mkdir(join(root, "directory.test.mjs"));
		await assert.rejects(discoverOfflineTestFiles(root), /non-regular test file/u);
		await rm(join(root, "directory.test.mjs"), { recursive: true });
		await writeFile(join(root, "target.mjs"), "");
		await symlink(join(root, "target.mjs"), join(root, "linked.test.mjs"));
		await assert.rejects(discoverOfflineTestFiles(root), /non-regular test file/u);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("offline runner environment keeps only operational metadata and uses an isolated home/temp root", async () => {
	const source = {
		PATH: process.env.PATH,
		LANG: "C",
		PI_CODING_AGENT_PACKAGE_DIR: "/safe/pi-package",
		PI_SESSION_FILE: "/private/session.jsonl",
		OPENAI_API_KEY: "fake-secret-value",
		OP_SERVICE_ACCOUNT_TOKEN: "fake-service-token",
		HTTP_PROXY: "http://proxy.invalid",
		NODE_OPTIONS: "--require private-hook.cjs",
	};
	const sandbox = join(tmpdir(), "offline-sandbox");
	const environment = buildOfflineTestEnvironment(source, sandbox);
	assert.equal(environment.PATH, source.PATH);
	assert.equal(environment.PI_CODING_AGENT_PACKAGE_DIR, "/safe/pi-package");
	assert.equal(environment.PI_SUB_AGENTS_OFFLINE_TEST, "1");
	assert.equal(environment.HOME, join(sandbox, "home"));
	assert.equal(environment.TMPDIR, join(sandbox, "tmp"));
	for (const rejected of [
		"PI_SESSION_FILE",
		"OPENAI_API_KEY",
		"OP_SERVICE_ACCOUNT_TOKEN",
		"HTTP_PROXY",
		"NODE_OPTIONS",
	]) {
		assert.equal(rejected in environment, false, `${rejected} must not reach offline tests`);
	}
});

test("offline preload requires the runner marker and blocks network listeners, clients, DNS, datagrams, and external processes", () => {
	const missingMarker = spawnSync(process.execPath, ["--import", GUARD_PATH.href, "--eval", "0"], {
		env: { PATH: process.env.PATH },
		encoding: "utf8",
	});
	assert.notEqual(missingMarker.status, 0);
	assert.match(missingMarker.stderr, /PI_SUB_AGENTS_OFFLINE_TEST=1/u);

	const script = `
		const attempts = [];
		async function capture(name, operation) {
			try { await operation(); attempts.push(name + ":allowed"); }
			catch (error) { attempts.push(name + ":" + error.code); }
		}
		await capture("fetch", () => fetch("https://example.invalid"));
		const net = await import("node:net");
		await capture("net", () => net.connect(443, "example.invalid"));
		const http = await import("node:http");
		await capture("http", () => http.get("http://example.invalid"));
		const dns = await import("node:dns/promises");
		await capture("dns", () => dns.lookup("example.invalid"));
		await capture("lookupService", () => dns.lookupService("127.0.0.1", 80));
		await capture("resolver", () => new dns.Resolver().resolve4("example.invalid"));
		const dgram = await import("node:dgram");
		await capture("dgram", () => dgram.createSocket("udp4"));
		await capture("listener", () => net.createServer().listen(0));
		const workerThreads = await import("node:worker_threads");
		await capture("worker", () => new workerThreads.Worker("fetch('https://example.invalid')", { eval: true, execArgv: [] }));
		const childProcess = await import("node:child_process");
		await capture("process", () => childProcess.spawnSync("curl", ["https://example.invalid"]));
		const shellEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
		await capture("shell-smuggle", () => childProcess.spawnSync("sh", ["-c", "curl https://example.invalid", "printf shell > shell.txt"], { cwd: process.env.TMPDIR, env: shellEnv }));
		await capture("shell-env-smuggle", () => childProcess.spawnSync("sh", ["-c", "printf shell > shell.txt"], { cwd: process.env.TMPDIR, env: { ...shellEnv, BASH_ENV: "/tmp/startup-hook" } }));
		await capture("fake-tool", () => childProcess.spawnSync(process.env.TMPDIR + "/rg", ["--no-config", "--", "x", process.env.TMPDIR], { env: { PATH: process.env.PATH } }));
		const fs = await import("node:fs/promises");
		const escapingRoot = process.env.TMPDIR + "/escaping-rg-root";
		await fs.symlink(process.cwd(), escapingRoot);
		await capture("symlink-root", () => childProcess.spawnSync("rg", ["--no-config", "--", "unlikely-offline-pattern", escapingRoot], { env: { PATH: process.env.PATH } }));
		await fs.rm(escapingRoot, { force: true });
		await capture("fake-guard", () => childProcess.spawnSync(process.execPath, ["--import", "file:///tmp/offline-guard.mjs", "--eval", "0"]));
		await capture("node-env-smuggle", () => childProcess.spawnSync(process.execPath, ["--import", ${JSON.stringify(GUARD_PATH.href)}, "--eval", "0"], { env: { ...process.env, NODE_OPTIONS: "--require=/tmp/startup-hook.cjs" } }));
		const { promisify } = await import("node:util");
		await capture("execFile-promisify", async () => {
			const result = await promisify(childProcess.execFile)(process.execPath, ["--import", ${JSON.stringify(GUARD_PATH.href)}, "--eval", "0"], { encoding: "utf8" });
			if (typeof result.stdout !== "string" || typeof result.stderr !== "string") throw new Error("bad promisify result");
		});
		console.log(attempts.join("\\n"));
	`;
	const guarded = spawnSync(process.execPath, [
		"--import",
		GUARD_PATH.href,
		"--input-type=module",
		"--eval",
		script,
	], {
		env: {
			PATH: process.env.PATH,
			HOME: process.env.HOME,
			USERPROFILE: process.env.USERPROFILE,
			TMPDIR: process.env.TMPDIR,
			TMP: process.env.TMP,
			TEMP: process.env.TEMP,
			PI_SUB_AGENTS_OFFLINE_TEST: "1",
		},
		encoding: "utf8",
	});
	assert.equal(guarded.status, 0, guarded.stderr);
	const lines = guarded.stdout.trim().split(/\r?\n/u);
	assert.deepEqual(lines, [
		...[
			"fetch",
			"net",
			"http",
			"dns",
			"lookupService",
			"resolver",
			"dgram",
			"listener",
			"worker",
			"process",
			"shell-smuggle",
			"shell-env-smuggle",
			"fake-tool",
			"symlink-root",
			"fake-guard",
			"node-env-smuggle",
		].map((name) => `${name}:SUB_AGENTS_OFFLINE_NETWORK_BLOCKED`),
		"execFile-promisify:allowed",
	]);
});

test("the repository test directory contains the canonical runner and guard outside discovery", async () => {
	const files = await discoverOfflineTestFiles(TEST_DIRECTORY);
	assert.ok(files.some((path) => path.endsWith("offline-runner.test.mjs")));
	assert.ok(files.every((path) => !path.endsWith("run-offline.mjs")));
	assert.ok(files.every((path) => !path.endsWith("offline-guard.mjs")));
	assert.equal(pathToFileURL(files[0]).protocol, "file:");
});
