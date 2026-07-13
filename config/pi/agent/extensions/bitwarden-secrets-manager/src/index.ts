import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { disableResolverLifecycle, shutdownLifecycle } from "./lifecycle.ts";
import { BitwardenManager, type ManagerStatus } from "./manager.ts";
import { loadResolverBindings } from "./resolver-bindings.ts";
import { SecretResolverProvider, type ResolverProviderStatus } from "./resolver.ts";
import {
	asPublicError,
	assertOrganizationId,
	MAX_RESULT_LIMIT,
	normalizeResultLimit,
	PublicError,
	REQUEST_DEADLINE_MS,
	SDK_PACKAGE,
	SDK_VERSION,
} from "./safety.ts";

const OrganizationListParameters = Type.Object(
	{
		organizationId: Type.String({
			description: "Canonical lowercase Bitwarden organization UUID",
			minLength: 36,
			maxLength: 36,
			pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
		}),
		limit: Type.Optional(
			Type.Integer({
				description: `Maximum metadata records to return (default 20, maximum ${MAX_RESULT_LIMIT})`,
				minimum: 1,
				maximum: MAX_RESULT_LIMIT,
			}),
		),
	},
	{ additionalProperties: false },
);

function statusPayload(
	status: ManagerStatus,
	metadataEnabled: boolean,
	resolver: ResolverProviderStatus,
) {
	return {
		extension: "Bitwarden Secrets Manager",
		sdk: `${SDK_PACKAGE}@${SDK_VERSION}`,
		clientPhase: status.phase,
		metadataToolsEnabled: metadataEnabled,
		accessTokenConfigured: status.accessTokenConfigured,
		endpointOverrides: status.endpointOverrides,
		metadataCallsUsed: status.metadataCallsUsed,
		metadataCallLimit: status.metadataCallLimit,
		resolverEnabled: resolver.enabled,
		resolverBindingCount: resolver.bindingCount,
		resolverCallsUsed: resolver.callsUsed,
		resolverCallLimit: resolver.callLimit,
		resolverPending: resolver.pending,
		resolverPendingLimit: resolver.pendingLimit,
		offline: true,
		notice: "Status did not initialize the SDK or make a network request.",
	};
}

function statusText(
	status: ManagerStatus,
	metadataEnabled: boolean,
	resolver: ResolverProviderStatus,
): string {
	const payload = statusPayload(status, metadataEnabled, resolver);
	return [
		`${payload.extension}: ${payload.clientPhase}`,
		`SDK: ${payload.sdk}`,
		`Metadata tools: ${payload.metadataToolsEnabled ? "enabled" : "disabled"}`,
		`BWS_ACCESS_TOKEN configured: ${payload.accessTokenConfigured ? "yes" : "no"}`,
		`Endpoint overrides: ${payload.endpointOverrides}`,
		`Approved metadata calls: ${payload.metadataCallsUsed}/${payload.metadataCallLimit}`,
		`Secret resolver: ${payload.resolverEnabled ? "enabled" : "disabled"}`,
		`Active resolver bindings: ${payload.resolverBindingCount}`,
		`Resolver calls: ${payload.resolverCallsUsed}/${payload.resolverCallLimit}`,
		`Pending resolver calls: ${payload.resolverPending}/${payload.resolverPendingLimit}`,
		payload.notice,
	].join("\n");
}

async function confirmMetadataDisclosure(
	kind: "projects" | "secrets",
	organizationId: string,
	limit: number,
	signal: AbortSignal | undefined,
	ctx: ExtensionContext,
): Promise<void> {
	if (!ctx.hasUI) throw new PublicError("consent");
	if (signal?.aborted) throw new PublicError("consent");

	const label = kind === "projects" ? "project records (IDs and names)" : "secret identifiers (IDs and keys)";
	let approved = false;
	try {
		approved = await ctx.ui.confirm(
			"Bitwarden metadata disclosure",
			`Allow one read-only Bitwarden request to return up to ${limit} ${label} for organization ${organizationId}? This metadata will be sent to the active model, emitted in Pi tool/RPC events, and normally saved in the Pi session. No secret values will be requested.`,
			{ signal, timeout: REQUEST_DEADLINE_MS },
		);
	} catch {
		throw new PublicError("consent");
	}
	if (!approved) throw new PublicError("consent");
}

