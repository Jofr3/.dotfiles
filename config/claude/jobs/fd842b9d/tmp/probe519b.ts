import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const rows: [number,number,string][] = [
 [316,1,"If this Pokémon has any damage counters on it, this attack can be used for {F}."],
 [358,3,"If your opponent's Active Pokémon already has any damage counters on it, this attack does 60 more damage."],
 [414,1,"Put 2 damage counters on each of your opponent's Pokémon that has any damage counters on it."],
 [528,3,"This attack also does 60 damage to 1 of your opponent's Benched Pokémon that has any damage counters on it. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
 [596,1,"This attack does 50 damage for each of your Pokémon that has any damage counters on it."],
];
for (const [ln,pr,r] of rows) {
  let hit="";
  for (const [n,f] of Object.entries(e)) {
    if (!(n.startsWith("deriveAttack")||n.startsWith("splitAttack")) || typeof f!=="function") continue;
    try { const v=(f as (s:string)=>unknown)(r); if (v!=null){hit=`${n} ${JSON.stringify(v).slice(0,90)}`;break;} } catch {}
  }
  console.log(`:${ln} (${pr}p)  ${hit?"BUILT  "+hit:"UNBUILT"}`);
}
