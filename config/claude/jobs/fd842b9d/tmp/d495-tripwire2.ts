import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
const rows = MUTANTS as unknown as {
  id: string; decision: string; what: string; file: string; find: string; replace: string;
  expectKilledBy?: string[]; survives?: { kind: string; reason: string };
}[];
const needles = [
  "If heads, during your opponent",
  "Flip a coin. If heads, during",
  "the Defending Pokémon can't attack",
  "can't use attacks",
  "DEFENDER_CANT_ATTACK",
  "preventAttack\", target: \"defender\" }]",
  'then: [{ op: "preventAttack"',
  "coinFlipGate\",",
];
for (const n of needles) {
  const hits = rows.filter((r) =>
    [r.id, r.decision, r.what, r.find, r.replace, r.survives?.reason ?? ""].some((s) => s.includes(n)),
  );
  console.log(`\n### ${JSON.stringify(n)}: ${hits.length}`);
  for (const h of hits) console.log(`   ${h.id} [${h.file}]${h.survives ? " SURVIVOR" : ""}`);
}
// D493's needle: is there a row whose REPLACE is a coin-gate composition seam?
console.log("\n### rows whose replace mentions a coin-gate prefix strip / composition");
for (const r of rows) {
  if (/If heads/.test(r.replace) || /gateClause/.test(r.replace) || /gateClause/.test(r.find)) {
    console.log(`   ${r.id} [${r.file}]`);
  }
}
// full text of the two D408 rows most relevant
for (const id of ["D408-defender-verb-bare-only", "D408-the-defect-restored", "D408-defender-lock-loses-its-seat", "D410-pronoun-lock-installs-the-attack-lock"]) {
  const r = rows.find((x) => x.id === id);
  if (!r) continue;
  console.log(`\n===== ${id}\n file: ${r.file}\n what: ${r.what}\n find: ${JSON.stringify(r.find)}\n repl: ${JSON.stringify(r.replace)}\n kill: ${JSON.stringify(r.expectKilledBy)}`);
}
