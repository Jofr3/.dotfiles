import {
	CdpConnectionClosedError,
	Stagehand,
	StagehandClosedError,
	StagehandNotInitializedError,
	type Page,
	type V3,
	type V3Options,
} from "@browserbasehq/stagehand";
import { randomBytes } from "node:crypto";
import {
	DEFAULT_CDP_DISCOVERY_ORIGIN,
	discoverLoopbackCdpUrl,
	validateCdpDiscoveryOrigin,
	validateConfiguredCdpUrl,
} from "./cdp.ts";
import { safeErrorMessage, sanitizePublicUrl } from "./output.ts";
import { formatTabRef } from "./tabs.ts";

const DEFAULT_INIT_TIMEOUT_MS = 120_000;
const CLOSE_TIMEOUT_MS = 20_000;
const LATE_CLEANUP_DRAIN_MS = 5_000;
// Stagehand's EventStore captures these at module evaluation time. Retain the
// same initial-state signal so unsetting them later cannot bypass our gate.
const SDK_CONFIG_DIR_CAPTURED = Boolean(process.env.BROWSERBASE_CONFIG_DIR?.trim());
const SDK_FLOW_LOGS_CAPTURED = process.env.BROWSERBASE_FLOW_LOGS === "1";

export type StagehandInstance = V3;
export type StagehandEnvironment = "LOCAL" | "BROWSERBASE";
export type StagehandConnectionSource =
	| "local-launched"
	| "local-cdp-configured"
	| "local-cdp-discovered"
	| "browserbase-created"
	| "browserbase-resumed";
export type StagehandState =
	| "idle"
	| "initializing"
	| "ready"
	| "busy"
	| "closing"
	| "broken"
	| "shutdown";

interface RuntimeConfig {
	environment: StagehandEnvironment;
	model?: string;
	keepAlive: boolean;
	headless: boolean;
	experimental: boolean;
	selfHeal: boolean;
	serverCache: boolean;
	verbose: 0 | 1 | 2;
	initTimeoutMs: number;
	domSettleTimeoutMs?: number;
	executablePath?: string;
	cdpUrl?: string;
	cdpUrlConfigured: boolean;
	cdpDiscoveryOrigin?: string;
	cdpDiscovered: boolean;
	resumeSessionId?: string;
	region?: "us-west-2" | "us-east-1" | "eu-central-1" | "ap-southeast-1";
	viewport?: { width: number; height: number };
	browserbaseCredentialConfigured: boolean;
	agentEnabled: boolean;
	nonInteractiveAgentAllowed: boolean;
	consequentialAgentActionsAllowed: boolean;
	privateNetworkAllowed: boolean;
	sdkLoggingConfigured: boolean;
	sdkLoggingAllowed: boolean;
}

interface InitializingInstance {
	instance: StagehandInstance;
	promise: Promise<void>;
	config: RuntimeConfig;
}

export interface StagehandPublicConfig {
	environment: StagehandEnvironment;
	modelConfigured: boolean;
	keepAlive: boolean;
	headless?: boolean;
	experimental: boolean;
	selfHeal: boolean;
	serverCache: boolean;
	browserbaseCredentialConfigured: boolean;
	resumeSessionConfigured: boolean;
	cdpConfigured: boolean;
	cdpDiscoveryConfigured: boolean;
	agentEnabled: boolean;
	nonInteractiveAgentAllowed: boolean;
	consequentialAgentActionsAllowed: boolean;
	privateNetworkAllowed: boolean;
	sdkLoggingConfigured: boolean;
	sdkLoggingAllowed: boolean;
}

export interface StagehandStatus {
	state: StagehandState;
	activeOperation?: string;
	queueDepth: number;
	generation: number;
	initialized: boolean;
	navigationRequired: boolean;
	recoverable: boolean;
	lateCleanupPending: number;
	browserbaseSessionAvailable: boolean;
	pageCount: number;
	activeTabRef?: string;
	connectionSource?: StagehandConnectionSource;
	url?: string;
	config?: StagehandPublicConfig;
	configurationError?: string;
	warning?: string;
}

export interface CloseResult {
	hadSession: boolean;
	keptAlive: boolean;
	underlyingBrowserPreserved: boolean;
	connectionSource?: StagehandConnectionSource;
	sdkCloseSettled: boolean;
	lateCleanupPending: number;
	warning?: string;
}

interface CloseAttempt {
	sdkCloseSettled: boolean;
	warning?: string;
}

type NavigationEffect = "preserve" | "ready" | "required";

export interface StagehandRunPolicy {
	allowBeforeNavigation?: boolean;
	navigationOnSuccess?: NavigationEffect | ((result: unknown) => NavigationEffect);
	navigationOnFailure?: "preserve" | "required";
}

export interface ManagedTab {
	page: Page;
	ref: string;
	ordinal: number;
}

interface TabReferenceRecord {
	ref: string;
	ordinal: number;
	generation: number;
}

class OperationDeadlineError extends Error {
	readonly operation: string;
	readonly timeoutMs: number;

