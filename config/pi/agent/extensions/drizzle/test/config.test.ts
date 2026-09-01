import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { loadDrizzleConfig } from "../src/config.ts";

function tempLayout() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-drizzle-config-"));
	const agentDir = path.join(root, "agent");
	const project = path.join(root, "project", "nested");
	fs.mkdirSync(agentDir, { recursive: true });
	fs.mkdirSync(project, { recursive: true });
	return { root, agentDir, project };
}

test("trusted project configuration overrides global profiles", () => {
	const layout = tempLayout();
	fs.writeFileSync(
		path.join(layout.agentDir, "drizzle.json"),
		JSON.stringify({
			default: "app",
			connections: { app: { dialect: "postgresql", urlEnv: "GLOBAL_URL" } },
		}),
	);
	const projectConfigDir = path.join(layout.root, "project", ".pi");
	fs.mkdirSync(projectConfigDir, { recursive: true });
	fs.writeFileSync(
		path.join(projectConfigDir, "drizzle.json"),
		JSON.stringify({
			connections: { app: { dialect: "sqlite", url: "file:./db/local.db", allowWrites: true } },
		}),
	);
	const config = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: { GLOBAL_URL: "postgresql://example.invalid/global" },
	});
	const app = config.connections.get("app");
	assert.equal(config.defaultConnection, "app");
	assert.equal(app?.dialect, "sqlite");
	assert.equal(app?.allowWrites, true);
	assert.equal(app?.confirmWrites, true);
	assert.match(app?.url ?? "", /project\/\.pi\/db\/local\.db$/);
});

test("untrusted project configuration is skipped", () => {
	const layout = tempLayout();
	const projectConfigDir = path.join(layout.root, "project", ".pi");
	fs.mkdirSync(projectConfigDir, { recursive: true });
	fs.writeFileSync(path.join(projectConfigDir, "drizzle.json"), JSON.stringify({ connections: { local: { url: "db.sqlite" } } }));
	const config = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: false,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: {},
	});
	assert.equal(config.connections.size, 0);
	assert.match(config.notices.join("\n"), /Skipped untrusted project config/);
});

test("explicit Drizzle environment URL infers dialect and allows writes by default", () => {
	const layout = tempLayout();
	const config = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: { DRIZZLE_DATABASE_URL: "mysql://user:secret@example.invalid/app" },
	});
	const profile = config.connections.get("env");
	assert.equal(config.defaultConnection, "env");
	assert.equal(profile?.dialect, "mysql");
	assert.equal(profile?.allowWrites, true);
	assert.equal(profile?.confirmWrites, true);
	assert.equal(profile?.source, "env:DRIZZLE_DATABASE_URL");
	assert.equal(profile?.timeoutMs, 30_000);
});

test("generic DATABASE_URL does not opt the extension into database access", () => {
	const layout = tempLayout();
	const config = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: { DATABASE_URL: "postgresql://production.invalid/app" },
	});
	assert.equal(config.connections.size, 0);
});

test("file profiles allow writes by default and honor an explicit opt-out", () => {
	const layout = tempLayout();
	fs.writeFileSync(
		path.join(layout.agentDir, "drizzle.json"),
		JSON.stringify({
			connections: {
				app: { dialect: "postgresql", urlEnv: "APP_DATABASE_URL" },
				readonly: { dialect: "postgresql", urlEnv: "READONLY_DATABASE_URL", allowWrites: false },
			},
		}),
	);
	const config = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: {
			APP_DATABASE_URL: "postgresql://example.invalid/app",
			READONLY_DATABASE_URL: "postgresql://example.invalid/readonly",
		},
	});
	assert.equal(config.connections.get("app")?.allowWrites, true);
	assert.equal(config.connections.get("readonly")?.allowWrites, false);
});

test("legacy environment profile honors an explicit write opt-out", () => {
	const layout = tempLayout();
	const config = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: {
			DRIZZLE_DATABASE_URL: "mysql://user:secret@example.invalid/app",
			DRIZZLE_ALLOW_WRITES: "false",
		},
	});
	assert.equal(config.connections.get("env")?.allowWrites, false);
});

test("relative SQLite file URLs preserve query parameters", () => {
	const layout = tempLayout();
	fs.writeFileSync(
		path.join(layout.agentDir, "drizzle.json"),
		JSON.stringify({ connections: { local: { dialect: "sqlite", url: "file:db.sqlite?mode=ro&cache=shared" } } }),
	);
	const config = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: {},
	});
	assert.match(config.connections.get("local")?.url ?? "", /db\.sqlite\?mode=ro&cache=shared$/);
});

