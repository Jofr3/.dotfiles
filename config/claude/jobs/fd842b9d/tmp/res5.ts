import { readFileSync } from "node:fs";
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const REG = readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/registry.ts","utf8");
const raw = legalAttackCorpus().filter(([,t])=>!resolvedByAnyReader(t));
const variants: [string,(t:string)=>boolean][] = [
  ["gate!=null (bare) + trail!=null + REGfile", t => splitAttackGateClause(t)!==null || splitAttackTrailingClause(t)!==null || REG.includes(t)],
  ["gate-resolving + trail!=null + REGfile", t => { const g=splitAttackGateClause(t); return (g!==null&&g.body!==""&&resolvedByAnyReader(g.body)) || splitAttackTrailingClause(t)!==null || REG.includes(t); }],
];
for (const [name,f] of variants) {
  const r = raw.filter(([,t])=>!f(t));
  console.log(name, "->", r.length, "/", r.reduce((a,[n])=>a+n,0));
}
