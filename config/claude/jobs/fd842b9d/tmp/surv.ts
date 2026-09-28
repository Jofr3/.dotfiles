const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const surv = (MUTANTS as any[]).filter(
  (m) => m.survives !== undefined &&
    (m.file === "packages/engine/src/effects.ts" || m.file === "packages/engine/src/interpreter.ts"),
);
const NEEDLES = ["drawCards", "drawToHand", "recordAs", "opponentMayDraw", "eachPlayer", "who", "from", "CARDS_DRAWN", "drawSeat"];
let flagged = 0;
for (const m of surv) {
  const blob = JSON.stringify([m.find, m.replace, m.survives]);
  const hits = NEEDLES.filter((n) => blob.includes(n));
  if (hits.length > 0) { flagged++; console.log(`FLAG ${m.id}  [${m.file.split("/").pop()}]  needles: ${hits.join(",")}`); }
}
console.log(`\n${surv.length} survivor(s) in the two files with deletions; ${flagged} flagged by needle, ${surv.length - flagged} cleared.`);
