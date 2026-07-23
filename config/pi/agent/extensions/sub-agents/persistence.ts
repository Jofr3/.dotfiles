import { StringEnum } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getUnreportedUsage } from "./usage-ledger.ts";
import type {
	ComplexityTier,
	ManagedSubAgentSnapshot,
	ModelPolicy,
	ModelRoute,
	ModelRouteStep,
	PersistedSubAgentHistoryV1,
	PersistedSubAgentStateV1,
	PersistedUsageLedgerV1,
	SubAgentManagerEvent,
	UsageCounters,
} from "./types.ts";
import { SUB_AGENT_BOUNDS } from "./types.ts";

export const SUB_AGENTS_STATE_CUSTOM_TYPE = "sub-agents-state-v1" as const;
export const SUB_AGENTS_STATE_VERSION = 1 as const;

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const TERMINAL_HISTORY_STATES = new Set<PersistedSubAgentStateV1>([
	"idle",
	"blocked",
	"failed",
	"removed",
]);
const MODEL_POLICIES = new Set<ModelPolicy>(["auto", "inherit", "explicit"]);
const COMPLEXITY_TIERS = new Set<ComplexityTier>(["simple", "moderate", "complex"]);
const ROUTE_STEP_SOURCES = new Set<ModelRouteStep["source"]>(["tier", "inherit", "explicit"]);
const ROUTE_STEP_OUTCOMES = new Set<ModelRouteStep["outcome"]>(["unavailable", "selected"]);

const boundedNonBlankString = (maxLength: number) =>
	Type.String({ minLength: 1, maxLength, pattern: "[\\s\\S]*\\S[\\s\\S]*" });
const nonNegativeIntegerSchema = Type.Integer({ minimum: 0, maximum: MAX_SAFE_INTEGER });
const nonNegativeNumberSchema = Type.Number({ minimum: 0, maximum: Number.MAX_VALUE });

export const persistedUsageCountersV1Schema = Type.Object(
	{
		input: nonNegativeIntegerSchema,
		output: nonNegativeIntegerSchema,
		cacheRead: nonNegativeIntegerSchema,
		cacheWrite: nonNegativeIntegerSchema,
		totalTokens: nonNegativeIntegerSchema,
		cost: nonNegativeNumberSchema,
	},
	{ additionalProperties: false },
);

export const persistedUsageLedgerV1Schema = Type.Object(
	{
		totals: persistedUsageCountersV1Schema,
		reported: persistedUsageCountersV1Schema,
		unreported: persistedUsageCountersV1Schema,
		turns: nonNegativeIntegerSchema,
		assignments: nonNegativeIntegerSchema,
	},
	{ additionalProperties: false },
);

const persistedModelRefV1Schema = Type.Object(
	{
		provider: boundedNonBlankString(128),
		id: boundedNonBlankString(256),
	},
	{ additionalProperties: false },
);

const persistedModelRouteStepV1Schema = Type.Object(
	{
		source: StringEnum(["tier", "inherit", "explicit"] as const),
		modelId: boundedNonBlankString(256),
		complexity: Type.Optional(StringEnum(["simple", "moderate", "complex"] as const)),
		outcome: StringEnum(["unavailable", "selected"] as const),
	},
	{ additionalProperties: false },
);

export const persistedModelRouteV1Schema = Type.Object(
	{
		requestedPolicy: StringEnum(["auto", "inherit", "explicit"] as const),
		requestedComplexity: StringEnum(["simple", "moderate", "complex"] as const),
		selectedModel: persistedModelRefV1Schema,
		selectedTier: Type.Optional(StringEnum(["simple", "moderate", "complex"] as const)),
		fallbackUsed: Type.Boolean(),
		fallbackPath: Type.Array(persistedModelRouteStepV1Schema, {
			minItems: 1,
			maxItems: SUB_AGENT_BOUNDS.modelRouteSteps,
		}),
		reason: boundedNonBlankString(SUB_AGENT_BOUNDS.modelRouteReasonChars),
	},
	{ additionalProperties: false },
);

export const persistedSubAgentResultV1Schema = Type.Object(
	{
		summary: boundedNonBlankString(SUB_AGENT_BOUNDS.persistenceResultSummaryChars),
		details: Type.Optional(
			boundedNonBlankString(SUB_AGENT_BOUNDS.persistenceResultDetailsChars),
		),
		completedAt: nonNegativeIntegerSchema,
	},
	{ additionalProperties: false },
);

