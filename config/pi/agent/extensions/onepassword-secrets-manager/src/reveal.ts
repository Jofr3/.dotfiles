import { Buffer } from "node:buffer";
import type { DynamicSelectionSession } from "./dynamic.ts";
import type { OnePasswordManager } from "./manager.ts";
import { REQUEST_DEADLINE_MS } from "./safety.ts";

export const REVEAL_TIMEOUT_MS = 30_000;

export type RevealFailureCode =
	| "aborted"
	| "approval_denied"
	| "approval_required"
	| "invalid_input"
	| "lifecycle"
	| "request_failed"
	| "unexpected";

export interface RevealToolResult {
	readonly content: readonly Readonly<{ type: "text"; text: string }>[];
	readonly details: Readonly<{ ok: boolean; code?: RevealFailureCode; displayed?: boolean }>;
}

export interface RevealTimerApi {
	setTimeout(callback: () => void, delayMs: number): unknown;
	clearTimeout(handle: unknown): void;
}

const defaultTimers: RevealTimerApi = {
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function safeRevealText(value: string): string {
	let output = "";
	for (const character of value) {
		const point = character.codePointAt(0)!;
		if (point < 0x20 || point > 0x7e) {
			output += point <= 0xffff
				? `\\u${point.toString(16).padStart(4, "0")}`
				: `\\u{${point.toString(16)}}`;
		} else {
			output += character;
		}
	}
	return output;
}

function wrapPlain(text: string, width: number): string[] {
	const safeWidth = Math.max(1, Math.floor(width));
	const lines: string[] = [];
	for (const logical of text.split("\n")) {
		if (logical.length === 0) { lines.push(""); continue; }
		for (let offset = 0; offset < logical.length; offset += safeWidth) {
			lines.push(logical.slice(offset, offset + safeWidth));
		}
	}
	return lines;
}

/**
 * TUI-only popup. The secret is held in a JavaScript private field so ordinary
 * serialization of the component cannot persist it. render() is the one
 * intentional disclosure sink.
 */
export class SecretRevealPopup {
	#display: string | undefined;
	#timer: unknown;
	#closed = false;
	readonly #done: () => void;
	readonly #timers: RevealTimerApi;
	readonly #onDispose?: () => void;

	constructor(
		secret: string,
		done: () => void,
		timers: RevealTimerApi = defaultTimers,
		timeoutMs = REVEAL_TIMEOUT_MS,
		onDispose?: () => void,
	) {
		if (
			typeof secret !== "string" || secret.length === 0 ||
			Buffer.byteLength(secret, "utf8") > 64 * 1024 ||
			!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > REVEAL_TIMEOUT_MS
		) throw new Error("Secret reveal popup could not be created.");
		this.#display = safeRevealText(secret);
		this.#done = done;
		this.#timers = timers;
		this.#onDispose = onDispose;
		this.#timer = timers.setTimeout(() => this.close(), timeoutMs);
	}

	render(width: number): string[] {
		const value = this.#display;
		if (value === undefined) return [];
		return wrapPlain(
			`1Password secret (clears in 30 seconds)\n\n${value}\n\nPress Enter or Escape to dismiss early.`,
			width,
		);
	}

	handleInput(data: string): void {
		if (data === "\r" || data === "\n" || data === "\x1b" || data === "q") this.close();
	}

	invalidate(): void {}

	dispose(): void { this.close(); }

	close(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.#timers.clearTimeout(this.#timer);
		this.#timer = undefined;
		this.#display = undefined;
		try { this.#onDispose?.(); } catch { /* The popup is already cleared. */ }
		try { this.#done(); } catch { /* Never surface a TUI callback error. */ }
	}

	isCleared(): boolean { return this.#display === undefined; }
}

export class RevealRegistry {
	#popups = new Set<SecretRevealPopup>();
	#closed = false;
	readonly #timers: RevealTimerApi;

	constructor(timers: RevealTimerApi = defaultTimers) { this.#timers = timers; }

	create(secret: string, done: () => void): SecretRevealPopup {
		if (this.#closed) throw new Error("Secret reveal registry is closed.");
		let popup!: SecretRevealPopup;
		popup = new SecretRevealPopup(secret, done, this.#timers, REVEAL_TIMEOUT_MS, () => {
			this.#popups.delete(popup);
		});
		this.#popups.add(popup);
		return popup;
	}

	clear(): void {
		for (const popup of [...this.#popups]) popup.close();
		this.#popups.clear();
	}

	shutdown(): void {
		this.#closed = true;
		this.clear();
	}

	status(): Readonly<{ active: number; closed: boolean }> {
		return Object.freeze({ active: this.#popups.size, closed: this.#closed });
	}
}

function result(ok: boolean, code?: RevealFailureCode): RevealToolResult {
	return Object.freeze({
		content: Object.freeze([{
			type: "text" as const,
			text: ok
				? "The approved secret was shown only in a temporary TUI popup and has been cleared."
				: `1Password reveal failed (${code ?? "unexpected"}).`,
		}]),
		details: Object.freeze(ok ? { ok: true, displayed: true } : { ok: false, code }),
	});
}

function revealInput(value: unknown): { vaultId: string; itemId: string; fieldId: string } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid_input");
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) throw new Error("invalid_input");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const keys = ["vaultId", "itemId", "fieldId"] as const;
	if (Reflect.ownKeys(descriptors).length !== keys.length) throw new Error("invalid_input");
	const output: Partial<Record<(typeof keys)[number], string>> = {};
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || typeof descriptor.value !== "string") {
			throw new Error("invalid_input");
		}
		output[key] = descriptor.value;
	}
	return output as { vaultId: string; itemId: string; fieldId: string };
}

function aborted(signal: AbortSignal | undefined): boolean {
	try { return signal?.aborted === true; } catch { return true; }
}

export interface RevealContext {
	readonly mode: string;
	readonly hasUI: boolean;
	readonly ui: {
		confirm(title: string, message: string, options: { timeout: number; signal: AbortSignal }): Promise<boolean>;
		custom<T>(
			factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (value: T) => void) => unknown,
			options?: unknown,
		): Promise<T | undefined>;
	};
}

export async function revealDynamicField(
	dynamic: DynamicSelectionSession,
	manager: OnePasswordManager,
	registry: RevealRegistry,
	input: Readonly<{ vaultId: string; itemId: string; fieldId: string }>,
	signal: AbortSignal | undefined,
	ctx: RevealContext,
): Promise<RevealToolResult> {
	if (ctx.mode !== "tui" || ctx.hasUI !== true) return result(false, "approval_required");
	if (aborted(signal)) return result(false, "aborted");
	try {
		const parsed = revealInput(input);
		const choice = await dynamic.verifyFieldChoice(parsed.vaultId, parsed.itemId, parsed.fieldId, signal);
		const controller = new AbortController();
		const onAbort = () => { try { controller.abort("reveal-cancelled"); } catch { /* Deny below. */ } };
		if (signal !== undefined) signal.addEventListener("abort", onAbort, { once: true });
		let approved = false;
		try {
			approved = await ctx.ui.confirm(
				"Reveal 1Password field in this terminal?",
				[
					`Vault: ${choice.vault.title}`,
					`Item: ${choice.selection.item.title}`,
					`Field: ${choice.selection.field.title}`,
					"",
					"The value will be rendered only in a TUI popup, never returned to the model, and cleared after 30 seconds or on early dismissal.",
				].join("\n"),
				{ timeout: REQUEST_DEADLINE_MS, signal: controller.signal },
			);
		} catch { approved = false; }
		finally {
			if (signal !== undefined) {
				try { signal.removeEventListener("abort", onAbort); } catch { /* Fixed denial. */ }
			}
		}
		if (approved !== true || aborted(signal)) return result(false, approved ? "aborted" : "approval_denied");
		let secret: string | undefined = await manager.resolveVerifiedFieldSelection(choice.selection, signal);
		try {
			await ctx.ui.custom<void>((_tui, _theme, _keybindings, done) => {
				return registry.create(secret as string, () => done(undefined));
			}, {
				overlay: true,
				overlayOptions: { anchor: "center", width: "80%", maxHeight: "80%", margin: 1 },
			});
		} catch {
			return result(false, "unexpected");
		} finally {
			secret = undefined;
			registry.clear();
		}
		return result(true);
	} catch (error) {
		return result(false, aborted(signal)
			? "aborted"
			: error instanceof Error && error.message === "invalid_input"
				? "invalid_input"
				: "request_failed");
	}
}
