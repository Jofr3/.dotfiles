import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { DynamicSelectionSession, DYNAMIC_TOOL_NAMES } from "./dynamic.ts";
import { disableResolverLifecycle, shutdownLifecycle } from "./lifecycle.ts";
import { type LoadedResolverBindings, loadResolverBindings } from "./resolver-bindings.ts";
import { OnePasswordManager } from "./manager.ts";
import {
	DYNAMIC_ENABLE_CONFIRMATION,
	RESOLVER_ENABLE_CONFIRMATION,
	statusPayload,
	statusText,
} from "./presentation.ts";
import {
	type CachedRequirementRecord,
	RequirementMetadataCache,
} from "./requirements.ts";
import { SecretResolverProvider } from "./resolver.ts";
import { REQUEST_DEADLINE_MS } from "./safety.ts";

const METADATA_ID_SCHEMA = Type.String({
	description: "Exact opaque session handle returned by a prior 1Password dynamic discovery tool",
	pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$",
	maxLength: 128,
});
const QUERY_SCHEMA = Type.Optional(Type.String({
	description: "Optional local case-insensitive title filter; no raw SDK query is created",
	minLength: 1,
	maxLength: 256,
}));
const LIMIT_SCHEMA = Type.Optional(Type.Integer({
	description: "Maximum records to emit (default 20, hard maximum 50)",
	minimum: 1,
	maximum: 50,
}));
const REQUIREMENT_ID_SCHEMA = Type.String({
	description: "Exact opaque requirementId returned by a prior successful mcp_toolbox_requirements call",
	pattern: "^mcp1-(H|A|B)-[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$",
	minLength: 50,
	maxLength: 50,
});

const DYNAMIC_GUIDANCE = [
	"For dynamic 1Password selection, first call mcp_toolbox_requirements with the exact MCP server/tool and wait; use only a returned requirementId. Then call onepassword_list_vaults and wait; call onepassword_list_items with one emitted opaque vaultId handle and wait; call onepassword_list_fields with emitted opaque vaultId/itemId handles and wait; then call onepassword_grant_secret with the emitted opaque handles and that requirementId, and wait for successful approval output.",
	"Call mcp_toolbox_call only in a later tool turn after onepassword_grant_secret succeeds. Never put grant and MCP Toolbox calls in the same or a parallel tool batch; an admitted matching resolver request consumes the one-shot grant even when 1Password resolution or the downstream MCP call fails.",
	"Dynamic selection does not create MCP configuration: MCP Toolbox must already declare the exact 1Password dynamic reference {resolver:{provider:\"onepassword-secrets-manager\",dynamic:true}}. Never invent, alter, or manually configure a requirement ID, slot, purpose, provider, or credential value.",
];

export interface OnePasswordExtensionDependencies {
	manager?: OnePasswordManager;
	loadBindings?: () => Promise<LoadedResolverBindings>;
}

