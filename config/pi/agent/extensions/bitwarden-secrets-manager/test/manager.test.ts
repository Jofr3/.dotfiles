import assert from "node:assert/strict";
import test from "node:test";
import { BitwardenManager } from "../src/manager.ts";
import { PublicError } from "../src/safety.ts";

const ORGANIZATION_ID = "11111111-2222-3333-8444-555555555555";
const PROJECT_ID = "aaaaaaaa-bbbb-cccc-8ddd-eeeeeeeeeeee";
const SECRET_ID = "ffffffff-eeee-dddd-8ccc-bbbbbbbbbbbb";
const TOKEN_PLACEHOLDER = "test-only-machine-credential-placeholder";
const SENSITIVE_SENTINEL = "SENSITIVE_MANAGER_SENTINEL_DO_NOT_EMIT";

function environment() {
	return { BWS_ACCESS_TOKEN: TOKEN_PLACEHOLDER };
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

async function capturePublicError(action: Promise<unknown>, code: PublicError["code"]): Promise<PublicError> {
	try {
		await action;
	} catch (error) {
		if (error instanceof PublicError && error.code === code) return error;
		throw new Error("Operation did not fail with the expected fixed public category");
	}
	throw new Error("Operation unexpectedly succeeded");
}

function assertNoSentinel(value: unknown): void {
	const text = value instanceof Error ? value.message : JSON.stringify(value);
	if (text.includes(SENSITIVE_SENTINEL)) throw new Error("Sensitive sentinel leaked into a public result");
}

test("status is offline and does not import or construct the SDK", () => {
	let loads = 0;
	let constructions = 0;
	const manager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => {
			loads += 1;
			return {
				default: {
					BitwardenClient: class {
						constructor() {
							constructions += 1;
						}
					},
				},
			};
		},
	});

	assert.deepEqual(manager.status(), {
		phase: "not_initialized",
		accessTokenConfigured: true,
		endpointOverrides: "none",
		metadataCallsUsed: 0,
		metadataCallLimit: 20,
	});
	assert.equal(loads, 0);
	assert.equal(constructions, 0);
});

test("parallel callers share one authentication and SDK operations remain serialized", async () => {
	let loads = 0;
	let constructions = 0;
	let logLevel: number | undefined;
	let loginCalls = 0;
	let maximumActiveLists = 0;
	let activeLists = 0;

	class FakeClient {
		constructor(settings: unknown, requestedLogLevel: number) {
			assert.equal(settings, undefined);
			logLevel = requestedLogLevel;
			constructions += 1;
		}

		auth() {
			return {
				loginAccessToken: async (...args: string[]) => {
					assert.equal(args.length, 1);
					assert.equal(args[0], TOKEN_PLACEHOLDER);
					loginCalls += 1;
				},
			};
		}

		projects() {
			return { list: (organizationId: string) => this.list(organizationId, "projects") };
		}

		secrets() {
			return { list: (organizationId: string) => this.list(organizationId, "secrets") };
		}

		private async list(organizationId: string, kind: "projects" | "secrets") {
			assert.equal(organizationId, ORGANIZATION_ID);
			activeLists += 1;
			maximumActiveLists = Math.max(maximumActiveLists, activeLists);
			await new Promise((resolve) => setTimeout(resolve, 5));
			activeLists -= 1;
			return kind === "projects"
				? {
						data: [
							{ id: PROJECT_ID, name: "project", value: SENSITIVE_SENTINEL },
							{ id: SECRET_ID, name: `unsafe-${TOKEN_PLACEHOLDER}`, value: SENSITIVE_SENTINEL },
						],
					}
				: {
						data: [
							{ id: SECRET_ID, key: "secret-key", value: SENSITIVE_SENTINEL },
							{ id: PROJECT_ID, key: `unsafe-${TOKEN_PLACEHOLDER}`, value: SENSITIVE_SENTINEL },
						],
					};
		}
	}

	const manager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => {
			loads += 1;
			return { default: { BitwardenClient: FakeClient } };
		},
	});

	const [projects, secrets] = await Promise.all([
		manager.listMetadata("projects", ORGANIZATION_ID, 20),
		manager.listMetadata("secrets", ORGANIZATION_ID, 20),
	]);
	assert.equal(loads, 1);
	assert.equal(constructions, 1);
	assert.equal(loginCalls, 1);
	assert.equal(logLevel, 4);
	assert.equal(maximumActiveLists, 1);
	assert.equal(manager.status().phase, "ready");
	assert.equal(projects.details.returned, 1);
	assert.equal(secrets.details.returned, 1);
	assert.equal(JSON.stringify(projects).includes(TOKEN_PLACEHOLDER), false);
	assert.equal(JSON.stringify(secrets).includes(TOKEN_PLACEHOLDER), false);
	assertNoSentinel(projects);
	assertNoSentinel(secrets);
});

