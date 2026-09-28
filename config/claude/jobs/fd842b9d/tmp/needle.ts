const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
type Row = { id: string; decision: string; file: string; find: string; replace: string; what: string; expectKilledBy?: string[]; killedByCommand?: string[]; survives?: { kind: string; reason: string } };
const rows = MUTANTS as unknown as Row[];
const NEEDLES = [
  "recordSlotOf", "withConsequence", "describeBranch", "describeCondition",
  "recordGate", "recordMoved", "recordAs",
  "searchDeck", "searchMove", "BENCH_SEARCH", "ATTACK_BENCH_SEARCH", "onto your Bench",
  "moveEnergy", "moveEndpoints", "moveCap", "moveFloor", "moveNote",
  "destinations.length", "floor > 0", "toRecorded", "new Benched",
  "selfToBench", "exclude", "EffectSlot", "claimedByAnyReader",
];
for (const n of NEEDLES) {
  const hits = rows.filter(
    (r) => r.id.includes(n) || r.what.includes(n) || r.find.includes(n) || r.replace.includes(n) || (r.survives?.reason ?? "").includes(n),
  );
  console.log(`\n### ${JSON.stringify(n)} → ${hits.length} row(s)`);
  for (const h of hits.slice(0, 40)) {
    const where = [
      r_in(h.id, n) && "id", r_in(h.what, n) && "what", r_in(h.find, n) && "find",
      r_in(h.replace, n) && "replace", r_in(h.survives?.reason ?? "", n) && "reason",
    ].filter(Boolean).join(",");
    console.log(`   ${h.id}  [${where}]  ${h.file.replace("packages/engine/src/", "")}${h.survives ? "  SURVIVOR:" + h.survives.kind : ""}`);
  }
  if (hits.length > 40) console.log(`   … ${hits.length - 40} more`);
}
function r_in(s: string, n: string) { return s.includes(n); }
