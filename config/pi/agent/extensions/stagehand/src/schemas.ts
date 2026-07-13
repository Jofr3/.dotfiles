import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";

const timeoutMs = (description: string, maximum: number) =>
	Type.Optional(
		Type.Integer({
			description,
			minimum: 1_000,
			maximum,
		}),
	);

const selector = Type.Optional(
	Type.String({
		description: "Optional CSS/XPath selector that scopes the operation.",
		minLength: 1,
		maxLength: 4_000,
	}),
);

const ignoreSelectors = Type.Optional(
	Type.Array(Type.String({ minLength: 1, maxLength: 2_000 }), {
		description: "Selectors to omit from Stagehand's page analysis.",
		maxItems: 25,
	}),
);

const variables = Type.Optional(
	Type.Record(
		Type.String({ pattern: "^[A-Za-z_][A-Za-z0-9_]{0,63}$" }),
		Type.String({ maxLength: 8_000 }),
		{
			description:
				"Values for %name% placeholders. Values are withheld from Stagehand's model, but Pi tool arguments are stored in the session; do not pass secrets here.",
		},
	),
);

export const navigateSchema = Type.Object(
	{
		url: Type.String({
			description: "Absolute http:// or https:// URL to open.",
			minLength: 1,
			maxLength: 16_384,
		}),
		environment: Type.Optional(
			StringEnum(["local", "remote"] as const, {
				description:
					"Where to open the page: local uses installed Chrome/Chromium; remote uses Browserbase. Defaults to local when no managed session or STAGEHAND_ENV setting exists. Overrides STAGEHAND_ENV for this navigation and switches the managed session when needed.",
			}),
		),
		headless: Type.Optional(
			Type.Boolean({
				description:
					"Local launch-mode override. It cannot be used with the default or overridden external CDP attachment; start Chrome itself in the desired headed or headless mode.",
			}),
		),
		tabRef: Type.Optional(
			Type.String({
				description:
					"Exact current tab reference from stagehand_tabs. Activates and navigates that tab. Cannot be combined with newTab=true, environment, or headless.",
				minLength: 1,
				maxLength: 128,
				pattern: "^tab_[a-f0-9]{16}_[1-9][0-9]*_[1-9][0-9]*$",
			}),
		),
		newTab: Type.Optional(
			Type.Boolean({
				description:
					"Create a fresh top-level tab in the reused managed browser and navigate it (default false). newTab=true cannot be combined with tabRef.",
			}),
		),
		waitUntil: Type.Optional(
			StringEnum(["load", "domcontentloaded", "networkidle"] as const, {
				description: "Navigation lifecycle to await (default: domcontentloaded).",
			}),
		),
		timeoutMs: timeoutMs("Navigation timeout in milliseconds (default: 30000).", 120_000),
	},
	{ additionalProperties: false },
);

export const tabsSchema = Type.Object(
	{
		action: StringEnum(["list", "select", "new"] as const, {
			description:
				"list discovers/searches tabs without changing selection; select activates one exact tabRef; new creates and selects an about:blank tab.",
		}),
		query: Type.Optional(
			Type.String({
				description:
					"For action=list only: case-insensitive title or sanitized display-URL search. Search returns candidates and never selects automatically. Queries are stored in Pi session history; avoid sensitive text.",
				minLength: 1,
				maxLength: 500,
			}),
		),
		tabRef: Type.Optional(
			Type.String({
				description: "For action=select only: exact current reference returned by action=list or action=new.",
				minLength: 1,
				maxLength: 128,
				pattern: "^tab_[a-f0-9]{16}_[1-9][0-9]*_[1-9][0-9]*$",
			}),
		),
		maxResults: Type.Optional(
			Type.Integer({
				description: "For action=list only: maximum candidates returned (default: 20).",
				minimum: 1,
				maximum: 50,
			}),
		),
		timeoutMs: timeoutMs("Tab operation timeout in milliseconds (default: 30000).", 120_000),
	},
	{ additionalProperties: false },
);

export const actSchema = Type.Object(
	{
		instruction: Type.Optional(
			Type.String({
				description: "Natural-language action to perform. Provide this or action, not both.",
				minLength: 1,
				maxLength: 16_000,
			}),
		),
		action: Type.Optional(
			Type.Object(
				{
					selector: Type.String({ minLength: 1, maxLength: 8_000 }),
					description: Type.String({ minLength: 1, maxLength: 4_000 }),
					method: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
					arguments: Type.Optional(
						Type.Array(Type.String({ maxLength: 8_000 }), { maxItems: 20 }),
					),
				},
				{ additionalProperties: false },
			),
		),
		variables,
		timeoutMs: timeoutMs("Stagehand act timeout in milliseconds (default: 60000).", 180_000),
	},
	{ additionalProperties: false },
);

