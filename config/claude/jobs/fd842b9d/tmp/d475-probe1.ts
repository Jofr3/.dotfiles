import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause, deriveAttackCoinFlip } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const corpus = legalAttackCorpus();
const TARGET = "Flip a coin for each Energy attached to both Active Pokémon. This attack does 60 damage for each heads.";
const hit = corpus.filter(([, s]) => s === TARGET);
console.log("TARGET rows:", hit.length, "printings:", hit.map(([n]) => n));
// file line
const idx = corpus.findIndex(([, s]) => s === TARGET);
console.log("arrayIndex(0-based):", idx, "-> fileLine =", idx + 1 + 53, " (1-based idx + 53)");
console.log("resolvedByAnyReader:", resolvedByAnyReader(TARGET));
console.log("gate split:", splitAttackGateClause(TARGET));
console.log("trailing split:", splitAttackTrailingClause(TARGET));
console.log("coinFlip:", deriveAttackCoinFlip(TARGET));

// ---- widening measurement over all 640 rows
const pats: Record<string, RegExp> = {
  "EXACT (what I will ship)": /^Flip a coin for each Energy attached to both Active Pokémon\. This attack does (\d+) damage for each heads\.$/,
  "W1 optional type filter": /^Flip a coin for each (?:(.+) )?Energy attached to both Active Pokémon\. This attack does (\d+) damage for each heads\.$/,
  "W2 open consequent": /^Flip a coin for each Energy attached to both Active Pokémon\. (.+)$/,
  "W3 admit `more`": /^Flip a coin for each Energy attached to both Active Pokémon\. This attack does (\d+) more damage for each heads\.$/,
  "W4 drop ^": /Flip a coin for each Energy attached to both Active Pokémon\. This attack does (\d+) damage for each heads\.$/,
  "W5 drop \\.$": /^Flip a coin for each Energy attached to both Active Pokémon\. This attack does (\d+) damage for each heads\./,
  "W6 open the noun": /^Flip a coin for each Energy attached to ([^.]+)\. This attack does (\d+) damage for each heads\.$/,
  "W7 optional `both `": /^Flip a coin for each Energy attached to (?:both )?Active Pokémon\. This attack does (\d+) damage for each heads\.$/,
  "W8 the whole family head": /^Flip a coin for each ([^.]+)\. This attack does (\d+) damage for each heads\.$/,
};
for (const [name, re] of Object.entries(pats)) {
  const rows = corpus.filter(([, s]) => re.test(s));
  console.log(`${name}: ${rows.length} sentence(s) / ${rows.reduce((a, [n]) => a + n, 0)} printing(s)`);
  for (const [n, s] of rows) console.log(`    ${n}p  ${s}`);
}
// the whole "Flip a coin for each" family
console.log("--- whole /^Flip a coin for each/ family ---");
for (const [n, s] of corpus.filter(([, s]) => /^Flip a coin for each/.test(s))) {
  console.log(`  ${n}p  resolved=${resolvedByAnyReader(s)}  ${s}`);
}
console.log("--- every corpus row mentioning 'both Active' ---");
for (const [n, s] of corpus.filter(([, s]) => s.includes("both Active"))) {
  console.log(`  ${n}p  resolved=${resolvedByAnyReader(s)}  ${s}`);
}
