import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const needles = [
  "Discard up to 3 Energy cards from your hand",
  "payFromHand", "handCostCandidates", "handCostUnmet", "handCostPhrase", "handCostAction",
  "payFromHandNote", "payFromHandApply", "snipeAmount", "perEnergyOnSelf", "perTakenPrize",
  "SELF_DISCARD_THEN_ANY_TARGET", "CHOSEN_ANY_TARGET", "ENERGY_DISCARD_SCALED_DAMAGE",
  "damageChosen", "handCostIsSlotGated", "carriesHandCost", "recordSlotOf", "withConsequence",
  "scoredSlot", "recordMoved", "HAND_COST_PAID", "cardIdentity", "interchangeableCandidates",
];
console.log("corpus rows:", MUTANTS.length);
for (const n of needles) {
  const hits = MUTANTS.filter((m: any) => JSON.stringify(m).includes(n));
  console.log(`\n### ${n}: ${hits.length}`);
  for (const h of hits) console.log(`   ${h.id}  [${h.decision}]  file=${h.file}  killers=${(h.expectKilledBy ?? []).join("|")}  survives=${h.survives ? JSON.stringify(h.survives.kind) : "-"}`);
}
