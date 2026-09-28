import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const TR = 'This attack does 20 damage for each Supporter card that has "Team Rocket" in its name in your discard pile.';
const KW = 'This attack does 40 damage for each Pokémon in play that has "Koffing" or "Weezing" in its name (both yours and your opponent\'s).';
const PILE = /^This attack does (\d+) damage for each ([^.]+) in (your opponent['’]s|your) discard pile\.$/;
console.log("TR anchor match:", JSON.stringify(PILE.exec(TR)?.slice(1)));
console.log("KW anchor match:", JSON.stringify(PILE.exec(KW)?.slice(1)));
for (const [label, s] of [["TR",TR],["KW",KW]] as const) {
  console.log(`\n== ${label} resolvedByAnyReader: ${resolvedByAnyReader(s)}`);
  for (const [k, f] of Object.entries(E)) {
    if (typeof f !== "function") continue;
    if (!/^(derive|split)/.test(k)) continue;
    try { const v = (f as any)(s); if (v !== null && v !== undefined) console.log("   ", k, JSON.stringify(v)); } catch {}
  }
}
