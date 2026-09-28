import { readFileSync } from "node:fs";
const B = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const eff = await import(B + "effects");
const cen = await import(B + "censusAttackCorpus");
const src = readFileSync(B + "censusAttackCorpus.ts", "utf8");
const rows: Array<{ n: number; p: number; t: string }> = [];
src.split("\n").forEach((l, i) => { const m = /^(\d+) (.+)$/.exec(l); if (m) rows.push({ n: i + 1, p: Number(m[1]), t: m[2] }); });
const loud = (t: string) =>
  !cen.resolvedByAnyReader(t) && eff.splitAttackGateClause(t) === null && eff.splitAttackTrailingClause(t) === null;
console.log("=== still-LOUD residue rows mentioning 'is now' or 'Flip a coin' ===");
for (const r of rows) {
  if (!loud(r.t)) continue;
  if (!/is now|Flip a coin|If tails/.test(r.t)) continue;
  console.log(`  ${r.n}  ${r.p}p  ${r.t}`);
}
console.log("\n=== probes on line 268's pieces ===");
const L268 = "Flip a coin. If tails, this attack does nothing. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.";
console.log("whole resolvedByAnyReader:", cen.resolvedByAnyReader(L268));
console.log("coinFlip of 'Flip a coin. If tails, this attack does nothing.':", JSON.stringify(eff.deriveAttackCoinFlip("Flip a coin. If tails, this attack does nothing.")));
console.log("head-only resolvedByAnyReader:", cen.resolvedByAnyReader("Flip a coin. If tails, this attack does nothing."));
