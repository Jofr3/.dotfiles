import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, resolvedByAnyReader, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";

const READERS = attackReaderSurface();
console.log("reader surface size:", READERS.length);
console.log(READERS.join("\n"));

const FULL = "This attack does 30 damage for each {W} Energy attached to this Pokémon. Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.";
const HEAD = "This attack does 30 damage for each {W} Energy attached to this Pokémon.";
const TAIL = "Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.";

const SPLITTERS = ["splitAttackRequirementClause","splitAttackCancelClause","splitAttackGateClause","splitAttackTrailingClause"] as const;

function report(label: string, s: string) {
  console.log("\n=== " + label + " ===");
  console.log(JSON.stringify(s));
  const claims: string[] = [];
  for (const name of READERS) {
    const fn = (effects as Record<string, unknown>)[name] as (t: string) => unknown;
    let v: unknown;
    try { v = fn(s); } catch (e) { v = "THREW: " + String(e); }
    if (v !== null) claims.push(`  ${name} => ${JSON.stringify(v)}`);
  }
  console.log(`  readers claiming: ${claims.length}/${READERS.length}`);
  for (const c of claims) console.log(c);
  for (const sp of SPLITTERS) {
    const fn = (effects as Record<string, unknown>)[sp] as (t: string) => unknown;
    let v: unknown;
    try { v = fn(s); } catch (e) { v = "THREW: " + String(e); }
    console.log(`  ${sp} => ${JSON.stringify(v)}`);
  }
  console.log(`  resolvedByAnyReader => ${resolvedByAnyReader(s)}`);
  const row = legalAttackCorpus().find(([, t]) => t === s);
  console.log(`  IS A CORPUS ROW: ${row !== undefined}${row ? ` (printings=${row[0]})` : ""}`);
}

report("FULL PRINT", FULL);
report("HEAD", HEAD);
report("TAIL", TAIL);
