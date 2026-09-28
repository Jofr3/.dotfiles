import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const c = legalAttackCorpus();
console.log("rows:", c.length);
const dt = c.filter(([,s]) => s.includes("of different types"));
console.log("of different types rows:", dt.length);
for (const [n,s] of dt) console.log("  ", n, "|", s);
// any non-Energy noun with the phrase?
const nonEnergy = dt.filter(([,s]) => !s.includes("Energy cards of different types"));
console.log("non-'Energy cards of different types':", nonEnergy.length);
// 'different' at all
console.log("rows containing 'different':", c.filter(([,s])=>s.includes("different")).length);
