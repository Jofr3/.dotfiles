import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const RUN = readFileSync(`${ROOT}/scripts/mutation/run.ts`, "utf8");
const template = /`\$\{killed\.length\} killed[^`]*`/.exec(RUN)[0].slice(1, -1);
const chunks = template.split(/\$\{[^}]*\}/);
const labels = chunks.slice(1, chunks.length - 1).map((c) => c.replace(/\s*·\s*$/, "").trim());
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
const NUM = String.raw`(?:\d[\d,]*(?:\.\d+)?|<n>)`;
const SEP = String.raw`\s*[·/]\s*`;
const CAND = new RegExp(`${NUM}\\s+${esc(labels[0])}${SEP}${NUM}\\s+${esc(labels[1])}`, "gi");
const CONT = new RegExp(`^${SEP}${NUM}\\s+\\S`);
const out = [];
for (const f of ["docs/progress.md", "docs/decisions.md", "docs/conventions.md"]) {
  const { flat, lineOf } = flatten(readFileSync(`${ROOT}/${f}`, "utf8"));
  for (const a of flat.matchAll(CAND)) {
    let pos = a.index;
    for (let k = 0; k < labels.length; k++) {
      const step = new RegExp(`^(?:${k === 0 ? "" : SEP})(${NUM})\\s+(${esc(labels[k])})`, "i");
      const m = step.exec(flat.slice(pos, pos + 120));
      if (m && m[2] === labels[k]) { pos += m[0].length; continue; }
      if (m) { out.push(`CASE ${f}:${lineOf[pos]} k=${k} want ${labels[k]} got ${m[2]}`); break; }
      if (k > 0 && CONT.test(flat.slice(pos, pos + 60))) {
        out.push(`CONT ${f}:${lineOf[pos]} k=${k} want ${labels[k]} :: ${JSON.stringify(flat.slice(pos, pos + 60))}`);
      }
      break;
    }
  }
}
const cont = out.filter((s) => s.startsWith("CONT"));
const cs = out.filter((s) => s.startsWith("CASE"));
console.log("CASE violations:", cs.length);
console.log("CONT violations:", cont.length);
for (const s of cont.slice(0, 40)) console.log(s);
