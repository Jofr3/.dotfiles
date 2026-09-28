import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const mod = E as unknown as Record<string, (s: string) => unknown>;
const T: [string,string][] = [
 ["ROW-B full", "If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage isn't affected by Weakness."],
 ["ROW-B head", "If you have 3 or more Energy in play, this attack does 70 more damage."],
 ["ROW-A head", "This attack does 10 damage for each damage counter on all of your Benched Cynthia's Pokémon."],
];
for (const [label, s] of T) {
  const hits = names.filter((n) => { try { return mod[n]?.(s) != null; } catch { return false; } });
  console.log((label+"            ").slice(0,13), hits.length ? "BUILT by " + hits.join(",") : "REFUSED 13/13");
}
// how many corpus rows print the Weakness-only clause at all?
const { legalAttackCorpus } = await import("/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts");
const rows = legalAttackCorpus() as [number,string][];
const wOnly = rows.filter(([,t]) => /isn't affected by Weakness\./.test(t));
const wOrR  = rows.filter(([,t]) => /isn't affected by Weakness or Resistance/.test(t));
console.log("corpus rows w/ 'Weakness.' only :", wOnly.length, "printings", wOnly.reduce((a,[n])=>a+n,0));
console.log("corpus rows w/ 'Weakness or Resistance':", wOrR.length, "printings", wOrR.reduce((a,[n])=>a+n,0));
