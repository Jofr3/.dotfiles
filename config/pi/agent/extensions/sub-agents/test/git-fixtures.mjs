import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { withTempDirectory } from "./fixtures.mjs";

function execFileAsync(file, args, options) {
	return new Promise((resolvePromise, rejectPromise) => {
		execFile(file, args, options, (error, stdout, stderr) => {
			if (error) rejectPromise(error);
			else resolvePromise({ stdout, stderr });
		});
	});
}
const SAFE_PUBLIC_GIT_ARGUMENTS = Object.freeze([
	["rev-parse", "--abbrev-ref", "HEAD"],
	["status", "--porcelain"],
]);
const UNSAFE_GIT_OPTION = /^(?:--output(?:=|$)|--exec(?:=|$)|--ext-diff$|--textconv$|--upload-pack(?:=|$)|--receive-pack(?:=|$)|--strategy(?:=|$)|--strategy-option(?:=|$)|-s$)/u;
const REMOTE_ARGUMENT = /(?:[a-z][a-z0-9+.-]*:\/\/|[^/\s]+@[^:\s]+:)/iu;

function containedPath(root, path) {
	if (typeof path !== "string" || !path || path.includes("\0") || isAbsolute(path)) {
		throw new Error("Git fixture paths must be nonempty relative paths");
	}
	const target = resolve(root, path);
	const targetRelative = relative(root, target);
	if (!targetRelative || targetRelative.startsWith("..") || isAbsolute(targetRelative)) {
		throw new Error("Git fixture path escapes its temporary repository");
	}
	return target;
}

function gitEnvironment(source, home) {
	const environment = {};
	for (const name of ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC", "LANG", "LC_ALL", "LC_CTYPE"]) {
		const value = source[name];
		if (typeof value === "string" && !value.includes("\0")) environment[name] = value;
	}
	if (!environment.PATH) throw new Error("PATH is required for the local git fixture");
	return {
		...environment,
		HOME: home,
		USERPROFILE: home,
		XDG_CONFIG_HOME: join(home, ".config"),
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
		GIT_TERMINAL_PROMPT: "0",
		GIT_AUTHOR_NAME: "Pi Offline Fixture",
		GIT_AUTHOR_EMAIL: "pi-offline@example.invalid",
		GIT_COMMITTER_NAME: "Pi Offline Fixture",
		GIT_COMMITTER_EMAIL: "pi-offline@example.invalid",
		PI_SUB_AGENTS_LOCAL_GIT_FIXTURE: "1",
	};
}

async function executeGit(repository, environment, hooks, args) {
	const result = await execFileAsync("git", [
		"-c", `core.hooksPath=${hooks}`,
		"-c", "commit.gpgsign=false",
		"-c", "tag.gpgsign=false",
		"-c", "protocol.file.allow=never",
		...args,
	], {
		cwd: repository,
		env: environment,
		encoding: "utf8",
		timeout: 10_000,
		maxBuffer: 1024 * 1024,
		windowsHide: true,
	});
	return { stdout: result.stdout, stderr: result.stderr };
}

function validatePublicGitArguments(args) {
	if (!Array.isArray(args) || args.length === 0) {
		throw new Error("Local git fixture rejected a non-allowlisted subcommand");
	}
	for (const value of args) {
		if (
			typeof value !== "string" ||
			value.includes("\0") ||
			REMOTE_ARGUMENT.test(value) ||
			UNSAFE_GIT_OPTION.test(value)
		) {
			throw new Error("Local git fixture rejected a remote-capable or side-effecting argument");
		}
	}
	if (!SAFE_PUBLIC_GIT_ARGUMENTS.some((expected) =>
		expected.length === args.length && expected.every((value, index) => value === args[index])
	)) {
		throw new Error("Local git fixture rejected a non-allowlisted subcommand");
	}
}

export async function isLocalGitAvailable(source = process.env) {
	try {
		const home = tmpdir();
		const environment = gitEnvironment(source, home);
		await execFileAsync("git", ["--version"], {
			cwd: home,
			env: environment,
			encoding: "utf8",
			timeout: 5_000,
			maxBuffer: 64 * 1024,
			windowsHide: true,
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Create one disposable local repository with no remotes, hooks, signing, or
 * inherited Git configuration. Worktree creation is deliberately not exposed;
 * Phase 8 must add separately owned worktree helpers and cleanup proofs.
 */
export async function withTempGitRepository(options, operation) {
	if (!options || typeof options !== "object" || typeof operation !== "function") {
		throw new Error("Temporary git fixture options and operation are required");
	}
	if (!await isLocalGitAvailable()) throw new Error("Local git executable is unavailable");
	return withTempDirectory(options.prefix ?? "pi-sub-agents-git", async (temporary) => {
		const repository = join(temporary, "repository");
		const home = join(temporary, "home");
		const hooks = join(temporary, "empty-hooks");
		await Promise.all([
			mkdir(repository, { recursive: true }),
			mkdir(home, { recursive: true }),
			mkdir(hooks, { recursive: true }),
		]);
		const environment = gitEnvironment(process.env, home);
		await executeGit(repository, environment, hooks, ["init", "--quiet"]);
		await executeGit(repository, environment, hooks, ["symbolic-ref", "HEAD", "refs/heads/main"]);
		for (const [path, content] of Object.entries(options.files ?? { "README.md": "offline fixture\n" })) {
			if (typeof content !== "string" && !Buffer.isBuffer(content)) {
				throw new Error(`Git fixture file content must be string or Buffer: ${path}`);
			}
			const target = containedPath(repository, path);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, content);
		}
		if (options.initialCommit !== false) {
			await executeGit(repository, environment, hooks, ["add", "--all"]);
			await executeGit(repository, environment, hooks, ["commit", "--quiet", "--no-gpg-sign", "-m", "offline fixture"]);
		}
		const runGit = async (args) => {
			validatePublicGitArguments(args);
			return executeGit(repository, environment, hooks, args);
		};
		const listRemotes = async () => (await executeGit(repository, environment, hooks, ["remote"])).stdout
			.split(/\r?\n/u)
			.filter(Boolean);
		return operation({ temporary, repository, runGit, listRemotes });
	});
}
