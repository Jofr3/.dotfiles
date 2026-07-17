import { Buffer } from "node:buffer";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { canonicalizeProjectScope, sameProjectScope, type ProjectScope } from "./project-scope.ts";
import { parseDatabaseProfile, type DatabaseProfile } from "./profile.ts";
import { DatabaseProfileResolverConsumer, type ProfileResolverDependencies } from "./profile-resolver.ts";
import { DATABASE_PROFILE_NAME_PATTERN, DATABASE_REQUIREMENT_ID_PATTERN } from "./protocol.ts";
import { DatabaseRequirementStore } from "./requirements.ts";
import { formatDatabaseOutput } from "./output.ts";
import {
	type DatabaseRunFailureCode,
	type DatabaseRunner,
	type DatabaseRunResult,
	SpawnDatabaseRunner,
} from "./runner.ts";
import { classifySql, type SqlSafetyDecision } from "./sql-safety.ts";
import { loadProtectedStaticDatabaseProfile } from "./static-config.ts";

export interface DatabaseExtensionDependencies {
	readonly canonicalizeProject?: (cwd: unknown) => ProjectScope;
	readonly loadStaticProfile?: (scope: ProjectScope) => DatabaseProfile;
	readonly runner?: DatabaseRunner;
	readonly profileResolver?: DatabaseProfileResolverConsumer;
	readonly profileResolverDependencies?: ProfileResolverDependencies;
}

class DatabasePublicError extends Error {
	constructor(code: string, effectsUnknown = false) {
		super(`Database query failed (${code}).${effectsUnknown ? " The database effects may be unknown." : ""}`);
		this.name = "DatabaseQueryError";
	}
}

function inputData(value: unknown): { query: string; profileId?: string } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new DatabasePublicError("invalid_input");
	let descriptors: Record<string, PropertyDescriptor>;
	try {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) throw new DatabasePublicError("invalid_input");
		descriptors = Object.getOwnPropertyDescriptors(value);
		for (const key of Reflect.ownKeys(descriptors)) {
			if (typeof key !== "string" || (key !== "query" && key !== "profileId")) throw new DatabasePublicError("invalid_input");
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new DatabasePublicError("invalid_input");
		}
	} catch (error) {
		if (error instanceof DatabasePublicError) throw error;
		throw new DatabasePublicError("invalid_input");
	}
	const query = descriptors.query && "value" in descriptors.query ? descriptors.query.value : undefined;
	const profileId = descriptors.profileId && "value" in descriptors.profileId ? descriptors.profileId.value : undefined;
	if (typeof query !== "string") throw new DatabasePublicError("invalid_input");
	if (profileId !== undefined && (typeof profileId !== "string" || !DATABASE_REQUIREMENT_ID_PATTERN.test(profileId))) {
		throw new DatabasePublicError("invalid_input");
	}
	return { query, ...(profileId === undefined ? {} : { profileId }) };
}

function signalAborted(signal: AbortSignal | undefined): boolean {
	if (signal === undefined) return false;
	try { return signal.aborted === true; } catch { return true; }
}

function conservativeDynamicDecision(query: string): SqlSafetyDecision {
	const mysql = classifySql(query, "mysql");
	const sqlserver = classifySql(query, "sqlserver");
	return Object.freeze({
		requiresConfirmation: mysql.requiresConfirmation || sqlserver.requiresConfirmation,
		classification: mysql.classification === sqlserver.classification ? mysql.classification : "unknown",
		statementCount: Math.max(mysql.statementCount, sqlserver.statementCount),
		queryHash: mysql.queryHash,
		preview: mysql.preview,
	});
}

async function confirmSql(
	ctx: {
		hasUI: boolean;
		ui: { confirm(title: string, message: string, options: { timeout: number; signal: AbortSignal }): Promise<boolean> };
	},
	signal: AbortSignal | undefined,
	decision: SqlSafetyDecision,
	scope: ProjectScope,
	profileName: string,
	requirementId?: string,
): Promise<void> {
	if (!decision.requiresConfirmation) return;
	if (ctx.hasUI !== true || signalAborted(signal)) throw new DatabasePublicError("confirmation_required");
	const controller = new AbortController();
	const onAbort = (): void => { try { controller.abort("database-query-cancelled"); } catch { /* Deny below. */ } };
	if (signal !== undefined) {
		try { signal.addEventListener("abort", onAbort, { once: true }); } catch { onAbort(); }
	}
	let approved = false;
	try {
		approved = await ctx.ui.confirm(
			"Approve confirmation-required SQL",
			[
				"Approve this database operation?",
				"",
				`Project: ${scope.projectPath}`,
				`Project scope: ${scope.projectScopeId}`,
				`Profile: ${profileName}`,
				...(requirementId === undefined ? [] : [`One-shot requirement: ${requirementId}`]),
				`Classification: ${decision.classification}`,
				`Statements: ${decision.statementCount}`,
				`SQL SHA-256: ${decision.queryHash}`,
				`Preview: ${decision.preview}`,
				"",
				"Approval covers this SQL invocation only. Cancellation, timeout, or a later failure does not imply rollback; effects may be unknown.",
			].join("\n"),
			{ timeout: 30_000, signal: controller.signal },
		);
	} catch { approved = false; }
	finally {
		if (signal !== undefined) {
			try { signal.removeEventListener("abort", onAbort); } catch { /* Deny remains authoritative. */ }
		}
	}
	if (approved !== true || signalAborted(signal)) throw new DatabasePublicError("confirmation_denied");
}

