import {
  legalAttackCorpus,
  resolvedByAnyReader,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import {
  splitAttackGateClause,
  splitAttackTrailingClause,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import reg from "/home/jofre/.claude/jobs/fd842b9d/tmp/d495-regsent.json" with { type: "json" };

const REGISTRY_ATTACK_SENTENCES: string[] = (reg as { sentences: string[] }).sentences;

// ===== CANONICAL RESIDUE PREDICATE, copied verbatim from censusAtHead.test.ts =====
const rawUnbuiltSentences = legalAttackCorpus().filter(
  ([, text]) => !resolvedByAnyReader(text),
);
const residueSentences = rawUnbuiltSentences.filter(([, text]) => {
  if (REGISTRY_ATTACK_SENTENCES.includes(text)) return false;
  const gate = splitAttackGateClause(text);
  if (gate !== null && gate.body !== "" && resolvedByAnyReader(gate.body)) return false;
  return splitAttackTrailingClause(text) === null;
});
// =================================================================================
const units = (rows: readonly (readonly [number, string])[]) =>
  rows.reduce((a, r) => a + r[0], 0);

console.log(`registry distinct sentences used: ${REGISTRY_ATTACK_SENTENCES.length}`);
console.log(`corpus: ${legalAttackCorpus().length} sentences / ${units(legalAttackCorpus())} printings`);
console.log(`rawUnbuilt: ${rawUnbuiltSentences.length} sentences / ${units(rawUnbuiltSentences)} printings`);
console.log(`RESIDUE:    ${residueSentences.length} sentences / ${units(residueSentences)} printings`);

// ---- how many residue rows are "Flip a coin. If heads, <X>" ? ----
console.log("\n###### RESIDUE rows opening with a COIN GATE");
const COIN = /^Flip a coin\. If (heads|tails), /;
const coinRows = residueSentences.filter(([, t]) => COIN.test(t));
console.log(`coin-opening residue rows: ${coinRows.length} sentences / ${units(coinRows)} printings`);
for (const [u, t] of coinRows) {
  const m = COIN.exec(t) as RegExpExecArray;
  const bodyRaw = t.slice(m[0].length);
  const body = bodyRaw.charAt(0).toUpperCase() + bodyRaw.slice(1);
  console.log(`  [${u}p] face=${m[1]} ${JSON.stringify(t)}`);
  console.log(`        body(as-is)     claimed=${resolvedByAnyReader(bodyRaw)}  ${JSON.stringify(bodyRaw)}`);
  console.log(`        body(recapped)  claimed=${resolvedByAnyReader(body)}  ${JSON.stringify(body)}`);
}

// ---- BRANCH B payoff ALONE: a general coin-gate composition seam ----
// "the gate prefix is stripped and the body is claimed by any reader" over the WHOLE residue
console.log("\n###### BRANCH B (general coin-gate composition) SOLO PAYOFF over the whole residue");
let freedB: [number, string][] = [];
for (const [u, t] of residueSentences) {
  const m = COIN.exec(t);
  if (m === null) continue;
  const raw = t.slice(m[0].length);
  const cap = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (resolvedByAnyReader(raw) || resolvedByAnyReader(cap)) freedB.push([u, t]);
}
console.log(`  freed: ${freedB.length} sentences / ${units(freedB)} printings`);
for (const [u, t] of freedB) console.log(`   [${u}p] ${JSON.stringify(t)}`);

// ---- BRANCH A payoff ALONE: the whole-sentence anchor for the target ----
const TARGET = "Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't attack.";
const tRow = residueSentences.find(([, t]) => t === TARGET);
console.log(`\n###### BRANCH A (whole-sentence anchor) SOLO PAYOFF: ${tRow ? `1 sentence / ${tRow[0]} printing(s)` : "TARGET NOT IN RESIDUE"}`);

// ---- what would a WIDER anchor claim? D472's discipline, over all 640 rows ----
console.log("\n###### D472 WIDENING MEASUREMENT over all 640 corpus rows");
const TIGHT = /^Flip a coin\. If heads, during your opponent['’]s next turn, the Defending Pokémon can't attack\.$/;
const WIDE_VERB = /^Flip a coin\. If heads, during your opponent['’]s next turn, the Defending Pokémon can't (?:attack|use attacks)\.$/;
const WIDE_ANY = /^Flip a coin\. If heads, (.+)$/;
const pats: [string, RegExp][] = [["TIGHT", TIGHT], ["WIDE (attack|use attacks)", WIDE_VERB], ["WIDE ^Flip a coin. If heads, (.+)$", WIDE_ANY]];
for (const [n, p] of pats) {
  const hit = legalAttackCorpus().filter(([, t]) => p.test(t));
  console.log(`  ${n}: ${hit.length} sentences / ${units(hit)} printings`);
  if (hit.length <= 30) for (const [u, t] of hit) console.log(`      [${u}p] ${JSON.stringify(t)}`);
}
