import type { Api, Model } from "@earendil-works/pi-ai";
import {
	ChildModelRuntimeAdapter,
	ChildModelRuntimeError,
	SUB_AGENT_TIER_MODEL_IDS,
	type ChildModelRuntimeErrorCode,
	type HostModelRegistryView,
	type ResolvedChildModel,
} from "./model-runtime.ts";
import type {
	ComplexityTier,
	DynamicAgentSpec,
	ExplicitModelRef,
	ModelPolicy,
	ModelRoute,
	ModelRouteStep,
} from "./types.ts";

const MODEL_POLICIES = new Set<ModelPolicy>(["auto", "inherit", "explicit"]);
const COMPLEXITY_TIERS = new Set<ComplexityTier>(["simple", "moderate", "complex"]);
const FALLBACK_ERROR_CODES = new Set<ChildModelRuntimeErrorCode>([
	"missing_model",
	"model_unavailable",
	"exact_model_id_required",
]);

export const SUB_AGENT_TIER_FALLBACKS: Readonly<
	Record<ComplexityTier, readonly ComplexityTier[]>
> = Object.freeze({
	simple: Object.freeze(["simple", "moderate", "complex"] as const),
	moderate: Object.freeze(["moderate", "complex", "simple"] as const),
	complex: Object.freeze(["complex", "moderate"] as const),
});

/** Prompt metadata for the Phase 3 sub_agents_spawn tool. */
export const SUB_AGENT_MODEL_ROUTING_PROMPT_GUIDELINES = Object.freeze([
	"When calling sub_agents_spawn, classify every dynamic assignment as simple, moderate, or complex; the extension does not make a separate classification model call.",
	"Use sub_agents_spawn complexity=simple for narrow latency-sensitive work, moderate for ordinary analysis or implementation, and complex for ambiguous, architectural, integration, security-sensitive, or high-stakes work.",
	"Use sub_agents_spawn modelPolicy=explicit only when an exact provider/model override is required, or modelPolicy=inherit when the child must use the parent model.",
] as const);

export interface SubAgentModelRouteRequest {
	readonly hostRegistry: HostModelRegistryView;
	readonly parentModel?: Pick<Model<Api>, "provider" | "id">;
	readonly spec: Pick<DynamicAgentSpec, "modelPolicy" | "model" | "complexity">;
}

export interface RoutedChildModel extends ResolvedChildModel {
	readonly route: ModelRoute;
}

function invalidRoute(message: string): never {
	throw new ChildModelRuntimeError("invalid_model_reference", message);
}

function normalizePolicy(value: ModelPolicy | undefined): ModelPolicy {
	const policy = value ?? "auto";
	if (!MODEL_POLICIES.has(policy)) invalidRoute("Unsupported child model policy");
	return policy;
}

function normalizeComplexity(value: ComplexityTier | undefined): ComplexityTier {
	const complexity = value ?? "moderate";
	if (!COMPLEXITY_TIERS.has(complexity)) invalidRoute("Unsupported child assignment complexity");
	return complexity;
}

function selectedStep(
	source: ModelRouteStep["source"],
	modelId: string,
	complexity?: ComplexityTier,
): ModelRouteStep {
	return Object.freeze({ source, modelId, complexity, outcome: "selected" as const });
}

function unavailableTierStep(complexity: ComplexityTier): ModelRouteStep {
	return Object.freeze({
		source: "tier" as const,
		modelId: SUB_AGENT_TIER_MODEL_IDS[complexity],
		complexity,
		outcome: "unavailable" as const,
	});
}

function freezeRoute(route: ModelRoute): ModelRoute {
	return Object.freeze({
		...route,
		selectedModel: Object.freeze({ ...route.selectedModel }),
		fallbackPath: Object.freeze(route.fallbackPath.map((step) => Object.freeze({ ...step }))),
	});
}

function routed(resolved: ResolvedChildModel, route: ModelRoute): RoutedChildModel {
	return Object.freeze({ ...resolved, route: freezeRoute(route) });
}

function isFallbackError(error: unknown): error is ChildModelRuntimeError {
	if (!error || typeof error !== "object") return false;
	const candidate = error as Partial<ChildModelRuntimeError>;
	return (
		(error instanceof ChildModelRuntimeError || candidate.name === "ChildModelRuntimeError") &&
		typeof candidate.code === "string" &&
		FALLBACK_ERROR_CODES.has(candidate.code as ChildModelRuntimeErrorCode) &&
		Array.isArray(candidate.candidates)
	);
}

