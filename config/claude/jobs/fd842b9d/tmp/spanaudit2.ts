import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const FILE = "packages/engine/src/effects.ts";
const src = readFileSync(`${ROOT}/${FILE}`, "utf8");
const lineStart: number[] = [0];
for (let i = 0; i < src.length; i++) if (src[i] === "\n") lineStart.push(i + 1);
const lineOf = (off: number) => { let lo = 0, hi = lineStart.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid] <= off) lo = mid; else hi = mid - 1; } return lo + 1; };
const spans = MUTANTS.filter((m) => m.file === FILE).map((m) => { const i = src.indexOf(m.find); return { id: m.id, decision: m.decision, a: lineOf(i), b: lineOf(i + m.find.length - 1) }; }).sort((x, y) => x.a - y.a);
// nearest neighbours around each target
for (const t of [10724, 10726, 11783, 23865, 23874, 24776]) {
  const before = [...spans].filter((s) => s.b < t).pop();
  const after = spans.find((s) => s.a > t);
  console.log(`target ${t}: prev=${before ? `${before.id}[${before.a}-${before.b}] gap ${t - before.b}` : "none"}  next=${after ? `${after.id}[${after.a}-${after.b}] gap ${after.a - t}` : "none"}`);
}
console.log("\nD239 rows:");
for (const s of spans.filter((s) => s.decision.includes("D239"))) console.log(`  ${s.id} [${s.a}-${s.b}]`);
