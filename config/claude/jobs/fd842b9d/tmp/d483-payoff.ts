import { deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const T = "You may shuffle 3 Energy attached to this Pokémon into your deck. If you do, this attack also does 120 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";
console.log("effect:", JSON.stringify(deriveAttackEffect(T)));
import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
for (const n of Object.keys(e).filter((k) => k.startsWith("deriveAttack"))) {
  const r = (e as any)[n](T);
  if (r !== null) console.log(n, JSON.stringify(r));
}
