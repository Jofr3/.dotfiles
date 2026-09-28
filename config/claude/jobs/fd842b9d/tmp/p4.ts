import { legalAttackCorpus, resolvedByAnyReader as nowR } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { resolvedByAnyReader as oldR } from "/home/jofre/projects/luminous_ui/tmp/d514head/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
let oldS = 0, oldU = 0, newS = 0, newU = 0;
const gained: [number, string][] = [];
const lost: [number, string][] = [];
for (const [u, t] of corpus) {
  const o = oldR(t), n = nowR(t);
  if (o) { oldS++; oldU += u; }
  if (n) { newS++; newU += u; }
  if (!o && n) gained.push([u, t]);
  if (o && !n) lost.push([u, t]);
}
console.log(`OLD reader: ${oldS} sentences / ${oldU} printings`);
console.log(`NEW reader: ${newS} sentences / ${newU} printings`);
console.log(`GAINED ${gained.length}:`); for (const [u, t] of gained) console.log(`  +${u}p ${t}`);
console.log(`LOST ${lost.length}:`); for (const [u, t] of lost) console.log(`  -${u}p ${t}`);
