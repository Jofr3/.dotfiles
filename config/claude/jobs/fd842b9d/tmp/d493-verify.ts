import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const names = attackReaderSurface(); const E = effects as any;
function claims(s:string){return names.filter(n=>(E[n] as any)(s)!==null);}
const R529 = "This attack does 10 damage for each damage counter on all of your Benched Cynthia's Pokémon. This attack's damage isn't affected by Weakness.";
const HEAD = "This attack does 10 damage for each damage counter on all of your Benched Cynthia's Pokémon.";
const TAIL = "This attack's damage isn't affected by Weakness.";
console.log("row529 claims:", claims(R529));
console.log("fold(compound) === fold(head):", JSON.stringify(E.deriveAttackDamageMultiplier(R529)) === JSON.stringify(E.deriveAttackDamageMultiplier(HEAD)));
console.log("standalone TAIL still refused:", claims(TAIL).length === 0);
console.log("row337 still refused:", claims("If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage isn't affected by Weakness.").length === 0);
console.log("Pachirisu compound still refused:", claims("This attack does 20 more damage for each of your Benched {L} Pokémon. This attack's damage isn't affected by Weakness.").length === 0);
console.log("UNMAPPED NOUN near-miss stays LOUD:", claims("This attack does 10 damage for each damage counter on all of your Benched Ancient Pokémon. This attack's damage isn't affected by Weakness."));
console.log("PRINTED-ZERO near-miss stays LOUD:", claims("This attack does 0 damage for each damage counter on all of your Benched Cynthia's Pokémon. This attack's damage isn't affected by Weakness."));
console.log("U+2019 fold equal:", JSON.stringify(E.deriveAttackDamageSuppression(R529.replaceAll("'","’"))) === JSON.stringify(E.deriveAttackDamageSuppression(R529)), JSON.stringify(E.deriveAttackDamageSuppression(R529.replaceAll("'","’"))));
console.log("U+2019 multiplier fold equal:", JSON.stringify(E.deriveAttackDamageMultiplier(R529.replaceAll("'","’"))) === JSON.stringify(E.deriveAttackDamageMultiplier(R529)));
// whole-column delta
let resolvedS=0, resolvedP=0, dual: string[] = [];
for (const [p,t] of legalAttackCorpus()) { const c=claims(t); if(c.length){resolvedS++;resolvedP+=p;} if(c.length>1) dual.push(t); }
console.log("\nresolved sentences:", resolvedS, " printings:", resolvedP);
console.log("dual-claimed:", dual.length); for (const d of dual) console.log("   " + JSON.stringify(d));
// splitter populations unchanged?
const split = E.splitAttackTrailingClause as (t:string)=>any;
let sp=0,spP=0; for (const [p,t] of legalAttackCorpus()) if (split(t)!==null){sp++;spP+=p;}
console.log("splitAttackTrailingClause admits:", sp, "sentences /", spP, "printings  (D409 measured 5 / 11)");
