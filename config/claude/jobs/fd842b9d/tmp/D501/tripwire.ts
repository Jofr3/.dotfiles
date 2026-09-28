import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
type Row = { id: string; decision: string; what: string; file: string; find: string; replace: string; survives?: unknown };
const rows = MUTANTS as unknown as Row[];
console.log(`corpus rows (from the MODULE): ${rows.length}`);
const NEEDLES = [
  "confusionDamage", "Confused", "confused", "confusion", "CONFUSION_CHECK", "ATTACK_FAILED",
  "poisonDamage", "DEFAULT_POISON_DAMAGE", "DEFENDER_POISON_N", "instead of",
  "COUNTERS_PLACED", "noConditions", "SpecialConditions", "rotation",
  "active.damage + 30", "amount: 30", 'source: "confusion"',
  "splitAttackTrailingClause", "claimedByAnyReader", "statusOf",
];
for (const n of NEEDLES) {
  const hits = rows.filter((r) => r.id.includes(n) || r.what.includes(n) || r.find.includes(n) || r.replace.includes(n) || r.decision.includes(n));
  console.log(`\n### needle ${JSON.stringify(n)} → ${hits.length} row(s)`);
  for (const h of hits.slice(0, 12)) {
    const where = [r0(h.id, "id"), r0(h.what, "what"), r0(h.find, "find"), r0(h.replace, "replace")].filter(Boolean).join(",");
    console.log(`   ${h.id}  [${h.file}]  in:${where}${h.survives ? "  SURVIVOR" : ""}`);
  }
  if (hits.length > 12) console.log(`   … ${hits.length - 12} more`);
  function r0(s: string, label: string) { return s.includes(n) ? label : ""; }
}
