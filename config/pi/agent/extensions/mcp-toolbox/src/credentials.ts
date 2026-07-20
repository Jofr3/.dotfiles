import type { ConfiguredTool, InvocationServerSnapshot } from "./config.ts";
import { planSelectedCredentials, type PlannedCredential } from "./requirements.ts";
import { CredentialResolverError, SecretResolverConsumer } from "./resolver.ts";

const MAX_RESOLUTION_CONCURRENCY = 4;

export interface CredentialMaterial {
	headers: Record<string, string>;
	authTokens: Record<string, string>;
	boundParams: Record<string, string>;
	redactionValues: string[];
	resolverValuesUsed: boolean;
}

function tuple(item: PlannedCredential): string {
	if (!item.resolver || !item.requirement) throw new CredentialResolverError("configuration");
	return `${item.resolver.provider}\u0000${item.purpose}\u0000${item.resolver.slot}`;
}

export async function resolveCredentialMaterial(
	server: InvocationServerSnapshot,
	tool: ConfiguredTool,
	consumer: SecretResolverConsumer,
	signal: AbortSignal,
	deadlineAt: number,
): Promise<CredentialMaterial> {
	const plan = planSelectedCredentials(server, tool);
	const resolverItems = new Map<string, PlannedCredential>();
	for (const item of plan) {
		if (!item.resolver || !item.requirement) throw new CredentialResolverError("configuration");
		resolverItems.set(tuple(item), item);
	}

	const controller = new AbortController();
	const abortFromParent = (): void => controller.abort("mcp-toolbox-credential-cancelled");
	signal.addEventListener("abort", abortFromParent, { once: true });
	if (signal.aborted) abortFromParent();

	const resolved = new Map<string, string>();
	let failed = controller.signal.aborted;
	try {
		const pending = [...resolverItems.entries()];
		let next = 0;
		const worker = async (): Promise<void> => {
			while (!controller.signal.aborted && next < pending.length) {
				const index = next;
				next += 1;
				const [key, item] = pending[index]!;
				try {
					const value = await consumer.resolve(
						item.resolver!.provider,
						item.resolver!.slot,
						item.purpose,
						controller.signal,
						deadlineAt,
					);
					if (controller.signal.aborted) return;
					resolved.set(key, value);
				} catch {
					failed = true;
					controller.abort("onepassword-resolution-failed");
					return;
				}
			}
		};
		await Promise.all(Array.from(
			{ length: Math.min(MAX_RESOLUTION_CONCURRENCY, pending.length) },
			() => worker(),
		));
		if (failed || controller.signal.aborted || signal.aborted) throw new CredentialResolverError();

		const material: CredentialMaterial = {
			headers: Object.create(null) as Record<string, string>,
			authTokens: Object.create(null) as Record<string, string>,
			boundParams: Object.create(null) as Record<string, string>,
			redactionValues: [],
			resolverValuesUsed: pending.length > 0,
		};
		const redactions = new Set<string>();
		try {
			for (const item of plan) {
				const value = resolved.get(tuple(item));
				if (value === undefined) throw new CredentialResolverError();
				material[item.target][item.targetName] = value;
				redactions.add(value);
			}
			material.redactionValues = [...redactions].sort((left, right) => right.length - left.length);
			return material;
		} catch (error) {
			clearCredentialMaterial(material);
			throw error;
		}
	} finally {
		signal.removeEventListener("abort", abortFromParent);
		controller.abort("credential-resolution-finished");
		resolved.clear();
	}
}

export function clearCredentialMaterial(material: CredentialMaterial): void {
	for (const record of [material.headers, material.authTokens, material.boundParams]) {
		for (const key of Object.keys(record)) delete record[key];
	}
	material.redactionValues.length = 0;
}
