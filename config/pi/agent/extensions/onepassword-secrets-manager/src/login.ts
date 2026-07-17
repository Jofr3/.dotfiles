import type { DynamicSelectionSession } from "./dynamic.ts";
import type { OnePasswordManager, VerifiedLoginSelection } from "./manager.ts";
import { REQUEST_DEADLINE_MS } from "./safety.ts";
import type { StagehandCredentialLease, StagehandLeasePage, StagehandLeaseSource } from "./stagehand-lease.ts";

export type LoginFailureCode =
	| "aborted"
	| "approval_denied"
	| "approval_required"
	| "field_mapping_ambiguous"
	| "invalid_input"
	| "lease_revoked"
	| "mfa_required"
	| "origin_mismatch"
	| "redirect_rejected"
	| "request_failed"
	| "unexpected_step";

export interface LoginToolResult {
	readonly content: readonly Readonly<{ type: "text"; text: string }>[];
	readonly details: Readonly<{
		ok: boolean;
		code?: LoginFailureCode;
		filled?: boolean;
		submitted?: boolean;
	}>;
}

export interface LoginPageAnalysis {
	readonly usernameCandidates: number;
	readonly passwordCandidates: number;
	readonly sameForm: boolean;
	readonly formAction?: string;
	readonly submitCandidates: number;
}

export interface LoginFillResult {
	readonly filled: boolean;
	readonly submitted: boolean;
}

export type LoginPostStep = "complete" | "mfa" | "login_form" | "unexpected";

/** Runs only inside the browser page. It never receives credential values. */
export function analyzeLoginPage(): LoginPageAnalysis {
	const visible = (element: Element): boolean => {
		const node = element as HTMLElement;
		const style = window.getComputedStyle(node);
		const box = node.getBoundingClientRect();
		return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
	};
	const inputs = [...document.querySelectorAll("input")].filter((input) =>
		!input.disabled && !input.readOnly && visible(input),
	) as HTMLInputElement[];
	const scoreUsername = (input: HTMLInputElement): number => {
		const autocomplete = (input.autocomplete || "").toLowerCase();
		const identity = `${input.name} ${input.id} ${input.getAttribute("aria-label") ?? ""}`.toLowerCase();
		if (autocomplete.split(/\s+/u).includes("username")) return 100;
		if (input.type === "email") return 80;
		if (/(?:^|[^a-z])(user(?:name)?|email|login)(?:[^a-z]|$)/u.test(identity)) return 60;
		return -1;
	};
	const scorePassword = (input: HTMLInputElement): number => {
		const autocomplete = (input.autocomplete || "").toLowerCase();
		if (autocomplete.split(/\s+/u).includes("current-password")) return 100;
		if (input.type === "password") return 50;
		return -1;
	};
	const strongest = (score: (input: HTMLInputElement) => number): HTMLInputElement[] => {
		const ranked = inputs.map((input) => ({ input, score: score(input) })).filter((entry) => entry.score >= 0);
		const maximum = ranked.reduce((current, entry) => Math.max(current, entry.score), -1);
		return ranked.filter((entry) => entry.score === maximum).map((entry) => entry.input);
	};
	const usernames = strongest(scoreUsername);
	const passwords = strongest(scorePassword);
	const usernameForm = usernames[0]?.form;
	const passwordForm = passwords[0]?.form;
	const form = usernameForm && usernameForm === passwordForm ? usernameForm : undefined;
	const submitCandidates = form
		? [...form.querySelectorAll('button[type="submit"],input[type="submit"],button:not([type])')]
			.filter((button) => !(button as HTMLButtonElement).disabled && visible(button)).length
		: 0;
	return {
		usernameCandidates: usernames.length,
		passwordCandidates: passwords.length,
		sameForm: Boolean(form),
		...(form?.action ? { formAction: form.action } : {}),
		submitCandidates,
	};
}