test("missing configured environment variables make a profile unavailable", () => {
	const layout = tempLayout();
	fs.writeFileSync(
		path.join(layout.agentDir, "drizzle.json"),
		JSON.stringify({ connections: { app: { dialect: "postgresql", urlEnv: "APP_DATABASE_URL" } } }),
	);
	const config = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: {},
	});
	const profile = config.connections.get("app");
	assert.equal(profile?.available, false);
	assert.match(profile?.reason ?? "", /APP_DATABASE_URL/);
});

test("DATABASES is the primary source and its first valid entry is the default", () => {
	const layout = tempLayout();
	const config = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: {
			DATABASES: JSON.stringify([
				{ name: "warehouse db", type: "sqlserver", url: "sqlserver://reader:secret@warehouse.invalid:1433?database=analytics&encrypt=true" },
				{ name: "app", type: "mysql", url: "mysql://reader:secret@app.invalid/main" },
			]),
		},
	});
	const warehouse = config.connections.get("warehouse db");
	assert.equal(config.defaultConnection, "warehouse db");
	assert.equal(warehouse?.dialect, "sqlserver");
	assert.equal(warehouse?.source, "env:DATABASES[0]");
	assert.equal(warehouse?.allowWrites, true);
	assert.equal(warehouse?.confirmWrites, true);
	assert.equal(warehouse?.maxRows, 100);
	assert.equal(warehouse?.timeoutMs, 30_000);
	assert.equal(config.connections.get("app")?.dialect, "mysql");
});

test("DATABASES profiles override files and legacy environment policy with fixed defaults", () => {
	const layout = tempLayout();
	fs.writeFileSync(
		path.join(layout.agentDir, "drizzle.json"),
		JSON.stringify({
			default: "app",
			connections: {
				app: { dialect: "sqlite", url: "file:unsafe.db", allowWrites: false, confirmWrites: false, maxRows: 999, timeoutMs: 1_000 },
			},
		}),
	);
	const config = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: {
			DATABASES: JSON.stringify([{ name: "app", type: "postgresql", url: "postgresql://reader:secret@app.invalid/main" }]),
			DRIZZLE_ALLOW_WRITES: "false",
			DRIZZLE_CONFIRM_WRITES: "false",
			DRIZZLE_MAX_ROWS: "1000",
			DRIZZLE_TIMEOUT_MS: "300000",
		},
	});
	const app = config.connections.get("app");
	assert.equal(app?.dialect, "postgresql");
	assert.equal(app?.source, "env:DATABASES[0]");
	assert.equal(app?.allowWrites, true);
	assert.equal(app?.confirmWrites, true);
	assert.equal(app?.maxRows, 100);
	assert.equal(app?.timeoutMs, 30_000);
});

test("invalid DATABASES input is ignored without exposing its contents", () => {
	const layout = tempLayout();
	const marker = "do-not-leak-this-credential";
	const malformed = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: { DATABASES: `[{"name":"app","url":"${marker}"` },
	});
	assert.equal(malformed.connections.size, 0);
	assert.match(malformed.notices.join("\n"), /invalid JSON/);
	assert.doesNotMatch(malformed.notices.join("\n"), new RegExp(marker));

	const invalidEntry = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: {
			DATABASES: JSON.stringify([{ name: "app", type: "sqlserver", url: `sqlserver://reader:${marker}@db.invalid`, allowWrites: true }]),
		},
	});
	assert.equal(invalidEntry.connections.size, 0);
	assert.match(invalidEntry.notices.join("\n"), /only name, type, and url/);
	assert.doesNotMatch(invalidEntry.notices.join("\n"), new RegExp(marker));
});

test("duplicate DATABASES names keep the first valid entry", () => {
	const layout = tempLayout();
	const config = loadDrizzleConfig({
		cwd: layout.project,
		projectTrusted: true,
		agentDir: layout.agentDir,
		configDirName: ".pi",
		env: {
			DATABASES: JSON.stringify([
				{ name: "app", type: "mysql", url: "mysql://reader:first@app.invalid/main" },
				{ name: "app", type: "postgresql", url: "postgresql://reader:second@app.invalid/main" },
			]),
		},
	});
	assert.equal(config.connections.get("app")?.dialect, "mysql");
	assert.match(config.connections.get("app")?.url ?? "", /first/);
	assert.match(config.notices.join("\n"), /same name/);
});
