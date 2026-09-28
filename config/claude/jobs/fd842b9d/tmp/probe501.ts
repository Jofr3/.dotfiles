import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names=attackReaderSurface(); const mod=E as any;
const b=(s:string)=>names.filter((n)=>{try{return mod[n](s)!=null;}catch{return false;}});
const T:[string,string][]=[
 ["3 FULL","This attack does 30 damage for each {W} Energy attached to this Pokémon. Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon."],
 ["3 tail only","Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon."],
 ["5 FULL","Your opponent's Active Pokémon is now Confused. Put 8 damage counters instead of 3 on that Pokémon for this Special Condition."],
 ["5 tail only","Put 8 damage counters instead of 3 on that Pokémon for this Special Condition."],
 ["6 FULL","Your opponent's Active Pokémon is now Confused. You may move any number of damage counters from your opponent's Pokémon to their other Pokémon in any way you like."],
];
for(const [k,s] of T){const h=b(s);console.log((k+"              ").slice(0,14), h.length?"BUILT by "+h.join(","):"REFUSED 13/13");}
