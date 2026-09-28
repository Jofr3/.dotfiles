import { programFor } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui/packages/engine/src";
const MODULES = ["effects.ts","registry.ts","types.ts","interpreter.ts","index.ts","cardplay.ts","attack.ts","continuous.ts","flow.ts","redact.ts"];
const ID = /\b(?:sv|svp)[0-9.a-z]*-[0-9]+[a-z]?\b/g;
const WORD = /\b(?:unbuilt|not built|never built)\b/i;
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;
const RADIUS = 6;
let n = 0;
for (const f of MODULES) {
  const lines = readFileSync(`${ROOT}/${f}`, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!WORD.test(lines[i]) || !COMMENT.test(lines[i])) continue;
    let a = i, b = i;
    while (a > i - RADIUS && a > 0 && COMMENT.test(lines[a - 1])) a--;
    while (b < i + RADIUS && b < lines.length - 1 && COMMENT.test(lines[b + 1])) b++;
    const win = lines.slice(a, b + 1).join(" ");
    const built = [...new Set(win.match(ID) ?? [])].filter((id) => programFor(id) != null);
    if (built.length === 0) continue;
    n++;
    console.log(`\n[${n}] ${f}:${i + 1}   built ids in window: ${built.join(", ")}`);
    console.log(`    | ${lines[i].trim().slice(0, 150)}`);
  }
}
console.log(`\n=== ${n} violation window(s) ===`);
