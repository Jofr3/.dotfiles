import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const P1 = /does \d+ (more |less )?damage for each /i;
const raw = legalAttackCorpus().filter(([,t]) => P1.test(t) && !resolvedByAnyReader(t));
const G: Record<string, RegExp> = {
  "A retreat-cost LESS": /less damage for each \{C\} in your opponent/,
  "B coin family (for each heads)": /^Flip /,
  "C self-generated count (discard/reveal/place then count)": /^(Discard|Reveal|Put up to|Your opponent reveals)/,
  "D served by SPLITTER": /^If you go second|Prize card your opponent has taken\. /,
  "E discard-pile card count": /card in your (opponent's )?discard pile|Pokémon in your discard pile|in its name in your discard pile/,
  "F bodies IN PLAY / on Bench, filtered": / in play|on your Bench|your Benched Charjabug|your Pokémon that has any damage counters/,
  "G damage counters over a FILTERED zone": /damage counter on all of/,
  "H energy attached, unread token": /Energy (card )?attached to (this Pokémon|all of your)/,
  "I opponent hand count": /card in your opponent's hand|find there/,
  "J special condition count": /Special Condition affecting/,
};
const seen = new Set<string>();
let tot=0;
for (const [g,re] of Object.entries(G)) {
  const hits = raw.filter(([,t]) => re.test(t) && !seen.has(t));
  for (const [,t] of hits) seen.add(t);
  const p = hits.reduce((a,[n])=>a+n,0); tot+=p;
  console.log(`\n## ${g} — ${hits.length} sentences / ${p} printings`);
  for (const [c,t] of hits) {
    const gate = splitAttackGateClause(t); const tr = splitAttackTrailingClause(t);
    const served = (gate!==null&&gate.body!==""&&resolvedByAnyReader(gate.body)) || tr!==null;
    console.log(`   ${c}${served?" [SPLITTER-SERVED]":""}\t${t}`);
  }
}
console.log(`\n== assigned ${seen.size} sentences / ${tot} printings; raw = ${raw.length} / ${raw.reduce((a,[n])=>a+n,0)}`);
const left = raw.filter(([,t])=>!seen.has(t));
console.log("UNASSIGNED:"); for (const [c,t] of left) console.log(`   ${c}\t${t}`);
