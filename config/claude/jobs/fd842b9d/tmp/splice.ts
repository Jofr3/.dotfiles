import { readFileSync } from "node:fs";
const m = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const rows = ((m as any).MUTANTS ?? (m as any).default) as any[];
const cache = new Map<string, string>();
let bad = 0;
for (const r of rows) {
  let text = cache.get(r.file);
  if (text === undefined) {
    try { text = readFileSync(`/home/jofre/projects/luminous_ui/${r.file}`, "utf8"); }
    catch { continue; }
    cache.set(r.file, text);
  }
  if (!text.includes(r.find)) continue;
  const viaReplace = text.replace(r.find, r.replace);
  const literal = text.split(r.find).join(r.replace);
  if (viaReplace !== literal) {
    bad++;
    console.log(`SPLICED: ${r.id}  [${r.file}]  ${viaReplace.length - literal.length} extra bytes`);
  }
}
console.log(`checked ${rows.length} rows — ${bad} corrupted by String.replace's $ patterns`);
