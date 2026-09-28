import * as eff from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const P = "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed and Poisoned. If tails, your opponent's Active Pokémon is now Confused.";
console.log(JSON.stringify(eff.deriveAttackEffect(P), null, 1));
console.log("curly:", JSON.stringify(eff.deriveAttackEffect(P.replace(/opponent's/g, "opponent’s"))) === JSON.stringify(eff.deriveAttackEffect(P)));
const coll = "Flip a coin. If heads, your opponent's Active Pokémon is now Asleep and Confused. If tails, your opponent's Active Pokémon is now Burned.";
console.log("collision:", eff.deriveAttackEffect(coll));
console.log("resolvedByAnyReader:", (await import("/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus")).resolvedByAnyReader(P));
