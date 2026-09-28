import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
const c = legalAttackCorpus();
for (const rx of [/use it as this attack/, /as this attack/, /use (it|that|this) attack/, /attacks? and use/, /copy/i]) {
  let s=0,u=0,b=0;
  for (const [n,t] of c) if (rx.test(t)) { s++; u+=n; if (builds(t)) b++; }
  console.log(`${String(rx).padEnd(34)} ${s} sentences / ${u} printings  (built: ${b})`);
}
