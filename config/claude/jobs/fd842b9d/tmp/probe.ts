import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const S = "This attack does 50 damage for each of your Pokémon that has any damage counters on it.";
const names = [
  "deriveAttackRequirement","deriveAttackCancelRequirement","deriveAttackCoinFlip",
  "deriveAttackEffect","deriveAttackDamageBonus","deriveAttackDamagePenalty",
  "deriveAttackDamageMultiplier","deriveAttackDamageSuppression","deriveAttackOptionalBoost",
  "deriveAttackBonusConsequent","deriveAttackOptionalCostBoost","deriveAttackDiscardScaledBoost",
  "deriveAttackPreDamage",
];
for (const n of names) {
  const f = (E as any)[n];
  console.log(n.padEnd(34), JSON.stringify(f(S)));
}
const splitters = ["splitAttackRequirementClause","splitAttackCancelClause","splitAttackGateClause","splitAttackTrailingClause"];
for (const n of splitters) {
  const f = (E as any)[n];
  console.log(n.padEnd(34), JSON.stringify(f(S)));
}
