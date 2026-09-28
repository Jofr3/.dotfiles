import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const mod = E as unknown as Record<string, (s: string) => unknown>;
const check = (s: string) => names.filter((n) => { try { return mod[n]?.(s) != null; } catch { return false; } });
const T: [string,string][] = [
 ["TYPED row (full)",      "If you have at least 3 {D} Energy in play, this attack does 50 more damage."],
 ["337 head (untyped)",    "If you have 3 or more Energy in play, this attack does 70 more damage."],
 ["typed w/ 'or more'",    "If you have 3 or more {D} Energy in play, this attack does 50 more damage."],
 ["untyped w/ 'at least'", "If you have at least 3 Energy in play, this attack does 70 more damage."],
 ["bench-noun control",    "If you have any {M} Pokémon on your Bench, this attack does 80 more damage."],
 ["discard-pile control",  "If you have 10 or more Basic {R} Energy cards in your discard pile, this attack does 100 more damage."],
];
for (const [k,s] of T) { const h=check(s); console.log((k+"                        ").slice(0,24), h.length? "BUILT by "+h.join(","):"REFUSED 13/13"); }
