import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
console.log("CORPUS SIZE (from the module) =", MUTANTS.length);
const NEEDLES = [
  "discardDeckTop", "DECK_TOP_DISCARDED", "DECK_TOP_MILL", "whose",
  "deriveAttackDiscardScaledBoost", "discardScaledBoostProgram", "AttackDiscardScaledBoost",
  "BENCH_DISCARD_SCALED_BOOST", "damageDefender", "countFilter", "scoredSlot",
  "recordMoved", "milled", "each player", "REAL_NEAR_MISSES", "attackReaderSurface",
  "eachPlayer", "base ??",
];
for (const n of NEEDLES) {
  const hits = MUTANTS.filter((m) =>
    m.id.includes(n) || (m.what ?? "").includes(n) || m.find.includes(n) || m.replace.includes(n) ||
    (m.file ?? "").includes(n));
  console.log(`\n### ${n}: ${hits.length}`);
  for (const h of hits) console.log(`   ${h.id}  [${h.file}]  killers=${(h.expectKilledBy ?? []).join(",")}${h.survives ? "  SURVIVES:" + h.survives.kind : ""}`);
}