export default function bitwardenSecretsManagerExtension(pi: ExtensionAPI) {
	const manager = new BitwardenManager();
	const resolver = new SecretResolverProvider(manager);
	resolver.start(pi.events);
	const metadataToolNames = ["bitwarden_sm_list_projects", "bitwarden_sm_list_secrets"];
	let metadataEnabled = false;
	let metadataToolsRegistered = false;

	pi.registerTool({
		name: "bitwarden_sm_status",
		label: "Bitwarden SM Status",
		description: "Report safe, offline Bitwarden Secrets Manager extension status. Never initializes the SDK or contacts Bitwarden.",
		promptSnippet: "Inspect offline Bitwarden Secrets Manager extension configuration and state",
		parameters: Type.Object({}, { additionalProperties: false }),
		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
			const status = manager.status();
			const payload = statusPayload(status, metadataEnabled, resolver.status());
			return {
				content: [{ type: "text", text: JSON.stringify(payload) }],
				details: payload,
			};
		},
	});

	const registerMetadataTool = (kind: "projects" | "secrets"): void => {
		const isProjects = kind === "projects";
		pi.registerTool({
			name: isProjects ? "bitwarden_sm_list_projects" : "bitwarden_sm_list_secrets",
			label: isProjects ? "List Bitwarden Project Metadata" : "List Bitwarden Secret Metadata",
			description: isProjects
				? "List up to 50 project IDs and names. Read-only and metadata-only; requires /bitwarden-sm enable plus per-call UI approval. Output is bounded to 32 KiB/500 lines and is never written to a fallback file."
				: "List up to 50 secret IDs and keys using the SDK identifier-list API. Never fetches secret values; requires /bitwarden-sm enable plus per-call UI approval. Output is bounded to 32 KiB/500 lines and is never written to a fallback file.",
			promptSnippet: isProjects
				? "List consent-gated Bitwarden project identifier metadata"
				: "List consent-gated Bitwarden secret identifier metadata without values",
			promptGuidelines: [
				`Use ${isProjects ? "bitwarden_sm_list_projects" : "bitwarden_sm_list_secrets"} only after the user explicitly enables Bitwarden metadata tools; never claim it returns secret values.`,
			],
			parameters: OrganizationListParameters,
			executionMode: "sequential",
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				try {
					if (!metadataEnabled) throw new PublicError("disabled");
					assertOrganizationId(params.organizationId);
					const limit = normalizeResultLimit(params.limit);
					await confirmMetadataDisclosure(kind, params.organizationId, limit, signal, ctx);
					return await manager.listMetadata(kind, params.organizationId, limit, signal);
				} catch (error) {
					throw asPublicError(error);
				}
			},
		});
	};

	const ensureMetadataToolsRegistered = (): void => {
		if (!metadataToolsRegistered) {
			registerMetadataTool("projects");
			registerMetadataTool("secrets");
			metadataToolsRegistered = true;
		}
		pi.setActiveTools([...new Set([...pi.getActiveTools(), ...metadataToolNames])]);
	};

	pi.registerCommand("bitwarden-sm", {
		description: "Manage Bitwarden metadata tools and the consent-gated in-memory secret resolver",
		getArgumentCompletions: (prefix) => {
			const values = ["status", "enable", "disable", "resolver-enable", "resolver-disable"];
			const matches = values.filter((value) => value.startsWith(prefix.trim()));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase();
			if (action === "" || action === "status") {
				if (ctx.hasUI) ctx.ui.notify(statusText(manager.status(), metadataEnabled, resolver.status()), "info");
				return;
			}
			if (action === "enable") {
				ensureMetadataToolsRegistered();
				metadataEnabled = true;
				if (ctx.hasUI) {
					ctx.ui.notify("Bitwarden metadata tools enabled for this session. Every request still requires approval.", "warning");
				}
				return;
			}
			if (action === "disable") {
				metadataEnabled = false;
				await ctx.waitForIdle();
				await manager.reset();
				if (metadataToolsRegistered) {
					pi.setActiveTools(pi.getActiveTools().filter((name) => !metadataToolNames.includes(name)));
				}
				if (ctx.hasUI) ctx.ui.notify("Bitwarden metadata tools disabled; cached client references were released.", "info");
				return;
			}
			if (action === "resolver-enable") {
				if (!ctx.hasUI) return;
				if (resolver.status().enabled) {
					ctx.ui.notify("The Bitwarden secret resolver is already enabled for this session.", "info");
					return;
				}
				let approved = false;
				try {
					approved = await ctx.ui.confirm(
						"Enable Bitwarden secret resolver",
						"Load the protected global binding file and allow only its exact consumer/slot/purpose tuples to fetch Bitwarden secret values in memory for trusted extensions? Values cross only through one-shot callbacks and are not shown by this extension. Pi's process-wide event bus is not an authentication boundary; enable only when every loaded extension is trusted. Enablement ends on disable, reload, session replacement, or shutdown.",
						{ timeout: REQUEST_DEADLINE_MS },
					);
				} catch {
					approved = false;
				}
				if (!approved) {
					ctx.ui.notify("The Bitwarden secret resolver remains disabled.", "info");
					return;
				}
				try {
					await ctx.waitForIdle();
					const loaded = await loadResolverBindings();
					resolver.enable(loaded.config);
					ctx.ui.notify(
						`Bitwarden secret resolver enabled for this session with ${loaded.config.bindings.length} protected binding(s).`,
						"warning",
					);
				} catch {
					await resolver.disable();
					ctx.ui.notify("The protected resolver binding configuration is missing, invalid, or unsafe; the resolver remains disabled.", "error");
				}
				return;
			}
			if (action === "resolver-disable") {
				await disableResolverLifecycle(resolver, manager);
				if (ctx.hasUI) {
					ctx.ui.notify(
						"Bitwarden secret resolver disabled; pending resolver callbacks were revoked and cached client references were released. Metadata remains enabled if it was enabled.",
						"info",
					);
				}
				return;
			}
			if (ctx.hasUI) {
				ctx.ui.notify("Usage: /bitwarden-sm [status|enable|disable|resolver-enable|resolver-disable]", "warning");
			}
		},
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		metadataEnabled = false;
		await shutdownLifecycle(resolver, manager);
		if (ctx.hasUI) ctx.ui.setStatus("bitwarden-sm", undefined);
	});
}
