import { FIXTURE_POOL } from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures";
import { deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
for (const id of ["fix-inplaybodies","fix-grass-stage1","fix-grass-basic","fix-benchfiller","fix-stage1","fix-titan","fix-tr-stage1","fix-stage2body"]) {
  const c = FIXTURE_POOL[id];
  console.log(id, c?.hp, c?.stage, c?.types, c?.name);
}
const SPREAD = "This attack also does 40 damage to each Benched Pokémon that has any damage counters on it (both yours and your opponent's). (Don't apply Weakness and Resistance for Benched Pokémon.)";
console.log("SPREAD →", JSON.stringify(deriveAttackEffect(SPREAD)));
const EACHALL = "Put 2 damage counters on each of your opponent's Pokémon that has any damage counters on it.";
console.log("EACHALL →", JSON.stringify(deriveAttackEffect(EACHALL)));
