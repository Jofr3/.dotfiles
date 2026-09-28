import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
const R = attackReaderSurface();
const cl = (t: string) => R.filter((n) => (effects as any)[n](t) !== null);
const rows = [81,392,539,600,616,620,626,627,669];
const corpus = legalAttackCorpus();
const byText = new Map(corpus.map(([u,t]) => [t,u]));
const texts = [
"Choose 1 of your opponent's Pokémon 6 times. (You can choose the same Pokémon more than once.) For each time you chose a Pokémon, do 20 damage to it. This damage isn't affected by Weakness or Resistance.",
"If your opponent's Active Pokémon isn't a Pokémon ex, this attack does nothing. This attack's damage isn't affected by Weakness or Resistance.",
"This attack does 100 damage to each of your opponent's Pokémon ex and Pokémon V. This attack's damage isn't affected by Weakness or Resistance.",
"This attack does 50 damage to 2 of your opponent's Pokémon. This attack's damage isn't affected by Weakness or Resistance, or by any effects on those Pokémon.",
"This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness or Resistance.",
"This attack does 70 damage to 1 of your opponent's Pokémon. This attack's damage isn't affected by Weakness or Resistance.",
"This attack's damage isn't affected by Weakness or Resistance, or by any effects on your opponent's Active Pokémon.",
"This attack's damage isn't affected by Weakness or Resistance.",
"Your opponent flips a coin for each of their Benched Pokémon. This attack does 80 damage to your opponent's Active Pokémon for each tails. This attack's damage isn't affected by Weakness or Resistance.",
];
for (let i=0;i<texts.length;i++){
  const t = texts[i]!;
  console.log(`line ${rows[i]} builds=${builds(t)} claimers=[${cl(t).join(",")}] trail=${JSON.stringify((effects as any).splitAttackTrailingClause(t))}`);
}
console.log("\n=== what the trailing splitter does with row1/row2 pieces ===");
const head1 = "This attack does 60 damage to each of your opponent's Pokémon ex.";
console.log("head1 claimers:", cl(head1));
const tail = "This attack's damage isn't affected by Weakness or Resistance.";
console.log("tail claimers:", cl(tail));
