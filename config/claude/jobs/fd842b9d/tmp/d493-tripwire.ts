const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
console.log("corpus rows (from the MODULE):", MUTANTS.length);
const dec = new Map<string, number>();
for (const m of MUTANTS) dec.set(m.decision, (dec.get(m.decision) ?? 0) + 1);
console.log("declared survivors:", MUTANTS.filter((m:any)=>m.survives).length);

const NEEDLES = [
  "DAMAGE_SUPPRESSION",
  "deriveAttackDamageSuppression",
  "AttackDamageSuppression",
  "damageSuppression",
  "isn't affected by Weakness",
  "isn’t affected by Weakness",
  "suppressTargetEffects",
  "seatRemovesWeakness",
  "splitAttackTrailingClause",
  "COMPOUND_CLAUSE_BREAK",
  "claimedByAnyReader",
  "ATTACK_WHOLE_SENTENCE_READERS",
  "compoundSplit",
  "BENCH_COUNTER_FILTERED_MULTIPLY",
  "deriveAttackDamageMultiplier",
  "Cynthia",
  "damageCountersOnYourBench",
  "ignoreWR",
  "attackReaderSurface",
];
for (const n of NEEDLES) {
  const hits = MUTANTS.filter((m:any) =>
    (m.id ?? "").includes(n) || (m.what ?? "").includes(n) || (m.find ?? "").includes(n) ||
    (m.replace ?? "").includes(n) || (m.file ?? "").includes(n) ||
    (m.expectKilledBy ?? []).some((f:string)=>f.includes(n)) ||
    JSON.stringify(m.survives ?? "").includes(n));
  console.log(`\n### needle ${JSON.stringify(n)} -> ${hits.length} row(s)`);
  for (const h of hits) console.log(`   ${h.id}  [${h.decision}]  file=${h.file}  killers=${JSON.stringify(h.expectKilledBy)}${h.survives?"  SURVIVES="+JSON.stringify(h.survives):""}\n      what: ${String(h.what).slice(0,220)}`);
}
console.log("\n### rows whose file is damageSuppression.test.ts or benchNounScaling.test.ts as KILLER");
for (const m of MUTANTS as any[]) {
  if ((m.expectKilledBy ?? []).some((f:string)=>/damageSuppression|benchNounScaling|compoundCompose|splitOrder|opponentBoardCounterScaling|selfEnergyScaling/.test(f)))
    console.log(`   ${m.id} [${m.decision}] file=${m.file} killers=${JSON.stringify(m.expectKilledBy)}`);
}
