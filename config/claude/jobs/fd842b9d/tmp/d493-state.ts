import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";

const names = attackReaderSurface();
console.log("READER SURFACE (" + names.length + "):", JSON.stringify(names));

const STRINGS: [string, string][] = [
  ["FULL (row 529)", "This attack does 10 damage for each damage counter on all of your Benched Cynthia's Pokémon. This attack's damage isn't affected by Weakness."],
  ["HEAD alone", "This attack does 10 damage for each damage counter on all of your Benched Cynthia's Pokémon."],
  ["TAIL W-or-R", "This attack's damage isn't affected by Weakness or Resistance."],
  ["TAIL W-only", "This attack's damage isn't affected by Weakness."],
  ["30dmg + W-or-R", "This attack does 30 damage. This attack's damage isn't affected by Weakness or Resistance."],
  ["30dmg + W-only", "This attack does 30 damage. This attack's damage isn't affected by Weakness."],
  ["30dmg alone", "This attack does 30 damage."],
];

const splitters = {
  splitAttackTrailingClause: (effects as any).splitAttackTrailingClause,
  splitAttackGateClause: (effects as any).splitAttackGateClause,
  splitAttackRequirementClause: (effects as any).splitAttackRequirementClause,
  splitAttackCancelClause: (effects as any).splitAttackCancelClause,
};

for (const [label, s] of STRINGS) {
  console.log("\n=== " + label + " ===");
  console.log("  text: " + JSON.stringify(s));
  let claims = 0;
  for (const n of names) {
    const fn = (effects as any)[n] as (t: string) => unknown;
    const v = fn(s);
    if (v !== null) { claims++; console.log("  READER " + n + " => " + JSON.stringify(v)); }
  }
  console.log("  readers claiming: " + claims + "/" + names.length + (claims === 0 ? "  → REFUSED " + names.length + "/" + names.length : ""));
  console.log("  resolvedByAnyReader: " + resolvedByAnyReader(s));
  for (const [sn, sf] of Object.entries(splitters)) {
    console.log("  " + sn + ": " + JSON.stringify((sf as any)(s)));
  }
}
