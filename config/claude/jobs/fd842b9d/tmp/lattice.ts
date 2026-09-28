import { resolvedByAnyReader, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { readFileSync } from "node:fs";

const src = readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts","utf8");
const head = src.indexOf('const REGISTRY_ATTACKS: readonly (readonly [string, string])[] = [');
const end = src.indexOf("\n];", head);
const block = src.slice(head,end).split("\n").map(l=>l.replace(/\s*\/\/.*$/,"")).join("\n");
const PAIR = /\[\s*"(sv[a-z0-9.]*-\d+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/g;
const REGISTRY = new Set<string>();
for (const m of block.matchAll(PAIR)) REGISTRY.add((m[2] ?? "").replace(/\\"/g,'"'));

function builds(text:string){ 
  if (resolvedByAnyReader(text)) return true;
  if (REGISTRY.has(text)) return true;
  const g = splitAttackGateClause(text);
  if (g!==null && g.body!=="" && resolvedByAnyReader(g.body)) return true;
  return splitAttackTrailingClause(text)!==null;
}

// axes: SHAPE(0=count,1=pred) NOUN(0=counter,1=specialCondition) SEAT(0=self,1=opponent) FOLD(0=multiply,1=additive)
const SEATTXT = ["this Pokémon", "your opponent's Active Pokémon"];
function text(shape:number,noun:number,seat:number,fold:number):string{
  const more = fold===1 ? "more " : "";
  if (shape===0) {
    const phrase = noun===1 ? `Special Condition affecting ${SEATTXT[seat]}` : `damage counter on ${SEATTXT[seat]}`;
    return `This attack does 100 ${more}damage for each ${phrase}.`;
  }
  const clause = noun===1 ? `${SEATTXT[seat]} is affected by a Special Condition` : `${SEATTXT[seat]} has any damage counters on it`;
  const cap = clause.charAt(0).toUpperCase()+clause.slice(1);
  return `If ${clause}, this attack does 100 ${more}damage.`.replace(/^If this/, "If this");
}
const pts:{k:number[];t:string;b:boolean;r:boolean;g:boolean;tr:boolean}[]=[];
for (let s=0;s<2;s++) for (let n=0;n<2;n++) for (let se=0;se<2;se++) for (let f=0;f<2;f++){
  const t=text(s,n,se,f);
  pts.push({k:[s,n,se,f],t,b:builds(t),r:resolvedByAnyReader(t),g:splitAttackGateClause(t)!==null,tr:splitAttackTrailingClause(t)!==null});
}
const names=["SHAPE","NOUN","SEAT","FOLD"];
console.log("distinct strings:", new Set(pts.map(p=>p.t)).size, "of", pts.length);
console.log("lit:", pts.filter(p=>p.b).length, "of 16");
console.log("readers-only == builds:", pts.every(p=>p.b===p.r) ? "AGREE (0 divergent)" : "DIVERGE");
console.log("gate splitter non-null:", pts.filter(p=>p.g).length, " trailing splitter non-null:", pts.filter(p=>p.tr).length);
for (const p of pts) console.log(p.k.join(""), p.b?"LIT ":"dark", p.t);
// flips per axis
for (let a=0;a<4;a++){
  let flips=0, pairs=0;
  for (const p of pts){ if (p.k[a]===1) continue; const q=pts.find(x=>x.k.every((v,i)=>i===a?v===1:v===p.k[i]))!; pairs++; if (p.b!==q.b) flips++; }
  console.log(`${names[a]}: ${flips}/${pairs}`);
}
// printed-ness: which of the 16 appear in the corpus at all (with any N)
const corpus = legalAttackCorpus();
for (const p of pts){
  const pat = p.t.replace("100","(\\d+)").replace(/[.*+?^${}()|[\]\\]/g, m=>m==="("||m===")"||m==="\\"?m:"\\"+m);
  const re = new RegExp("^"+p.t.split("100").map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("\\d+")+"$");
  const hits = corpus.filter(([,t])=>re.test(t));
  if (hits.length) console.log("PRINTED", p.k.join(""), hits.map(([u,t])=>`${u}p ${t}`).join(" | "));
}