test("failed initialization is sanitized and can be retried", async () => {
	let attempts = 0;
	class FakeClient {
		auth() {
			return { loginAccessToken: async () => undefined };
		}
		projects() {
			return { list: async () => ({ data: [{ id: PROJECT_ID, name: "recovered" }] }) };
		}
		secrets() {
			return { list: async () => ({ data: [] }) };
		}
	}
	const manager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => {
			attempts += 1;
			if (attempts === 1) throw new Error(`raw sdk failure ${SENSITIVE_SENTINEL}`);
			return { default: { BitwardenClient: FakeClient } };
		},
	});

	const firstError = await capturePublicError(manager.listMetadata("projects", ORGANIZATION_ID, 20), "sdk");
	assertNoSentinel(firstError);
	assert.equal(manager.status().phase, "not_initialized");
	const result = await manager.listMetadata("projects", ORGANIZATION_ID, 20);
	assert.equal(result.details.returned, 1);
	assert.equal(attempts, 2);
});

test("constructor, authentication, and list failures never expose raw SDK errors", async () => {
	class ConstructorFailure {
		constructor() {
			throw new Error(`constructor ${SENSITIVE_SENTINEL}`);
		}
	}
	const constructorManager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => ({ default: { BitwardenClient: ConstructorFailure } }),
	});
	assertNoSentinel(
		await capturePublicError(constructorManager.listMetadata("projects", ORGANIZATION_ID, 20), "sdk"),
	);

	class AuthenticationFailure {
		auth() {
			return { loginAccessToken: async () => Promise.reject(new Error(`authentication ${SENSITIVE_SENTINEL}`)) };
		}
		projects() {
			return { list: async () => ({ data: [] }) };
		}
		secrets() {
			return { list: async () => ({ data: [] }) };
		}
	}
	const authenticationManager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => ({ default: { BitwardenClient: AuthenticationFailure } }),
	});
	assertNoSentinel(
		await capturePublicError(authenticationManager.listMetadata("projects", ORGANIZATION_ID, 20), "sdk"),
	);

	class ListFailure {
		auth() {
			return { loginAccessToken: async () => undefined };
		}
		projects() {
			return { list: async () => Promise.reject(new Error(`list ${SENSITIVE_SENTINEL}`)) };
		}
		secrets() {
			return { list: async () => ({ data: [] }) };
		}
	}
	const listManager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => ({ default: { BitwardenClient: ListFailure } }),
	});
	assertNoSentinel(await capturePublicError(listManager.listMetadata("projects", ORGANIZATION_ID, 20), "request"));
});

test("an already-aborted call does not read configuration or load the SDK", async () => {
	let environmentReads = 0;
	let loads = 0;
	const controller = new AbortController();
	controller.abort();
	const manager = new BitwardenManager({
		readEnvironment: () => {
			environmentReads += 1;
			return environment();
		},
		loadSdk: async () => {
			loads += 1;
			return {};
		},
	});
	await capturePublicError(manager.listMetadata("projects", ORGANIZATION_ID, 20, controller.signal), "aborted");
	assert.equal(environmentReads, 0);
	assert.equal(loads, 0);
});