export const observeSchema = Type.Object(
	{
		instruction: Type.Optional(
			Type.String({
				description: "What actions or elements to look for. Omit for broadly useful interactive elements.",
				minLength: 1,
				maxLength: 16_000,
			}),
		),
		selector,
		ignoreSelectors,
		variables,
		maxResults: Type.Optional(
			Type.Integer({
				description: "Maximum candidate actions returned (default: 20).",
				minimum: 1,
				maximum: 50,
			}),
		),
		timeoutMs: timeoutMs("Stagehand observe timeout in milliseconds (default: 60000).", 180_000),
	},
	{ additionalProperties: false },
);

export const extractSchema = Type.Object(
	{
		instruction: Type.String({
			description: "Information to extract. Returns Stagehand's schema-less string extraction.",
			minLength: 1,
			maxLength: 16_000,
		}),
		selector,
		ignoreSelectors,
		useScreenshot: Type.Optional(
			Type.Boolean({
				description:
					"Include the current viewport in model input. Only supported by compatible AI SDK clients; default false.",
			}),
		),
		timeoutMs: timeoutMs("Stagehand extract timeout in milliseconds (default: 60000).", 180_000),
	},
	{ additionalProperties: false },
);

export const stateSchema = Type.Object(
	{
		selector,
		ignoreSelectors,
		timeoutMs: timeoutMs("Page-state extraction timeout in milliseconds (default: 45000).", 120_000),
	},
	{ additionalProperties: false },
);

export const agentSchema = Type.Object(
	{
		instruction: Type.String({
			description:
				"A bounded multi-step browser task. State the goal, allowed scope, and whether consequential actions are authorized.",
			minLength: 1,
			maxLength: 24_000,
		}),
		confirmAutonomousTask: Type.Boolean({
			description:
				"Must be true to acknowledge that autonomous browser control was intentionally requested. The extension also requires operator opt-in and task confirmation.",
		}),
		allowConsequentialActions: Type.Optional(
			Type.Boolean({
				description:
					"Allow the scoped task to perform explicitly authorized submissions, messages, purchases, deletion, or other external side effects (default false). Requires a stronger operator gate.",
			}),
		),
		mode: Type.Optional(
			StringEnum(["dom", "hybrid"] as const, {
				description: "Agent mode (default: dom). Hybrid requires STAGEHAND_EXPERIMENTAL=true and a coordinate/vision-capable provider model.",
			}),
		),
		maxSteps: Type.Optional(
			Type.Integer({
				description: "Maximum agent steps (default: 20).",
				minimum: 1,
				maximum: 50,
			}),
		),
		toolTimeoutMs: timeoutMs("Timeout for each agent tool call (default: 45000).", 120_000),
		overallTimeoutMs: timeoutMs(
			"Hard host-side deadline for the whole task (default: 180000). The browser session is discarded if reached.",
			300_000,
		),
		highlightCursor: Type.Optional(
			Type.Boolean({ description: "Show the agent cursor overlay in screenshots (default: false)." }),
		),
		useSearch: Type.Optional(
			Type.Boolean({
				description: "Enable Browserbase Search for the task (default: false; requires Browserbase credentials).",
			}),
		),
		variables,
	},
	{ additionalProperties: false },
);

export const screenshotSchema = Type.Object(
	{
		fullPage: Type.Optional(Type.Boolean({ description: "Capture the full scrollable page (default: false)." })),
		format: Type.Optional(
			StringEnum(["png", "jpeg"] as const, {
				description: "Image format (default: jpeg).",
			}),
		),
		quality: Type.Optional(
			Type.Integer({
				description: "JPEG quality from 20 to 95 (default: 75). Ignored for PNG.",
				minimum: 20,
				maximum: 95,
			}),
		),
		attachImage: Type.Optional(
			Type.Boolean({
				description:
					"Attach a resized image to the tool result (default: false). Attached base64 is persisted when Pi session persistence is enabled; avoid for sensitive pages.",
			}),
		),
		timeoutMs: timeoutMs("Screenshot timeout in milliseconds (default: 30000).", 120_000),
	},
	{ additionalProperties: false },
);

export const emptySchema = Type.Object({}, { additionalProperties: false });

export type NavigateInput = Static<typeof navigateSchema>;
export type TabsInput = Static<typeof tabsSchema>;
export type ActInput = Static<typeof actSchema>;
export type ObserveInput = Static<typeof observeSchema>;
export type ExtractInput = Static<typeof extractSchema>;
export type StateInput = Static<typeof stateSchema>;
export type AgentInput = Static<typeof agentSchema>;
export type ScreenshotInput = Static<typeof screenshotSchema>;
