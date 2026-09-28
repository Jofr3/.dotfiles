import { programFor } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui/packages/engine/src";
const MODULES = ["effects.ts","registry.ts","types.ts","interpreter.ts","cardplay.ts","attack.ts","continuous.ts","flow.ts","redact.ts"];
const ID = /\b(?:sv|svp)[0-9.a-z]*-[0-9]+[a-z]?\b/g;
const WORD = /\b(?:unbuilt|not built|never built)\b/i;
const RADIUS = 6;

/** true for every line that is inside a comment (block or line). */
function commentMask(lines: readonly string[]): boolean[] {
  const mask: boolean[] = [];
  let inBlock = false;
  for (const line of lines) {
    if (inBlock) {
      mask.push(true);
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    const open = line.indexOf("/*");
    const lineComment = line.indexOf("//");
    if (open !== -1 && (lineComment === -1 || open < lineComment)) {
      mask.push(true);
      if (line.indexOf("*/", open + 2) === -1) inBlock = true;
      continue;
    }
    mask.push(lineComment !== -1);
  }
  return mask;
}

let n = 0;
for (const f of MODULES) {
  const lines = readFileSync(`${ROOT}/${f}`, "utf8").split("\n");
  const mask = commentMask(lines);
  for (let i = 0; i < lines.length; i++) {
    if (!mask[i] || !WORD.test(lines[i])) continue;
    let a = i, b = i;
    while (a > i - RADIUS && a > 0 && mask[a - 1]) a--;
    while (b < i + RADIUS && b < lines.length - 1 && mask[b + 1]) b++;
    const win = lines.slice(a, b + 1).join(" ");
    const built = [...new Set(win.match(ID) ?? [])].filter((id) => programFor(id) != null);
    if (built.length === 0) continue;
    n++;
    console.log(`\n[${n}] ${f}:${i + 1}   built: ${built.join(", ")}`);
    console.log(`    | ${lines[i].trim().slice(0, 160)}`);
  }
}
console.log(`\n=== ${n} violation window(s) ===`);
