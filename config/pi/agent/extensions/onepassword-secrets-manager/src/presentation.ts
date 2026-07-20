import type { VaultMetadata } from "./metadata.ts";
import type { ManagerStatus, VerifiedDynamicSelection } from "./manager.ts";
import type { CachedRequirementRecord } from "./requirements.ts";
import type { ResolverProviderStatus } from "./resolver.ts";
import { SDK_PACKAGE, SDK_VERSION } from "./safety.ts";

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
		authenticationMode: status.authenticationMode,
		resolverMode: resolver.mode,
		resolverEnabled: resolver.enabled,
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
		notice: "Status inspected only service-account token presence and aggregate in-memory counters; it did not read bindings, initialize the SDK, authenticate, or make a network request.",
	};
}

export function statusText(status: ManagerStatus, resolver: ResolverProviderStatus): string {
	const payload = statusPayload(status, resolver);
	return [
		`${payload.extension}: ${payload.clientPhase}`,
		`SDK: ${payload.sdk}`,
		`Authentication mode: ${payload.authenticationMode}`,
		`OP_SERVICE_ACCOUNT_TOKEN configured: ${payload.serviceAccountTokenConfigured ? "yes" : "no"}`,
		`Resolver mode: ${payload.resolverMode}`,
		`Active one-shot grants: ${payload.dynamicGrantCount}`,
		`Metadata discovery: ${payload.metadataEnabled ? "enabled" : "disabled"}`,
		`Metadata calls: ${payload.metadataCallsUsed}/${payload.metadataCallLimit}`,
		`Pending metadata calls: ${payload.metadataPending}/${payload.metadataPendingLimit}`,
		`Resolver calls: ${payload.resolverCallsUsed}/${payload.resolverCallLimit}`,
		`Pending resolver calls: ${payload.resolverPending}/${payload.resolverPendingLimit}`,
		payload.notice,
	].join("\n");
}
