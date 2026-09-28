import { readFileSync } from "node:fs";
import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";

const src = new Map<string, string>();
function sourceOf(f: string): string {
  let s = src.get(f);
  if (s === undefined) { s = readFileSync(f, "utf8"); src.set(f, s); }
  return s;
}
function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") out.push(i + 1);
  return out;
}
const starts = new Map<string, number[]>();
function startsOf(f: string): number[] {
  let s = starts.get(f);
  if (s === undefined) { s = lineStarts(sourceOf(f)); starts.set(f, s); }
  return s;
}
function lineOf(f: string, idx: number): number {
  const ls = startsOf(f);
  let lo = 0, hi = ls.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ls[mid]! <= idx) lo = mid; else hi = mid - 1; }
  return lo + 1; // 1-based
}

type Row = { id: string; file: string; a: number; b: number; occ: number };
const rows: Row[] = [];
for (const m of MUTANTS) {
  const text = sourceOf(m.file);
  let occ = 0, at = text.indexOf(m.find), first = -1;
  while (at !== -1) { if (first === -1) first = at; occ++; at = text.indexOf(m.find, at + m.find.length); }
  if (first === -1) { console.log(`ZERO-MATCH ${m.id} ${m.file}`); continue; }
  rows.push({ id: m.id, file: m.file, a: lineOf(m.file, first), b: lineOf(m.file, first + m.find.length - 1), occ });
}
console.log(`rows=${MUTANTS.length} resolved=${rows.length}`);
console.log(`multi-occurrence rows=${rows.filter(r => r.occ !== 1).length}`);
console.log(`multi-line finds=${rows.filter(r => r.b > r.a).length}`);

// A) STRICT: group by (file, startLine)
const byStart = new Map<string, Row[]>();
for (const r of rows) {
  const k = `${r.file}:${r.a}`;
  const arr = byStart.get(k); if (arr) arr.push(r); else byStart.set(k, [r]);
}
const startColl = [...byStart.entries()].filter(([, v]) => v.length > 1);
console.log(`\n=== A) LINES CARRYING >1 ROW (by START line): ${startColl.length} lines, ${startColl.reduce((s,[,v])=>s+v.length,0)} rows ===`);
for (const [k, v] of startColl.sort()) console.log(`  ${k}  (${v.length}) ${v.map(r=>`${r.id}[${r.a}-${r.b}]`).join(" | ")}`);

// B) OVERLAP: any shared line between two rows' spans
const byFile = new Map<string, Row[]>();
for (const r of rows) { const a = byFile.get(r.file); if (a) a.push(r); else byFile.set(r.file, [r]); }
const lineOwners = new Map<string, Row[]>();
for (const r of rows) for (let L = r.a; L <= r.b; L++) {
  const k = `${r.file}:${L}`; const a = lineOwners.get(k); if (a) a.push(r); else lineOwners.set(k, [r]);
}
const overlapLines = [...lineOwners.entries()].filter(([, v]) => v.length > 1);
console.log(`\n=== B) LINES TOUCHED BY >1 ROW (full span): ${overlapLines.length} lines ===`);
// group into clusters of row-sets
const clusters = new Map<string, {line: string; ids: string[]}[]>();
for (const [k, v] of overlapLines) {
  const key = v.map(r=>r.id).sort().join(" + ");
  const a = clusters.get(key); const e = {line: k, ids: v.map(r=>r.id)};
  if (a) a.push(e); else clusters.set(key, [e]);
}
console.log(`    distinct row-pair/set clusters: ${clusters.size}`);
for (const [key, ls] of [...clusters.entries()].sort()) {
  console.log(`  * ${key}`);
  console.log(`      lines: ${ls.map(x=>x.line).join(", ")}`);
}
