import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface(); const mod = E as any;
const b=(s:string)=>names.filter((n)=>{try{return mod[n](s)!=null;}catch{return false;}});
const T:[string,string][]=[
 ["A attached (target)", "This attack does 40 damage for each Basic Energy attached to this Pokémon."],
 ["B discard pile",      "This attack does 30 damage for each Basic Energy card in your opponent's discard pile."],
 ["B' untyped pile",     "This attack does 30 damage for each Energy card in your opponent's discard pile."],
 ["B'' own pile",        "This attack does 30 damage for each Basic Energy card in your discard pile."],
];
for(const [k,s] of T){const h=b(s);console.log((k+"                      ").slice(0,22), h.length?"BUILT by "+h.join(","):"REFUSED 13/13");}
