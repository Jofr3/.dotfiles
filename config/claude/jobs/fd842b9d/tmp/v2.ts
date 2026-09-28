const P = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const { legalAttackCorpus, resolvedByAnyReader } = await import(P + "censusAttackCorpus");
const E = await import(P + "effects");
const rows = legalAttackCorpus() as unknown as [number, string][];
console.log("=== every 'less damage for each' row, WHOLE ===");
for (const [n,s] of rows.filter(([,s]) => /less damage for each/i.test(s))) console.log(n, "|", s);
console.log("\n=== the three rows I counted as unbuilt that are actually served ===");
for (const s of [
 "If you go second, you can't use this attack during your first turn. This attack does 30 damage for each of your Benched Pokémon.",
 "This attack does 50 more damage for each Prize card your opponent has taken. Discard an Energy from this Pokémon."]) {
  const g = E.splitAttackGateClause(s), t = E.splitAttackTrailingClause(s);
  console.log(`reader:${resolvedByAnyReader(s)} gate:${g!==null} trailing:${t!==null} :: ${s.slice(0,58)}…`);
}
