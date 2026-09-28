const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const log = await Bun.file(process.env.CLAUDE_JOB_DIR + "/tmp/sweep-D487.log").text();
const ids = MUTANTS.map((m) => m.id);
const dots = "\u2026";
const runLines = log.split("\n").filter((l) => /^\s{2}\S/.test(l) && l.includes(dots));
const matched = new Set();
for (const l of runLines) { const id = ids.find((i) => l.startsWith("  " + i + " ")); if (id) matched.add(id); }
console.log("listed:", ids.length, "run:", runLines.length, "matched:", matched.size);
console.log("missing:", ids.filter((i) => !matched.has(i)).length, "unmatched:", runLines.filter((l) => !ids.some((i) => l.startsWith("  " + i + " "))).length);
console.log("D487 rows run:", runLines.filter((l) => l.startsWith("  D487-")).length);
