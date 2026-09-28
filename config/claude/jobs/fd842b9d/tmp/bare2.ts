import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
for (const [n,s] of legalAttackCorpus()) if (s.includes("now Paralyzed")) console.log(n, JSON.stringify(s));
