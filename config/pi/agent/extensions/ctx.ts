/**
 * ctx — lightweight local context-preservation extension for Pi.
 *
 * This intentionally mirrors the useful core of context-mode without pulling in
 * an external package:
 * - ctx_execute / ctx_execute_file keep raw data out of the conversation
 * - ctx_index / ctx_search provide a local SQLite FTS5 knowledge base
 * - ctx_fetch_and_index fetches docs/pages and indexes them server-side
 * - ctx_batch_execute gathers multiple command outputs and indexes them
 * - lightweight session/event memory is injected before each agent turn
 *
 * Storage defaults to ~/.local/share/pi-ctx, not ~/.pi, so the DB does not end
 * up inside the dotfiles repo symlinked as ~/.pi. Override with PI_CTX_DIR.
 *
 * Security note: this is context isolation, not OS sandboxing. The subprocesses
 * run as your user. Dangerous shell patterns are blocked/confirmed here so these
 * tools do not bypass the existing safeguard extension's bash checks.
 */

type ExtensionAPI = any;

const OPTIONAL = Symbol("optional");

type JsonSchema = Record<string, unknown> & { [OPTIONAL]?: boolean };

const Type = {
	String(opts: Record<string, unknown> = {}): JsonSchema { return { type: "string", ...opts }; },
	Number(opts: Record<string, unknown> = {}): JsonSchema { return { type: "number", ...opts }; },
	Boolean(opts: Record<string, unknown> = {}): JsonSchema { return { type: "boolean", ...opts }; },
	Literal(value: string | number | boolean, opts: Record<string, unknown> = {}): JsonSchema {
		return { const: value, type: typeof value, ...opts };
	},
	Union(items: JsonSchema[], opts: Record<string, unknown> = {}): JsonSchema { return { anyOf: items, ...opts }; },
	Array(items: JsonSchema, opts: Record<string, unknown> = {}): JsonSchema { return { type: "array", items, ...opts }; },
	Optional(schema: JsonSchema): JsonSchema { return { ...schema, [OPTIONAL]: true }; },
	Object(properties: Record<string, JsonSchema>, opts: Record<string, unknown> = {}): JsonSchema {
		const required = Object.entries(properties).filter(([, schema]) => !schema[OPTIONAL]).map(([key]) => key);
		const cleaned = Object.fromEntries(Object.entries(properties).map(([key, schema]) => {
			const { [OPTIONAL]: _optional, ...rest } = schema;
			return [key, rest];
		}));
		return { type: "object", properties: cleaned, required, additionalProperties: false, ...opts };
	},
};
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = resolve(process.env.PI_CTX_DIR || join(homedir(), ".local", "share", "pi-ctx"));
const DB_PATH = join(DATA_DIR, "ctx.db");
const INLINE_LIMIT_BYTES = 24 * 1024;
const HARD_CAPTURE_LIMIT_BYTES = 20 * 1024 * 1024;
const MAX_INDEX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CHUNK_CHARS = 6_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_SEARCH_LIMIT = 3;

const TEXT_EXTENSIONS = new Set([
	".md", ".mdx", ".txt", ".json", ".jsonc", ".yaml", ".yml", ".toml",
	".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".lua", ".nix", ".py",
	".rs", ".go", ".sh", ".fish", ".php", ".css", ".html", ".xml", ".sql",
]);
const SKIP_DIRS = new Set([
	".git", "node_modules", "dist", "build", ".next", ".direnv", ".venv", "vendor",
	"coverage", "target", "result", ".cache",
]);

type Language = "javascript" | "python" | "shell";

interface RunResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	timedOut: boolean;
	capped: boolean;
}

interface IndexChunk {
	title: string;
	content: string;
}

interface ToolCtx {
	cwd?: string;
	hasUI?: boolean;
	ui?: {
		confirm?: (title: string, message: string) => Promise<boolean>;
		notify?: (message: string, level?: string) => void;
	};
	sessionManager?: { getSessionFile?: () => string | undefined };
	signal?: AbortSignal;
}

let db: DatabaseSync | null = null;
let sessionId = `pi-ctx-${process.pid}`;
let currentProject = process.cwd();
let turns = 0;

const runtimeStats = {
	toolCalls: 0,
	bytesProcessed: 0,
	bytesIndexed: 0,
	bytesReturned: 0,
	startedAt: Date.now(),
};

function ensureDb(): DatabaseSync {
	if (db) return db;
	mkdirSync(DATA_DIR, { recursive: true });
	db = new DatabaseSync(DB_PATH);
	db.exec(`
		PRAGMA journal_mode = WAL;
		PRAGMA synchronous = NORMAL;
		CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
			project UNINDEXED,
			source,
			title,
			content,
			path UNINDEXED,
			created_at UNINDEXED,
			tokenize = 'porter unicode61'
		);
		CREATE VIRTUAL TABLE IF NOT EXISTS events USING fts5(
			project UNINDEXED,
			session_id UNINDEXED,
			category,
			data,
			created_at UNINDEXED,
			tokenize = 'porter unicode61'
		);
	`);
	return db;
}

function closeDb(): void {
	try { db?.close(); } catch { /* best effort */ }
	db = null;
}

function byteLength(text: string): number {
	return Buffer.byteLength(text, "utf8");
}

function hash(text: string, len = 16): string {
	return createHash("sha256").update(text).digest("hex").slice(0, len);
}

function cwdFrom(ctx?: ToolCtx): string {
	return resolve(ctx?.cwd || process.env.PI_WORKSPACE_DIR || process.env.PI_PROJECT_DIR || process.env.PWD || process.cwd());
}

