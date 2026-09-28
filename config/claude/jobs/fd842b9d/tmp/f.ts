const P = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const { legalAttackCorpus, resolvedByAnyReader } = await import(P + "censusAttackCorpus");
const rows = legalAttackCorpus() as unknown as [number, string][];
const pat = /damage for each of (your|your opponent's) .*(in play|on your Bench)/i;
const hits = rows.filter(([, s]) => pat.test(s) && !resolvedByAnyReader(s));
console.log(`pattern: ${pat}`);
console.log(`unbuilt bodies-in-play rows: ${hits.length} sentences / ${hits.reduce((a,[n])=>a+n,0)} printings`);
for (const [n,s] of [...hits].sort((a,b)=>b[0]-a[0])) console.log(String(n).padStart(2), s);
