import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const rows = legalAttackCorpus() as unknown as [number,string][];
const claimed = rows.filter(([,t]) => resolvedByAnyReader(t));
console.log("resolvedByAnyReader sentences:", claimed.length, "printings:", claimed.reduce((s,[n])=>s+n,0));
console.log("reader surface length:", attackReaderSurface().length);
// which rows carry `Basic` AND are now claimed?
const basicClaimed = rows.filter(([,t]) => /\bBasic\b/.test(t) && resolvedByAnyReader(t));
console.log("\nrows with token `Basic` now claimed:", basicClaimed.length);
for (const [n,t] of basicClaimed) console.log(`  ${n}x  ${t}`);
