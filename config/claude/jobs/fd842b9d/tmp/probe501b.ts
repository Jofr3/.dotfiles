import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names=attackReaderSurface(); const mod=E as any;
const b=(s:string)=>names.filter((n)=>{try{return mod[n](s)!=null;}catch{return false;}});
const T:[string,string][]=[
 ["poison x2","Your opponent's Active Pokémon is now Poisoned. During Pokémon Checkup, put 2 damage counters on that Pokémon instead of 1."],
 ["poison x8","Your opponent's Active Pokémon is now Poisoned. During Pokémon Checkup, put 8 damage counters on that Pokémon instead of 1."],
 ["confusion","Your opponent's Active Pokémon is now Confused. Put 8 damage counters instead of 3 on that Pokémon for this Special Condition."],
];
for(const [k,s] of T){const h=b(s);console.log((k+"           ").slice(0,11), h.length?"BUILT by "+h.join(","):"REFUSED 13/13");}
const d=mod["deriveAttackEffect"](T[0][1]); console.log("poison program:", JSON.stringify(d));
