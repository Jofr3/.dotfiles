import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";

const names = attackReaderSurface();
const E = effects as any;
const split = E.splitAttackTrailingClause as (t: string) => unknown;
const dae = E.deriveAttackEffect as (t: string) => unknown;

function claims(s: string): string[] {
  return names.filter((n) => (E[n] as (t: string) => unknown)(s) !== null);
}
function line(label: string, s: string) {
  const c = claims(s);
  console.log(`${label}\n    ${JSON.stringify(s)}\n    readers: ${c.length ? c.join(",") : "REFUSED " + names.length + "/" + names.length}   deriveAttackEffect: ${JSON.stringify(dae(s))}   split: ${JSON.stringify(split(s))}`);
}

const CYN_HEAD = "This attack does 10 damage for each damage counter on all of your Benched Cynthia's Pokémon.";
const WR = "This attack's damage isn't affected by Weakness or Resistance.";
const W = "This attack's damage isn't affected by Weakness.";
const SPREAD = "This attack does 50 damage to each of your opponent's Benched Pokémon.";
const DRAW = "Draw 3 cards.";

console.log("=== (B) COMPOSITION: heads that BUILD + tails that BUILD ===");
line("[D466 spread head]", SPREAD);
line("[WR tail]", WR);
line("[spread + WR]", SPREAD + " " + WR);
line("[Cynthia head]", CYN_HEAD);
line("[Cynthia head + WR]", CYN_HEAD + " " + WR);
line("[Cynthia head + W]", CYN_HEAD + " " + W);
console.log("\n--- CONTROL: a tail deriveAttackEffect DOES claim ---");
line("[Draw 3 cards.]", DRAW);
line("[Cynthia head + Draw 3]", CYN_HEAD + " " + DRAW);
line("[spread + Draw 3]", SPREAD + " " + DRAW);

console.log("\n=== the brief's row-5 specimen, deconstructed ===");
line("[30 dmg alone]", "This attack does 30 damage.");
line("[30 dmg + WR]", "This attack does 30 damage. This attack's damage isn't affected by Weakness or Resistance.");
