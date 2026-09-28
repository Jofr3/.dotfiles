// Span audit: resolve every mutant row's `find` to a line span in its target file,
// then report every row whose span intersects a named region.
import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
import { readFileSync } from "node:fs";

const ROOT = "/home/jofre/projects/luminous_ui";
const cache = new Map<string, string>();
function src(f: string): string {
  let s = cache.get(f);
  if (s === undefined) { s = readFileSync(`${ROOT}/${f}`, "utf8"); cache.set(f, s); }
  return s;
}

let resolved = 0, zero = 0, multi = 0;
type Row = { id: string; decision: string; file: string; start: number; end: number };
const rows: Row[] = [];
for (const m of MUTANTS) {
  let text: string;
  try { text = src(m.file); } catch { console.log(`MISSING FILE ${m.file} (${m.id})`); continue; }
  const first = text.indexOf(m.find);
  if (first < 0) { zero++; console.log(`0x ${m.id} ${m.file}`); continue; }
  const second = text.indexOf(m.find, first + 1);
  if (second >= 0) { multi++; console.log(`2x+ ${m.id} ${m.file}`); }
  resolved++;
  const start = text.slice(0, first).split("\n").length;          // 1-based
  const end = start + m.find.split("\n").length - 1;
  rows.push({ id: m.id, decision: m.decision, file: m.file, start, end });
}
console.log(`\nCORPUS: ${MUTANTS.length} rows · resolved ${resolved} · 0x ${zero} · 2x+ ${multi}\n`);

const TARGET = "packages/engine/src/censusAttackCorpus.ts";
const regions: [string, number, number][] = [
  ["legalAttackCorpus() 698-716", 698, 716],
  ["D418 doc block 719-780", 719, 780],
  ["SURFACE decl + surface() 775-797", 775, 797],
  ["surface() body 782-797", 782, 797],
  ["attackReaderSurface() 799-803", 799, 803],
  ["resolvedByAnyReader() 805-816", 805, 816],
  ["WHOLE FILE", 1, 10_000_000],
];
for (const [name, lo, hi] of regions) {
  const hits = rows.filter((r) => r.file === TARGET && r.start <= hi && r.end >= lo);
  console.log(`${name.padEnd(36)} -> ${hits.length} row(s)`);
  for (const h of hits) console.log(`     ${h.id}  [${h.decision}]  L${h.start}-${h.end}`);
}
