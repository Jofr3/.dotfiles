const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const ids = process.argv.slice(2);
for (const id of ids) {
  const r = (MUTANTS as any[]).find((m) => m.id === id);
  if (!r) { console.log("NOT FOUND", id); continue; }
  console.log("=".repeat(90));
  console.log("id:", r.id, "| decision:", r.decision, "| file:", r.file);
  console.log("what:", r.what);
  console.log("find:   ", JSON.stringify(r.find));
  console.log("replace:", JSON.stringify(r.replace));
  console.log("expectKilledBy:", JSON.stringify(r.expectKilledBy));
  if (r.killedByCommand) console.log("killedByCommand:", JSON.stringify(r.killedByCommand));
  if (r.survives) console.log("survives:", JSON.stringify(r.survives));
}
