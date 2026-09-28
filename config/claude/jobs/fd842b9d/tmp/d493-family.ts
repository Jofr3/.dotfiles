import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const names = attackReaderSurface(); const E = effects as any;
function claims(s:string){return names.filter(n=>(E[n] as any)(s)!==null);}
const F = [
 [392,"If your opponent's Active Pokémon isn't a Pokémon ex, this attack does nothing. This attack's damage isn't affected by Weakness or Resistance."],
 [539,"This attack does 100 damage to each of your opponent's Pokémon ex and Pokémon V. This attack's damage isn't affected by Weakness or Resistance."],
 [600,"This attack does 50 damage to 2 of your opponent's Pokémon. This attack's damage isn't affected by Weakness or Resistance, or by any effects on those Pokémon."],
 [616,"This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness or Resistance."],
 [620,"This attack does 70 damage to 1 of your opponent's Pokémon. This attack's damage isn't affected by Weakness or Resistance."],
] as [number,string][];
for (const [l,t] of F) {
  console.log(`line ${l}: readers=[${claims(t)}]`);
  console.log(`   effect: ${JSON.stringify(E.deriveAttackEffect(t))}`);
  console.log(`   reqSplit: ${JSON.stringify(E.splitAttackRequirementClause(t))}`);
}
// dual-claim population
console.log("\n=== sentences claimed by MORE THAN ONE reader over all 640 ===");
let n=0;
for (const [p,t] of legalAttackCorpus()) { const c=claims(t); if (c.length>1){n++;console.log(`   ${p}p [${c}] ${JSON.stringify(t)}`);} }
console.log("   total dual-claimed:", n);
