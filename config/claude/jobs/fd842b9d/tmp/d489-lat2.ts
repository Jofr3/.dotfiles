import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const surface = attackReaderSurface();
const T = "Discard up to 3 Energy cards from your hand. This attack does 60 damage to 1 of your opponent's Pokémon for each Energy card you discarded in this way. (Don't apply Weakness and Resistance for Benched Pokémon.)";
const AXES: [string,(s:string)=>string][] = [
  ["FILTER",(s)=>s.replace("3 Energy cards","3 {G} Energy cards")],
  ["ZONE",(s)=>s.replace("from your hand","from your Pokémon")],
  ["CHOSEN",(s)=>s.replace(" to 1 of your opponent's Pokémon","")],
  ["COUNT-NOUN",(s)=>s.replace("for each Energy card you discarded","for each card you discarded")],
  ["W/R",(s)=>s.replace(" (Don't apply Weakness and Resistance for Benched Pokémon.)","")],
];
const claim=(s:string)=>surface.filter(n=>{const f=(effects as any)[n]; return f(s)!==null;});
for(let m=0;m<32;m++){let t=T;const ns:string[]=[];AXES.forEach(([n,a],i)=>{if(m&(1<<i)){t=a(t);ns.push(n);}});
  const c=claim(t); if(c.length) console.log(`mask=${m} [${ns.join("+")||"PRINTED"}] -> ${c.join(",")}`);}
console.log("\n=== residue rows with 'from your hand' anywhere ===");
const corpus = legalAttackCorpus() as unknown as [number,string][];
for (const [n,t] of corpus) if(!resolvedByAnyReader(t) && /from your hand/.test(t)) console.log(`${n}p ${JSON.stringify(t)}`);
console.log("\n=== residue rows whose FIRST sentence discards from your hand ===");
for (const [n,t] of corpus) if(!resolvedByAnyReader(t) && /^Discard [^.]* from your hand\./.test(t)) console.log(`${n}p ${JSON.stringify(t)}`);
