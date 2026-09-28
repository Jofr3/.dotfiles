import { readFileSync } from "node:fs";
import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const src = new Map<string,string>();
const so=(f:string)=>{let s=src.get(f);if(s===undefined){s=readFileSync(f,"utf8");src.set(f,s);}return s;};
let noop=0, sameFR=0;
for (const m of MUTANTS as any[]) {
  if (m.find === m.replace) { console.log("FIND===REPLACE " + m.id); sameFR++; }
  const t = so(m.file);
  if (t.includes(m.find) && t.split(m.find).join(m.replace) === t) { console.log("NO-OP PATCH " + m.id); noop++; }
}
console.log(`find===replace: ${sameFR}; no-op patches: ${noop}`);
// same id twice?
const ids = new Map<string,number>();
for (const m of MUTANTS as any[]) ids.set(m.id, (ids.get(m.id)??0)+1);
console.log("duplicate ids: " + [...ids.entries()].filter(([,n])=>n>1).map(([k,n])=>`${k}x${n}`).join(", ") || "none");
// how many rows share a (file,find,replace) but differ only by killer?
const g = new Map<string, any[]>();
for (const m of MUTANTS as any[]) { const k = JSON.stringify([m.file,m.find,m.replace]); const a=g.get(k); if(a)a.push(m); else g.set(k,[m]); }
const sharedPatch = [...g.values()].filter(v=>v.length>1);
console.log(`shared-(file,find,replace) groups: ${sharedPatch.length}, rows ${sharedPatch.reduce((s,v)=>s+v.length,0)}`);
