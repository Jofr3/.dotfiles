import { defineTool } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import type { AgentReportSubmission } from "../types.ts";
import { SUB_AGENT_BOUNDS } from "../types.ts";

export const REPORT_TO_PARENT_TOOL_NAME = "report_to_parent" as const;

const REPORT_STATES = ["progress", "blocked", "result"] as const;
const REPORT_STATE_SET = new Set<string>(REPORT_STATES);
const NON_WHITESPACE_PATTERN = "\\S";

function requiredText(maxLength: number, description: string) {
	return Type.String({
		description,
		minLength: 1,
		maxLength,
		pattern: NON_WHITESPACE_PATTERN,
	});
}

export const reportToParentSchema = Type.Object(
	{
		state: StringEnum(REPORT_STATES, {
			description:
				"Report progress, an orchestration blocker, or the assignment result to the owning parent.",
		}),
		summary: requiredText(
			SUB_AGENT_BOUNDS.reportSummaryChars,
			"Bounded standalone summary for the parent. Do not include credentials or secrets.",
		),
		details: Type.Optional(
			requiredText(
				SUB_AGENT_BOUNDS.reportDetailsChars,
				"Optional bounded supporting detail. Do not include credentials or secrets.",
			),
		),
		files: Type.Optional(
			Type.Array(
				requiredText(
					SUB_AGENT_BOUNDS.contextPathChars,
					"Relevant workspace-relative file path.",
				),
				{
					description: "Relevant files, bounded and deduplicated.",
					maxItems: SUB_AGENT_BOUNDS.reportFiles,
					uniqueItems: true,
				},
			),
		),
		needs: Type.Optional(
			requiredText(
				SUB_AGENT_BOUNDS.reportNeedsChars,
				"For a blocker, the bounded parent decision, information, or action needed.",
			),
		),
	},
	{ additionalProperties: false },
);

export type ReportToParentInput = Static<typeof reportToParentSchema>;

export interface ReportToParentToolDetails {
	version: 1;
	recorded: true;
	state: AgentReportSubmission["state"];
}

export type ReportToParentHandler = (
	report: AgentReportSubmission,
) => void | Promise<void>;

export class ReportToParentError extends Error {
	readonly code: "invalid_report" | "cancelled" | "report_failed";

	constructor(
		code: "invalid_report" | "cancelled" | "report_failed",
		message: string,
	) {
		super(message);
		this.name = "ReportToParentError";
		this.code = code;
	}
}

function boundedRequiredText(value: unknown, field: string, maxChars: number): string {
	if (typeof value !== "string") {
		throw new ReportToParentError("invalid_report", `${field} must be a string`);
	}
	const text = value.trim();
	if (!text || text.length > maxChars) {
		throw new ReportToParentError(
			"invalid_report",
			`${field} must contain between 1 and ${maxChars} characters`,
		);
	}
	return text;
}

function boundedOptionalText(
	value: unknown,
	field: string,
	maxChars: number,
): string | undefined {
	if (value === undefined) return undefined;
	return boundedRequiredText(value, field, maxChars);
}

export function normalizeReportToParentInput(input: ReportToParentInput): AgentReportSubmission {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new ReportToParentError("invalid_report", "A report object is required");
	}
	if (!REPORT_STATE_SET.has(input.state)) {
		throw new ReportToParentError("invalid_report", "The report state is invalid");
	}
	if (input.files !== undefined && !Array.isArray(input.files)) {
		throw new ReportToParentError("invalid_report", "report.files must be an array");
	}
	if ((input.files?.length ?? 0) > SUB_AGENT_BOUNDS.reportFiles) {
		throw new ReportToParentError(
			"invalid_report",
			`report.files exceeds ${SUB_AGENT_BOUNDS.reportFiles} items`,
		);
	}
	const files = [...new Set(
		(input.files ?? []).map((file, index) =>
			boundedRequiredText(
				file,
				`report.files[${index}]`,
				SUB_AGENT_BOUNDS.contextPathChars,
			),
		),
	)];
	return {
		state: input.state,
		summary: boundedRequiredText(
			input.summary,
			"report.summary",
			SUB_AGENT_BOUNDS.reportSummaryChars,
		),
		details: boundedOptionalText(
			input.details,
			"report.details",
			SUB_AGENT_BOUNDS.reportDetailsChars,
		),
		files,
		needs: boundedOptionalText(
			input.needs,
			"report.needs",
			SUB_AGENT_BOUNDS.reportNeedsChars,
		),
	};
}

/**
 * Creates the one child-only reporting capability for an exact owning runtime.
 * The public schema deliberately has no agent ID or peer/manager control field;
 * routing is fixed by the closure supplied by the assignment runner.
 */
export function createReportToParentTool(onReport: ReportToParentHandler) {
	if (typeof onReport !== "function") {
		throw new ReportToParentError(
			"invalid_report",
			"A parent report handler is required",
		);
	}

	return defineTool<typeof reportToParentSchema, ReportToParentToolDetails>({
		name: REPORT_TO_PARENT_TOOL_NAME,
		label: "Report to Parent",
		description:
			"Record one bounded progress, blocker, or result report for this child assignment's owning parent. This tool cannot address or control another child.",
		parameters: reportToParentSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params, signal) {
			if (signal?.aborted) {
				throw new ReportToParentError("cancelled", "The parent report was cancelled");
			}
			const report = normalizeReportToParentInput(params);
			try {
				await onReport(report);
			} catch (error) {
				if (error instanceof ReportToParentError) throw error;
				throw new ReportToParentError(
					"report_failed",
					"Could not record the report for the parent",
				);
			}
			return {
				content: [{ type: "text", text: `Recorded ${report.state} report for the parent.` }],
				details: {
					version: 1,
					recorded: true,
					state: report.state,
				},
			};
		},
	});
}
