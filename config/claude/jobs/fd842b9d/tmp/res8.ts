const P = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const { legalAttackCorpus, resolvedByAnyReader } = await import(P + "censusAttackCorpus");
const E = await import(P + "effects");
const t = await Bun.file(P + "censusAtHead.test.ts").text();
// REGISTRY_ATTACK_SENTENCES, extracted from the suite rather than reconstructed
const m = t.match(/const REGISTRY_ATTACK_SENTENCES[^=]*=\s*\[([\s\S]*?)\]\s*(?:as const)?;/);
const reg = m ? [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1].replace(/\\"/g,'"')) : [];
const rows = legalAttackCorpus() as unknown as [number, string][];
const residue = rows.filter(([, x]) => {
  if (resolvedByAnyReader(x)) return false;
  if (reg.includes(x)) return false;
  const g = E.splitAttackGateClause(x);
  if (g !== null && g.body !== "" && resolvedByAnyReader(g.body)) return false;
  return E.splitAttackTrailingClause(x) === null;
});
console.log(`registry sentences parsed: ${reg.length}`);
console.log(`RESIDUE: ${residue.length} sentences / ${residue.reduce((a,[n])=>a+n,0)} printings  (pinned: 178)`);
console.log("--- top 10 ---");
for (const [n,s] of [...residue].sort((a,b)=>b[0]-a[0]).slice(0,10))
  console.log(String(n).padStart(2), s.length>94?s.slice(0,94)+"…":s);