	constructor(operation: string, timeoutMs: number) {
		super(`${operation} exceeded its ${timeoutMs}ms deadline`);
		this.name = "OperationDeadlineError";
		this.operation = operation;
		this.timeoutMs = timeoutMs;
	}
}

class OperationCancelledError extends Error {
	readonly operation: string;

	constructor(operation: string) {
		super(`${operation} was cancelled`);
		this.name = "OperationCancelledError";
		this.operation = operation;
	}
}

class ManagerResetError extends Error {
	readonly reason: "close" | "shutdown" | "reset";

	constructor(reason: "close" | "shutdown" | "reset") {
		super(`Stagehand manager ${reason} requested`);
		this.name = "ManagerResetError";
		this.reason = reason;
	}
}

function optionalEnv(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
}

function parseBoolean(name: string, fallback: boolean): boolean {
	const raw = optionalEnv(name);
	if (raw === undefined) return fallback;
	if (["1", "true", "yes", "on"].includes(raw.toLowerCase())) return true;
	if (["0", "false", "no", "off"].includes(raw.toLowerCase())) return false;
	throw new Error(`${name} must be true/false, yes/no, on/off, or 1/0`);
}

function parseInteger(name: string, fallback: number | undefined, minimum: number, maximum: number): number | undefined {
	const raw = optionalEnv(name);
	if (raw === undefined) return fallback;
	if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer`);
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(`${name} must be between ${minimum} and ${maximum}`);
	}
	return value;
}

function readConfig(
	environmentOverride?: StagehandEnvironment,
	headlessOverride?: boolean,
): RuntimeConfig {
	const environmentValue = (environmentOverride ?? optionalEnv("STAGEHAND_ENV") ?? "LOCAL").toUpperCase();
	if (environmentValue !== "LOCAL" && environmentValue !== "BROWSERBASE") {
		throw new Error("STAGEHAND_ENV must be BROWSERBASE or LOCAL");
	}
	const environment = environmentValue;

	const regionValue = optionalEnv("STAGEHAND_REGION");
	const regions = ["us-west-2", "us-east-1", "eu-central-1", "ap-southeast-1"] as const;
	if (regionValue && !regions.includes(regionValue as (typeof regions)[number])) {
		throw new Error(`STAGEHAND_REGION must be one of ${regions.join(", ")}`);
	}

	const viewportWidth = parseInteger("STAGEHAND_VIEWPORT_WIDTH", undefined, 320, 4_096);
	const viewportHeight = parseInteger("STAGEHAND_VIEWPORT_HEIGHT", undefined, 240, 4_096);
	if ((viewportWidth === undefined) !== (viewportHeight === undefined)) {
		throw new Error("STAGEHAND_VIEWPORT_WIDTH and STAGEHAND_VIEWPORT_HEIGHT must be set together");
	}

	const verbose = parseInteger("STAGEHAND_VERBOSE", 0, 0, 2) as 0 | 1 | 2;
	const initTimeoutMs = parseInteger(
		"STAGEHAND_INIT_TIMEOUT_MS",
		DEFAULT_INIT_TIMEOUT_MS,
		10_000,
		300_000,
	) as number;
	const configuredCdpUrl = optionalEnv("STAGEHAND_CDP_URL");
	const cdpUrl = configuredCdpUrl ? validateConfiguredCdpUrl(configuredCdpUrl) : undefined;
	const cdpDiscoveryValue = optionalEnv("STAGEHAND_CDP_DISCOVERY_ORIGIN") ?? DEFAULT_CDP_DISCOVERY_ORIGIN;
	const cdpDiscoveryOrigin = !cdpUrl
		? validateCdpDiscoveryOrigin(cdpDiscoveryValue)
		: undefined;
	const headlessConfigured = headlessOverride !== undefined || optionalEnv("STAGEHAND_HEADLESS") !== undefined;
	if (environment === "LOCAL" && (cdpUrl || cdpDiscoveryOrigin) && headlessConfigured) {
		throw new Error(
			"headless cannot be set when attaching to an external CDP browser because Stagehand does not control that browser's launch mode",
		);
	}

	const sdkLoggingConfigured =
		SDK_CONFIG_DIR_CAPTURED ||
		SDK_FLOW_LOGS_CAPTURED ||
		Boolean(optionalEnv("BROWSERBASE_CONFIG_DIR")) ||
		process.env.BROWSERBASE_FLOW_LOGS === "1";
	const sdkLoggingAllowed = parseBoolean("STAGEHAND_ALLOW_SDK_LOGGING", false);
	if (sdkLoggingConfigured && !sdkLoggingAllowed) {
		throw new Error(
			"Stagehand SDK flow logging is configured through BROWSERBASE_CONFIG_DIR or BROWSERBASE_FLOW_LOGS. " +
				"These sinks can contain page/CDP data; unset them or explicitly set STAGEHAND_ALLOW_SDK_LOGGING=true.",
		);
	}

	return {
		environment,
		model: optionalEnv("STAGEHAND_MODEL"),
		keepAlive: parseBoolean("STAGEHAND_KEEP_ALIVE", false),
		headless: headlessOverride ?? parseBoolean("STAGEHAND_HEADLESS", false),
		experimental: parseBoolean("STAGEHAND_EXPERIMENTAL", environment === "LOCAL"),
		selfHeal: parseBoolean("STAGEHAND_SELF_HEAL", true),
		serverCache: parseBoolean("STAGEHAND_SERVER_CACHE", false),
		verbose,
		initTimeoutMs,
		domSettleTimeoutMs: parseInteger("STAGEHAND_DOM_SETTLE_TIMEOUT_MS", undefined, 0, 120_000),
		executablePath: optionalEnv("STAGEHAND_EXECUTABLE_PATH"),
		cdpUrl,
		cdpUrlConfigured: Boolean(cdpUrl),
		cdpDiscoveryOrigin,
		cdpDiscovered: false,
		resumeSessionId: optionalEnv("STAGEHAND_BROWSERBASE_SESSION_ID"),
		region: regionValue as RuntimeConfig["region"],
		viewport:
			viewportWidth !== undefined && viewportHeight !== undefined
				? { width: viewportWidth, height: viewportHeight }
				: undefined,
		browserbaseCredentialConfigured: Boolean(
			optionalEnv("BROWSERBASE_API_KEY") ?? optionalEnv("BB_API_KEY"),
		),
		agentEnabled: parseBoolean("STAGEHAND_ENABLE_AGENT", false),
		nonInteractiveAgentAllowed: parseBoolean("STAGEHAND_ALLOW_NONINTERACTIVE_AGENT", false),
		consequentialAgentActionsAllowed: parseBoolean("STAGEHAND_ALLOW_CONSEQUENTIAL_AGENT_ACTIONS", false),
		privateNetworkAllowed: parseBoolean("STAGEHAND_ALLOW_PRIVATE_NETWORK", false),
		sdkLoggingConfigured,
		sdkLoggingAllowed,
	};
}

function connectionSource(config: RuntimeConfig): StagehandConnectionSource {
	if (config.environment === "LOCAL") {
		if (config.cdpDiscovered) return "local-cdp-discovered";
		return config.cdpUrlConfigured ? "local-cdp-configured" : "local-launched";
	}
	return config.resumeSessionId ? "browserbase-resumed" : "browserbase-created";
}

function publicConfig(config: RuntimeConfig): StagehandPublicConfig {
	return {
		environment: config.environment,
		modelConfigured: Boolean(config.model),
		keepAlive: config.keepAlive,
		headless: config.environment === "LOCAL" && !config.cdpUrl && !config.cdpDiscoveryOrigin
			? config.headless
			: undefined,
		experimental: config.experimental,
		selfHeal: config.selfHeal,
		serverCache: config.serverCache,
		browserbaseCredentialConfigured: config.browserbaseCredentialConfigured,
		resumeSessionConfigured: Boolean(config.resumeSessionId),
		cdpConfigured: config.cdpUrlConfigured,
		cdpDiscoveryConfigured: Boolean(config.cdpDiscoveryOrigin),
		agentEnabled: config.agentEnabled,
		nonInteractiveAgentAllowed: config.nonInteractiveAgentAllowed,
		consequentialAgentActionsAllowed: config.consequentialAgentActionsAllowed,
		privateNetworkAllowed: config.privateNetworkAllowed,
		sdkLoggingConfigured: config.sdkLoggingConfigured,
		sdkLoggingAllowed: config.sdkLoggingAllowed,
	};
}

function buildOptions(config: RuntimeConfig): V3Options {
	const options: V3Options = {
		env: config.environment,
		keepAlive: config.keepAlive,
		experimental: config.experimental,
		selfHeal: config.selfHeal,
		serverCache: config.serverCache,
		verbose: config.verbose,
		disablePino: true,
		logInferenceToFile: false,
		logger: () => undefined,
	};

	if (config.model) options.model = config.model;
	if (config.domSettleTimeoutMs !== undefined) options.domSettleTimeout = config.domSettleTimeoutMs;

	if (config.environment === "LOCAL") {
		options.localBrowserLaunchOptions = {
			headless: config.headless,
			connectTimeoutMs: config.initTimeoutMs,
			...(config.executablePath ? { executablePath: config.executablePath } : {}),
			...(config.cdpUrl ? { cdpUrl: config.cdpUrl } : {}),
			...(config.viewport ? { viewport: config.viewport } : {}),
		};
	} else {
		if (config.resumeSessionId) options.browserbaseSessionID = config.resumeSessionId;
		if (config.region || config.viewport) {
			options.browserbaseSessionCreateParams = {
				...(config.region ? { region: config.region } : {}),
				...(config.viewport ? { browserSettings: { viewport: config.viewport } } : {}),
			};
		}
	}

	return options;
}

function pageFor(instance: StagehandInstance): Page {
	const context = instance.context;
	if (!context) throw new StagehandClosedError();
	const page = context.activePage() ?? context.pages()[0];
	if (!page) throw new Error("Stagehand initialized without an active page");
	return page;
}

function startInitialization(instance: StagehandInstance, config: RuntimeConfig): Promise<void> {
	if (config.environment !== "LOCAL") return instance.init();
	const hadHeadless = Object.prototype.hasOwnProperty.call(process.env, "HEADLESS");
	const previousHeadless = process.env.HEADLESS;
	try {
		// Stagehand 3.6.0 may synchronously delete HEADLESS before its first await.
		// Restore the process-wide value immediately so other Pi extensions are not affected.
		return instance.init();
	} finally {
		if (hadHeadless) process.env.HEADLESS = previousHeadless;
		else delete process.env.HEADLESS;
	}
}

async function deadline<T>(
	promise: Promise<T>,
	controller: AbortController,
	operation: string,
	timeoutMs: number,
): Promise<T> {
	if (controller.signal.aborted) throw new OperationCancelledError(operation);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let listener: (() => void) | undefined;
	const interruption = new Promise<never>((_resolve, reject) => {
		listener = () => {
			const reason = controller.signal.reason;
			reject(reason instanceof Error ? reason : new OperationCancelledError(operation));
		};
		controller.signal.addEventListener("abort", listener, { once: true });
		timer = setTimeout(() => {
			controller.abort(new OperationDeadlineError(operation, timeoutMs));
		}, timeoutMs);
	});

	// A timed-out Stagehand call may settle later. Attach a rejection handler now
	// so quarantine never creates an unhandled rejection.
	void promise.catch(() => undefined);
	try {
		return await Promise.race([promise, interruption]);
	} finally {
		if (timer) clearTimeout(timer);
		if (listener) controller.signal.removeEventListener("abort", listener);
	}
}

function instanceSecrets(instance: StagehandInstance | undefined): (string | undefined)[] {
	if (!instance) return [];
	try {
		return [
			instance.browserbaseSessionID,
			instance.browserbaseSessionURL,
			instance.browserbaseDebugURL,
			...(instance.context?.pages().map((page) => page.targetId()) ?? []),
		];
	} catch {
		return [];
	}
}

async function closeWithDeadline(instance: StagehandInstance): Promise<CloseAttempt> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const secrets = instanceSecrets(instance);
	const closePromise = instance.close({ force: true });
	void closePromise.catch(() => undefined);
	try {
		await Promise.race([
			closePromise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(`SDK close attempt exceeded ${CLOSE_TIMEOUT_MS}ms`)), CLOSE_TIMEOUT_MS);
			}),
		]);
		// Stagehand close is documented as best-effort and can swallow internal
		// Browserbase/context cleanup failures. This only means its promise settled.
		return { sdkCloseSettled: true };
	} catch (error) {
		return {
			sdkCloseSettled: false,
			warning: safeErrorMessage(error, "Stagehand SDK close warning", secrets),
		};
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function isTransportFailure(error: unknown): boolean {
	const seen = new Set<unknown>();
	let current: unknown = error;
	for (let depth = 0; current && depth < 8 && !seen.has(current); depth += 1) {
		seen.add(current);
		if (
			current instanceof CdpConnectionClosedError ||
			current instanceof StagehandClosedError ||
			current instanceof StagehandNotInitializedError
		) {
			return true;
		}
		if (current instanceof Error) {
			if (
				/(?:websocket|browser (?:transport|connection|process|session)|cdp (?:transport|connection|socket)|stagehand session).*(?:closed|disconnected|terminated)|not initialized/i.test(
					current.message,
				)
			) {
				return true;
			}
			current = current.cause;
			continue;
		}
		break;
	}
	return false;
}

function uniqueWarnings(values: Array<string | undefined>): string | undefined {
	const warnings = [...new Set(values.filter((value): value is string => Boolean(value)))];
	return warnings.length ? warnings.join(" ") : undefined;
}

export class StagehandManager {
	private state: StagehandState = "idle";
	private instance?: StagehandInstance;
	private initializing?: InitializingInstance;
	private instanceConfig?: RuntimeConfig;
	private queue: Promise<void> = Promise.resolve();
	private queueDepth = 0;
	private epoch = 0;
	private generation = 0;
	private readonly tabRuntimeNonce = randomBytes(8).toString("hex");
	private readonly tabReferences = new Map<string, TabReferenceRecord>();
	private nextTabOrdinal = 1;
	private authorizedTargetId?: string;
	private authorizedGeneration?: number;
	private activeController?: AbortController;
	private activeOperation?: string;
	private shuttingDown = false;
	private navigationRequired = true;
	private lateCleanups = new Set<Promise<void>>();
	private lastWarning?: string;

	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		this.queueDepth += 1;
		const result = this.queue.then(task, task);
		this.queue = result.then(
			() => undefined,
			() => undefined,
		);
		void result.then(
			() => {
				this.queueDepth = Math.max(0, this.queueDepth - 1);
			},
			() => {
				this.queueDepth = Math.max(0, this.queueDepth - 1);
			},
		);
		return result;
	}

	private clearAuthorization(): void {
		this.authorizedTargetId = undefined;
		this.authorizedGeneration = undefined;
		this.navigationRequired = true;
	}

	private clearReference(instance: StagehandInstance): void {
		if (this.instance === instance) this.instance = undefined;
		if (this.initializing?.instance === instance) this.initializing = undefined;
		if (!this.instance && !this.initializing) {
			this.instanceConfig = undefined;
			this.tabReferences.clear();
		}
		this.clearAuthorization();
	}

	private trackPostSettleCleanup(instance: StagehandInstance, operationPromise: Promise<unknown>): void {
		let cleanup!: Promise<void>;
		cleanup = operationPromise
			.catch(() => undefined)
			.then(async () => {
				const result = await closeWithDeadline(instance);
				if (result.warning) this.lastWarning = result.warning;
			})
			.finally(() => {
				this.lateCleanups.delete(cleanup);
			});
		this.lateCleanups.add(cleanup);
	}

	private async quarantine(
		instance: StagehandInstance,
		operationPromise: Promise<unknown>,
	): Promise<CloseAttempt> {
		this.clearReference(instance);
		this.state = "broken";
		this.trackPostSettleCleanup(instance, operationPromise);
		const close = await closeWithDeadline(instance);
		if (close.warning) this.lastWarning = close.warning;
		this.state = this.shuttingDown ? "shutdown" : "idle";
		return close;
	}

	private instanceLooksUsable(instance: StagehandInstance): boolean {
		try {
			const context = instance.context;
			return Boolean(context && context.pages().length > 0);
		} catch {
			return false;
		}
	}

	private async initialize(
		controller: AbortController,
		environmentOverride?: StagehandEnvironment,
		headlessOverride?: boolean,
	): Promise<StagehandInstance> {
		if (
			headlessOverride !== undefined &&
			this.instanceConfig?.environment === "LOCAL" &&
			(this.instanceConfig.cdpUrlConfigured || this.instanceConfig.cdpDiscoveryOrigin)
		) {
			throw new Error("headless cannot be changed for an attached external CDP browser");
		}
		const reusable =
			this.instance &&
			this.state !== "broken" &&
			this.instanceLooksUsable(this.instance) &&
			(!environmentOverride || this.instanceConfig?.environment === environmentOverride) &&
			(headlessOverride === undefined || this.instanceConfig?.headless === headlessOverride);
		if (reusable && this.instance) return this.instance;

		const effectiveEnvironment = environmentOverride ?? (headlessOverride !== undefined
			? this.instanceConfig?.environment
			: undefined);
		let config = readConfig(effectiveEnvironment, headlessOverride);
		if (
			config.environment === "LOCAL" &&
			!config.cdpUrlConfigured &&
			config.cdpDiscoveryOrigin
		) {
			const discoveredCdpUrl = await discoverLoopbackCdpUrl(config.cdpDiscoveryOrigin, controller.signal);
			config = { ...config, cdpUrl: discoveredCdpUrl, cdpDiscovered: true };
		}
		if (config.environment === "BROWSERBASE" && !config.browserbaseCredentialConfigured) {
			throw new Error(
				"Browserbase mode requires BROWSERBASE_API_KEY (or legacy BB_API_KEY). " +
					"Set it in Pi's environment, or navigate with environment=local for installed Chrome/Chromium.",
			);
		}

		if (this.instance) {
			const stale = this.instance;
			this.clearReference(stale);
			const closed = await closeWithDeadline(stale);
			if (closed.warning) this.lastWarning = closed.warning;
		}

		this.state = "initializing";
		const created = new Stagehand(buildOptions(config));
		const initPromise = startInitialization(created, config);
		this.initializing = { instance: created, promise: initPromise, config };
		this.instanceConfig = config;
		try {
			await deadline(initPromise, controller, "initialization", config.initTimeoutMs);
		} catch (error) {
			const secrets = instanceSecrets(created);
			if (error instanceof ManagerResetError) {
				this.clearReference(created);
				this.trackPostSettleCleanup(created, initPromise);
				this.state = "closing";
			} else {
				await this.quarantine(created, initPromise);
			}
			if (
				error instanceof ManagerResetError ||
				error instanceof OperationDeadlineError ||
				error instanceof OperationCancelledError
			) {
				throw error;
			}
			throw new Error(safeErrorMessage(error, undefined, secrets));
		}

		if (controller.signal.aborted || this.shuttingDown) {
			const reason = controller.signal.reason;
			if (reason instanceof ManagerResetError) {
				this.clearReference(created);
				this.trackPostSettleCleanup(created, initPromise);
				this.state = "closing";
				throw reason;
			}
			await this.quarantine(created, initPromise);
			throw new OperationCancelledError("initialization");
		}

		this.initializing = undefined;
		this.instance = created;
		this.instanceConfig = config;
		this.generation += 1;
		this.clearAuthorization();
		this.state = "ready";
		return created;
	}

	getConfiguration(
		environmentOverride?: StagehandEnvironment,
		headlessOverride?: boolean,
	): StagehandPublicConfig {
		const current = this.instanceConfig;
		if (
			headlessOverride !== undefined &&
			current?.environment === "LOCAL" &&
			(current.cdpUrlConfigured || current.cdpDiscoveryOrigin)
		) {
			throw new Error("headless cannot be changed for an attached external CDP browser");
		}
		if (
			current &&
			(!environmentOverride || current.environment === environmentOverride) &&
			(headlessOverride === undefined || current.headless === headlessOverride)
		) {
			return publicConfig(current);
		}
		const effectiveEnvironment = environmentOverride ?? (headlessOverride !== undefined
			? current?.environment
			: undefined);
		return publicConfig(readConfig(effectiveEnvironment, headlessOverride));
	}

	getLiveConfiguration(
		environmentOverride?: StagehandEnvironment,
		headlessOverride?: boolean,
	): StagehandPublicConfig {
		return publicConfig(readConfig(environmentOverride, headlessOverride));
	}

	captureEpoch(): number {
		return this.epoch;
	}

	assertEpoch(expectedEpoch: number, operation: string): void {
		if (expectedEpoch !== this.epoch) throw new Error(`Stagehand ${operation} was cancelled by a session reset`);
	}

	async run<T>(
		operation: string,
		timeoutMs: number,
		signal: AbortSignal | undefined,
		work: (stagehand: StagehandInstance, signal: AbortSignal) => Promise<T>,
		environmentOverride?: StagehandEnvironment,
		headlessOverride?: boolean,
		policy: StagehandRunPolicy = {},
	): Promise<T> {
		const queuedEpoch = this.epoch;
		const navigationOnSuccess = policy.navigationOnSuccess ?? (operation === "navigate" ? "ready" : "preserve");
		const navigationOnFailure = policy.navigationOnFailure ?? (operation === "navigate" ? "required" : "preserve");
		return this.enqueue(async () => {
			if (this.shuttingDown) throw new Error("Stagehand manager is shutting down");
			if (queuedEpoch !== this.epoch) throw new Error(`Stagehand ${operation} was cancelled by a session reset`);
			if (!policy.allowBeforeNavigation && operation !== "navigate" && this.navigationRequired) {
				throw new Error(`stagehand_navigate or stagehand_tabs select must establish a page before stagehand_${operation}`);
			}
			if (signal?.aborted) throw new OperationCancelledError(operation);

			const controller = new AbortController();
			const onCallerAbort = () => controller.abort(new OperationCancelledError(operation));
			signal?.addEventListener("abort", onCallerAbort, { once: true });
			this.activeController = controller;
			this.activeOperation = operation;
			let current: StagehandInstance | undefined;
			let workPromise: Promise<T> | undefined;
			try {
				current = await this.initialize(controller, environmentOverride, headlessOverride);
				if (!policy.allowBeforeNavigation && operation !== "navigate") this.authorizedPage(current);
				this.state = "busy";
				workPromise = Promise.resolve().then(() => work(current as StagehandInstance, controller.signal));
				const result = await deadline(workPromise, controller, operation, timeoutMs);
				const navigationEffect = typeof navigationOnSuccess === "function"
					? navigationOnSuccess(result)
					: navigationOnSuccess;
				if (navigationEffect === "ready") {
					this.authorizedPage(current);
					this.navigationRequired = false;
				} else if (navigationEffect === "required") {
					this.clearAuthorization();
				}
				this.state = "ready";
				return result;
			} catch (error) {
				// Capture Browserbase metadata before quarantine/close clears it so error
				// redaction can remove a newly-created session id or signed URL.
				const secrets = instanceSecrets(current);
				const reset = error instanceof ManagerResetError;
				const interrupted =
					error instanceof OperationDeadlineError ||
					error instanceof OperationCancelledError ||
					(!reset && controller.signal.aborted);
				const transportFailure = !reset && !interrupted && isTransportFailure(error);

				if (reset && current && workPromise) {
					this.clearReference(current);
					this.trackPostSettleCleanup(current, workPromise);
					this.state = "closing";
				} else if ((interrupted || transportFailure) && current) {
					await this.quarantine(current, workPromise ?? Promise.resolve());
				} else if (navigationOnFailure === "required") {
					this.clearAuthorization();
					if (this.instance) this.state = "ready";
					else if (!this.shuttingDown) this.state = "idle";
				} else if (this.instance) {
					this.state = "ready";
				} else if (!this.shuttingDown && !reset) {
					this.state = "idle";
				}

				const outcomeWarning = operation === "act" || operation === "agent"
					? " The side-effect outcome may be unknown; inspect the external system before retrying."
					: "";
				if (error instanceof OperationDeadlineError) {
					throw new Error(
						`Stagehand ${error.operation} timed out after ${error.timeoutMs}ms. ` +
							"The managed session was quarantined and SDK close was attempted; late cleanup will run again when the SDK call settles." +
							outcomeWarning,
					);
				}
				if (error instanceof OperationCancelledError || (!reset && controller.signal.aborted)) {
					throw new Error(
						`Stagehand ${operation} was cancelled. The managed session was quarantined; navigate again before continuing.` +
							outcomeWarning,
					);
				}
				if (reset) {
					throw new Error(`Stagehand ${operation} was cancelled by ${error.reason}; SDK close was requested.` + outcomeWarning);
				}
				if (transportFailure) {
					throw new Error(
						safeErrorMessage(error, `Stagehand ${operation} lost its browser transport`, secrets) +
							" The dead session was discarded; call stagehand_navigate to recover." +
							outcomeWarning,
					);
				}
				throw new Error(safeErrorMessage(error, `Stagehand ${operation} failed`, secrets) + outcomeWarning);
			} finally {
				signal?.removeEventListener("abort", onCallerAbort);
				if (this.activeController === controller) this.activeController = undefined;
				if (this.activeOperation === operation) this.activeOperation = undefined;
			}
		});
	}

	private authorizedTab(stagehand: StagehandInstance): ManagedTab | undefined {
		if (!this.authorizedTargetId || this.authorizedGeneration !== this.generation) return undefined;
		const tab = this.synchronizeTabs(stagehand).find((candidate) => candidate.page.targetId() === this.authorizedTargetId);
		if (!tab) this.clearAuthorization();
		return tab;
	}

	authorizedPage(stagehand: StagehandInstance): Page {
		const tab = this.authorizedTab(stagehand);
		if (!tab || this.navigationRequired) {
			throw new Error("The selected Stagehand tab is unavailable or has not been authorized; navigate or select a permitted tab again");
		}
		const context = stagehand.context;
		if (!context) throw new StagehandClosedError();
		context.setActivePage(tab.page);
		return tab.page;
	}

	navigationPage(stagehand: StagehandInstance): Page {
		if (this.authorizedTargetId) return this.authorizedPage(stagehand);
		return pageFor(stagehand);
	}

	authorizePage(stagehand: StagehandInstance, page: Page): ManagedTab {
		const tab = this.synchronizeTabs(stagehand).find((candidate) => candidate.page === page);
		if (!tab) throw new Error("The Stagehand page is no longer an open top-level tab");
		const context = stagehand.context;
		if (!context) throw new StagehandClosedError();
		context.setActivePage(page);
		this.authorizedTargetId = page.targetId();
		this.authorizedGeneration = this.generation;
		this.navigationRequired = false;
		return tab;
	}

	private synchronizeTabs(stagehand: StagehandInstance): ManagedTab[] {
		const context = stagehand.context;
		if (!context) throw new StagehandClosedError();
		const pages = context.pages();
		const liveTargets = new Set(pages.map((page) => page.targetId()));
		for (const [targetId, record] of this.tabReferences) {
			if (record.generation !== this.generation || !liveTargets.has(targetId)) this.tabReferences.delete(targetId);
		}
		return pages.map((page) => {
			const targetId = page.targetId();
			let record = this.tabReferences.get(targetId);
			if (!record) {
				const ordinal = this.nextTabOrdinal++;
				record = {
					ref: formatTabRef(this.tabRuntimeNonce, this.generation, ordinal),
					ordinal,
					generation: this.generation,
				};
				this.tabReferences.set(targetId, record);
			}
			return { page, ref: record.ref, ordinal: record.ordinal };
		});
	}

	tabs(stagehand: StagehandInstance): ManagedTab[] {
		return this.synchronizeTabs(stagehand);
	}

	hasCurrentTabRef(ref: string): boolean {
		return Boolean(
			this.instance &&
				[...this.tabReferences.values()].some(
					(record) => record.generation === this.generation && record.ref === ref,
				),
		);
	}

	tabRef(stagehand: StagehandInstance, page: Page): string {
		const tab = this.synchronizeTabs(stagehand).find((candidate) => candidate.page === page);
		if (!tab) throw new Error("The Stagehand page is no longer an open top-level tab");
		return tab.ref;
	}

	activeTabRef(stagehand: StagehandInstance): string | undefined {
		const authorized = this.authorizedTab(stagehand);
		if (authorized) return authorized.ref;
		const active = stagehand.context?.activePage();
		if (!active) return undefined;
		return this.synchronizeTabs(stagehand).find((tab) => tab.page === active)?.ref;
	}

	resolveTab(stagehand: StagehandInstance, ref: string): ManagedTab {
		const tab = this.synchronizeTabs(stagehand).find((candidate) => candidate.ref === ref);
		if (!tab) {
			throw new Error("Unknown, closed, or stale tabRef; list tabs again and use an exact current reference");
		}
		return tab;
	}

	selectTab(stagehand: StagehandInstance, ref: string): ManagedTab {
		const tab = this.resolveTab(stagehand, ref);
		return this.authorizePage(stagehand, tab.page);
	}

	async newTab(stagehand: StagehandInstance): Promise<ManagedTab> {
		const context = stagehand.context;
		if (!context) throw new StagehandClosedError();
		const page = await context.newPage();
		this.clearAuthorization();
		context.setActivePage(page);
		const tab = this.synchronizeTabs(stagehand).find((candidate) => candidate.page === page);
		if (!tab) throw new Error("Stagehand created a tab but did not retain its top-level page target");
		return tab;
	}

	static isTransportFailure(error: unknown): boolean {
		return isTransportFailure(error);
	}

	getStatus(): StagehandStatus {
		let config: StagehandPublicConfig | undefined;
		let configurationError: string | undefined;
		try {
			config = this.getConfiguration();
		} catch (error) {
			configurationError = safeErrorMessage(error);
		}

		let pageCount = 0;
		let activeTabRef: string | undefined;
		let liveConnectionSource: StagehandConnectionSource | undefined;
		let url: string | undefined;
		let browserbaseSessionAvailable = false;
		let initialized = false;
		let recoverable = false;
		if (this.instance) {
			try {
				const context = this.instance.context;
				if (!context) throw new StagehandClosedError();
				const pages = context.pages();
				if (pages.length === 0) throw new Error("Stagehand browser has no pages");
				pageCount = pages.length;
				const authorized = this.authorizedTab(this.instance);
				activeTabRef = authorized?.ref ?? this.activeTabRef(this.instance);
				url = sanitizePublicUrl((authorized?.page ?? context.activePage() ?? pages[0])?.url());
				liveConnectionSource = this.instanceConfig ? connectionSource(this.instanceConfig) : undefined;
				browserbaseSessionAvailable = Boolean(this.instance.browserbaseSessionID);
				initialized = true;
			} catch {
				this.state = "broken";
				this.clearAuthorization();
				recoverable = true;
			}
		}

		return {
			state: this.state,
			activeOperation: this.activeOperation,
			queueDepth: this.queueDepth,
			generation: this.generation,
			initialized,
			navigationRequired: this.navigationRequired,
			recoverable,
			lateCleanupPending: this.lateCleanups.size,
			browserbaseSessionAvailable,
			pageCount,
			activeTabRef,
			connectionSource: liveConnectionSource,
			url,
			config,
			configurationError,
			warning: this.lastWarning,
		};
	}

	async close(): Promise<CloseResult> {
		return this.requestClose(false);
	}

	async shutdown(): Promise<CloseResult> {
		this.shuttingDown = true;
		return this.requestClose(true);
	}

	private async drainLateCleanups(): Promise<void> {
		if (this.lateCleanups.size === 0) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				Promise.allSettled([...this.lateCleanups]),
				new Promise<void>((resolve) => {
					timer = setTimeout(resolve, LATE_CLEANUP_DRAIN_MS);
				}),
			]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	private async requestClose(shutdown: boolean): Promise<CloseResult> {
		const captured = this.instance ?? this.initializing?.instance;
		const capturedConfig = this.instanceConfig ?? this.initializing?.config;
		const capturedKeepAlive = capturedConfig?.keepAlive ?? false;
		const capturedConnectionSource = capturedConfig ? connectionSource(capturedConfig) : undefined;
		this.epoch += 1;
		this.state = "closing";
		this.clearAuthorization();
		this.activeController?.abort(new ManagerResetError(shutdown ? "shutdown" : "close"));
		return this.enqueue(async () => {
			const instances = new Set<StagehandInstance>();
			if (captured) instances.add(captured);
			if (this.instance) instances.add(this.instance);
			if (this.initializing?.instance) instances.add(this.initializing.instance);
			this.instance = undefined;
			this.initializing = undefined;
			this.instanceConfig = undefined;
			this.tabReferences.clear();
			this.clearAuthorization();

			const attempts: CloseAttempt[] = [];
			for (const instance of instances) attempts.push(await closeWithDeadline(instance));
			await this.drainLateCleanups();
			const pending = this.lateCleanups.size;
			const warning = uniqueWarnings([
				...attempts.map((attempt) => attempt.warning),
				pending > 0
					? `${pending} late Stagehand operation(s) have not settled; post-settle SDK cleanup remains scheduled in memory.`
					: undefined,
			]);
			if (warning) this.lastWarning = warning;
			this.state = shutdown ? "shutdown" : "idle";
			const hadSession = instances.size > 0;
			return {
				hadSession,
				keptAlive: hadSession && capturedKeepAlive,
				underlyingBrowserPreserved:
					hadSession &&
					(capturedKeepAlive ||
						capturedConnectionSource === "local-cdp-configured" ||
						capturedConnectionSource === "local-cdp-discovered"),
				connectionSource: hadSession ? capturedConnectionSource : undefined,
				sdkCloseSettled: attempts.every((attempt) => attempt.sdkCloseSettled),
				lateCleanupPending: pending,
				warning,
			};
		});
	}

	static page(stagehand: StagehandInstance): Page {
		return pageFor(stagehand);
	}
}
