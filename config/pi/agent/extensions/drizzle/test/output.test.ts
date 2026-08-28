import assert from "node:assert/strict";
import test from "node:test";
import type { ConnectionProfile } from "../src/config.ts";
import type { DatabaseExecution } from "../src/manager.ts";
import { formatExecution, publicConnectionDetails } from "../src/output.ts";

const profile: ConnectionProfile = {
	name: "app",
	dialect: "postgresql",
	available: true,
	source: "env:APP_DATABASE_URL",
	url: "postgresql://user:secret@db.example.test:5432/app?sslmode=require",
	allowWrites: false,
	confirmWrites: true,
	maxRows: 1,
	timeoutMs: 30_000,
};

test("public connection metadata redacts credentials and query parameters", () => {
	const details = publicConnectionDetails(profile);
	assert.equal(details.target, "postgresql://db.example.test:5432/app");
	assert.doesNotMatch(JSON.stringify(details), /user|secret|sslmode/);
	assert.match(details.fingerprint ?? "", /^[a-f0-9]{12}$/);
});

test("execution formatting bounds rows, keys, cells, and control characters", () => {
	const hugeKey = `column-${"x".repeat(1_000)}`;
	const execution: DatabaseExecution = {
		dialect: "postgresql",
		rows: [{ [hugeKey]: "a".repeat(10_000) }, { ignored: true }],
		rowCount: 2,
		columns: ["safe\nINJECTED", "\u001b[31mRED"],
		command: "SELECT\u001b[31m",
		durationMs: 3,
	};
	const result = formatExecution(profile, "select", execution, 1);
	assert.equal(result.details.rowsDisplayed, 1);
	assert.equal(result.details.rowsTruncated, true);
	assert.ok((result.details.cellsTruncated ?? 0) >= 2);
	assert.doesNotMatch(result.text, /\u001b/);
	assert.match(result.text, /"safe INJECTED"/);
	assert.match(result.text, /Result rows were truncated/);
});
