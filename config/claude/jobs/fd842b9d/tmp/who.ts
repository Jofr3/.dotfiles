import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const surface = attackReaderSurface();
function claim(t: string) {
  const out: string[] = [];
  for (const n of surface) { const v = (effects as any)[n](t); if (v !== null && v !== undefined) out.push(`${n}=${JSON.stringify(v)}`); }
  return out;
}
for (const t of ["Draw 3 cards.", "Draw 2 cards.", "You may draw 5 cards.", "Your opponent draws 3 cards.", "Each player draws 3 cards.", "Each player draws a card."]) {
  console.log(JSON.stringify(t), "->", claim(t).join(" | ") || "NULL");
}
console.log("\n=== third-person inflected verb sentences (subject + -s verb at head) ===");
for (const [n, t] of legalAttackCorpus()) {
  if (/^(Each player|Your opponent|Both players|Each of you)\b/.test(t)) console.log(resolvedByAnyReader(t) ? "BUILT " : "UNBUILT", n, JSON.stringify(t));
}
