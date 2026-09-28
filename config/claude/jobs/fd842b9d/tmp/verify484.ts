const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const log = await Bun.file(process.env.CLAUDE_JOB_DIR + "/tmp/sweep-D484.log").text();
const ids = MUTANTS.map((m) => m.id);
const runLines = log.split("\n").filter((l) => /^\s{2}\S/.test(l) && l.includes(" ... ".replace(/\.\.\./, "\u2026")));
const matched = new Set();
for (const l of runLines) { const id = ids.find((i) => l.startsWith("  " + i + " ")); if (id) matched.add(id); }
console.log("listed:", ids.length, "run:", runLines.length, "matched:", matched.size);
console.log("missing:", ids.filter((i) => !matched.has(i)).length, "unmatched:", runLines.filter((l) => !ids.some((i) => l.startsWith("  " + i + " "))).length);
console.log("D484 rows run:", runLines.filter((l) => l.startsWith("  D484-")).length);