function failedAgentMessage(message: unknown): boolean {
	if (typeof message !== "object" || message === null) return false;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(message, "stopReason");
		const reason = descriptor && "value" in descriptor ? descriptor.value : undefined;
		return reason === "error" || reason === "aborted";
	} catch { return true; }
}

function agentWillRetry(event: unknown): boolean {
	if (typeof event !== "object" || event === null) return false;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(event, "willRetry");
		return Boolean(descriptor && "value" in descriptor && descriptor.value === true);
	} catch { return true; }
}

function failedToolResult(result: unknown): boolean {
	if (typeof result !== "object" || result === null) return true;
	try {
		const isError = Object.getOwnPropertyDescriptor(result, "isError");
		if (isError && "value" in isError && isError.value === true) return true;
		const details = Object.getOwnPropertyDescriptor(result, "details");
		if (!details || !("value" in details) || typeof details.value !== "object" || details.value === null) return false;
		const ok = Object.getOwnPropertyDescriptor(details.value, "ok");
		return Boolean(ok && "value" in ok && ok.value === false);
	} catch { return true; }
}

const RUN_FAILURE_CODES = new Set<DatabaseRunFailureCode>([
	"aborted", "client_error", "client_unavailable", "output_limit", "timeout",
]);

/** Admit only the fixed, data-only runner result shape so injected errors/codes cannot escape. */
function validatedRunResult(value: unknown): DatabaseRunResult {
	if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.isFrozen(value)) {
		throw new DatabasePublicError("client_error");
	}
	try {
		if (Object.getPrototypeOf(value) !== Object.prototype) throw new DatabasePublicError("client_error");
		const descriptors = Object.getOwnPropertyDescriptors(value);
		const ok = descriptors.ok;
		if (!ok || !("value" in ok) || !ok.enumerable) throw new DatabasePublicError("client_error");
		const expected = ok.value === true ? ["ok", "stdout", "elapsedMs"] : ["ok", "code", "elapsedMs"];
		if ((ok.value !== true && ok.value !== false) || Reflect.ownKeys(descriptors).length !== expected.length) {
			throw new DatabasePublicError("client_error");
		}
		for (const key of expected) {
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
				throw new DatabasePublicError("client_error");
			}
		}
		const elapsed = descriptors.elapsedMs!.value;
		if (!Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed > 600_000) {
			throw new DatabasePublicError("client_error");
		}
		if (ok.value === true) {
			if (!Buffer.isBuffer(descriptors.stdout!.value)) throw new DatabasePublicError("client_error");
		} else if (typeof descriptors.code!.value !== "string" || !RUN_FAILURE_CODES.has(descriptors.code!.value)) {
			throw new DatabasePublicError("client_error");
		}
		return value as DatabaseRunResult;
	} catch (error) {
		if (error instanceof DatabasePublicError) throw error;
		throw new DatabasePublicError("client_error");
	}
}

