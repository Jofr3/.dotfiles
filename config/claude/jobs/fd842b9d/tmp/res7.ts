const P = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const { legalAttackCorpus, resolvedByAnyReader } = await import(P + "censusAttackCorpus");
const E = await import(P + "effects");
const C = await import(P + "censusAtHead.test" as string).catch(() => null);
const rows = legalAttackCorpus() as unknown as [number, string][];
// canonical predicate, copied VERBATIM from censusAtHead.test.ts:6218
const raw = rows.filter(([, t]) => !resolvedByAnyReader(t));
console.log("rawUnbuilt:", raw.length, "/", raw.reduce((a,[n])=>a+n,0), "printings");
for (const [n,s] of [...raw].sort((a,b)=>b[0]-a[0]).slice(0,8))
  console.log(String(n).padStart(2), s.length>96?s.slice(0,96)+"…":s);
