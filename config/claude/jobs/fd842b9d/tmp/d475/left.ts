import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { deriveAttackCoinFlip, deriveAttackEffect, splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const corpus = legalAttackCorpus();
const line = (n: number) => corpus[n - 53];
for (const n of [103, 217]) {
  const row = line(n);
  console.log(`\nfile line ${n}: ${row?.[0]}p  ${JSON.stringify(row?.[1])}`);
  console.log("  resolvedByAnyReader:", resolvedByAnyReader(row?.[1] ?? ""));
  console.log("  gate split:", splitAttackGateClause(row?.[1] ?? "") !== null, " trailing:", splitAttackTrailingClause(row?.[1] ?? "") !== null);
}
// the remaining COIN residue
console.log("\n--- unbuilt corpus rows mentioning a coin ---");
for (const [n, s] of corpus) {
  if (!/[Ff]lip|heads|tails/.test(s)) continue;
  if (resolvedByAnyReader(s)) continue;
  if (splitAttackGateClause(s) !== null || splitAttackTrailingClause(s) !== null) continue;
  console.log(`  ${n}p  fileLine=${corpus.findIndex(([, t]) => t === s) + 53}  ${s}`);
}
