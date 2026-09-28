// Witness scan. (1) sentence-quoting sites: any file holding the printed bytes.
// (2) predicate-held sites: any `*.test.ts` string literal the NEW anchor would claim.
import { Glob } from "bun";
const ROOT = "/home/jofre/projects/luminous_ui/";
const SENT =
  "Flip a coin. If tails, this attack does nothing. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.";
// The anchor this slice intends (apostrophe class, whole-sentence):
const NEW_ANCHOR =
  /^Flip a coin\. If tails, this attack does nothing\. If heads, during your opponent['’]s next turn, prevent all damage from and effects of attacks done to this Pokémon\.$/;

const files: string[] = [];
for (const dir of ["packages", "apps", "src", "scripts"]) {
  for await (const f of new Glob("**/*.{ts,tsx}").scan({ cwd: ROOT + dir, absolute: true })) {
    files.push(f);
  }
}
console.log("scanned " + files.length + " source files");
console.log("");
console.log("=== (1) SENTENCE-QUOTING: files containing the printed bytes ===");
for (const f of files) {
  const s = await Bun.file(f).text();
  if (!s.includes(SENT)) continue;
  const n = s.split(SENT).length - 1;
  console.log("   " + f.replace(ROOT, "") + "  x" + n);
}
console.log("");
console.log("=== (2) any *.test.ts double-quoted literal the NEW anchor claims ===");
for (const f of files) {
  if (!f.endsWith(".test.ts")) continue;
  const s = await Bun.file(f).text();
  for (const m of s.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    let lit: string;
    try {
      lit = JSON.parse('"' + m[1] + '"') as string;
    } catch {
      continue;
    }
    if (NEW_ANCHOR.test(lit)) {
      const line = s.slice(0, m.index).split("\n").length;
      console.log("   " + f.replace(ROOT, "") + ":" + line + "  " + JSON.stringify(lit).slice(0, 90));
    }
  }
}
console.log("");
console.log("=== (3) partial: files quoting the HEADS half or the TAILS half ===");
const HALF_H = "If heads, during your opponent's next turn, prevent all damage from and effects";
const HALF_T = "Flip a coin. If tails, this attack does nothing.";
for (const f of files) {
  const s = await Bun.file(f).text();
  const h = s.split(HALF_H).length - 1;
  const t = s.split(HALF_T).length - 1;
  if (h + t === 0) continue;
  console.log("   " + f.replace(ROOT, "") + "  headsHalf=" + h + " tailsHalf=" + t);
}
