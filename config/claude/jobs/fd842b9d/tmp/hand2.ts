import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const RX = /\bcards? in (?:your|their)(?: opponent's)? hand\b/;
const hits = legalAttackCorpus().filter(([, s]) => RX.test(s));
console.log("hand-SIZE-read rows:", hits.length, "printings:", hits.reduce((a,[n])=>a+n,0));
for (const [n, s] of hits) console.log(` ${n}p ${resolvedByAnyReader(s) ? "READ " : "UNREAD"} ${s}`);
