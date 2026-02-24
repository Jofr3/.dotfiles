/**
 * SQL Server Extension
 *
 * Registers a `sqlserver_query` tool that executes arbitrary SQL against a SQL Server database
 * via the `sqlcmd` CLI. Connection credentials are read from `.agent/tools/sqlserver.json`
 * in the project directory. Config is hot-reloaded on each call.
 *
 * Also provides a SKILL.md via `resources_discover` so the agent knows when/how to use it.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface SqlServerConfig {
	host: string;
	port?: number;
	user: string;
	password: string;
	database: string;
	trustServerCertificate?: boolean;
	encrypt?: boolean;
}

function loadConfig(cwd: string): SqlServerConfig | null {
	const configPath = join(cwd, ".agent", "tools", "sqlserver.json");
	if (!existsSync(configPath)) return null;
	try {
		return JSON.parse(readFileSync(configPath, "utf-8")) as SqlServerConfig;
	} catch {
		return null;
	}
}

function buildArgs(config: SqlServerConfig, query: string, database?: string): string[] {
	const args: string[] = [];
	const port = config.port ?? 1433;
	args.push("-S", `${config.host},${port}`);
	args.push("-U", config.user);
	args.push("-P", config.password);
	const db = database ?? config.database;
	if (db) args.push("-d", db);
	if (config.trustServerCertificate !== false) args.push("-C");
	args.push("-s", "\t"); // tab separator
	args.push("-W"); // trim trailing spaces
	args.push("-h", "-1"); // no headers row count; we handle formatting
	args.push("-Q", query);
	return args;
}

function formatOutput(raw: string): string {
	const lines = raw.trimEnd().split("\n").filter((l) => l.trim() !== "");
	if (lines.length === 0) {
		return "Query executed successfully. No rows returned.";
	}

	// sqlcmd with -h -1 still prints column headers as first row when using SELECT
	// Try to detect tabular output (contains tabs)
	const hasRows = lines.some((l) => l.includes("\t"));
	if (!hasRows) {
		// Non-tabular output (e.g. row count messages)
		return lines.join("\n") || "Query executed successfully.";
	}

	const rows = lines.map((line) => line.split("\t"));
	if (rows.length <= 1) return rows[0]?.join(" | ") ?? "No rows returned.";

	const MAX_ROWS = 200;
	const header = rows[0];
	// Skip separator line if present (all dashes)
	const startIdx = rows[1]?.every((cell) => /^-+$/.test(cell.trim())) ? 2 : 1;
	const dataRows = rows.slice(startIdx);
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
	return result;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "sqlserver_query",
		label: "SQL Server Query",
		description:
			"Execute a SQL query against the project's SQL Server database. " +
			"Supports all SQL statements: SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, etc. " +
			"Connection config is read from .agent/tools/sqlserver.json in the project directory. " +
			"For SELECT queries results are returned as a formatted table. " +
			"For write operations the sqlcmd CLI output is returned.",
		parameters: Type.Object({
			query: Type.String({ description: "The SQL query to execute" }),
			database: Type.Optional(
				Type.String({ description: "Override the default database from config" }),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const config = loadConfig(ctx.cwd);
			if (!config) {
				return {
					content: [
						{
							type: "text",
							text: "Error: No SQL Server config found. Create .agent/tools/sqlserver.json with: { host, port, user, password, database }",
						},
					],
					details: { error: true },
				};
			}

			const args = buildArgs(config, params.query, params.database);

			try {
				const result = await pi.exec("sqlcmd", args, { cwd: ctx.cwd, timeout: 30000 });

				if (result.code !== 0) {
					const errMsg = result.stderr.trim() || `sqlcmd exited with code ${result.code}`;
					return {
						content: [{ type: "text", text: `SQL Server error: ${errMsg}` }],
						details: { error: true, code: result.code },
					};
				}

				const text = result.stdout.trim()
					? formatOutput(result.stdout)
					: "Query executed successfully.";

				return {
					content: [{ type: "text", text }],
					details: { success: true },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Failed to execute sqlcmd: ${err.message}` }],
					details: { error: true },
				};
			}
		},
	});

	pi.registerCommand("sqlserver", {
		description: "Run a SQL Server query (e.g. /sqlserver SELECT TOP 10 * FROM users)",
		handler: async (args: string, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("Usage: /sqlserver <SQL query>", "warning");
				return;
			}
			pi.sendUserMessage(`Use the sqlserver_query tool to run: ${args.trim()}`);
		},
	});
}
