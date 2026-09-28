import { deriveAttackEffect, deriveAttackCancelRequirement } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const ETERNATUS_HEAD = "Discard a Stadium in play.";
const OGERPON_HEAD = "Discard a Basic {G} Energy card from your hand.";
for (const [k, h] of [["Eternatus", ETERNATUS_HEAD], ["Ogerpon", OGERPON_HEAD]] as const) {
  console.log(k.padEnd(10), "head claimed by deriveAttackEffect:", deriveAttackEffect(h) !== null);
}
const WHOLE = `${ETERNATUS_HEAD} If you can't, this attack does nothing.`;
console.log("\nEternatus whole -> deriveAttackEffect :", JSON.stringify(deriveAttackEffect(WHOLE)));
console.log("Eternatus whole -> cancelRequirement  :", JSON.stringify(deriveAttackCancelRequirement(WHOLE)));
console.log("Eternatus whole -> resolvedByAnyReader:", resolvedByAnyReader(WHOLE), " <- a table row ALONE makes this true");
