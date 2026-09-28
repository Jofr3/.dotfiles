import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
type Row = Record<string, unknown>;
const rows = MUTANTS as unknown as Row[];
const WANT = [
  "D474-debt-per-energy-arm-defaults-an-unresolvable-token",
  "D474-debt-count-attached-energy-unfiltered-counts-specials",
  "D474-debt-count-attached-energy-typed-arm-drops-provision",
  "D440-energy-noun-reads-provision",
  "D448-fold-counts-a-type-instead-of-cards",
  "D459-multiply-fold-drops-its-type-filter",
  "D459-additive-fold-widened-for-symmetry",
  "D476-arm-narrows-to-special-energy",
  "D470-owner-board-arm-confuses-null-with-undefined-in-the-energy-guard",
  "D440-noun-drops-the-printed-basic",
  "D402-basic-energy-read-as-any-energy",
];
for (const id of WANT) {
  const r = rows.find((x) => x["id"] === id);
  if (r === undefined) { console.log("!! NOT FOUND:", id); continue; }
  console.log("\n================ " + id);
  for (const k of ["decision","file","what","find","replace","expectKilledBy","killedByCommand","nameFilter","survives"]) {
    if (r[k] !== undefined) console.log(`  ${k}: ${JSON.stringify(r[k])}`);
  }
}
