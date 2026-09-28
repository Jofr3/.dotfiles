const P = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const { legalAttackCorpus, resolvedByAnyReader } = await import(P + "censusAttackCorpus");
const E = await import(P + "effects");
const rows = legalAttackCorpus() as unknown as [number, string][];
// candidates: unclaimed, no gate, no trailing split — verified per row, not reconstructed
const un = rows.filter(([, s]) => !resolvedByAnyReader(s)
  && E.splitAttackGateClause(s) === null && E.splitAttackTrailingClause(s) === null);
console.log(`unclaimed & unsplittable: ${un.length} sentences / ${un.reduce((a,[n])=>a+n,0)} printings`);
console.log("--- every row with >= 2 printings, printed WHOLE ---");
for (const [n,s] of [...un].filter(([n])=>n>=2).sort((a,b)=>b[0]-a[0])) console.log(String(n).padStart(2), s);
