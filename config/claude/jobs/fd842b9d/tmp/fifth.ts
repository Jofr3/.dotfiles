import { resolvedByAnyReader, legalAttackCorpus, attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const C = "This attack does 50 damage for each of your Pokémon that has any damage counters on it.";
console.log("in corpus:", legalAttackCorpus().filter(([,t])=>t===C));
for (const n of attackReaderSurface()) {
  const out = (effects as any)[n](C);
  if (out !== null) console.log("CLAIMED BY", n, JSON.stringify(out));
}
console.log("resolved:", resolvedByAnyReader(C));
for (const n of ["splitAttackCancelClause","splitAttackGateClause","splitAttackRequirementClause","splitAttackTrailingClause"]) {
  console.log(n, JSON.stringify((effects as any)[n](C)));
}