export const persistedSubAgentHistoryV1Schema = Type.Object(
	{
		version: Type.Literal(SUB_AGENTS_STATE_VERSION),
		generation: Type.String({
			minLength: 6,
			maxLength: SUB_AGENT_BOUNDS.agentIdChars,
			pattern: "^sag1-[A-Za-z0-9_-]+$",
		}),
		id: Type.String({
			minLength: 5,
			maxLength: SUB_AGENT_BOUNDS.agentIdChars,
			pattern: "^sa1-[A-Za-z0-9_-]+$",
		}),
		name: boundedNonBlankString(SUB_AGENT_BOUNDS.nameChars),
		role: boundedNonBlankString(SUB_AGENT_BOUNDS.roleChars),
		objectiveSummary: boundedNonBlankString(
			SUB_AGENT_BOUNDS.persistenceObjectiveChars,
		),
		state: StringEnum(["idle", "blocked", "failed", "removed"] as const),
		statusSummary: Type.Optional(
			boundedNonBlankString(SUB_AGENT_BOUNDS.persistenceStatusSummaryChars),
		),
		result: Type.Optional(persistedSubAgentResultV1Schema),
		modelRoute: Type.Optional(persistedModelRouteV1Schema),
		usage: persistedUsageLedgerV1Schema,
		files: Type.Array(
			boundedNonBlankString(SUB_AGENT_BOUNDS.contextPathChars),
			{
				maxItems: SUB_AGENT_BOUNDS.reportFiles,
				uniqueItems: true,
			},
		),
		omittedFileCount: nonNegativeIntegerSchema,
		createdAt: nonNegativeIntegerSchema,
		updatedAt: nonNegativeIntegerSchema,
		removedAt: Type.Optional(nonNegativeIntegerSchema),
		removalReason: Type.Optional(boundedNonBlankString(SUB_AGENT_BOUNDS.errorChars)),
	},
	{ additionalProperties: false },
);

export class SubAgentPersistenceError extends Error {
	readonly code: string;

	constructor(message: string, code = "invalid_persisted_state") {
		super(message);
		this.name = "SubAgentPersistenceError";
		this.code = code;
	}
}

function cleanMultiline(value: unknown, maxChars: number): string {
	return String(value ?? "")
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ")
		.trim()
		.slice(0, maxChars);
}

function cleanOneLine(value: unknown, maxChars: number): string {
	return cleanMultiline(value, maxChars).replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function requireText(value: unknown, field: string, maxChars: number, oneLine = false): string {
	const text = oneLine ? cleanOneLine(value, maxChars) : cleanMultiline(value, maxChars);
	if (!text) throw new SubAgentPersistenceError(`${field} is required`);
	return text;
}

function optionalText(
	value: unknown,
	maxChars: number,
	oneLine = false,
): string | undefined {
	if (value === undefined) return undefined;
	const text = oneLine ? cleanOneLine(value, maxChars) : cleanMultiline(value, maxChars);
	return text || undefined;
}

function requireSafeTimestamp(value: unknown, field: string): number {
	if (!Number.isSafeInteger(value) || Number(value) < 0) {
		throw new SubAgentPersistenceError(`${field} must be a non-negative safe integer`);
	}
	return Number(value);
}

function requireOpaqueId(value: unknown, field: "generation" | "id"): string {
	const text = requireText(value, field, SUB_AGENT_BOUNDS.agentIdChars, true);
	const pattern = field === "generation" ? /^sag1-[A-Za-z0-9_-]+$/ : /^sa1-[A-Za-z0-9_-]+$/;
	if (!pattern.test(text)) {
		throw new SubAgentPersistenceError(`${field} is not a supported opaque identifier`);
	}
	return text;
}

function requireChoice<T extends string>(value: unknown, choices: ReadonlySet<T>, field: string): T {
	if (typeof value !== "string" || !choices.has(value as T)) {
		throw new SubAgentPersistenceError(`${field} has an unsupported value`);
	}
	return value as T;
}

function cloneCounters(counters: UsageCounters, field: string): UsageCounters {
	const tokenFields = ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const;
	const result = {} as UsageCounters;
	for (const name of tokenFields) {
		const value = counters?.[name];
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new SubAgentPersistenceError(`${field}.${name} must be a non-negative safe integer`);
		}
		result[name] = value;
	}
	if (!Number.isFinite(counters?.cost) || counters.cost < 0) {
		throw new SubAgentPersistenceError(`${field}.cost must be a finite non-negative number`);
	}
	result.cost = counters.cost;
	return result;
}

function clonePersistedUsage(snapshot: ManagedSubAgentSnapshot): PersistedUsageLedgerV1 {
	const totals = cloneCounters(snapshot.usage.totals, "usage.totals");
	const reported = cloneCounters(snapshot.usage.reported, "usage.reported");
	let unreported: UsageCounters;
	try {
		unreported = getUnreportedUsage(snapshot.usage);
	} catch {
		throw new SubAgentPersistenceError("usage reported counters cannot exceed totals");
	}
	const turns = requireSafeTimestamp(snapshot.usage.turns, "usage.turns");
	const assignments = requireSafeTimestamp(snapshot.usage.assignments, "usage.assignments");
	return {
		totals,
		reported,
		unreported: cloneCounters(unreported, "usage.unreported"),
		turns,
		assignments,
	};
}

