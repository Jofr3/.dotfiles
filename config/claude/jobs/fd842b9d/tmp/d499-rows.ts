const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const want = process.argv.slice(2);
for (const id of want) {
  const r = (MUTANTS as Record<string, string>[]).find((m) => m.id === id);
  if (!r) {
    console.log("NOT FOUND " + id);
    continue;
  }
  console.log("=== " + r.id + " (" + r.decision + ") file=" + r.file);
  console.log("what:    " + r.what);
  console.log("find:    " + JSON.stringify(r.find));
  console.log("replace: " + JSON.stringify(r.replace));
  console.log("killedBy:" + JSON.stringify((r as Record<string, unknown>).expectKilledBy ?? (r as Record<string, unknown>).killedByCommand));
  console.log("survives:" + JSON.stringify((r as Record<string, unknown>).survives ?? null));
  console.log("");
}
