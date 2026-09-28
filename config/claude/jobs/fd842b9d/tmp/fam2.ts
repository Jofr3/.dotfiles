import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const P1 = /does \d+ (more |less )?damage for each /i;
console.log("=== IN 'for each' BUT NOT IN P1 ===");
let n=0,p=0;
for (const [c,t] of corpus) if (/for each\b/i.test(t) && !P1.test(t)) { n++;p+=c; console.log(c+"\t"+t); }
console.log(`-- ${n} sentences / ${p} printings`);
console.log("\n=== 'number of' NOT MATCHING P1 AND NOT 'for each' ===");
n=0;p=0;
for (const [c,t] of corpus) if (/number of/i.test(t) && !/for each\b/i.test(t)) { n++;p+=c; console.log(c+"\t"+t); }
console.log(`-- ${n} sentences / ${p} printings`);