function clonePersistedRoute(route: ModelRoute | undefined): ModelRoute | undefined {
	if (!route) return undefined;
	const requestedPolicy = requireChoice(
		route.requestedPolicy,
		MODEL_POLICIES,
		"modelRoute.requestedPolicy",
	);
	const requestedComplexity = requireChoice(
		route.requestedComplexity,
		COMPLEXITY_TIERS,
		"modelRoute.requestedComplexity",
	);
	if (
		!Array.isArray(route.fallbackPath) ||
		route.fallbackPath.length < 1 ||
		route.fallbackPath.length > SUB_AGENT_BOUNDS.modelRouteSteps
	) {
		throw new SubAgentPersistenceError("modelRoute.fallbackPath is outside its supported bounds");
	}
	const fallbackPath = route.fallbackPath.map((step, index) => {
		const source = requireChoice(
			step?.source,
			ROUTE_STEP_SOURCES,
			`modelRoute.fallbackPath[${index}].source`,
		);
		const complexity =
			step.complexity === undefined
				? undefined
				: requireChoice(
						step.complexity,
						COMPLEXITY_TIERS,
						`modelRoute.fallbackPath[${index}].complexity`,
					);
		if ((source === "tier") !== (complexity !== undefined)) {
			throw new SubAgentPersistenceError(
				`modelRoute.fallbackPath[${index}] has inconsistent tier metadata`,
			);
		}
		return {
			source,
			modelId: requireText(
				step.modelId,
				`modelRoute.fallbackPath[${index}].modelId`,
				256,
				true,
			),
			...(complexity ? { complexity } : {}),
			outcome: requireChoice(
				step.outcome,
				ROUTE_STEP_OUTCOMES,
				`modelRoute.fallbackPath[${index}].outcome`,
			),
		};
	});
	const selectedTier =
		route.selectedTier === undefined
			? undefined
			: requireChoice(route.selectedTier, COMPLEXITY_TIERS, "modelRoute.selectedTier");
	const selectedModel = {
		provider: requireText(route.selectedModel?.provider, "modelRoute.selectedModel.provider", 128, true),
		id: requireText(route.selectedModel?.id, "modelRoute.selectedModel.id", 256, true),
	};
	const selectedSteps = fallbackPath.filter((step) => step.outcome === "selected");
	const finalStep = fallbackPath.at(-1)!;
	if (
		selectedSteps.length !== 1 ||
		finalStep.outcome !== "selected" ||
		finalStep.modelId !== selectedModel.id ||
		fallbackPath.slice(0, -1).some((step) => step.outcome !== "unavailable")
	) {
		throw new SubAgentPersistenceError("modelRoute must end in exactly one selected model");
	}
	if ((selectedTier !== undefined) !== (finalStep.source === "tier") || selectedTier !== finalStep.complexity) {
		throw new SubAgentPersistenceError("modelRoute selected tier is inconsistent");
	}
	const expectedFallback = requestedPolicy === "auto" && fallbackPath.length > 1;
	if (route.fallbackUsed !== expectedFallback) {
		throw new SubAgentPersistenceError("modelRoute fallback flag is inconsistent");
	}
	if (
		(requestedPolicy === "explicit" && (fallbackPath.length !== 1 || finalStep.source !== "explicit")) ||
		(requestedPolicy === "inherit" && (fallbackPath.length !== 1 || finalStep.source !== "inherit")) ||
		(requestedPolicy === "auto" && finalStep.source === "explicit")
	) {
		throw new SubAgentPersistenceError("modelRoute policy and path are inconsistent");
	}
	return {
		requestedPolicy,
		requestedComplexity,
		selectedModel,
		...(selectedTier ? { selectedTier } : {}),
		fallbackUsed: route.fallbackUsed,
		fallbackPath,
		reason: requireText(
			route.reason,
			"modelRoute.reason",
			SUB_AGENT_BOUNDS.modelRouteReasonChars,
			true,
		),
	};
}

function collectFiles(snapshot: ManagedSubAgentSnapshot): { files: string[]; omittedFileCount: number } {
	const groups: readonly (readonly (string | undefined)[] | undefined)[] = [
		snapshot.currentAssignment?.result?.files,
		snapshot.latestReport?.files,
		snapshot.currentAssignment?.modifiedFiles,
		snapshot.leases.map((lease) => (lease.kind === "file" ? lease.path : undefined)),
	];
	const files: string[] = [];
	const seen = new Set<string>();
	let omittedFileCount = 0;
	for (const group of groups) {
		for (const raw of group ?? []) {
			const path = optionalText(raw, SUB_AGENT_BOUNDS.contextPathChars, false)
				?.replace(/[\n\t]+/g, " ")
				.trim();
			if (!path || seen.has(path)) continue;
			seen.add(path);
			if (files.length < SUB_AGENT_BOUNDS.reportFiles) files.push(path);
			else omittedFileCount += 1;
		}
	}
	return { files, omittedFileCount };
}