test("deadline expiry during authentication discards late initialization", async () => {
	const loginStarted = deferred<void>();
	const releaseLogin = deferred<void>();
	let constructions = 0;
	let listCalls = 0;
	class FakeClient {
		constructor() {
			constructions += 1;
		}
		auth() {
			return {
				loginAccessToken: async () => {
					loginStarted.resolve();
					await releaseLogin.promise;
				},
			};
		}
		projects() {
			return {
				list: async () => {
					listCalls += 1;
					return { data: [] };
				},
			};
		}
		secrets() {
			return { list: async () => ({ data: [] }) };
		}
	}
	const manager = new BitwardenManager({
		readEnvironment: environment,
		deadlineMs: 10,
		loadSdk: async () => ({ default: { BitwardenClient: FakeClient } }),
	});

	const pending = manager.listMetadata("projects", ORGANIZATION_ID, 20);
	await loginStarted.promise;
	const error = await capturePublicError(pending, "timeout");
	assertNoSentinel(error);
	releaseLogin.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(manager.status().phase, "not_initialized");
	assert.equal(listCalls, 0);

	await manager.listMetadata("secrets", ORGANIZATION_ID, 20);
	assert.equal(constructions, 2);
});

test("shutdown is idempotent and late authentication cannot repopulate client state", async () => {
	const loginStarted = deferred<void>();
	const releaseLogin = deferred<void>();
	let listCalls = 0;
	class FakeClient {
		auth() {
			return {
				loginAccessToken: async () => {
					loginStarted.resolve();
					await releaseLogin.promise;
				},
			};
		}
		projects() {
			return {
				list: async () => {
					listCalls += 1;
					return { data: [] };
				},
			};
		}
		secrets() {
			return { list: async () => ({ data: [] }) };
		}
	}
	const manager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => ({ default: { BitwardenClient: FakeClient } }),
	});

	const pending = manager.listMetadata("projects", ORGANIZATION_ID, 20);
	await loginStarted.promise;
	manager.shutdown();
	manager.shutdown();
	releaseLogin.resolve();
	const error = await capturePublicError(pending, "lifecycle");
	assertNoSentinel(error);
	assert.equal(listCalls, 0);
	assert.equal(manager.status().phase, "shutting_down");
	await capturePublicError(manager.listMetadata("projects", ORGANIZATION_ID, 20), "lifecycle");
});

test("resolver uses the exact secrets().get(id) API and validates the direct response", async () => {
	let getCalls = 0;
	let receivedId: string | undefined;
	class FakeClient {
		auth() {
			return { loginAccessToken: async () => undefined };
		}
		projects() {
			return { list: async () => ({ data: [] }) };
		}
		secrets() {
			return {
				list: async () => ({ data: [] }),
				get: async (id: string) => {
					getCalls += 1;
					receivedId = id;
					return { id, value: SENSITIVE_SENTINEL, note: "not inspected" };
				},
			};
		}
	}
	const manager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => ({ default: { BitwardenClient: FakeClient } }),
	});
	const value = await manager.resolveSecretValue(SECRET_ID);
	assert.equal(value, SENSITIVE_SENTINEL);
	assert.equal(receivedId, SECRET_ID);
	assert.equal(getCalls, 1);
	assert.equal(manager.status().metadataCallsUsed, 0);
});

