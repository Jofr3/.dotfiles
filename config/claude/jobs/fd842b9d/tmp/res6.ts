const P = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const { legalAttackCorpus, resolvedByAnyReader } = await import(P + "censusAttackCorpus");
const E = await import(P + "effects");
const reg = await Bun.file(P + "registry.ts").text();
const rows = legalAttackCorpus() as unknown as [number, string][];
const un = rows.filter(([, s]) => !resolvedByAnyReader(s)
  && !E.splitAttackGateClause(s) && !E.splitAttackTrailingClause(s) && !reg.includes(s));
console.log(`RESIDUE (reader − gate − trailing − registry): ${un.length} sentences / ${un.reduce((a,[n])=>a+n,0)} printings`);
console.log("--- top 10 ---");
for (const [n,s] of [...un].sort((a,b)=>b[0]-a[0]).slice(0,10))
  console.log(String(n).padStart(2), s.length>98?s.slice(0,98)+"…":s);