function statusSummary(snapshot: ManagedSubAgentSnapshot): string | undefined {
	if (snapshot.state === "idle" && snapshot.currentAssignment?.state === "aborted") {
		return "Assignment aborted before completion.";
	}
	if (snapshot.state === "blocked") {
		return optionalText(
			snapshot.latestReport?.needs ??
				snapshot.latestReport?.summary ??
				snapshot.currentAssignment?.blocker,
			SUB_AGENT_BOUNDS.persistenceStatusSummaryChars,
			true,
		);
	}
	if (snapshot.state === "failed") {
		return "Sub-agent failed; runtime error text was not persisted.";
	}
	if (snapshot.state === "removed") {
		if (snapshot.lastError || snapshot.currentAssignment?.error) {
			return "Sub-agent was removed after a failure; runtime error text was not persisted.";
		}
		return optionalText(
			snapshot.removalReason,
			SUB_AGENT_BOUNDS.persistenceStatusSummaryChars,
			true,
		);
	}
	return undefined;
}

export function persistedSubAgentHistoryByteLength(history: PersistedSubAgentHistoryV1): number {
	return Buffer.byteLength(JSON.stringify(history), "utf8");
}

/**
 * Reduce one manager-owned terminal snapshot to the strict per-agent custom-entry
 * payload. No spec instructions/context, runtime activity, event timeline, leases,
 * child messages, tool arguments, or credential-bearing provider metadata are copied.
 */
export function createPersistedSubAgentHistoryV1(
	snapshot: Readonly<ManagedSubAgentSnapshot>,
): PersistedSubAgentHistoryV1 {
	if (!snapshot || typeof snapshot !== "object") {
		throw new SubAgentPersistenceError("A managed sub-agent snapshot is required");
	}
	const state = requireChoice(
		snapshot.state,
		TERMINAL_HISTORY_STATES,
		"state",
	);
	const createdAt = requireSafeTimestamp(snapshot.createdAt, "createdAt");
	const updatedAt = requireSafeTimestamp(snapshot.updatedAt, "updatedAt");
	if (updatedAt < createdAt) {
		throw new SubAgentPersistenceError("updatedAt cannot precede createdAt");
	}
	const removedAt =
		snapshot.removedAt === undefined
			? undefined
			: requireSafeTimestamp(snapshot.removedAt, "removedAt");
	if (state === "removed" && removedAt === undefined) {
		throw new SubAgentPersistenceError("A removed history record requires removedAt");
	}
	if (state !== "removed" && removedAt !== undefined) {
		throw new SubAgentPersistenceError("Only a removed history record may include removedAt");
	}
	if (removedAt !== undefined && (removedAt < createdAt || removedAt > updatedAt)) {
		throw new SubAgentPersistenceError("removedAt must fall within the child history interval");
	}

	const latestResult = snapshot.currentAssignment?.result;
	const resultDetails = optionalText(
		latestResult?.details,
		SUB_AGENT_BOUNDS.persistenceResultDetailsChars,
	);
	const result = latestResult
		? {
				summary: requireText(
					latestResult.summary,
					"result.summary",
					SUB_AGENT_BOUNDS.persistenceResultSummaryChars,
				),
				...(resultDetails ? { details: resultDetails } : {}),
				completedAt: requireSafeTimestamp(
					latestResult.completedAt,
					"result.completedAt",
				),
			}
		: undefined;
	if (result && (result.completedAt < createdAt || result.completedAt > updatedAt)) {
		throw new SubAgentPersistenceError("result.completedAt must fall within the child history interval");
	}
	const summary = statusSummary(snapshot);
	const removalReason = optionalText(snapshot.removalReason, SUB_AGENT_BOUNDS.errorChars, true);
	if (state !== "removed" && removalReason !== undefined) {
		throw new SubAgentPersistenceError("Only a removed history record may include removalReason");
	}
	const collected = collectFiles(snapshot as ManagedSubAgentSnapshot);
	const generation = requireOpaqueId(snapshot.generation, "generation");
	const id = requireOpaqueId(snapshot.id, "id");
	if (!id.startsWith(`sa1-${generation.slice("sag1-".length)}-`)) {
		throw new SubAgentPersistenceError("id is inconsistent with generation");
	}
	const history: PersistedSubAgentHistoryV1 = {
		version: SUB_AGENTS_STATE_VERSION,
		generation,
		id,
		name: requireText(snapshot.spec?.name, "name", SUB_AGENT_BOUNDS.nameChars, true),
		role: requireText(snapshot.spec?.role, "role", SUB_AGENT_BOUNDS.roleChars, true),
		objectiveSummary: requireText(
			snapshot.currentAssignment?.objective ?? snapshot.spec?.objective,
			"objectiveSummary",
			SUB_AGENT_BOUNDS.persistenceObjectiveChars,
			true,
		),
		state,
		...(summary ? { statusSummary: summary } : {}),
		...(result ? { result } : {}),
		...(snapshot.modelRoute ? { modelRoute: clonePersistedRoute(snapshot.modelRoute)! } : {}),
		usage: clonePersistedUsage(snapshot as ManagedSubAgentSnapshot),
		files: collected.files,
		omittedFileCount: collected.omittedFileCount,
		createdAt,
		updatedAt,
		...(removedAt !== undefined ? { removedAt } : {}),
		...(removalReason ? { removalReason } : {}),
	};

	while (
		history.files.length > 0 &&
		persistedSubAgentHistoryByteLength(history) > SUB_AGENT_BOUNDS.persistenceEntryBytes
	) {
		history.files.pop();
		history.omittedFileCount += 1;
	}
	if (persistedSubAgentHistoryByteLength(history) > SUB_AGENT_BOUNDS.persistenceEntryBytes) {
		throw new SubAgentPersistenceError(
			`Persisted sub-agent history exceeds ${SUB_AGENT_BOUNDS.persistenceEntryBytes} bytes`,
			"persisted_state_too_large",
		);
	}
	return history;
}

