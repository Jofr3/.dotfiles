import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";

const surface = attackReaderSurface();
console.log("READER SURFACE (%d): %s", surface.length, surface.join(", "));

const SPLITTERS = [
  "splitAttackRequirementClause",
  "splitAttackCancelClause",
  "splitAttackGateClause",
  "splitAttackTrailingClause",
] as const;

const STRINGS: Record<string,string> = {
  TARGET: "This attack does 40 damage for each Basic Energy attached to this Pokémon.",
  TYPED_W: "This attack does 40 damage for each {W} Energy attached to this Pokémon.",
  UNTYPED: "This attack does 40 damage for each Energy attached to this Pokémon.",
  BASIC_OPP_DISCARD: "This attack does 40 damage for each Basic Energy card in your opponent's discard pile.",
  BASIC_YOUR_DISCARD: "This attack does 40 damage for each Basic Energy card in your discard pile.",
};

for (const [k, s] of Object.entries(STRINGS)) {
  const claims: string[] = [];
  for (const name of surface) {
    const fn = (effects as Record<string, unknown>)[name];
    if (typeof fn !== "function") { console.log("  !! not a function:", name); continue; }
    let r: unknown = null;
    try { r = (fn as (t: string) => unknown)(s); } catch (e) { r = `THREW:${(e as Error).message}`; }
    if (r !== null && r !== undefined) claims.push(name + " = " + JSON.stringify(r));
  }
  const sp: string[] = [];
  for (const name of SPLITTERS) {
    const fn = (effects as Record<string, unknown>)[name];
    if (typeof fn !== "function") { sp.push(name + " MISSING"); continue; }
    let r: unknown = null;
    try { r = (fn as (t: string) => unknown)(s); } catch (e) { r = `THREW:${(e as Error).message}`; }
    if (r !== null && r !== undefined) sp.push(name + " = " + JSON.stringify(r));
  }
  console.log("\n=== " + k + ": " + JSON.stringify(s));
  console.log("  READERS " + claims.length + "/" + surface.length + (claims.length ? ":\n    " + claims.join("\n    ") : "  -> REFUSED 0/" + surface.length));
  console.log("  SPLITTERS " + sp.length + "/4" + (sp.length ? ":\n    " + sp.join("\n    ") : " -> none"));
}
