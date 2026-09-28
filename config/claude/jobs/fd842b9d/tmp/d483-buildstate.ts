#!/usr/bin/env bun
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";

const READERS = attackReaderSurface();
const S: Record<string, string> = {
  "row1 (spread ex)": "This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness or Resistance.",
  "row2 (spread ex+V)": "This attack does 100 damage to each of your opponent's Pokémon ex and Pokémon V. This attack's damage isn't affected by Weakness or Resistance.",
  "row3 (snipe bench ex or V)": "This attack does 60 damage to 1 of your opponent's Benched Pokémon ex or Benched Pokémon V. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "row4 (discard-all + snipe bench ex)": "Discard all Energy from this Pokémon, and this attack does 210 damage to 1 of your opponent's Benched Pokémon ex. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "TWIN of row4 (unnarrowed, line 110)": "Discard all Energy from this Pokémon, and this attack does 120 damage to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "TWIN of row4 (also, line 109)": "Discard all Energy from this Pokémon, and this attack also does 90 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "TWIN of row3 (unnarrowed bench snipe)": "This attack also does 30 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "D482 whole-side spread (built)": "This attack does 30 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "row1 minus the W/R tail": "This attack does 60 damage to each of your opponent's Pokémon ex.",
  "row1 minus the ex narrowing": "This attack does 60 damage to each of your opponent's Pokémon. This attack's damage isn't affected by Weakness or Resistance.",
  "row3 minus the narrowing": "This attack does 60 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "row4 minus the narrowing": "Discard all Energy from this Pokémon, and this attack does 210 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
};
const out: string[] = [`READERS (${READERS.length}): ${READERS.join(", ")}`];
for (const [label, text] of Object.entries(S)) {
  const claims: string[] = [];
  for (const name of READERS) {
    const fn = (effects as unknown as Record<string, (t: string) => unknown>)[name];
    if (fn(text) !== null) claims.push(name);
  }
  const gate = (effects as any).splitAttackGateClause?.(text) ?? null;
  const trail = (effects as any).splitAttackTrailingClause?.(text) ?? null;
  out.push(`\n--- ${label}`);
  out.push(`    ${text}`);
  out.push(`    resolvedByAnyReader=${resolvedByAnyReader(text)} claimers=[${claims.join(",")}]`);
  out.push(`    gateSplit=${gate === null ? "null" : JSON.stringify(gate)}`);
  out.push(`    trailSplit=${trail === null ? "null" : JSON.stringify(trail)}`);
}
await Bun.write("/home/jofre/.claude/jobs/fd842b9d/tmp/d483-buildstate.txt", out.join("\n") + "\n");
console.log(out.join("\n"));