function requireStoredObject(
	value: unknown,
	field: string,
	required: readonly string[],
	optional: readonly string[] = [],
): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new SubAgentPersistenceError(`${field} must be an object`);
	}
	const object = value as Record<string, unknown>;
	const allowed = new Set([...required, ...optional]);
	for (const key of Object.keys(object)) {
		if (!allowed.has(key)) {
			throw new SubAgentPersistenceError(`${field} contains an unsupported property`);
		}
	}
	for (const key of required) {
		if (!Object.hasOwn(object, key)) {
			throw new SubAgentPersistenceError(`${field}.${key} is required`);
		}
	}
	return object;
}

function requireStoredText(value: unknown, field: string, maxChars: number): string {
	if (typeof value !== "string" || value.length < 1 || value.length > maxChars || !/\S/u.test(value)) {
		throw new SubAgentPersistenceError(`${field} is outside its supported bounds`);
	}
	return value;
}

function optionalStoredText(value: unknown, field: string, maxChars: number): string | undefined {
	return value === undefined ? undefined : requireStoredText(value, field, maxChars);
}

function requireStoredSafeInteger(value: unknown, field: string): number {
	if (!Number.isSafeInteger(value) || Number(value) < 0) {
		throw new SubAgentPersistenceError(`${field} must be a non-negative safe integer`);
	}
	return Number(value);
}

function requireStoredOpaqueId(value: unknown, field: "generation" | "id"): string {
	if (typeof value !== "string" || value.length > SUB_AGENT_BOUNDS.agentIdChars) {
		throw new SubAgentPersistenceError(`${field} is not a supported opaque identifier`);
	}
	const pattern = field === "generation" ? /^sag1-[A-Za-z0-9_-]+$/u : /^sa1-[A-Za-z0-9_-]+$/u;
	if (!pattern.test(value)) {
		throw new SubAgentPersistenceError(`${field} is not a supported opaque identifier`);
	}
	return value;
}

function parseStoredCounters(value: unknown, field: string): UsageCounters {
	const object = requireStoredObject(
		value,
		field,
		["input", "output", "cacheRead", "cacheWrite", "totalTokens", "cost"],
	);
	const counters: UsageCounters = {
		input: requireStoredSafeInteger(object.input, `${field}.input`),
		output: requireStoredSafeInteger(object.output, `${field}.output`),
		cacheRead: requireStoredSafeInteger(object.cacheRead, `${field}.cacheRead`),
		cacheWrite: requireStoredSafeInteger(object.cacheWrite, `${field}.cacheWrite`),
		totalTokens: requireStoredSafeInteger(object.totalTokens, `${field}.totalTokens`),
		cost: typeof object.cost === "number" ? object.cost : Number.NaN,
	};
	if (!Number.isFinite(counters.cost) || counters.cost < 0) {
		throw new SubAgentPersistenceError(`${field}.cost must be a finite non-negative number`);
	}
	return counters;
}

function parseStoredUsage(value: unknown): PersistedUsageLedgerV1 {
	const object = requireStoredObject(
		value,
		"usage",
		["totals", "reported", "unreported", "turns", "assignments"],
	);
	const totals = parseStoredCounters(object.totals, "usage.totals");
	const reported = parseStoredCounters(object.reported, "usage.reported");
	const unreported = parseStoredCounters(object.unreported, "usage.unreported");
	const fields = ["input", "output", "cacheRead", "cacheWrite", "totalTokens", "cost"] as const;
	for (const field of fields) {
		if (reported[field] > totals[field] || unreported[field] !== totals[field] - reported[field]) {
			throw new SubAgentPersistenceError("usage.unreported is inconsistent with totals and reported");
		}
	}
	return {
		totals,
		reported,
		unreported,
		turns: requireStoredSafeInteger(object.turns, "usage.turns"),
		assignments: requireStoredSafeInteger(object.assignments, "usage.assignments"),
	};
}

