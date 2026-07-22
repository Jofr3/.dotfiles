import {
	SubAgentSessionFactoryError,
	createSubAgentSession,
	type CreateSubAgentSessionOptions,
	type SubAgentSessionRuntime,
} from "./agent-runtime.ts";
import {
	ChildEventTranslator,
	createChildEventTranslator,
	type ChildEventTranslatorOptions,
} from "./event-translator.ts";
import {
	ChildModelRuntimeError,
	type ResolvedChildModel,
} from "./model-runtime.ts";
import {
	ManagerClosedError,
	SubAgentManager,
	SubAgentManagerError,
} from "./manager.ts";
import type {
	AssignmentId,
	DynamicAgentSpec,
	ManagedSubAgentSnapshot,
	ModelRoute,
	SessionGeneration,
	SubAgentId,
} from "./types.ts";
import { SUB_AGENT_BOUNDS } from "./types.ts";

export type ActiveAssignmentDelivery = "steer" | "followUp";

export type SubAgentAssignmentRunnerErrorCode =
	| "invalid_assignment"
	| "model_resolution_failed"
	| "runtime_initialization_failed"
	| "runtime_missing"
	| "assignment_not_idle"
	| "assignment_not_running"
	| "assignment_rejected"
	| "assignment_execution_failed"
	| "assignment_changed"
	| "assignment_abort_failed"
	| "invalid_reconfiguration"
	| "reconfiguration_not_available"
	| "reconfiguration_failed";

export class SubAgentAssignmentRunnerError extends Error {
	readonly code: SubAgentAssignmentRunnerErrorCode;
	readonly agentId?: SubAgentId;

	constructor(
		code: SubAgentAssignmentRunnerErrorCode,
		message: string,
		agentId?: SubAgentId,
	) {
		super(message);
		this.name = "SubAgentAssignmentRunnerError";
		this.code = code;
		this.agentId = agentId;
	}
}

export interface ChildModelResolutionRequest {
	id: SubAgentId;
	generation: SessionGeneration;
	spec: Readonly<DynamicAgentSpec>;
}

export type ChildModelResolver = (
	request: ChildModelResolutionRequest,
) => ResolvedChildModel | Promise<ResolvedChildModel>;

export interface AssignmentLaunchResult {
	id: SubAgentId;
	assignmentId: AssignmentId;
	accepted: true;
	snapshot: ManagedSubAgentSnapshot;
}

export interface ActiveAssignmentMessageResult {
	id: SubAgentId;
	assignmentId: AssignmentId;
	delivery: ActiveAssignmentDelivery;
	accepted: true;
	pendingMessageCount: number;
}

export type ReconfigurationRunningBehavior = "queue" | "abort-and-switch";
export type ModelReconfigurationAction = "applied" | "queued" | "aborted-and-applied";

export interface ModelReconfigurationResult {
	id: SubAgentId;
	action: ModelReconfigurationAction;
	oldRoute?: ModelRoute;
	newRoute: ModelRoute;
	oldThinkingLevel: ManagedSubAgentSnapshot["effectiveThinkingLevel"];
	requestedThinkingLevel?: ManagedSubAgentSnapshot["effectiveThinkingLevel"];
	effectiveThinkingLevel?: ManagedSubAgentSnapshot["effectiveThinkingLevel"];
	afterAssignmentId?: AssignmentId;
	afterAssignmentSequence?: number;
	snapshot: ManagedSubAgentSnapshot;
}

interface AssignmentRun {
	assignmentId: AssignmentId;
	completion: Promise<void>;
}

interface PendingRuntimeModelReconfiguration {
	sequence: number;
	afterAssignmentId: AssignmentId;
	resolvedModel: ResolvedChildModel & { route: ModelRoute };
	requestedThinkingLevel?: ManagedSubAgentSnapshot["effectiveThinkingLevel"];
	oldRoute?: ModelRoute;
	oldThinkingLevel: ManagedSubAgentSnapshot["effectiveThinkingLevel"];
}

