import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const RUN = readFileSync(`${ROOT}/scripts/mutation/run.ts`, "utf8");

const tm = /`\$\{killed\.length\} killed[^`]*`/.exec(RUN);
if (!tm) throw new Error("template not found");
const template = tm[0].slice(1, -1);
const chunks = template.split(/\$\{[^}]*\}/);
console.log("chunks:", JSON.stringify(chunks));
// chunks[0] === "" ; chunks[1..7] = " <label> · " ; chunks[8] = "s total\\n"
const labels = chunks.slice(1, 8).map((c) => c.replace(/\s*·\s*$/, "").trim());
console.log("labels:", JSON.stringify(labels));
const sep = /·/.test(chunks[1]) ? "·" : "?";
console.log("sep:", sep, "tail:", JSON.stringify(chunks[8]));

function flatten(text) {
  const out = []; const lineOf = []; let line = 1; let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n") {
      line += 1; i += 1;
      while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === ">")) i += 1;
      out.push(" "); lineOf.push(line); continue;
    }
    if (ch === "*" || ch === "`") { i += 1; continue; }
    out.push(ch); lineOf.push(line); i += 1;
  }
  return { flat: out.join(""), lineOf };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const SEP = String.raw`\s*[·/]\s*`;

let total = 0, viol = 0, oos = 0;
for (const f of ["docs/progress.md", "docs/decisions.md", "docs/conventions.md"]) {
  const raw = readFileSync(`${ROOT}/${f}`, "utf8");
  const { flat, lineOf } = flatten(raw);
  const anchor = new RegExp(`${NUM}\\s+${esc(labels[0])}`, "gi");
  for (const a of flat.matchAll(anchor)) {
    total++;
    let pos = a.index;
    let k = 0;
    for (;;) {
      const step = new RegExp(`^(?:${k === 0 ? "" : SEP})(${NUM})\\s+(${esc(labels[k])})`, "i");
      const m = step.exec(flat.slice(pos, pos + 200));
      if (!m) { if (k > 1) { /* truncated or other format */ } break; }
      if (m[2] !== labels[k]) {
        viol++;
        console.log(`VIOL ${f}:${lineOf[pos]} expected ${JSON.stringify(labels[k])} got ${JSON.stringify(m[2])}  :: ${flat.slice(a.index, a.index + 120)}`);
        break;
      }
      pos += m[0].length;
      k++;
      if (k === labels.length) break;
    }
    if (k === 0) { }
    if (k === 1) { oos++; }
  }
  console.log(`-- ${f}: anchors so far ${total}`);
}
console.log({ total, viol, oos });
