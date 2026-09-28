const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const surv = (MUTANTS as any[]).filter(
  (m) => m.survives !== undefined &&
    (m.file === "packages/engine/src/effects.ts" || m.file === "packages/engine/src/interpreter.ts"),
);
// ⚠️ STRUCTURAL spellings only (D430): "who" and "from" as bare words are English and
// matched 17 of 25 survivors' PROSE, which is a hazard list rather than a census.
const NEEDLES = ['"drawCards"', "drawToHand", "op.from", "op.recordAs", "op.who", "opponentMayDraw", "CARDS_DRAWN", "drawSeat", "eachPlayer"];
let flagged = 0;
for (const m of surv) {
  const blob = JSON.stringify([m.find, m.replace, m.survives]);
  const hits = NEEDLES.filter((n) => blob.includes(n));
  if (hits.length > 0) { flagged++; console.log(`FLAG ${m.id}  needles: ${hits.join(",")}\n     reason: ${JSON.stringify(m.survives).slice(0, 260)}`); }
}
console.log(`\n${surv.length} survivor(s) in the two files with deletions; ${flagged} flagged, ${surv.length - flagged} cleared by structural needle.`);
