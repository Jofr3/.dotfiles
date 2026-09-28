const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const byFind = new Map();
for (const m of MUTANTS) {
  const k = m.file + " " + m.find;
  byFind.set(k, (byFind.get(k) ?? 0) + 1);
}
const groups = [...byFind.values()].filter((n) => n > 1);
const rows = groups.reduce((a, b) => a + b, 0);
console.log("groups:", groups.length, "rows:", rows, "of", MUTANTS.length, "pct:", ((rows / MUTANTS.length) * 100).toFixed(1));
