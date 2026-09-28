import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const rows = MUTANTS.filter((m) => m.decision === "D480");
console.log(`D480 rows: ${rows.length}\n`);
for (const m of rows) {
  const same = m.find === m.replace;
  const inert = m.replace.trim() === m.find.trim();
  console.log(`── ${m.id}`);
  console.log(`   file      ${m.file}`);
  console.log(`   FIND      ${m.find.slice(0, 110)}`);
  console.log(`   REPLACE   ${m.replace.slice(0, 110)}`);
  console.log(`   identical=${same}  inert=${inert}  survives=${m.survives ? m.survives.kind : "-"}`);
  console.log(`   killers   ${m.expectKilledBy.join(", ")}`);
  console.log(`   what[0:150] ${m.what.replace(/\s+/g, " ").slice(0, 150)}`);
  console.log("");
}
