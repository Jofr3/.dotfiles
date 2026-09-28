import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names=attackReaderSurface(); const mod=E as any;
const b=(s:string)=>names.filter((n)=>{try{return mod[n](s)!=null;}catch{return false;}});
const T:[string,string][]=[
 ["FULL","Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck. If you put any Pokémon onto your Bench in this way, move an Energy from this Pokémon to the new Benched Pokémon."],
 ["head","Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck."],
 ["tail","If you put any Pokémon onto your Bench in this way, move an Energy from this Pokémon to the new Benched Pokémon."],
];
for(const [k,s] of T){const h=b(s);console.log((k+"      ").slice(0,6), h.length?"BUILT by "+h.join(","):"REFUSED 13/13");}
const d=mod["deriveAttackEffect"](T[1][1]); console.log("head program:", JSON.stringify(d));
