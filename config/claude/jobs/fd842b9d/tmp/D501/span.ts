import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
type Row = { id: string; decision: string; what: string; file: string; find: string; replace: string; survives?: unknown };
const rows = MUTANTS as unknown as Row[];
const REGIONS: [string, number, number, string][] = [
  ["packages/engine/src/attack.ts", 1366, 1402, "§8 step 3 — the CONFUSION FLIP block"],
  ["packages/engine/src/types.ts", 30, 70, "SpecialConditions + noConditions + presentStatuses"],
  ["packages/engine/src/interpreter.ts", 6125, 6155, "applyStatus's three arms"],
  ["packages/engine/src/effects.ts", 12445, 12452, "DEFENDER_POISON_N anchor"],
  ["packages/engine/src/effects.ts", 22455, 22475, "arm 5 — DEFENDER_POISON_N"],
];
const cache = new Map<string, string>();
async function text(f: string) {
  if (!cache.has(f)) cache.set(f, await Bun.file(`/home/jofre/projects/luminous_ui/${f}`).text());
  return cache.get(f)!;
}
for (const [file, lo, hi, label] of REGIONS) {
  const src = await text(file);
  const hits: string[] = [];
  let broken = 0;
  for (const r of rows) {
    if (r.file !== file) continue;
    const n = src.split(r.find).length - 1;
    if (n !== 1) { broken++; continue; }
    const at = src.indexOf(r.find);
    const startLine = src.slice(0, at).split("\n").length;
    const endLine = startLine + r.find.split("\n").length - 1;
    if (endLine >= lo && startLine <= hi) hits.push(`${r.id}  lines ${startLine}-${endLine}${r.survives ? "  SURVIVOR" : ""}`);
  }
  console.log(`\n### ${file}:${lo}-${hi}  (${label})`);
  console.log(`    rows intersecting by SPAN: ${hits.length}${broken ? `   [${broken} row(s) in this file whose find does not occur exactly once — precheck's job]` : ""}`);
  for (const h of hits) console.log(`      ${h}`);
}
