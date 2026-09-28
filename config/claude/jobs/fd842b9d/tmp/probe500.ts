import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface(); const mod = E as any;
const b=(s:string)=>names.filter((n)=>{try{return mod[n](s)!=null;}catch{return false;}});
const T:[string,string][]=[
 ["target (Basic)", "This attack does 40 damage for each Basic Energy attached to this Pokémon."],
 ["typed sibling",  "This attack does 40 damage for each {W} Energy attached to this Pokémon."],
 ["untyped sibling","This attack does 40 damage for each Energy attached to this Pokémon."],
];
for(const [k,s] of T){const h=b(s);console.log((k+"                ").slice(0,16), h.length?"BUILT by "+h.join(","):"REFUSED 13/13");}
