import assert from "node:assert/strict";
import test from "node:test";
import { formatTabRef, normalizeTabSearch, rankTabCandidates } from "../src/tabs.ts";

test("tab refs are opaque and generation scoped", () => {
	assert.equal(formatTabRef("0123456789abcdef", 3, 9), "tab_0123456789abcdef_3_9");
	assert.notEqual(
		formatTabRef("0123456789abcdef", 3, 9),
		formatTabRef("0123456789abcdef", 4, 9),
	);
});

test("search normalization is case, compatibility, and whitespace insensitive", () => {
	assert.equal(normalizeTabSearch("  Ｇｏｏｇｌｅ\n Docs  "), "google docs");
});

test("search ranking is deterministic and does not select", () => {
	const tabs = [
		{ ref: "tab_0123456789abcdef_1_4", ordinal: 4, title: "Docs archive", url: "https://docs.example/" },
		{ ref: "tab_0123456789abcdef_1_2", ordinal: 2, title: "Docs", url: "https://example.test/" },
		{ ref: "tab_0123456789abcdef_1_3", ordinal: 3, title: "Other", url: "https://docs.example/" },
	];
	const ranked = rankTabCandidates(tabs, "docs");
	assert.deepEqual(
		ranked.map(({ tab, rank }) => [tab.ordinal, rank]),
		[
			[2, 1],
			[4, 3],
			[3, 6],
		],
	);
	assert.deepEqual(tabs.map((tab) => tab.ordinal), [4, 2, 3]);
});

test("empty listing uses stable ordinal order", () => {
	const ranked = rankTabCandidates([
		{ ref: "tab_0123456789abcdef_1_8", ordinal: 8 },
		{ ref: "tab_0123456789abcdef_1_1", ordinal: 1 },
	]);
	assert.deepEqual(ranked.map(({ tab }) => tab.ordinal), [1, 8]);
});
