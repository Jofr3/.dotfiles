import { readFileSync } from "node:fs";
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const REG = readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/registry.ts", "utf8");
const corpus = legalAttackCorpus();
const raw = corpus.filter(([, t]) => !resolvedByAnyReader(t));
console.log("RAW", raw.length, raw.reduce((a,[n])=>a+n,0));
// canonical (censusAtHead.test.ts:6216-6223), with registry as substring-of-registry.ts stand-in
const canon = raw.filter(([, t]) => {
  if (REG.includes(t)) return false;
  const g = splitAttackGateClause(t);
  if (g !== null && g.body !== "" && resolvedByAnyReader(g.body)) return false;
  return splitAttackTrailingClause(t) === null;
});
console.log("CANONICAL residue", canon.length, canon.reduce((a,[n])=>a+n,0));
// rank
const top = [...canon].sort((a,b)=>b[0]-a[0]).slice(0,20);
for (const [n,s] of top) console.log(String(n).padStart(2), "|", s);
