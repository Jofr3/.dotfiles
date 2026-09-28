import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const rows = [
  "This attack also does 10 damage to each Benched Pokémon (both yours and your opponent's). (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack also does 40 damage to each Benched Pokémon that has any damage counters on it (both yours and your opponent's). (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack does 50 damage to each Pokémon that has any damage counters on it (both yours and your opponent's), except for this Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
];
for (const r of rows) {
  console.log("ROW:", r.slice(0, 60));
  console.log("  gate:", JSON.stringify(effects.splitAttackGateClause(r)));
  console.log("  trailing:", JSON.stringify(effects.splitAttackTrailingClause(r)));
}
