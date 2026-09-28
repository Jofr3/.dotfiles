import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const surface = attackReaderSurface();
const corpus = legalAttackCorpus() as unknown as [number, string][];
function show(s: string) {
  const vals: Record<string, unknown> = {};
  for (const n of surface) { let v: unknown; try { v = (effects as any)[n](s); } catch { v = null; } if (v !== null && v !== undefined) vals[n] = v; }
  console.log(`  ${JSON.stringify(s)}\n    => ${Object.keys(vals).length ? JSON.stringify(vals) : "REFUSED"}`);
}
console.log("=== every corpus sentence containing 'your hand' that BUILDS ===");
for (const [n, t] of corpus) {
  if (!/your hand/.test(t)) continue;
  const vals: string[] = [];
  for (const nm of surface) { let v: unknown; try { v = (effects as any)[nm](t); } catch { v = null; } if (v !== null && v !== undefined) vals.push(nm); }
  if (vals.length) { console.log(`${n}p [${vals.join(",")}]`); show(t); }
}
