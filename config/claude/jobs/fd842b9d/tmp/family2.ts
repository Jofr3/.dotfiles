import { readFileSync } from "node:fs";
import * as eff from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const src = readFileSync("packages/engine/src/censusAttackCorpus.ts", "utf8");
const lines = src.split("\n");
type Row = { fileLine: number; printings: number; text: string };
const rows: Row[] = [];
for (let i = 0; i < lines.length; i++) {
  const m = /^(\d+) (.+)$/.exec(lines[i]);
  if (m) rows.push({ fileLine: i + 1, printings: Number(m[1]), text: m[2] });
}
const readers = Object.entries(eff as Record<string, unknown>)
  .filter(([k, v]) => k.startsWith("deriveAttack") && typeof v === "function")
  .map(([k, v]) => [k, v as (s: string) => unknown] as const);
console.log("readers:", readers.map(([k]) => k).join(", "));
const BOTH = /(?=.*If heads,)(?=.*If tails,)/is;
for (const r of rows.filter((x) => BOTH.test(x.text))) {
  console.log(`\n--- file line ${r.fileLine}  ${r.printings}p`);
  console.log(`  «${r.text}»`);
  for (const [k, fn] of readers) {
    let v: unknown;
    try { v = fn(r.text); } catch (e) { v = `THREW ${e}`; }
    if (v !== null && v !== undefined) console.log(`    ${k} → ${JSON.stringify(v)}`);
  }
  const g = (eff as any).splitAttackGateClause?.(r.text);
  const t = (eff as any).splitAttackTrailingClause?.(r.text);
  console.log(`    splitAttackGateClause → ${JSON.stringify(g)}`);
  console.log(`    splitAttackTrailingClause → ${JSON.stringify(t)}`);
}
