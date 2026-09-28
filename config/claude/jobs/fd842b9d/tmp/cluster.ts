import * as fs from "node:fs";
const rows = fs.readFileSync(process.env.CLAUDE_JOB_DIR + "/tmp/residue.tsv", "utf8")
  .split("\n").filter(Boolean)
  .map((l) => { const i = l.indexOf("\t"); return [Number(l.slice(0, i)), l.slice(i + 1)] as const; });

function shape(s: string): string {
  return s
    .replace(/\d+/g, "N")
    .replace(/\{[A-Z]\}/g, "{E}")
    .replace(/\b(Basic|Stage N|Evolution|Ancient|Future|Tera|Team Rocket's|[A-Z][a-z]+'s)\b/g, "<Q>");
}
const byShape = new Map<string, { n: number; s: string }[]>();
for (const [n, s] of rows) {
  const k = shape(s);
  if (!byShape.has(k)) byShape.set(k, []);
  byShape.get(k)!.push({ n, s });
}
const out = [...byShape.entries()]
  .map(([k, v]) => ({ k, sentences: v.length, printings: v.reduce((a, b) => a + b.n, 0), v }))
  .sort((a, b) => b.printings - a.printings || b.sentences - a.sentences);
for (const g of out) {
  if (g.sentences < 2) continue;
  console.log(`### ${g.sentences} sentences / ${g.printings} printings :: ${g.k}`);
  for (const x of g.v) console.log(`    ${x.n}  ${x.s}`);
}
console.log("\n--- singleton shapes:", out.filter(g=>g.sentences===1).length, "sentences,", out.filter(g=>g.sentences===1).reduce((a,b)=>a+b.printings,0), "printings");
