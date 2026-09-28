import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const S = [
  "If your opponent's Active Pokémon is a {N} Pokémon, it is now Paralyzed.",
  "If your opponent's Active Pokémon is a Dragon Pokémon, it is now Paralyzed.",
  "If your opponent's Active Pokémon is a {P} Pokémon, it is now Burned.",
  "If your opponent's Active Pokémon is a Stage 1 Pokémon, it is now Paralyzed.",
  // one-axis near misses that must stay LOUD
  "If your opponent's Active Pokémon is a Tera Pokémon, it is now Paralyzed.",
  "If your opponent's Active Pokémon is a Basic Pokémon, it is now Paralyzed.",
  "If you have any {M} Pokémon on your Bench, it is now Paralyzed.",
  "If your opponent's Active Pokémon is a {N} Pokémon, it is now Knocked Out.",
  "If your opponent's Active Pokémon is a {N} Pokémon, it is Paralyzed.",
  "if your opponent's Active Pokémon is a {N} Pokémon, it is now Paralyzed.",
  "This attack does 30 damage. If your opponent's Active Pokémon is a {N} Pokémon, it is now Paralyzed.",
  // typographic apostrophe
  "If your opponent’s Active Pokémon is a {N} Pokémon, it is now Paralyzed.",
];
for (const s of S) {
  console.log(JSON.stringify(E.deriveAttackEffect(s)), "  <=  ", JSON.stringify(s));
}
console.log("\n--- trailing split of the compound ---");
const comp = "If your opponent's Active Pokémon is a {N} Pokémon, it is now Paralyzed. Draw a card.";
console.log("split:", JSON.stringify(E.splitAttackTrailingClause(comp)));
console.log("whole:", JSON.stringify(E.deriveAttackEffect(comp)));