function parseStoredRoute(value: unknown): ModelRoute {
	const object = requireStoredObject(
		value,
		"modelRoute",
		[
			"requestedPolicy",
			"requestedComplexity",
			"selectedModel",
			"fallbackUsed",
			"fallbackPath",
			"reason",
		],
		["selectedTier"],
	);
	const selectedModel = requireStoredObject(
		object.selectedModel,
		"modelRoute.selectedModel",
		["provider", "id"],
	);
	requireStoredText(selectedModel.provider, "modelRoute.selectedModel.provider", 128);
	requireStoredText(selectedModel.id, "modelRoute.selectedModel.id", 256);
	if (typeof object.fallbackUsed !== "boolean") {
		throw new SubAgentPersistenceError("modelRoute.fallbackUsed must be a boolean");
	}
	if (
		!Array.isArray(object.fallbackPath) ||
		object.fallbackPath.length < 1 ||
		object.fallbackPath.length > SUB_AGENT_BOUNDS.modelRouteSteps
	) {
		throw new SubAgentPersistenceError("modelRoute.fallbackPath is outside its supported bounds");
	}
	for (let index = 0; index < object.fallbackPath.length; index += 1) {
		const step = requireStoredObject(
			object.fallbackPath[index],
			`modelRoute.fallbackPath[${index}]`,
			["source", "modelId", "outcome"],
			["complexity"],
		);
		requireStoredText(step.modelId, `modelRoute.fallbackPath[${index}].modelId`, 256);
	}
	requireStoredText(object.reason, "modelRoute.reason", SUB_AGENT_BOUNDS.modelRouteReasonChars);
	return clonePersistedRoute(object as unknown as ModelRoute)!;
}

/** Strictly parse and defensively clone one untrusted session custom-entry payload. */
export function parsePersistedSubAgentHistoryV1(value: unknown): PersistedSubAgentHistoryV1 {
	const object = requireStoredObject(
		value,
		"history",
		[
			"version",
			"generation",
			"id",
			"name",
			"role",
			"objectiveSummary",
			"state",
			"usage",
			"files",
			"omittedFileCount",
			"createdAt",
			"updatedAt",
		],
		["statusSummary", "result", "modelRoute", "removedAt", "removalReason"],
	);
	if (object.version !== SUB_AGENTS_STATE_VERSION) {
		throw new SubAgentPersistenceError("history.version is unsupported");
	}
	const generation = requireStoredOpaqueId(object.generation, "generation");
	const id = requireStoredOpaqueId(object.id, "id");
	if (!id.startsWith(`sa1-${generation.slice("sag1-".length)}-`)) {
		throw new SubAgentPersistenceError("history.id is inconsistent with history.generation");
	}
	const state = requireChoice(object.state, TERMINAL_HISTORY_STATES, "state");
	const createdAt = requireStoredSafeInteger(object.createdAt, "createdAt");
	const updatedAt = requireStoredSafeInteger(object.updatedAt, "updatedAt");
	if (updatedAt < createdAt) {
		throw new SubAgentPersistenceError("updatedAt cannot precede createdAt");
	}
	const removedAt = object.removedAt === undefined
		? undefined
		: requireStoredSafeInteger(object.removedAt, "removedAt");
	if ((state === "removed") !== (removedAt !== undefined)) {
		throw new SubAgentPersistenceError("Only removed history requires removedAt");
	}
	if (removedAt !== undefined && (removedAt < createdAt || removedAt > updatedAt)) {
		throw new SubAgentPersistenceError("removedAt must fall within the history interval");
	}
	const removalReason = optionalStoredText(
		object.removalReason,
		"removalReason",
		SUB_AGENT_BOUNDS.errorChars,
	);
	if (state !== "removed" && removalReason !== undefined) {
		throw new SubAgentPersistenceError("Only removed history may include removalReason");
	}

	let result: PersistedSubAgentHistoryV1["result"];
	if (object.result !== undefined) {
		const storedResult = requireStoredObject(
			object.result,
			"result",
			["summary", "completedAt"],
			["details"],
		);
		result = {
			summary: requireStoredText(
				storedResult.summary,
				"result.summary",
				SUB_AGENT_BOUNDS.persistenceResultSummaryChars,
			),
			...(storedResult.details === undefined
				? {}
				: {
						details: requireStoredText(
							storedResult.details,
							"result.details",
							SUB_AGENT_BOUNDS.persistenceResultDetailsChars,
						),
					}),
			completedAt: requireStoredSafeInteger(storedResult.completedAt, "result.completedAt"),
		};
		if (result.completedAt < createdAt || result.completedAt > updatedAt) {
			throw new SubAgentPersistenceError("result.completedAt must fall within the history interval");
		}
	}

	if (!Array.isArray(object.files) || object.files.length > SUB_AGENT_BOUNDS.reportFiles) {
		throw new SubAgentPersistenceError("history.files is outside its supported bounds");
	}
	const files = object.files.map((file, index) =>
		requireStoredText(file, `files[${index}]`, SUB_AGENT_BOUNDS.contextPathChars),
	);
	if (new Set(files).size !== files.length) {
		throw new SubAgentPersistenceError("history.files must be unique");
	}
	const history: PersistedSubAgentHistoryV1 = {
		version: SUB_AGENTS_STATE_VERSION,
		generation,
		id,
		name: requireStoredText(object.name, "name", SUB_AGENT_BOUNDS.nameChars),
		role: requireStoredText(object.role, "role", SUB_AGENT_BOUNDS.roleChars),
		objectiveSummary: requireStoredText(
			object.objectiveSummary,
			"objectiveSummary",
			SUB_AGENT_BOUNDS.persistenceObjectiveChars,
		),
		state,
		...(object.statusSummary === undefined
			? {}
			: {
					statusSummary: requireStoredText(
						object.statusSummary,
						"statusSummary",
						SUB_AGENT_BOUNDS.persistenceStatusSummaryChars,
					),
				}),
		...(result ? { result } : {}),
		...(object.modelRoute === undefined ? {} : { modelRoute: parseStoredRoute(object.modelRoute) }),
		usage: parseStoredUsage(object.usage),
		files,
		omittedFileCount: requireStoredSafeInteger(object.omittedFileCount, "omittedFileCount"),
		createdAt,
		updatedAt,
		...(removedAt === undefined ? {} : { removedAt }),
		...(removalReason === undefined ? {} : { removalReason }),
	};
	if (persistedSubAgentHistoryByteLength(history) > SUB_AGENT_BOUNDS.persistenceEntryBytes) {
		throw new SubAgentPersistenceError(
			`Persisted sub-agent history exceeds ${SUB_AGENT_BOUNDS.persistenceEntryBytes} bytes`,
			"persisted_state_too_large",
		);
	}
	return history;
}

