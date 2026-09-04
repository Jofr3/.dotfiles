import assert from "node:assert/strict";
import test from "node:test";
import type { ConnectionProfile } from "../src/config.ts";
import { sanitizeDatabaseError, secureMySqlUrl } from "../src/manager.ts";
import { normalizeMySqlUrl } from "../src/mysql.ts";

function decodedCredentials(url: URL): { username: string; password: string } {
	return {
		username: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
	};
}

test("Go-style MySQL TCP DSNs are normalized without splitting password punctuation", () => {
	const normalized = new URL(normalizeMySqlUrl(
		"reader:p@ss?wo%rd#:]@tcp(db.example.test:3307)/app%2Farchive?charset=utf8mb4&parseTime=true",
	));
	assert.equal(normalized.protocol, "mysql:");
	assert.deepEqual(decodedCredentials(normalized), { username: "reader", password: "p@ss?wo%rd#:]" });
	assert.equal(normalized.hostname, "db.example.test");
	assert.equal(normalized.port, "3307");
	assert.equal(normalized.pathname, "/app%2Farchive");
	assert.equal(normalized.searchParams.get("charset"), "utf8mb4");
	assert.equal(normalized.searchParams.get("parseTime"), "true");
});

test("MySQL URL security policy applies to URLs and Go-style DSNs", () => {
	for (const input of [
		"mysql://reader:secret@db.example.test/app?multipleStatements=true&connectTimeout=99999&connectionLimit=99&flags=MULTI_STATEMENTS,FOUND_ROWS",
		"reader:secret@tcp(db.example.test:3306)/app?multipleStatements=true&connectTimeout=99999&connectionLimit=99&flags=MULTI_STATEMENTS,FOUND_ROWS",
	]) {
		const secured = new URL(secureMySqlUrl(input, 45_000));
		assert.equal(secured.hostname, "db.example.test");
		assert.equal(secured.pathname, "/app");
		assert.equal(secured.searchParams.has("multipleStatements"), false);
		assert.equal(secured.searchParams.get("connectTimeout"), "10000");
		assert.equal(secured.searchParams.get("connectionLimit"), "4");
		assert.equal(secured.searchParams.get("flags"), "FOUND_ROWS");
	}
});

test("MySQL URL security policy blocks JSON-encoded and duplicate multi-statement flags", () => {
	for (const suffix of [
		"flags=%22MULTI_STATEMENTS%22",
		"flags=%5B%22FOUND_ROWS%22%2C%22MULTI_STATEMENTS%22%5D",
		"flags=&flags=MULTI_STATEMENTS",
	]) {
		const secured = new URL(secureMySqlUrl(`reader:secret@tcp(db.example.test:3306)/app?${suffix}`, 30_000));
		assert.doesNotMatch(secured.searchParams.get("flags") ?? "", /MULTI_STATEMENTS/i);
	}
});

test("Go-style MySQL TCP DSNs support bracketed IPv6 addresses", () => {
	const normalized = new URL(normalizeMySqlUrl("reader:secret@tcp([2001:db8::1]:3307)/app"));
	assert.equal(normalized.hostname, "[2001:db8::1]");
	assert.equal(normalized.port, "3307");
});

test("malformed or unsupported MySQL connection strings are rejected generically", () => {
	for (const input of [
		"reader:secret@udp(db.example.test:3306)/app",
		"reader:secret@tcp()/app",
		"reader:secret@tcp(db.example.test:bad)/app",
		"reader:secret@tcp(db.example.test:3306/app",
		"reader:secret@tcp(db.example.test:3306)app",
		"postgresql://reader:secret@db.example.test/app",
	]) {
		assert.throws(() => normalizeMySqlUrl(input), /^Error: Invalid MySQL URL or Go-style TCP DSN\.$/);
	}
});

test("MySQL Go-style DSN errors redact individual credentials", () => {
	const profile: ConnectionProfile = {
		name: "app",
		dialect: "mysql",
		available: true,
		source: "env:DATABASES[0]",
		url: "reader-marker:password-marker@tcp(db.example.test:3306)/app",
		allowWrites: false,
		confirmWrites: true,
		maxRows: 100,
		timeoutMs: 30_000,
	};
	const error = sanitizeDatabaseError(
		new Error("Access denied for user reader-marker with password-marker"),
		profile,
		{ readOnly: true },
	);
	assert.doesNotMatch(error.message, /reader-marker|password-marker/);
	assert.match(error.message, /\[redacted\]/);
});
