const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]"]);
export const DEFAULT_CDP_DISCOVERY_ORIGIN = "http://127.0.0.1:9222";
const DISCOVERY_PATH = "/json/version";
const MAX_DISCOVERY_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 2_000;

export function validateCdpDiscoveryOrigin(raw: string): string {
	let origin: URL;
	try {
		origin = new URL(raw);
	} catch {
		throw new Error("STAGEHAND_CDP_DISCOVERY_ORIGIN must be an absolute loopback HTTP origin");
	}
	if (
		origin.protocol !== "http:" ||
		!LOOPBACK_HOSTS.has(origin.hostname.toLowerCase()) ||
		!origin.port ||
		origin.username ||
		origin.password ||
		(origin.pathname !== "/" && origin.pathname !== "") ||
		origin.search ||
		origin.hash
	) {
		throw new Error(
			"STAGEHAND_CDP_DISCOVERY_ORIGIN must use a literal IPv4 or IPv6 loopback HTTP origin with an explicit port and no credentials, path, query, or fragment",
		);
	}
	return origin.origin;
}

function parseLoopbackBrowserWebSocket(raw: string, errorPrefix: string): URL {
	let endpoint: URL;
	try {
		endpoint = new URL(raw);
	} catch {
		throw new Error(`${errorPrefix} must be a valid browser-level WebSocket endpoint`);
	}
	if (
		endpoint.protocol !== "ws:" ||
		!LOOPBACK_HOSTS.has(endpoint.hostname.toLowerCase()) ||
		!endpoint.port ||
		endpoint.username ||
		endpoint.password ||
		endpoint.search ||
		endpoint.hash ||
		!/^\/devtools\/browser\/[^/]+$/.test(endpoint.pathname)
	) {
		throw new Error(
			`${errorPrefix} must use a literal loopback ws:// host with an explicit port, no credentials/query/fragment, and /devtools/browser/<id>`,
		);
	}
	return endpoint;
}

export function validateConfiguredCdpUrl(raw: string): string {
	return parseLoopbackBrowserWebSocket(raw, "STAGEHAND_CDP_URL").toString();
}

export function validateDiscoveredBrowserWebSocket(raw: string, expectedOrigin: string): string {
	const endpoint = parseLoopbackBrowserWebSocket(raw, "Loopback CDP discovery endpoint");
	const expected = new URL(validateCdpDiscoveryOrigin(expectedOrigin));
	if (
		endpoint.hostname.toLowerCase() !== expected.hostname.toLowerCase() ||
		endpoint.port !== expected.port
	) {
		throw new Error("Loopback CDP discovery returned an endpoint outside the configured loopback host/port");
	}
	return endpoint.toString();
}

async function boundedResponseText(response: Response): Promise<string> {
	const declaredLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(declaredLength) && declaredLength > MAX_DISCOVERY_RESPONSE_BYTES) {
		throw new Error("Loopback CDP discovery response exceeded the 64KB limit");
	}
	if (!response.body) throw new Error("Loopback CDP discovery returned an empty response");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0;
	let text = "";
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > MAX_DISCOVERY_RESPONSE_BYTES) {
				throw new Error("Loopback CDP discovery response exceeded the 64KB limit");
			}
			text += decoder.decode(value, { stream: true });
		}
		text += decoder.decode();
		return text;
	} finally {
		if (bytes > MAX_DISCOVERY_RESPONSE_BYTES) await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
}

/** Resolve a validated loopback DevTools HTTP origin. */
export async function discoverLoopbackCdpUrl(
	rawOrigin: string,
	callerSignal?: AbortSignal,
	timeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS,
): Promise<string> {
	const origin = validateCdpDiscoveryOrigin(rawOrigin);
	const controller = new AbortController();
	const onCallerAbort = () => controller.abort(callerSignal?.reason);
	if (callerSignal?.aborted) onCallerAbort();
	else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
	const timer = setTimeout(() => controller.abort(new Error("Loopback CDP discovery timed out")), timeoutMs);
	try {
		const response = await fetch(new URL(DISCOVERY_PATH, origin), {
			method: "GET",
			headers: { accept: "application/json" },
			redirect: "error",
			signal: controller.signal,
		});
		if (!response.ok) throw new Error("Loopback CDP discovery returned a non-success status");
		const text = await boundedResponseText(response);
		let payload: unknown;
		try {
			payload = JSON.parse(text);
		} catch {
			throw new Error("Loopback CDP discovery returned invalid JSON");
		}
		const endpoint = payload && typeof payload === "object"
			? (payload as { webSocketDebuggerUrl?: unknown }).webSocketDebuggerUrl
			: undefined;
		if (typeof endpoint !== "string") {
			throw new Error("Loopback CDP discovery did not return webSocketDebuggerUrl");
		}
		return validateDiscoveredBrowserWebSocket(endpoint, origin);
	} catch (error) {
		if (callerSignal?.aborted) {
			throw callerSignal.reason instanceof Error ? callerSignal.reason : new Error("Loopback CDP discovery cancelled");
		}
		if (controller.signal.aborted) throw new Error("Loopback CDP discovery timed out");
		throw error;
	} finally {
		clearTimeout(timer);
		callerSignal?.removeEventListener("abort", onCallerAbort);
	}
}
