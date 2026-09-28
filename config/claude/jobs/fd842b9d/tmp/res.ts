import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause, deriveAttackDamageBonus, deriveAttackDamageMultiplier } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
for (const [n,s] of legalAttackCorpus()) {
  if (resolvedByAnyReader(s)) continue;
  const g = splitAttackGateClause(s); if (g!==null && g.body!=="" && resolvedByAnyReader(g.body)) continue;
  if (splitAttackTrailingClause(s)!==null) continue;
  if (!/for each/.test(s)) continue;
  console.log(n+"p", JSON.stringify(s));
}
