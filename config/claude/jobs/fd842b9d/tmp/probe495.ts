import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const mod = E as unknown as Record<string, (s: string) => unknown>;
const built = (s: string) => names.filter((n) => { try { return mod[n]?.(s) != null; } catch { return false; } });
const split = (s: string) => ["splitAttackTrailingClause","splitAttackGateClause","splitAttackRequirementClause","splitAttackCancelClause"]
  .filter((n) => { try { return mod[n]?.(s) != null; } catch { return false; } });
const rows = legalAttackCorpus() as [number,string][];
const residue = rows.filter(([,t]) => built(t).length === 0 && split(t).length === 0);
console.log("residue (reader+splitter refused):", residue.length, "sentences,", residue.reduce((a,[n])=>a+n,0), "printings");
// group residue by leading 6 words to spot clusters
const key = (t:string) => t.split(/\s+/).slice(0,5).join(" ");
const m = new Map<string,[number,string][]>();
for (const r of residue) { const k = key(r[1]); m.set(k, [...(m.get(k)??[]), r]); }
const clusters = [...m.entries()].filter(([,v]) => v.length > 1).sort((a,b)=>b[1].length-a[1].length);
console.log("\n--- residue clusters by shared 5-word opening ---");
for (const [k,v] of clusters) console.log(`  ${v.length} rows / ${v.reduce((a,[n])=>a+n,0)}p :: ${k}…`);
