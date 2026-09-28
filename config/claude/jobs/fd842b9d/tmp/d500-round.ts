// D488 — a rounded assertion has a SOLUTION SET; derive the numerator by INTERSECTION.
// Reproduce `inRows` and `unbuiltAttack` exactly as censusAtHead.test.ts computes them.
import { readFileSync } from "node:fs";
const src = readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts", "utf8");
// locate the `it(` the rung lives in and print the two bindings' source lines
const lines = src.split("\n");
for (let i = 6380; i < 6463; i++) {
  const t = lines[i] ?? "";
  if (/const (inRows|unbuiltAttack)\b/.test(t)) console.log(i + 1, t.split("  //")[0]);
}
