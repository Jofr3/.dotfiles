import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { userInfo } from "node:os";
import { Buffer } from "node:buffer";
import type { DatabaseProfile } from "./profile.ts";
import { MAX_STDERR_BYTES, MAX_STDOUT_BYTES } from "./output.ts";

export const DATABASE_EXECUTION_TIMEOUT_MS = 30_000;
export const DATABASE_CONNECT_TIMEOUT_SECONDS = 5;
export const DATABASE_KILL_GRACE_MS = 500;
export const DATABASE_CLOSE_GRACE_MS = 1_500;

export type DatabaseRunFailureCode =
	| "aborted"
	| "client_error"
	| "client_unavailable"
	| "output_limit"
	| "timeout";

export type DatabaseRunResult =
	| Readonly<{ ok: true; stdout: Buffer; elapsedMs: number }>
	| Readonly<{ ok: false; code: DatabaseRunFailureCode; elapsedMs: number }>;

export interface DatabaseClientInvocation {
	readonly executable: string;
	readonly args: readonly string[];
	readonly environment: Readonly<Record<string, string>>;
}

export interface DatabaseRunner {
	run(profile: DatabaseProfile, query: string, cwd: string, signal?: AbortSignal): Promise<DatabaseRunResult>;
}

export interface DatabaseRunnerDependencies {
	readonly spawnProcess?: (
		command: string,
		args: readonly string[],
		options: SpawnOptionsWithoutStdio & { stdio: ["pipe", "pipe", "pipe"] },
	) => ChildProcessWithoutNullStreams;
	readonly resolveExecutable?: (engine: DatabaseProfile["engine"]) => string;
	readonly now?: () => number;
}

const EXECUTABLE_CANDIDATES: Readonly<Record<DatabaseProfile["engine"], readonly string[]>> = Object.freeze({
	mysql: Object.freeze(["/usr/bin/mysql", "/usr/local/bin/mysql"]),
	sqlserver: Object.freeze([
		"/opt/mssql-tools18/bin/sqlcmd",
		"/opt/mssql-tools/bin/sqlcmd",
		"/usr/bin/sqlcmd",
		"/usr/local/bin/sqlcmd",
	]),
});
const SYSTEM_USERNAME_PATTERN = /^[A-Za-z_][A-Za-z0-9._-]{0,127}$/u;

export function nixProfileExecutableCandidate(
	engine: DatabaseProfile["engine"],
	username: unknown,
): string | undefined {
	if (typeof username !== "string" || !SYSTEM_USERNAME_PATTERN.test(username)) return undefined;
	const executable = engine === "mysql" ? "mysql" : "sqlcmd";
	return `/etc/profiles/per-user/${username}/bin/${executable}`;
}

function trustedExecutableCandidates(engine: DatabaseProfile["engine"]): readonly string[] {
	const candidates = [...EXECUTABLE_CANDIDATES[engine]];
	try {
		const nixProfile = nixProfileExecutableCandidate(engine, userInfo().username);
		if (nixProfile !== undefined) candidates.push(nixProfile);
	} catch {
		// Fixed system candidates remain available when account lookup is unavailable.
	}
	return Object.freeze(candidates);
}

export function resolveTrustedExecutable(engine: DatabaseProfile["engine"]): string {
	for (const candidate of trustedExecutableCandidates(engine)) {
		try {
			if (!existsSync(candidate)) continue;
			const resolved = realpathSync.native(candidate);
			const stat = statSync(resolved);
			if (
				!isAbsolute(resolved) || !stat.isFile() ||
				(stat.mode & 0o022) !== 0 || stat.uid !== 0
			) continue;
			return resolved;
		} catch {
			// Try the next fixed absolute candidate.
		}
	}
	throw new Error("Database client executable is unavailable.");
}

export function buildDatabaseClientInvocation(
	profile: DatabaseProfile,
	executable: string,
): DatabaseClientInvocation {
	if (!isAbsolute(executable)) throw new Error("Database client executable is unavailable.");
	if (profile.engine === "mysql") {
		const args: string[] = ["--no-defaults", `--connect-timeout=${DATABASE_CONNECT_TIMEOUT_SECONDS}`];
		if (profile.host !== undefined) args.push("--host", profile.host);
		if (profile.socket !== undefined) args.push("--socket", profile.socket);
		args.push(
			"--port", String(profile.port),
			"--user", profile.user,
			`--database=${profile.database}`,
			"--batch",
		);
		return Object.freeze({
			executable,
			args: Object.freeze(args),
			environment: Object.freeze({ LC_ALL: "C", LANG: "C", MYSQL_PWD: profile.password }),
		});
	}
	const args = [
		"-S", `${profile.host},${profile.port}`,
		"-U", profile.user,
		"-d", profile.database,
		"-l", String(DATABASE_CONNECT_TIMEOUT_SECONDS),
		"-N", profile.encrypt ? "true" : "false",
		"-b", "-r", "1", "-s", "\t", "-W", "-w", "4096", "-X", "1",
	];
	if (profile.trustServerCertificate === true) args.push("-C");
	return Object.freeze({
		executable,
		args: Object.freeze(args),
		environment: Object.freeze({ LC_ALL: "C", LANG: "C", SQLCMDPASSWORD: profile.password }),
	});
}

