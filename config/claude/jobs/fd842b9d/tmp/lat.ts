import { resolvedByAnyReader, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause, deriveAttackDamageMultiplier } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const OWNER = ["your", "your opponent's"] as const;
const NOUN = ["Pokémon", "Basic Pokémon"] as const;
const TAIL = ["in play", "that has any damage counters on it"] as const;
const text = (n:number,s:number,o:number,f:number) =>
  `This attack does 50 ${f===1?"more ":""}damage for each of ${OWNER[s]} ${NOUN[o]} ${TAIL[n]}.`;
const POINTS = [0,1].flatMap(n=>[0,1].flatMap(s=>[0,1].flatMap(o=>[0,1].map(f=>({key:[n,s,o,f],t:text(n,s,o,f)})))));
console.log("distinct", new Set(POINTS.map(p=>p.t)).size);
const lit=(t:string)=>resolvedByAnyReader(t);
const claimed=(t:string)=>{const v=deriveAttackDamageMultiplier(t); return v!==null && (v.count as any).damagedOnly===true;};
const built=POINTS.filter(p=>lit(p.t)).map(p=>p.key.join(""));
console.log("built POST", built.length, JSON.stringify(built.sort()));
const pre=POINTS.filter(p=>lit(p.t)&&!claimed(p.t)).map(p=>p.key.join(""));
console.log("built PRE ", pre.length, JSON.stringify(pre.sort()));
const flips=(pred:(t:string)=>boolean)=>[0,1,2,3].map(ax=>{let n=0;for(const p of POINTS){if(p.key[ax]===1)continue;const q=POINTS.find(x=>x.key.every((v,i)=>i===ax?v===1:v===p.key[i]))!;if(pred(p.t)!==pred(q.t))n++;}return n;});
console.log("flips POST", flips(lit));
console.log("flips PRE ", flips(t=>lit(t)&&!claimed(t)));
let g=0,tr=0; for(const p of POINTS){if(splitAttackGateClause(p.t)!==null)g++;if(splitAttackTrailingClause(p.t)!==null)tr++;}
console.log("gate",g,"trailing",tr);
const corpus=legalAttackCorpus();
const printed=POINTS.filter(p=>{const re=new RegExp(`^${p.t.split("50").map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("\\d+")}$`);return corpus.some(([,s])=>re.test(s));});
console.log("printed", printed.map(p=>p.key.join("")).sort(), printed.map(p=>lit(p.t)));
