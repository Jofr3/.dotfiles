import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
import { readFileSync } from "node:fs";
const M = MUTANTS as unknown as Array<Record<string, unknown>>;
const ROOT = "/home/jofre/projects/luminous_ui/";
// The SPAN of conditionHolds' yourEnergyInPlayAtLeast arm, and of conditionNote's.
const f = "packages/engine/src/interpreter.ts";
const s = readFileSync(ROOT + f, "utf8");
function span(startNeedle: string, endNeedle: string): [number, number] {
  const a = s.indexOf(startNeedle);
  if (a < 0) throw new Error("start not found: " + startNeedle);
  const b = s.indexOf(endNeedle, a);
  if (b < 0) throw new Error("end not found: " + endNeedle);
  return [a, b + endNeedle.length];
}
const REGIONS: [string, [number, number]][] = [
  ["conditionHolds yourEnergyInPlayAtLeast arm",
   span('    case "yourEnergyInPlayAtLeast":\n      // The board-wide fold',
        "return countEnergyInPlay(state, seat, cond.energy) >= cond.count;")],
  ["conditionNote yourEnergyInPlayAtLeast arm",
   span('    case "yourEnergyInPlayAtLeast":\n      // Built from BOTH parameters',
        "`you have at least ${cond.count} ${cond.energy} Energy in play`;")],
];
for (const [label, [lo, hi]] of REGIONS) {
  const line = s.slice(0, lo).split("\n").length;
  const hits = M.filter((m) => {
    if (m.file !== f) return false;
    const fd = String(m.find);
    const p = s.indexOf(fd);
    if (p < 0) return false;
    return p < hi && p + fd.length > lo;
  });
  console.log(`${label}  (line ${line}, ${hi - lo} bytes): ${hits.length} row(s) intersect by SPAN`);
  for (const h of hits) console.log("   ", h.id, "[" + h.decision + "]");
}
