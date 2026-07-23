import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import { SUB_AGENT_BOUNDS } from "../types.ts";

const NON_WHITESPACE_PATTERN = "\\S";
const AGENT_ID_PATTERN = "^sa1-[A-Za-z0-9_-]+$";

const MODEL_POLICIES = ["auto", "inherit", "explicit"] as const;
const COMPLEXITY_TIERS = ["simple", "moderate", "complex"] as const;
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const CHILD_TOOL_NAMES = ["read", "grep", "find", "ls", "edit", "write", "bash"] as const;
const WORKSPACE_MODES = ["shared", "worktree"] as const;
const BASH_POLICIES = ["disabled", "workspace-exclusive"] as const;
const NOTIFICATION_STATES = ["idle", "blocked", "failed"] as const;
const STATUS_DETAIL_LEVELS = ["compact", "timeline"] as const;
const ACTIVE_DELIVERIES = ["steer", "followUp"] as const;
const RECONFIGURE_RUNNING_BEHAVIORS = ["queue", "abort-and-switch"] as const;
const WAIT_CONDITIONS = ["any", "all"] as const;
const WAIT_STATES = ["idle", "blocked", "failed", "removed"] as const;
const REMOVE_SCOPES = ["selected", "all"] as const;
const REMOVE_MODES = ["graceful", "abort"] as const;

function requiredText(maxLength: number, description: string) {
	return Type.String({
		description,
		minLength: 1,
		maxLength,
		pattern: NON_WHITESPACE_PATTERN,
	});
}

const agentIdSchema = Type.String({
	description: "Exact opaque session-generation-scoped sub-agent ID returned by sub_agents_spawn.",
	minLength: 5,
	maxLength: SUB_AGENT_BOUNDS.agentIdChars,
	pattern: AGENT_ID_PATTERN,
});

const agentIdsSchema = Type.Array(agentIdSchema, {
	description: "Exact opaque sub-agent IDs. Omit only where the tool explicitly documents an all-agent default.",
	minItems: 1,
	maxItems: SUB_AGENT_BOUNDS.controlTargets,
	uniqueItems: true,
});

const explicitModelSchema = Type.Object(
	{
		provider: requiredText(128, "Exact provider ID from Pi's model registry."),
		id: requiredText(256, "Exact canonical model ID from Pi's model registry."),
	},
	{ additionalProperties: false },
);

const workspaceSchema = Type.Object(
	{
		mode: StringEnum(WORKSPACE_MODES, {
			description:
				"Workspace isolation mode. shared supports read-only tools plus guarded edit/write and workspace-exclusive bash; worktree remains unavailable until its later safety phase.",
		}),
		cwd: Type.Optional(
			requiredText(
				SUB_AGENT_BOUNDS.contextPathChars,
				"Optional existing child directory beneath the parent workspace root.",
			),
		),
		writeScope: Type.Optional(
			Type.Array(
				requiredText(SUB_AGENT_BOUNDS.contextPathChars, "Workspace-relative exact file path eligible for a guarded edit/write lease."),
				{
					description:
						"Optional exact shared-workspace file scope for guarded edit/write. The scope is claimed atomically before child startup; an empty scope permits no file mutations.",
					maxItems: SUB_AGENT_BOUNDS.writeScopePaths,
					uniqueItems: true,
				},
			),
		),
		bashPolicy: Type.Optional(
			StringEnum(BASH_POLICIES, {
				description:
					"Bash policy (default disabled). workspace-exclusive is required with the bash tool, claims the whole shared workspace before each assignment, and is not constrained by writeScope.",
			}),
		),
	},
	{ additionalProperties: false },
);

