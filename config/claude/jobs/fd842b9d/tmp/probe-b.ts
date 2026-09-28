import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const H = "Your opponent's Active Pokémon is now Confused.";
console.log("B head claimed:", e.deriveAttackEffect(H) !== null);
console.log("B splitter with a built tail:", JSON.stringify(e.splitAttackTrailingClause(`${H} Draw 3 cards.`)));
