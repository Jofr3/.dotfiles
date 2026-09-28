const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const needles = [
  "activeTop(state, otherSeat(seat))",
  "spot.card.types",
  'case "opponentActiveHasType"',
  "opponentActiveHasResistance",
];
for (const n of needles) {
  const hits = MUTANTS.filter((m: any) => `${m.find}\n${m.replace}`.includes(n));
  console.log(`## ${n}: ${hits.length}`);
  for (const h of hits) console.log("   ", h.id, "|", h.file);
}
// also: how many rows target interpreter.ts within +-40 lines of 3860?
const src = await Bun.file("/home/jofre/projects/luminous_ui/packages/engine/src/interpreter.ts").text();
const lines = src.split("\n");
const start = lines.slice(0, 3853).join("\n").length;
const end = lines.slice(0, 3862).join("\n").length;
let inRegion = 0;
for (const m of MUTANTS as any[]) {
  if (m.file !== "packages/engine/src/interpreter.ts") continue;
  const at = src.indexOf(m.find);
  if (at < 0) continue;
  if (at + m.find.length >= start && at <= end) {
    inRegion++;
    console.log("IN-REGION:", m.id);
  }
}
console.log("rows intersecting the opponentActiveHasType arm:", inRegion);
