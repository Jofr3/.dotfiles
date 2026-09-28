import { readFileSync } from "node:fs";
const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const cache = new Map<string, string>();
function src(f: string) {
  if (!cache.has(f)) cache.set(f, readFileSync("/home/jofre/projects/luminous_ui/" + f, "utf8"));
  return cache.get(f)!;
}
const TARGET = "packages/engine/src/censusAttackCorpus.ts";
let total = 0, resolved = 0, zero = 0, multi = 0;
const inFile: {id:string;a:number;b:number;dec:string}[] = [];
for (const m of MUTANTS as any[]) {
  total++;
  const s = src(m.file);
  const first = s.indexOf(m.find);
  if (first < 0) { zero++; continue; }
  if (s.indexOf(m.find, first + 1) >= 0) multi++;
  resolved++;
  if (m.file !== TARGET) continue;
  const a = s.slice(0, first).split("\n").length;
  const b = a + m.find.split("\n").length - 1;
  inFile.push({ id: m.id, a, b, dec: m.decision });
}
console.log(`rows=${total} resolved=${resolved} zero-match=${zero} multi-match=${multi}`);
console.log(`rows targeting ${TARGET}: ${inFile.length}`);
for (const r of inFile.sort((x,y)=>x.a-y.a)) console.log(`  ${r.a}-${r.b}  ${r.dec}  ${r.id}`);
for (const [lo,hi,label] of [[805,816,"doc+fn 805-816"],[814,816,"fn body 814-816"],[815,815,"THE LINE 815"],[780,816,"surface()+fn 780-816"]] as [number,number,string][]) {
  const hit = inFile.filter(r => r.a <= hi && r.b >= lo);
  console.log(`INTERSECT ${label}: ${hit.length} -> ${hit.map(h=>h.id).join(", ")||"(none)"}`);
}
