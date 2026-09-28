import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const mod = E as unknown as Record<string, (s: string) => unknown>;
const T = [
 ["FULL-529", "This attack does 10 damage for each damage counter on all of your Benched Cynthia's Pokémon. This attack's damage isn't affected by Weakness."],
 ["HEAD only", "This attack does 10 damage for each damage counter on all of your Benched Cynthia's Pokémon."],
 ["TAIL only (Weakness)", "This attack's damage isn't affected by Weakness."],
 ["TAIL only (W or R)", "This attack's damage isn't affected by Weakness or Resistance."],
 ["SIMPLE head + same tail", "This attack does 30 damage. This attack's damage isn't affected by Weakness."],
 ["SIMPLE head + W-or-R tail", "This attack does 30 damage. This attack's damage isn't affected by Weakness or Resistance."],
];
for (const [label, s] of T) {
  const hits = names.filter((n) => { try { return mod[n]?.(s) != null; } catch { return false; } });
  console.log((label+"                        ").slice(0,26), hits.length ? "BUILT by " + hits.join(",") : "REFUSED 13/13");
}
const sp = mod["splitAttackTrailingClause"];
console.log("trailing splitter on FULL-529:", sp ? JSON.stringify(sp(T[0][1])) : "n/a");