test("resolver rejects mismatched, accessor-backed, oversized, and SDK-error responses without disclosure", async () => {
	let accessorInvoked = false;
	const responses: unknown[] = [
		{ id: PROJECT_ID, value: SENSITIVE_SENTINEL },
		Object.defineProperty({ id: SECRET_ID }, "value", {
			enumerable: true,
			get() {
				accessorInvoked = true;
				return SENSITIVE_SENTINEL;
			},
		}),
		{ id: SECRET_ID, value: "x".repeat(64 * 1024 + 1) },
	];
	let index = 0;
	class FakeClient {
		auth() { return { loginAccessToken: async () => undefined }; }
		projects() { return { list: async () => ({ data: [] }) }; }
		secrets() {
			return {
				list: async () => ({ data: [] }),
				get: async () => responses[index++],
			};
		}
	}
	const manager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => ({ default: { BitwardenClient: FakeClient } }),
	});
	for (let attempt = 0; attempt < responses.length; attempt += 1) {
		assertNoSentinel(await capturePublicError(manager.resolveSecretValue(SECRET_ID), "response"));
	}
	assert.equal(accessorInvoked, false);

	class ErrorClient extends FakeClient {
		secrets() {
			return {
				list: async () => ({ data: [] }),
				get: async () => Promise.reject(new Error(`unsafe get error ${SENSITIVE_SENTINEL}`)),
			};
		}
	}
	const errorManager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => ({ default: { BitwardenClient: ErrorClient } }),
	});
	assertNoSentinel(await capturePublicError(errorManager.resolveSecretValue(SECRET_ID), "request"));
});

test("resolver deadline and shutdown discard late secret responses", async () => {
	const started = deferred<void>();
	const release = deferred<void>();
	class FakeClient {
		auth() { return { loginAccessToken: async () => undefined }; }
		projects() { return { list: async () => ({ data: [] }) }; }
		secrets() {
			return {
				list: async () => ({ data: [] }),
				get: async () => {
					started.resolve();
					await release.promise;
					return { id: SECRET_ID, value: SENSITIVE_SENTINEL };
				},
			};
		}
	}
	const manager = new BitwardenManager({
		readEnvironment: environment,
		deadlineMs: 10,
		loadSdk: async () => ({ default: { BitwardenClient: FakeClient } }),
	});
	const pending = manager.resolveSecretValue(SECRET_ID, undefined, 10);
	await started.promise;
	assertNoSentinel(await capturePublicError(pending, "timeout"));
	manager.shutdown();
	release.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(manager.status().phase, "shutting_down");
});

test("reset revokes authentication immediately, drains it, and forces a fresh client without changing metadata accounting", async () => {
	const loginStarted = deferred<void>();
	const releaseLogin = deferred<void>();
	let constructions = 0;
	class FakeClient {
		constructor() { constructions += 1; }
		auth() {
			return {
				loginAccessToken: async () => {
					if (constructions === 1) {
						loginStarted.resolve();
						await releaseLogin.promise;
					}
				},
			};
		}
		projects() { return { list: async () => ({ data: [] }) }; }
		secrets() { return { list: async () => ({ data: [] }), get: async () => ({ id: SECRET_ID, value: SENSITIVE_SENTINEL }) }; }
	}
	const manager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => ({ default: { BitwardenClient: FakeClient } }),
	});

	const pending = manager.resolveSecretValue(SECRET_ID);
	await loginStarted.promise;
	const drain = manager.reset();
	await capturePublicError(pending, "lifecycle");
	assert.equal(manager.status().phase, "not_initialized");
	assert.equal(manager.status().metadataCallsUsed, 0);
	let drained = false;
	void drain.then(() => { drained = true; });
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(drained, false);
	releaseLogin.resolve();
	await drain;

	assert.equal(await manager.resolveSecretValue(SECRET_ID), SENSITIVE_SENTINEL);
	assert.equal(constructions, 2);
	assert.equal(manager.status().metadataCallsUsed, 0);
});

