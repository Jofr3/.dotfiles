/**
 * MySQL Extension
 *
 * Registers a `mysql_query` tool that executes arbitrary SQL against a MySQL database
 * via the `mysql` CLI. Connection credentials are read from `.agent/tools/mysql.json`
 * in the project directory. Config is hot-reloaded on each call.
 *
 * Also provides a SKILL.md via `resources_discover` so the agent knows when/how to use it.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface MysqlConfig {
	host: string;
	port?: number;
	user: string;
	password: string;
	database: string;
	socket?: string;
}

function loadConfig(cwd: string): MysqlConfig | null {
	const configPath = join(cwd, ".agent", "tools", "mysql.json");
	if (!existsSync(configPath)) return null;
	try {
		return JSON.parse(readFileSync(configPath, "utf-8")) as MysqlConfig;
	} catch {
		return null;
	}
}

function buildArgs(config: MysqlConfig, query: string, database?: string): string[] {
	const args: string[] = [];
	if (config.password) args.push(`--password=${config.password}`);
	args.push("-h", config.host);
	args.push("-P", String(config.port ?? 3306));
	args.push("-u", config.user);
	if (config.socket) args.push("--socket", config.socket);
	args.push("--batch", "--raw");
	args.push("-e", query);
	const db = database ?? config.database;
	if (db) args.push(db);
	return args;
}

function formatTsvOutput(tsv: string): string {
	const lines = tsv.trimEnd().split("\n");
	if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === "")) {
		return "Query executed successfully. No rows returned.";
	}

	const rows = lines.map((line) => line.split("\t"));
	if (rows.length === 1) return "No rows returned.";

	const MAX_ROWS = 200;
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
	return result;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "mysql_query",
		label: "MySQL Query",
		description:
			"Execute a SQL query against the project's MySQL database. " +
			"Supports all SQL statements: SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, etc. " +
			"Connection config is read from .agent/tools/mysql.json in the project directory. " +
			"For SELECT queries results are returned as a formatted table. " +
			"For write operations the mysql CLI output is returned.",
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
							text: "Error: No MySQL config found. Create .agent/tools/mysql.json with: { host, port, user, password, database }",
						},
					],
					details: { error: true },
				};
			}

			const args = buildArgs(config, params.query, params.database);

			try {
				const result = await pi.exec("mysql", args, { cwd: ctx.cwd, timeout: 30000 });

				if (result.code !== 0) {
					const errMsg = result.stderr.trim() || `mysql exited with code ${result.code}`;
					return {
						content: [{ type: "text", text: `MySQL error: ${errMsg}` }],
						details: { error: true, code: result.code },
					};
				}

				const text = result.stdout.trim()
					? formatTsvOutput(result.stdout)
					: "Query executed successfully.";

				return {
					content: [{ type: "text", text }],
					details: { success: true },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Failed to execute mysql: ${err.message}` }],
					details: { error: true },
				};
			}
		},
	});

	pi.registerCommand("mysql", {
		description: "Run a MySQL query (e.g. /mysql SELECT * FROM users LIMIT 10)",
		handler: async (args: string, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("Usage: /mysql <SQL query>", "warning");
				return;
			}
			pi.sendUserMessage(`Use the mysql_query tool to run: ${args.trim()}`);
		},
	});
}
