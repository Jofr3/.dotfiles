import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelRuntime, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ComplexityTier, ExplicitModelRef } from "./types.ts";

const MAX_CANDIDATES = 20;
const MAX_PROVIDER_CHARS = 128;
const MAX_MODEL_ID_CHARS = 256;

export const SUB_AGENT_TIER_MODEL_IDS: Readonly<Record<ComplexityTier, string>> = Object.freeze({
	simple: "gpt-5.6-luna",
	moderate: "gpt-5.6-terra",
	complex: "gpt-5.6-sol",
});

export type ChildModelRuntimeErrorCode =
	| "runtime_closed"
	| "runtime_initialization_failed"
	| "host_registry_failed"
	| "provider_mirror_failed"
	| "invalid_model_reference"
	| "missing_inherited_model"
	| "missing_model"
	| "model_unavailable"
	| "model_ambiguous"
	| "exact_model_id_required"
	| "availability_check_failed";

export class ChildModelRuntimeError extends Error {
	readonly code: ChildModelRuntimeErrorCode;
	readonly candidates: readonly ExplicitModelRef[];

	constructor(code: ChildModelRuntimeErrorCode, message: string, candidates: readonly ExplicitModelRef[] = []) {
		super(message);
		this.name = "ChildModelRuntimeError";
		this.code = code;
		this.candidates = Object.freeze(candidates.slice(0, MAX_CANDIDATES).map((candidate) => Object.freeze({ ...candidate })));
	}
}

export type HostModelRegistryView = Pick<
	ModelRegistry,
	"getRegisteredProviderIds" | "getRegisteredNativeProvider" | "getRegisteredProviderConfig"
>;

export interface ChildModelRuntimeAdapterOptions {
	createRuntime?: () => ModelRuntime | Promise<ModelRuntime>;
}

export interface ResolvedChildModel {
	readonly runtime: ModelRuntime;
	readonly model: Model<Api>;
	readonly ref: ExplicitModelRef;
}

export interface ChildModelRuntimeSnapshot {
	initialized: boolean;
	closed: boolean;
	mirroredProviders: string[];
	mirroredModels: ExplicitModelRef[];
}

function boundedIdentityPart(value: unknown, field: string, maxChars: number): string {
	if (typeof value !== "string") {
		throw new ChildModelRuntimeError("invalid_model_reference", `${field} must be a string`);
	}
	const normalized = value.trim();
	if (!normalized || normalized.length > maxChars) {
		throw new ChildModelRuntimeError(
			"invalid_model_reference",
			`${field} must contain between 1 and ${maxChars} characters`,
		);
	}
	return normalized;
}

function normalizeModelRef(ref: ExplicitModelRef): ExplicitModelRef {
	if (!ref || typeof ref !== "object") {
		throw new ChildModelRuntimeError("invalid_model_reference", "A provider and model id are required");
	}
	return {
		provider: boundedIdentityPart(ref.provider, "model.provider", MAX_PROVIDER_CHARS),
		id: boundedIdentityPart(ref.id, "model.id", MAX_MODEL_ID_CHARS),
	};
}

function modelRef(model: Pick<Model<Api>, "provider" | "id">): ExplicitModelRef {
	return { provider: model.provider, id: model.id };
}

function sortAndBoundCandidates(candidates: readonly ExplicitModelRef[]): ExplicitModelRef[] {
	const unique = new Map<string, ExplicitModelRef>();
	for (const candidate of candidates) {
		const provider = String(candidate.provider ?? "").trim().slice(0, MAX_PROVIDER_CHARS);
		const id = String(candidate.id ?? "").trim().slice(0, MAX_MODEL_ID_CHARS);
		if (!provider || !id) continue;
		const ref = { provider, id };
		unique.set(`${ref.provider}\u0000${ref.id}`, ref);
	}
	return [...unique.values()]
		.sort((left, right) => `${left.provider}/${left.id}`.localeCompare(`${right.provider}/${right.id}`))
		.slice(0, MAX_CANDIDATES);
}

function candidateSuffix(candidates: readonly ExplicitModelRef[]): string {
	if (candidates.length === 0) return "";
	return ` Candidates: ${candidates.map((candidate) => `${candidate.provider}/${candidate.id}`).join(", ")}`;
}

