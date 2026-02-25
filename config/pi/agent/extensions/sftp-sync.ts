/**
 * SFTP Sync Extension
 *
 * Automatically uploads files to a remote server after write/edit/bash tool calls.
 * Reads connection config from .vscode/sftp.json in the project directory.
 * Supports SFTP (key or password auth) and FTP (password auth via curl).
 *
 * Critical for feedback loops: files are uploaded immediately after each
 * write/edit so that subsequent browser automation tools see the latest changes.
 * Bash commands are also tracked — a timestamp marker is created before execution
 * and `find -newer` detects any files modified during the command.
 *
 * Commands:
 *   /sftp-push <path>   — Manually upload a file
 *   /sftp-status        — Show current connection config
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { join, relative, resolve, posix } from "node:path";

interface SftpConfig {
	name?: string;
	protocol: "sftp" | "ftp";
	host: string;
	port: number;
	username: string;
	password?: string;
	privateKeyPath?: string;
	remotePath: string;
	uploadOnSave?: boolean;
	downloadOnOpen?: boolean;
	ignore?: string[];
}

/** POSIX-safe single-quote escaping for shell arguments */
function sq(s: string): string {
	return "'" + s.replace(/'/g, "'\\''") + "'";
}

function loadConfig(cwd: string): SftpConfig | null {
	const configPath = join(cwd, ".vscode", "sftp.json");
	if (!existsSync(configPath)) return null;
	try {
		const raw = JSON.parse(readFileSync(configPath, "utf-8"));
		// Handle array configs (multi-root) — use first entry
		const obj = Array.isArray(raw) ? raw[0] : raw;
		if (!obj?.host || !obj?.protocol || !obj?.username || !obj?.remotePath) return null;
		return obj as SftpConfig;
	} catch {
		return null;
	}
}

function shouldIgnore(cwd: string, filePath: string, ignore?: string[]): boolean {
	if (!ignore || ignore.length === 0) return false;
	const rel = relative(cwd, resolve(cwd, filePath));
	for (const pattern of ignore) {
		// Glob extension match: "*.zip"
		if (pattern.startsWith("*.")) {
			if (rel.endsWith(pattern.slice(1))) return true;
			continue;
		}
		// Directory/prefix match: ".vscode", "vendor", ".git"
		if (rel === pattern || rel.startsWith(pattern + "/") || ("/" + rel).includes("/" + pattern + "/")) {
			return true;
		}
	}
	return false;
}

function getRemotePath(config: SftpConfig, relPath: string): string {
	const base = config.remotePath.replace(/\/+$/, "");
	return base + "/" + relPath;
}

function buildSshPrefix(config: SftpConfig): string {
	if (config.password && !config.privateKeyPath) {
		return `sshpass -p ${sq(config.password)} `;
	}
	return "";
}

function buildSshFlags(config: SftpConfig): string {
	let flags = "";
	if (config.privateKeyPath) flags += ` -i ${sq(config.privateKeyPath)}`;
	flags += ` -o StrictHostKeyChecking=no -o ConnectTimeout=10`;
	return flags;
}

function buildMkdirCmd(config: SftpConfig, remoteDir: string): string {
	const prefix = buildSshPrefix(config);
	const flags = buildSshFlags(config);
	const target = `${config.username}@${config.host}`;
	return `${prefix}ssh${flags} -p ${config.port} ${sq(target)} ${sq(`mkdir -p ${remoteDir}`)}`;
}

function buildScpCmd(config: SftpConfig, localFile: string, remoteFile: string): string {
	const prefix = buildSshPrefix(config);
	const flags = buildSshFlags(config);
	const target = `${config.username}@${config.host}:${remoteFile}`;
	return `${prefix}scp${flags} -P ${config.port} ${sq(localFile)} ${sq(target)}`;
}

function buildFtpCmd(config: SftpConfig, localFile: string, remoteFile: string): string {
	const url = `ftp://${config.host}:${config.port}${remoteFile}`;
	const userPass = `${config.username}:${config.password || ""}`;
	return `curl -T ${sq(localFile)} ${sq(url)} --user ${sq(userPass)} --ftp-create-dirs -s --connect-timeout 10 --max-time 60`;
}

function buildFindExcludes(ignore?: string[]): string {
	const parts: string[] = ["-not -path '*/.git/*'"];
	for (const pattern of ignore || []) {
		if (pattern.startsWith("*.")) {
			parts.push(`-not -name ${sq(pattern)}`);
		} else {
			parts.push(`-not -path ${sq("*/" + pattern + "/*")}`);
		}
	}
	return parts.join(" ");
}

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();
	let config: SftpConfig | null = null;
	let uploadCount = 0;
	const bashMarkers = new Map<string, string>();

	async function uploadFile(localPath: string): Promise<{ ok: boolean; error?: string }> {
		if (!config) return { ok: false, error: "No SFTP config loaded" };

		// Resolve and normalize the path (strip leading @ that some models add)
		const cleaned = localPath.replace(/^@/, "");
		const absPath = resolve(cwd, cleaned);
		const rel = relative(cwd, absPath);

		// Safety: don't upload files outside the project
		if (rel.startsWith("..") || resolve(cwd, rel) !== absPath) {
			return { ok: false, error: "File is outside project directory" };
		}

		if (shouldIgnore(cwd, rel, config.ignore)) {
			return { ok: false, error: "File matches ignore pattern" };
		}

		const remoteFull = getRemotePath(config, rel);

		try {
			if (config.protocol === "sftp") {
				// Create remote directory first
				const remoteDir = posix.dirname(remoteFull);
				const mkdirResult = await pi.exec("bash", ["-c", buildMkdirCmd(config, remoteDir)], {
					timeout: 15000,
				});
				if (mkdirResult.code !== 0) {
					return { ok: false, error: `mkdir failed: ${mkdirResult.stderr.trim().slice(0, 200)}` };
				}

				// Upload file via scp
				const scpResult = await pi.exec("bash", ["-c", buildScpCmd(config, absPath, remoteFull)], {
					timeout: 60000,
				});
				if (scpResult.code !== 0) {
					return { ok: false, error: `scp failed: ${scpResult.stderr.trim().slice(0, 200)}` };
				}

				return { ok: true };
			} else if (config.protocol === "ftp") {
				const curlResult = await pi.exec("bash", ["-c", buildFtpCmd(config, absPath, remoteFull)], {
					timeout: 60000,
				});
				if (curlResult.code !== 0) {
					return { ok: false, error: `curl ftp failed: ${curlResult.stderr.trim().slice(0, 200)}` };
				}

				return { ok: true };
			}

			return { ok: false, error: `Unsupported protocol: ${config.protocol}` };
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			return { ok: false, error: msg.slice(0, 200) };
		}
	}

	// --- Events ---

	pi.on("session_start", async (_event, ctx) => {
		config = loadConfig(cwd);
		if (config) {
			ctx.ui.setStatus("sftp", ctx.ui.theme.fg("accent", `⬆ SFTP`));
			uploadCount = 0;
		}
	});

	// Before bash executes, drop a timestamp marker so we can detect modified files after.
	pi.on("tool_call", async (event) => {
		if (!config || event.toolName !== "bash") return;
		const marker = `/tmp/.sftp_marker_${process.pid}_${Date.now()}`;
		await pi.exec("bash", ["-c", `touch ${sq(marker)}`], { timeout: 5000 });
		bashMarkers.set(event.toolCallId, marker);
		return undefined; // don't block
	});

	// Upload immediately after successful write/edit so subsequent tools
	// (especially browser_use) see the latest files on the remote server.
	// For bash commands, find any files modified since the pre-execution marker.
	pi.on("tool_result", async (event, ctx) => {
		if (!config) return;

		// --- write / edit: upload the specific file ---
		if ((event.toolName === "write" || event.toolName === "edit") && !event.isError) {
			const input = event.input as Record<string, unknown>;
			const filePath = input?.path as string | undefined;
			if (!filePath) return;

			const cleaned = filePath.replace(/^@/, "");
			const rel = relative(cwd, resolve(cwd, cleaned));
			if (shouldIgnore(cwd, rel, config.ignore)) return;

			const result = await uploadFile(cleaned);

			if (result.ok) {
				uploadCount++;
				ctx.ui.notify(`⬆ ${rel} → ${config.host}`, "info");
				return {
					content: [...event.content, { type: "text" as const, text: `[SFTP synced to ${config.host}]` }],
				};
			} else {
				ctx.ui.notify(`⬆ Upload failed: ${rel} — ${result.error}`, "error");
				return {
					content: [
						...event.content,
						{ type: "text" as const, text: `[SFTP upload FAILED: ${result.error}]` },
					],
				};
			}
		}

		// --- bash: find files modified during execution and upload them ---
		if (event.toolName === "bash") {
			const marker = bashMarkers.get(event.toolCallId);
			if (!marker) return;
			bashMarkers.delete(event.toolCallId);

			try {
				const excludes = buildFindExcludes(config.ignore);
				const findCmd = `find ${sq(cwd)} -newer ${sq(marker)} -type f ${excludes} 2>/dev/null`;
				const findResult = await pi.exec("bash", ["-c", findCmd], { timeout: 10000 });
				await pi.exec("rm", ["-f", marker]).catch(() => {});

				const stdout = findResult.stdout.trim();
				if (!stdout) return;

				const files = stdout.split("\n").filter(Boolean);
				const uploaded: string[] = [];
				const failed: string[] = [];

				for (const absFile of files) {
					const rel = relative(cwd, absFile);
					if (shouldIgnore(cwd, rel, config.ignore)) continue;

					const result = await uploadFile(rel);
					if (result.ok) {
						uploadCount++;
						uploaded.push(rel);
					} else {
						failed.push(`${rel}: ${result.error}`);
					}
				}

				if (uploaded.length > 0 || failed.length > 0) {
					const parts: string[] = [];
					if (uploaded.length > 0) {
						ctx.ui.notify(`⬆ ${uploaded.length} file(s) → ${config.host}`, "info");
						parts.push(`[SFTP synced ${uploaded.length} file(s) to ${config.host}]`);
					}
					if (failed.length > 0) {
						ctx.ui.notify(`⬆ ${failed.length} upload(s) failed`, "error");
						parts.push(`[SFTP upload FAILED for ${failed.length} file(s)]`);
					}
					return {
						content: [...event.content, { type: "text" as const, text: parts.join(" ") }],
					};
				}
			} catch {
				await pi.exec("rm", ["-f", marker]).catch(() => {});
			}
		}
	});

	// Clean up leftover marker files on exit.
	pi.on("session_shutdown", async () => {
		for (const marker of bashMarkers.values()) {
			await pi.exec("rm", ["-f", marker]).catch(() => {});
		}
		bashMarkers.clear();
	});

	// --- Commands ---

	pi.registerCommand("sftp-push", {
		description: "Upload a file to the remote server via SFTP/FTP",
		handler: async (args, ctx) => {
			if (!config) {
				ctx.ui.notify("No .vscode/sftp.json found in project", "error");
				return;
			}
			const target = args?.trim();
			if (!target) {
				ctx.ui.notify("Usage: /sftp-push <path>", "warning");
				return;
			}
			ctx.ui.notify(`Uploading ${target}...`, "info");
			const result = await uploadFile(target);
			if (result.ok) {
				const rel = relative(cwd, resolve(cwd, target.replace(/^@/, "")));
				ctx.ui.notify(`⬆ ${rel} → ${config.host}`, "info");
			} else {
				ctx.ui.notify(`Upload failed: ${result.error}`, "error");
			}
		},
	});

	pi.registerCommand("sftp-status", {
		description: "Show SFTP/FTP sync status and config",
		handler: async (_args, ctx) => {
			if (!config) {
				ctx.ui.notify("No .vscode/sftp.json found in project", "warning");
				return;
			}
			const lines = [
				`Name:     ${config.name || "(unnamed)"}`,
				`Protocol: ${config.protocol.toUpperCase()}`,
				`Host:     ${config.host}:${config.port}`,
				`User:     ${config.username}`,
				`Remote:   ${config.remotePath}`,
				`Auth:     ${config.privateKeyPath ? "SSH key" : config.password ? "Password" : "None"}`,
				`Ignore:   ${config.ignore?.join(", ") || "(none)"}`,
				`Uploads:  ${uploadCount} file(s) this session`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
