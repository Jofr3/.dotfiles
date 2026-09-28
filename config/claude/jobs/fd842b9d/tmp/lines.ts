import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const rows: any = legalAttackCorpus();
const want = [
  "If your opponent's Active Pokémon is a {N} Pokémon, it is now Paralyzed.",
  "Discard all Energy from this Pokémon, and this attack does 210 damage to 1 of your opponent's Benched Pokémon ex. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "Flip a coin for each Energy attached to both Active Pokémon. This attack does 60 damage for each heads.",
  "Look at 1 of your opponent's face-down Prize cards.",
  "Shuffle your hand into your deck. Then, draw 6 cards.",
  "You may search your deck for any number of Fennel cards, reveal them, and put them into your hand. Then, shuffle your deck.",
  "This attack does 100 damage for each Special Condition affecting your opponent's Active Pokémon.",
  "If you have any Tera Pokémon on your Bench, this attack does 100 more damage.",
  "If your opponent's Active Pokémon is a Tera Pokémon, this attack does 230 more damage.",
  "Search your deck for up to 3 Basic Energy cards of different types and attach them to your Tera Pokémon in any way you like. Then, shuffle your deck.",
  "This attack does 10 more damage for each Ancient card in your discard pile.",
];
for (const t of want) {
  const i = rows.findIndex((r: any) => r[1] === t);
  console.log(`fileLine ${i < 0 ? "??" : i + 53}   ${i < 0 ? "?" : rows[i][0]}p   ${t.slice(0, 70)}`);
}
