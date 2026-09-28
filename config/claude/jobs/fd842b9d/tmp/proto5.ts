import { rows, builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const RX = /use (it|that attack|this attack)/i;
let s=0,u=0; const hits:string[]=[];
for (const [units,t] of corpus) { if (/use it as this attack|choose an attack .*use it as this attack/i.test(t)) { s++; u+=units; hits.push(`${builds(t)?"BUILT ":"resid "} ${units}p ${t.slice(0,90)}`);} }
console.log(`«use it as this attack» over the whole 640: ${s} sentences / ${u} printings`);
console.log(hits.join("\n"));
console.log("\n--- wider: any 'attack' copy phrasing ---");
let s2=0,u2=0; const h2:string[]=[];
for (const [units,t] of corpus) { if (/\buse (it|that attack) as this attack\b/i.test(t)) {s2++;u2+=units;} }
console.log(`${s2} / ${u2}`);
