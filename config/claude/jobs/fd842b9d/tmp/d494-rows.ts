import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
const M = MUTANTS as unknown as Array<Record<string, unknown>>;
const ids = [
  "D368-declaration-clause-gets-a-board-row",
  "D409-tail-guard-widened-to-any-reader",
  "D493-suppression-arm-drops-the-multiplier-gate",
  "D493-suppression-arm-sets-the-wrong-boolean",
  "D493-suppression-arm-emits-the-neighbouring-pair",
  "D493-multiply-arm-never-reaches-the-compound",
  "D493-compound-anchor-loses-its-terminator",
  "D391-typed-threshold-row-claims-the-unquantified-neighbour",
  "D383-energy-threshold-reads-the-side",
  "D448-unprinted-pair-guard-dropped",
  "D486-clause-table-miss-defaults-to-the-named-card",
];
for (const id of ids) {
  const m = M.find((x) => x.id === id);
  if (!m) { console.log("!! NOT FOUND:", id); continue; }
  console.log("══════ " + id + "  [" + m.decision + "]  " + m.file);
  console.log("what:    " + m.what);
  console.log("find:    " + JSON.stringify(m.find));
  console.log("replace: " + JSON.stringify(m.replace));
  console.log("killers: " + JSON.stringify(m.expectKilledBy));
  if (m.survives) console.log("survives:" + JSON.stringify(m.survives));
  console.log();
}