export interface SubAgentHistoryRestorationResult {
	histories: PersistedSubAgentHistoryV1[];
	matchingEntries: number;
	invalidEntries: number;
	duplicateEntries: number;
	omittedCheckpointEntries: number;
	truncated: boolean;
}

/**
 * Reduce only the supplied active branch, newest first, to one latest valid
 * checkpoint per opaque child ID. A malformed latest record with a recognizable
 * ID suppresses older records for that ID rather than reviving stale history.
 */
export function reconstructSubAgentHistoryFromBranch(
	entries: readonly SessionEntry[],
	maxHistories = SUB_AGENT_BOUNDS.historicalAgents,
): SubAgentHistoryRestorationResult {
	const limit = Number.isSafeInteger(maxHistories) && maxHistories > 0
		? Math.min(maxHistories, SUB_AGENT_BOUNDS.historicalAgents)
		: SUB_AGENT_BOUNDS.historicalAgents;
	const histories: PersistedSubAgentHistoryV1[] = [];
	const seenIds = new Set<string>();
	let matchingEntries = 0;
	let invalidEntries = 0;
	let duplicateEntries = 0;
	let omittedCheckpointEntries = 0;
	let truncated = false;

	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry?.type !== "custom" || entry.customType !== SUB_AGENTS_STATE_CUSTOM_TYPE) continue;
		matchingEntries += 1;
		if (histories.length === limit) {
			truncated = true;
			omittedCheckpointEntries += 1;
			for (let older = index - 1; older >= 0; older -= 1) {
				const olderEntry = entries[older];
				if (olderEntry?.type === "custom" && olderEntry.customType === SUB_AGENTS_STATE_CUSTOM_TYPE) {
					matchingEntries += 1;
					omittedCheckpointEntries += 1;
				}
			}
			break;
		}
		const candidateId =
			entry.data && typeof entry.data === "object" && !Array.isArray(entry.data)
				? (entry.data as { id?: unknown }).id
				: undefined;
		if (typeof candidateId !== "string" || !/^sa1-[A-Za-z0-9_-]+$/u.test(candidateId)) {
			invalidEntries += 1;
			continue;
		}
		if (seenIds.has(candidateId)) {
			duplicateEntries += 1;
			continue;
		}
		seenIds.add(candidateId);
		try {
			histories.push(parsePersistedSubAgentHistoryV1(entry.data));
		} catch {
			invalidEntries += 1;
		}
	}
	return {
		histories,
		matchingEntries,
		invalidEntries,
		duplicateEntries,
		omittedCheckpointEntries,
		truncated,
	};
}