function collectCandidates(
	errors: readonly ChildModelRuntimeError[],
	parentModel: Pick<Model<Api>, "provider" | "id"> | undefined,
): ExplicitModelRef[] {
	const candidates = new Map<string, ExplicitModelRef>();
	for (const error of errors) {
		for (const candidate of error.candidates) {
			candidates.set(`${candidate.provider}\u0000${candidate.id}`, { ...candidate });
		}
	}
	if (parentModel) {
		const provider = String(parentModel.provider ?? "").trim().slice(0, 128);
		const id = String(parentModel.id ?? "").trim().slice(0, 256);
		if (provider && id) candidates.set(`${provider}\u0000${id}`, { provider, id });
	}
	return [...candidates.values()]
		.sort((left, right) => `${left.provider}/${left.id}`.localeCompare(`${right.provider}/${right.id}`))
		.slice(0, 20);
}

/** Deterministic policy router over the session-generation-owned child runtime. */
export class SubAgentModelRouter {
	readonly modelRuntime: ChildModelRuntimeAdapter;

	constructor(modelRuntime: ChildModelRuntimeAdapter) {
		this.modelRuntime = modelRuntime;
	}

	async resolve(request: SubAgentModelRouteRequest): Promise<RoutedChildModel> {
		if (!request || typeof request !== "object" || !request.hostRegistry || !request.spec) {
			invalidRoute("A host registry and dynamic agent specification are required");
		}
		const policy = normalizePolicy(request.spec.modelPolicy);
		const complexity = normalizeComplexity(request.spec.complexity);
		if (policy === "explicit" && !request.spec.model) {
			invalidRoute("An explicit child model policy requires provider and model id");
		}
		if (policy !== "explicit" && request.spec.model) {
			invalidRoute("A child model reference requires modelPolicy=explicit");
		}

		if (policy === "explicit") {
			const resolved = await this.modelRuntime.resolveExplicit(
				request.hostRegistry,
				request.spec.model!,
			);
			return routed(resolved, {
				requestedPolicy: policy,
				requestedComplexity: complexity,
				selectedModel: resolved.ref,
				fallbackUsed: false,
				fallbackPath: [selectedStep("explicit", resolved.ref.id)],
				reason: `Explicit model override selected ${resolved.ref.provider}/${resolved.ref.id}.`,
			});
		}

		if (policy === "inherit") {
			const resolved = await this.modelRuntime.resolveInherited(
				request.hostRegistry,
				request.parentModel,
			);
			return routed(resolved, {
				requestedPolicy: policy,
				requestedComplexity: complexity,
				selectedModel: resolved.ref,
				fallbackUsed: false,
				fallbackPath: [selectedStep("inherit", resolved.ref.id)],
				reason: `Inherited parent model ${resolved.ref.provider}/${resolved.ref.id}.`,
			});
		}

		return this.#resolveAutomatic(request, complexity);
	}

	async #resolveAutomatic(
		request: SubAgentModelRouteRequest,
		complexity: ComplexityTier,
	): Promise<RoutedChildModel> {
		const steps: ModelRouteStep[] = [];
		const unavailableErrors: ChildModelRuntimeError[] = [];
		const preferredProvider = request.parentModel?.provider;

		for (const tier of SUB_AGENT_TIER_FALLBACKS[complexity]) {
			try {
				const resolved = await this.modelRuntime.resolveTierModel(
					request.hostRegistry,
					tier,
					preferredProvider,
				);
				const fallbackPath = [...steps, selectedStep("tier", resolved.ref.id, tier)];
				const fallbackUsed = fallbackPath.length > 1;
				return routed(resolved, {
					requestedPolicy: "auto",
					requestedComplexity: complexity,
					selectedModel: resolved.ref,
					selectedTier: tier,
					fallbackUsed,
					fallbackPath,
					reason: fallbackUsed
						? `Automatic ${complexity} route used fallback tier ${tier} and selected ${resolved.ref.provider}/${resolved.ref.id}.`
						: `Automatic ${complexity} route selected ${resolved.ref.provider}/${resolved.ref.id}.`,
				});
			} catch (error) {
				if (!isFallbackError(error)) throw error;
				unavailableErrors.push(error);
				steps.push(unavailableTierStep(tier));
			}
		}

		if (request.parentModel) {
			try {
				const resolved = await this.modelRuntime.resolveInherited(
					request.hostRegistry,
					request.parentModel,
				);
				return routed(resolved, {
					requestedPolicy: "auto",
					requestedComplexity: complexity,
					selectedModel: resolved.ref,
					fallbackUsed: true,
					fallbackPath: [...steps, selectedStep("inherit", resolved.ref.id)],
					reason: `Automatic ${complexity} route exhausted its subscription tiers and inherited ${resolved.ref.provider}/${resolved.ref.id}.`,
				});
			} catch (error) {
				if (!isFallbackError(error)) throw error;
				unavailableErrors.push(error);
			}
		}

		const attempted = steps.map((step) => step.modelId).join(", ");
		throw new ChildModelRuntimeError(
			"model_unavailable",
			`No available automatic ${complexity} child model route. Attempted subscription models: ${attempted}; inherited parent model unavailable.`,
			collectCandidates(unavailableErrors, request.parentModel),
		);
	}
}
