const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
type Row = { id: string; decision: string; file: string; find: string; survives?: { kind: string; reason: string } };
const rows = (MUTANTS as unknown as Row[]).filter((r) => r.survives !== undefined);
console.log("declared survivors:", rows.length);
const byFile: Record<string, string[]> = {};
for (const r of rows) (byFile[r.file] ??= []).push(`${r.id} [${r.survives?.kind}]`);
for (const [f, ids] of Object.entries(byFile).sort()) {
  console.log(`\n${f}  (${ids.length})`);
  for (const i of ids) console.log("   ", i);
}
