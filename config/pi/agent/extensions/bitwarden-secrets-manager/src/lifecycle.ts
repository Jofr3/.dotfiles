import type { BitwardenManager } from "./manager.ts";
import type { SecretResolverProvider } from "./resolver.ts";

type ResolverLifecycle = Pick<SecretResolverProvider, "disable" | "shutdown">;
type ManagerLifecycle = Pick<BitwardenManager, "reset" | "shutdown">;

/** Revocation in both components happens synchronously before this returns. */
export function disableResolverLifecycle(
	resolver: ResolverLifecycle,
	manager: ManagerLifecycle,
): Promise<void> {
	const resolverDrain = resolver.disable();
	const managerDrain = manager.reset();
	return Promise.all([resolverDrain, managerDrain]).then(() => undefined);
}

/** Unsubscription/revocation happens synchronously before bounded drains begin. */
export function shutdownLifecycle(
	resolver: ResolverLifecycle,
	manager: ManagerLifecycle,
): Promise<void> {
	const resolverDrain = resolver.shutdown();
	const managerDrain = manager.shutdown();
	return Promise.all([resolverDrain, managerDrain]).then(() => undefined);
}
