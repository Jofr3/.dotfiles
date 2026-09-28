// Declared-survivor pre-clearance, in D472's order:
//   1. numstat per FILE — which files have DELETIONS at all?
//   2. file membership   — do any declared survivors live in those files?
//   3. reasons           — only for survivors in files with deletions, plus any whose
//                          reason quantifies over a structure this slice EXTENDED (D466).
const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
type Row = Record<string, string> & { survives?: { kind: string; reason: string } };
const ROWS = MUTANTS as Row[];
const DECLARED = ROWS.filter((m) => m.survives !== undefined);
console.log("declared survivors in the corpus: " + DECLARED.length);

const proc = Bun.spawnSync(["git", "diff", "--numstat"], {
  cwd: "/home/jofre/projects/luminous_ui",
});
const deletions = new Map<string, number>();
for (const line of new TextDecoder().decode(proc.stdout).split("\n")) {
  const m = /^(\d+)\t(\d+)\t(.+)$/.exec(line);
  if (m === null) continue;
  if (Number(m[2]) > 0) deletions.set(m[3] as string, Number(m[2]));
}
console.log("files with DELETIONS: " + deletions.size);

const byFile = new Map<string, Row[]>();
for (const d of DECLARED) byFile.set(d.file, [...(byFile.get(d.file) ?? []), d]);
console.log("");
console.log("survivors by file (× = the slice deleted lines there):");
for (const [file, rows] of [...byFile.entries()].sort()) {
  const del = deletions.get(file);
  console.log(`  ${del === undefined ? " " : "×"} ${file}  (${rows.length})${del === undefined ? "" : "  −" + del}`);
}
console.log("");
console.log("=== STEP 3 — survivors that CANNOT be dismissed by file ===");
let n = 0;
for (const d of DECLARED) {
  if (!deletions.has(d.file)) continue;
  n++;
  console.log("  " + d.id + " (" + d.decision + ")  kind=" + (d.survives?.kind ?? "?"));
}
console.log("  count: " + n);
