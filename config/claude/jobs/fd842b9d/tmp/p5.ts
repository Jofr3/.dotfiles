import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { resolvedByAnyReader as nowR, } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause as nowG, splitAttackTrailingClause as nowT } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { resolvedByAnyReader as oldR } from "/home/jofre/projects/luminous_ui/tmp/d514head/engine/src/censusAttackCorpus";
import { splitAttackGateClause as oldG, splitAttackTrailingClause as oldT } from "/home/jofre/projects/luminous_ui/tmp/d514head/engine/src/effects";
import * as fs from "node:fs";
const src = fs.readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts", "utf8");
const h = src.indexOf("const REGISTRY_ATTACKS: readonly (readonly [string, string])[] = [");
const e = src.indexOf("\n];", h);
const block = src.slice(h, e).split("\n").map((l) => l.replace(/\s*\/\/.*$/, "")).join("\n");
const PAIR = /\[\s*"(sv[a-z0-9.]*-\d+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/g;
const REG = new Set<string>();
let pairs = 0;
for (const m of block.matchAll(PAIR)) { REG.add((m[2] ?? "").replace(/\\"/g, '"')); pairs++; }
console.log(`REGISTRY_ATTACKS pairs=${pairs} distinct sentences=${REG.size}`);
function split(R: (s:string)=>boolean, G: any, T: any, label: string) {
  const c = { reader: [0,0], registry: [0,0], gate: [0,0], trailing: [0,0], residue: [0,0] };
  for (const [u, t] of legalAttackCorpus()) {
    let k: keyof typeof c;
    if (R(t)) k = "reader";
    else if (REG.has(t)) k = "registry";
    else { const g = G(t); if (g !== null && g.body !== "" && R(g.body)) k = "gate"; else if (T(t) !== null) k = "trailing"; else k = "residue"; }
    c[k][0]++; c[k][1] += u;
  }
  const built = (["reader","registry","gate","trailing"] as const).reduce((a,k)=>[a[0]+c[k][0], a[1]+c[k][1]], [0,0]);
  console.log(`${label}: reader ${c.reader[0]}s/${c.reader[1]}p · registry ${c.registry[0]}s/${c.registry[1]}p · gate ${c.gate[0]}s/${c.gate[1]}p · trailing ${c.trailing[0]}s/${c.trailing[1]}p  => BUILT ${built[0]}s/${built[1]}p · RESIDUE ${c.residue[0]}s/${c.residue[1]}p`);
}
split(oldR, oldG, oldT, "PRE ");
split(nowR, nowG, nowT, "POST");
