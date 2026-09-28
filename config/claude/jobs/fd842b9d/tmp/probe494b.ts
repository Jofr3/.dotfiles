import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const rows = legalAttackCorpus() as [number,string][];
const pat = /^If you have /;
const hits = rows.filter(([,t]) => pat.test(t));
console.log("corpus rows opening 'If you have':", hits.length, "printings", hits.reduce((a,[n])=>a+n,0));
for (const [n,t] of hits) console.log("  ", n+"p", t.slice(0,120));
console.log("--- Energy-in-play threshold anywhere ---");
const en = rows.filter(([,t]) => /Energy in play/.test(t));
for (const [n,t] of en) console.log("  ", n+"p", t.slice(0,120));
