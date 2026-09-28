import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const { MUTANTS } = await import(`${ROOT}/scripts/mutation/mutants.ts`);
const FN = [
  ["packages/engine/src/interpreter.ts", "attachFromHandOffer"],
  ["packages/engine/src/interpreter.ts", "attachFromHandNote"],
  ["packages/engine/src/interpreter.ts", 'case "attachFromHand"'],
  ["packages/engine/src/attack.ts", "function applyAttackPreDamage"],
  ["packages/engine/src/attack.ts", "function stripPreDamage"],
  ["packages/engine/src/attack.ts", "type AttackPreDamageResult"],
] as const;
const cache = new Map<string,string>();
const read = (f:string)=>{if(!cache.has(f))cache.set(f,readFileSync(`${ROOT}/${f}`,"utf8"));return cache.get(f)!;};
for (const [file, marker] of FN) {
  const src = read(file);
  const at = src.indexOf(marker);
  if (at < 0) { console.log(`?? marker not found: ${marker}`); continue; }
  const startLine = src.slice(0,at).split("\n").length;
  // crude end: next line that is "}" at col 0 after start
  const lines = src.split("\n");
  let end = startLine;
  for (let i = startLine; i < lines.length; i++) { if (lines[i] === "}") { end = i+1; break; } }
  const hits = (MUTANTS as any[]).filter((m) => {
    if (m.file !== file) return false;
    const a = src.indexOf(m.find); if (a < 0) return false;
    const s = src.slice(0,a).split("\n").length, e = s + m.find.split("\n").length - 1;
    return s <= end && e >= startLine;
  });
  console.log(`${file}  ${marker}  lines ${startLine}..${end}  -> ${hits.length} row(s): ${hits.map((h)=>h.id).join(", ") || "NONE"}`);
}
