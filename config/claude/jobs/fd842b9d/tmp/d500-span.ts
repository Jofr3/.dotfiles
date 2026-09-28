// D453/D496 — measure coverage by SPAN, not by decision id.
import { readFileSync } from "node:fs";
import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
type Row = { id: string; decision: string; file: string; find: string };
const rows = MUTANTS as unknown as Row[];
const ROOT = "/home/jofre/projects/luminous_ui/";
// the lines D500 added or changed, per file, from git diff
import { execSync } from "node:child_process";
const diff = execSync("git diff -U0 -- packages/engine/src/effects.ts packages/engine/src/continuous.ts packages/engine/src/interpreter.ts", { cwd: ROOT, maxBuffer: 1 << 28 }).toString();
const touched: Record<string, Set<number>> = {};
let file = "";
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) { file = line.slice(6); touched[file] ??= new Set(); continue; }
  const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (m && file) { const start = Number(m[1]); const n = m[2] === undefined ? 1 : Number(m[2]); for (let i = 0; i < n; i++) touched[file]!.add(start + i); }
}
for (const [f, s] of Object.entries(touched)) console.log(`${f}: ${s.size} new/changed line(s)`);
// resolve every row's find to a line span and intersect
const cache: Record<string, string[]> = {};
const hits: Record<string, string[]> = {};
for (const r of rows) {
  const t = touched[r.file];
  if (t === undefined) continue;
  cache[r.file] ??= readFileSync(ROOT + r.file, "utf8").split("\n");
  const src = readFileSync(ROOT + r.file, "utf8");
  const idx = src.indexOf(r.find);
  if (idx < 0) continue;
  const startLine = src.slice(0, idx).split("\n").length;
  const endLine = startLine + r.find.split("\n").length - 1;
  for (let l = startLine; l <= endLine; l++) if (t.has(l)) { (hits[r.file] ??= []).push(`${r.decision} ${r.id} @${startLine}-${endLine}`); break; }
}
console.log("\nROWS INTERSECTING D500's NEW/CHANGED LINES BY SPAN:");
for (const [f, list] of Object.entries(hits)) { console.log("  " + f); for (const h of [...new Set(list)]) console.log("     " + h); }
if (Object.keys(hits).length === 0) console.log("   (none)");
