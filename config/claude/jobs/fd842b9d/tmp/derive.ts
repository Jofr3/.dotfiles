import { deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const P = "This attack also does 10 damage to each of your opponent's Benched Pokémon for each Prize card your opponent has taken. (Don't apply Weakness and Resistance for Benched Pokémon.)";
console.log(JSON.stringify(deriveAttackEffect(P)));
for (const s of [
  "This attack also does 10 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack does 50 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack also does 10 damage to each of your Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack does 30 damage to 1 of your opponent's Benched Pokémon for each Prize card your opponent has taken. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack also does 10 damage to each of your Benched Pokémon for each Prize card your opponent has taken. (Don't apply Weakness and Resistance for Benched Pokémon.)",
]) console.log(JSON.stringify(deriveAttackEffect(s)), "|", s.slice(0, 70));
