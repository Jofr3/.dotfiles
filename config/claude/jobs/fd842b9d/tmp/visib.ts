import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const rows = legalAttackCorpus().filter(([, s]) => resolvedByAnyReader(s));
console.log(JSON.stringify([rows.length, rows.reduce((s,[n])=>s+n,0)]));
