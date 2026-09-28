import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const mod = E as unknown as Record<string, (s: string) => unknown>;
const check = (s: string) => names.filter((n) => { try { return mod[n]?.(s) != null; } catch { return false; } });
const T: [string,string][] = [
 ["337 full", "If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage isn't affected by Weakness."],
 ["337 head", "If you have 3 or more Energy in play, this attack does 70 more damage."],
 ["337 head, W-or-R tail", "If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage isn't affected by Weakness or Resistance."],
 ["known-good antecedent", "If your opponent's Active Pokémon is a Pokémon ex, this attack does 70 more damage."],
];
for (const [k,s] of T) { const h=check(s); console.log((k+"                       ").slice(0,25), h.length? "BUILT by "+h.join(","):"REFUSED 13/13"); }
const rows = legalAttackCorpus() as [number,string][];
const thr = rows.filter(([,t]) => /If you have \d+ or more Energy in play/.test(t));
console.log("corpus rows w/ that antecedent:", thr.length, "printings", thr.reduce((a,[n])=>a+n,0));
for (const [n,t] of thr) console.log("   ", n+"p", t.slice(0,110));
