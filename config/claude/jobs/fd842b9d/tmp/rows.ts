import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
for (const [n, t] of legalAttackCorpus()) if (t.includes("Prize card your opponent has taken")) console.log(n, "|", t);
