import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const mod = E as unknown as Record<string, (s: string) => unknown>;
const b = (s: string) => names.filter((n) => { try { return mod[n]?.(s) != null; } catch { return false; } });
const sp = (s: string) => ["splitAttackCancelClause","splitAttackGateClause","splitAttackTrailingClause","splitAttackRequirementClause"]
  .filter(n => { try { return mod[n]?.(s) != null; } catch { return false; } });
const FULL = "Flip a coin. If tails, this attack does nothing. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.";
const HEADS = "Flip a coin. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.";
const TAILS = "Flip a coin. If tails, this attack does nothing.";
for (const [k,s] of [["FULL (row 2)",FULL],["HEADS-only (D142)",HEADS],["TAILS cancel",TAILS]] as [string,string][]) {
  const h=b(s); console.log((k+"                 ").slice(0,19), h.length?"BUILT by "+h.join(","):"REFUSED 13/13", "| splitters:", sp(s).join(",")||"none");
}
const rows = legalAttackCorpus() as [number,string][];
const fam = rows.filter(([,t]) => /^Flip a coin\. If tails, this attack does nothing\. If heads,/.test(t));
console.log("corpus rows of this shape:", fam.length, "printings", fam.reduce((a,[n])=>a+n,0));
for (const [n,t] of fam) console.log("   ", n+"p", t.slice(0,100));
