import assert from "node:assert/strict";
import test from "node:test";
import { OnePasswordManager } from "../src/manager.ts";
import { PublicError } from "../src/safety.ts";

delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
delete process.env.PI_ONEPASSWORD_DESKTOP_ACCOUNT;
delete process.env.PI_ONEPASSWORD_RESOLVER_BINDINGS;

const TOKEN_PLACEHOLDER = "test-only-service-account-token-placeholder";
const DESKTOP_ACCOUNT_PLACEHOLDER = "test-only-desktop-account-placeholder";
const REFERENCE = "op://example-vault/example-item/password";
const SECRET_VALUE = "FETCHED_SECRET_CANARY_NEVER_PUBLIC";
const ERROR_CANARY = "RAW_SDK_ERROR_CANARY_NEVER_PUBLIC";

function environment() {
	return { OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER };
}

function desktopEnvironment() {
	return { PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER };
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
	DesktopAuth?: Function;
}) {
	class Secrets {
		static validateSecretReference(reference: string): void {
			options.validate?.(reference);
		}
	}
	class DefaultDesktopAuth {
		constructor(_accountName: string) {}
	}
	return {
		default: {
			Secrets,
			DesktopAuth: options.DesktopAuth ?? DefaultDesktopAuth,
			createClient: options.createClient,
		},
	};
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
	assert.equal(publicText.includes(DESKTOP_ACCOUNT_PLACEHOLDER), false);
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
		desktopAccountConfigured: false,
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

test("desktop status stays lazy and first valid resolution constructs exact DesktopAuth once", async () => {
	const order: string[] = [];
	let loads = 0;
	let constructions = 0;
	let constructed: object | undefined;
	let manager!: OnePasswordManager;
	class DesktopAuth {
		constructor(...argumentsReceived: unknown[]) {
			constructions += 1;
			order.push("construct");
			assert.deepEqual(argumentsReceived, [DESKTOP_ACCOUNT_PLACEHOLDER]);
			assert.equal(manager.status().phase, "initializing");
			constructed = this;
		}
	}
	manager = new OnePasswordManager({
		readEnvironment: desktopEnvironment,
		loadSdk: async () => {
			loads += 1;
			return fakeSdk({
				DesktopAuth,
				validate: () => { order.push("validate"); },
				createClient: async (configuration) => {
					order.push("create");
					assert.equal(configuration.auth, constructed);
					assert.equal(configuration.integrationName, "Pi 1Password Secrets Manager");
					assert.equal(configuration.integrationVersion, "v1.0.0");
					return fakeClient(async () => SECRET_VALUE);
				},
			});
		},
	});
	const status = manager.status();
	assert.equal(status.authenticationMode, "desktop");
	assert.equal(status.serviceAccountTokenConfigured, false);
	assert.equal(status.desktopAccountConfigured, true);
	assert.equal(JSON.stringify(status).includes(DESKTOP_ACCOUNT_PLACEHOLDER), false);
	assert.equal(loads, 0);
	assert.equal(constructions, 0);
	assert.equal(await manager.resolveSecretValue(REFERENCE), SECRET_VALUE);
	assert.deepEqual(order.slice(0, 3), ["validate", "construct", "create"]);
	assert.equal(loads, 1);
	assert.equal(constructions, 1);
	assert.equal(await manager.resolveSecretValue(REFERENCE), SECRET_VALUE);
	assert.equal(constructions, 1);
});

test("ambiguous, absent, and invalid authentication fail before SDK import or phase transition", async () => {
	const environments = [
		{
			OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER,
			PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER,
		},
		{},
		{ PI_ONEPASSWORD_DESKTOP_ACCOUNT: ` ${DESKTOP_ACCOUNT_PLACEHOLDER}` },
		{ OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER, PI_ONEPASSWORD_DESKTOP_ACCOUNT: 42 },
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
	const ambiguous = new OnePasswordManager({
		readEnvironment: () => ({
			OP_SERVICE_ACCOUNT_TOKEN: TOKEN_PLACEHOLDER,
			PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER,
		}),
	});
	assert.equal(ambiguous.status().authenticationMode, "ambiguous");
	assert.equal(JSON.stringify(ambiguous.status()).includes(DESKTOP_ACCOUNT_PLACEHOLDER), false);
});

test("lazy SDK validation precedes authentication and cached client operations stay serialized", async () => {
	const order: string[] = [];
	let loads = 0;
	let creations = 0;
	let desktopConstructions = 0;
	let active = 0;
	let maximumActive = 0;
	class UnusedDesktopAuth {
		constructor() { desktopConstructions += 1; }
	}
	const manager = new OnePasswordManager({
		readEnvironment: environment,
		loadSdk: async () => {
			loads += 1;
			return fakeSdk({
				DesktopAuth: UnusedDesktopAuth,
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
	assert.equal(desktopConstructions, 0);
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
	hostileLoaderError.stack = `${ERROR_CANARY}-${DESKTOP_ACCOUNT_PLACEHOLDER}`;
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

test("accessor-backed and malformed DesktopAuth exports fail closed without invocation", async () => {
	class Secrets {
		static validateSecretReference(): void {}
	}
	let accessorInvocations = 0;
	const accessorDefault = {
		Secrets,
		createClient: async () => fakeClient(async () => SECRET_VALUE),
	};
	Object.defineProperty(accessorDefault, "DesktopAuth", {
		enumerable: true,
		get() {
			accessorInvocations += 1;
			return class DesktopAuth {};
		},
	});
	const accessorManager = new OnePasswordManager({
		readEnvironment: desktopEnvironment,
		loadSdk: async () => ({ default: accessorDefault }),
	});
	assertSanitized(await captureError(accessorManager.resolveSecretValue(REFERENCE), "sdk"));
	assert.equal(accessorInvocations, 0);

	let malformedInvocations = 0;
	let prototypeGetterInvocations = 0;
	const ArrowDesktopAuth = () => { malformedInvocations += 1; };
	function AccessorPrototypeDesktopAuth() { malformedInvocations += 1; }
	Object.defineProperty(AccessorPrototypeDesktopAuth.prototype, "constructor", {
		configurable: true,
		get() {
			prototypeGetterInvocations += 1;
			return AccessorPrototypeDesktopAuth;
		},
	});
	for (const DesktopAuth of [ArrowDesktopAuth, AccessorPrototypeDesktopAuth]) {
		const manager = new OnePasswordManager({
			readEnvironment: desktopEnvironment,
			loadSdk: async () => fakeSdk({
				DesktopAuth,
				createClient: async () => fakeClient(async () => SECRET_VALUE),
			}),
		});
		assertSanitized(await captureError(manager.resolveSecretValue(REFERENCE), "sdk"));
	}
	assert.equal(malformedInvocations, 0);
	assert.equal(prototypeGetterInvocations, 0);
});

test("desktop constructor and constructed-result failures are sanitized and retryable", async () => {
	let attempts = 0;
	class RetryingDesktopAuth {
		constructor(accountName: string) {
			attempts += 1;
			if (attempts === 1) throw new Error(`${ERROR_CANARY}-${accountName}`);
		}
	}
	const retrying = new OnePasswordManager({
		readEnvironment: desktopEnvironment,
		loadSdk: async () => fakeSdk({
			DesktopAuth: RetryingDesktopAuth,
			createClient: async () => fakeClient(async () => SECRET_VALUE),
		}),
	});
	assertSanitized(await captureError(retrying.resolveSecretValue(REFERENCE), "sdk"));
	assert.equal(retrying.status().phase, "not_initialized");
	assert.equal(await retrying.resolveSecretValue(REFERENCE), SECRET_VALUE);
	assert.equal(attempts, 2);

	let malformedConstructions = 0;
	function ReturningArrayDesktopAuth() {
		malformedConstructions += 1;
		return [];
	}
	const malformed = new OnePasswordManager({
		readEnvironment: desktopEnvironment,
		loadSdk: async () => fakeSdk({
			DesktopAuth: ReturningArrayDesktopAuth,
			createClient: async () => fakeClient(async () => SECRET_VALUE),
		}),
	});
	assertSanitized(await captureError(malformed.resolveSecretValue(REFERENCE), "sdk"));
	assert.equal(malformedConstructions, 1);
	assert.equal(malformed.status().phase, "not_initialized");

	const clientFailure = new OnePasswordManager({
		readEnvironment: desktopEnvironment,
		loadSdk: async () => fakeSdk({
			createClient: async () => {
				throw new Error(`${ERROR_CANARY}-${DESKTOP_ACCOUNT_PLACEHOLDER}`);
			},
		}),
	});
	assertSanitized(await captureError(clientFailure.resolveSecretValue(REFERENCE), "sdk"));
	assert.equal(clientFailure.status().phase, "not_initialized");
});

test("desktop constructor reentrancy cannot create a client after reset or shutdown", async () => {
	for (const lifecycle of ["reset", "shutdown"] as const) {
		let manager!: OnePasswordManager;
		let createClientCalls = 0;
		let lifecycleDrain: Promise<void> | undefined;
		class ReentrantDesktopAuth {
			constructor(accountName: string) {
				assert.equal(accountName, DESKTOP_ACCOUNT_PLACEHOLDER);
				lifecycleDrain = lifecycle === "reset" ? manager.reset() : manager.shutdown();
			}
		}
		manager = new OnePasswordManager({
			readEnvironment: desktopEnvironment,
			loadSdk: async () => fakeSdk({
				DesktopAuth: ReentrantDesktopAuth,
				createClient: async () => {
					createClientCalls += 1;
					return fakeClient(async () => SECRET_VALUE);
				},
			}),
		});

		assertSanitized(await captureError(manager.resolveSecretValue(REFERENCE), "lifecycle"));
		assert.equal(createClientCalls, 0);
		assert.ok(lifecycleDrain);
		await lifecycleDrain;
		assert.equal(manager.status().phase, lifecycle === "reset" ? "not_initialized" : "shutting_down");
	}
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

test("desktop client remains epoch-authoritative and reset reselects before import", async () => {
	const configuredEnvironment: Record<string, string | undefined> = {
		PI_ONEPASSWORD_DESKTOP_ACCOUNT: DESKTOP_ACCOUNT_PLACEHOLDER,
	};
	let loads = 0;
	let constructions = 0;
	let creations = 0;
	class DesktopAuth {
		constructor(accountName: string) {
			assert.equal(accountName, DESKTOP_ACCOUNT_PLACEHOLDER);
			constructions += 1;
		}
	}
	const manager = new OnePasswordManager({
		readEnvironment: () => configuredEnvironment,
		loadSdk: async () => {
			loads += 1;
			return fakeSdk({
				DesktopAuth,
				createClient: async () => {
					creations += 1;
					return fakeClient(async () => SECRET_VALUE);
				},
			});
		},
	});
	assert.equal(await manager.resolveSecretValue(REFERENCE), SECRET_VALUE);
	configuredEnvironment.OP_SERVICE_ACCOUNT_TOKEN = TOKEN_PLACEHOLDER;
	assert.equal(manager.status().authenticationMode, "ambiguous");
	assert.equal(await manager.resolveSecretValue(REFERENCE), SECRET_VALUE);
	assert.equal(loads, 1);
	assert.equal(constructions, 1);
	assert.equal(creations, 1);

	await manager.reset();
	assertSanitized(await captureError(manager.resolveSecretValue(REFERENCE), "configuration"));
	assert.equal(loads, 1);
	assert.equal(manager.status().phase, "not_initialized");
	delete configuredEnvironment.OP_SERVICE_ACCOUNT_TOKEN;
	assert.equal(await manager.resolveSecretValue(REFERENCE), SECRET_VALUE);
	assert.equal(loads, 2);
	assert.equal(constructions, 2);
	assert.equal(creations, 2);
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
