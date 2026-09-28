import { readFileSync, writeFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
const P = "/home/jofre/projects/luminous_ui/scripts/opaque-anatomy.ts";
const ROWS: [string, string, string][] = [
  ["D471-regions-never-separate",
   '    if (op === "=") {\n      cur = null;\n      continue;\n    }',
   '    if (op === "=") {\n      continue;\n    }'],
  ["D471-adjacent-edits-oversplit",
   '    if (cur === null) {\n      cur = { alen: 0, blen: 0 };\n      regions.push(cur);\n    }',
   '    cur = { alen: 0, blen: 0 };\n    regions.push(cur);'],
  ["D471-region-bound-not-applied",
   '    if (regions.some((r) => r.alen > submax || r.blen > submax)) continue;',
   '    void submax;'],
  ["D471-min-region-takes-the-first-hit",
   '    if (best === null || regions.length < best.k) best = { k: regions.length, onto, regions };',
   '    if (best === null) best = { k: regions.length, onto, regions };'],
  ["D471-continuous-declared-a-blocker",
   "    rx: /During your next turn|During your opponent's next turn|Until the end of/,\n    verdict: \"co-marker\",",
   "    rx: /During your next turn|During your opponent's next turn|Until the end of/,\n    verdict: \"blocker\","],
  ["D471-built-side-control-inverted",
   '    if (RESIDUE_TEXT.has(text)) {',
   '    if (!RESIDUE_TEXT.has(text)) {'],
  ["D471-co-marker-may-label",
   '    MARKERS.find((m) => m.verdict === "blocker" && m.rx.test(r.text)) ?? null;',
   '    MARKERS.find((m) => m.rx.test(r.text)) ?? null;'],
];
const original = readFileSync(P, "utf8");
const size0 = statSync(P).size;
for (const [id, find, repl] of ROWS) {
  if (find === repl) { console.log(`${id}  🛑 INERT (find === replace)`); continue; }
  const n = original.split(find).length - 1;
  if (n !== 1) { console.log(`${id}  🛑 find occurs ${n}×`); continue; }
  const mutated = original.replace(find, () => repl);   // FUNCTION replacement — never $-splices
  if (mutated === original) { console.log(`${id}  🛑 replacement changed nothing`); continue; }
  if (Math.abs(mutated.length - original.length) > 2000) {
    console.log(`${id}  🛑 SPLICE: ${original.length} → ${mutated.length}`); continue;
  }
  try {
    writeFileSync(P, mutated, "utf8");
    const r = spawnSync("bun", ["scripts/opaque-anatomy-gate.ts"], { cwd: "/home/jofre/projects/luminous_ui", encoding: "utf8" });
    const first = (r.stderr || r.stdout).split("\n").filter((l) => l.includes("🛑")).slice(0, 2).join(" ; ");
    console.log(`${id}  ${r.status === 0 ? "SURVIVES" : "KILLED"} (exit ${r.status})  ${first.slice(0, 200)}`);
  } finally {
    writeFileSync(P, original, "utf8");
  }
  const back = readFileSync(P, "utf8");
  if (back !== original || statSync(P).size !== size0) throw new Error(`${id}: RESTORE FAILED`);
}
console.log(`\nrestored: size ${statSync(P).size} === ${size0}`);
