import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const ids = ["D474-body-arm-moves-ahead-of-the-energy-one","D474-arm-emits-the-neighbouring-flip-member","D474-debt-takeflips-attached-energy-reads-the-defender","D474-flip-count-crosses-the-seat","D474-flip-count-drops-the-printed-filter","D474-flip-count-reads-the-bench-only","D196-live-active","D196-seat-zone","D474-debt-per-energy-arm-defaults-an-unresolvable-token"];
for (const id of ids) {
  const m = MUTANTS.find((x) => x.id === id);
  if (!m) { console.log("MISSING", id); continue; }
  console.log("=".repeat(70));
  console.log(m.id, "|", m.file, "| killers:", JSON.stringify(m.expectKilledBy));
  if (m.survives) console.log("SURVIVES:", JSON.stringify(m.survives).slice(0,400));
  console.log("--- FIND ---"); console.log(m.find);
  console.log("--- REPLACE ---"); console.log(m.replace);
}
