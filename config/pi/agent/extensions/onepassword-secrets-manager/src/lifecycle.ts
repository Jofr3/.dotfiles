import type { OnePasswordManager } from "./manager.ts";
import type { SecretResolverProvider } from "./resolver.ts";

type ResolverLifecycle = Pick<SecretResolverProvider, "disable" | "shutdown">;
type ManagerLifecycle = Pick<OnePasswordManager, "reset" | "shutdown">;
type DynamicLifecycle = Readonly<{ reset(): void }>;
type RequirementLifecycle = Readonly<{ disable(): void; shutdown(): void }>;

/** Revocation in every component happens synchronously before this returns. */
export function disableResolverLifecycle(
	resolver: ResolverLifecycle,
	manager: ManagerLifecycle,
	dynamic?: DynamicLifecycle,
	requirements?: RequirementLifecycle,
): Promise<void> {
	requirements?.disable();
	dynamic?.reset();
	const resolverDrain = resolver.disable();
	const managerDrain = manager.reset();
	return Promise.all([resolverDrain, managerDrain]).then(() => undefined);
}

/** Unsubscription and revocation happen synchronously before bounded drains. */
export function shutdownLifecycle(
	resolver: ResolverLifecycle,
	manager: ManagerLifecycle,
	dynamic?: DynamicLifecycle,
	requirements?: RequirementLifecycle,
): Promise<void> {
	requirements?.shutdown();
	dynamic?.reset();
	const resolverDrain = resolver.shutdown();
	const managerDrain = manager.shutdown();
	return Promise.all([resolverDrain, managerDrain]).then(() => undefined);
}
