const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
type Row = { id: string; decision: string; file: string; find: string; replace: string; what: string; survives?: { kind: string; reason: string }; expectKilledBy?: string[] };
const rows = (MUTANTS as unknown as Row[]).filter((r) => r.decision.includes("D502"));
console.log("D502 rows:", rows.length);
let inert = 0;
for (const r of rows) {
  const same = r.find === r.replace;
  // strip comments + whitespace from both halves and compare the SEMANTIC residue
  const strip = (s: string) =>
    s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  const semantic = strip(r.find) !== strip(r.replace);
  const flag = same ? "IDENTICAL" : semantic ? "ok" : "INERT?(comment-only)";
  if (flag !== "ok") inert++;
  console.log(`  ${flag.padEnd(20)} ${r.id}  [${r.file.replace("packages/engine/src/", "")}]${r.survives ? "  SURVIVES:" + r.survives.kind : ""}`);
}
console.log(inert === 0 ? "no inert rows" : `${inert} SUSPECT`);
console.log("\nby SEAT:");
const bySeat: Record<string, number> = {};
for (const r of rows) bySeat[r.file] = (bySeat[r.file] ?? 0) + 1;
console.log(" ", bySeat);
console.log("killer sets:", [...new Set(rows.flatMap((r) => r.expectKilledBy ?? []))]);
console.log("declared survivors:", rows.filter((r) => r.survives).map((r) => r.id));
