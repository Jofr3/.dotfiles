import { programFor } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
import { readFileSync, readdirSync } from "node:fs";

const ID = /\b(?:sv|svp)[0-9.a-z]*-[0-9]+[a-z]?\b/g;
const files = readdirSync("/home/jofre/projects/luminous_ui/packages/engine/src").filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const REFUSAL = /\b(?:still unbuilt|STILL UNBUILT|unbuilt|not built|priced and declined|declined and priced|declined|refused here|cannot be built|no registry row)\b/i;

let hits = 0;
for (const f of files) {
  const text = readFileSync(`/home/jofre/projects/luminous_ui/packages/engine/src/${f}`, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!REFUSAL.test(lines[i])) continue;
    // window: the refusal line plus one line either side (ids often wrap)
    const win = [lines[i - 1] ?? "", lines[i], lines[i + 1] ?? ""].join(" ");
    const ids = [...new Set(win.match(ID) ?? [])];
    const built = ids.filter((id) => programFor(id) != null);
    if (built.length > 0) {
      hits++;
      console.log(`${f}:${i + 1}  BUILT-YET-REFUSED: ${built.join(", ")}`);
      console.log(`    ${lines[i].trim().slice(0, 170)}`);
    }
  }
}
console.log(`\n${hits} refusal line(s) naming a card that HAS a registry program.`);
