import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
const M = MUTANTS as unknown as Array<Record<string, unknown>>;
console.log("corpus rows (from the MODULE):", M.length);
const declared = M.filter((m) => m.survives !== undefined);
console.log("declared survivors:", declared.length);
console.log();

const NEEDLES: [string, RegExp][] = [
  ["CONDITIONAL_DAMAGE_BONUS", /CONDITIONAL_DAMAGE_BONUS/],
  ["boardConditionForClause", /boardConditionForClause/],
  ["yourEnergyInPlayAtLeast", /yourEnergyInPlayAtLeast/],
  ["countEnergyInPlay", /countEnergyInPlay/],
  ["Energy in play (printed)", /Energy in play/],
  ["DAMAGE_SUPPRESSION", /DAMAGE_SUPPRESSION/],
  ["deriveAttackDamageSuppression", /deriveAttackDamageSuppression/],
  ["BENCH_COUNTER_FILTERED_SUPPRESSED", /BENCH_COUNTER_FILTERED_SUPPRESSED/],
  ["isn't affected by Weakness (printed)", /isn['’]t affected by Weakness/],
  ["weakness: true", /weakness:\s*true/],
  ["splitAttackTrailingClause", /splitAttackTrailingClause/],
  ["claimedByAnyReader (the D409 guard line)", /claimedByAnyReader/],
  ["at least 3 {D}", /at least 3 \{D\}/],
  ["3 or more", /3 or more/],
  ["yourActiveEnergyAtLeast", /yourActiveEnergyAtLeast/],
  ["deriveAttackDamageBonus", /deriveAttackDamageBonus/],
  ["CLAUSE_ROWS / literalClauseRow", /literalClauseRow|CLAUSE_ROWS/],
];
for (const [label, re] of NEEDLES) {
  const hits = M.filter((m) =>
    re.test(String(m.id ?? "")) || re.test(String(m.what ?? "")) ||
    re.test(String(m.find ?? "")) || re.test(String(m.replace ?? "")));
  console.log(`── ${label}: ${hits.length} row(s)`);
  for (const h of hits) {
    const where: string[] = [];
    if (re.test(String(h.id ?? ""))) where.push("id");
    if (re.test(String(h.what ?? ""))) where.push("what");
    if (re.test(String(h.find ?? ""))) where.push("find");
    if (re.test(String(h.replace ?? ""))) where.push("replace");
    console.log(`     ${h.id}  [${h.decision}]  file=${h.file}  in:${where.join("+")}${h.survives ? "  SURVIVES(" + JSON.stringify(h.survives).slice(0, 60) + ")" : ""}`);
  }
  console.log();
}
