import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const extensionDir = resolve(testDir, "..");
const piBin = process.env.PI_TEST_BIN || execFileSync("sh", ["-lc", "command -v pi"], { encoding: "utf8" }).trim();
if (!piBin) throw new Error("Could not find the pi executable. Set PI_TEST_BIN to run the tests.");

let packageRoot = dirname(realpathSync(piBin));
while (packageRoot !== dirname(packageRoot)) {
	const packagePath = join(packageRoot, "package.json");
	if (existsSync(packagePath)) {
		const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
		if (manifest.name === "@earendil-works/pi-coding-agent") break;
	}
	packageRoot = dirname(packageRoot);
}
if (!existsSync(join(packageRoot, "package.json"))) {
	throw new Error(`Could not locate @earendil-works/pi-coding-agent from ${piBin}`);
}

const workspace = mkdtempSync(join(tmpdir(), "pi-subagents-test-"));
const sourceDir = join(workspace, "source");
const modulesDir = join(workspace, "node_modules");
const agentDir = join(workspace, "agent");
mkdirSync(sourceDir, { recursive: true });
mkdirSync(join(modulesDir, "@earendil-works"), { recursive: true });
mkdirSync(agentDir, { recursive: true });
cpSync(join(extensionDir, "package.json"), join(workspace, "package.json"));
cpSync(join(extensionDir, "index.ts"), join(sourceDir, "index.ts"));
cpSync(join(extensionDir, "config.ts"), join(sourceDir, "config.ts"));

const links = new Map([
	[join(modulesDir, "@earendil-works", "pi-coding-agent"), packageRoot],
	[join(modulesDir, "@earendil-works", "pi-agent-core"), join(packageRoot, "node_modules", "@earendil-works", "pi-agent-core")],
	[join(modulesDir, "@earendil-works", "pi-ai"), join(packageRoot, "node_modules", "@earendil-works", "pi-ai")],
	[join(modulesDir, "@earendil-works", "pi-tui"), join(packageRoot, "node_modules", "@earendil-works", "pi-tui")],
	[join(modulesDir, "typebox"), join(packageRoot, "node_modules", "typebox")],
]);
for (const [target, source] of links) {
	if (!existsSync(source)) throw new Error(`Missing Pi runtime dependency: ${source}`);
	symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
}

const env = {
	...process.env,
	PI_TEST_BIN: piBin,
	PI_CODING_AGENT_DIR: agentDir,
	SUBAGENT_EXTENSION_DIR: extensionDir,
	SUBAGENT_TEST_SOURCE: sourceDir,
	SUBAGENT_TEST_WORKSPACE: workspace,
};
delete env.PI_DYNAMIC_SUBAGENT_CHILD;
delete env.PI_DYNAMIC_SUBAGENT_SERVICE_TIER;

const tests = readdirSync(testDir)
	.filter((name) => name.endsWith(".test.mjs"))
	.sort()
	.map((name) => join(testDir, name));

try {
	const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...tests], {
		env,
		stdio: "inherit",
		timeout: 120_000,
	});
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
} finally {
	rmSync(workspace, { recursive: true, force: true });
}
