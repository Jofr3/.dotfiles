import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
import * as fs from "node:fs";
const files = new Map<string,string>();
const read = (f: string) => { if(!files.has(f)) files.set(f, fs.readFileSync("/home/jofre/projects/luminous_ui/"+f,"utf8")); return files.get(f)!; };
type R = {file:string;start:number;end:number;id:string};
const spans: R[] = [];
for (const m of MUTANTS as any[]) {
  let src: string; try { src = read(m.file); } catch { continue; }
  const i = src.indexOf(m.find); if (i < 0) continue;
  const start = src.slice(0,i).split("\n").length;
  const end = start + m.find.split("\n").length - 1;
  spans.push({file:m.file,start,end,id:m.id});
}
console.log("rows with resolved spans:", spans.length, "of", (MUTANTS as any[]).length);
const targets: [string,string][] = [
  ["packages/engine/src/censusAttackCorpus.ts","attackReaderSurface"],
  ["packages/engine/src/censusAttackCorpus.ts","legalAttackCorpus"],
];
for (const [file, fname] of targets) {
  const src = read(file); const lines = src.split("\n");
  const decl = lines.findIndex(l => l.includes("export function "+fname));
  if (decl < 0) { console.log(fname, "NOT FOUND"); continue; }
  // find end of function: next line at col 0 that is "}"
  let end = decl; for (let j = decl+1; j < lines.length; j++) { if (lines[j] === "}") { end = j; break; } }
  const inside = spans.filter(s => s.file === file && s.end >= decl+1 && s.start <= end+1);
  console.log(`${fname}  lines ${decl+1}-${end+1} (${end-decl+1} lines)  ROWS INSIDE: ${inside.length}`, inside.map(s=>s.id).join(","));
}