function signalAborted(signal: AbortSignal | undefined): boolean {
	if (signal === undefined) return false;
	try { return signal.aborted === true; } catch { return true; }
}

export class SpawnDatabaseRunner implements DatabaseRunner {
	readonly #spawn: NonNullable<DatabaseRunnerDependencies["spawnProcess"]>;
	readonly #resolveExecutable: NonNullable<DatabaseRunnerDependencies["resolveExecutable"]>;
	readonly #now: () => number;

	constructor(dependencies: DatabaseRunnerDependencies = {}) {
		this.#spawn = dependencies.spawnProcess ?? ((command, args, options) => spawn(command, args, options));
		this.#resolveExecutable = dependencies.resolveExecutable ?? resolveTrustedExecutable;
		this.#now = dependencies.now ?? Date.now;
	}

	async run(profile: DatabaseProfile, query: string, cwd: string, signal?: AbortSignal): Promise<DatabaseRunResult> {
		const startedAt = this.#now();
		if (signalAborted(signal)) return Object.freeze({ ok: false, code: "aborted", elapsedMs: 0 });
		let invocation: DatabaseClientInvocation;
		try { invocation = buildDatabaseClientInvocation(profile, this.#resolveExecutable(profile.engine)); }
		catch { return Object.freeze({ ok: false, code: "client_unavailable", elapsedMs: this.#now() - startedAt }); }
		return new Promise<DatabaseRunResult>((resolve) => {
			let child: ChildProcessWithoutNullStreams;
			try {
				child = this.#spawn(invocation.executable, invocation.args, {
					cwd,
					env: { ...invocation.environment },
					shell: false,
					stdio: ["pipe", "pipe", "pipe"],
					detached: process.platform !== "win32",
					windowsHide: true,
				});
			} catch {
				resolve(Object.freeze({ ok: false, code: "client_unavailable", elapsedMs: this.#now() - startedAt }));
				return;
			}
			let settled = false;
			let failure: DatabaseRunFailureCode | undefined;
			let stdoutBytes = 0;
			let stderrBytes = 0;
			const chunks: Buffer[] = [];
			let killTimer: ReturnType<typeof setTimeout> | undefined;
			let closeTimer: ReturnType<typeof setTimeout> | undefined;
			const elapsed = (): number => Math.max(0, this.#now() - startedAt);
			const cleanup = (): void => {
				clearTimeout(timeoutTimer);
				if (killTimer !== undefined) clearTimeout(killTimer);
				if (closeTimer !== undefined) clearTimeout(closeTimer);
				if (signal !== undefined) {
					try { signal.removeEventListener("abort", onAbort); } catch { /* Fixed result remains authoritative. */ }
				}
			};
			const finish = (result: DatabaseRunResult): void => {
				if (settled) return;
				settled = true;
				cleanup();
				resolve(result);
			};
			const sendSignal = (name: NodeJS.Signals): void => {
				try {
					if (process.platform !== "win32" && typeof child.pid === "number" && child.pid > 0) process.kill(-child.pid, name);
					else child.kill(name);
				} catch { try { child.kill(name); } catch { /* Close grace will finish. */ } }
			};
			const stop = (code: DatabaseRunFailureCode): void => {
				if (failure === undefined) failure = code;
				try { child.stdin.end(); } catch { /* Continue termination. */ }
				sendSignal("SIGTERM");
				if (killTimer === undefined) killTimer = setTimeout(() => sendSignal("SIGKILL"), DATABASE_KILL_GRACE_MS);
				if (closeTimer === undefined) closeTimer = setTimeout(() => {
					finish(Object.freeze({ ok: false, code: failure ?? code, elapsedMs: elapsed() }));
				}, DATABASE_CLOSE_GRACE_MS);
			};
			const onAbort = (): void => stop("aborted");
			const timeoutTimer = setTimeout(() => stop("timeout"), DATABASE_EXECUTION_TIMEOUT_MS);
			if (signal !== undefined) {
				try { signal.addEventListener("abort", onAbort, { once: true }); } catch { stop("aborted"); }
			}
			child.stdout.on("data", (chunk: Buffer | string) => {
				if (settled) return;
				const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				stdoutBytes += bytes.byteLength;
				if (stdoutBytes > MAX_STDOUT_BYTES) { stop("output_limit"); return; }
				chunks.push(Buffer.from(bytes));
			});
			child.stderr.on("data", (chunk: Buffer | string) => {
				if (settled) return;
				stderrBytes += Buffer.byteLength(chunk);
				if (stderrBytes > MAX_STDERR_BYTES) stop("output_limit");
			});
			child.stdin.on("error", () => { stop("client_error"); });
			child.on("error", () => { stop("client_error"); });
			child.on("close", (code) => {
				if (settled) return;
				if (failure !== undefined || code !== 0) {
					finish(Object.freeze({ ok: false, code: failure ?? "client_error", elapsedMs: elapsed() }));
					return;
				}
				finish(Object.freeze({ ok: true, stdout: Buffer.concat(chunks, stdoutBytes), elapsedMs: elapsed() }));
			});
			try { child.stdin.end(query.endsWith("\n") ? query : `${query}\n`, "utf8"); }
			catch { stop("client_error"); }
		});
	}
}
