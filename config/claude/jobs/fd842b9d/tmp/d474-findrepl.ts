import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const rows = MUTANTS.filter((m) => m.decision.includes("D474"));
console.log("D474 rows:", rows.length);
let inert = 0;
for (const m of rows) {
  const same = m.find === m.replace;
  // strip comments+whitespace and compare the SEMANTIC residue (D450/D451)
  const strip = (s: string) =>
    s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  const semanticallySame = strip(m.find) === strip(m.replace);
  if (same || semanticallySame) { inert += 1; console.log("  ⚠️ INERT?", m.id); }
  console.log(`\n── ${m.id}${m.survives ? "  [DECLARED " + m.survives.kind + "]" : ""}`);
  console.log("   file:", m.file);
  console.log("   -", JSON.stringify(m.find).slice(0, 200));
  console.log("   +", JSON.stringify(m.replace).slice(0, 200));
}
console.log("\nINERT CANDIDATES:", inert);
console.log("decision includes count:", MUTANTS.filter((m) => m.decision.includes("D474")).length);
console.log("decision equality count:", MUTANTS.filter((m) => m.decision === "D474").length);
console.log("id-prefix count:", MUTANTS.filter((m) => m.id.startsWith("D474-")).length);
console.log("corpus total:", MUTANTS.length);
console.log("declared survivors total:", MUTANTS.filter((m) => m.survives !== undefined).length);
