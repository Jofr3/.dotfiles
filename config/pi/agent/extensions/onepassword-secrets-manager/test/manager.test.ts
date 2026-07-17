import assert from "node:assert/strict";
import test from "node:test";
import { OnePasswordManager } from "../src/manager.ts";
import { PublicError } from "../src/safety.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const TOKEN_PLACEHOLDER = "test-only-service-account-token-placeholder";
const SECOND_TOKEN_PLACEHOLDER = "test-only-second-service-account-token-placeholder";
const REFERENCE = "op://example-vault/example-item/password";
const SECRET_VALUE = "FETCHED_SECRET_CANARY_NEVER_PUBLIC";
const ERROR_CANARY = "RAW_SDK_ERROR_CANARY_NEVER_PUBLIC";

function environment() {
	return { OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER };
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function fakeSdk(options: {
	validate?: (reference: string) => void;
	createClient: (configuration: Record<string, unknown>) => Promise<unknown>;
}) {
	class Secrets {
		static validateSecretReference(reference: string): void {
			options.validate?.(reference);
		}
	}
	return { default: { Secrets, createClient: options.createClient } };
}

function fakeClient(resolve: (reference: string) => Promise<unknown> | unknown) {
	return {
		secrets: {
			resolve,
		},
	};
}

async function captureError(action: Promise<unknown>, code: PublicError["code"]): Promise<PublicError> {
	try {
		await action;
	} catch (error) {
		if (error instanceof PublicError && error.code === code) return error;
		throw new Error("Operation did not fail with the expected fixed category");
	}
	throw new Error("Operation unexpectedly succeeded");
}

function assertSanitized(error: Error): void {
	const publicText = `${String(error)}\n${error.stack ?? ""}`;
	assert.equal(publicText.includes(ERROR_CANARY), false);
	assert.equal(publicText.includes(SECRET_VALUE), false);
	assert.equal(publicText.includes(REFERENCE), false);
	assert.equal(publicText.includes(TOKEN_PLACEHOLDER), false);
	assert.equal(publicText.includes(SECOND_TOKEN_PLACEHOLDER), false);
}

test("status is offline and does not import, validate, or create a client", () => {
	let loads = 0;
	let validations = 0;
	let creations = 0;
	const manager = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => {
			loads += 1;
			return fakeSdk({
				validate: () => { validations += 1; },
				createClient: async () => {
					creations += 1;
					return fakeClient(async () => SECRET_VALUE);
				},
			});
		},
	});
	assert.deepEqual(manager.status(), {
		phase: "not_initialized",
		serviceAccountTokenConfigured: true,
		authenticationMode: "service_account",
		callsUsed: 0,
		callLimit: 20,
		pending: 0,
		pendingLimit: 4,
		metadataCallsUsed: 0,
		metadataCallLimit: 20,
		metadataPending: 0,
		metadataPendingLimit: 4,
	});
	assert.equal(loads, 0);
	assert.equal(validations, 0);
	assert.equal(creations, 0);
});

test("absent and invalid service-account authentication fail before SDK import or phase transition", async () => {
	const environments = [
		{},
		{ OP_SERVICE_ACCOUNT_TOKEN: ` ${TOKEN_PLACEHOLDER}` },
		{ OP_SERVICE_ACCOUNT_TOKEN: 42 },
	];
	for (const configuredEnvironment of environments) {
		let loads = 0;
		const manager = new OnePasswordManager({
			readEnvironment: () => configuredEnvironment,
			loadSdk: async () => {
				loads += 1;
				throw new Error("must not import");
			},
		});
		assertSanitized(await captureError(manager.resolveSecretValue(REFERENCE), "configuration"));
		assert.equal(loads, 0);
		assert.equal(manager.status().phase, "not_initialized");
	}
});

