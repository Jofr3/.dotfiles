import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const surface = attackReaderSurface();
const SPLITTERS = ["splitAttackRequirementClause","splitAttackCancelClause","splitAttackGateClause","splitAttackTrailingClause"];

function claimers(s: string): string[] {
  const out: string[] = [];
  for (const n of surface) {
    const f = (effects as Record<string, unknown>)[n];
    if (typeof f !== "function") continue;
    let r: unknown = null;
    try { r = (f as (t: string) => unknown)(s); } catch { r = null; }
    if (r !== null && r !== undefined) out.push(n);
  }
  return out;
}
function splits(s: string): string[] {
  const out: string[] = [];
  for (const n of SPLITTERS) {
    const f = (effects as Record<string, unknown>)[n];
    if (typeof f !== "function") continue;
    let r: unknown = null;
    try { r = (f as (t: string) => unknown)(s); } catch { r = null; }
    if (r !== null && r !== undefined) out.push(n);
  }
  return out;
}

// PRINT: "This attack does 40 damage for each Basic Energy attached to this Pokémon."
// four candidate axes, each with its PRINTED value and its NEAREST BUILT SPELLING.
type Axis = { name: string; printed: string; built: string };
const AXES: Axis[] = [
  { name: "AMOUNT",   printed: "40",           built: "30" },
  { name: "FOLD",     printed: "does",         built: "does" }, // placeholder, handled below
  { name: "NOUN",     printed: "Basic ",       built: "{W} " },
  { name: "TAIL",     printed: "this Pokémon", built: "your opponent's Active Pokémon" },
];

function build(bits: number): string {
  const amount = (bits & 1) ? "30" : "40";
  const fold   = (bits & 2) ? "more damage" : "damage";
  const noun   = (bits & 4) ? "{W} " : "Basic ";
  const tail   = (bits & 8) ? "your opponent's Active Pokémon" : "this Pokémon";
  return `This attack does ${amount} ${fold} for each ${noun}Energy attached to ${tail}.`;
}
const weightOf = (b: number) => ((b&1)?1:0)+((b&2)?1:0)+((b&4)?1:0)+((b&8)?1:0);
const byWeight: Record<number, {n: number; built: number}> = {0:{n:0,built:0},1:{n:0,built:0},2:{n:0,built:0},3:{n:0,built:0},4:{n:0,built:0}};

console.log("=== FULL 2^4 LATTICE (AMOUNT 40->30, FOLD damage->more damage, NOUN Basic->{W}, TAIL this Pokemon->opp Active) ===");
for (let b = 0; b < 16; b++) {
  const s = build(b);
  const c = claimers(s);
  const sp = splits(s);
  const w = weightOf(b);
  byWeight[w]!.n++;
  if (c.length > 0) byWeight[w]!.built++;
  const flags = [(b&1)?"AMOUNT":"", (b&2)?"FOLD":"", (b&4)?"NOUN":"", (b&8)?"TAIL":""].filter(Boolean).join("+") || "(print)";
  console.log(`w=${w} [${flags.padEnd(28)}] ${c.length>0?"BUILDS":"refused"} ${c.join(",")}${sp.length?"  SPLIT:"+sp.join(","):""}`);
}
console.log("\nbuilt-by-weight (2^4, raw):", [0,1,2,3,4].map(w=>`${byWeight[w]!.built}/${byWeight[w]!.n}`).join(" · "));

// --- DEGENERACY check: does each axis's PRINTED value already build in isolation? ---
console.log("\n=== DEGENERACY: substitute ONLY that axis's nearest-built spelling, keep the rest PRINTED ===");
for (const [i, name] of ["AMOUNT","FOLD","NOUN","TAIL"].entries()) {
  const s = build(1 << i);
  console.log(`  ${name.padEnd(7)} -> ${claimers(s).length>0?"BUILDS":"refused"}  ${JSON.stringify(s)}`);
}
console.log("\n=== DEGENERACY: is the axis's PRINTED value itself claimed on an otherwise-built sentence? ===");
// hold NOUN at its built spelling, vary each other axis to its printed value
const probes: [string,string][] = [
  ["AMOUNT printed 40, rest built", "This attack does 40 damage for each {W} Energy attached to this Pokémon."],
  ["AMOUNT built 30, rest built",   "This attack does 30 damage for each {W} Energy attached to this Pokémon."],
  ["FOLD printed (multiply), rest built", "This attack does 40 damage for each {W} Energy attached to this Pokémon."],
  ["FOLD built (additive), rest built",   "This attack does 40 more damage for each {W} Energy attached to this Pokémon."],
  ["TAIL printed (this Pokemon), rest built", "This attack does 40 damage for each {W} Energy attached to this Pokémon."],
  ["TAIL alt (opp Active), rest built",       "This attack does 40 damage for each {W} Energy attached to your opponent's Active Pokémon."],
  ["NOUN printed Basic, everything else built", "This attack does 40 damage for each Basic Energy attached to this Pokémon."],
  ["NOUN absent (untyped)", "This attack does 40 damage for each Energy attached to this Pokémon."],
  ["NOUN Special", "This attack does 40 damage for each Special Energy attached to this Pokémon."],
  ["NOUN Special card", "This attack does 70 damage for each Special Energy card attached to this Pokémon."],
  ["NOUN Basic card", "This attack does 40 damage for each Basic Energy card attached to this Pokémon."],
];
for (const [label, s] of probes) {
  const c = claimers(s);
  console.log(`  ${label.padEnd(44)} ${c.length>0?"BUILDS":"refused"}  ${c.join(",")}`);
}
