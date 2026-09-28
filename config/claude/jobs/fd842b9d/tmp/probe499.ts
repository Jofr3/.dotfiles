import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const mod = E as unknown as Record<string, (s: string) => unknown>;
const b = (s: string) => names.filter((n) => { try { return mod[n]?.(s) != null; } catch { return false; } });
const T: [string,string][] = [
 ["5 cost+retreat", "During your opponent's next turn, attacks used by the Defending Pokémon cost {C} more, and its Retreat Cost is {C} more."],
 ["5a cost only",   "During your opponent's next turn, attacks used by the Defending Pokémon cost {C} more."],
 ["5b retreat only","During your opponent's next turn, the Defending Pokémon's Retreat Cost is {C} more."],
 ["7 energy ends turn","During your opponent's next turn, if they attach an Energy card from their hand to the Defending Pokémon, their turn ends."],
 ["4 threshold lock","During your opponent's next turn, Pokémon that have 2 or less Energy attached can't attack. (This includes new Pokémon that come into play.)"],
 ["1 poison+noattach","Your opponent's Active Pokémon is now Poisoned. During your opponent's next turn, Energy cards can't be attached from your opponent's hand to that Pokémon."],
 ["1a poison only",  "Your opponent's Active Pokémon is now Poisoned."],
];
for (const [k,s] of T) { const h=b(s); console.log((k+"                    ").slice(0,20), h.length? "BUILT by "+h.join(","):"REFUSED 13/13"); }
