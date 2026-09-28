import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import {
  deriveAttackEffect,
  deriveAttackCancelRequirement,
  splitAttackTrailingClause,
  splitAttackGateClause,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const rows = legalAttackCorpus().map(([printings, text]: [number, string]) => ({ printings, text }));
console.log("corpus rows:", rows.length);
const A = "Discard a card from your hand. If you do, draw 2 cards.";
const B = "Discard a card from your hand. If you do, draw 3 cards.";
for (const s of [A, B]) {
  console.log("---", JSON.stringify(s));
  console.log("  effect  :", JSON.stringify(deriveAttackEffect(s)));
  console.log("  cancel  :", JSON.stringify(deriveAttackCancelRequirement(s)));
  console.log("  trailing:", JSON.stringify(splitAttackTrailingClause(s)));
  console.log("  gate    :", JSON.stringify(splitAttackGateClause(s)));
  console.log("  anyRead :", resolvedByAnyReader(s));
}
console.log("HEAD alone:", JSON.stringify(deriveAttackEffect("Discard a card from your hand.")), resolvedByAnyReader("Discard a card from your hand."));
console.log("TAIL alone:", JSON.stringify(deriveAttackEffect("If you do, draw 2 cards.")), resolvedByAnyReader("If you do, draw 2 cards."));

const pats: [string, RegExp][] = [
  ["strict", /^Discard a card from your hand\. If you do, draw (\d+) cards\.$/],
  ["wide-consequent", /^Discard a card from your hand\. If you do, (.+)\.$/],
  ["wide-head", /^Discard (.+) from your hand\. If you do, draw (\d+) cards\.$/],
  ["wide-both", /^Discard (.+)\. If you do, (.+)\.$/],
];
for (const [name, re] of pats) {
  const hit = rows.filter((r) => re.test(r.text));
  console.log(`\n${name}: ${hit.length} sentences / ${hit.reduce((n, r) => n + r.printings, 0)} printings`);
  for (const r of hit) console.log(`   ${r.printings}p  ${r.text}`);
}
