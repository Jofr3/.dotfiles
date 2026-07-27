import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { importInstalledPackages } from "./installed-packages.mjs";

function safePrefix(prefix) {
	if (typeof prefix !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(prefix)) {
		throw new Error("Temporary fixture prefix must contain only bounded filename-safe characters");
	}
	return prefix.endsWith("-") ? prefix : `${prefix}-`;
}

function fixturePath(root, path) {
	if (typeof path !== "string" || !path || path.includes("\0") || isAbsolute(path)) {
		throw new Error("Fixture paths must be nonempty relative paths");
	}
	const target = resolve(root, path);
	const targetRelative = relative(root, target);
	if (!targetRelative || targetRelative.startsWith("..") || isAbsolute(targetRelative)) {
		throw new Error("Fixture path escapes its temporary root");
	}
	return target;
}

export function createDeferred(label = "deferred") {
	let resolvePromise;
	let rejectPromise;
	let settled = false;
	const promise = new Promise((resolveValue, rejectValue) => {
		resolvePromise = resolveValue;
		rejectPromise = rejectValue;
	});
	return Object.freeze({
		label,
		promise,
		get settled() {
			return settled;
		},
		resolve(value) {
			if (settled) return false;
			settled = true;
			resolvePromise(value);
			return true;
		},
		reject(error) {
			if (settled) return false;
			settled = true;
			rejectPromise(error);
			return true;
		},
	});
}

export function createBarrier(parties, options = {}) {
	if (!Number.isSafeInteger(parties) || parties < 1 || parties > 1_000) {
		throw new Error("Barrier parties must be an integer between 1 and 1000");
	}
	const timeoutMs = options.timeoutMs ?? 2_000;
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
		throw new Error("Barrier timeout must be between 1 and 60000 milliseconds");
	}
	const label = options.label ?? "fixture barrier";
	const arrivals = new Set();
	const release = createDeferred(`${label} release`);
	return Object.freeze({
		get size() {
			return arrivals.size;
		},
		async arrive(arrival) {
			const key = String(arrival);
			assert.equal(arrivals.has(key), false, `Duplicate ${label} arrival: ${key}`);
			arrivals.add(key);
			if (arrivals.size === parties) release.resolve();
			let timer;
			try {
				await Promise.race([
					release.promise,
					new Promise((_, rejectPromise) => {
						timer = setTimeout(
							() => rejectPromise(new Error(`${label} timed out after arrivals: ${[...arrivals].join(", ")}`)),
							timeoutMs,
						);
					}),
				]);
			} finally {
				if (timer !== undefined) clearTimeout(timer);
			}
		},
	});
}

export async function createTempDirectoryFixture(prefix) {
	const root = await mkdtemp(join(tmpdir(), safePrefix(prefix)));
	let cleanupPromise;
	return Object.freeze({
		root,
		cleanup() {
			cleanupPromise ??= rm(root, { recursive: true, force: true });
			return cleanupPromise;
		},
	});
}

export async function withTempDirectory(prefix, operation) {
	if (typeof operation !== "function") throw new Error("Temporary fixture operation is required");
	const fixture = await createTempDirectoryFixture(prefix);
	try {
		return await operation(fixture.root);
	} finally {
		await fixture.cleanup();
	}
}

export async function withTempWorkspace(options, operation) {
	if (!options || typeof options !== "object") throw new Error("Workspace fixture options are required");
	const directories = options.directories ?? [];
	const files = options.files ?? {};
	return withTempDirectory(options.prefix ?? "pi-sub-agents-workspace", async (temporary) => {
		const project = join(temporary, "project");
		const outside = join(temporary, "outside");
		await Promise.all([mkdir(project, { recursive: true }), mkdir(outside, { recursive: true })]);
		for (const directory of directories) {
			await mkdir(fixturePath(project, directory), { recursive: true });
		}
		for (const [path, content] of Object.entries(files)) {
			if (typeof content !== "string" && !Buffer.isBuffer(content)) {
				throw new Error(`Fixture file content must be string or Buffer: ${path}`);
			}
			const target = fixturePath(project, path);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, content);
		}
		return operation({ temporary, project, outside });
	});
}

export async function createOfflineModelRuntime(codingAgent, piAi) {
	if (!codingAgent?.ModelRuntime || !piAi?.InMemoryCredentialStore) {
		throw new Error("Installed Pi ModelRuntime and in-memory credential store are required");
	}
	return codingAgent.ModelRuntime.create({
		credentials: new piAi.InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
}

export async function withOfflineFauxProvider(options, operation) {
	if (!options || typeof options !== "object" || typeof operation !== "function") {
		throw new Error("Offline faux-provider options and operation are required");
	}
	const { codingAgent, piAi } = options.packages ?? await importInstalledPackages();
	const providerId = options.providerId ?? "sub-agents-fixture-faux";
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(providerId)) {
		throw new Error("Fixture provider ID is invalid");
	}
	const runtime = await createOfflineModelRuntime(codingAgent, piAi);
	const provider = piAi.fauxProvider({
		provider: providerId,
		...(options.models ? { models: options.models } : {}),
		tokensPerSecond: options.tokensPerSecond ?? 100_000,
	});
	if (options.responses) provider.setResponses(options.responses);
	runtime.registerNativeProvider(provider.provider);
	const modelId = options.modelId ?? options.models?.[0]?.id ?? "faux-1";
	const model = runtime.getModel(providerId, modelId);
	assert.ok(model, `Offline faux model must exist: ${providerId}/${modelId}`);
	try {
		return await operation({ codingAgent, piAi, runtime, provider, model });
	} finally {
		try {
			runtime.unregisterProvider(providerId);
			await runtime.refresh({ allowNetwork: false });
		} catch {
			// The runtime contains fake values only and exposes no close handle.
		}
	}
}

