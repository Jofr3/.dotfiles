import { randomBytes } from "node:crypto";
import type { ProjectScope } from "./project-scope.ts";
import {
	DATABASE_PREPARATION_ID_PATTERN,
	DATABASE_PROFILE_CONSUMER,
	DATABASE_PROFILE_CONTRACT,
	DATABASE_PROFILE_NAME_PATTERN,
	DATABASE_PROFILE_PURPOSE,
	DATABASE_PROFILE_ROLE,
	DATABASE_QUERY_TOOL,
	DATABASE_REQUIREMENTS_CHANNEL,
	DATABASE_REQUIREMENTS_PROTOCOL,
	DATABASE_REQUIREMENT_ID_PATTERN,
	deriveDatabaseRequirementId,
	type DatabaseEventBus,
	type DatabaseProfileRequirement,
} from "./protocol.ts";

export const MAX_DATABASE_REQUIREMENTS = 64;

interface RequirementRecord {
	readonly requirement: DatabaseProfileRequirement;
	readonly scopeKey: string;
	state: "current" | "admitted" | "invalid";
}

export class DatabaseRequirementError extends Error {
	constructor() { super("Database profile requirement is invalid or no longer current."); }
}

function profileScopeKey(projectScopeId: string, profileName: string): string {
	return `${projectScopeId}\u0000${profileName}`;
}

function replacementEvent(
	projectScopeId: string,
	profileName: string,
	requirements: readonly DatabaseProfileRequirement[],
): object {
	return Object.freeze({
		protocol: DATABASE_REQUIREMENTS_PROTOCOL,
		action: "replace" as const,
		projectScopeId,
		profileName,
		requirements: Object.freeze([...requirements]),
	});
}

export class DatabaseRequirementStore {
	readonly #bus: Pick<DatabaseEventBus, "emit">;
	readonly #random: (size: number) => Buffer;
	#closed = false;
	#records = new Map<string, RequirementRecord>();
	#scopes = new Map<string, RequirementRecord>();

	constructor(bus: Pick<DatabaseEventBus, "emit">, random: (size: number) => Buffer = randomBytes) {
		this.#bus = bus;
		this.#random = random;
	}

	prepare(scope: ProjectScope, profileName: unknown): DatabaseProfileRequirement {
		if (this.#closed || typeof profileName !== "string" || !DATABASE_PROFILE_NAME_PATTERN.test(profileName)) {
			throw new DatabaseRequirementError();
		}
		const key = profileScopeKey(scope.projectScopeId, profileName);
		const previous = this.#scopes.get(key);
		if (previous === undefined && this.#scopes.size >= MAX_DATABASE_REQUIREMENTS) throw new DatabaseRequirementError();
		if (previous !== undefined) {
			previous.state = "invalid";
			this.#records.delete(previous.requirement.requirementId);
			this.#scopes.delete(key);
		}
		let preparationId: string;
		try { preparationId = `dbn1-${this.#random(24).toString("base64url")}`; }
		catch { throw new DatabaseRequirementError(); }
		if (!DATABASE_PREPARATION_ID_PATTERN.test(preparationId)) throw new DatabaseRequirementError();
		const base = {
			preparationId,
			projectScopeId: scope.projectScopeId,
			consumer: DATABASE_PROFILE_CONSUMER,
			tool: DATABASE_QUERY_TOOL,
			purpose: DATABASE_PROFILE_PURPOSE,
			profileName,
			profileRole: DATABASE_PROFILE_ROLE,
			contract: DATABASE_PROFILE_CONTRACT,
		} as const;
		const requirementId = deriveDatabaseRequirementId(base);
		if (!DATABASE_REQUIREMENT_ID_PATTERN.test(requirementId)) throw new DatabaseRequirementError();
		const requirement: DatabaseProfileRequirement = Object.freeze({
			requirementId,
			preparationId,
			projectScopeId: scope.projectScopeId,
			projectPath: scope.projectPath,
			consumer: DATABASE_PROFILE_CONSUMER,
			tool: DATABASE_QUERY_TOOL,
			purpose: DATABASE_PROFILE_PURPOSE,
			profileName,
			profileRole: DATABASE_PROFILE_ROLE,
			contract: DATABASE_PROFILE_CONTRACT,
		});
		const record: RequirementRecord = { requirement, scopeKey: key, state: "current" };
		this.#records.set(requirementId, record);
		this.#scopes.set(key, record);
		this.#emit(replacementEvent(scope.projectScopeId, profileName, [requirement]));
		return requirement;
	}

	inspect(requirementId: unknown, scope: ProjectScope): DatabaseProfileRequirement {
		if (this.#closed || typeof requirementId !== "string" || !DATABASE_REQUIREMENT_ID_PATTERN.test(requirementId)) {
			throw new DatabaseRequirementError();
		}
		const record = this.#records.get(requirementId);
		if (
			record === undefined || record.state !== "current" ||
			record.requirement.projectScopeId !== scope.projectScopeId ||
			record.requirement.projectPath !== scope.projectPath ||
			this.#scopes.get(record.scopeKey) !== record
		) throw new DatabaseRequirementError();
		return record.requirement;
	}

	/** Atomically reserves the exact local requirement before any profile callback or database work. */
	admit(requirementId: unknown, scope: ProjectScope): DatabaseProfileRequirement {
		const requirement = this.inspect(requirementId, scope);
		const record = this.#records.get(requirement.requirementId)!;
		record.state = "admitted";
		this.#records.delete(requirement.requirementId);
		this.#scopes.delete(record.scopeKey);
		return record.requirement;
	}

	/** Remove provider-side metadata after an admitted attempt without invalidating a newer replacement. */
	finish(requirement: DatabaseProfileRequirement): void {
		if (this.#closed) return;
		const key = profileScopeKey(requirement.projectScopeId, requirement.profileName);
		if (this.#scopes.has(key)) return;
		this.#emit(replacementEvent(requirement.projectScopeId, requirement.profileName, []));
	}

	invalidateAll(): void {
		for (const record of this.#records.values()) record.state = "invalid";
		this.#records.clear();
		this.#scopes.clear();
		if (!this.#closed) this.#emit(Object.freeze({
			protocol: DATABASE_REQUIREMENTS_PROTOCOL,
			action: "invalidate" as const,
		}));
	}

	shutdown(): void {
		if (this.#closed) return;
		this.invalidateAll();
		this.#closed = true;
	}

	status(): Readonly<{ closed: boolean; requirementCount: number }> {
		return Object.freeze({ closed: this.#closed, requirementCount: this.#records.size });
	}

	#emit(event: object): void {
		try { this.#bus.emit(DATABASE_REQUIREMENTS_CHANNEL, event); }
		catch { throw new DatabaseRequirementError(); }
	}
}
