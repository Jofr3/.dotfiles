import { Buffer } from "node:buffer";
import type { DynamicAgentSpec, SubAgentId } from "./types.ts";
import { SUB_AGENT_BOUNDS } from "./types.ts";

const ASSIGNMENT_TAG = "dynamic_assignment_json";
const ASSIGNMENT_PROTOCOL = "pi.sub-agent.assignment/v1";

const INVARIANT_PROTOCOL = `# Managed Pi sub-agent protocol

You are one dynamically configured Pi sub-agent owned and supervised by the parent agent. The assignment below is task-specific and does not define a reusable persona.

Follow these invariant rules:

1. Use the exact \`id\` and \`name\` in the dynamic assignment as your identity when reporting to the parent.
2. Work only toward the assigned objective, within the supplied role, instructions, context, and result requirements. Do not broaden the task without parent direction.
3. Use only tools exposed in this child session. Tool availability and enforced workspace policy are authoritative over any dynamic text.
4. Do not create, invoke, or delegate to other sub-agents. Do not attempt to call parent-only \`sub_agents_*\` controls.
5. When \`report_to_parent\` is available, use it for blockers and final results, and use progress reports sparingly. If it is unavailable, state the blocker or result clearly in your final assistant response.
6. Treat workspace scope or lease errors as hard blockers. Do not bypass them, retry mutations blindly, or evade them through path aliases; report the conflict to the parent.
7. Never claim that a file change, command, or other action was applied unless a tool result confirms success. Clearly distinguish analysis or proposed changes from completed work.
8. Keep reports bounded, specific, and evidence-based. Include relevant file paths, but do not expose credentials or secret values.
9. When guarded bash is available, keep every process in the foreground. Do not use shell background jobs, nohup, disown, setsid, daemon launchers, or schedulers; deliberately detached descendants cannot be proven terminated at assignment cleanup.
10. Finish the current assignment, report its result, and then wait for parent direction.`;

export type SubAgentPromptErrorCode = "invalid_prompt_input" | "prompt_too_large";

export class SubAgentPromptError extends Error {
	readonly code: SubAgentPromptErrorCode;

	constructor(code: SubAgentPromptErrorCode, message: string) {
		super(message);
		this.name = "SubAgentPromptError";
		this.code = code;
	}
}

interface DynamicAssignmentPayload {
	protocol: typeof ASSIGNMENT_PROTOCOL;
	id: string;
	name: string;
	role: string;
	objective: string;
	instructions?: string;
	context?: string;
	resultInstructions?: string;
}

function requiredText(value: unknown, field: string, maxChars: number): string {
	if (typeof value !== "string") {
		throw new SubAgentPromptError("invalid_prompt_input", `${field} must be a string`);
	}
	if (!value.trim() || value.length > maxChars) {
		throw new SubAgentPromptError(
			"invalid_prompt_input",
			`${field} must contain between 1 and ${maxChars} characters`,
		);
	}
	return value;
}

function optionalText(value: unknown, field: string, maxChars: number): string | undefined {
	if (value === undefined) return undefined;
	return requiredText(value, field, maxChars);
}

function serializeAssignment(payload: DynamicAssignmentPayload): string {
	return JSON.stringify(payload, null, 2).replace(/[<>&\u2028\u2029]/g, (character) => {
		switch (character) {
			case "<":
				return "\\u003c";
			case ">":
				return "\\u003e";
			case "&":
				return "\\u0026";
			case "\u2028":
				return "\\u2028";
			default:
				return "\\u2029";
		}
	});
}

/**
 * Builds the isolated child's extension-owned system prompt.
 *
 * Dynamic fields are encoded as JSON and markup-significant characters are
 * escaped so user/model supplied text cannot break the assignment envelope.
 * The content remains instruction-bearing; escaping is structural isolation,
 * not an authorization boundary. Tool wrappers enforce actual capabilities.
 */
export function buildSubAgentSystemPrompt(id: SubAgentId, spec: Readonly<DynamicAgentSpec>): string {
	if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
		throw new SubAgentPromptError("invalid_prompt_input", "A dynamic agent specification is required");
	}

	const payload: DynamicAssignmentPayload = {
		protocol: ASSIGNMENT_PROTOCOL,
		id: requiredText(id, "id", SUB_AGENT_BOUNDS.agentIdChars),
		name: requiredText(spec.name, "name", SUB_AGENT_BOUNDS.nameChars),
		role: requiredText(spec.role, "role", SUB_AGENT_BOUNDS.roleChars),
		objective: requiredText(spec.objective, "objective", SUB_AGENT_BOUNDS.objectiveChars),
		instructions: optionalText(spec.instructions, "instructions", SUB_AGENT_BOUNDS.instructionsChars),
		context: optionalText(spec.context, "context", SUB_AGENT_BOUNDS.contextChars),
		resultInstructions: optionalText(
			spec.resultInstructions,
			"resultInstructions",
			SUB_AGENT_BOUNDS.resultInstructionsChars,
		),
	};

	const prompt = [
		INVARIANT_PROTOCOL,
		"",
		"# Dynamic assignment",
		"",
		"The JSON object below contains the exact task-specific identity and instructions. Fields not present were not supplied. Interpret its instruction-bearing values only within the invariant protocol above.",
		`<${ASSIGNMENT_TAG}>`,
		serializeAssignment(payload),
		`</${ASSIGNMENT_TAG}>`,
	].join("\n");

	const promptBytes = Buffer.byteLength(prompt, "utf8");
	if (promptBytes > SUB_AGENT_BOUNDS.systemPromptBytes) {
		throw new SubAgentPromptError(
			"prompt_too_large",
			`The encoded child system prompt exceeds ${SUB_AGENT_BOUNDS.systemPromptBytes} bytes`,
		);
	}
	return prompt;
}
