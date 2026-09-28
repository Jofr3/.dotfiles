import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
import { readFileSync } from "node:fs";

const ROOT = "/home/jofre/projects/luminous_ui";
const TARGETS: Array<[string, number]> = [
  ["FLIP_PREVENT_DAMAGE_AND_EFFECTS declaration", 10724],
  ["FLIP_PREVENT_DAMAGE declaration", 10726],
  ["FLIP_TAILS_SELF_CANT_ATTACK declaration", 11783],
  ["arm 19b and-effects branch", 23865],
  ["arm 19b bare branch", 23874],
  ["arm 26 tails self-lock", 24776],
];
const FILE = "packages/engine/src/effects.ts";
const src = readFileSync(`${ROOT}/${FILE}`, "utf8");
// line offsets
const lineStart: number[] = [0];
for (let i = 0; i < src.length; i++) if (src[i] === "\n") lineStart.push(i + 1);
const lineOf = (off: number) => {
  let lo = 0, hi = lineStart.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid] <= off) lo = mid; else hi = mid - 1; }
  return lo + 1;
};

const inFile = MUTANTS.filter((m) => m.file === FILE);
console.log(`TOTAL ROWS: ${MUTANTS.length}`);
console.log(`ROWS TARGETING ${FILE}: ${inFile.length}`);

const spans: Array<{ id: string; decision: string; a: number; b: number }> = [];
let missing = 0;
for (const m of inFile) {
  const idx = src.indexOf(m.find);
  if (idx < 0) { missing++; console.log(`  !! find not found: ${m.id}`); continue; }
  const idx2 = src.indexOf(m.find, idx + 1);
  if (idx2 >= 0) console.log(`  !! find occurs 2+: ${m.id}`);
  spans.push({ id: m.id, decision: m.decision, a: lineOf(idx), b: lineOf(idx + m.find.length - 1) });
}
console.log(`spans resolved: ${spans.length}, missing: ${missing}`);
console.log("");
for (const [name, line] of TARGETS) {
  for (const pad of [0, 6, 20]) {
    const lo = line - pad, hi = line + pad;
    const hits = spans.filter((s) => s.a <= hi && s.b >= lo);
    console.log(`${name} (line ${line}) ±${pad}: ${hits.length} rows${hits.length ? " -> " + hits.map((h) => `${h.id}[${h.a}-${h.b}]`).join(", ") : ""}`);
  }
  console.log("");
}
