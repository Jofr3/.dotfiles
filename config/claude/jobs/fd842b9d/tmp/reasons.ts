const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
type Row = { id: string; file: string; find: string; survives?: { kind: string; reason: string } };
const rows = (MUTANTS as unknown as Row[]).filter(
  (r) => r.survives !== undefined && r.file === "packages/engine/src/interpreter.ts" && !r.id.startsWith("D502"),
);
const src = await Bun.file("/home/jofre/projects/luminous_ui/packages/engine/src/interpreter.ts").text();
// the four EDITED regions, by line span (from git diff -U0 on the NEW file)
const REGIONS: [string, number, number][] = [
  ["recordSlotOf", 1138, 1170],
  ["describeCondition (new arm)", 1270, 1290],
  ["describeBranch (new arm)", 1441, 1465],
  ["searchDeck stepOp whiff", 2151, 2165],
  ["moveEnergy narrowing", 2774, 2802],
  ["applyChoice searchDeck", 5828, 5845],
  ["searchMove", 9653, 9725],
  ["moveNote override", 14102, 14120],
];
for (const r of rows) {
  const at = src.indexOf(r.find);
  const line = src.slice(0, at).split("\n").length;
  const near = REGIONS.filter(([, a, b]) => line >= a - 40 && line <= b + 40).map(([n]) => n);
  const mentions = ["searchDeck", "searchMove", "recordSlotOf", "describeBranch", "describeCondition", "moveNote", "moveEnergy", "destinations", "recordAs", "record"].filter(
    (k) => (r.survives?.reason ?? "").includes(k),
  );
  console.log(`\n${r.id}  L${line}  [${r.survives?.kind}]`);
  console.log(`  near edited regions: ${near.length ? near.join(", ") : "NONE"}`);
  console.log(`  reason mentions: ${mentions.length ? mentions.join(", ") : "nothing this slice touched"}`);
  if (near.length || mentions.length) console.log(`  REASON: ${r.survives?.reason}`);
}
