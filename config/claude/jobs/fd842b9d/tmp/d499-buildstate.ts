import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";

const NAMES = attackReaderSurface();
console.log("READER SURFACE (%d):", NAMES.length, NAMES.join(", "));

const SPLITTERS = [
  "splitAttackRequirementClause",
  "splitAttackCancelClause",
  "splitAttackGateClause",
  "splitAttackTrailingClause",
] as const;

const STRINGS: Record<string, string> = {
  FULL: "Flip a coin. If tails, this attack does nothing. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.",
  HEADS_ONLY: "Flip a coin. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.",
  TAILS_ONLY: "Flip a coin. If tails, this attack does nothing.",
};

for (const [label, text] of Object.entries(STRINGS)) {
  console.log("\n=== %s ===\n%s", label, JSON.stringify(text));
  const claims: string[] = [];
  for (const n of NAMES) {
    const fn = (effects as Record<string, unknown>)[n] as (t: string) => unknown;
    let v: unknown;
    try { v = fn(text); } catch (e) { v = `THREW: ${String(e)}`; }
    console.log("  %s -> %s", n.padEnd(34), v === null ? "null" : JSON.stringify(v));
    if (v !== null) claims.push(n);
  }
  console.log("  CLAIMED BY: %s", claims.length === 0 ? "NONE (refused %d/%d)".replace("%d/%d", `${NAMES.length}/${NAMES.length}`) : claims.join(", "));
  for (const s of SPLITTERS) {
    const fn = (effects as Record<string, unknown>)[s] as (t: string) => unknown;
    let v: unknown;
    try { v = fn(text); } catch (e) { v = `THREW: ${String(e)}`; }
    console.log("  %s -> %s", s.padEnd(34), v === null ? "null" : JSON.stringify(v));
  }
  console.log("  resolvedByAnyReader: %s", resolvedByAnyReader(text));
  const corpus = legalAttackCorpus();
  const row = corpus.find((r) => r.text === text);
  console.log("  IN CORPUS: %s", row ? JSON.stringify({ printings: row.printings, ...row, text: undefined }) : "NO");
}
