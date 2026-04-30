/**
 * Database Extension
 *
 * Registers a `database_query` tool that executes arbitrary SQL against the
 * project's configured database. Connection credentials are read from
 * `.agent/credentials/database.json`; the config must include `type` to choose the
 * database engine (`mysql`, `mariadb`, `sqlserver`, or `mssql`).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";

type DatabaseEngine = "mysql" | "sqlserver";

interface RawDatabaseConfig {
	type?: string;
	host?: string;
	port?: number;
	user?: string;
	password?: string;
	database?: string;
	schema?: string;
	schemas?: string[];
	socket?: string;
	trustServerCertificate?: boolean;
	encrypt?: boolean;
}

interface DatabaseConfig extends RawDatabaseConfig {
	type: DatabaseEngine;
	user: string;
	password: string;
}

interface LoadConfigResult {
	path?: string;
	config?: DatabaseConfig;
	error?: string;
}

const CONFIG_RELATIVE_PATH = ".agent/credentials/database.json";
const MAX_ROWS = 200;

function findConfigPath(cwd: string): string | null {
	let dir = cwd;
	while (true) {
		const candidate = join(dir, CONFIG_RELATIVE_PATH);
		if (existsSync(candidate)) return candidate;

		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

function normalizeType(type: unknown): DatabaseEngine | null {
	const normalized = String(type ?? "")
		.trim()
		.toLowerCase();

	if (normalized === "mysql" || normalized === "mariadb" || normalized === "maria") {
		return "mysql";
	}
	if (
		normalized === "sqlserver" ||
		normalized === "sql-server" ||
		normalized === "mssql" ||
		normalized === "ms-sql"
	) {
		return "sqlserver";
	}
	return null;
}

function loadConfig(cwd: string): LoadConfigResult {
	const configPath = findConfigPath(cwd);
	if (!configPath) {
		return {
			error:
				`No database config found. Create ${CONFIG_RELATIVE_PATH} with ` +
				`{ "type": "mysql" | "sqlserver", "host": "...", "user": "...", "password": "...", "database": "..." }`,
		};
	}

	let raw: RawDatabaseConfig;
	try {
		raw = JSON.parse(readFileSync(configPath, "utf-8")) as RawDatabaseConfig;
	} catch (err: any) {
		return { path: configPath, error: `Failed to parse ${configPath}: ${err.message}` };
	}

	const type = normalizeType(raw.type);
	if (!type) {
		const provided = raw.type === undefined ? "missing" : JSON.stringify(raw.type);
		return {
			path: configPath,
			error:
				`Invalid or missing database type in ${configPath} (got ${provided}). ` +
				`Add "type": "mysql" for MySQL/MariaDB or "type": "sqlserver" for SQL Server.`,
		};
	}

	const missing: string[] = [];
	if (type === "sqlserver" && !raw.host) missing.push("host");
	if (type === "mysql" && !raw.host && !raw.socket) missing.push("host or socket");
	if (!raw.user) missing.push("user");
	if (raw.password === undefined) missing.push("password");

	if (missing.length > 0) {
		return {
			path: configPath,
			error: `Invalid database config in ${configPath}: missing ${missing.join(", ")}.`,
		};
	}

	return {
		path: configPath,
		config: {
			...raw,
			type,
			user: raw.user!,
			password: raw.password!,
		},
	};
}

function buildMysqlArgs(config: DatabaseConfig, query: string, database?: string): string[] {
	const args: string[] = [];
	if (config.password) args.push(`--password=${config.password}`);
	if (config.host) args.push("-h", config.host);
	args.push("-P", String(config.port ?? 3306));
	args.push("-u", config.user);
	if (config.socket) args.push("--socket", config.socket);
	args.push("--batch", "--raw");
	args.push("-e", query);
	const db = database ?? config.database;
	if (db) args.push(db);
	return args;
}

function buildSqlServerArgs(config: DatabaseConfig, query: string, database?: string): string[] {
	const args: string[] = [];
	const port = config.port ?? 1433;
	args.push("-S", `${config.host},${port}`);
	args.push("-U", config.user);
	args.push("-P", config.password);
	const db = database ?? config.database;
	if (db) args.push("-d", db);
	if (config.encrypt !== undefined) args.push("-N", config.encrypt ? "true" : "false");
	if (config.trustServerCertificate !== false) args.push("-C");
	args.push("-b"); // non-zero exit code on SQL errors
	args.push("-r", "1"); // route SQL errors to stderr
	args.push("-s", "\t"); // tab separator
	args.push("-W"); // trim trailing spaces
	args.push("-Q", query);
	return args;
}

function formatTable(rows: string[][], rowCountSuffix?: string[]): string {
	if (rows.length === 0) {
		return rowCountSuffix?.length
			? rowCountSuffix.join("\n")
			: "Query executed successfully. No rows returned.";
	}

	if (rows.length === 1) {
		return ["No rows returned.", ...(rowCountSuffix ?? [])].join("\n");
	}

	const header = rows[0];
	const dataRows = rows.slice(1);
	const truncated = dataRows.length > MAX_ROWS;
	const display = truncated ? dataRows.slice(0, MAX_ROWS) : dataRows;

	const widths = header.map((col, i) => {
		const values = display.map((row) => (row[i] ?? "").length);
		return Math.max(col.length, ...values);
	});

	const headerLine = header.map((col, i) => col.padEnd(widths[i])).join(" | ");
	const separator = widths.map((w) => "-".repeat(w)).join("-+-");
	const body = display
		.map((row) => header.map((_, i) => (row[i] ?? "").padEnd(widths[i])).join(" | "))
		.join("\n");

	let result = `${headerLine}\n${separator}\n${body}\n\n${dataRows.length} row(s) returned.`;
	if (truncated) result += ` (showing first ${MAX_ROWS})`;
	if (rowCountSuffix?.length) result += `\n${rowCountSuffix.join("\n")}`;
	return result;
}

function formatMysqlOutput(tsv: string): string {
	const lines = tsv.trimEnd().split(/\r?\n/);
	if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === "")) {
		return "Query executed successfully. No rows returned.";
	}

	return formatTable(lines.map((line) => line.split("\t")));
}

function isSqlServerSeparatorRow(row: string[]): boolean {
	return row.length > 0 && row.every((cell) => /^-+$/.test(cell.trim()));
}

function formatSqlServerOutput(raw: string): string {
	const lines = raw
		.trimEnd()
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line.trim() !== "");

	if (lines.length === 0) {
		return "Query executed successfully. No rows returned.";
	}

	const rowCountLines = lines.filter((line) => /^\(\d+ rows? affected\)$/i.test(line.trim()));
	const dataLines = lines.filter((line) => !/^\(\d+ rows? affected\)$/i.test(line.trim()));

	if (dataLines.length === 0) {
		return rowCountLines.join("\n") || "Query executed successfully.";
	}

	const rows = dataLines.map((line) => line.split("\t"));
	const hasSeparator = rows.length >= 2 && isSqlServerSeparatorRow(rows[1]);
	if (hasSeparator) {
		return formatTable([rows[0], ...rows.slice(2)], rowCountLines);
	}

	const hasTabbedRows = dataLines.some((line) => line.includes("\t"));
	if (hasTabbedRows) {
		return formatTable(rows, rowCountLines);
	}

	return [...dataLines, ...rowCountLines].join("\n") || "Query executed successfully.";
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "database_query",
		label: "Database Query",
		description:
			"Execute a SQL query against the project's configured database. " +
			"Supports MySQL/MariaDB and SQL Server/MSSQL based on the `type` field in .agent/credentials/database.json. " +
			"Supports SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, and other SQL statements. " +
			"For SELECT queries results are returned as a formatted table; for write operations the CLI output is returned.",
		promptSnippet:
			"Execute SQL against the project database configured in .agent/credentials/database.json (`type` selects MySQL/MariaDB or SQL Server/MSSQL)",
		promptGuidelines: [
			"Use database_query when the user asks to query, inspect, modify, or manage the project database.",
			"Before writing SQL, respect the project's configured database type in .agent/credentials/database.json and use the matching SQL dialect.",
			"Confirm with the user before using database_query for destructive operations such as DROP, TRUNCATE, or broad DELETE/UPDATE statements.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "The SQL query to execute" }),
			database: Type.Optional(
				Type.String({ description: "Override the default database from config" }),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const loaded = loadConfig(ctx.cwd);
			if (!loaded.config) {
				return {
					content: [{ type: "text", text: `Error: ${loaded.error}` }],
					details: { error: true, configPath: loaded.path },
					isError: true,
				};
			}

			const { config } = loaded;
			const command = config.type === "sqlserver" ? "sqlcmd" : "mysql";
			const args =
				config.type === "sqlserver"
					? buildSqlServerArgs(config, params.query, params.database)
					: buildMysqlArgs(config, params.query, params.database);

			try {
				const result = await pi.exec(command, args, {
					cwd: ctx.cwd,
					timeout: 30000,
					signal,
				});

				if (result.code !== 0) {
					const errMsg =
						result.stderr.trim() || result.stdout.trim() || `${command} exited with code ${result.code}`;
					return {
						content: [{ type: "text", text: `${config.type} error: ${errMsg}` }],
						details: {
							error: true,
							code: result.code,
							databaseType: config.type,
							configPath: loaded.path,
						},
						isError: true,
					};
				}

				const text = result.stdout.trim()
					? config.type === "sqlserver"
						? formatSqlServerOutput(result.stdout)
						: formatMysqlOutput(result.stdout)
					: "Query executed successfully.";

				return {
					content: [{ type: "text", text }],
					details: {
						success: true,
						databaseType: config.type,
						configPath: loaded.path,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Failed to execute ${command}: ${err.message}` }],
					details: { error: true, databaseType: config.type, configPath: loaded.path },
					isError: true,
				};
			}
		},
	});

	pi.registerCommand("database", {
		description: "Run a project database query (e.g. /database SELECT * FROM users LIMIT 10)",
		handler: async (args: string, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("Usage: /database <SQL query>", "warning");
				return;
			}
			pi.sendUserMessage(
				`Use the database_query tool to run this query with the project's configured database dialect: ${args.trim()}`,
			);
		},
	});
}
