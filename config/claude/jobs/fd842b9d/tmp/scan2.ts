import { programFor } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
import { readFileSync, readdirSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui/packages/engine/src";
const ID = /\b(?:sv|svp)[0-9.a-z]*-[0-9]+[a-z]?\b/g;
const files = readdirSync(ROOT).filter((f) => f.endsWith(".ts"));
// present-tense build-state refusal words only
const WORD = /\b(?:unbuilt|not built|never built)\b/i;

for (const f of files) {
  const text = readFileSync(`${ROOT}/${f}`, "utf8");
  const lines = text.split("\n");
  // reconstruct comment prose per contiguous comment run, keep line numbers
  for (let i = 0; i < lines.length; i++) {
    if (!WORD.test(lines[i])) continue;
    // sentence window: join the comment run around line i, then split into sentences
    let a = i, b = i;
    const isComment = (s: string) => /^\s*(?:\/\/|\/\*|\*|\/\*\*)/.test(s);
    if (!isComment(lines[i])) continue;
    while (a > 0 && isComment(lines[a - 1])) a--;
    while (b < lines.length - 1 && isComment(lines[b + 1])) b++;
    const strip = (s: string) => s.replace(/^\s*(?:\/\*\*|\/\*|\*\/|\/\/|\*)\s?/, "");
    const prose = lines.slice(a, b + 1).map(strip).join(" ");
    for (const sent of prose.split(/(?<=[.!?])\s+/)) {
      if (!WORD.test(sent)) continue;
      const ids = [...new Set(sent.match(ID) ?? [])];
      const built = ids.filter((id) => programFor(id) != null);
      if (built.length === 0) continue;
      console.log(`\n${f}:${i + 1}  [${built.join(", ")}]`);
      console.log(`   ${sent.replace(/\s+/g, " ").slice(0, 300)}`);
    }
  }
}
