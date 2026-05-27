/**
 * Split Pi Gemini Web utility extension (local fork of pi-web-access).
 *
 * Registers /google-account for checking browser-cookie Gemini Web auth.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getActiveGoogleEmail, isGeminiWebAvailable } from "./web-access/gemini-web.js";
import { isBrowserCookieAccessAllowed } from "./web-access/gemini-web-config.ts";

export default function webGeminiExtension(pi: ExtensionAPI) {
	pi.registerCommand("google-account", {
		description: "Show the active Google account for Gemini Web",
		handler: async () => {
			if (!isBrowserCookieAccessAllowed()) {
				pi.sendMessage({
					customType: "google-account",
					content: [{ type: "text", text: "Gemini Web browser cookie access is disabled. Set allowBrowserCookies: true in ~/.pi/web-search.json to enable it." }],
					display: "tool",
					details: { available: false, cookieAccessAllowed: false },
				}, { triggerTurn: true, deliverAs: "followUp" });
				return;
			}

			const cookies = await isGeminiWebAvailable();
			if (!cookies) {
				pi.sendMessage({
					customType: "google-account",
					content: [{ type: "text", text: "Gemini Web is unavailable. Sign into gemini.google.com in a supported Chromium-based browser." }],
					display: "tool",
					details: { available: false, cookieAccessAllowed: true },
				}, { triggerTurn: true, deliverAs: "followUp" });
				return;
			}

			const email = await getActiveGoogleEmail(cookies);
			const text = email
				? `Active Google account: ${email}`
				: "Gemini Web is available, but the active Google account could not be determined.";

			pi.sendMessage({
				customType: "google-account",
				content: [{ type: "text", text }],
				display: "tool",
				details: { available: true, email: email ?? null },
			}, { triggerTurn: true, deliverAs: "followUp" });
		},
	});


}
