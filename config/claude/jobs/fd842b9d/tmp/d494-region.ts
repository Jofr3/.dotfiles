import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
import { readFileSync } from "node:fs";
const M = MUTANTS as unknown as Array<Record<string, unknown>>;
const ROOT = "/home/jofre/projects/luminous_ui/";
// Lines I intend to CHANGE (not merely insert beside). Given as exact source substrings.
const TARGETS: [string, string][] = [
  ["packages/engine/src/effects.ts", `  | { kind: "yourEnergyInPlayAtLeast"; energy: BasicEnergyType | "special"; count: number }`],
  ["packages/engine/src/effects.ts", `  const conditional = CONDITIONAL_DAMAGE_BONUS.exec(effect);`],
  ["packages/engine/src/effects.ts", `    "you have at least 3 {D} Energy in play",`],
  ["packages/engine/src/effects.ts", `  const trimmed = text.trim();`],
  ["packages/engine/src/interpreter.ts", `      return cond.energy === "special"`],
  ["packages/engine/src/interpreter.ts", `      return countEnergyInPlay(state, seat, cond.energy) >= cond.count;`],
];
const cache = new Map<string, string>();
const src = (f: string) => { if (!cache.has(f)) cache.set(f, readFileSync(ROOT + f, "utf8")); return cache.get(f) as string; };
for (const [file, needle] of TARGETS) {
  const s = src(file);
  const at = s.indexOf(needle);
  const n = s.split(needle).length - 1;
  const line = at < 0 ? -1 : s.slice(0, at).split("\n").length;
  console.log(`\n══ ${file}:${line}  (occurs ${n}×)\n   ${JSON.stringify(needle.slice(0, 90))}`);
  if (at < 0) { console.log("   !! NOT FOUND"); continue; }
  const lo = at, hi = at + needle.length;
  const hits = M.filter((m) => {
    if (m.file !== file) return false;
    const f = String(m.find);
    const p = s.indexOf(f);
    if (p < 0) return false;
    return p < hi && p + f.length > lo;
  });
  console.log(`   rows whose find SPAN intersects: ${hits.length}`);
  for (const h of hits) console.log(`      ${h.id}  [${h.decision}]`);
  // also: rows whose find merely CONTAINS the needle text
  const contains = M.filter((m) => m.file === file && String(m.find).includes(needle));
  console.log(`   rows whose find CONTAINS the line: ${contains.length}`);
  for (const h of contains) console.log(`      ${h.id}  [${h.decision}]`);
}
