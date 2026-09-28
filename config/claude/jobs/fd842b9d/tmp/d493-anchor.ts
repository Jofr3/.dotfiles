import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
// The proposed shared source + the compound anchor (D472: measure what it claims over the WHOLE column)
const BENCH_COUNTER_FILTERED_SRC =
  "This attack does (\\d+) damage for each damage counter on all of your Benched ([^.]+ Pokémon)\\.";
const SUPPRESSION_WEAKNESS_ONLY_SRC = "This attack['’]s damage isn['’]t affected by Weakness\\.";
const OLD = new RegExp(`^${BENCH_COUNTER_FILTERED_SRC}$`);
const NEW = new RegExp(`^${BENCH_COUNTER_FILTERED_SRC} ${SUPPRESSION_WEAKNESS_ONLY_SRC}$`);
// the LOOSER alternative a careless author would write (D472 control)
const LOOSE = new RegExp(`^${BENCH_COUNTER_FILTERED_SRC} (.+)$`);
const WIDER_SUPP = new RegExp(`^${BENCH_COUNTER_FILTERED_SRC} This attack['’]s damage isn['’]t affected by (?:Weakness or Resistance, or by any effects on your opponent['’]s Active Pokémon|Weakness or Resistance|Resistance|any effects on your opponent['’]s Active Pokémon|Weakness)\\.$`);

for (const [label, re] of [["OLD filtered (shipped)",OLD],["NEW compound (Weakness-only tail)",NEW],["WIDER: any of the five suppression objects",WIDER_SUPP],["LOOSE (.+) control",LOOSE]] as [string,RegExp][]) {
  const hits = legalAttackCorpus().filter(([,t]) => re.test(t));
  console.log(`\n${label}: ${hits.length} sentence(s) / ${hits.reduce((a,[n])=>a+n,0)} printing(s)`);
  for (const [p,t] of hits) console.log(`   ${p}p resolvedToday=${resolvedByAnyReader(t)}  ${JSON.stringify(t)}`);
}
// structural disjointness of OLD vs NEW over the whole column
const both = legalAttackCorpus().filter(([,t]) => OLD.test(t) && NEW.test(t));
console.log("\nsentences matching BOTH OLD and NEW (must be 0 — structural disjointness):", both.length);
console.log("…and by construction: OLD demands `$` immediately after the head's period; NEW demands a space + a further sentence there.");
