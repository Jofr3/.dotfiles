import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { deriveAttackCoinFlip } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const TARGET = "Flip a coin for each {D} Pokémon you have in play. This attack does 60 damage for each heads.";
console.log("TARGET  :", JSON.stringify(deriveAttackCoinFlip(TARGET)));
console.log("resolved:", resolvedByAnyReader(TARGET));
const near = [
  "Flip a coin for each Energy attached to this Pokémon. This attack does 80 damage for each heads.",
  "Flip a coin for each Energy attached to both Active Pokémon. This attack does 60 damage for each heads.",
  "Flip a coin for each Ancient Pokémon you have in play. This attack does 60 damage for each heads.",
  "Flip a coin for each Team Rocket's Pokémon you have in play. This attack does 60 damage for each heads.",
  "Flip a coin for each Pokémon you have in play. This attack does 60 damage for each heads.",
  "Flip a coin for each {D} Pokémon you have in play. This attack does 0 damage for each heads.",
  "Flip a coin for each {D} Pokémon you have in play. This attack does 60 more damage for each heads.",
  "This attack does 30 damage. Flip a coin for each {D} Pokémon you have in play. This attack does 60 damage for each heads.",
  "Flip a coin for each {D} Pokémon you have in play. This attack does 60 damage for each heads. Then, discard a card.",
  "Flip a coin for each {D} Pokémon your opponent has in play. This attack does 60 damage for each heads.",
];
for (const n of near) console.log(JSON.stringify(deriveAttackCoinFlip(n)), "<=", n);

// whole-column: how many rows does the new anchor claim, and did anything else move?
const rows = legalAttackCorpus();
let claimed = 0, printings = 0;
for (const [p, t] of rows) {
  const v = deriveAttackCoinFlip(t);
  if (v !== null && typeof v === "object" && "flips" in v && (v as { flips: { kind: string } }).flips.kind === "pokemonInPlay") {
    claimed += 1; printings += p; console.log("CLAIMED", p, t);
  }
}
console.log("pokemonInPlay claims:", claimed, "sentences /", printings, "printings");
const resolvedRows = rows.filter(([, t]) => resolvedByAnyReader(t));
console.log("resolved sentences:", resolvedRows.length, "printings:", resolvedRows.reduce((a, [p]) => a + p, 0));