export function registerDatabaseExtension(
	pi: ExtensionAPI,
	dependencies: DatabaseExtensionDependencies = {},
): void {
	const canonicalize = dependencies.canonicalizeProject ?? canonicalizeProjectScope;
	const loadStatic = dependencies.loadStaticProfile ?? loadProtectedStaticDatabaseProfile;
	const runner = dependencies.runner ?? new SpawnDatabaseRunner();
	const requirements = new DatabaseRequirementStore(pi.events);
	const profileResolver = dependencies.profileResolver ?? new DatabaseProfileResolverConsumer(
		pi.events,
		dependencies.profileResolverDependencies,
	);
	let closed = false;
	const invalidate = (): void => {
		if (closed) return;
		try { requirements.invalidateAll(); } catch { /* Local invalidation happened before event delivery. */ }
		profileResolver.invalidate();
	};

	pi.registerTool({
		name: "database_profile_requirements",
		label: "Prepare Database Profile",
		description:
			"Prepare one versioned, project-scoped database connection-profile requirement. Returns only nonsecret canonical project/profile metadata and an opaque profileId. It does not inspect project credentials, contact 1Password, select an item by title, or authorize access. After this result, discover 1Password metadata and request onepassword_grant_database_profile approval for the exact profileId.",
		promptSnippet: "Prepare an opaque project-scoped profile requirement for direct database_query",
		promptGuidelines: [
			"For a 1Password-backed database_query, first enable dynamic 1Password selection, then call database_profile_requirements with a short nonsecret profileName and wait for its result.",
			"After database_profile_requirements, discover vault/item/field metadata sequentially; item titles are hints only. Call onepassword_grant_database_profile with exact emitted handles and profileId, wait for approval, then call database_query with that profileId only in a later turn.",
		],
		executionMode: "sequential",
		parameters: Type.Object({
			profileName: Type.String({
				description: "Nonsecret display/scope label such as primary, reporting, or staging; not an item lookup or authorization key",
				pattern: "^[a-z][a-z0-9._-]{0,63}$",
				minLength: 1,
				maxLength: 64,
			}),
		}, { additionalProperties: false }),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (closed || signalAborted(signal) || !DATABASE_PROFILE_NAME_PATTERN.test(params.profileName)) {
				throw new DatabasePublicError("preparation_failed");
			}
			let scope: ProjectScope;
			try { scope = canonicalize(ctx.cwd); }
			catch { throw new DatabasePublicError("project_scope"); }
			let requirement;
			try { requirement = requirements.prepare(scope, params.profileName); }
			catch { throw new DatabasePublicError("preparation_failed"); }
			const payload = Object.freeze({
				protocol: "pi.database.profile-requirements/v1",
				profileId: requirement.requirementId,
				projectScopeId: requirement.projectScopeId,
				projectPath: requirement.projectPath,
				profileName: requirement.profileName,
				consumer: requirement.consumer,
				tool: requirement.tool,
				purpose: requirement.purpose,
				profileRole: requirement.profileRole,
				contract: requirement.contract,
			});
			return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], details: payload };
		},
	});

	pi.registerTool({
		name: "database_query",
		label: "Database Query",
		description:
			"Execute bounded SQL using either an exact approved one-shot 1Password profileId or the protected legacy project database file. The 1Password profile is one atomic pi.database.connection-profile/v1 JSON field, resolves only in memory, and is consumed on the first admitted later attempt even if resolution, parsing, connection, SQL, cancellation, or timeout fails. Supports MySQL/MariaDB and SQL Server/MSSQL. There is no database override. SQL and passwords are never put in argv; output is bounded and never persisted to a temp file.",
		promptSnippet: "Execute bounded SQL with an approved one-shot profileId or protected legacy project profile",
		promptGuidelines: [
			"Use database_query for project database work. For dynamic 1Password use, provide only query and the exact profileId returned by database_profile_requirements; never put a credential, connection URL, op:// reference, host, password, or profile JSON in arguments.",
			"database_query requires a newly approved profileId for every dynamic attempt or retry. Never call database_query in the same tool turn as onepassword_grant_database_profile.",
			"database_query skips confirmation only for a single plain SELECT-like statement with no function-call, sequence, variable/assignment, output, locking/table-hint, or nested stateful syntax. Function-bearing SELECTs and all mutation, DDL, administrative, unknown, and multi-statement SQL require confirmation and fail closed when approval UI is unavailable.",
		],
		executionMode: "sequential",
		parameters: Type.Object({
			query: Type.String({ description: "SQL query (maximum 64 KiB)" }),
			profileId: Type.Optional(Type.String({
				description: "Exact opaque one-shot profileId returned by database_profile_requirements",
				pattern: "^dbp1-P-[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$",
				minLength: 50,
				maxLength: 50,
			})),
		}, { additionalProperties: false }),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			if (closed) throw new DatabasePublicError("lifecycle");
			const input = inputData(params);
			if (signalAborted(signal)) throw new DatabasePublicError("aborted");
			let scope: ProjectScope;
			try { scope = canonicalize(ctx.cwd); }
			catch { throw new DatabasePublicError("project_scope"); }
			let profile: DatabaseProfile;
			let profileText: string | undefined;
			let admittedRequirement: ReturnType<DatabaseRequirementStore["admit"]> | undefined;
			let decision: SqlSafetyDecision;
			let profileName = "legacy-static";
			try {
				if (input.profileId !== undefined) {
					try { decision = conservativeDynamicDecision(input.query); }
					catch { throw new DatabasePublicError("sql_rejected"); }
					let pending: ReturnType<DatabaseRequirementStore["inspect"]>;
					try { pending = requirements.inspect(input.profileId, scope); }
					catch { throw new DatabasePublicError("profile_not_current"); }
					profileName = pending.profileName;
					// Reserve the exact one-shot requirement before any awaited approval.
					// Denial, cancellation, timeout, or UI failure therefore burns it and
					// the finally block revokes the matching provider-side grant.
					try { admittedRequirement = requirements.admit(input.profileId, scope); }
					catch { throw new DatabasePublicError("profile_not_current"); }
					await confirmSql(ctx, signal, decision, scope, profileName, pending.requirementId);
					if (signalAborted(signal)) throw new DatabasePublicError("aborted");
					try { profileText = await profileResolver.resolve(admittedRequirement, signal); }
					catch { throw new DatabasePublicError("profile_resolution"); }
					try { profile = parseDatabaseProfile(profileText); }
					catch { throw new DatabasePublicError("profile_invalid"); }
					let rechecked: ProjectScope;
					try { rechecked = canonicalize(ctx.cwd); }
					catch { throw new DatabasePublicError("project_scope"); }
					if (!sameProjectScope(scope, rechecked)) throw new DatabasePublicError("project_scope_changed");
					try { decision = classifySql(input.query, profile.engine); }
					catch { throw new DatabasePublicError("sql_rejected"); }
				} else {
					let trusted = false;
					try { trusted = ctx.isProjectTrusted() === true; } catch { trusted = false; }
					if (!trusted) throw new DatabasePublicError("project_not_trusted");
					try { profile = loadStatic(scope); }
					catch { throw new DatabasePublicError("static_profile_unavailable"); }
					try { decision = classifySql(input.query, profile.engine); }
					catch { throw new DatabasePublicError("sql_rejected"); }
					await confirmSql(ctx, signal, decision, scope, profileName);
				}

				try {
					onUpdate?.({
						content: [{ type: "text" as const, text: "Running bounded database query..." }],
						details: { timeoutMs: 30_000 },
					});
				} catch { throw new DatabasePublicError("client_error"); }
				let run: DatabaseRunResult;
				try { run = validatedRunResult(await runner.run(profile, input.query, scope.projectPath, signal)); }
				catch { throw new DatabasePublicError("client_error", decision!.requiresConfirmation); }
				if (!run.ok) throw new DatabasePublicError(run.code, decision!.requiresConfirmation);
				let output;
				try { output = formatDatabaseOutput(run.stdout, profile, profileText); }
				catch { throw new DatabasePublicError("output_rejected", decision!.requiresConfirmation); }
				return {
					content: [{ type: "text" as const, text: output.text }],
					details: Object.freeze({
						success: true,
						profile: profileName,
						classification: decision!.classification,
						statementCount: decision!.statementCount,
						displayedRows: output.displayedRows,
						truncated: output.truncated,
						elapsedMs: run.elapsedMs,
					}),
				};
			} finally {
				profileText = undefined;
				if (admittedRequirement !== undefined) {
					try { requirements.finish(admittedRequirement); } catch { /* Grant was already consumed or denied. */ }
				}
			}
		},
	});

	pi.registerCommand("database", {
		description: "Run SQL with database_query; dynamic use requires a separately approved profileId",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				if (ctx.hasUI) ctx.ui.notify("Usage: /database <SQL query>", "warning");
				return;
			}
			pi.sendUserMessage(
				`Use database_query to run this SQL. If no protected legacy profile is available, prepare and obtain explicit 1Password database-profile approval first. Do not inspect or create credential files and do not use bash/raw-client fallbacks: ${args.trim()}`,
			);
		},
	});
	pi.registerCommand("database-profile-clear", {
		description: "Invalidate all prepared and approved in-memory database profiles",
		handler: async (_args, ctx) => {
			invalidate();
			if (ctx.hasUI) ctx.ui.notify("Database profile requirements and one-shot grants invalidated.", "info");
		},
	});

	pi.on("session_before_switch", () => { invalidate(); });
	pi.on("session_before_fork", () => { invalidate(); });
	pi.on("session_before_tree", () => { invalidate(); });
	pi.on("session_before_compact", () => { invalidate(); });
	pi.on("turn_end", (event) => {
		if (failedAgentMessage(event.message) || event.toolResults.some((result) => failedToolResult(result))) invalidate();
	});
	pi.on("agent_end", (event) => {
		if (event.messages.some((message) => failedAgentMessage(message)) || agentWillRetry(event)) invalidate();
	});
	pi.on("session_shutdown", () => {
		if (closed) return;
		try { requirements.shutdown(); } catch { /* Local state was synchronously cleared. */ }
		profileResolver.shutdown();
		closed = true;
	});
}
