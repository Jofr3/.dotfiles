import { legalAttackCorpus, attackReaderSurface, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const rows = legalAttackCorpus();
console.log(`readers=${names.length} sentences=${rows.length} calls=${names.length*rows.length}`);
console.log(`readers: ${names.join(", ")}`);
let nul=0, undef=0, nonnull=0, other=0;
const perReader = new Map<string, {n:number;u:number;x:number}>();
const claimCount = new Map<number, number>();   // sentence idx -> #readers claiming
const kinds = new Map<string, number>();
for (let i=0;i<rows.length;i++) {
  const text = (rows[i] as any)[1];
  let claims = 0;
  for (const n of names) {
    const r = (effects as any)[n](text);
    const rec = perReader.get(n) ?? {n:0,u:0,x:0};
    if (r === null) { nul++; rec.n++; }
    else if (r === undefined) { undef++; rec.u++; kinds.set("undefined",(kinds.get("undefined")??0)+1); }
    else { nonnull++; rec.x++; claims++; }
    perReader.set(n, rec);
  }
  claimCount.set(claims, (claimCount.get(claims)??0)+1);
}
console.log(`null=${nul}  undefined=${undef}  non-null=${nonnull}  (sum=${nul+undef+nonnull})`);
console.log("claims-per-sentence histogram:", [...claimCount.entries()].sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}:${v}`).join(" "));
const claimedSentences = rows.filter((r:any)=>resolvedByAnyReader(r[1])).length;
console.log(`resolvedByAnyReader true on ${claimedSentences} sentences`);
const dual = [...claimCount.entries()].filter(([k])=>k>=2).reduce((a,[k,v])=>a+v*(k-1),0);
console.log(`excess claims beyond one-per-claimed-sentence = ${dual}  => nonnull(${nonnull}) - claimed(${claimedSentences}) = ${nonnull-claimedSentences}`);
console.log("per-reader (null/undefined/non-null):");
for (const n of names) { const r = perReader.get(n)!; console.log(`  ${n}: ${r.n} / ${r.u} / ${r.x}`); }
// falsifier probe for != null : does ANY reader ever answer undefined on ANY string?
console.log("typeof-return survey over corpus:", JSON.stringify([...kinds.entries()]));
