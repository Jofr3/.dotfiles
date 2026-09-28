import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";

const names = attackReaderSurface();
const E = effects as any;
const BREAK = /(?<=\.)\s+(?=[A-Z(])/;
const dae = E.deriveAttackEffect as (t: string) => unknown;
const split = E.splitAttackTrailingClause as (t: string) => unknown;
const gate = E.splitAttackGateClause as (t: string) => any;
const req = E.splitAttackRequirementClause as (t: string) => any;
const can = E.splitAttackCancelClause as (t: string) => any;

function claims(s: string): string[] {
  return names.filter((n) => (E[n] as (t: string) => unknown)(s) !== null);
}

const rows = legalAttackCorpus();
// corpus file line for index i:
const FILE_LINE_OFFSET = 53; // verify below
const corpusLines = require("node:fs").readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts","utf8").split("\n");
function fileLineOf(text: string): number {
  for (let i = 0; i < corpusLines.length; i++) {
    const l = corpusLines[i];
    const cut = l.indexOf(" ");
    if (cut > 0 && l.slice(cut+1) === text && /^\d+$/.test(l.slice(0,cut))) return i + 1;
  }
  return -1;
}

console.log("corpus rows:", rows.length, "printings:", rows.reduce((a,[n])=>a+n,0));

// ── population A: multi-clause, refused whole, head claimed by SOME reader, tail claimed by SOME reader but NOT deriveAttackEffect
let A: {line:number;p:number;t:string;headR:string[];tailR:string[]}[] = [];
// population B: same but tail claimed by deriveAttackEffect (these already compose)
let B = 0, Bp = 0;
// population C: head claimed, tail claimed by NOBODY
let C = 0, Cp = 0;
// population D: head NOT claimed, tail claimed by non-effect reader (suppression-tail w/ dead head)
let D: {line:number;p:number;t:string;tailR:string[]}[] = [];

for (const [p, text] of rows) {
  if (resolvedByAnyReader(text)) continue;
  const parts = text.split(BREAK);
  if (parts.length < 2) continue;
  const tail = parts[parts.length-1] ?? "";
  const head = parts.slice(0,-1).join(" ");
  const hr = claims(head), tr = claims(tail);
  const tailIsEffect = tr.includes("deriveAttackEffect");
  if (hr.length > 0 && tr.length > 0 && !tailIsEffect) A.push({line:fileLineOf(text),p,t:text,headR:hr,tailR:tr});
  else if (hr.length > 0 && tailIsEffect) { B++; Bp+=p; }
  else if (hr.length > 0 && tr.length === 0) { C++; Cp+=p; }
  else if (hr.length === 0 && tr.length > 0 && !tailIsEffect) D.push({line:fileLineOf(text),p,t:text,tailR:tr});
}

console.log("\n=== (A) refused-whole compounds: HEAD claimed + TAIL claimed by a NON-deriveAttackEffect reader ===");
console.log("   count:", A.length, "sentences /", A.reduce((a,x)=>a+x.p,0), "printings");
for (const x of A) console.log(`   line ${x.line}  ${x.p}p  head:[${x.headR}] tail:[${x.tailR}]\n      ${JSON.stringify(x.t)}`);

console.log("\n=== (B) refused-whole compounds: HEAD claimed + TAIL claimed by deriveAttackEffect (these SHOULD already compose) ===");
console.log("   count:", B, "/", Bp, "printings   (residue-resident, so something else refuses them)");

console.log("\n=== (C) refused-whole compounds: HEAD claimed, TAIL claimed by NOBODY ===");
console.log("   count:", C, "/", Cp, "printings");

console.log("\n=== (D) refused-whole compounds: HEAD unclaimed, TAIL claimed by NON-effect reader ===");
console.log("   count:", D.length, "/", D.reduce((a,x)=>a+x.p,0), "printings");
for (const x of D) console.log(`   line ${x.line}  ${x.p}p  tail:[${x.tailR}]\n      ${JSON.stringify(x.t)}`);
