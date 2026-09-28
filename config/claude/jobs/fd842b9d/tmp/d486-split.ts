import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const WHOLE =
  "Your opponent discards a card from their hand. If this Pokémon evolved from Salandit during this turn, your opponent discards 2 more cards.";
for (const n of ["splitAttackCancelClause","splitAttackGateClause","splitAttackRequirementClause","splitAttackTrailingClause"]) {
  const fn = (effects as any)[n];
  console.log(n, JSON.stringify(fn(WHOLE)));
}
