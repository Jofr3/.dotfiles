import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const { splitAttackTrailingClause } = effects as unknown as Record<string, (t: string) => { head: string; tail: string } | null>;
const TAIL = "Put 8 damage counters instead of 3 on that Pokémon for this Special Condition.";
// Every HEAD in the corpus some reader already claims, joined to the tail: which
// compose? Under a BARE-TAIL build every one of these becomes a live program.
const heads = legalAttackCorpus().filter(([, t]) => resolvedByAnyReader(t));
console.log(`corpus sentences claimed WHOLE by some reader: ${heads.length}`);
const composable = heads.filter(([, h]) => splitAttackTrailingClause(`${h} ${TAIL}`) !== null || h.endsWith("."));
// The splitter refuses today only because the TAIL is unclaimed; simulate the tail being claimed
// by asking the splitter's HEAD half alone on each join.
let n = 0;
const sample: string[] = [];
for (const [, h] of heads) {
  if (!h.endsWith(".")) continue;
  // head-claimed is already true by construction; the splitter's only other gate is the tail.
  n++;
  if (sample.length < 6 && /is now (Burned|Asleep|Paralyzed|Poisoned)\.$/.test(h)) sample.push(h);
}
console.log(`heads ending in "." (the splitter's join shape): ${n}`);
console.log(`STATUS heads a bare-tail arm would let the splitter compose behind:`);
for (const h of sample) console.log(`   "${h} ${TAIL}"`);
console.log(`\n(composable placeholder count, unused): ${composable.length}`);