/** Strict model-visible specification for one dynamically created child. */
export const dynamicAgentSpecSchema = Type.Object(
	{
		name: requiredText(SUB_AGENT_BOUNDS.nameChars, "Task-specific display name; it need not be unique."),
		role: requiredText(SUB_AGENT_BOUNDS.roleChars, "Dynamic role invented for this assignment; not a profile lookup key."),
		objective: requiredText(SUB_AGENT_BOUNDS.objectiveChars, "Initial assignment objective."),
		instructions: Type.Optional(
			requiredText(SUB_AGENT_BOUNDS.instructionsChars, "Additional bounded task instructions."),
		),
		context: Type.Optional(
			requiredText(SUB_AGENT_BOUNDS.contextChars, "Additional bounded task context; do not include credentials or secrets."),
		),
		modelPolicy: Type.Optional(
			StringEnum(MODEL_POLICIES, {
				description:
					"Model selection policy (default auto). explicit requires model; model is invalid for auto or inherit.",
			}),
		),
		model: Type.Optional(explicitModelSchema),
		complexity: Type.Optional(
			StringEnum(COMPLEXITY_TIERS, {
				description:
					"Assignment complexity (default moderate): simple routes toward Luna, moderate toward Terra, and complex toward Sol.",
			}),
		),
		thinkingLevel: Type.Optional(
			StringEnum(THINKING_LEVELS, {
				description: "Requested thinking level; Pi clamps it to the selected model's supported levels.",
			}),
		),
		tools: Type.Optional(
			Type.Array(StringEnum(CHILD_TOOL_NAMES), {
				description:
					"Exact child tool allowlist. Omit for read, grep, find, and ls defaults. edit/write use canonical retained file leases; bash requires workspace-exclusive policy and whole-workspace ownership.",
				maxItems: SUB_AGENT_BOUNDS.tools,
				uniqueItems: true,
			}),
		),
		workspace: Type.Optional(workspaceSchema),
		resultInstructions: Type.Optional(
			requiredText(SUB_AGENT_BOUNDS.resultInstructionsChars, "Requested bounded result format or emphasis."),
		),
		tags: Type.Optional(
			Type.Array(requiredText(SUB_AGENT_BOUNDS.tagChars, "Task-specific organizational tag."), {
				maxItems: SUB_AGENT_BOUNDS.tags,
				uniqueItems: true,
			}),
		),
		notifyOn: Type.Optional(
			Type.Array(StringEnum(NOTIFICATION_STATES), {
				description: "Important terminal states that may notify the parent after notification delivery is enabled.",
				maxItems: NOTIFICATION_STATES.length,
				uniqueItems: true,
			}),
		),
	},
	{ additionalProperties: false },
);

/**
 * Per-call transport bound only: it bounds one tool result and validation pass,
 * not the live pool. Repeated calls may keep adding children and no active-child
 * count, worker semaphore, or concurrency ceiling exists.
 */
export const subAgentsSpawnSchema = Type.Object(
	{
		agents: Type.Array(dynamicAgentSpecSchema, {
			description:
				`Dynamic child specifications to initialize independently (1-${SUB_AGENT_BOUNDS.spawnBatchAgents} in one call). Every valid entry starts without an active-pool concurrency cap.`,
			minItems: 1,
			maxItems: SUB_AGENT_BOUNDS.spawnBatchAgents,
		}),
	},
	{ additionalProperties: false },
);

export const subAgentsStatusSchema = Type.Object(
	{
		ids: Type.Optional(agentIdsSchema),
		includeRemoved: Type.Optional(
			Type.Boolean({ description: "Include bounded removed/historical records (default false)." }),
		),
		detail: Type.Optional(
			StringEnum(STATUS_DETAIL_LEVELS, {
				description: "Output detail (default compact). timeline includes bounded recent milestones.",
			}),
		),
		eventLimit: Type.Optional(
			Type.Integer({
				description: `Maximum recent events per child when detail=timeline (default 20, max ${SUB_AGENT_BOUNDS.eventTimeline}).`,
				minimum: 1,
				maximum: SUB_AGENT_BOUNDS.eventTimeline,
			}),
		),
		drainUsage: Type.Optional(
			Type.Boolean({
				description:
					"Atomically attach newly accrued child usage to this tool result (default false). Repeated drains report only later accrual.",
			}),
		),
	},
	{ additionalProperties: false },
);

const sendMessageSchema = Type.Object(
	{
		id: agentIdSchema,
		message: requiredText(SUB_AGENT_BOUNDS.objectiveChars, "New assignment, active-assignment, or blocked-resume message."),
		delivery: Type.Optional(
			StringEnum(ACTIVE_DELIVERIES, {
				description:
					"Delivery while running (default followUp). Idle starts a new assignment; blocked resumes its current assignment after resolution.",
			}),
		),
	},
	{ additionalProperties: false },
);

