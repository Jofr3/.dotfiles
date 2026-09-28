import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const corpus = legalAttackCorpus();
const readers = Object.entries(E).filter(([n,v])=>n.startsWith("deriveAttack") && typeof v==="function") as [string,(t:string)=>unknown][];
for (const [n,f] of readers.sort((a,b)=>a[0]<b[0]?-1:1)) {
  const hits = corpus.filter(([,t])=>{try{return f(t)!==null}catch{return false}});
  console.log(String(hits.length).padStart(4), String(hits.reduce((a,[k])=>a+k,0)).padStart(5), n);
}
const de = E.deriveAttackEffect;
const byEffect = corpus.filter(([,t])=>de(t)!==null);
const byAny = corpus.filter(([,t])=>resolvedByAnyReader(t));
const byOther = byAny.filter(([,t])=>de(t)===null);
console.log("\nderiveAttackEffect alone:", byEffect.length, byEffect.reduce((a,[n])=>a+n,0));
console.log("any reader:", byAny.length, byAny.reduce((a,[n])=>a+n,0));
console.log("resolved but NOT by deriveAttackEffect:", byOther.length, byOther.reduce((a,[n])=>a+n,0));
