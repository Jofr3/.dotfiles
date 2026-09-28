import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
const M = MUTANTS as unknown as Array<Record<string, unknown>>;
const declared = M.filter((m) => m.survives !== undefined);
// D466: needle the corpus for the STRUCTURE names this slice EXTENDED, not the lines edited.
const NEEDLES = [
  "CONDITIONAL_DAMAGE_CLAUSES", "boardConditionForClause", "BoardCondition",
  "yourEnergyInPlayAtLeast", "CONDITIONAL_DAMAGE_BONUS", "DAMAGE_SUPPRESSION",
  "deriveAttackDamageSuppression", "deriveAttackDamageBonus", "conditionNote",
  "countEnergyInPlay", "clause table", "clause row",
];
let any = false;
for (const d of declared) {
  const reason = JSON.stringify(d.survives);
  const hits = NEEDLES.filter((n) => reason.includes(n));
  if (hits.length) { any = true; console.log(d.id, "→ reason mentions:", hits.join(", ")); }
}
if (!any) console.log("NO declared survivor's REASON quantifies over any structure this slice extended.");
console.log("\nchecked", declared.length, "reasons against", NEEDLES.length, "needles");
