import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const RX = /up to the number of|number of cards up to/;
for (const [n, s] of legalAttackCorpus()) if (RX.test(s)) console.log(n + "p", resolvedByAnyReader(s) ? "BUILT " : "UNREAD", s);
