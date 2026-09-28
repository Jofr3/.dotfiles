import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const rows = legalAttackCorpus();
const t = rows.filter(([, s]) => splitAttackTrailingClause(s) !== null);
const g = rows.filter(([, s]) => splitAttackGateClause(s) !== null);
console.log("trailing:", t.length, "gate:", g.length);
console.log("T[0]:", JSON.stringify(t[0]?.[1]));
console.log("G[0]:", JSON.stringify(g[0]?.[1]));
