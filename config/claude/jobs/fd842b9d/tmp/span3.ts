import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const { MUTANTS } = await import(`${ROOT}/scripts/mutation/mutants.ts`);
const src = readFileSync(`${ROOT}/packages/engine/src/interpreter.ts`, "utf8");
const lines = src.split("\n");
function fnSpan(decl: string): [number, number] {
  const i = lines.findIndex((l) => l.startsWith(decl));
  if (i < 0) throw new Error("no decl " + decl);
  let j = i + 1;
  for (; j < lines.length; j++) if (lines[j] === "}") break;
  return [i + 1, j + 1];
}
function caseSpan(label: string): [number, number] {
  const i = lines.findIndex((l) => l.trim() === label);
  let depth = 0, j = i;
  for (; j < lines.length; j++) { if (lines[j].trim().startsWith("case ") && j > i) break; }
  return [i + 1, j];
}
const regions: [string, number, number][] = [
  ["attachFromHandOffer", ...fnSpan("function attachFromHandOffer(")],
  ["attachFromHandNote", ...fnSpan("function attachFromHandNote(")],
  ['case "attachFromHand"', ...caseSpan('case "attachFromHand": {')],
];
for (const [name, lo, hi] of regions) {
  const hits = (MUTANTS as any[]).filter((m) => {
    if (m.file !== "packages/engine/src/interpreter.ts") return false;
    const a = src.indexOf(m.find); if (a < 0) return false;
    const s = src.slice(0, a).split("\n").length, e = s + m.find.split("\n").length - 1;
    return s <= hi && e >= lo;
  });
  console.log(`${name}  lines ${lo}..${hi}  -> ${hits.length}: ${hits.map((h) => h.id).join(", ") || "NONE"}`);
}
