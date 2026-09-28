import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { deriveAttackEffect, deriveAttackDamageBonus, deriveAttackCoinFlip, splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const rows = legalAttackCorpus().map(([printings, text]) => ({ printings, text }));
console.log("corpus rows:", rows.length, "printings:", rows.reduce((a, r) => a + r.printings, 0));

const TARGET = "Flip a coin for each {D} Pokémon you have in play. This attack does 60 damage for each heads.";
const hit = rows.filter((r) => r.text === TARGET);
console.log("TARGET rows:", hit.length, "printings:", hit.map((r) => r.printings));

// unbuilt?
console.log("coinFlip:", JSON.stringify(deriveAttackCoinFlip(TARGET)));
console.log("effect:", JSON.stringify(deriveAttackEffect(TARGET)));
console.log("damage:", JSON.stringify(deriveAttackDamageBonus(TARGET)));
console.log("gateSplit:", JSON.stringify(splitAttackGateClause(TARGET)));
console.log("trailSplit:", JSON.stringify(splitAttackTrailingClause(TARGET)));

const pats: Record<string, RegExp> = {
  EXACT: /^Flip a coin for each (.+) you have in play\. This attack does (\d+) damage for each heads\.$/,
  WIDE_ANY_SEAT: /^Flip a coin for each (.+) in play\. This attack does (\d+) damage for each heads\.$/,
  WIDE_HAVE: /^Flip a coin for each (.+) you have in play\. (.+)$/,
  WIDE_MORE: /^Flip a coin for each (.+) you have in play\. This attack does (\d+) (?:more )?damage for each heads\.$/,
  SHIPPED_PER_ENERGY: /^Flip a coin for each (?:(.+) )?Energy attached to this Pokémon\. This attack does (\d+) damage for each heads\.$/,
  WIDE_NO_LEAD_ANCHOR: /Flip a coin for each (.+) you have in play\. This attack does (\d+) damage for each heads\.$/,
  WIDE_NO_TAIL_ANCHOR: /^Flip a coin for each (.+) you have in play\. This attack does (\d+) damage for each heads\./,
};
for (const [name, re] of Object.entries(pats)) {
  const m = rows.filter((r) => re.test(r.text));
  console.log(`${name}: ${m.length} sentence(s) / ${m.reduce((a, r) => a + r.printings, 0)} printing(s)`);
  for (const r of m) console.log(`    [${r.printings}p] ${r.text}`);
}

// every corpus row mentioning "Flip a coin for each"
console.log("--- /Flip a coin for each/ over corpus ---");
for (const r of rows.filter((r) => /Flip a coin for each/.test(r.text))) {
  console.log(`  [${r.printings}p] built=${deriveAttackCoinFlip(r.text) !== null} ${r.text}`);
}
// loosest: any row with "you have in play"
console.log("--- /you have in play/ ---");
for (const r of rows.filter((r) => /you have in play/.test(r.text))) console.log(`  [${r.printings}p] ${r.text}`);
console.log("--- /in play/ + /for each/ ---");
for (const r of rows.filter((r) => /in play/.test(r.text) && /for each/i.test(r.text))) console.log(`  [${r.printings}p] built=${deriveAttackEffect(r.text)!==null||deriveAttackDamageBonus(r.text)!==null||deriveAttackCoinFlip(r.text)!==null} ${r.text}`);
