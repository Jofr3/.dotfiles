import { programFor } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui/packages/engine/src";
const MODULES = ["effects.ts","registry.ts","types.ts","interpreter.ts","cardplay.ts","attack.ts","continuous.ts","flow.ts","redact.ts"];
const ID = /\b(?:sv|svp)[0-9.a-z]*-[0-9]+[a-z]?\b/g;
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
const cited = new Map<string, number>();
for (const f of MODULES) {
  const lines = readFileSync(`${ROOT}/${f}`, "utf8").split("\n");
  const mask = commentMask(lines);
  for (let i = 0; i < lines.length; i++) {
    if (!mask[i]) continue;
    for (const id of lines[i].match(ID) ?? []) cited.set(id, (cited.get(id) ?? 0) + 1);
  }
}
const ids = [...cited.keys()].sort();
const built = ids.filter((id) => programFor(id) != null);
console.log(`distinct ids cited in doc blocks of ${MODULES.length} modules: ${ids.length}`);
console.log(`  built:   ${built.length}`);
console.log(`  unbuilt: ${ids.length - built.length}`);