test("lazy SDK validation precedes authentication and cached client operations stay serialized", async () => {
	const order: string[] = [];
	let loads = 0;
	let creations = 0;
	let active = 0;
	let maximumActive = 0;
	const manager = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => {
			loads += 1;
			return fakeSdk({
				validate: (reference) => {
					assert.equal(reference, REFERENCE);
					order.push("validate");
				},
				createClient: async (configuration) => {
					creations += 1;
					order.push("create");
					assert.deepEqual(configuration, {
						auth: TOKEN_PLACEHOLDER,
						integrationName: "Pi 1Password Secrets Manager",
						integrationVersion: "v1.0.0",
					});
					return fakeClient(async (reference) => {
						assert.equal(reference, REFERENCE);
						active += 1;
						maximumActive = Math.max(maximumActive, active);
						await new Promise((resolve) => setTimeout(resolve, 5));
						active -= 1;
						return SECRET_VALUE;
					});
				},
			});
		},
	});
	assert.deepEqual(await Promise.all([
		manager.resolveSecretValue(REFERENCE),
		manager.resolveSecretValue(REFERENCE),
	]), [SECRET_VALUE, SECRET_VALUE]);
	assert.equal(loads, 1);
	assert.equal(creations, 1);
	assert.equal(maximumActive, 1);
	assert.deepEqual(order.slice(0, 2), ["validate", "create"]);
	assert.equal(order.filter((entry) => entry === "validate").length, 2);
	assert.equal(manager.status().phase, "ready");
});

test("failed import and client initialization are sanitized and retryable", async () => {
	let loads = 0;
	const manager = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => {
			loads += 1;
			if (loads === 1) throw new Error(ERROR_CANARY);
			return fakeSdk({ createClient: async () => fakeClient(async () => SECRET_VALUE) });
		},
	});
	assertSanitized(await captureError(manager.resolveSecretValue(REFERENCE), "sdk"));
	assert.equal(manager.status().phase, "not_initialized");
	assert.equal(await manager.resolveSecretValue(REFERENCE), SECRET_VALUE);
	assert.equal(loads, 2);

	let creations = 0;
	const clientManager = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => fakeSdk({
			createClient: async () => {
				creations += 1;
				if (creations === 1) throw new Error(ERROR_CANARY);
				return fakeClient(async () => SECRET_VALUE);
			},
		}),
	});
	assertSanitized(await captureError(clientManager.resolveSecretValue(REFERENCE), "sdk"));
	assert.equal(await clientManager.resolveSecretValue(REFERENCE), SECRET_VALUE);
	assert.equal(creations, 2);
});

test("SDK loader and validator PublicError objects are replaced instead of trusted", async () => {
	const hostileLoaderError = new PublicError("sdk");
	hostileLoaderError.name = ERROR_CANARY;
	hostileLoaderError.message = `${ERROR_CANARY}-${TOKEN_PLACEHOLDER}`;
	hostileLoaderError.stack = `${ERROR_CANARY}-${SECOND_TOKEN_PLACEHOLDER}`;
	const loaderManager = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => { throw hostileLoaderError; },
	});
	const loaderResult = await captureError(loaderManager.resolveSecretValue(REFERENCE), "sdk");
	assert.notEqual(loaderResult, hostileLoaderError);
	assertSanitized(loaderResult);

	const hostileValidatorError = new PublicError("configuration");
	hostileValidatorError.name = ERROR_CANARY;
	hostileValidatorError.message = `${ERROR_CANARY}-${REFERENCE}`;
	hostileValidatorError.stack = `${ERROR_CANARY}-${SECRET_VALUE}`;
	const validatorManager = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => fakeSdk({
			validate: () => { throw hostileValidatorError; },
			createClient: async () => { throw new Error("must not create"); },
		}),
	});
	const validatorResult = await captureError(
		validatorManager.resolveSecretValue(REFERENCE),
		"configuration",
	);
	assert.notEqual(validatorResult, hostileValidatorError);
	assertSanitized(validatorResult);
});

