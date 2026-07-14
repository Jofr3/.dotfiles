import type { VaultMetadata } from "./metadata.ts";
import type { ManagerStatus, VerifiedDynamicSelection } from "./manager.ts";
import type { CachedRequirementRecord } from "./requirements.ts";
import type { ResolverProviderStatus } from "./resolver.ts";
import { SDK_PACKAGE, SDK_VERSION } from "./safety.ts";

export const RESOLVER_ENABLE_CONFIRMATION =
	"Load the protected global binding file and allow only its exact consumer/slot/purpose tuples to resolve 1Password values in memory for trusted extensions? Values cross only through one-shot callbacks and are not shown by this extension. Authentication remains lazy until the first accepted secret resolution. Service-account and desktop settings are mutually exclusive. Desktop mode may show 1Password authorization UI; keep the desktop app installed and unlocked. No /login command is needed. Pi's process-wide event bus is not an authentication boundary; enable only when every loaded extension is trusted. Enablement ends on disable, reload, session replacement, shutdown, or restart.";

export const DYNAMIC_ENABLE_CONFIRMATION =
	"Enable dynamic 1Password selection for this Pi session? Safe vault metadata (opaque session handle, title, type, item count), item metadata (opaque session handle, title, category, state), field metadata (opaque session handle, title, type, section title/opaque handle), and MCP requirement metadata (server/tool, target kind/name, opaque requirement ID, and derived purpose) returned by tools will be sent to the active model, included in Pi tool and RPC events, and normally persisted in the Pi session. Requirement metadata is also published on a cooperative process-local event channel visible to loaded extensions. Dynamic mode is less restrictive than protected static bindings: the model may select any metadata-visible field allowed by the authenticated account, although every secret grant requires separate approval for one exact prior cached MCP requirement ID. Use least-privilege vault access. Field discovery calls items.get, which decrypts the full item—including values, notes, websites, tags, details, and files—inside the official SDK; this extension reads and emits only strict field/section metadata and promptly releases the full response. Authentication remains lazy. Dynamic mode does not read resolver-bindings.json. Consent, requirement metadata, discoveries, and grants end on disable, reload, session replacement, shutdown, or restart. Pi's process-wide event bus is cooperative and is not an authentication boundary; enable only when every loaded extension is trusted.";

function quotedMetadata(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function dynamicGrantConfirmation(
	vault: VaultMetadata,
	selection: VerifiedDynamicSelection,
	requirement: CachedRequirementRecord,
): string {
	const section = selection.field.section === undefined
		? []
		: [`Section: ${quotedMetadata(selection.field.section.title)}`];
	return [
		"Approve one one-shot 1Password grant?",
		"",
		`Vault: ${quotedMetadata(vault.title)}`,
		`Item: ${quotedMetadata(selection.item.title)}`,
		`Field: ${quotedMetadata(selection.field.title)}`,
		...section,
		"Consumer: MCP Toolbox",
		`MCP server: ${quotedMetadata(requirement.server)}`,
		`MCP tool: ${quotedMetadata(requirement.tool)}`,
		`Target kind: ${requirement.targetKind}`,
		`Target name: ${quotedMetadata(requirement.targetName)}`,
		`Derived resolver purpose: ${requirement.purpose}`,
		`Requirement ID: ${requirement.requirementId}`,
		"",
		"The grant arms after this tool turn and is consumed when the first exact resolver request is admitted, even if 1Password resolution or the later MCP operation fails. No field value, account credential, token, or secret reference will be displayed.",
	].join("\n");
}

export function statusPayload(status: ManagerStatus, resolver: ResolverProviderStatus) {
	return {
		extension: "1Password Secrets Manager",
		sdk: `${SDK_PACKAGE}@${SDK_VERSION}`,
		clientPhase: status.phase,
		serviceAccountTokenConfigured: status.serviceAccountTokenConfigured,
		desktopAccountConfigured: status.desktopAccountConfigured,
		authenticationMode: status.authenticationMode,
		resolverMode: resolver.mode,
		resolverEnabled: resolver.enabled,
		resolverBindingCount: resolver.bindingCount,
		dynamicGrantCount: resolver.grantCount,
		metadataEnabled: resolver.metadataEnabled,
		metadataCallsUsed: status.metadataCallsUsed,
		metadataCallLimit: status.metadataCallLimit,
		metadataPending: status.metadataPending,
		metadataPendingLimit: status.metadataPendingLimit,
		resolverCallsUsed: resolver.callsUsed,
		resolverCallLimit: resolver.callLimit,
		resolverPending: resolver.pending,
		resolverPendingLimit: resolver.pendingLimit,
		managerCallsUsed: status.callsUsed,
		managerCallLimit: status.callLimit,
		managerPending: status.pending,
		managerPendingLimit: status.pendingLimit,
		offline: true,
		notice: "Status inspected only authentication-setting presence and aggregate in-memory counters; it did not read bindings, initialize the SDK, authenticate, or make a network request.",
	};
}

export function statusText(status: ManagerStatus, resolver: ResolverProviderStatus): string {
	const payload = statusPayload(status, resolver);
	return [
		`${payload.extension}: ${payload.clientPhase}`,
		`SDK: ${payload.sdk}`,
		`Authentication mode: ${payload.authenticationMode}`,
		`OP_SERVICE_ACCOUNT_TOKEN configured: ${payload.serviceAccountTokenConfigured ? "yes" : "no"}`,
		`PI_ONEPASSWORD_DESKTOP_ACCOUNT configured: ${payload.desktopAccountConfigured ? "yes" : "no"}`,
		`Resolver mode: ${payload.resolverMode}`,
		`Active protected bindings: ${payload.resolverBindingCount}`,
		`Active one-shot grants: ${payload.dynamicGrantCount}`,
		`Metadata discovery: ${payload.metadataEnabled ? "enabled" : "disabled"}`,
		`Metadata calls: ${payload.metadataCallsUsed}/${payload.metadataCallLimit}`,
		`Pending metadata calls: ${payload.metadataPending}/${payload.metadataPendingLimit}`,
		`Resolver calls: ${payload.resolverCallsUsed}/${payload.resolverCallLimit}`,
		`Pending resolver calls: ${payload.resolverPending}/${payload.resolverPendingLimit}`,
		payload.notice,
	].join("\n");
}