/** Runs only inside the browser page. Credentials are used solely as DOM setter arguments. */
export function fillLoginPage(credentials: { username: string; password: string; submit: boolean }): LoginFillResult {
	const visible = (element: Element): boolean => {
		const node = element as HTMLElement;
		const style = window.getComputedStyle(node);
		const box = node.getBoundingClientRect();
		return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
	};
	const inputs = [...document.querySelectorAll("input")].filter((input) =>
		!input.disabled && !input.readOnly && visible(input),
	) as HTMLInputElement[];
	const rank = (kind: "username" | "password", input: HTMLInputElement): number => {
		const autocomplete = (input.autocomplete || "").toLowerCase().split(/\s+/u);
		const identity = `${input.name} ${input.id} ${input.getAttribute("aria-label") ?? ""}`.toLowerCase();
		if (kind === "password") {
			if (autocomplete.includes("current-password")) return 100;
			return input.type === "password" ? 50 : -1;
		}
		if (autocomplete.includes("username")) return 100;
		if (input.type === "email") return 80;
		if (/(?:^|[^a-z])(user(?:name)?|email|login)(?:[^a-z]|$)/u.test(identity)) return 60;
		return -1;
	};
	const one = (kind: "username" | "password"): HTMLInputElement => {
		const ranked = inputs.map((input) => ({ input, score: rank(kind, input) })).filter((entry) => entry.score >= 0);
		const maximum = ranked.reduce((current, entry) => Math.max(current, entry.score), -1);
		const candidates = ranked.filter((entry) => entry.score === maximum);
		if (candidates.length !== 1) throw new Error("login-field-mapping-rejected");
		return candidates[0]!.input;
	};
	const username = one("username");
	const password = one("password");
	if (!username.form || username.form !== password.form) throw new Error("login-form-mapping-rejected");
	const setValue = (input: HTMLInputElement, value: string): void => {
		const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
		if (!descriptor?.set) throw new Error("login-input-setter-unavailable");
		descriptor.set.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	};
	setValue(username, credentials.username);
	setValue(password, credentials.password);
	if (!credentials.submit) return { filled: true, submitted: false };
	const form = username.form;
	const buttons = [...form.querySelectorAll('button[type="submit"],input[type="submit"],button:not([type])')]
		.filter((button) => !(button as HTMLButtonElement).disabled && visible(button)) as HTMLElement[];
	if (buttons.length > 1) throw new Error("login-submit-mapping-rejected");
	if (typeof form.requestSubmit === "function") {
		form.requestSubmit(buttons[0] as HTMLButtonElement | undefined);
	} else if (buttons.length === 1) {
		buttons[0]!.click();
	} else {
		throw new Error("login-submit-unavailable");
	}
	return { filled: true, submitted: true };
}

/** Runs only inside the browser page and returns a fixed step category. */
export function classifyLoginStep(): LoginPostStep {
	const visible = (element: Element): boolean => {
		const node = element as HTMLElement;
		const style = window.getComputedStyle(node);
		const box = node.getBoundingClientRect();
		return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
	};
	const inputs = [...document.querySelectorAll("input")].filter((input) => !input.disabled && visible(input)) as HTMLInputElement[];
	const mfa = inputs.some((input) => {
		const text = `${input.autocomplete} ${input.name} ${input.id} ${input.getAttribute("aria-label") ?? ""}`.toLowerCase();
		return /(?:one-time-code|otp|totp|mfa|two.factor|verification.code|authenticator)/u.test(text);
	});
	if (mfa) return "mfa";
	const password = inputs.some((input) => input.type === "password" || input.autocomplete.toLowerCase().includes("current-password"));
	if (password) return "login_form";
	if (document.body && document.body.childElementCount > 0) return "complete";
	return "unexpected";
}

