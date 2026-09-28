import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const RUN = readFileSync(`${ROOT}/scripts/mutation/run.ts`, "utf8");
const tm = /`\$\{killed\.length\} killed[^`]*`/.exec(RUN);
const template = tm[0].slice(1, -1);
const chunks = template.split(/\$\{[^}]*\}/);
const labels = chunks.slice(1, chunks.length - 1).map((c) => c.replace(/\s*·\s*$/, "").trim());
console.log("labels:", JSON.stringify(labels), "tail:", JSON.stringify(chunks[chunks.length-1]));
function flatten(text) {
  const out = []; const lineOf = []; let line = 1; let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n") { line += 1; i += 1;
      while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === ">")) i += 1;
      out.push(" "); lineOf.push(line); continue; }
    if (ch === "*" || ch === "`") { i += 1; continue; }
    out.push(ch); lineOf.push(line); i += 1;
  }
  return { flat: out.join(""), lineOf };
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const SEP = String.raw`\s*[·/]\s*`;
const CAND = new RegExp(`${NUM}\\s+${esc(labels[0])}${SEP}${NUM}\\s+${esc(labels[1])}`, "gi");
let cands = 0, viol = 0;
const byToken = {};
for (const f of ["docs/progress.md", "docs/decisions.md", "docs/conventions.md"]) {
  const { flat, lineOf } = flatten(readFileSync(`${ROOT}/${f}`, "utf8"));
  let n = 0, v = 0;
  for (const a of flat.matchAll(CAND)) {
    cands++; n++;
    let pos = a.index;
    for (let k = 0; k < labels.length; k++) {
      const step = new RegExp(`^(?:${k === 0 ? "" : SEP})(${NUM})\\s+(${esc(labels[k])})`, "i");
      const m = step.exec(flat.slice(pos, pos + 120));
      if (!m) break;
      if (m[2] !== labels[k]) {
        viol++; v++;
        const key = `${labels[k]} -> ${m[2]}`; if(labels[k]==="killed") console.log("KILLEDCASE", f, lineOf[a.index], JSON.stringify(flat.slice(a.index-60, a.index+140)));
        byToken[key] = (byToken[key] ?? 0) + 1;
        break;
      }
      pos += m[0].length;
    }
  }
  console.log(`${f}: candidates ${n}, violations ${v}`);
}
console.log({ cands, viol }, byToken);
