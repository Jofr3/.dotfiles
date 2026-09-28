import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const rows = legalAttackCorpus() as unknown as [number, string][];
const MORE = /more cards?/;
for (const [n, t] of rows) if (MORE.test(t)) console.log(n, "|", t, "| resolved:", (effects as any).resolvedByAnyReader?.(t));
console.log("--- 'more' anything ---");
for (const [n, t] of rows) if (/\b\d+ more\b/.test(t)) console.log(n, "|", t.slice(0,110));
