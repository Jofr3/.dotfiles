import { deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { legalAttackCorpus, resolvedByAnyReader, attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const R3 = "This attack does 60 damage to 1 of your opponent's Benched Pokémon ex or Benched Pokémon V. (Don't apply Weakness and Resistance for Benched Pokémon.)";
const R4 = "Discard all Energy from this Pokémon, and this attack does 210 damage to 1 of your opponent's Benched Pokémon ex. (Don't apply Weakness and Resistance for Benched Pokémon.)";
console.log("R3", JSON.stringify(deriveAttackEffect(R3)));
console.log("R4", JSON.stringify(deriveAttackEffect(R4)));
console.log("readers:", attackReaderSurface().length);
const corpus = legalAttackCorpus();
const now = corpus.filter(([, t]) => resolvedByAnyReader(t));
console.log("resolvedByAnyReader:", now.length, "sentences /", now.reduce((a,[u])=>a+u,0), "printings");
console.log("\n--- refusals that must hold ---");
for (const t of [
  "This attack does 60 damage to 1 of your opponent's Benched Pokémon ex that has any damage counters on it. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack does 60 damage to 1 of your opponent's Benched Pokémon V. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack does 60 damage to 1 of your opponent's Benched Pokémon VMAX. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack does 20 damage to 1 of your opponent's Benched Pokémon for each damage counter on that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack does 60 damage to 2 of your opponent's Benched Pokémon ex. (Don't apply Weakness and Resistance for Benched Pokémon.)",
]) console.log(`  ${deriveAttackEffect(t) === null ? "null  " : "CLAIMS"}  ${t}`);
console.log("\n--- unchanged siblings ---");
for (const t of [
  "This attack also does 30 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack also does 60 damage to 1 of your opponent's Benched Pokémon that has any damage counters on it. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "Discard all Energy from this Pokémon, and this attack also does 90 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "If there are 3 or fewer cards in your deck, this attack also does 120 damage to 2 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
]) console.log(`  ${JSON.stringify(deriveAttackEffect(t))}`);