function normalizeDisplayName(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function resolved(runtime: ModelRuntime, model: Model<Api>): ResolvedChildModel {
	return Object.freeze({ runtime, model, ref: Object.freeze(modelRef(model)) });
}

/**
 * Session-generation-scoped owner of one lazily created child ModelRuntime.
 *
 * The adapter mirrors only public host provider registrations. Credential values
 * are never copied through ModelRegistry: the child runtime resolves supported
 * stored/environment/provider-config auth through its own credential store.
 */
export class ChildModelRuntimeAdapter {
	#createRuntime: () => ModelRuntime | Promise<ModelRuntime>;
	#runtime?: ModelRuntime;
	#runtimeCreation?: Promise<ModelRuntime>;
	#mirroredProviderIds = new Set<string>();
	#operationTail: Promise<void> = Promise.resolve();
	#closed = false;
	#disposePromise?: Promise<void>;

	constructor(options: ChildModelRuntimeAdapterOptions = {}) {
		this.#createRuntime =
			options.createRuntime ?? (() => ModelRuntime.create({ allowModelNetwork: false }));
	}

	get initialized(): boolean {
		return this.#runtime !== undefined;
	}

	get closed(): boolean {
		return this.#closed;
	}

	synchronize(hostRegistry: HostModelRegistryView): Promise<ModelRuntime> {
		return this.#enqueue(async () => {
			const runtime = await this.#getRuntime();
			await this.#synchronizeRuntime(runtime, hostRegistry);
			return runtime;
		});
	}

	resolveExplicit(hostRegistry: HostModelRegistryView, ref: ExplicitModelRef): Promise<ResolvedChildModel> {
		const normalized = normalizeModelRef(ref);
		return this.#enqueue(async () => {
			const runtime = await this.#getRuntime();
			await this.#synchronizeRuntime(runtime, hostRegistry);
			return this.#resolveExactAvailable(runtime, normalized);
		});
	}

	resolveInherited(
		hostRegistry: HostModelRegistryView,
		parentModel: Pick<Model<Api>, "provider" | "id"> | undefined,
	): Promise<ResolvedChildModel> {
		if (!parentModel) {
			return Promise.reject(
				new ChildModelRuntimeError("missing_inherited_model", "The parent session has no model to inherit"),
			);
		}
		const ref = normalizeModelRef(modelRef(parentModel));
		return this.#enqueue(async () => {
			const runtime = await this.#getRuntime();
			await this.#synchronizeRuntime(runtime, hostRegistry);
			return this.#resolveExactAvailable(runtime, ref);
		});
	}

	resolveCanonicalModel(
		hostRegistry: HostModelRegistryView,
		modelId: string,
		preferredProvider?: string,
	): Promise<ResolvedChildModel> {
		const normalizedModelId = boundedIdentityPart(modelId, "model.id", MAX_MODEL_ID_CHARS);
		const normalizedPreferredProvider =
			preferredProvider === undefined
				? undefined
				: boundedIdentityPart(preferredProvider, "preferredProvider", MAX_PROVIDER_CHARS);
		return this.#enqueue(async () => {
			const runtime = await this.#getRuntime();
			await this.#synchronizeRuntime(runtime, hostRegistry);
			const available = await this.#getAvailable(runtime);
			const exactAvailable = available.filter((candidate) => candidate.id === normalizedModelId);

			if (normalizedPreferredProvider) {
				const preferred = exactAvailable.find((candidate) => candidate.provider === normalizedPreferredProvider);
				if (preferred) return resolved(runtime, preferred);
			}
			if (exactAvailable.length === 1) return resolved(runtime, exactAvailable[0]);
			if (exactAvailable.length > 1) {
				const candidates = sortAndBoundCandidates(exactAvailable.map(modelRef));
				throw new ChildModelRuntimeError(
					"model_ambiguous",
					`Model id is available from multiple providers; specify one.${candidateSuffix(candidates)}`,
					candidates,
				);
			}

			const exactKnown = runtime.getModels().filter((candidate) => candidate.id === normalizedModelId);
			if (exactKnown.length > 0) {
				const candidates = sortAndBoundCandidates(exactKnown.map(modelRef));
				throw new ChildModelRuntimeError(
					"model_unavailable",
					`Model is known but unavailable: ${normalizedModelId}.${candidateSuffix(candidates)}`,
					candidates,
				);
			}

			const displayName = normalizeDisplayName(normalizedModelId);
			const displayMatches = runtime
				.getModels()
				.filter((candidate) => normalizeDisplayName(candidate.name) === displayName);
			if (displayMatches.length > 0) {
				const candidates = sortAndBoundCandidates(displayMatches.map(modelRef));
				throw new ChildModelRuntimeError(
					"exact_model_id_required",
					`No exact model id matched; display-name matches are diagnostic only.${candidateSuffix(candidates)}`,
					candidates,
				);
			}

			throw new ChildModelRuntimeError("missing_model", `Model not found: ${normalizedModelId}`);
		});
	}

	resolveTierModel(
		hostRegistry: HostModelRegistryView,
		complexity: ComplexityTier,
		preferredProvider?: string,
	): Promise<ResolvedChildModel> {
		return this.resolveCanonicalModel(hostRegistry, SUB_AGENT_TIER_MODEL_IDS[complexity], preferredProvider);
	}

	getSnapshot(): ChildModelRuntimeSnapshot {
		const mirroredProviders = [...this.#mirroredProviderIds].sort();
		const mirroredProviderSet = new Set(mirroredProviders);
		const mirroredModels = this.#runtime
			? sortAndBoundCandidates(
					this.#runtime
						.getModels()
						.filter((model) => mirroredProviderSet.has(model.provider))
						.map(modelRef),
				)
			: [];
		return {
			initialized: this.initialized,
			closed: this.#closed,
			mirroredProviders,
			mirroredModels,
		};
	}

	dispose(): Promise<void> {
		if (this.#disposePromise) return this.#disposePromise;
		this.#closed = true;
		const run = this.#operationTail.then(async () => {
			const runtime = this.#runtime;
			if (runtime) {
				for (const providerId of [...this.#mirroredProviderIds].sort()) {
					try {
						runtime.unregisterProvider(providerId);
					} catch {
						// Continue clearing every mirrored registration.
					}
				}
				try {
					await runtime.refresh({ allowNetwork: false });
				} catch {
					// ModelRuntime owns no explicit close handle. Registration cleanup is best effort.
				}
			}
			this.#mirroredProviderIds.clear();
			this.#runtime = undefined;
			this.#runtimeCreation = undefined;
		});
		this.#disposePromise = run.then(
			() => undefined,
			() => undefined,
		);
		this.#operationTail = this.#disposePromise;
		return this.#disposePromise;
	}

	#enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
		if (this.#closed) {
			return Promise.reject(new ChildModelRuntimeError("runtime_closed", "The child model runtime is closed"));
		}
		const run = this.#operationTail.then(operation);
		this.#operationTail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	async #getRuntime(): Promise<ModelRuntime> {
		if (this.#runtime) return this.#runtime;
		if (!this.#runtimeCreation) {
			const creation = Promise.resolve()
				.then(() => this.#createRuntime())
				.then((runtime) => {
					this.#runtime = runtime;
					return runtime;
				});
			this.#runtimeCreation = creation;
		}
		try {
			return await this.#runtimeCreation;
		} catch {
			this.#runtimeCreation = undefined;
			throw new ChildModelRuntimeError(
				"runtime_initialization_failed",
				"Could not initialize the child model runtime",
			);
		}
	}

	async #synchronizeRuntime(runtime: ModelRuntime, hostRegistry: HostModelRegistryView): Promise<void> {
		let providerIds: string[];
		try {
			providerIds = [...new Set(hostRegistry.getRegisteredProviderIds())]
				.map((providerId) => boundedIdentityPart(providerId, "provider id", MAX_PROVIDER_CHARS))
				.sort();
		} catch {
			throw new ChildModelRuntimeError("host_registry_failed", "Could not read host provider registrations");
		}

		const nextProviderIds = new Set(providerIds);
		for (const providerId of [...this.#mirroredProviderIds]) {
			if (nextProviderIds.has(providerId)) continue;
			try {
				runtime.unregisterProvider(providerId);
			} catch {
				throw new ChildModelRuntimeError("provider_mirror_failed", `Could not remove mirrored provider: ${providerId}`);
			}
			this.#mirroredProviderIds.delete(providerId);
		}

		for (const providerId of providerIds) {
			let nativeProvider: ReturnType<HostModelRegistryView["getRegisteredNativeProvider"]>;
			let providerConfig: ReturnType<HostModelRegistryView["getRegisteredProviderConfig"]>;
			try {
				nativeProvider = hostRegistry.getRegisteredNativeProvider(providerId);
				providerConfig = hostRegistry.getRegisteredProviderConfig(providerId);
			} catch {
				throw new ChildModelRuntimeError("host_registry_failed", `Could not read host provider: ${providerId}`);
			}
			if (Boolean(nativeProvider) === Boolean(providerConfig)) {
				throw new ChildModelRuntimeError("provider_mirror_failed", `Host provider registration is invalid: ${providerId}`);
			}

			try {
				runtime.unregisterProvider(providerId);
				this.#mirroredProviderIds.delete(providerId);
				if (nativeProvider) runtime.registerNativeProvider(nativeProvider);
				else runtime.registerProvider(providerId, providerConfig!);
				this.#mirroredProviderIds.add(providerId);
			} catch {
				try {
					runtime.unregisterProvider(providerId);
				} catch {
					// The bounded error below is authoritative.
				}
				this.#mirroredProviderIds.delete(providerId);
				throw new ChildModelRuntimeError("provider_mirror_failed", `Could not mirror provider: ${providerId}`);
			}
		}

		try {
			await runtime.refresh({ allowNetwork: false });
		} catch {
			throw new ChildModelRuntimeError("provider_mirror_failed", "Could not refresh mirrored provider metadata");
		}
	}

	async #resolveExactAvailable(runtime: ModelRuntime, ref: ExplicitModelRef): Promise<ResolvedChildModel> {
		const model = runtime.getModel(ref.provider, ref.id);
		if (!model) {
			throw new ChildModelRuntimeError("missing_model", `Model not found: ${ref.provider}/${ref.id}`);
		}
		const available = await this.#getAvailable(runtime, ref.provider);
		const availableModel = available.find((candidate) => candidate.id === ref.id);
		if (!availableModel) {
			throw new ChildModelRuntimeError(
				"model_unavailable",
				`Model is unavailable: ${ref.provider}/${ref.id}`,
				[ref],
			);
		}
		return resolved(runtime, availableModel);
	}

	async #getAvailable(runtime: ModelRuntime, providerId?: string): Promise<readonly Model<Api>[]> {
		try {
			return await runtime.getAvailable(providerId);
		} catch {
			throw new ChildModelRuntimeError(
				"availability_check_failed",
				providerId
					? `Could not check model availability for provider: ${providerId}`
					: "Could not check model availability",
			);
		}
	}
}