export interface SubAgentPersistenceManager {
	readonly generation: string;
	subscribeEvents(listener: (event: SubAgentManagerEvent) => void): () => void;
	getAgent(id: string): ManagedSubAgentSnapshot;
	listAgents(options?: { includeRemoved?: boolean }): ManagedSubAgentSnapshot[];
}

export type SubAgentHistoryAppender = (
	customType: typeof SUB_AGENTS_STATE_CUSTOM_TYPE,
	data: PersistedSubAgentHistoryV1,
) => void;

export interface SubAgentCheckpointBatchResult {
	appended: number;
	duplicates: number;
	ignored: number;
	failed: number;
}

export interface SubAgentPersistenceRuntimeOptions {
	manager: SubAgentPersistenceManager;
	appendEntry: SubAgentHistoryAppender;
}

type CheckpointOutcome = "appended" | "duplicate" | "ignored" | "failed";

/**
 * Session-generation bridge from explicit authoritative manager boundaries to
 * branch-local Pi custom entries. Streaming/runtime change markers never enter
 * this path. Append failures are contained and remain retryable at a later bulk
 * lifecycle checkpoint.
 */
export class SubAgentPersistenceRuntime {
	readonly manager: SubAgentPersistenceManager;

	#appendEntry: SubAgentHistoryAppender;
	#lastFingerprintById = new Map<string, string>();
	#unsubscribe: () => void;
	#closed = false;

	constructor(options: SubAgentPersistenceRuntimeOptions) {
		if (!options?.manager || typeof options.manager.subscribeEvents !== "function") {
			throw new SubAgentPersistenceError("A persistence manager event source is required");
		}
		if (typeof options.appendEntry !== "function") {
			throw new SubAgentPersistenceError("A persistence custom-entry appender is required");
		}
		this.manager = options.manager;
		this.#appendEntry = options.appendEntry;
		this.#unsubscribe = this.manager.subscribeEvents((event) => {
			if (
				this.#closed ||
				event.generation !== this.manager.generation ||
				event.historicalCheckpoint !== true
			) {
				return;
			}
			this.checkpointAgent(event.id);
		});
	}

	get closed(): boolean {
		return this.#closed;
	}

	checkpointAgent(id: string): CheckpointOutcome {
		if (this.#closed) return "ignored";
		let snapshot: ManagedSubAgentSnapshot;
		try {
			snapshot = this.manager.getAgent(id);
		} catch {
			return "failed";
		}
		return this.#checkpointSnapshot(snapshot);
	}

	/** Checkpoint every currently reducible record after generation cleanup. */
	checkpointAll(): SubAgentCheckpointBatchResult {
		const result: SubAgentCheckpointBatchResult = {
			appended: 0,
			duplicates: 0,
			ignored: 0,
			failed: 0,
		};
		if (this.#closed) return result;

		let snapshots: ManagedSubAgentSnapshot[];
		try {
			snapshots = this.manager.listAgents({ includeRemoved: true });
		} catch {
			result.failed += 1;
			return result;
		}
		for (const snapshot of snapshots) {
			const outcome = this.#checkpointSnapshot(snapshot);
			if (outcome === "appended") result.appended += 1;
			else if (outcome === "duplicate") result.duplicates += 1;
			else if (outcome === "ignored") result.ignored += 1;
			else result.failed += 1;
		}
		return result;
	}

	shutdown(): void {
		if (this.#closed) return;
		this.#closed = true;
		try {
			this.#unsubscribe();
		} catch {
			// Persistence cleanup must not alter authoritative manager shutdown.
		}
		this.#lastFingerprintById.clear();
	}

	#checkpointSnapshot(snapshot: ManagedSubAgentSnapshot): CheckpointOutcome {
		if (
			snapshot.generation !== this.manager.generation ||
			!TERMINAL_HISTORY_STATES.has(snapshot.state as PersistedSubAgentStateV1)
		) {
			return "ignored";
		}

		let history: PersistedSubAgentHistoryV1;
		let fingerprint: string;
		try {
			history = createPersistedSubAgentHistoryV1(snapshot);
			const { updatedAt: _updatedAt, ...semanticHistory } = history;
			fingerprint = JSON.stringify(semanticHistory);
		} catch {
			return "failed";
		}
		if (this.#lastFingerprintById.get(history.id) === fingerprint) return "duplicate";

		try {
			this.#appendEntry(SUB_AGENTS_STATE_CUSTOM_TYPE, history);
		} catch {
			return "failed";
		}
		this.#lastFingerprintById.set(history.id, fingerprint);
		return "appended";
	}
}

export function createSubAgentPersistenceRuntime(
	options: SubAgentPersistenceRuntimeOptions,
): SubAgentPersistenceRuntime {
	return new SubAgentPersistenceRuntime(options);
}