test("validation, request, and response failures use fixed categories without disclosure", async () => {
	const invalid = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => fakeSdk({
			validate: () => { throw new Error(`${ERROR_CANARY}-${REFERENCE}`); },
			createClient: async () => { throw new Error("must not create"); },
		}),
	});
	assertSanitized(await captureError(invalid.resolveSecretValue(REFERENCE), "configuration"));
	assert.equal(invalid.status().phase, "not_initialized");

	const requestFailure = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => fakeSdk({
			createClient: async () => fakeClient(async () => {
				throw new Error(`${ERROR_CANARY}-${SECRET_VALUE}`);
			}),
		}),
	});
	assertSanitized(await captureError(requestFailure.resolveSecretValue(REFERENCE), "request"));

	for (const response of ["", "x".repeat(64 * 1024 + 1), { value: SECRET_VALUE }]) {
		const manager = new OnePasswordManager({
			readEnvironment: environment,
			loadSdk: async () => fakeSdk({ createClient: async () => fakeClient(async () => response) }),
		});
		assertSanitized(await captureError(manager.resolveSecretValue(REFERENCE), "response"));
	}
});

test("accessor-backed client secrets and resolve methods fail closed without invocation", async () => {
	let secretsGetter = 0;
	const accessorClient = Object.create(null);
	Object.defineProperty(accessorClient, "secrets", {
		enumerable: true,
		get() {
			secretsGetter += 1;
			return fakeClient(async () => SECRET_VALUE).secrets;
		},
	});
	const accessorManager = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => fakeSdk({ createClient: async () => accessorClient }),
	});
	assertSanitized(await captureError(accessorManager.resolveSecretValue(REFERENCE), "sdk"));
	assert.equal(secretsGetter, 0);

	let resolveGetter = 0;
	const secrets = Object.create(null);
	Object.defineProperty(secrets, "resolve", {
		enumerable: true,
		get() {
			resolveGetter += 1;
			return async () => SECRET_VALUE;
		},
	});
	const methodManager = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => fakeSdk({ createClient: async () => ({ secrets }) }),
	});
	assertSanitized(await captureError(methodManager.resolveSecretValue(REFERENCE), "sdk"));
	assert.equal(resolveGetter, 0);
});

test("aborted requests are rejected before environment or SDK access", async () => {
	let environmentReads = 0;
	let loads = 0;
	const controller = new AbortController();
	controller.abort();
	const manager = new OnePasswordManager({
		readEnvironment: () => {
			environmentReads += 1;
			return environment();
		},
		loadSdk: async () => {
			loads += 1;
			return {};
		},
	});
	await captureError(manager.resolveSecretValue(REFERENCE, controller.signal), "aborted");
	assert.equal(environmentReads, 0);
	assert.equal(loads, 0);
});

test("native AbortSignal state is read without invoking an own hostile accessor", async () => {
	const signal = new AbortController().signal;
	let invoked = 0;
	Object.defineProperty(signal, "aborted", {
		get() {
			invoked += 1;
			return true;
		},
	});
	const manager = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => fakeSdk({ createClient: async () => fakeClient(async () => SECRET_VALUE) }),
	});
	assert.equal(await manager.resolveSecretValue(REFERENCE, signal), SECRET_VALUE);
	assert.equal(invoked, 0);
});

test("cached client remains epoch-authoritative and reset snapshots the current service-account token", async () => {
	const configuredEnvironment: Record<string, string | undefined> = {
		OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER,
	};
	let loads = 0;
	const createdWith: unknown[] = [];
	const manager = new OnePasswordManager({
		readEnvironment: () => configuredEnvironment,
		loadSdk: async () => {
			loads += 1;
			return fakeSdk({
				createClient: async (configuration) => {
					createdWith.push(configuration.auth);
					return fakeClient(async () => SECRET_VALUE);
				},
			});
		},
	});
	assert.equal(await manager.resolveSecretValue(REFERENCE), SECRET_VALUE);
	configuredEnvironment.OP_SERVICE_ACCOUNT_TOKEN = SECOND_TOKEN_PLACEHOLDER;
	assert.equal(manager.status().authenticationMode, "service_account");
	assert.equal(await manager.resolveSecretValue(REFERENCE), SECRET_VALUE);
	assert.equal(loads, 1);
	assert.deepEqual(createdWith, [TOKEN_PLACEHOLDER]);

	await manager.reset();
	assert.equal(await manager.resolveSecretValue(REFERENCE), SECRET_VALUE);
	assert.equal(loads, 2);
	assert.deepEqual(createdWith, [TOKEN_PLACEHOLDER, SECOND_TOKEN_PLACEHOLDER]);
	await manager.shutdown();
	assertSanitized(await captureError(manager.resolveSecretValue(REFERENCE), "lifecycle"));
});

