import { readFileSync } from "node:fs";
import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const src = new Map<string, string>();
const so = (f: string) => { let s = src.get(f); if (s === undefined) { s = readFileSync(f, "utf8"); src.set(f, s); } return s; };
type R = { id: string; file: string; s: number; e: number; find: string; what: string };
const rows: R[] = [];
for (const m of MUTANTS) {
  const t = so(m.file); const i = t.indexOf(m.find);
  if (i === -1) { console.log("ZERO " + m.id); continue; }
  rows.push({ id: m.id, file: m.file, s: i, e: i + m.find.length, find: m.find, what: m.what });
}
const byFile = new Map<string, R[]>();
for (const r of rows) { const a = byFile.get(r.file); if (a) a.push(r); else byFile.set(r.file, [r]); }
let overlapPairs = 0, identical = 0, contained = 0, partial = 0;
const out: string[] = [];
for (const [f, rs] of byFile) {
  rs.sort((a, b) => a.s - b.s);
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i]!, b = rs[j]!;
    if (b.s >= a.e) break;
    overlapPairs++;
    let kind: string;
    if (a.s === b.s && a.e === b.e) { kind = "IDENTICAL-SPAN"; identical++; }
    else if (b.s >= a.s && b.e <= a.e) { kind = "CONTAINED"; contained++; }
    else { kind = "PARTIAL"; partial++; }
    out.push(`${kind}\t${f}\t${a.id} [${a.s},${a.e})\t${b.id} [${b.s},${b.e})`);
  }
}
console.log(`overlapping char-span pairs: ${overlapPairs}  identical=${identical} contained=${contained} partial=${partial}`);
for (const l of out.filter(l=>l.startsWith("IDENTICAL"))) console.log(l);
