import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as fs from "node:fs";

const names = attackReaderSurface();
const E = effects as any;
const BREAK = /(?<=\.)\s+(?=[A-Z(])/;
const split = E.splitAttackTrailingClause as (t: string) => any;
const gate = E.splitAttackGateClause as (t: string) => any;
const reqS = E.splitAttackRequirementClause as (t: string) => any;
const canS = E.splitAttackCancelClause as (t: string) => any;
function claims(s: string){ return names.filter(n => (E[n] as any)(s) !== null); }

const corpusLines = fs.readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts","utf8").split("\n");
function fileLineOf(text: string){ for (let i=0;i<corpusLines.length;i++){const l=corpusLines[i]!;const c=l.indexOf(" ");if(c>0&&l.slice(c+1)===text&&/^\d+$/.test(l.slice(0,c)))return i+1;} return -1; }

const rows = legalAttackCorpus();

// ── The 4 served sets (D425/D444 canonical subtraction)
function servedBySplitters(text: string): string | null {
  const t = split(text);
  if (t !== null) return "trailing";
  const g = gate(text);
  if (g !== null && g.body !== "" && resolvedByAnyReader(g.body)) return "gate";
  const r = reqS(text); if (r !== null) return "requirement";
  const c = canS(text); if (c !== null) return "cancel";
  return null;
}

// ── SIMULATED widened suppression: bare "Weakness" and bare "Resistance"-style
const WIDE = /^This attack['’]s damage isn['’]t affected by (?:(Weakness or Resistance, or by any effects on your opponent['’]s Active Pokémon)|(Weakness or Resistance)|(Weakness)|(Resistance)|(any effects on your opponent['’]s Active Pokémon))\.$/;
function wideSuppression(s: string){ return WIDE.test(s.trim()); }

console.log("=== CLASS C: refused whole, HEAD claimed, TAIL claimed by NOBODY (today) ===");
let cN=0,cP=0;
for (const [p,text] of rows) {
  if (resolvedByAnyReader(text)) continue;
  if (servedBySplitters(text) !== null) continue;
  const parts = text.split(BREAK); if (parts.length<2) continue;
  const tail = parts[parts.length-1]!, head = parts.slice(0,-1).join(" ");
  if (claims(head).length>0 && claims(tail).length===0) {
    cN++;cP+=p;
    console.log(`  line ${fileLineOf(text)}  ${p}p  head:[${claims(head)}]  tailWideSupp:${wideSuppression(tail)}\n     ${JSON.stringify(text)}`);
  }
}
console.log(`  TOTAL: ${cN} sentences / ${cP} printings`);

console.log("\n=== PAYOFF OF (A) ALONE — widen DAMAGE_SUPPRESSION to bare Weakness ===");
console.log("Corpus rows whose WHOLE sentence the widened anchor would claim:");
let a1=0,a1p=0;
for (const [p,text] of rows) { if (wideSuppression(text)) { a1++;a1p+=p; console.log(`  line ${fileLineOf(text)} ${p}p  resolvedToday=${resolvedByAnyReader(text)}  ${JSON.stringify(text)}`);} }
console.log(`  -> ${a1} sentences / ${a1p} printings claimed WHOLE by the widened anchor`);

console.log("\n=== PAYOFF OF (A)+(B) — widened suppression AND a suppression-tail composition path ===");
let bN=0,bP=0;
for (const [p,text] of rows) {
  if (resolvedByAnyReader(text)) continue;
  if (servedBySplitters(text) !== null) continue;
  const parts = text.split(BREAK); if (parts.length<2) continue;
  const tail = parts[parts.length-1]!, head = parts.slice(0,-1).join(" ");
  const tailSupp = wideSuppression(tail) || claims(tail).includes("deriveAttackDamageSuppression");
  if (claims(head).length>0 && tailSupp) { bN++;bP+=p; console.log(`  line ${fileLineOf(text)} ${p}p head:[${claims(head)}]\n     ${JSON.stringify(text)}`); }
}
console.log(`  -> ${bN} sentences / ${bP} printings freed by (A)+(B) together`);

console.log("\n=== PAYOFF OF (B) ALONE — composition path, TODAY's suppression vocabulary ===");
let dN=0,dP=0;
for (const [p,text] of rows) {
  if (resolvedByAnyReader(text)) continue;
  if (servedBySplitters(text) !== null) continue;
  const parts = text.split(BREAK); if (parts.length<2) continue;
  const tail = parts[parts.length-1]!, head = parts.slice(0,-1).join(" ");
  if (claims(head).length>0 && claims(tail).includes("deriveAttackDamageSuppression")) { dN++;dP+=p; console.log(`  line ${fileLineOf(text)} ${p}p\n     ${JSON.stringify(text)}`); }
}
console.log(`  -> ${dN} sentences / ${dP} printings freed by (B) alone`);

console.log("\n=== ALL corpus rows containing an 'isn't affected by' clause ===");
for (const [p,text] of rows) {
  if (!/isn['’]t affected by/.test(text)) continue;
  const built = resolvedByAnyReader(text) ? "BUILT" : (servedBySplitters(text) ?? "RESIDUE");
  console.log(`  line ${fileLineOf(text)} ${p}p [${built}] ${JSON.stringify(text)}`);
}
