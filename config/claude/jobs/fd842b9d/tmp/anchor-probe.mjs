import fs from "node:fs";

// Candidate anchor for :601 — deliberately NOT a widening of SPREAD_EACH_BOTH_BENCH.
const SPREAD_EACH_DAMAGED_BOTH_BOARDS = new RegExp(
  "^This attack does (\\d+) damage to each Pokémon that has any damage counters on it" +
    " \\(both yours and your opponent['’]s\\), except for this Pokémon\\." +
    "(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$",
);

// The shipped neighbour it must NOT steal from, transcribed from effects.ts:13492.
const SPREAD_EACH_BOTH_BENCH = new RegExp(
  "^This attack (?:also )?does (\\d+) damage to each Benched Pokémon" +
    "( that has any damage counters on it)?" +
    " \\(both yours and your opponent['’]s\\)\\." +
    "(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$",
);

const lines = fs.readFileSync(process.argv[2], "utf8").split("\n");
const sentences = [];
for (const line of lines) {
  const m = /^(\d+) (.*)$/.exec(line);
  if (m !== null) sentences.push({ n: Number(m[1]), s: m[2] });
}
console.log("corpus sentences parsed:", sentences.length);

const hitsNew = sentences.filter((r) => SPREAD_EACH_DAMAGED_BOTH_BOARDS.test(r.s));
const hitsOld = sentences.filter((r) => SPREAD_EACH_BOTH_BENCH.test(r.s));
console.log("\n=== candidate anchor matches:", hitsNew.length, "sentence(s),",
  hitsNew.reduce((a, r) => a + r.n, 0), "printing(s)");
for (const r of hitsNew) console.log("   ", r.n, r.s);
console.log("\n=== SPREAD_EACH_BOTH_BENCH still matches:", hitsOld.length, "sentence(s),",
  hitsOld.reduce((a, r) => a + r.n, 0), "printing(s)");
for (const r of hitsOld) console.log("   ", r.n, r.s);

const overlap = hitsNew.filter((r) => hitsOld.some((o) => o.s === r.s));
console.log("\n=== OVERLAP between the two anchors:", overlap.length, "(must be 0)");
