import {
	isResolverReference,
	type ConfiguredTool,
	type CredentialReference,
	type InvocationServerSnapshot,
} from "./config.ts";
import { CredentialResolverError, SecretResolverConsumer, type ResolverPurpose } from "./resolver.ts";
import { requireEnvironmentValue } from "./safety.ts";

const MAX_RESOLUTION_CONCURRENCY = 4;

export interface CredentialMaterial {
	headers: Record<string, string>;
	authTokens: Record<string, string>;
	boundParams: Record<string, string>;
	redactionValues: string[];
	resolverValuesUsed: boolean;
}

type CredentialTarget = "headers" | "authTokens" | "boundParams";

interface PlannedCredential {
	target: CredentialTarget;
	name: string;
	reference: CredentialReference;
	purpose: ResolverPurpose;
}

function selectedPlan(server: InvocationServerSnapshot, tool: ConfiguredTool): PlannedCredential[] {
	const plan: PlannedCredential[] = [];
	for (const [name, reference] of Object.entries(server.headers)) {
		plan.push({ target: "headers", name, reference, purpose: "mcp-toolbox.header" });
	}
	for (const name of tool.authTokens) {
		plan.push({
			target: "authTokens",
			name,
			reference: server.authTokens[name]!,
			purpose: "mcp-toolbox.auth-token",
		});
	}
	for (const name of tool.boundParams) {
		plan.push({
			target: "boundParams",
			name,
			reference: server.boundParams[name]!,
			purpose: "mcp-toolbox.bound-param",
		});
	}
	return plan;
}

function environmentPurpose(item: PlannedCredential): string {
	if (item.target === "headers") return `header ${item.name}`;
	if (item.target === "authTokens") return `authentication source ${item.name}`;
	return `bound parameter ${item.name}`;
}

function tuple(item: PlannedCredential): string {
	if (!isResolverReference(item.reference)) throw new CredentialResolverError();
	return `${item.purpose}\u0000${item.reference.resolver.slot}`;
}

function targetKey(item: PlannedCredential): string {
	return `${item.target}\u0000${item.name}`;
}

export function selectedEnvironmentValues(server: InvocationServerSnapshot, tool: ConfiguredTool): string[] {
	const values = new Set<string>();
	for (const item of selectedPlan(server, tool)) {
		if (isResolverReference(item.reference)) continue;
		const value = process.env[item.reference.env];
		if (value) values.add(value);
	}
	return [...values].sort((left, right) => right.length - left.length);
}

export async function resolveCredentialMaterial(
	server: InvocationServerSnapshot,
	tool: ConfiguredTool,
	consumer: SecretResolverConsumer,
	signal: AbortSignal,
	deadlineAt: number,
): Promise<CredentialMaterial> {
	const plan = selectedPlan(server, tool);
	const resolverItems = new Map<string, PlannedCredential>();
	for (const item of plan) {
		if (isResolverReference(item.reference)) resolverItems.set(tuple(item), item);
	}

	const controller = new AbortController();
	const abortFromParent = (): void => controller.abort("mcp-toolbox-credential-cancelled");
	signal.addEventListener("abort", abortFromParent, { once: true });
	if (signal.aborted) abortFromParent();

	const resolvedTuples = new Map<string, string>();
	const resolvedTargets = new Map<string, string>();
	let failed = controller.signal.aborted;
	try {
		const pending = [...resolverItems.entries()];
		let next = 0;
		const worker = async (): Promise<void> => {
			while (!controller.signal.aborted && next < pending.length) {
				const index = next;
				next += 1;
				const [key, item] = pending[index]!;
				if (!isResolverReference(item.reference)) {
					failed = true;
					controller.abort("invalid-resolver-plan");
					return;
				}
				try {
					const value = await consumer.resolve(
						item.reference.resolver.slot,
						item.purpose,
						controller.signal,
						deadlineAt,
					);
					if (controller.signal.aborted) return;
					resolvedTuples.set(key, value);
				} catch {
					failed = true;
					controller.abort("resolver-sibling-failed");
					return;
				}
			}
		};
		await Promise.all(Array.from(
			{ length: Math.min(MAX_RESOLUTION_CONCURRENCY, pending.length) },
			() => worker(),
		));
		if (failed || controller.signal.aborted || signal.aborted) throw new CredentialResolverError();

		for (const item of plan) {
			const value = isResolverReference(item.reference)
				? resolvedTuples.get(tuple(item))
				: requireEnvironmentValue(item.reference, environmentPurpose(item));
			if (value === undefined) throw new CredentialResolverError();
			resolvedTargets.set(targetKey(item), value);
		}
		if (signal.aborted) throw new CredentialResolverError();

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
				const value = resolvedTargets.get(targetKey(item));
				if (value === undefined) throw new CredentialResolverError();
				material[item.target][item.name] = value;
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
		resolvedTuples.clear();
		resolvedTargets.clear();
	}
}

export function clearCredentialMaterial(material: CredentialMaterial): void {
	for (const record of [material.headers, material.authTokens, material.boundParams]) {
		for (const key of Object.keys(record)) delete record[key];
	}
	material.redactionValues.length = 0;
}
