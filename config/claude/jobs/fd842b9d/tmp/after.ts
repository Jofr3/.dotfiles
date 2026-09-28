import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const rows = legalAttackCorpus();
// 1. What does the new anchor claim over the WHOLE column?
const RE = /^Each player draws (\d+) cards\.$/;
const claimed = rows.filter(([, t]) => RE.test(t));
console.log("new anchor claims:", claimed.length, "sentence(s) /", claimed.reduce((a,[n])=>a+n,0), "printing(s)", JSON.stringify(claimed));
// 2. Compound hazard: any corpus row whose HEAD is our sentence?
const compounds = rows.filter(([, t]) => t.startsWith("Each player draws 3 cards. "));
console.log("corpus rows opening with the sentence + a tail:", compounds.length);
// 3. Any row the trailing splitter now composes that it did not before?
let composed = 0;
for (const [, t] of rows) {
  const sp = (effects as any).splitAttackTrailingClause(t);
  if (sp && sp.head === "Each player draws 3 cards.") { composed++; console.log("  COMPOSES:", JSON.stringify(t)); }
}
console.log("newly composable:", composed);
// 4. Census totals
const resolved = rows.filter(([, t]) => resolvedByAnyReader(t));
console.log("resolved sentences:", resolved.length, "printings:", resolved.reduce((a,[n])=>a+n,0));
console.log("residue(raw) sentences:", rows.length - resolved.length, "printings:", rows.reduce((a,[n])=>a+n,0) - resolved.reduce((a,[n])=>a+n,0));
// 5. near-miss probes for the anchor
for (const t of ["Each player draws 3 cards", "each player draws 3 cards.", "Each player draws a card.", "Each player draws 0 cards.", "Each player may draw 3 cards.", "Each player draws 3 cards. Draw a card.", "Both players draw 3 cards."]) {
  console.log(JSON.stringify(t), "->", JSON.stringify((effects as any).deriveAttackEffect(t)));
}
