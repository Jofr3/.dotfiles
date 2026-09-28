import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const mine = MUTANTS.filter((m) => m.decision.includes("D477"));
console.log(`rows with decision.includes("D477"): ${mine.length}`);
console.log(`rows with decision === "D477": ${MUTANTS.filter((m) => m.decision === "D477").length}`);
let inert = 0;
for (const m of mine) {
  const same = m.find === m.replace;
  if (same) inert++;
  // crude semantic-token diff: strip whitespace and compare
  const f = m.find.replace(/\s+/g, " ").trim();
  const r = m.replace.replace(/\s+/g, " ").trim();
  const onlyComment = f.replace(/\/\/.*$/gm, "") === r.replace(/\/\/.*$/gm, "");
  console.log(`\n### ${m.id}${m.survives ? "  [DECLARED SURVIVOR]" : ""}`);
  console.log(`  find    : ${JSON.stringify(m.find).slice(0, 220)}`);
  console.log(`  replace : ${JSON.stringify(m.replace).slice(0, 220)}`);
  console.log(`  identical=${same}  differs-only-in-comments=${onlyComment}  killers=${m.expectKilledBy.length}`);
}
console.log(`\nINERT rows: ${inert}`);
