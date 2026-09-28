const P = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const { legalAttackCorpus, resolvedByAnyReader } = await import(P + "censusAttackCorpus");
const E = await import(P + "effects");
const reg = await Bun.file(P + "registry.ts").text();
const rows = legalAttackCorpus() as unknown as [number, string][];
const un = rows.filter(([, s]) => !resolvedByAnyReader(s)
  && !E.splitAttackGateClause(s) && !E.splitAttackTrailingClause(s) && !reg.includes(s));
console.log("=== residue top 10 (198/305 set) ===");
for (const [n,s] of [...un].sort((a,b)=>b[0]-a[0]).slice(0,10))
  console.log(String(n).padStart(2), s.length>96?s.slice(0,96)+"…":s);
console.log("\n=== LOOSE: every corpus row mentioning an opponent's hand ===");
for (const [n,s] of rows.filter(([,s])=>/opponent.{0,3}s hand|from their hand/i.test(s)))
  console.log(String(n).padStart(2), resolvedByAnyReader(s)?"BUILT  ":"UNBUILT", s.slice(0,90));
