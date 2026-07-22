import assert from "node:assert/strict";
import { constants, accessSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PI_PACKAGE_NAME = "@earendil-works/pi-coding-agent";
const PI_AI_PACKAGE_NAME = "@earendil-works/pi-ai";

function readPackageName(directory) {
	try {
		return JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).name;
	} catch {
		return undefined;
	}
}

function findPackageAncestor(startPath, expectedName) {
	let current = startPath;
	while (true) {
		if (readPackageName(current) === expectedName) return current;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function findExecutable(name) {
	const names = process.platform === "win32" ? [`${name}.cmd`, `${name}.exe`, name] : [name];
	for (const directory of (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":")) {
		if (!directory) continue;
		for (const candidateName of names) {
			const candidate = join(directory, candidateName);
			try {
				accessSync(candidate, constants.X_OK);
				return realpathSync(candidate);
			} catch {
				// Try the next PATH candidate.
			}
		}
	}
	return undefined;
}

function resolvePiPackageDirectory() {
	const configured = process.env.PI_CODING_AGENT_PACKAGE_DIR;
	if (configured) {
		const resolved = realpathSync(configured);
		assert.equal(readPackageName(resolved), PI_PACKAGE_NAME, "PI_CODING_AGENT_PACKAGE_DIR points to the wrong package");
		return resolved;
	}

	const executable = findExecutable("pi");
	assert.ok(
		executable,
		"Could not locate the active pi executable; set PI_CODING_AGENT_PACKAGE_DIR to the installed package directory",
	);
	const packageDirectory = findPackageAncestor(dirname(executable), PI_PACKAGE_NAME);
	assert.ok(packageDirectory, `Could not locate ${PI_PACKAGE_NAME} above ${executable}`);
	return packageDirectory;
}

function resolvePiAiPackageDirectory(piPackageDirectory) {
	const configured = process.env.PI_AI_PACKAGE_DIR;
	if (configured) {
		const resolved = realpathSync(configured);
		assert.equal(readPackageName(resolved), PI_AI_PACKAGE_NAME, "PI_AI_PACKAGE_DIR points to the wrong package");
		return resolved;
	}

	let current = piPackageDirectory;
	while (true) {
		const candidate = join(current, "node_modules", "@earendil-works", "pi-ai");
		if (readPackageName(candidate) === PI_AI_PACKAGE_NAME) return candidate;
		const parent = dirname(current);
		if (parent === current || current === parse(current).root) break;
		current = parent;
	}
	throw new Error(`Could not locate ${PI_AI_PACKAGE_NAME} from ${piPackageDirectory}; set PI_AI_PACKAGE_DIR`);
}

export async function importInstalledPackages() {
	const piPackageDirectory = resolvePiPackageDirectory();
	const piAiPackageDirectory = resolvePiAiPackageDirectory(piPackageDirectory);
	const codingAgent = await import(pathToFileURL(join(piPackageDirectory, "dist", "index.js")).href);
	const piAi = await import(pathToFileURL(join(piAiPackageDirectory, "dist", "index.js")).href);
	return { codingAgent, piAi };
}

export async function importInstalledTypeBoxValue() {
	const piPackageDirectory = resolvePiPackageDirectory();
	const valueModule = join(piPackageDirectory, "node_modules", "typebox", "build", "value", "index.mjs");
	return import(pathToFileURL(valueModule).href);
}

let subAgentsJitiPromise;

async function getSubAgentsJiti() {
	if (subAgentsJitiPromise) return subAgentsJitiPromise;
	subAgentsJitiPromise = (async () => {
		const piPackageDirectory = resolvePiPackageDirectory();
		const piAiPackageDirectory = resolvePiAiPackageDirectory(piPackageDirectory);
		const typeBoxModule = join(piPackageDirectory, "node_modules", "typebox", "build", "index.mjs");
		const jitiModule = await import(
			pathToFileURL(join(piPackageDirectory, "node_modules", "jiti", "lib", "jiti.mjs")).href
		);
		return jitiModule.createJiti(import.meta.url, {
			moduleCache: false,
			alias: {
				"@earendil-works/pi-coding-agent": join(piPackageDirectory, "dist", "index.js"),
				"@earendil-works/pi-ai": join(piAiPackageDirectory, "dist", "compat.js"),
				typebox: typeBoxModule,
			},
		});
	})();
	return subAgentsJitiPromise;
}

export async function importSubAgentsModule(relativePath) {
	const jiti = await getSubAgentsJiti();
	const modulePath = join(dirname(fileURLToPath(import.meta.url)), "..", relativePath);
	return jiti.import(modulePath);
}