function loginInput(value: unknown): { vaultId: string; itemId: string; submit?: boolean } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid_input");
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) throw new Error("invalid_input");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (typeof key !== "string" || (key !== "vaultId" && key !== "itemId" && key !== "submit")) throw new Error("invalid_input");
		const descriptor = descriptors[key];
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("invalid_input");
	}
	const vaultId = descriptors.vaultId && "value" in descriptors.vaultId ? descriptors.vaultId.value : undefined;
	const itemId = descriptors.itemId && "value" in descriptors.itemId ? descriptors.itemId.value : undefined;
	const submit = descriptors.submit && "value" in descriptors.submit ? descriptors.submit.value : undefined;
	if (typeof vaultId !== "string" || typeof itemId !== "string" || (submit !== undefined && typeof submit !== "boolean")) {
		throw new Error("invalid_input");
	}
	return { vaultId, itemId, ...(submit === undefined ? {} : { submit }) };
}

function signalAborted(signal: AbortSignal | undefined): boolean {
	try { return signal?.aborted === true; } catch { return true; }
}

function validateAnalysis(value: unknown): LoginPageAnalysis {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("analysis");
	const record = value as Record<string, unknown>;
	if (
		!Number.isSafeInteger(record.usernameCandidates) || !Number.isSafeInteger(record.passwordCandidates) ||
		typeof record.sameForm !== "boolean" || !Number.isSafeInteger(record.submitCandidates) ||
		(record.formAction !== undefined && typeof record.formAction !== "string")
	) throw new Error("analysis");
	return value as LoginPageAnalysis;
}

function result(ok: boolean, code?: LoginFailureCode, submitted = false): LoginToolResult {
	const text = ok
		? submitted ? "1Password login fields were filled and the form was submitted." : "1Password login fields were filled without submission."
		: code === "mfa_required"
			? "Login credentials were submitted; MFA is required and was not automated."
			: `1Password login fill failed (${code ?? "request_failed"}).`;
	return Object.freeze({
		content: Object.freeze([{ type: "text" as const, text }]),
		details: Object.freeze(ok
			? { ok: true, filled: true, submitted }
			: { ok: false, code, filled: code === "mfa_required", submitted: code === "mfa_required" }),
	});
}

function revoked(lease: StagehandCredentialLease): boolean {
	try { return lease.isRevoked(); } catch { return true; }
}

async function preflight(lease: StagehandCredentialLease, signal: AbortSignal | undefined): Promise<{ url: string; analysis: LoginPageAnalysis }> {
	return lease.run("login-form-fill", signal, async (page) => ({
		url: page.url(),
		analysis: validateAnalysis(await page.evaluate(analyzeLoginPage)),
	}));
}

async function settle(page: StagehandLeasePage): Promise<void> {
	try { await page.waitForLoadState("domcontentloaded", 8_000); }
	catch {
		try { await page.waitForTimeout(250); } catch { /* Classification below remains authoritative. */ }
	}
}

export interface LoginContext {
	readonly hasUI: boolean;
	readonly ui: {
		confirm(title: string, message: string, options: { timeout: number; signal: AbortSignal }): Promise<boolean>;
	};
}

export class LoginAutofillService {
	readonly #dynamic: DynamicSelectionSession;
	readonly #manager: OnePasswordManager;
	readonly #leases: StagehandLeaseSource;
	#closed = false;

	constructor(dynamic: DynamicSelectionSession, manager: OnePasswordManager, leases: StagehandLeaseSource) {
		this.#dynamic = dynamic;
		this.#manager = manager;
		this.#leases = leases;
	}