test("reset revokes queued and active secret resolutions once and drains without starting stale queued work", async () => {
	const getStarted = deferred<void>();
	const releaseGet = deferred<void>();
	let getCalls = 0;
	class FakeClient {
		auth() { return { loginAccessToken: async () => undefined }; }
		projects() { return { list: async () => ({ data: [] }) }; }
		secrets() {
			return {
				list: async () => ({ data: [] }),
				get: async () => {
					getCalls += 1;
					getStarted.resolve();
					await releaseGet.promise;
					return { id: SECRET_ID, value: SENSITIVE_SENTINEL };
				},
			};
		}
	}
	const manager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => ({ default: { BitwardenClient: FakeClient } }),
	});
	const active = manager.resolveSecretValue(SECRET_ID);
	const queued = manager.resolveSecretValue(SECRET_ID);
	await getStarted.promise;
	const drain = manager.reset();
	const [activeError, queuedError] = await Promise.all([
		capturePublicError(active, "lifecycle"),
		capturePublicError(queued, "lifecycle"),
	]);
	assertNoSentinel(activeError);
	assertNoSentinel(queuedError);
	releaseGet.resolve();
	await drain;
	assert.equal(getCalls, 1);
});

test("reset and shutdown return after a fixed drain bound when native work does not settle", async () => {
	const getStarted = deferred<void>();
	class FakeClient {
		auth() { return { loginAccessToken: async () => undefined }; }
		projects() { return { list: async () => ({ data: [] }) }; }
		secrets() {
			return {
				list: async () => ({ data: [] }),
				get: async () => {
					getStarted.resolve();
					return new Promise<unknown>(() => undefined);
				},
			};
		}
	}
	const manager = new BitwardenManager({
		readEnvironment: environment,
		drainMs: 5,
		loadSdk: async () => ({ default: { BitwardenClient: FakeClient } }),
	});
	const pending = manager.resolveSecretValue(SECRET_ID);
	await getStarted.promise;
	const pendingError = capturePublicError(pending, "lifecycle");
	const startedAt = Date.now();
	await manager.reset();
	assert.ok(Date.now() - startedAt < 500);
	await pendingError;
	const shutdownStartedAt = Date.now();
	await manager.shutdown();
	assert.ok(Date.now() - shutdownStartedAt < 500);
	assert.equal(manager.status().phase, "shutting_down");
});

test("reset clears cached SDK client and exact token-redaction references before its drain promise is awaited", async () => {
	class FakeClient {
		auth() { return { loginAccessToken: async () => undefined }; }
		projects() { return { list: async () => ({ data: [] }) }; }
		secrets() { return { list: async () => ({ data: [] }), get: async () => ({ id: SECRET_ID, value: SENSITIVE_SENTINEL }) }; }
	}
	const manager = new BitwardenManager({
		readEnvironment: environment,
		loadSdk: async () => ({ default: { BitwardenClient: FakeClient } }),
	});
	await manager.resolveSecretValue(SECRET_ID);
	const cached = (manager as unknown as {
		authenticatedClient?: { client?: unknown; redactionValue: string };
	}).authenticatedClient;
	assert.ok(cached?.client);
	assert.equal(cached.redactionValue, TOKEN_PLACEHOLDER);
	const drain = manager.reset();
	assert.equal(cached.client, undefined);
	assert.equal(cached.redactionValue, "");
	assert.equal((manager as unknown as { authenticatedClient?: unknown }).authenticatedClient, undefined);
	await drain;
});

test("metadata call budget is bounded and reset does not replenish it", async () => {
	class FakeClient {
		auth() {
			return { loginAccessToken: async () => undefined };
		}
		projects() {
			return { list: async () => ({ data: [] }) };
		}
		secrets() {
			return { list: async () => ({ data: [] }) };
		}
	}
	const manager = new BitwardenManager({
		readEnvironment: environment,
		maxCalls: 1,
		loadSdk: async () => ({ default: { BitwardenClient: FakeClient } }),
	});
	await manager.listMetadata("projects", ORGANIZATION_ID, 20);
	manager.reset();
	manager.reset();
	await capturePublicError(manager.listMetadata("projects", ORGANIZATION_ID, 20), "call_limit");
	assert.equal(manager.status().metadataCallsUsed, 1);
});
