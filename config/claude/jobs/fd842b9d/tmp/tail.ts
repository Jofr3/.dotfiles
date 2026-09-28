import { splitAttackTrailingClause, deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const c = "Discard all Energy from this Pokémon. Your opponent's Active Pokémon is now Paralyzed.";
console.log(JSON.stringify(splitAttackTrailingClause(c)));
console.log(JSON.stringify(deriveAttackEffect("Your opponent's Active Pokémon is now Paralyzed.")));
