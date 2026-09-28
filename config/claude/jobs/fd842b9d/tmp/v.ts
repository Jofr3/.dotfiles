const P = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const { resolvedByAnyReader } = await import(P + "censusAttackCorpus");
const E = await import(P + "effects");
const s = "This attack also does 60 damage to 1 of your opponent's Benched Pokémon that has any damage counters on it. (Don't apply Weakness and Resistance for Benched Pokémon.)";
console.log("resolved:", resolvedByAnyReader(s), "| gate:", E.splitAttackGateClause(s)!==null, "| trailing:", E.splitAttackTrailingClause(s)!==null, "| effect:", E.deriveAttackEffect(s)!==null);
