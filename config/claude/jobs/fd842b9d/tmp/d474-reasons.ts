import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
for (const id of [
  "D382-join-operands-swapped",
  "D427-whiffed-attack-heals-the-base",
  "D463-audit-d130-empty-program-survives-zero-heads",
  "D439-vocabulary-order-loses-the-owner",
]) {
  const m = MUTANTS.find((x) => x.id === id);
  if (!m) { console.log("MISSING", id); continue; }
  console.log(`\n══ ${id}  (${m.file})`);
  console.log("find   :", JSON.stringify(m.find).slice(0, 240));
  console.log("reason :", (m.survives?.reason ?? "").slice(0, 1600));
}
