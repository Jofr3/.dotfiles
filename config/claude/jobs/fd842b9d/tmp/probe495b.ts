import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const mod = E as unknown as Record<string, (s: string) => unknown>;
const b = (s: string) => names.filter((n) => { try { return mod[n]?.(s) != null; } catch { return false; } });
const T: [string,string][] = [
 ["A no-attack (coin)",  "Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't attack."],
 ["A no-attack (bare)",  "During your opponent's next turn, the Defending Pokémon can't attack."],
 ["B cost+retreat",      "During your opponent's next turn, attacks used by the Defending Pokémon cost {C} more, and its Retreat Cost is {C} more."],
 ["B cost only",         "During your opponent's next turn, attacks used by the Defending Pokémon cost {C} more."],
 ["B retreat only",      "During your opponent's next turn, the Defending Pokémon's Retreat Cost is {C} more."],
 ["C energy-lock",       "During your opponent's next turn, if they attach an Energy card from their hand to the Defending Pokémon, their turn ends."],
 ["D threshold-lock",    "During your opponent's next turn, Pokémon that have 2 or less Energy attached can't attack. (This includes new Pokémon that come into play.)"],
 ["E coin-gated attack", "During your opponent's next turn, if the Defending Pokémon tries to use an attack, your opponent flips a coin. If tails, that attack doesn't happen."],
];
for (const [k,s] of T) { const h=b(s); console.log((k+"                      ").slice(0,22), h.length? "BUILT by "+h.join(","):"REFUSED 13/13"); }
