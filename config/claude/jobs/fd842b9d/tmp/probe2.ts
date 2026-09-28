import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
console.log("rows", corpus.length, "printings", corpus.reduce((s,[n])=>s+n,0));
const NEW = /^This attack does (\d+) damage for each of your ((?!opponent)[^.]+) that has any damage counters on it\.$/;
console.log("--- new anchor hits ---");
for (const [n,s] of corpus) if (NEW.test(s)) console.log(n, JSON.stringify(s), "built?", resolvedByAnyReader(s));
console.log("--- any 'damage counters on it' rows ---");
for (const [n,s] of corpus) if (s.includes("damage counters on it")) console.log(n, resolvedByAnyReader(s)?"BUILT":"----", JSON.stringify(s));
