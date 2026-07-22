import type {
	AssignmentUsage,
	UsageCounters,
	UsageDelta,
	UsageLedger,
} from "./types.ts";

const COUNTER_FIELDS = Object.freeze([
	"input",
	"output",
	"cacheRead",
	"cacheWrite",
	"totalTokens",
	"cost",
] as const);

const TOKEN_COUNTER_FIELDS = new Set<keyof UsageCounters>([
	"input",
	"output",
	"cacheRead",
	"cacheWrite",
	"totalTokens",
]);

export class UsageLedgerError extends Error {
	readonly code = "invalid_usage" as const;

	constructor(message: string) {
		super(message);
		this.name = "UsageLedgerError";
	}
}

export function createUsageCounters(): UsageCounters {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: 0,
	};
}

export function cloneUsageCounters(counters: UsageCounters): UsageCounters {
	return { ...counters };
}

export function createAssignmentUsage(): AssignmentUsage {
	return {
		totals: createUsageCounters(),
		turns: 0,
	};
}

export function cloneAssignmentUsage(usage: AssignmentUsage): AssignmentUsage {
	return {
		totals: cloneUsageCounters(usage.totals),
		turns: usage.turns,
	};
}

export function createUsageLedger(): UsageLedger {
	return {
		totals: createUsageCounters(),
		reported: createUsageCounters(),
		turns: 0,
		assignments: 0,
	};
}

export function cloneUsageLedger(ledger: UsageLedger): UsageLedger {
	return {
		totals: cloneUsageCounters(ledger.totals),
		reported: cloneUsageCounters(ledger.reported),
		turns: ledger.turns,
		assignments: ledger.assignments,
	};
}

export function beginUsageAssignment(ledger: UsageLedger): UsageLedger {
	const assignments = checkedIntegerSum(ledger.assignments, 1, "usage.assignments");
	return {
		...cloneUsageLedger(ledger),
		assignments,
	};
}

export function applyUsageDelta(
	ledger: UsageLedger,
	assignment: AssignmentUsage,
	delta: UsageDelta,
): { ledger: UsageLedger; assignment: AssignmentUsage } {
	const normalized = normalizeUsageDelta(delta);
	const nextTotals = addCounters(ledger.totals, normalized, "usage.totals");
	const nextAssignmentTotals = addCounters(
		assignment.totals,
		normalized,
		"assignment.usage.totals",
	);
	const turns = checkedIntegerSum(ledger.turns, normalized.turns, "usage.turns");
	const assignmentTurns = checkedIntegerSum(
		assignment.turns,
		normalized.turns,
		"assignment.usage.turns",
	);

	return {
		ledger: {
			totals: nextTotals,
			reported: cloneUsageCounters(ledger.reported),
			turns,
			assignments: ledger.assignments,
		},
		assignment: {
			totals: nextAssignmentTotals,
			turns: assignmentTurns,
		},
	};
}

export function getUnreportedUsage(ledger: UsageLedger): UsageCounters {
	const delta = createUsageCounters();
	for (const field of COUNTER_FIELDS) {
		const total = requireCounter(ledger.totals[field], `usage.totals.${field}`, field);
		const reported = requireCounter(ledger.reported[field], `usage.reported.${field}`, field);
		if (reported > total) {
			throw new UsageLedgerError(`usage.reported.${field} cannot exceed usage.totals.${field}`);
		}
		delta[field] = total - reported;
	}
	return delta;
}

export function hasUnreportedUsage(ledger: UsageLedger): boolean {
	const delta = getUnreportedUsage(ledger);
	return COUNTER_FIELDS.some((field) => delta[field] > 0);
}

export function drainUsageLedger(
	ledger: UsageLedger,
): { ledger: UsageLedger; delta: UsageCounters } {
	const delta = getUnreportedUsage(ledger);
	return {
		ledger: {
			totals: cloneUsageCounters(ledger.totals),
			reported: cloneUsageCounters(ledger.totals),
			turns: ledger.turns,
			assignments: ledger.assignments,
		},
		delta,
	};
}

function normalizeUsageDelta(delta: UsageDelta): UsageCounters & { turns: number } {
	if (!delta || typeof delta !== "object" || Array.isArray(delta)) {
		throw new UsageLedgerError("A usage delta object is required");
	}
	const normalized = createUsageCounters() as UsageCounters & { turns: number };
	for (const field of COUNTER_FIELDS) {
		normalized[field] = requireCounter(delta[field] ?? 0, `usage.${field}`, field);
	}
	normalized.turns = requireNonNegativeInteger(delta.turns ?? 0, "usage.turns");
	return normalized;
}

function addCounters(
	current: UsageCounters,
	delta: UsageCounters,
	fieldPrefix: string,
): UsageCounters {
	const next = createUsageCounters();
	for (const field of COUNTER_FIELDS) {
		const currentValue = requireCounter(current[field], `${fieldPrefix}.${field}`, field);
		const value = currentValue + delta[field];
		if (!Number.isFinite(value) || (TOKEN_COUNTER_FIELDS.has(field) && !Number.isSafeInteger(value))) {
			throw new UsageLedgerError(`${fieldPrefix}.${field} exceeds its supported range`);
		}
		next[field] = value;
	}
	return next;
}

function requireCounter(
	value: number,
	field: string,
	counter: keyof UsageCounters,
): number {
	if (!Number.isFinite(value) || value < 0) {
		throw new UsageLedgerError(`${field} must be a finite non-negative number`);
	}
	if (TOKEN_COUNTER_FIELDS.has(counter) && !Number.isSafeInteger(value)) {
		throw new UsageLedgerError(`${field} must be a non-negative safe integer`);
	}
	return value;
}

function requireNonNegativeInteger(value: number, field: string): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new UsageLedgerError(`${field} must be a non-negative safe integer`);
	}
	return value;
}

function checkedIntegerSum(current: number, delta: number, field: string): number {
	const left = requireNonNegativeInteger(current, field);
	const right = requireNonNegativeInteger(delta, field);
	const total = left + right;
	if (!Number.isSafeInteger(total)) {
		throw new UsageLedgerError(`${field} exceeds its supported range`);
	}
	return total;
}
