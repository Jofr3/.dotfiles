import fs from "node:fs";
const REQUIRED = new RegExp(
  "^This attack does (\\d+) damage to each Pokémon that has any damage counters on it" +
    " \\(both yours and your opponent['’]s\\), except for this Pokémon\\." +
    " \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\)$",
);
const lines = fs.readFileSync(process.argv[2], "utf8").split("\n");
const rows = [];
for (const l of lines) { const m = /^(\d+) (.*)$/.exec(l); if (m) rows.push({n:+m[1], s:m[2]}); }
const hits = rows.filter(r => REQUIRED.test(r.s));
console.log("clarifier-REQUIRED anchor:", hits.length, "sentence(s),", hits.reduce((a,r)=>a+r.n,0), "printing(s)");
for (const r of hits) console.log("   ", r.n, r.s);
// Would a clarifier-less variant exist anywhere in the corpus?
const NOCLAR = /^This attack does (\d+) damage to each Pokémon that has any damage counters on it \(both yours and your opponent['’]s\), except for this Pokémon\.$/;
console.log("clarifier-LESS variants present in corpus:", rows.filter(r=>NOCLAR.test(r.s)).length);
