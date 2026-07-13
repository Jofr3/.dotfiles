/*
 * Resource Toggler
 *
 * Session-only policy controls for extension tools and future skill/context
 * prompt exposure. Pi does not expose arbitrary extension load/unload APIs:
 * muting an extension affects its registered tools only; its module, commands,
 * handlers, providers, UI, and background work remain loaded.
 *
 * Command: /toggle
 */

import { createHash } from "node:crypto";
import { basename, dirname } from "node:path";
import {
	formatSkillsForPrompt,
	getSettingsListTheme,
	type BuildSystemPromptOptions,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type Skill,
	type SourceInfo,
	type ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { type SettingItem, SettingsList } from "@earendil-works/pi-tui";

const ENTRY_TYPE = "resource-toggler-state";
const LEGACY_ENTRY_TYPE = "session-resource-manager-state";
const STATUS_KEY = "resource-toggler";
const DESCRIPTION = "Toggle session-only extension tools and future skill/context prompt exposure (not unload)";
const TITLE = "Resource toggler — tools are muted; modules are not unloaded";

type ResourceKind = "extension" | "skill" | "context";
type ResourceFilter = ResourceKind | "all";
type Enforcement = "not yet evaluated" | "applied" | "already absent" | "unavailable";

interface StateV1 {
	version: 1;
	sessionId: string;
	mutedExtensionToolSources: string[];
	disabledSkillPaths: string[];
	disabledContextPaths: string[];
}

interface ExtensionResource {
	kind: "extension";
	id: string;
	path: string;
	label: string;
	scope?: SourceInfo["scope"];
	tools: ToolInfo[];
	commands: string[];
	current: boolean;
	protected: boolean;
}

interface SkillResource {
	kind: "skill";
	id: string;
	path: string;
	label: string;
	name?: string;
	scope?: SourceInfo["scope"];
	disableModelInvocation: boolean;
	basePromptEligible: boolean;
	current: boolean;
}

interface ContextResource {
	kind: "context";
	id: string;
	path: string;
	label: string;
	current: boolean;
}

type Resource = ExtensionResource | SkillResource | ContextResource;

interface PolicyState {
	mutedExtensionToolSources: Set<string>;
	disabledSkillPaths: Set<string>;
	disabledContextPaths: Set<string>;
}

const KIND_PREFIX: Record<ResourceKind, string> = {
	extension: "x",
	skill: "s",
	context: "c",
};

function emptyState(): PolicyState {
	return {
		mutedExtensionToolSources: new Set(),
		disabledSkillPaths: new Set(),
		disabledContextPaths: new Set(),
	};
}

function sortedUnique(values: Iterable<string>): string[] {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseState(value: unknown, sessionId: string): StateV1 | "other-session" | "invalid" {
	if (!value || typeof value !== "object") return "invalid";
	const data = value as Partial<StateV1>;
	if (typeof data.sessionId !== "string") return "invalid";
	if (data.sessionId !== sessionId) return "other-session";
	if (
		data.version !== 1 ||
		!isStringArray(data.mutedExtensionToolSources) ||
		!isStringArray(data.disabledSkillPaths) ||
		!isStringArray(data.disabledContextPaths)
	) {
		return "invalid";
	}
	return data as StateV1;
}

function digest(kind: ResourceKind, canonicalPath: string): string {
	return createHash("sha256").update(`${kind}\0${canonicalPath}`).digest("hex");
}

/** Use a short opaque ID, extending it if the current inventory has a prefix collision. */
function opaqueId(kind: ResourceKind, canonicalPath: string, peerPaths: string[]): string {
	const ownDigest = digest(kind, canonicalPath);
	let length = 12;
	while (
		length < ownDigest.length &&
		peerPaths.some((path) => path !== canonicalPath && digest(kind, path).slice(0, length) === ownDigest.slice(0, length))
	) {
		length += 4;
	}
	return `${KIND_PREFIX[kind]}-${ownDigest.slice(0, Math.min(length, ownDigest.length))}`;
}

function countOccurrences(text: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let offset = 0;
	while (offset <= text.length - needle.length) {
		const index = text.indexOf(needle, offset);
		if (index < 0) break;
		count++;
		offset = index + needle.length;
	}
	return count;
}

/** Pinned to the context-file formatter in installed Pi 0.80.6. */
function formatContextFiles(contextFiles: Array<{ path: string; content: string }>): string {
	if (contextFiles.length === 0) return "";
	let section = "\n\n<project_context>\n\n";
	section += "Project-specific instructions and guidelines:\n\n";
	for (const contextFile of contextFiles) {
		section += `<project_instructions path="${contextFile.path}">\n${contextFile.content}\n</project_instructions>\n\n`;
	}
	section += "</project_context>\n";
	return section;
}

function normalizeKind(value: string | undefined, allowAll = false): ResourceFilter | undefined {
	switch ((value ?? "").toLowerCase()) {
		case "extension":
		case "extensions":
		case "ext":
			return "extension";
		case "skill":
		case "skills":
			return "skill";
		case "context":
		case "contexts":
		case "ctx":
			return "context";
		case "all":
			return allowAll ? "all" : undefined;
		default:
			return undefined;
	}
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : pluralForm}`;
}

function skillNameFromPath(path: string): string {
	return basename(path).toLowerCase() === "skill.md" ? basename(dirname(path)) : basename(path);
}

function extensionLabelFromPath(path: string): string {
	const fileName = basename(path);
	if (/^index\.[cm]?[jt]sx?$/.test(fileName)) {
		const parent = dirname(path);
		const parentName = basename(parent);
		return /^(?:src|dist|lib)$/.test(parentName) ? basename(dirname(parent)) : parentName;
	}
	return fileName.replace(/\.[cm]?[jt]sx?$/, "");
}

export default function resourceToggler(pi: ExtensionAPI) {
	let state = emptyState();
	let cachedSkills = new Map<string, Omit<SkillResource, "id">>();
	let cachedContexts = new Map<string, Omit<ContextResource, "id">>();
	let managerSources = new Set<string>();
	let skillEnforcement = new Map<string, Enforcement>();
	let contextEnforcement = new Map<string, Enforcement>();
	let restoreWarning: string | undefined;
	let toolWarning: string | undefined;
	let promptWarnings: string[] = [];
	let selfProtectionWarning: string | undefined;
	let identityWarning: string | undefined;

	function stateSet(kind: ResourceKind): Set<string> {
		switch (kind) {
			case "extension":
				return state.mutedExtensionToolSources;
			case "skill":
				return state.disabledSkillPaths;
			case "context":
				return state.disabledContextPaths;
		}
	}

	function refreshManagerSources(commands = pi.getCommands()): void {
		const sources = new Set<string>();
		for (const command of commands) {
			if (command.source !== "extension" || command.description !== DESCRIPTION) continue;
			if (!/^toggle(?::\d+)?$/.test(command.name)) continue;
			if (command.sourceInfo.path) sources.add(command.sourceInfo.path);
		}
		managerSources = sources;
		selfProtectionWarning =
			sources.size > 0
				? undefined
				: "Manager command provenance is unavailable; self-protection could not identify its source.";
	}

	function cachePromptInventory(options: BuildSystemPromptOptions): void {
		// Preserve metadata for disabled resources that a later prompt snapshot omits.
		// Without this, they degrade to an unrecognizable SKILL.md/context basename and
		// cannot be selected for re-enabling from the interactive manager.
		const skills = new Map<string, Omit<SkillResource, "id">>(
			[...cachedSkills].map(([path, resource]) => [path, { ...resource, current: false }]),
		);
		const hasReadTool = !options.selectedTools || options.selectedTools.includes("read");
		for (const skill of options.skills ?? []) {
			if (!skill.filePath) continue;
			skills.set(skill.filePath, {
				kind: "skill",
				path: skill.filePath,
				label: skill.name || skillNameFromPath(skill.filePath),
				name: skill.name,
				scope: skill.sourceInfo?.scope,
				disableModelInvocation: skill.disableModelInvocation === true,
				basePromptEligible: hasReadTool && skill.disableModelInvocation !== true,
				current: true,
			});
		}
		cachedSkills = skills;

		const contexts = new Map<string, Omit<ContextResource, "id">>(
			[...cachedContexts].map(([path, resource]) => [path, { ...resource, current: false }]),
		);
		for (const contextFile of options.contextFiles ?? []) {
			if (!contextFile.path) continue;
			contexts.set(contextFile.path, {
				kind: "context",
				path: contextFile.path,
				label: basename(contextFile.path),
				current: true,
			});
		}
		cachedContexts = contexts;
	}

	function mergeSkillCommandInventory(commands = pi.getCommands()): void {
		const hasReadTool = pi.getActiveTools().includes("read");
		for (const command of commands) {
			if (command.source !== "skill" || !command.sourceInfo.path || !command.name.startsWith("skill:")) continue;
			const existing = cachedSkills.get(command.sourceInfo.path);
			const commandName = command.name.slice("skill:".length) || skillNameFromPath(command.sourceInfo.path);
			const disableModelInvocation = existing?.disableModelInvocation ?? false;
			cachedSkills.set(command.sourceInfo.path, {
				kind: "skill",
				path: command.sourceInfo.path,
				label: existing?.label || commandName,
				name: existing?.name || commandName,
				scope: existing?.scope ?? command.sourceInfo.scope,
				disableModelInvocation,
				basePromptEligible: hasReadTool && !disableModelInvocation,
				current: true,
			});
		}
	}

	function extensionResources(commands = pi.getCommands()): Array<Omit<ExtensionResource, "id">> {
		refreshManagerSources(commands);
		const groups = new Map<string, Omit<ExtensionResource, "id">>();
		const ensure = (path: string, sourceInfo?: SourceInfo): Omit<ExtensionResource, "id"> => {
			let resource = groups.get(path);
			if (!resource) {
				resource = {
					kind: "extension",
					path,
					label: extensionLabelFromPath(path),
					scope: sourceInfo?.scope,
					tools: [],
					commands: [],
					current: true,
					protected: managerSources.has(path),
				};
				groups.set(path, resource);
			}
			return resource;
		};

		for (const tool of pi.getAllTools()) {
			const sourceInfo = tool.sourceInfo;
			if (!sourceInfo?.path || sourceInfo.source === "builtin" || sourceInfo.source === "sdk") continue;
			ensure(sourceInfo.path, sourceInfo).tools.push(tool);
		}
		for (const command of commands) {
			if (command.source !== "extension" || !command.sourceInfo.path) continue;
			ensure(command.sourceInfo.path, command.sourceInfo).commands.push(command.name);
		}
		return [...groups.values()];
	}

	function inventory(): Resource[] {
		// getCommands() is authoritative for loaded skills even when a prompt snapshot
		// omits their advertisement. Merge it before rendering so disabled skills stay
		// visible and actionable in the manager.
		const commands = pi.getCommands();
		mergeSkillCommandInventory(commands);
		const extensions = extensionResources(commands);
		for (const path of state.mutedExtensionToolSources) {
			if (extensions.some((resource) => resource.path === path)) continue;
			extensions.push({
				kind: "extension",
				path,
				label: extensionLabelFromPath(path),
				tools: [],
				commands: [],
				current: false,
				protected: managerSources.has(path),
			});
		}

		const skills = [...cachedSkills.values()].filter(
			(resource) => resource.current || state.disabledSkillPaths.has(resource.path),
		);
		for (const path of state.disabledSkillPaths) {
			if (skills.some((resource) => resource.path === path)) continue;
			const inferredName = skillNameFromPath(path);
			skills.push({
				kind: "skill",
				path,
				label: inferredName,
				name: inferredName,
				disableModelInvocation: false,
				basePromptEligible: false,
				current: false,
			});
		}

		const contexts = [...cachedContexts.values()].filter(
			(resource) => resource.current || state.disabledContextPaths.has(resource.path),
		);
		for (const path of state.disabledContextPaths) {
			if (contexts.some((resource) => resource.path === path)) continue;
			contexts.push({ kind: "context", path, label: basename(path), current: false });
		}

		const withoutIds: Array<Omit<Resource, "id">> = [...extensions, ...skills, ...contexts];
		const peerPaths = new Map<ResourceKind, string[]>([
			["extension", sortedUnique(extensions.map((resource) => resource.path))],
			["skill", sortedUnique(skills.map((resource) => resource.path))],
			["context", sortedUnique(contexts.map((resource) => resource.path))],
		]);
		const resources = withoutIds.map(
			(resource) =>
				({
					...resource,
					id: opaqueId(resource.kind, resource.path, peerPaths.get(resource.kind) ?? []),
				}) as Resource,
		);

		const ids = new Map<string, string>();
		identityWarning = undefined;
		for (const resource of resources) {
			const previousPath = ids.get(resource.id);
			if (previousPath && previousPath !== resource.path) {
				identityWarning = "Opaque resource ID collision detected; use reset by kind rather than a colliding ID.";
			}
			ids.set(resource.id, resource.path);
		}
		return resources.sort((a, b) => {
			const aDisabled = stateSet(a.kind).has(a.path) ? 0 : 1;
			const bDisabled = stateSet(b.kind).has(b.path) ? 0 : 1;
			if (aDisabled !== bDisabled) return aDisabled - bDisabled;
			return a.kind === b.kind
				? a.label.localeCompare(b.label) || a.path.localeCompare(b.path)
				: a.kind.localeCompare(b.kind);
		});
	}

	function refreshFromCommand(ctx: ExtensionCommandContext): Resource[] {
		try {
			cachePromptInventory(ctx.getSystemPromptOptions());
		} catch {
			promptWarnings = ["Structured skill/context inventory is UNAVAILABLE."];
		}
		return inventory();
	}

	function currentStateData(ctx: ExtensionContext): StateV1 {
		return {
			version: 1,
			sessionId: ctx.sessionManager.getSessionId(),
			mutedExtensionToolSources: sortedUnique(state.mutedExtensionToolSources),
			disabledSkillPaths: sortedUnique(state.disabledSkillPaths),
			disabledContextPaths: sortedUnique(state.disabledContextPaths),
		};
	}

	function persist(ctx: ExtensionContext): boolean {
		try {
			pi.appendEntry<StateV1>(ENTRY_TYPE, currentStateData(ctx));
			return true;
		} catch {
			restoreWarning = "Policy is active in memory but could not be saved to this session; reload restoration is not guaranteed.";
			ctx.ui.notify(`UNAVAILABLE: ${restoreWarning}`, "error");
			return false;
		}
	}

	function extensionToolsForPath(path: string): ToolInfo[] {
		return pi
			.getAllTools()
			.filter(
				(tool) =>
					tool.sourceInfo?.path === path &&
					tool.sourceInfo.source !== "builtin" &&
					tool.sourceInfo.source !== "sdk",
			);
	}

	function setActiveToolNames(names: Set<string>): boolean {
		const before = pi.getActiveTools();
		const after = [...names];
		if (before.length === after.length && before.every((name, index) => name === after[index])) return true;
		try {
			pi.setActiveTools(after);
			toolWarning = undefined;
			return true;
		} catch {
			toolWarning = "Active-tool list enforcement failed; muted sources remain protected by the resource toggler's tool-call gate.";
			return false;
		}
	}

	function reapplyToolMutes(): boolean {
		const active = new Set(pi.getActiveTools());
		for (const tool of pi.getAllTools()) {
			if (state.mutedExtensionToolSources.has(tool.sourceInfo.path)) active.delete(tool.name);
		}
		return setActiveToolNames(active);
	}

	function transitionToolPolicy(oldMuted: Set<string>, newMuted: Set<string>): boolean {
		const active = new Set(pi.getActiveTools());
		for (const source of oldMuted) {
			for (const tool of extensionToolsForPath(source)) active.add(tool.name);
		}
		for (const source of newMuted) {
			for (const tool of extensionToolsForPath(source)) active.delete(tool.name);
		}
		return setActiveToolNames(active);
	}

	function restoreFromBranch(ctx: ExtensionContext): void {
		const sessionId = ctx.sessionManager.getSessionId();
		let latest: StateV1 | undefined;
		let invalidMatchingEntry = false;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (
				entry.type !== "custom" ||
				(entry.customType !== ENTRY_TYPE && entry.customType !== LEGACY_ENTRY_TYPE)
			) continue;
			const parsed = parseState(entry.data, sessionId);
			if (parsed === "invalid") invalidMatchingEntry = true;
			else if (parsed !== "other-session") latest = parsed;
		}

		const oldMuted = new Set(state.mutedExtensionToolSources);
		const next = emptyState();
		if (latest) {
			next.mutedExtensionToolSources = new Set(sortedUnique(latest.mutedExtensionToolSources));
			next.disabledSkillPaths = new Set(sortedUnique(latest.disabledSkillPaths));
			next.disabledContextPaths = new Set(sortedUnique(latest.disabledContextPaths));
		}

		refreshManagerSources();
		for (const source of managerSources) next.mutedExtensionToolSources.delete(source);
		state = next;
		skillEnforcement = new Map([...state.disabledSkillPaths].map((path) => [path, "not yet evaluated"]));
		contextEnforcement = new Map([...state.disabledContextPaths].map((path) => [path, "not yet evaluated"]));
		restoreWarning = invalidMatchingEntry
			? "Malformed or unsupported resource-toggler state was ignored; the latest valid state on this branch was restored."
			: undefined;
		transitionToolPolicy(oldMuted, state.mutedExtensionToolSources);
		if (restoreWarning) ctx.ui.notify(restoreWarning, "warning");
		updateFooter(ctx);
	}

	function allWarnings(): string[] {
		return [restoreWarning, toolWarning, selfProtectionWarning, identityWarning, ...promptWarnings].filter(
			(value): value is string => Boolean(value),
		);
	}

	function updateFooter(ctx: ExtensionContext): void {
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
	}

	async function waitForIdle(ctx: ExtensionCommandContext): Promise<void> {
		if (!ctx.isIdle()) {
			ctx.ui.notify("Waiting for the current agent run to settle; that run is unchanged.", "info");
		}
		await ctx.waitForIdle();
	}

	function selectorCandidates(resources: Resource[]): string {
		return resources.map((resource) => `${resource.id} (${resource.label})`).join(", ");
	}

	function resolveSelector(
		kind: ResourceKind,
		selector: string,
		resources: Resource[],
	): { resource?: Resource; error?: string } {
		const ofKind = resources.filter((resource) => resource.kind === kind);
		let matches = ofKind.filter((resource) => resource.id === selector);
		if (matches.length === 0 && kind === "skill") {
			matches = ofKind.filter((resource) => resource.kind === "skill" && resource.name === selector);
		}
		if (matches.length === 0) matches = ofKind.filter((resource) => resource.label === selector);
		if (matches.length === 0) matches = ofKind.filter((resource) => basename(resource.path) === selector);
		if (matches.length === 1) return { resource: matches[0] };
		if (matches.length > 1) {
			return { error: `UNAVAILABLE: selector is ambiguous. Use one of: ${selectorCandidates(matches)}` };
		}
		return { error: `UNAVAILABLE: no current or saved ${kind} matches "${selector}". Run /toggle list ${kind}.` };
	}

	function enforcementLabel(value: Enforcement | undefined): string {
		switch (value) {
			case "applied":
				return "applied on the latest run";
			case "already absent":
				return "already absent on the latest run";
			case "unavailable":
				return "UNAVAILABLE on the latest run";
			default:
				return "not yet evaluated";
		}
	}

	function scopeLabel(resource: Resource): string {
		return "scope" in resource && resource.scope ? ` [${resource.scope}]` : "";
	}

	function resourceLine(resource: Resource): string {
		if (resource.kind === "extension") {
			if (!resource.current) {
				return `${resource.id} UNAVAILABLE — policy retained | ${resource.label} | ${resource.path}`;
			}
			const active = new Set(pi.getActiveTools());
			const activeCount = resource.tools.filter((tool) => active.has(tool.name)).length;
			if (resource.protected) {
				return `${resource.id} PROTECTED | ${resource.label}${scopeLabel(resource)} | ${activeCount}/${resource.tools.length} tools active; manager commands/events remain loaded | ${resource.path}`;
			}
			if (resource.tools.length === 0) {
				return `${resource.id} IMPOSSIBLE: no configurable tools are exposed | ${resource.label}${scopeLabel(resource)}; commands/events remain loaded | ${resource.path}`;
			}
			const status = state.mutedExtensionToolSources.has(resource.path) ? "TOOLS MUTED" : "UNMUTED";
			return `${resource.id} ${status} | ${resource.label}${scopeLabel(resource)} | ${activeCount}/${resource.tools.length} tools active; module/commands/events remain loaded | ${resource.path}`;
		}
		if (resource.kind === "skill") {
			if (!resource.current) {
				return `${resource.id} UNAVAILABLE — policy retained | ${resource.label} | ${resource.path}`;
			}
			if (state.disabledSkillPaths.has(resource.path)) {
				return `${resource.id} DISABLED FOR FUTURE PROMPTS + ORDINARY /skill INPUT (${enforcementLabel(skillEnforcement.get(resource.path))}) | ${resource.label}${scopeLabel(resource)}; still discovered/readable; RPC steer/follow_up may bypass the input gate | ${resource.path}`;
			}
			const status = resource.disableModelInvocation
				? "ACTIVE — manual-only by metadata"
				: resource.basePromptEligible
					? "ACTIVE — eligible for base prompt advertisement"
					: "ACTIVE — not advertised while the read tool is inactive";
			return `${resource.id} ${status} | ${resource.label}${scopeLabel(resource)} | ${resource.path}`;
		}
		if (!resource.current) {
			return `${resource.id} UNAVAILABLE — policy retained | ${resource.label} | ${resource.path}`;
		}
		if (state.disabledContextPaths.has(resource.path)) {
			return `${resource.id} DISABLED FOR FUTURE PROMPTS (${enforcementLabel(contextEnforcement.get(resource.path))}) | ${resource.label}; still loaded/readable | ${resource.path}`;
		}
		return `${resource.id} ACTIVE — included in future prompts | ${resource.label} | ${resource.path}`;
	}

	function formatReport(resources: Resource[], filter: ResourceFilter, includeStatus: boolean): string {
		const selected = filter === "all" ? resources : resources.filter((resource) => resource.kind === filter);
		const lines = [TITLE];
		if (includeStatus) {
			lines.push(
				`Policy: ${plural(state.mutedExtensionToolSources.size, "tool source")} muted · ${plural(state.disabledSkillPaths.size, "skill")} hidden · ${plural(state.disabledContextPaths.size, "context")} omitted`,
			);
			for (const warning of allWarnings()) lines.push(`WARNING: ${warning}`);
		}
		if (selected.length === 0) lines.push("(no visible resources; event-only extensions cannot be inventoried)");
		else lines.push(...selected.map(resourceLine));
		lines.push(
			"Limits: extension control affects tools only; skills/contexts remain discovered and readable. Disabled skill calls are blocked only through ordinary input; RPC steer/follow_up bypass Pi's input event and may still expand them. Prior transcript context and side effects are unchanged. Later prompt/provider handlers may re-add suppressed material.",
		);
		if (filter === "all" || filter === "extension") {
			lines.push("Event-only extensions are invisible. True module load/unload and command/event/provider/UI/background-work deactivation are IMPOSSIBLE through this API.");
		}
		return lines.join("\n");
	}

	async function mutateResource(
		resource: Resource,
		disabled: boolean,
		ctx: ExtensionCommandContext,
		notify = true,
	): Promise<boolean> {
		await waitForIdle(ctx);
		const policies = stateSet(resource.kind);

		if (resource.kind === "extension") {
			if (disabled && resource.protected) {
				ctx.ui.notify("Protected: the resource toggler must remain loaded to reverse session policies.", "error");
				return false;
			}
			if (!resource.current) {
				if (!disabled && policies.delete(resource.path)) {
					persist(ctx);
					updateFooter(ctx);
					if (notify) ctx.ui.notify("UNMUTE POLICY REMOVED; the extension is currently UNAVAILABLE.", "info");
					return true;
				}
				ctx.ui.notify("UNAVAILABLE: extension capabilities are not currently exposed; saved policy is retained.", "warning");
				return false;
			}
			if (resource.tools.length === 0) {
				if (!disabled && policies.delete(resource.path)) {
					persist(ctx);
					updateFooter(ctx);
					return true;
				}
				ctx.ui.notify("IMPOSSIBLE: no configurable tools are exposed; extension commands/events remain loaded.", "error");
				return false;
			}

			if (disabled) {
				policies.add(resource.path);
				const enforced = reapplyToolMutes();
				persist(ctx);
				updateFooter(ctx);
				if (notify) {
					ctx.ui.notify(
						enforced
							? "TOOLS MUTED; extension remains loaded (commands/events/providers/UI/background work are unchanged)."
							: "TOOLS MUTED by the resource-toggler call gate; active-list enforcement failed. Extension remains loaded.",
						enforced ? "info" : "warning",
					);
				}
				return true;
			}

			const active = new Set(pi.getActiveTools());
			for (const tool of resource.tools) active.add(tool.name);
			if (!setActiveToolNames(active)) {
				updateFooter(ctx);
				ctx.ui.notify("UNAVAILABLE: tools could not be re-enabled; mute policy was retained.", "error");
				return false;
			}
			policies.delete(resource.path);
			persist(ctx);
			updateFooter(ctx);
			if (notify) ctx.ui.notify("TOOLS UNMUTED; extension was already loaded. All its currently configured tools were enabled.", "info");
			return true;
		}

		if (!resource.current) {
			if (!disabled && policies.delete(resource.path)) {
				persist(ctx);
				updateFooter(ctx);
				if (notify) ctx.ui.notify(`ENABLE POLICY APPLIED; the ${resource.kind} is currently UNAVAILABLE.`, "info");
				return true;
			}
			ctx.ui.notify(`UNAVAILABLE: ${resource.kind} is not currently discovered; saved policy is retained.`, "warning");
			return false;
		}

		if (disabled) policies.add(resource.path);
		else policies.delete(resource.path);
		if (resource.kind === "skill") {
			if (disabled) skillEnforcement.set(resource.path, "not yet evaluated");
			else skillEnforcement.delete(resource.path);
		} else {
			if (disabled) contextEnforcement.set(resource.path, "not yet evaluated");
			else contextEnforcement.delete(resource.path);
		}
		persist(ctx);
		updateFooter(ctx);
		if (notify) {
			if (resource.kind === "skill") {
				ctx.ui.notify(
					disabled
						? "DISABLED FOR FUTURE PROMPTS + ORDINARY /skill INPUT (not yet evaluated); skill remains discovered/readable, RPC steer/follow_up may bypass the input gate, and prior context is unchanged."
						: resource.disableModelInvocation
							? "ACTIVE for future manual calls; skill remains manual-only by its metadata. Prior context is unchanged."
							: resource.basePromptEligible
								? "ACTIVE and eligible for future base-prompt advertisement/calls; prior context is unchanged."
								: "ACTIVE for calls but not advertised while the read tool is inactive; prior context is unchanged.",
					"info",
				);
			} else {
				ctx.ui.notify(
					disabled
						? "DISABLED FOR FUTURE PROMPTS (not yet evaluated); context file remains loaded/readable and prior context is unchanged."
						: "ACTIVE for future prompts; prior context is unchanged.",
					"info",
				);
			}
		}
		return true;
	}

	async function resetPolicy(filter: ResourceFilter, ctx: ExtensionCommandContext): Promise<void> {
		await waitForIdle(ctx);
		let changed = false;
		let extensionResetSucceeded = true;
		if ((filter === "all" || filter === "extension") && state.mutedExtensionToolSources.size > 0) {
			const active = new Set(pi.getActiveTools());
			for (const source of state.mutedExtensionToolSources) {
				for (const tool of extensionToolsForPath(source)) active.add(tool.name);
			}
			extensionResetSucceeded = setActiveToolNames(active);
			if (extensionResetSucceeded) {
				state.mutedExtensionToolSources.clear();
				changed = true;
			}
		}
		if ((filter === "all" || filter === "skill") && state.disabledSkillPaths.size > 0) {
			state.disabledSkillPaths.clear();
			skillEnforcement.clear();
			changed = true;
		}
		if ((filter === "all" || filter === "context") && state.disabledContextPaths.size > 0) {
			state.disabledContextPaths.clear();
			contextEnforcement.clear();
			changed = true;
		}
		if (changed) persist(ctx);
		updateFooter(ctx);
		if (!extensionResetSucceeded) {
			ctx.ui.notify("UNAVAILABLE: extension tool mutes were retained because tools could not be re-enabled; other selected policies were reset.", "error");
		} else {
			ctx.ui.notify(changed ? `Session ${filter} policy reset to defaults.` : `Session ${filter} policy is already at defaults.`, "info");
		}
	}

	function interactiveValue(resource: Resource): string {
		if (!resource.current) {
			return stateSet(resource.kind).has(resource.path) ? "disabled" : "not applicable";
		}
		if (resource.kind === "extension" && (resource.protected || resource.tools.length === 0)) {
			return "not applicable";
		}
		return stateSet(resource.kind).has(resource.path) ? "disabled" : "enabled";
	}

	function interactiveValues(resource: Resource): string[] | undefined {
		if (!resource.current) {
			return stateSet(resource.kind).has(resource.path) ? ["disabled", "enabled"] : undefined;
		}
		if (resource.kind === "extension" && (resource.protected || resource.tools.length === 0)) return undefined;
		return ["enabled", "disabled"];
	}

	function interactiveDescription(resource: Resource): string {
		if (resource.kind === "extension") {
			const active = new Set(pi.getActiveTools());
			const activeCount = resource.tools.filter((tool) => active.has(tool.name)).length;
			return `${resource.id} · ${activeCount}/${resource.tools.length} tools active · commands/events/providers/UI/background work remain loaded · ${resource.path}`;
		}
		if (resource.kind === "skill") {
			return `${resource.id} · remains discovered/readable; hiding affects future prompts and ordinary /skill:${resource.name ?? "name"} input only; RPC steer/follow_up may bypass the input gate · ${resource.path}`;
		}
		return `${resource.id} · prompt block only; file remains loaded/readable · ${resource.path}`;
	}

	async function openTui(resources: Resource[], ctx: ExtensionCommandContext): Promise<void> {
		let operationQueue: Promise<void> = Promise.resolve();
		await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
			const items: SettingItem[] = resources.map((resource) => ({
				id: resource.id,
				label: `${resource.kind}: ${resource.label}`,
				currentValue: interactiveValue(resource),
				values: interactiveValues(resource),
			}));
			const byId = new Map(resources.map((resource) => [resource.id, resource]));
			const settingsTheme = { ...getSettingsListTheme(), hint: () => "" };
			let settingsList: SettingsList;
			settingsList = new SettingsList(
				items,
				Math.min(Math.max(items.length, 1), 14),
				settingsTheme,
				(id, newValue) => {
					const resource = byId.get(id);
					if (!resource) return;
					const disabled = newValue === "disabled";
					operationQueue = operationQueue
						.then(async () => {
							await mutateResource(resource, disabled, ctx);
							settingsList.updateValue(id, interactiveValue(resource));
							tui.requestRender();
						})
						.catch(() => {
							ctx.ui.notify("UNAVAILABLE: resource policy change failed defensively.", "error");
							settingsList.updateValue(id, interactiveValue(resource));
							tui.requestRender();
						});
				},
				() => done(undefined),
				{ enableSearch: true },
			);
			return {
				render: (width: number) => {
					const lines = settingsList.render(width);
					while (lines.at(-1) === "") lines.pop();
					return lines;
				},
				invalidate: () => settingsList.invalidate(),
				handleInput: (data: string) => {
					settingsList.handleInput(data);
					tui.requestRender();
				},
			};
		});
		await operationQueue;
	}

	async function openRpc(resources: Resource[], ctx: ExtensionCommandContext): Promise<void> {
		while (true) {
			const doneLabel = "Done";
			const options = [
				...resources.map((resource) => `${resource.id} | ${resource.kind} | ${resource.label} | ${interactiveValue(resource)}`),
				doneLabel,
			];
			const selected = await ctx.ui.select(TITLE, options);
			if (!selected || selected === doneLabel) return;
			const id = selected.split(" | ", 1)[0];
			const resource = resources.find((item) => item.id === id);
			if (!resource) continue;
			if (!interactiveValues(resource)) {
				ctx.ui.notify(resourceLine(resource), resource.current ? "warning" : "error");
				continue;
			}
			const disabled = !stateSet(resource.kind).has(resource.path);
			const action =
				resource.kind === "extension" ? (disabled ? "mute tools" : "unmute tools") : disabled ? "disable" : "enable";
			if (!(await ctx.ui.confirm(`${action}: ${resource.label}`, interactiveDescription(resource)))) continue;
			await mutateResource(resource, disabled, ctx);
		}
	}

	async function openInteractive(ctx: ExtensionCommandContext): Promise<void> {
		const resources = refreshFromCommand(ctx);
		if (ctx.mode === "tui") {
			await openTui(resources, ctx);
			return;
		}
		if (ctx.mode === "rpc" && ctx.hasUI) {
			await openRpc(resources, ctx);
			return;
		}
		ctx.ui.notify("Interactive management is UNAVAILABLE in this mode. Use /toggle list, /toggle status, or explicit /toggle commands.", "error");
	}

	function helpText(): string {
		return [
			TITLE,
			"/toggle                              interactive manager (TUI/RPC)",
			"/toggle status|list [all|extension|skill|context]",
			"/toggle mute|unmute extension <id>",
			"/toggle disable|enable skill|context <id>",
			"/toggle deactivate|activate skill|context <id>   aliases for disable/enable",
			"/toggle toggle extension|skill|context <id>",
			"/toggle reset [all|extension|skill|context]",
			"/toggle reload                       whole-runtime refresh; not extension unloading",
			"/toggle help",
			"Selectors: opaque ID; unique skill name; or unique displayed label/basename. Command names may be suffixed (:1, :2) after collisions.",
			"Semantics: extension mute controls exposed tools only. Skill/context disable rewrites future system prompts and blocks disabled /skill:name through ordinary input; RPC steer/follow_up bypass Pi's input event and may still expand a disabled skill. Resources remain discovered/readable.",
			"No change erases prior messages, summaries, model knowledge, file reads, running processes, or other side effects. Prompt suppression is format/order-sensitive; later prompt/provider handlers may re-add material, and the resource toggler reports UNAVAILABLE rather than guessing.",
			"Context IDs may be absent from autocomplete until /toggle or a first agent run refreshes Pi's structured inventory.",
			"True module unload/load, event/command/provider/UI/background-work deactivation, and SYSTEM.md/APPEND_SYSTEM.md toggling are IMPOSSIBLE here; persistent configuration plus reload/restart is outside this session-only manager.",
		].join("\n");
	}

	function completionItems(prefix: string) {
		const resources = inventory();
		const candidates = new Map<string, string | undefined>();
		const add = (value: string, description?: string) => candidates.set(value, description);
		for (const value of ["help", "reload", "status", "list", "reset"]) add(value);
		for (const action of ["status", "list", "reset"]) {
			for (const kind of ["all", "extension", "skill", "context"]) add(`${action} ${kind}`);
		}
		const actionKinds: Array<[string, ResourceKind[]]> = [
			["mute", ["extension"]],
			["unmute", ["extension"]],
			["disable", ["skill", "context"]],
			["enable", ["skill", "context"]],
			["deactivate", ["skill", "context"]],
			["activate", ["skill", "context"]],
			["toggle", ["extension", "skill", "context"]],
		];
		for (const [action, kinds] of actionKinds) {
			add(action);
			for (const kind of kinds) {
				add(`${action} ${kind}`);
				for (const resource of resources.filter((item) => item.kind === kind)) {
					add(
						`${action} ${kind} ${resource.id}`,
						`${resource.label}${scopeLabel(resource)} — ${interactiveValue(resource)}`,
					);
				}
			}
		}
		const normalizedPrefix = prefix.trimStart();
		const matches = [...candidates.entries()].filter(([value]) => value.startsWith(normalizedPrefix));
		return matches.length > 0
			? matches.map(([value, description]) => ({ value, label: value, ...(description ? { description } : {}) }))
			: null;
	}

	async function commandHandler(rawArgs: string, ctx: ExtensionCommandContext): Promise<void> {
		const args = rawArgs.trim();
		if (!args) {
			await openInteractive(ctx);
			return;
		}
		const tokens = args.split(/\s+/);
		const action = tokens[0].toLowerCase();

		if (action === "help") {
			ctx.ui.notify(helpText(), "info");
			return;
		}
		if (action === "status" || action === "list") {
			if (tokens.length > 2) {
				ctx.ui.notify(`UNAVAILABLE: too many arguments.\n${helpText()}`, "error");
				return;
			}
			const filter = tokens[1] ? normalizeKind(tokens[1], true) : "all";
			if (!filter) {
				ctx.ui.notify("UNAVAILABLE: expected all, extension, skill, or context.", "error");
				return;
			}
			ctx.ui.notify(formatReport(refreshFromCommand(ctx), filter, action === "status"), "info");
			return;
		}
		if (action === "reset") {
			if (tokens.length > 2) {
				ctx.ui.notify("UNAVAILABLE: reset accepts one optional resource kind.", "error");
				return;
			}
			const filter = tokens[1] ? normalizeKind(tokens[1], true) : "all";
			if (!filter) {
				ctx.ui.notify("UNAVAILABLE: expected all, extension, skill, or context.", "error");
				return;
			}
			await resetPolicy(filter, ctx);
			return;
		}
		if (action === "reload") {
			if (tokens.length !== 1) {
				ctx.ui.notify("UNAVAILABLE: reload accepts no arguments.", "error");
				return;
			}
			await waitForIdle(ctx);
			if (!persist(ctx)) {
				ctx.ui.notify("UNAVAILABLE: reload cancelled because current policy could not be saved safely.", "error");
				return;
			}
			ctx.ui.notify("PENDING RELOAD: whole runtime refresh requested; this is not extension unloading.", "info");
			await ctx.reload();
			return;
		}

		const knownActions = new Set(["mute", "unmute", "disable", "enable", "deactivate", "activate", "toggle"]);
		if (!knownActions.has(action)) {
			ctx.ui.notify(`UNAVAILABLE: unknown action "${tokens[0]}".\n${helpText()}`, "error");
			return;
		}
		const kind = normalizeKind(tokens[1]);
		if (!kind || kind === "all") {
			ctx.ui.notify("UNAVAILABLE: expected extension, skill, or context.", "error");
			return;
		}

		if ((action === "activate" || action === "deactivate") && kind === "extension") {
			ctx.ui.notify(
				action === "activate"
					? "IMPOSSIBLE: the extension is already loaded. Use 'unmute extension' to enable its currently exposed tools."
					: "IMPOSSIBLE: true extension unloading is unavailable. Use 'mute extension' to disable its currently exposed tools only.",
				"error",
			);
			return;
		}
		if ((action === "disable" || action === "enable") && kind === "extension") {
			ctx.ui.notify(`IMPOSSIBLE: use '${action === "disable" ? "mute" : "unmute"} extension'; the module remains loaded.`, "error");
			return;
		}
		if ((action === "mute" || action === "unmute") && kind !== "extension") {
			ctx.ui.notify(`UNAVAILABLE: use '${action === "mute" ? "disable" : "enable"} ${kind}'.`, "error");
			return;
		}
		if ((action === "activate" || action === "deactivate") && kind !== "extension") {
			// Accepted aliases below.
		} else if (!["toggle", "mute", "unmute", "disable", "enable"].includes(action)) {
			ctx.ui.notify("UNAVAILABLE: action and resource kind do not match.", "error");
			return;
		}

		const selector = tokens.slice(2).join(" ");
		if (!selector) {
			ctx.ui.notify(`UNAVAILABLE: missing ${kind} selector. Run /toggle list ${kind}.`, "error");
			return;
		}
		const resources = refreshFromCommand(ctx);
		const resolved = resolveSelector(kind, selector, resources);
		if (!resolved.resource) {
			ctx.ui.notify(resolved.error ?? "UNAVAILABLE: selector did not resolve.", "error");
			return;
		}
		let disabled: boolean;
		if (action === "toggle") disabled = !stateSet(kind).has(resolved.resource.path);
		else if (action === "mute" || action === "disable" || action === "deactivate") disabled = true;
		else disabled = false;
		await mutateResource(resolved.resource, disabled, ctx);
	}

	const commandOptions = {
		description: DESCRIPTION,
		getArgumentCompletions: completionItems,
		handler: commandHandler,
	};
	pi.registerCommand("toggle", commandOptions);

	pi.on("session_start", (event, ctx) => {
		cachedSkills.clear();
		cachedContexts.clear();
		promptWarnings = [];
		restoreFromBranch(ctx);
		if (event.reason === "reload") {
			ctx.ui.notify("Whole runtime reload complete; session policy restored. Extensions were refreshed, not selectively unloaded.", "info");
		}
	});

	pi.on("session_tree", (_event, ctx) => {
		promptWarnings = [];
		restoreFromBranch(ctx);
	});

	pi.on("before_agent_start", (event, ctx) => {
		cachePromptInventory(event.systemPromptOptions);
		reapplyToolMutes();
		skillEnforcement.clear();
		contextEnforcement.clear();
		promptWarnings = [];
		let systemPrompt = event.systemPrompt;

		const allSkills: Skill[] = event.systemPromptOptions.skills ?? [];
		const currentSkillPaths = new Set(allSkills.map((skill) => skill.filePath));
		const disabledCurrentSkills = allSkills.filter((skill) => state.disabledSkillPaths.has(skill.filePath));
		for (const path of state.disabledSkillPaths) {
			if (!currentSkillPaths.has(path)) continue;
			const skill = allSkills.find((candidate) => candidate.filePath === path);
			if (skill?.disableModelInvocation) skillEnforcement.set(path, "already absent");
			else skillEnforcement.set(path, "not yet evaluated");
		}
		const visibleDisabledSkills = disabledCurrentSkills.filter((skill) => !skill.disableModelInvocation);
		if (visibleDisabledSkills.length > 0) {
			const hasRead = !event.systemPromptOptions.selectedTools || event.systemPromptOptions.selectedTools.includes("read");
			if (!hasRead) {
				for (const skill of visibleDisabledSkills) skillEnforcement.set(skill.filePath, "already absent");
			} else {
				const originalSection = formatSkillsForPrompt(allSkills);
				const filteredSection = formatSkillsForPrompt(
					allSkills.filter((skill) => !state.disabledSkillPaths.has(skill.filePath)),
				);
				if (originalSection !== filteredSection && countOccurrences(systemPrompt, originalSection) === 1) {
					systemPrompt = systemPrompt.replace(originalSection, filteredSection);
					for (const skill of visibleDisabledSkills) skillEnforcement.set(skill.filePath, "applied");
				} else {
					for (const skill of visibleDisabledSkills) skillEnforcement.set(skill.filePath, "unavailable");
					promptWarnings.push("Skill prompt suppression was UNAVAILABLE for this run; the prompt was left unchanged.");
				}
			}
		}

		const allContexts = event.systemPromptOptions.contextFiles ?? [];
		const currentContextPaths = new Set(allContexts.map((contextFile) => contextFile.path));
		const disabledCurrentContexts = allContexts.filter((contextFile) => state.disabledContextPaths.has(contextFile.path));
		for (const path of state.disabledContextPaths) {
			if (currentContextPaths.has(path)) contextEnforcement.set(path, "not yet evaluated");
		}
		if (disabledCurrentContexts.length > 0) {
			const originalSection = formatContextFiles(allContexts);
			const filteredSection = formatContextFiles(
				allContexts.filter((contextFile) => !state.disabledContextPaths.has(contextFile.path)),
			);
			if (originalSection !== filteredSection && countOccurrences(systemPrompt, originalSection) === 1) {
				systemPrompt = systemPrompt.replace(originalSection, filteredSection);
				for (const contextFile of disabledCurrentContexts) contextEnforcement.set(contextFile.path, "applied");
			} else {
				for (const contextFile of disabledCurrentContexts) contextEnforcement.set(contextFile.path, "unavailable");
				promptWarnings.push("Context-file prompt suppression was UNAVAILABLE for this run; the prompt was left unchanged.");
			}
		}

		updateFooter(ctx);
		return systemPrompt === event.systemPrompt ? undefined : { systemPrompt };
	});

	pi.on("input", (event, ctx) => {
		const match = event.text.match(/^\/skill:([^\s]+)(?:\s|$)/);
		if (!match) return { action: "continue" } as const;
		const commandName = `skill:${match[1]}`;
		const command = pi.getCommands().find((candidate) => candidate.source === "skill" && candidate.name === commandName);
		if (!command || !state.disabledSkillPaths.has(command.sourceInfo.path)) return { action: "continue" } as const;
		ctx.ui.notify(
			"Skill is disabled for ordinary input in this session; it remains discovered/readable, and RPC steer/follow_up may bypass this gate. Prior conversation context is unchanged.",
			"warning",
		);
		return { action: "handled" } as const;
	});

	pi.on("tool_call", (event) => {
		const allTools = pi.getAllTools();
		const tool = allTools.find((candidate) => candidate.name === event.toolName);
		const source = tool?.sourceInfo?.path;
		if (!source || !state.mutedExtensionToolSources.has(source)) return;

		// ID rendering must never weaken the gate. Build the same peer set as the
		// extension inventory, but fall back to the source alone if command
		// discovery unexpectedly fails.
		const peerPaths = new Set(state.mutedExtensionToolSources);
		for (const candidate of allTools) {
			if (candidate.sourceInfo.source !== "builtin" && candidate.sourceInfo.source !== "sdk") {
				peerPaths.add(candidate.sourceInfo.path);
			}
		}
		try {
			for (const command of pi.getCommands()) {
				if (command.source === "extension" && command.sourceInfo.path) peerPaths.add(command.sourceInfo.path);
			}
		} catch {
			// Keep blocking with the stable short ID derived from known tool sources.
		}
		const id = opaqueId("extension", source, [...peerPaths]);
		return {
			block: true,
			reason: `Tool capability blocked by resource toggler (${id}): this extension's tools are muted for the session; its module, commands, and events remain loaded.`,
		};
	});
}
