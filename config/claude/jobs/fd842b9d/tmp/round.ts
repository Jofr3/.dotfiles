import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const COMPOUND = "Your opponent discards a card from their hand. If this Pokémon evolved from Salandit during this turn, your opponent discards 2 more cards.";
const rows = legalAttackCorpus() as unknown as [number,string][];
const unbuilt = rows.filter(([,s]) => !resolvedByAnyReader(s));
console.log("unbuilt sentences:", unbuilt.length, "printings:", unbuilt.reduce((a,[n])=>a+n,0));
console.log("compound resolved:", resolvedByAnyReader(COMPOUND));
