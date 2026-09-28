import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const rows = legalAttackCorpus();
const hand = rows.filter(([, s]) => /hand/.test(s));
console.log("rows mentioning 'hand':", hand.length);
const unread = hand.filter(([, s]) => !resolvedByAnyReader(s));
console.log("...unread:", unread.length);
for (const [n, s] of unread) console.log(` ${n}p ${s}`);
