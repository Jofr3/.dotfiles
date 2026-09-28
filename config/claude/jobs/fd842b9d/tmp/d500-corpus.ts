import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const rows = legalAttackCorpus() as unknown as [number, string][];
console.log("legalAttackCorpus rows:", rows.length);
const T = "This attack does 40 damage for each Basic Energy attached to this Pokémon.";
console.log("EXACT target rows:", rows.filter(r => r[1] === T).length);
const show = (label: string, re: RegExp) => {
  const hits = rows.filter(r => re.test(r[1]));
  console.log(`\n${label} (${re}) : ${hits.length}`);
  for (const h of hits) console.log(`   line ${h[0]}: ${h[1]}`);
};
show("Basic Energy", /Basic Energy/);
show("basic Energy (lowercase b)", /basic Energy/);
show("Energy attached to this", /Energy attached to this/);
show("for each ... Energy attached", /for each .{0,30}Energy attached/);
