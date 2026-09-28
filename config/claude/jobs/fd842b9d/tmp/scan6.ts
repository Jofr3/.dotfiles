import { programFor } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui/packages/engine/src";
const MODULES = ["effects.ts","registry.ts","types.ts","interpreter.ts","cardplay.ts","attack.ts","continuous.ts","flow.ts","redact.ts"];
const ID = /\b(?:sv|svp)[0-9.a-z]*-[0-9]+[a-z]?\b/g;
const WORD = /\b(?:unbuilt|not built|never built)\b/i;
function commentMask(lines: readonly string[]): boolean[] {
  const mask: boolean[] = []; let inBlock = false;
  for (const line of lines) {
    if (inBlock) { mask.push(true); if (line.includes("*/")) inBlock = false; continue; }
    const open = line.indexOf("/*"); const lc = line.indexOf("//");
    if (open !== -1 && (lc === -1 || open < lc)) { mask.push(true); if (line.indexOf("*/", open + 2) === -1) inBlock = true; continue; }
    mask.push(lc !== -1);
  }
  return mask;
}
const RADIUS = 4;
const found = new Map<string, string[]>();
for (const f of MODULES) {
  const lines = readFileSync(`${ROOT}/${f}`, "utf8").split("\n");
  const mask = commentMask(lines);
  for (let i = 0; i < lines.length; i++) {
    if (!mask[i] || !WORD.test(lines[i])) continue;
    let a = i, b = i;
    while (a > i - RADIUS && a > 0 && mask[a - 1]) a--;
    while (b < i + RADIUS && b < lines.length - 1 && mask[b + 1]) b++;
    for (const id of new Set(lines.slice(a, b + 1).join(" ").match(ID) ?? [])) {
      if (programFor(id) != null) continue;
      const arr = found.get(id) ?? [];
      arr.push(`${f}:${i + 1}`);
      found.set(id, arr);
    }
  }
}
console.log(`${found.size} UNBUILT ids named inside a build-state refusal window:\n`);
for (const [id, sites] of [...found].sort()) console.log(`  ${id.padEnd(14)} ${sites.join("  ")}`);