test("deadline expiry discards late SDK success and reset forces a fresh client", async () => {
	const started = deferred<void>();
	const release = deferred<string>();
	let creations = 0;
	let resolves = 0;
	const manager = new OnePasswordManager({
		readEnvironment: environment,
		deadlineMs: 5,
		loadSdk: async () => fakeSdk({
			createClient: async () => {
				creations += 1;
				return fakeClient(async () => {
					resolves += 1;
					if (resolves === 1) {
						started.resolve();
						return release.promise;
					}
					return SECRET_VALUE;
				});
			},
		}),
	});
	const pending = manager.resolveSecretValue(REFERENCE, undefined, 5);
	await started.promise;
	assertSanitized(await captureError(pending, "timeout"));
	const drain = manager.reset();
	release.resolve(SECRET_VALUE);
	await drain;
	assert.equal(await manager.resolveSecretValue(REFERENCE), SECRET_VALUE);
	assert.equal(creations, 2);
});

test("reset revokes active and queued calls, does not replace the serialization tail, and boundedly drains", async () => {
	const started = deferred<void>();
	const release = deferred<string>();
	let resolves = 0;
	const manager = new OnePasswordManager({
		readEnvironment: environment,
		drainMs: 5,
		loadSdk: async () => fakeSdk({
			createClient: async () => fakeClient(async () => {
				resolves += 1;
				started.resolve();
				return release.promise;
			}),
		}),
	});
	const active = manager.resolveSecretValue(REFERENCE);
	const queued = manager.resolveSecretValue(REFERENCE);
	await started.promise;
	const startedAt = Date.now();
	const drain = manager.reset();
	const [activeError, queuedError] = await Promise.all([
		captureError(active, "lifecycle"),
		captureError(queued, "lifecycle"),
	]);
	assertSanitized(activeError);
	assertSanitized(queuedError);
	await drain;
	assert.ok(Date.now() - startedAt < 500);
	assert.equal(resolves, 1);
	assert.equal(manager.status().pending, 2);
	release.resolve(SECRET_VALUE);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(manager.status().pending, 0);
});

test("call and pending limits are bounded and reset never replenishes call budget", async () => {
	const release = deferred<string>();
	const manager = new OnePasswordManager({
		readEnvironment: environment,
		maxCalls: 2,
		maxPending: 1,
		loadSdk: async () => fakeSdk({
			createClient: async () => fakeClient(async () => release.promise),
		}),
	});
	const first = manager.resolveSecretValue(REFERENCE);
	await captureError(manager.resolveSecretValue(REFERENCE), "busy");
	release.resolve(SECRET_VALUE);
	assert.equal(await first, SECRET_VALUE);
	await new Promise((resolve) => setTimeout(resolve, 0));
	await manager.reset();
	const second = await manager.resolveSecretValue(REFERENCE);
	assert.equal(second, SECRET_VALUE);
	await captureError(manager.resolveSecretValue(REFERENCE), "call_limit");
	assert.equal(manager.status().callsUsed, 2);
});

test("shutdown is idempotent, revokes pending work, and prevents late cache repopulation", async () => {
	const started = deferred<void>();
	const release = deferred<string>();
	const manager = new OnePasswordManager({
		readEnvironment: environment,
		drainMs: 5,
		loadSdk: async () => fakeSdk({
			createClient: async () => fakeClient(async () => {
				started.resolve();
				return release.promise;
			}),
		}),
	});
	const pending = manager.resolveSecretValue(REFERENCE);
	await started.promise;
	const first = manager.shutdown();
	const second = manager.shutdown();
	assert.equal(first, second);
	assertSanitized(await captureError(pending, "lifecycle"));
	await first;
	assert.equal(manager.status().phase, "shutting_down");
	release.resolve(SECRET_VALUE);
	await captureError(manager.resolveSecretValue(REFERENCE), "lifecycle");
});