export function registerOnePasswordSecretsManagerExtension(
	pi: ExtensionAPI,
	dependencies: OnePasswordExtensionDependencies = {},
): void {
	const manager = dependencies.manager ?? new OnePasswordManager();
	const loadBindings = dependencies.loadBindings ?? (() => loadResolverBindings());
	const resolver = new SecretResolverProvider(manager);
	let invalidateDynamicRequirements: ((records: readonly CachedRequirementRecord[]) => void) | undefined;
	const requirements = new RequirementMetadataCache((records) => {
		for (const record of records) resolver.revokeDynamicGrant(record.requirementId, record.purpose);
		invalidateDynamicRequirements?.(records);
	}, () => resolver.status().mode === "dynamic");
	const dynamic = new DynamicSelectionSession(manager, resolver, requirements);
	invalidateDynamicRequirements = (records) => { dynamic.invalidateRequirements(records); };
	resolver.start(pi.events);
	requirements.start(pi.events);
	let transition = 0;
	let dynamicToolsRegistered = false;
	const consentControllers = new Set<AbortController>();

	const abortPendingConsents = (): void => {
		for (const controller of consentControllers) {
			try { Reflect.apply(AbortController.prototype.abort, controller, ["onepassword-mode-transition"]); } catch { /* Transition ticket remains authoritative. */ }
		}
		consentControllers.clear();
	};
	const requestConsent = async (
		confirm: (title: string, message: string, options: { timeout: number; signal: AbortSignal }) => Promise<boolean>,
		title: string,
		message: string,
	): Promise<boolean> => {
		const controller = new AbortController();
		consentControllers.add(controller);
		try {
			return await confirm(title, message, { timeout: REQUEST_DEADLINE_MS, signal: controller.signal });
		} catch {
			return false;
		} finally {
			consentControllers.delete(controller);
		}
	};

	const deactivateDynamicTools = (): void => {
		const dynamicNames = new Set<string>(DYNAMIC_TOOL_NAMES);
		pi.setActiveTools(pi.getActiveTools().filter((name) => !dynamicNames.has(name)));
	};
	const activateDynamicTools = (): void => {
		pi.setActiveTools([...new Set([...pi.getActiveTools(), ...DYNAMIC_TOOL_NAMES])]);
	};
	const disableAll = async (): Promise<void> => {
		transition += 1;
		abortPendingConsents();
		const drain = disableResolverLifecycle(resolver, manager, dynamic, requirements);
		deactivateDynamicTools();
		await drain;
	};

	const registerDynamicTools = (): void => {
		if (dynamicToolsRegistered) return;
		dynamicToolsRegistered = true;
		pi.registerTool({
			name: "onepassword_list_vaults",
			label: "1Password List Vaults",
			description: "List at most 50 accessible vault metadata records after dynamic consent. Emits only an opaque session handle, title, vault type, and active item count; supports a local title query and limit.",
			promptSnippet: "List bounded safe 1Password vault metadata after dynamic consent",
			promptGuidelines: DYNAMIC_GUIDANCE,
			executionMode: "sequential",
			parameters: Type.Object({ query: QUERY_SCHEMA, limit: LIMIT_SCHEMA }, { additionalProperties: false }),
			async execute(_toolCallId, params, signal) {
				return dynamic.listVaults(params, signal);
			},
		});
		pi.registerTool({
			name: "onepassword_list_items",
			label: "1Password List Items",
			description: "List at most 50 safe item-overview metadata records in one exact previously discovered vault. Emits only an opaque session handle, title, category, and state.",
			promptSnippet: "List bounded safe 1Password item metadata in one discovered vault",
			executionMode: "sequential",
			parameters: Type.Object({
				vaultId: METADATA_ID_SCHEMA,
				query: QUERY_SCHEMA,
				state: Type.Optional(Type.String({ enum: ["active", "archived", "all"] })),
				limit: LIMIT_SCHEMA,
			}, { additionalProperties: false }),
			async execute(_toolCallId, params, signal) {
				return dynamic.listItems(params, signal);
			},
		});
		pi.registerTool({
			name: "onepassword_list_fields",
			label: "1Password List Fields",
			description: "List at most 50 safe field metadata records for one exact previously discovered item. The official SDK decrypts the full item, but this tool emits only opaque session handles plus field title/type and section title.",
			promptSnippet: "List bounded safe field metadata for one discovered 1Password item",
			executionMode: "sequential",
			parameters: Type.Object({
				vaultId: METADATA_ID_SCHEMA,
				itemId: METADATA_ID_SCHEMA,
				query: QUERY_SCHEMA,
				limit: LIMIT_SCHEMA,
			}, { additionalProperties: false }),
			async execute(_toolCallId, params, signal) {
				return dynamic.listFields(params, signal);
			},
		});
		pi.registerTool({
			name: "onepassword_grant_secret",
			label: "1Password Grant Secret",
			description: "Re-fetch and verify one previously discovered field, require one exact prior cached MCP Toolbox requirement ID, ask the user to approve its verified server/tool/target metadata, and stage an in-memory one-shot grant. Never returns a value or secret reference.",
			promptSnippet: "Request explicit approval for one one-shot MCP Toolbox secret grant",
			executionMode: "sequential",
			parameters: Type.Object({
				vaultId: METADATA_ID_SCHEMA,
				itemId: METADATA_ID_SCHEMA,
				fieldId: METADATA_ID_SCHEMA,
				requirementId: REQUIREMENT_ID_SCHEMA,
			}, { additionalProperties: false }),
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				return dynamic.grantSecret(params, signal, ctx);
			},
		});
	};

	pi.registerTool({
		name: "onepassword_sm_status",
		label: "1Password SM Status",
		description: "Report safe, offline 1Password resolver status. Never reads bindings, initializes the SDK, authenticates, or contacts 1Password.",
		promptSnippet: "Inspect offline 1Password resolver configuration and aggregate state",
		parameters: Type.Object({}, { additionalProperties: false }),
		async execute() {
			const payload = statusPayload(manager.status(), resolver.status());
			return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
		},
	});

	pi.registerCommand("onepassword-sm", {
		description: "Manage static or dynamic consent-gated in-memory 1Password resolution",
		getArgumentCompletions: (prefix) => {
			const values = ["status", "resolver-enable", "resolver-disable", "dynamic-enable", "dynamic-disable"];
			const matches = values.filter((value) => value.startsWith(prefix.trim()));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase();
			if (action === "" || action === "status") {
				if (ctx.hasUI) ctx.ui.notify(statusText(manager.status(), resolver.status()), "info");
				return;
			}
			if (action === "resolver-enable") {
				if (!ctx.hasUI) return;
				if (resolver.status().enabled) {
					ctx.ui.notify("The 1Password secret resolver is already enabled for this session; disable it before changing modes.", "info");
					return;
				}
				abortPendingConsents();
				const ticket = ++transition;
				const approved = await requestConsent(
					ctx.ui.confirm.bind(ctx.ui),
					"Enable protected static 1Password resolver",
					RESOLVER_ENABLE_CONFIRMATION,
				);
				if (!approved || ticket !== transition) {
					ctx.ui.notify("The 1Password secret resolver remains disabled.", "info");
					return;
				}
				try {
					await ctx.waitForIdle();
					if (ticket !== transition || resolver.status().mode !== "disabled") return;
					const loaded = await loadBindings();
					if (ticket !== transition || resolver.status().mode !== "disabled") return;
					resolver.enable(loaded.config);
					deactivateDynamicTools();
					ctx.ui.notify(
						`1Password static resolver enabled for this session with ${loaded.config.bindings.length} protected binding(s). Authentication remains lazy until the first accepted secret resolution.`,
						"warning",
					);
				} catch {
					if (ticket === transition) await disableAll();
					ctx.ui.notify("The protected resolver binding configuration is missing, invalid, or unsafe; the resolver remains disabled.", "error");
				}
				return;
			}
			if (action === "dynamic-enable") {
				if (!ctx.hasUI) return;
				if (resolver.status().enabled) {
					ctx.ui.notify("The 1Password secret resolver is already enabled for this session; disable it before changing modes.", "info");
					return;
				}
				abortPendingConsents();
				const ticket = ++transition;
				const approved = await requestConsent(
					ctx.ui.confirm.bind(ctx.ui),
					"Enable dynamic 1Password selection",
					DYNAMIC_ENABLE_CONFIRMATION,
				);
				if (!approved || ticket !== transition) {
					ctx.ui.notify("Dynamic 1Password selection remains disabled.", "info");
					return;
				}
				try {
					await ctx.waitForIdle();
					if (ticket !== transition || resolver.status().mode !== "disabled") return;
					dynamic.reset();
					resolver.enableDynamic();
					requirements.enable();
					registerDynamicTools();
					activateDynamicTools();
					ctx.ui.notify(
						"Dynamic 1Password selection enabled for this session. Safe 1Password and MCP requirement metadata is model/event/session-visible; each exact cached-requirement one-shot grant still requires separate approval. Authentication remains lazy.",
						"warning",
					);
				} catch {
					if (ticket === transition) await disableAll();
					ctx.ui.notify("Dynamic 1Password selection could not be enabled safely.", "error");
				}
				return;
			}
			if (action === "resolver-disable" || action === "dynamic-disable") {
				await disableAll();
				if (ctx.hasUI) {
					ctx.ui.notify(
						"1Password resolution disabled; cached MCP requirements, discoveries, and one-shot grants were cleared, pending callbacks were revoked, and cached SDK/client references were released.",
						"info",
					);
				}
				return;
			}
			if (ctx.hasUI) {
				ctx.ui.notify(
					"Usage: /onepassword-sm [status|resolver-enable|resolver-disable|dynamic-enable|dynamic-disable]",
					"warning",
				);
			}
		},
	});

	pi.on("turn_end", () => { resolver.armDynamicGrants(); });
	pi.on("session_before_switch", async () => { await disableAll(); });
	pi.on("session_before_fork", async () => { await disableAll(); });
	pi.on("session_shutdown", async (_event, ctx) => {
		transition += 1;
		abortPendingConsents();
		const drain = shutdownLifecycle(resolver, manager, dynamic, requirements);
		deactivateDynamicTools();
		await drain;
		if (ctx.hasUI) ctx.ui.setStatus("onepassword-sm", undefined);
	});
}

export default function onePasswordSecretsManagerExtension(pi: ExtensionAPI): void {
	registerOnePasswordSecretsManagerExtension(pi);
}