interface LiveChildRuntime {
	runtime: SubAgentSessionRuntime;
	translator: ChildEventTranslator;
	currentRun?: AssignmentRun;
	pendingReconfiguration?: PendingRuntimeModelReconfiguration;
	pendingApplyTask?: Promise<void>;
	pendingSequence: number;
}

export interface SubAgentAssignmentRunnerDependencies {
	createSession?: (options: CreateSubAgentSessionOptions) => Promise<SubAgentSessionRuntime>;
	createTranslator?: (options: ChildEventTranslatorOptions) => ChildEventTranslator;
}

function boundedAssignmentText(value: unknown, field: string): string {
	if (typeof value !== "string") {
		throw new SubAgentAssignmentRunnerError(
			"invalid_assignment",
			`${field} must be a string`,
		);
	}
	const text = value.trim();
	if (!text || text.length > SUB_AGENT_BOUNDS.objectiveChars) {
		throw new SubAgentAssignmentRunnerError(
			"invalid_assignment",
			`${field} must contain between 1 and ${SUB_AGENT_BOUNDS.objectiveChars} characters`,
		);
	}
	return text;
}

function safeInitializationMessage(error: unknown, fallback: string): string {
	if (
		error instanceof ChildModelRuntimeError ||
		error instanceof SubAgentManagerError ||
		error instanceof SubAgentAssignmentRunnerError
	) {
		return error.message.slice(0, SUB_AGENT_BOUNDS.errorChars);
	}
	if (error instanceof SubAgentSessionFactoryError) {
		return error.message.slice(0, SUB_AGENT_BOUNDS.errorChars);
	}
	return fallback;
}

function settledState(state: ManagedSubAgentSnapshot["state"]): boolean {
	return state === "idle" || state === "blocked" || state === "failed" || state === "removed";
}

/**
 * Session-generation-scoped owner of reusable child assignment execution.
 *
 * Model routing remains outside this class: callers supply one resolver per
 * creation request. Routed results carry bounded policy metadata that is
 * recorded before the child enters its first assignment boundary.
 */
export class SubAgentAssignmentRunner {
	readonly manager: SubAgentManager;

	#createSession: (options: CreateSubAgentSessionOptions) => Promise<SubAgentSessionRuntime>;
	#createTranslator: (options: ChildEventTranslatorOptions) => ChildEventTranslator;
	#live = new Map<SubAgentId, LiveChildRuntime>();
	#operationTails = new Map<SubAgentId, Promise<void>>();

	constructor(
		manager: SubAgentManager,
		dependencies: SubAgentAssignmentRunnerDependencies = {},
	) {
		this.manager = manager;
		this.#createSession = dependencies.createSession ?? createSubAgentSession;
		this.#createTranslator = dependencies.createTranslator ?? createChildEventTranslator;
	}

	get liveRuntimeCount(): number {
		return this.#live.size;
	}

	hasLiveRuntime(id: SubAgentId): boolean {
		return this.#live.has(id);
	}

	/** Create one dynamic child, initialize its isolated session, and launch its initial prompt. */
	async createAndLaunch(
		spec: DynamicAgentSpec,
		resolveModel: ChildModelResolver,
	): Promise<AssignmentLaunchResult> {
		if (typeof resolveModel !== "function") {
			throw new SubAgentAssignmentRunnerError(
				"model_resolution_failed",
				"A child model resolver is required",
			);
		}
		const created = this.manager.createAgent(spec);
		try {
			let resolvedModel: ResolvedChildModel;
			try {
				resolvedModel = await resolveModel({
					id: created.id,
					generation: created.generation,
					spec: created.spec,
				});
			} catch (error) {
				throw new SubAgentAssignmentRunnerError(
					"model_resolution_failed",
					safeInitializationMessage(error, "Could not resolve the child model"),
					created.id,
				);
			}
			const route = (resolvedModel as ResolvedChildModel & { route?: ModelRoute }).route;
			if (route) await this.manager.recordModelRoute(created.id, route);
			await this.#initialize(created.id, resolvedModel);
			return await this.prompt(created.id, created.spec.objective);
		} catch (error) {
			const current = this.manager.getAgent(created.id);
			if (current.state === "creating") {
				await this.manager.failAgent(
					created.id,
					safeInitializationMessage(error, "Could not initialize the child assignment"),
				);
			}
			if (error instanceof SubAgentAssignmentRunnerError) throw error;
			throw new SubAgentAssignmentRunnerError(
				"runtime_initialization_failed",
				safeInitializationMessage(error, "Could not initialize the child runtime"),
				created.id,
			);
		}
	}