export const subAgentsSendSchema = Type.Object(
	{
		messages: Type.Array(sendMessageSchema, {
			description: "One task-specific new, active, or blocked-resume message per target child; duplicate target IDs are rejected semantically.",
			minItems: 1,
			maxItems: SUB_AGENT_BOUNDS.controlTargets,
		}),
	},
	{ additionalProperties: false },
);

const reconfigureChangeSchema = Type.Object(
	{
		id: agentIdSchema,
		modelPolicy: StringEnum(MODEL_POLICIES, {
			description: "Replacement model policy. explicit requires model; model is invalid for auto or inherit.",
		}),
		model: Type.Optional(explicitModelSchema),
		complexity: Type.Optional(
			StringEnum(COMPLEXITY_TIERS, {
				description: "Replacement complexity tier (default moderate when automatic routing is requested).",
			}),
		),
		thinkingLevel: Type.Optional(StringEnum(THINKING_LEVELS)),
		runningBehavior: Type.Optional(
			StringEnum(RECONFIGURE_RUNNING_BEHAVIORS, {
				description:
					"For a running child, queue the change for its next safe assignment boundary (default) or explicitly abort the current assignment before switching.",
			}),
		),
	},
	{ additionalProperties: false },
);

export const subAgentsReleaseSchema = Type.Object(
	{
		ids: agentIdsSchema,
	},
	{ additionalProperties: false },
);

export const subAgentsReconfigureSchema = Type.Object(
	{
		changes: Type.Array(reconfigureChangeSchema, {
			description: "Per-child model/thinking changes; duplicate target IDs are rejected semantically.",
			minItems: 1,
			maxItems: SUB_AGENT_BOUNDS.controlTargets,
		}),
	},
	{ additionalProperties: false },
);

export const subAgentsWaitSchema = Type.Object(
	{
		ids: Type.Optional(agentIdsSchema),
		condition: Type.Optional(
			StringEnum(WAIT_CONDITIONS, {
				description: "Return when any or all selected children match a requested terminal state (default all).",
			}),
		),
		states: Type.Optional(
			Type.Array(StringEnum(WAIT_STATES), {
				description: "Terminal states that satisfy the barrier (default idle, blocked, failed, or removed).",
				minItems: 1,
				maxItems: WAIT_STATES.length,
				uniqueItems: true,
			}),
		),
		timeoutSeconds: Type.Optional(
			Type.Integer({
				description: `Barrier timeout in seconds (default 120, max ${SUB_AGENT_BOUNDS.waitTimeoutSeconds}).`,
				minimum: 1,
				maximum: SUB_AGENT_BOUNDS.waitTimeoutSeconds,
			}),
		),
	},
	{ additionalProperties: false },
);

export const subAgentsRemoveSchema = Type.Object(
	{
		scope: StringEnum(REMOVE_SCOPES, {
			description: "Remove selected IDs or every live child. scope=selected requires ids; scope=all forbids ids.",
		}),
		ids: Type.Optional(agentIdsSchema),
		mode: Type.Optional(
			StringEnum(REMOVE_MODES, {
				description: "graceful requests a final bounded stop before escalation; abort stops immediately (default graceful).",
			}),
		),
		gracePeriodSeconds: Type.Optional(
			Type.Integer({
				description: `Graceful-stop deadline before forced abort (default 10, max ${SUB_AGENT_BOUNDS.gracefulStopSeconds}).`,
				minimum: 1,
				maximum: SUB_AGENT_BOUNDS.gracefulStopSeconds,
			}),
		),
	},
	{ additionalProperties: false },
);

export type DynamicAgentSpecInput = Static<typeof dynamicAgentSpecSchema>;
export type SubAgentsSpawnInput = Static<typeof subAgentsSpawnSchema>;
export type SubAgentsStatusInput = Static<typeof subAgentsStatusSchema>;
export type SubAgentsSendInput = Static<typeof subAgentsSendSchema>;
export type SubAgentsReleaseInput = Static<typeof subAgentsReleaseSchema>;
export type SubAgentsReconfigureInput = Static<typeof subAgentsReconfigureSchema>;
export type SubAgentsWaitInput = Static<typeof subAgentsWaitSchema>;
export type SubAgentsRemoveInput = Static<typeof subAgentsRemoveSchema>;
