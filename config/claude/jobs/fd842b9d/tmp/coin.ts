import { resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackTrailingClause, deriveAttackCoinFlip, deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const rows = [
"Flip 2 coins. This attack does 90 damage for each heads. If both of them are tails,  your opponent's Active Pokémon is now Confused.",
"Flip 2 coins. This attack does 90 damage for each heads. If either of them is heads, your opponent's Active Pokémon is now Paralyzed.",
"Flip 4 coins. This attack does 60 damage for each heads. If at least 2 of them are heads, your opponent's Active Pokémon is now Paralyzed.",
"Flip a coin for each Energy attached to both Active Pokémon. This attack does 60 damage for each heads.",
"Flip a coin for each {D} Pokémon you have in play. This attack does 60 damage for each heads.",
"This attack does 50 damage for each of your Drifloon and Drifblim in play. This attack also does 30 damage to each of your Drifloon and Drifblim. (Don't apply Weakness and Resistance for Benched Pokémon.)",
"This attack does 30 damage for each {W} Energy attached to this Pokémon. Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.",
"This attack does 10 damage for each damage counter on all of your Benched Cynthia's Pokémon. This attack's damage isn't affected by Weakness.",
"Reveal the top 5 cards of your deck. This attack does 70 damage for each Future card you find there. Then, discard those Future cards and shuffle the other cards back into your deck.",
];
for (const t of rows) {
  const s = splitAttackTrailingClause(t);
  console.log("\n" + t.slice(0,70)+"…");
  if (s === null) { console.log("   trailing split: NULL"); continue; }
  const {head, tail} = s as any;
  console.log(`   head="${head}" resolves=${resolvedByAnyReader(head)}`);
  console.log(`   tail="${tail}" resolves=${resolvedByAnyReader(tail)}`);
}
