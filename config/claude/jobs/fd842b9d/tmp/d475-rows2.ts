import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const needles = ["const ATTACK_COIN_PER_ENERGY","defenderActive === null ? 0","countAttachedEnergy(state, attacker, null)","bothActivesEnergyCount","case \"attachedEnergy\"","switch (count.kind)","let flips: number;","ONE_FLIP","coinFlip.flips"];
for (const n of needles) {
  const hits = MUTANTS.filter((m) => m.find.includes(n) || m.replace.includes(n));
  console.log(`### "${n}" -> ${hits.length}`);
  for (const h of hits) console.log(`   ${h.id} [${h.file}] find?${h.find.includes(n)} repl?${h.replace.includes(n)}`);
}
