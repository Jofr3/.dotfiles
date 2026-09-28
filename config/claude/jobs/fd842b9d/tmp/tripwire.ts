import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const { MUTANTS } = await import(`${ROOT}/scripts/mutation/mutants.ts`);
console.log("corpus rows (from the MODULE):", MUTANTS.length);
const declared = MUTANTS.filter((m: any) => m.survives !== undefined);
console.log("declared survivors:", declared.length);
// decision-count, includes-semantics (D448)
const inc = (d: string) => MUTANTS.filter((m: any) => m.decision.includes(d)).length;
console.log("rows with decision.includes('D503'):", inc("D503"));

// ---------- NEEDLES ----------
const NEEDLES = [
  "AttackPreDamage", "applyAttackPreDamage", "AttackPreDamageResult", "deriveAttackPreDamage",
  "preDamage", "stripPreDamage", "Before doing damage",
  "attachFromHand", "attachFromHandOffer", "attachFromHandNote", "attachEnergyTargets",
  "scaledAttackDamage", "scaledBase", "scaledTotal", "energyOnSelf",
  "deriveAttackDamageMultiplier", "SELF_ENERGY_MULTIPLY", "splitAttackTrailingClause",
  "basicEnergy", "cancelled", "attackerBody",
  // 🆕 CENSUS CONSTANTS — D502's rule: these rot on every census step.
  "BUILT.attack", "attack: 1617", "attack: 1618", "unbuiltAttack", "RAW_UNBUILT_ATTACK_UNITS",
  "residueSentences", "rawUnbuiltSentences", "COMPOUND_ATTACK_UNITS", "SPLIT_ATTACK_UNITS",
  "MATCH_RECORD_VERSION", "engineVersion", "0.394.0",
];
console.log("\n=== NAME/NEEDLE AUDIT (id, what, find, replace, file) ===");
let total = 0;
for (const n of NEEDLES) {
  const hits = MUTANTS.filter((m: any) =>
    [m.id, m.what, m.find, m.replace, m.file, m.decision].some((f: any) => typeof f === "string" && f.includes(n)));
  if (hits.length > 0) {
    total += hits.length;
    console.log(`\n  NEEDLE ${JSON.stringify(n)} -> ${hits.length} row(s)`);
    for (const h of hits.slice(0, 12)) console.log(`     ${h.id}  [${h.file}]  ${String(h.what).slice(0, 110)}`);
    if (hits.length > 12) console.log(`     … ${hits.length - 12} more`);
  } else {
    console.log(`  NEEDLE ${JSON.stringify(n)} -> 0 rows`);
  }
}
console.log(`\ntotal needle hits (with multiplicity): ${total}`);