	/** Start a new assignment on an initialized creating or reusable idle child. */
	prompt(id: SubAgentId, objective: string): Promise<AssignmentLaunchResult> {
		const text = boundedAssignmentText(objective, "assignment objective");
		return this.#enqueue(id, async () => {
			const live = this.#requireLive(id);
			let before = this.manager.getAgent(id);
			if (before.state === "idle" && live.pendingReconfiguration) {
				await this.#applyModelReconfiguration(live, live.pendingReconfiguration, "applied");
				before = this.manager.getAgent(id);
			}
			if (before.state !== "creating" && before.state !== "idle") {
				throw new SubAgentAssignmentRunnerError(
					"assignment_not_idle",
					`Sub-agent is not ready for a new assignment: ${before.state}`,
					id,
				);
			}
			if (!live.runtime.session.isIdle || live.currentRun) {
				throw new SubAgentAssignmentRunnerError(
					"assignment_not_idle",
					"The child session has not reached an idle assignment boundary",
					id,
				);
			}

			const started = await this.manager.startAssignment(id, text);
			const assignmentId = started.currentAssignment?.id;
			if (!assignmentId) {
				throw new SubAgentAssignmentRunnerError(
					"assignment_execution_failed",
					"The child assignment boundary was not created",
					id,
				);
			}

			return this.#launchPrompt(live, assignmentId, started.currentAssignment!.objective);
		});
	}

	/** Queue a steering or follow-up message into the current assignment. */
	send(
		id: SubAgentId,
		message: string,
		delivery: ActiveAssignmentDelivery,
	): Promise<ActiveAssignmentMessageResult> {
		const text = boundedAssignmentText(message, "assignment message");
		if (delivery !== "steer" && delivery !== "followUp") {
			return Promise.reject(
				new SubAgentAssignmentRunnerError(
					"invalid_assignment",
					"Assignment delivery must be steer or followUp",
					id,
				),
			);
		}
		return this.#enqueue(id, async () => {
			if (this.manager.closed) throw new ManagerClosedError();
			const live = this.#requireLive(id);
			let snapshot = this.manager.getAgent(id);
			if (snapshot.state !== "running" || !snapshot.currentAssignment) {
				throw new SubAgentAssignmentRunnerError(
					"assignment_not_running",
					`Sub-agent has no running assignment: ${snapshot.state}`,
					id,
				);
			}
			if (!live.runtime.session.isStreaming) {
				await live.translator.flush();
				snapshot = this.manager.getAgent(id);
				throw new SubAgentAssignmentRunnerError(
					"assignment_not_running",
					`The child assignment settled before the message could be queued: ${snapshot.state}`,
					id,
				);
			}

			if (delivery === "steer") await live.runtime.session.steer(text);
			else await live.runtime.session.followUp(text);

			return {
				id,
				assignmentId: snapshot.currentAssignment.id,
				delivery,
				accepted: true,
				pendingMessageCount: live.runtime.session.pendingMessageCount,
			};
		});
	}

	/** Change or queue the model configuration while retaining the child transcript. */
	reconfigure(
		id: SubAgentId,
		resolvedModel: ResolvedChildModel & { route: ModelRoute },
		requestedThinkingLevel: ManagedSubAgentSnapshot["effectiveThinkingLevel"],
		runningBehavior: ReconfigurationRunningBehavior = "queue",
	): Promise<ModelReconfigurationResult> {
		if (!resolvedModel?.runtime || !resolvedModel.model || !resolvedModel.route) {
			return Promise.reject(
				new SubAgentAssignmentRunnerError(
					"invalid_reconfiguration",
					"A routed replacement child model is required",
					id,
				),
			);
		}
		if (runningBehavior !== "queue" && runningBehavior !== "abort-and-switch") {
			return Promise.reject(
				new SubAgentAssignmentRunnerError(
					"invalid_reconfiguration",
					"Running reconfiguration behavior must be queue or abort-and-switch",
					id,
				),
			);
		}

		return this.#enqueue(id, async () => {
			if (this.manager.closed) throw new ManagerClosedError();
			const live = this.#requireLive(id);
			let snapshot = this.manager.getAgent(id);
			if (snapshot.state === "idle") {
				const pending = this.#createPendingReconfiguration(
					live,
					snapshot,
					resolvedModel,
					requestedThinkingLevel,
					snapshot.currentAssignment?.id,
				);
				return this.#applyModelReconfiguration(live, pending, "applied");
			}
			if (snapshot.state !== "running" || !snapshot.currentAssignment) {
				throw new SubAgentAssignmentRunnerError(
					"reconfiguration_not_available",
					`Sub-agent cannot change model configuration from state: ${snapshot.state}`,
					id,
				);
			}
			if (!live.runtime.session.isStreaming || !live.currentRun) {
				await live.translator.flush();
				snapshot = this.manager.getAgent(id);
				if (snapshot.state === "idle") {
					const pending = this.#createPendingReconfiguration(
						live,
						snapshot,
						resolvedModel,
						requestedThinkingLevel,
						snapshot.currentAssignment?.id,
					);
					return this.#applyModelReconfiguration(live, pending, "applied");
				}
				throw new SubAgentAssignmentRunnerError(
					"reconfiguration_not_available",
					"The child session has not reached a safe model-change boundary",
					id,
				);
			}

			const assignment = snapshot.currentAssignment;
			const pending = this.#createPendingReconfiguration(
				live,
				snapshot,
				resolvedModel,
				requestedThinkingLevel,
				assignment.id,
			);
			await this.manager.queueModelReconfiguration(id, {
				afterAssignmentId: assignment.id,
				route: resolvedModel.route,
				requestedThinkingLevel,
			});
			live.pendingReconfiguration = pending;

			if (runningBehavior === "queue") {
				this.#schedulePendingReconfiguration(live, live.currentRun);
				return {
					id,
					action: "queued",
					oldRoute: pending.oldRoute,
					newRoute: resolvedModel.route,
					oldThinkingLevel: pending.oldThinkingLevel,
					requestedThinkingLevel,
					afterAssignmentId: assignment.id,
					afterAssignmentSequence: assignment.sequence,
					snapshot: this.manager.getAgent(id),
				};
			}

			try {
				live.runtime.session.clearQueue();
				live.translator.expectReconfigurationAbort();
				await live.runtime.abort();
				await live.currentRun?.completion;
				await live.translator.flush();
				live.translator.cancelExpectedReconfigurationAbort();
			} catch {
				live.translator.cancelExpectedReconfigurationAbort();
				if (live.pendingReconfiguration?.sequence === pending.sequence) {
					live.pendingReconfiguration = undefined;
				}
				await this.manager.cancelModelReconfiguration(
					id,
					"Abort-and-switch model reconfiguration failed",
				).catch(() => undefined);
				throw new SubAgentAssignmentRunnerError(
					"reconfiguration_failed",
					"Could not interrupt the running child assignment for model reconfiguration",
					id,
				);
			}
			snapshot = this.manager.getAgent(id);
			if (snapshot.state !== "idle") {
				if (live.pendingReconfiguration?.sequence === pending.sequence) {
					live.pendingReconfiguration = undefined;
				}
				await this.manager.cancelModelReconfiguration(
					id,
					"Abort-and-switch reached no reusable idle boundary",
				).catch(() => undefined);
				throw new SubAgentAssignmentRunnerError(
					"reconfiguration_failed",
					`The interrupted child did not reach a reusable idle boundary: ${snapshot.state}`,
					id,
				);
			}
			const action =
				snapshot.currentAssignment?.id === assignment.id &&
				snapshot.currentAssignment.state === "aborted"
					? "aborted-and-applied"
					: "applied";
			return this.#applyModelReconfiguration(live, pending, action);
		});
	}

	/** Wait for the current assignment runner and translator to reach a stable boundary. */
	async waitForAssignment(
		id: SubAgentId,
		assignmentId?: AssignmentId,
	): Promise<ManagedSubAgentSnapshot> {
		let snapshot = this.manager.getAgent(id);
		const currentId = snapshot.currentAssignment?.id;
		if (assignmentId && currentId !== assignmentId) {
			throw new SubAgentAssignmentRunnerError(
				"assignment_changed",
				"The requested assignment is no longer current",
				id,
			);
		}
		const live = this.#live.get(id);
		const run = live?.currentRun;
		if (run && (!assignmentId || run.assignmentId === assignmentId)) {
			await run.completion;
		}
		if (live) {
			await live.translator.flush();
			await live.pendingApplyTask;
		}
		snapshot = this.manager.getAgent(id);
		if (assignmentId && snapshot.currentAssignment?.id !== assignmentId) {
			throw new SubAgentAssignmentRunnerError(
				"assignment_changed",
				"The requested assignment changed while waiting",
				id,
			);
		}
		return snapshot;
	}

	/** Abort a running assignment. Races with removal settle to the manager's final state. */
	abortAssignment(id: SubAgentId): Promise<ManagedSubAgentSnapshot> {
		return this.#enqueue(id, async () => {
			let snapshot = this.manager.getAgent(id);
			if (settledState(snapshot.state) || snapshot.state === "stopping") return snapshot;
			if (snapshot.state !== "running") {
				throw new SubAgentAssignmentRunnerError(
					"assignment_not_running",
					`Sub-agent has no running assignment: ${snapshot.state}`,
					id,
				);
			}

			const live = this.#requireLive(id);
			try {
				await live.runtime.abort();
				await live.currentRun?.completion;
				await live.translator.flush();
			} catch {
				snapshot = this.manager.getAgent(id);
				if (snapshot.state === "stopping" || snapshot.state === "removed") return snapshot;
				throw new SubAgentAssignmentRunnerError(
					"assignment_abort_failed",
					"Could not settle the aborted child assignment",
					id,
				);
			}
			return this.manager.getAgent(id);
		});
	}

	async #initialize(id: SubAgentId, resolvedModel: ResolvedChildModel): Promise<void> {
		return this.#enqueue(id, async () => {
			if (this.#live.has(id)) {
				throw new SubAgentAssignmentRunnerError(
					"runtime_initialization_failed",
					"A child runtime is already registered",
					id,
				);
			}
			const snapshot = this.manager.getAgent(id);
			if (snapshot.state !== "creating") {
				throw new SubAgentAssignmentRunnerError(
					"runtime_initialization_failed",
					`The child runtime cannot initialize from state: ${snapshot.state}`,
					id,
				);
			}

			const translator = this.#createTranslator({ manager: this.manager, id });
			let runtime: SubAgentSessionRuntime | undefined;
			try {
				runtime = await this.#createSession({
					id,
					generation: snapshot.generation,
					cwd: this.manager.cwd,
					spec: snapshot.spec,
					resolvedModel,
					parentContext: this.manager.getParentContextSnapshot(),
					onEvent: translator.listener,
					onReport: (report) => translator.recordReport(report),
				});
				await this.manager.recordEffectiveThinkingLevel(
					id,
					runtime.thinkingLevel ?? snapshot.spec.thinkingLevel ?? "medium",
				);
				const live: LiveChildRuntime = { runtime, translator, pendingSequence: 0 };
				this.manager.registerRuntimeCleanup(id, {
					abort: () => runtime!.abort(),
					waitForIdle: async () => {
						await runtime!.waitForIdle();
						await translator.flush();
					},
					dispose: async () => {
						let failed = false;
						try {
							await translator.close();
						} catch {
							failed = true;
						}
						try {
							runtime!.dispose();
						} catch {
							failed = true;
						}
						this.#live.delete(id);
						if (failed) {
							throw new SubAgentAssignmentRunnerError(
								"runtime_initialization_failed",
								"Could not dispose the child assignment runtime cleanly",
								id,
							);
						}
					},
				});
				this.#live.set(id, live);
			} catch (error) {
				if (runtime) await runtime.close().catch(() => undefined);
				await translator.close().catch(() => undefined);
				if (error instanceof SubAgentAssignmentRunnerError) throw error;
				throw new SubAgentAssignmentRunnerError(
					"runtime_initialization_failed",
					safeInitializationMessage(error, "Could not initialize the child runtime"),
					id,
				);
			}
		});
	}

	async #launchPrompt(
		live: LiveChildRuntime,
		assignmentId: AssignmentId,
		objective: string,
	): Promise<AssignmentLaunchResult> {
		const id = live.runtime.id;
		let preflightResolved = false;
		let resolvePreflight!: (accepted: boolean) => void;
		const preflight = new Promise<boolean>((resolvePromise) => {
			resolvePreflight = resolvePromise;
		});

		let promptPromise: Promise<void>;
		try {
			promptPromise = live.runtime.session.prompt(objective, {
				expandPromptTemplates: false,
				source: "extension",
				preflightResult: (accepted) => {
					if (preflightResolved) return;
					preflightResolved = true;
					resolvePreflight(accepted);
				},
			});
		} catch {
			promptPromise = Promise.reject(
				new SubAgentAssignmentRunnerError(
					"assignment_execution_failed",
					"Child assignment execution failed",
					id,
				),
			);
		}

		const completion = promptPromise.then(
			async () => {
				await live.translator.flush();
			},
			async () => {
				await live.translator.flush().catch(() => undefined);
				throw new SubAgentAssignmentRunnerError(
					"assignment_execution_failed",
					"Child assignment execution failed",
					id,
				);
			},
		);
		const tracked = this.manager.trackBackground(id, completion);
		let run!: AssignmentRun;
		run = {
			assignmentId,
			completion: tracked.finally(() => {
				if (live.currentRun === run) live.currentRun = undefined;
			}),
		};
		live.currentRun = run;

		const accepted = await Promise.race([
			preflight,
			completion.then(
				() => true,
				() => false,
			),
		]);
		if (!accepted) {
			await run.completion;
			throw new SubAgentAssignmentRunnerError(
				"assignment_rejected",
				"The child assignment was rejected before execution",
				id,
			);
		}

		return {
			id,
			assignmentId,
			accepted: true,
			snapshot: this.manager.getAgent(id),
		};
	}

	#createPendingReconfiguration(
		live: LiveChildRuntime,
		snapshot: ManagedSubAgentSnapshot,
		resolvedModel: ResolvedChildModel & { route: ModelRoute },
		requestedThinkingLevel: ManagedSubAgentSnapshot["effectiveThinkingLevel"],
		afterAssignmentId: AssignmentId | undefined,
	): PendingRuntimeModelReconfiguration {
		live.pendingSequence += 1;
		return {
			sequence: live.pendingSequence,
			afterAssignmentId: afterAssignmentId ?? `${snapshot.id}:assignment:${snapshot.assignmentCount}`,
			resolvedModel,
			requestedThinkingLevel,
			oldRoute: snapshot.modelRoute,
			oldThinkingLevel: live.runtime.thinkingLevel,
		};
	}

	async #applyModelReconfiguration(
		live: LiveChildRuntime,
		pending: PendingRuntimeModelReconfiguration,
		action: Exclude<ModelReconfigurationAction, "queued">,
	): Promise<ModelReconfigurationResult> {
		const id = live.runtime.id;
		const before = this.manager.getAgent(id);
		if (before.state !== "idle" || !live.runtime.session.isIdle) {
			throw new SubAgentAssignmentRunnerError(
				"reconfiguration_not_available",
				`The child is not at an idle model-change boundary: ${before.state}`,
				id,
			);
		}
		let applied: Awaited<ReturnType<SubAgentSessionRuntime["reconfigureModel"]>>;
		try {
			applied = await live.runtime.reconfigureModel(
				pending.resolvedModel,
				pending.requestedThinkingLevel,
			);
			await this.manager.recordModelConfiguration(
				id,
				pending.resolvedModel.route,
				applied.thinkingLevel,
			);
		} catch {
			if (live.pendingReconfiguration?.sequence === pending.sequence) {
				live.pendingReconfiguration = undefined;
			}
			await this.manager.cancelModelReconfiguration(
				id,
				"Child model reconfiguration failed",
			).catch(() => undefined);
			throw new SubAgentAssignmentRunnerError(
				"reconfiguration_failed",
				"Could not apply the replacement child model configuration",
				id,
			);
		}
		if (live.pendingReconfiguration?.sequence === pending.sequence) {
			live.pendingReconfiguration = undefined;
		}
		const snapshot = this.manager.getAgent(id);
		return {
			id,
			action,
			oldRoute: pending.oldRoute,
			newRoute: pending.resolvedModel.route,
			oldThinkingLevel: pending.oldThinkingLevel,
			requestedThinkingLevel: pending.requestedThinkingLevel,
			effectiveThinkingLevel: applied.thinkingLevel,
			afterAssignmentId: pending.afterAssignmentId,
			afterAssignmentSequence: snapshot.currentAssignment?.sequence,
			snapshot,
		};
	}

	#schedulePendingReconfiguration(live: LiveChildRuntime, run: AssignmentRun): void {
		if (live.pendingApplyTask) return;
		const id = live.runtime.id;
		let task!: Promise<void>;
		task = run.completion
			.then(() => this.#enqueue(id, async () => {
				const pending = live.pendingReconfiguration;
				if (!pending || pending.afterAssignmentId !== run.assignmentId) return;
				const snapshot = this.manager.getAgent(id);
				if (snapshot.state !== "idle") {
					live.pendingReconfiguration = undefined;
					await this.manager.cancelModelReconfiguration(
						id,
						"Queued model reconfiguration reached no reusable idle boundary",
					).catch(() => undefined);
					return;
				}
				await this.#applyModelReconfiguration(live, pending, "applied");
			}))
			.catch(async () => {
				live.pendingReconfiguration = undefined;
				await this.manager.cancelModelReconfiguration(
					id,
					"Queued model reconfiguration failed",
				).catch(() => undefined);
			})
			.finally(() => {
				if (live.pendingApplyTask === task) live.pendingApplyTask = undefined;
			});
		live.pendingApplyTask = task;
	}

	#requireLive(id: SubAgentId): LiveChildRuntime {
		const live = this.#live.get(id);
		if (live) return live;
		this.manager.getAgent(id);
		throw new SubAgentAssignmentRunnerError(
			"runtime_missing",
			"The sub-agent has no initialized child runtime",
			id,
		);
	}

	#enqueue<T>(id: SubAgentId, operation: () => T | Promise<T>): Promise<T> {
		this.manager.getAgent(id);
		const previous = this.#operationTails.get(id) ?? Promise.resolve();
		const run = previous.then(operation);
		const tail = run.then(
			() => undefined,
			() => undefined,
		);
		this.#operationTails.set(id, tail);
		tail.then(() => {
			if (this.#operationTails.get(id) === tail) this.#operationTails.delete(id);
		});
		return run;
	}
}
