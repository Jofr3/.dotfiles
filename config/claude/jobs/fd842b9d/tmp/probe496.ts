import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const mod = E as unknown as Record<string, (s: string) => unknown>;
const rows = legalAttackCorpus() as [number,string][];
const pats: [string, RegExp][] = [
  ["FLIP_PREVENT_DAMAGE_AND_EFFECTS", /^Flip a coin\. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pok/],
  ["FLIP_PREVENT_DAMAGE",             /^Flip a coin\. If heads, during your opponent's next turn, prevent all damage done to this Pok/],
  ["FLIP_TAILS_SELF_CANT_ATTACK",     /^Flip a coin\. If tails, (this|during)/],
];
for (const [n,re] of pats) {
  const hit = rows.filter(([,t]) => re.test(t));
  console.log((n+"                                ").slice(0,34), hit.length, "sentences /", hit.reduce((a,[c])=>a+c,0), "printings");
  for (const [c,t] of hit) console.log("     ", c+"p", t.slice(0,96));
}