	async fill(
		input: Readonly<{ vaultId: string; itemId: string; submit?: boolean }>,
		signal: AbortSignal | undefined,
		ctx: LoginContext,
	): Promise<LoginToolResult> {
		if (this.#closed || signalAborted(signal)) return result(false, "aborted");
		if (ctx.hasUI !== true) return result(false, "approval_required");
		let credentials: { username: string; password: string; submit: boolean } | undefined;
		try {
			const parsed = loginInput(input);
			const choice = await this.#dynamic.prepareLoginChoice(parsed.vaultId, parsed.itemId, signal);
			const lease = await this.#leases.acquire(signal);
			if (revoked(lease)) return result(false, "lease_revoked");
			const before = await preflight(lease, signal);
			if (!this.#manager.loginOriginAllowed(choice.selection, before.url)) return result(false, "origin_mismatch");
			if (before.analysis.formAction && !this.#manager.loginOriginAllowed(choice.selection, before.analysis.formAction)) {
				return result(false, "redirect_rejected");
			}
			if (
				before.analysis.usernameCandidates !== 1 || before.analysis.passwordCandidates !== 1 ||
				before.analysis.sameForm !== true || (parsed.submit !== false && before.analysis.submitCandidates > 1)
			) return result(false, "field_mapping_ambiguous");

			const controller = new AbortController();
			const onAbort = () => { try { controller.abort("login-fill-cancelled"); } catch { /* Deny below. */ } };
			if (signal !== undefined) signal.addEventListener("abort", onAbort, { once: true });
			let approved = false;
			try {
				approved = await ctx.ui.confirm(
					parsed.submit === false ? "Fill 1Password login?" : "Fill and submit 1Password login?",
					[
						`Vault: ${choice.vault.title}`,
						`Item: ${choice.selection.item.title}`,
						`Origin: ${new URL(before.url).origin}`,
						"",
						parsed.submit === false
							? "Credentials will be re-resolved now and filled into the current login form without submission."
							: "Credentials will be re-resolved now, filled into the current login form, and the unambiguous form will be submitted automatically. MFA is never automated.",
					].join("\n"),
					{ timeout: REQUEST_DEADLINE_MS, signal: controller.signal },
				);
			} catch { approved = false; }
			finally {
				if (signal !== undefined) {
					try { signal.removeEventListener("abort", onAbort); } catch { /* Fixed denial. */ }
				}
			}
			if (approved !== true || signalAborted(signal)) return result(false, approved ? "aborted" : "approval_denied");
			const resolved = await this.#manager.resolveLoginCredentials(choice.selection, signal);
			credentials = { username: resolved.username, password: resolved.password, submit: parsed.submit !== false };
			const browser = await lease.run("login-form-fill", signal, async (page) => {
				const currentUrl = page.url();
				if (!this.#manager.loginOriginAllowed(choice.selection, currentUrl)) throw new Error("origin");
				const analysis = validateAnalysis(await page.evaluate(analyzeLoginPage));
				if (analysis.formAction && !this.#manager.loginOriginAllowed(choice.selection, analysis.formAction)) throw new Error("redirect");
				if (
					analysis.usernameCandidates !== 1 || analysis.passwordCandidates !== 1 ||
					analysis.sameForm !== true || (credentials!.submit && analysis.submitCandidates > 1)
				) throw new Error("mapping");
				const startUrl = currentUrl;
				const filled = await page.evaluate(fillLoginPage, credentials!);
				if (!filled || filled.filled !== true || typeof filled.submitted !== "boolean") throw new Error("fill");
				if (filled.submitted) await settle(page);
				return { filled, startUrl, url: page.url(), step: filled.submitted ? await page.evaluate(classifyLoginStep) : "complete" as const };
			});
			credentials.username = "";
			credentials.password = "";
			credentials = undefined;
			if (!this.#manager.loginOriginAllowed(choice.selection, browser.url)) return result(false, "redirect_rejected");
			if (browser.step === "mfa") return result(false, "mfa_required");
			if (browser.step === "login_form" || browser.step === "unexpected") return result(false, "unexpected_step");
			if (browser.step !== "complete") return result(false, "unexpected_step");
			if (browser.filled.submitted && browser.url === browser.startUrl) return result(false, "unexpected_step");
			return result(true, undefined, browser.filled.submitted);
		} catch (error) {
			if (credentials !== undefined) {
				credentials.username = "";
				credentials.password = "";
				credentials = undefined;
			}
			const code = signalAborted(signal)
				? "aborted"
				: error instanceof Error && error.message === "invalid_input"
					? "invalid_input"
					: "request_failed";
			return result(false, code);
		}
	}

	reset(): void { this.#leases.reset(); }

	shutdown(): void {
		this.#closed = true;
		this.#leases.shutdown();
	}
}
