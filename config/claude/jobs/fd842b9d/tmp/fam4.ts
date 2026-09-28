import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
console.log("=== ALL 'less damage' anywhere in corpus (any shape) ===");
for (const [c,t] of corpus) if (/less damage/i.test(t)) console.log(`${c}\t${resolvedByAnyReader(t)?"BUILT ":"UNBUILT"}\t${t}`);
console.log("\n=== ALL 'minus'/'reduced by' scaling ===");
for (const [c,t] of corpus) if (/reduced by|minus \d/i.test(t)) console.log(`${c}\t${t}`);