function resolvePath(path: string, cwd: string): string {
	return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

function sessionFromCtx(ctx?: ToolCtx): string {
	try {
		const file = ctx?.sessionManager?.getSessionFile?.() || process.env.PI_SESSION_FILE;
		if (file) return hash(file);
	} catch { /* ignore */ }
	return sessionId;
}

function nowIso(): string {
	return new Date().toISOString();
}

function escapeLike(value: string): string {
	return `%${value.replace(/[%_]/g, "")}%`;
}

function queryToFts(query: string): string {
	const terms = Array.from(query.matchAll(/[\p{L}\p{N}_]{2,}/gu))
		.map((m) => m[0].toLowerCase())
		.filter((term, idx, arr) => arr.indexOf(term) === idx)
		.slice(0, 12);
	if (terms.length === 0) return '""';
	return terms.map((term) => `"${term.replace(/"/g, "")}"`).join(" OR ");
}

function stripAnsi(text: string): string {
	return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function truncateForEvent(text: string, max = 1_200): string {
	const clean = stripAnsi(text).trim();
	return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function insertEvent(category: string, data: string, project = currentProject): void {
	try {
		ensureDb().prepare(
			"INSERT INTO events(project, session_id, category, data, created_at) VALUES (?, ?, ?, ?, ?)",
		).run(project, sessionId, category, truncateForEvent(data, 2_000), nowIso());
	} catch { /* memory must never break the session */ }
}

function chunkText(content: string, fallbackTitle: string): IndexChunk[] {
	const normalized = content.replace(/\r\n/g, "\n");
	const chunks: IndexChunk[] = [];
	let title = fallbackTitle;
	let buf: string[] = [];

	function flush(): void {
		const body = buf.join("\n").trim();
		buf = [];
		if (!body) return;
		if (body.length <= MAX_CHUNK_CHARS) {
			chunks.push({ title, content: body });
			return;
		}
		const paragraphs = body.split(/\n{2,}/);
		let part: string[] = [];
		let partLen = 0;
		let partNo = 1;
		for (const para of paragraphs) {
			if (partLen + para.length > MAX_CHUNK_CHARS && part.length > 0) {
				chunks.push({ title: `${title} / part ${partNo++}`, content: part.join("\n\n") });
				part = [];
				partLen = 0;
			}
			part.push(para);
			partLen += para.length + 2;
		}
		if (part.length > 0) chunks.push({ title: partNo === 1 ? title : `${title} / part ${partNo}`, content: part.join("\n\n") });
	}

	for (const line of normalized.split("\n")) {
		const heading = line.match(/^(#{1,6})\s+(.+)$/);
		if (heading && buf.length > 0) {
			flush();
			title = heading[2].trim().slice(0, 180) || fallbackTitle;
			buf.push(line);
		} else {
			buf.push(line);
		}
	}
	flush();
	return chunks.length > 0 ? chunks : [{ title: fallbackTitle, content: normalized.slice(0, MAX_CHUNK_CHARS) }];
}

function indexChunks(opts: {
	project: string;
	source: string;
	path?: string;
	chunks: IndexChunk[];
	replace?: boolean;
}): { chunks: number; bytes: number } {
	const database = ensureDb();
	const replace = opts.replace ?? true;
	if (replace) {
		database.prepare("DELETE FROM docs WHERE project = ? AND source = ?").run(opts.project, opts.source);
	}
	const stmt = database.prepare(
		"INSERT INTO docs(project, source, title, content, path, created_at) VALUES (?, ?, ?, ?, ?, ?)",
	);
	let bytes = 0;
	for (const chunk of opts.chunks) {
		bytes += byteLength(chunk.content);
		stmt.run(opts.project, opts.source, chunk.title, chunk.content, opts.path || "", nowIso());
	}
	runtimeStats.bytesIndexed += bytes;
	return { chunks: opts.chunks.length, bytes };
}

function indexContent(project: string, source: string, content: string, path?: string, replace = true): { chunks: number; bytes: number } {
	const chunks = chunkText(content, basename(source) || source || "content");
	return indexChunks({ project, source, path, chunks, replace });
}

function listFiles(root: string, maxFiles: number, maxDepth: number): string[] {
	const out: string[] = [];
	function walk(dir: string, depth: number): void {
		if (out.length >= maxFiles || depth > maxDepth) return;
		let entries: string[];
		try { entries = readdirSync(dir); } catch { return; }
		for (const name of entries) {
			if (out.length >= maxFiles) return;
			const abs = join(dir, name);
			let st;
			try {
				const lst = lstatSync(abs);
				if (lst.isSymbolicLink()) continue;
				st = statSync(abs);
			} catch { continue; }
			if (st.isDirectory()) {
				if (!SKIP_DIRS.has(name)) walk(abs, depth + 1);
			} else if (st.isFile() && TEXT_EXTENSIONS.has(extname(name).toLowerCase()) && st.size <= MAX_INDEX_FILE_BYTES) {
				out.push(abs);
			}
		}
	}
	walk(root, 0);
	return out;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function confirmDanger(tool: string, value: string, ctx?: ToolCtx): Promise<void> {
	const label = dangerousReason(value);
	if (!label) return;
	if (label.block) throw new Error(`Blocked dangerous ${tool}: ${label.reason}`);
	if (ctx?.hasUI && ctx.ui?.confirm) {
		const ok = await ctx.ui.confirm(`Confirm ${tool}`, `${label.reason}\n\n${value.slice(0, 500)}`);
		if (!ok) throw new Error(`Cancelled dangerous ${tool}: ${label.reason}`);
		return;
	}
	throw new Error(`Refusing dangerous ${tool} without UI confirmation: ${label.reason}`);
}

function dangerousReason(value: string): { reason: string; block?: boolean } | null {
	if (/\bgit\s+push\b[\s\S]*\s--force(?:\s|$)/i.test(value)) return { reason: "force push", block: true };
	if (/\brm\s+(?:-[a-z]*r[a-z]*f|-rf|-fr|--recursive[\s\S]*--force|--force[\s\S]*--recursive)\b/i.test(value)) return { reason: "recursive forced delete" };
	if (/(^|\s)>+\s*\S*\.env(?:\s|$)/i.test(value)) return { reason: "write/append to .env file" };
	return null;
}

function safeEnv(tmp: string): NodeJS.ProcessEnv {
	const deny = new Set([
		"NODE_OPTIONS", "BASH_ENV", "ENV", "PROMPT_COMMAND", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES",
		"PYTHONSTARTUP", "PYTHONINSPECT", "RUBYOPT", "PERL5OPT", "GIT_ASKPASS", "SSH_ASKPASS",
	]);
	const env: NodeJS.ProcessEnv = {};
	for (const [key, val] of Object.entries(process.env)) {
		if (val !== undefined && !deny.has(key) && !key.startsWith("BASH_FUNC_")) env[key] = val;
	}
	env.TMPDIR = tmp;
	env.NO_COLOR = "1";
	env.PYTHONUNBUFFERED = "1";
	return env;
}

function killTree(child: ChildProcess): void {
	try {
		if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
		else child.kill("SIGKILL");
	} catch { /* already dead */ }
}

async function runProcess(cmd: string, args: string[], opts: {
	cwd: string;
	timeout?: number;
	signal?: AbortSignal;
	tmp: string;
}): Promise<RunResult> {
	return new Promise((resolveRun) => {
		const child = spawn(cmd, args, {
			cwd: opts.cwd,
			env: safeEnv(opts.tmp),
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32",
		});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let total = 0;
		let capped = false;
		let timedOut = false;
		let done = false;

		const timeout = opts.timeout === 0 ? undefined : setTimeout(() => {
			timedOut = true;
			killTree(child);
		}, opts.timeout ?? DEFAULT_TIMEOUT_MS);
		const abort = () => killTree(child);
		opts.signal?.addEventListener("abort", abort, { once: true });

		function push(target: Buffer[], chunk: Buffer): void {
			total += chunk.length;
			if (total <= HARD_CAPTURE_LIMIT_BYTES) target.push(chunk);
			else if (!capped) {
				capped = true;
				killTree(child);
			}
		}

		child.stdout?.on("data", (chunk: Buffer) => push(stdoutChunks, chunk));
		child.stderr?.on("data", (chunk: Buffer) => push(stderrChunks, chunk));
		child.on("close", (code) => {
			if (done) return;
			done = true;
			if (timeout) clearTimeout(timeout);
			opts.signal?.removeEventListener("abort", abort);
			let stderr = Buffer.concat(stderrChunks).toString("utf8");
			if (capped) stderr += `\n[output capped at ${formatBytes(HARD_CAPTURE_LIMIT_BYTES)}]`;
			resolveRun({
				stdout: Buffer.concat(stdoutChunks).toString("utf8"),
				stderr,
				exitCode: timedOut ? 124 : (code ?? 1),
				timedOut,
				capped,
			});
		});
		child.on("error", (err) => {
			if (done) return;
			done = true;
			if (timeout) clearTimeout(timeout);
			opts.signal?.removeEventListener("abort", abort);
			resolveRun({ stdout: "", stderr: err.message, exitCode: 1, timedOut: false, capped });
		});
	});
}

async function executeCode(language: Language, code: string, ctx?: ToolCtx, timeout?: number): Promise<RunResult> {
	await confirmDanger(`ctx_execute:${language}`, code, ctx);
	const cwd = cwdFrom(ctx);
	const tmp = await mkdtemp(join(tmpdir(), "pi-ctx-"));
	let script = "";
	try {
		if (language === "javascript") {
			script = join(tmp, "script.cjs");
			writeFileSync(script, `(async()=>{\n${code}\n})().catch(e=>{console.error(e && e.stack || e); process.exitCode=1;});\n`, "utf8");
			return await runProcess("node", [script], { cwd, tmp, timeout, signal: ctx?.signal });
		}
		if (language === "python") {
			script = join(tmp, "script.py");
			writeFileSync(script, code, "utf8");
			return await runProcess("python3", [script], { cwd, tmp, timeout, signal: ctx?.signal });
		}
		script = join(tmp, "script.sh");
		writeFileSync(script, `set -o pipefail\n${code}\n`, { encoding: "utf8", mode: 0o700 });
		return await runProcess(process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : "bash", [script], { cwd, tmp, timeout, signal: ctx?.signal });
	} finally {
		try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
	}
}

function wrapFileCode(language: Language, filePath: string, code: string): string {
	const p = JSON.stringify(filePath);
	if (language === "javascript") {
		return `const fs = require("node:fs");\nconst FILE_CONTENT_PATH = ${p};\nconst file_path = FILE_CONTENT_PATH;\nconst FILE_CONTENT = fs.readFileSync(FILE_CONTENT_PATH, "utf8");\n${code}`;
	}
	if (language === "python") {
		return `FILE_CONTENT_PATH = ${p}\nfile_path = FILE_CONTENT_PATH\nwith open(FILE_CONTENT_PATH, "r", encoding="utf-8", errors="replace") as _f:\n    FILE_CONTENT = _f.read()\n${code}`;
	}
	const sq = `'${filePath.replace(/'/g, `'\\''`)}'`;
	return `FILE_CONTENT_PATH=${sq}\nfile_path=${sq}\nFILE_CONTENT=$(cat ${sq})\n${code}`;
}

function commandOutput(result: RunResult): string {
	const parts: string[] = [];
	if (result.stdout.trim()) parts.push(result.stdout.trimEnd());
	if (result.stderr.trim()) parts.push(`stderr:\n${result.stderr.trimEnd()}`);
	if (result.timedOut) parts.push(`(timed out)`);
	return parts.join("\n\n") || "(no output)";
}

function resultFromOutput(tool: string, output: string, project: string, source: string, isError = false): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown>; isError?: boolean } {
	runtimeStats.bytesProcessed += byteLength(output);
	if (byteLength(output) > INLINE_LIMIT_BYTES) {
		const indexed = indexContent(project, source, output, undefined, true);
		const text = `Indexed ${indexed.chunks} chunk${indexed.chunks === 1 ? "" : "s"} (${formatBytes(indexed.bytes)}) from ${source}.\nUse ctx_search({ queries: ["..."], source: ${JSON.stringify(source)} }) to retrieve relevant sections.`;
		runtimeStats.bytesReturned += byteLength(text);
		insertEvent("ctx", `${tool} indexed large output: ${source}`, project);
		return { content: [{ type: "text", text }], details: { indexed: true, source, ...indexed }, isError };
	}
	runtimeStats.bytesReturned += byteLength(output);
	return { content: [{ type: "text", text: output }], details: { indexed: false, bytes: byteLength(output) }, isError };
}

function searchDocs(project: string, query: string, limit: number, source?: string): string {
	const fts = queryToFts(query);
	const database = ensureDb();
	const allProjects = project === "*";
	let rows: Array<Record<string, unknown>>;
	if (source && allProjects) {
		rows = database.prepare(
			"SELECT rowid, project, source, title, path, created_at, snippet(docs, 3, '[', ']', '…', 32) AS snippet, bm25(docs) AS rank FROM docs WHERE docs MATCH ? AND source LIKE ? ORDER BY rank LIMIT ?",
		).all(fts, escapeLike(source), limit) as Array<Record<string, unknown>>;
	} else if (source) {
		rows = database.prepare(
			"SELECT rowid, project, source, title, path, created_at, snippet(docs, 3, '[', ']', '…', 32) AS snippet, bm25(docs) AS rank FROM docs WHERE docs MATCH ? AND project = ? AND source LIKE ? ORDER BY rank LIMIT ?",
		).all(fts, project, escapeLike(source), limit) as Array<Record<string, unknown>>;
	} else if (allProjects) {
		rows = database.prepare(
			"SELECT rowid, project, source, title, path, created_at, snippet(docs, 3, '[', ']', '…', 32) AS snippet, bm25(docs) AS rank FROM docs WHERE docs MATCH ? ORDER BY rank LIMIT ?",
		).all(fts, limit) as Array<Record<string, unknown>>;
	} else {
		rows = database.prepare(
			"SELECT rowid, project, source, title, path, created_at, snippet(docs, 3, '[', ']', '…', 32) AS snippet, bm25(docs) AS rank FROM docs WHERE docs MATCH ? AND project = ? ORDER BY rank LIMIT ?",
		).all(fts, project, limit) as Array<Record<string, unknown>>;
	}
	if (rows.length === 0) return `## ${query}\nNo indexed content results.`;
	return [`## ${query}`, ...rows.map((r, i) => {
		return `### ${i + 1}. ${String(r.title)}\nsource: ${String(r.source)}${allProjects ? ` | project: ${String(r.project)}` : ""}${r.path ? ` | path: ${String(r.path)}` : ""}\n\n${String(r.snippet)}`;
	})].join("\n\n");
}

function searchEvents(project: string, query: string, limit: number, source?: string, timeline = false): string {
	const database = ensureDb();
	const fts = queryToFts(query);
	const allProjects = project === "*";
	let rows: Array<Record<string, unknown>>;
	if (timeline) {
		if (source && allProjects) {
			rows = database.prepare(
				"SELECT project, category, data, created_at FROM events WHERE events MATCH ? AND category LIKE ? ORDER BY created_at DESC LIMIT ?",
			).all(fts, escapeLike(source), limit) as Array<Record<string, unknown>>;
		} else if (source) {
			rows = database.prepare(
				"SELECT project, category, data, created_at FROM events WHERE events MATCH ? AND project = ? AND category LIKE ? ORDER BY created_at DESC LIMIT ?",
			).all(fts, project, escapeLike(source), limit) as Array<Record<string, unknown>>;
		} else if (allProjects) {
			rows = database.prepare(
				"SELECT project, category, data, created_at FROM events WHERE events MATCH ? ORDER BY created_at DESC LIMIT ?",
			).all(fts, limit) as Array<Record<string, unknown>>;
		} else {
			rows = database.prepare(
				"SELECT project, category, data, created_at FROM events WHERE events MATCH ? AND project = ? ORDER BY created_at DESC LIMIT ?",
			).all(fts, project, limit) as Array<Record<string, unknown>>;
		}
	} else {
		if (source && allProjects) {
			rows = database.prepare(
				"SELECT project, category, data, created_at, snippet(events, 3, '[', ']', '…', 24) AS snippet, bm25(events) AS rank FROM events WHERE events MATCH ? AND category LIKE ? ORDER BY rank LIMIT ?",
			).all(fts, escapeLike(source), limit) as Array<Record<string, unknown>>;
		} else if (source) {
			rows = database.prepare(
				"SELECT project, category, data, created_at, snippet(events, 3, '[', ']', '…', 24) AS snippet, bm25(events) AS rank FROM events WHERE events MATCH ? AND project = ? AND category LIKE ? ORDER BY rank LIMIT ?",
			).all(fts, project, escapeLike(source), limit) as Array<Record<string, unknown>>;
		} else if (allProjects) {
			rows = database.prepare(
				"SELECT project, category, data, created_at, snippet(events, 3, '[', ']', '…', 24) AS snippet, bm25(events) AS rank FROM events WHERE events MATCH ? ORDER BY rank LIMIT ?",
			).all(fts, limit) as Array<Record<string, unknown>>;
		} else {
			rows = database.prepare(
				"SELECT project, category, data, created_at, snippet(events, 3, '[', ']', '…', 24) AS snippet, bm25(events) AS rank FROM events WHERE events MATCH ? AND project = ? ORDER BY rank LIMIT ?",
			).all(fts, project, limit) as Array<Record<string, unknown>>;
		}
	}
	if (rows.length === 0) return "";
	return rows.map((r) => `- ${String(r.created_at).slice(0, 16)} [${String(r.category)}]${allProjects ? ` (${String(r.project)})` : ""} ${String(r.snippet || r.data)}`).join("\n");
}

function htmlToText(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<\/(h[1-6]|p|div|li|tr|section|article)>/gi, "\n")
		.replace(/<h1[^>]*>/gi, "\n# ")
		.replace(/<h2[^>]*>/gi, "\n## ")
		.replace(/<h3[^>]*>/gi, "\n### ")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/[ \t]+/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function classifyIp(ip: string): "block" | "private" | "public" {
	const clean = ip.split("%")[0].toLowerCase();
	if (clean.includes(":")) {
		if (clean === "::" || clean.startsWith("fe8") || clean.startsWith("fe9") || clean.startsWith("fea") || clean.startsWith("feb") || clean.startsWith("ff")) return "block";
		if (clean === "::1" || clean.startsWith("fc") || clean.startsWith("fd")) return "private";
		const mapped = clean.match(/^::ffff:([\d.]+)$/);
		if (mapped) return classifyIp(mapped[1]);
		return "public";
	}
	const parts = clean.split(".").map((x) => Number(x));
	if (parts.length !== 4 || parts.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return "block";
	const [a, b] = parts;
	if (a === 0 || (a === 169 && b === 254) || a >= 224) return "block";
	if (a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "private";
	return "public";
}

async function assertFetchAllowed(rawUrl: string): Promise<void> {
	const url = new URL(rawUrl);
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Blocked URL scheme: ${url.protocol}`);
	const records = await lookup(url.hostname, { all: true, verbatim: true });
	for (const rec of records) {
		const c = classifyIp(rec.address);
		if (c === "block") throw new Error(`Blocked URL ${rawUrl}: ${url.hostname} resolves to ${rec.address}`);
		if (c === "private" && process.env.PI_CTX_FETCH_STRICT === "1") throw new Error(`Blocked private IP under PI_CTX_FETCH_STRICT=1: ${rec.address}`);
	}
}

function contentToText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		return value.map((item) => {
			if (typeof item === "string") return item;
			if (item && typeof item === "object" && "text" in item) return String((item as { text?: unknown }).text ?? "");
			return JSON.stringify(item);
		}).join("\n");
	}
	if (value == null) return "";
	try { return JSON.stringify(value); } catch { return String(value); }
}

function routeBlock(): string {
	return `<ctx_context_management>
Use ctx tools whenever output may be large or you need to analyze data without filling conversation memory.
- Analysis/aggregation: ctx_execute(language, code). Print only the answer.
- File analysis, not editing: ctx_execute_file(path, language, code). Use native read only when you need exact bytes for edit.
- Docs/large text: ctx_index(path/source) then ctx_search(queries).
- Web docs/pages: ctx_fetch_and_index(url, source) then ctx_search.
- Multi-command research: ctx_batch_execute(commands, queries).
- Resume/decisions/errors: ctx_search(queries:[...], sort:"timeline"). Search before asking what happened earlier.
Do not use bash/cat/curl/grep to dump raw logs, snapshots, API responses, or docs into context. Bash is fine for small observations and mutations (git add/commit, mkdir, mv, rm after confirmation, installs).
</ctx_context_management>`;
}

function activeMemory(project: string): string {
	try {
		const rows = ensureDb().prepare(
			"SELECT category, data, created_at FROM events WHERE project = ? AND category IN ('decision','constraint','error','git','file','compaction') ORDER BY created_at DESC LIMIT 10",
		).all(project) as Array<{ category: string; data: string; created_at: string }>;
		if (rows.length === 0) return "";
		let out = "<ctx_active_memory>\n";
		let budget = 1_600;
		for (const row of rows) {
			const line = `- ${row.created_at.slice(0, 16)} [${row.category}] ${row.data}\n`;
			if (line.length > budget) break;
			out += line;
			budget -= line.length;
		}
		return out + "</ctx_active_memory>";
	} catch { return ""; }
}

function registerRender(_name: string) {
	// Keep this extension completely self-contained: custom renderers are optional
	// in Pi, and omitting them avoids importing @mariozechner/pi-tui.
	return {};
}

async function handleExecute(params: any, ctx?: ToolCtx) {
	const language = (params.language || "javascript") as Language;
	const result = await executeCode(language, String(params.code || ""), ctx, Number(params.timeout ?? DEFAULT_TIMEOUT_MS));
	const output = commandOutput(result);
	const source = params.source || `execute:${language}:${Date.now()}`;
	return resultFromOutput("ctx_execute", output, cwdFrom(ctx), source, result.exitCode !== 0);
}

export default function ctxExtension(pi: ExtensionAPI) {
	ensureDb();

	pi.on("session_start", (_event: unknown, ctx: ToolCtx) => {
		currentProject = cwdFrom(ctx);
		sessionId = sessionFromCtx(ctx);
		insertEvent("session", `session_start ${sessionId}`, currentProject);
	});

	pi.on("before_agent_start", (event: any, ctx: ToolCtx) => {
		turns++;
		currentProject = cwdFrom(ctx);
		sessionId = sessionFromCtx(ctx);
		const prompt = String(event?.prompt || "");
		if (prompt.trim()) {
			insertEvent("user-prompt", prompt, currentProject);
			if (/\b(don't|do not|never|always|prefer|remember|constraint|decision|use .* instead)\b/i.test(prompt)) {
				insertEvent(/\bconstraint\b/i.test(prompt) ? "constraint" : "decision", prompt, currentProject);
			}
		}
		const parts = [String(event?.systemPrompt || ""), routeBlock(), activeMemory(currentProject)].filter(Boolean);
		return { systemPrompt: parts.join("\n\n") };
	});

	pi.on("tool_call", async (event: any, ctx: ToolCtx) => {
		const toolName = String(event?.toolName || "").toLowerCase();
		const input = event?.input || {};
		if (toolName === "bash") {
			const command = String(input.command || "");
			const unsafeHttp = /(^|\s|;|&&|\|\|)(curl|wget)\s/i.test(command) && !/(\s-o\s+\S+|\s-O\s+\S+|--output\s+\S+|--output-document\s+\S+|\s>\s*\S+)/i.test(command);
			if (unsafeHttp) return { block: true, reason: "Use ctx_fetch_and_index or ctx_execute with fetch; raw curl/wget output floods context." };
			try { await confirmDanger("bash", command, ctx); } catch (err) { return { block: true, reason: err instanceof Error ? err.message : String(err) }; }
		}
	});

	pi.on("tool_result", (event: any) => {
		try {
			const toolName = String(event?.toolName || event?.tool_name || "");
			if (toolName.startsWith("ctx_")) return;
			const input = event?.input || event?.params || event?.tool_input || {};
			const text = contentToText(event?.content ?? event?.result ?? event?.output ?? event?.tool_result ?? event?.tool_response);
			const isError = Boolean(event?.isError || event?.is_error || event?.error);
			if (["read", "write", "edit"].includes(toolName.toLowerCase())) {
				insertEvent("file", `${toolName}: ${input.path || input.file_path || input.notebook_path || ""}`);
			}
			if (toolName.toLowerCase() === "bash") {
				const cmd = String(input.command || "");
				if (/\bgit\s+/i.test(cmd)) insertEvent("git", cmd.slice(0, 300));
				if (/\bcd\s+/i.test(cmd)) insertEvent("cwd", cmd.slice(0, 300));
			}
			if (isError || /\b(error|failed|exception|traceback)\b/i.test(text.slice(0, 2_000))) {
				insertEvent("error", `${toolName}: ${text}`);
			}
		} catch { /* tool-result capture must never break execution */ }
	});

	pi.on("session_before_compact", () => {
		insertEvent("compaction", `compaction before turn ${turns}`, currentProject);
	});

	pi.on("session_compact", () => {
		insertEvent("compaction", `compacted at turn ${turns}`, currentProject);
	});

	pi.on("session_shutdown", () => {
		insertEvent("session", `session_shutdown ${sessionId}`, currentProject);
		closeDb();
	});

	pi.registerTool({
		name: "ctx_execute",
		label: "ctx execute",
		description: "Run JavaScript, Python, or shell code in a subprocess and return only what the code prints. Large output is indexed into local FTS instead of returned to context. Use for logs, tests, CLI/API output, counting, filtering, parsing, and aggregation.",
		parameters: Type.Object({
			language: Type.Union([Type.Literal("javascript"), Type.Literal("python"), Type.Literal("shell")], { description: "Runtime language" }),
			code: Type.String({ description: "Code to run. Print only the derived answer." }),
			timeout: Type.Optional(Type.Number({ description: "Timeout in ms. 0 disables this extension's timeout." })),
			source: Type.Optional(Type.String({ description: "Optional source label when large output is auto-indexed." })),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			runtimeStats.toolCalls++;
			return handleExecute(params, { ...(ctx as ToolCtx), signal });
		},
		...registerRender("ctx_execute"),
	});

	pi.registerTool({
		name: "ctx_execute_file",
		label: "ctx execute file",
		description: "Read a file into FILE_CONTENT inside a subprocess, run analysis code, and return only printed findings. Use instead of read/cat when you do not need exact bytes for editing.",
		parameters: Type.Object({
			path: Type.String({ description: "File path, absolute or relative to cwd" }),
			language: Type.Union([Type.Literal("javascript"), Type.Literal("python"), Type.Literal("shell")], { description: "Runtime language" }),
			code: Type.String({ description: "Code that uses FILE_CONTENT / FILE_CONTENT_PATH and prints findings" }),
			timeout: Type.Optional(Type.Number({ description: "Timeout in ms" })),
			source: Type.Optional(Type.String({ description: "Optional source label when large output is auto-indexed" })),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			runtimeStats.toolCalls++;
			const project = cwdFrom(ctx as ToolCtx);
			const path = resolvePath(String(params.path), project);
			const language = (params.language || "javascript") as Language;
			const wrapped = wrapFileCode(language, path, String(params.code || ""));
			const result = await executeCode(language, wrapped, { ...(ctx as ToolCtx), signal }, Number(params.timeout ?? DEFAULT_TIMEOUT_MS));
			const output = commandOutput(result);
			return resultFromOutput("ctx_execute_file", output, project, String(params.source || `file:${path}`), result.exitCode !== 0);
		},
		...registerRender("ctx_execute_file"),
	});

	pi.registerTool({
		name: "ctx_index",
		label: "ctx index",
		description: "Index text, a file, or a directory into the local SQLite FTS5 knowledge base. Prefer path over content for large data so bytes do not pass through conversation as a tool argument.",
		parameters: Type.Object({
			content: Type.Optional(Type.String({ description: "Small inline text/markdown to index" })),
			path: Type.Optional(Type.String({ description: "File or directory path to index server-side" })),
			source: Type.Optional(Type.String({ description: "Searchable source label" })),
			maxFiles: Type.Optional(Type.Number({ description: "Directory cap, default 200" })),
			maxDepth: Type.Optional(Type.Number({ description: "Directory recursion cap, default 5" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			runtimeStats.toolCalls++;
			const project = cwdFrom(ctx as ToolCtx);
			if (!params.content && !params.path) throw new Error("ctx_index needs content or path");
			let totalChunks = 0;
			let totalBytes = 0;
			let files = 0;
			if (params.path) {
				const abs = resolvePath(String(params.path), project);
				const st = statSync(abs);
				if (st.isDirectory()) {
					const paths = listFiles(abs, Number(params.maxFiles ?? 200), Number(params.maxDepth ?? 5));
					for (const file of paths) {
						const content = readFileSync(file, "utf8");
						const rel = file.startsWith(project) ? file.slice(project.length + 1) : file;
						const r = indexContent(project, `${params.source || basename(abs)}:${rel}`, content, file, true);
						totalChunks += r.chunks; totalBytes += r.bytes; files++;
					}
				} else {
					if (st.size > MAX_INDEX_FILE_BYTES) throw new Error(`File too large for ctx_index path (${formatBytes(st.size)} > ${formatBytes(MAX_INDEX_FILE_BYTES)}). Use ctx_execute_file to summarize it.`);
					const content = readFileSync(abs, "utf8");
					const r = indexContent(project, String(params.source || abs), content, abs, true);
					totalChunks = r.chunks; totalBytes = r.bytes; files = 1;
				}
			} else {
				const r = indexContent(project, String(params.source || `inline:${Date.now()}`), String(params.content), undefined, true);
				totalChunks = r.chunks; totalBytes = r.bytes; files = 1;
			}
			insertEvent("ctx", `indexed ${files} file(s), ${totalChunks} chunks`, project);
			const text = `Indexed ${files} item${files === 1 ? "" : "s"}: ${totalChunks} chunk${totalChunks === 1 ? "" : "s"}, ${formatBytes(totalBytes)}. Use ctx_search({ queries: ["..."], source: "..." }).`;
			runtimeStats.bytesReturned += byteLength(text);
			return { content: [{ type: "text" as const, text }], details: { files, totalChunks, totalBytes } };
		},
		...registerRender("ctx_index"),
	});

	pi.registerTool({
		name: "ctx_search",
		label: "ctx search",
		description: "Search indexed content and captured session memory. Batch related questions in queries. Use sort:'timeline' to recall decisions, constraints, errors, and recent session events.",
		parameters: Type.Object({
			queries: Type.Array(Type.String({ description: "Search query" }), { description: "Batch all related questions" }),
			source: Type.Optional(Type.String({ description: "Partial source/category filter" })),
			limit: Type.Optional(Type.Number({ description: "Results per query, default 3" })),
			sort: Type.Optional(Type.Union([Type.Literal("relevance"), Type.Literal("timeline")], { description: "Search mode" })),
			allProjects: Type.Optional(Type.Boolean({ description: "Search all projects instead of current cwd" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			runtimeStats.toolCalls++;
			const project = params.allProjects ? "*" : cwdFrom(ctx as ToolCtx);
			const queries = Array.isArray(params.queries) ? params.queries : [String((params as any).query || "")];
			const limit = Math.max(1, Math.min(8, Number(params.limit ?? DEFAULT_SEARCH_LIMIT)));
			const timeline = params.sort === "timeline";
			const sections: string[] = [];
			for (const q of queries.filter(Boolean)) {
				sections.push(searchDocs(project, q, limit, params.source));
				const events = searchEvents(project, q, limit, params.source, timeline);
				if (events) sections.push(`### Session memory for ${q}\n${events}`);
			}
			const text = sections.join("\n\n---\n\n") || "No query provided.";
			runtimeStats.bytesReturned += byteLength(text);
			return { content: [{ type: "text" as const, text }], details: { queries: queries.length, limit } };
		},
		...registerRender("ctx_search"),
	});

	pi.registerTool({
		name: "ctx_fetch_and_index",
		label: "ctx fetch and index",
		description: "Fetch one or more HTTP(S) URLs, convert HTML to text, index content in local FTS, and return only a short preview. Raw page bytes stay out of context.",
		parameters: Type.Object({
			url: Type.Optional(Type.String({ description: "URL to fetch" })),
			requests: Type.Optional(Type.Array(Type.Object({ url: Type.String(), source: Type.Optional(Type.String()) }), { description: "Batch URLs" })),
			source: Type.Optional(Type.String({ description: "Source label for single URL" })),
			concurrency: Type.Optional(Type.Number({ description: "Reserved; currently fetched sequentially" })),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			runtimeStats.toolCalls++;
			const project = cwdFrom(ctx as ToolCtx);
			const requests = Array.isArray(params.requests) ? params.requests : [{ url: params.url, source: params.source }];
			const lines: string[] = [];
			for (const req of requests) {
				if (!req?.url) continue;
				await assertFetchAllowed(String(req.url));
				const resp = await fetch(String(req.url), { signal });
				if (!resp.ok) throw new Error(`Fetch failed ${resp.status} ${resp.statusText}: ${req.url}`);
				const ct = resp.headers.get("content-type") || "";
				const raw = await resp.text();
				const text = ct.includes("html") ? htmlToText(raw) : ct.includes("json") ? JSON.stringify(JSON.parse(raw), null, 2) : raw;
				const source = String(req.source || params.source || req.url);
				const indexed = indexContent(project, source, text, String(req.url), true);
				const preview = text.slice(0, 800).replace(/\n{3,}/g, "\n\n");
				lines.push(`## ${source}\nIndexed ${indexed.chunks} chunks (${formatBytes(indexed.bytes)}).\n\n${preview}${text.length > 800 ? "\n…" : ""}`);
			}
			const out = lines.join("\n\n---\n\n") || "No URLs provided.";
			runtimeStats.bytesReturned += byteLength(out);
			return { content: [{ type: "text" as const, text: out }], details: { count: lines.length } };
		},
		...registerRender("ctx_fetch_and_index"),
	});

	pi.registerTool({
		name: "ctx_batch_execute",
		label: "ctx batch execute",
		description: "Run multiple shell commands, index each command's full output, and optionally search the indexed batch immediately. Use for multi-step research where raw outputs may be large.",
		parameters: Type.Object({
			commands: Type.Array(Type.Object({ label: Type.String(), command: Type.String() })),
			queries: Type.Optional(Type.Array(Type.String())),
			timeout: Type.Optional(Type.Number({ description: "Per-command timeout in ms" })),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			runtimeStats.toolCalls++;
			const project = cwdFrom(ctx as ToolCtx);
			const summaries: string[] = [];
			for (const cmd of params.commands || []) {
				const result = await executeCode("shell", String(cmd.command), { ...(ctx as ToolCtx), signal }, Number(params.timeout ?? DEFAULT_TIMEOUT_MS));
				const output = commandOutput(result);
				const source = `batch:${cmd.label}`;
				const indexed = indexContent(project, source, output, undefined, true);
				summaries.push(`- ${cmd.label}: exit ${result.exitCode}, indexed ${indexed.chunks} chunks (${formatBytes(indexed.bytes)}) as ${source}`);
			}
			const sections = [`Executed ${summaries.length} commands.`, ...summaries];
			if (Array.isArray(params.queries) && params.queries.length > 0) {
				for (const q of params.queries) sections.push(searchDocs(project, q, 3, "batch:"));
			}
			const out = sections.join("\n\n");
			runtimeStats.bytesReturned += byteLength(out);
			return { content: [{ type: "text" as const, text: out }], details: { count: summaries.length } };
		},
		...registerRender("ctx_batch_execute"),
	});

	pi.registerTool({
		name: "ctx_stats",
		label: "ctx stats",
		description: "Show local ctx extension stats and storage locations.",
		parameters: Type.Object({}),
		async execute() {
			const database = ensureDb();
			const docCount = (database.prepare("SELECT count(*) AS n FROM docs").get() as { n: number }).n;
			const eventCount = (database.prepare("SELECT count(*) AS n FROM events").get() as { n: number }).n;
			const ageMin = Math.round((Date.now() - runtimeStats.startedAt) / 60_000);
			const text = [
				"# ctx stats",
				`Storage: ${DATA_DIR}`,
				`DB: ${DB_PATH}`,
				`Session: ${sessionId}`,
				`Project: ${currentProject}`,
				`Age: ${ageMin}m`,
				`Tool calls: ${runtimeStats.toolCalls}`,
				`Indexed rows: ${docCount}`,
				`Events: ${eventCount}`,
				`Bytes processed: ${formatBytes(runtimeStats.bytesProcessed)}`,
				`Bytes indexed: ${formatBytes(runtimeStats.bytesIndexed)}`,
				`Bytes returned: ${formatBytes(runtimeStats.bytesReturned)}`,
			].join("\n");
			return { content: [{ type: "text" as const, text }], details: runtimeStats };
		},
		...registerRender("ctx_stats"),
	});

	pi.registerTool({
		name: "ctx_purge",
		label: "ctx purge",
		description: "Delete indexed ctx content. Requires confirm:true. scope:'project' deletes current project only; scope:'all' deletes all ctx docs/events.",
		parameters: Type.Object({
			confirm: Type.Boolean(),
			scope: Type.Optional(Type.Union([Type.Literal("project"), Type.Literal("all")]))
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			if (!params.confirm) return { content: [{ type: "text" as const, text: "Purge cancelled. Pass confirm:true." }], details: {} };
			const database = ensureDb();
			if (params.scope === "all") {
				database.exec("DELETE FROM docs; DELETE FROM events;");
				return { content: [{ type: "text" as const, text: "Purged all ctx docs and events." }], details: { scope: "all" } };
			}
			const project = cwdFrom(ctx as ToolCtx);
			database.prepare("DELETE FROM docs WHERE project = ?").run(project);
			database.prepare("DELETE FROM events WHERE project = ?").run(project);
			return { content: [{ type: "text" as const, text: `Purged ctx docs and events for ${project}.` }], details: { scope: "project", project } };
		},
		...registerRender("ctx_purge"),
	});

	function commandText(text: string, ctx?: ToolCtx): { text: string } | undefined {
		if (ctx?.hasUI && ctx.ui?.notify) { ctx.ui.notify(text, "info"); return undefined; }
		return { text };
	}

	pi.registerCommand("ctx-stats", {
		description: "Show ctx extension stats",
		handler: async (_args: unknown, ctx: ToolCtx) => {
			const result = await (async () => {
				const database = ensureDb();
				const docs = (database.prepare("SELECT count(*) AS n FROM docs").get() as { n: number }).n;
				const events = (database.prepare("SELECT count(*) AS n FROM events").get() as { n: number }).n;
				return `ctx: ${docs} indexed rows, ${events} events, storage ${DATA_DIR}`;
			})();
			return commandText(result, ctx);
		},
	});

	pi.registerCommand("ctx-purge", {
		description: "Purge ctx data for current project after confirmation",
		handler: async (_args: unknown, ctx: ToolCtx) => {
			if (ctx?.hasUI && ctx.ui?.confirm) {
				const ok = await ctx.ui.confirm("ctx purge", `Delete ctx data for ${cwdFrom(ctx)}?`);
				if (!ok) return commandText("ctx purge cancelled", ctx);
			}
			const project = cwdFrom(ctx);
			ensureDb().prepare("DELETE FROM docs WHERE project = ?").run(project);
			ensureDb().prepare("DELETE FROM events WHERE project = ?").run(project);
			return commandText(`ctx purged for ${project}`, ctx);
		},
	});
}
