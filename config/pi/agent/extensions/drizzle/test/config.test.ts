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

test("explicit Drizzle environment URL infers dialect and keeps writes disabled", () => {
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
	assert.equal(profile?.allowWrites, false);
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
