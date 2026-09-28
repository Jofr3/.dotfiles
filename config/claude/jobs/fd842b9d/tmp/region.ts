import { readFileSync } from "node:fs";
const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const FILE = "packages/engine/src/effects.ts";
const src = readFileSync("/home/jofre/projects/luminous_ui/" + FILE, "utf8");
// regions I intend to touch, as [startLine, endLine] 1-based
const regions: Array<[number, number, string]> = [
  [9540, 9600, "anchor block + doc"],
  [20590, 20720, "deriveAttackEffect arms 1..2d"],
];
const lineOf = (idx: number) => src.slice(0, idx).split("\n").length;
for (const m of MUTANTS as any[]) {
  if (m.file !== FILE) continue;
  const at = src.indexOf(m.find);
  if (at < 0) { console.log(`!! ${m.id} find NOT FOUND`); continue; }
  const s = lineOf(at), e = lineOf(at + m.find.length);
  for (const [a, b, name] of regions) {
    if (s <= b && e >= a) console.log(`IN-REGION [${name}] ${m.id}  lines ${s}-${e}  killers=${(m.expectKilledBy ?? []).join(",")}`);
  }
}
