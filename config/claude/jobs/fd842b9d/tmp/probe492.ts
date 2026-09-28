import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const S = [
 ["539", "This attack does 100 damage to each of your opponent's Pokémon ex and Pokémon V. This attack's damage isn't affected by Weakness or Resistance."],
 ["616", "This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness or Resistance."],
 ["612", "This attack does 60 damage for each of your opponent's Pokémon ex and Pokémon V in play."],
 ["613", "This attack does 60 damage for each of your opponent's Pokémon ex in play."],
];
const names = attackReaderSurface();
const mod = E as unknown as Record<string, (s: string) => unknown>;
console.log("surface:", names.length);
for (const [line, s] of S) {
  const hits = names.filter((n) => { try { return mod[n]?.(s) != null; } catch { return false; } });
  console.log(line, hits.length ? `BUILT by ${hits.join(",")}` : "REFUSED 13/13");
}
